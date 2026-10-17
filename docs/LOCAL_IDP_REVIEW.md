# Local identity provider — review package, not activated

Requested scope: prepare a local-only provider for owner review. No provider
has been started, no users provisioned, no certificate trusted and no app OIDC
configuration enabled by this package. Existing anonymous approvals stay locked.

## Concrete configuration

- `compose.local-idp.yaml` is an explicit opt-in override with profile `local-idp`.
- Official Keycloak and Caddy images are pinned by registry-verified manifest
  digests. Caddy's selected manifest identifies version 2.11.7. Digest selection
  establishes reproducibility, not a container vulnerability certification.
- Keycloak keeps its development database in a separate named volume. It never
  uses the AEGIS application database. Its HTTP port is private to Docker.
- Only HTTPS port **127.0.0.1:8443** is published. Issuer:
  `https://aegis-idp.localhost:8443/realms/aegis-exercise`.
- Caddy supplies a local CA and TLS. API and web retain HTTPS verification.
  Keycloak's internal HTTP hop is confined to the local Compose network.
- Public OIDC client `aegis-local-web` uses Authorization Code + PKCE S256;
  exact callback `http://localhost:3000/api/auth/callback`, no wildcard origins,
  password grant, implicit flow or service account.
- API audience `aegis-resource-server`; signed agency UUID is the existing
  fictional exercise agency. Only app-specific client roles populate
  `aegis_roles`; default realm roles must not enter that claim.
- `exercise-maker` has only `incident_operator`; `exercise-checker` has only
  `incident_checker`. Both must change their temporary password and enroll TOTP.
  The realm has registration disabled and administrator-controlled role mapping.
- No static/shared password is committed. The preparation helper generates
  separate high-entropy credentials and a BFF session key without printing them.

## Files and trust changes to review

`scripts/prepare-local-idp.ps1` defaults to a read-only instruction message.
With `-GenerateLocalSecrets` it creates `provider.env`, `app.env` and a private rendered `realm.json` under
`%LOCALAPPDATA%\AEGIS\local-idp`, **outside the XAMPP web root**. It refuses to
overwrite any existing configuration file. The private realm receives generated
password values explicitly; Compose never imports the source placeholder
template directly or relies on implicit environment substitution. These files must not be uploaded or pasted into
chat. Provider credentials go only to Keycloak; the BFF key goes only to web.

Activation also requires exporting the public root certificate from Caddy's
separate TLS volume and trusting it in the Windows **CurrentUser Root** store.
This changes which HTTPS certificates that Windows account trusts. Caddy's
private CA key stays in its named Docker volume; protect Docker access and never
export that private key. API uses a combined existing+local CA bundle; Node uses
an additional CA certificate. Neither disables TLS verification.

The owner must approve activation and the certificate-trust change before these
steps are executed by an agent. This boundary comes from the user's request to
**prepare a local-only setup for review**, not to enable it immediately.

## Activation sequence after review

Run from the verified continuation checkout in PowerShell. These are future
operator commands, not evidence of successful IdP integration.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-local-idp.ps1 -GenerateLocalSecrets
$idpPrivate = Join-Path $env:LOCALAPPDATA 'AEGIS\local-idp'
$env:AEGIS_LOCAL_IDP_PRIVATE_DIR = $idpPrivate
$composeArgs = @('--env-file', "$idpPrivate\app.env", '-f', 'compose.yaml', '-f', 'compose.local-idp.yaml', '--profile', 'local-idp')
docker compose @composeArgs config --quiet
docker compose @composeArgs up -d local-idp local-idp-tls
# Wait for Keycloak's realm import and Caddy's certificate creation to finish.
docker compose @composeArgs cp local-idp-tls:/data/caddy/pki/authorities/local/root.crt "$idpPrivate\root.crt"
```

Inspect the exported certificate and its thumbprint. Only after explicitly
approving the trust change:

```powershell
Import-Certificate -FilePath "$idpPrivate\root.crt" -CertStoreLocation Cert:\CurrentUser\Root
# Preserve the API's normal public roots, then append only this public local CA.
$apiRoots = docker compose exec -T api cat /etc/ssl/certs/ca-certificates.crt
[IO.File]::WriteAllText("$idpPrivate\api-ca-bundle.pem", (($apiRoots -join "`n") + "`n" + [IO.File]::ReadAllText("$idpPrivate\root.crt")), [Text.Encoding]::ASCII)
docker compose @composeArgs up -d api web
Invoke-RestMethod 'https://aegis-idp.localhost:8443/realms/aegis-exercise/.well-known/openid-configuration'
```

Use the generated local bootstrap administrator to inspect client, role and
required-action settings. Keep that administrator separate from app operators.
Provide each human only their own initial credential through a private channel;
never share the entire provider credential file. Two different people must use
separate browser profiles and TOTP enrollments for the actual approval rehearsal.

1. Maker signs in, verifies agency/role, creates an evidence-cited draft and submits.
2. Maker cannot approve their own proposal; operator-only role is also denied review.
3. A different human signs in as checker, inspects citations and uncertainty, and
   records a rationale when approving/rejecting. Checker cannot create proposals.
4. Maker may simulate department tasks only after approval. Retry creates one receipt.
5. Inspect private proposal audit: distinct subjects, one decision, captured
   evidence and scripted tasks. No real messages or public warnings are sent.
6. Verify signed-out access, invalid/expired token, state/nonce mismatch,
   cross-origin writes and cross-agency access fail closed. Never print tokens.

Local IdP accounts demonstrate local authentication, not agency accreditation.
Actual human/MFA/browser acceptance is still pending until these steps run.

## Reversal without deleting data

Restore the base Compose configuration for API/web to return to the default
locked gate; stop only the two local IdP services. Retain their named volumes.
Remove a trusted certificate only by the exact reviewed local CA thumbprint
from CurrentUser Root, after confirming no other approved local exercise uses it.
Do not remove arbitrary roots, delete application volumes, or reset databases.


## Validation status

Two static security-contract tests passed in both the Linux runner and the
actual Windows laptop (`python -m pytest -q tests/test_local_idp_review_config.py`
from services/api). The opt-in Compose configuration parsed on both machines
with an empty non-credential review fixture. On Windows, PowerShell parsed the
helper and its default read-only invocation completed successfully. Registry
manifest digests were read on the laptop. These checks do not establish a
running provider, successful realm import, login/MFA, or trusted TLS. Activation,
certificate trust and the actual two-human rehearsal remain pending owner review.
