# Phase 1 Synthetic Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. Assign implementation to a Luna high subagent; check boxes as work completes.

**Goal:** Build a repeatable Queensland-only store of fictional MediBridge conversations and analytic labels, with documented ground truth and quality checks.

**Architecture:** A deterministic Python generator writes a new, separate SQLite database from controlled scenario templates. It generates actor/session/message records and normalized issue events; tests compare deterministic output and scenario truth. No existing student chat route or operational database is modified.

**Tech Stack:** Python 3.11+, standard-library `sqlite3`, `pytest`; current project venv.

**Spec:** [programme roadmap](README.md), [questionnaire](../stakeholder-analytics-questionnaire.md), and Phase 0 `docs/research/metric-contract.md` when approved.

## Global constraints

- Target 50,000 sessions and at least 30,000 synthetic actors across 2024-10-01 to 2026-09-30; fixed seed and scenario version.
- Queensland display regions only, with an explicit `unknown` value. Never label a clinic search as residence.
- Every message is original fictional template text; do not seed from real chats, logs, LangSmith traces or external datasets.
- Do not change `src/medibridge/server/routes/chat.py`, `ui/`, `data/medibridge.db`, or production ingestion.
- Generated DB is ignored by git and generated on demand; commit only source templates, small fixtures, schema and checks.

## Review focus

- Same seed and version must produce the same business records independent of run time.
- Multiple issue tags in one session must not duplicate a category's session count.
- An actor may have multiple sessions, but dashboard-facing tables must not reveal an actor's path.
- Every geography record must include a basis (`stated_demo_region`, `service_search_area`, `unknown`); location unknown must not be imputed.
- Seasonal and injected spike scenarios must have documented expected windows, while normal random variation remains plausible.

## File structure

| File | Responsibility |
|---|---|
| `src/medibridge/analytics_demo/schema.py` | SQLite DDL and version constant; `actors`, `sessions`, `messages`, `issue_events`, `generation_runs`. |
| `src/medibridge/analytics_demo/scenarios.py` | Fixed taxonomy, Queensland region vocabulary, fictional dialogue templates, scenario schedule. |
| `src/medibridge/analytics_demo/generate.py` | `generate_store(path: Path, seed: int, session_count: int) -> GenerationSummary` and CLI. |
| `src/medibridge/analytics_demo/validate.py` | `validate_store(path: Path) -> ValidationReport`, scenario and integrity checks. |
| `tests/test_analytics_demo_generate.py` | Small deterministic, integrity and prohibited-content tests. |
| `docs/research/synthetic-data-dictionary.md` | Entity/column definitions, scenarios, metric caveats and run instructions. |
| `.gitignore` | Ignore `data/analytics_demo.sqlite` and temporary DB files. |

`sessions` fields: `session_id`, `actor_id`, `started_at_utc`, `insurer_id`, `tier_id`, `region`, `location_basis`, `scenario_code`. `messages`: `message_id`, `session_id`, `turn_index`, `role`, `content`. `issue_events`: `event_id`, `message_id`, `topic_code`, `service_code`, `concern_code`, `answer_outcome`, `classification_version`. The schema should use foreign keys, indexes on time/topic/region, enumerated values enforced in generation, and no real device identifiers. `generation_runs` stores seed, generator/taxonomy versions, created timestamp and row totals; created timestamp is excluded from deterministic business-record comparison.

## Tasks

### Task 1: Schema and test fixture

**Interfaces:** Create `connect_demo(path: Path) -> sqlite3.Connection` and `create_schema(conn: sqlite3.Connection) -> None` in `schema.py`. Keep writes confined to the provided path.

- [x] Write tests for DDL constraints: foreign keys reject orphan messages/events; duplicate `(session_id, turn_index)` fails; allowed roles are `user` and `assistant`.
- [x] Run `python -m pytest tests/test_analytics_demo_generate.py -q` in the activated venv; confirm these tests fail because interfaces are absent.
- [x] Implement schema and a tiny static fixture helper; rerun the tests and confirm they pass.
- [x] Commit only source and tests.

### Task 2: Controlled conversations and scenario mix

**Interfaces:** `scenario_for(seed, sequence_no, started_at_utc) -> Scenario` in `scenarios.py` returns fictional dialogue, tags, insurer/tier, region and location basis. The caller supplies deterministic random state; no network or LLM calls.

- [x] Write tests asserting every generated message is non-empty, fictional templates contain no email/phone/student ID, tag codes belong to the taxonomy, and a service-search area never carries `stated_demo_region` basis.
- [x] Implement at least 12 issue categories covering GP, specialist, pharmacy, emergency care, hospital, mental health, sexual/reproductive care, respiratory symptoms, gastrointestinal symptoms, dental/optical gaps, waiting periods, and claim/coverage process. Include unclassified and mixed-topic turns.
- [x] Add scenario schedules for one known respiratory and one known coverage-information spike, plus expected stable/control topics; document these as artificial injected patterns.
- [x] Run focused tests and commit.

### Task 3: Deterministic generator and CLI

**Interfaces:** `generate_store(path: Path, seed: int = 20261005, session_count: int = 50000) -> GenerationSummary`; CLI `python -m medibridge.analytics_demo.generate --output data/analytics_demo.sqlite --seed 20261005 --sessions 50000`.

- [x] Write tests for row targets, 2-6 messages per session, at least 10% actors with multiple sessions, full date range, QLD-only region values, and repeatable hashes for two small runs with the same seed.
- [x] Implement generation using batches and explicit transactions. Generate at least 30,000 actors for the default full run; fail clearly when a requested session count cannot satisfy that default-scale requirement (small test runs may use scaled actor targets).
- [x] Add `.gitignore` entry; run CLI for the full 50,000-session store and record time, size and row totals in the validation report, not the DB itself in git.
- [x] Run focused tests and commit.

### Task 4: Store validator and data dictionary

**Interfaces:** `validate_store(path: Path) -> ValidationReport` reports errors and counts; CLI exits non-zero if any errors occur.

- [x] Write tests with a deliberately broken fixture for orphan rows, blank content, invalid dates, cross-state region, missing location basis, scenario count mismatch and unexpected personally identifying patterns.
- [x] Implement validation queries and a readable JSON/text report. Document tables, code sets, date/time and geography semantics, classification version, artificial patterns and limitations in `docs/research/synthetic-data-dictionary.md`.
- [x] Run `python -m pytest tests/test_analytics_demo_generate.py -q`, the full generator, then `python -m medibridge.analytics_demo.validate data/analytics_demo.sqlite`; confirm exit code 0 and expected scenario windows.
- [x] Record artifact hash and row counts for the Phase 2 handoff; commit tests and documentation.

## Acceptance and handoff

Report exact test output, database size, seeded counts, distinct actor count, message count, topic distribution, unknown share, synthetic-scenario windows and artifact hash. Phase 2 must regenerate locally from the command and seed; it must not assume the generated DB is tracked. No real-conversation collection is part of this phase.
