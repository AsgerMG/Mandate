# Workstream L-REGION — which region each delivery body actually serves

Raising coverage of the geography fields (`delivery_region`, `delivery_region_share`,
`recipient_region_mix`, `administering_body`, `administering_body_share`,
`scheme_operators`) on the 797 leaves of the 53 multi-leaf regimes.

Scoreboard: `npx tsx website/frontend/scripts/measure_sibling_coverage.ts`.

**Not a ranking signal.** Region was measured out as a ranker input (13.7% at regime
width, identical to popularity). This workstream populates the underlying FACT so a
collapsed row can honestly say "delivered through one of these bodies depending on
where you are". Coverage job, not scoring job.

---

## Batch 0 — the early diagnosis (the question that decides collection vs repair)

The brief asked whether `administering_body`, present on 80% of leaves but uniquely
identifying only 15%, is *inherited from the regime* or is *the real granting body
that simply does not discriminate*. The answer is neither, uniformly. The 797 leaves
are three populations that need three different answers, and the aggregate 15% is an
average over them that describes none of them.

Splitting the 53 regimes by how `administering_body` behaves across their own leaves:

| class | regimes | leaves | mean class guessing | after body | uniq | after body+region | uniq |
|---|---|---|---|---|---|---|---|
| A — body ABSENT on every leaf | 12 | 85 | 10.1 | 10.1 | 0% | 10.1 | 0% |
| B — body CONSTANT across the regime | 15 | 158 | 53.0 | 51.3 | 8% | 51.3 | 9% |
| C — body VARIES across the regime | 26 | 554 | 52.7 | **12.1** | 19% | **11.6** | **25%** |

Read across, that says:

- **It is not inheritance.** Only 141 of 747 child leaves carry a body string equal to
  their parent's. Where the body varies (class C, 554 leaves, 70% of the corpus) it is
  the real granting body and it is doing most of the work already available: 52.7 → 12.1.
  There is nothing to repair there. The job is **collection**.
- **Class B is not a defect and must not be "fixed".** ADEME (76 leaves, one body),
  Vinnova (50 leaves, one body), Innovationsfonden. The body really is constant, because
  these regimes are one national agency running many *thematic calls*. Geography cannot
  separate them and adding a region would be inventing a regional claim where the
  programme makes none. **158 leaves are out of scope for this workstream by fact, not
  by effort.** Chasing them would look like coverage and would be a lie.
- **Class A is the EU tier** — IPCEI, Horizon Pillar II, Horizon partnerships, EIT and
  its KICs, EIC, Chips JU, EDF, Innovation Fund, Innovate UK. No body, no region, 85
  leaves. These are pan-European by construction; the honest value is "no regional
  claim", which is what NULL already means.

So the addressable population for geography is **class C, and inside it the leaves that
lack a region**: 554 − 231 = **323 leaves**.

### The second, larger finding: all existing geography is SATR, and it is MEASURED

| source | leaves | delivery_region | recipient_region_mix | scheme_operators |
|---|---|---|---|---|
| SATR leaves | 485 | 232 | 450 | 346 |
| every other leaf | 312 | **0** | **0** | **0** |

Every one of the 232 populated regions comes from `staged_region_mix()` in
`ETL/lib/nuts_regions.py` — the most specific NUTS prefix covering ≥60% of a leaf's own
*awards*. That is a **measured footprint**, evidence about where money has landed. The
brief's distinction is therefore not hypothetical: the column named `delivery_region`
today holds a measured claim, and `024_delivery_region.sql` is explicit that it is "a
PROGRAMME FACT, never a filter". Anything I add from a programme's own published
catchment is a **declared** claim — a rule, not a history — and the two must be
distinguishable in the row, not silently merged into one column.

Consequence for the plan: the 312 non-SATR leaves have no geography of any kind and no
award-footprint route to one, because they are not in `satr_staging`. For them the only
honest source is the **declared** catchment from the programme's own publication.

## Plan that follows from the diagnosis

1. Do not touch class B (158) or class A (85). Record why; that is the finding.
2. Class C, missing body: 64 Spain BDNS leaves carry no `administering_body` at all
   while their siblings do — regional agencies, the exact geography case. Repair.
3. Class C, missing region: collect **declared** catchment, kept distinct from the
   measured footprint already in `delivery_region`.
