import os
import psycopg
from psycopg.rows import dict_row

def list_incidents():
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT id::text, hazard_type, status,
                ST_Y(location) AS lat, ST_X(location) AS lon, created_at
                FROM incidents ORDER BY created_at DESC LIMIT 100""")
            rows = cur.fetchall()
    return [{**row, "created_at": row["created_at"].isoformat()} for row in rows]
