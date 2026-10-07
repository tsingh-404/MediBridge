# Phase 3 Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. Assign implementation to a Luna high subagent; check boxes as work completes. Before UI work, invoke the available frontend design skill and save the reviewed visual direction.

**Goal:** Build a polished, interactive private web dashboard that MediBridge presents only to participating insurers and health departments, using Queensland synthetic conversation insights.

**Architecture:** A standalone desktop-first React web interface consumes only the Phase 2 aggregate API. FastAPI serves it from the separate analytics demo app on loopback; it does not enter `ui/`, the student SPA, or Capacitor builds. A shared filter state drives all charts, with view-specific annotations and data-quality context.

**Tech Stack:** Current React/classic-script and esbuild pattern, CSS, FastAPI static serving, existing Node 22 build environment in `mobile/`; no PWA or native packaging. Choose a focused chart library only if it materially improves accessible interaction and document the dependency; otherwise use SVG/React components.

**Spec:** [programme roadmap](README.md), [questionnaire](../stakeholder-analytics-questionnaire.md), Phase 0 metric contract if approved, and Phase 2 API contract.

## Global constraints

- Every screen and export visibly says **Synthetic demo — not real student data**.
- The dashboard is for authorised stakeholder presentations only; do not design a public-facing entry point or publish its URL.
- Charts describe student **questions**, not diagnoses, claims, disease prevalence or confirmed outbreaks.
- No raw transcript, user/session ID, exact postcode or individual path is shown.
- Global filters: date range, insurer, broad Queensland region, topic, service and location basis. Unknown values are selectable and never silently dropped.
- Every metric shows its unit and denominator. Suppressed cells render as “insufficient group size,” not zero. Empty results explain why.
- Keyboard controls, visible focus, text alternatives to charts, sensible colour contrast and no colour-only status encoding are required.
- Local/presentation deployment only; any remote use requires a separate authentication plan.

## Review focus

- A filter change updates all linked views and URL/shareable state without inconsistent totals.
- Switching between insurers and health departments changes emphasis and narrative, not the underlying metric definition.
- A synthetic spike must read as “artificial demonstration pattern” near the chart.
- Dense labels, long topic names, narrow browser widths and all-suppressed responses remain usable.
- Sorting and drilldown never reveal a hidden small cell through another view or export.

## File structure

| File | Responsibility |
|---|---|
| `analytics_ui/index.html`, `analytics_ui/app.jsx` | Separate dashboard shell, audience switch and view routing. |
| `analytics_ui/api.js`, `analytics_ui/filters.js` | Aggregate endpoint client, typed filter state and URL serialization. |
| `analytics_ui/components/` | Shared KPI, chart, legend, table, empty/suppressed state and provenance components. |
| `analytics_ui/views/` | Overview, insurer needs, public-health and policy, service geography, and data quality. |
| `analytics_ui/styles.css` | Approved typography, spacing, colour, layout and responsive styles. |
| `mobile/scripts/build-analytics.mjs` | Separate esbuild transform for `analytics_ui` source to committed or ignored build assets per repo convention; no student asset drift. |
| `src/medibridge/analytics_demo/api.py` | Mount dashboard static assets after `/api/demo` routes; keep loopback service. |
| `tests/test_analytics_demo_dashboard.py` | Static serving and no-row-data integration checks. |
| `docs/research/dashboard-design.md` | Visual direction, annotated wireframe, chart decisions and accessibility review. |

## Dashboard information architecture

1. **Overview:** selected sessions, question turns, unknown share, top concern categories, monthly trend and a “what this means” panel.
2. **Insurer needs:** ranked coverage/waiting-period/cost concerns, trend by concern, insurer/tier filter, unresolved-answer share, service breakdown and a product-comparison question panel. Label it a comparison among synthetic app sessions, never market share, sales conversion or margin.
3. **Public-health and policy:** topic trends and baseline comparison, broad-region matrix, artificial scenario annotation, confidence/volume context, plus a policy-question panel linking information/access concerns to candidate decisions and evidence still needed. Require external validation before acting or claiming impact.
4. **Service geography:** service questions by broad Queensland region and location basis; use a bar or matrix rather than a precise map unless Phase 0 validates boundary definitions.
5. **Data quality:** capture period, synthetic generator/taxonomy version, sample size, unknown geography/topic, suppression counts, representativeness caveat and metric glossary.

Common interactions: multi-select filters, date brushing/period picker, sort ascending/descending, select chart element to apply a filter, clear-all, hover and keyboard tooltip, table alternative, and aggregate-only CSV/PNG export if straightforward. Export must inherit filters and caveats; omit it if no safe and testable implementation fits this phase.

## Tasks

### Task 1: Visual brief and prototype

- [x] Use the available frontend design skill to create two compact desktop layout options and one responsive narrow-width treatment; record the selected option and why it serves a presentation audience.
- [x] Sketch every view using the exact Phase 2 endpoint fields and a shared filter bar. Review typography, number formatting, chart selection and synthetic/caveat placement with the project owner before coding a polished layout.
- [x] Save the approved visual system and screen descriptions to `docs/research/dashboard-design.md`.

**Review check:** A reviewer can locate every question/metric in a view and read the synthetic label without scrolling or opening a tooltip.

### Task 2: Shell, API client and filters

**Interfaces:** `fetchAggregate(endpoint, filters) -> Promise<AggregateResponse>` and `parseFilters(URLSearchParams) -> DashboardFilters`; URL values are allowlisted against `/api/demo/meta`.

- [x] Write tests or a focused browser harness for filter serialization, reset, invalid URL values and failed API requests.
- [x] Build the separate entry point and design-system shell; add loading, error, empty and all-suppressed states before charts.
- [x] Wire global filters to API requests with stale-request protection, consistent date semantics and visible applied-filter chips.
- [x] Run the frontend build and tests; commit.

### Task 3: Shared visuals and insurer views

- [x] Build accessible KPI, ranked bar, time-series, matrix and sortable table components from **aggregate payloads only**; add text/table equivalents for non-visual reading.
- [x] Implement Overview and Insurer needs views. Verify that the session denominator does not change unexpectedly when chart categories overlap.
- [x] Test sorting, selection, keyboard activation and suppression on a small fixture and the full store; keep values directly visible with table alternatives instead of hover-only tooltips.

### Task 4: Health, geography and quality views

- [x] Implement Public-health and policy with baseline comparison, artificial-spike annotation and candidate policy actions with their missing evidence; label spikes as question trends needing review, not outbreaks.
- [x] Implement Service geography with location-basis callout and unknown geography; no implied home-location map.
- [x] Implement Data quality, glossary and provenance using API metadata, including current filter-specific unknown shares.
- [x] Verify all five views with sparse, empty and dense selections.

### Task 5: Guided validation and handoff

- [x] Run two scripted walkthroughs: an insurer reviewing coverage confusion, and a health-department analyst inspecting a respiratory question spike. Each must lead to a defensible statement and visible caveat.
- [x] Run build, backend tests, accessibility checks (keyboard-only flow, chart alternatives, responsive layout) and browser checks at desktop and narrow viewport. Record screenshots and exact commands/results.
- [x] Check the dashboard is served only by the separate loopback app and no student/mobile artifacts changed.
- [ ] Record participant feedback against questionnaire IDs and decide whether to refine the demo or open a separate live-data governance/capture specification. No participants were supplied; see the validation record for the outstanding feedback/governance gate.

**Implementation note:** Filter controls are single-select because the Phase 2 API rejects repeated query parameters per dimension, despite the earlier common-interaction sketch saying multi-select. Trend rendering asks for one selected topic/concern, broad region, and known location basis so the chart respects period/region/basis-specific rates and the contract's table-local complementary suppression. See [dashboard validation](../research/dashboard-validation.md).

## Acceptance and handoff

The demonstration must work from a fresh clone after project environment setup, Phase 1 generation and Phase 2/3 build commands. A presenter can answer broad stakeholder questions through linked views and filters while the audience can see sample size, scope, unknowns and synthetic status. Do not claim that a successful demo validates willingness to buy, disease detection performance or lawful commercial reuse of live chats.
