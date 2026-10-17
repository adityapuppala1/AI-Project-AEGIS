# Safe assessment failure diagnostics

This extends the existing read-only incident readiness workflow. It helps an
operator distinguish which context stage failed while leaving the underlying
cause unknown unless separately diagnosed. It adds no model, new permissions,
service, database migration or automatic corrective action.

| API 503 code | Observed failure / operator guidance |
|---|---|
| `case_context_unavailable` | Case evidence could not be loaded; check local service availability and retry |
| `geographic_context_unavailable` | Geographic source context could not be loaded; check local service availability and retry |
| `context_validation_failed` | The combined context failed its existing checks; review timestamps/quality before retrying |

The adapter converts expected database/configuration read errors to a fixed
stage code. Existing ValueError validation failures become the third code.
A missing exercise case/geographic record remains 404. This does not identify
individual database hosts, diagnose the root cause, test external providers,
or imply real emergency readiness. Unexpected failures remain generic.

The FastAPI readiness endpoint returns only the fixed code, never connection
strings or raw exception text. The same context failure during proposal creation
returns 503 instead of a success or a governance decision. Existing transaction
rollback preserves the no-partial-proposal boundary; authentication/agency and
independent checker rules are unchanged.

The same-origin readiness route forwards only allowlisted codes. Unknown,
malformed and network failures use a generic unavailable message. The browser
maps codes to static guidance; it never displays upstream free-form error text.
A failed refresh clears the old conclusion and leaves Recheck available; recovery
reloads the original checked context. No automatic repair or retry loop is added.

Source agreement remains **not evaluated**: the current source registry lacks
matching measurement-window semantics and comparable sensor groups. Shared
units or geographic proximity cannot establish agreement or disagreement.
Further comparison work needs explicit support/window/quality metadata and
reviewed thresholds, followed by replay-based evaluation. No conflict detector
or forecast is claimed by this change.

See [current handoff](LOCAL_DEMO_HANDOFF.md) for application SHA and executed
Windows API, isolated BFF, browser and database checks. The isolated route tests
replace fetch only inside the test loader; deployed auth/fetch is unchanged.
