# Synthetic Department SLA Targets

New staged proposal receipts use `aegis.proposal.simulation.v3` and the policy
identifier `aegis.exercise.department-sla.v1`. The three fictional desks receive
15, 30 and 45 minute review targets. Each task records its target duration,
absolute due time and an awaiting/on-time/elapsed classification. The scripted
acknowledgement event captures the same classification and due time, and the
private proposal audit records them.

The targets are deterministic tabletop timing aids. They are not contractual or
operational SLAs, do not trigger escalation or notifications, and do not show
real department participation. Existing v2 staged receipts remain advanceable
without fabricated SLA fields. The legacy one-shot v1 receipt is unchanged.

Task acknowledgement is still recorded by an incident operator. Department-owned
identity requires a separately reviewed OIDC role and department-scope claim;
the UI must never accept a caller-supplied department as authority.

Laptop acceptance at `c245a66`: production build/start, 13 PostGIS tests,
HTTP/audit checksum, mobile v2/v3 task fixtures and 21 browser smoke checks
passed. Exact commands, prior native checks and the corrected fixture failure
are retained in [the handoff](LOCAL_DEMO_HANDOFF.md). Manual department/human
acceptance remains separate and the owner-deferred IdP remains inactive.
