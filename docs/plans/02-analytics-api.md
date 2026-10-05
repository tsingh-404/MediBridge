# Phase 2 Aggregate Analytics API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. Assign implementation to a Luna high subagent; check boxes as work completes.

**Goal:** Provide a separate, local, aggregate-only API over the Phase 1 synthetic store for interactive dashboard queries.

**Architecture:** A standalone FastAPI app reads the generated SQLite file in read-only mode. A query module owns metric definitions and grouping; an API module validates a small allowlist of filters and returns chart-ready aggregate results with provenance and disclosure fields. Do not add these endpoints to the student app.

**Tech Stack:** Existing FastAPI, Pydantic, Python `sqlite3`, `pytest`.

**Spec:** [programme roadmap](README.md), [questionnaire](../stakeholder-analytics-questionnaire.md), Phase 0 metric contract if approved, and Phase 1 data dictionary.

## Global constraints

- Bind the demo app to `127.0.0.1` by default. It has no remote deployment or authentication claim.
- Return no actor ID, session ID, raw message, exact postcode, exact timestamp or row-level event.
- Display `synthetic: true`, store scenario/version, source span and caveat metadata on every response.
- Primary topic count uses `COUNT(DISTINCT session_id)` per category. Per-1,000 rate denominator is all selected sessions, including unknown-topic sessions.
- All filters are parameterized and allowlisted; invalid dimensions or out-of-range dates return a 422 response.
- Initial suppression threshold is 10 distinct sessions, with complementary suppression for totals that reveal hidden cells. Include suppressed-state flags rather than fake zeroes.

## Review focus

- A multi-topic session can count in two categories but once per category; sums across categories may exceed total sessions.
- Empty or all-unknown selections return valid zero/unknown states and a clear denominator.
- Comparing before/after narrow filters must not disclose a suppressed cell by subtraction.
- Unknown geography remains visible and is excluded from region-specific rates where stated.
- A displayed spike is artificial and explicitly labelled a demonstration scenario, not an outbreak.

## File structure and contracts

| File | Responsibility |
|---|---|
| `src/medibridge/analytics_demo/metrics.py` | `AnalyticsFilter`, `MetricResult`, SQL queries and safe grouping. |
| `src/medibridge/analytics_demo/disclosure.py` | `suppress_table(rows, min_sessions=10) -> SuppressedTable`; primary and complementary suppression. |
| `src/medibridge/analytics_demo/api.py` | Standalone FastAPI app, endpoint schemas, error handling. |
| `src/medibridge/analytics_demo/__main__.py` | CLI runner, loopback host, local port 8001, DB path option. |
| `tests/test_analytics_demo_metrics.py` | Golden fixture for units, filters, boundaries and rates. |
| `tests/test_analytics_demo_api.py` | Endpoint, payload, suppression and privacy tests. |
| `docs/research/analytics-api-contract.md` | Endpoint parameters, response examples and metric formulas. |

Use one shared filter: inclusive `start_date` and `end_date` in Australia/Brisbane calendar dates; optional insurer, topic, service, concern, region and `location_basis`; no arbitrary SQL or free-text search. Time buckets are calendar week (Monday start) or month. API endpoints: `GET /api/demo/meta`, `/overview`, `/topics`, `/trend`, `/regions`, `/coverage-friction`, `/quality`. Each endpoint returns filters applied, numerator/denominator, `suppressed` status for cells, and provenance. `meta` returns allowlisted filter values and available date range, not sample rows. No raw export endpoint.

## Tasks

### Task 1: Metric core and golden dataset

**Interfaces:** `read_metrics(conn: sqlite3.Connection, metric: str, group_by: tuple[str, ...], filters: AnalyticsFilter) -> MetricResult` in `metrics.py`; metric/group combinations are explicit, not arbitrary.

- [x] Write a small fixture with repeated issue events in one session, a multi-topic session, unknown labels, and an insurer/region split. Assert exact session count, topic count, question-turn count, per-1,000 rate and unknown share.
- [x] Run focused tests and confirm failure before implementing.
- [x] Implement read-only queries and versioned metric metadata, with no user-provided SQL identifiers.
- [x] Run focused tests and commit.

### Task 2: Disclosure control

**Interfaces:** `suppress_table(rows: list[AggregateCell], min_sessions: int = 10) -> SuppressedTable`; suppressed cells return null values and a reason code.

- [x] Write tests for a small primary cell, a total that would reveal it, a filtered response that could reveal it through a sibling total, and a fully safe table.
- [x] Implement primary plus complementary suppression for every tabular payload; do not claim this is a complete real-data disclosure system.
- [x] Run focused tests and commit.

### Task 3: API and validation

**Interfaces:** standalone `app` in `api.py`; CLI `python -m medibridge.analytics_demo --db data/analytics_demo.sqlite --port 8001`.

- [x] Write FastAPI test-client tests for each endpoint; assert `synthetic: true` and caveats are present, filters are echoed, date inversions and unknown dimensions return 422, and forbidden row fields never appear anywhere in JSON.
- [x] Implement endpoints using the metric core and disclosure control. Return stable response shapes for no data and all-suppressed selections.
- [x] Run `python -m pytest tests/test_analytics_demo_metrics.py tests/test_analytics_demo_api.py -q`; commit.

### Task 4: Contract and operational handoff

- [x] Document endpoint schemas, exact metric formulas, date/time convention, tag taxonomy, suppression flags, sample requests, artificial-scenario labels and error responses.
- [x] Regenerate the Phase 1 full store, run the API locally, and make a request for each endpoint; record status and sample totals in the handoff.
- [x] Run the repository backend test suite in the activated venv; check no student route or app files changed; commit.

## Acceptance and handoff

Phase 3 receives the API contract and sample aggregate JSON, not database access. Verify query latency on the full demo store and state a practical bound for the presentation machine (target p95 under 1 second for common filtered charts; profile and report if missed). No external stakeholder access is enabled by this phase.
