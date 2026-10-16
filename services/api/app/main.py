"""AEGIS exercise-only API foundation; no live alerts or dispatch."""
from datetime import datetime, timezone
from uuid import UUID
from typing import Literal
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

app = FastAPI(title="AEGIS Exercise API", version="0.1.0")

class Observation(BaseModel):
    source_id: str = Field(min_length=1, max_length=100)
    rainfall_mm_hour: float = Field(ge=0, le=500)
    water_index: float = Field(ge=0, le=100)
    drainage_condition: Literal["good", "moderate", "limited"]
    observed_at: datetime

class RiskResult(BaseModel):
    hazard_index: int
    classification: str
    kind: Literal["synthetic_rule_demo"] = "synthetic_rule_demo"
    requires_human_verification: bool = True
    generated_at: datetime

@app.get("/health")
def health():
    return {"status": "ok", "mode": "exercise"}

@app.post("/v1/exercise/risk", response_model=RiskResult)
def exercise_risk(event: Observation):
    if event.observed_at.tzinfo is None:
        raise HTTPException(422, "observed_at must contain timezone")
    # Training/demo UX score only, not a forecast or calibrated probability.
    index = min(100, round(event.rainfall_mm_hour * 0.56 + event.water_index * 0.38 + {"good": 0, "moderate": 12, "limited": 24}[event.drainage_condition]))
    return RiskResult(hazard_index=index, classification="high" if index >= 75 else "monitor", generated_at=datetime.now(timezone.utc))

@app.post("/v1/live/public-warning")
def deny_live_warning():
    raise HTTPException(status_code=403, detail="Live public warnings are not available in this exercise environment")

@app.get("/v1/exercise/incidents")
def exercise_incidents():
    from app.db import list_incidents
    return list_incidents()

@app.get("/v1/exercise/telemetry")
def exercise_telemetry():
    """Deterministic synthetic fixture. Never interpret as live measurements."""
    rainfall = [6, 9, 13, 12, 18, 23, 29, 35, 31, 43, 47, 52]
    water = [18, 19, 23, 28, 32, 39, 44, 49, 56, 62, 68, 74]
    return {
        "source": "synthetic_fixture",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "points": [
            {"label": f"-{(11 - i) * 5}m" if i < 11 else "now",
             "rainfall_mm": amount, "water_index": water[i]}
            for i, amount in enumerate(rainfall)
        ],
    }

# Exercise workflow is disabled unless explicitly enabled in an isolated developer environment.
from app.exercise_workflows import router as exercise_workflow_router
app.include_router(exercise_workflow_router)

@app.get("/v1/exercise/incidents/query")
def search_exercise_incidents(
    search: str = Query(default="", max_length=120),
    status: Literal["new", "review", "active", "resolved"] | None = None,
    sort: Literal["created_at", "hazard_type", "status"] = "created_at",
    direction: Literal["asc", "desc"] = "desc",
    page: int = Query(default=1, ge=1, le=10000),
    page_size: int = Query(default=10, ge=1, le=50),
):
    from app.db import query_incidents
    return query_incidents(
        search=search.strip(), status=status, sort=sort,
        direction=direction, page=page, page_size=page_size,
    )



@app.get("/v1/exercise/incidents/{incident_id}")
def read_exercise_incident_workspace(incident_id: UUID):
    """Public, synthetic-only incident workspace. No operational case data."""
    from app.intelligence_store import incident_workspace
    workspace = incident_workspace(incident_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Exercise incident not found")
    return workspace
