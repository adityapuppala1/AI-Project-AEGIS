"""Offline exposure importer on tiny local sample files (no database, no network)."""
import json

import pytest

from app import exposure_import as ei

OSM = {
    'type': 'FeatureCollection',
    'features': [
        {'type': 'Feature', 'id': 'node/1', 'properties': {'amenity': 'hospital', 'name': 'Sample Hospital'},
         'geometry': {'type': 'Point', 'coordinates': [78.47, 17.40]}},
        {'type': 'Feature', 'id': 'way/2', 'properties': {'amenity': 'school', 'name': 'Sample\x00School'},
         'geometry': {'type': 'Polygon', 'coordinates': [[[78.46, 17.39], [78.47, 17.39], [78.47, 17.40], [78.46, 17.39]]]}},
        {'type': 'Feature', 'id': 'way/3', 'properties': {'highway': 'primary'},
         'geometry': {'type': 'LineString', 'coordinates': [[78.45, 17.40], [78.48, 17.41]]}},
        {'type': 'Feature', 'id': 'node/4', 'properties': {'emergency': 'assembly_point'},
         'geometry': {'type': 'Point', 'coordinates': [78.50, 17.42]}},
        {'type': 'Feature', 'id': 'node/5', 'properties': {'amenity': 'cafe'}, 'geometry': {'type': 'Point', 'coordinates': [78.4, 17.4]}},
        {'type': 'Feature', 'id': 'node/6', 'properties': {'amenity': 'school'}, 'geometry': {'type': 'Point', 'coordinates': [978.4, 17.4]}},
        {'type': 'Feature', 'id': 'node/7', 'properties': {'amenity': 'school'}, 'geometry': {'type': 'GeometryCollection', 'geometries': []}},
        {'type': 'Feature', 'id': 'node/8', 'properties': {'amenity': 'school'}, 'geometry': {'type': 'Point', 'coordinates': [72.8, 19.0]}},
        {'type': 'Feature', 'id': 'node/1', 'properties': {'amenity': 'hospital', 'name': 'Sample Hospital'},
         'geometry': {'type': 'Point', 'coordinates': [78.47, 17.40]}},
    ],
}
BBOX = (78.2, 17.2, 78.7, 17.6)


def test_osm_geojson_kinds_licence_provenance_and_skips(tmp_path):
    path = tmp_path / 'sample.geojson'
    path.write_text(json.dumps(OSM), encoding='utf-8')
    rows, skipped = ei.parse_osm_geojson(ei.read_local(str(path)), 'osm-test-1', BBOX)
    assert [r['kind'] for r in rows] == ['hospital', 'school', 'road_segment', 'shelter']
    assert skipped == {'unsupported_kind': 1, 'invalid_geometry': 2, 'outside_bbox': 1, 'duplicate': 1}
    for row in rows:
        assert row['synthetic'] is False and row['licence'] == 'ODbL-1.0' and 'OpenStreetMap contributors' in row['attribution']
        assert len(row['provenance_sha256']) == 64 and row['import_batch'] == 'osm-test-1'
    assert rows[1]['name'] == 'SampleSchool' and rows[2]['weight'] == 2.0
    again, _ = ei.parse_osm_geojson(path.read_text(encoding='utf-8'), 'osm-test-2', BBOX)
    assert [r['id'] for r in again] == [r['id'] for r in rows]  # stable ids -> idempotent re-import


@pytest.mark.parametrize('text,batch', [('not json', 'b'), ('{"type": "Feature"}', 'b'), (json.dumps(OSM), 'bad batch!')])
def test_osm_rejects_malformed_input(text, batch):
    with pytest.raises(ei.ExposureImportError):
        ei.parse_osm_geojson(text, batch)


def test_worldpop_xyz_and_csv(tmp_path):
    xyz = '78.4700 17.4000 1520.6\n78.4708 17.4000 -99999\n78.4716 17.4000 0\n72.8 19.0 50\nnan 17.4 5\n'
    rows, skipped = ei.parse_worldpop_xyz(xyz, 'worldpop-2020', 0.0008333, BBOX)
    assert len(rows) == 1 and rows[0]['count'] == 1521 and rows[0]['kind'] == 'population_cell'
    assert rows[0]['licence'] == 'CC-BY-4.0' and 'WorldPop' in rows[0]['attribution'] and rows[0]['synthetic'] is False
    ring = rows[0]['geometry']['coordinates'][0]
    assert ring[0] == ring[-1] and len(ring) == 5
    assert skipped == {'header': 0, 'invalid': 1, 'nodata_or_zero': 2, 'outside_bbox': 1}
    csv_rows, csv_skipped = ei.parse_worldpop_xyz('X,Y,Z\n78.47,17.40,10\n78.48,17.40,20\n', 'wp', 0.001)
    assert [r['count'] for r in csv_rows] == [10, 20] and csv_skipped['header'] == 1
    with pytest.raises(ei.ExposureImportError):
        ei.parse_worldpop_xyz(xyz, 'wp', 5.0)


def test_geotiff_is_not_read_directly_and_cli_dry_run(tmp_path, capsys):
    tif = tmp_path / 'ppp.tif'
    tif.write_bytes(b'II*\x00')
    with pytest.raises(ei.ExposureImportError, match='gdal_translate'):
        ei.read_local(str(tif))
    sample = tmp_path / 'sample.geojson'
    sample.write_text(json.dumps(OSM), encoding='utf-8')
    assert ei.main(['osm', '--file', str(sample), '--batch', 'osm-dry', '--bbox', '78.2,17.2,78.7,17.6', '--dry-run']) == 0
    summary = json.loads(capsys.readouterr().out)
    assert summary['ok'] and summary['parsed'] == 4 and summary['dry_run'] and 'inserted' not in summary
    assert ei.main(['osm', '--file', str(sample), '--batch', 'x', '--bbox', '1,2,3']) == 2


def test_insert_uses_parameterised_idempotent_sql():
    calls = []

    class Cursor:
        rowcount = 1
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def execute(self, sql, params): calls.append((sql, params))

    class Conn:
        committed = False
        def cursor(self): return Cursor()
        def commit(self): Conn.committed = True

    rows, _ = ei.parse_osm_geojson(json.dumps(OSM), 'osm-ins', BBOX)
    assert ei.insert(Conn(), rows) == 4 and Conn.committed
    sql, params = calls[0]
    assert 'ON CONFLICT (provenance_sha256) DO NOTHING' in sql and 'ST_GeomFromGeoJSON(%s)' in sql
    assert params[1] == 'hospital' and json.loads(params[3])['type'] == 'Point' and params[10] is False
