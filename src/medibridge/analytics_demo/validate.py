"""Validate a generated synthetic analytics store and print a JSON report."""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import date, datetime
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys

from .generate import CLASSIFICATION_VERSION
from .scenarios import (
    ANSWER_OUTCOMES,
    CONCERN_CODES,
    LOCATION_BASES,
    REGIONS,
    SERVICE_CODES,
    TOPIC_CODES,
    scenario_for,
)


TABLES = {
    "actors": {"actor_id", "created_at_utc"},
    "sessions": {
        "session_id", "actor_id", "started_at_utc", "insurer_id", "tier_id",
        "region", "location_basis", "scenario_code",
    },
    "messages": {"message_id", "session_id", "turn_index", "role", "content"},
    "issue_events": {
        "event_id", "message_id", "topic_code", "service_code", "concern_code",
        "answer_outcome", "classification_version",
    },
    "generation_runs": {
        "run_id", "seed", "generator_version", "taxonomy_version", "created_at_utc",
        "actor_count", "session_count", "message_count", "issue_event_count",
    },
}
SCENARIO_CODES = {
    "control_stable", "mixed_topic_turn", "respiratory_spike",
    "coverage_information_spike",
}
SCENARIO_WINDOWS = {
    "respiratory_spike": (date(2025, 1, 1), date(2025, 3, 31)),
    "coverage_information_spike": (date(2025, 10, 1), date(2025, 12, 31)),
}
PERSONAL_DATA_PATTERN = re.compile(
    r"(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|"
    r"(?:\+?61|0)[\s-]?(?:\(?\d\)?[\s-]?){8,}|"
    r"\b(?:student\s*(?:id|number|no\.?))\b|\b\d{8,}\b)",
    re.IGNORECASE,
)
UTC_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


@dataclass(frozen=True)
class ValidationError:
    code: str
    message: str
    table: str | None = None
    row_id: str | None = None


@dataclass(frozen=True)
class ValidationReport:
    path: str
    ok: bool
    errors: tuple[ValidationError, ...]
    counts: dict
    metrics: dict
    file_size_bytes: int | None = None
    sha256: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def _timestamp_error(value: object) -> bool:
    if not isinstance(value, str) or not UTC_TIMESTAMP.fullmatch(value):
        return True
    try:
        parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return True
    return parsed.tzinfo is not None


def _schema_errors(conn: sqlite3.Connection, errors: list[ValidationError]) -> bool:
    existing = {
        row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    valid = True
    for table, expected_columns in TABLES.items():
        if table not in existing:
            errors.append(ValidationError("missing_table", f"Required table {table!r} is missing."))
            valid = False
            continue
        columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        missing = expected_columns - columns
        if missing:
            errors.append(ValidationError(
                "missing_columns", f"Table {table!r} is missing columns: {', '.join(sorted(missing))}.", table
            ))
            valid = False
    return valid


def validate_store(path: Path) -> ValidationReport:
    """Return integrity, vocabulary, content, scenario and row-count checks."""
    path = Path(path)
    errors: list[ValidationError] = []
    counts: dict = {"rows": {}, "scenarios": {}, "topics": {}}
    metrics: dict = {"expected_scenario_windows": {
        code: {"start": start.isoformat(), "end": end.isoformat()}
        for code, (start, end) in SCENARIO_WINDOWS.items()
    }}
    if not path.is_file():
        errors.append(ValidationError("missing_file", f"Database file does not exist: {path}"))
        return ValidationReport(str(path), False, tuple(errors), counts, metrics)

    try:
        conn = sqlite3.connect(f"file:{path.resolve().as_posix()}?mode=ro", uri=True)
    except sqlite3.Error as exc:
        errors.append(ValidationError("open_failed", str(exc)))
        return ValidationReport(str(path), False, tuple(errors), counts, metrics)

    try:
        available = _schema_errors(conn, errors)
    except sqlite3.Error as exc:
        conn.close()
        errors.append(ValidationError("invalid_database", f"Could not inspect SQLite schema: {exc}"))
        return ValidationReport(str(path), False, tuple(errors), counts, metrics)
    try:
        integrity = conn.execute("PRAGMA integrity_check").fetchone()
        if integrity and integrity[0] != "ok":
            errors.append(ValidationError("integrity_check_failed", str(integrity[0])))
        for row in conn.execute("PRAGMA foreign_key_check"):
            errors.append(ValidationError(
                "foreign_key_violation", f"Foreign key violation in {row[0]} rowid {row[1]} (parent {row[2]}).",
                str(row[0]), str(row[1]),
            ))

        if not available:
            return ValidationReport(str(path), False, tuple(errors), counts, metrics,
                                    path.stat().st_size, hashlib.sha256(path.read_bytes()).hexdigest())

        counts["rows"] = {
            table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in TABLES
        }
        if any(count == 0 for count in counts["rows"].values()):
            for table, count in counts["rows"].items():
                if count == 0:
                    errors.append(ValidationError("empty_table", f"Required table {table!r} has no rows.", table))

        def bad_values(query: str, params: tuple, code: str, description: str, table: str, id_column: str):
            for row_id, value in conn.execute(query, params):
                errors.append(ValidationError(code, f"{description}: {value!r}.", table, str(row_id)))

        for table, col, id_col in (
            ("actors", "created_at_utc", "actor_id"),
            ("sessions", "started_at_utc", "session_id"),
            ("generation_runs", "created_at_utc", "run_id"),
        ):
            for row_id, value in conn.execute(f"SELECT {id_col}, {col} FROM {table}"):
                if _timestamp_error(value):
                    errors.append(ValidationError("invalid_timestamp", f"Invalid UTC timestamp {value!r}.", table, str(row_id)))

        bad_values("SELECT session_id, region FROM sessions WHERE region NOT IN (%s)" % ",".join("?" * len(REGIONS)), REGIONS,
                   "invalid_region", "Region is outside the Queensland allowlist", "sessions", "session_id")
        for session_id, region, basis in conn.execute("SELECT session_id, region, location_basis FROM sessions"):
            if basis is None or not str(basis).strip():
                errors.append(ValidationError("missing_location_basis", "Location basis is blank.", "sessions", str(session_id)))
            elif basis not in LOCATION_BASES:
                errors.append(ValidationError("invalid_location_basis", f"Location basis is not allowlisted: {basis!r}.", "sessions", str(session_id)))
            if region not in REGIONS:
                continue
        bad_values("SELECT session_id, scenario_code FROM sessions WHERE scenario_code NOT IN (%s)" % ",".join("?" * len(SCENARIO_CODES)), tuple(sorted(SCENARIO_CODES)),
                   "invalid_scenario", "Scenario code is not allowlisted", "sessions", "session_id")
        scenario_rows = conn.execute("SELECT scenario_code, COUNT(*) FROM sessions GROUP BY scenario_code ORDER BY scenario_code").fetchall()
        counts["scenarios"] = dict(scenario_rows)
        for session_id, scenario_code, started_at in conn.execute("SELECT session_id, scenario_code, started_at_utc FROM sessions"):
            if scenario_code not in SCENARIO_WINDOWS or _timestamp_error(started_at):
                continue
            day = date.fromisoformat(started_at[:10])
            start, end = SCENARIO_WINDOWS[scenario_code]
            if not start <= day <= end:
                errors.append(ValidationError("scenario_window_violation", f"{scenario_code} occurs outside its documented window on {day}.", "sessions", str(session_id)))

        counts["topics"] = dict(conn.execute(
            "SELECT topic_code, COUNT(*) FROM issue_events GROUP BY topic_code ORDER BY topic_code"
        ))
        for table, col, id_col, allowlist, code in (
            ("issue_events", "topic_code", "event_id", TOPIC_CODES, "invalid_topic"),
            ("issue_events", "service_code", "event_id", SERVICE_CODES, "invalid_service"),
            ("issue_events", "concern_code", "event_id", CONCERN_CODES, "invalid_concern"),
            ("issue_events", "answer_outcome", "event_id", ANSWER_OUTCOMES, "invalid_answer_outcome"),
            ("messages", "role", "message_id", {"user", "assistant"}, "invalid_role"),
        ):
            params = tuple(allowlist)
            query = f"SELECT {id_col}, {col} FROM {table} WHERE {col} NOT IN ({','.join('?' * len(params))}) OR {col} IS NULL"
            bad_values(query, params, code, f"{col} is outside its allowlist", table, id_col)
        for message_id, content in conn.execute("SELECT message_id, content FROM messages"):
            if not isinstance(content, str) or not content.strip():
                errors.append(ValidationError("blank_content", "Message content is blank.", "messages", str(message_id)))
            elif PERSONAL_DATA_PATTERN.search(content):
                errors.append(ValidationError("personal_data_pattern", "Message matches a prohibited personal-data pattern.", "messages", str(message_id)))
        for event_id, version in conn.execute("SELECT event_id, classification_version FROM issue_events"):
            if version != CLASSIFICATION_VERSION:
                errors.append(ValidationError("classification_version_mismatch", f"Unexpected classification version {version!r}.", "issue_events", str(event_id)))

        run = conn.execute(
            "SELECT seed, actor_count, session_count, message_count, issue_event_count "
            "FROM generation_runs ORDER BY run_id DESC LIMIT 1"
        ).fetchone()
        if run:
            seed = run[0]
            run_counts = dict(zip(("actors", "sessions", "messages", "issue_events"), run[1:]))
            metrics["generation_run_counts"] = run_counts
            actual_counts = {key: counts["rows"][key] for key in run_counts}
            for table, recorded in run_counts.items():
                if recorded != actual_counts[table]:
                    code = "scenario_count_mismatch" if table == "sessions" else "generation_count_mismatch"
                    errors.append(ValidationError(
                        code,
                        f"Latest generation run records {recorded} {table} rows; found {actual_counts[table]}.",
                        "generation_runs",
                    ))
            session_sequence = re.compile(r"^demo_session_(\d+)$")
            for session_id, started_at, scenario_code in conn.execute(
                "SELECT session_id, started_at_utc, scenario_code FROM sessions"
            ):
                match = session_sequence.fullmatch(str(session_id))
                if not match or _timestamp_error(started_at):
                    continue
                expected = scenario_for(int(seed), int(match.group(1)), started_at).scenario_code
                if scenario_code != expected:
                    errors.append(ValidationError(
                        "scenario_truth_mismatch",
                        f"Stored scenario {scenario_code!r} does not match seeded scenario {expected!r}.",
                        "sessions",
                        str(session_id),
                    ))

        metrics["timestamp_bounds"] = conn.execute(
            "SELECT MIN(started_at_utc), MAX(started_at_utc) FROM sessions"
        ).fetchone()
        repeat_counts = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(session_count), 0) FROM "
            "(SELECT actor_id, COUNT(*) AS session_count FROM sessions GROUP BY actor_id HAVING COUNT(*) > 1)"
        ).fetchone()
        metrics["actor_repeat_counts"] = {
            "actors_with_multiple_sessions": repeat_counts[0],
            "sessions_assigned_to_repeated_actors": repeat_counts[1],
            "share_of_actors_repeated": repeat_counts[0] / counts["rows"]["actors"] if counts["rows"]["actors"] else 0.0,
        }
        unknown_counts = {
            "topic": conn.execute("SELECT COUNT(*) FROM issue_events WHERE topic_code = 'unknown_unclassified'").fetchone()[0],
            "service": conn.execute("SELECT COUNT(*) FROM issue_events WHERE service_code = 'unknown'").fetchone()[0],
            "concern": conn.execute("SELECT COUNT(*) FROM issue_events WHERE concern_code = 'unknown'").fetchone()[0],
            "answer_outcome": conn.execute("SELECT COUNT(*) FROM issue_events WHERE answer_outcome = 'unknown_not_assessed'").fetchone()[0],
            "region": conn.execute("SELECT COUNT(*) FROM sessions WHERE region = 'unknown'").fetchone()[0],
            "location_basis": conn.execute("SELECT COUNT(*) FROM sessions WHERE location_basis = 'unknown'").fetchone()[0],
        }
        event_total = counts["rows"]["issue_events"]
        session_total = counts["rows"]["sessions"]
        metrics["unknown_counts"] = unknown_counts
        metrics["unknown_shares"] = {
            "topic": unknown_counts["topic"] / event_total if event_total else 0.0,
            "service": unknown_counts["service"] / event_total if event_total else 0.0,
            "concern": unknown_counts["concern"] / event_total if event_total else 0.0,
            "answer_outcome": unknown_counts["answer_outcome"] / event_total if event_total else 0.0,
            "region": unknown_counts["region"] / session_total if session_total else 0.0,
            "location_basis": unknown_counts["location_basis"] / session_total if session_total else 0.0,
        }
        metrics["unknown_topic_share"] = metrics["unknown_shares"]["topic"]
        metrics["unknown_region_share"] = metrics["unknown_shares"]["region"]
        for code, (start, end) in SCENARIO_WINDOWS.items():
            observed = conn.execute(
                "SELECT MIN(started_at_utc), MAX(started_at_utc), COUNT(*) FROM sessions WHERE scenario_code = ?",
                (code,),
            ).fetchone()
            metrics.setdefault("observed_scenario_windows", {})[code] = {
                "start": observed[0], "end": observed[1], "count": observed[2],
                "expected_start": start.isoformat(), "expected_end": end.isoformat(),
            }
    except sqlite3.Error as exc:
        errors.append(ValidationError("validation_query_failed", f"SQLite validation query failed: {exc}"))
    finally:
        conn.close()

    return ValidationReport(
        path=str(path), ok=not errors, errors=tuple(errors), counts=counts, metrics=metrics,
        file_size_bytes=path.stat().st_size,
        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path, help="SQLite analytics demo store to validate")
    args = parser.parse_args(argv)
    report = validate_store(args.path)
    print(json.dumps(report.to_dict(), indent=2, sort_keys=True, default=list))
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
