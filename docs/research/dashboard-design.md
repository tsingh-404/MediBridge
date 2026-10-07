# Phase 3 Dashboard Design Checkpoint

**Status:** Option B was selected by the project owner for Phase 3 implementation. The Phase 0 requirements and metric contract remain provisional and unvalidated with stakeholders.

## Superdesign options

Both drafts are compact desktop layouts for a new, separate presentation dashboard. They use the Phase 2 aggregate API contract and a shared filter bar. The second is a branch of the first; both remain available for review.

| Option | Direction | Draft and preview | Layout | Best fit |
|---|---|---|---|---|
| A — Overview-first | Data-first overview with all five views in top navigation; shared filters above the content; four metric cards, monthly trend, ranked topics, interpretation prompt, provenance/caveat. | Draft `e29bdb7d-b094-4765-a846-e47d6ca84aad` · [Preview](https://p.superdesign.dev/draft/e29bdb7d-b094-4765-a846-e47d6ca84aad) | [Project canvas](https://superdesign.dev/teams/7a14b560-141a-44d1-9693-d109220a847a/projects/53ae0df2-1ede-4e7a-91e0-4fb659a3b698) | Analyst scanning and moving quickly between views. |
| B — Question-to-decision | A narrative rail and review question lead into the dominant monthly rate chart; aligned metric strip; ranked topics and a visible unknown/suppression block. Same shared controls and view set. | Draft `b3f95053-8f3f-46b4-9a11-5539143b30a8` · [Preview](https://p.superdesign.dev/draft/b3f95053-8f3f-46b4-9a11-5539143b30a8) | [Project canvas](https://superdesign.dev/teams/7a14b560-141a-44d1-9693-d109220a847a/projects/53ae0df2-1ede-4e7a-91e0-4fb659a3b698) | Guided insurer and health-department presentations. |

**Selected direction: Option B — Question-to-decision.** The owner directed continuation with this layout. The narrative rail gives a presenter a clear question to frame, while the adjacent chart, denominator context and evidence caveat keep the discussion tied to what the synthetic data can show. Option A remains the comparison alternative when the audience needs a compact analyst overview.

A separate root node (`9c4af167-4e4c-4084-8153-e375453645d2`) appeared in the project listing but is excluded from this comparison as unrelated. The authenticated CLI returned “API key does not have access to this draft” when asked to fetch it, including after the CLI login retry; its content was not reviewed. The two options above are the root draft and its returned branch.

## Shared dashboard structure

- A separate analytics presentation shell, not the student SPA and not part of Capacitor assets. Keep any service/dashboard deployment loopback-only at `127.0.0.1`; do not create a public entry point.
- Persistent header: MediBridge Analytics, audience emphasis switch (Insurer / Public health), local presentation context and the exact disclosure **Synthetic demo: not real student data**. The disclosure must be visible without scrolling on every view and export.
- One shared filter bar drives every view: `start_date`, `end_date`, `insurer_id`, `tier_id`, `region`, `location_basis`, `topic_code`, `service_code`, `concern_code`. Values come from `/api/demo/meta` allowlists; keep `unknown` selectable. Include applied-filter context and clear-all. The plan calls for URL-serialized filter state so navigation and shared views stay consistent.
- Unknown choices are exact allowlist tokens, not a generic option sent for every dimension: for example `topic_code=unknown_unclassified`, `region=unknown`, and `location_basis=unknown`. Insurer, tier, service, and concern selectors use only their respective `/meta` allowlist tokens; do not invent an `unknown` value if that dimension does not advertise one.
- Filters use inclusive Brisbane calendar dates, bounded by the meta date range. Date, insurer, tier, region and location basis define the selected-session cohort. Topic, service and concern filters select issue-event series/numerators and must not silently shrink a topic-rate session denominator. Honor each response/table `filters_applied` value.
- Use the same metric definitions for both audiences. Audience choice changes explanatory emphasis only; it does not change the measure.
- No raw transcript or message text, user/session identifiers, row-level records, or individual paths are shown or exported. UI drilldown stays within safe aggregate cells; exports, if implemented, contain aggregate results only with the same filters and caveats.

## Endpoint and field mapping

Each API envelope carries `endpoint`, `synthetic`, `metric`, `unit`, `numerator`, `denominator`, `value`, `suppressed`, `no_data`, `data_state`, `cells`, `tables`, `filters_applied`, `provenance` and `caveat`. Cells carry `dimensions`, nullable `numerator`, `denominator`, `value`, `distinct_sessions`, `suppressed` and nullable `reason_code`; trend cells also carry current/baseline fields. Render table-level fields in preference to assuming the envelope's primary table describes every chart.

| View | Endpoint tables and fields | Presentation |
|---|---|---|
| Overview | `GET /api/demo/overview`: `selected_sessions`, `question_turns`, `topic_sessions`, `unknown_topic_share`. `GET /api/demo/trend`: `topic_code_trend`, optionally `concern_code_trend`. | KPI cards for sessions and tagged question turns; ranked topic sessions/rates; monthly topic rate. Show counts and rates distinctly, with the selected-session denominator. If comparing prior year, expose each period's numerator/denominator/rate and `rate_difference_per_1000`. |
| Insurer needs | `GET /api/demo/coverage-friction`: `topic_sessions`, `question_turns`, `topic_rates`, `answer_outcome_share`, `unknown_outcome_events`. `GET /api/demo/topics`: corresponding topic/outcome tables for broader topic and service breakdowns. | Horizontal bars for coverage-exclusion, waiting-period and cost-question sessions/rates; service-by-topic outcome table; show eligible event numerator/denominator and unknown outcomes separately. Describe outcomes as scripted response-template results, not comprehension, claims or actual coverage failure. Any insurer/tier comparison uses each label's own session denominator and says “synthetic scenario comparison,” never market share or performance. |
| Public-health and policy | `GET /api/demo/trend`: `topic_code_trend`, `concern_code_trend`; `GET /api/demo/topics`: `topic_sessions`, `topic_rates`; `GET /api/demo/regions`: `topic_rates`. | Monthly line chart or small multiples for selected question topics/rates, with current and same-month-prior-year counts, denominators and rates. Trend rates divide topic sessions by sessions in that selected period/region/location-basis group; rows with unknown region or location basis are excluded from these trend rates. Same-month-prior-year baseline fields apply only to `bucket=month`; weekly buckets have no baseline values. Mark injected spikes as **Artificial demonstration pattern** at the plotted point. Pair a regional pattern with a human-review prompt and a list of external evidence still needed. No confidence interval, alert, forecast or causal interpretation. |
| Service geography | `GET /api/demo/regions`: `sessions_by_region_and_basis`, `topic_rates`. Dimensions include `region` and `location_basis` (`stated_demo_region`, `service_search_area`, `unknown`). | Grouped bars or a region-by-location-basis matrix; keep stated region and service-search area separate. A service-search area is not residence. Unknown geography stays visible in counts/quality; region-specific rates exclude unknown region/basis per contract. No map, exact postcode or individual path. |
| Data quality | `GET /api/demo/quality`: `unknown_topic_share`, `unknown_location_share`, `unclassified_topic_events`, `unknown_outcome_events`; `GET /api/demo/meta`: `available_date_range`, `allowlists`, `suppression.min_sessions`, `suppression.scope`, `real_data_safety_claim`. All responses provide provenance and caveats. | Show unknown-topic sessions/share and unknown-location sessions/share with their session denominators; unknown event counts with supporting-session suppression; generator, metric and taxonomy versions; scenario codes; selected source span; table/cell states. Present suppression as prototype behavior only, and repeat that suppression is table-local and does not prevent differencing across separate requests. |

## Sketches for all five views

1. **Overview:** Shared shell/filter bar; four compact measures; monthly topic-rate trend; ranked topic bars; “What this means / question to review” prompt; provenance footer.
2. **Insurer needs:** Same filters and top disclosure; coverage concern ranking; unresolved scripted outcome by topic/service with eligible event counts and unknown-outcome row; a cautious comparison panel using distinct synthetic insurer/tier labels and separate denominators.
3. **Public-health and policy:** Same filters; topic/concern time-series with current and prior-year counts/rates; artificial-scenario annotation at the chart; broad-region/basis comparison; “review with external evidence” panel.
4. **Service geography:** Same filters; paired region summaries for stated demo region vs service-search area; topic/service bars or matrix; explicit unknown-location segment and searched-area-not-residence callout.
5. **Data quality:** Same filters; capture/source span and version labels; unknown-topic and unknown-location shares; unknown event measures; suppressed/empty-state counts derived only from returned safe aggregate cells; caveat and metric glossary.

All sketches are proposed view structures. The two Superdesign drafts depict the Overview landing screen and view navigation; they do not render five separate canvases/pages. Both drafts visibly say `demo-topic-taxonomy-v1`; that label conflicts with the Phase 2 API contract. Treat the draft label as placeholder copy only. Implementation and displayed provenance must use the API-authoritative `issue-taxonomy-v1` value returned by the aggregate service.

## Narrow-width treatment

The generated drafts target a desktop viewport. Their prompts include the same narrow-width direction, but there is no separate narrow-width screenshot or canvas draft. For the implementation checkpoint, use this responsive sketch:

- Keep the synthetic disclosure first and visible at the top; allow it to wrap without truncation.
- Collapse the shared filter controls behind a labelled “Filters” button/section; preserve all nine allowlisted values and explicit Unknown choices. Keep clear-all and applied-filter count discoverable.
- Keep the five views in a compact labelled menu/tab control, with the active view obvious to keyboard and screen-reader users.
- Stack metric cards and charts in reading order; use full-width line charts with sparse date ticks and wrap long topic labels.
- Tables may scroll horizontally only inside a labelled region; provide a visible hint and retain a text summary. Do not make the page itself scroll sideways.
- Keep source span, denominator, suppression and caveats adjacent to the affected metric; never hide them in hover-only tooltips.

## Visual and number system

- Typography from existing MediBridge tokens: Cabinet Grotesk for display headings and General Sans for body, controls and values. Use proportional figures generally; tabular numerals are limited to table columns and chart-axis ticks. The canvas draft currently references external font delivery; implementation should use the repository’s self-hosted font assets/build conventions and must not add a runtime CDN dependency.
- Warm off-white background (`#F5F6F0`), white surfaces, dark green-black ink (`#131714`), muted green-gray text, blue accent (`#0074a0`), restrained amber highlight, and neutral borders. Use color redundantly with text, shape or pattern. No medical stock imagery or chart gradients.
- Counts use locale thousands separators and whole values. Percentages and rates use at most one decimal place. Label rates as “sessions per 1,000 selected sessions”; show numerator and denominator alongside the rate. For event outcome shares, denominator is eligible resolved-or-unresolved events; show unknown outcome events separately. Use Brisbane month labels for monthly buckets.
- No statistical confidence intervals for synthetic scenarios. Do not infer financial values from questions.

## Chart and interaction choices

- Line chart for monthly topic/concern rates per 1,000, with separate actual synthetic current and baseline series; no smoothed projection. Show baseline unavailable when the endpoint does not return one.
- Require one selected allowlisted topic or concern, one broad region and one known location basis before plotting its trend. The Phase 2 trend table groups rates by each period/region/location-basis cohort, excludes unknown region/basis, and applies conservative table-local complementary suppression across returned cells; unselected multi-category tables can therefore be fully hidden. Same-month prior-year comparison is shown only for monthly cells when the API returns it; weekly buckets have no baseline.
- Horizontal bars for ranked categories with direct labels, values and numerator/denominator. Category sessions may overlap across topics; do not present them as parts of a 100% whole.
- Matrix/grouped bars for broad fictional regions by `location_basis`; no geographic map.
- Tables/text summaries adjacent to charts, not only in hover or focus tooltips. Chart selection and sorting are keyboard-operable and never expose hidden cells by recomputing a different aggregate.

## Accessibility and response states

- Use semantic landmarks/headings, labelled native controls, logical focus order, visible high-contrast focus, keyboard-operable navigation, chart selection and tooltips, and announce result updates.
- Every chart has a concise text alternative and a tabular alternative. Color is never the only encoding; include labels, line styles, symbols or status text.
- Keep units, numerator, denominator, filter window, source span and caveat visible with each result. Unknown categories remain visible.
- Render `suppressed: true` or null suppressed fields as **Insufficient group size** with the returned reason; never substitute zero. Keep complementary suppression intact.
- Distinguish a valid zero from `no_data`; show the API’s `data_state` and explain empty selections. Fully suppressed tables should say all values are hidden for group-size protection.
- Label all injected spike data as an artificial scenario. Repeat synthetic-only and unvalidated status on every screen and aggregate-only export. Do not imply prevalence, diagnoses, outbreaks, actual insurer share/performance, or population representativeness. Never expose raw transcript/message text, user/session IDs, row-level data, or individual paths in a view, tooltip, drilldown, or export.

## Owner direction and implementation contract

Option B anchors the implementation. The selected direction keeps the synthetic disclosure and caveats visible while giving a presenter a clear question-to-evidence narrative. The narrow-width treatment is an implementation sketch because the available design drafts are desktop-only; it will be checked at narrow width during Task 5. No participant review has occurred, so the proposed narrative and measures remain unvalidated with stakeholders.

Implementation must preserve the API's single-value-per-dimension query contract: selectors are single-select even though the earlier plan says multi-select. Unknown selections are available only when that exact dimension's `/meta` allowlist advertises a token. Trend rates are per selected period/region/location_basis group and exclude unknown region/basis; the baseline is available only for monthly buckets. Never expose raw transcript/message text, user/session identifiers, row-level data, or individual paths in the page, tooltip, drilldown, or export.

## Visual System v2 — UI foundation

The reusable foundation uses semantic CSS roles so light and dark surfaces keep the same meaning. Cabinet Grotesk is reserved for display headings; General Sans is used for interface text and values. Numeric values use proportional figures, with tabular numerals only in table cells/headings and chart-axis ticks. Panels use 12px radii, controls use 8px radii, borders are one-pixel hairlines, and chart marks use thin strokes. Reduced-motion preferences remain honored by disabling transitions and smooth scrolling.

| Role | Light | Dark | Use |
|---|---|---|---|
| Page | `#F5F6F0` | `#111915` | Main canvas |
| Surface | `#FFFFFF` | `#19231D` | Panels and controls |
| Raised/subtle surface | `#FFFFFF` / `#EDF0EC` | `#202C25` / `#28352D` | Emphasis and chart tracks |
| Ink / muted | `#131714` / `#54615A` | `#EDF2EE` / `#B8C4BC` | Text hierarchy |
| Accent | `#0074A0` | `#65BAD4` | Selection and primary chart series |
| Positive | `#245C44` | `#8FCCA7` | Secondary series and positive state |
| Highlight | `#F3C76A` | `#F3C76A` | Scenario and caution emphasis |
| Border / focus | `#D9DFD8` / `#005F84` | `#3B4A40` / `#9CDFF0` | Separation and keyboard focus |

The stylesheet supports OS preference through `prefers-color-scheme` and explicit `data-theme="light"` / `data-theme="dark"` overrides. Suppressed values share a hatched SVG treatment and the visible label **Insufficient group size**; the cell carries no substitute numeric value. The synthetic disclosure string is **Synthetic demo: not real student data**.

### Palette validation evidence

No `validate_palette.js` file is present in the repository (`rg --files -g validate_palette.js` returned no paths). I checked foreground/background pairs with the WCAG relative-luminance contrast ratio formula; the values below are the exact outputs of the Node contrast calculation on the CSS hex tokens. All listed text pairs exceed the 4.5:1 WCAG AA normal-text target:

| Scheme and pair | Contrast |
|---|---:|
| Light ink `#131714` on page `#F5F6F0` | 16.65:1 |
| Light muted `#54615A` on page `#F5F6F0` | 5.97:1 |
| Light accent `#0074A0` on surface `#FFFFFF` | 5.24:1 |
| Light accent strong `#005D7F` on surface `#FFFFFF` | 7.31:1 |
| White disclosure text on `#142B22` | 15.02:1 |
| Dark ink `#EDF2EE` on page `#111915` | 15.79:1 |
| Dark muted `#B8C4BC` on surface `#19231D` | 8.97:1 |
| Dark accent `#65BAD4` on surface `#19231D` | 7.33:1 |
| Dark focus `#9CDFF0` on page `#111915` | 12.12:1 |

This is a documented palette contrast check, not a full interface accessibility audit. Participant review and in-browser checks remain in the later validation task.
