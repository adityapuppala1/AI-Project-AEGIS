# AEGIS secure browser operator access — exercise milestone

This milestone introduces a Next.js **backend-for-frontend** (BFF) for signed-in
operator sessions and a role-scoped exercise approval workbench at `/approvals`.

## Implemented

- OpenID Connect **Authorization Code + PKCE (S256)**, random state and nonce.
- OIDC provider discovery and signed RS256 validation for both ID and API access tokens.
- Issuer, audience, token expiration, nonce and subject binding are verified before session creation.
- API agency and roles are extracted only from a **signed access token**.
- Access token stays on the Next.js server and is encrypted into a short-lived
  **HttpOnly / SameSite=Lax** session cookie. No tokens in browser localStorage,
  URL query parameters, or readable JavaScript variables.
- CSRF protection for BFF POST operations: exact `Origin` matching plus SameSite cookie.
- The BFF forwards only allowlisted proposal fields to the Python API. The Python API
  independently revalidates the bearer JWT and the PostgreSQL service enforces
  agency boundaries and independent checker rules.
- Browser logout clears the local session; it does **not** revoke an already
  issued IdP access token.
- Proposal workbench supports draft creation, submission, independent review
  with rationale, agency-scoped listing, and an explicit exercise-only banner.

## Security baseline

This is a **reviewable development implementation**, not certified production SSO.
No real emergency notification or responder dispatch is integrated. The session
uses a stateless encrypted cookie, which is suitable for small local exercises but
does not provide centralized session revocation or multi-device logout. The cookie
expires after at most 15 minutes and will require the operator to sign in again;
refresh tokens are deliberately not stored.

Never run this app with real operational data or public internet exposure without
security and privacy review, TLS termination, abuse controls, shared server-side
session storage with revocation, IdP-enforced MFA, browser and API penetration testing,
administrative lifecycle controls and audit-retention design.

## Configure on your Windows laptop

By default, all *protected* browser features are unavailable; the synthetic
Command Center still works. To enable legitimate login, arrange a trusted
identity provider (Keycloak, organizational OIDC, etc.) with an approved client
and signed JWT API access tokens.

Set values only in a local, **untracked** root `.env`:

```dotenv
APP_ORIGIN=http://localhost:3000
OIDC_ISSUER=https://idp.example.invalid/realms/aegis
OIDC_AUDIENCE=aegis-resource-server
OIDC_JWKS_URL=https://idp.example.invalid/realms/aegis/protocol/openid-connect/certs
OIDC_CLIENT_ID=aegis-local-web
# Only if the provider requires a confidential client:
OIDC_CLIENT_SECRET=
# Generate with: [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
BFF_SESSION_KEY_BASE64=<REPLACE_WITH_32_BYTES_BASE64>
```

**The example IdP is intentionally nonexistent.** The IdP must register the
exact redirect URI `http://localhost:3000/api/auth/callback` and the
Authorization Code flow with PKCE. For a deployed hostname, `APP_ORIGIN`
must be HTTPS and cookies use the `__Host-` prefix.

The provider MUST issue a signed JWT access token with `aud` equal to
`OIDC_AUDIENCE`, and claims `aegis_agency_id` (UUID) and `aegis_roles`
(an allowed array). Its ID token must carry an OIDC nonce. These claims
must be assigned only by the IdP administrator and cannot be self-managed
by the operator. Review `docs/OIDC_IDENTITY_AND_AUTHORIZATION.md`.

Rebuild after setting environment variables:

```powershell
git fetch origin
git switch feat/browser-oidc-approvals
docker compose down
docker compose up --build -d
docker compose ps
```

Visit `http://localhost:3000/approvals`. Without configuration, it should
clearly show the sign-in requirement, not generate a fake demo account.

## API and interface endpoints

| Route | Purpose | Protection |
|---|---|---|
| `GET /api/auth/login` | Begin OIDC PKCE | IdP config, state/nonce |
| `GET /api/auth/callback` | Verify provider response, create session | State/nonce, signed JWT |
| `GET /api/auth/session` | Return signed-in scope only | HttpOnly session; no token returned |
| `POST /api/auth/logout` | Clear BFF session | Same-origin |
| `GET /api/proposals` | Agency proposal list | Signed-in BFF and FastAPI role |
| `POST /api/proposals` | Create exercise draft | Operator, same-origin, validated fields |
| `POST /api/proposals/{id}/transition` | Submit/review | Role, separation-of-duties, DB transaction |

## Checklist before merge or release

- [ ] GitHub API tests, frontend typecheck and build pass.
- [ ] Local browser smoke on Windows: no-IdP default-deny behavior.
- [ ] IdP integration test with two real distinct test users in the same agency.
- [ ] Confirm malicious/expired tokens, state swaps, replayed cookies and cross-agency
      requests are denied.
- [ ] Verify security headers, logging hygiene, same-origin enforcement, MFA and logout strategy.
- [ ] Replace stateless access-token session with revocable shared store before production.
- [ ] Test isolated network conditions, key rotation and login failure UX.
