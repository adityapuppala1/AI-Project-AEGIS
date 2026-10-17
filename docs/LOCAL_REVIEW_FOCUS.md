# Optional local-model review focus

This is a read-only selection preview in the existing incident Human Assessment
Readiness panel. **Get review focus** asks a local model to select one existing
finding and one illustrative playbook review step. The server supplies the
original text, evidence/source UUIDs and limitations. The model cannot create
facts, references, instructions, proposals, approvals, task acknowledgements or
warnings. Selection quality still needs human review; schema validation does
not establish useful prioritization or forecasting accuracy.

## Current local setup

The laptop already had Ollama 0.40.5 and `tinyllama:1.1b` installed (manifest
`2644915ede352ea7bdfaff0bfac0be74c719d5d5202acb63a6fb095b52f394a4`,
637,700,138 bytes as reported by the local inventory). No runtime/model download,
paid API, new Python/npm dependency or GPU requirement was introduced. Aliases
can change; this records the observed manifest, not a permanent supply-chain
attestation. Only the installed tinyllama model was live-tested here; phi3 is
allowlisted but not established as tested by that fact.

A local `ollama serve` process was started with `OLLAMA_HOST=127.0.0.1:11434`
and `OLLAMA_NO_CLOUD=1`. Docker Desktop API connectivity to this loopback
runtime through `host.docker.internal` was tested. The model call explicitly
uses CPU (`num_gpu=0`), four threads, context 2048 and at most 96 generated
tokens. Keep-alive is zero to release model memory after requests. An initial
request using default GPU settings timed out; the bounded CPU probe completed
in 1,835 ms. That probe alone is not full application acceptance; see handoff.

Base Compose leaves the feature disabled. With an already-running local
runtime and the installed model, activate only the API override:

```powershell
# Inspect branch/status first; existing volumes must remain intact.
docker compose -f compose.yaml -f compose.local-copilot.yaml config --quiet
docker compose -f compose.yaml -f compose.local-copilot.yaml up --no-deps -d api
```

Disable the optional model configuration without deleting data:

```powershell
docker compose up --no-deps -d api
```

The local runtime may also be stopped from its own serving terminal. Do not
terminate unrelated Ollama sessions. No IdP activation or certificate trust
change is involved; the owner's inactive-IdP decision still applies.

## Contract and resource boundaries

- API: `POST /v1/exercise/incidents/{id}/review-focus`, JSON `{}` only.
  It reuses the existing public synthetic demo-agency context reader; it is
  not a private/operational multi-agency copilot. Unknown cases stay 404.
- BFF: same-origin `POST /api/incidents/{id}/review-focus`; caller origin,
  UUID and empty-body checks happen before contacting the API. Callers cannot
  provide prompts, models, URLs, tools or action instructions.
- Response version: `aegis.exercise.review-focus.v1`, with
  `model_assisted_selection` or explicitly labelled `template_fallback`.
- Backend allowlists local targets and local model names. Cloud tags and
  arbitrary targets are rejected. HTTP proxies are disabled and redirects
  refused. The model sees only generated template facts/options/limitations;
  raw source text, credentials, signed identities and even reference UUIDs are
  omitted from its prompt. The server maps the returned selectors to checked
  original references.
- Model output must contain exactly a finding index (integer 0 or 1) and one
  of URB-01/03/04. Booleans, floats, new reference/action fields, malformed JSON,
  unexpected model identity and incomplete responses are rejected. The HTTP
  response is capped at 64 KiB and the selection text at 4096 characters.
- One in-flight model call per API process; a busy call falls back immediately
  rather than queuing another inference. Disabled, unsupported configuration,
  absent case evidence, invalid output or unavailable runtime also fall back.
- Transport timeout is 20 seconds; BFF/browser wait is bounded to 25 seconds.
  These are I/O/client limits, not a hard real-time inference watchdog. Cancel
  stops the browser wait and clears preview state; it does not guarantee that
  an already-running Ollama computation is killed. A durable worker/lease and
  stronger cancellation would be separate future work.

Ordinary readiness reads never trigger inference. The preview is only requested
by its button. Core evidence browsing and the deterministic brief remain
available when the model is disabled or fails. The preview is ephemeral and
not captured in proposal snapshots/audit; saved drafts retain their existing
deterministic assessment/brief. A future model-backed drafting workflow must
capture/revalidate its context and model version before human review.

## Verification limits

See [current handoff](LOCAL_DEMO_HANDOFF.md) for actual native unit, isolated BFF,
real Ollama/API/BFF/browser, database and HTTP results. Browser injections used
for busy/unsafe/cancel cases are test-only and do not enable deployed auth.
Model selection is not free-form grounded question answering, an autonomous
agent, real two-person acceptance, a validated forecast or a real action.

## Optional proposal capture

Public previews above remain read-only. The authenticated workbench now has a
separate opt-in creation flow that saves a new server-generated selection with
the draft, its fingerprint and creation audit. See [saved focus scope](SAVED_REVIEW_FOCUS.md)
and the handoff for current verification. It does not reuse client preview data.
