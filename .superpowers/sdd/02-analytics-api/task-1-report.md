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
