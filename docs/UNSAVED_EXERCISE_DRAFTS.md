# Unsaved exercise proposal text

The approval workbench retains up to ten incident/action rationale drafts, with
2,000 characters per entry. Page memory is the default. Operators can opt in to
"Recover unsaved rationale after reload in this tab" on a trusted device.

Opt-in recovery stores only the scoped rationale entries, a format version and
an expiry in sessionStorage. It never stores credentials, tokens, model output,
checker notes or task acknowledgements. Recovery is valid for eight hours from
activation, without extending the deadline on typing. Expired/invalid copies
are removed when next checked; browser storage is not a timed secure-erasure
mechanism. Closing a tab normally clears sessionStorage, but browser restore
behavior varies. This is tab reload/navigation recovery, not a cross-device
backup or a guarantee across browser restarts.

Nothing is restored before the authenticated session supplies the same subject
and agency with incident-operator access. The new authorized case list must
contain the selected case before editing/saving. Other subjects/agencies,
anonymous sessions and loss of operator access discard recovery. Sign-out
attempts remove the tab copy. Disabling recovery removes the stored copy while
retaining current editable page memory. Browser-storage failures fall back to
page memory and turn off the recovery checkbox. This is not an authorization
boundary; server OIDC/agency/role and independent approval checks still apply.

Successful saves clear only that draft in both memory and the recovery copy.
Failed saves retain text. No save, retry, submission or approval happens
automatically. After an uncertain save, inspect the queue before retrying.
Changing cases/actions keeps their notes separate. Failed session verification
hides the private workbench; it does not display stored text under an unverified
identity. Review/task notes remain page-memory only.

## Acceptance

Node tests cover scope/target isolation, bounds, successful-save clearing,
opt-in restoration, expiry, disabling recovery, malformed storage and storage
failure. Browser-only signed-in fixtures test reload and identity changes;
these are not a real human IdP acceptance test. Exact executed commands and
results are in [the handoff](LOCAL_DEMO_HANDOFF.md). Recovery implementation
source: `cbb4d43`; do not infer acceptance from this document alone.
