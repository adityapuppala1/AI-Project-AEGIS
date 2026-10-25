"""AEGIS exercise-only API foundation; no live alerts or dispatch."""
from datetime import datetime, timezone
from typing import Literal
from fastapi import FastAPI, HTTPException
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
