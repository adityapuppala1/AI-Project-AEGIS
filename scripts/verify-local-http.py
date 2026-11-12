"""Read-only HTTP smoke plus refusal of live warnings; no login or DB resets."""
import argparse
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


# Only health and the readiness diagnostic are open on the API port. Exercise-record reads need a verified
# operator token (docs/SECURITY_ASSESSMENT.md); this script holds no credential, so it checks the refusal.
for path in ["/health", "/v1/exercise/system/readiness"]:
    check(args.api, path)
for path in ["/v1/exercise/incidents", "/v1/exercise/incidents/query", "/v1/exercise/sources",
             "/v1/exercise/ingestion/status", "/v1/exercise/model-lab/report",
             "/v1/exercise/agency-tasks", "/v1/exercise/policy", "/v1/exercise/telemetry",
             f"/v1/exercise/incidents/{case}",
             f"/v1/exercise/incidents/{case}/correlation",
             f"/v1/exercise/incidents/{case}/readiness",
             f"/v1/exercise/incidents/{case}/audit",
             "/v1/public-reference/earth-watch/status", "/v1/public-intake/status",
             "/v1/public-intake/reports"]:
    check(args.api, path, (401,))
# Pages other than "/" redirect an anonymous visitor to /sign-in; urllib follows that, so 200 means the redirect
# target rendered, not that data was shown.
for path in ["/", "/demo", "/incidents", f"/incidents/{case}", "/sources",
             "/ingestion", "/model-lab", "/approvals", "/agency-sync", "/audit",
             "/playbooks", "/admin", "/help"]:
    check(args.web, path)
for base, prefix in [(args.api, "/v1/exercise"), (args.web, "/api")]:
    for suffix in ["/proposals", "/proposals/77777777-7777-4777-8777-777777777777/audit",
                   "/proposals/77777777-7777-4777-8777-777777777777/cap-draft"]:
        check(base, prefix + suffix, (401, 503))
check(args.api, "/v1/live/public-warning", (403,), "POST")
# The audit export needs a signed-in session in the web app and a token on the API, so its checksum is verified by
# services/api tests and a signed-in browser check, not by this anonymous script.
check(args.web, f"/api/incidents/{case}/audit", (401,))
check(args.api, f"/v1/exercise/incidents/{case}/audit", (401,))
print("PASS anonymous refusals; signed-in data, audit checksum, browser and IdP gates remain separate")
