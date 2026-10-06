# MediBridge — Architecture & Design

## Overview

MediBridge is an agentic RAG (Retrieval-Augmented Generation) CLI chatbot that answers OSHC (Overseas Student Health Cover) coverage and cost questions for international students in Australia. A user types a natural-language question; a LangGraph ReAct agent decides which tools to call, retrieves relevant MBS item data and policy rules, computes out-of-pocket costs, and returns a cited, dollar-precise answer.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI (rich)                           │
│  onboarding → /profile /item /reset /quit                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ HumanMessage
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 LangGraph ReAct Agent                        │
│  ┌──────────────┐   tool_calls?   ┌───────────────────────┐ │
│  │  agent node  │────────────────►│      ToolNode         │ │
│  │ (GPT-5-mini) │◄────────────────│  (parallel dispatch)  │ │
│  └──────────────┘   ToolMessages  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                      │ invokes
         ┌────────────┼──────────────────────┐
         ▼            ▼                      ▼
   search_mbs   calculate_oshc        query_oshc_rules
   lookup_mbs   check_waiting_period
         │                                   │
         ▼                                   ▼
┌─────────────────┐                ┌──────────────────┐
│  SQLite + FTS5  │                │    ChromaDB       │
│  medibridge.db  │                │  (2 collections)  │
└─────────────────┘                └──────────────────┘
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| LLM | OpenAI GPT-5-mini via `langchain-openai` |
| Embeddings | OpenAI `text-embedding-3-small` |
| Agent framework | LangGraph (ReAct loop) |
| Tool framework | LangChain `@tool` decorators |
| Structured store | SQLite 3 with FTS5 virtual table |
| Vector store | ChromaDB (persistent, local, HNSW cosine) |
| Data models | Pydantic v2 |
| Config | pydantic-settings + `.env` |
| CLI | Rich (panels, markdown, tables, prompts) |
| Observability | LangSmith (auto-traced via env vars) |
| PDF parsing | PyMuPDF (`fitz`) |
| Python | 3.11+ |

---

## Repository Layout

```
MediBridge/
├── src/medibridge/
│   ├── config.py               # All paths, model config, Settings, LangSmith init
│   ├── cli.py                  # Entry point — Rich REPL loop
│   ├── onboarding.py           # First-run profile wizard
│   ├── __main__.py             # python -m medibridge
│   │
│   ├── models/
│   │   ├── mbs_item.py         # MBSItem, IMAPMapping (Pydantic)
│   │   ├── insurer.py          # Insurer, InsurerTier, UserProfile (Pydantic)
│   │   └── coverage.py         # CoverageResult (Pydantic)
│   │
│   ├── data/
│   │   ├── db.py               # SQLite schema, CRUD, FTS5, deed rules
│   │   ├── seed_insurers.py    # Hardcoded insurer/tier/exclusion/waiting data
│   │   ├── parse_mbs_xml.py    # MBS XML → MBSItem stream
│   │   ├── parse_imap.py       # IMAP TSV → IMAPMapping stream (cp1252)
│   │   ├── parse_oshc_deed.py  # Deed PDF → text chunks
│   │   ├── parse_mbs_book.py   # MBS Book PDF → text chunks
│   │   ├── parse_mbs_item_info.py # MBS Item Info PDF → text chunks
│   │   ├── parse_knowledge_md.py  # .claude/knowledge/insurers/*.md → chunks
│   │   ├── vectorstore.py      # ChromaDB setup, add/query helpers
│   │   └── ingest.py           # Orchestrator (CLI: python -m medibridge.data.ingest)
│   │
│   ├── tools/
│   │   ├── mbs_lookup.py       # search_mbs_items, lookup_mbs_item
│   │   ├── coverage_calculator.py  # calculate_oshc_coverage
│   │   ├── waiting_period.py   # check_waiting_period
│   │   └── oshc_rules.py       # query_oshc_rules
│   │
│   └── agent/
│       ├── state.py            # MediBridgeState TypedDict
│       ├── prompts.py          # System prompt + user context injection
│       └── graph.py            # LangGraph StateGraph (ReAct topology)
│
├── tests/
│   └── test_coverage_calculator.py  # Golden-case tests
│
├── knowledge/                  # Tracked source data and documents
│   ├── data/MBS-current.XML
│   ├── data/MBSONLINE_IMAP-current.TXT
│   ├── deed-for-the-provision-of-overseas-student-health-cover-*.pdf
│   ├── MBS Book - March 2026.pdf
│   └── MBS Item Information.pdf
│
├── data/                       # Generated artifacts (gitignored)
│   ├── medibridge.db
│   ├── chroma/
│   └── user_profile.json
│
├── .claude/knowledge/insurers/ # Per-insurer markdown reference files
├── .env                        # Secrets (gitignored)
├── pyproject.toml
└── ARCHITECTURE.md
```

---

## Data Pipeline (Ingest)

Ingest is a one-time (or re-run on data update) offline process. Run order matters.

```
python -m medibridge.data.ingest [--skip-chroma] [--no-reset]
```

### Stage 1 — SQLite

```
MBS XML ──► parse_mbs_xml ──► MBSItem[] ──► mbs_items table
IMAP TSV ─► parse_imap ─────► IMAPMapping[] ─► imap_mappings table
                                              ─► categories, groups, btos_types (lookup tables)
                                              ─► mbs_fts (FTS5 virtual table)
seed_insurers ──────────────────────────────► insurers, insurer_tiers,
                                              insurer_exclusions, insurer_waiting_periods
db.DEED_RULES ──────────────────────────────► oshc_coverage_rules
```

**Key implementation details:**

- `parse_mbs_xml` streams `<Data>` elements via `ET.iterparse` — low memory for large XML. Items with `ItemEndDate` sentinel `31/12/9999` are normalized to `NULL` (active).
- `parse_imap` opens with `encoding="cp1252"` (Windows-1252 encoding). Leading zeros stripped from `item_num` to match XML item numbers (`_strip_leading_zeros`).
- `mbs_fts` is a plain FTS5 virtual table (not external content). Populated by explicit `INSERT ... SELECT` joining `mbs_items` and `imap_mappings`. Porter unicode61 tokenizer enables stemming (`consultation` matches `consultations`).
- Lookup tables (`categories`, `groups`, `btos_types`) built from `imap_mappings` via `INSERT OR IGNORE ... SELECT DISTINCT`.
- `seed_insurers` runs `DELETE` + bulk insert for exclusions/waiting to allow idempotent re-runs.

### Stage 2 — ChromaDB (requires OPENAI_API_KEY)

```
SQLite mbs_items ──► text documents ──► OpenAI embed ──► mbs_descriptions collection
Deed PDF ─────────┐
MBS Book PDF ─────┼─► text chunks ──► OpenAI embed ──► oshc_rules collection
Item Info PDF ────┤
knowledge/*.md ───┘
```

- Each MBS item becomes a document: `"MBS Item {num}: {description}\nCategory: ...\nGroup: ...\nService Type: ..."`.
- Metadata stored per item: `item_num`, `schedule_fee`, `benefit_type`, `benefit_100/85/75`, `category`, `group_code`, `btos_desc`, `is_gp_item`.
- Rule chunks carry: `source` (`oshc_deed` / `book` / `info` / `md`), `section`, `page_num`, `insurer_id`.
- Batch size: 100 items per ChromaDB `add` call.
- Collections use HNSW cosine distance (`metadata={"hnsw:space": "cosine"}`).

---

## SQLite Schema

### Core tables

**`mbs_items`** — 23 columns. Primary source of truth for every MBS item.

| Column | Notes |
|---|---|
| `item_num` | TEXT PK, stripped of leading zeros |
| `description` | Full item description |
| `schedule_fee` | Dollar amount; NULL for derived-fee items |
| `benefit_100/85/75` | Pre-computed benefit amounts from XML |
| `benefit_type` | `E`=GP/unreferred, `C`=specialist, `A`=anaesthesia, `D`=derived |
| `fee_type` | `D`=derived (formula, not fixed fee) |
| `category` | `1`–`8` = standard MBS; `10` = CDBS (not OSHC-covered) |
| `group_code` | e.g. `A1`, `A4`, `T8` |
| `item_end_date` | NULL = active (sentinel normalized at parse time) |

**`imap_mappings`** — Government IMAP (Item Mapping) table. Maps standard MBS items to structured category/group/BTOS hierarchy. **Only standard MBS items have IMAP rows.** CDBS category 10 items have 0 IMAP mappings.

**`insurer_tiers`** — 22 columns per tier. Benefit percentages, pharmaceutical limits, feature flags.

| Column | Notes |
|---|---|
| `gp_benefit_pct` | e.g. 100 |
| `specialist_benefit_pct` | e.g. 85 or 100 |
| `in_hospital_benefit_pct` | Always 100 (deed minimum) |
| `pharma_copayment_type` | `pbs_copay` or `flat_30` |
| `has_repatriation` | 0/1 feature flag |
| `has_mental_health_extras` | 0/1 feature flag |
| `waived_psychiatric_waiting` | 0/1 |

**`insurer_exclusions`** — Per-tier exclusion rows. `is_deed_exclusion=1` for the 3 deed Schedule 3 exclusions; `is_deed_exclusion=0` for insurer-specific exclusions (cosmetic, IVF, repatriation, non-PBS drugs, international transport).

**`insurer_waiting_periods`** — Per-tier, per-condition waiting months. Bupa overrides applied after default insert.

**`user_profile`** — Single row (`id=1`). Stores `tier_id`, `cover_type`, `policy_start_date`.

**`oshc_coverage_rules`** — 14 hardcoded deed rules (benefit rates, waiting periods, exclusions) for `query_oshc_rules` RAG queries.

### Indexes

```sql
idx_mbs_category      ON mbs_items(category)
idx_mbs_group         ON mbs_items(group_code)
idx_mbs_benefit_type  ON mbs_items(benefit_type)
idx_mbs_active        ON mbs_items(item_end_date) WHERE item_end_date IS NULL  -- partial
idx_imap_mapped       ON imap_mappings(mapped_item)
idx_imap_btos         ON imap_mappings(btos_code)
idx_coverage_type     ON oshc_coverage_rules(rule_type)
```

### FTS5 virtual table

```sql
CREATE VIRTUAL TABLE mbs_fts USING fts5(
    item_num UNINDEXED,
    description,
    category_desc,
    group_desc,
    subgroup_desc,
    btos_desc,
    tokenize = 'porter unicode61'
);
```

`item_num` is `UNINDEXED` (lookup key, not searchable). Porter stemming handles morphological variants.

---

## Data Models (Pydantic)

### `MBSItem`
Mirrors the `mbs_items` table. All optional fields default `None`. `item_end_date=None` means active.

### `IMAPMapping`
Mirrors `imap_mappings`. Rich hierarchy: `category_code/desc`, `group_code/desc`, `subgroup_code/desc`, `subheading_code/desc`, `btos_code/desc`.

### `CoverageResult`
Output of the coverage calculator.

```python
class CoverageResult(BaseModel):
    item_num: str
    description: str
    setting: str               # in_hospital | out_of_hospital
    provider_type: str | None  # gp | specialist | None
    schedule_fee: float | None
    oshc_benefit: float
    estimated_out_of_pocket: float
    is_covered: bool
    benefit_pct: float
    waiting_period_months: int | None = None
    waiting_remaining_months: int | None = None
    notes: list[str] = []
```

### `UserProfile`
Thin profile: `tier_id`, `cover_type` (`single/couple/family/sole_parent`), `policy_start_date` (ISO-8601).

---

## Agent Architecture

### LangGraph ReAct Topology

```
START → agent_node → (tool_calls?) → tools → agent_node → ... → END
```

- **`agent_node`**: Prepends `SystemMessage` if not already present, invokes LLM with tools bound.
- **`should_continue`**: Edge function — if last message has `tool_calls`, route to `"tools"`; else `END`.
- **`ToolNode`**: LangGraph built-in. Dispatches each tool call, returns `ToolMessage` results.
- **State**: `MediBridgeState` accumulates `messages` via `add_messages` reducer (LangGraph append semantics). Also carries `mbs_results`, `selected_item`, `coverage_result` for structured state.

### System Prompt Design

The prompt (`agent/prompts.py`) contains:

1. **Role statement** — OSHC advisor, cite item numbers and dollar figures.
2. **Core OSHC rules** — deed minimums (85% OOH, 100% in-hospital, ambulance 100%, pharma cap).
3. **Waiting periods** — deed Schedule 4 defaults.
4. **Exclusions** — deed Schedule 3 (only 3 exclusions).
5. **User context** — dynamically injected at call time: `Insurer / Tier / Cover type / Policy start date` fetched from `user_profile` JOIN `insurer_tiers` JOIN `insurers`.
6. **REASONING SEQUENCE** — mandatory 4-step protocol:
   - Step 1: Classify service type. Dental/optical/allied health → answer directly without tool calls.
   - Step 2: `search_mbs_items` to find item.
   - Step 3: `calculate_oshc_coverage` with item and setting.
   - Step 4: Interpret result — `is_covered=False` → report reason from `notes`; `is_covered=True` → report benefit and OOP gap.
7. **Tool usage rules** — never fabricate item numbers or fees.
8. **Disclaimer** — "Informational only — confirm with your insurer."

---

## Tools (5 total)

### 1. `search_mbs_items(query, top_k=5)` — Hybrid Search

Combines vector and keyword search with reciprocal rank fusion:

```
Vector score  = 1.0 - cosine_distance  (from ChromaDB, top 20)
FTS5 score    = 1 / (rank_position + 1) (from SQLite, top 20)
Merged score  = 0.6 × vector_score + 0.4 × fts5_score
```

Top `top_k` items hydrated from SQLite (`get_item_by_number` for full detail). Graceful degradation: if ChromaDB unavailable, FTS5 only.

### 2. `lookup_mbs_item(item_num)` — Exact Lookup

Direct `get_item_by_number` call. Strips leading zeros. Returns full item dict with `category_desc`, `group_desc`, `btos_desc` via correlated subqueries on `imap_mappings`.

### 3. `calculate_oshc_coverage(item_num, setting)` — Coverage Calculator

Core business logic. Calls `_calculate()` which executes gates in strict order:

```
1. IMAP gate (deed eligibility)
   └── No IMAP row → is_covered=False, reason="not in standard MBS"

2. Derived-fee gate
   └── fee_type='D' and no schedule_fee → is_covered=False, reason="formula-based fee"

3. Anaesthesia note
   └── benefit_type='A' → append time-based estimate warning to notes

4. Insurer exclusion check
   └── keyword match on item text vs insurer_exclusions (cosmetic/IVF/repatriation)

5. Benefit percentage determination
   in_hospital  → tier.in_hospital_benefit_pct (always 100)
   out_of_hospital:
     GP item    → tier.gp_benefit_pct + provider_type="gp"
     specialist → tier.specialist_benefit_pct + provider_type="specialist"

6. Benefit amount computation (priority order)
   in_hospital  → oshc_benefit = schedule_fee (100% of fee, not benefit field)
   100% tier    → use benefit_100 field if present
   85% tier     → use benefit_85 field if present
   75% tier     → use benefit_75 field if present
   fallback     → schedule_fee × benefit_pct / 100 + note

7. Clause 3.6d cap: oshc_benefit = min(oshc_benefit, schedule_fee)
8. out_of_pocket = max(schedule_fee - oshc_benefit, 0)
```

**GP item detection** (`_is_gp_item`): `benefit_type='E'` OR group in `{A1, A2}`.

**IMAP gate rationale**: The IMAP TSV is the government's own mapping of standard MBS items. CDBS category 10 items have 0 IMAP mappings by design — they belong to a separate program outside OSHC deed Schedule 1. This makes IMAP presence a principled, non-hardcoded deed-eligibility gate.

### 4. `check_waiting_period(item_num, condition=None)` — Waiting Checker

1. Looks up item to get `group_code`.
2. Classifies condition: nil-waiting groups (`A1, A2, A22, A23, A46`) → `gp_outpatient`; else `general_hospital`.
3. Queries `insurer_waiting_periods` for user's tier. Falls back to deed defaults if no profile.
4. Computes months elapsed since `policy_start_date` → months remaining → `served: bool`.

Condition override accepted: `pre_existing_non_psych`, `pre_existing_psychiatric`, `pregnancy`, `psychiatric_hospital`, `ambulance`, `pharmaceutical`.

### 5. `query_oshc_rules(question, n_results=5)` — Policy RAG

Queries ChromaDB `oshc_rules` collection. If user profile exists, filters by `$or: [{insurer_id: user_insurer}, {source: "oshc_deed"}]` so results are relevant to the user's insurer. Returns `text`, `source`, `section`, `page_num`, `insurer_id` per chunk.

---

## Knowledge Sources

### Structured (SQLite)

| Source | Content | Volume |
|---|---|---|
| MBS XML | All active MBS items: fees, benefits, types | ~6,000+ items |
| IMAP TSV | Item → category/group/BTOS mapping | ~6,000+ rows |
| seed_insurers.py | 6 insurers, 9 tiers, exclusions, waiting periods | Hardcoded |
| DEED_RULES | 14 benefit rate / waiting / exclusion rules | Hardcoded |

### Vector (ChromaDB)

| Collection | Source | Content |
|---|---|---|
| `mbs_descriptions` | SQLite items | Embedded item docs for semantic search |
| `oshc_rules` | Deed PDF, MBS Book PDF, Item Info PDF, knowledge/*.md | Policy text chunks |

### Knowledge Markdown (`.claude/knowledge/insurers/`)

Per-insurer markdown files (e.g. `allianz-care-australia.md`) parsed by `parse_knowledge_md`. Each file chunked and embedded into `oshc_rules` collection with `source="md"` and `insurer_id` metadata.

---

## Insurer Data

### 6 Insurers

| ID | Name |
|---|---|
| `allianz` | Allianz Care Australia |
| `bupa` | Bupa Australia |
| `cbhs` | CBHS International Health |
| `medibank` | Medibank Private |
| `ahm` | ahm OSHC |
| `nib` | nib OSHC |

### 9 Tiers

| tier_id | GP% | Spec% | Pharma type | Notable features |
|---|---|---|---|---|
| `allianz_essentials` | 100 | 85 | PBS copay | - |
| `allianz_standard` | 100 | 85 | PBS copay | Repatriation up to $100k |
| `bupa_oshc` | 100 | 100 | PBS copay | Extras addon, psych waiting waived |
| `cbhs_standard` | 100 | 100 | PBS copay | Online doctor, ED fee $160 |
| `cbhs_essentials` | 85 | 85 | PBS copay | - |
| `medibank_essentials` | 100 | 85 | flat $30 copay | - |
| `medibank_comprehensive` | 100 | 85 | flat $30, no per-item cap | Repatriation, mental health $200, boarder $150 |
| `ahm_oshc` | 100 | 85 | PBS copay | - |
| `nib_oshc_core` | 100 | 85 | PBS copay | - |

### Exclusions (per tier)

**Deed exclusions** (3, `is_deed_exclusion=1`):
1. Treatment outside Australia (unless medical repatriation)
2. Compensable injury/illness (workers comp, motor vehicle)
3. Treatment that is not medically necessary

**Insurer exclusions** (5, `is_deed_exclusion=0`):
1. Cosmetic surgery / elective cosmetic
2. Assisted reproductive services / IVF
3. Pre-arranged treatment before arrival in Australia
4. Non-PBS medications and over-the-counter drugs
5. Transportation into or out of Australia (except medical repatriation)

Insurer exclusion matching uses keyword lookup (`_EXCLUSION_KEYWORDS`) against item `description + category_desc + group_desc + btos_desc`.

### Waiting Periods (default, all tiers)

| Condition | Months |
|---|---|
| `gp_outpatient` | 0 |
| `ambulance` | 0 |
| `pre_existing_psychiatric` | 2 |
| `psychiatric_hospital` | 2 |
| `general_hospital` | 2 |
| `pharmaceutical` | 0 |
| `pre_existing_non_psych` | 12 |
| `pregnancy` | 12 |

Bupa overrides: `pre_existing_psychiatric → 0`, `general_hospital → 0`.

---

## CLI & User Flow

### Startup sequence

```
1. Check data/medibridge.db exists (else print ingest instruction)
2. Check OPENAI_API_KEY set
3. Print banner
4. Check user_profile (id=1) exists → if not, run onboarding wizard
5. build_graph() → compile LangGraph
6. Enter REPL loop
```

### Commands

| Command | Action |
|---|---|
| (question) | Send to agent, stream result |
| `/quit` | Exit |
| `/reset` | Clear message history |
| `/item <num>` | Direct MBS item lookup (no LLM) |
| `/profile` | Re-run onboarding, rebuild graph with new context |

### Onboarding wizard

1. List all insurers (from DB).
2. User picks insurer number.
3. List tiers for that insurer; user picks tier (or auto-select if only one).
4. User enters policy start date (YYYY-MM-DD, validated).
5. User picks cover type (`single/couple/family/sole_parent`).
6. Written to `user_profile` table AND `data/user_profile.json` (backup).

---

## Configuration (`config.py`)

```python
CHAT_MODEL = "gpt-5-mini"
EMBEDDING_MODEL = "text-embedding-3-small"
EMBED_BATCH_SIZE = 100
MBS_BOOK_EXPLANATORY_PAGES = (1, 15)  # page range for MBS Book PDF parse
```

### LangSmith integration

`_enable_langsmith()` runs at module import. Pushes `LANGSMITH_*` vars to `os.environ` if `langsmith_api_key` is set. Also sets legacy `LANGCHAIN_*` aliases. LangChain SDK reads these automatically — no explicit callback setup required.

### pydantic-settings

`Settings(BaseSettings)` loads from `.env` at project root. Fields: `openai_api_key`, `langsmith_tracing`, `langsmith_api_key`, `langsmith_project` (default `"medibridge"`), `langsmith_endpoint`.

---

## Coverage Logic — OSHC Deed Implementation

### Two-layer architecture

**Layer 1 — Deed (OSHC Schedule 1)**

OSHC covers services for which a Medicare benefit is payable. The IMAP gate implements this: if no IMAP row exists for an item, it is not in the standard MBS and therefore not covered by the deed. This correctly excludes:
- CDBS (Child Dental Benefits Schedule) — category 10, 0 IMAP mappings
- Any future non-MBS government program items

**Layer 2 — Insurer-specific**

Insurer exclusions are stored in `insurer_exclusions` and matched against item context text using keyword patterns. The agent system prompt's Step 1 reasoning sequence adds a third layer: the LLM classifies service type before any tool calls, catching clearly non-covered services (routine dental at dentist, optical, allied health at private clinic) without wasting tool calls.

### Why NOT hardcoded category filters

Category 4 (Oral and Maxillofacial Services) items ARE covered when in-hospital with an appropriate specialist. Category-based filtering would incorrectly exclude legitimate claims. The IMAP gate is the correct deed-derived gate: only items in the standard MBS program have IMAP rows; non-MBS programs do not.

---

## Testing

Tests live in `tests/test_coverage_calculator.py`. Each test:
1. Creates a fresh in-memory SQLite (tmp_path).
2. Inserts specific MBS items and IMAP mappings.
3. Seeds all insurers (`seed_all`).
4. Sets user profile via `_set_profile`.
5. Calls `_calculate` directly (bypasses LLM).
6. Asserts `is_covered`, `benefit_pct`, `oshc_benefit`, `estimated_out_of_pocket`, `provider_type`.

| Test | Scenario |
|---|---|
| `test_allianz_essentials_gp_100pct` | GP item 23, OOH → 100%, $0 OOP |
| `test_allianz_essentials_specialist_85pct` | Specialist item 104, OOH → 85%, $15.20 OOP |
| `test_cbhs_standard_specialist_100pct` | Specialist item 104, CBHS Std 100% tier → $0 OOP |
| `test_in_hospital_100pct` | Any item, in_hospital → 100%, $0 OOP |
| `test_no_imap_mapping_excluded` | Cat 10 dental item (no IMAP row) → `is_covered=False` |
| `test_imap_mapped_item_not_excluded_by_imap_gate` | Cat 4 oral surgery with IMAP row → `is_covered=True` |

Run: `python -m pytest tests/`

---

## Known Constraints & Design Decisions

| Decision | Rationale |
|---|---|
| SQLite not PostgreSQL | Single-user CLI, no concurrency requirement, zero-setup |
| FTS5 plain table (not external content) | External content requires rowid on source; the enriched view has none |
| IMAP as deed gate (not category filter) | Category 4 IS covered in-hospital; IMAP absence is structural for non-MBS programs |
| Benefit fields from XML (not computed) | Government pre-computes 75/85/100% amounts; use them for accuracy |
| Clause 3.6d cap | Benefit cannot exceed actual charge (deed clause) |
| cp1252 encoding for IMAP file | File uses Windows-1252 smart quotes (byte 0x93) |
| system_prompt() called at each turn | Keeps user context current if profile changes mid-session |
| LangSmith enabled at config import | Tracing active for all LangChain calls without per-call setup |
