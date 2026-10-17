# Cited exercise review brief

This is the first deterministic fallback for the planned Response Copilot.
It summarizes the existing checked exercise context without a model service,
new endpoint, database migration, external request or automatic action.

## Operator and reviewer workflow

Open an incident and expand **Cited exercise review brief** in Human Assessment
Readiness. Two findings describe the checked case-evidence collection and nearby
source candidates, with original UUIDs under each finding. Counts distinguish
curated records from current-window curated source candidates. Curated exercise
fixtures are not field-verified observations; geographic proximity is not
independent corroboration.

The brief offers review options from illustrative playbook steps URB-01,
URB-03 and URB-04. Missing/uncurated context directs the operator to resolve gaps
before preparing a recommendation. Existing readiness limitations are retained
verbatim. The operator still writes the rationale and uses the authenticated
proposal workflow; the brief cannot submit, approve, acknowledge or dispatch.

Creating a new demo-agency proposal captures the brief inside the existing
`response_draft` JSON. The approval queue displays that captured version, rather
than fetching a replacement brief. Old proposals without the field keep their
existing display. Human acceptance of this signed-in screen remains deferred
because the owner keeps the local IdP inactive. The real DB signed-TEST-key
workflow verifies persistence, not actual human sign-in.

## Contract and safety

- Version: `aegis.exercise.review-brief.v1`.
- Generator: `deterministic_template_no_model`; explicitly synthetic and
  `operational_actions_enabled=false`.
- Findings cite only the evidence/source UUIDs already validated by readiness;
  an empty checked collection has no fabricated references.
- The template uses validated counts and quality/freshness categories. It does
  not interpret raw evidence summaries or source names as instructions, nor
  quote them as verified facts. Source prompt text cannot change the template.
- The shared UI refuses unexpected generator/version/action flags, malformed
  collections and invalid reference formats before rendering. It never renders
  raw HTML. These checks do not turn the frontend into an authorization boundary.
- The brief does not assess real flood likelihood, select response resources,
  establish source agreement or call a language model. No actual AI reasoning,
  forecast accuracy or operational effectiveness is claimed.

## Verification and next work

See [current handoff](LOCAL_DEMO_HANDOFF.md) for executed source SHAs, commands,
results and remaining gates. The [assistance roadmap](AI_ASSISTANCE_ROADMAP.md)
still requires model/provider evaluation, supported-answer and citation tests,
uncertainty/abstention policy and a bounded durable runner before claiming a
model-backed agent. Source agreement/dependency diagnostics, manual accessibility
and independent human acceptance remain separate pending work.
