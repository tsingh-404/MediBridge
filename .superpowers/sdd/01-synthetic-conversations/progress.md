# SDD ledger — plan: docs/plans/01-synthetic-conversations.md

Worktree: `.worktrees/phase1-synthetic-conversations` on `phase1-synthetic-conversations`.
Phase 0 metric contract is provisional; preserve the `unvalidated demo requirements` label and do not imply validated stakeholder needs.

## Preflight task dependency scan

| Tasks / task | Shared file or interface | Producer ? consumer | Scan result |
|---|---|---|---|
| Task 1 ? Task 3 | `schema.py`: `connect_demo`, `create_schema` | Task 1 owns DB connection and DDL; Task 3 writes generated records through schema | Compatible; no conflicting signatures. |
| Task 2 ? Task 3 | `scenarios.py`: `scenario_for(seed, sequence_no, started_at_utc) -> Scenario` | Task 2 defines the scenario shape; Task 3 consumes deterministic scenario records | Compatible at stated boundary; Scenario fields need be explicit in code and tests. |
| Task 1 ? Task 4 | schema/table constraints and enums | Task 4 validator and broken fixtures inspect schema records | Compatible; deliberate invalid fixtures may need foreign keys disabled for orphan tests. |
| Task 1 ? Task 2 | shared test file `tests/test_analytics_demo_generate.py` | Task 1 creates it; later tasks extend it | Sequential plan avoids parallel edits. |
| Task 1 | DDL tests vs schema interfaces/files | Schema module and tests are both in this task | Self-consistent; fixture helper remains unspecified, keep minimal. |
| Task 2 | scenario tests vs scenario API | Scenarios module and tests are in this task | Self-consistent; exact scenario field dataclass is not fixed by plan. |
| Task 3 | deterministic generation tests vs `generate_store`/CLI | Generator module, CLI, `.gitignore`, tests | Self-consistent; full-scale run explicitly required. |
| Task 4 | validator tests vs `validate_store`/CLI/dictionary | Validator module, tests, documentation | Self-consistent; schema-invalid test rows may require controlled fixture setup. |

No contradictory task pair or plan-mandated review defect found. No Phase 0 approval is present; synthetic implementation remains demo-only and unvalidated.

Baseline in isolated venv: `python -m pytest tests/ -q` — 40 passed, 1 skipped.
Task 1 dispatched to Luna high; base commit `363ebd5b482835a1388197ee57b5b66bfef6339e`.
Task 1 implementation commit `85d774a`; reported focused 6 passed and full baseline-expanded suite 46 passed, 1 skipped. Review pending.
Task 1 review: one Important finding — unrestricted `sessions.region` and `sessions.location_basis` permit invalid geography semantics. Fix round 1 pending.
Task 1 fix round 1: add CHECK constraints for roadmap region and location-basis allowlists; fix commit `337d867`. RED invalid-value attempts failed to raise; focused suite 8 passed after fix. Scoped review pending.
Task 1 re-review: schema allowlists addressed; no new breakage. The broader search-area/residence check cannot be verified in schema and is explicitly tested by Task 2 in the plan.
Ruling: Treat the remaining search-area-versus-stated-region check as Task 2 scope — Task 1 stores the basis enum, while Task 2 owns scenario generation and its plan explicitly requires this semantic test. Cost if wrong: a mislabeled geography scenario could be represented in the demo until caught by validation.
Task 1: complete (commits 363ebd5..337d867; schema finding addressed, Task 2 semantic check carried forward).
Task 2 copied to current checkout as commit 640dbfd5d48fb3250117330590dd10cd57fb553f; implementation report says 14 focused tests passed and calendar-anchored artificial windows are 2025-Q1 respiratory, 2025-Q4 coverage-information. Review pending.
Task 2 review: Spec compliance and task quality pass; reviewer marked geography assertion as Minor (tautological) and observed implementation wording is correct.
Task 2 controller finding (Important): current multi-topic scenarios tag message indexes 0 and 2 separately, so no user turn has multiple topics despite the plan/metric contract requirement for mixed-topic turns. Fix round 1 pending.
Task 2 fix round 1: add deterministic same-turn multi-topic scenario and meaningful geography wording checks; RED assertion failed as expected; focused suite 15 passed. Scoped re-review pending.
Task 2 fix round 1 review: same-turn tags and geography assertions addressed. Re-review found new Important breakage: mixed-topic dialogue does not address the pharmacy question although its event has an unresolved outcome. Fix round 2 pending.
Task 2 fix round 2: mixed-topic dialogue now addresses both GP and pharmacy; unresolved cost outcome is explicit. RED focused regression failure, then 15 focused tests passed. Scoped re-review pending.
Task 2 fix round 2 review: pharmacy outcome/dialogue mismatch addressed; no substantive new breakage.
Task 2: minor (deferred): final assistant message begins “You are welcome” although the preceding user turn did not thank it; non-blocking dialogue polish.
Task 2: complete (commits d623e9f..b55bffd; all Important findings addressed, 1 Minor deferred).
Task 3 base: `b55bffd79b859eea4088147027d4417f12a208a0`.
Task 3 dispatched to Luna high implementer; default full-scale store run is required for this task. No Task 3 commits yet.
Task 3 implementation commit dd8bd46; report records full run in 3.142 seconds (50,000 sessions, 35,000 actors, 200,000 messages, 53,533 events), 72,208,384-byte DB, SHA-256 c1a4d822.... Full suite 58 passed, 1 skipped. Review pending.
Task 3 review: Critical finding — generator unlinks arbitrary existing output paths, so `--output data/medibridge.db` can destroy the protected operational DB. Fix round 1 pending.
Task 3: minor note resolved in fix round 1 (`cd024b5`) by removing the redundant unreachable check.
Task 3 fix round 1: protect resolved/same-file operational DB paths, stage builds and atomically replace successful outputs; failure cleanup leaves destinations intact. Focused 21 tests and full suite 61 passed, 1 skipped. Scoped re-review pending.
Task 3 fix round 1 review: operational DB path guard and staged atomic replacement addressed the Critical finding; no new breakage.
Task 3: complete (commits b55bffd..cd024b5; operational DB protection reviewed; 1 Minor deferred).
Task 4 base: `cd024b58057f81fb2a6d2c08099299b311ba9f81`.
Task 4 implementation report: focused tests 16 passed; full suite 63 passed, 1 skipped; full generation succeeded; validator CLI exit 0, both scenario windows confirmed; artifact 72,208,384 bytes SHA-256 6d84de1f... Review pending.
Task 4 review: Important — malformed/non-database file can raise sqlite3.DatabaseError outside the guarded path; validator must return errors/counts. Important — scenario-count comparison sums grouped rows against same row total (tautological); fixture only mismatches generation_runs.session_count and is mislabeled scenario mismatch. Fix round 1 pending.
Task 4: minor (deferred): NULL region values evade SQL NOT IN check when constraints are bypassed; explicit NULL check recommended.
Task 4 fix round 1: catch non-database SQLite errors as ValidationReport; compare each scenario to seeded scenario_for ground truth and retain generation row count checks. RED two tests failed; 18 focused and 65 full passed, 1 skipped; validator CLI full store exit 0. Scoped review pending.
Task 4 fix round 1 review: malformed-file handling and seeded scenario-truth comparison addressed; no new Important/Critical breakage.
Task 4: complete (commits cd024b5..1fac1fc; Important findings addressed; 1 Minor deferred).
Plan checklist marked complete and committed as `10a33a3`.

Final fresh verification: `.venv\Scripts\python.exe -m pytest -q` — 65 passed, 1 skipped. `.venv\Scripts\python.exe -m medibridge.analytics_demo.validate data/analytics_demo.sqlite` — exit 0, `ok: true`, `errors: []`, 50,000 sessions, expected scenario windows, SHA-256 `6d84de1fde6edd95d46858d15cae643c845a895c808b74ac7574251712618e0d`.

Final whole-branch review: Important unknown-topic denominator mismatch found; Minor NULL-region validation gap also noted. One fix round completed in `bd9af9b`: `unknown_topic_share` now counts sessions with no classified topic over all sessions (including no-event sessions); event-level unclassified-topic counts/shares and mixed-tag session count are separately reported. NULL region explicitly fails validation, with a constraint-bypass regression fixture. Updated dictionary and Task 4 report.
Final scoped re-review: accepted; both findings addressed; no new Critical/Important findings. Minor schema declaration/constraint inspection and Task 2 dialogue polish remain deferred.
Fresh root verification after `bd9af9b`: `.venv\Scripts\python.exe -m pytest -q` — 67 passed, 1 skipped. Validator CLI — exit 0, `ok: true`, `errors: []`; unknown-topic sessions 2,614 / 50,000 (5.228%), unclassified-topic events 2,796 / 53,533 (5.223%), mixed-tag sessions 182; artifact SHA-256 `6d84de1fde6edd95d46858d15cae643c845a895c808b74ac7574251712618e0d`.
