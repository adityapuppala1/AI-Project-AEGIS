# AEGIS OIDC resource-server integration — security milestone

## Implemented scope

- AEGIS accepts only signed **RS256 access JWTs** issued by a configured HTTPS identity provider (IdP).
- Every protected proposal request validates issuer, audience, cryptographic signature, expiration, issued-at and subject; signing keys are obtained from the configured JWKS endpoint and cached.
- Agency and role claims come **only from the verified token**. Request bodies cannot assert or override an actor, agency or role.
- Agency-scope checks are repeated in PostgreSQL for creation, listing and review. Out-of-scope incidents/proposals return 404 to reduce enumeration.
- Roles are intentionally narrow: `incident_operator` can draft/submit; `incident_checker` can approve/reject (not their own proposals); `incident_auditor` can read.
- Transactional row locks and database approval triggers guard against concurrent or self approval.
- All operations remain **exercise-only**; there is no operational public alert or dispatch endpoint.

## Operator identity contract

The signed *access token* issued by the trusted IdP must contain:

| JWT claim | Example | Requirement |
|---|---|---|
| `iss` | `https://idp.example.gov/realms/aegis` | Exact OIDC_ISSUER match |
| `aud` | `aegis-resource-api` | Must include the configured API audience |
| `sub` | Stable opaque operator identifier | Non-empty and at most 256 characters |
| `iat`, `exp` | Signed Unix timestamps | Current non-expired token |
| `aegis_agency_id` | `11111111-1111-4111-8111-111111111111` | Valid UUID assigned by IdP, not an API request |
| `aegis_roles` | `["incident_operator"]` | List containing only known application roles |

The identity provider must assign these roles based on its own administrator-controlled groups and vetted agency memberships. **Do not let end users self-edit custom role or agency claims.** Configure an audience dedicated to this API; do not accept browser ID tokens for an unrelated client as API access tokens. The issuer must provide a trusted public JWKS address and securely rotate keys.

## Windows developer setup

The Docker Compose exercise environment remains usable without a configured identity provider: charts, synthetic incidents, maps and API health continue working. **Protected proposal requests respond HTTP 503** (OIDC is not configured), rather than silently permitting fake identities.

For an approved test IdP, configure in a local noncommitted `.env` file or PowerShell session:

```text
OIDC_ISSUER=https://idp.example.gov/realms/aegis
OIDC_AUDIENCE=aegis-resource-api
OIDC_JWKS_URL=https://idp.example.gov/realms/aegis/protocol/openid-connect/certs
```

These are **illustrative placeholders, not real provider URLs**. Never commit real access tokens or client secrets. Start or recreate API:

```powershell
docker compose up --build -d
```

An operator who has acquired a real **signed access token** through the approved IdP may call:

```powershell
$env:AEGIS_ACCESS_TOKEN = "<temporary IdP-issued access token>"
curl.exe -H "Authorization: Bearer $env:AEGIS_ACCESS_TOKEN" http://localhost:8000/v1/exercise/proposals
```

To create a proposal, POST a JSON body with `incident_id`, `action_type`, and `rationale`. Maker/checker identity **must not** be included. A different identity with `incident_checker` role must review a submitted proposal.

The prototype frontend does **not** yet provide OAuth login or secure session management. Do not paste tokens into the browser console, localStorage, URLs or GitHub issues. A secure browser login and backend-for-frontend integration are separate implementation milestones.

## Threats and production gap

Verified token signatures and database checks are valuable prerequisites, not a complete multi-tenant authorization system. Remaining requirements include:
- OIDC login via Authorization Code + PKCE and server-managed sessions;
- explicit IdP claim mappings and agency membership lifecycle;
- CSRF protection for authenticated browser writes; session rotation, logout and revoked-token strategy;
- TLS termination, rate limits, API abuse monitoring, administrator audit, risk-based MFA;
- additional PostgreSQL row-level security and dedicated database roles; append-only/WORM audit policy;
- penetration testing, data classification and agency approval before any real data integration.

**Do not expose this demonstration API to the public internet or use it for real emergency operations.**
