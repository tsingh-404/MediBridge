"""Prototype disclosure control for synthetic aggregate tables."""

from dataclasses import dataclass
from datetime import date
import re
from typing import Mapping

from medibridge.analytics_demo.metrics import AggregateCell
from medibridge.analytics_demo.scenarios import (
    CONCERN_CODES,
    INSURER_CODES,
    LOCATION_BASES,
    REGIONS,
    SERVICE_CODES,
    TIER_CODES,
    TOPIC_CODES,
)


@dataclass(frozen=True)
class SuppressedCell:
    """A chart-ready aggregate cell with explicit disclosure state."""

    dimensions: Mapping[str, str]
    numerator: int | None
    denominator: int | None
    value: int | float | None
    distinct_sessions: int | None
    suppressed: bool
    reason_code: str | None


@dataclass(frozen=True)
class SuppressedTable:
    """Cells after primary and complementary suppression for one table."""

    cells: tuple[SuppressedCell, ...]
    min_sessions: int
    caveat: str


_CAVEAT = (
    "Synthetic demo suppression prototype only. The threshold is not a real-data "
    "safety threshold and does not guarantee disclosure safety."
)
_ALLOWED_DIMENSIONS = frozenset(
    {
        "insurer_id",
        "tier_id",
        "region",
        "location_basis",
        "topic_code",
        "service_code",
        "concern_code",
        "month",
        "week",
    }
)
_VALUE_ALLOWLISTS = {
    "insurer_id": INSURER_CODES,
    "tier_id": TIER_CODES,
    "region": REGIONS,
    "location_basis": LOCATION_BASES,
    "topic_code": TOPIC_CODES,
    "service_code": SERVICE_CODES,
    "concern_code": CONCERN_CODES,
}


def _hidden(cell: AggregateCell, reason: str) -> SuppressedCell:
    return SuppressedCell(
        dimensions=dict(cell.dimensions),
        numerator=None,
        denominator=None,
        value=None,
        distinct_sessions=None,
        suppressed=True,
        reason_code=reason,
    )


def _visible(cell: AggregateCell) -> SuppressedCell:
    return SuppressedCell(
        dimensions=dict(cell.dimensions),
        numerator=cell.numerator,
        denominator=cell.denominator,
        value=cell.value,
        distinct_sessions=cell.distinct_sessions,
        suppressed=False,
        reason_code=None,
    )


def suppress_table(rows: list[AggregateCell], min_sessions: int = 10) -> SuppressedTable:
    """Suppress small cells and sibling cells in one table to prevent subtraction.

    The metric core supplies ``distinct_sessions`` for each cell. If a table has
    any primary-suppressed cell, this conservative prototype suppresses every
    other cell in that same table as complementary because the interface has no
    hierarchy metadata that could safely identify a smaller sibling set.
    """
    if isinstance(min_sessions, bool) or not isinstance(min_sessions, int) or min_sessions < 1:
        raise ValueError("min_sessions must be a positive integer")
    if not isinstance(rows, list):
        raise TypeError("rows must be a list of AggregateCell values")
    for cell in rows:
        if not isinstance(cell, AggregateCell):
            raise TypeError("rows must contain only AggregateCell values")
        if not isinstance(cell.dimensions, Mapping) or not set(cell.dimensions).issubset(_ALLOWED_DIMENSIONS):
            raise ValueError("dimension is not allowlisted")
        if any(not isinstance(value, str) for value in cell.dimensions.values()):
            raise ValueError("dimension values must be strings")
        for name, value in cell.dimensions.items():
            if name in _VALUE_ALLOWLISTS and value not in _VALUE_ALLOWLISTS[name]:
                raise ValueError(f"{name} is not an allowed value")
            if name == "month" and not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value):
                raise ValueError("month must use YYYY-MM granularity")
            if name == "week":
                try:
                    week_start = date.fromisoformat(value)
                except ValueError as exc:
                    raise ValueError("week must use a Monday YYYY-MM-DD start") from exc
                if week_start.weekday() != 0:
                    raise ValueError("week must use a Monday YYYY-MM-DD start")
        support = cell.distinct_sessions
        if isinstance(support, bool) or not isinstance(support, int) or support < 0:
            raise ValueError("each cell must have a non-negative distinct_sessions count")

    primary_indexes = {
        index for index, cell in enumerate(rows) if cell.distinct_sessions < min_sessions
    }
    has_primary_suppression = bool(primary_indexes)
    cells = []
    for index, cell in enumerate(rows):
        if index in primary_indexes:
            cells.append(_hidden(cell, "primary_suppression"))
        elif has_primary_suppression:
            cells.append(_hidden(cell, "complementary_suppression"))
        else:
            cells.append(_visible(cell))
    return SuppressedTable(tuple(cells), min_sessions, _CAVEAT)
