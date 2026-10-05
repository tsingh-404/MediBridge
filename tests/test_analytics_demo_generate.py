import sqlite3

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
