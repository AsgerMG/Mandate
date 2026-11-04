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

Baseline scoreboard at the start of this workstream (commit `907cd12`):

```
administering_body           mean class 19.7  uniq 15%  present 80%
delivery_region              mean class 30.5  uniq  6%  present 29%
admin_body + delivery_region mean class 19.3  uniq 19%  present 80%
ALL THREE J OMITTED          mean class 18.0  uniq 36%
```

---

## Batch 1 — a hard negative: the body's NAME is not its catchment

The obvious cheap route is to read the granting body's own official name and resolve
the place in it against the NUTS name register — no fetching, works on all 640 leaves
that have a body. It is already documented as having failed once here (as a source for
the *measured* region), so I rebuilt it as a *declared* claim with a general
morphological rule — stem-prefix matching, so `bayern`/`bayerisches` and
`wallonie`/`wallonne` match — and, crucially, **scored it against the measured footprint
on the leaves that have both**, which is the check the first attempt could not run.

It resolves 181 of 640 leaves. Of the 84 where a measured footprint exists to check it
against, **10 are outright contradictions — a 12% error rate** — and the errors are not
noise, they are the rule being wrong:

| body | name resolves to | measured | what the name actually was |
|---|---|---|---|
| ADEME (France) | FR10 Île-de-France | — | the **country**, in a national agency's title |
| Finanzamt Aachen-Stadt | DE144 | DEA | a **branch office** of a national administration |
| POLITECNICO DI MILANO | ITC4C | ITF | the **HQ city** of a national-scope recipient |
| Conseil régional Hauts-de-France | FR10 | FRE | "France" inside the region's own name |
| Enterprise Ireland | IE0 | — | the country again |

The generalisable defect, which is why no amount of tuning saves it: **a place name inside
an organisation's name is not a statement of catchment.** It is sometimes the country,
sometimes the head office, sometimes the branch, and only sometimes the territory served.
The four failure modes above are distinct causes, so there is no single threshold that
removes them, and the false positives are concentrated exactly where the method looked
most productive — "ADEME (France) → FR10" alone would have written a false Île-de-France
claim onto 76 leaves.

**Route abandoned. Do not re-attempt it, in either direction.** The probe is
`scratchpad/probe_bodyname.py`; the numbers above are its output.

## Batch 2 — the source that is actually declared, and is already in the repo

`data/raw/state_aid_cases/cases.json` holds the Commission's own registration for 467 SA
numbers, including `caseRegions` — the regions the scheme is *registered for*. That is a
declared catchment in the strict sense: a filed rule about scope, not a history.

It reaches further than expected because **the SA number is nearly a leaf key**: 453 of
the 797 leaves carry a `scheme_code`, across 377 distinct SA numbers. So the registration
discriminates siblings rather than describing their shared parent.

```
leaves with an SA number matched to a case   453   (0 unmatched)
  case declares a SUB-NATIONAL catchment     163
  case declares country-wide only            290   <- a declared "no regional claim"
```

The 290 matter as much as the 163. Today a NULL `delivery_region` means either "serves
the whole country" or "nobody has looked", and a founder cannot tell those apart. For 290
leaves the Commission has answered it.

Measured on the scoreboard's own definition, before any vintage repair:

```
declared catchment alone       mean class 34.1  uniq 11%  present 57%
measured delivery_region       mean class 30.5  uniq  6%  present 29%
body + measured                mean class 19.3  uniq 19%  present 80%
body + measured + declared     mean class 18.9  uniq 26%  present 80%
```

**+7 points of uniquely-identified leaves from geography alone**, without touching
`eligibility_text`.

### The vintage trap inside it

Comparing declared against measured looked like 25 contradictions. Nearly all are false:
the case register writes NUTS in the vintage current when the scheme was notified, and
the corpus speaks NUTS 2024.

- `Regione Lombardia` declares **IT2**, measures **ITC4** — one place, two vintages.
- `Centro 2030` declares **PT111…PT15** (28 codes), measures **PT19** — same place.
- `Autorità di gestione FESR Campania` declares **IT8**, measures **ITF3**.

So the declared value **must be translated to NUTS 2024 before it is stored or compared**,
or every consumer re-derives the same false disagreement. `nuts_names.json` carries an
`ids` map (id → name, vintages 2024/2021/2016/2013) which gives old id → name → 2024 id.
Codes older than 2013 (`IT2`, `IT8` are NUTS 2006/2010) are not in it and are **skipped,
not guessed**.

### Where it gets written, and why not into `delivery_region`

`delivery_region` is in `BUILT_COLUMNS` of `populate_funding_instruments.py`, i.e. that
pass **owns** it and a rebuild overwrites it. Columns it does not write are preserved by
difference (see its "Columns this pass does not compute belong to somebody else" block).
A declared catchment therefore goes in **new columns**, which makes it survive a rebuild
by construction *and* keeps the two claims from being merged into one string that no
reader could take apart:

- `catchment_region` — the declared catchment, one NUTS 2024 id, country-level allowed
  (unlike `delivery_region`, where a country means "no claim"; here "all of Germany" is
  itself the answer)
- `catchment_regions` — JSON array, for a body serving several regions
- `catchment_source` — where the declaration was read

The brief assumed `delivery_region` was the declared catchment. **It is not**: every one
of its 232 values comes from `staged_region_mix()` and is a measured footprint. That is
recorded here rather than silently reconciled.

---

## Batch 3 — shipped: the declared catchment, on 427 instruments

`ETL/terms/encode_declared_catchment.py`, migration `025_declared_catchment.sql`,
Postgres column DDL added to `migrate_to_postgres.py` so the product path cannot
silently lack it (the failure that hid `eligibility_text` from Postgres for weeks).
Written to **both** stores, in batches of 200 with a commit per batch.

```
leaves with a scheme_code            453
  sub-national catchment declared    122
  country-wide declared              296
  partial (some codes pre-2013)        9
  case names no region                 4
  no code translatable                22
                            written  427
```

### The `CountryDEU` syntax, which `encode_registered_regions.py` is right to drop

286 of the 296 country-wide rows come from a third syntax in `caseRegions` —
`CountryDEU` — that the existing gate encoder skips, correctly: a gate covering a whole
country restricts nobody and would always pass. This column is not a gate, and for it
that value is one of the most useful things in the file. It converts a NULL that meant
"either national or unexamined" into a filed "registered for the whole member state".
The ISO-3 inside it is deliberately not decoded; the instrument row already knows its
own country and a second country map would be a second thing to keep in step with
`europe_scope`.

### The validation, which came out clean

On the 117 leaves that have both a declared sub-national catchment and a measured
footprint: **117 consistent, 0 contradictions.** Before vintage translation the same
comparison showed 25. So the translation is right, and — more useful — the measured
column and the Commission's registration independently agree everywhere they can be
compared. Two different methods over two different sources, no disagreement.

Where translation is only partial (9 rows), the surviving codes are kept in
`catchment_regions` but `catchment_region` is left NULL and the source is tagged
`ec_case_register:partial_vintage`. Rolling up an incomplete set would name a catchment
nobody filed.

### Scoreboard

```
                               mean class   uniq   present
administering_body                   19.6    15%      82%
delivery_region (measured)           30.5     6%      29%
catchment_region (declared)          36.2     6%      52%
catchment_regions (full set)         34.1     8%      54%

admin_body + delivery_region         19.3    19%      82%   <- geography before
BOTH GEOGRAPHIES                     18.8    25%      82%   <- geography after
ALL THREE J OMITTED                  17.9    38%
GEOGRAPHY + eligibility_text         17.6    43%            <- everything
```

Geography alone moves uniquely-identified **19% → 25%**. Combined with the text the
other five agents are collecting, **38% → 43%**, and the two are additive rather than
overlapping — which was the reason for splitting this workstream off in the first place.

Note `eligibility_text` present has moved 29% → 33% during this batch; that is the other
agents' work landing, not mine. I have not written to it.

---

## Handed in here (budget stop)

**Shipped and in both databases.** Nothing is left uncommitted or in-flight.

Not done, in priority order for whoever picks this up:
1. **Spain, 88 leaves, still zero geography.** The BDNS API returns `regiones` per
   convocatoria — a declared catchment — and `fetch_bdns_convocatorias.py` already
   parses it (`_vals(d, "regiones")`) but deliberately routes it into the eligibility
   text rather than a column. Mapping those names through `nuts_regions.resolve()` into
   `catchment_region` is the single largest remaining block and needs no new fetching.
2. **22 leaves whose declared codes are all pre-2013** (Italian and Portuguese
   renumberings: IT8, IT91-93, ITA, ITB, PT113-115, PT131-132). Needs a NUTS history
   file; do not guess them.
3. **344 leaves have no `scheme_code`** and so no route through the case register.
   Class A (EU tier, 85) is correctly out of scope. The rest need a per-register source.

**Do not re-attempt** body-name → catchment (batch 1) or region as a ranking signal.
