---
name: publish-finding
description: Turn an analysis result into an investor-grade, verified finding ready for the site or a brief. Enforces query-traceable numbers, the right limitation caveat, and dual-audience review before it ships. Use when writing up any data finding.
---

# Publish a finding

A finding is not "an interesting number" — it is a claim an investor would act on,
backed by a reproducible query and qualified by the corpus's limits. Follow these
steps.

## 1. State the claim
One sentence, decision-relevant. Prefer the framings that move an investor:
momentum, conviction, co-investor behaviour, cap-table signal, mortality,
concentration. A generic programme description is not a finding.

## 2. Attach the exact query
Write the `sqlite3 db.sqlite` query that produces the number, against the views
(`v_events`, `v_european_companies`, `v_company_funding_layers`) — not raw tables.
The query travels with the finding so anyone can reproduce it.

## 3. Apply the limitation caveat
Identify which of the four headline limitations bites this claim and state it:
- floor not total (limitation #3),
- coverage-tier caveat for any cross-country comparison (#2),
- no cross-family sums without an "indicative only" label (#4),
- no implication of absence for the invisible channels (#1).
Reference `docs/methodology.md` by section.

## 4. Verify
Invoke `stat-verifier` on the claim + query. Resolve every DISCREPANCY before
moving on. Never publish a number it could not reproduce.

## 5. Audience review
Invoke `investor-lens` (always) and `founder-lens` (if the finding is
company-facing) — or just run `/ship-review`. Apply the must-fix items.

## 6. Record
If the finding changes the corpus's interpretation or a headline stat, add a note
to `docs/decision_log.md` and update the memory index.

A finding that survives steps 2–5 is investor-grade. One that skips them is a
liability.
