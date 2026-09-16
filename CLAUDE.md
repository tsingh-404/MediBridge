# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Conventions

- **Always run inside the project venv.** Activate first (`.venv\Scripts\Activate.ps1` on Windows PowerShell, `source .venv/bin/activate` on POSIX), then call `python`/`pip`/`medibridge`/`medibridge-cli` as plain commands. The `.venv/` directory is gitignored — never hardcode `.venv/Scripts/...` paths in scripts, configs, or docs that get committed.

## Commands

(Activate the venv first.)

```bash
# Install
pip install -e .

# Run web app (FastAPI + mounted SPA)
medibridge                  # uvicorn on http://localhost:8000

# Run CLI
medibridge-cli
# or: python -m medibridge.cli

# Ingest data (one-time after clone — requires knowledge/ directory)
python -m medibridge.data.ingest
python -m medibridge.data.ingest --skip-chroma   # skip vector embeddings
python -m medibridge.data.ingest --no-reset      # keep DB file; writers may replace/upsert rows

# Tests
python -m pytest tests/ -v
python -m pytest tests/test_coverage_calculator.py -v

# Build wheel
python -m build
```

**Required env:** `OPENAI_API_KEY` in `.env` (see `.env.example`). Optional: `LANGSMITH_*` vars for tracing.

For test/build tooling use `pip install -e ".[dev]"`.

**`knowledge/` is tracked in this private repo** and contains the source files for ingestion: MBS XML, IMAP TSV, Deed PDF, MBS Book PDF, Item Info PDF, per-insurer markdown, and reference notes.

## Frontend build (`ui/` is no longer no-build)

`ui/*.jsx` is precompiled to `ui/js/*.js` by esbuild. There is no Babel in the
browser and no CDN at runtime — React is vendored in `ui/vendor/` and the fonts
are self-hosted in `ui/fonts/`. **After editing anything in `ui/`, rebuild:**

```bash
cd mobile && npm ci && npm run build:web    # -> ui/js/, ui/vendor/
```

`ui/js/`, `ui/vendor/` and `ui/fonts/` are **committed** — the Dockerfile has no
Node stage, so the server must run with a Python-only toolchain. CI fails if
they drift from the sources.

Critical constraint: `ui/` is a set of **classic scripts sharing globals**, not
ES modules (`shell.jsx` destructures React into the global lexical scope; every
file ends `window.X = X`). So the build is a per-file *transform*, never a
bundle, and identifier minification stays off. Script order in `index.html` is
load-bearing. Adding a file means adding it to `ENTRIES` in
`mobile/scripts/build-web.mjs` **and** to the script tags in `ui/index.html`.

## Mobile (Capacitor)

`mobile/` owns the Capacitor CLI, the web build, and the native projects.

```bash
cd mobile
MB_API_BASE=https://your-api npm run sync   # build:web -> www/ -> cap sync
npm run android                             # open Android Studio
npm run android:apk                         # Windows debug APK (gradlew.bat, needs JDK 17)
npm run ios                                 # open Xcode
npm run ios:sim                             # unsigned simulator compile check (macOS/Xcode)
npm run guard                               # fail on dev-only settings in a release
npm run make:art                            # regenerate icon/splash from mobile/assets-src
npm run fetch:fonts                         # re-vendor webfonts into ui/fonts/
```

`MB_API_BASE` is required — the app bundle has no server of its own, so an empty
`apiBase` would resolve against `capacitor://localhost`. It is written into
`mobile/www/config.js`; the checked-in `ui/config.js` stays same-origin for web.

Native plugins are reached through `window.Capacitor.Plugins` in `ui/native.js`,
never imported — that keeps the no-bundler constraint above intact while still
requiring the npm packages for `cap sync`. On the web `window.Capacitor` is
undefined and every native path no-ops.

OS floors are set by the CSS, not by preference: `oklch()`/`100dvh` need Safari
15.4+ and `color-mix(in oklab)` needs 16.2+, so iOS deployment target is **16.0**
and `minSdkVersion` is **26**. `index.html` also declares an sRGB hex fallback
before each `oklch()`.

## Profiles are device-scoped

`user_profile.device_id` keys one row per install. The mobile app sends
`X-MB-Device` (a UUID in `localStorage`, see `ui/api.js`); requests without the
header — CLI and desktop web — use the shared legacy row (`device_id IS NULL`),
which is also the only one mirrored to `data/user_profile.json`.

The id reaches the agent through the LangGraph config
(`config={"configurable": {"device_id": ...}}`), and the profile-aware tools
(`coverage_calculator`, `waiting_period`, `oshc_rules`) read it from an injected
`RunnableConfig` that is excluded from the schema shown to the model. Use
`profile.device_scope()` for any new query against `user_profile`.

## Architecture

Dual-store agentic RAG: SQLite for structured MBS/insurer/clinic data, ChromaDB for semantic policy search. LangGraph drives a ReAct loop over 6 tools.

```
CLI (cli.py + onboarding.py)
  └─> LangGraph ReAct agent (agent/graph.py)
        └─> 6 LangChain @tools (tools/)
              ├─> SQLite: mbs_items, insurer_tiers, oshc_coverage_rules, clinics, ...
              └─> ChromaDB: mbs_descriptions, oshc_rules
```

**Data layer layout (`src/medibridge/data/`):**

| Module | Role |
|--------|------|
| `db.py` | Connection helpers only: `connect`, `get_conn`, `init_schema`, `reset_db` |
| `schema.py` | All `CREATE TABLE` / `CREATE INDEX` / FTS5 DDL |
| `queries.py` | Read helpers: `get_item_by_number`, `search_items_by_keyword`, `search_clinics`, `ALLOWED_CLINIC_TYPES`, … |
| `parsers/` | Raw input → in-memory: `mbs_xml`, `imap`, `oshc_deed`, `mbs_book`, `mbs_item_info`, `knowledge_md` |
| `ingest/` | In-memory → SQLite/Chroma writes: `mbs`, `insurers`, `oshc_rules`, `clinics`, `chroma`. Orchestrator in `pipeline.py`; entry point in `__main__.py` |
| `vectorstore.py` | Chroma client + add/query helpers |

**Other key modules:**

| Module | Role |
|--------|------|
| `config.py` | Paths (incl. `CLINICS_SOURCE_PATH`), env vars (pydantic-settings), model names (`CHAT_MODEL = "gpt-5-nano"`, `EMBEDDING_MODEL = "text-embedding-3-small"`). `ROOT_DIR` overridable via `MEDIBRIDGE_ROOT`; `DATA_DIR`/`KNOWLEDGE_DIR` via `MEDIBRIDGE_DATA_DIR`/`MEDIBRIDGE_KNOWLEDGE_DIR`. |
| `models/` | Pydantic data classes: `MBSItem`, `CoverageResult`, `UserProfile`, `Insurer`, `InsurerTier` |
| `tools/` | 6 tools: `search_mbs_items` (hybrid RRF), `lookup_mbs_item`, `calculate_oshc_coverage`, `check_waiting_period`, `query_oshc_rules`, `search_clinics` |
| `agent/graph.py` | `build_graph()` — LangGraph state machine entry point |
| `agent/prompts.py` | `SYSTEM_TEMPLATE` + `system_prompt()` — injected per-turn with live user profile |

**Adding a new data source:** government/policy sources usually live under `knowledge/`; structured seed files live under `data/sources/`. Add a parser under `data/parsers/`, add a writer under `data/ingest/<source>.py`, wire it into `data/ingest/pipeline.py:ingest_sqlite()`, and extend `data/schema.py` with the table.

## Coverage Calculator Logic

Two eligibility gates, strict order:
1. **IMAP gate** — item with no IMAP mapping → excluded (non-MBS program, e.g. CDBS)
2. **Insurer exclusions** — keyword match on item text (cosmetic, IVF, repatriation…)

Benefit priority: `benefit_100/85/75` XML fields → fallback to `schedule_fee × tier_pct`. Cap: benefit ≤ schedule_fee (Clause 3.6d). In-hospital always 100%.

Special cases: anaesthesia (`benefit_type='A'`) = time-based estimate + warning; derived-fee items (`fee_type='D'`) = cannot auto-calculate.

## Hybrid Search (search_mbs_items)

Reciprocal rank fusion: 60% vector (ChromaDB `mbs_descriptions`) + 40% FTS5 (SQLite `mbs_fts`, Porter stemming). Results hydrated from SQLite.

## Clinic Search (search_clinics)

Queensland clinic directory (~1,450 rows after repair). Source CSV at `data/sources/clinics_qld.csv` is ingested into the `clinics` table in `medibridge.db`. Ingest repairs the scrape: postcodes recovered from the address tail, duplicate per-service-type listings merged into comma-joined `type` values. Filters: `postcode` and/or `suburb` (case-insensitive), optional `clinic_type` ∈ {GP, Psychology, Pharmacy, Psychiatry, Hospital}. The `type` column is comma-separated multi-value — the query wraps it with commas to avoid `Psych*` substring collisions. `phone`, `hours`, `latitude`, `longitude` are NULL across the dataset; the tool drops them from output.

## Tracked and Ignored Data

- `data/` — committed pre-built DB, ChromaDB, and source seeds (only `user_profile.json` and backup dumps are gitignored)
- `data/sources/clinics_qld.csv` — raw QLD clinics CSV (read-only seed input, repaired at ingest)
- `knowledge/` — tracked source documents for ingestion in this private repo
- `.env` — secrets

## CI

`.github/workflows/mobile.yml` runs on PRs and `main` pushes:

- `web-assets`: `npm ci`, `npm run build:web`, then verifies committed `ui/js`, `ui/vendor`, and `ui/fonts` do not drift.
- `backend`: installs `.[dev]` and runs `python -m pytest tests/ -v`.
- `android`: Node 22, JDK 17, Android SDK, `npm run guard`, `npm run sync`, then `./gradlew assembleDebug`.
- `ios`: Node 22, `npm run guard`, `npm run sync`, then an unsigned simulator `xcodebuild`.

`mobile/capacitor.config.json` must stay production-clean in git. Do not commit `server.url`, `server.cleartext`, or `android.allowMixedContent`; use uncommitted local config changes only for LAN/http debugging.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
