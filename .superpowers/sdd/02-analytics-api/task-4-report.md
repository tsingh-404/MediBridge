# Phase 2 Analytics API â€” Task 4 handoff report

**Date:** 2026-10-05
**Base:** `df30941`
**Status:** Complete
**Deliverable commit:** `d4fca0f` (`Document analytics API handoff`)

## Deliverables

- Contract: `docs/research/analytics-api-contract.md`
- Safe aggregate responses from all seven routes: `docs/research/analytics-api-samples.json` (226,370 bytes; no database file or row-level identifiers)
- Full-store validation and live endpoint evidence below

The contract states that needs remain unvalidated and the API is synthetic-only. It prominently preserves the controller ruling: suppression is table-local and does not prevent differencing across separate requests. The threshold is not a real-data safety claim; cross-request release controls are a future real-data design requirement.

## Full synthetic store

Commands:

```powershell
.venv\Scripts\python.exe -m medibridge.analytics_demo.generate --output data/analytics_demo.sqlite --seed 20261005 --sessions 50000
.venv\Scripts\python.exe -m medibridge.analytics_demo.validate data/analytics_demo.sqlite
```

Generation returned 50,000 sessions, 35,000 actors, 200,000 messages, and 53,533 issue events. Validation returned `ok: true`, `errors: []`, with the expected 2025 Q1 respiratory and 2025 Q4 coverage-information artificial windows. The ignored artifact is 72,208,384 bytes with SHA-256 `9a6688bfbcbe4935eaa2075f98259070e7de013d9869abe04624ca3a20c9e419`. Unknown-topic sessions were 2,614 / 50,000 (5.228%); unclassified-topic events were 2,796 / 53,533 (5.223%).

## Local CLI request evidence

Started and stopped the standalone process with:

```powershell
.venv\Scripts\python.exe -m medibridge.analytics_demo --db data/analytics_demo.sqlite --port 8001
```

The service logged `Uvicorn running on http://127.0.0.1:8001`. `.superpowers/sdd/02-analytics-api/run_handoff.py` made an HTTP request to each route with `start_date=2025-01-01`, `end_date=2025-03-31`, `insurer_id=demo_insurer_a`, `region=Brisbane`; trend used `bucket=month`. Each response was HTTP 200 and was checked for `synthetic: true` and forbidden identifier/content keys before writing the aggregate sample file.

| Route | HTTP | Safe sample totals/state |
|---|---:|---|
| `/api/demo/meta` | 200 | Available filter range 2024-10-01 through 2026-09-30; metadata-only. |
| `/api/demo/overview` | 200 | 205 selected sessions; 215 question turns; topic and unknown-topic tables suppressed for this narrow cohort. |
| `/api/demo/topics` | 200 | 17 topic and rate cells; answer-outcome table has 17 cells and unknown-outcome table 6; these narrow-cohort tables are suppressed. |
| `/api/demo/trend` | 200 | 69 topic-period cells and 41 concern-period cells; suppressed at this filtered granularity. |
| `/api/demo/regions` | 200 | 2 visible region/location-basis session cells; 34 topic-rate cells, suppressed. |
| `/api/demo/coverage-friction` | 200 | 3 coverage-topic cells; question-turn, rate, outcome, and unknown-outcome tables suppressed at this granularity. |
| `/api/demo/quality` | 200 | Unknown-location share 0 / 205; unknown-outcome events 38; small unknown-topic and unclassified-event cells suppressed. |

The exact request payloads, including `filters_applied`, provenance, caveats, cell states, and table values, are in `analytics-api-samples.json`.

## Filtered-chart latency

Measured `/api/demo/topics` with `start_date=2025-01-01`, `end_date=2025-03-31`, `insurer_id=demo_insurer_a`, `region=Brisbane`, and `topic_code=respiratory_information` against the 50,000-session store. The handoff script made 3 warm-up requests followed by 30 timed requests using `time.perf_counter()` around local HTTP requests.

| Measure | Result |
|---|---:|
| Minimum | 201.53 ms |
| Median | 354.42 ms |
| p95 (nearest-rank) | 371.59 ms |
| Maximum | 425.78 ms |
| Target | < 1,000 ms p95 |

The measured p95 was below the target on this local Windows/Python 3.11.9 run. This is an observed local-demo bound, not a hosted performance guarantee.

## TDD fix during live validation

Repeated real HTTP requests exposed an intermittent SQLite thread-affinity error: FastAPI could create a per-request connection in one worker and execute or close it in another. This made repeated `/topics` requests intermittently return HTTP 500 before the fix.

- RED: `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py::test_api_database_connection_can_run_and_close_on_fastapi_worker_thread -q` â€” **1 failed in 0.41s** with `sqlite3.ProgrammingError: SQLite objects created in a thread can only be used in that same thread`.
- GREEN: same command after allowing each private per-request read-only connection to cross FastAPI worker threads â€” **1 passed in 0.20s**.
- Restarted the CLI and repeated all seven route requests plus the 30-query latency sample; all returned HTTP 200.

The connection remains URI read-only and `PRAGMA query_only`; each request still owns its own connection and does not share it with another request.

## API metadata boundary correction

The regenerated artifact's final UTC start timestamp falls on Brisbane local date 2026-10-01, one day later than the accepted filter contract's maximum date. `/meta` initially advertised that unfilterable date. The metadata now reports the intersection between actual local dates and accepted filter bounds.

- RED: `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py::test_meta_date_range_does_not_advertise_dates_rejected_by_filters -q` â€” **1 failed in 0.28s**, observed `2026-10-01` instead of the maximum accepted date.
- GREEN: same command after clamping metadata to filter bounds â€” **1 passed in 0.18s**.
- Repeated live requests after restarting the CLI; `/meta` now reports `2026-09-30` as the available end date.

## Final verification and scope

With the project venv activated as directed by `CLAUDE.md`:

```powershell
. .venv\Scripts\Activate.ps1
python -m pytest tests/ -v
```

Result: **126 passed, 1 skipped in 7.88s**.

Changed source and test files are limited to the analytics demo (`api.py` and its API tests). No student server routes, student application modules, or UI files changed. The generated SQLite database is ignored and separate from `data/medibridge.db`. Task 4 plan checkboxes were the only plan checkboxes updated.

## Self-review

- Contract formulas and response fields were checked against the current metrics and API implementation; the saved examples come from real CLI requests and contain only aggregate payloads.
- The narrow cohort intentionally demonstrates that small synthetic groups can be suppressed; the overview still shows safe selected-session and question-turn totals.
- The API makes no live-data safety or remote-access claim. Task 3's prominent cross-request differencing warning remains in the contract and sample file.
- No external stakeholder access or deployment was enabled.

## Final whole-branch review fix round

Addressed the two final review findings with test-first changes. Refreshed `docs/research/analytics-api-samples.json` from the live CLI after the response shape changed; the filtered `/regions` topic-rate table now contains 34 cells (the earlier live-request summary's 30-cell count is superseded).

### RED/GREEN evidence

- Zero-event rate cell: RED command `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py::test_region_rate_emits_zero_for_selected_category_with_no_matching_events -q` failed with `StopIteration` because no matching category cell was present (**1 failed in 0.29s**). GREEN after `_rate_cells` filled missing allowed category combinations from each non-empty denominator group: the test passed.
- Empty trend selection: RED command `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py::test_empty_trend_selection_returns_explicit_no_data_shape -q` failed because `no_data` was `False` (**1 failed in 0.25s**). GREEN after trend state was based on selected cohort denominator support and returned explicit 0/0/0 no-data fields and a no-matching-sessions caveat: the test passed.
- Combined GREEN command `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py::test_region_rate_emits_zero_for_selected_category_with_no_matching_events tests/test_analytics_demo_api.py::test_empty_trend_selection_returns_explicit_no_data_shape -q`: **2 passed in 0.21s**.

Zero rate cells retain the selected-session denominator and are distinct from no-data. Empty trend selections now have `data_state: no_data`, zero numerator, denominator, and value, and an explicit caveat; all-suppressed selections remain `data_state: suppressed` with null disclosed values.

### Final verification

- Focused API, metrics, and disclosure tests: `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py tests/test_analytics_demo_metrics.py tests/test_analytics_demo_disclosure.py -q` — **61 passed in 1.81s**.
- Full backend suite with the venv activated: `. .venv\Scripts\Activate.ps1; python -m pytest tests/ -v` — **128 passed, 1 skipped in 9.62s**.
- `graphify update .` completed; graph rebuilt with 1,017 nodes, 3,028 edges, and 93 communities.
- Live local CLI remained on `127.0.0.1:8001`; the safe aggregate sample was refreshed by the real seven-route handoff script. No student app route/UI files changed.

### Updated full-store filtered chart latency

Because filling missing rate categories increased the `/regions` result shape, reran the filtered endpoint against the 50,000-session store. `.superpowers\sdd\02-analytics-api\measure_regions_latency.py` used 3 warm-ups and 30 measured requests for `/api/demo/regions` with `start_date=2025-01-01`, `end_date=2025-03-31`, `insurer_id=demo_insurer_a`, and `region=Brisbane`:

| Measure | Result |
|---|---:|
| Minimum | 776.83 ms |
| Median | 1,089.42 ms |
| p95 (nearest-rank) | 1,133.34 ms |
| Maximum | 1,279.03 ms |
| Target | < 1,000 ms p95 |

The final filtered region-chart p95 misses the target. A direct cProfile sample took 0.303 seconds overall; SQLite `execute` calls consumed 0.297 seconds, of which `_rate_cells` consumed 0.280 seconds. This is a local synthetic-demo measurement and not a hosted performance guarantee. The earlier `/topics` p95 remains historical evidence only; the final `/regions` result is the relevant measurement after category completion.

The separate Minor date-format review comment remains deferred; no format-validation code was changed in this review pass.\n