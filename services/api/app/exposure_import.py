"""Offline exposure importer (roadmap A3) for user-supplied, locally stored extracts.

Loads into exposure_features (db/migrations/015_exposure.sql):
  * an OpenStreetMap GeoJSON extract (ODbL 1.0, attribution "(c) OpenStreetMap contributors"):
    hospitals, schools, shelters and major road segments;
  * a WorldPop population grid as CSV/XYZ text (CC BY 4.0). A GeoTIFF must first be converted on
    the owner's machine, for example `gdal_translate -of XYZ ppp_2020_IND.tif cells.xyz`; this
    module has no raster dependency and never reads GeoTIFF directly.

It never downloads anything and never runs automatically. Rows are synthetic=false and carry source,
licence, attribution, a per-feature provenance sha256 and an import batch label; re-imports are
idempotent (ON CONFLICT on the provenance digest). Usage (inside the api container or venv):

  python -m app.exposure_import osm --file /data/hyderabad.geojson --batch osm-2026-11 [--bbox 78.2,17.2,78.7,17.6] [--dry-run]
  python -m app.exposure_import worldpop --file /data/cells.xyz --batch worldpop-2020 --cell-deg 0.0008333 [--dry-run]
"""
import argparse
import csv
import hashlib
import io
import json
import math
import os
import re
import sys
from pathlib import Path
from uuid import UUID

MAX_FILE_BYTES = 512 * 1024 * 1024
MAX_FEATURES = 500_000
MAX_VERTICES = 5000
OSM_LICENCE = "ODbL-1.0"
OSM_ATTRIBUTION = "(c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)"
WORLDPOP_LICENCE = "CC-BY-4.0"
WORLDPOP_ATTRIBUTION = "WorldPop (www.worldpop.org), CC BY 4.0"
GEOMETRY_TYPES = {"Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"}
ROAD_WEIGHT = {"motorway": 3.0, "trunk": 3.0, "primary": 2.0, "secondary": 1.5, "tertiary": 1.0}
BATCH = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")
NAMESPACE = UUID("6f6b3c1e-6a0e-4c47-9a57-5b0d7c3f2a15")  # fixed: ids derive from provenance digests


class ExposureImportError(ValueError):
    """Fixed, user-facing reason; never echoes file content."""


def _digest(parts) -> str:
    return hashlib.sha256(json.dumps(parts, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _feature_id(provenance: str) -> str:
    from uuid import uuid5
    return str(uuid5(NAMESPACE, provenance))


def _bbox(text: str | None):
    if not text:
        return None
    try:
        west, south, east, north = (float(v) for v in text.split(","))
    except ValueError:
        raise ExposureImportError("bbox must be west,south,east,north") from None
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ExposureImportError("bbox out of range")
    return west, south, east, north


def osm_kind(props: dict) -> str | None:
    amenity, highway = props.get("amenity"), props.get("highway")
    if amenity in {"hospital", "clinic"} or props.get("healthcare") == "hospital":
        return "hospital"
    if amenity in {"school", "college", "university", "kindergarten"}:
        return "school"
    if amenity == "shelter" or props.get("social_facility") == "shelter" or props.get("emergency") == "assembly_point":
        return "shelter"
    if highway in ROAD_WEIGHT:
        return "road_segment"
    return None


def _positions(coords, depth):
    """Yield (lon, lat) positions of a GeoJSON coordinate array of the given nesting depth."""
    if depth == 0:
        yield coords
        return
    if not isinstance(coords, list):
        raise ExposureImportError("invalid geometry")
    for item in coords:
        yield from _positions(item, depth - 1)


_DEPTH = {"Point": 0, "MultiPoint": 1, "LineString": 1, "MultiLineString": 2, "Polygon": 2, "MultiPolygon": 3}


def valid_geometry(geometry) -> tuple[float, float] | None:
    """Representative (lon, lat) when the geometry is an allowed, finite, bounded GeoJSON geometry."""
    if not isinstance(geometry, dict) or geometry.get("type") not in GEOMETRY_TYPES:
        return None
    try:
        points = []
        for position in _positions(geometry.get("coordinates"), _DEPTH[geometry["type"]]):
            if (not isinstance(position, list) or len(position) < 2
                    or not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in position[:2])):
                return None
            lon, lat = float(position[0]), float(position[1])
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                return None
            points.append((lon, lat))
            if len(points) > MAX_VERTICES:
                return None
    except ExposureImportError:
        return None
    if not points:
        return None
    return sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)


def _in(bbox, lon, lat) -> bool:
    return bbox is None or (bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3])


def _name(value) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = "".join(c for c in value if c.isprintable())[:200]
    return cleaned or None


def parse_osm_geojson(text: str, batch: str, bbox=None) -> tuple[list[dict], dict]:
    """GeoJSON FeatureCollection -> exposure rows and a skip summary."""
    if not BATCH.match(batch or ""):
        raise ExposureImportError("invalid batch label")
    try:
        data = json.loads(text)
    except ValueError:
        raise ExposureImportError("file is not valid JSON") from None
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise ExposureImportError("expected a GeoJSON FeatureCollection")
    rows, skipped = [], {"unsupported_kind": 0, "invalid_geometry": 0, "outside_bbox": 0, "duplicate": 0}
    seen = set()
    for feature in data["features"][:MAX_FEATURES]:
        props = feature.get("properties") if isinstance(feature, dict) else None
        if not isinstance(props, dict):
            skipped["unsupported_kind"] += 1
            continue
        kind = osm_kind(props)
        if kind is None:
            skipped["unsupported_kind"] += 1
            continue
        centre = valid_geometry(feature.get("geometry"))
        if centre is None:
            skipped["invalid_geometry"] += 1
            continue
        if not _in(bbox, *centre):
            skipped["outside_bbox"] += 1
            continue
        ref = feature.get("id") if isinstance(feature.get("id"), (str, int)) else props.get("@id") or props.get("osm_id")
        ref = str(ref)[:200] if ref is not None else None
        provenance = _digest(["openstreetmap", ref, kind, feature["geometry"]])
        if provenance in seen:
            skipped["duplicate"] += 1
            continue
        seen.add(provenance)
        rows.append({"id": _feature_id(provenance), "kind": kind, "name": _name(props.get("name")),
                     "geometry": feature["geometry"], "count": 1,
                     "weight": ROAD_WEIGHT.get(props.get("highway"), 1.0) if kind == "road_segment" else 1.0,
                     "source": "openstreetmap", "source_ref": ref, "licence": OSM_LICENCE, "attribution": OSM_ATTRIBUTION,
                     "synthetic": False, "provenance_sha256": provenance, "import_batch": batch,
                     "lon": centre[0], "lat": centre[1]})
    return rows, skipped


def parse_worldpop_xyz(text: str, batch: str, cell_deg: float, bbox=None) -> tuple[list[dict], dict]:
    """XYZ/CSV population grid (lon, lat, people per cell centre). Header optional; nodata/zero skipped."""
    if not BATCH.match(batch or ""):
        raise ExposureImportError("invalid batch label")
    if not (isinstance(cell_deg, float) and 0 < cell_deg <= 0.1):
        raise ExposureImportError("cell size must be between 0 and 0.1 degrees")
    sample = text[:2048]
    delimiter = "," if "," in sample else None
    reader = csv.reader(io.StringIO(text), delimiter=delimiter) if delimiter else (line.split() for line in io.StringIO(text))
    rows, skipped = [], {"header": 0, "invalid": 0, "nodata_or_zero": 0, "outside_bbox": 0}
    half = cell_deg / 2
    for record in reader:
        if len(rows) >= MAX_FEATURES:
            break
        if not record or len(record) < 3:
            continue
        try:
            lon, lat, value = float(record[0]), float(record[1]), float(record[2])
        except ValueError:
            skipped["header" if not rows and not any(skipped.values()) else "invalid"] += 1
            continue
        if not all(math.isfinite(v) for v in (lon, lat, value)) or not (-180 <= lon <= 180 and -90 <= lat <= 90):
            skipped["invalid"] += 1
            continue
        people = int(round(value))
        if people <= 0:
            skipped["nodata_or_zero"] += 1
            continue
        if not _in(bbox, lon, lat):
            skipped["outside_bbox"] += 1
            continue
        ring = [[round(lon - half, 7), round(lat - half, 7)], [round(lon + half, 7), round(lat - half, 7)],
                [round(lon + half, 7), round(lat + half, 7)], [round(lon - half, 7), round(lat + half, 7)],
                [round(lon - half, 7), round(lat - half, 7)]]
        geometry = {"type": "Polygon", "coordinates": [ring]}
        provenance = _digest(["worldpop", round(lon, 7), round(lat, 7), cell_deg, people])
        rows.append({"id": _feature_id(provenance), "kind": "population_cell", "name": None, "geometry": geometry,
                     "count": people, "weight": 1.0, "source": "worldpop", "source_ref": f"{lon:.6f},{lat:.6f}",
                     "licence": WORLDPOP_LICENCE, "attribution": WORLDPOP_ATTRIBUTION, "synthetic": False,
                     "provenance_sha256": provenance, "import_batch": batch, "lon": lon, "lat": lat})
    return rows, skipped


INSERT_SQL = """INSERT INTO exposure_features (id, kind, name, geom, count, weight, source, source_ref, licence, attribution,
                synthetic, provenance_sha256, import_batch)
                VALUES (%s,%s,%s,ST_SetSRID(ST_GeomFromGeoJSON(%s),4326),%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (provenance_sha256) DO NOTHING"""


def insert(conn, rows: list[dict]) -> int:
    """One transaction; returns the number of new rows (existing provenance digests are skipped)."""
    added = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(INSERT_SQL, (row["id"], row["kind"], row["name"], json.dumps(row["geometry"]), row["count"],
                                     row["weight"], row["source"], row["source_ref"], row["licence"], row["attribution"],
                                     row["synthetic"], row["provenance_sha256"], row["import_batch"]))
            added += cur.rowcount == 1
    conn.commit()
    return added


def read_local(path: str) -> str:
    file = Path(path)
    if file.suffix.lower() in {".tif", ".tiff"}:
        raise ExposureImportError("GeoTIFF is not read directly; convert with gdal_translate -of XYZ first")
    if not file.is_file():
        raise ExposureImportError("file not found")
    if file.stat().st_size > MAX_FILE_BYTES:
        raise ExposureImportError("file too large")
    return file.read_text(encoding="utf-8")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.exposure_import", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="source", required=True)
    for name in ("osm", "worldpop"):
        command = sub.add_parser(name)
        command.add_argument("--file", required=True)
        command.add_argument("--batch", required=True)
        command.add_argument("--bbox")
        command.add_argument("--dry-run", action="store_true")
        if name == "worldpop":
            command.add_argument("--cell-deg", type=float, default=0.0008333)
    args = parser.parse_args(argv)
    try:
        text, bbox = read_local(args.file), _bbox(args.bbox)
        if args.source == "osm":
            rows, skipped = parse_osm_geojson(text, args.batch, bbox)
        else:
            rows, skipped = parse_worldpop_xyz(text, args.batch, args.cell_deg, bbox)
    except (ExposureImportError, UnicodeDecodeError, OSError) as error:
        print(json.dumps({"ok": False, "error": str(error) if isinstance(error, ExposureImportError) else "file_unreadable"}))
        return 2
    summary = {"ok": True, "source": args.source, "batch": args.batch, "parsed": len(rows), "skipped": skipped,
               "by_kind": {k: sum(1 for r in rows if r["kind"] == k) for k in sorted({r["kind"] for r in rows})},
               "licence": OSM_LICENCE if args.source == "osm" else WORLDPOP_LICENCE, "dry_run": args.dry_run}
    if not args.dry_run:
        import psycopg
        try:
            with psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=5) as conn:
                summary["inserted"] = insert(conn, rows)
        except (KeyError, psycopg.Error):
            print(json.dumps({**summary, "ok": False, "error": "database_unavailable"}))
            return 3
    print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
