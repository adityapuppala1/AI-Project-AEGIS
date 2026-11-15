"""Network Identifier Master API (docs/NETWORK_IDENTIFIER_MASTER.md).

A platform_admin registry of satellite, mobile, fixed-line and tower providers and synthetic assets: add, edit,
enable, disable, delete (soft) and restore, each with an optimistic version check and one append-only audit row.
Documentation links come only from app/network_catalogue.py. Nothing in this module calls a provider, sends a
message or creates or enriches a case. Credentials are encrypted with app/connector_secrets and only a fingerprint is
ever returned. `/v1/network-lanes` gives every signed-in exercise role the names and rehearsal link states only, for
the Resilient Sensor Link rehearsal.
"""
import re
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, field_validator

from app import connector_secrets, network_catalogue as cat, network_registry_store as store_module
from app.security import EXERCISE_RECORD_ROLES, Operator, scoped_operator
from app.text_checks import NoNul

router = APIRouter(prefix="/v1/admin/networks", tags=["network identifier master"])
lanes_router = APIRouter(prefix="/v1/network-lanes", tags=["network identifier master"])
_admin = scoped_operator(frozenset({"platform_admin"}))
_reader = scoped_operator(EXERCISE_RECORD_ROLES)

_CONTROL = re.compile(r"[\x00-\x1f\x7f​-‏‪-‮⁦-⁩]")
_MCC_MNC = re.compile(r"^[0-9]{3}-[0-9]{2,3}$")
_UUID = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"

Kind = Literal[cat.KINDS]
Orbit = Optional[Literal[cat.ORBIT_CLASSES]]
Group = Optional[Literal[cat.GROUPS]]
Band = Literal[cat.BANDS]
Colour = Literal[cat.COLOURS]
State = Literal[cat.STATES]
AssetType = Literal[cat.ASSET_TYPES]


def _plain(value: Optional[str]) -> Optional[str]:
    if value is not None:
        if _CONTROL.search(value):
            raise ValueError("network_control_character")
        value = value.strip()
    return value


class ProviderFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: Annotated[StrictStr, Field(pattern=r"^[a-z0-9_]{2,40}$")]
    display_name: Annotated[StrictStr, Field(min_length=2, max_length=80), NoNul]
    kind: Kind
    orbit_class: Orbit = None
    constellation_group: Group = None
    mcc_mnc: Annotated[list[StrictStr], Field(max_length=40)] = []
    asn: Annotated[list[Annotated[StrictInt, Field(ge=1, le=4294967295)]], Field(max_length=40)] = []
    bands: Annotated[list[Band], Field(max_length=16)] = []
    monogram: Annotated[StrictStr, Field(pattern=r"^[A-Z0-9]{1,3}$")]
    colour_token: Colour
    logo_key: Optional[Literal[tuple(sorted(cat.LOGO_KEYS))]] = None
    notes: Annotated[Optional[StrictStr], Field(max_length=500), NoNul] = None
    doc_link_id: Optional[StrictStr] = None
    rehearsal_capacity_kbps: Annotated[StrictInt, Field(ge=0, le=100000)] = 400

    @field_validator("display_name", "notes")
    @classmethod
    def _clean(cls, value):
        return _plain(value)

    @field_validator("mcc_mnc")
    @classmethod
    def _mcc(cls, value):
        if any(not _MCC_MNC.match(v) for v in value):
            raise ValueError("network_mcc_mnc_format")
        return sorted(set(value))

    @field_validator("doc_link_id")
    @classmethod
    def _link(cls, value):
        if value is not None and value not in cat.DOC_LINKS:
            raise ValueError("network_doc_link_unknown")
        return value

    def clean(self) -> dict:
        data = self.model_dump()
        if data["kind"] != "satellite":
            data["orbit_class"] = None
            data["constellation_group"] = None
        data["bands"] = sorted(set(data["bands"]), key=cat.BANDS.index)
        data["asn"] = sorted(set(data["asn"]))
        return data


class ProviderUpdate(ProviderFields):
    expected_version: StrictInt


class Versioned(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: StrictInt


class Rehearsal(Versioned):
    state: State
    capacity_kbps: Annotated[StrictInt, Field(ge=0, le=100000)]


class Credential(Versioned):
    value: Annotated[StrictStr, Field(min_length=1, max_length=4096), NoNul]


class AssetFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider_id: Annotated[StrictStr, Field(pattern=_UUID)]
    asset_type: AssetType
    label: Annotated[StrictStr, Field(min_length=2, max_length=80), NoNul]
    norad_id: Annotated[Optional[StrictInt], Field(ge=1, le=999999999)] = None
    latitude: Annotated[Optional[float], Field(ge=6, le=38)] = None
    longitude: Annotated[Optional[float], Field(ge=68, le=98)] = None

    @field_validator("label")
    @classmethod
    def _clean(cls, value):
        return _plain(value)

    def clean(self) -> dict:
        data = self.model_dump()
        if (data["latitude"] is None) != (data["longitude"] is None):
            raise HTTPException(status_code=422, detail="network_location_incomplete")
        return data


class AssetUpdate(AssetFields):
    expected_version: StrictInt


def _unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="network_registry_unavailable")


def _run(fn, *args):
    try:
        return store_module.view(fn(*args))
    except store_module.VersionConflict:
        raise HTTPException(status_code=409, detail="network_version_conflict") from None
    except store_module.NotFound:
        raise HTTPException(status_code=404, detail="network_not_found") from None
    except store_module.Duplicate:
        raise HTTPException(status_code=409, detail="network_code_taken") from None
    except HTTPException:
        raise
    except Exception:
        raise _unavailable() from None


def _actor(operator: Operator) -> tuple[str, str]:
    return operator.subject, str(operator.agency_id)


def _load(entity: str, row_id: str) -> dict:
    try:
        return store_module.get_store().get(entity, row_id)
    except store_module.NotFound:
        raise HTTPException(status_code=404, detail="network_not_found") from None
    except Exception:
        raise _unavailable() from None


def _patch(entity: str, row_id: str, changes: dict, expected_version: int, action: str, operator: Operator):
    return _run(store_module.get_store().patch, entity, row_id, changes, expected_version, action, *_actor(operator))


def _live(entity: str, row_id: str) -> dict:
    row = _load(entity, row_id)
    if row.get("deleted_at") is not None:
        raise HTTPException(status_code=409, detail="network_deleted")
    return row


@router.get("")
def read_registry(include_deleted: bool = Query(False), _operator: Operator = Depends(_admin)):
    try:
        s = store_module.get_store()
        providers = [store_module.view(r) for r in s.list_rows("provider", include_deleted)]
        assets = [store_module.view(r) for r in s.list_rows("asset", include_deleted)]
    except Exception:
        raise _unavailable() from None
    return {"providers": providers, "assets": assets, "catalogue": cat.public_catalogue(),
            "credential_store_ready": connector_secrets.master_key_configured(),
            "reference_adapter": {"available": False, "reason": "not_built_in_this_release"}}


@router.post("/providers", status_code=201)
def create_provider(body: ProviderFields, operator: Operator = Depends(_admin)):
    return _run(store_module.get_store().create, "provider", body.clean(), *_actor(operator))


@router.put("/providers/{provider_id}")
def update_provider(provider_id: str, body: ProviderUpdate, operator: Operator = Depends(_admin)):
    _check_id(provider_id)
    before = _live("provider", provider_id)
    data = ProviderFields.model_validate(body.model_dump(exclude={"expected_version"})).clean()
    changes = {k: v for k, v in data.items() if before.get(k) != v}
    return _patch("provider", provider_id, changes, body.expected_version, "update", operator)


def _check_id(value: str) -> None:
    if not re.match(_UUID, value):
        raise HTTPException(status_code=404, detail="network_not_found")


def _toggle(entity: str, row_id: str, body: Versioned, operator: Operator, enabled: bool):
    _check_id(row_id)
    _live(entity, row_id)
    return _patch(entity, row_id, {"enabled": enabled}, body.expected_version, "enable" if enabled else "disable", operator)


@router.post("/providers/{provider_id}/enable")
def enable_provider(provider_id: str, body: Versioned, operator: Operator = Depends(_admin)):
    return _toggle("provider", provider_id, body, operator, True)


@router.post("/providers/{provider_id}/disable")
def disable_provider(provider_id: str, body: Versioned, operator: Operator = Depends(_admin)):
    return _toggle("provider", provider_id, body, operator, False)


def _delete(entity: str, row_id: str, body: Versioned, operator: Operator):
    from datetime import datetime, timezone
    _check_id(row_id)
    _live(entity, row_id)
    return _patch(entity, row_id, {"deleted_at": datetime.now(timezone.utc), "enabled": False}, body.expected_version,
                  "delete", operator)


def _restore(entity: str, row_id: str, body: Versioned, operator: Operator):
    _check_id(row_id)
    row = _load(entity, row_id)
    if row.get("deleted_at") is None:
        raise HTTPException(status_code=409, detail="network_not_deleted")
    return _patch(entity, row_id, {"deleted_at": None}, body.expected_version, "restore", operator)


@router.post("/providers/{provider_id}/delete")
def delete_provider(provider_id: str, body: Versioned, operator: Operator = Depends(_admin)):
    return _delete("provider", provider_id, body, operator)


@router.post("/providers/{provider_id}/restore")
def restore_provider(provider_id: str, body: Versioned, operator: Operator = Depends(_admin)):
    return _restore("provider", provider_id, body, operator)


@router.put("/providers/{provider_id}/rehearsal")
def set_rehearsal(provider_id: str, body: Rehearsal, operator: Operator = Depends(_admin)):
    _check_id(provider_id)
    _live("provider", provider_id)
    return _patch("provider", provider_id, {"rehearsal_state": body.state, "rehearsal_capacity_kbps": body.capacity_kbps},
                  body.expected_version, "rehearsal_state", operator)


@router.put("/providers/{provider_id}/credential")
def set_credential(provider_id: str, body: Credential, operator: Operator = Depends(_admin)):
    _check_id(provider_id)
    _live("provider", provider_id)
    try:
        ciphertext, nonce = connector_secrets.encrypt(body.value, f"network:{provider_id}", "credential")
    except connector_secrets.ConnectorKeyMissing:
        raise HTTPException(status_code=503, detail="network_credential_store_not_ready") from None
    return _patch("provider", provider_id, {"credential_ciphertext": ciphertext, "credential_nonce": nonce,
                                            "credential_fingerprint": connector_secrets.fingerprint(body.value)},
                  body.expected_version, "credential_set", operator)


@router.post("/providers/{provider_id}/credential/clear")
def clear_credential(provider_id: str, body: Versioned, operator: Operator = Depends(_admin)):
    _check_id(provider_id)
    _live("provider", provider_id)
    return _patch("provider", provider_id, {"credential_ciphertext": None, "credential_nonce": None,
                                            "credential_fingerprint": None}, body.expected_version, "credential_clear",
                  operator)


@router.post("/assets", status_code=201)
def create_asset(body: AssetFields, operator: Operator = Depends(_admin)):
    return _run(store_module.get_store().create, "asset", body.clean(), *_actor(operator))


@router.put("/assets/{asset_id}")
def update_asset(asset_id: str, body: AssetUpdate, operator: Operator = Depends(_admin)):
    _check_id(asset_id)
    before = _live("asset", asset_id)
    data = AssetFields.model_validate(body.model_dump(exclude={"expected_version"})).clean()
    if str(before.get("provider_id")) != data["provider_id"]:
        _live("provider", data["provider_id"])
    changes = {k: v for k, v in data.items() if (str(before.get(k)) if k == "provider_id" else before.get(k)) != v}
    return _patch("asset", asset_id, changes, body.expected_version, "update", operator)


@router.post("/assets/{asset_id}/enable")
def enable_asset(asset_id: str, body: Versioned, operator: Operator = Depends(_admin)):
    return _toggle("asset", asset_id, body, operator, True)


@router.post("/assets/{asset_id}/disable")
def disable_asset(asset_id: str, body: Versioned, operator: Operator = Depends(_admin)):
    return _toggle("asset", asset_id, body, operator, False)


@router.post("/assets/{asset_id}/delete")
def delete_asset(asset_id: str, body: Versioned, operator: Operator = Depends(_admin)):
    return _delete("asset", asset_id, body, operator)


@router.post("/assets/{asset_id}/restore")
def restore_asset(asset_id: str, body: Versioned, operator: Operator = Depends(_admin)):
    return _restore("asset", asset_id, body, operator)


@router.get("/audit")
def read_audit(_operator: Operator = Depends(_admin)):
    try:
        rows = store_module.get_store().list_audit(200)
    except Exception:
        raise _unavailable() from None
    return {"rows": [store_module.view(r) for r in rows]}


LANE_FIELDS = ("code", "display_name", "kind", "monogram", "colour_token", "logo_key", "rehearsal_state",
               "rehearsal_capacity_kbps")


@lanes_router.get("")
def read_lanes(_operator: Operator = Depends(_reader)):
    """Enabled providers' names and rehearsal link states only. No ids, notes, identifiers or credential facts."""
    try:
        rows = store_module.get_store().list_rows("provider", False)
    except Exception:
        raise _unavailable() from None
    return {"lanes": [{k: r.get(k) for k in LANE_FIELDS} for r in rows
                      if r.get("enabled") and r.get("kind") != "public_reference"]}
