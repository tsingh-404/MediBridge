"""Deterministic generator for the isolated fictional analytics demo store."""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
import json
import os
from pathlib import Path
import random
import sqlite3
import sys
import tempfile

from medibridge.config import DB_PATH
from .scenarios import scenario_for
from .schema import connect_demo, create_schema


GENERATOR_VERSION = "synthetic-generator-v2"
TAXONOMY_VERSION = "issue-taxonomy-v1"
CLASSIFICATION_VERSION = TAXONOMY_VERSION
DATE_START = date(2024, 10, 1)
DATE_END = date(2026, 9, 30)
DEFAULT_MIN_ACTORS = 30_000
MIN_FULL_SCALE_SESSIONS = 33_000
WRITE_BATCH_SIZE = 1_000


def _guard_output_path(output_path: Path) -> None:
    """Reject direct paths, aliases, or hard links to the operational DB."""
    operational_path = Path(DB_PATH)
    resolved_output = output_path.resolve()
    resolved_operational = operational_path.resolve()
    same_resolved_path = os.path.normcase(str(resolved_output)) == os.path.normcase(
        str(resolved_operational)
    )
    same_file = False
    if output_path.exists() and operational_path.exists():
        try:
            same_file = os.path.samefile(output_path, operational_path)
        except OSError:
            # Resolution above still protects the usual symlink/path aliases.
            pass
    if same_resolved_path or same_file:
        raise ValueError(
            f"Refusing to write analytics demo output to the configured operational database: "
            f"{operational_path}"
        )


def _remove_staging_files(staging_path: Path) -> None:
    """Remove only the temporary database and its SQLite sidecars."""
    for candidate in (
        staging_path,
        Path(f"{staging_path}-journal"),
        Path(f"{staging_path}-wal"),
        Path(f"{staging_path}-shm"),
    ):
        try:
            candidate.unlink()
        except FileNotFoundError:
            pass


@dataclass(frozen=True)
class GenerationSummary:
    seed: int
    actor_count: int
    session_count: int
    message_count: int
    issue_event_count: int
    output_path: str


def _actor_count_for_sessions(session_count: int) -> int:
    """Use scaled actor targets in small runs and 30k actors at demo scale."""
    scaled_count = max(1, int(session_count * 0.7))
    if session_count >= MIN_FULL_SCALE_SESSIONS:
        return max(DEFAULT_MIN_ACTORS, scaled_count)
    return scaled_count


def _timestamp(session_index: int, session_count: int, rng: random.Random) -> str:
    span_seconds = int((DATE_END - DATE_START).total_seconds())
    offset = 0 if session_count == 1 else session_index * span_seconds // (session_count - 1)
    moment = datetime.combine(DATE_START, datetime.min.time(), timezone.utc) + timedelta(
        seconds=offset + rng.randrange(24 * 60 * 60)
    )
    # Keep the final endpoint in range even when a random time-of-day is added.
    if session_index == session_count - 1:
        moment = datetime.combine(DATE_END, datetime.min.time(), timezone.utc) + timedelta(
            seconds=rng.randrange(24 * 60 * 60)
        )
    return moment.isoformat(timespec="seconds").replace("+00:00", "Z")


def generate_store(
    path: Path, seed: int = 20261005, session_count: int = 50_000
) -> GenerationSummary:
    """Create a repeatable store of original fictional conversations.

    Runs smaller than 33,000 sessions use a scaled actor target for tests and
    local probes. At and above that threshold, the generator guarantees at
    least 30,000 actors and at least 10% of actors with multiple sessions.
    """
    if not isinstance(session_count, int) or isinstance(session_count, bool) or session_count < 2:
        raise ValueError("session_count must be an integer of at least 2")
    if session_count < MIN_FULL_SCALE_SESSIONS and session_count >= 30_000:
        raise ValueError(
            f"session_count must be at least {MIN_FULL_SCALE_SESSIONS} sessions to satisfy the "
            "30,000-actor target and 10% multiple-session requirement"
        )
    output_path = Path(path)
    _guard_output_path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    actor_count = _actor_count_for_sessions(session_count)
    if session_count - actor_count < max(1, (actor_count + 9) // 10):
        raise ValueError(
            f"session_count must be at least {MIN_FULL_SCALE_SESSIONS} sessions to satisfy the "
            "30,000-actor target and 10% multiple-session requirement"
        )

    staging_fd, staging_name = tempfile.mkstemp(
        prefix=f".{output_path.name}.", suffix=".tmp", dir=output_path.parent
    )
    os.close(staging_fd)
    staging_path = Path(staging_name)
    conn = None
    message_count = 0
    issue_event_count = 0
    rng = random.Random(seed)
    sessions = []
    messages = []
    issue_events = []
    extra_sessions = session_count - actor_count
    repeated_actor_count = max(1, (actor_count + 9) // 10)
    try:
        conn = connect_demo(staging_path)
        create_schema(conn)
        conn.execute("BEGIN")
        actor_rows = []
        for index in range(actor_count):
            actor_id = f"demo_actor_{index:06d}"
            # Created time is stable and no later than the first session for the actor.
            actor_rows.append((actor_id, "2024-10-01T00:00:00Z"))
            if len(actor_rows) >= WRITE_BATCH_SIZE:
                conn.executemany(
                    "INSERT INTO actors (actor_id, created_at_utc) VALUES (?, ?)",
                    actor_rows,
                )
                actor_rows.clear()
        if actor_rows:
            conn.executemany(
                "INSERT INTO actors (actor_id, created_at_utc) VALUES (?, ?)", actor_rows
            )

        for session_index in range(session_count):
            if session_index < actor_count:
                actor_index = session_index
            else:
                actor_index = (session_index - actor_count) % repeated_actor_count
            started_at = _timestamp(session_index, session_count, rng)
            scenario = scenario_for(seed, session_index, started_at)
            session_id = f"demo_session_{session_index:06d}"
            sessions.append(
                (
                    session_id,
                    f"demo_actor_{actor_index:06d}",
                    scenario.started_at_utc,
                    scenario.insurer_id,
                    scenario.tier_id,
                    scenario.region,
                    scenario.location_basis,
                    scenario.scenario_code,
                )
            )
            indexed_message_ids = {}
            for message_index, message in enumerate(scenario.messages):
                message_id = f"{session_id}_message_{message_index:02d}"
                indexed_message_ids[message_index] = message_id
                messages.append(
                    (message_id, session_id, message_index, message.role, message.content)
                )
            for event_index, tag in enumerate(scenario.issue_tags):
                if tag.message_index not in indexed_message_ids:
                    raise ValueError(
                        f"scenario tag message_index {tag.message_index} does not exist "
                        f"in session {session_id}"
                    )
                if scenario.messages[tag.message_index].role != "user":
                    raise ValueError(
                        f"scenario tag message_index {tag.message_index} is not a user "
                        f"message in session {session_id}"
                    )
                issue_events.append(
                    (
                        f"{session_id}_event_{event_index:02d}",
                        indexed_message_ids[tag.message_index],
                        tag.topic_code,
                        tag.service_code,
                        tag.concern_code,
                        tag.answer_outcome,
                        CLASSIFICATION_VERSION,
                    )
                )

            if len(sessions) >= WRITE_BATCH_SIZE:
                conn.executemany(
                    "INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)", sessions
                )
                conn.executemany(
                    "INSERT INTO messages VALUES (?, ?, ?, ?, ?)", messages
                )
                conn.executemany(
                    "INSERT INTO issue_events VALUES (?, ?, ?, ?, ?, ?, ?)", issue_events
                )
                message_count += len(messages)
                issue_event_count += len(issue_events)
                sessions.clear()
                messages.clear()
                issue_events.clear()

        if sessions:
            conn.executemany("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)", sessions)
            conn.executemany("INSERT INTO messages VALUES (?, ?, ?, ?, ?)", messages)
            conn.executemany(
                "INSERT INTO issue_events VALUES (?, ?, ?, ?, ?, ?, ?)", issue_events
            )
            message_count += len(messages)
            issue_event_count += len(issue_events)

        created_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
            "+00:00", "Z"
        )
        conn.execute(
            """INSERT INTO generation_runs
               (seed, generator_version, taxonomy_version, created_at_utc, actor_count,
                session_count, message_count, issue_event_count)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                seed,
                GENERATOR_VERSION,
                TAXONOMY_VERSION,
                created_at,
                actor_count,
                session_count,
                message_count,
                issue_event_count,
            ),
        )
        conn.commit()
        conn.close()
        conn = None
        os.replace(staging_path, output_path)
    except Exception:
        try:
            if conn is not None:
                try:
                    conn.rollback()
                finally:
                    conn.close()
        finally:
            _remove_staging_files(staging_path)
        raise

    return GenerationSummary(
        seed=seed,
        actor_count=actor_count,
        session_count=session_count,
        message_count=message_count,
        issue_event_count=issue_event_count,
        output_path=str(output_path),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20261005)
    parser.add_argument("--sessions", type=int, default=50_000)
    args = parser.parse_args(argv)
    try:
        summary = generate_store(args.output, seed=args.seed, session_count=args.sessions)
    except (OSError, sqlite3.Error, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps(asdict(summary), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
