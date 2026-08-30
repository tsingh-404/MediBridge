"""SQLite DDL — all CREATE TABLE / CREATE INDEX / FTS5 statements."""
from __future__ import annotations

SCHEMA = """
CREATE TABLE IF NOT EXISTS mbs_items (
    item_num TEXT PRIMARY KEY,
    sub_item_num TEXT,
    description TEXT NOT NULL,
    schedule_fee REAL,
    benefit_100 REAL,
    benefit_75 REAL,
    benefit_85 REAL,
    benefit_type TEXT,
    item_type TEXT,
    fee_type TEXT,
    provider_type TEXT,
    category TEXT NOT NULL,
    group_code TEXT NOT NULL,
    sub_group TEXT,
    sub_heading TEXT,
    basic_units REAL,
    derived_fee_formula TEXT,
    fee_start_date TEXT,
    item_start_date TEXT,
    item_end_date TEXT,
    emsn_max_cap REAL,
    emsn_pct_cap REAL,
    description_start_date TEXT
);

CREATE TABLE IF NOT EXISTS imap_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_num TEXT NOT NULL,
    mapped_item TEXT NOT NULL,
    item_start_date TEXT,
    item_end_date TEXT,
    item_reuse_flag TEXT,
    mapped_item_desc TEXT,
    category_code TEXT,
    group_code TEXT,
    subgroup_code TEXT,
    subheading_code TEXT,
    category_desc TEXT,
    group_desc TEXT,
    subgroup_desc TEXT,
    subheading_desc TEXT,
    btos_code TEXT,
    btos_desc TEXT
);

CREATE TABLE IF NOT EXISTS categories (
    category_code TEXT PRIMARY KEY,
    category_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
    group_code TEXT PRIMARY KEY,
    group_desc TEXT NOT NULL,
    category_code TEXT
);

CREATE TABLE IF NOT EXISTS btos_types (
    btos_code TEXT PRIMARY KEY,
    btos_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oshc_coverage_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_type TEXT NOT NULL,
    setting TEXT,
    provider_type TEXT,
    benefit_pct REAL,
    category_code TEXT,
    btos_code TEXT,
    waiting_months INTEGER,
    description TEXT NOT NULL,
    deed_reference TEXT
);

CREATE TABLE IF NOT EXISTS insurers (
    insurer_id TEXT PRIMARY KEY,
    insurer_name TEXT NOT NULL,
    phone TEXT,
    website TEXT
);

CREATE TABLE IF NOT EXISTS insurer_tiers (
    tier_id TEXT PRIMARY KEY,
    insurer_id TEXT NOT NULL,
    tier_name TEXT NOT NULL,
    gp_benefit_pct REAL NOT NULL,
    specialist_benefit_pct REAL NOT NULL,
    in_hospital_benefit_pct REAL NOT NULL DEFAULT 100,
    private_uncontracted_pct REAL,
    pharma_max_per_item REAL,
    pharma_annual_single REAL,
    pharma_annual_family REAL,
    pharma_copayment_type TEXT,
    pharma_copayment_amount REAL,
    has_repatriation INTEGER DEFAULT 0,
    repatriation_limit REAL,
    has_mental_health_extras INTEGER DEFAULT 0,
    mental_health_annual REAL,
    has_boarder_fee INTEGER DEFAULT 0,
    boarder_fee_limit REAL,
    has_extras_addon INTEGER DEFAULT 0,
    has_online_doctor INTEGER DEFAULT 0,
    ed_facility_fee_limit REAL,
    waived_psychiatric_waiting INTEGER DEFAULT 0,
    FOREIGN KEY (insurer_id) REFERENCES insurers(insurer_id)
);

CREATE TABLE IF NOT EXISTS insurer_exclusions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier_id TEXT NOT NULL,
    exclusion_desc TEXT NOT NULL,
    is_deed_exclusion INTEGER DEFAULT 0,
    FOREIGN KEY (tier_id) REFERENCES insurer_tiers(tier_id)
);

CREATE TABLE IF NOT EXISTS insurer_waiting_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier_id TEXT NOT NULL,
    condition_type TEXT NOT NULL,
    waiting_months INTEGER NOT NULL,
    notes TEXT,
    FOREIGN KEY (tier_id) REFERENCES insurer_tiers(tier_id)
);

CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY DEFAULT 1,
    -- NULL = the shared/legacy profile used by the CLI and the desktop web app.
    -- Non-NULL = one row per mobile install, keyed by the X-MB-Device header.
    device_id TEXT,
    tier_id TEXT NOT NULL,
    cover_type TEXT NOT NULL,
    policy_start_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tier_id) REFERENCES insurer_tiers(tier_id)
);

CREATE TABLE IF NOT EXISTS clinics (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    suburb TEXT NOT NULL,
    state TEXT NOT NULL,
    postcode TEXT NOT NULL,
    phone TEXT,
    hours TEXT,
    billing TEXT,
    type TEXT,
    latitude REAL,
    longitude REAL,
    nhsd_id TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS mbs_fts USING fts5(
    item_num UNINDEXED,
    description,
    category_desc,
    group_desc,
    subgroup_desc,
    btos_desc,
    tokenize = 'porter unicode61'
);

CREATE INDEX IF NOT EXISTS idx_mbs_category ON mbs_items(category);
CREATE INDEX IF NOT EXISTS idx_mbs_group ON mbs_items(group_code);
CREATE INDEX IF NOT EXISTS idx_mbs_benefit_type ON mbs_items(benefit_type);
CREATE INDEX IF NOT EXISTS idx_mbs_active ON mbs_items(item_end_date) WHERE item_end_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_imap_mapped ON imap_mappings(mapped_item);
CREATE INDEX IF NOT EXISTS idx_imap_btos ON imap_mappings(btos_code);
CREATE INDEX IF NOT EXISTS idx_coverage_type ON oshc_coverage_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_clinics_postcode ON clinics(postcode);
CREATE INDEX IF NOT EXISTS idx_clinics_suburb ON clinics(suburb);
-- SQLite treats NULLs as distinct, so this constrains device rows only.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profile_device ON user_profile(device_id);
"""
