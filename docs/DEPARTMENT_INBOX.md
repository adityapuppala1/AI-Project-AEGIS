# Signed department rehearsal inbox

Department operators use `/department-tasks` with a trusted RS256 OIDC access token containing `aegis_roles: ["department_operator"]`, the existing agency UUID, and `aegis_department_id` equal to `control_room`, `infrastructure`, or `communications`. The encrypted BFF session preserves this verified scope. No browser department selector or production authentication override exists.

The inbox includes only same-agency, approved, staged synthetic v2/v3 tasks for the signed department. Full proposal content and other department tasks are excluded. A department operator may acknowledge and then close their task with an explicit rationale; they cannot create, submit or approve proposals. Existing incident operators retain coordinator rehearsal authority. Both paths use the existing row lock, approval gate, retry behavior and atomic audit. Audit distinguishes department authority from coordinator authority.

Ownership is fixed to the task ID. Reassignment, cross-department delegation, notifications and real dispatch are not implemented. The identity provider remains inactive by user choice; fixture tests do not establish real human sign-in or operator acceptance.

Implementation awaiting Windows API, proxy, build, retained PostGIS and browser verification. See LOCAL_DEMO_HANDOFF.md for executed evidence.
