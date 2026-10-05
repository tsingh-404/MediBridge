import hashlib
import json
import sqlite3
from pathlib import Path

import pytest

from medibridge.analytics_demo.schema import connect_demo, create_schema


def _insert_fixture(conn: sqlite3.Connection) -> str:
    """Insert the smallest valid parent rows for schema constraint tests."""
    conn.execute(
        "INSERT INTO actors (actor_id, created_at_utc) VALUES (?, ?)",
        ("actor-fixture", "2026-10-05T00:00:00Z"),
    )
    conn.execute(
        """INSERT INTO sessions
           (session_id, actor_id, started_at_utc, insurer_id, tier_id, region,
            location_basis, scenario_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            "session-fixture",
            "actor-fixture",
            "2026-10-05T00:00:00Z",
            "insurer-fixture",
            "tier-fixture",
            "unknown",
            "unknown",
            "control",
        ),
    )
    return "session-fixture"


@pytest.fixture()
def demo_conn(tmp_path):
    conn = connect_demo(tmp_path / "analytics-demo.sqlite")
    create_schema(conn)
    try:
        yield conn
    finally:
        conn.close()


def test_messages_require_an_existing_session(demo_conn):
    with pytest.raises(sqlite3.IntegrityError):
        demo_conn.execute(
            "INSERT INTO messages (message_id, session_id, turn_index, role, content) "
            "VALUES (?, ?, ?, ?, ?)",
            ("orphan-message", "missing-session", 0, "user", "Hello"),
        )


def test_issue_events_require_an_existing_message(demo_conn):
    with pytest.raises(sqlite3.IntegrityError):
        demo_conn.execute(
            """INSERT INTO issue_events
               (event_id, message_id, topic_code, service_code, concern_code,
                answer_outcome, classification_version)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("orphan-event", "missing-message", "topic", "service", "concern", "answered", "v1"),
        )


def test_session_turn_index_must_be_unique(demo_conn):
    session_id = _insert_fixture(demo_conn)
    demo_conn.execute(
        "INSERT INTO messages (message_id, session_id, turn_index, role, content) "
        "VALUES (?, ?, ?, ?, ?)",
        ("message-one", session_id, 0, "user", "Hello"),
    )

    with pytest.raises(sqlite3.IntegrityError):
        demo_conn.execute(
            "INSERT INTO messages (message_id, session_id, turn_index, role, content) "
            "VALUES (?, ?, ?, ?, ?)",
            ("message-two", session_id, 0, "assistant", "Hi"),
        )


@pytest.mark.parametrize(
    ("column", "value"),
    [
        ("region", "New South Wales"),
        ("location_basis", "inferred_from_ip"),
    ],
)
def test_sessions_reject_values_outside_geography_allowlists(demo_conn, column, value):
    session_id = _insert_fixture(demo_conn)

    with pytest.raises(sqlite3.IntegrityError):
        demo_conn.execute(
            f"UPDATE sessions SET {column} = ? WHERE session_id = ?",
            (value, session_id),
        )


@pytest.mark.parametrize("role", ["user", "assistant"])
def test_messages_accept_allowed_roles(demo_conn, role):
    session_id = _insert_fixture(demo_conn)
    demo_conn.execute(
        "INSERT INTO messages (message_id, session_id, turn_index, role, content) "
        "VALUES (?, ?, ?, ?, ?)",
        (f"message-{role}", session_id, 0, role, "Fixture message"),
    )


def test_messages_reject_roles_outside_user_and_assistant(demo_conn):
    session_id = _insert_fixture(demo_conn)
    with pytest.raises(sqlite3.IntegrityError):
        demo_conn.execute(
            "INSERT INTO messages (message_id, session_id, turn_index, role, content) "
            "VALUES (?, ?, ?, ?, ?)",
            ("message-system", session_id, 0, "system", "Not an allowed role"),
        )


def _business_hash(path: Path) -> str:
    conn = connect_demo(path)
    try:
        records = {
            table: conn.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
            for table in ("actors", "sessions", "messages", "issue_events")
        }
    finally:
        conn.close()
    return hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest()


def test_generator_meets_small_run_row_and_session_quality_targets(tmp_path):
    from medibridge.analytics_demo.generate import generate_store

    path = tmp_path / "generated.sqlite"
    summary = generate_store(path, seed=17, session_count=120)
    conn = connect_demo(path)
    try:
        actors = conn.execute("SELECT COUNT(*) FROM actors").fetchone()[0]
        sessions = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        messages = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        events = conn.execute("SELECT COUNT(*) FROM issue_events").fetchone()[0]
        repeated = conn.execute(
            "SELECT COUNT(*) FROM (SELECT actor_id FROM sessions GROUP BY actor_id HAVING COUNT(*) > 1)"
        ).fetchone()[0]
        session_messages = conn.execute(
            "SELECT COUNT(*) FROM (SELECT session_id FROM messages GROUP BY session_id "
            "HAVING COUNT(*) BETWEEN 2 AND 6)"
        ).fetchone()[0]
        bounds = conn.execute(
            "SELECT MIN(started_at_utc), MAX(started_at_utc) FROM sessions"
        ).fetchone()
        regions = {row[0] for row in conn.execute("SELECT DISTINCT region FROM sessions")}
        locations = dict(conn.execute("SELECT location_basis, COUNT(*) FROM sessions GROUP BY location_basis"))
        issue_links = conn.execute(
            "SELECT COUNT(*) FROM issue_events e JOIN messages m USING (message_id) "
            "WHERE m.role != 'user'"
        ).fetchone()[0]
        mixed_turn = conn.execute(
            """SELECT COUNT(DISTINCT e.topic_code), COUNT(DISTINCT e.message_id),
                      MIN(m.role), MAX(m.role)
               FROM issue_events e JOIN messages m USING (message_id)
               WHERE m.session_id = 'demo_session_000042'"""
        ).fetchone()
    finally:
        conn.close()

    assert summary.session_count == sessions == 120
    assert summary.actor_count == actors
    assert summary.message_count == messages
    assert summary.issue_event_count == events
    assert actors > 0 and repeated / actors >= 0.10
    assert session_messages == sessions
    assert bounds[0].startswith("2024-10-01")
    assert bounds[1].startswith("2026-09-30")
    assert regions <= {
        "Brisbane", "Gold Coast", "Sunshine Coast", "Darling Downs", "Wide Bay",
        "Central Queensland", "North Queensland", "Far North Queensland", "unknown",
    }
    assert locations.keys() <= {"stated_demo_region", "service_search_area", "unknown"}
    assert issue_links == 0
    assert mixed_turn == (2, 1, "user", "user")


def test_generator_is_repeatable_for_same_seed(tmp_path):
    from medibridge.analytics_demo.generate import generate_store

    first = tmp_path / "first.sqlite"
    second = tmp_path / "second.sqlite"
    generate_store(first, seed=90210, session_count=90)
    generate_store(second, seed=90210, session_count=90)

    assert _business_hash(first) == _business_hash(second)


def test_generator_rejects_session_count_below_default_scale_floor(tmp_path):
    from medibridge.analytics_demo.generate import generate_store

    with pytest.raises(ValueError, match="at least 33000 sessions"):
        generate_store(tmp_path / "too-small.sqlite", session_count=32_999)
