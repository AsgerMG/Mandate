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
