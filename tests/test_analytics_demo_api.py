"""FastAPI contract tests for the standalone synthetic analytics demo."""

from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
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
    "/api/demo/timeline",
    "/api/demo/matrix",
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
    params = {"start_date": "2025-01-01", "end_date": "2025-01-31", "region": "Brisbane"}
    if path == "/api/demo/matrix":
        params["pair"] = "topic_code:region"
    response = analytics_client.get(
        path,
        params=params,
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


def test_meta_date_range_does_not_advertise_dates_rejected_by_filters(analytics_client):
    conn = sqlite3.connect(analytics_client.app.state.db_path)
    try:
        conn.execute(
            "UPDATE sessions SET started_at_utc = ? WHERE session_id = ?",
            ("2026-09-30T15:30:00Z", "session-test-17"),
        )
        conn.commit()
    finally:
        conn.close()

    response = analytics_client.get("/api/demo/meta")

    assert response.status_code == 200
    assert response.json()["available_date_range"]["end_date"] == "2026-09-30"


def test_empty_selection_has_stable_zero_shape(analytics_client):
    response = analytics_client.get("/api/demo/overview", params={"region": "Far North Queensland"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["numerator"] == 0
    assert payload["denominator"] == 0
    assert payload["value"] == 0
    assert payload["suppressed"] is False
    assert payload["no_data"] is True
    assert payload["data_state"] == "no_data"
    assert "no matching sessions" in payload["caveat"].lower()
    assert payload["cells"]
    assert payload["cells"][0]["numerator"] == 0
    assert payload["cells"][0]["denominator"] == 0
    assert payload["cells"][0]["reason_code"] is None
    assert payload["synthetic"] is True


def test_zero_numerator_with_positive_denominator_is_not_no_data():
    from medibridge.analytics_demo.api import _table
    from medibridge.analytics_demo.metrics import AggregateCell

    table = _table("share", "share", [AggregateCell({}, 0, 100, 0.0, 0)], "Synthetic metric.")

    assert table["numerator"] == 0
    assert table["denominator"] == 100
    assert table["value"] == 0
    assert table["no_data"] is False
    assert table["data_state"] == "available"


def test_all_suppressed_topic_table_has_nulls_and_explicit_flags(analytics_client):
    response = analytics_client.get("/api/demo/topics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["cells"]
    assert all(cell["suppressed"] for cell in payload["cells"])
    assert all(cell["value"] is None for cell in payload["cells"])
    assert all(cell["denominator"] is None for cell in payload["cells"])
    assert all(cell["reason_code"] for cell in payload["cells"])
    assert payload["no_data"] is False
    assert payload["data_state"] == "suppressed"


def test_regions_keep_unknown_geography_and_location_basis_distinct(analytics_client):
    response = analytics_client.get("/api/demo/regions")

    assert response.status_code == 200
    cells = response.json()["cells"]
    assert any(cell["dimensions"].get("region") == "unknown" for cell in cells)
    assert any(cell["dimensions"].get("location_basis") == "service_search_area" for cell in cells)
    assert any(cell["dimensions"].get("location_basis") == "stated_demo_region" for cell in cells)


def test_region_rate_emits_zero_for_selected_category_with_no_matching_events(analytics_client):
    response = analytics_client.get(
        "/api/demo/regions",
        params={"region": "Brisbane", "topic_code": "respiratory_information"},
    )

    assert response.status_code == 200
    table = response.json()["tables"]["topic_rates"]
    cell = next(
        cell for cell in table["cells"]
        if cell["dimensions"].get("topic_code") == "respiratory_information"
    )
    assert cell["numerator"] == 0
    assert cell["denominator"] == 6
    assert cell["value"] == 0
    assert cell["suppressed"] is False
    assert table["no_data"] is False


def test_empty_trend_selection_returns_explicit_no_data_shape(analytics_client):
    response = analytics_client.get(
        "/api/demo/trend",
        params={"region": "Far North Queensland"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["no_data"] is True
    assert payload["data_state"] == "no_data"
    assert payload["numerator"] == 0
    assert payload["denominator"] == 0
    assert payload["value"] == 0
    assert payload["cells"] == []
    assert "no matching sessions" in payload["caveat"].lower()


def test_trend_labels_injected_pattern_as_artificial(analytics_client):
    response = analytics_client.get("/api/demo/trend")

    assert response.status_code == 200
    assert "artificial demonstration pattern" in response.json()["caveat"].lower()


def test_trend_hides_derived_baseline_when_current_cell_is_suppressed(analytics_client, monkeypatch):
    from types import SimpleNamespace

    from medibridge.analytics_demo import api
    from medibridge.analytics_demo.disclosure import SuppressedCell

    def period_rows(conn, filters, bucket, category, date_free=False):
        if category != "topic_code":
            return {}, {}
        if date_free:
            return {("2024-01", "Brisbane", "stated_demo_region", "primary_care"): (12, 100)}, {}
        return {("2025-01", "Brisbane", "stated_demo_region", "primary_care"): (2, 20)}, {}

    def selectively_suppress(rows):
        if not rows:
            return SimpleNamespace(cells=())
        current, baseline = rows
        return SimpleNamespace(
            cells=(
                SuppressedCell(current.dimensions, None, None, None, None, True, "primary_suppression"),
                SuppressedCell(baseline.dimensions, baseline.numerator, baseline.denominator,
                               baseline.value, baseline.distinct_sessions, False, None),
            )
        )

    monkeypatch.setattr(api, "_period_rows", period_rows)
    monkeypatch.setattr(api, "suppress_table", selectively_suppress)
    conn = api._database_connection(analytics_client.app.state.db_path)
    try:
        tables = api._trend_tables(conn, api.AnalyticsFilter(), "month")
    finally:
        conn.close()

    cell = tables["topic_code_trend"]["cells"][0]
    assert cell["suppressed"] is True
    assert cell["baseline_available"] is False
    assert cell["baseline_numerator"] is None
    assert cell["baseline_denominator"] is None
    assert cell["baseline_rate_per_1000"] is None
    assert cell["rate_difference_per_1000"] is None


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


def test_timeline_returns_month_tables_with_trend_baseline_fields(analytics_client):
    response = analytics_client.get(
        "/api/demo/timeline",
        params={"region": "Brisbane", "location_basis": "stated_demo_region"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["endpoint"] == "timeline"
    assert payload["filters_applied"]["region"] == "Brisbane"
    assert payload["filters_applied"]["location_basis"] == "stated_demo_region"
    assert "selected_sessions_by_month" in payload["tables"]
    session_cells = payload["tables"]["selected_sessions_by_month"]["cells"]
    assert session_cells
    assert all("month" in cell["dimensions"] for cell in session_cells)
    topic_tables = [name for name in payload["tables"] if name.startswith("topic_month_rates.")]
    assert topic_tables
    for name in topic_tables:
        assert all(cell["dimensions"]["topic_code"] == name.split(".", 1)[1]
                   for cell in payload["tables"][name]["cells"])
        for cell in payload["tables"][name]["cells"]:
            assert "month" in cell["dimensions"]
            assert {"baseline_available", "baseline_numerator", "baseline_denominator",
                    "baseline_rate_per_1000", "rate_difference_per_1000"}.issubset(cell)


def test_matrix_has_allowlisted_dimensions_and_keeps_unknown_categories(analytics_client):
    response = analytics_client.get("/api/demo/matrix", params={"pair": "topic_code:region"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["endpoint"] == "matrix"
    assert payload["matrix_pair"] == {"row": "topic_code", "column": "region"}
    table = payload["tables"]["matrix"]
    assert table["unit"] == "sessions_per_1000_row_sessions"
    assert any(cell["dimensions"].get("topic_code") == "unknown_unclassified" for cell in table["cells"])
    assert any(cell["dimensions"].get("region") == "unknown" for cell in table["cells"])
    assert all("session_id" not in cell["dimensions"] for cell in table["cells"])


@pytest.mark.parametrize(
    "pair",
    ["service_code:region", "topic_code:insurer_id", "region:location_basis"],
)
def test_matrix_accepts_each_other_allowlisted_pair(analytics_client, pair):
    response = analytics_client.get("/api/demo/matrix", params={"pair": pair})

    assert response.status_code == 200
    assert response.json()["matrix_pair"] == {
        "row": pair.split(":")[0],
        "column": pair.split(":")[1],
    }


def test_topic_session_table_shows_cohort_denominator_without_normalizing_count(analytics_client):
    conn = sqlite3.connect(analytics_client.app.state.db_path)
    conn.executemany(
        "INSERT INTO issue_events VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            (f"event-test-extra-{index:02d}", f"message-test-{index:02d}",
             "coverage_waiting_period", "gp", "waiting_period", "resolved", "demo-topic-taxonomy-v1")
            for index in (0, 1, 3, 4, 5, 6, 7, 9)
        ],
    )
    conn.commit()
    conn.close()

    payload = analytics_client.get(
        "/api/demo/overview", params={"topic_code": "coverage_waiting_period"}
    ).json()
    selected_sessions = payload["tables"]["selected_sessions"]["cells"][0]
    topic_cell = payload["tables"]["topic_sessions"]["cells"][0]

    assert selected_sessions["numerator"] == 18
    assert topic_cell["suppressed"] is False
    assert topic_cell["numerator"] == 11
    assert topic_cell["value"] == 11
    assert topic_cell["denominator"] == selected_sessions["numerator"]
    assert "denominator is selected cohort sessions" in payload["tables"]["topic_sessions"]["caveat"]

    for path in ("/api/demo/topics", "/api/demo/coverage-friction"):
        shared_payload = analytics_client.get(
            path, params={"topic_code": "coverage_waiting_period"}
        ).json()
        shared_cell = shared_payload["tables"]["topic_sessions"]["cells"][0]
        assert shared_cell["numerator"] == shared_cell["value"] == 11
        assert shared_cell["denominator"] == 18


@pytest.mark.parametrize("pair", [None, "topic_code", "topic_code:topic_code", "session_id:region",
                                  "region:location_basis:topic_code", "topic_code:"])
def test_matrix_rejects_missing_or_invalid_pairs(analytics_client, pair):
    params = {} if pair is None else {"pair": pair}
    assert analytics_client.get("/api/demo/matrix", params=params).status_code == 422


def test_matrix_rejects_duplicate_pair_and_unknown_query_parameters(analytics_client):
    duplicate = analytics_client.get("/api/demo/matrix?pair=topic_code:region&pair=service_code:region")
    unknown = analytics_client.get("/api/demo/matrix", params={"pair": "topic_code:region", "raw": "1"})

    assert duplicate.status_code == 422
    assert unknown.status_code == 422


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


def test_api_database_connection_can_run_and_close_on_fastapi_worker_thread(analytics_client):
    api = _api_module()
    conn = api._database_connection(analytics_client.app.state.db_path)
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            count = executor.submit(
                lambda: conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
            ).result()
            executor.submit(conn.close).result()

        assert count == 18
    finally:
        conn.close()
