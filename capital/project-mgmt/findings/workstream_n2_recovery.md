# Workstream N2 — landing the three caches this project already found

Branch `wsN2-eligibility-recovery`. Recovery only: no LLM spend, no paid API, one
free CC0 pull from a host the corpus already reads.

Verification rule for this file: **no number appears here unless it came back out
of Postgres.** `load_scheme_text.py` writes SQLite and the product reads Postgres;
nothing syncs them. A previous agent reported France 45.4 -> 7.4 against SQLite
while Postgres had not moved at all. Every batch below was re-measured with
`npx tsx website/frontend/scripts/measure_sibling_coverage.ts` after writing.

## Headline

```
                              start of N2    end of N2
ALL THREE, all 1,014 rows        11.8           3.9      unique 41% -> 53%
ALL THREE, publishable 721        n/a           4.2      unique      -> 59%
eligibility_text >40 chars     318/1014      464/1014
  SE                            10/63          59/63
  EU                            11/67          47/67
  NO                             1/74          17/74
```

138 rows written, 0 fetches for 90 of them, 11 rows refused on evidence.
(FR/DE/ES movement in the same window is other agents' work, not mine.)

---

## FINDING 1 — the quote cache is an EU prize and almost nothing else

`project-mgmt/probe_quote_harvest.py`. Instruments with empty `eligibility_text`
that already held >=40 chars of **cited-tier** verbatim quote:

```
cached in the corpus                        155
  ... in a multi-leaf regime (scoreboard)    82
  ... AND publishable (the 721 rows)         40
  ... of those 40, in country EU             40
```

**Every publishable, on-scoreboard harvest candidate was an EU row.** Every other
country contributed exactly zero. The split, which the brief asked for early:

```
cc   cached  on-board  publishable-on-board
EU       54        41           40
NO       16         0            0
LV       15         2            0
EE       12         4            0
FR        7         3            0
DK        7         3            0
... 16 more countries, all 0
```

Two filters do it. The non-EU cache is (a) mostly singleton regimes — no sibling
to be distinguished from, so text moves the metric by construction-zero — and
(b) where it *is* on the scoreboard, the row is a regime container or a scheme
the register says has closed, which `publishableInstruments()` drops before a
founder sees it. Of the 88 non-EU candidates outside FR/ES, **35 are regime
parents and none is a publishable leaf of a multi-leaf regime.**

The 163 were real. They were never worth 163.

## FINDING 2 — three regimes had to be refused, and the exact test beat the heuristic

`project-mgmt/probe_boilerplate.py` first asked the obvious question: is a
candidate's text its own, or its regime's? The property, stated to hold for
regimes nobody has looked at:

> a candidate's text earns its place only if the part of it that **no sibling
> also states** is large enough to be an answer on its own — `own_share`, the
> fraction of its characters in sentences appearing in no other leaf of the same
> regime. Floor 0.34.

That test flagged `horizon_eu_pillar_ii` (mean 0.49, min 0.21) and passed
`horizon_eu_partnership` (0.99) and `ipcei` (0.95).

**It was not enough, and the thing that beat it is exact rather than statistical.**
All nine Horizon Pillar II clusters cite ONE source document between them:

```
regime                  leaves  distinct source documents
horizon_eu_pillar_ii        10   1   horizon_eu_general_annexes_2026_2027.pdf (9 leaves)
edf                          3   1   edf_work_programme_2025_partII.pdf (2 leaves)
horizon_eu_partnership      10   9
ipcei                       12  11
chips_ju / eit_* / eic       -   one per leaf
```

Six of the nine Pillar II clusters had **passed** the own-share test on 0.46-0.85
by quoting *different excerpts of the same annex*. Different excerpts of one
regime document are still one regime document. So the harvest now gates on both,
exact first:

> a quote whose `source_file` is cited by more than one leaf of its regime is
> evidence about the REGIME, not the leaf, and does not count toward that leaf's
> own text.

11 rows refused on that ground: 9 Pillar II clusters, 2 EDF lots. What actually
separates a Pillar II cluster is its scope and its administering agency (REA /
HaDEA / CINEA / ERCEA), neither of which is anywhere in the corpus.

## FINDING 3 — `administering_body` can be read out of the document, not asserted

`ETL/terms/derive_administering_body_from_docs.py`. `horizon_eu_partnership` is
nine legally distinct Joint Undertakings with `administering_body` NULL on all of
them. The obvious fix is a hand-written map of id -> name; that is a register,
unverifiable and unrunnable on a regime nobody has curated. Instead the body is
read from the document the instrument's own gates were cut from, and any name
that cannot be attested there is refused.

**Frequency is the wrong signal and produced a wrong answer.** Scoring by raw
mentions made the *European Space Agency* the administering body of an EU space
instrument, because a partner was named seven times on two pages of a 315-page
work programme. The body that RUNS a programme recurs across its sections, so the
signal is **page reach**, over every suffix of every match — which makes reach
monotone in name length, and puts the registered name exactly at the knee of that
curve, where prose stops.

```
chp             -> Clean Hydrogen Joint Undertaking            22 pages
clean_aviation  -> Clean Aviation Joint Undertaking            12
europes_rail    -> Europe's Rail Joint Undertaking             10  (beat European Union Agency for Railways, 5)
eurohpc         -> EuroHPC Joint Undertaking                    4
gh_edctp3       -> Global Health EDCTP3 Joint Undertaking       3
sns_ju          -> Smart Networks and Services Joint Undertaking 4
ABSTAIN euspa, ihi, sesar_ju
```

The three abstentions are honest and each is a real finding:
- **`euspa`** — its gates were cut from `euspa_horizon_wp7_...pdf`, which is the
  Horizon Cluster 4 work programme, i.e. **not EUSPA's own document**. The tool
  correctly refuses to name a body a document does not claim to be.
- **`ihi`** — the IHI call text names its predecessor (IMI2) on as many pages as
  itself. Below the floor; refused rather than guessed.
- **`sesar_ju`** — `sesar_ju_bawp_2026_2027.pdf` is on disk and names the SESAR 3
  Joint Undertaking on 12 pages, but **it is not recorded as a source for the
  instrument**; only `sesar_ju_qa_document_v1.pdf` is. A fetch-record gap in
  someone else's file, reported rather than papered over.

## FINDING 4 — `ipcei` passes every mechanical test and still must not be written

Recording this as a judgement, not smuggling it into a threshold, so it can be
overruled.

The 11 IPCEI leaves each cite their own Commission decision, score `own_share`
0.82-1.00, and are cited-tier. They pass both gates. But the genre is wrong: the
quotes are compatibility findings about aid **already granted to a named, closed
list of beneficiaries**, not conditions an applicant can meet. "The Member States
only grant support to the beneficiaries listed section 2.2.6" read as an
eligibility rule by a founder is false. A founder cannot apply to "IPCEI
Batteries".

This is the limitation of `own_share` worth recording: it catches copy-paste, not
*same content freshly worded*. Eleven separately drafted Commission decisions say
the same kind of thing in different sentences and score as fully distinct.

**Had they been written, publishable mean class would have fallen further by
roughly the 11 leaves' worth.** The honest fix for IPCEI is a liveness marking,
not eligibility prose, and that is a different workstream's call.

## BATCH 1 — 19 EU leaves harvested, 11 refused. Postgres 11.8 -> 7.0

```
                          before   after
ALL THREE (1,014)          11.8     7.0     unique 41% -> 45%
EU eligibility_text       11/67    30/67
administering_body present  82%     90%
```

Provenance is honest: `eligibility_fetched_at` carries the **quote's own capture
time**, never the time of the load. `eligibility_source_url` is NULL for these —
the corpus holds filenames (`chp_clean_hydrogen_awp2026.pdf`), not URLs, for the
EU call documents, and the citation remains the gate's `source_locator`. Inventing
a plausible `ec.europa.eu` URL would be the same lie in a different column.

One product decision inside the loader: the column is capped, and quotes **no
sibling states are ordered first**, so the characters a founder reads are the
condition a sibling would fail rather than the one they all pass. Ordering by
gate key had been keeping the shared Horizon participation rules.

## BATCH 2 — Sweden. 48 of 49 leaves, regime class 49.0 -> 1.00

```
                          before   after
ALL THREE (1,014)           7.0     4.1     unique 45% -> 51%
SE eligibility_text       10/63    58/63
vinnova_grant regime       49.0     1.00    (49 publishable leaves)
```

`ETL/terms/load_vinnova_call_eligibility.py`, from `data.vinnova.se` (CC0, the
same host `ETL/events/extract/extract_vinnova.py` already reads for awards).
Chain: `program.Titel` -> `Diarienummer` -> `utlysningar.DiarienummerProgram` ->
`ansokningsomgangar.DiarienummerUtlysning`; `WebTextLista` TextID 2 =
"Vem kan söka?". All 49 leaves matched a programme title exactly.

**The SIP-family boilerplate risk was checked BEFORE the write, and did not
materialise.** 48 leaves, 48 distinct texts, none below the own-share floor. The
family states genuinely different rules:

```
sip_medtech4health   under 50 staff and under EUR 10m turnover
sip_produktion_2030  two manufacturers + a university + one more actor
sip_internet_of_things  a municipality or region, plus one company
sip_lighter          SMEs only
sip_grafen           consortium of >=3, including a research institute
```

13 leaves take an OPEN round and are written at `high`; **35 take the most recent
closed round and are written at `medium`** — a past round's rules are evidence
about the programme, not a promise about the next call, and confidence is the
only place that can be said. One leaf abstains: 21 rounds, none with a populated
"Vem kan söka?".

Text is Swedish, matching the corpus convention that `eligibility_text` is the
fund's own words in its own language (the German rows are German). **Vinnova
publishes an official English rendering of the same field in the same record**,
so an English column would cost no fetch — worth knowing for whoever wants one.

## BATCH 3 — 71 publishable singletons. Memo value, NOT sibling separation

The rest of the cache, restricted to rows the product can actually show (the
liveness test is imported from `load_scheme_text.live_ids`, not restated).
Publishable mean class 4.4 -> 4.2 — near-nothing, exactly as Finding 1 predicted,
because these are singleton regimes.

They were written anyway and are reported separately: they are real cited prose
on 71 funds a founder can be shown, and a citable "who may apply" is worth
something in a memo even when it separates nothing. **It must not be read as
progress on the sibling metric.** NO went 1/74 -> 17/74 on this batch and its
sibling class did not move, because 73 of 74 Norwegian rows are singletons.

---

## Where the remaining publishable mass is

```
cc    leaves   cov   mean class
FR       105   70%      7.7      owned by another agent
ES        87    6%      6.7      owned by another agent
GB        16    0%     16.0      UNOWNED, and untouched by every field we record
EU        50   56%      4.7      the 11 IPCEI + 9 Pillar II refusals above
CZ        29   14%      4.2
DE        72   83%      1.1  |  SE 56 96% 1.0  |  IT 32 88% 1.2  |  AT 15 93% 1.4
```

**GB is the largest unowned prize left and no recovery can touch it**: 16
publishable leaves in `innovate_uk`, zero coverage, and `administering_body`,
`delivery_region` and `eligibility_text` are all constant across them, so the
class equals the group size on every facet. Its 2 cached candidates are not
publishable leaves. It needs a fetch, not a recovery — and unlike Sweden, no
free per-call register has been located for it yet.

## What the next agent should not repeat

1. **Do not size a harvest on all 1,014 rows.** 293 of them never reach a
   founder, and the cache is concentrated in exactly those.
2. **Do not trust `own_share` alone.** Check whether the regime's leaves cite one
   document first; it is exact, it is one SQL query, and it caught six rows the
   statistic passed.
3. **Do not score body names by frequency.** Page reach, over suffixes.
4. **`sesar_ju`'s work programme is on disk and unlinked.** One row of
   `eligibility_gates.source_file` would resolve its administering body.
5. **Nothing in this workstream is in SQLite only.** Every batch went to Postgres
   in the same command and was re-measured out of Postgres afterwards.
