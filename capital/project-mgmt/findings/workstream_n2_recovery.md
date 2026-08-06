# Workstream N2 — landing the three caches this project already found

Branch `wsN2-eligibility-recovery`. Recovery only: no new LLM spend, no paid API.
Written as the findings land, not at the end.

Verification rule for this file: **no number appears here unless it came back out
of Postgres.** `load_scheme_text.py` writes SQLite and the product reads Postgres;
nothing syncs them. A previous agent reported France 45.4 -> 7.4 against SQLite
while Postgres had not moved at all.

## Baseline, read out of Postgres 2026-08-06

`npx tsx website/frontend/scripts/measure_sibling_coverage.ts`, 53 multi-leaf
regimes / 797 leaves:

```
ALL THREE J OMITTED           mean class 11.8   uniquely identified 41%
GEOGRAPHY + eligibility_text  mean class 11.5   uniquely identified 46%
eligibility_text over 40 chars: 318 of 1014
  EU 11/67 16%    SE 10/63 16%    NO 1/74 1%
```

(The 18.0 in the earlier workstream files is stale — FR and DE landed since.)

---

## FINDING 1 — the quote cache is an EU prize and almost nothing else

`project-mgmt/probe_quote_harvest.py`. Instruments with empty `eligibility_text`
that already hold >=40 chars of **cited-tier** verbatim quote in
`eligibility_gates.quote` / `eligibility_clauses.quote`:

```
cached in the corpus                        155
  ... in a multi-leaf regime (scoreboard)    82
  ... AND publishable (the 721 rows)         40
  ... of those 40, in country EU             40
```

**Every single publishable, on-scoreboard harvest candidate is an EU row.** Every
other country contributes exactly zero. The split, which is the answer the brief
asked for early:

```
cc   cached  on-board  publishable-on-board
EU       54        41           40
NO       16         0            0
LV       15         2            0
EE       12         4            0
FR        7         3            0
DK        7         3            0
IE        6         2            0
... 15 more countries, all 0 publishable-on-board
```

Two independent filters do the work. The non-EU cache is (a) mostly singleton
regimes — one leaf, no sibling to be distinguished from, so text moves the metric
by construction-zero — and (b) where it *is* on the scoreboard, the row is one the
register says has closed and `publishableInstruments()` drops before a founder
sees it. The 163 were real; they were never worth 163.

The brief's `~0.76 of the mean sibling class` was sized on all 1,014 rows. On the
721 the product publishes, the harvest's whole reachable population is 40 leaves
in nine EU regimes.

## FINDING 2 — three of those nine regimes must not be harvested, and the reason
### generalises past this corpus

`project-mgmt/probe_boilerplate.py`. The sibling metric keys on the *string*, so
two texts sharing 95% of their sentences both count as separated. The test:

> a candidate's text earns its place only if the part of it that **no sibling
> also states** is large enough to be an answer on its own — `own_share`, the
> fraction of its characters carried by sentences appearing in no other leaf of
> the same regime. Floor 0.34.

Nothing in that test names a country, a regime or a fund; it runs on regimes
nobody has looked at yet.

```
regime                  lf cand pub  mean own_share   min   verdict
horizon_eu_partnership  10    9    9          0.99   0.94   per-fund
ipcei                   12   11   11          0.95   0.82   per-fund*
horizon_eu_pillar_ii    10    9    9          0.49   0.21   MIXED
```

**`horizon_eu_pillar_ii` fails.** Its leaves are the Horizon Europe General
Annexes copied onto every cluster — `horizon_eu_cl5` carries 4 sentences of its
own out of 34. Writing these would take EU coverage up and cut the class by
nothing a founder could use. What actually separates a Pillar II cluster is its
scope and its administering agency (REA / HaDEA / CINEA / ERCEA), neither of which
is in the quotes.

\* **`ipcei` passes the mechanical test and still must not be written**, which is
the limitation of the test worth recording: `own_share` catches copy-paste, not
*same content freshly worded*. Each IPCEI quote comes from a separate Commission
State aid decision, so the sentences differ while the content is the same genre —
a compatibility finding about aid **already granted to a named list of
beneficiaries**. "The Member States only grant support to the beneficiaries listed
section 2.2.6" is not an eligibility rule; read as one by a founder it is false.
See Finding 4.
