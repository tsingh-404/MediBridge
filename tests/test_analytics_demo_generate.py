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


def test_generator_refuses_the_configured_operational_database_unchanged(tmp_path, monkeypatch):
    from medibridge.analytics_demo import generate

    protected_db = tmp_path / "medibridge.db"
    protected_bytes = b"operational database must remain untouched"
    protected_db.write_bytes(protected_bytes)
    monkeypatch.setattr(generate, "DB_PATH", protected_db)
    aliased_path = tmp_path / "unused" / ".." / "medibridge.db"

    with pytest.raises(ValueError, match="operational database"):
        generate.generate_store(aliased_path, session_count=120)

    assert protected_db.read_bytes() == protected_bytes


def test_generation_failure_preserves_previous_output(tmp_path, monkeypatch):
    from medibridge.analytics_demo import generate

    output = tmp_path / "existing-demo.sqlite"
    previous_bytes = b"previous successful output"
    output.write_bytes(previous_bytes)

    def fail_scenario(*args, **kwargs):
        raise RuntimeError("forced scenario failure")

    monkeypatch.setattr(generate, "scenario_for", fail_scenario)
    with pytest.raises(RuntimeError, match="forced scenario failure"):
        generate.generate_store(output, session_count=120)

    assert output.read_bytes() == previous_bytes
    assert list(tmp_path.glob(f".{output.name}.*.tmp")) == []


def test_successful_generation_replaces_a_prior_demo_store(tmp_path):
    from medibridge.analytics_demo.generate import generate_store

    output = tmp_path / "replace-demo.sqlite"
    generate_store(output, seed=1, session_count=120)
    summary = generate_store(output, seed=2, session_count=120)

    conn = connect_demo(output)
    try:
        stored_seed = conn.execute("SELECT seed FROM generation_runs").fetchone()[0]
        stored_sessions = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    finally:
        conn.close()

    assert summary.seed == stored_seed == 2
    assert stored_sessions == 120
    assert list(tmp_path.glob(f".{output.name}.*.tmp")) == []


def test_validator_reports_corruption_even_when_constraints_were_bypassed(tmp_path):
    from medibridge.analytics_demo.generate import generate_store
    from medibridge.analytics_demo.validate import validate_store

    path = tmp_path / "corrupt-demo.sqlite"
    generate_store(path, seed=22, session_count=100)
    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("PRAGMA ignore_check_constraints = ON")
        conn.execute(
            "INSERT INTO messages VALUES (?, ?, ?, ?, ?)",
            ("orphan-message", "missing-session", 0, "user", "orphan"),
        )
        conn.execute(
            "INSERT INTO issue_events VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("orphan-event", "missing-message", "primary_care", "gp", "other", "resolved", "v1"),
        )
        conn.execute("UPDATE messages SET content = '   ' WHERE turn_index = 0")
        conn.execute("UPDATE sessions SET started_at_utc = 'not-a-date' WHERE session_id = 'demo_session_000000'")
        conn.execute("UPDATE sessions SET region = 'New South Wales' WHERE session_id = 'demo_session_000001'")
        conn.execute("UPDATE sessions SET location_basis = '' WHERE session_id = 'demo_session_000002'")
        conn.execute("UPDATE generation_runs SET session_count = session_count - 1")
        conn.execute(
            "UPDATE messages SET content = 'Contact me at person@example.com' "
            "WHERE message_id = 'demo_session_000003_message_00'"
        )
        conn.commit()
    finally:
        conn.close()

    report = validate_store(path)

    assert not report.ok
    assert {
        "foreign_key_violation",
        "blank_content",
        "invalid_timestamp",
        "invalid_region",
        "missing_location_basis",
        "scenario_count_mismatch",
        "generation_count_mismatch",
        "personal_data_pattern",
    } <= {error.code for error in report.errors}
    assert report.counts["scenarios"]


def test_validator_cli_returns_nonzero_for_invalid_store(tmp_path, capsys):
    from medibridge.analytics_demo.validate import main

    path = tmp_path / "empty.sqlite"
    sqlite3.connect(path).close()

    assert main([str(path)]) == 1
    assert '"ok": false' in capsys.readouterr().out.lower()


def test_validator_returns_report_for_non_sqlite_file(tmp_path):
    from medibridge.analytics_demo.validate import validate_store

    path = tmp_path / "not-a-database.sqlite"
    path.write_text("plain text, not a SQLite database", encoding="utf-8")

    report = validate_store(path)

    assert not report.ok
    assert report.errors
    assert report.errors[0].code == "invalid_database"
    assert report.counts["rows"] == {}


def test_validator_compares_scenario_assignments_to_seeded_ground_truth(tmp_path):
    from medibridge.analytics_demo.generate import generate_store
    from medibridge.analytics_demo.validate import validate_store

    path = tmp_path / "wrong-scenario.sqlite"
    generate_store(path, seed=22, session_count=100)
    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA ignore_check_constraints = ON")
        conn.execute(
            "UPDATE sessions SET scenario_code = 'mixed_topic_turn' "
            "WHERE session_id = 'demo_session_000000'"
        )
        conn.commit()
    finally:
        conn.close()

    report = validate_store(path)

    assert not report.ok
    assert "scenario_truth_mismatch" in {error.code for error in report.errors}


def test_validator_reports_contract_unknown_topic_sessions_separately_from_events(tmp_path):
    from medibridge.analytics_demo.generate import CLASSIFICATION_VERSION, generate_store
    from medibridge.analytics_demo.validate import validate_store

    path = tmp_path / "unknown-topic-units.sqlite"
    generate_store(path, seed=31, session_count=4)
    conn = sqlite3.connect(path)
    try:
        conn.execute("DELETE FROM issue_events")
        user_messages = dict(conn.execute(
            "SELECT session_id, message_id FROM messages WHERE turn_index = 0"
        ))
        issue_rows = []
        for index in range(4):
            issue_rows.append((
                f"event-classified-{index}", user_messages["demo_session_000000"],
                "primary_care", "gp", "care_navigation", "resolved", CLASSIFICATION_VERSION,
            ))
        issue_rows.extend([
            ("event-mixed-classified", user_messages["demo_session_000001"],
             "primary_care", "gp", "care_navigation", "resolved", CLASSIFICATION_VERSION),
            ("event-mixed-unclassified", user_messages["demo_session_000001"],
             "unknown_unclassified", "unknown", "unknown", "unknown_not_assessed", CLASSIFICATION_VERSION),
            ("event-only-unclassified", user_messages["demo_session_000003"],
             "unknown_unclassified", "unknown", "unknown", "unknown_not_assessed", CLASSIFICATION_VERSION),
        ])
        conn.executemany("INSERT INTO issue_events VALUES (?, ?, ?, ?, ?, ?, ?)", issue_rows)
        conn.execute("UPDATE generation_runs SET issue_event_count = ?", (len(issue_rows),))
        conn.commit()
    finally:
        conn.close()

    report = validate_store(path)

    assert report.metrics["unknown_topic_session_count"] == 2
    assert report.metrics["unknown_topic_share"] == 0.5
    assert report.metrics["unclassified_topic_event_count"] == 2
    assert report.metrics["unclassified_topic_event_share"] == pytest.approx(2 / 7)
    assert report.metrics["sessions_with_classified_and_unclassified_topics"] == 1


def test_validator_rejects_null_region_when_constraint_is_absent(tmp_path):
    from medibridge.analytics_demo.generate import generate_store
    from medibridge.analytics_demo.validate import validate_store

    path = tmp_path / "null-region.sqlite"
    generate_store(path, seed=32, session_count=4)
    conn = sqlite3.connect(path)
    try:
        conn.execute("""CREATE TABLE sessions_rebuilt (
            session_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, started_at_utc TEXT NOT NULL,
            insurer_id TEXT NOT NULL, tier_id TEXT NOT NULL, region TEXT,
            location_basis TEXT NOT NULL, scenario_code TEXT NOT NULL
        )""")
        conn.execute("INSERT INTO sessions_rebuilt SELECT * FROM sessions")
        conn.execute("DROP TABLE sessions")
        conn.execute("ALTER TABLE sessions_rebuilt RENAME TO sessions")
        conn.execute("UPDATE sessions SET region = NULL WHERE session_id = 'demo_session_000000'")
        conn.commit()
    finally:
        conn.close()

    report = validate_store(path)

    assert "invalid_region" in {error.code for error in report.errors}
