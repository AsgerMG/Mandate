# Three things next: guard the pipeline, name the funds, and give them their own rules

Written 2026-08-01. Every number measured against the live corpus.

## Context

Today closed most of the breadth work: 932 instruments, 743 of 861 complete on
all six evidence axes, four sources split down to the programme a founder
applies to, an explicit hierarchy, and the payload halved. It also exposed that
**production had been ranking on a statistic the tests never used** — the award
medians were computed, exported, and silently never written to Postgres, so
10 of 12 archetypes ranked differently in production than in every test run.

That last fact shapes all three items below. The first exists so it cannot
happen again; the third is the largest remaining gap in what the product can
actually say about a fund.

---

## 1. Put the parity check in the pipeline (small, do first)

`check_hydration_parity.ts` is the only test that can see the Postgres path —
every other check runs `NO_PG=1` against the JSON fallback. It found four real
defects today, one of which had been wrong in production for days. It currently
runs only when invoked by hand.

- Add it to `ETL/refresh.py`'s step list, immediately **after**
  `migrate_to_postgres.py` and **before** the embed steps, so a store mismatch
  stops the run before anything expensive happens.
- It already skips cleanly without `DATABASE_URL`, so CI stays green.
- It needs SQLite and Postgres in step, which is exactly true at that point.

**Verification**: break it deliberately — drop a column from the migrate insert
list, confirm the refresh stops and names the axis.

---

## 2. Real names for the remaining slug rows

Rows like `Altum (Latvia) · garantijas 3 1 1 1 pas k` are distinct but
unreadable. 36 instruments were named today from agency registers; the rest have
no name field in any feed we hold.

The names exist in each fund's own documents. **51 of the affected instruments
already have a document on disk**; the rest need fetching, which is free, from
the catalogue pages verified in `seed_agency_routes.py`.

- Fetch first, extract later: getting the documents on disk costs nothing and is
  the long-lead item. Reading a name out of one needs a model call.
- `<h1>` and `<title>` carry the name on the pages already sampled ("Aizdevumi
  digitalizācijai", "Lielo investīciju aizdevums ar kapitāla atlaidi"), but a
  regex over them also yields "Normattiva - Il portale della legge", so the
  judgement is not mechanical.
- Names replace the measured descriptor; they never sit alongside it.

**Do not** synthesise from project titles or prettify slugs. Prettifying was
tried and rejected on sight: it produces "Anm Kepa".

---

## 3. Fund-specific rules — researched, and the answer is yes

### The question

**86% of publishable programmes (744 of 869) hold no eligibility rule of their
own.** They inherit their regime's, which is correct as far as it goes — a
notified scheme really is governed by its regime — but it means the product
cannot distinguish two schemes under the same regime. Those 744 carry **55% of
all awards in the corpus**.

### The evidence that scheme rules genuinely differ

Within a single regime, schemes operate under **different GBER articles**, and
those articles carry materially different eligibility and aid intensities:

```
satr_fr_rnd    61 schemes    9 distinct aid objectives
satr_de_rnd   985 schemes    8
satr_it_rnd   261 schemes    7
```

Article 25 is R&D project aid, capped by research category. Article 22 is
start-up aid with company-age and unlisted-SME conditions. Article 21 is
risk-finance aid. A founder told "this regime funds R&D" when the specific
scheme they are looking at is start-up aid has been told something false about
the thing they would actually apply to.

### What is free, and it is a lot

`GBER_ARTICLE_GATES` in `populate_funding_instruments.py` already maps eight
articles to a requirement, a gate family and an intake field. `seed_inventory_gates`
already applies it — **but only at family level**, from `fam_aid_objective_votes`.

Seeding it per SCHEME CHILD instead, from that child's own events:

**327 scheme-children have a ≥50%-dominant GBER article.** Every one would gain
a rule that is genuinely its own, derived from data already in the corpus, at
zero API cost.

    Art 25 (R&D project aid)        235 schemes
    Art 22 (start-up aid)            19
    Art 21 (risk finance)             8
    Art 29 (process innovation)       6
    Art 28 (SME innovation aid)       6

This is the same computation that already runs one level up. The only change is
the grouping key.

### What is not free, and should wait

The other ~417 have no dominant article, or are development-bank programmes with
no notified scheme at all. Those need their own documents read — the same
fetch-then-extract job as item 2, and the same credit dependency. Sequence them
behind it, in award-volume order.

### The guard this needs

An article gate asserts something about a specific scheme. Wrong, it disqualifies
a founder from a fund they could have had. Two protections, both already built:

- `audit_encoding_vs_reality.py --quarantine` checks every encoded rule against
  who the scheme actually paid, and has already overruled me once (516
  tobacco-sector awards under a scheme I claimed excluded tobacco). Run it after
  seeding.
- The dominance threshold. A scheme whose events split evenly across three
  articles is not "an Article 25 scheme" and must not be labelled one; 327 of 329
  clear 50%, so the threshold costs almost nothing and prevents the bad case.

---

## Order

1. **Parity check into `make refresh`.** Fifteen minutes, and it closes the hole
   that let today's worst bug ship.
2. **Per-scheme GBER article gates.** Free, 327 instruments, and it is the first
   time most of them will say anything about themselves.
3. **Fetch the fund documents.** Free, unblocks both the names and the remaining
   rules whenever credits return.
4. Extraction of names and per-fund rules from those documents, credit-gated.

## Verification

```
python3 ETL/terms/coverage_gate.py            # no axis may fall
python3 ETL/terms/audit_encoding_vs_reality.py --quarantine
NO_PG=1 npm run check                          # 105 tests, 12 archetypes
NO_PG=1 npx tsx scripts/red_team.ts            # exclusions must not weaken
npx tsx scripts/check_hydration_parity.ts      # both stores agree
```

The archetypes are the real test for item 2: giving 327 schemes their own rule
should make more of them *assessable*, not fewer of them reachable. If a green
archetype loses routes, the article mapping is wrong rather than the corpus.
