# Synthetic Analytics API Contract

**Status:** Unvalidated demo requirements. The Phase 0 questionnaire and priorities have not been validated with stakeholders. This contract describes a local synthetic demonstration only; it is not a customer requirement, a population estimate, or approval to process live conversations.

## Scope and operating boundary

The standalone API reads `data/analytics_demo.sqlite` through read-only SQLite connections and binds to `127.0.0.1` by default. Run it from the repository root:

```powershell
.venv\Scripts\python.exe -m medibridge.analytics_demo --db data/analytics_demo.sqlite --port 8001
```

It exposes aggregate results only. Responses contain no actor, session, message, or event IDs; no message text; no exact timestamps; no postcode; and no row-level export. The local demonstration has no remote deployment or authentication claim.

The persistent response caveat is:

> Synthetic-only demonstration. Suppression is table-local and does not prevent differencing across separate requests; threshold 10 is not evidence of real-data safety.

**Table-local suppression does not prevent differencing across separate requests.** Before any real-data release, add an independently reviewed release design that addresses repeated and overlapping queries, filters, and differencing. The prototype threshold of 10 is not a real-data safety threshold. No live-data disclosure-safety claim is made here.

## Shared request filters

All seven routes accept these query parameters when applicable:

| Parameter | Meaning |
|---|---|
| `start_date`, `end_date` | Inclusive Australia/Brisbane calendar dates, ISO `YYYY-MM-DD`. Either may be omitted. |
| `insurer_id`, `tier_id` | Synthetic values advertised by `/api/demo/meta`; must occur in the current store. |
| `region` | One of the broad fictional regions or `unknown`. |
| `location_basis` | `stated_demo_region`, `service_search_area`, or `unknown`. |
| `topic_code` | Allowlisted synthetic topic taxonomy code. |
| `service_code` | Allowlisted synthetic service taxonomy code. |
| `concern_code` | Allowlisted synthetic concern taxonomy code. |

`/api/demo/trend` also accepts `bucket=month` (default) or `bucket=week`. No route accepts arbitrary dimensions, SQL, or free-text filters. A repeated query parameter is rejected.

### Date and denominator semantics

Date filtering is inclusive in Brisbane local calendar dates and converted to UTC bounds. For example, `start_date=2025-01-01` means `started_at_utc >= 2024-12-31T14:00:00Z`; `end_date=2025-01-31` means `started_at_utc < 2025-01-31T14:00:00Z` (midnight on the following Brisbane day). Brisbane uses UTC+10 for these dates.

The accepted store filter bounds are **2024-10-01 through 2026-09-30**. The metadata date range is the intersection of local dates represented in the store and these accepted filter bounds. A reversed range, a date outside the accepted range, an invalid date, or an unsupported value returns 422.

Session-cohort filters are date, insurer, tier, region, and location basis. These define the selected-session denominator. Topic, service, and concern filters select matching issue-event series or numerators; they do not remove sessions from the denominator of topic rates. The `filters_applied` field at the response root records requested allowlisted filters; each table's own `filters_applied` records the filters actually used for that table. Session-only tables do not echo issue-event filters as applied.

## Common response envelope

Every response includes:

| Field | Meaning |
|---|---|
| `endpoint` | Route name. |
| `synthetic` | Always `true`. |
| `metric`, `unit` | Primary result measure, or null/`metadata` for metadata-only output. |
| `numerator`, `denominator`, `value` | Primary result summary; null for multi-cell tables or suppressed results. A valid no-data count returns zero with denominator zero where applicable. |
| `suppressed` | Whether the primary result contains suppressed cells. |
| `no_data`, `data_state` | Explicit state: `no_data`, `available`, `suppressed`, or `metadata`. A valid zero with a positive denominator is `available`. |
| `cells` | Primary table cells; empty for `/meta`. |
| `tables` | Named result tables. |
| `filters_applied` | Allowlisted query filters received. Table-level versions state which filters affected each table. |
| `provenance` | `synthetic`, metric/generator/taxonomy versions, scenario codes, and selected-cohort `source_span`. |
| `caveat` | Persistent synthetic-only, table-local suppression/differencing warning plus measure-specific caveats. |

Each cell has `dimensions`, nullable `numerator`, `denominator`, `value`, and `distinct_sessions`, a boolean `suppressed`, and nullable `reason_code`. Trend cells also have `series: "current"` and baseline fields described below. Null suppressed values are not zeroes.

## Endpoints and exact measures

### `GET /api/demo/meta`

Returns `available_date_range`, filter `allowlists`, and `suppression` metadata (`min_sessions: 10`, `scope: "table-local"`, `real_data_safety_claim: false`). It returns no sample rows. The envelope uses `data_state: "metadata"`.

### `GET /api/demo/overview`

Returns `selected_sessions`, `question_turns`, `topic_sessions`, and `unknown_topic_share` tables.

- **Selected sessions:** `COUNT(DISTINCT session_id)` after session-cohort filters. This is a count, not a rate.
- **Question turns:** `COUNT(DISTINCT message_id)` for user messages joined to at least one matching issue event. A message with multiple matching tags counts once. `distinct_sessions` is the count of selected sessions with a matching tagged user turn.
- **Topic sessions:** for each `topic_code`, `COUNT(DISTINCT session_id)` among selected matching events. Repeated events in a session count once per topic; a multi-topic session can count once in several topic categories.
- **Unknown-topic share:** numerator is selected sessions with no classified topic, including sessions with no issue event or only `unknown_unclassified`; denominator is all selected sessions. A session with any classified topic is not unknown even if it also has an unclassified tag. This is a session-level measure; event filters are not applied to it.

### `GET /api/demo/topics`

Returns `topic_sessions`, `topic_rates`, `answer_outcome_share`, and `unknown_outcome_events`.

- **Topic sessions:** distinct sessions per topic code after cohort and issue-event filters.
- **Topic rate per 1,000:** `1,000 × distinct selected-cohort sessions with the topic / all selected-cohort sessions`. Unknown/no-topic sessions remain in the denominator. The category topic filter selects the numerator series; it does not shrink the denominator.
- **Answer-outcome share:** by topic and service, `distinct eligible unresolved event IDs / distinct eligible event IDs labelled resolved or unresolved`. Eligible events are from user messages and have a known service code (`service_code != unknown`). `unknown_not_assessed` is excluded from numerator and denominator and counted separately. A session with multiple eligible events contributes once per event to this event-level ratio.
- **Unknown outcome events:** distinct user-question events with `unknown_not_assessed`, shown separately. The unit is events; distinct supporting sessions drive suppression.

`resolved` means the scripted response template contains the answer expected by its scenario metadata. It does not measure comprehension, satisfaction, received care, or claim payment.

### `GET /api/demo/trend`

Returns `topic_code_trend` and `concern_code_trend`. Each cell is one current period/category/region/location-basis result; its rate is `1,000 × distinct sessions with the category / all sessions in the same selected period, region, and location basis`. Unknown region and unknown location basis are excluded from these trend rates. Cohort filters still apply.

- `bucket=month` groups by Brisbane calendar month. When a matching same-month prior-year series exists, a cell includes `baseline_available`, `baseline_numerator`, `baseline_denominator`, `baseline_rate_per_1000`, and `rate_difference_per_1000` (current minus prior-year rate). These derived fields are null when either current or baseline cell is suppressed.
- `bucket=week` groups by Brisbane calendar weeks starting Monday. Weekly cells have no prior-year baseline fields with values.

Any injected respiratory or coverage-information spike is an artificial demonstration scenario, not an observed signal, outbreak, forecast, causal effect, or population trend.

### `GET /api/demo/regions`

Returns `sessions_by_region_and_basis` and `topic_rates`.

- Session counts group the selected cohort by fictional `region` and `location_basis`; `unknown` remains visible. Stated demo region and service-search area remain distinct.
- Region topic rates are `1,000 × distinct sessions tagged with topic / all selected sessions in that region and location basis`. The denominator is local to each region/basis group. Rows with `region=unknown` or `location_basis=unknown` are excluded from region-specific rates.
- A service-search area is not evidence of residence. Display regions are fictional Queensland groupings, not official statistical boundaries.

### `GET /api/demo/coverage-friction`

Returns `topic_sessions`, `question_turns`, `topic_rates`, `answer_outcome_share`, and `unknown_outcome_events`, limited to `coverage_benefit_exclusion`, `coverage_waiting_period`, and `cost_out_of_pocket` topics.

- Topic sessions and question turns use the same distinct-session/topic and distinct-user-message definitions above.
- Topic rates use the whole selected session cohort (including unknown/no-topic sessions) as the denominator.
- Outcome shares use the eligible known-service user-question events for the three coverage topics. Unknown outcomes remain a separate count.

These fictional scripted questions are not claims-friction observations or measures of actual coverage failure.

### `GET /api/demo/quality`

Returns `unknown_topic_share`, `unknown_location_share`, `unclassified_topic_events`, and `unknown_outcome_events`.

- **Unknown topic:** the session-level definition above; cohort filters apply, event filters do not.
- **Unknown location share:** `selected sessions with location_basis=unknown / all selected sessions`. It does not impute geography and is independent of issue-event filters.
- **Unclassified topic events:** count of distinct user-question events whose topic is `unknown_unclassified`, with distinct supporting sessions used for suppression. Event filters apply to the event query.
- **Unknown outcome events:** count of distinct user-question events with `answer_outcome=unknown_not_assessed`, with distinct supporting sessions used for suppression. Event filters apply to the event query.

## Units, taxonomy, and scenario labels

The generated store uses `issue-taxonomy-v1` and generator `synthetic-generator-v1`. Topic, service, concern, and outcome tags are fixed fictional scenario metadata, not inferred medical diagnoses or stakeholder-validated categories.

**Topic codes:**

| Code | Synthetic tag meaning |
|---|---|
| `coverage_benefit_exclusion` | Covered benefits, exclusions, or limits. |
| `coverage_waiting_period` | Waiting period or when a benefit may be available. |
| `cost_out_of_pocket` | Fees, gaps, or expected personal cost. |
| `claims_process` | Claiming, billing, or reimbursement steps. |
| `care_navigation` | Where, when, or how to seek care. |
| `provider_search_access` | Provider search or access; a search area is not residence. |
| `primary_care` | GP or primary-care service question. |
| `specialist_care` | Specialist-service question. |
| `emergency_hospital_care` | Emergency or hospital-service question. |
| `pharmacy_medicines` | Pharmacy or medicine question. |
| `mental_health_information` | Mental-health information or navigation. |
| `sexual_reproductive_health_information` | Sexual or reproductive-health information or navigation. |
| `respiratory_information` | Respiratory symptom or related information; never a case count. |
| `gastrointestinal_information` | Gastrointestinal symptom or related information; never a case count. |
| `preventive_health_information` | Vaccination, screening, or prevention information. |
| `dental_optical_benefits` | Dental/optical benefits, limits, or gaps. |
| `unknown_unclassified` | No reliable synthetic topic assignment. |

**Service codes:** `gp`, `specialist`, `pharmacy`, `emergency`, `hospital`, `mental_health`, `sexual_reproductive_health`, `dental_optical`, `other`, `unknown`. These label the relevant service category, not a completed service use.

**Concern codes:** `benefit_exclusion` (limits/exclusions), `waiting_period` (waiting-time rules), `out_of_pocket_cost` (personal cost), `provider_access` (finding/accessing a provider), `care_navigation` (where/how to seek care), `claims_process` (claim or reimbursement steps), `information_gap` (general information request), `other`, and `unknown`.

**Outcome codes:** `resolved`, `unresolved`, `unknown_not_assessed`. **Location-basis codes:** `stated_demo_region`, `service_search_area`, `unknown`. **Scenario codes:** `control_stable`, `mixed_topic_turn`, `respiratory_spike`, and `coverage_information_spike`.

The respiratory spike is injected into January–March 2025; the coverage-information spike is injected into October–December 2025. Both are artificial test patterns. The `scenario_versions` provenance field lists scenarios present in the selected cohort.

## Suppression and result states

Suppression is run independently for each table with `min_sessions=10`, using explicit distinct-session support for every cell:

- Positive support from 1 through 9 receives `suppressed: true`, `reason_code: "primary_suppression"`, and null numerator, denominator, value, and support.
- If a table has a primary-suppressed cell, the current conservative complementary rule suppresses every other cell in that same table with `reason_code: "complementary_suppression"`.
- Zero-support results can be returned as valid zeroes when they are not hidden as a complementary sibling. Empty selections use `no_data: true`, `data_state: "no_data"`, and denominator 0 where applicable. A zero numerator with a positive denominator is an available zero, not no data.
- Fully hidden tables use `data_state: "suppressed"`; do not render nulls as zeroes.

This is only a demo prototype. Separate requests can still be differenced, even when each individual table has complementary suppression. Do not use this threshold or behavior as a real-data release policy.

## Sample requests

```powershell
curl.exe "http://127.0.0.1:8001/api/demo/meta"
curl.exe "http://127.0.0.1:8001/api/demo/overview?start_date=2025-01-01&end_date=2025-03-31&insurer_id=demo_insurer_a&region=Brisbane"
curl.exe "http://127.0.0.1:8001/api/demo/topics?start_date=2025-01-01&end_date=2025-03-31&topic_code=respiratory_information"
curl.exe "http://127.0.0.1:8001/api/demo/trend?start_date=2025-01-01&end_date=2025-03-31&bucket=week"
curl.exe "http://127.0.0.1:8001/api/demo/regions?location_basis=stated_demo_region"
curl.exe "http://127.0.0.1:8001/api/demo/coverage-friction?service_code=gp"
curl.exe "http://127.0.0.1:8001/api/demo/quality?start_date=2025-01-01&end_date=2025-03-31"
```

The [aggregate sample payloads](analytics-api-samples.json) were collected from the generated full-scale synthetic store. They contain API responses, not the SQLite database or source records.

## Errors

Invalid inputs return HTTP 422 with FastAPI's JSON detail shape:

```json
{"detail":"region is not an allowed value"}
```

Examples include a reversed date range, an unsupported date, an unknown insurer/tier/region/tag value, an unsupported query key (for example `postcode`), a repeated filter, or an unsupported trend bucket. The service is local and read-only; database startup/storage failures are operational errors rather than filter-validation responses.

## Operational validation and latency

The full demo store is generated with:

```powershell
.venv\Scripts\python.exe -m medibridge.analytics_demo.generate --output data/analytics_demo.sqlite --seed 20261005 --sessions 50000
.venv\Scripts\python.exe -m medibridge.analytics_demo.validate data/analytics_demo.sqlite
```

The Task 4 handoff records generated row counts, validator status/hash, live HTTP status and sample totals for all routes, and filtered-chart latency. The target is p95 below one second on the presentation machine; measured latency is a local synthetic-demo observation, not a hosted-service guarantee.
