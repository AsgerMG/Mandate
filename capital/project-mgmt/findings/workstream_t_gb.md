# Workstream T — Great Britain

## The finding, before any fetching

**GB's 16 publishable leaves are not funds. They are UKRI's internal
classification of an award, and the correct response is corpus repair, not
coverage.**

This was the first question the workstream was asked to settle, and it settles
against fetching. Filling eligibility text against these rows would have made
sixteen non-funds look like sixteen funds.

## What GB looked like at the start

`scripts/measure_sibling_by_country.ts`, which measures only rows a founder can
actually be shown:

```
country  leaves   nothing recorded   administering_body   eligibility_text   body+region+text
GB          16     16.0   0%   0%    16.0   0%   0%      16.0   0%   0%      16.0   0%   0%
ALL        549     41.1   0%   0%    16.7  21%  91%       7.0  49%  65%       3.4  64%  95%
```

GB is the only country in the corpus at **0% field presence on every facet**.
Not low — zero. Sixteen leaves, mean residual class 16.0, meaning a founder who
has told us everything we record is still choosing between all sixteen.

Whole-corpus baseline at the same moment (`measure_sibling_coverage.ts`):
mean class **3.9**, ceiling **@5 82%**, over 797 leaves.

## Where the sixteen rows come from

`ETL/events/extract/extract_innovate_uk.py` reads UKRI's Gateway to Research
API and maps one field to the thing we split Innovate UK on:

```python
"programme_name": (proj.get("grantCategory") or "").strip() or None,
```

`populate_funding_instruments.py` then makes one instrument per distinct
`programme_name`. So every GB leaf is a distinct value of GtR's
**`grantCategory`**.

The full domain of that field, counted across the 330 cached GtR pages
(`data/raw/innovate_uk/page_*.json`), is what settles it. 35 distinct values,
and they are plainly a classification of an award, not a list of offers:

| kind | values |
|---|---|
| competition *format* | Collaborative R&D (11,585), Feasibility Studies (5,461), Demonstrator, CR&D Bilateral, CRD, Centres, Large Project, Study, Vouchers, Procurement, Fast Track |
| *phase* within one old programme | GRD Proof of Concept, GRD Development of Prototype, GRD Proof of Market |
| a government **department** | Department for Science Innovation & Technology, Legacy Department of Trade & Industry, BEIS-Funded Programmes |
| an **organisation**, not an instrument | Knowledge Transfer Network, Business Connect, European Enterprise Network, Special Interest Group |
| funding **origin** | EU-Funded, Legacy RDA Grant for R&D, Legacy RDA Collaborative R&D |
| literally unknown | Unknown (6) |
| an actual named programme | Knowledge Transfer Partnership, Small Business Research Initiative, Investment Accelerator, Launchpad |

A founder cannot apply to "Collaborative R&D". They apply to a *competition*
that happens to be of the collaborative-R&D format.

## Confirmed against the live application service

The Innovate UK Funding Service competition search
(`apply-for-innovation-funding.service.gov.uk/competition/search`) was read on
2026-08-06. Every open competition is a specific named thing:

- Quantum computing applications for large scale impact: CR&D
- Farming Innovation Programme: Feasibility Round 5
- DRIVE35 Innovation Fund: Collaborate 3
- UK-Switzerland CR&D Round 3
- Next Wave: Breakthrough Wave 1

Nothing on the service is called "Collaborative R&D", "Feasibility Studies",
"Study", "Centres", "Demonstrator" or "Responsive Strategy and Planning".
"CR&D" and "Feasibility" appear only as *format suffixes inside* a real
competition's name — which is exactly what `grantCategory` records.

The applicable unit in the UK is the **competition**, and GtR does not carry
competition identity at all. There is therefore no path from this source to a
founder-applicable row, at any fetching effort. That is the load-bearing point:
the gap is not missing text against these rows, it is that these rows are the
wrong objects.

## The four exceptions

Four of the sixteen name something a founder really can approach, because they
are standing programmes rather than formats:

- Knowledge Transfer Partnership
- Small Business Research Initiative
- Investment Accelerator
- Launchpad

These are the only GB rows for which fetching eligibility is meaningful.

---

# What was done

## 1. The contract, fixed where it was broken

`ETL/events/extract/extract_innovate_uk.py` no longer writes `grantCategory`
into `programme_name`. The classification is kept one line above, in
`sector_tags_raw`, where a classification belongs.

The column's contract is now stated at the split site in
`populate_funding_instruments.py`: **a `programme_name` must name an OFFER.**
The split itself is correct and was left alone — it did exactly what it is
written to do, on a column that had been filled with the wrong kind of thing.

The detector for the next source that does this already exists and is named
there: `scripts/measure_sibling_by_country.ts`. A legitimate programme split
makes siblings distinguishable. A classification dressed as a split leaves
every child identical to every other, which is what a mean class equal to the
child count means — GB read exactly 16.0 across 16 children.

## 2. The sixteen rows, removed from both stores

SQLite and Postgres, GB-scoped, nothing else touched. `instrument_profiles`
carried 16 derived vectors for them and those went too, or the vector index
would have kept proposing rows the corpus no longer holds.

Nothing was lost. `innovate_uk` is the full rollup — 17,012 events against
16,856 across the sixteen children — so the award history is intact on the
parent, and `funding_instrument_sources` maps the six source slugs to the
parent, not to the children. The events themselves are untouched apart from
`programme_name`, which is now NULL for this source so a rebuild agrees with
the repair instead of re-manufacturing it.

## 3. The row that was hiding behind them

Removing the children unmasked `innovate_uk`, which is a real thing a founder
approaches and which had been unpublishable purely because it was a parent.

It was already carrying **a real application route** — `instrument_application`
holds `channel: "Innovation Funding Service (IFS) online portal"`, quoted from
an actual Innovate UK competition page — and the product could never show it,
because the row it hangs on was masked by sixteen rows that are not funds. That
is the clearest statement of the defect: we held the right answer for the UK
and published sixteen wrong ones in front of it.

It now carries:

- `name` — "Innovate UK", curated in `data/reference/programme_names.json` with
  its source. The derived name title-cased the source slug to "Innovate Uk".
- `eligibility_text` — 2,136 chars of Innovate UK's own standing funding rules
  (business-led projects; Companies House registration with FC/BR prefixes and
  the Crown Dependencies excluded; project activities carried out in the UK;
  RTO lead conditions; two grant-claiming partners and the 70% single-partner
  cap; research-organisation rates of 80% FEC academic / 100% other).
- `eligibility_source_url` — the funding-rules page the text was read from, not
  the application portal. Provenance is where the words came from.
- `eligibility_confidence` — **medium**, deliberately not high. These are
  programme-level rules. Innovate UK does not award against them directly; it
  awards through individual competitions that each publish their own binding
  eligibility, and the text says so in its last sentence.

The per-size, per-research-category grant intensity table is **absent on
purpose**. It could not be retrieved verbatim from the funder's own pages on
this pass, and writing remembered percentages onto a live row is the exact
defect the honesty rule names.

Loaded through `load_scheme_text.py --country GB --write`, which published to
Postgres and reconciled: *"in sync: 3 rows with eligibility_text in GB are
present in both stores."* Read back out of Postgres afterwards, and the two
stores were asserted equal field by field.

# The numbers, read out of Postgres

Per-country, `scripts/measure_sibling_by_country.ts` (publishable rows only):

```
              leaves   body+region+text
GB before         16   16.0    0% unique
GB after           0   -- no multi-leaf regime left in GB
```

GB now holds one publishable row with no siblings, so it leaves the
sibling measurement entirely rather than scoring well in it.

Whole corpus, `measure_sibling_coverage.ts`:

```
                       before      after
leaves in multi-leaf     797        780
mean class (geo+text)    3.7        3.4
ceiling @1               53%        54%
CEILING @5               82%        84%
```

**Read this honestly.** The corpus number moved because sixteen non-funds left
the population, not because any two real siblings became distinguishable. That
is a real improvement — a founder was being shown sixteen indistinguishable
things that were not funds — but it is denominator movement and should never be
reported as a chooser getting better. GB's own contribution to the old 3.9 was
large precisely because 16 leaves each sat in a class of 16.

# Two things this turned up that belong to other people

**The answer key is keyed to non-funds.** 192 pairs in
`__recallSetComposed.json` name one of the sixteen deleted rows as the fund a
company won — 69 of them in the tune split, 3.5% of it. A pair asserting that a
company "won Collaborative R&D" cannot be right in any sense a founder cares
about, because that is a competition format. Workstream R owns the recall set;
these pairs want re-deriving against `innovate_uk` itself.

`check_recall_floor` is red at pool 74% against a floor of 90%. **It was already
red before this workstream started** — main's HEAD is "Put the pool floor back
to 90 and leave the build red", and the check's own header documents the same
tree reading 97% and 77% seven minutes apart. This workstream can account for
at most ~3.5pp of the gap. Every other check in `npm run check` passes: all 12
archetypes, leaf cap, payload budget, client boundary, recall leaks.

**The JSON fallback still serves the deleted rows.** `loadDbInstruments()` reads
`website/frontend/public/data/instrument_terms.json`, and only
`hydrateDbInstruments()` reads Postgres. That export still holds all 21 old GB
records. It is regenerated by `website/build/eligibility_export.py` **from
SQLite, which is already repaired**, so the next regeneration produces the
correct GB state with no further work. It was deliberately not regenerated here
because generated artifacts belong to K2 and rebuilding it would publish every
other agent's in-flight SQLite edits alongside this one.

# What real GB depth would take, and what blocks it

The applicable unit in the UK is the competition, and there are hundreds live at
any time on the Innovation Funding Service, each with its own published
eligibility, scope and deadline. That is the only route to a GB corpus with
genuinely distinguishable rows.

It is blocked today by `meetsDataFloor`, not by fetching: an open competition has
no award history, so it carries no amounts and no dates, and
`publishableInstruments()` drops it for exactly the right reason — a guess scored
at its midpoint was outranking measured funds. Loading competitions therefore
needs that question answered first (how a row with published terms but no
disbursement record is scored), and it is a source-sized piece of work, not an
enrichment pass. It was not started here.

No 403 and no CAPTCHA was encountered; nothing was skipped for access reasons.
