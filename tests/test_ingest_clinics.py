"""Clinics CSV ingest: repair + dedupe + insert tests."""
from __future__ import annotations

import csv
import sqlite3
from pathlib import Path

from medibridge.data import db as dbmod
from medibridge.data.ingest.clinics import ingest_clinics, parse_clinics_csv

HEADER = "id,name,address,suburb,state,postcode,phone,hours,billing,type,latitude,longitude,nhsd_id"


def write_csv(tmp_path: Path, rows: list[str]) -> Path:
    path = tmp_path / "clinics_qld.csv"
    with path.open("w", encoding="utf-8", newline="") as fh:
        fh.write(HEADER + "\n")
        for row in rows:
            fh.write(row + "\n")
    return path


def row(**overrides) -> str:
    base = {
        "id": "1", "name": "Test Clinic", "address": "1 Test St, BRISBANE CITY, QLD 4000",
        "suburb": "BRISBANE CITY", "state": "QLD", "postcode": "4000",
        "phone": "null", "hours": "null", "billing": "bulk", "type": "GP",
        "latitude": "null", "longitude": "null", "nhsd_id": "n1",
    }
    base.update(overrides)
    return ",".join(f'"{base[c]}"' for c in HEADER.split(","))


def test_null_literals_become_none(tmp_path: Path) -> None:
    path = write_csv(tmp_path, [row()])
    rows = parse_clinics_csv(path)
    assert rows[0]["phone"] is None
    assert rows[0]["hours"] is None
    assert rows[0]["latitude"] is None
    assert rows[0]["longitude"] is None


def test_postcode_repaired_from_address_tail(tmp_path: Path) -> None:
    path = write_csv(tmp_path, [
        row(id="1", name="Acacia Ridge Doctors",
            address="SHOP 13, 1150 Beaudesert Road, ACACIA RIDGE, QLD 4110",
            suburb="ACACIA RIDGE", postcode="1150"),
    ])
    rows = parse_clinics_csv(path)
    assert rows[0]["postcode"] == "4110"


def test_nsw_rows_relabeled_state_and_suburb(tmp_path: Path) -> None:
    path = write_csv(tmp_path, [
        row(id="1", name="Murwillumbah District Hospital",
            address="8-10 Ewing Street, MURWILLUMBAH, NSW 2484",
            suburb="SURFERS PARADISE", state="QLD", postcode="2484", type="Hospital"),
    ])
    rows = parse_clinics_csv(path)
    assert rows[0]["state"] == "NSW"
    assert rows[0]["suburb"] == "MURWILLUMBAH"
    assert rows[0]["postcode"] == "2484"


def test_suburb_repaired_from_address(tmp_path: Path) -> None:
    path = write_csv(tmp_path, [
        row(id="1", name="Peninsula Private Hospital",
            address="Corner Florence and George Street, KIPPA-RING, QLD 4021",
            suburb="BRACKEN RIDGE", postcode="4021", type="Hospital"),
    ])
    rows = parse_clinics_csv(path)
    assert rows[0]["suburb"] == "KIPPA-RING"


def test_duplicate_rows_merged_into_multivalue_type(tmp_path: Path) -> None:
    """Same practice listed once per service type → one row, comma type."""
    path = write_csv(tmp_path, [
        row(id="1", name="Calamvale Family Practice",
            address="SHOP 18, 2605 BEAUDESERT ROAD, CALAMVALE, QLD 4116",
            suburb="CALAMVALE", postcode="4116", billing="mixed", type="GP", nhsd_id="a1"),
        row(id="2", name="Calamvale Family Practice",
            address="SHOP 18, 2605 BEAUDESERT ROAD, CALAMVALE, QLD 4116",
            suburb="CALAMVALE", postcode="4116", billing="private", type="Psychology", nhsd_id="a2"),
    ])
    rows = parse_clinics_csv(path)
    assert len(rows) == 1
    assert rows[0]["type"] == "GP, Psychology"
    # billing anchors on the GP row
    assert rows[0]["billing"] == "mixed"


def test_near_duplicate_addresses_merged(tmp_path: Path) -> None:
    """Same name+suburb+postcode, shared street number → one row."""
    path = write_csv(tmp_path, [
        row(id="1", name="Banyo Village Medical centre",
            address="Shop 1, Shop 1, 299 Saint Vincents Road, BANYO, QLD 4014",
            suburb="BANYO", postcode="4014", type="GP", nhsd_id="b1"),
        row(id="2", name="banyo village medical centre",
            address="SHOP 1, 299 St Vincents Road, BANYO, QLD 4014",
            suburb="BANYO", postcode="4014", type="GP", nhsd_id="b2"),
    ])
    rows = parse_clinics_csv(path)
    assert len(rows) == 1
    assert rows[0]["address"] == "Shop 1, 299 Saint Vincents Road, BANYO, QLD 4014"


def test_same_name_different_suburbs_not_merged(tmp_path: Path) -> None:
    path = write_csv(tmp_path, [
        row(id="1", name="Star Medical Centre",
            address="Acacia Ridge Shopping Centre, ACACIA RIDGE, QLD 4110",
            suburb="ACACIA RIDGE", postcode="4110", nhsd_id="s1"),
        row(id="2", name="Star Medical Centre",
            address="302 Mains Road, SUNNYBANK, QLD 4109",
            suburb="SUNNYBANK", postcode="4109", nhsd_id="s2"),
    ])
    rows = parse_clinics_csv(path)
    assert len(rows) == 2


def test_name_cleaned(tmp_path: Path) -> None:
    path = write_csv(tmp_path, [
        row(id="1", name="Sue?s Corner Discount Drug Store",
            address="Corner Beams and Sandgate Road, BOONDALL, QLD 4034",
            suburb="BOONDALL", postcode="4034", type="Pharmacy", billing="mixed"),
        row(id="2", name="Healthcare Plus Medical Centre, Shop 1025 Westfield Carindale, 1151 Creek Road Carindale QLD 4152",
            address="Shop 1025 (Ground) Westfield Carindale, CARINDALE, QLD 4152",
            suburb="CARINDALE", postcode="4152", type="GP"),
    ])
    rows = parse_clinics_csv(path)
    by_name = {r["name"] for r in rows}
    assert "Sue's Corner Discount Drug Store" in by_name
    assert "Healthcare Plus Medical Centre" in by_name


def test_fresh_ids_assigned_by_sqlite(tmp_path: Path) -> None:
    path = write_csv(tmp_path, [
        row(id="9999", name="Clinic A", address="1 A St, BRISBANE CITY, QLD 4000",
            suburb="BRISBANE CITY", postcode="4000", nhsd_id="x1"),
        row(id="8888", name="Clinic B", address="2 B St, BRISBANE CITY, QLD 4000",
            suburb="BRISBANE CITY", postcode="4000", nhsd_id="x2"),
    ])
    db_path = tmp_path / "test.db"
    with dbmod.get_conn(db_path) as conn:
        dbmod.init_schema(conn)
        n = ingest_clinics(conn, path)
    assert n == 2
    con = sqlite3.connect(db_path)
    ids = [r[0] for r in con.execute("SELECT id FROM clinics ORDER BY id")]
    con.close()
    assert ids == [1, 2]


def test_row_without_name_dropped(tmp_path: Path) -> None:
    path = write_csv(tmp_path, [
        row(id="1", name=""),
        row(id="2", name="Good Clinic"),
    ])
    rows = parse_clinics_csv(path)
    assert len(rows) == 1
    assert rows[0]["name"] == "Good Clinic"
