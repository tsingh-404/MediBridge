# Phase 2 Task 1 — Metric core report

**Status:** Complete  
**Branch:** `phase2-analytics-api`  
**Implementation commit:** `89dcf64` (`Add synthetic analytics metric core`)

## Delivered

- Added `AnalyticsFilter`, `AggregateCell`, `MetricResult`, and `read_metrics` in `src/medibridge/analytics_demo/metrics.py`.
- Added a small SQLite golden fixture and assertions for repeated issue events, a multi-topic session, unclassified and no-topic sessions, insurer/region splits, distinct question turns, topic session counts, per-1,000 rates, Brisbane date boundaries, and metric provenance.
- Marked Task 1 checkboxes only in `docs/plans/02-analytics-api.md`.
- Queries return aggregate cells without actor, session, message, or event identifiers. Filter values are bound parameters; dimensions and metric/group combinations are allowlisted. Insurer and tier filters must match values present in the synthetic store.
- Date bounds use Brisbane midnight converted to UTC, with an exclusive next-midnight upper bound. Topic rates use all selected sessions as their denominator, including unknown-topic and no-topic sessions. Unknown-topic share counts sessions without any classified topic.
- Results include `synthetic: true`, metric/generator/taxonomy versions, selected scenario codes, source date span, applied filters, and a metric-specific caveat.

## TDD evidence

Commands used the project venv as required.

**RED — absent metric module:**

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py -q
6 failed in 0.29s
```

The six tests failed at their runtime import of the not-yet-created `medibridge.analytics_demo.metrics` module. After the first implementation, the grouped insurer/region assertion also failed (`5 passed, 1 failed`), exposing that the first query version only returned the first requested dimension. The query was corrected to group on both allowlisted dimensions.

**RED — metric definition version missing:**

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py::test_result_provenance_versions_the_metric_definition -q
1 failed in 0.14s
KeyError: 'metric_version'
```

Added `metric_version` to result provenance.

**RED — insurer value was not validated against store metadata:**

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py::test_store_value_filters_must_be_present_in_the_synthetic_allowlist -q
1 failed in 0.14s
Failed: DID NOT RAISE <class 'ValueError'>
```

Added store-backed allowlist validation for insurer and tier values.

**GREEN — focused tests:**

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py -q
........                                                                 [100%]
8 passed in 0.24s
```

**GREEN — full repository suite:**

```text
.venv\Scripts\python.exe -m pytest -q
........................................................................ [ 94%]
...s                                                                     [100%]
75 passed, 1 skipped in 5.63s
```

These focused and full-suite runs were repeated after commit `89dcf64`; both exited 0 with the output above.

## Review and handoff

The implementation and tests are limited to the Phase 2 analytics demo module and its test file; the Phase 2 plan was updated as requested. No student routes/UI or `data/medibridge.db` were changed. The metric/group allowlist currently covers Task 1's core session, topic, question-turn, rate, and unknown-share cases. Trend/month and answer-outcome metrics remain for later Phase 2 tasks.

No live-data or validated stakeholder-needs claims are made. The contract remains a synthetic demonstration with unvalidated requirements. The next task can use `AggregateCell` and `MetricResult`; suppression remains to be implemented separately.

## Review fix round — 5 October 2026

**Review disposition:** The date-bound and filter-echo findings were defects and are fixed in this round. The empty-cohort finding was adjudicated as not applicable: the ungrouped query uses SQLite `COUNT` without `GROUP BY`, which always returns one aggregate row even for an empty input.

**Fix commit:** `03e9804` (`Fix analytics metric filter validation`).

### Empty cohort verification

Added `test_empty_session_cohort_returns_a_zero_aggregate`. Before any production edit in this round, it passed against an empty filtered cohort:

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py::test_empty_session_cohort_returns_a_zero_aggregate -q
1 passed in 0.07s
```

The database behavior was independently verified with:

```text
.venv\Scripts\python.exe -c "import sqlite3; conn = sqlite3.connect(':memory:'); print(conn.execute('SELECT COUNT(DISTINCT session_id) FROM (SELECT 1 AS session_id WHERE 0)').fetchall())"
[(0,)]
```

No production change was made for this finding, and it is not reported as a RED/GREEN fix.

### RED — date ranges beyond either edge

Added parameterized tests for a `start_date` after `STORE_END` and an `end_date` before `STORE_START`:

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py::test_date_filter_bounds_reject_ranges_beyond_either_end -q
FF                                                                       [100%]
2 failed in 0.15s
Failed: DID NOT RAISE <class 'ValueError'>
```

The filter now rejects starts after the store end and ends before the store start, in addition to the existing opposite-edge checks.

### RED — event filters on unknown-topic share

Added cases for topic, service, and concern filters:

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py::test_unknown_topic_share_rejects_event_series_filters -q
FFF                                                                      [100%]
3 failed in 0.24s
Failed: DID NOT RAISE <class 'ValueError'>
```

`unknown_topic_share` now rejects those event-series filters with a clear `ValueError`; its caveat also states that it uses session-level filters only. This keeps the echoed filter contract truthful.

### GREEN — review regressions

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py::test_empty_session_cohort_returns_a_zero_aggregate tests/test_analytics_demo_metrics.py::test_date_filter_bounds_reject_ranges_beyond_either_end tests/test_analytics_demo_metrics.py::test_unknown_topic_share_rejects_event_series_filters -q
......                                                                   [100%]
6 passed in 0.11s
```

### Fresh verification after the changes

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py -q
..............                                                           [100%]
14 passed in 0.31s
```

```text
.venv\Scripts\python.exe -m pytest -q
........................................................................ [ 87%]
.........s                                                               [100%]
81 passed, 1 skipped in 8.35s
```

No Task 2 work was started.
