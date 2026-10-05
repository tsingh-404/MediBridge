"""Standalone read-only FastAPI service for synthetic aggregate analytics."""

from dataclasses import asdict, replace
from datetime import date
from pathlib import Path
import sqlite3
from typing import Any, Iterator, Mapping
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException, Request

from medibridge.analytics_demo.disclosure import SuppressedCell, suppress_table
from medibridge.analytics_demo.metrics import (
    AggregateCell,
    AnalyticsFilter,
    MetricResult,
    _cohort_where,
    _event_where,
    _where_sql,
    read_metrics,
)
from medibridge.analytics_demo.scenarios import (
    CONCERN_CODES,
    INSURER_CODES,
    LOCATION_BASES,
    REGIONS,
    SERVICE_CODES,
    TIER_CODES,
    TOPIC_CODES,
)


DEFAULT_DB = Path(__file__).resolve().parents[3] / "data" / "analytics_demo.sqlite"
FILTER_FIELDS = (
    "start_date",
    "end_date",
    "insurer_id",
    "tier_id",
    "region",
    "location_basis",
    "topic_code",
    "service_code",
    "concern_code",
)
DISCLOSURE_CAVEAT = (
    "Synthetic-only demonstration. Suppression is table-local and does not prevent "
    "differencing across separate requests; threshold 10 is not evidence of real-data safety."
)
_DIMENSION_SQL = {
    "region": "s.region",
    "location_basis": "s.location_basis",
    "month": "strftime('%Y-%m', s.started_at_utc, '+10 hours')",
    "week": "date(s.started_at_utc, '+10 hours', 'weekday 0', '-6 days')",
    "topic_code": "e.topic_code",
    "service_code": "e.service_code",
    "concern_code": "e.concern_code",
}


def _database_connection(path: Path) -> sqlite3.Connection:
    """Open only a read-only SQLite URI; every connection is query-only too."""
    resolved = path.resolve()
    uri = f"file:{quote(resolved.as_posix(), safe='/:')}?mode=ro"
    connection = sqlite3.connect(uri, uri=True, timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only = ON")
    return connection


def _connection(request: Request) -> Iterator[sqlite3.Connection]:
    connection = _database_connection(request.app.state.db_path)
    try:
        yield connection
    finally:
        connection.close()


def _filters(request: Request, conn: sqlite3.Connection, extra: tuple[str, ...] = ()) -> AnalyticsFilter:
    allowed = set(FILTER_FIELDS) | set(extra)
    received = set(request.query_params.keys())
    unexpected = sorted(received - allowed)
    if unexpected:
        raise HTTPException(status_code=422, detail=f"Unsupported query dimension: {unexpected[0]}")
    for key in received:
        if len(request.query_params.getlist(key)) != 1:
            raise HTTPException(status_code=422, detail=f"Filter {key} must be provided once")

    values: dict[str, Any] = {}
    try:
        for name in FILTER_FIELDS:
            raw = request.query_params.get(name)
            if raw is None:
                continue
            if name in {"start_date", "end_date"}:
                values[name] = date.fromisoformat(raw)
            else:
                values[name] = raw
        result = AnalyticsFilter(**values)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    for name in ("insurer_id", "tier_id"):
        chosen = getattr(result, name)
        if chosen is None:
            continue
        available = {row[0] for row in conn.execute(f"SELECT DISTINCT {name} FROM sessions")}
        if chosen not in available:
            raise HTTPException(status_code=422, detail=f"{name} is not an allowed value")
    return result


def _filters_applied(filters: AnalyticsFilter) -> dict[str, str]:
    result = {}
    for name in FILTER_FIELDS:
        value = getattr(filters, name)
        if value is not None:
            result[name] = value.isoformat() if isinstance(value, date) else value
    return result


def _provenance(conn: sqlite3.Connection, filters: AnalyticsFilter) -> dict[str, Any]:
    session_filters = replace(filters, topic_code=None, service_code=None, concern_code=None)
    return read_metrics(conn, "sessions", (), session_filters).provenance


def _cell_json(cell: SuppressedCell) -> dict[str, Any]:
    return asdict(cell)


def _table(name: str, unit: str, cells: list[AggregateCell] | tuple[AggregateCell, ...], caveat: str) -> dict[str, Any]:
    safe = suppress_table(list(cells))
    serialized = [_cell_json(cell) for cell in safe.cells]
    if len(serialized) == 1:
        first = serialized[0]
        numerator, denominator, value = first["numerator"], first["denominator"], first["value"]
    elif not serialized:
        numerator, denominator, value = 0, None, 0
    else:
        numerator, denominator, value = None, None, None
    return {
        "metric": name,
        "unit": unit,
        "numerator": numerator,
        "denominator": denominator,
        "value": value,
        "suppressed": any(cell["suppressed"] for cell in serialized),
        "cells": serialized,
        "caveat": caveat,
    }


def _metric_table(result: MetricResult) -> dict[str, Any]:
    table = _table(result.metric, result.unit, result.cells, result.caveat)
    table["filters_applied"] = dict(result.filters_applied)
    return table


def _response(
    endpoint: str,
    filters: AnalyticsFilter,
    provenance: Mapping[str, Any],
    tables: dict[str, dict[str, Any]],
    primary_table: str | None,
    caveat: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    for table in tables.values():
        table.setdefault("filters_applied", _filters_applied(filters))
    primary = tables.get(primary_table) if primary_table else None
    return {
        "endpoint": endpoint,
        "synthetic": True,
        "metric": primary["metric"] if primary else None,
        "unit": primary["unit"] if primary else "metadata",
        "numerator": primary["numerator"] if primary else None,
        "denominator": primary["denominator"] if primary else None,
        "value": primary["value"] if primary else None,
        "suppressed": primary["suppressed"] if primary else False,
        "cells": primary["cells"] if primary else [],
        "tables": tables,
        "filters_applied": _filters_applied(filters),
        "provenance": dict(provenance),
        "caveat": f"{DISCLOSURE_CAVEAT} {caveat}".strip(),
        **(metadata or {}),
    }


def _grouped_cells(
    conn: sqlite3.Connection,
    filters: AnalyticsFilter,
    group_by: tuple[str, ...],
    event_rows: bool = False,
) -> list[AggregateCell]:
    """Aggregate with only fixed dimensions; all filter values remain bound."""
    expressions = [_DIMENSION_SQL[name] for name in group_by]
    selected = ", ".join(expressions)
    prefix = f"{selected}, " if selected else ""
    clauses, values = _cohort_where(filters)
    if event_rows:
        event_clauses, event_values = _event_where(filters)
        clauses += event_clauses
        values += event_values
        from_sql = "sessions s JOIN messages m ON m.session_id = s.session_id JOIN issue_events e ON e.message_id = m.message_id"
        count_sql = "COUNT(DISTINCT s.session_id)"
    else:
        from_sql = "sessions s"
        count_sql = "COUNT(DISTINCT s.session_id)"
    where = _where_sql(clauses)
    group = f" GROUP BY {selected} ORDER BY {selected}" if selected else ""
    rows = conn.execute(f"SELECT {prefix}{count_sql} FROM {from_sql}{where}{group}", values).fetchall()
    if not group_by:
        return [AggregateCell({}, rows[0][0], None, rows[0][0], rows[0][0])]
    cells = []
    for row in rows:
        dims = dict(zip(group_by, (str(value) for value in row[:-1])))
        cells.append(AggregateCell(dims, row[-1], None, row[-1], row[-1]))
    return cells


def _rate_cells(
    conn: sqlite3.Connection,
    filters: AnalyticsFilter,
    group_by: tuple[str, ...],
    exclude_unknown_geography: bool = False,
) -> list[AggregateCell]:
    """Return per-1,000 counts with grouped cohort denominators."""
    session_dims = tuple(name for name in group_by if name in {"region", "location_basis"})
    event_dims = tuple(name for name in group_by if name in {"topic_code", "concern_code"})
    clauses, values = _cohort_where(filters)
    if exclude_unknown_geography:
        clauses += ["s.region != 'unknown'", "s.location_basis != 'unknown'"]
    where = _where_sql(clauses)
    period_expr = _DIMENSION_SQL.get(group_by[0]) if group_by and group_by[0] in {"month", "week"} else None
    group_session = []
    for name in session_dims:
        group_session.append(_DIMENSION_SQL[name])
    if period_expr:
        group_session.insert(0, period_expr)
    denom_select = ", ".join(group_session)
    denom_prefix = f"{denom_select}, " if denom_select else ""
    denom_group = f" GROUP BY {denom_select}" if denom_select else ""
    denom_rows = conn.execute(
        f"SELECT {denom_prefix}COUNT(DISTINCT s.session_id) FROM sessions s{where}{denom_group}", values
    ).fetchall()
    denom_map = {tuple(row[:-1]): row[-1] for row in denom_rows}

    event_clauses, event_values = _event_where(filters)
    all_clauses = clauses + event_clauses
    event_expressions = [period_expr] if period_expr else []
    event_expressions.extend(_DIMENSION_SQL[name] for name in session_dims)
    event_expressions.extend(_DIMENSION_SQL[name] for name in event_dims)
    event_select = ", ".join(event_expressions)
    event_prefix = f"{event_select}, " if event_select else ""
    event_group = f" GROUP BY {event_select}" if event_select else ""
    event_where = _where_sql(all_clauses)
    event_rows = conn.execute(
        f"""SELECT {event_prefix}COUNT(DISTINCT s.session_id)
            FROM sessions s JOIN messages m ON m.session_id = s.session_id
            JOIN issue_events e ON e.message_id = m.message_id{event_where}{event_group}""",
        values + event_values,
    ).fetchall()
    cells = []
    for row in event_rows:
        dimensions = dict(zip(group_by, (str(value) for value in row[:-1])))
        key = tuple(dimensions[name] if name in dimensions else None for name in group_by if name in session_dims or name in {"month", "week"})
        denominator = denom_map.get(key, 0)
        numerator = row[-1]
        rate = 1000.0 * numerator / denominator if denominator else 0.0
        cells.append(AggregateCell(dimensions, numerator, denominator, rate, numerator))
    return cells


def _outcome_cells(
    conn: sqlite3.Connection,
    filters: AnalyticsFilter,
    topics: tuple[str, ...] | None = None,
) -> tuple[list[AggregateCell], list[AggregateCell]]:
    clauses = ["m.role = 'user'", "e.service_code != 'unknown'"]
    values: list[Any] = []
    cohort_clauses, cohort_values = _cohort_where(filters)
    clauses += cohort_clauses
    values += cohort_values
    if topics:
        clauses.append(f"e.topic_code IN ({', '.join('?' for _ in topics)})")
        values.extend(topics)
    event_clauses, event_values = _event_where(filters)
    clauses += event_clauses
    values += event_values
    where = _where_sql(clauses)
    rows = conn.execute(
        f"""SELECT e.topic_code, e.service_code,
                   COUNT(DISTINCT CASE WHEN e.answer_outcome = 'unresolved' THEN e.event_id END),
                   COUNT(DISTINCT CASE WHEN e.answer_outcome IN ('resolved', 'unresolved') THEN e.event_id END),
                   COUNT(DISTINCT CASE WHEN e.answer_outcome = 'unknown_not_assessed' THEN e.event_id END),
                   COUNT(DISTINCT s.session_id),
                   COUNT(DISTINCT CASE WHEN e.answer_outcome = 'unknown_not_assessed' THEN s.session_id END)
            FROM sessions s JOIN messages m ON m.session_id = s.session_id
            JOIN issue_events e ON e.message_id = m.message_id{where}
            GROUP BY e.topic_code, e.service_code ORDER BY e.topic_code, e.service_code""",
        values,
    ).fetchall()
    outcomes = []
    unknowns = []
    for row in rows:
        dimensions = {"topic_code": row[0], "service_code": row[1]}
        denominator = row[3]
        outcomes.append(
            AggregateCell(
                dimensions,
                row[2],
                denominator,
                row[2] / denominator if denominator else 0.0,
                row[5],
            )
        )
        if row[4]:
            unknowns.append(AggregateCell(dimensions, row[4], None, row[4], row[6]))
    return outcomes, unknowns


def _quality_cell(conn: sqlite3.Connection, filters: AnalyticsFilter, quality: str) -> AggregateCell:
    clauses, values = _cohort_where(filters)
    where = _where_sql(clauses)
    denominator = conn.execute(f"SELECT COUNT(DISTINCT s.session_id) FROM sessions s{where}", values).fetchone()[0]
    if quality == "unknown_location_share":
        numerator = conn.execute(
            f"SELECT COUNT(DISTINCT s.session_id) FROM sessions s{where}{' AND ' if where else ' WHERE '}s.location_basis = 'unknown'",
            values,
        ).fetchone()[0]
    else:
        numerator = conn.execute(
            f"""SELECT COUNT(DISTINCT s.session_id) FROM sessions s{where}{' AND ' if where else ' WHERE '}
                NOT EXISTS (SELECT 1 FROM messages m JOIN issue_events e ON e.message_id = m.message_id
                            WHERE m.session_id = s.session_id AND e.topic_code != 'unknown_unclassified')""",
            values,
        ).fetchone()[0]
    return AggregateCell({}, numerator, denominator, numerator / denominator if denominator else 0.0, numerator)


def _unknown_event_count(conn: sqlite3.Connection, filters: AnalyticsFilter, column: str, value: str) -> AggregateCell:
    clauses = ["m.role = 'user'", f"e.{column} = ?"]
    values: list[Any] = [value]
    cohort_clauses, cohort_values = _cohort_where(filters)
    clauses += cohort_clauses
    values += cohort_values
    event_clauses, event_values = _event_where(filters)
    clauses += event_clauses
    values += event_values
    row = conn.execute(
        f"""SELECT COUNT(DISTINCT e.event_id), COUNT(DISTINCT s.session_id)
            FROM sessions s JOIN messages m ON m.session_id = s.session_id
            JOIN issue_events e ON e.message_id = m.message_id{_where_sql(clauses)}""",
        values,
    ).fetchone()
    return AggregateCell({}, row[0], None, row[0], row[1])


def _period_expression(bucket: str) -> str:
    return _DIMENSION_SQL[bucket]


def _period_rows(
    conn: sqlite3.Connection,
    filters: AnalyticsFilter,
    bucket: str,
    category: str,
    date_free: bool = False,
) -> tuple[dict[tuple[str, str, str, str], tuple[int, int]], dict[tuple[str, str, str], int]]:
    selected_filters = replace(filters, start_date=None, end_date=None) if date_free else filters
    period = _period_expression(bucket)
    cohort_clauses, cohort_values = _cohort_where(selected_filters)
    clauses = cohort_clauses + ["s.region != 'unknown'", "s.location_basis != 'unknown'"]
    where = _where_sql(clauses)
    den_rows = conn.execute(
        f"""SELECT {period}, s.region, s.location_basis, COUNT(DISTINCT s.session_id)
            FROM sessions s{where} GROUP BY {period}, s.region, s.location_basis""",
        cohort_values,
    ).fetchall()
    denominators = {(row[0], row[1], row[2]): row[3] for row in den_rows}

    event_clauses, event_values = _event_where(selected_filters)
    event_where = _where_sql(clauses + event_clauses)
    expression = _DIMENSION_SQL[category]
    rows = conn.execute(
        f"""SELECT {period}, s.region, s.location_basis, {expression}, COUNT(DISTINCT s.session_id)
            FROM sessions s JOIN messages m ON m.session_id = s.session_id
            JOIN issue_events e ON e.message_id = m.message_id{event_where}
            GROUP BY {period}, s.region, s.location_basis, {expression}
            ORDER BY {period}, s.region, s.location_basis, {expression}""",
        cohort_values + event_values,
    ).fetchall()
    values = {(row[0], row[1], row[2], row[3]): (row[4], denominators.get((row[0], row[1], row[2]), 0)) for row in rows}
    return values, denominators


def _trend_tables(conn: sqlite3.Connection, filters: AnalyticsFilter, bucket: str) -> dict[str, dict[str, Any]]:
    tables: dict[str, dict[str, Any]] = {}
    for category in ("topic_code", "concern_code"):
        current, _ = _period_rows(conn, filters, bucket, category)
        baseline, _ = _period_rows(conn, filters, bucket, category, date_free=True) if bucket == "month" else ({}, {})
        table_cells: list[AggregateCell] = []
        cell_extras: list[dict[str, Any]] = []
        for key, (numerator, denominator) in current.items():
            period_key, region, basis, code = key
            dimension = {bucket: period_key, "region": region, "location_basis": basis, category: code}
            cell = AggregateCell(dimension, numerator, denominator, 1000.0 * numerator / denominator if denominator else 0.0, numerator)
            table_cells.append(cell)
            base_key = (f"{int(period_key[:4]) - 1:04d}{period_key[4:]}", region, basis, code)
            prior = baseline.get(base_key)
            available = prior is not None
            if available:
                prior_num, prior_den = prior
                table_cells.append(
                    AggregateCell(dimension, prior_num, prior_den, 1000.0 * prior_num / prior_den if prior_den else 0.0, prior_num)
                )
                cell_extras.append(
                    {
                        "baseline_available": True,
                        "baseline_numerator": prior_num,
                        "baseline_denominator": prior_den,
                        "baseline_rate_per_1000": 1000.0 * prior_num / prior_den if prior_den else 0.0,
                        "rate_difference_per_1000": (1000.0 * numerator / denominator if denominator else 0.0)
                        - (1000.0 * prior_num / prior_den if prior_den else 0.0),
                    }
                )
            else:
                cell_extras.append(
                    {
                        "baseline_available": False,
                        "baseline_numerator": None,
                        "baseline_denominator": None,
                        "baseline_rate_per_1000": None,
                        "rate_difference_per_1000": None,
                    }
                )
        safe = suppress_table(table_cells)
        visible_cells = []
        safe_index = 0
        extra_index = 0
        for key, (numerator, denominator) in current.items():
            current_safe = safe.cells[safe_index]
            safe_index += 1
            extra = dict(cell_extras[extra_index])
            extra_index += 1
            period_key, region, basis, code = key
            available = extra["baseline_available"]
            prior_safe = None
            if available:
                prior_safe = safe.cells[safe_index]
                safe_index += 1
                if prior_safe.suppressed:
                    extra.update(
                        baseline_available=False,
                        baseline_numerator=None,
                        baseline_denominator=None,
                        baseline_rate_per_1000=None,
                        rate_difference_per_1000=None,
                    )
            output = _cell_json(current_safe)
            output["series"] = "current"
            output.update(extra)
            visible_cells.append(output)
        tables[f"{category}_trend"] = {
            "metric": f"{category}_rate_per_1000",
            "unit": "sessions_per_1000_selected_sessions",
            "numerator": None,
            "denominator": None,
            "value": None,
            "suppressed": any(cell["suppressed"] for cell in visible_cells),
            "cells": visible_cells,
            "caveat": "Monthly and weekly counts are synthetic. Any injected spike is an artificial demonstration pattern, not an outbreak or forecast.",
        }
    return tables


def _meta_values(conn: sqlite3.Connection) -> dict[str, Any]:
    start, end = conn.execute(
        "SELECT MIN(date(started_at_utc, '+10 hours')), MAX(date(started_at_utc, '+10 hours')) FROM sessions"
    ).fetchone()
    insurer_values = [row[0] for row in conn.execute("SELECT DISTINCT insurer_id FROM sessions ORDER BY insurer_id")]
    tier_values = [row[0] for row in conn.execute("SELECT DISTINCT tier_id FROM sessions ORDER BY tier_id")]
    return {
        "available_date_range": {"start_date": start, "end_date": end},
        "allowlists": {
            "insurer_id": insurer_values,
            "tier_id": tier_values,
            "region": list(REGIONS),
            "location_basis": sorted(LOCATION_BASES),
            "topic_code": sorted(TOPIC_CODES),
            "service_code": sorted(SERVICE_CODES),
            "concern_code": sorted(CONCERN_CODES),
            "time_bucket": ["month", "week"],
        },
        "suppression": {
            "min_sessions": 10,
            "scope": "table-local",
            "real_data_safety_claim": False,
        },
    }


def create_app(db_path: str | Path = DEFAULT_DB) -> FastAPI:
    app = FastAPI(title="MediBridge Synthetic Analytics Demo", docs_url=None, redoc_url=None)
    resolved_db = Path(db_path).resolve()
    app.state.db_path = resolved_db

    @app.get("/api/demo/meta")
    def meta(request: Request, conn: sqlite3.Connection = Depends(_connection)):
        filters = _filters(request, conn)
        return _response(
            "meta",
            filters,
            _provenance(conn, filters),
            {},
            None,
            "Allowlisted filter values and source metadata only; no sample rows or identifiers.",
            _meta_values(conn),
        )

    @app.get("/api/demo/overview")
    def overview(request: Request, conn: sqlite3.Connection = Depends(_connection)):
        filters = _filters(request, conn)
        session_filters = replace(filters, topic_code=None, service_code=None, concern_code=None)
        session_count = _metric_table(read_metrics(conn, "sessions", (), session_filters))
        turns = _metric_table(read_metrics(conn, "question_turns", (), filters))
        topics = _metric_table(read_metrics(conn, "topic_sessions", ("topic_code",), filters))
        quality_filters = replace(filters, topic_code=None, service_code=None, concern_code=None)
        unknown = _metric_table(read_metrics(conn, "unknown_topic_share", (), quality_filters))
        tables = {
            "selected_sessions": session_count,
            "question_turns": turns,
            "topic_sessions": topics,
            "unknown_topic_share": unknown,
        }
        return _response(
            "overview", filters, _provenance(conn, filters), tables, "selected_sessions",
            "Selected synthetic sessions are the denominator, including sessions with unknown or no topic.",
        )

    @app.get("/api/demo/topics")
    def topics(request: Request, conn: sqlite3.Connection = Depends(_connection)):
        filters = _filters(request, conn)
        topic_table = _metric_table(read_metrics(conn, "topic_sessions", ("topic_code",), filters))
        topic_codes = [filters.topic_code] if filters.topic_code else sorted(TOPIC_CODES)
        rate_cells = []
        for code in topic_codes:
            selected = replace(filters, topic_code=code)
            result = read_metrics(conn, "topic_rate_per_1000", (), selected)
            cell = result.cells[0]
            rate_cells.append(AggregateCell({"topic_code": code}, cell.numerator, cell.denominator, cell.value, cell.distinct_sessions))
        rates = _table("topic_rate_per_1000", "topic_sessions_per_1000_selected_sessions", rate_cells,
                       "Every rate denominator is all sessions in the selected cohort, including unknown/no-topic sessions.")
        answer_cells, unknown_outcome_cells = _outcome_cells(conn, filters)
        tables = {
            "topic_sessions": topic_table,
            "topic_rates": rates,
            "answer_outcome_share": _table("answer_outcome_share", "share_of_resolved_or_unresolved_events", answer_cells,
                                            "Scripted outcomes are not user comprehension, satisfaction, claim payment, or care outcomes."),
            "unknown_outcome_events": _table("unknown_outcome_events", "issue_events", unknown_outcome_cells,
                                              "Unknown scripted outcome events are shown separately."),
        }
        return _response(
            "topics", filters, _provenance(conn, filters), tables, "topic_sessions",
            "Question tags are not diagnoses; repeated tags are deduplicated by session and topic.",
        )

    @app.get("/api/demo/trend")
    def trend(request: Request, conn: sqlite3.Connection = Depends(_connection)):
        filters = _filters(request, conn, ("bucket",))
        bucket = request.query_params.get("bucket", "month")
        if bucket not in {"month", "week"}:
            raise HTTPException(status_code=422, detail="bucket must be month or week")
        tables = _trend_tables(conn, filters, bucket)
        primary = next(iter(tables), None)
        return _response(
            "trend", filters, _provenance(conn, filters), tables, primary,
            "Artificial demonstration pattern only; not surveillance, an outbreak signal, or a causal estimate.",
            {"time_bucket": bucket},
        )

    @app.get("/api/demo/regions")
    def regions(request: Request, conn: sqlite3.Connection = Depends(_connection)):
        filters = _filters(request, conn)
        session_cells = _grouped_cells(conn, filters, ("region", "location_basis"))
        rates = _rate_cells(conn, filters, ("region", "location_basis", "topic_code"), exclude_unknown_geography=True)
        session_table = _table("sessions", "sessions", session_cells,
                               "Unknown geography remains visible; stated regions and search areas are separate.")
        session_table["filters_applied"] = _filters_applied(
            replace(filters, topic_code=None, service_code=None, concern_code=None)
        )
        tables = {
            "sessions_by_region_and_basis": session_table,
            "topic_rates": _table("topic_rate_per_1000", "topic_sessions_per_1000_region_sessions", rates,
                                  "Unknown geography is excluded from region-specific rates; searched area is not residence."),
        }
        return _response("regions", filters, _provenance(conn, filters), tables,
                         "sessions_by_region_and_basis",
                         "Regions are broad fictional Queensland groupings, not official boundaries or residence evidence.")

    @app.get("/api/demo/coverage-friction")
    def coverage_friction(request: Request, conn: sqlite3.Connection = Depends(_connection)):
        filters = _filters(request, conn)
        coverage_topics = tuple(sorted({"coverage_benefit_exclusion", "coverage_waiting_period", "cost_out_of_pocket"}))
        selected_codes = [filters.topic_code] if filters.topic_code in coverage_topics else (
            [] if filters.topic_code else list(coverage_topics)
        )
        topic_cells: list[AggregateCell] = []
        turn_cells: list[AggregateCell] = []
        rate_cells: list[AggregateCell] = []
        for code in selected_codes:
            selected = replace(filters, topic_code=code)
            topic_result = read_metrics(conn, "topic_sessions", ("topic_code",), selected)
            topic_cells.extend(topic_result.cells)
            turns_result = read_metrics(conn, "question_turns", (), selected)
            turns_cells = turns_result.cells[0]
            turn_cells.append(AggregateCell({"topic_code": code}, turns_cells.numerator, None, turns_cells.value, turns_cells.distinct_sessions))
            rate_result = read_metrics(conn, "topic_rate_per_1000", (), selected)
            rate = rate_result.cells[0]
            rate_cells.append(AggregateCell({"topic_code": code}, rate.numerator, rate.denominator, rate.value, rate.distinct_sessions))
        outcomes, unknown_outcomes = _outcome_cells(conn, filters, coverage_topics)
        if filters.topic_code and filters.topic_code not in coverage_topics:
            outcomes, unknown_outcomes = [], []
        tables = {
            "topic_sessions": _table("topic_sessions", "sessions", topic_cells, "Distinct sessions count once per coverage topic."),
            "question_turns": _table("question_turns", "question_turns", turn_cells, "A question turn is a distinct user message with a matched issue tag."),
            "topic_rates": _table("topic_rate_per_1000", "topic_sessions_per_1000_selected_sessions", rate_cells,
                                  "Rates use all selected sessions, including unknown-topic sessions."),
            "answer_outcome_share": _table("answer_outcome_share", "share_of_resolved_or_unresolved_events", outcomes,
                                            "This service-linked synthetic proxy is not a claim or actual coverage failure."),
            "unknown_outcome_events": _table("unknown_outcome_events", "issue_events", unknown_outcomes,
                                              "Unknown scripted outcome events are counted separately."),
        }
        return _response("coverage-friction", filters, _provenance(conn, filters), tables, "topic_sessions",
                         "These are fictional scripted coverage questions; the endpoint does not measure claims friction.")

    @app.get("/api/demo/quality")
    def quality(request: Request, conn: sqlite3.Connection = Depends(_connection)):
        filters = _filters(request, conn)
        session_filters = replace(filters, topic_code=None, service_code=None, concern_code=None)
        unknown_topic = _metric_table(read_metrics(conn, "unknown_topic_share", (), session_filters))
        unknown_location_cell = _quality_cell(conn, filters, "unknown_location_share")
        unknown_location_table = _table("unknown_location_share", "share", [unknown_location_cell],
                                        "Unknown location is not imputed.")
        unknown_location_table["filters_applied"] = _filters_applied(session_filters)
        unclassified_cell = _unknown_event_count(conn, filters, "topic_code", "unknown_unclassified")
        outcome_cell = _unknown_event_count(conn, filters, "answer_outcome", "unknown_not_assessed")
        tables = {
            "unknown_topic_share": unknown_topic,
            "unknown_location_share": unknown_location_table,
            "unclassified_topic_events": _table("unclassified_topic_events", "issue_events", [unclassified_cell],
                                                 "Unclassified tags are separate from the session-level unknown-topic share."),
            "unknown_outcome_events": _table("unknown_outcome_events", "issue_events", [outcome_cell],
                                              "Unknown outcome events are not treated as resolved or unresolved."),
        }
        return _response("quality", filters, _provenance(conn, filters), tables, "unknown_topic_share",
                         "Unknown values remain visible as aggregate quality measures; no individual record is returned.")

    return app


app = create_app()
