import re

from medibridge.analytics_demo.scenarios import (
    CONCERN_CODES,
    REGIONS,
    SERVICE_CODES,
    TOPIC_CODES,
    scenario_for,
)


def test_scenarios_produce_nonempty_fictional_messages_and_allowlisted_tags():
    scenarios = [scenario_for(17, index, "2026-04-03T00:00:00Z") for index in range(1000)]
    forbidden = re.compile(
        r"(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|"
        r"(?:\+?61|0)[\s-]?(?:\(?\d\)?[\s-]?){8,}|"
        r"\b(?:student\s*(?:id|number|no\.?))\b|\b\d{8,}\b)",
        re.IGNORECASE,
    )

    assert all(message.content.strip() for scenario in scenarios for message in scenario.messages)
    assert all(
        not forbidden.search(message.content)
        for scenario in scenarios
        for message in scenario.messages
    )
    assert all(
        tag.topic_code in TOPIC_CODES
        and tag.service_code in SERVICE_CODES
        and tag.concern_code in CONCERN_CODES
        and tag.answer_outcome in {"resolved", "unresolved", "unknown_not_assessed"}
        for scenario in scenarios
        for tag in scenario.issue_tags
    )
    assert all(scenario.region in REGIONS for scenario in scenarios)


def test_service_search_area_is_never_labeled_as_stated_region():
    scenarios = [scenario_for(99, index, "2026-04-03T00:00:00Z") for index in range(1000)]

    assert any(scenario.location_basis == "service_search_area" for scenario in scenarios)
    assert all(
        scenario.location_basis != "stated_demo_region"
        for scenario in scenarios
        if scenario.location_basis == "service_search_area"
    )
    assert all(
        scenario.location_basis == "unknown" or scenario.region != "unknown"
        for scenario in scenarios
    )


def test_schedule_injects_documented_respiratory_and_coverage_spikes():
    respiratory_window = [
        scenario_for(5, index, "2025-01-15T00:00:00Z") for index in range(100)
    ]
    coverage_window = [
        scenario_for(5, index, "2025-10-15T00:00:00Z") for index in range(100)
    ]

    respiratory_spikes = [s for s in respiratory_window if s.scenario_code == "respiratory_spike"]
    coverage_spikes = [s for s in coverage_window if s.scenario_code == "coverage_information_spike"]
    assert respiratory_spikes
    assert all("respiratory_information" in {tag.topic_code for tag in s.issue_tags} for s in respiratory_spikes)
    assert coverage_spikes
    assert all(
        {tag.topic_code for tag in s.issue_tags} & {"coverage_benefit_exclusion", "coverage_waiting_period", "claims_process"}
        for s in coverage_spikes
    )
    assert any(s.scenario_code == "control_stable" for s in respiratory_window)
    assert any(s.scenario_code == "control_stable" for s in coverage_window)


def test_spikes_are_not_injected_outside_their_calendar_windows():
    outside = [
        scenario_for(5, index, "2025-06-15T00:00:00Z") for index in range(1000)
    ]

    assert all(
        scenario.scenario_code not in {"respiratory_spike", "coverage_information_spike"}
        for scenario in outside
    )


def test_mix_includes_required_stable_unclassified_and_mixed_topics():
    scenarios = [scenario_for(88, index, "2026-04-03T00:00:00Z") for index in range(1000)]
    observed_topics = {tag.topic_code for scenario in scenarios for tag in scenario.issue_tags}
    assert {
        "primary_care",
        "specialist_care",
        "pharmacy_medicines",
        "emergency_hospital_care",
        "mental_health_information",
        "sexual_reproductive_health_information",
        "respiratory_information",
        "gastrointestinal_information",
        "dental_optical_benefits",
        "coverage_waiting_period",
        "claims_process",
        "unknown_unclassified",
    } <= observed_topics
    assert any(len(scenario.issue_tags) > 1 for scenario in scenarios)
    assert any(scenario.scenario_code == "control_stable" for scenario in scenarios)


def test_scenario_for_is_repeatable_for_same_inputs():
    assert scenario_for(20261005, 543, "2025-02-03T12:00:00Z") == scenario_for(
        20261005, 543, "2025-02-03T12:00:00Z"
    )
