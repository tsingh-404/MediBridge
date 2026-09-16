"""OSHC benefit calculation, insurer-aware.

Coverage eligibility is determined by two layers:
  1. OSHC Deed (Schedule 1): only standard Medicare Benefits Schedule items are covered.
     Items with NO IMAP mapping are not in the standard MBS and are therefore not covered.
  2. Insurer-specific exclusions: stored in insurer_exclusions table, matched against item context.
"""
from __future__ import annotations

import sqlite3

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from medibridge.data import db as dbmod
from medibridge.data import queries
from medibridge.profile import device_from_config, device_scope
from medibridge.models.coverage import CoverageResult

# Keywords in insurer_exclusion_desc that indicate a service-level exclusion.
# Matched against the item's description, category_desc, group_desc, and btos_desc.
# "dental/optical/physio unless MBS-listed" is intentionally NOT matched here —
# all items in our DB are MBS-listed, so that clause never excludes them.
_EXCLUSION_KEYWORDS: dict[str, list[str]] = {
    "cosmetic": ["cosmetic"],
    "ivf": ["ivf", "reproductive", "fertilisation", "fertilization"],
    "repatriation": ["repatriation"],
}


def _get_user_tier(conn: sqlite3.Connection, device_id: str | None = None) -> dict | None:
    where, params = device_scope(device_id, "p")
    row = conn.execute(
        f"""SELECT t.*, p.policy_start_date, p.cover_type
           FROM user_profile p JOIN insurer_tiers t ON p.tier_id = t.tier_id
           WHERE {where}""",
        params,
    ).fetchone()
    return dict(row) if row else None


def _is_gp_item(item: dict) -> bool:
    """GP if BenefitType=E or group A1/A2 (deed Schedule 4 nil-waiting groups)."""
    if (item.get("benefit_type") or "").upper() == "E":
        return True
    grp = (item.get("group_code") or "").upper()
    return grp in ("A1", "A2")


def _has_imap_mapping(item_num: str, conn: sqlite3.Connection) -> bool:
    """Items with no IMAP mapping are not in the standard Medicare Benefits Schedule."""
    row = conn.execute(
        "SELECT 1 FROM imap_mappings WHERE mapped_item = ? LIMIT 1",
        (item_num,),
    ).fetchone()
    return row is not None


def _check_insurer_exclusions(item: dict, tier_id: str, conn: sqlite3.Connection) -> str | None:
    """Check insurer_exclusions table for service-level matches. Returns reason or None."""
    exclusions = conn.execute(
        "SELECT exclusion_desc FROM insurer_exclusions WHERE tier_id = ? AND is_deed_exclusion = 0",
        (tier_id,),
    ).fetchall()
    # Build searchable text from item context
    item_text = " ".join(filter(None, [
        item.get("description", ""),
        item.get("category_desc", ""),
        item.get("group_desc", ""),
        item.get("btos_desc", ""),
    ])).lower()

    for row in exclusions:
        ex_desc = row["exclusion_desc"]
        for keyword, terms in _EXCLUSION_KEYWORDS.items():
            if keyword in ex_desc.lower():
                if any(t in item_text for t in terms):
                    return f"Excluded by insurer policy: {ex_desc}"
    return None


def _not_covered(item: dict, reason: str) -> CoverageResult:
    fee = item.get("schedule_fee") or 0.0
    return CoverageResult(
        item_num=item["item_num"],
        description=item["description"],
        setting="unknown",
        provider_type=None,
        schedule_fee=fee,
        oshc_benefit=0.0,
        estimated_out_of_pocket=fee,
        is_covered=False,
        benefit_pct=0.0,
        notes=[reason],
    )


def _calculate(
    item_num: str, setting: str, conn: sqlite3.Connection, device_id: str | None = None
) -> CoverageResult:
    item = queries.get_item_by_number(conn, item_num)
    if not item:
        raise ValueError(f"MBS item {item_num} not found")

    setting = setting.lower()
    schedule_fee = item.get("schedule_fee") or 0.0
    notes: list[str] = []
    provider_type = None

    # --- Deed eligibility gate ---
    # OSHC deed Schedule 1: covers services for which a Medicare benefit is payable.
    # Standard MBS items all have IMAP mappings; non-MBS program items (e.g. CDBS dental) do not.
    if not _has_imap_mapping(item["item_num"], conn):
        return _not_covered(
            item,
            "This item is not in the standard Medicare Benefits Schedule (no IMAP mapping). "
            "OSHC covers only standard MBS services (categories 1–8). "
            "Non-MBS programs such as the Child Dental Benefits Schedule are not covered by OSHC.",
        )

    # --- Derived-fee items: cannot calculate ---
    if item.get("fee_type") == "D" and not schedule_fee:
        return _not_covered(
            item,
            f"Derived-fee item — fee is computed from a formula: "
            f"'{item.get('derived_fee_formula') or 'formula not available'}'. "
            "Cannot calculate out-of-pocket automatically. Contact your insurer for an estimate.",
        )

    # --- Anaesthesia: estimate only ---
    if (item.get("benefit_type") or "").upper() == "A":
        notes.append(
            "Anaesthesia fee is time-based: (basic units + time units) × unit value. "
            f"Schedule fee shown (${schedule_fee:.2f}) is the base; actual cost depends on theatre time. "
            "Estimate only — confirm with your anaesthetist."
        )

    # --- Insurer exclusion check ---
    tier = _get_user_tier(conn, device_id)
    if tier:
        exclusion = _check_insurer_exclusions(item, tier["tier_id"], conn)
        if exclusion:
            result = _not_covered(item, exclusion)
            result.setting = setting
            return result

    # --- Determine benefit percentage ---
    if setting == "in_hospital":
        benefit_pct = (tier or {}).get("in_hospital_benefit_pct", 100.0)
    elif setting == "out_of_hospital":
        if _is_gp_item(item):
            benefit_pct = (tier or {}).get("gp_benefit_pct", 85.0)
            provider_type = "gp"
        else:
            benefit_pct = (tier or {}).get("specialist_benefit_pct", 85.0)
            provider_type = "specialist"
    else:
        raise ValueError(f"Unknown setting: {setting}")

    if not tier:
        notes.append("No user profile — using deed defaults (85% out-of-hospital, 100% in-hospital).")

    # --- Compute benefit amount ---
    if setting == "in_hospital":
        oshc_benefit = schedule_fee
    elif benefit_pct == 100 and item.get("benefit_100"):
        oshc_benefit = item["benefit_100"]
    elif benefit_pct == 85 and item.get("benefit_85"):
        oshc_benefit = item["benefit_85"]
    elif benefit_pct == 75 and item.get("benefit_75"):
        oshc_benefit = item["benefit_75"]
    else:
        oshc_benefit = round(schedule_fee * benefit_pct / 100.0, 2)
        notes.append(f"Computed {benefit_pct}% of schedule fee (benefit field absent in XML).")

    # Clause 3.6d: benefit cannot exceed actual cost
    oshc_benefit = min(oshc_benefit, schedule_fee) if schedule_fee else oshc_benefit
    out_of_pocket = max(round(schedule_fee - oshc_benefit, 2), 0.0)

    return CoverageResult(
        item_num=item["item_num"],
        description=item["description"],
        setting=setting,
        provider_type=provider_type,
        schedule_fee=schedule_fee,
        oshc_benefit=round(oshc_benefit, 2),
        estimated_out_of_pocket=out_of_pocket,
        is_covered=True,
        benefit_pct=benefit_pct,
        notes=notes,
    )


@tool
def calculate_oshc_coverage(
    item_num: str, setting: str, config: RunnableConfig = None
) -> dict:
    """Calculate OSHC coverage for an MBS item.

    Args:
        item_num: MBS item number (e.g. "23")
        setting: "in_hospital" or "out_of_hospital"

    Returns coverage including is_covered, oshc_benefit, estimated_out_of_pocket, and notes.
    If is_covered=False, the item is not claimable under OSHC — report the reason from notes.
    """
    # `config` is injected by LangGraph and excluded from the schema shown to the
    # model; it carries the device id that selects which profile to price against.
    with dbmod.get_conn() as conn:
        result = _calculate(str(item_num), setting, conn, device_from_config(config))
    return result.model_dump()
