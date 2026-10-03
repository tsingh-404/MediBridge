"""Read-only query helpers over medibridge.db."""
from __future__ import annotations

import sqlite3

ALLOWED_CLINIC_TYPES = {"GP", "Psychology", "Pharmacy", "Psychiatry", "Hospital"}


def get_item_by_number(conn: sqlite3.Connection, item_num: str) -> dict | None:
    row = conn.execute(
        """SELECT m.*,
               (SELECT category_desc FROM imap_mappings WHERE mapped_item = m.item_num
                AND category_desc IS NOT NULL LIMIT 1) AS category_desc,
               (SELECT group_desc FROM imap_mappings WHERE mapped_item = m.item_num
                AND group_desc IS NOT NULL LIMIT 1) AS group_desc,
               (SELECT btos_desc FROM imap_mappings WHERE mapped_item = m.item_num
                AND btos_desc IS NOT NULL LIMIT 1) AS btos_desc
        FROM mbs_items m WHERE m.item_num = ? AND m.item_end_date IS NULL""",
        (item_num.lstrip("0") or "0",),
    ).fetchone()
    return dict(row) if row else None


def search_items_by_keyword(conn: sqlite3.Connection, query: str, limit: int = 10) -> list[dict]:
    safe = query.replace('"', '""')
    try:
        rows = conn.execute(
            """SELECT item_num, description, rank FROM mbs_fts
            WHERE mbs_fts MATCH ? ORDER BY rank LIMIT ?""",
            (safe, limit),
        ).fetchall()
    except sqlite3.OperationalError:
        rows = conn.execute(
            """SELECT item_num, description, rank FROM mbs_fts
            WHERE mbs_fts MATCH ? ORDER BY rank LIMIT ?""",
            (f'"{safe}"', limit),
        ).fetchall()
    return [dict(r) for r in rows]


def search_items_by_num_prefix(conn: sqlite3.Connection, prefix: str, limit: int = 10) -> list[dict]:
    rows = conn.execute(
        """SELECT m.*,
               (SELECT category_desc FROM imap_mappings WHERE mapped_item = m.item_num
                AND category_desc IS NOT NULL LIMIT 1) AS category_desc,
               (SELECT group_desc FROM imap_mappings WHERE mapped_item = m.item_num
                AND group_desc IS NOT NULL LIMIT 1) AS group_desc,
               (SELECT btos_desc FROM imap_mappings WHERE mapped_item = m.item_num
                AND btos_desc IS NOT NULL LIMIT 1) AS btos_desc
        FROM mbs_items m
        WHERE m.item_num LIKE ? AND m.item_end_date IS NULL
        ORDER BY CAST(m.item_num AS INTEGER)
        LIMIT ?""",
        (f"{prefix}%", limit),
    ).fetchall()
    return [dict(r) for r in rows]


def get_items_by_category(conn: sqlite3.Connection, category: str) -> list[dict]:
    rows = conn.execute(
        "SELECT item_num, description, schedule_fee FROM mbs_items "
        "WHERE category = ? AND item_end_date IS NULL",
        (category,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_items_by_btos(conn: sqlite3.Connection, btos_desc: str) -> list[dict]:
    rows = conn.execute(
        """SELECT DISTINCT m.item_num, m.description, m.schedule_fee
        FROM mbs_items m
        JOIN imap_mappings i ON m.item_num = i.mapped_item
        WHERE i.btos_desc = ? AND m.item_end_date IS NULL""",
        (btos_desc,),
    ).fetchall()
    return [dict(r) for r in rows]


def fts_count(conn: sqlite3.Connection) -> int:
    return conn.execute("SELECT COUNT(*) FROM mbs_fts").fetchone()[0]


ALLOWED_BILLING = {"bulk", "mixed", "private", "unknown"}


def search_clinics(
    conn: sqlite3.Connection,
    postcode: str | None = None,
    suburb: str | None = None,
    clinic_type: str | None = None,
    billing: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """Filter clinics by postcode and/or suburb, with optional type and billing filters.

    `type` column stores comma-separated multi-values (e.g. 'GP, Pharmacy').
    Type match wraps the column with commas to avoid Psych* substring collisions.
    `billing` is a single-value column: bulk | mixed | private | unknown.
    """
    if not postcode and not suburb:
        return []
    where: list[str] = []
    params: list[object] = []
    if postcode:
        where.append("postcode = ?")
        params.append(postcode.strip())
    if suburb:
        where.append("UPPER(suburb) = UPPER(?)")
        params.append(suburb.strip())
    if clinic_type:
        where.append("',' || REPLACE(type, ', ', ',') || ',' LIKE ?")
        params.append(f"%,{clinic_type},%")
    if billing:
        where.append("LOWER(billing) = ?")
        params.append(billing.strip().lower())
    # bulk billing first (best for OSHC users), then mixed, then private/unknown
    sql = (
        f"SELECT * FROM clinics WHERE {' AND '.join(where)} "
        "ORDER BY CASE LOWER(billing) "
        "WHEN 'bulk' THEN 0 WHEN 'mixed' THEN 1 WHEN 'private' THEN 2 ELSE 3 END "
        "LIMIT ?"
    )
    params.append(limit)
    rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def get_clinic_analytics(conn: sqlite3.Connection) -> dict:
    """Return summary statistics for the clinic analytics dashboard."""

    total_clinics = conn.execute(
        "SELECT COUNT(*) FROM clinics"
    ).fetchone()[0]

    billing_rows = conn.execute(
        """
        SELECT LOWER(COALESCE(NULLIF(TRIM(billing), ''), 'unknown')) AS billing,
               COUNT(*) AS count
        FROM clinics
        GROUP BY LOWER(COALESCE(NULLIF(TRIM(billing), ''), 'unknown'))
        ORDER BY count DESC
        """
    ).fetchall()

    by_billing = {
        billing: 0
        for billing in sorted(ALLOWED_BILLING)
    }

    for row in billing_rows:
        by_billing[row[0]] = row[1]

    type_counts = {
        clinic_type: 0
        for clinic_type in sorted(ALLOWED_CLINIC_TYPES)
    }

    type_rows = conn.execute(
        """
        SELECT type
        FROM clinics
        WHERE type IS NOT NULL
          AND TRIM(type) != ''
        """
    ).fetchall()

    for row in type_rows:
        for clinic_type in row[0].split(","):
            clinic_type = clinic_type.strip()

            if clinic_type in type_counts:
                type_counts[clinic_type] += 1

    return {
        "total_clinics": total_clinics,
        "by_type": type_counts,
        "by_billing": by_billing,
    }
