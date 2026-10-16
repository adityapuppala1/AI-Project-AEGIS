"""Contract validation must be strict, synthetic-only and deterministic."""
from datetime import datetime, timezone
import pytest
from app.ingestion_contract import check_record, payload_digest, reject_metadata
from app.replay import load_bundled_fixture

AS_OF = datetime(2026, 10, 16, 18, 0, tzinfo=timezone.utc)


def test_bundled_fixture_contains_no_live_device_fields():
    records = load_bundled_fixture()
    assert len(records) == 9
    assert all(isinstance(value, dict) and value["synthetic"] is True for value in records)
    assert all("secret" not in str(value).lower() for value in records)


def test_first_record_valid_json_contract():
    record = load_bundled_fixture()[0]
    parsed, reason = check_record(record, as_of=AS_OF)
    assert reason is None
    assert parsed is not None
    assert str(parsed.event_id) == record["event_id"]
    assert parsed.metric_unit == "mm"


@pytest.mark.parametrize("mutate", [
    lambda r: {**r, "synthetic": False},
    lambda r: {**r, "contract_version": "v2"},
    lambda r: {**r, "unexpected": "ignored-never"},
    lambda r: {**r, "observed_at": "2026-10-15T09:00:00"},
    lambda r: {**r, "metric_value": -2},
    lambda r: {**r, "metric_value": 60000},
    lambda r: {**r, "metric_unit": "grams"},
    lambda r: {**r, "event_id": "not-a-uuid"},
])
def test_rejects_bad_fields(mutate):
    record = mutate(load_bundled_fixture()[0])
    _, reason = check_record(record, as_of=AS_OF)
    assert reason == "invalid_contract"


def test_future_and_oversize_quarantined():
    valid = load_bundled_fixture()[0]
    _, future_reason = check_record({**valid, "observed_at": "2026-10-18T00:00:00Z"}, as_of=AS_OF)
    assert future_reason == "future_observation"
    _, large_reason = check_record({**valid, "extra": "x" * 5000}, as_of=AS_OF)
    assert large_reason == "oversized_record"


def test_digest_canonical_and_quarantine_metadata_bounded():
    record = load_bundled_fixture()[0]
    assert payload_digest(record) == payload_digest(dict(reversed(list(record.items()))))
    assert reject_metadata({"event_id": "a" * 500, "source_id": "b" * 500}) == ("a"*80, "b"*80)


def test_refuses_invalid_batch_inputs():
    from app.ingestion_store import replay_records
    with pytest.raises(ValueError, match="between 1 and 100"):
        replay_records([])
    with pytest.raises(ValueError, match="between 1 and 100"):
        replay_records([{}] * 101)
