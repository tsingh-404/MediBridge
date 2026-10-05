"""Original fictional conversation scenarios for the analytics demo.

The respiratory and coverage-information windows are deliberately injected
signals for validating dashboard behaviour. They are artificial and do not
represent observed MediBridge, insurer, student, or population activity.
"""

from dataclasses import dataclass
from datetime import date
import random


TOPIC_CODES = frozenset(
    {
        "coverage_benefit_exclusion",
        "coverage_waiting_period",
        "cost_out_of_pocket",
        "claims_process",
        "care_navigation",
        "provider_search_access",
        "primary_care",
        "specialist_care",
        "emergency_hospital_care",
        "pharmacy_medicines",
        "mental_health_information",
        "sexual_reproductive_health_information",
        "respiratory_information",
        "gastrointestinal_information",
        "preventive_health_information",
        "dental_optical_benefits",
        "unknown_unclassified",
    }
)
SERVICE_CODES = frozenset(
    {"gp", "specialist", "pharmacy", "emergency", "hospital", "mental_health", "sexual_reproductive_health", "dental_optical", "other", "unknown"}
)
CONCERN_CODES = frozenset(
    {"benefit_exclusion", "waiting_period", "out_of_pocket_cost", "provider_access", "care_navigation", "claims_process", "information_gap", "other", "unknown"}
)
ANSWER_OUTCOMES = frozenset({"resolved", "unresolved", "unknown_not_assessed"})
REGIONS = (
    "Brisbane",
    "Gold Coast",
    "Sunshine Coast",
    "Darling Downs",
    "Wide Bay",
    "Central Queensland",
    "North Queensland",
    "Far North Queensland",
    "unknown",
)
LOCATION_BASES = frozenset({"stated_demo_region", "service_search_area", "unknown"})


@dataclass(frozen=True)
class DialogueMessage:
    role: str
    content: str


@dataclass(frozen=True)
class IssueTag:
    """A scenario-provided label for one user-message turn."""

    message_index: int
    topic_code: str
    service_code: str
    concern_code: str
    answer_outcome: str


@dataclass(frozen=True)
class Scenario:
    scenario_code: str
    started_at_utc: str
    messages: tuple[DialogueMessage, ...]
    issue_tags: tuple[IssueTag, ...]
    insurer_id: str
    tier_id: str
    region: str
    location_basis: str


# Entries are fully invented prompts and replies, written for this demo.
# Codes are fixed scenario metadata; they are not inferred from model output.
_ISSUES = {
    "primary_care": (
        "primary_care", "gp", "care_navigation", "resolved",
        "I am unsure whether a GP visit is the right first step for a routine concern.",
        "A GP is a common first contact for a non-urgent concern; check your own cover details for costs.",
    ),
    "specialist_care": (
        "specialist_care", "specialist", "provider_access", "unknown_not_assessed",
        "I would like to understand how someone might arrange a specialist appointment.",
        "A GP can explain whether a referral is appropriate; cover and referral rules depend on the plan.",
    ),
    "pharmacy": (
        "pharmacy_medicines", "pharmacy", "out_of_pocket_cost", "unresolved",
        "How can I check whether a prescribed medicine has an out-of-pocket cost?",
        "Check the medicine and benefit details with the insurer or pharmacist before relying on a price.",
    ),
    "emergency": (
        "emergency_hospital_care", "emergency", "care_navigation", "resolved",
        "For this fictional example, where should an urgent medical concern be assessed?",
        "For an immediate emergency in Australia, call 000; for other urgent concerns seek local clinical advice.",
    ),
    "hospital": (
        "emergency_hospital_care", "hospital", "benefit_exclusion", "unknown_not_assessed",
        "I am trying to understand what questions to ask about a planned hospital admission.",
        "Ask the insurer to confirm the relevant hospital benefit, limits, and any exclusions for your plan.",
    ),
    "mental_health": (
        "mental_health_information", "mental_health", "information_gap", "unresolved",
        "What is a good way to find out about mental health support options?",
        "A GP or local health service can discuss options; this demo cannot assess an individual need.",
    ),
    "sexual_reproductive": (
        "sexual_reproductive_health_information", "sexual_reproductive_health", "information_gap", "unknown_not_assessed",
        "I have a general question about finding confidential reproductive health information.",
        "A qualified local health service can explain confidential options and any applicable fees.",
    ),
    "respiratory": (
        "respiratory_information", "gp", "care_navigation", "unresolved",
        "I have a fictional question about where to ask for advice about a cough that is not settling.",
        "A GP can assess ongoing symptoms; seek urgent help if symptoms become severe or rapidly worsen.",
    ),
    "gastrointestinal": (
        "gastrointestinal_information", "gp", "care_navigation", "resolved",
        "I would like general guidance on which service can assess a recurring stomach concern.",
        "A GP can assess recurring symptoms and advise whether further care is needed.",
    ),
    "dental_optical": (
        "dental_optical_benefits", "dental_optical", "benefit_exclusion", "unresolved",
        "How can I check if a dental or optical service is included in a sample plan?",
        "Review the plan schedule or ask the insurer about limits, waiting periods, and exclusions.",
    ),
    "waiting_period": (
        "coverage_waiting_period", "other", "waiting_period", "unknown_not_assessed",
        "I want to know whether a waiting period could apply to a type of service.",
        "The insurer can confirm the waiting period for the specific service and plan start date.",
    ),
    "claims_process": (
        "claims_process", "other", "claims_process", "resolved",
        "What information is usually useful when asking about a claim status?",
        "Use the insurer's official claim channel and ask which documents or reference details are needed.",
    ),
    "benefit_exclusion": (
        "coverage_benefit_exclusion", "other", "benefit_exclusion", "unresolved",
        "I cannot tell whether a service is excluded from a fictional cover option.",
        "Check the product disclosure and request written confirmation from the insurer for that service.",
    ),
    "cost": (
        "cost_out_of_pocket", "gp", "out_of_pocket_cost", "unknown_not_assessed",
        "How might I find out whether a sample appointment has a gap fee?",
        "Ask the provider and insurer about the expected charge and benefit before booking.",
    ),
    "care_navigation": (
        "care_navigation", "other", "care_navigation", "resolved",
        "I am not sure which kind of service to contact first for a non-urgent question.",
        "A GP or insurer support service can help direct a non-urgent question to the right place.",
    ),
    "provider_search": (
        "provider_search_access", "gp", "provider_access", "unknown_not_assessed",
        "I am looking for a clinic search area in this fictional example.",
        "Use the insurer directory to check participating providers near the search area you choose.",
    ),
    "preventive": (
        "preventive_health_information", "gp", "information_gap", "resolved",
        "Where can I ask a general question about preventive health checks?",
        "A GP or local health service can discuss checks based on personal circumstances.",
    ),
    "unknown": (
        "unknown_unclassified", "unknown", "unknown", "unknown_not_assessed",
        "I have a question but have not shared enough detail to identify its topic.",
        "Could you share a little more about the kind of information you are looking for?",
    ),
}

_STABLE_ISSUES = ("primary_care", "pharmacy", "care_navigation", "provider_search", "preventive")
_ALL_ISSUES = tuple(_ISSUES)


def _location(rng: random.Random) -> tuple[str, str, str]:
    basis = rng.choices(
        ("stated_demo_region", "service_search_area", "unknown"), weights=(5, 3, 2), k=1
    )[0]
    if basis == "unknown":
        return "unknown", basis, ""
    region = rng.choice(REGIONS[:-1])
    if basis == "service_search_area":
        context = f" For this example, the service search area is {region}."
    else:
        context = f" For this example, I state {region} as my demo region."
    return region, basis, context


def scenario_for(seed: int, sequence_no: int, started_at_utc: str) -> Scenario:
    """Return one deterministic scenario with original fictional dialogue.

    Within 2025-01-01 through 2025-03-31, a deterministic subset of scenarios
    form the artificial respiratory spike. Within 2025-10-01 through
    2025-12-31, a deterministic subset form the artificial coverage
    information spike. Remaining scenarios, including controls in those same
    periods, use a stable/control mix with occasional other, unclassified,
    and mixed-topic examples.
    """
    rng = random.Random(f"{seed}:{sequence_no}")
    scenario_date = date.fromisoformat(started_at_utc[:10])
    if date(2025, 1, 1) <= scenario_date < date(2025, 4, 1) and rng.random() < 0.48:
        scenario_code = "respiratory_spike"
        issue_keys = ["respiratory"]
    elif date(2025, 10, 1) <= scenario_date < date(2026, 1, 1) and rng.random() < 0.48:
        scenario_code = "coverage_information_spike"
        issue_keys = [rng.choice(("waiting_period", "claims_process", "benefit_exclusion"))]
    elif sequence_no % 97 == 42:
        scenario_code = "mixed_topic_turn"
        issue_keys = ["primary_care", "pharmacy"]
    else:
        scenario_code = "control_stable"
        issue_keys = [rng.choice(_STABLE_ISSUES if rng.random() < 0.72 else _ALL_ISSUES)]
        if issue_keys[0] == "unknown" or rng.random() < 0.045:
            issue_keys = ["unknown"]
        elif rng.random() < 0.075:
            issue_keys.append(rng.choice(tuple(key for key in _ALL_ISSUES if key != issue_keys[0])))

    region, location_basis, location_context = _location(rng)
    first = _ISSUES[issue_keys[0]]
    second = _ISSUES[issue_keys[1]] if len(issue_keys) > 1 else None
    same_turn_mixed = scenario_code == "mixed_topic_turn"
    messages = (
        DialogueMessage(
            "user",
            first[4] + location_context + (f" Also, {second[4]}" if same_turn_mixed else ""),
        ),
        DialogueMessage(
            "assistant",
            "A GP is a common first contact for a non-urgent concern. For medicine costs, "
            "ask the pharmacist or insurer to check your prescription and plan details; "
            "I cannot confirm your out-of-pocket amount here."
            if same_turn_mixed
            else first[5],
        ),
        DialogueMessage(
            "user",
            "I still need the pharmacist or insurer to check the medicine cost for my plan."
            if same_turn_mixed
            else second[4] if second
            else "Thanks, that gives me a starting point.",
        ),
        DialogueMessage(
            "assistant",
            second[5] if second and not same_turn_mixed else "You are welcome. Check current details with the relevant service.",
        ),
    )
    issue_tags = tuple(
        IssueTag(
            message_index=0 if index == 0 or same_turn_mixed else 2,
            topic_code=issue[0],
            service_code=issue[1],
            concern_code=issue[2],
            answer_outcome=issue[3],
        )
        for index, issue in enumerate((first, second) if second else (first,))
    )
    return Scenario(
        scenario_code=scenario_code,
        started_at_utc=started_at_utc,
        messages=messages,
        issue_tags=issue_tags,
        insurer_id=rng.choice(("demo_insurer_a", "demo_insurer_b", "demo_insurer_c")),
        tier_id=rng.choice(("demo_basic", "demo_standard", "demo_plus")),
        region=region,
        location_basis=location_basis,
    )
