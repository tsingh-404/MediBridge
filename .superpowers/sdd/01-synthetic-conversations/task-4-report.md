# Task 4: Store validator and data dictionary report

## Result

Implemented and committed the validator and data dictionary. The full generated store validated successfully (`ok: true`, zero errors), with scenario labels inside their expected windows. The generated SQLite database remains ignored and uncommitted.

**Implementation commit:** `24bf33a` (`Add synthetic analytics store validator`).

## TDD evidence

Added the deliberately corrupt fixture and CLI failure test to `tests/test_analytics_demo_generate.py` before implementing `validate.py`. The fixture turns off foreign key enforcement and check constraints, then inserts orphan rows and writes blank content, an invalid timestamp, an out-of-state region, a blank location basis, a generation/session count mismatch, and an email pattern.

RED command:

```text
.venv\Scripts\python -m pytest tests/test_analytics_demo_generate.py -q -k validator
```

Exact failure summary before implementation:

```text
FF                                                                       [100%]
================================== FAILURES ===================================
____ test_validator_reports_corruption_even_when_constraints_were_bypassed ____
E       ModuleNotFoundError: No module named 'medibridge.analytics_demo.validate'
____________ test_validator_cli_returns_nonzero_for_invalid_store _____________
E       ModuleNotFoundError: No module named 'medibridge.analytics_demo.validate'
=========================== short test summary info ============================
FAILED tests/test_analytics_demo_generate.py::test_validator_reports_corruption_even_when_constraints_were_bypassed
FAILED tests/test_analytics_demo_generate.py::test_validator_cli_returns_nonzero_for_invalid_store
2 failed, 14 deselected in 0.22s
EXIT_CODE=1
```

After implementation, the focused test file and full test suite both passed (exact outputs below). The broken-fixture test sees all expected validation error codes, and the CLI returns 1 for an invalid store.

## Commands and verification outputs

Focused tests:

```text
Command: .venv\Scripts\python -m pytest tests/test_analytics_demo_generate.py -q
................                                                         [100%]
16 passed in 0.62s
EXIT_CODE=0
```

Full tests:

```text
Command: .venv\Scripts\python -m pytest -q
...............................................................s         [100%]
63 passed, 1 skipped in 6.93s
EXIT_CODE=0
```

Full generation:

```text
Command: .venv\Scripts\python -m medibridge.analytics_demo.generate --output data/analytics_demo.sqlite --seed 20261005 --sessions 50000
{
  "actor_count": 35000,
  "issue_event_count": 53533,
  "message_count": 200000,
  "output_path": "data\\analytics_demo.sqlite",
  "seed": 20261005,
  "session_count": 50000
}
GENERATION_EXIT_CODE=0
GENERATION_DURATION_SECONDS=3.029
```

Validator CLI:

```text
Command: .venv\Scripts\python -m medibridge.analytics_demo.validate data/analytics_demo.sqlite
{
  "counts": {
    "rows": {
      "actors": 35000,
      "generation_runs": 1,
      "issue_events": 53533,
      "messages": 200000,
      "sessions": 50000
    },
    "scenarios": {
      "control_stable": 43660,
      "coverage_information_spike": 2967,
      "mixed_topic_turn": 458,
      "respiratory_spike": 2915
    },
    "topics": {
      "care_navigation": 6758,
      "claims_process": 1775,
      "cost_out_of_pocket": 845,
      "coverage_benefit_exclusion": 1826,
      "coverage_waiting_period": 1824,
      "dental_optical_benefits": 849,
      "emergency_hospital_care": 1683,
      "gastrointestinal_information": 864,
      "mental_health_information": 810,
      "pharmacy_medicines": 7293,
      "preventive_health_information": 6730,
      "primary_care": 7299,
      "provider_search_access": 6826,
      "respiratory_information": 3723,
      "sexual_reproductive_health_information": 802,
      "specialist_care": 830,
      "unknown_unclassified": 2796
    }
  },
  "errors": [],
  "file_size_bytes": 72208384,
  "metrics": {
    "actor_repeat_counts": {
      "actors_with_multiple_sessions": 3500,
      "sessions_assigned_to_repeated_actors": 18500,
      "share_of_actors_repeated": 0.1
    },
    "expected_scenario_windows": {
      "coverage_information_spike": {
        "end": "2025-12-31",
        "start": "2025-10-01"
      },
      "respiratory_spike": {
        "end": "2025-03-31",
        "start": "2025-01-01"
      }
    },
    "generation_run_counts": {
      "actors": 35000,
      "issue_events": 53533,
      "messages": 200000,
      "sessions": 50000
    },
    "observed_scenario_windows": {
      "coverage_information_spike": {
        "count": 2967,
        "end": "2025-12-31T23:34:27Z",
        "expected_end": "2025-12-31",
        "expected_start": "2025-10-01",
        "start": "2025-10-01T00:26:31Z"
      },
      "respiratory_spike": {
        "count": 2915,
        "end": "2025-03-31T23:35:41Z",
        "expected_end": "2025-03-31",
        "expected_start": "2025-01-01",
        "start": "2025-01-01T00:31:24Z"
      }
    },
    "timestamp_bounds": [
      "2024-10-01T03:35:51Z",
      "2026-09-30T21:08:21Z"
    ],
    "unknown_counts": {
      "answer_outcome": 14787,
      "concern": 2796,
      "location_basis": 10094,
      "region": 10094,
      "service": 2796,
      "topic": 2796
    },
    "unknown_region_share": 0.20188,
    "unknown_shares": {
      "answer_outcome": 0.27622214335083034,
      "concern": 0.052229465936898735,
      "location_basis": 0.20188,
      "region": 0.20188,
      "service": 0.052229465936898735,
      "topic": 0.052229465936898735
    },
    "unknown_topic_share": 0.052229465936898735
  },
  "ok": true,
  "path": "data\\analytics_demo.sqlite",
  "sha256": "6d84de1fde6edd95d46858d15cae643c845a895c808b74ac7574251712618e0d"
}
EXIT_CODE=0
```

## Artifact handoff

The database is 72,208,384 bytes (68.86 MiB), SHA-256 `6d84de1fde6edd95d46858d15cae643c845a895c808b74ac7574251712618e0d`. It contains 35,000 actors, 50,000 sessions, 200,000 messages, 53,533 issue events, and one generation-run row. There are 3,500 repeated actors (10%) representing 18,500 sessions. Session timestamps run from `2024-10-01T03:35:51Z` to `2026-09-30T21:08:21Z`.

Topic counts and scenario counts/windows are in the exact validator output above and in `docs/research/synthetic-data-dictionary.md`. The original validator run above reported unclassified topic events as an unknown-topic share; Fix round 2 below corrects that contract mismatch. The respiratory scenario window is 2025-01-01–2025-03-31 inclusive; the coverage-information window is 2025-10-01–2025-12-31 inclusive. Their observed timestamps fell within the expected windows.

## Changed files

* `src/medibridge/analytics_demo/validate.py` — structured report, integrity/content/vocabulary/scenario/count checks, and JSON CLI.
* `tests/test_analytics_demo_generate.py` — constraint-bypass corruption fixture and invalid-store CLI exit test.
* `docs/research/synthetic-data-dictionary.md` — table/column definitions, code sets, semantics, limitations, and full-run metrics.
* `.superpowers/sdd/01-synthetic-conversations/task-4-report.md` — this execution record.

The generated `data/analytics_demo.sqlite` is ignored. Pre-existing untracked planning/research files were not staged or committed. Chat route, UI, operational database, and production ingestion were not changed. The metric contract remains labeled **unvalidated demo requirements**.

## Self-review and concerns

The validator independently checks allowlists, timestamp format and parseability, geography basis, message content, personal-data-like patterns, FKs, SQLite integrity, scenario windows, and generator row totals. Tests bypass SQL constraints to ensure validation is not relying only on the schema. The implementation did not modify generation behavior.

Personal-data scanning uses explicit pattern matching for email-like text, Australian phone-like strings, student ID/number wording, and long digit runs. It is only a regression guard and cannot establish that arbitrary text is free of identifying information. All topic labels, rates, and spike windows describe synthetic generator construction only.

Concerns: **none blocking.** The quality limitations above are documented in the dictionary; they do not prevent the validator or synthetic artifact from being used for demo development.

## Fix round 1: malformed files and scenario ground truth

**Fix implementation commit:** `b476867` (`Harden analytics store validation`).

Two review findings were addressed after the initial Task 4 implementation:

1. Schema inspection is now guarded. A plain-text file that SQLite only rejects when querying `sqlite_master` returns `ValidationReport(ok=False)` with an `invalid_database` error and empty row counts instead of raising `sqlite3.DatabaseError`. SQLite errors during subsequent integrity or data queries are converted to a report error as well.
2. Removed the tautological grouped scenario count check. The validator now reads the seed from the latest generation run, parses the sequence number from generated session IDs, and recomputes `scenario_for(seed, sequence_no, started_at_utc)`. A stored code that is valid in the taxonomy but differs from the deterministic ground truth reports `scenario_truth_mismatch`. The independent stored generation-run/session count comparison still reports `scenario_count_mismatch` when its session total is inconsistent.

### TDD and verification

The new plain-text and wrong-scenario tests were added before the fix. RED command and exact result:

```text
.venv\Scripts\python -m pytest tests/test_analytics_demo_generate.py -q -k "non_sqlite or seeded_ground_truth"
FF                                                                       [100%]
______________ test_validator_returns_report_for_non_sqlite_file ______________
E       sqlite3.DatabaseError: file is not a database
_____ test_validator_compares_scenario_assignments_to_seeded_ground_truth _____
E       AssertionError: assert not True
2 failed, 16 deselected in 0.31s
EXIT_CODE=1
```

Focused test file after the fix:

```text
Command: .venv\Scripts\python -m pytest tests/test_analytics_demo_generate.py -q
..................                                                       [100%]
18 passed in 0.70s
EXIT_CODE=0
```

Full suite after the fix:

```text
Command: .venv\Scripts\python -m pytest -q
.................................................................s       [100%]
65 passed, 1 skipped in 9.07s
EXIT_CODE=0
```

Full-store validator rerun:

```text
Command: .venv\Scripts\python -m medibridge.analytics_demo.validate data/analytics_demo.sqlite
{
  "errors": [],
  "ok": true,
  "path": "data\\analytics_demo.sqlite",
  "counts": {
    "rows": {
      "actors": 35000,
      "generation_runs": 1,
      "issue_events": 53533,
      "messages": 200000,
      "sessions": 50000
    },
    "scenarios": {
      "control_stable": 43660,
      "coverage_information_spike": 2967,
      "mixed_topic_turn": 458,
      "respiratory_spike": 2915
    }
  },
  "file_size_bytes": 72208384,
  "sha256": "6d84de1fde6edd95d46858d15cae643c845a895c808b74ac7574251712618e0d"
}
EXIT_CODE=0
```

The CLI's full JSON output, including topic counts, timestamp bounds, unknown shares, and scenario windows, was unchanged from the full output recorded above. Both scenario windows remain valid. No 50,000-session regeneration was needed because the generator was unchanged.

### Fix-round files and review

* `src/medibridge/analytics_demo/validate.py` — catch schema inspection errors and add deterministic scenario replay checks; remove the tautological scenario aggregation.
* `tests/test_analytics_demo_generate.py` — plain-text database and wrong-but-allowlisted scenario corruption cases.
* `docs/research/synthetic-data-dictionary.md` — describe seeded scenario replay and malformed-file reporting.

The scenario-truth check depends on the generated session ID format and latest `generation_runs.seed`, both of which are part of this store's generator contract. It skips replay when a session ID or timestamp cannot be parsed; those timestamp errors are reported by the separate timestamp validation. There are no blocking concerns.

## Fix round 2: contract metric units and NULL region

The metric contract defines unknown-topic share at the session level. The validator now counts sessions with no classified topic over all sessions, including sessions with no issue events. A session with any classified topic remains classified even if it also has an `unknown_unclassified` event. The count and share of `unknown_unclassified` events are reported separately with explicit event-level names. Region allowlist validation now explicitly checks `region IS NULL` before `NOT IN`, because SQL NULL values bypass `NOT IN` predicates.

The new tests cover four distinct session states: classified-only, mixed classified and unclassified, no-topic, and unclassified-only. They assert that the mixed session is not included in unknown sessions, while no-topic and unclassified-only sessions are. A second fixture rebuilds the sessions table without its `NOT NULL` constraint and inserts a NULL region to demonstrate that the validator catches it.

TDD RED command:

```text
.venv\Scripts\python -m pytest tests/test_analytics_demo_generate.py -q -k "unknown_topic_sessions_separately or null_region"
FF                                                                       [100%]
2 failed, 18 deselected in 0.28s
EXIT_CODE=1
```

The unknown-topic test failed because `unknown_topic_session_count` was absent; the NULL-region fixture failed because no `invalid_region` error was reported. After implementation:

```text
Command: .venv\Scripts\python -m pytest tests/test_analytics_demo_generate.py -q
....................                                                     [100%]
20 passed in 0.68s
EXIT_CODE=0

Command: .venv\Scripts\python -m pytest -q
...................................................................s     [100%]
67 passed, 1 skipped in 5.85s
EXIT_CODE=0
```

Full-store validator rerun:

```text
Command: .venv\Scripts\python -m medibridge.analytics_demo.validate data/analytics_demo.sqlite
"errors": []
"file_size_bytes": 72208384
"sessions_with_classified_and_unclassified_topics": 182
"unclassified_topic_event_count": 2796
"unclassified_topic_event_share": 0.052229465936898735
"unknown_topic_session_count": 2614
"unknown_topic_share": 0.05228
"ok": true
"sha256": "6d84de1fde6edd95d46858d15cae643c845a895c808b74ac7574251712618e0d"
EXIT_CODE=0
```

The corrected artifact metrics are 2,614 unknown-topic sessions / 50,000 sessions (5.228%), 2,796 unclassified events / 53,533 issue events (5.223%), and 182 sessions with both classified and unclassified tags. The validator uses a grouped left join for session-level topic quality so this full-store check completes in about seven seconds without repeated per-session scans.
