# Workstream L-NO-EU — eligibility coverage for Norway and the EU-level instruments

Branch `workstream-l-no-eu`. Scope: `funding_instruments` rows with `country IN ('NO','EU')`
only. 141 instruments, both populations at 0% `eligibility_text` coverage at start.

Scoreboard: `npx tsx website/frontend/scripts/measure_sibling_coverage.ts`.
Baseline (2026-08-06, commit d9fed89):

```
multi-leaf regimes 53, holding 797 leaves
ALL THREE J OMITTED   mean class 18.0   uniquely identified 36%
eligibility_text over 40 chars: 240 of 1014      NO 0/74 0%    EU 0/67 0%
```

---

## FINDING 1 (before spending a single fetch) — Norway cannot pay on this scoreboard

**73 of Norway's 74 instruments are singleton regimes.** They have no siblings, so there is
nothing for eligibility text to distinguish them *from*. Exactly one NO row sits in a
multi-leaf regime (`innovation_fund`).

Oracle simulation — give every NO leaf a perfectly distinct eligibility text, for free:

```
ALL THREE (today)                          mean class 18.0   unique 35.6%
+ perfect distinct text for EVERY NO leaf  mean class 18.0   unique 35.8%
```

Mean sibling class does not move. Not "moves a little" — the leaf-weighted mean is
unchanged to one decimal, and unique-ID gains 0.2pp, which is the single `innovation_fund`
row. **No amount of Norwegian fetching can move the sibling metric.** Norwegian coverage
is worth something for the memo (citable text, application URLs for a founder who lands on
a Norwegian instrument) but it must not be sold as sibling separation, and it must not be
prioritised over EU on this scoreboard.

The brief anticipated this risk for EU and asked us to say it plainly and early if it
landed. It landed — on Norway, not EU.

## FINDING 2 — EU pays, but only inside its own regimes

52 of 67 EU instruments *are* in multi-leaf regimes, across 11 regimes:

```
 12  IPCEI (all waves)                          11 EU leaves
 10  Horizon Europe partnerships & JUs           9
 10  Horizon Europe Pillar II (all clusters)     9
  9  EU Innovation Fund (all lots)               7 EU + 1 NO
  9  EIT (all KICs)                              1
  5  EIC (all tracks)                            4
  3  Chips Joint Undertaking                     2
  3  European Defence Fund                       2
  3 / 2 / 2  (three parentless clusters)         7
```

Oracle simulation, restricted to the 11 EU-containing regimes (68 leaves) — the honest
local scoreboard for this workstream:

```
mean class TODAY          8.32
with perfect EU text      1.85     <- the payable target
```

But on the **global** 797-leaf metric the same perfect coverage buys:

```
ALL THREE (today)                          mean class 18.0   unique 35.6%
+ perfect distinct text for EVERY EU leaf  mean class 17.5   unique 42.9%
```

**Say this plainly: 18.0 -> 17.5 is the whole global prize.** The global mean is
leaf-weighted and EU is 6.5% of leaves; it is dominated by the large FR/ES/DE/IT regimes
other agents own. The metric that actually moves is unique identification, +7.3pp from
6.5% of the corpus — because EU regimes are small enough to be *fully* resolved, unlike
the 48-sibling French ones. Per leaf touched, this is the best ratio available; in absolute
global mean-class terms it is half a sibling.

Implication for the manager: the 95% exact-scheme target is not reachable by finishing
this workstream, and nobody should read a 0.5 move as failure here. The ceiling
(every leaf everywhere perfectly distinct) is mean class 1.0 / unique 100%.

---

## Batch 1-2 — EIC (4 leaves) and Innovation Fund (8 leaves)

Both regimes went to **mean class 1.00 — fully resolved, every leaf uniquely identified.**

```
EU-containing regimes, 11 regimes / 68 leaves
  local mean class   8.32  ->  6.97
  global mean class  18.0  ->  17.9      unique 35.6% -> 38%
  EU coverage        0/67  ->  11/67     NO 0/74 -> 1/74
```

Per regime after this batch:

```
  12 leaves  cov  0  mean class 12.00  ipcei
  10 leaves  cov  0  mean class 10.00  horizon_eu_partnership
  10 leaves  cov  0  mean class 10.00  horizon_eu_pillar_ii
   9 leaves  cov  0  mean class  9.00  eit
   9 leaves  cov  8  mean class  1.00  innovation_fund      <- resolved
   5 leaves  cov  4  mean class  1.00  eic                  <- resolved
   3 leaves  cov  0  mean class  3.00  chips_ju
   3 leaves  cov  0  mean class  3.00  edf
   3 / 2 / 2 leaves  the three EIT KIC clusters
```

### What made them resolve, and the trap next to it

Writing down each leaf's *legal* eligibility would have resolved nothing. All four EIC
tracks and all seven Innovation Fund lots share the same Horizon/ETS boilerplate — legal
entity, established in an eligible country, 60% aid ceiling. Copy that onto every sibling
and coverage goes to 100% while mean class stays at 9.

What separates them is the **one condition each lot does not share**:

| lot | the discriminating condition |
|---|---|
| IF LSP / MSP / SSP | CAPEX `>100m` / `20-100m` / `2.5-20m` — pure size bands |
| IF clean-tech mfg | funds *building the factory*; explicitly excludes *using* the equipment |
| IF pilots | must **not** yet reach commercial scale — the only lot with a ceiling on maturity |
| IF battery | planned annual capacity `>= 10 GWh`, and applicant's first commercial EV-cell project **globally** |
| IF hydrogen bank | not a grant call — an auction paying a fixed premium per verified kg over 10 years |
| EIC Accelerator | single applicant, TRL 6-8, only track open to mid-caps to 499 staff |
| EIC Pathfinder | 3-party cross-border consortium, TRL 1-4 |
| EIC Transition | gated on a **prior EU-funded project** as the source of results |
| EIC Fund | the only equity track; carries a foreign-control exclusion the grants do not |

The rule this workstream is following: **record the condition a sibling would fail, not the
condition they all pass.** Coverage percentage is not the deliverable.

### Surprises worth recording

1. **The Innovation Fund's leaf structure is a historical award taxonomy, not a current
   application menu.** The corpus lots (LSP/MSP/SSP/PLT/MFG/battery/hbank) are the IF23-IF24
   shape. IF25 restructured to NZT + Heat Auction + Hydrogen Auction. The CAPEX bands
   survived the restructure, so the texts are still true and still discriminating, but nobody
   should read these leaves as "calls you can open today". Recorded as `status: recurring`
   with the round dates in `deadline`, not as open and not as closed.
2. **The shared loader reads `administering_body`, not `body`.** `found_AT.json` and the
   other agents' files use `body`; the key the loader consumes is `administering_body`. Twelve
   EU rows initially loaded prose with a NULL body for that reason. Worth checking whether
   other countries' files have the same silent miss.
3. `load_scheme_text.py` gained `--country` (mine) at the same time its owner was rewriting
   it for corpus-driven liveness. Both changes are in the working tree together. Publishing is
   done through `ETL/terms/publish_scheme_text_scoped.py`, which is country-scoped so it
   cannot carry a neighbour's uncommitted SQLite row into the live read path.

---

# HANDED IN 2026-08-06 (budget stop, mid-batch 3)

## Final numbers

```
                        before      after
EU eligibility_text     0/67        11/67  (16%)
NO eligibility_text     0/74         1/74  ( 1%)
EU administering_body   0/67        11/67
global mean class       18.0        17.9      unique 35.6% -> 38%
EU-local mean class      8.32         6.97    (11 regimes, 68 leaves)
```

Regimes taken to **mean class 1.00, fully resolved**: `eic` (5 leaves), `innovation_fund`
(9 leaves). Untouched: `ipcei` 12, `horizon_eu_partnership` 10, `horizon_eu_pillar_ii` 10,
`eit` 9, `chips_ju` 3, `edf` 3, three EIT KIC clusters 3/2/2.

Everything claimed here is in SQLite **and published to Postgres** via
`ETL/terms/publish_scheme_text_scoped.py --country EU --country NO`. Nothing is pending.
`data/raw/` and `data/db.sqlite` are gitignored, so the fetch record is preserved at
`project-mgmt/findings/workstream_L_no_eu_fetch_record.json`.

## Was the EU half the fastest win, as expected?

**Half yes, half no — and the "no" half is the more important finding.**

Fast, as predicted: EIC and the Innovation Fund went from zero to fully resolved in two
batches. The sources are excellent — the IF25 call fiche PDF carries a literal CAPEX
eligibility table, and the EIC pages state consortium and TRL rules outright. 12 instruments
in roughly a dozen fetches, no blocks, no CAPTCHAs.

Not fast, and the brief's premise needs correcting: **"EU publishes machine-readable
eligibility" is true and nearly useless on its own.** Every EU leaf publishes the SAME
eligibility — legal entity, established in an eligible country, three partners from three
Member States, 60% ceiling. Harvesting that is trivial and moves the sibling metric by
exactly zero, because it is identical across siblings by construction. The usable
discriminator is buried one level down, in the per-topic scope and threshold text, and
finding it took the slow work: a call-fiche PDF per regime, read to the topic table.

So the EU half is the fastest win **per unit of separation bought**, but not because the
data is easy to fetch. It is fastest because EU regimes are 3-12 leaves and therefore
*finishable* — unlike the 48-sibling French regimes, where the same effort resolves nothing.

## What refused

- `eic.ec.europa.eu/eic-investments/eic-fund_en` — 404. Live path is `/eic-fund_en`.
- `climate.ec.europa.eu/.../competitive-bidding-european-hydrogen-bank_en` — 404. Live path
  is `.../competitive-bidding_en`.
- `research-and-innovation.ec.europa.eu/.../institutionalised-european-partnerships_en` — 404.
- `smart-networks.europa.eu/about/` and `global-health-edctp3.europa.eu/about/...` — 404.
- `ihi.europa.eu` — TLS failure, "unable to verify the first certificate". **Not retried and
  not worked around**, per the standing rule. Someone should confirm whether IHI's chain is
  genuinely misconfigured or this is transient.
- The IF25 call fiche PDF defeated the fetch tool (binary passthrough). It was recovered by
  reading the downloaded file with `pdftotext -layout`, which is how the verbatim CAPEX table
  was obtained. **Worth reusing: the EU call fiches are the best eligibility source in the
  corpus and they all arrive as PDFs.**

## For whoever picks this up

1. **Do not do Norway on this scoreboard.** 73 of 74 rows are singleton regimes (Finding 1).
   Its remaining value is memo-side only: NFR programme pages and innovasjonnorge.no would
   give citable text and application URLs, and the corpus register holds nothing to reuse —
   Norway is EEA and therefore absent from SATR entirely (`granting_country_iso2='NO'` returns
   0 rows of 122,814), and its events carry NULL `granting_authority`, `programme_ref` and
   `raw_source_url`. Everything must come from live fetching. That check cost ten minutes and
   is the answer to "check the register first".
2. **The next 20 leaves are the cheapest remaining separation in the whole corpus.**
   `horizon_eu_partnership` (10) is nine legally distinct Joint Undertakings — Clean Hydrogen,
   Clean Aviation, EuroHPC, Europe's Rail, EUSPA, GH EDCTP3, IHI, SESAR 3, SNS. Setting
   `administering_body` to each JU's own legal name resolves that regime almost completely on
   its own, before any eligibility text. Mandate text for Clean Hydrogen, EuroHPC, Europe's
   Rail, Clean Aviation and SESAR 3 was already fetched and is quoted in the transcript; it
   did not reach the DB before the stop.
3. `horizon_eu_pillar_ii` (10) separates on cluster scope (CL1 health, CL3 security, CL4
   digital/industry/space, CL5 climate/energy/mobility, CL6 food/bioeconomy, Missions, EIE,
   CBE, ERC PoC), and the administering agencies genuinely differ (REA / HaDEA / CINEA /
   ERCEA), so the same administering_body trick pays there too.
4. **`ipcei` (12) should probably not get eligibility text at all.** IPCEI waves are closed
   Commission approvals, not open application routes; a founder cannot apply to "IPCEI
   Batteries". The honest fix is a liveness/closure marking, not eligibility prose — and that
   is a different workstream's call to make.
5. Several EIT rows are genuinely dead and should be marked so rather than enriched: EIT
   Manufacturing ASBL wound down 10 April 2026 (per the Sprint 7 notes), and
   `eit_digital_vap`, `eit_rawmaterials_portfolio`, `eit_urban_mobility_portfolio` last
   recorded activity in 2022.
