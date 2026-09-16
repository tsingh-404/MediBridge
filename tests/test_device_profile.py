"""Device-scoped profiles — two mobile installs must not clobber each other,
and requests without the header must keep hitting the shared legacy row."""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from medibridge.data import db as dbmod
from medibridge.data.ingest.insurers import seed_all
from medibridge import profile as profmod
from medibridge.server.main import app
from medibridge.tools.coverage_calculator import _get_user_tier


@pytest.fixture()
def db(tmp_path: Path, monkeypatch):
    db_path = tmp_path / "test.db"
    c = dbmod.connect(db_path)
    dbmod.init_schema(c)
    seed_all(c)
    c.commit()
    c.close()

    # get_conn() binds DB_PATH as a default argument at import time, so patching
    # the module attribute is not enough — rebind the function itself, or these
    # tests silently write to the real data/medibridge.db.
    real_get_conn = dbmod.get_conn
    monkeypatch.setattr(dbmod, "get_conn", lambda p=db_path: real_get_conn(p))
    monkeypatch.setattr(profmod, "USER_PROFILE_JSON", tmp_path / "user_profile.json")
    yield db_path


def _tiers(db_path) -> list[str]:
    with dbmod.get_conn() as c:
        return [r["tier_id"] for r in c.execute("SELECT tier_id FROM insurer_tiers ORDER BY tier_id")]


def test_two_devices_keep_separate_profiles(db):
    a, b = _tiers(db)[0], _tiers(db)[1]

    profmod.save_profile(a, "single", "2025-01-01", device_id="dev-a")
    profmod.save_profile(b, "family", "2024-06-01", device_id="dev-b")

    pa = profmod.load_profile("dev-a")
    pb = profmod.load_profile("dev-b")
    assert pa["tier"]["id"] == a and pa["cover"] == "single"
    assert pb["tier"]["id"] == b and pb["cover"] == "family"
    # Saving dev-b must not have overwritten dev-a (the old code DELETEd every row).
    assert pa["tier"]["id"] != pb["tier"]["id"]


def test_legacy_row_is_independent_of_devices(db):
    a, b = _tiers(db)[0], _tiers(db)[1]

    profmod.save_profile(a, "single", "2025-01-01")             # CLI / desktop web
    profmod.save_profile(b, "couple", "2025-02-02", device_id="dev-a")

    assert profmod.load_profile()["tier"]["id"] == a
    assert profmod.load_profile("dev-a")["tier"]["id"] == b
    assert profmod.has_profile() and profmod.has_profile("dev-a")
    assert not profmod.has_profile("dev-unknown")
    assert profmod.load_profile("dev-unknown") is None


def test_clear_is_scoped(db):
    a, b = _tiers(db)[0], _tiers(db)[1]

    profmod.save_profile(a, "single", "2025-01-01")
    profmod.save_profile(b, "single", "2025-01-01", device_id="dev-a")

    profmod.clear_profile("dev-a")
    assert profmod.load_profile("dev-a") is None
    assert profmod.load_profile() is not None


def test_coverage_tier_lookup_is_device_scoped(db):
    a, b = _tiers(db)[0], _tiers(db)[1]

    profmod.save_profile(a, "single", "2025-01-01")
    profmod.save_profile(b, "single", "2025-01-01", device_id="dev-a")

    with dbmod.get_conn() as c:
        assert _get_user_tier(c)["tier_id"] == a
        assert _get_user_tier(c, "dev-a")["tier_id"] == b
        assert _get_user_tier(c, "dev-missing") is None


def test_device_from_config():
    assert profmod.device_from_config({"configurable": {"device_id": "x"}}) == "x"
    assert profmod.device_from_config({"configurable": {"device_id": None}}) is None
    assert profmod.device_from_config({}) is None
    assert profmod.device_from_config(None) is None


def test_profile_http_routes_scope_by_device_header(db):
    tiers = _tiers(db)
    client = TestClient(app)

    legacy = {"tier_id": tiers[0], "cover_type": "single", "policy_start_date": "2025-01-01"}
    device_a = {"tier_id": tiers[1], "cover_type": "couple", "policy_start_date": "2025-02-02"}
    device_b = {"tier_id": tiers[2], "cover_type": "family", "policy_start_date": "2025-03-03"}

    assert client.put("/api/profile", json=legacy).status_code == 200
    assert client.put("/api/profile", json=device_a, headers={"X-MB-Device": "dev-a"}).status_code == 200
    assert client.put("/api/profile", json=device_b, headers={"X-MB-Device": "dev-b"}).status_code == 200

    assert client.get("/api/profile").json()["tier"]["id"] == tiers[0]
    assert client.get("/api/profile", headers={"X-MB-Device": "dev-a"}).json()["tier"]["id"] == tiers[1]
    assert client.get("/api/profile", headers={"X-MB-Device": "dev-b"}).json()["tier"]["id"] == tiers[2]


def test_profile_http_delete_is_scoped_to_device_header(db):
    tiers = _tiers(db)
    client = TestClient(app)

    assert client.put(
        "/api/profile",
        json={"tier_id": tiers[0], "cover_type": "single", "policy_start_date": "2025-01-01"},
    ).status_code == 200
    assert client.put(
        "/api/profile",
        json={"tier_id": tiers[1], "cover_type": "single", "policy_start_date": "2025-01-01"},
        headers={"X-MB-Device": "dev-a"},
    ).status_code == 200

    assert client.delete("/api/profile", headers={"X-MB-Device": "dev-a"}).status_code == 204

    assert client.get("/api/profile", headers={"X-MB-Device": "dev-a"}).status_code == 404
    assert client.get("/api/profile").json()["tier"]["id"] == tiers[0]
