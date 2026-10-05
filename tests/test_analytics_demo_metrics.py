"""Golden tests for aggregate-only synthetic analytics metrics."""

from datetime import date
import importlib

import pytest

from medibridge.analytics_demo.schema import create_schema


def _metrics():
    """Load the planned API at test time so missing functionality fails as a test."""
    return importlib.import_module("medibridge.analytics_demo.metrics")


@pytest.fixture()
def metrics_conn(tmp_path):
    import sqlite3

    conn = sqlite3.connect(tmp_path / "metrics.sqlite")
    conn.execute("PRAGMA foreign_keys = ON")
    create_schema(conn)
    conn.executemany(
        "INSERT INTO actors (actor_id, created_at_utc) VALUES (?, ?)",
        [(f"a{i}", "2025-01-01T00:00:00Z") for i in range(5)],
    )
    sessions = [
        ("s1", "a0", "2025-01-01T14:00:00Z", "insurer_a", "basic", "Brisbane", "stated_demo_region", "control_stable"),
        ("s2", "a1", "2025-01-02T13:59:59Z", "insurer_a", "basic", "Brisbane", "service_search_area", "control_stable"),
        ("s3", "a2", "2025-01-02T03:00:00Z", "insurer_b", "plus", "Gold Coast", "stated_demo_region", "control_stable"),
        ("s4", "a3", "2025-01-02T04:00:00Z", "insurer_b", "plus", "unknown", "unknown", "control_stable"),
        ("s5", "a4", "2025-01-02T14:00:00Z", "insurer_b", "plus", "Gold Coast", "stated_demo_region", "control_stable"),
    ]
    conn.executemany(
        """INSERT INTO sessions
           (session_id, actor_id, started_at_utc, insurer_id, tier_id, region,
            location_basis, scenario_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        sessions,
    )
    messages = [
        ("m1", "s1", 0, "user", "Question one"),
        ("m2", "s1", 2, "user", "Question repeated"),
        ("m3", "s2", 0, "user", "Multi-topic question"),
        ("m4", "s3", 0, "user", "Unclassified question"),
    ]
    conn.executemany(
        "INSERT INTO messages (message_id, session_id, turn_index, role, content) VALUES (?, ?, ?, ?, ?)",
        messages,
    )
    events = [
        ("e1", "m1", "primary_care", "gp", "care_navigation", "resolved", "demo-topic-taxonomy-v1"),
        ("e2", "m1", "primary_care", "gp", "care_navigation", "resolved", "demo-topic-taxonomy-v1"),
        ("e3", "m2", "primary_care", "gp", "care_navigation", "unresolved", "demo-topic-taxonomy-v1"),
        ("e4", "m3", "primary_care", "gp", "care_navigation", "resolved", "demo-topic-taxonomy-v1"),
        ("e5", "m3", "pharmacy_medicines", "pharmacy", "information_gap", "unknown_not_assessed", "demo-topic-taxonomy-v1"),
        ("e6", "m4", "unknown_unclassified", "unknown", "unknown", "unknown_not_assessed", "demo-topic-taxonomy-v1"),
    ]
    conn.executemany(
        """INSERT INTO issue_events
           (event_id, message_id, topic_code, service_code, concern_code,
            answer_outcome, classification_version) VALUES (?, ?, ?, ?, ?, ?, ?)""",
        events,
    )
    conn.commit()
    try:
        yield conn
    finally:
        conn.close()


def test_session_count_and_topic_sessions_deduplicate_repeated_events(metrics_conn):
    metrics = _metrics()
    cohort = metrics.AnalyticsFilter(start_date=date(2025, 1, 2), end_date=date(2025, 1, 2))

    sessions = metrics.read_metrics(metrics_conn, "sessions", (), cohort)
    topics = metrics.read_metrics(metrics_conn, "topic_sessions", ("topic_code",), cohort)

    assert sessions.cells[0].numerator == 4
    assert {cell.dimensions["topic_code"]: cell.numerator for cell in topics.cells} == {
        "primary_care": 2,
        "pharmacy_medicines": 1,
        "unknown_unclassified": 1,
    }


def test_question_turns_count_distinct_user_messages_not_issue_events(metrics_conn):
    metrics = _metrics()
    cohort = metrics.AnalyticsFilter(start_date=date(2025, 1, 2), end_date=date(2025, 1, 2))

    result = metrics.read_metrics(metrics_conn, "question_turns", (), cohort)

    assert result.cells[0].numerator == 4


def test_topic_rate_uses_all_sessions_including_unknown_and_no_topic(metrics_conn):
    metrics = _metrics()
    cohort = metrics.AnalyticsFilter(
        start_date=date(2025, 1, 2),
        end_date=date(2025, 1, 2),
        topic_code="primary_care",
    )

    result = metrics.read_metrics(metrics_conn, "topic_rate_per_1000", (), cohort)

    assert result.cells[0].numerator == 2
    assert result.cells[0].denominator == 4
    assert result.cells[0].value == 500.0


def test_unknown_topic_share_includes_unknown_only_and_no_event_sessions(metrics_conn):
    metrics = _metrics()
    cohort = metrics.AnalyticsFilter(start_date=date(2025, 1, 2), end_date=date(2025, 1, 2))

    result = metrics.read_metrics(metrics_conn, "unknown_topic_share", (), cohort)

    assert result.cells[0].numerator == 2
    assert result.cells[0].denominator == 4
    assert result.cells[0].value == 0.5


def test_session_grouping_and_filters_preserve_session_cohort_semantics(metrics_conn):
    metrics = _metrics()
    cohort = metrics.AnalyticsFilter(
        start_date=date(2025, 1, 2),
        end_date=date(2025, 1, 2),
        insurer_id="insurer_a",
    )

    result = metrics.read_metrics(metrics_conn, "sessions", ("insurer_id", "region"), cohort)

    assert [(cell.dimensions, cell.numerator) for cell in result.cells] == [
        ({"insurer_id": "insurer_a", "region": "Brisbane"}, 2)
    ]


def test_filters_and_groupings_reject_unallowlisted_values(metrics_conn):
    metrics = _metrics()
    with pytest.raises(ValueError):
        metrics.read_metrics(
            metrics_conn,
            "sessions",
            ("session_id",),
            metrics.AnalyticsFilter(start_date=date(2025, 1, 2), end_date=date(2025, 1, 2)),
        )


def test_result_provenance_versions_the_metric_definition(metrics_conn):
    metrics = _metrics()
    result = metrics.read_metrics(
        metrics_conn,
        "sessions",
        (),
        metrics.AnalyticsFilter(start_date=date(2025, 1, 2), end_date=date(2025, 1, 2)),
    )

    assert result.provenance["synthetic"] is True
    assert result.provenance["metric_version"] == "analytics-metrics-v1"
    assert result.provenance["source_span"] == {"start_date": "2025-01-02", "end_date": "2025-01-02"}


def test_store_value_filters_must_be_present_in_the_synthetic_allowlist(metrics_conn):
    metrics = _metrics()

    with pytest.raises(ValueError, match="insurer_id is not an available value"):
        metrics.read_metrics(
            metrics_conn,
            "sessions",
            (),
            metrics.AnalyticsFilter(insurer_id="missing-insurer"),
        )
