# Unsaved exercise proposal text

The approval workbench retains up to ten incident/action rationale drafts in
page memory. Operators can switch cases/actions and use the workbench Refresh
button without applying one case's rationale to another case. Failed case-list
refreshes retain the intended target and text, while disabling creation until
that target appears in the newly loaded authorized case list.

Successful saves clear only that draft. Failed saves retain its text. No save
or retry happens automatically; a failed request is not confirmation that the
server committed nothing. Check the queue before repeating an uncertain save.
Independent submission, checker approval and server-side agency/role checks
remain required.

Identity/agency changes, loss of operator access and sign-out clear retained
rationales. Other workbench review/task notes are cleared on identity/agency
changes too. During session verification the private workbench is hidden. A
session failure offers an explicit retry; after verifying the same identity,
its page-memory draft can be restored. It is not displayed under another
identity. None of this creates a trusted browser authorization boundary.

No localStorage/sessionStorage, credentials or server auto-save is used. Leaving
or hard-reloading the page destroys this memory. Entries are bounded to ten
incident/action pairs and 2,000 characters each; oldest entries are evicted
when the limit is exceeded. This closes recovery during case/action switching
and workbench refresh, not durable recovery across browser restarts.

## Acceptance limits

Six isolated Node tests exercise target/scope isolation, anonymous refusal,
clearing after saves, and entry/text bounds. Browser-only synthetic session and
proposal responses exercise the form without an actual IdP or real proposal
write. These fixtures exist only in the test browser; deployed authentication
is unchanged. Actual two-human signed-in acceptance remains deferred while the
owner keeps the IdP inactive. See the [current handoff](LOCAL_DEMO_HANDOFF.md)
for exact source and executed results, and the [roadmap](AI_ASSISTANCE_ROADMAP.md)
for remaining AI, agent, forecast and responsiveness work.
