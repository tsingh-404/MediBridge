"""Tests for the separate, aggregate-only analytics dashboard shell."""

import sqlite3

from fastapi.testclient import TestClient

from medibridge.analytics_demo.api import create_app
from medibridge.analytics_demo.schema import create_schema


def test_dashboard_page_and_assets_are_served_from_separate_route(tmp_path):
    database = tmp_path / "analytics-demo.sqlite"
    with sqlite3.connect(database) as conn:
        create_schema(conn)

    with TestClient(create_app(database)) as client:
        page = client.get("/dashboard/")
        script = client.get("/dashboard/assets/dashboard.js")
        stylesheet = client.get("/dashboard/assets/dashboard.css")

    assert page.status_code == 200
    assert "Synthetic demo &#8212; not real student data" in page.text
    assert "/dashboard/assets/dashboard.js" in page.text
    assert script.status_code == 200
    assert "Overview" in script.text
    assert stylesheet.status_code == 200
    assert "@media" in stylesheet.text


def test_analytics_routes_remain_distinct_from_dashboard_assets(tmp_path):
    database = tmp_path / "analytics-demo.sqlite"
    with sqlite3.connect(database) as conn:
        create_schema(conn)

    with TestClient(create_app(database)) as client:
        metadata = client.get("/api/demo/meta")
        dashboard_asset = client.get("/dashboard/assets/dashboard.js")

    assert metadata.status_code == 200
    assert metadata.json()["data_state"] == "metadata"
    assert dashboard_asset.status_code == 200
    assert metadata.headers["content-type"].startswith("application/json")
    assert dashboard_asset.headers["content-type"].startswith("text/javascript")
