# Response Format — Before / After

Reference spec + manual-QA baseline for the scannable answer template enforced
by `OUTPUT FORMAT` in `src/medibridge/agent/prompts.py`.

**User query:** *"I started OSHC last month. How much will I pay to see a
specialist out of hospital for an initial consult?"*

**Profile:** Allianz — Essentials tier — single — policy start one month ago.
Tool facts: MBS item `104`, schedule fee `$98.55`, OSHC benefit `85%` →
`$83.77`, gap `$14.78`, all-other-Schedule-1 waiting period 2 months → **not
yet served** (1 month elapsed, 1 remaining).

---

## Before (text-dense — current behavior)

> For an initial specialist consultation out of hospital the relevant MBS item
> is 104 which has a schedule fee of $98.55, and under your Allianz Essentials
> cover OSHC pays 85% of the schedule fee which works out to about $83.77 so
> your estimated out-of-pocket gap at the MBS rate would be roughly $14.78,
> though keep in mind the specialist may charge above the schedule fee in which
> case your gap would be higher, and also note that because you only started
> your OSHC policy about a month ago the standard two month waiting period that
> applies to all other Schedule 1 services has not yet been served so you would
> not be able to claim this for roughly another month. Informational only —
> confirm with your insurer.

One run-on paragraph. The student cannot find the gap figure or the waiting-period
status at a glance.

---

## After (restructured — enforced template)

```markdown
## Summary
An initial out-of-hospital specialist consult (MBS item 104) costs about
$14.78 out of pocket — but your 2-month waiting period is not served yet.

## Coverage Breakdown
- **Covered:** OSHC pays 85% of the $98.55 schedule fee = **$83.77**
- **Out-of-pocket:** **$14.78** at MBS rate (more if the specialist bills above schedule)
- **Waiting period:** 2 months — **1 month remaining**, cannot claim yet

## Notes
- Gap shown is at the MBS schedule fee. Specialists often charge above it; your real gap may be higher.
- Waiting period applies because the policy started ~1 month ago.

---
**Key figures**
- `MBS Item: 104`
- `MBS Schedule Fee: $98.55`
- `OSHC Benefit: $83.77`
- `Out-of-Pocket Gap: $14.78`
- `Waiting Period: 1 month remaining`

*Informational only — confirm with your insurer.*
```

Scannable: the answer, the dollar gap, and the waiting-period blocker each have
their own line. The `Key figures` block is a fixed-position lookup. Renders with
headings/rules in the CLI (`rich.markdown`) and the web UI (upgraded
`renderRich()` in `ui/screens/chat.jsx`).
