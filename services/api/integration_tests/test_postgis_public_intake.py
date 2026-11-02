"""Real-database checks for the opt-in public intake quarantine (separate verification DB only)."""
import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest

from app import public_intake

pytestmark = pytest.mark.skipif(not os.getenv('AEGIS_TEST_DATABASE_URL'), reason='Opt-in local PostGIS required')
MIGRATION = '011_public_intake_quarantine.sql'


def migration_sql() -> str:
    candidates = [Path('/db/migrations') / MIGRATION, *(parent / 'db/migrations' / MIGRATION for parent in Path(__file__).resolve().parents)]
    for path in candidates:
        if path.is_file():
            return path.read_text()
    raise FileNotFoundError(MIGRATION)


@pytest.fixture()
def database(monkeypatch):
    url = os.environ['AEGIS_TEST_DATABASE_URL']
    monkeypatch.setenv('DATABASE_URL', url)
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(migration_sql())
        marker = 'Integration ' + uuid4().hex[:8]
        yield url, marker
        conn.execute('DELETE FROM public_intake_reports WHERE title LIKE %s', (marker + '%',))


def report(marker, **over):
    values = {'title': marker + ' road', 'description': 'Water is knee deep near the market since morning.',
              'hazard_type': 'waterlogging', 'lat': 17.4, 'lon': 78.5, **over}
    return public_intake.IntakeReport(**values)


def test_insert_duplicate_list_and_count(database):
    url, marker = database
    first = report(marker)
    digest = public_intake.content_digest(first)
    assert public_intake.already_received(digest) is False
    stored = public_intake.insert_report(first, digest)
    assert stored['duplicate'] is False and stored['id'] and stored['submitted_at']
    assert public_intake.already_received(digest) is True
    assert public_intake.insert_report(first, digest) == {'duplicate': True}
    listing = public_intake.list_reports(100)
    mine = [row for row in listing['reports'] if row['title'].startswith(marker)]
    assert len(mine) == 1 and mine[0]['status'] == 'quarantined' and listing['total'] >= 1
    assert set(mine[0]) == {'id', 'submitted_at', 'title', 'description', 'hazard_type', 'lat', 'lon', 'status'}
    assert public_intake.recent_count() >= 1


def test_rows_cannot_be_modified_or_promoted(database):
    url, marker = database
    item = report(marker, title=marker + ' immutable')
    public_intake.insert_report(item, public_intake.content_digest(item))
    with psycopg.connect(url, autocommit=True) as conn:
        for statement in ("UPDATE public_intake_reports SET title='tampered' WHERE title LIKE %s",
                          "UPDATE public_intake_reports SET status='verified' WHERE title LIKE %s"):
            with pytest.raises(psycopg.Error):
                conn.execute(statement, (marker + '%',))
        title = conn.execute('SELECT title FROM public_intake_reports WHERE title LIKE %s', (marker + '%',)).fetchone()[0]
        assert title == marker + ' immutable'


def test_database_constraints_hold_even_without_the_api_validator(database):
    url, marker = database
    bad_rows = [
        ('x', 'valid description text', 'flood', 17.0, 78.0, 'a' * 64),
        (marker, 'short', 'flood', 17.0, 78.0, 'b' * 64),
        (marker, 'valid description text', 'ufo', 17.0, 78.0, 'c' * 64),
        (marker, 'valid description text', 'flood', 51.0, 78.0, 'd' * 64),
        (marker, 'valid description text', 'flood', 17.0, 120.0, 'e' * 64),
        (marker, 'valid description text', 'flood', 17.0, 78.0, 'not-a-hash'),
    ]
    with psycopg.connect(url, autocommit=True) as conn:
        for row in bad_rows:
            with pytest.raises(psycopg.Error):
                conn.execute('INSERT INTO public_intake_reports (id,title,description,hazard_type,lat,lon,content_sha256) VALUES (%s,%s,%s,%s,%s,%s,%s)', (str(uuid4()), *row))
        with pytest.raises(psycopg.Error):
            conn.execute("INSERT INTO public_intake_reports (id,title,description,hazard_type,lat,lon,content_sha256,status) VALUES (%s,%s,'valid description text','flood',17,78,%s,'verified')",
                         (str(uuid4()), marker, 'f' * 64))


def test_table_has_no_identity_columns_and_cases_are_untouched(database):
    url, marker = database
    with psycopg.connect(url, autocommit=True) as conn:
        columns = {row[0] for row in conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name='public_intake_reports'")}
        assert columns == {'id', 'submitted_at', 'title', 'description', 'hazard_type', 'lat', 'lon', 'content_sha256', 'status'}
        counts = lambda: tuple(conn.execute(f'SELECT count(*) FROM {table}').fetchone()[0] for table in ('incidents', 'exercise_agency_tasks', 'exercise_data_sources'))
        before = counts()
        item = report(marker, title=marker + ' isolation')
        public_intake.insert_report(item, public_intake.content_digest(item))
        assert counts() == before
        foreign_keys = conn.execute("SELECT count(*) FROM information_schema.table_constraints WHERE table_name='public_intake_reports' AND constraint_type='FOREIGN KEY'").fetchone()[0]
        assert foreign_keys == 0


def test_migration_is_idempotent(database):
    url, _marker = database
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(migration_sql())
        conn.execute(migration_sql())
        triggers = conn.execute("SELECT count(*) FROM pg_trigger WHERE tgrelid='public_intake_reports'::regclass AND NOT tgisinternal").fetchone()[0]
        assert triggers == 1
