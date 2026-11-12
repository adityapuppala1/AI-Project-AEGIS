"""Public Earth reference feed tests; upstreams are mocked, no network is used."""
import json
import pytest
from fastapi.testclient import TestClient
from app import earth_watch
from app.main import app
# Formerly open read routes now need a verified exercise-agency operator (tests/conftest.py).
pytestmark = pytest.mark.usefixtures("exercise_reader")

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
    earth_watch._cache["events"]["fetched_epoch"] = earth_watch.time.time() - 1000  # past the TTL, within the stale limit
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


# --- hardening from the independent security review ------------------------------------------------

def test_retained_data_older_than_a_day_is_never_served(monkeypatch):
    serve(monkeypatch, {"events": json.dumps(EVENTS).encode()})
    client.get("/v1/public-reference/earth-watch/events")
    earth_watch._cache["events"]["fetched_epoch"] = earth_watch.time.time() - earth_watch.STALE_MAX_SECONDS - 5
    serve(monkeypatch, {"events": OSError("offline")})
    assert client.get("/v1/public-reference/earth-watch/events").status_code == 502


def test_failed_refresh_backs_off_instead_of_hammering_the_upstream(monkeypatch):
    calls = serve(monkeypatch, {"events": OSError("offline")})
    assert client.get("/v1/public-reference/earth-watch/events").status_code == 502
    first = len(calls)
    for _ in range(5):
        assert client.get("/v1/public-reference/earth-watch/events").status_code == 502
    assert len(calls) == first  # no further upstream attempts inside the backoff window
    earth_watch._next_attempt["events"] = 0  # window over
    client.get("/v1/public-reference/earth-watch/events")
    assert len(calls) > first


def test_backoff_serves_retained_data_as_stale(monkeypatch):
    serve(monkeypatch, {"events": json.dumps(EVENTS).encode()})
    client.get("/v1/public-reference/earth-watch/events")
    earth_watch._cache["events"]["fetched_epoch"] = earth_watch.time.time() - 1000
    calls = serve(monkeypatch, {"events": OSError("offline")})
    client.get("/v1/public-reference/earth-watch/events")
    again = client.get("/v1/public-reference/earth-watch/events").json()
    assert again["stale"] is True and len(calls) == 1


def test_a_request_never_queues_behind_an_in_flight_refresh(monkeypatch):
    calls = serve(monkeypatch, {"events": json.dumps(EVENTS).encode()})
    lock = earth_watch._locks["events"]
    assert lock.acquire(blocking=False)
    try:
        assert client.get("/v1/public-reference/earth-watch/events").status_code == 502  # cold cache: fail fast
        assert calls == []
        earth_watch._cache["events"] = {"classification": "public_reference", "feed": "events", "attribution": "x", "upstream": "u",
                                        "fetched_epoch": earth_watch.time.time() - 1000, "fetched_at": "2026-11-02T00:00:00+00:00",
                                        "cache_seconds": 300, "limitations": [], "records": []}
        body = client.get("/v1/public-reference/earth-watch/events").json()
        assert body["stale"] is True and "in progress" in body["warning"] and calls == []
    finally:
        lock.release()


class _DripResponse:
    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def read1(self, _size):
        return b"x"  # one byte per read, forever


def test_slow_drip_upstream_hits_the_total_deadline(monkeypatch):
    import types
    ticks = iter(range(0, 10_000, 10))
    clock = types.SimpleNamespace(monotonic=lambda: next(ticks), time=earth_watch.time.time, sleep=lambda _s: None)
    monkeypatch.setattr(earth_watch, "time", clock)
    monkeypatch.setattr(earth_watch, "build_opener", lambda *_handlers: types.SimpleNamespace(open=lambda *_a, **_k: _DripResponse()))
    with pytest.raises(TimeoutError):
        earth_watch._fetch_bytes(earth_watch.FEEDS["events"][0])


def test_fetch_ignores_proxy_environment_variables(monkeypatch):
    import types
    from urllib.request import ProxyHandler
    seen = {}

    class Empty:
        def __enter__(self):
            return types.SimpleNamespace(read1=lambda _size: b"")

        def __exit__(self, *_exc):
            return False

    def capture(*handlers):
        seen["handlers"] = handlers
        return types.SimpleNamespace(open=lambda *_a, **_k: Empty())
    monkeypatch.setattr(earth_watch, "build_opener", capture)
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.invalid:3128")
    assert earth_watch._fetch_bytes(earth_watch.FEEDS["events"][0]) == b""
    assert any(isinstance(handler, ProxyHandler) and handler.proxies == {} for handler in seen["handlers"])


@pytest.mark.parametrize("payload", [
    ("<!DOCTYPE x [<!ENTITY a 'aaaa'>]><Capabilities>&a;</Capabilities>").encode("utf-16"),
    ("<?xml version='1.0' encoding='UTF-16'?><!DOCTYPE x><Capabilities/>").encode("utf-16-le"),
    b"\xef\xbb\xbf<Capabilities/>",
    b"<Capabilities/>\x00",
    b"<?xml version='1.0' encoding='ISO-8859-1'?><Capabilities/>",
    b"<?xml version='1.0'?><!doctype x><Capabilities/>",
    b"<?xml version='1.0'?><Capabilities>&x;</Capabilities><!entity y 'z'>",
    b"not xml at all",
])
def test_xml_guard_rejects_other_encodings_and_dtds(payload):
    with pytest.raises(ValueError):
        earth_watch.parse_imagery(payload)


def test_plain_utf8_capabilities_still_parse():
    xml = b"<?xml version='1.0' encoding='UTF-8'?>" + imagery_xml()
    assert len(earth_watch.parse_imagery(xml)) == 3


def test_duplicate_imagery_layer_ids_do_not_satisfy_the_layer_check():
    ids = [earth_watch.GIBS_LAYERS[0], earth_watch.GIBS_LAYERS[0], earth_watch.GIBS_LAYERS[1]]
    with pytest.raises(ValueError):
        earth_watch.parse_imagery(imagery_xml(ids))


def test_fields_are_length_limited_and_duplicates_removed():
    long_status, long_url = "s" * 500, "https://example.test/" + "a" * 600
    data = {"features": [
        {"id": "dup", "geometry": {"type": "Point", "coordinates": [10, 10]}, "properties": {"type": "earthquake", "status": long_status, "url": long_url}},
        {"id": "dup", "geometry": {"type": "Point", "coordinates": [11, 11]}, "properties": {"type": "earthquake"}},
        {"id": "x" * 200, "geometry": {"type": "Point", "coordinates": [12, 12]}, "properties": {"type": "earthquake"}},
        {"id": "x" * 200 + "different", "geometry": {"type": "Point", "coordinates": [13, 13]}, "properties": {"type": "earthquake"}},
    ]}
    records = earth_watch.normalize_earthquakes(data)
    assert [r["id"][:8] for r in records] == ["usgs-dup", "usgs-xxx"]  # same truncated id collapses to one record
    assert len(records[0]["status"]) <= 40 and records[0]["url"] is None
    events = {"events": [{"id": "E1", "title": "t" * 500, "categories": [{"id": "c" * 200, "title": "k" * 300}],
                          "geometry": [{"type": "Point", "date": "2026-11-01T00:00:00Z", "coordinates": [1, 1]}]},
                         {"id": "E1", "title": "again", "categories": [],
                          "geometry": [{"type": "Point", "date": "2026-11-01T00:00:00Z", "coordinates": [2, 2]}]}]}
    result = earth_watch.normalize_events(events)
    assert len(result) == 1 and len(result[0]["category"]) <= 40 and len(result[0]["kind"]) <= 120 and len(result[0]["title"]) <= 140


def test_live_public_warning_still_denied():
    assert client.post("/v1/live/public-warning").status_code == 403
