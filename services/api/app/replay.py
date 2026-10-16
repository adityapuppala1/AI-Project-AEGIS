"""Run the vetted bundled exercise replay via the local API container CLI ONLY.

Command: docker compose exec api python -m app.replay
There is intentionally NO POST endpoint to insert observations.
"""
import json
from importlib.resources import files

from app.ingestion_store import replay_records


def load_bundled_fixture() -> list[object]:
    fixture = files("app").joinpath("fixtures/synthetic_ingestion_v1.json")
    data = json.loads(fixture.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("dataset") != "aegis.synthetic.replay.v1":
        raise ValueError("Unexpected exercise replay dataset")
    records = data.get("records")
    if not isinstance(records, list) or not 1 <= len(records) <= 100:
        raise ValueError("Bundled exercise fixture must contain 1–100 records")
    return records


def main() -> None:
    records = load_bundled_fixture()
    print(json.dumps(replay_records(records), sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
