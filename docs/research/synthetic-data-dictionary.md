# Synthetic conversation analytics store

## Status and intended use

This is a deterministic, fictional demonstration dataset for developing and checking analytics workflows. Every conversation is original template text generated locally. It contains no production chats, clinical records, insurer activity, or measured student behaviour. **All figures are synthetic-only.** Do not treat counts as clinical prevalence, demand, service use, insurer performance, or evidence about MediBridge users.

The Phase 0 metric contract remains **unvalidated demo requirements**. The topic label attached to a question is a scenario-provided classification, never a diagnosis. Topic shares and trends describe this generator's choices only. The injected respiratory and coverage-information spikes are artificial demonstration patterns, not observed seasonal effects.

## Reproduction

From the repository root, with the project's `.venv` active:

```powershell
.venv\Scripts\python -m medibridge.analytics_demo.generate --output data/analytics_demo.sqlite --seed 20261005 --sessions 50000
.venv\Scripts\python -m medibridge.analytics_demo.validate data/analytics_demo.sqlite
```

The generated SQLite file is ignored by git and is not a source artifact. Regenerate it when needed. The generator builds a staging database and replaces only the requested output after successful completion. It refuses the configured operational database path.

## Tables and columns

| Table | Column | Meaning |
|---|---|---|
| `actors` | `actor_id` | Synthetic repeat-user key. It is not a real or stable user identifier. |
| | `created_at_utc` | Synthetic actor creation timestamp in UTC. |
| `sessions` | `session_id` | Synthetic conversation/session key. |
| | `actor_id` | Synthetic actor assigned to this session. Use only for generator QA such as repeat counts; do not infer individual journeys. |
| | `started_at_utc` | Session start timestamp in UTC, represented as ISO 8601 ending in `Z`. |
| | `insurer_id`, `tier_id` | Fictional insurer and cover-tier labels (`demo_insurer_*`, `demo_basic`, `demo_standard`, `demo_plus`). |
| | `region` | Queensland display region or `unknown`; see geography semantics below. |
| | `location_basis` | Why a demo region is present: stated in fictional text, selected as a service search area, or unknown. |
| | `scenario_code` | Generator scenario label. Spike labels identify intentionally injected examples. |
| `messages` | `message_id` | Synthetic message key. |
| | `session_id` | Parent session key. |
| | `turn_index` | Zero-based sequence position within a session. |
| | `role` | `user` or `assistant`. This demo has no system/tool messages. |
| | `content` | Original fictional prompt or response template, sometimes with a fictional region inserted. |
| `issue_events` | `event_id` | Synthetic classification-event key. |
| | `message_id` | User message to which the scenario label applies. A message may have multiple labels. |
| | `topic_code` | Broad informational topic label from the scenario taxonomy. |
| | `service_code` | Service grouping associated with the fictional question. |
| | `concern_code` | Concern grouping associated with the fictional question. |
| | `answer_outcome` | Template-level resolved/unresolved/not-assessed outcome; not a measure of real care or user satisfaction. |
| | `classification_version` | Taxonomy/classification version used by the generator (`issue-taxonomy-v1`). |
| `generation_runs` | `run_id` | Generation record key. |
| | `seed`, `generator_version`, `taxonomy_version` | Inputs and code/taxonomy labels for the generation run. |
| | `created_at_utc` | Time the local generation completed, UTC. This varies across runs. |
| | `actor_count`, `session_count`, `message_count`, `issue_event_count` | Generator-recorded row totals, checked by the validator against table counts. |

SQLite foreign keys link sessions to actors, messages to sessions, and events to messages. Message turn indexes are unique within a session. The validator independently checks table/column presence, SQLite integrity and foreign keys, timestamps, code sets, geography, nonblank content, personal-data patterns, scenario windows, and generation row totals. It also replays `scenario_for` using the recorded seed and sequence encoded in each generated session ID, so valid but incorrectly assigned scenario codes are detected. Its CLI emits a JSON report and exits non-zero on any validation error; unreadable or malformed SQLite files return a report with an error rather than raising a database exception.

## Code sets

* `role`: `user`, `assistant`.
* `region`: `Brisbane`, `Gold Coast`, `Sunshine Coast`, `Darling Downs`, `Wide Bay`, `Central Queensland`, `North Queensland`, `Far North Queensland`, `unknown`.
* `location_basis`: `stated_demo_region`, `service_search_area`, `unknown`.
* `topic_code`: `coverage_benefit_exclusion`, `coverage_waiting_period`, `cost_out_of_pocket`, `claims_process`, `care_navigation`, `provider_search_access`, `primary_care`, `specialist_care`, `emergency_hospital_care`, `pharmacy_medicines`, `mental_health_information`, `sexual_reproductive_health_information`, `respiratory_information`, `gastrointestinal_information`, `preventive_health_information`, `dental_optical_benefits`, `unknown_unclassified`.
* `service_code`: `gp`, `specialist`, `pharmacy`, `emergency`, `hospital`, `mental_health`, `sexual_reproductive_health`, `dental_optical`, `other`, `unknown`.
* `concern_code`: `benefit_exclusion`, `waiting_period`, `out_of_pocket_cost`, `provider_access`, `care_navigation`, `claims_process`, `information_gap`, `other`, `unknown`.
* `answer_outcome`: `resolved`, `unresolved`, `unknown_not_assessed`.
* `scenario_code`: `control_stable`, `mixed_topic_turn`, `respiratory_spike`, `coverage_information_spike`.
* Classification version: `issue-taxonomy-v1` (also stored as the current `taxonomy_version` in `generation_runs`).

The validator imports the code allowlists from `scenarios.py`; this document describes their intended meanings. These labels are assigned by scenario construction and are not inferred from user data.

## Time, geography, and scenarios

Session and actor timestamps are UTC ISO-8601 text. The intended session-date coverage is 2024-10-01 through 2026-09-30. The exact observed timestamp endpoints vary by seeded generation because a time of day is chosen on each endpoint date.

Regions are Queensland display groupings, not precise addresses or geocoded positions. `stated_demo_region` means the fictional text says it is the speaker's demo region. `service_search_area` means the fictional text describes an area for finding a service; it does not mean residence. `unknown` means no location is asserted. No unknown location is imputed.

| Scenario | Intended window | Construction |
|---|---|---|
| `respiratory_spike` | 2025-01-01–2025-03-31 inclusive | A deterministic subset is assigned a respiratory-information topic. Artificial injected pattern. |
| `coverage_information_spike` | 2025-10-01–2025-12-31 inclusive | A deterministic subset is assigned waiting-period, claims-process, or benefit-exclusion questions. Artificial injected pattern. |
| `control_stable` | Outside spike assignment or non-spike controls | Mostly stable/control topics with occasional other or unknown topics. |
| `mixed_topic_turn` | Seeded periodic examples | Two issue labels can apply to one user turn; category-level session counts should deduplicate sessions. |

The injected scenario shares are controlled by the generator and are not a forecast or seasonal estimate. Presence inside a window is not evidence of real-world seasonality.

## Artificial content and personal-data checks

Conversation content is composed from fictional templates in `scenarios.py`. Region text is inserted only for synthetic stated-region or service-search examples. Actor/session/message identifiers are generated demo keys. No device identifiers are generated. The validator flags email-like strings, Australian phone-like strings, explicit student ID/number wording, and long digit sequences in message content. This pattern scan is a QA guardrail, not a guarantee that all personal information is absent or a de-identification method.

## Limitations

The dataset is generated from a fixed taxonomy, template library, seed, and schedule. It does not model natural language diversity, real conversations, real user characteristics, actual provider availability, current insurer policy terms, clinical risk, real care outcomes, or live demand. Topic distributions, unknown shares, actor-repeat rates, answer outcomes, and timing patterns are designed properties of a demo. A label's presence is not an independently validated classification. Do not use these records for clinical, operational, financial, population, or policy decisions.

## Full-run artifact and validation record

The full-run result and exact validator JSON are recorded in [`task-4-report.md`](../../.superpowers/sdd/01-synthetic-conversations/task-4-report.md).

* Generation duration: **3.029 seconds** (local wall time, including CLI process startup).
* File size: **72,208,384 bytes** (68.86 MiB).
* SHA-256: `6d84de1fde6edd95d46858d15cae643c845a895c808b74ac7574251712618e0d`.
* Rows: 35,000 actors; 50,000 sessions; 200,000 messages; 53,533 issue events; 1 generation run.
* Repeated actors: 3,500 actors with multiple sessions (10% of actors); 18,500 sessions assigned to those actors.
* Session timestamp bounds: `2024-10-01T03:35:51Z` to `2026-09-30T21:08:21Z`.
* Scenario counts: `control_stable` 43,660; `coverage_information_spike` 2,967; `mixed_topic_turn` 458; `respiratory_spike` 2,915. Observed spike spans are 2025-01-01T00:31:24Z–2025-03-31T23:35:41Z and 2025-10-01T00:26:31Z–2025-12-31T23:34:27Z respectively, within their expected inclusive calendar windows.
* Topic distribution (issue-event rows): `care_navigation` 6,758; `claims_process` 1,775; `cost_out_of_pocket` 845; `coverage_benefit_exclusion` 1,826; `coverage_waiting_period` 1,824; `dental_optical_benefits` 849; `emergency_hospital_care` 1,683; `gastrointestinal_information` 864; `mental_health_information` 810; `pharmacy_medicines` 7,293; `preventive_health_information` 6,730; `primary_care` 7,299; `provider_search_access` 6,826; `respiratory_information` 3,723; `sexual_reproductive_health_information` 802; `specialist_care` 830; `unknown_unclassified` 2,796.
* Unknown shares: topic 5.223%; service 5.223%; concern 5.223%; answer outcome 27.622%; region 20.188%; location basis 20.188%. Unknown topic/service/concern counts are 2,796 each; unknown outcome count is 14,787; unknown region/location-basis count is 10,094 each.
