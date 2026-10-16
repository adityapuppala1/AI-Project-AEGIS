# Exercise workflow — security and database migrations

The AEGIS maker-checker pipeline uses transactional PostgreSQL state transitions,
row-level write locking, an independent-checker database trigger, one-approval-per-proposal
uniqueness, and audit-event writes within each operation's transaction.

## Authenticated prototype boundary

- The API now requires an OIDC **RS256 signed access JWT** containing administrator-assigned
  `aegis_roles` and `aegis_agency_id` claims. **Client-supplied maker/checker identities are rejected.**
- `incident_operator` can create and submit proposals; `incident_checker` can review;
  `incident_auditor` can list agency proposals.
- Database reads and writes must also match the incident's agency to the signed agency UUID.
- The workflow fails closed with HTTP 503 if any OIDC configuration is missing; existing
  `ENABLE_INSECURE_EXERCISE_WORKFLOW` flags are obsolete and have no effect.
- This is still **exercise-only**. A recorded approval never results in public alert
  distribution or responder dispatch.

Full IdP integration details: [OIDC Identity and Authorization](OIDC_IDENTITY_AND_AUTHORIZATION.md).

## Migrations

For new development volumes, Compose creates tables then applies
`002_governance.sql` and `003_identity_scopes.sql` during PostgreSQL initialization.
For existing local volumes, the one-shot `migrate` service applies both migration files
idempotently before `seed`, then the API starts. Normal startup:

```powershell
docker compose up --build -d
docker compose ps
```

To inspect locally:

```powershell
docker compose logs --tail=80 migrate db
docker compose exec db psql -U aegis -d aegis -c "SELECT count(*) FROM action_proposals;"
```

Do **not** run `docker compose down -v` for routine upgrades; it destroys local
PostgreSQL data. Back up valuable volumes before migrations.

## Remaining production requirements

Identity provider onboarding and MFA policy, secure browser session (OIDC
Authorization Code + PKCE), CSRF protection, token revocation/session expiry,
access policy administration, PostgreSQL row-level security, append-only audit
export, operator accountability and penetration testing must be reviewed
before any deployment with real users or operational data.
