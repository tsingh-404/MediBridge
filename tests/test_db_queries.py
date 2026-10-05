"""DB schema + FTS5 + lookup tests against an isolated SQLite DB."""
from __future__ import annotations

from pathlib import Path

import pytest

from medibridge.data import db as dbmod
from medibridge.data import queries
from medibridge.data.ingest.mbs import (
    insert_imap_mappings,
    insert_mbs_items,
    populate_fts,
    populate_lookup_tables,
)
from medibridge.models.mbs_item import IMAPMapping, MBSItem


@pytest.fixture()
def conn(tmp_path: Path):
    db_path = tmp_path / "test.db"
    c = dbmod.connect(db_path)
    dbmod.init_schema(c)
    yield c
    c.close()


def _seed(conn) -> None:
    items = [
        MBSItem(item_num="23", description="GP Level B attendance",
                schedule_fee=43.90, benefit_100=43.90, benefit_type="E",
                category="1", group_code="A1"),
        MBSItem(item_num="104", description="Specialist initial consultation",
                schedule_fee=101.35, benefit_85=86.15, benefit_75=76.05,
                benefit_type="C", category="1", group_code="A4"),
        MBSItem(item_num="73807", description="Blood test full count",
                schedule_fee=16.95, benefit_85=14.45, benefit_75=12.75,
                benefit_type="C", category="6", group_code="P1"),
    ]
    insert_mbs_items(conn, items)
    mappings = [
        IMAPMapping(item_num="23", mapped_item="23", category_desc="PROFESSIONAL ATTENDANCES",
                    group_desc="GENERAL PRACTITIONER ATTENDANCES", btos_desc="Non-referred attendances GP/VR GP"),
        IMAPMapping(item_num="104", mapped_item="104", category_desc="PROFESSIONAL ATTENDANCES",
                    group_desc="CONSULTANT PHYSICIAN", btos_desc="Specialist attendances"),
        IMAPMapping(item_num="73807", mapped_item="73807", category_code="06",
                    group_code="P1", btos_code="0601",
                    category_desc="PATHOLOGY SERVICES",
                    group_desc="HAEMATOLOGY", btos_desc="Pathology Tests"),
    ]
    insert_imap_mappings(conn, mappings)
    populate_lookup_tables(conn)
    populate_fts(conn)


def test_get_item_by_number(conn) -> None:
    _seed(conn)
    item = queries.get_item_by_number(conn, "23")
    assert item is not None
    assert item["schedule_fee"] == 43.90
    assert item["benefit_type"] == "E"
    assert item["group_desc"] == "GENERAL PRACTITIONER ATTENDANCES"


def test_fts5_blood_test(conn) -> None:
    _seed(conn)
    rows = queries.search_items_by_keyword(conn, "blood test", limit=5)
    assert any(r["item_num"] == "73807" for r in rows)


def test_fts5_populated(conn) -> None:
    _seed(conn)
    assert queries.fts_count(conn) == 3


def test_lookup_tables_built(conn) -> None:
    _seed(conn)
    cat = conn.execute("SELECT * FROM categories").fetchall()
    assert any(r["category_desc"] == "PATHOLOGY SERVICES" for r in cat)


def test_get_clinic_analytics(conn) -> None:
    conn.executemany(
        """
        INSERT INTO clinics (
            id, name, suburb, state, postcode, billing, type
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (1, "Clinic A", "Brisbane", "QLD", "4000", "bulk", "GP"),
            (2, "Clinic B", "Brisbane", "QLD", "4000", "mixed", "GP, Psychology"),
            (3, "Clinic C", "South Brisbane", "QLD", "4101", None, "Psychiatry"),
        ],
    )
    conn.commit()

    result = queries.get_clinic_analytics(conn)

    assert result["total_clinics"] == 3
    assert result["by_type"]["GP"] == 2
    assert result["by_type"]["Psychology"] == 1
    assert result["by_type"]["Psychiatry"] == 1
    assert result["by_billing"]["bulk"] == 1
    assert result["by_billing"]["mixed"] == 1
    assert result["by_billing"]["unknown"] == 1
    assert result["by_billing"]["private"] == 0
