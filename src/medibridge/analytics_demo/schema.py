"""SQLite schema for the isolated synthetic conversation analytics store."""

from pathlib import Path
import sqlite3


SCHEMA_VERSION = 1


def connect_demo(path: Path) -> sqlite3.Connection:
    """Open the demo database at exactly ``path`` with FK checks enabled."""
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def create_schema(conn: sqlite3.Connection) -> None:
    """Create the analytics demo tables and query indexes if absent."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS actors (
            actor_id TEXT PRIMARY KEY,
            created_at_utc TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            actor_id TEXT NOT NULL REFERENCES actors(actor_id),
            started_at_utc TEXT NOT NULL,
            insurer_id TEXT NOT NULL,
            tier_id TEXT NOT NULL,
            region TEXT NOT NULL CHECK (region IN (
                'Brisbane', 'Gold Coast', 'Sunshine Coast', 'Darling Downs',
                'Wide Bay', 'Central Queensland', 'North Queensland',
                'Far North Queensland', 'unknown'
            )),
            location_basis TEXT NOT NULL CHECK (location_basis IN (
                'stated_demo_region', 'service_search_area', 'unknown'
            )),
            scenario_code TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            message_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(session_id),
            turn_index INTEGER NOT NULL CHECK (turn_index >= 0),
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            UNIQUE (session_id, turn_index)
        );

        CREATE TABLE IF NOT EXISTS issue_events (
            event_id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL REFERENCES messages(message_id),
            topic_code TEXT NOT NULL,
            service_code TEXT NOT NULL,
            concern_code TEXT NOT NULL,
            answer_outcome TEXT NOT NULL,
            classification_version TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS generation_runs (
            run_id INTEGER PRIMARY KEY,
            seed INTEGER NOT NULL,
            generator_version TEXT NOT NULL,
            taxonomy_version TEXT NOT NULL,
            created_at_utc TEXT NOT NULL,
            actor_count INTEGER NOT NULL,
            session_count INTEGER NOT NULL,
            message_count INTEGER NOT NULL,
            issue_event_count INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_started_at
            ON sessions(started_at_utc);
        CREATE INDEX IF NOT EXISTS idx_sessions_region
            ON sessions(region);
        CREATE INDEX IF NOT EXISTS idx_issue_events_topic
            ON issue_events(topic_code);
        CREATE INDEX IF NOT EXISTS idx_issue_events_message_id
            ON issue_events(message_id);
        """
    )
