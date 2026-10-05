"""FastAPI contract tests for the standalone synthetic analytics demo."""

from datetime import datetime, timedelta, timezone
import importlib
import sqlite3

import pytest
from fastapi.testclient import TestClient

from medibridge.analytics_demo.schema import create_schema


FORBIDDEN_KEYS = {
    "actor_id",
    "session_id",
    "message_id",
    "event_id",
    "content",
    "raw_message",
    "started_at_utc",
    "exact_timestamp",
    "postcode",
}
FORBIDDEN_VALUES = {
    "actor-test-",
    "session-test-",
    "message-test-",
    "event-test-",
    "fictional test question",
}
ENDPOINTS = [
    "/api/demo/meta",
    "/api/demo/overview",
    "/api/demo/topics",
    "/api/demo/trend",
    "/api/demo/regions",
    "/api/demo/coverage-friction",
    "/api/demo/quality",
]


def _api_module():
    """Import at test time so absent API functionality fails as a test."""
    return importlib.import_module("medibridge.analytics_demo.api")


@pytest.fixture()
def analytics_client(tmp_path):
    database = tmp_path / "analytics-demo.sqlite"
    conn = sqlite3.connect(database)
    conn.execute("PRAGMA foreign_keys = ON")
    create_schema(conn)
    actors = [(f"actor-test-{index:02d}", "2025-01-01T00:00:00Z") for index in range(18)]
    conn.executemany("INSERT INTO actors (actor_id, created_at_utc) VALUES (?, ?)", actors)
    start = datetime(2025, 1, 1, 14, tzinfo=timezone.utc)
    regions = ("Brisbane", "Gold Coast", "unknown")
    bases = ("stated_demo_region", "service_search_area", "unknown")
    insurers = ("demo_insurer_a", "demo_insurer_b", "demo_insurer_c")
    tiers = ("demo_basic", "demo_standard", "demo_plus")
    topics = (
        "primary_care",
        "primary_care",
        "coverage_waiting_period",
        "coverage_benefit_exclusion",
        "respiratory_information",
        "unknown_unclassified",
    )
    outcomes = ("resolved", "unresolved", "unknown_not_assessed")
    for index in range(18):
        session_id = f"session-test-{index:02d}"
        started = (start + timedelta(days=index)).strftime("%Y-%m-%dT%H:%M:%SZ")
        conn.execute("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (
            session_id,
            f"actor-test-{index:02d}",
            started,
            insurers[index % len(insurers)],
            tiers[index % len(tiers)],
            regions[index % len(regions)],
            bases[index % len(bases)],
            "respiratory_spike" if index % 6 == 4 else "control_stable",
        ))
        message_id = f"message-test-{index:02d}"
        conn.execute(
            "INSERT INTO messages VALUES (?, ?, ?, ?, ?)",
            (message_id, session_id, 0, "user", "fictional test question"),
        )
        topic = topics[index % len(topics)]
        conn.execute(
            "INSERT INTO issue_events VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                f"event-test-{index:02d}",
                message_id,
                topic,
                "gp" if index % 2 == 0 else "other",
                "care_navigation" if index % 2 == 0 else "waiting_period",
                outcomes[index % len(outcomes)],
                "demo-topic-taxonomy-v1",
            ),
        )
    conn.execute(
        """INSERT INTO generation_runs
           (seed, generator_version, taxonomy_version, created_at_utc,
            actor_count, session_count, message_count, issue_event_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (7, "demo-generator-test", "demo-topic-taxonomy-v1", "2025-01-01T00:00:00Z", 18, 18, 18, 18),
    )
    conn.commit()
    conn.close()
    app = _api_module().create_app(database)
    with TestClient(app) as client:
        yield client


def _walk(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key, child
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


@pytest.mark.parametrize("path", ENDPOINTS)
def test_every_endpoint_returns_safe_synthetic_envelope(analytics_client, path):
    response = analytics_client.get(
        path,
        params={"start_date": "2025-01-01", "end_date": "2025-01-31", "region": "Brisbane"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["synthetic"] is True
    assert payload["filters_applied"]["region"] == "Brisbane"
    assert payload["caveat"]
    assert payload["provenance"]["taxonomy_version"] == "demo-topic-taxonomy-v1"
    assert payload["provenance"]["generator_version"] == "demo-generator-test"
    assert payload["provenance"]["scenario_versions"]
    assert "source_span" in payload["provenance"]
    assert "does not prevent differencing across separate requests" in payload["caveat"]
    assert {"numerator", "denominator", "suppressed", "cells"}.issubset(payload)
    assert all("filters_applied" in table for table in payload["tables"].values())
    for key, child in _walk(payload):
        assert key not in FORBIDDEN_KEYS
        if isinstance(child, str):
            assert not any(value in child for value in FORBIDDEN_VALUES)


@pytest.mark.parametrize(
    "params",
    [
        {"start_date": "2025-02-02", "end_date": "2025-02-01"},
        {"start_date": "2026-10-01"},
        {"end_date": "2024-09-30"},
        {"region": "New South Wales"},
        {"location_basis": "device_location"},
        {"topic_code": "diagnosis"},
        {"service_code": "free-text"},
        {"concern_code": "free-text"},
        {"insurer_id": "arbitrary-insurer"},
        {"tier_id": "arbitrary-tier"},
        {"postcode": "4000"},
    ],
)
def test_invalid_dates_values_and_dimensions_return_422(analytics_client, params):
    response = analytics_client.get("/api/demo/overview", params=params)

    assert response.status_code == 422


def test_empty_selection_has_stable_zero_shape(analytics_client):
    response = analytics_client.get("/api/demo/overview", params={"region": "Far North Queensland"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["numerator"] is None
    assert payload["suppressed"] is True
    assert payload["cells"]
    assert payload["cells"][0]["reason_code"] == "primary_suppression"
    assert payload["synthetic"] is True


def test_all_suppressed_topic_table_has_nulls_and_explicit_flags(analytics_client):
    response = analytics_client.get("/api/demo/topics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["cells"]
    assert all(cell["suppressed"] for cell in payload["cells"])
    assert all(cell["value"] is None for cell in payload["cells"])
    assert all(cell["reason_code"] for cell in payload["cells"])


def test_regions_keep_unknown_geography_and_location_basis_distinct(analytics_client):
    response = analytics_client.get("/api/demo/regions")

    assert response.status_code == 200
    cells = response.json()["cells"]
    assert any(cell["dimensions"].get("region") == "unknown" for cell in cells)
    assert any(cell["dimensions"].get("location_basis") == "service_search_area" for cell in cells)
    assert any(cell["dimensions"].get("location_basis") == "stated_demo_region" for cell in cells)


def test_trend_labels_injected_pattern_as_artificial(analytics_client):
    response = analytics_client.get("/api/demo/trend")

    assert response.status_code == 200
    assert "artificial demonstration pattern" in response.json()["caveat"].lower()


def test_event_filters_are_applied_to_topic_and_quality_tables(analytics_client):
    topics_response = analytics_client.get(
        "/api/demo/topics",
        params={"topic_code": "primary_care", "service_code": "gp"},
    )
    quality_response = analytics_client.get(
        "/api/demo/quality",
        params={"topic_code": "primary_care", "service_code": "gp"},
    )

    assert topics_response.status_code == 200
    assert topics_response.json()["filters_applied"]["topic_code"] == "primary_care"
    assert quality_response.status_code == 200
    assert quality_response.json()["filters_applied"]["service_code"] == "gp"


def test_session_level_tables_do_not_echo_ignored_event_filters(analytics_client):
    response = analytics_client.get(
        "/api/demo/quality",
        params={"topic_code": "primary_care", "service_code": "gp"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["filters_applied"]["topic_code"] == "primary_care"
    assert "topic_code" not in payload["tables"]["unknown_location_share"]["filters_applied"]
    assert "service_code" not in payload["tables"]["unknown_location_share"]["filters_applied"]
    assert payload["tables"]["unclassified_topic_events"]["filters_applied"]["service_code"] == "gp"


def test_week_bucket_is_available_and_uses_week_start_dimension(analytics_client):
    response = analytics_client.get("/api/demo/trend", params={"bucket": "week"})

    assert response.status_code == 200
    assert response.json()["time_bucket"] == "week"
    assert all("week" in cell["dimensions"] for cell in response.json()["cells"])


def test_unsupported_time_bucket_returns_422(analytics_client):
    response = analytics_client.get("/api/demo/trend", params={"bucket": "day"})

    assert response.status_code == 422


def test_week_bucket_keeps_monday_in_its_own_week(analytics_client):
    response = analytics_client.get(
        "/api/demo/trend",
        params={"bucket": "week", "start_date": "2025-01-06", "end_date": "2025-01-06"},
    )

    assert response.status_code == 200
    assert any(cell["dimensions"]["week"] == "2025-01-06" for cell in response.json()["cells"])


def test_cli_passes_loopback_host_and_selected_database(monkeypatch, tmp_path):
    cli = importlib.import_module("medibridge.analytics_demo.__main__")
    calls = {}
    monkeypatch.setattr(cli.uvicorn, "run", lambda app, **kwargs: calls.update(app=app, **kwargs))
    database = tmp_path / "cli.sqlite"

    cli.main(["--db", str(database), "--port", "8123"])

    assert calls["host"] == "127.0.0.1"
    assert calls["port"] == 8123
    assert calls["app"].state.db_path == database.resolve()


def test_api_database_connections_are_read_only(analytics_client):
    api = _api_module()
    conn = api._database_connection(analytics_client.app.state.db_path)
    try:
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            conn.execute("UPDATE sessions SET region = 'unknown'")
    finally:
        conn.close()
