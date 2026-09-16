"""Eval dataset: agent test cases + idempotent LangSmith upsert.

Each case carries:
  - instructions          : the user message fed to the agent
  - expected_tool_calls   : order-independent SET of tool names the agent
                            should call (subset match — extra calls allowed
                            only if the expected set is covered)
  - reference             : short ground-truth / key facts for the LLM judge

Tool names must match the 6 bound tools in src/medibridge/tools/:
  search_mbs_items, lookup_mbs_item, calculate_oshc_coverage,
  check_waiting_period, query_oshc_rules, search_clinics
"""
from __future__ import annotations

DATASET_NAME = "medibridge-agent-eval"

CASES: list[dict] = [
    # ============================================================ single-tool
    {
        "instructions": "What exactly does MBS item 23 cover and what is its "
        "schedule fee?",
        "expected_tool_calls": ["lookup_mbs_item"],
        "reference": "Item 23 is a standard GP attendance (Level B, < 20 min). "
        "Report its description and the schedule fee returned by the lookup; do "
        "not invent a fee.",
    },
    {
        "instructions": "Find me the MBS item for a knee MRI.",
        "expected_tool_calls": ["search_mbs_items"],
        "reference": "Search MBS for a knee MRI item; return the matching item "
        "number and description from the search result, no fabricated figures.",
    },
    {
        "instructions": "In plain terms, what are the only treatments the OSHC "
        "deed completely excludes?",
        "expected_tool_calls": ["query_oshc_rules"],
        "reference": "Deed Schedule 3 has only 3 exclusions: treatment outside "
        "Australia (unless medical repatriation), compensable injury, and "
        "treatment that is not medically necessary. Must be grounded in the "
        "retrieved deed text.",
    },
    {
        "instructions": "Does OSHC cover ambulance transport, and is there a "
        "waiting period for it?",
        "expected_tool_calls": ["query_oshc_rules"],
        "reference": "Ambulance is covered 100% when medically necessary; "
        "emergency treatment has nil waiting period under the deed. Grounded in "
        "retrieved rules.",
    },
    {
        "instructions": "Can I claim a dental check-up at my local dentist on "
        "OSHC?",
        "expected_tool_calls": ["query_oshc_rules"],
        "reference": "General dental at a dentist is NOT covered by OSHC unless "
        "in-hospital oral surgery by a specialist. Conclusion must rest on "
        "retrieved deed/insurer text.",
    },
    {
        "instructions": "Are prescription glasses from an optometrist covered by "
        "my OSHC?",
        "expected_tool_calls": ["query_oshc_rules"],
        "reference": "Optical (glasses, contacts, optometrist eye test) is NOT "
        "covered by OSHC. Grounded in retrieved rules.",
    },
    {
        "instructions": "I hurt my back at work — will OSHC pay for the "
        "treatment?",
        "expected_tool_calls": ["query_oshc_rules"],
        "reference": "Workplace injury is compensable and excluded by deed "
        "Schedule 3 (workers comp pays). Grounded in retrieved rules.",
    },
    {
        "instructions": "If I fly home to India for surgery, will OSHC reimburse "
        "me?",
        "expected_tool_calls": ["query_oshc_rules"],
        "reference": "Treatment outside Australia is excluded by deed Schedule 3 "
        "unless it is medical repatriation. Grounded in retrieved rules.",
    },
    {
        "instructions": "I'm in suburb South Brisbane — is there a pharmacy near "
        "me?",
        "expected_tool_calls": ["search_clinics"],
        "reference": "Search QLD clinics by suburb South Brisbane filtered to "
        "Pharmacy; Queensland-only dataset, no phone numbers. Return clinics from "
        "the tool result.",
    },
    {
        "instructions": "List me some GP clinics in postcode 4000.",
        "expected_tool_calls": ["search_clinics"],
        "reference": "Search QLD clinics by postcode 4000 filtered to GP; list "
        "names from the tool result, bulk-billing first.",
    },
    {
        "instructions": "Is there a hospital in Cairns I can go to?",
        "expected_tool_calls": ["search_clinics"],
        "reference": "Search QLD clinics by suburb Cairns filtered to Hospital. "
        "QLD-only dataset; if none found, say so rather than inventing.",
    },
    {
        "instructions": "I'm in Sydney — can you find me a GP near postcode "
        "2000?",
        "expected_tool_calls": ["search_clinics"],
        "reference": "Clinic directory is Queensland-only. Tool returns no NSW "
        "results; answer must state coverage is QLD-only and not fabricate a "
        "Sydney clinic.",
    },
    {
        "instructions": "I'm 3 months into my policy and pregnant — is the "
        "pregnancy care covered yet?",
        "expected_tool_calls": ["check_waiting_period"],
        "reference": "Pregnancy has a 12-month waiting period for OSHC held "
        "< 2 years; at 3 months it is NOT served — 9 months remaining.",
    },
    {
        "instructions": "Has the waiting period passed for a standard GP visit if "
        "I just joined last week?",
        "expected_tool_calls": ["check_waiting_period"],
        "reference": "GP / outpatient services in the nil-waiting MBS groups "
        "have no waiting period — claimable immediately even one week in.",
    },
    {
        "instructions": "I had a pre-existing knee condition before joining and "
        "I'm 4 months in — can I get the hospital treatment covered?",
        "expected_tool_calls": ["check_waiting_period"],
        "reference": "Pre-existing condition hospital treatment has a 12-month "
        "waiting period; at 4 months NOT served — 8 months remaining.",
    },

    # ====================================================== cross-tool: cost
    {
        "instructions": "I started my OSHC about one month ago. If I need an MRI "
        "of my knee out of hospital, will I be able to claim it yet and what "
        "would I pay?",
        "expected_tool_calls": [
            "check_waiting_period",
            "search_mbs_items",
            "calculate_oshc_coverage",
        ],
        "reference": "Standard 2-month waiting period for 'all other Schedule 1' "
        "services is NOT served at ~1 month (≈1 month remaining). Quote a knee "
        "MRI MBS item, its schedule fee, the OSHC benefit (85% out-of-hospital "
        "deed min) and out-of-pocket gap — all from tool results — and state the "
        "claim is blocked until the waiting period is served.",
    },
    {
        "instructions": "How much is an initial specialist consultation out of "
        "hospital, and is there a waiting period?",
        "expected_tool_calls": [
            "search_mbs_items",
            "calculate_oshc_coverage",
            "check_waiting_period",
        ],
        "reference": "Use whatever initial specialist consultation item search "
        "returns (e.g. 104/110/132). Out-of-hospital deed minimum is 85% of "
        "schedule fee; report the benefit, gap and the applicable 2-month "
        "waiting period from tool results. Exact item number is not graded — "
        "the % , gap logic and waiting period are.",
    },
    {
        "instructions": "Find me a bulk-billing GP in postcode 4000 and tell me "
        "whether a standard GP consult will cost me anything.",
        "expected_tool_calls": [
            "search_clinics",
            "search_mbs_items",
            "calculate_oshc_coverage",
        ],
        "reference": "List Queensland 4000 GP clinics (bulk-billing first). Use "
        "whatever standard GP attendance item search returns (e.g. 3/23/36/44). "
        "KEY FACT: a bulk-billing clinic charges the patient $0 — the answer must "
        "NOT report a non-zero gap for the bulk-billing clinic it found. An "
        "on-topic answer covering both the clinic and the $0 cost is correct.",
    },
    {
        "instructions": "What would a standard GP visit cost me out of hospital "
        "on OSHC?",
        "expected_tool_calls": ["search_mbs_items", "calculate_oshc_coverage"],
        "reference": "Use whatever standard GP attendance item search returns "
        "(e.g. 3/23/36/44). Out-of-hospital OSHC benefit is the deed-minimum 85% "
        "of schedule fee; report benefit and gap from the coverage tool. Exact "
        "item number is not graded — the 85% logic and gap are.",
    },
    {
        "instructions": "If I have a gallbladder removal as an in-hospital "
        "procedure, how much does OSHC cover?",
        "expected_tool_calls": ["search_mbs_items", "calculate_oshc_coverage"],
        "reference": "In-hospital medical is covered at 100% of the MBS schedule "
        "fee. Find the cholecystectomy item via search, then report 100% benefit "
        "and ~$0 gap at MBS rate from the coverage tool.",
    },
    {
        "instructions": "I need a chest X-ray out of hospital. What's covered?",
        "expected_tool_calls": ["search_mbs_items", "calculate_oshc_coverage"],
        "reference": "Find the chest X-ray MBS item via search; out-of-hospital "
        "benefit is the deed-minimum 85% of schedule fee. Report benefit and gap "
        "from tool results.",
    },

    # =============================================== negative / tool-grounded
    {
        "instructions": "How much will OSHC pay toward a cosmetic rhinoplasty?",
        "expected_tool_calls": ["search_mbs_items", "calculate_oshc_coverage"],
        "reference": "Cosmetic surgery is excluded (not medically necessary). "
        "Coverage tool returns is_covered=False; out-of-pocket = full cost, "
        "never $0 gap. Conclusion must come from the tool result.",
    },
    {
        "instructions": "Will OSHC cover IVF treatment for me?",
        "expected_tool_calls": ["search_mbs_items", "calculate_oshc_coverage"],
        "reference": "IVF / assisted reproduction is an insurer exclusion. "
        "Coverage tool returns is_covered=False with the exclusion reason; report "
        "that, not a $0 gap.",
    },
    {
        "instructions": "Can I claim physiotherapy at a private physio clinic?",
        "expected_tool_calls": ["query_oshc_rules"],
        "reference": "Allied health (physio) at a private clinic is NOT covered "
        "unless MBS-listed (e.g. EPC plan items). Conclusion grounded in "
        "retrieved rules.",
    },

    # ============================================================ edge cases
    {
        "instructions": "How much will OSHC pay for the anaesthesia during my "
        "in-hospital surgery?",
        "expected_tool_calls": ["search_mbs_items", "calculate_oshc_coverage"],
        "reference": "Anaesthesia items (benefit_type='A') are time-based "
        "estimates. Coverage tool returns a time-based estimate plus a warning "
        "in notes — the answer MUST surface that anaesthesia cost is an estimate "
        "and not a fixed figure.",
    },
    {
        "instructions": "What does OSHC pay for a derived-fee surgical item — "
        "give me the exact dollar amount.",
        "expected_tool_calls": ["search_mbs_items", "calculate_oshc_coverage"],
        "reference": "Derived-fee items (fee_type='D') cannot be auto-calculated. "
        "Answer must say the figure is N/A — derived fee, and must NOT invent a "
        "dollar amount.",
    },
    {
        "instructions": "How much do I pay for prescription medicines under "
        "OSHC?",
        "expected_tool_calls": ["query_oshc_rules"],
        "reference": "Pharmaceuticals: student pays the PBS co-payment excess; "
        "OSHC benefit is capped (up to $50/item, $500 single / $1000 family "
        "annual cap, insurer-specific). Figures must come from retrieved rules.",
    },
    {
        "instructions": "Is emergency treatment in a public hospital covered, and "
        "is there any waiting period?",
        "expected_tool_calls": ["query_oshc_rules"],
        "reference": "Public hospital is covered at 100% of charges; emergency "
        "treatment has nil waiting period. Grounded in retrieved rules.",
    },
]


def upsert_dataset(client) -> str:
    """Create or refresh the LangSmith dataset. Idempotent.

    Returns the dataset id. Existing examples are cleared then re-added so
    re-runs never duplicate rows.
    """
    if client.has_dataset(dataset_name=DATASET_NAME):
        ds = client.read_dataset(dataset_name=DATASET_NAME)
        for ex in client.list_examples(dataset_id=ds.id):
            client.delete_example(example_id=ex.id)
    else:
        ds = client.create_dataset(
            dataset_name=DATASET_NAME,
            description="MediBridge agent: tool-selection + faithfulness + "
            "relevance eval cases (incl. cross-tool scenarios).",
        )

    client.create_examples(
        dataset_id=ds.id,
        inputs=[{"instructions": c["instructions"]} for c in CASES],
        outputs=[
            {
                "expected_tool_calls": c["expected_tool_calls"],
                "reference": c["reference"],
            }
            for c in CASES
        ],
    )
    return str(ds.id)
