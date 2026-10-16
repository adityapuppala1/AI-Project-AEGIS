# Persistent exercise workflow — security and enablement

The draft workflow implements transactional state transitions under PostgreSQL row locks and records reviewer decisions in `approvals` with unique-per-proposal constraints and audit events. Maker/checker decisions cannot bypass the pure-Python governance policy.

**Current security posture:** no authenticated user identity exists yet. For that reason the API routes are **disabled by default** and the Docker Compose configuration does **not** set `ENABLE_INSECURE_EXERCISE_WORKFLOW`.

## Controlled developer experimentation
Only in an isolated local environment, a developer can deliberately set the flag to `true` to inspect workflow behavior through Swagger. **Do not enable it on shared networks, cloud hosts, or production**. Actor-subject text provided by clients is not trusted.

## Database migration
New databases load `db/schema.sql` first, followed by `db/migrations/002_governance.sql`, and then synthetic seed data. Existing local volumes are migrated automatically at Compose startup using the one-shot `migrate` service before the `seed` service starts. If you need to apply the migration manually for diagnostics:

```powershell
Get-Content db/migrations/002_governance.sql | docker compose exec -T db psql -U aegis -d aegis -v ON_ERROR_STOP=1
```

The migration is additive and idempotent. Inspect data and back up any valuable local volume before applying it. The automatic migration is suitable for this isolated prototype, not a production migration strategy.

## Next security milestone
Implement OIDC authentication, server-issued identity context, agency/jurisdiction authorization, session expiry, CSRF protection for browser mutations, append-only audit controls, and transactional authorization checks before enabling any multi-user workflow. No route here sends public alerts or dispatches responders.
