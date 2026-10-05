# Phase 2 Analytics API — Task 3 report

**Date:** 2026-10-05
**Status:** Complete
**Implementation commit:** `46c608a` (`Add standalone synthetic analytics API`)

## TDD evidence

- Initial API/CLI test-first run: `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py -q` — **RED**, `19 errors, 1 failed`; the standalone API module and CLI did not exist yet.
- Weekly boundary regression: `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py::test_week_bucket_keeps_monday_in_its_own_week -q` — **RED**, `1 failed in 0.37s`; a session on Monday was assigned to the prior Monday. After changing the fixed SQLite expression to calculate the Monday start, the same command was **GREEN**, `1 passed in 0.23s`.
- Filter metadata regression: `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py::test_session_level_tables_do_not_echo_ignored_event_filters -q` — **RED**, `1 failed in 0.36s`; the session-level unknown-location table echoed event filters that did not affect its query. After restricting that table’s `filters_applied` to cohort fields, the same command was **GREEN**, `1 passed in 0.23s`.

## Implementation

- Added a standalone FastAPI application with `/api/demo/meta`, `/overview`, `/topics`, `/trend`, `/regions`, `/coverage-friction`, and `/quality`, plus `python -m medibridge.analytics_demo --db ... --port ...` using loopback host `127.0.0.1`.
- Opened SQLite only through read-only URIs and `PRAGMA query_only`; all query filters use bound parameters and SQL dimensions are fixed internal expressions. Unsupported filters, repeated filters, unsupported values, reversed/out-of-range dates, and unsupported time buckets return HTTP 422.
- Applied table-local primary and complementary suppression to result tables, with null values and explicit suppression reasons. Responses include synthetic provenance, scenario/version/source span, caveats, table and request filter metadata, and numerator/denominator/suppression fields.
- Included the required prominent caveat: suppression is table-local, does not prevent differencing across separate requests, and threshold 10 is not evidence of real-data safety. This remains a synthetic demo with no live-data safety claim. The cross-request differencing control is a deferred real-data release-design requirement for Task 4’s contract/handoff.
- Preserved unknown geography in regional session counts and excluded unknown geography from region-specific topic rates. `location_basis` remains a separate dimension. Trend output labels the artificial demonstration pattern explicitly.
- Added a Monday-start weekly dimension validator to the disclosure allowlist and tests for the Monday boundary.
- Updated only Task 3 plan checkboxes in `docs/plans/02-analytics-api.md`.

## Verification

- Focused: `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py tests/test_analytics_demo_api.py -q` — **43 passed in 1.61s**.
- Full repository: `.venv\Scripts\python.exe -m pytest -q` — **122 passed, 1 skipped in 7.53s**.
- `git diff --cached --check` — passed before commit.
- `graphify update .` was run as requested by `CLAUDE.md`; graph extraction completed and updated the local graph.

## Self-review and concerns

- The API test fixture recursively checks output keys and values for identifiers and raw prompt content, checks all seven endpoints, read-only behavior, date/filter validation, no-data and all-suppressed shapes, unknown geography, location basis, artificial trend labeling, and CLI loopback configuration.
- Suppression is deliberately table-local per the controller ruling. Separate interactive requests can still be differenced; the response caveat states this prominently and the API makes no real-data safety claim. Task 4 must preserve this warning in the written contract and keep cross-request differencing as a real-data release requirement.
- The existing unrelated untracked planning/research files were left untouched and excluded from the commit.

## Review fix round — 2026-10-05

Review findings fixed in this round:

- Trend output now nulls `baseline_available`, baseline numerator/denominator/rate, and rate difference whenever the current trend cell is suppressed, as well as when the baseline cell is suppressed. This prevents derived baseline fields from reconstructing a hidden current rate.
- A true zero-support cell is no longer primary-suppressed. It returns zero numerator/value and denominator 0 when the denominator is otherwise not applicable. Positive support below 10 remains primary-suppressed. Empty selection responses now carry `no_data: true`, `data_state: "no_data"`, denominator 0, and a clear no-matching-sessions caveat; the existing all-suppressed topic-table test continues to require nulls and suppression reasons.

Exact TDD evidence:

- RED: `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py::test_trend_hides_derived_baseline_when_current_cell_is_suppressed tests/test_analytics_demo_api.py::test_empty_selection_has_stable_zero_shape -q` — **2 failed in 0.47s**. The trend test observed `baseline_available` still true for a suppressed current cell; the empty-selection test observed `numerator` was null instead of zero.
- GREEN: the same command — **2 passed in 0.27s**.
- No-data distinction RED: `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py::test_zero_numerator_with_positive_denominator_is_not_no_data -q` — **1 failed in 0.30s**; a valid zero numerator with denominator 100 had been mislabeled no-data and denominator rewritten to 0.
- No-data distinction GREEN: `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py::test_trend_hides_derived_baseline_when_current_cell_is_suppressed tests/test_analytics_demo_api.py::test_empty_selection_has_stable_zero_shape tests/test_analytics_demo_api.py::test_zero_numerator_with_positive_denominator_is_not_no_data -q` — **3 passed in 0.27s**.
- Suppression-state RED: `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_api.py::test_all_suppressed_topic_table_has_nulls_and_explicit_flags -q` — **1 failed in 0.37s**; an all-suppressed result was incorrectly labeled `available`.
- Suppression-state GREEN: the same command — **1 passed in 0.20s**. Empty, available-zero, and all-suppressed states now have distinct metadata.
- Final focused API, metric, and disclosure tests: `.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py tests/test_analytics_demo_api.py tests/test_analytics_demo_disclosure.py -q` — **57 passed in 1.42s**.
- Final full repository suite: `.venv\Scripts\python.exe -m pytest -q` — **124 passed, 1 skipped in 7.65s**.
