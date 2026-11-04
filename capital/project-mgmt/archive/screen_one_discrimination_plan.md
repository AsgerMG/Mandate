# Why exact-scheme recall is stuck at 23%, and the one lever left

Written 2026-08-05, after measuring three candidate levers to exhaustion rather
than arguing about them. Every number here is from a harness in the repo and is
reproducible.

## The state, measured

```
                        screen one    after adaptive round
in pool                    94-98%
EXACT scheme in top 5        23%             22%
same REGIME in top 5         73-77%          70%

profile mode (84% of corpus)  exact 13%   regime 76%
project mode (16%)            exact 67%   regime 81%
```

The regime is right roughly three times in four; the specific scheme is right
roughly once in four. **57 of 67 ranking misses showed a SIBLING of the won
fund instead of it.** That is the whole problem, stated precisely: we find the
right door and pick the wrong room behind it.

## Three levers, all measured, two of them dead

### 1. Corpus enrichment -- DEAD for ranking

241 schemes gained verbatim eligibility text and a source URL (from zero).
Profiles grew 909 -> 1,175 chars. All 1,014 re-embedded.
**EXACT@5: 23% -> 23%.**

Not a coverage miss: 102 of the 173 instruments in the holdout set carry the
new text. It reaches the ranker and does not separate siblings.

What it DID buy, and this is real: 259 application URLs where there were none,
241 citable verbatim texts, and 1,536 per-scheme gates. The memo can now name a
scheme's own rule and link its actual next step. That is product value; it is
not ranking value.

### 2. The adaptive round -- DEAD for ranking

`scripts/measure_funnel_recall.ts` (new, model-free) runs the real funnel.
**EXACT@5: 23% -> 22%. 0 promoted into the five, 1 demoted.**

First hypothesis was reach: the pool averages 57 funds, the round asks about 5,
and the won fund is among those 5 only 12.5% of the time. But raising the limit
5 -> 15 -> 30 still gives 1 promoted / 2 demoted and flat recall.

The real reason is effect size. In `ease.ts`, `resolved` is one component
beside comparable-count, blocked-status and country-match, divided by
(total gates + shrinkage). Answering one or two of a fund's gates is noise.

### 3. Gate-fit ranking -- DEAD as currently measurable

The obvious next idea: rank on how well a fund's own filter gates match the
founder's answers. 85% of the 1,279 new filter gates carry a usable
`intake_field`. Probed on 46 holdout replays:

```
WON fund : mean 3.0 gates checked, 62% pass rate, 0 conclusively failed
POOL avg : mean 3.2 gates checked, 63% pass rate, 0 of 2,666 failed
```

**The won fund is statistically indistinguishable from the pool.** Ranking on
this would add noise. Two causes, and the second is the important one:

- Gates almost never conclusively fail (0 of 2,666 `not_met`), so there is no
  negative signal to rank on.
- **The harness feeds a UNIFORM eligibility profile** -- same ticketBand,
  consortium, borrowerModel for every company -- because the recall set carries
  only name/country/sector/description. With identical answers, every fund's
  gates evaluate identically no matter which company is replayed.

## The finding under the findings

**Screen one collects too little company-specific information to separate 57
candidates.** Country, sector and a free-text description are shared by every
sibling under a regime, so no amount of ranking cleverness on those inputs can
choose between them. That is why all three levers measured flat.

It also means most intake-driven changes are currently UNMEASURABLE: the ground
truth has no per-company intake attributes to vary.

Checked whether we could derive them. `companies` holds id, name, country,
city, postal_code, website, sector, subsector, entity_type -- and **no
employee count, no turnover, no balance sheet, no founding year.** So
`fteBand`, `turnoverBand`, `balanceBand`, `foundedYear` cannot be recovered
from our corpus at all. Those gates can be asked of a real founder but can
never be tested against ground truth here.

## The one lever left: sub-national REGION

It is the only discriminator that satisfies all four conditions at once.

1. **It differs between siblings.** SA.111723 alone spans 14 French *régions*,
   each running its own dispositif with its own eligibility. SA.58995 spans 9.
   Region is precisely what separates schemes that share a notified framework.
2. **It is already encoded on the fund side.** 149 instruments carry genuine
   NUTS-coded, machine-evaluable sub-national gates ("Located in Regiao Centro
   (NUTS II), Portugal"), plus a wider set of prose region rules.
3. **Screen one does not ask for it.** Verified: no sub-national location field
   exists in the intake vocabulary. We ask which COUNTRY, never where in it.
4. **A founder can answer it instantly** -- unlike turnover band or GBER
   article, their own address is not work to recall.

And it is partially measurable: 322 of 1,887 recall-set companies carry a
`city` in the corpus (17%). Thin, but a real per-company signal that VARIES,
which is exactly what the uniform-profile problem lacks.

## Plan

**Phase 1 -- make it measurable before changing any ranking.**
Derive a region for the 322 recall-set companies that have a city, and extend
the harness to pass it. Without this, Phase 2 cannot be evaluated and would be
another unfalsifiable weight change. If region coverage proves too thin to
separate anything, that is a finding and Phase 2 does not ship.

**Phase 2 -- ask for it, then use it.**
Add a sub-national region question to screen one (optional, defaulting to "not
sure" so nothing regresses for founders who skip it), and let a declared region
that CONFLICTS with a fund's NUTS gate demote that fund. Demote, not eliminate:
region prose is uneven and a wrong hard-exclusion silently removes a real door.

**Phase 3 -- re-measure honestly, on the subset that has region data.**
Report exact-scheme recall for the 322-company subset separately from the whole
set. A gain that only exists where region is known should be reported as such.

## What this plan refuses

- Ranking on gate-fit while intake answers are uniform. Measured as noise.
- Any further corpus fetching aimed at ranking. Two independent measurements
  now say the constraint is the QUERY, not the corpus.
- Claiming a 95% path exists before Phase 1 shows region can separate anything.
  The honest position is that 95% exact-scheme has no demonstrated route yet,
  and regime-level (73-77%) is what the current inputs support.

---

## Phase 1 RESULT: the region lever fails its own gate (2026-08-05)

The plan said: *"If region coverage proves too thin to separate anything, that
is a finding and Phase 2 does not ship."* It is, and it does not.

**The gap is real and worth recording.** `region` is a declared field in
`types.ts`, and 142 gates across 149 instruments carry an evaluable
`value_spec` against it -- `{"op":"region_within","field":"region","allowed":
["AT12"]}`. But `region` is NOT in the intake vocabulary, so the founder is
never asked, the field is always empty, and all 142 of those gates silently
never fire. The system was built to use sub-national region and never wired
the question up.

**Three candidate sources for a testable founder region, all rejected:**

1. `companies.city` -- present on only 322 of 1,887 recall-set companies (17%).
   Intersecting with "won fund has a region gate" leaves **20 pairs**. At n=20,
   binomial noise is about +/-10 points, which cannot distinguish a real gain
   from luck.

2. `satr_staging.region` -- populated on 122,814 award rows, 1,182 distinct
   values, and it looked like the unblock: 82% coverage, 459 pairs with both a
   region and a region-gated won fund. **Rejected as leaky and unreliable.**
   For 1,010 companies the ONLY source is the won award itself -- and for a
   regional scheme the award's region IS the scheme's region by construction,
   which is the same circularity as the project-title leak that once read 90%
   recall and was really 10%. Worse, where region CAN be derived from a
   different scheme's award (624 companies), it agrees with the won-award
   region only **56%** of the time. A genuine company address would agree
   ~100%. So SATR's `region` is substantially a property of the SCHEME, not of
   the recipient, and is not a usable proxy for where a founder sits.

3. `companies` size/financial fields -- do not exist. No employee count, no
   turnover, no balance sheet, no founding year. `fteBand`, `turnoverBand`,
   `balanceBand` and `foundedYear` gates can be asked of a real founder but can
   never be tested against this ground truth.

## Where that leaves the 95% target

Four levers are now measured rather than assumed, and all four are closed:

```
corpus enrichment      EXACT 23% -> 23%
adaptive round         EXACT 23% -> 22%,  0 promoted at any question limit
gate-fit ranking       won fund 62% pass vs pool 63% -- indistinguishable
sub-national region    unmeasurable: no leak-free founder-region source
```

**The honest position: exact-scheme 95% has no demonstrated route with the
inputs we can currently obtain or test.** The constraint is not the corpus,
not the ranker, and not the adaptive round -- it is that screen one knows
country, sector and a free-text description, and every sibling under a regime
shares all three.

Two things follow, and they are for the PM to choose between rather than for
this document to assume:

- **Ship the region question anyway, untested.** It is cheap, a founder can
  answer it instantly, 142 encoded gates would start firing, and it is the one
  input that genuinely differs between siblings (SA.111723 spans 14 French
  regions). The cost is that we could not prove its effect before shipping and
  would be measuring in production.
- **Re-target on regime-level.** 73-77% today, and that IS what the available
  inputs support. Exact-scheme would be reported as a secondary number.

What should NOT happen is another weight change presented as progress. Three
of the four levers above were tried on the assumption they would work; each
took real time and each measured flat.
