# Phase 2 Task 2 — Disclosure control report

**Status:** Complete  
**Branch:** `phase2-analytics-api`  
**Plan:** `docs/plans/02-analytics-api.md`  
**Scope:** Task 2 only; Task 3 has not started.

**Implementation commit:** `e904d0f` (`Add synthetic aggregate suppression`).

## Delivered

- Added `suppress_table(rows, min_sessions=10)` in `src/medibridge/analytics_demo/disclosure.py`, returning `SuppressedTable` and `SuppressedCell` values with explicit `suppressed` state and `reason_code`.
- Primary suppression uses each cell's explicit `distinct_sessions` support count. Suppressed cells return null for numerator, denominator, value, and support count; they never return fake zeroes.
- Added `distinct_sessions` support to `AggregateCell`. All metric results set it; `question_turns` now counts distinct selected sessions with at least one matched user question separately from its user-turn numerator.
- Added complementary suppression for one table: when a primary cell exists, every other cell in that supplied table is also suppressed. The current cell interface has no hierarchy metadata, so this deliberately conservative rule protects totals, marginals, and sibling filter rows supplied together.
- The disclosure boundary accepts only allowlisted dimensions and taxonomy/geography values. Month dimensions must use `YYYY-MM` granularity. This prevents identifier dimensions and exact timestamps from being returned through this interface.
- The returned caveat says the prototype threshold is not a real-data safety threshold and does not guarantee disclosure safety.
- Marked Task 2 checkboxes only in the Phase 2 plan.

## TDD evidence

All test commands used `.venv\Scripts\python.exe`.

**RED — missing disclosure module and support-count contract:**

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_disclosure.py -q
8 failed in 0.18s
ModuleNotFoundError: No module named 'medibridge.analytics_demo.disclosure'
```

The metric support-count assertion was also run before implementation:

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py::test_question_turns_count_distinct_user_messages_not_issue_events -q
1 failed in 0.13s
AttributeError: 'AggregateCell' object has no attribute 'distinct_sessions'
```

**RED — identifier dimensions:**

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_disclosure.py::test_suppression_rejects_row_level_identifier_dimensions -q
1 failed in 0.10s
Failed: DID NOT RAISE <class 'ValueError'>
```

**RED — exact timestamps:**

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_disclosure.py::test_suppression_rejects_exact_timestamp_as_a_month_dimension -q
1 failed in 0.10s
Failed: DID NOT RAISE <class 'ValueError'>
```

**GREEN — review behavior and metric support:**

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_disclosure.py -q
..........                                                               [100%]
10 passed in 0.03s
```

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py -q
..............                                                           [100%]
14 passed in 0.33s
```

**GREEN — full repository suite:**

```text
.venv\Scripts\python.exe -m pytest -q
........................................................................ [ 78%]
...................s                                                     [100%]
91 passed, 1 skipped in 7.39s
```

## Self-review and Task 3 handoff

The suppression function only has the rows passed to a single invocation. Its complementary suppression therefore covers all sibling cells in that table, including an included narrow-filter cell and before/after siblings. It cannot compare independent API requests. The plan's before/after-filter review focus is **not satisfied by this table-only function**.

Task 3 needs an API-level release rule before endpoints expose repeated filtered results. Concrete design question: should the API restrict overlapping filter comparisons, or maintain a release policy that suppresses/rejects a result when it could be differenced against previously released aggregates? A response-history cache alone cannot retract a value already returned, so the API decision must account for earlier broad responses as well as later narrow ones.

The global synthetic-only caveat remains explicit. Threshold 10 is a demo convention, not a claim of real-data safety or a complete real-world disclosure-control system. No student routes/UI or `data/medibridge.db` were changed.

## Review fix round 1 — 5 October 2026

**Fix commit:** `6f9ad6f` (`Fix disclosure support and label allowlists`).

### RED — topic-rate cell support

Added an assertion that a topic-rate cell passes through `suppress_table` with its support count. Before the fix, it failed because the metric constructed the cell without `distinct_sessions`:

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py::test_topic_rate_uses_all_sessions_including_unknown_and_no_topic -q
1 failed in 0.18s
ValueError: each cell must have a non-negative distinct_sessions count
```

The topic-rate query now records the numerator (distinct topic sessions) as the cell's distinct-session support. The existing metric-cell change continues to record selected sessions separately from the turn numerator for `question_turns`.

### RED — insurer/tier label allowlists

Added cases for invalid `insurer_id` and `tier_id` dimensions:

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_disclosure.py::test_suppression_rejects_unknown_insurer_and_tier_values -q
FF                                                                       [100%]
2 failed in 0.15s
Failed: DID NOT RAISE <class 'ValueError'>
```

The synthetic insurer and tier label tuples now live beside the Phase 1 scenario generator's other code allowlists and continue to drive deterministic scenario selection. Disclosure validation imports those same tuples and rejects all other values.

### GREEN — focused metrics and disclosure suites

```text
.venv\Scripts\python.exe -m pytest tests/test_analytics_demo_metrics.py tests/test_analytics_demo_disclosure.py -q
..........................                                               [100%]
26 passed in 0.47s
```

### GREEN — full repository suite

```text
.venv\Scripts\python.exe -m pytest -q
........................................................................ [ 76%]
.....................s                                                   [100%]
93 passed, 1 skipped in 5.99s
```

The cross-request differencing issue remains with the Task 3 API-level release-policy question above; this fix only makes individual tabular cells disclose their support accurately to Task 2 suppression.
