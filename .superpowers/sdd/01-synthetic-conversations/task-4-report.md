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

Topic counts and scenario counts/windows are in the exact validator output above and in `docs/research/synthetic-data-dictionary.md`. Unknown shares are: topic 5.223%, service 5.223%, concern 5.223%, answer outcome 27.622%, region 20.188%, and location basis 20.188%. The respiratory scenario window is 2025-01-01–2025-03-31 inclusive; the coverage-information window is 2025-10-01–2025-12-31 inclusive. Their observed timestamps fell within the expected windows.

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
