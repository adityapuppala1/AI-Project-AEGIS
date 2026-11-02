"""Public Earth reference feed tests; upstreams are mocked, no network is used."""
import json
import pytest
from fastapi.testclient import TestClient
from app import earth_watch
from app.main import app

client = TestClient(app)

QUAKES = {"features": [
    {"id": "us1", "geometry": {"type": "Point", "coordinates": [78.5, 17.4, 10]},
     "properties": {"type": "earthquake", "mag": 4.24, "place": "Test place", "time": 1767312000000,
                    "updated": 1767312100000, "status": "reviewed", "url": "https://example.test/q"}},
    {"id": "bad-type", "geometry": {"type": "Point", "coordinates": [1, 1]}, "properties": {"type": "quarry blast"}},
    {"id": "bad-geo", "geometry": {"type": "Polygon", "coordinates": []}, "properties": {"type": "earthquake"}},
    {"id": "bad-range", "geometry": {"type": "Point", "coordinates": [500, 1]}, "properties": {"type": "earthquake"}},
    {"id": "nan", "geometry": {"type": "Point", "coordinates": [float("nan"), 1]}, "properties": {"type": "earthquake"}},
    {"id": "http-link", "geometry": {"type": "Point", "coordinates": [10, 10]},
     "properties": {"type": "earthquake", "mag": 3, "url": "http://insecure.test/x", "time": 1767312000000}},
]}
EVENTS = {"events": [
    {"id": "EONET_1", "title": "Flood", "categories": [{"id": "floods", "title": "Floods"}],
     "geometry": [{"type": "Point", "date": "2026-10-30T00:00:00Z", "coordinates": [91.6, 26.1]},
                  {"type": "Point", "date": "2026-11-01T06:00:00Z", "coordinates": [91.7, 26.2]}],
     "sources": [{"url": "https://example.test/e"}]},
    {"id": "EONET_2", "title": "Polygon only", "categories": [],
     "geometry": [{"type": "Polygon", "date": "2026-11-01T00:00:00Z", "coordinates": []}]},
]}
IMAGERY = """<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1">
<Contents>{layers}</Contents></Capabilities>"""
LAYER = """<Layer><ows:Title>{id}</ows:Title><ows:Identifier>{id}</ows:Identifier>
<Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-11-01</Default>
<Value>2000-02-24/2026-11-01/P1D</Value></Dimension>
<TileMatrixSetLink><TileMatrixSet>GoogleMapsCompatible_Level9</TileMatrixSet></TileMatrixSetLink></Layer>"""


def imagery_xml(ids=earth_watch.GIBS_LAYERS):
    return IMAGERY.format(layers="".join(LAYER.format(id=i) for i in ids)).encode()


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    earth_watch.clear_cache()
    monkeypatch.setenv("AEGIS_PUBLIC_EARTH_FEEDS", "1")
    monkeypatch.setattr(earth_watch.time, "sleep", lambda _seconds: None)
    yield
    earth_watch.clear_cache()


def serve(monkeypatch, payloads):
    calls = []

    def fake(url):
        calls.append(url)
        value = payloads[next(k for k, (u, _, _) in earth_watch.FEEDS.items() if u == url)]
        if isinstance(value, Exception):
            raise value
        return value
    monkeypatch.setattr(earth_watch, "_fetch_bytes", fake)
    return calls


def test_disabled_by_default(monkeypatch):
    monkeypatch.delenv("AEGIS_PUBLIC_EARTH_FEEDS")
    calls = serve(monkeypatch, {"earthquakes": json.dumps(QUAKES).encode()})
    assert client.get("/v1/public-reference/earth-watch/earthquakes").status_code == 503
    assert calls == []
    status = client.get("/v1/public-reference/earth-watch/status").json()
    assert status["enabled"] is False and status["writes_to_database"] is False


def test_unknown_feed_cannot_be_proxied():
    assert client.get("/v1/public-reference/earth-watch/https%3A%2F%2Fexample.com").status_code == 404
    assert client.get("/v1/public-reference/earth-watch/internal").status_code == 404


def test_earthquakes_are_normalized_and_filtered(monkeypatch):
    serve(monkeypatch, {"earthquakes": json.dumps(QUAKES).encode()})
    body = client.get("/v1/public-reference/earth-watch/earthquakes").json()
    assert body["classification"] == "public_reference" and body["stale"] is False
    ids = [r["id"] for r in body["records"]]
    assert ids == ["usgs-us1", "usgs-http-link"]
    first = body["records"][0]
    assert first["title"] == "M4.2 · Test place" and first["url"] == "https://example.test/q"
    assert first["observed_at"].endswith("+00:00")
    assert body["records"][1]["url"] is None  # non-HTTPS links are dropped


def test_events_use_latest_point_and_skip_non_points(monkeypatch):
    serve(monkeypatch, {"events": json.dumps(EVENTS).encode()})
    records = client.get("/v1/public-reference/earth-watch/events").json()["records"]
    assert len(records) == 1
    assert records[0]["lat"] == 26.2 and records[0]["observed_at"].startswith("2026-11-01T06:00")


def test_attribution_and_no_endorsement_wording_is_served(monkeypatch):
    serve(monkeypatch, {"earthquakes": json.dumps(QUAKES).encode(), "events": json.dumps(EVENTS).encode(), "imagery": imagery_xml()})
    quakes = " ".join(client.get("/v1/public-reference/earth-watch/earthquakes").json()["limitations"])
    events = " ".join(client.get("/v1/public-reference/earth-watch/events").json()["limitations"])
    imagery = " ".join(client.get("/v1/public-reference/earth-watch/imagery").json()["limitations"])
    assert "compiled by the U.S. Geological Survey" in quakes
    assert "NASA EONET" in events
    assert "Global Imagery Browse Services" in imagery and "ESDIS" in imagery
    for text in (quakes, events, imagery):
        assert "endorsement is implied" in text


def test_cache_prevents_refetch(monkeypatch):
    calls = serve(monkeypatch, {"events": json.dumps(EVENTS).encode()})
    client.get("/v1/public-reference/earth-watch/events")
    client.get("/v1/public-reference/earth-watch/events")
    assert len(calls) == 1


def test_upstream_failure_marks_retained_data_stale(monkeypatch):
    serve(monkeypatch, {"events": json.dumps(EVENTS).encode()})
    client.get("/v1/public-reference/earth-watch/events")
    earth_watch._cache["events"]["fetched_epoch"] = 0
    serve(monkeypatch, {"events": OSError("offline")})
    body = client.get("/v1/public-reference/earth-watch/events").json()
    assert body["stale"] is True and "previously fetched" in body["warning"]
    assert len(body["records"]) == 1


def test_first_fetch_retries_once_after_a_transient_error(monkeypatch):
    attempts = []

    def flaky(url):
        attempts.append(url)
        if len(attempts) == 1:
            raise OSError("transient")
        return json.dumps(EVENTS).encode()
    monkeypatch.setattr(earth_watch, "_fetch_bytes", flaky)
    response = client.get("/v1/public-reference/earth-watch/events")
    assert response.status_code == 200 and len(attempts) == 2


def test_cold_failure_does_not_invent_data(monkeypatch):
    serve(monkeypatch, {"events": OSError("offline")})
    response = client.get("/v1/public-reference/earth-watch/events")
    assert response.status_code == 502 and "no demo data" in response.json()["detail"]
    assert "offline" not in response.text


@pytest.mark.parametrize("feed,payload", [
    ("earthquakes", b"not json"), ("earthquakes", b'{"features": 1}'),
    ("events", b'{"events": "x"}'), ("imagery", b"<Capabilities/>"),
])
def test_malformed_upstream_is_rejected(monkeypatch, feed, payload):
    serve(monkeypatch, {feed: payload})
    assert client.get(f"/v1/public-reference/earth-watch/{feed}").status_code == 502


def test_imagery_layers_and_ranges(monkeypatch):
    serve(monkeypatch, {"imagery": imagery_xml()})
    body = client.get("/v1/public-reference/earth-watch/imagery").json()
    assert {layer["id"] for layer in body["layers"]} == set(earth_watch.GIBS_LAYERS)
    assert body["layers"][0]["latest"] == "2026-11-01" and body["layers"][0]["start"] == "2000-02-24"


def test_missing_imagery_layer_is_rejected(monkeypatch):
    serve(monkeypatch, {"imagery": imagery_xml(earth_watch.GIBS_LAYERS[:2])})
    assert client.get("/v1/public-reference/earth-watch/imagery").status_code == 502


def test_xml_entity_declarations_are_rejected():
    bomb = b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><Capabilities>&a;</Capabilities>'
    with pytest.raises(ValueError):
        earth_watch.parse_imagery(bomb)


def test_fetch_refuses_non_allowlisted_urls():
    for url in ("https://example.com/a", "http://earthquake.usgs.gov/x", "file:///etc/passwd",
                "https://169.254.169.254/latest"):
        with pytest.raises(ValueError):
            earth_watch._fetch_bytes(url)


def test_records_are_capped():
    many = {"features": [{"id": f"q{i}", "geometry": {"type": "Point", "coordinates": [1, 1]},
                          "properties": {"type": "earthquake", "mag": 3}} for i in range(700)]}
    assert len(earth_watch.normalize_earthquakes(many)) == earth_watch.MAX_RECORDS


def test_live_public_warning_still_denied():
    assert client.post("/v1/live/public-warning").status_code == 403
