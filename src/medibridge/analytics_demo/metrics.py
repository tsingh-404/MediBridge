"""Safe aggregate queries for the synthetic analytics demonstration store.

This module deliberately exposes only allowlisted aggregates and dimensions. It
does not return source rows or identifiers.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
import sqlite3
from typing import Any, Mapping

from medibridge.analytics_demo.scenarios import (
    CONCERN_CODES,
    LOCATION_BASES,
    REGIONS,
    SERVICE_CODES,
    TOPIC_CODES,
)


STORE_START = date(2024, 10, 1)
STORE_END = date(2026, 9, 30)
BRISBANE = timezone(timedelta(hours=10))

METRIC_GROUPS = {
    "sessions": frozenset({(), ("insurer_id",), ("tier_id",), ("region",), ("location_basis",), ("insurer_id", "region")}),
    "question_turns": frozenset({()}),
    "topic_sessions": frozenset({("topic_code",)}),
    "topic_rate_per_1000": frozenset({()}),
    "unknown_topic_share": frozenset({()}),
}
METRIC_UNITS = {
    "sessions": "sessions",
    "question_turns": "question_turns",
    "topic_sessions": "sessions_per_topic",
    "topic_rate_per_1000": "topic_sessions_per_1000_selected_sessions",
    "unknown_topic_share": "share",
}
METRIC_CAVEATS = {
    "sessions": "Fictional synthetic demonstration sessions only; not a population estimate.",
    "question_turns": "A turn is a distinct fictional user message with one or more issue tags.",
    "topic_sessions": "Question tags are not diagnoses; one session may count in multiple topic categories.",
    "topic_rate_per_1000": "Synthetic question frequency only; not prevalence, incidence, demand, or unmet need.",
    "unknown_topic_share": "Unknown includes sessions with no classified topic, including sessions with no issue tags. This metric uses session-level filters only.",
}

MATRIX_PAIRS = frozenset({
    ("topic_code", "region"),
    ("service_code", "region"),
    ("topic_code", "insurer_id"),
    ("region", "location_basis"),
})
_MATRIX_DIMENSION_SQL = {
    "topic_code": "e.topic_code",
    "service_code": "e.service_code",
    "region": "s.region",
    "location_basis": "s.location_basis",
    "insurer_id": "s.insurer_id",
}
_MATRIX_EVENT_DIMENSIONS = frozenset({"topic_code", "service_code"})


@dataclass(frozen=True)
class AnalyticsFilter:
    """Allowlisted cohort and issue-series filters for a metric request."""

    start_date: date | None = None
    end_date: date | None = None
    insurer_id: str | None = None
    tier_id: str | None = None
    region: str | None = None
    location_basis: str | None = None
    topic_code: str | None = None
    service_code: str | None = None
    concern_code: str | None = None

    def __post_init__(self) -> None:
        if self.start_date is not None and not isinstance(self.start_date, date):
            raise ValueError("start_date must be a date")
        if self.end_date is not None and not isinstance(self.end_date, date):
            raise ValueError("end_date must be a date")
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must be on or before end_date")
        if self.start_date and self.start_date < STORE_START:
            raise ValueError("start_date is outside the available store range")
        if self.start_date and self.start_date > STORE_END:
            raise ValueError("start_date is outside the available store range")
        if self.end_date and self.end_date < STORE_START:
            raise ValueError("end_date is outside the available store range")
        if self.end_date and self.end_date > STORE_END:
            raise ValueError("end_date is outside the available store range")
        allowlists = {
            "region": REGIONS,
            "location_basis": LOCATION_BASES,
            "topic_code": TOPIC_CODES,
            "service_code": SERVICE_CODES,
            "concern_code": CONCERN_CODES,
        }
        for name, allowed in allowlists.items():
            value = getattr(self, name)
            if value is not None and value not in allowed:
                raise ValueError(f"{name} is not an allowed value")
        for name in ("insurer_id", "tier_id"):
            value = getattr(self, name)
            if value is not None and (not isinstance(value, str) or not value.strip()):
                raise ValueError(f"{name} must be a non-empty string")


@dataclass(frozen=True)
class AggregateCell:
    """One aggregate result cell; dimensions never contain row identifiers."""

    dimensions: Mapping[str, str]
    numerator: int
    denominator: int | None = None
    value: int | float | None = None
    distinct_sessions: int | None = None


@dataclass(frozen=True)
class MetricResult:
    metric: str
    unit: str
    cells: tuple[AggregateCell, ...]
    filters_applied: Mapping[str, Any]
    provenance: Mapping[str, Any]
    caveat: str


def _date_bounds(filters: AnalyticsFilter) -> tuple[str | None, str | None]:
    lower = None
    upper = None
    if filters.start_date:
        local_start = datetime.combine(filters.start_date, time.min, BRISBANE)
        lower = local_start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if filters.end_date:
        next_local_day = datetime.combine(filters.end_date + timedelta(days=1), time.min, BRISBANE)
        upper = next_local_day.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return lower, upper


def _cohort_where(filters: AnalyticsFilter, alias: str = "s") -> tuple[list[str], list[Any]]:
    clauses: list[str] = []
    values: list[Any] = []
    lower, upper = _date_bounds(filters)
    if lower:
        clauses.append(f"{alias}.started_at_utc >= ?")
        values.append(lower)
    if upper:
        clauses.append(f"{alias}.started_at_utc < ?")
        values.append(upper)
    for name in ("insurer_id", "tier_id", "region", "location_basis"):
        value = getattr(filters, name)
        if value is not None:
            clauses.append(f"{alias}.{name} = ?")
            values.append(value)
    return clauses, values


def _event_where(filters: AnalyticsFilter, alias: str = "e") -> tuple[list[str], list[Any]]:
    clauses: list[str] = []
    values: list[Any] = []
    for name in ("topic_code", "service_code", "concern_code"):
        value = getattr(filters, name)
        if value is not None:
            clauses.append(f"{alias}.{name} = ?")
            values.append(value)
    return clauses, values


def _where_sql(clauses: list[str]) -> str:
    return " WHERE " + " AND ".join(clauses) if clauses else ""


def _provenance(conn: sqlite3.Connection, filters: AnalyticsFilter) -> dict[str, Any]:
    row = conn.execute(
        """SELECT generator_version, taxonomy_version FROM generation_runs
           ORDER BY run_id DESC LIMIT 1"""
    ).fetchone()
    if row:
        generator_version, taxonomy_version = row
    else:
        generator_version = "unknown"
        taxonomy_version = "unknown"
    clauses, values = _cohort_where(filters)
    where = _where_sql(clauses)
    start, end = conn.execute(
        f"SELECT MIN(date(started_at_utc, '+10 hours')), MAX(date(started_at_utc, '+10 hours')) FROM sessions s{where}",
        values,
    ).fetchone()
    scenarios = [
        row[0]
        for row in conn.execute(
            f"SELECT DISTINCT s.scenario_code FROM sessions s{where} ORDER BY s.scenario_code",
            values,
        ).fetchall()
    ]
    return {
        "synthetic": True,
        "metric_version": "analytics-metrics-v1",
        "generator_version": generator_version,
        "taxonomy_version": taxonomy_version,
        "scenario_versions": scenarios,
        "source_span": {"start_date": start, "end_date": end},
    }


def _validate_store_filters(conn: sqlite3.Connection, filters: AnalyticsFilter) -> None:
    for name in ("insurer_id", "tier_id"):
        requested = getattr(filters, name)
        if requested is None:
            continue
        available = {row[0] for row in conn.execute(f"SELECT DISTINCT {name} FROM sessions")}
        if requested not in available:
            raise ValueError(f"{name} is not an available value")


def _cell(
    dimensions: Mapping[str, str],
    numerator: int,
    denominator: int | None = None,
    distinct_sessions: int | None = None,
) -> AggregateCell:
    value: int | float | None
    if denominator is None:
        value = numerator
    elif denominator == 0:
        value = 0.0
    else:
        value = numerator / denominator
    support = numerator if distinct_sessions is None else distinct_sessions
    return AggregateCell(dimensions, numerator, denominator, value, support)


def read_matrix_cells(
    conn: sqlite3.Connection,
    filters: AnalyticsFilter,
    row_dimension: str,
    column_dimension: str,
) -> list[AggregateCell]:
    """Read an allowlisted two-dimensional session rate matrix."""
    pair = (row_dimension, column_dimension)
    if pair not in MATRIX_PAIRS:
        raise ValueError("matrix pair is not supported")
    _validate_store_filters(conn, filters)

    row_sql = _MATRIX_DIMENSION_SQL[row_dimension]
    column_sql = _MATRIX_DIMENSION_SQL[column_dimension]
    cohort_clauses, cohort_values = _cohort_where(filters)
    event_clauses, event_values = _event_where(filters)
    needs_events = bool(event_clauses) or bool(pair[0] in _MATRIX_EVENT_DIMENSIONS or pair[1] in _MATRIX_EVENT_DIMENSIONS)
    from_sql = (
        "sessions s JOIN messages m ON m.session_id = s.session_id "
        "JOIN issue_events e ON e.message_id = m.message_id"
        if needs_events
        else "sessions s"
    )
    clauses = cohort_clauses + (event_clauses if needs_events else [])
    where = _where_sql(clauses)
    rows = conn.execute(
        f"""SELECT {row_sql}, {column_sql}, COUNT(DISTINCT s.session_id)
            FROM {from_sql}{where}
            GROUP BY {row_sql}, {column_sql}
            ORDER BY {row_sql}, {column_sql}""",
        cohort_values + (event_values if needs_events else []),
    ).fetchall()

    row_counts: dict[str, int] = {}
    for row in rows:
        row_counts[str(row[0])] = row_counts.get(str(row[0]), 0) + row[2]
    return [
        AggregateCell(
            {row_dimension: str(row[0]), column_dimension: str(row[1])},
            row[2],
            row_counts[str(row[0])],
            1000.0 * row[2] / row_counts[str(row[0])] if row_counts[str(row[0])] else 0.0,
            row[2],
        )
        for row in rows
    ]


def read_metrics(
    conn: sqlite3.Connection,
    metric: str,
    group_by: tuple[str, ...],
    filters: AnalyticsFilter,
) -> MetricResult:
    """Read one allowlisted aggregate metric from an open synthetic-store connection."""
    if not isinstance(filters, AnalyticsFilter):
        raise TypeError("filters must be an AnalyticsFilter")
    if metric not in METRIC_GROUPS or group_by not in METRIC_GROUPS[metric]:
        raise ValueError("metric and group_by combination is not supported")
    if metric == "unknown_topic_share" and any(
        getattr(filters, name) is not None for name in ("topic_code", "service_code", "concern_code")
    ):
        raise ValueError("unknown_topic_share does not accept topic, service, or concern filters")
    _validate_store_filters(conn, filters)

    cohort_clauses, cohort_values = _cohort_where(filters)
    cohort_where = _where_sql(cohort_clauses)
    event_clauses, event_values = _event_where(filters)
    event_where = _where_sql(event_clauses)

    if metric == "sessions":
        group_columns = ", ".join(f"s.{column}" for column in group_by)
        select_groups = f"{group_columns}, " if group_by else ""
        group_clause = f" GROUP BY {group_columns} ORDER BY {group_columns}" if group_by else ""
        rows = conn.execute(
            f"SELECT {select_groups}COUNT(DISTINCT s.session_id) FROM sessions s{cohort_where}{group_clause}",
            cohort_values,
        ).fetchall()
        if group_by:
            cells = tuple(
                _cell(dict(zip(group_by, row[:-1])), row[-1])
                for row in rows
            )
        else:
            cells = (_cell({}, rows[0][0]),)
    elif metric == "question_turns":
        clauses = ["m.role = 'user'"] + cohort_clauses + event_clauses
        rows = conn.execute(
            f"""SELECT COUNT(DISTINCT m.message_id), COUNT(DISTINCT s.session_id)
                FROM sessions s JOIN messages m ON m.session_id = s.session_id
                JOIN issue_events e ON e.message_id = m.message_id{_where_sql(clauses)}""",
            cohort_values + event_values,
        ).fetchone()
        cells = (_cell({}, rows[0], distinct_sessions=rows[1]),)
    elif metric == "topic_sessions":
        clauses = cohort_clauses + event_clauses
        rows = conn.execute(
            f"""SELECT e.topic_code, COUNT(DISTINCT s.session_id)
                FROM sessions s JOIN messages m ON m.session_id = s.session_id
                JOIN issue_events e ON e.message_id = m.message_id{_where_sql(clauses)}
                GROUP BY e.topic_code ORDER BY e.topic_code""",
            cohort_values + event_values,
        ).fetchall()
        cells = tuple(_cell({"topic_code": row[0]}, row[1]) for row in rows)
    elif metric == "topic_rate_per_1000":
        denominator = conn.execute(
            f"SELECT COUNT(DISTINCT s.session_id) FROM sessions s{cohort_where}", cohort_values
        ).fetchone()[0]
        clauses = cohort_clauses + event_clauses
        numerator = conn.execute(
            f"""SELECT COUNT(DISTINCT s.session_id)
                FROM sessions s JOIN messages m ON m.session_id = s.session_id
                JOIN issue_events e ON e.message_id = m.message_id{_where_sql(clauses)}""",
            cohort_values + event_values,
        ).fetchone()[0]
        rate = (1000.0 * numerator / denominator) if denominator else 0.0
        cells = (AggregateCell({}, numerator, denominator, rate, numerator),)
    else:  # unknown_topic_share; event filters do not redefine the selected cohort
        clauses, values = _cohort_where(filters)
        where = _where_sql(clauses)
        denominator, unknown = conn.execute(
            f"""SELECT COUNT(DISTINCT s.session_id),
                       COUNT(DISTINCT CASE WHEN NOT EXISTS (
                           SELECT 1 FROM messages m JOIN issue_events e ON e.message_id = m.message_id
                           WHERE m.session_id = s.session_id AND e.topic_code != 'unknown_unclassified'
                       ) THEN s.session_id END)
                FROM sessions s{where}""",
            values,
        ).fetchone()
        cells = (_cell({}, unknown, denominator),)

    applied = {
        name: getattr(filters, name).isoformat() if isinstance(getattr(filters, name), date) else getattr(filters, name)
        for name in ("start_date", "end_date", "insurer_id", "tier_id", "region", "location_basis", "topic_code", "service_code", "concern_code")
        if getattr(filters, name) is not None
    }
    provenance = _provenance(conn, filters)
    return MetricResult(metric, METRIC_UNITS[metric], cells, applied, provenance, METRIC_CAVEATS[metric])
