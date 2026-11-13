"""A10 multilingual CAP text from approved fixed templates only (app/fixtures/cap_templates.v3.json).

No model and no free text: every rendered string is a fixed template whose placeholders accept only integers,
bounded numbers, closed-list codes (hazard, state, exposure basis) and validated area codes, each looked up in
the fixture's per-language closed lists. Anything else raises CapRefused, so injection strings never reach the
XML. Each language block carries a review status from docs/NATIVE_LANGUAGE_REVIEW.csv: a block is 'approved'
only when every string it uses has a row whose translation matches the template exactly, is marked ok and names
a reviewer. Otherwise (or when the CSV is not reachable, as inside the API container) it is 'pending'.
"""
import csv
import json
import math
import re
import string
from functools import lru_cache
from pathlib import Path

# New drafts use the current version. Earlier versions stay on disk, unchanged, so a draft made before can be
# matched to the exact template text it was built from (stored drafts keep their rendered XML as it was).
# v1: AEGIS sender text; v2: IndTrana sender text, aegis.* parameter keys; v3: indtrana.* keys and version id.
TEMPLATE_FILES = {"aegis.cap-templates.v1": Path(__file__).parent / "fixtures" / "cap_templates.v1.json",
                  "aegis.cap-templates.v2": Path(__file__).parent / "fixtures" / "cap_templates.v2.json",
                  "indtrana.cap-templates.v3": Path(__file__).parent / "fixtures" / "cap_templates.v3.json"}
CURRENT_VERSION = "indtrana.cap-templates.v3"
TEMPLATES_PATH = TEMPLATE_FILES[CURRENT_VERSION]
REVIEW_CSV = ("docs", "NATIVE_LANGUAGE_REVIEW.csv")
TRANSLATED = ("te", "hi")
_REVIEW_COLUMNS = {"te": ("telugu", "telugu_ok(y/n)"), "hi": ("hindi", "hindi_ok(y/n)")}
_PILOT_POINT = re.compile(r"^hyd_\d{1,2}\.\d{2}_\d{1,3}\.\d{2}$")


class TemplateError(ValueError):
    """A template value was not an allowed integer, number or closed-list code."""


@lru_cache(maxsize=1)
def load_templates() -> dict:
    return _checked(json.loads(TEMPLATES_PATH.read_text(encoding="utf-8")))


def _checked(data: dict) -> dict:
    """The same placeholder, language and markup checks for every template version."""
    allowed = {name for names in data["placeholders"].values() for name in names}
    for key, variants in data["templates"].items():
        if set(variants) != set(data["languages"]):
            raise TemplateError(f"template {key} lacks a language")
        fields = None
        for text in variants.values():
            if any(c in text for c in "<>&") or any(ord(c) < 32 for c in text):
                raise TemplateError(f"template {key} contains markup or control characters")
            parsed = list(string.Formatter().parse(text))
            names = {name for _, name, spec, conv in parsed if name is not None}
            if any(spec or conv for _, name, spec, conv in parsed if name is not None) or not names <= allowed:
                raise TemplateError(f"template {key} uses a disallowed placeholder")
            if fields is not None and names != fields:
                raise TemplateError(f"template {key} variants use different placeholders")
            fields = names
    return data


def load_template_version(version: str) -> dict:
    """The fixed templates of an earlier or current version, by the id a draft records in its parameters."""
    path = TEMPLATE_FILES.get(version)
    if path is None:
        raise TemplateError("unknown template version")
    data = _checked(json.loads(path.read_text(encoding="utf-8")))
    if data.get("version") != version:
        raise TemplateError("template version mismatch")
    return data


def area_code(trigger: dict) -> str:
    """Validated area code from the trigger point id; never free text."""
    point = str(trigger.get("trigger_id") or "").split(":", 1)[-1]
    return "hyderabad_pilot_grid" if _PILOT_POINT.match(point) else "exercise_grid_point"


def _value(name: str, value, lang: str, data: dict) -> str:
    kinds = data["placeholders"]
    if name in kinds["integer"]:
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value < 10**12:
            raise TemplateError("integer placeholder")
        return str(value)
    if name in kinds["number"]:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value <= 100:
            raise TemplateError("number placeholder")
        return f"{value:g}"
    if name in kinds["closed"]:
        entry = data["closed_lists"][name].get(value) if isinstance(value, str) else None
        if entry is None:
            raise TemplateError("closed-list placeholder")
        return entry[lang]
    raise TemplateError("unknown placeholder")


def render(key: str, lang: str, values: dict | None = None) -> str:
    data = load_templates()
    if lang not in data["languages"] or key not in data["templates"]:
        raise TemplateError("unknown template")
    text = data["templates"][key][lang]
    names = {name for _, name, _, _ in string.Formatter().parse(text) if name is not None}
    values = values or {}
    if set(values) - names:
        raise TemplateError("unexpected placeholder value")
    return text.format_map({name: _value(name, values.get(name), lang, data) for name in names})


def _review_path() -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent.joinpath(*REVIEW_CSV)
        if candidate.is_file():
            return candidate
    return None


@lru_cache(maxsize=4)
def _review_rows(path: str | None) -> dict:
    if path is None:
        return {}
    with open(path, encoding="utf-8-sig", newline="") as handle:
        return {row.get("english", ""): row for row in csv.DictReader(handle)}


def _strings(lang: str, data: dict) -> list[tuple[str, str]]:
    pairs = [(variants["en"], variants[lang]) for variants in data["templates"].values()]
    for entries in data["closed_lists"].values():
        pairs.extend((entry["en"], entry[lang]) for entry in entries.values())
    return pairs


def review_status(lang: str, review_csv: Path | None = None) -> str:
    """'approved' only if every template and closed-list string for this language is signed off."""
    data = load_templates()
    if lang not in TRANSLATED:
        return "source"
    path = review_csv if review_csv is not None else _review_path()
    rows = _review_rows(str(path) if path else None)
    column, ok_column = _REVIEW_COLUMNS[lang]
    for english, translated in _strings(lang, data):
        row = rows.get(english)
        if (row is None or (row.get(column) or "").strip() != translated
                or (row.get(ok_column) or "").strip().lower() not in {"y", "yes"} or not (row.get("reviewer") or "").strip()):
            return "pending"
    return "approved"


def review_statuses(review_csv: Path | None = None) -> list[dict]:
    data = load_templates()
    return [{"language": data["languages"][lang], "review_status": review_status(lang, review_csv)}
            for lang in ("en", *TRANSLATED)]
