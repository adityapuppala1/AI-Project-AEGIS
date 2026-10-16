# AEGIS design-system feasibility — Magic UI + shadcn + operational UX

Last reviewed: 2026-10-16

## Executive decision

**Magic UI is feasible and useful selectively, not as the foundation for all controls.**

The project already uses Next.js 15, React 19, Tailwind CSS 3, next-themes,
Lucide, Recharts and MapLibre. Magic UI distributes copyable React/Tailwind
animated components through a shadcn-compatible registry. The upstream
Magic UI GitHub project advertises the **MIT license**; audit license
notices and each registry component's third-party dependencies before adopting
individual source files. The catalog is at
https://magicui.design/docs/components and its upstream project is at
https://github.com/magicuidesign/magicui.

**Repository-control rule:** AEGIS commits and pushes go ONLY to
`adityapuppala1/AI-Project-AEGIS`. During this milestone we **did not clone,
pull, fork, install or copy code from any other GitHub repository**. The original
`signal-surface` CSS uses a restrained pattern inspired by general animated
UI techniques; it is authored in AEGIS. The optional Magic UI registry
integration requires source/dependency/license review before adoption.

## Integration feasibility matrix

| Component/pattern | Fit | AEGIS location | Policy / benefit |
|---|---|---|---|
| Grid Pattern (static) | High | Welcome panel and Help Center | Low-cost texture; low contrast; no data occlusion |
| Animated Grid Pattern | Moderate | Optional onboarding illustration | Disable with reduced-motion; only off critical screens |
| Blur Fade | Moderate | Noncritical onboarding/help transitions | No delayed incident, alert or approval information |
| Magic Card | Moderate | Discovery tiles/help/marketing | Requires contrast and pointer/keyboard parity |
| Number Ticker | Low | Optional noncritical demo counters | Avoid moving risk counts and live incident numbers |
| Border Beam | Low | Noncritical integration diagrams | Animated outline may distract; never signal emergency status |
| Animated Beam | Low | Architecture explainer only | Decorative illustration, not evidence of working integration |
| Marquee | Avoid | None | Scrolling warnings are hard to read/access |
| Pulsating/Shimmer Button | Avoid | Critical workflow | Never make approval/dispatch buttons attention-seeking |
| Particles/Meteors/Globe | Avoid | Operational screens | GPU cost, animation noise, motion sensitivity |
| Three.js | Deferred | Optional tested flood/terrain 3D simulator | Lazy load with 2D fallback and GPU budget |

Official reference pages:
- https://magicui.design/docs/components/animated-grid-pattern
- https://magicui.design/docs/components/blur-fade
- https://magicui.design/docs/components/number-ticker
- https://magicui.design/docs/components/border-beam

## Preferred architecture

1. **Operational primitives:** typed/headless accessible controls, semantic HTML,
   shadcn-style composition, Tailwind tokens, keyboard accessibility.
2. **Data UI:** server-side filtering/sort/pagination, stale-data state,
   CSV export only after authorization and DLP policy, later virtualization
   for large result windows.
3. **Visualization:** Recharts for telemetry and verified trends; MapLibre/deck.gl
   for spatial evidence; tabular alternatives for every critical chart.
4. **Magic UI layer:** opt-in decorative presentation **only for low-stakes regions**
   after accessibility, performance and supply-chain checks.
5. **AI UI:** provenance, uncertainty, model/version and action boundaries are
   mandatory; no auto-playing or typewriter-effect emergency recommendations.

## Performance and accessibility acceptance

- Respect `prefers-reduced-motion` and pause optional animation out of view.
- Keyboard access for search, filtering, tabs, tables, dialogs and help.
- Target WCAG 2.2 AA, readable density and 200% zoom.
- Never convey incident severity by color or animation alone.
- Prefer CSS transforms/opacity and avoid layout-thrashing continuous motion.
- On a 16 GB Windows laptop, default to 2D map and light charts; 3D always optional.
- Measure frontend bundle impact and p75 LCP/INP/CLS before adding motion libraries.
- Ensure offline/failed tile API never blocks incident table or approvals.

## Phased adoption

P0 (this milestone): original unobtrusive help surface, interactive navigation
search, incident data-grid and documentation without new runtime dependencies.

P1: evaluate shadcn-compatible Dialog/Command/Tabs/Tooltip/Popover/DataTable
components with accessible primitives, after package compatibility checks.

P2: if required by usability testing, review and install only selected Magic UI
components through audited registry. Do not introduce a broad set at once.

P3: performance-tested optional simulation visualization with 3D fallback.
