# MediBridge

**MediBridge** is an agentic RAG assistant for **Overseas Student Health Cover (OSHC)** in Australia. It answers natural-language questions about MBS items, insurer benefits, waiting periods, policy rules, and (for Queensland) clinic lookup. A **LangGraph** ReAct agent orchestrates tools over **SQLite** (structured MBS, insurers, clinics) and **ChromaDB** (semantic search over item text and policy chunks).

Available via a **Rich terminal CLI**, a **web UI** (static SPA + streaming chat), the **HTTP API** under `/api`, and Capacitor **iOS/Android** apps.

---

## Features

- **Hybrid MBS search** — Reciprocal rank fusion of Chroma embeddings (60%) and SQLite FTS5 keyword search (40%); degrades to FTS-only if the vector store is unavailable.
- **Coverage calculator** — IMAP eligibility gate, insurer exclusion keywords, benefit fields from MBS XML (with schedule-fee cap per deed), in-hospital 100%, anaesthesia and derived-fee handling.
- **Waiting periods** — Tier-specific rules with deed defaults.
- **Policy RAG** — `query_oshc_rules` over deed PDF, MBS book/item PDFs, and curated insurer markdown in Chroma.
- **Clinic search (Queensland)** — Filter by postcode and/or suburb; optional clinic type; data ingested from a repaired CSV seed.
- **Parallel tool calling** — LangGraph agent issues multiple independent lookups concurrently in a single turn.

---

## Prerequisites

- **Python 3.11+**
- **OpenAI API key** — used for chat (`gpt-5-nano`) and embeddings (`text-embedding-3-small`)
- **For mobile builds:** Node.js 22, JDK 17 and Android Studio for Android, and macOS/Xcode for iOS
- **Optional:** LangSmith env vars for tracing (see `.env.example`)

---

## Installation

```bash
# Create and activate a virtual environment
python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

# Install in editable mode
pip install -e .

# Include test and wheel build tooling
pip install -e ".[dev]"
```

> [!IMPORTANT]
> Always activate the venv before running `medibridge`, `medibridge-cli`, or any `python -m medibridge.*` command. Never hardcode `.venv/Scripts/...` paths in scripts or configs.

---

## Configuration

Copy `.env.example` to `.env` and set at minimum:

```bash
OPENAI_API_KEY=sk-...
```

Optional LangSmith tracing:

```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_pt_...
LANGSMITH_PROJECT=medibridge
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
```

Runtime paths (SQLite, Chroma, profile JSON, seed sources) are defined in `src/medibridge/config.py`.

---

## Data and knowledge

This private repository includes the source files currently used for ingestion under `knowledge/`:

| Path | Purpose |
|------|---------|
| `knowledge/data/MBS-XML-20260301-version 2.XML` | MBS XML export |
| `knowledge/data/20260301_MBSONLINE_IMAP.TXT` | IMAP TSV (Windows-1252) |
| `knowledge/documents/deed-for-the-provision-of-overseas-student-health-cover-1-july-2025.pdf` | OSHC deed |
| `knowledge/documents/MBS Book - March 2026.pdf` | MBS book |
| `knowledge/documents/MBS Item Information.pdf` | Item information PDF |
| `knowledge/insurers/` | Per-insurer markdown (and comparisons if present) |
| `knowledge/reference/` | Additional reference markdown for rules embedding |

Place **`data/sources/clinics_qld.csv`** in the repo so clinic ingestion can run; if missing, ingest continues and prints a skip message. The CSV is repaired during ingest (postcodes recovered from the address tail, duplicate listings merged into comma-joined `type` values).

The prebuilt runtime artifacts (`data/medibridge.db`, `data/chroma/`) are committed so the app and Docker image can run without re-ingesting. Only per-user runtime state such as `data/user_profile.json` is gitignored.

---

## Ingestion

After `knowledge/` is in place, run:

```bash
python -m medibridge.data.ingest
```

| Flag | Effect |
|------|--------|
| `--skip-chroma` | SQLite and clinics only; no embeddings |
| `--no-reset` | Do not delete the SQLite file before writing; individual writers may still replace or upsert rows |

> [!NOTE]
> Chroma ingestion requires `OPENAI_API_KEY`. If unset, vector indexing is skipped with a warning.

---

## Usage

### Web app

```bash
medibridge
```

Starts **Uvicorn** on **http://localhost:8000**. The React SPA is served from `ui/`; JSON routes are mounted under `/api` (chat, profile, insurers, MBS helpers, coverage, clinics).

### CLI

```bash
medibridge-cli
# or
python -m medibridge.cli
```

On first use, runs an onboarding wizard (insurer, tier, policy start date, cover type). Commands: `/quit`, `/reset`, `/item <num>`, `/profile`.

### Mobile (Capacitor)

The `mobile/` package owns the Capacitor CLI, the web asset build, and the native iOS/Android projects. The app bundle has no local API server, so mobile builds must point at a deployed API origin:

```bash
cd mobile
npm ci
MB_API_BASE=https://your-api.example npm run sync
npm run android      # open Android Studio
npm run ios          # open Xcode
npm run guard        # fail on dev-only release settings
```

The web UI in `ui/` is precompiled into committed `ui/js/` files with a per-file esbuild transform, not bundled. `ui/vendor/` and `ui/fonts/` are also committed so the Python server and Docker image need no Node runtime. Mobile sends `X-MB-Device` from native WebViews so each install has its own profile row; desktop web and CLI requests omit that header and use the shared legacy profile.

Current native floors are iOS 16.0 and Android `minSdkVersion` 26.

### Docker

```bash
# Build (the pre-built DB and chroma data are baked into the image)
docker build -t medibridge .

# Run server
docker run -e OPENAI_API_KEY=sk-... -p 8000:8000 medibridge
```

The image includes `data/medibridge.db` and `data/chroma/` from the repo. If you mount `knowledge/` and the DB is missing, the entrypoint will auto-ingest:

```bash
docker run -e OPENAI_API_KEY=sk-... \
  -v "$(pwd)/knowledge:/app/knowledge" \
  -p 8000:8000 medibridge
```

#### Railway / cloud deploy

Set these environment variables on the platform:

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Yes | OpenAI API access |
| `PORT` | Auto | Railway sets this; the server reads it |

No volume mounts needed — the pre-built DB ships in the image.

---

## Architecture

Dual-store agentic RAG: SQLite for structured data, ChromaDB for semantic search. LangGraph drives a ReAct loop over six tools.

```
CLI (cli.py + onboarding.py)
  └─> LangGraph ReAct agent (agent/graph.py)
        └─> 6 LangChain @tools (tools/)
              ├─> SQLite: mbs_items, insurer_tiers, oshc_coverage_rules, clinics
              └─> ChromaDB: mbs_descriptions, oshc_rules
```

### Agent tools

| Tool | Description |
|------|-------------|
| `search_mbs_items` | Hybrid RRF search (vector + FTS5) |
| `lookup_mbs_item` | Exact item lookup by number |
| `calculate_oshc_coverage` | Out-of-pocket cost estimate |
| `check_waiting_period` | Waiting months / served status |
| `query_oshc_rules` | Semantic policy retrieval |
| `search_clinics` | Queensland clinic directory |

### Project layout

```
MediBridge/
  src/medibridge/
    cli.py              Rich REPL
    onboarding.py       Profile wizard (CLI)
    config.py           Paths, settings, models
    server/             FastAPI app, routers, schemas
    agent/              graph.py, prompts.py, state
    tools/              LangChain @tool implementations
    models/             Pydantic models
    data/
      db.py, schema.py, queries.py, vectorstore.py
      parsers/          mbs_xml, imap, PDFs, knowledge_md, ...
      ingest/           pipeline, mbs, insurers, chroma, clinics, ...
  ui/                   Static SPA (mounted by FastAPI)
  mobile/               Capacitor CLI, iOS/Android native projects, web build scripts
  .github/workflows/    CI for web assets, backend tests, Android APK, iOS simulator build
  tests/
  knowledge/            Tracked source documents used by ingestion
  data/                 Committed prebuilt DB/Chroma plus gitignored user profile
  pyproject.toml
  .env.example
  ARCHITECTURE.md       Deeper design notes
  CLAUDE.md             Maintainer conventions
```

---

## Tests

```bash
python -m pytest tests/ -v
```

Coverage includes: coverage calculator golden cases, MBS XML parsing, DB queries, clinic search, clinic ingest repair, and device-scoped profiles.

---

## Building a wheel

```bash
python -m build
```

Output goes to `dist/`.

---

## Further reading

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — historical deeper design notes; prefer this README and `CLAUDE.md` for current mobile/build details.
- **[CLAUDE.md](CLAUDE.md)** — venv usage, commands, and how to extend ingestion.

---

> [!WARNING]
> MediBridge is for **informational use only**. Always confirm coverage, fees, and waiting periods directly with your insurer and care providers.
