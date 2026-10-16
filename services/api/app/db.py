import os
import psycopg
from psycopg.rows import dict_row
from app.intelligence_store import DEMO_AGENCY

def list_incidents():
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT id::text, hazard_type, status,
                ST_Y(location) AS lat, ST_X(location) AS lon, created_at
                FROM incidents WHERE agency_id = %s ORDER BY created_at DESC LIMIT 100""", (str(DEMO_AGENCY),))
            rows = cur.fetchall()
    return [{**row, "created_at": row["created_at"].isoformat()} for row in rows]


# Whitelist sortable columns: never interpolate user-controlled SQL identifiers.
INCIDENT_SORT_COLUMNS = {
    "created_at": "created_at",
    "hazard_type": "hazard_type",
    "status": "status",
}

def query_incidents(*, search="", status=None, sort="created_at", direction="desc",
                    page=1, page_size=10):
    """Paginate read-only synthetic incidents; do not export PII or real agency records."""
    sort_column = INCIDENT_SORT_COLUMNS[sort]
    sort_direction = "ASC" if direction == "asc" else "DESC"
    # Public exercise search is confined to the hard-coded synthetic seed agency.
    # Future real-agency searches must use verified OIDC and ABAC instead.
    clauses = ["agency_id = %s"]
    params = [str(DEMO_AGENCY)]
    if search:
        # Treat user-provided % and _ as literal characters, not wildcard patterns.
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        clauses.append("(hazard_type ILIKE %s ESCAPE '\\' OR id::text ILIKE %s ESCAPE '\\')")
        params.extend(["%" + escaped + "%", "%" + escaped + "%"])
    if status:
        clauses.append("status = %s")
        params.append(status)
    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    offset = (page - 1) * page_size
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS total FROM incidents " + where, params)
            total = cur.fetchone()["total"]
            sql = f"""SELECT id::text, hazard_type, status,
                ST_Y(location) AS lat, ST_X(location) AS lon, created_at
                FROM incidents {where}
                ORDER BY {sort_column} {sort_direction}, id ASC
                LIMIT %s OFFSET %s"""
            cur.execute(sql, [*params, page_size, offset])
            rows = cur.fetchall()
    return {
        "items": [{**row, "created_at": row["created_at"].isoformat()} for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "source": "synthetic_exercise",
    }
