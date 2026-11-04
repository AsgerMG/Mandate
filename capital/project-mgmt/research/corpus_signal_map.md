# What the corpus actually holds, and what could separate 58 candidates down to 5

Written 2026-08-06. Every number here comes from `data/db.sqlite` read-only and
from scripts kept in the session scratchpad; the method is stated beside each
figure so it can be re-run and disagreed with.

> **RE-MEASURED 2026-08-09 ON THE ANSWER KEY THAT SHIPS — READ THIS BEFORE
> ACTING ON §2 OR §5.** Everything below was measured WITHIN A SIBLING GROUP,
> against `__recallSetComposed.json`, which could not name a childless family at
> all. Workstream BU re-scored every signal over the pool the product actually
> ranks, on `__recallSetDoors.json` (611 funds, 28 countries), holdout, N=600.
> Two of this note's conclusions do not survive the move:
>
> 1. **§2's central lever is structurally inert on a third of the offer.** The
>    within-regime posterior is applied as a rank-preserving permutation, and a
>    family nobody split IS its own regime — permuting a group of one is the
>    identity. Measured: 17.9 against 17.9 on `traced:childless_family`, and 8.9
>    +/-3.3 against 12.9 +/-3.9 where it does have siblings to move. 233 of the
>    funds the product offers have no sibling for a sibling-choice lever to
>    choose between.
> 2. **§5 Tier 1 item 1, un-clipping `sectorFit`, was shipped as an arm and
>    measured end to end: EXACT@5 21 -> 22 (+/-3.3, not a difference) at a cost of
>    REGIME@5 73 -> 67 and 98% -> 83% on the population that has siblings.**
>
> What DOES survive: sector is the strongest instrument-side signal, and size
> columns are worthless — worse than worthless, they measure BELOW a shuffle.
> Full table, half-widths and leak status:
> `project-mgmt/findings/signal_remeasure_wsBU.md`.

The question this answers: **the shortlist has the right fund 95% of the time
and the top five has it 25-50% of the time. What information in the corpus
could close that gap, and could a founder plausibly supply the matching half of
it?**

---

## The one-paragraph answer

The single largest discriminating signal is already in the database, already
loaded by the ranker, and is being destroyed by the shape of the function that
reads it. `sector_mix` — the sector histogram of a fund's real recipients —
ranks the correct sibling first **43.6%** of the time when read as a posterior
across the candidate set. The ranker reads it through
`sectorFit() = min(1, share / 0.25)`, which ranks it first **17.6%** of the
time and produces a **tied top score in 58.7% of sibling comparisons**. That is
a 26-point swing from the same bytes, with no new question asked of the
founder. Everything else found here — subsector, sub-national geography, GBER
objective — is worth 2-5 points on top of it.

---

## 1. Schema map

### Row counts (all tables)

| Table | Rows |
|---|---:|
| classify_audit | 420,416 |
| public_funding_events | 309,898 |
| companies | 163,538 |
| company_sector_llm | 156,100 |
| company_sector_labels | 144,493 |
| satr_staging | 122,814 |
| eligibility_gates | 6,368 |
| public_equity_stakes | 5,570 |
| funding_instruments | 1,014 |
| funding_instrument_sources | 892 |
| eligibility_clauses | 879 |
| instrument_application | 283 |
| schema_migrations | 20 |
| private_funding_events | 0 |

Nine views: `v_events`, `v_european_companies`, `v_company_breadth`,
`v_company_funding_layers`, `v_country_public_support`, `v_country_sector_family`,
`v_ndb_distributor_rollup`, `v_state_aid_layer`, `v_company_breadth_companies`.

`funding_instruments` holds 1,014 rows; **710 are publishable leaves** under
`publishableInstruments()` (not framework, no children, scheme not closed,
passes the data floor). Those 710 are the universe the shortlist ranks.

### `funding_instruments` — fill and cardinality (n=1,014)

| column | fill | distinct | in ranking? |
|---|---:|---:|---|
| id | 100% | 1,014 | yes (tiebreak) |
| parent_id | 74.2% | 58 | yes (family label) |
| name | 100% | 912 | display |
| name_source | 100% | 4 | no |
| country | 98.5% | 24 | **yes** (hard filter) |
| administering_body | 71.2% | 414 | display + dedupe |
| administering_body_share | 71.2% | 34 | display threshold |
| ndb_id | 88.1% | 44 | **no** |
| source_family_bucket | 97.7% | 11 | yes (channel) |
| capital_type | 100% | 8 | **yes** (filter) |
| event_count | 100% | 384 | yes (last tiebreak) |
| company_count | 100% | 331 | **no** |
| total_eur | 100% | 960 | fallback only |
| first_year | 95.8% | 10 | **no** |
| last_year | 95.8% | 9 | display + liveness |
| is_framework | 100% | 2 | filter |
| sample_project_titles | 88.0% | 794 | embeddings only |
| scheme_code | 44.7% | 377 | dedupe + display |
| application_url | **0%** | 0 | dead column (lives in `instrument_application`, 283 rows) |
| sector_mix | 97.1% | 955 | **yes — see §2** |
| scheme_operators | 34.1% | 147 | display |
| award_p25 | 89.5% | 837 | **no** |
| award_p50 | 89.5% | 835 | **yes** |
| award_p75 | 89.5% | 839 | **no** |
| award_n | 100% | 383 | yes (floor of 5) |
| intensity_p50 | **1.3%** | 9 | display; effectively dead |
| intensity_n | 100% | 14 | display |
| tier | 100% | 2 | no |
| root_id / depth / path | 100% | 262 / 3 / 1,014 | **no** |
| scheme_end_date | 44.2% | 43 | publishable filter |
| successor_scheme / _title | 3.9% | 21 | display |
| description | 28.1% | 224 | embeddings only |
| eligibility_text | 23.8% | 181 | embeddings + citation |
| eligibility_source_url | 25.5% | 192 | citation |
| eligibility_confidence | 28.0% | 4 | no |

### `eligibility_gates` (n=6,368, over 866 instruments)

| column | fill | distinct |
|---|---:|---:|
| instrument_id | 100% | 866 |
| gate_key | 100% | 2,089 |
| gate_family | 100% | 6 |
| requirement | 100% | 4,353 |
| value | 62.7% | 3,070 |
| value_spec | **45.0%** | 538 |
| intake_field | 100% | 23 |
| intake_field_resolved | 87.6% | 26 |
| quote | 50.2% | 2,734 |
| source_file | 50.3% | 322 |
| verification_level | 100% | 5 |
| gate_role | 100% | 4 (filter 4,244 / programme_fact 1,106 / obligation 790 / vague 228) |
| encoding_method | 62.7% | 4 |

The two largest gate_keys are `framework_undertaking_in_difficulty` and
`framework_excluded_activity`, at 584 each — i.e. the single most common gate in
the corpus is a framework exclusion inherited identically by 584 instruments.
**It cannot separate anything.** That is the shape of the whole gate layer (§4).

### `public_funding_events` (n=309,898)

| column | fill | distinct |
|---|---:|---:|
| company_id | 100% | 159,089 |
| source | 100% | 999 |
| role | 100% | 9 |
| project_number | 33.6% | 30,726 |
| project_title | 91.7% | 65,859 |
| project_summary | 43.6% | 52,205 |
| call_id | 100% | 185,309 |
| call_deadline | **12.7%** | 1,615 |
| project_started | 87.7% | 1,921 |
| project_ended | 29.4% | 230 |
| grant_amount_eur | 95.4% | 177,487 |
| equity_amount_eur | **0.0%** | 23 |
| total_project_cost_eur | 30.9% | 21,672 |
| debt_amount_eur | 3.1% | 4,412 |
| sector_tags_raw | 88.5% | 5,019 |
| woman_leadership | 1.2% | 2 |
| deployment_country | 69.6% | 30 |
| aid_instrument | 43.4% | 11 |
| aid_objective | 23.5% | 10 |
| granting_authority | 39.6% | 885 |
| granting_authority_country | 39.6% | 24 |
| entrusted_entity | 1.5% | 192 |
| financial_intermediaries | 1.1% | 182 |
| ndb_distributor | 46.8% | 122 |
| instrument_class | 1.0% | 4 |
| programme_name | 22.5% | 1,370 |
| programme_ref | **0%** | 0 |
| is_duplicate | 100% | 2 (1,429 flagged) |

### `companies` (n=163,538)

| column | fill | distinct |
|---|---:|---:|
| canonical_name | 100% | 162,981 |
| country | 98.5% | 41 |
| city | **18.3%** | 8,112 |
| postal_code | **1.3%** | 1,537 |
| website | **1.5%** | 2,295 |
| entity_type | 100% | **4** (company / unknown / research_org / other) |
| sector_inferred | 99.4% | 8 |
| sector_top | 88.8% | 11 |
| subsector | **81.1%** | **94** |
| sector_taxonomy_method | 88.8% | 4 |
| pic | 14.0% | 22,819 |
| company_group | 2.8% | 2,116 |
| parent_group | 6.9% | 4,727 |
| match_confidence | 100% | 3 |
| dealroom_id / crunchbase_url / linkedin_url | **0%** | 0 |

**Structural gap worth stating plainly:** `companies` holds no employee count,
no founded year, no turnover and no balance sheet. Four intake fields
(`fteBand`, `turnoverBand`, `balanceBand`, `foundedYear`, `developmentStage`)
— including **two of the six screen-one questions** — therefore have no
observable counterpart anywhere in the corpus. They can only ever work through
encoded gates; no amount of award history can learn what a fund's recipients
looked like on those axes.

### Well-populated, decision-relevant, and NOT in any ranking sort key

Ranked by how much they look wasted:

1. `companies.subsector` — 81% fill, 94 values, **not stored on instruments at
   all** and never reaches the ranker. Best measured discriminator in §2.
2. `public_funding_events.aid_objective` — 23.5% fill, the GBER article the
   award was actually filed under. Reaches the ranker only through
   `__objectives.json`, which is applied inside `selectLeafInstruments` and, per
   the comment there, measured at zero in the row sort.
3. `companies.city` — 18% corpus-wide but **20-65% among funded companies in the
   big markets** (FR 20%, DE 41%, ES 58%, IT 63%, NL 61%, BE 65%, NO 99%).
   Never used.
4. `award_p25` / `award_p75` — 89.5% fill. Only the median is read, so the
   *spread* of a fund's cheque sizes is discarded. A fund that pays €80k-€120k
   and one that pays €20k-€5M have the same p50 story today.
5. `first_year` — 95.8%. Only `last_year` is read; a scheme's age is invisible.
6. `public_funding_events.programme_name` — 22.5%, 1,370 distinct. This is what
   `populate_funding_instruments.py` uses for the *programme split*, and the
   result is written into `administering_body` (see §2 caveat).
7. `total_project_cost_eur` — 30.9%, the only route to an observed co-financing
   ratio. Never computed.
8. `ndb_id` (88.1%), `company_count` (100%), `root_id`/`depth`/`path` (100%) —
   populated, never read by a sort.

Dead columns: `funding_instruments.application_url` (0%),
`public_funding_events.programme_ref` (0%), `equity_amount_eur` (0.0%),
`instrument_class` (1.0%), `intensity_p50` (1.3%),
`companies.dealroom_id`/`crunchbase_url`/`linkedin_url` (0%).

---

## 2. What separates siblings — the core result

### Method

Two sibling definitions were measured. Shared `parent_id` gives **25 groups
covering 490 of the 710 publishable leaves** (sizes 3 to 87). Shared
`administering_body` + `country` gives 27 groups covering 133. The parent_id
grouping is the one that matters — it is where 69% of the publishable corpus
lives and where the ranker's diagnosed failure sits (57 of 67 ranking misses
showed a sibling of the won fund).

An award was attributed to exactly one leaf, reconstructing the two split
dimensions `populate_funding_instruments.py` actually uses:

- **authority + scheme children** (SATR): match `call_id = scheme_code` AND
  `granting_authority = administering_body`
- **programme children** (ADEME, BDNS, Vinnova, Innovate UK): match
  `source ∈ parent's sources` AND `programme_name = administering_body`

This matters. The obvious join — the one `emit_peer_prior.py` uses, on
`scheme_code = call_id` alone — is **not unique**: 34 scheme codes are shared by
more than one instrument (SA.56245 by 18, SA.111723 by 14), and the 227
programme-split children carry an empty `scheme_code` so they never join at
all. Joining that way produced 630,352 rows from 308,469 events and made the
four largest sibling groups invisible. The corrected join attributes **201,585
events (65.4%) to 655 of the 710 leaves**; 55 leaves have no traced award.

Within each sibling group, a leave-one-out empirical model ranks the siblings
by P(instrument | attribute) and we ask where the fund that actually paid
lands. Two baselines are reported: **uniform** (1/|group|, ≈8.5%) and
**popularity** (always pick the biggest sibling, 29.6%). Popularity is the
honest baseline — a ranker that knows nothing still gets 29.6%.

### Sibling divergence, every column (shared parent_id, 25 groups)

"differ%" = probability two randomly drawn siblings hold different values.

| column | differ% | fill among siblings | groups where all identical |
|---|---:|---:|---:|
| sector_mix | 100.0% | 100% | 0% |
| event_count | 99.5% | 100% | 0% |
| total_eur | 99.4% | 100% | 4% |
| award_p25 / p50 / p75 | 99.3 / 99.2 / 99.3% | 98.8% | 4% |
| company_count | 99.2% | 100% | 0% |
| name | 98.1% | 100% | 0% |
| award_p50 (order of magnitude) | 89.8% | 98.8% | 4% |
| administering_body | 83.3% | 91.2% | 32% |
| top sector of the mix | 73.2% | 100% | 8% |
| first_year | 68.0% | 100% | 4% |
| last_year | 65.4% | 100% | 12% |
| intake fields the own gates decide | 44.2% | 71.4% | 16% |
| scheme_code | 43.1% | 44.9% | 40% |
| own gate count | 41.7% | 100% | 16% |
| GBER article (objective) | 38.2% | 41.8% | 44% |
| description | 37.0% | 31.6% | 40% |
| eligibility_text | 35.2% | 28.6% | 40% |
| registered use-of-funds | 35.0% | 41.8% | 44% |
| scheme_end_date | 25.5% | 43.9% | 60% |
| region (from `region_within` gates) | 20.6% | 19.2% | 60% |
| capital_type | 6.2% | 100% | 80% |
| country | 0.4% | 100% | 96% |
| tier, root_id, ndb_id, source_family_bucket, depth, intensity, administering_body_share, successor_* | 0.0% | — | 100% |

Reading this correctly matters. `total_eur` differing 99.4% of the time is
worth nothing: no founder can answer a question about a fund's lifetime budget.
The columns that both differ **and** have a founder-answerable counterpart are
the sector mix, the award scale, the GBER objective, and region. Everything
below `last_year` in that table is either sparse or fixed within a regime.

`capital_type` differs in only 6.2% of sibling pairs and `country` in 0.4% —
which is exactly why the two hard filters in `selectLeafInstruments` cannot
help here. They cut the 1,014 down to the ~58; they do nothing inside it.

### Which company attribute picks the right sibling (156,948 awards, 25 groups)

Each signal measured on the observations where it is present, against
popularity on the **same** observations.

| signal | coverage | recall@1 | popularity@1 on same rows | lift |
|---|---:|---:|---:|---:|
| **aid_objective** (GBER article of the award) | 17.5% | **51.7%** | 33.5% | **+18.2pp** |
| **subsector** (94 buckets) | 78.1% | **48.2%** | 29.7% | **+18.5pp** |
| **city** (sub-national location) | 48.6% | **40.5%** | 26.5% | **+13.9pp** |
| **sector_top** (10 buckets) | 91.2% | **43.6%** | 30.2% | **+13.4pp** |
| award year | 91.0% | 35.7% | 30.9% | +4.8pp |
| aid_instrument (grant/loan/advance) | 26.7% | 35.6% | 32.4% | +3.2pp |
| award size band | 99.3% | 32.2% | 29.7% | +2.5pp |
| number of prior awards | 100% | 31.7% | 29.6% | +2.1pp |
| lifetime public funding received | 100% | 31.7% | 29.6% | +2.1pp |
| entity_type | 100% | 31.3% | 29.6% | +1.7pp |
| co-financing ratio band | 44.3% | 36.0% | 34.8% | +1.3pp |
| first-time recipient | 91.0% | 31.6% | 30.9% | +0.7pp |
| part of a corporate group | 100% | 30.0% | 29.6% | +0.4pp |
| role (coordinator/participant/beneficiary) | 100% | 30.0% | 29.6% | +0.4pp |
| deployment country = HQ country | 42.4% | 25.8% | 25.8% | +0.0pp |

**Four signals carry essentially all of the discriminating power. The rest are
noise.** Company size proxies, group membership, funding experience, applicant
role and co-financing all sit within 2 points of guessing the biggest sibling.

### The finding that dominates everything else

`sector_mix` is loaded by the ranker today. Read four ways, on the same
observations, with leave-one-out:

| how the mix is read | recall@1 | recall@3 |
|---|---:|---:|
| **today: `sectorFit = min(1, share/0.25)`** | **17.6%** | 45.7% |
| unclipped share (`share`, no ceiling) | 24.9% | 48.6% |
| **posterior `P(fund \| sector_top)` across the siblings** | **43.6%** | **70.7%** |
| posterior on subsector (needs a new column) | **48.2%** | 74.4% |
| posterior on sector_top + subsector | 46.3% | 73.8% |

`sectorFit` produces a **tied top score among siblings in 58.7% of cases**
(83,998 of 143,181); 523 instrument×sector cells sit at or above the 0.25
saturation point. Two things are wrong and they compound:

1. **The clip.** `SECTOR_FULL_MATCH_SHARE = 0.25` was chosen so a broad fund is
   not punished for being broad — a correct instinct *across* channels. Within
   a sibling group it makes a fund with 90% of its awards in the founder's
   sector indistinguishable from one with 26%. It is exactly the comparison the
   product needs and exactly the one the ceiling erases.
2. **The normalisation.** `share = mix[sector] / total` is P(sector | fund) —
   it divides by the fund's own size, so a 12-award specialist beats a
   400-award regional scheme that funds four times as many companies in that
   sector. The question the shortlist is asking is P(fund | sector): normalise
   across the candidate siblings, not within the fund.

This is the same insight that made `peerPrior.generated.json` work (24% → 43%),
applied one level down. The peer prior answers "what do companies like this win"
globally, keyed on `country|sector_top`; it cannot separate siblings because
both siblings sit in the same cell. The posterior above is the within-group
form of it.

### Per-group, so the result is not one big group carrying it

recall@1 by sibling group, uniform baseline in the second column:

| group | size | awards | uniform | city | subsector | sector_top | award band |
|---|---:|---:|---:|---:|---:|---:|---:|
| bdns_es_ayudas | 87 | 4,209 | 1.1% | – | 23.2% | 17.8% | 12.1% |
| ademe_aid | 75 | 14,146 | 1.3% | – | 35.9% | 29.6% | 19.2% |
| satr_de_rnd | 55 | 9,968 | 1.8% | 30.0% | 40.9% | 31.6% | 18.3% |
| vinnova_grant | 49 | 5,627 | 2.0% | 17.7% | 20.6% | 17.5% | 16.7% |
| satr_cz_rnd | 29 | 3,011 | 3.4% | – | 27.7% | 20.2% | 13.7% |
| satr_it_rnd | 27 | 3,179 | 3.7% | 53.5% | 31.1% | 26.5% | 20.8% |
| satr_fr_rnd | 26 | 9,646 | 3.8% | 65.2% | 57.3% | 54.6% | 47.1% |
| innovate_uk | 16 | 16,856 | 6.2% | 58.2% | 61.2% | 61.2% | 60.9% |
| satr_nl_rnd | 15 | 2,816 | 6.7% | 44.9% | 36.7% | 32.4% | 26.1% |
| satr_at_rnd | 12 | 2,802 | 8.3% | 65.1% | 53.1% | 52.3% | 29.3% |
| horizon_eu_pillar_ii | 9 | 58,977 | 11.1% | 35.4% | 48.3% | 42.6% | 25.2% |
| horizon_eu_partnership | 9 | 9,206 | 11.1% | 52.9% | 64.3% | 50.9% | 27.0% |

The pattern holds in every group with more than 40 traced awards. It is
strongest exactly where the problem is worst — the 87-, 75- and 55-member
groups where the uniform baseline is 1-2%.

### A data-semantics defect found on the way

For the 227 **programme-split** children (ademe_aid 75, bdns_es_ayudas 87,
vinnova_grant 49, innovate_uk 16), the `administering_body` column does not
hold a granting body. It holds the **call or sub-programme name**:

```
bdns_es_ayudas__ayudas_tecniospring_industry_*   → "Ayudas Tecniospring Industry"
ademe_aid__aap_decarb_ind_pdr_fdi_*              → "AAP DECARB IND (PDR-FDI)"
ademe_aid__avelo_2_*                             → "AVELO 2"
```

`distinguishRowNames()` in `shortlist.ts` reasons about this field as "the
granting body is what a founder actually approaches … Region Normandie versus
Caisse des Depots". That is true for the SATR children and false for these 227.
It happens to render *better* than the code expects — a sub-programme name is
more useful to a founder than an agency name — but any logic that treats the
field as an institution (the 0.6 `administeringBodyShare` threshold, the
`NOT_AN_APPLYABLE_BODY` regex, the dedupe's `bodyDistinguishes` test) is
operating on a different kind of value for a third of the sibling corpus.
Worth a deliberate decision rather than a coincidence.

---

## 3. Award-level signals

630k award rows were profiled per instrument. What is recorded, and whether
funds differ systematically on it:

**Amounts.** `grant_amount_eur` 95.4% filled — the strongest per-award field we
hold. Already summarised into `award_p25/p50/p75/award_n` on the instrument
(89.5% fill). As a discriminator, award size band gives **+2.5pp over
popularity**. It is a real signal and a small one; the ticket question earns its
place on screen one by ruling channels in and out, not by picking siblings.
The **spread** (p75/p25 ratio, median 2.8x across 79% of instruments) is
computed and never read.

**Dates.** `project_started` 87.7%, `call_deadline` only **12.7%**,
`project_ended` 29.4%. Award year gives +4.8pp — but that is the fund's own
activity window, not something a founder answers. The useful form is liveness:
`first_year`/`last_year` differ across 68%/65% of sibling pairs and only
`last_year` is read. `call_deadline` at 12.7% is too sparse to build a
"when can I apply" signal from; `instrument_application.timeline` (283 rows)
is the curated substitute and covers 40% of publishable leaves.

**aid_instrument** (43.4%, 11 values) — grant / guarantee / repayable advance /
equity. +3.2pp. Mostly redundant with `capital_type`, which the shortlist
already filters on.

**aid_objective** (23.5%, 10 values) — the GBER article. **+18.2pp, the highest
lift of any single field**, but on 17.5% of awards and confined to state-aid
schemes. This is the same coverage bias the `objectiveScorer` comment in
`shortlist.ts` already documents: every instrument carrying an objective is a
state-aid scheme, so applied globally it becomes a channel prior and cost 21
points when tried. Within a sibling group there is no such trade, which is why
it is already applied there — and it should be, more strongly.

**programme_name** (22.5%, 1,370 distinct) and **sector_tags_raw** (88.5%,
5,019 distinct) — per-award sub-programme labels ("Tremplin pour la transition
écologique des PME", "Fonds Tourisme Durable", "AAP DECARB IND"). These are the
sharpest thematic strings in the corpus and they already do work: they drive
the programme split. They are *not* reflected in `sector_mix`, which is a
10-bucket histogram.

**Co-funding.** `total_project_cost_eur` is only 30.9% filled, and the ratio is
computable for a usable number of awards on **just 5.9% of instruments**. The
observed co-financing band gives **+1.3pp**. `cofinancingBand` is a legitimate
*eligibility* question (91 gates on 75 instruments) but it is not a ranking
signal, and the corpus cannot make it one.

**Region / co-location.** `deployment_country` 69.6%, `granting_authority`
39.6% (885 distinct, and heavily regional in name). "Does the funded activity
sit in the HQ country" gives **+0.0pp** — genuinely nothing.

**Do funds differ in the PROFILE of the companies they fund?** Yes, on sector
and location; essentially no on everything else. Measured across sibling
groups: repeat-recipient share (median 12%), first-time-recipient share (median
72%), recipients' median number of distinct funders (median 1), recipients'
lifetime funding, entity_type mix (median 88% "company"), corporate-group
membership (median 7%) — every one of these lands within 2 points of
popularity. **Funds are not selecting on the applicant's funding history or
corporate form in any way our data can see.**

---

## 4. Untapped joins, and why the gate layer cannot fill the gap

Per-company fields and what fraction carry them:

| field | corpus fill | fill among *funded* companies in the big markets |
|---|---:|---|
| subsector (94 buckets) | **81.1%** | 84% of leaves have ≥5 recipients with one |
| city | 18.3% | FR 20%, DE 41%, GB 32%, ES 58%, IT 63%, NL 61%, BE 65%, SE 28%, NO 99% |
| entity_type | 100% but only **4 coarse values** | – |
| parent_group | 6.9% | – |
| company_group | 2.8% | – |
| postal_code | 1.3% | – |
| website | 1.5% | – |
| pic | 14.0% | – |

Only **278 of 710** publishable leaves (39%) have ≥5 recipients with a known
city, against **593 of 710** (84%) with a known subsector. Geography is the
higher-lift signal per observation and the lower-coverage one; subsector is the
one that can be shipped now.

### The gate layer, tested directly

For each intake field, over the 25 sibling groups: does a filter gate exist,
and do siblings **differ** on it?

| intake field | groups with any gate | groups where siblings differ | sibling coverage |
|---|---:|---:|---:|
| entityCountries | 25/25 | 14/25 | 93.3% |
| lossesOverHalfCapital | 22/25 | 9/25 | 91.8% |
| exclusionFlags | 21/25 | **3/25** | 84.7% |
| activities | 18/25 | **1/25** | 78.4% |
| fteBand | 18/25 | **4/25** | 66.5% |
| borrowerModel | 23/25 | 16/25 | 61.2% |
| consortium | 16/25 | 7/25 | 60.2% |
| useOfFunds | 11/25 | 5/25 | 47.3% |
| activityCountries | 15/25 | 11/25 | 41.4% |
| cofinancingBand | 13/25 | 8/25 | 33.5% |
| foundedYear | 9/25 | 4/25 | 25.5% |
| sector | 8/25 | 4/25 | 25.3% |
| **region** | 11/25 | **10/25** | 22.9% |
| **developmentStage** | 11/25 | **10/25** | 21.4% |
| ticketBand | 11/25 | 7/25 | 15.5% |
| **turnoverBand** | 14/25 | **12/25** | 8.0% |
| conditionality | 6/25 | 6/25 | 3.3% |

The inverse relationship is exact and it explains why gate-fit ranking measured
flat. **The fields with high sibling coverage are the ones siblings never
differ on** — `activities` covers 78% of siblings and differs in 1 group of 25;
`exclusionFlags` covers 85% and differs in 3. They are framework exclusions
inherited identically (the two largest gate_keys in the corpus sit on 584
instruments each). **The fields where siblings genuinely differ — region
(10/25), developmentStage (10/25), turnoverBand (12/25) — are encoded on 8-23%
of siblings.** Asking a founder a question the gate layer cannot decide for 80%
of the candidates in front of them cannot move a ranking.

This is a corpus-coverage problem, not a ranking problem, and it is a different
lever from §2: the empirical posterior needs no gates at all.

---

## 5. What a founder could plausibly answer, ranked

Scored on discriminating power (measured, §2) × answerability (whether a real
founder can answer it truthfully in one screen without looking anything up).

### Tier 1 — ship these

**1. Nothing. Fix `sectorFit` first.**
Discriminating power +26pp within sibling groups. Answerability: **already
asked**. `sector` is on screen one today and the answer is being thrown away by
a clip and a normalisation. Replace `min(1, share/0.25)` with a posterior over
the candidate set, scoped per channel exactly as `objectiveScorer` and
`awardScorer` already are, so it can only reorder siblings and never becomes a
channel prior. No new question, no new column, no new ETL. This is the whole
finding.

**2. "Which of these best describes what you build?" — subsector, 94 buckets.**
Discriminating power 48.2% @1 (+18.5pp over popularity, +4.6pp over sector_top).
Answerability: **high** — a two-level dropdown conditioned on the sector already
answered ("heat pumps & HVAC", "biotech therapeutics", "circular economy &
recycling", "agtech / precision farming"). 81% of companies carry one and 84%
of publishable leaves have ≥5 recipients with one. **Requires a new
`subsector_mix` column on `funding_instruments`** — it does not exist; today's
`sector_mix` is 10-bucket only. Cheapest new signal in the corpus.

**3. "Which region are you in?" — NUTS-1/2, already in the vocabulary.**
Discriminating power 40.5% @1 (+13.9pp) on the 49% of awards where we see it.
Answerability: **highest of anything here** — every founder knows their region,
and `regions.generated.ts` already holds the NUTS list and hierarchical prefix
matching. The blocker is the instrument side: only **148 of 710** leaves carry a
`region_within` gate, and only **278 of 710** have ≥5 recipients with a city.
The fix is not more gates — it is a **recipient-region posterior** built the
same way as the sector one, from recipient city plus the regional names already
sitting in `granting_authority` (885 distinct, heavily regional). Highest
ceiling, most work. Note the previous "region" attempt measured flat; that
attempt was gate-based, which §4 predicts.

### Tier 2 — real but marginal

**4. "What would the money pay for?" — useOfFunds → GBER objective.**
+18.2pp where present, but only 17.5% coverage and structurally confined to
state-aid schemes. Answerability: high, and it is already on screen one and
already wired to `objectiveScorer` inside `selectLeafInstruments`. The
improvement available is applying it in the row sort under the same
rank-preserving, per-channel construction `materialiseInstrumentTable` already
uses for siblings — not asking anything new.

**5. "How much do you need?" — ticketBand.**
+2.5pp for picking siblings. Answerability: high, already asked. Keep it: it
does real work choosing channels and it is the right question. Just do not
expect it to solve the sibling problem — it will not, and the corpus says so.

### Tier 3 — measured, and not worth a question

Each of these was tested and lands within ~2 points of guessing the biggest
sibling. Listed so they are not proposed again:

| candidate question | measured lift | verdict |
|---|---:|---|
| "Have you received public funding before?" | +0.7pp | no |
| "How many public grants have you had?" | +2.1pp | no |
| "How much public funding in total?" | +2.1pp | no |
| "Are you part of a larger corporate group?" | +0.4pp | no |
| "Would you lead or join a consortium?" | +0.4pp (role) | no as a *ranking* signal — still a valid eligibility gate |
| "What share can you co-finance?" | +1.3pp | no as a ranking signal — valid gate (91 gates, 75 instruments) |
| "Where will the funded work physically happen?" | +0.0pp | no |
| company type / research org vs company | +1.7pp | no |

And four fields the corpus cannot rank on at all, because no company-side
ground truth exists: **fteBand, turnoverBand, balanceBand, developmentStage,
foundedYear**. Two of them are on screen one. They earn their place as
eligibility gates — `fteBand` alone carries 216 filter gates over 165
instruments — but no award-history signal can ever be built for them. Any plan
that hopes to rank on company size should be stopped here.

---

## Caveats, stated so the numbers are not over-read

- **The sibling test is narrower than EXACT@5.** It ranks within a known sibling
  group, not within the whole 58-fund pool. A 26-point gain here does not
  transfer 1:1 to top-5 recall. It bounds the headroom; it does not promise it.
- **The posterior is fitted on the same award history the recall harness
  replays.** That is legitimate — it is the peer prior's own logic, and
  `emit_peer_prior.py --exclude-recall-set` already has the machinery to make it
  honest — but any measurement must exclude the recall set or it is reciting
  its own training data.
- **A posterior over award history is a statement about the past.** The peer
  prior's 40-company cap exists precisely to stop "biggest" masquerading as
  "best fit"; the same cap, or an equivalent, belongs on anything built from §2.
- **65.4% of events attribute to a publishable leaf.** The remainder sit on
  parents, frameworks or closed schemes. 55 publishable leaves have no traced
  award at all and no posterior can be built for them; they must score neutral,
  not zero, for the same reason `awardScorer` returns 1.0 for the 98 funds
  without an award median.
