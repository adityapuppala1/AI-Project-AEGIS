"""Brand settings: the product name and logo shown in the browser (docs/BRANDING.md).

The public read (name, logo version) and the logo image are deliberately open: the signed-out sign-in and welcome
pages need them. They return nothing else. Changing the name or logo, restoring the defaults and reading the audit
are platform_admin only, with an optimistic version check and one append-only audit row per change.

The configured name is browser display text only. Staff email templates, CAP blocks, exports and fixed audit text
keep the code constant DEFAULT_NAME and never read this module.

Logo checks are decided by the file's own bytes, never its name or declared type: PNG, JPEG or WebP only, a basic
structural check for each, at most 256 KB and at most 4096 x 4096 pixels. SVG, GIF, ICO, HTML and everything else
is refused. The image is served with its stored media type from a fixed allowlist, nosniff and a deny-all CSP.
"""
import re
import struct
import threading
import time
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, StrictInt, StrictStr

from app import brand_store
from app.security import Operator, scoped_operator

DEFAULT_NAME = "IndTrana"
NAME_MIN, NAME_MAX = 2, 40
_NAME = re.compile(r"[A-Za-z0-9 .&'\-]+")
MAX_LOGO_BYTES = 256 * 1024
MAX_DIMENSION = 4096
MEDIA_TYPES = frozenset({"image/png", "image/jpeg", "image/webp"})
LOGO_FILENAMES = {"image/png": "brand-logo.png", "image/jpeg": "brand-logo.jpg", "image/webp": "brand-logo.webp"}
LOGO_MAX_AGE = 300


class BrandError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def validate_name(raw: object) -> str:
    """2-40 characters after trimming; letters, digits, spaces and . - & ' only; no control characters."""
    if not isinstance(raw, str):
        raise BrandError("brand_name_invalid")
    if any(unicodedata.category(ch) in ("Cc", "Cf", "Cs", "Co", "Zl", "Zp") for ch in raw):
        raise BrandError("brand_name_control_character")
    name = raw.strip()
    if not NAME_MIN <= len(name) <= NAME_MAX:
        raise BrandError("brand_name_length")
    if not _NAME.fullmatch(name) or "  " in name or not any(ch.isalnum() for ch in name):
        raise BrandError("brand_name_characters")
    return name


def _png(data: bytes) -> tuple[int, int]:
    if len(data) < 8 + 25 + 12 or data[12:16] != b"IHDR" or struct.unpack(">I", data[8:12])[0] != 13:
        raise BrandError("brand_logo_malformed")
    if data[-12:] != b"\x00\x00\x00\x00IEND\xaeB`\x82":
        raise BrandError("brand_logo_malformed")
    return struct.unpack(">II", data[16:24])


_SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def _jpeg(data: bytes) -> tuple[int, int]:
    if len(data) < 64 or data[-2:] != b"\xff\xd9":
        raise BrandError("brand_logo_malformed")
    i = 2
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            raise BrandError("brand_logo_malformed")
        marker = data[i + 1]
        if marker == 0xFF:  # fill byte
            i += 1
            continue
        if marker in (0xD8, 0xD9, 0xDA) or 0xD0 <= marker <= 0xD7 or marker == 0x01:
            raise BrandError("brand_logo_malformed")  # start of scan (or end) before any frame header
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        if length < 2 or i + 2 + length > len(data):
            raise BrandError("brand_logo_malformed")
        if marker in _SOF:
            if length < 7:
                raise BrandError("brand_logo_malformed")
            height, width = struct.unpack(">HH", data[i + 5:i + 9])
            return width, height
        i += 2 + length
    raise BrandError("brand_logo_malformed")


def _webp(data: bytes) -> tuple[int, int]:
    if len(data) < 30 or struct.unpack("<I", data[4:8])[0] != len(data) - 8:
        raise BrandError("brand_logo_malformed")
    chunk = data[12:16]
    if chunk == b"VP8X":
        return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
    if chunk == b"VP8L":
        if data[20] != 0x2F:
            raise BrandError("brand_logo_malformed")
        bits = int.from_bytes(data[21:25], "little")
        return 1 + (bits & 0x3FFF), 1 + ((bits >> 14) & 0x3FFF)
    if chunk == b"VP8 ":
        if data[23:26] != b"\x9d\x01\x2a":
            raise BrandError("brand_logo_malformed")
        return struct.unpack("<H", data[26:28])[0] & 0x3FFF, struct.unpack("<H", data[28:30])[0] & 0x3FFF
    raise BrandError("brand_logo_malformed")


def sniff_logo(data: bytes) -> str:
    """Return the media type decided by magic bytes, or raise BrandError with a fixed code."""
    if not data:
        raise BrandError("brand_logo_empty")
    if len(data) > MAX_LOGO_BYTES:
        raise BrandError("brand_logo_too_large")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        media, parse = "image/png", _png
    elif data.startswith(b"\xff\xd8\xff"):
        media, parse = "image/jpeg", _jpeg
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        media, parse = "image/webp", _webp
    else:
        raise BrandError("brand_logo_unsupported_type")
    width, height = parse(data)
    if not (1 <= width <= MAX_DIMENSION and 1 <= height <= MAX_DIMENSION):
        raise BrandError("brand_logo_dimensions")
    return media


def public_view(row: dict) -> dict:
    """The whole public read: the name and, when a logo is set, the version that keys its URL. Nothing else."""
    return {"name": row.get("name") or DEFAULT_NAME,
            "logo_version": row["version"] if row.get("has_logo") else None,
            "version": row["version"]}


def admin_view(row: dict) -> dict:
    return {**public_view(row), "custom_name": row.get("name"), "default_name": DEFAULT_NAME,
            "logo_media_type": row.get("logo_media_type"),
            "updated_at": row["updated_at"].isoformat() if hasattr(row.get("updated_at"), "isoformat") else None,
            "updated_by": row.get("updated_by"), "max_logo_bytes": MAX_LOGO_BYTES, "max_dimension": MAX_DIMENSION,
            "media_types": sorted(MEDIA_TYPES)}


router = APIRouter(prefix="/v1/brand", tags=["brand settings"])
_admin = scoped_operator(frozenset({"platform_admin"}))


def _unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="brand_unavailable")


def _bad(error: BrandError) -> HTTPException:
    status = 413 if error.code == "brand_logo_too_large" else 415 if error.code == "brand_logo_unsupported_type" else 422
    return HTTPException(status_code=status, detail=error.code)


# Small in-process cache for the two open reads (each page view asks for the brand). Cleared on every write in this
# process; another API process sees a change within CACHE_SECONDS.
CACHE_SECONDS = 5.0
_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


def _cached(key: str, load):
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_SECONDS:
            return hit[1]
    value = load()
    with _cache_lock:
        _cache[key] = (now, value)
    return value


def logo_etag(version: int) -> str:
    return f'"brand-logo-{int(version)}"'


@router.get("")
def read_brand():
    """Open: signed-out pages need the name. A failed read falls back to the defaults so sign-in never breaks."""
    try:
        row = _cached("row", lambda: brand_store.get_store().get())
    except Exception:
        return {"name": DEFAULT_NAME, "logo_version": None, "version": 0}
    return public_view(row)


@router.get("/logo")
def read_logo(request: Request):
    try:
        found = _cached("logo", lambda: brand_store.get_store().get_logo())
    except Exception:
        raise _unavailable() from None
    if not found:
        raise HTTPException(status_code=404, detail="brand_logo_not_set")
    data, media_type, version = found
    if media_type not in MEDIA_TYPES:
        raise HTTPException(status_code=404, detail="brand_logo_not_set")
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": f'inline; filename="{LOGO_FILENAMES[media_type]}"',
        "Cache-Control": f"public, max-age={LOGO_MAX_AGE}",
        "ETag": logo_etag(version),
    }
    if logo_etag(version) in [tag.strip() for tag in request.headers.get("if-none-match", "").split(",")]:
        return Response(status_code=304, headers=headers)
    return Response(content=data, media_type=media_type, headers=headers)


class NameUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: StrictStr
    expected_version: StrictInt


class ResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: StrictInt


def _write(fn, *args):
    try:
        return admin_view(fn(*args))
    except brand_store.VersionConflict:
        raise HTTPException(status_code=409, detail="brand_version_conflict") from None
    except Exception:
        raise _unavailable() from None
    finally:
        clear_cache()


@router.get("/settings")
def read_settings(_operator: Operator = Depends(_admin)):
    try:
        return admin_view(brand_store.get_store().get())
    except Exception:
        raise _unavailable() from None


@router.put("/name")
def update_name(body: NameUpdate, operator: Operator = Depends(_admin)):
    try:
        name = validate_name(body.name)
    except BrandError as error:
        raise _bad(error) from None
    return _write(brand_store.get_store().set_name, name, body.expected_version, operator.subject)


@router.put("/logo")
async def upload_logo(request: Request, expected_version: int = Query(..., ge=0),
                      operator: Operator = Depends(_admin)):
    """Raw image bytes in the body. The size cap is enforced while reading, before any parsing."""
    declared = request.headers.get("content-length")
    if declared is not None and (not declared.isdigit() or int(declared) > MAX_LOGO_BYTES):
        raise _bad(BrandError("brand_logo_too_large"))
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_LOGO_BYTES:
            raise _bad(BrandError("brand_logo_too_large"))
        chunks.append(chunk)
    data = b"".join(chunks)
    try:
        media_type = sniff_logo(data)
    except BrandError as error:
        raise _bad(error) from None
    return await run_in_threadpool(_write, brand_store.get_store().set_logo, data, media_type, expected_version,
                                   operator.subject)


@router.post("/reset")
def reset_brand(body: ResetRequest, operator: Operator = Depends(_admin)):
    return _write(brand_store.get_store().reset, body.expected_version, operator.subject)


@router.get("/audit")
def read_audit(_operator: Operator = Depends(_admin)):
    try:
        rows = brand_store.get_store().list_audit(100)
    except Exception:
        raise _unavailable() from None
    return {"rows": [{"id": str(r["id"]), "action": r["action"], "from_version": r["from_version"],
                      "to_version": r["to_version"], "name_after": r.get("name_after"),
                      "logo_media_type": r.get("logo_media_type"), "logo_size": r.get("logo_size"),
                      "logo_sha256": r.get("logo_sha256"), "actor": r["actor"],
                      "at": r["at"].isoformat() if hasattr(r.get("at"), "isoformat") else r.get("at")}
                     for r in rows]}
