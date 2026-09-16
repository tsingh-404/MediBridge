"""Read CSV seed: data/sources/clinics_qld.csv → medibridge.db.clinics.

The scraped CSV needs repair before it is queryable:

* Literal ``"null"`` strings (phone/hours/latitude/longitude/address) → NULL.
* Postcode column frequently holds a street number (e.g. "1150"); the true
  postcode is embedded in the address tail ("..., ACACIA RIDGE, QLD 4110").
  The address tail is authoritative and repairs all 100+ bad rows.
* State/suburb repaired from the address tail (2 NSW hospitals were labeled
  QLD/SURFERS PARADISE; one hospital's suburb was a neighbouring suburb).
* Duplicate rows — the same practice listed once per service type (GP +
  Psychology at the same address) or with address-variant noise — are merged
  into one row with a comma-joined ``type`` (matches the multi-value type
  semantics of queries.search_clinics).
* Fresh SQLite rowids are assigned; the CSV ``id`` column is dropped.
"""
from __future__ import annotations

import csv
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

from medibridge.config import CLINICS_SOURCE_PATH

# Address tail: "..., <SUBURB>, <STATE> <NNNN>" at end of address.
_TAIL_RE = re.compile(
    r",\s*([^,]+?),\s*(QLD|NSW|VIC|ACT|WA|SA|TAS|NT)\s+(\d{4})\s*$",
    re.IGNORECASE,
)
# Name that ends with an address fragment ("..., Shop 123 ... QLD 4000").
_NAME_ADDR_TAIL_RE = re.compile(r",\s*SHOP\s+.*QLD\s*\d{4}\s*$", re.IGNORECASE)

_STATE_NAMES = {"QLD", "NSW", "VIC", "ACT", "WA", "SA", "TAS", "NT"}


def _norm(value: str | None) -> str:
    """Lowercase, strip non-alphanumerics — for duplicate keys only."""
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def _street_numbers(value: str | None) -> set[str]:
    """Multi-digit numeric tokens in an address, for near-dup detection."""
    return {t for t in re.findall(r"\d+", value or "") if len(t) >= 2}


def _clean_str(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if value.lower() == "null":
        return None
    # Collapse whitespace, normalise spaces around commas.
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\s*,\s*", ", ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def _clean_name(value: str) -> str:
    name = (_clean_str(value) or "").strip().rstrip(",").strip()
    if "?" in name:
        # Scrape encoding artifact, e.g. "Sue?s Corner" → "Sue's Corner".
        name = name.replace("?", "'")
    if _NAME_ADDR_TAIL_RE.search(name):
        # "Healthcare Plus Medical Centre, Shop 1025 ... QLD 4152" →
        # "Healthcare Plus Medical Centre".
        idx = name.upper().index(", SHOP")
        name = name[:idx].strip().rstrip(",").strip()
    return name


def _clean_address(value: str | None) -> str | None:
    addr = _clean_str(value)
    if addr:
        addr = re.sub(r"^[, ]+", "", addr)  # ",, BRACKEN RIDGE, QLD 4017"
        addr = re.sub(r",\s*,", ", ", addr)
        # Scrape artifact: "Shop 1, Shop 1, 299 ..." → "Shop 1, 299 ..."
        addr = re.sub(r"\b([A-Za-z]+ \d+), \1,", r"\1,", addr)
        addr = re.sub(r"\s+", " ", addr).strip()
    return addr


def _repair_row(raw: dict) -> dict:
    """Normalise one CSV row; returns None if the row is unusable."""
    name = _clean_name(raw["name"])
    suburb = (_clean_str(raw["suburb"]) or "").strip().upper()
    state = (_clean_str(raw["state"]) or "").strip().upper()
    postcode = (_clean_str(raw["postcode"]) or "").strip()
    address = _clean_address(raw["address"])
    billing = (_clean_str(raw["billing"]) or "").strip().lower()
    ctype = (_clean_str(raw["type"]) or "").strip()
    nhsd_id = (_clean_str(raw["nhsd_id"]) or "").strip()

    tail = _TAIL_RE.search(address or "")
    if tail:
        tail_suburb, tail_state, tail_postcode = tail.group(1), tail.group(2).upper(), tail.group(3)
        postcode = tail_postcode
        state = tail_state if tail_state in _STATE_NAMES else state
        if _norm(tail_suburb) != _norm(suburb):
            suburb = tail_suburb.strip().upper()

    if not name or not suburb or not postcode:
        return None

    return {
        "name": name,
        "address": address,
        "suburb": suburb,
        "state": state or "QLD",
        "postcode": postcode,
        "phone": _clean_str(raw["phone"]),
        "hours": _clean_str(raw["hours"]),
        "billing": billing,
        "type": ctype,
        "latitude": _to_float(raw["latitude"]),
        "longitude": _to_float(raw["longitude"]),
        "nhsd_id": nhsd_id,
    }


def _to_float(value: str) -> float | None:
    value = _clean_str(value)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _merge_duplicates(rows: list[dict]) -> list[dict]:
    """Merge rows representing the same practice/location.

    Stage 1: identical (name, suburb, address) — the same clinic listed once
    per service type (GP + Psychology at one address).
    Stage 2: same (name, suburb, postcode) where addresses share a
    multi-digit street number ("SHOP 1, 299 Saint Vincents Road" vs
    "SHOP 1, 299 St Vincents Road"). Chains with distinct locations are
    protected because their suburbs or street numbers differ.

    Merged type = sorted comma-join of all service types. Billing is taken
    from the anchor row: the first GP listing if any, else the first row in
    file order.
    """
    def anchor(group: list[dict]) -> dict:
        for row in group:
            if row["type"] == "GP":
                return row
        return group[0]

    merged: dict[tuple, dict] = {}
    by_location: dict[tuple, list[dict]] = defaultdict(list)
    for row in rows:
        key = (_norm(row["name"]), _norm(row["suburb"]), _norm(row["address"]))
        by_location[key].append(row)

    for key, group in by_location.items():
        base = anchor(group)
        types = sorted({r["type"] for r in group if r["type"]})
        merged[key] = dict(base)
        merged[key]["type"] = ", ".join(types)

    # Stage 2: near-duplicate addresses within same name+suburb+postcode.
    by_name_suburb_pc: dict[tuple, list[tuple]] = defaultdict(list)
    for key, row in merged.items():
        name_norm, suburb_norm, _ = key
        by_name_suburb_pc[(name_norm, suburb_norm, row["postcode"])].append(
            (key, row)
        )

    final: dict[tuple, dict] = {}
    for groups in by_name_suburb_pc.values():
        if len(groups) == 1:
            key, row = groups[0]
            final[key] = row
            continue
        clusters: list[list[tuple]] = []
        for key, row in groups:
            numbers = _street_numbers(row["address"])
            target = None
            for cluster in clusters:
                if any(_street_numbers(r["address"]) & numbers for _, r in cluster):
                    target = cluster
                    break
            if target is not None:
                target.append((key, row))
            else:
                clusters.append([(key, row)])
        for cluster in clusters:
            base = anchor([r for _, r in cluster])
            types = sorted({t for _, r in cluster for t in r["type"].split(", ") if t})
            out_key = cluster[0][0]
            final[out_key] = dict(base)
            final[out_key]["type"] = ", ".join(types)

    return list(final.values())


def parse_clinics_csv(source_path: Path = CLINICS_SOURCE_PATH) -> list[dict]:
    """Read, repair and dedupe the clinics CSV. Pure function (no DB access)."""
    if not source_path.exists():
        raise FileNotFoundError(f"Clinics source CSV missing: {source_path}")
    with source_path.open(encoding="utf-8-sig", newline="") as fh:
        raw_rows = list(csv.DictReader(fh))
    repaired = [r for r in (_repair_row(raw) for raw in raw_rows) if r]
    return _merge_duplicates(repaired)


def ingest_clinics(
    conn: sqlite3.Connection, source_path: Path = CLINICS_SOURCE_PATH
) -> int:
    rows = parse_clinics_csv(source_path)
    conn.execute("DELETE FROM clinics")
    cur = conn.executemany(
        """INSERT INTO clinics (name, address, suburb, state, postcode,
            phone, hours, billing, type, latitude, longitude, nhsd_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        [
            (
                r["name"], r["address"], r["suburb"], r["state"], r["postcode"],
                r["phone"], r["hours"], r["billing"], r["type"],
                r["latitude"], r["longitude"], r["nhsd_id"],
            )
            for r in rows
        ],
    )
    return cur.rowcount
