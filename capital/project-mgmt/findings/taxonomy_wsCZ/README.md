# wsCZ — the taxonomy is fixed. The film scheme is still at row 4.

Both halves of that sentence are the finding, and the second one supersedes
wsCY's diagnosis.

## 1. The population

**2,738 companies carry a technology `sector_top` that every official activity
descriptor on their own record contradicts.** They are not one class:

| claimed sector | companies |
|---|---|
| software_data_ai | 962 |
| energy_cleantech | 469 |
| mobility_transport | 384 |
| industrial_manufacturing | 370 |
| agrifood | 220 |
| health_life_sciences | 154 |
| semiconductors_electronics / materials_chemicals / defense_security / space | 179 |

The bleed is always the same shape and it is not a labelling accident. A film
fund's recipients are film producers. An ADEME tourism-transition fund's are
hotels. The German EV-charging fund's are wholesalers who installed a charge
point. Reading the programme back onto the recipient is what makes a fund read
as a technology fund.

At instrument level: **290 instruments' recipient mixes move, 29 change dominant
class, and 28 of those 29 are `technology -> other`.** So the correction is
concentrated in exactly one direction — removing technology claims that were
never evidenced — rather than shuffling funds between sectors.

## 2. The property

> `sector_top` is a claim about what a company's core business BUILDS. Only
> evidence about the company's own activity licenses it. A grant is evidence
> about the PROGRAMME, never about its recipient. The official registered
> activity descriptor outranks anything we derived (Rule Zero), so where EVERY
> official descriptor NAMES an activity with no technology, science or
> engineering dimension, no technology sector may be claimed.

Three boundaries, each with its own test in
`ETL/events/transform/test_sector_evidence.py`:

- **Asymmetric.** A veto refuses a claim; it never re-assigns one. A coarse code
  (`MANUFACTURING`) is weaker evidence than project text and never overrides it.
  A wrongly-reclassified company is a fund a founder never sees.
- **A code must NAME an activity to veto one.** Residual and holding
  registrations name none. miDiagnostics is registered under management
  consultancy and is a diagnostics company; ARGON Measuring Solutions likewise
  and builds sensors.
- **Silence is not a veto.** An unrecognised descriptor is not evidence that a
  company sits outside technology. This is why the four Czech companies that own
  the surviving ranking change are untouched: they carry no official code at all.

The codebook is `data/reference/activity_codebook.json` — one file, both
languages, three ordered steps. The first run of the guard proved why: with only
the `nontech` half, NACE section R (`HUMAN HEALTH AND SOCIAL WORK ACTIVITIES` —
the section containing hospitals) read as an activity with no science in it.

## 3. What it buys, measured

`_wscu_memo.ts`, N=300, seed 20260806, every run `all 590 request(s) on
EMBEDDING`. Arm A was run twice and is bit-for-bit identical, so anything that
moves is signal.

| | EXACT@5 | MEMO@6 |
|---|---|---|
| tune, before | 31.7% (95/300) | 30.7% (92/300) |
| tune, after | 31.3% (94/300) | 30.3% (91/300) |
| **holdout, before** | **27.0% (81/300)** | **26.3% (79/300)** |
| **holdout, after** | **27.0% (81/300)** | **26.3% (79/300)** |

**Holdout is identical at every k from 1 to 7.** On tune exactly one pair moves,
`tacr_tl` for a Czech founder, well inside the ±5.2 half-width. `check_recall_floor`
green: pool 97 (floor 92), EXACT@5 27 (floor 15), REGIME@5 73 (floor 69).

And the honest number on the metric that should have moved:

| | technology founders shown a fund whose recipients are majority non-technology |
|---|---|
| before | 25/240 (10.4%) |
| after | **25/240 (10.4%)** |

Unchanged. The first version of that metric defined its subject as "funds whose
published mix contradicts their recipients", which is empty by construction after
the correction and reported a meaningless 8.0% -> 0.0%. Redefined to be
arm-invariant, it moves by nothing.

## 4. Why — and this is the part that matters

Aleph Alpha's memo, before and after, on the production ranker:

```
row 4  Bayerische Richtlinien ... Film-, Fernseh- und anderen audiovisuellen
       BEFORE   mix software_data_ai 71%
       AFTER    mix other 100%
       rank 4 -> rank 4
```

The correction did everything it claims to. Among the **13 publishable German
`loan` leaves**, the three audiovisual schemes went from `sectorFit` **1.00 — the
top of the entire German loan supply for a software founder — to 0.00, the
bottom.** The row did not move by one position.

**It is not ranked by score at all.** `applyPeerPrecedence`
(`shortlist.ts:2047`) is the last reorder, and after one score seat every
remaining position is a copy of `peerPrior.generated.json`'s cell order. The
scheme sits at index 4 of `DE|software_data_ai`; indices 1 and 3 are equity
vehicles a grant/loan founder cannot see. Rank 4, deterministically, from an
artifact with no `sectorMix` column.

Nor is the cell membership a taxonomy error. Regenerating the peer prior with
the veto applied to every recipient's sector (`emit_peer_prior.py
--evidence-veto`, 2,731 recipients re-keyed) leaves `DE|software_data_ai`
**byte-identical**. The scheme is there because **44% of peer-prior slots are
held by inference**: 178,839 awards have no exact leaf and are credited to every
instrument in their source family. 215 awards from 170 genuine German software
companies, made under *other* `satr_de_equity` schemes, credit the film scheme.

So the defect the owner sees has two independent causes, and this workstream
closed the first:

1. **The taxonomy said it was an AI fund.** Fixed, guarded, measured.
2. **The peer prior credits it awards it never made, and peer precedence
   outranks every score.** Untouched. It lives in `ETL/terms/emit_peer_prior.py`
   (the crediting join) and `shortlist.ts:2047` (the strict tier).

## 5. The guard

`check_sector_evidence.ts`, hermetic, three committed artifacts, in
`npm run check` and CI. Red then green, same code, same pin of 0:

```
today's corpus     FAIL exit 1   7 of 360 instruments
corrected corpus   ok   exit 0   0 of 336
```

Six audiovisual schemes and one arts/sports regime. Non-circular: the evidence
artifact carries descriptors and award counts and no judgement; the verdict is
computed in the check. `PINNED = 7` ratchets both ways and goes to 0 when the
Postgres write lands.

## 6. The write for review — NOT executed

`postgres_write_for_review.sql`, from `apply_sector_evidence.py sql`:

- `UPDATE companies SET sector_top='other', subsector='other',
  sector_taxonomy_method='evidence_veto'` for **2,738** ids.
- `UPDATE funding_instruments SET sector_mix=...` for **290** instruments.

Every instrument update is a strict delta on the published counts —
`sum(after) == sum(before)`, asserted per row — never a recount. The first
version did recount, and silently put the recall set back into the graded signal
(187 of 291 instruments came out with a different total, one at 4,477 against
1,407), because the loader withholds one vote per replayed company and a rebuild
does not.
