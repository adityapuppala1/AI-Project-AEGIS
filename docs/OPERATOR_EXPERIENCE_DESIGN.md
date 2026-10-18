# Operator experience and bounded AI design

Research and implementation direction, 17 October 2026. Preserve the existing
Next.js/FastAPI/PostGIS workflow and the owner's inactive IdP decision.

## Design decisions

The Command Center should move from overview to selected case to cited review
focus, then the existing evidence and approval workspaces. Add a clear mission
header, restrained depth and a visible human-led sequence. Move detailed source
widgets below the spatial/queue workspace. Do not invent completion states,
agent activity, forecasts or operational readiness to make the screen lively.

Reuse the existing local review-focus component and validated endpoint on the
selected case. Model use stays explicit, bounded and cancellable, with cited
items and a labelled deterministic fallback. Changing cases unmounts the old
preview and cancels its request. No background polling/inference loop, additional
model, hosted provider or autonomous proposal/action is introduced.

Use existing MapLibre for optional pitched 3D locator columns. Equal dimensions
are schematic symbols, never building geometry, flood extent, exposure or risk
magnitude. Start in 2D; provide a return control and retain HTML markers/queue.
Reduced-motion preference removes camera transition. Keep tile failure/retry
and WebGL fallback; core case/approval work must remain usable without the map.
No Three.js dependency is needed for this slice. Licensed/verified building or
terrain layers are a later data decision, not fabricated from point positions.

## Research used

- [MapLibre native 3D extrusion example](https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/): native polygon extrusion supports the optional symbolic layer in the renderer already installed.
- [W3C reduced motion guidance](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html): respect user motion preferences; avoid perpetual ornamental movement in the decision flow.
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents): prefer simple composable workflows, observable boundaries and evaluation before expanding autonomous behavior.

These sources inform engineering choices, not evidence of emergency efficacy.
The available plugin-management skill was consulted. Existing research and
coding tools cover this work; no additional plugin was installed or required.

## Implementation and acceptance

Initial slice: mission header, case-linked existing AI focus, optional 3D
locator view, preserved 2D/error paths. Pending laptop typecheck/build/browser
acceptance until the handoff records actual runs. Verify mobile overflow,
keyboard control, reduced motion, marker/queue selection, stale preview
cancellation, fallback and anonymous approval refusal. No model metrics change.

## Continue the original backlog

1. Department scope/inbox/reassignment from verified claims across API and BFF;
   retain independent approval, agency isolation and legacy receipts.
2. Durable unsaved text recovery with identity isolation and bounded retention.
3. Grounded free-form drafting/Q&A with an adversarial usefulness evaluation;
   reject unsupported citations and preserve ordinary drafting during outages.
4. Extend the existing bounded durable runner only with explicit budgets,
   cancellation, retry-safe state and an approval stop. Recovery suggestions
   may diagnose failures; they must not change trust, policy or runtime on their own.
5. Measure operator task completion, keyboard/mobile accessibility and latency.
   Human two-person acceptance remains owner-deferred. Real prediction requires
   authorized datasets and independent domain validation.

This design work complements those tasks; it does not close them or claim the
application is fully autonomous or self-aware.

## Monsoon atlas visual system — 18 October 2026

Superseded the same day by the operations graphite system after owner review.

The application now uses a purpose-built emergency coordination palette instead
of the earlier generic slate/teal dashboard treatment. Light mode uses warm
mineral canvas and paper surfaces with indigo for decisions. Dark mode uses
ink/plum surfaces with saffron for active controls. Coral remains a warning
signal, while established amber/emerald/red status semantics remain unchanged.

Depth comes from restrained layered gradients, a distinct command rail,
directional active-navigation treatment and low-spread panel shadows. Charts,
map symbols, popovers, selection, focus and primary controls consume the same
semantic tokens. There is no new animation or 3D dependency, and the existing
reduced-motion contract remains in force. A static theme contract checks token
completeness plus WCAG AA contrast for body copy, muted copy and primary
controls in both themes. Browser acceptance must still confirm both themes at
mobile and desktop widths before this visual slice is marked laptop-verified.

## Operations graphite redesign — 18 October 2026

Owner review rejected the warm monsoon-atlas direction. The replacement follows
the common structure in the supplied command-center references: cool white or
near-black foundations, electric blue decision controls, a single cyan signal
accent, compact modular cards, clear drill-down paths and dense scan-first
hierarchy. It removes decorative warm gradients and reduces corner radius,
shadow spread and hero height. The command workflow is now a compact three-stage
deck above smaller metrics; the narrower rail and tighter page header return
more space to maps, queues and operational data.

The redesign borrows layout principles rather than copying artwork or product
branding. Existing data contracts, human approval boundaries, status colors,
keyboard behavior and reduced-motion rules remain unchanged. No additional UI
dependency is required.

### Information architecture and responsive composition

The redesign extends beyond color tokens. Primary navigation is grouped by
operator intent—Overview, Observe, Coordinate and Govern—and child incident
routes keep their parent navigation state. The command center exposes four
data-driven quick actions next to the live overview, replacing the isolated
AgencySync promotional strip. Metrics use a compact two-column mobile scan row
and four-column desktop row.

The exercise walkthrough keeps the same ordered scenario data and safety
language, but its six environment facts now form a two-column mobile snapshot.
The eleven-stage selector becomes a horizontal mobile rail while retaining the
desktop navigation column, so the current task appears before a long list of
future stages. Browser acceptance asserts these structures in addition to
theme, overflow, interaction and accessibility checks.
