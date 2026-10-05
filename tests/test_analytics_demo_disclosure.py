"""Tests for disclosure control over synthetic aggregate tables."""

import importlib
import pytest

from medibridge.analytics_demo.metrics import AggregateCell


def _disclosure():
    """Load the planned interface at test time so missing code fails as a test."""
    return importlib.import_module("medibridge.analytics_demo.disclosure")


def _cell(dimensions, sessions, *, numerator=None, denominator=None, value=None):
    if numerator is None:
        numerator = sessions
    if value is None:
        value = numerator
    return AggregateCell(
        dimensions=dimensions,
        numerator=numerator,
        denominator=denominator,
        value=value,
        distinct_sessions=sessions,
    )


def test_primary_small_cell_is_null_with_explicit_state_and_reason():
    disclosure = _disclosure()

    result = disclosure.suppress_table(
        [_cell({"region": "Brisbane"}, 4, numerator=4, denominator=40, value=100.0)]
    )

    cell = result.cells[0]
    assert cell.suppressed is True
    assert cell.reason_code == "primary_suppression"
    assert cell.numerator is None
    assert cell.denominator is None
    assert cell.value is None
    assert cell.distinct_sessions is None
    assert "not a real-data safety threshold" in result.caveat


def test_complementary_suppression_hides_siblings_that_reveal_a_total():
    disclosure = _disclosure()
    rows = [
        _cell({"topic_code": "primary_care"}, 4),
        _cell({"topic_code": "pharmacy_medicines"}, 26),
        _cell({}, 30),
    ]

    result = disclosure.suppress_table(rows)

    assert result.cells[0].reason_code == "primary_suppression"
    assert all(cell.suppressed for cell in result.cells)
    assert all(cell.reason_code for cell in result.cells)
    assert all(cell.value is None and cell.numerator is None for cell in result.cells)


def test_filtered_sibling_totals_are_hidden_with_primary_cell():
    disclosure = _disclosure()
    rows = [
        _cell({"topic_code": "primary_care", "region": "Brisbane"}, 3),
        _cell({"topic_code": "primary_care"}, 20),
        _cell({"topic_code": "primary_care", "region": "Gold Coast"}, 23),
    ]

    result = disclosure.suppress_table(rows)

    assert result.cells[0].reason_code == "primary_suppression"
    assert result.cells[1].suppressed is True
    assert result.cells[2].suppressed is True
    assert result.cells[1].value is None
    assert result.cells[2].value is None


def test_matrix_suppression_hides_cells_needed_for_row_or_column_totals():
    disclosure = _disclosure()
    rows = [
        _cell({"topic_code": "primary_care", "region": "Brisbane"}, 4, numerator=4, denominator=20),
        _cell({"topic_code": "primary_care", "region": "Gold Coast"}, 16, numerator=16, denominator=20),
        _cell({"topic_code": "pharmacy_medicines", "region": "Brisbane"}, 12, numerator=12, denominator=20),
        _cell({"topic_code": "pharmacy_medicines", "region": "Gold Coast"}, 18, numerator=18, denominator=20),
    ]

    result = disclosure.suppress_table(rows)

    assert len(result.cells) == 4
    assert all(cell.suppressed for cell in result.cells)
    assert all(cell.numerator is None and cell.denominator is None and cell.value is None
               and cell.distinct_sessions is None for cell in result.cells)


def test_separate_topic_tables_suppress_independently():
    disclosure = _disclosure()

    hidden_topic = disclosure.suppress_table([
        _cell({"topic_code": "primary_care", "month": "2025-01"}, 3, numerator=3, denominator=20),
        _cell({"topic_code": "primary_care", "month": "2025-02"}, 17, numerator=17, denominator=30),
    ])
    other_topic = disclosure.suppress_table([
        _cell({"topic_code": "coverage_waiting_period", "month": "2025-01"}, 14, numerator=14, denominator=20),
        _cell({"topic_code": "coverage_waiting_period", "month": "2025-02"}, 17, numerator=17, denominator=30),
    ])

    assert all(cell.suppressed for cell in hidden_topic.cells)
    assert all(not cell.suppressed for cell in other_topic.cells)


def test_fully_safe_table_preserves_aggregate_values():
    disclosure = _disclosure()
    rows = [
        _cell({"topic_code": "primary_care"}, 18, numerator=18),
        _cell({"topic_code": "pharmacy_medicines"}, 32, numerator=32),
        _cell({}, 50, numerator=50),
    ]

    result = disclosure.suppress_table(rows)

    assert [cell.suppressed for cell in result.cells] == [False, False, False]
    assert [cell.reason_code for cell in result.cells] == [None, None, None]
    assert [cell.value for cell in result.cells] == [18, 32, 50]


def test_suppression_uses_distinct_session_support_not_turn_count():
    disclosure = _disclosure()
    turn_cell = _cell(
        {},
        3,
        numerator=25,
        value=25,
    )

    result = disclosure.suppress_table([turn_cell])

    assert result.cells[0].suppressed is True
    assert result.cells[0].reason_code == "primary_suppression"


@pytest.mark.parametrize("min_sessions", [0, -1, True])
def test_suppression_threshold_must_be_a_positive_integer(min_sessions):
    disclosure = _disclosure()

    with pytest.raises(ValueError, match="positive integer"):
        disclosure.suppress_table([], min_sessions=min_sessions)


def test_suppression_rejects_row_level_identifier_dimensions():
    disclosure = _disclosure()
    row = _cell({"session_id": "session-secret"}, 20)

    with pytest.raises(ValueError, match="dimension is not allowlisted"):
        disclosure.suppress_table([row])


def test_suppression_rejects_exact_timestamp_as_a_month_dimension():
    disclosure = _disclosure()
    row = _cell({"month": "2025-01-02T01:23:45Z"}, 20)

    with pytest.raises(ValueError, match="month must use YYYY-MM granularity"):
        disclosure.suppress_table([row])


@pytest.mark.parametrize(
    ("dimension", "value"),
    [
        ("insurer_id", "arbitrary-injected-label"),
        ("tier_id", "arbitrary-injected-label"),
    ],
)
def test_suppression_rejects_unknown_insurer_and_tier_values(dimension, value):
    disclosure = _disclosure()
    row = _cell({dimension: value}, 20)

    with pytest.raises(ValueError, match=f"{dimension} is not an allowed value"):
        disclosure.suppress_table([row])
