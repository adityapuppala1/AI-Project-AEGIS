"""Read-only HTTP smoke plus refusal of live warnings; no login or DB resets."""
import argparse
import hashlib
import json
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

parser = argparse.ArgumentParser()
parser.add_argument("--api", default="http://127.0.0.1:8000")
parser.add_argument("--web", default="http://127.0.0.1:3000")
args = parser.parse_args()
# Loopback checks must not use an environment HTTP proxy.
for base in (args.api, args.web):
    from urllib.parse import urlparse
    if urlparse(base).hostname not in {"localhost", "127.0.0.1", "::1"}:
        parser.error("This smoke script accepts loopback services only")
opener = build_opener(ProxyHandler({}))
case = "22222222-2222-4222-8222-222222222222"


def check(base, path, expected=(200,), method="GET"):
    request = Request(base.rstrip("/") + path, method=method)
    try:
        response = opener.open(request, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        status = response.code
        body = response.read()
    if status not in expected:
        raise SystemExit(f"FAIL {method} {path}: {status}")
    print(f"PASS {status} {method} {path}")
    return body


for path in ["/health", "/v1/exercise/system/readiness", "/v1/exercise/incidents",
             "/v1/exercise/incidents/query", "/v1/exercise/sources",
             "/v1/exercise/ingestion/status", "/v1/exercise/model-lab/report",
             "/v1/exercise/agency-tasks", "/v1/exercise/policy",
             f"/v1/exercise/incidents/{case}",
             f"/v1/exercise/incidents/{case}/correlation",
             f"/v1/exercise/incidents/{case}/readiness"]:
    check(args.api, path)
for path in ["/", "/demo", "/incidents", f"/incidents/{case}", "/sources",
             "/ingestion", "/model-lab", "/approvals", "/agency-sync", "/audit",
             "/playbooks", "/admin", "/help"]:
    check(args.web, path)
for base, prefix in [(args.api, "/v1/exercise"), (args.web, "/api")]:
    for suffix in ["/proposals", "/proposals/77777777-7777-4777-8777-777777777777/audit"]:
        check(base, prefix + suffix, (401, 503))
check(args.api, "/v1/live/public-warning", (403,), "POST")
bundle = json.loads(check(args.web, f"/api/incidents/{case}/audit"))
expected = bundle.pop("manifest_sha256")
bundle.pop("exported_at")
bundle.pop("integrity_note")
actual = hashlib.sha256(json.dumps(bundle, ensure_ascii=True, sort_keys=True,
                                   separators=(",", ":")).encode()).hexdigest()
if actual != expected:
    raise SystemExit("FAIL public audit checksum")
print("PASS public audit checksum; human/browser/IdP gates remain separate")
