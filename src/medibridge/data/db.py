"""SQLite connection helpers."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from medibridge.config import DB_PATH
from medibridge.data.schema import SCHEMA


def connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


# Migrations that must also reach databases created before the column existed —
# data/medibridge.db is committed pre-built, so CREATE TABLE IF NOT EXISTS alone
# would never add them. Applied once per process, on first connection.
_migrated: set[str] = set()


def apply_migrations(conn: sqlite3.Connection) -> None:
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if cols and "device_id" not in cols:
        conn.execute("ALTER TABLE user_profile ADD COLUMN device_id TEXT")
    if cols:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profile_device "
            "ON user_profile(device_id)"
        )


@contextmanager
def get_conn(db_path: Path = DB_PATH) -> Iterator[sqlite3.Connection]:
    conn = connect(db_path)
    try:
        key = str(db_path)
        if key not in _migrated:
            apply_migrations(conn)
            conn.commit()
            _migrated.add(key)
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    apply_migrations(conn)


def reset_db(db_path: Path = DB_PATH) -> None:
    if db_path.exists():
        db_path.unlink()
    _migrated.discard(str(db_path))
