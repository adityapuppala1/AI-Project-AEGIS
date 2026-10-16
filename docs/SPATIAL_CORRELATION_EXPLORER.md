# Geospatial Correlation Explorer — synthetic incident candidates

**Branch:** `feat/spatial-incident-correlation` · **Status:** full-stack prototype
**Security:** Public read-only **synthetic-only exercise**, not operational GIS

## Purpose and deliberate meaning

AEGIS users need to explore which **simulated data sources** and **fictional
infrastructure points** are geographically close to a synthetic incident.

This feature does **not** compute statistical correlation, model flood spread,
assess inundation, verify physical damage, or infer emergency priority.
“Correlation” in this milestone means **bounded geospatial candidate search**.
A source within 1 km, 3 km or 5 km of a case is **not corroborating evidence**,
especially when its latest observation is stale or missing.

The design displays the limitations next to every result, not hidden
behind a help dialog.

## Full-stack features

| Area | Implementation | Safeguard |
|---|---|---|
| PostGIS geography | `ST_DWithin` for bounded radius and `ST_Distance` for meters | Bound coordinates and radius; spatial GIST indexes |
| Source positions | Nullable `exercise_data_sources.location` | Unpositioned sources never matched or given invented coordinates |
| Fictional assets | `exercise_geo_assets` with kind and point | No real hospital, road or shelter registry |
| Fixture generator | `db/seed_geospatial.sql` | Exactly five fictionally named asset points and three positioned source fixtures |
| Discovery | `GET /v1/exercise/incidents/{uuid}/correlation?radius_m=3000` | Demo agency + `is_exercise_fixture` guard and 100–5000 m radius |
| Proximity candidate limit | Up to 20 sources and 20 assets | Small bounded queries; no unbounded data |
| Source timeliness | Reuse `classify_source` | Stale/no-data/clock anomalies remain explicit |
| UI | Incident Intelligence > Spatial Correlation Explorer | Radius selector, lists, source warnings and human checklist |
| Authorization boundary | Synthetic public demo queries only | No private agency data, no maker/checker authority or real actions |
| Testing | Pure reasoning/SQL-scope unit tests and FastAPI 404/422 behavior | No real network, devices or credentials required |

## API response trust contract

Response includes `source: "synthetic_exercise"`,
`analysis_kind: "geographic_proximity_only"`,
`validated_risk_model: false`,
`actual_asset_impact_known: false` and
`operational_actions_enabled: false`.

Each source candidate includes its distance (meters), latest simulated
sample (if available), source quality and freshness status:
`fresh`, `delayed`, `stale`, `no_data`, `clock_anomaly`.
The response does not score or classify flooding risk. A recent synthetic
reading only states timeliness within a demo interval, not correctness.

Each fictional asset returns `impact_status: "not_assessed"`. A candidate
located near a simulated incident must never be described as damaged or
exposed in the real world.

All SQL values are parametrized. Sort/radius are not user SQL expressions.
The incident UUID is validated by FastAPI; out-of-scope cases return 404.

## Database migration and Windows 16 GB local setup

`db/migrations/008_exercise_geospatial.sql` adds:
- nullable source location and its geographic/geometry indexes;
- explicitly synthetic `exercise_geo_assets` table and corresponding
  indexes for nearby-point lookups.

`db/seed_geospatial.sql` places three synthetic source IDs, leaves the
fourth without a location and inserts five fictional asset points. It is
idempotent and re-runnable on existing local PostgreSQL volumes.

On the Windows project directory:

```powershell
cd C:\xampp\htdocs\AI-Project-AEGIS
git fetch origin
git switch feat/spatial-incident-correlation
docker compose down
docker compose up --build -d
docker compose ps
```

Never run `docker compose down -v` for routine updates.

Try:
- `http://localhost:3000/incidents`: click any exercise incident;
- `http://localhost:3000/incidents/22222222-2222-4222-8222-222222222222`: sample waterlogging case;
- open **Spatial Correlation Explorer** and switch 1/3/5 km analysis radius.

Read-only diagnostic commands:

```powershell
docker compose exec db psql -U aegis -d aegis -c "SELECT COUNT(*) FROM exercise_geo_assets;"
docker compose exec db psql -U aegis -d aegis -c "SELECT COUNT(*) FROM exercise_data_sources WHERE location IS NOT NULL;"
curl.exe "http://localhost:8000/v1/exercise/incidents/22222222-2222-4222-8222-222222222222/correlation?radius_m=3000"
```

Expected seeded fixture counts: **five fictional assets**, **three positioned
synthetic sources**, one unpositioned source. Existing local data is retained.

## Next accurate-risk milestones

1. **Trustworthy geography:** authorized facility and infrastructure GIS
   sources with versioned provenance, permitted use, update intervals, and
   geographic/jurisdictional access restrictions.
2. **Actual spatial exposure:** hazard footprint polygons or calibrated
   flood-depth grids with timestamps and uncertainty, PostGIS overlays and
   human validation. Nearby alone is not exposure.
3. **Observation correlation:** authenticated source-to-incident entity
   linking, measured station spatial coverage, event-time windows,
   independent corroboration and conflict reconciliation.
4. **Explainable flood model:** historical event data, out-of-sample metrics,
   forecast horizon and calibration; confidence must not be fabricated.
5. **Accountable response:** maker-checker authorization, agency authority
   and audit controls. Never allow AI to dispatch responders or issue
   warnings without authorized human operations.

For now, the simulator intentionally provides **geographic candidates only**.
It remains lean, uses no extra npm or Python libraries, adds no GPU/3D
runtime and does not launch external cloud services.
