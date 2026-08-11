# Capital routing for /for-companies — design note

**Status:** spec / partially actioned (agent rubric augmented; form + filter not built)
**Date:** 2026-06-28
**Owner:** Asger

## Why

The `/for-companies` memo today routes on **sector** (the two-tier `sector_top` /
`subsector` taxonomy) plus the founder's traced footprint. A live edtech advisory
session exposed the gap: the entire funding answer flipped four times on a question
that has nothing to do with sector — *"is this a deep-tech breakthrough or an
application layer on existing models?"* Same sector (edtech), opposite maps. The
EIC Accelerator went from "first instrument everyone reaches for" to "park it" on
that one axis.

The lesson: **eligibility routing needs two axes the data model lacks, and both are
orthogonal to sector** —

1. **Company archetype / R&D intensity** — deep-tech breakthrough vs applied
   innovation vs application-layer software. Gates EIC, CIR/research credits, the
   deep-tech routes.
2. **Capital type sought** — the founder's own preference over grant / recoverable
   advance / loan & guarantee / equity & blended / tax credit, plus a dilution
   tolerance. "Preferably non-dilutive" silently kills half a shortlist and turns
   EIC's blended path from a feature into a cost.

A third, output-side lesson: **the framing register a proposal needs is
instrument-specific**, not one answer. The same facts get dressed four ways —
hyper-commercial (EIC jury), public-purpose (Horizon / Digital Europe / Erasmus,
write to the rubric), banker (national dev-bank loans, repayment + cashflow),
audit-grade (CIR / state aid, scientific-uncertainty file). A memo that tells a
founder *which register each door wants* is differentiated and sellable.

## The three pieces of work

### 1. Company type — free text + ⓘ guidance (NOT a dropdown)

Keep it free text so it fits any company; the pipeline LLM already consumes free
text. Add a field beside Sector in [panel.tsx](../../website/frontend/lib/intelligence/panel.tsx),
with a persistent info circle whose tooltip forces the deep-tech-vs-application-layer
self-assessment:

> **Company type** ⓘ — "How would a funder classify you? This shifts which doors
> fit. e.g. *deep-tech breakthrough* (novel science/hardware, real technical risk) ·
> *applied innovation* (new product, existing tech) · *application-layer software /
> platform* · *services*. Be honest: 'AI on top of existing models' opens very
> different funding than 'we train our own.'"

Plumb a new `companyType` field through `IntelligenceRequest` → `discoverAndResearch`
and `synthesize` context blocks.

### 2. Capital sought — multi-select chips + "All"

Chip/checkbox group, any combination, with a "Show me everything" shortcut:

- Grants (non-dilutive, no payback)
- Loans & guarantees (debt, repayable, no equity)
- Recoverable advances (repay only if it works)
- Equity & blended finance (capital for a stake — dilutive)
- Tax credits & reliefs (R&D credits, payroll relief)
- Show me everything *(selects all)*

Used two ways: a **hard filter** (drop instruments whose capital type isn't selected)
and a **ranking signal** (non-dilutive-only demotes EIC's blended path and surfaces
the trade-off). Requires a `capitalType` tag per instrument — see piece 3B.

### 3. Per-instrument framing + capital-type tags — augment the fund docs

Each of the 12 [fund-processes/](../../website/frontend/fund-processes/) docs already
has `## At a glance` (drives the comparison table). Add:

- **3A. `Capital type:` line in `## At a glance`** so piece 2's filter has something
  to match (e.g. `Grant (non-dilutive) + optional equity (dilutive) — "blended"`).
- **3B. A `## How to frame your case` section** — the register (hyper-commercial /
  public-purpose / banker / audit-grade) + the 2–3 documents that door demands. Needs
  per-instrument research; augment where a doc half-covers it (EIC's
  `What evaluators weight` folds in).

## What was actioned now

- The on-site memo agent's instruction file, then at
  `website/frontend/fund-processes/_agent_instructions` (since deleted from the tree),
  was augmented so the on-site memo agent already reasons about archetype, capital-type
  fit / dilution, and per-instrument framing register **from the free-text
  description**, ahead of the form fields existing.

## Carry-overs (not built)

- Two form fields in panel.tsx + plumb `companyType` / `capitalSought` through
  the API and pipeline context.
- The capital-type filter + dilution-aware ranking in `buildInstrumentTable`.
- The `Capital type:` and `## How to frame your case` content pass across all 12
  fund docs (the research-heavy bit). Lead with this; everything else surfaces it.

Related memory: `project_memo_rework`, `project_taxonomy_reclassification`.
