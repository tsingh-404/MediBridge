"""Paths, env vars, model config."""
from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(os.environ["MEDIBRIDGE_ROOT"]) if "MEDIBRIDGE_ROOT" in os.environ else Path(__file__).resolve().parents[2]
KNOWLEDGE_DIR = Path(os.environ.get("MEDIBRIDGE_KNOWLEDGE_DIR", ROOT_DIR / "knowledge"))
DATA_DIR = Path(os.environ.get("MEDIBRIDGE_DATA_DIR", ROOT_DIR / "data"))

DB_PATH = DATA_DIR / "medibridge.db"
CHROMA_DIR = DATA_DIR / "chroma"
USER_PROFILE_JSON = DATA_DIR / "user_profile.json"

# Read-only seed inputs (third-party datasets dropped here, ingested into DB_PATH)
SOURCES_DIR = DATA_DIR / "sources"
CLINICS_SOURCE_PATH = SOURCES_DIR / "clinics_qld.csv"

# Raw structured data → SQLite ingest only
MBS_XML_PATH = KNOWLEDGE_DIR / "data" / "MBS-XML-20260301-version 2.XML"
IMAP_PATH    = KNOWLEDGE_DIR / "data" / "20260301_MBSONLINE_IMAP.TXT"

# Government PDFs → ChromaDB oshc_rules collection
DEED_PDF_PATH          = KNOWLEDGE_DIR / "documents" / "deed-for-the-provision-of-overseas-student-health-cover-1-july-2025.pdf"
MBS_BOOK_PDF_PATH      = KNOWLEDGE_DIR / "documents" / "MBS Book - March 2026.pdf"
MBS_ITEM_INFO_PDF_PATH = KNOWLEDGE_DIR / "documents" / "MBS Item Information.pdf"

# Curated knowledge → ChromaDB oshc_rules collection
INSURERS_KNOWLEDGE_DIR = KNOWLEDGE_DIR / "insurers"
REFERENCE_KNOWLEDGE_DIR = KNOWLEDGE_DIR / "reference"

MBS_BOOK_EXPLANATORY_PAGES = (1, 15)

CHROMA_MBS_COLLECTION = "mbs_descriptions"
CHROMA_RULES_COLLECTION = "oshc_rules"

EMBEDDING_MODEL = "text-embedding-3-small"
EMBED_BATCH_SIZE = 100
CHAT_MODEL = "gpt-5-nano"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )
    openai_api_key: str = ""
    # LangSmith — LangChain SDK reads these from os.environ directly
    langsmith_tracing: str = ""
    langsmith_api_key: str = ""
    langsmith_project: str = "medibridge"
    langsmith_endpoint: str = "https://api.smith.langchain.com"


settings = Settings()


def _enable_langsmith() -> None:
    """Push LangSmith vars into os.environ so LangChain auto-traces."""
    if not settings.langsmith_api_key:
        return
    os.environ["LANGSMITH_TRACING"] = settings.langsmith_tracing or "true"
    os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key
    os.environ["LANGSMITH_PROJECT"] = settings.langsmith_project
    os.environ["LANGSMITH_ENDPOINT"] = settings.langsmith_endpoint
    # Legacy alias still honored by some langchain versions
    os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
    os.environ.setdefault("LANGCHAIN_API_KEY", settings.langsmith_api_key)
    os.environ.setdefault("LANGCHAIN_PROJECT", settings.langsmith_project)
    os.environ.setdefault("LANGCHAIN_ENDPOINT", settings.langsmith_endpoint)


_enable_langsmith()


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
