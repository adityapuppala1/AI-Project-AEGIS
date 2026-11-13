"""Fixed Phase 1 pilot configuration: Hyderabad and the Musi basin only.

Terms and conditions for this source are in LICENCES.md (row 1, Open-Meteo, CC BY 4.0, non-commercial).
Nothing here is imported by, or imports from, services/api or apps/web.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW_DIR = ROOT / "raw"                    # never committed
MANIFEST_DIR = ROOT / "manifests"         # committed: checksums and provenance
CATALOGUE_DIR = ROOT / "catalogue"

START_DATE = "2000-01-01"
END_DATE = "2025-12-31"                   # stops short of the most recent, still-revised days
EXPECTED_DAYS = 9497                      # inclusive days from START_DATE to END_DATE

ALLOWED_HOSTS = frozenset({"archive-api.open-meteo.com", "flood-api.open-meteo.com"})
USER_AGENT = "IndTrana-research-pilot/1.0 (non-commercial hackathon research; repo adityapuppala1/AI-Project-AEGIS)"
ATTRIBUTION = "Weather data by Open-Meteo.com (https://open-meteo.com/), CC BY 4.0, https://open-meteo.com/en/licence"
LICENCE_REF = "research/real-data/LICENCES.md#1-open-meteo"

MAX_BYTES = 8_000_000
DEFAULT_DELAY_SECONDS = 4.0               # published limit is 600 calls/minute; this is about 15/minute
DEFAULT_MAX_REQUESTS = 40                 # hard cap per run

RAIN_VARIABLES = ("precipitation_sum", "rain_sum", "precipitation_hours")
DISCHARGE_VARIABLES = ("river_discharge", "river_discharge_mean", "river_discharge_max")

# 3 x 3 grid over the city (about 11 km spacing). The API snaps to its own model cell and returns the
# coordinates it used; those are stored so duplicate cells are visible rather than hidden.
RAIN_POINTS = [
    {"id": f"hyd_{lat:.2f}_{lon:.2f}", "lat": lat, "lon": lon}
    for lat in (17.30, 17.40, 17.50) for lon in (78.35, 78.47, 78.60)
]
# Approximate Musi basin locations. GloFAS output is model discharge on a coarse grid, not gauge data,
# and the nearest cell may not sit exactly on the river; the returned cell is stored.
DISCHARGE_POINTS = [
    {"id": "musi_himayat_sagar", "lat": 17.32, "lon": 78.38, "note": "near Himayat Sagar reservoir (approximate)"},
    {"id": "musi_osman_sagar", "lat": 17.38, "lon": 78.31, "note": "near Osman Sagar / Gandipet reservoir (approximate)"},
    {"id": "musi_city", "lat": 17.36, "lon": 78.47, "note": "Musi through central Hyderabad (approximate)"},
    {"id": "musi_downstream", "lat": 17.30, "lon": 78.60, "note": "Musi downstream of the city (approximate)"},
    {"id": "musi_far_downstream", "lat": 17.20, "lon": 78.85, "note": "further downstream (approximate)"},
]
