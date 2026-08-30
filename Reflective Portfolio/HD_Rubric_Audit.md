# HD Rubric Audit — IFN735 Reflective Portfolio (Team 38, MediBridge)

**Audit target:** `Reflective_Portfolio_Final_Draft.md`
**Auditor reference:** Assessment 3 CRA — High Distinction descriptor (10 to >8.5 pts per entry).

---

## 1. Structural Compliance (Task Brief)

| Requirement | R1 | R2 | R3 | Status |
|---|---|---|---|---|
| Word count 600–800 | 779 | 794 | 682 | All ✓ |
| DIEP four-paragraph structure with explicit labels | ✓ | ✓ | ✓ | ✓ |
| First-person voice | ✓ | ✓ | ✓ | ✓ |
| Anchored on a critical incident | Mentor scope contraction | Gap Cost NULL bug + LangSmith pivot + UX-feedback pivot | Gemini citation-failure incident + stateless-API decision | ✓ |
| Markdown formatting | ✓ | ✓ | ✓ | ✓ |

---

## 2. High Distinction Criteria — Per-Reflection Mapping

### Reflection 1 — Mid-Stage: Strategic Technical Leadership

| HD Criterion | Evidence in R1 | Verdict |
|---|---|---|
| **Insightful description (deep understanding)** | Names the specific features consolidated (wait-time prediction, 5-language support, mental-health triage, Pinecone, multi-cloud); names the three retained pillars; names the mentors; specifies "Australian-based international students + defined subset of OSHC insurers"; describes scope-section rewrite of the PER. | HD ✓ |
| **Thoughtful interpretation (multiple perspectives)** | Explicit cognitive-dissonance framing: breadth-as-ambition vs breadth-as-risk; instinct-to-protect-creative-range vs obligation-to-ship-verifiable; positive reframe ("dissipated vagueness"). | HD ✓ |
| **Rigorous evaluation (challenges, outcomes, growth)** | Tuckman framework applied (forming → norming compression); MoSCoW + Definition-of-Done link; risk-register tie-in (Scope Creep Medium/Medium); honest limitation that HD self-grade was unsubstantiated by velocity data. | HD ✓ |
| **Connections to broader contexts (industry/academic theory)** | Tuckman's stages of group development; Scrum MoSCoW; *Scrum Guide* 2020 (commitment vs forecast); Marty Cagan's product-discovery framing; agile literature on early restraint. | HD ✓ |
| **Strategic foresight in suggestions** | Three concrete commitments: (1) deliberate scope-contraction session before Sprint 1 closes, (2) story-point velocity + written AI-accuracy-aware DoD from Sprint 1, (3) Cagan + *Scrum Guide* 2020 study. | HD ✓ |
| **Suggested-prompt coverage** | Contribution to project start ✓; early stakeholder-engagement challenges ✓; learning about role/communication/expectations ✓; self-grade ✓ (explicitly named as HD-claim, then metacognitively critiqued). | All four ✓ |

**Verdict: HD-ready.**

---

### Reflection 2 — Late-Stage: Technical Execution and Systems Integration

| HD Criterion | Evidence in R2 | Verdict |
|---|---|---|
| **Insightful description** | Names exact SQLite tables (`mbs_items`, `insurer_tiers`, `oshc_coverage_rules`, `clinics`); FTS5 indexes; ChromaDB; LangGraph ReAct loop; all six tools enumerated by name; RRF 60/40 vector–FTS5 weighting; FastAPI-mounted PWA; CLI demo; NULL/exact-charge bug specifics; cites OSHC Deed Clause 3.6(d). | HD ✓ |
| **Thoughtful interpretation** | Schön's reflection-in-action vs reflection-on-action mapped onto NULL-bug vs LangSmith-harness; leader-to-builder identity inversion as an analytical lever; "it works on my machine" vs "prove it works" reframe. | HD ✓ |
| **Rigorous evaluation** | Separation of Concerns + dual-store discipline as named strengths; technical-debt isolation argument; **honest naming of the limitation** that the LangSmith harness is unfinished and reliability is "asserted, not proven"; under-tested edge cases (anaesthesia time-based, derived-fee) called out. | HD ✓ |
| **Connections to broader contexts** | Schön's reflective practitioner; Separation of Concerns as a software-engineering principle; Nielsen's recognition-over-recall usability heuristic (1994); Huyen's *Designing Machine Learning Systems*; Ng's recent LLM-eval essays; promptfoo / DeepEval / LangSmith production-trace tooling as a forward-learning path. | HD ✓ |
| **Strategic foresight** | Quantified targets: hallucination rate <5%, tool-selection accuracy >90%, p95 latency <3s, regression-suite gating prompt/tool changes. Plus edge-case checklist into DoD and contract-first API discipline as defaults. | HD ✓ |
| **Suggested-prompt coverage** | Role evolution (Scrum Master → full-stack dev + integrator) ✓; feedback received and acted on (stakeholder "define metrics" → LangSmith harness; mentor demo response → integration push) ✓; stakeholder-expectation management (CLI demo, integrated PWA reveal) ✓. | All three ✓ |

**Verdict: HD-ready. The intellectual honesty about LangSmith being incomplete is a strength under the HD rubric — "insightful understanding of challenges" — not a weakness.**

---

### Reflection 3 — AI Stewardship: Critical, Ethical Innovation

| HD Criterion | Evidence in R3 | Verdict |
|---|---|---|
| **Insightful description** | All three AI tools named with their distinct roles (Gemini Deep Research, NotebookLLM, Claude); critical incident specified (Gemini citation/explanation failure → pivot to deeper-reasoning workflow + manual primary-source verification against MBS XML, OSHC Deed PDF, DoH fact sheets, six insurer files); joint Tanvir-Abhay architectural proposal with tutor confirmation; two agent-level guardrails identified (per-response verification disclaimer; no-medical-advice constraint); verbal AI disclosure to mentor named. | HD ✓ |
| **Thoughtful interpretation** | Capability vs trustworthiness distinction; auditability over fluency; privacy-by-design vs privacy-by-promise; refusal-behaviour as part of system specification, not afterthought. | HD ✓ |
| **Rigorous evaluation** | Strengths (source verification, data minimisation) + honest trade-offs (lost personalisation, no cross-session memory, verbal-only disclosure); explicitly maps to APP 3 (collection limitation), APP 5 (notification), APP 11 (security); names "the same triad MediBridge already practised informally: verification, minimisation, and disclosure". | HD ✓ |
| **Connections to broader contexts** | Australian Privacy Principles 3/5/11 (explicit clause-level mapping); EU AI Act transparency obligations; NIST AI Risk Management Framework; ISO/IEC 42001; Anthropic usage guidance; AI safety / alignment literature on refusal-as-spec. | HD ✓ (densest of the three) |
| **Strategic foresight** | (1) Written AI-Use Statement enumerating tools, tasks, verification protocol, oversight points; (2) primary-source-or-nothing rule + structured prompt-and-source log; (3) refusal-behaviour as a first-class testable property in the LangSmith eval suite — *threading R2's eval roadmap directly into R3's ethical practice*. | HD ✓ |
| **Suggested-prompt coverage** | What AI was used for and why ✓; how AI helped or hindered ✓; how outputs were verified (primary sources, citation audit) ✓; ethical/professional issues considered (APP, TGA-adjacent no-medical-advice line, data minimisation) ✓; transparency to industry partner ✓ (disclosed verbally; gap acknowledged; written statement committed). | All five ✓ |

**Verdict: HD-ready, and arguably the strongest of the three on the "broader contexts" criterion.**

---

## 3. Cross-Portfolio Cohesion (Holistic HD Argument)

The three reflections form a single professional-growth thesis rather than three isolated essays:

| Phase | Identity claim | Theoretical lens | Critical incident |
|---|---|---|---|
| Mid-Stage (R1) | Strategic leader | Tuckman + MoSCoW | Mentor-led scope contraction |
| Late-Stage (R2) | Technical executor + integrator | Schön + Separation of Concerns | Gap Cost NULL bug + LangSmith pivot |
| AI Use (R3) | Ethical steward | APP 3/5/11 + AI alignment + NIST/EU AI Act | Gemini citation failure + stateless-API decision |

**Thread continuity:** R2's incomplete LangSmith harness re-appears in R3's plan as the eval target for refusal behaviour — this is the kind of cross-reflection threading that signals "exceptional level of critical thinking" rather than three separate competent essays. The unifying arc — *strategic-leader → technical-executor → ethical-steward* — is signalled in the section titles and built up cumulatively in the prose.

---

## 4. Risk Flags & Optional Tightenings

The portfolio is HD-ready as it stands. The items below are **optional polish**, not blockers.

| # | Item | Risk Level | Recommended Action |
|---|---|---|---|
| 1 | R1's self-grade is reframed as "HD-claim that was unsubstantiated by velocity data" rather than a plain HD/D/C/P answer. The original task prompt asks for a direct grade. | Low | The current framing is *more* sophisticated than a plain grade and showcases metacognition. Leave as is unless the tutor's marking guide prefers a direct one-letter answer — in which case prepend one explicit sentence: "I would grade my mid-stage performance HD on leadership decisiveness, Credit on process rigour." |
| 2 | No APA reference list at the end of the document. | Low–Medium | The task brief does not explicitly require references for a reflective journal, but the unit's broader academic convention may. Confirm with Lakmali. If required, add a short APA reference list for: Tuckman (1965), Schön (1983), the *Scrum Guide* (2020), Cagan (2018), Huyen (2022), NIST AI RMF (2023), ISO/IEC 42001:2023, the Australian Privacy Principles, and the EU AI Act. |
| 3 | LangSmith harness honestly described as "under development". | Very Low | This is intellectual honesty — exactly the "insightful understanding of challenges" the HD descriptor rewards. Keep as is. If the harness is completed before submission, swap two sentences in R2 (Evaluate + Plan) to reflect realised metrics. |
| 4 | Verbal-only AI disclosure to mentor. | Low | R3 already names this as a limitation *and* commits to a written AI-Use Statement. If you want to convert plan to evidence, draft a one-page AI-Use Statement and attach it to your final deliverable submission. |
| 5 | No appendix visual mapping reflections to sprint timeline. | Optional | Not required by the rubric. Add only if you have appendix space *outside* the word count. |

---

## 5. Final HD-Readiness Verdict

| Reflection | Structural | Description | Interpretation | Evaluation | Broader Context | Foresight | Verdict |
|---|---|---|---|---|---|---|---|
| R1 — Mid-Stage | ✓ | HD | HD | HD | HD | HD | **HD-ready** |
| R2 — Late-Stage | ✓ | HD | HD | HD | HD | HD | **HD-ready** |
| R3 — AI Use | ✓ | HD | HD | HD | HD (strongest) | HD | **HD-ready** |

**Projected band: 9.0–9.5 / 10 per entry under the CRA's HD descriptor (10 to >8.5 pts).**

The portfolio meets every HD criterion in every entry, threads a coherent professional-growth narrative across the three pieces, and demonstrates the "deep understanding and strategic foresight" the top-band rubric language explicitly rewards.
