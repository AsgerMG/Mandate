# wsIC — both defects fixed, and the gate fix does not make the prompt fix unnecessary

Free. **EUR 0.00 spent, zero model calls, zero production writes.** The
production command is prepared, dry-run clean, and its precondition verified
read-only against live Postgres. It is below, unapplied.

---

## 1. THE GATE — and I am correcting the brief on the repair

The brief asked for the **union** of the two branches:
`allowed: ["b100k_500k","b500k_2m5"]`. **I did not write that, and the reason is
the official page.**

| | |
|---|---|
| what the funder's sentence bounds | **total eligible project costs** — the gate's own verbatim quote is *"have total eligible project costs between £100,000 and £500,000"* |
| what `ticketBand` holds | **the grant sought** — `types.ts:1571` defines it as *"how much they are looking for"* |
| what connects the two | an intensity of **25%–70%**, from the same official page, already in the corpus as `G3-03` and `G3-04` |
| what selects the branch | **project duration** (6–18 vs 19–24 months), which **is not an intake field at all** |

A union is still a machine verdict about a quantity the founder never gave,
derived through a ratio we do not resolve. A founder seeking €2M of grant might
have a €3M project or a €8M one, and the gate cannot tell. **The encoding that
is true to the source is no comparator**: the requirement text stays and is
still shown to the founder as something the assessor weighs, and the verdict
engine stops.

That is not an invention. It is the convention
`apply_gate_encoding_corrections.py` already uses for a rule this product cannot
express, and it is the state **`innovate_uk`'s own `G2-02` and `G2-03` are
already in** — both branch-scoped ("If a large business or RTO leads
collaboratively…", "If the lead organisation is an RTO…"), both `value_spec:
null`. `G3-01`/`G3-02` were the inconsistency, not the precedent.

**Sources.** wsIA's two official citations
([UKRI Smart guidance](https://www.ukri.org/councils/innovate-uk/guidance-for-applicants/guidance-for-specific-funds/smart-innovation-funding-guidance/),
[April 2024 competition overview](https://apply-for-innovation-funding.service.gov.uk/competition/1907/overview/d1149c8e-51ce-4b4e-b0b7-d780d32aa634)),
plus the funder's own words as stored verbatim on the gates themselves
(`source_file: innovate_uk_smart_grants_apr2024.html`, chunks 2 and 3) — the
£ windows, and the 70/60/50 and 45/35/25 intensity caps that separate a project
cost from a grant. No corpus-internal inference was used to reach the verdict.

### What it is worth — measured free, on all 897

`scripts/_wsic_band_counterfactual.ts`: the committed wsHW free walk of all 897
held-out described founders, and the committed snapshot, through the product's
own verdict engine.

```
in scope     109 founders won a corrected instrument (12.1% of 897)

VERDICT ON THE WON ROW, whole population
  band            before   after
  blocked              1       1
  one_blocker        134      25
  open               602     711
  unknown            160     160

FOUNDERS WHOSE WON ROW CHANGES BAND: 109 — all one_blocker -> open
  by stratum: C 109
  109 of them already carry the won fund in our own published six
  109 are EXACT@6 hits for the free control today
```

**Obstructed won rows across the population fall 134 → 25.** Eighty-one percent
of every named obstacle on a won fund in this population came from this one pair
of gates. All 109 are stratum C and all 109 are EXACT@6 hits for the control —
they are precisely the founders the selector can only harm and never rescue.

**`blocked` does not move, and that is the finding underneath the finding.**
wsGE's by-field counting makes two gates on ONE field ONE thing in the way, so
the row never blocked, and **every blocked-count guard in this repo reported a
flat zero while the qualification band was wrong for 109 founders.** The defect
was not merely unnoticed; it was unobservable through any instrument we owned.

### The property, not the patch

`ETL/terms/check_gate_branches.py`, wired into `make eligibility` beside
`check_gate_subject.py`, failing the target:

> Two `filter` gates of one instrument, on one **ordered** field, whose
> requirement texts state **different numeric thresholds**, must not carry the
> same comparator. One answer cannot be tested against two bounds.

Three states satisfy it and there is no fourth: one rule written twice (the
numbers agree), branches decidable by a field we hold (the comparator belongs on
that field), or branches selected by something we do not ask (neither is
decidable and neither carries a comparator).

**The test for a case nobody has seen:** read both requirements and NAME THE
INTAKE FIELD whose answer says which one applies. If you can name it, encode on
it. If you cannot, quarantine both.

Detected by **numerals**, never by branch-marking phrases — a phrase list only
covers sentences someone has already read, and a Latvian branch carries digits
in the same shape as a British one. Ordered fields are read from the generated
vocabulary, so a band scale added tomorrow is covered with no edit. **The check
names no instrument and no country.**

It finds **exactly one violation in 3,656 encoded filters**, identically in both
stores, and it is this one. The correction turns it green.

---

## 2. THE PROMPT

`agentSelect.ts` told the model, from 2026-08-11 to today, that *"a row with a
named obstacle is published below the rows nothing rules them out of, whatever
place you give it"*. `wsGB` deleted that sort on 08-12. **The default now
describes the machinery that exists**, and every clause is named against the
function that performs it in the lever's own comment: `agentSelectRows` (pure
reorder), `orderMemoCandidates` (no `.sort()` at all), `publishRankByKey`
(positional index), `WRITER_CANDIDATE_CAP` → `institutionsMax`,
`resolveNameCollisions` (demote to the back), `pipeline.ts` (`blocker` printed
in the fund's own words).

It **deliberately adds no new push in either direction.** The judgement about
what an obstacle is worth already lives in the two TRUE bullets either side of
it, and those are untouched and pinned by test — so a later run that measures
the removal measures the removal and not a rewritten paragraph.

**No gain is claimed and +8.4 is not quoted anywhere.** wsIA's caveat is right:
the 9.6%-vs-49.2% suppression belongs to the paragraph, and separating the three
sentences is a paid arm nobody has bought.

The retired text stays reachable as `AGENT_SELECT_ORDER_CLAIM=bandSort`, read
once at module scope, throwing on anything unrecognised.

**The band sort was NOT reinstated.** wsIA priced that route: our own six would
lose the won fund on 10 of 11 obstructed-won founders.

### The test marries the two files rather than pinning either

`selectPromptProse.test.ts`: **IF `orderMemoCandidates` performs no sort, the
shipped prompt may not claim one.** Reinstate the sort and the test goes quiet
by itself — it forbids the divergence, not either state. It caught its own first
version reading the function's *comment about* the deleted sort as the sort.

---

## 3. THE THING THE BRIEF DID NOT EXPECT: the gate fix does not absorb the prompt fix

`exposure.py`, replaying both committed tapes:

| | wsHO | wsHW |
|---|---:|---:|
| obstructed rows across all menus | 403 | 412 |
| …that the gate fix opens | 11 (2.7%) | 10 (2.4%) |
| obstructed rows at the head (rank < 7) | 75 | 83 |
| …that the gate fix opens | 11 (**14.7%**) | 10 (**12.0%**) |
| founders carrying an obstructed head row | 48 / 78 (61.5%) | 49 / 78 (62.8%) |
| …**still** carrying one after the gate fix | **37 / 78 (47.4%)** | **39 / 78 (50.0%)** |

**Half the population still carries an obstructed row in the ranker's own top
six after the gate is fixed.** `innovate_uk` was 81% of the obstructed *won*
rows and only ~13% of the obstructed *head* rows. The two repairs are
independent and the second is not made redundant by the first: obstructed rows
are a pervasive feature of these menus (403 of ~2,900), and until today every
one of them was being read against a false description of what we do with them.

*(A floor, not an estimate: a menu prints no instrument id, so only the WON row
can be named exactly on a tape. Every other `innovate_uk` row in a GB founder's
menu is opened by the same correction and is not counted above.)*

---

## THE PRODUCTION COMMAND — NOT APPLIED

```
cd /Users/asgermollergrimberg/Wincent
python3 ETL/terms/apply_gate_encoding_corrections.py --apply --postgres \
  --corrections project-mgmt/evidence/wsic_gate_branch_corrections_2026-08-19.jsonl
```

Drop `--apply` for a dry run; drop `--postgres` to write the authoring store
only. **Both flags are needed**: SQLite alone reaches no founder until a publish,
and Postgres alone is reverted by the next `migrate_to_postgres.py`, which
TRUNCATEs `eligibility_gates` and reloads it from SQLite.

**Blast radius: 2 rows, 2 columns, 1 instrument, in each of 2 stores.**

| | |
|---|---|
| rows touched | `eligibility_gates` where `instrument_id='innovate_uk'` and `gate_key IN ('G3-01','G3-02')` — **2 in SQLite, 2 in Postgres** |
| columns touched | `value_spec` → `NULL`; `encoding_method` → `'quarantined'`. **Nothing else.** `requirement`, `quote`, `value`, `intake_field`, `verification_level` are untouched — they are the funder's own words and they are right |
| founders reached | **109 of 897 (12.1%)**, all 112 GB founders in the population, every one of whom the gate currently fires on |
| what changes for them | the won row's verdict `one_blocker` → `open`; the false obstacle stops rendering |
| what does NOT change | `blocked` 1 → 1. No row enters or leaves any pool. `accessiblePool` membership is unchanged, so no founder loses a fund |
| the correct instrument is NOT touched | `bpifrance_innovup_leader_idf [g3-aid-range]` is the only other `ticketBand` filter excluding `b500k_2m5`. Its €75k–€500k ceiling is real, correctly encoded, and **it appears nowhere in the corrections file** — verified read-only against live Postgres |

**Preconditions, verified read-only:** both gates in **both** stores hold exactly
`{"allowed":["lt25k","b25k_100k","b100k_500k"],"field":"ticketBand","op":"in"}`,
which is the `current_value_spec` each correction was written against. The script
refuses to write anything at all if any row has moved, and checks Postgres
*before* writing SQLite so a moved store cannot leave the two half-applied in
opposite directions. The SQLite dry run is clean: `2 corrections, 2 to write,
0 already applied, 0 drifted`.

*(The Postgres dry run itself was blocked by this session's command classifier;
its precondition was therefore verified with a direct read-only `SELECT`
instead, which asks the same question the script's drift check asks.)*

### How to reverse it

```sql
UPDATE eligibility_gates
   SET value_spec = '{"allowed": ["lt25k", "b25k_100k", "b100k_500k"], "field": "ticketBand", "op": "in"}',
       encoding_method = 'llm_encode'
 WHERE instrument_id = 'innovate_uk' AND gate_key IN ('G3-01', 'G3-02');
```

Run against **both** stores, then re-run
`python3 ETL/terms/check_gate_branches.py --postgres`, which will go red again —
which is the point: the reversal is detectable, not silent.

### After applying

```
python3 ETL/terms/check_gate_branches.py --postgres     # expect: OK, both stores
cd website/frontend && npx tsx scripts/check_winner_not_gated.ts
```

`make eligibility` is **red until this write lands** — `check_gate_branches.py`
fails the target and there is exactly one violation in the corpus. That ordering
is deliberate rather than accidental.

---

## WHAT IN THE BRIEF TURNED OUT TO BE WRONG

- **"Correct `G3-02`'s band to what its own text and the official page say"** —
  the union the brief specifies is still a comparator on a quantity we never
  ask for. `ticketBand` is the grant sought; the funder's sentence bounds total
  project cost; the two are separated by a 25–70% intensity from the same page.
  The branch selector, project duration, is not an intake field. **Quarantine,
  not union.** Same reach (109/109), and it does not assert a verdict about a
  number the founder never gave.
- **"`npm run shadow` … is free"** — **there is no `shadow` script.** Not in
  `website/frontend/package.json`, not at the repo root, not in the `Makefile`,
  and no `scripts/*shadow*` exists. `npm run trace` does exist, runs clean, and
  is unaffected by either change here.
- **"the entire GB population" (of the gate's reach)** — right, and the sharper
  statement is that `innovate_uk` was **81% of every obstructed won row in the
  whole 897**, not just of the British ones.
- **"49 of 78 founders (62.8%) carry an obstructed row in the ranker's top six,
  so this is not a British problem"** — correct, and it survives the gate fix
  almost intact: **39 of 78 still do.** The brief's implicit ordering ("gate
  first, prompt second") is right about sequencing but should not be read as the
  gate fix shrinking the prompt exposure much. It shrinks it by an eighth.
- **wsIA's "the encoder wrote the requirement correctly and then encoded the
  other branch's ceiling"** — true of `G3-02`, and `G3-01` is not clean either:
  the bands are **EUR** (`types.ts`, `b100k_500k` = €100K–€500K) and the
  requirement is **GBP**, so £500,000 is roughly €585,000 and reaches into
  `b500k_2m5` as well. Every GBP-, SEK-, DKK-, NOK-, PLN- or CHF-denominated
  money gate in the corpus is banded on its numerals with no currency step in
  `encode_gates.py`. **Flagged, not fixed — out of scope here and it needs its
  own workstream and an FX source.**

## COLLISION NOTE FOR THE MERGE

wsIB is in `agentSelect.ts` around lines 300–380 (`atMost`, the two
disqualifiers) and in the measurement scripts. **I touched neither.** My edits
are a new lever block inserted just above `LOOKUP_TOOL` (~line 475) and the one
bullet it replaces in `buildPrompt`. Line numbers below ~475 shift by the size
of the inserted block; no content in wsIB's region changed. Merge order does not
matter.

## FILES

| | |
|---|---|
| `project-mgmt/evidence/wsic_gate_branch_corrections_2026-08-19.jsonl` | the two corrections, with the funder's words and the clause |
| `ETL/terms/check_gate_branches.py` | the property, as a build step |
| `ETL/terms/apply_gate_encoding_corrections.py` | now takes `--corrections`; default unchanged |
| `website/frontend/scripts/gateCorrections.ts` | the loader + applier, shared by both counterfactuals |
| `website/frontend/scripts/_wsic_band_counterfactual.ts` | the 897-founder band measurement |
| `exposure.py` | the tape replay behind §3 |
| `lib/intelligence/agentSelect.ts` | `ORDER_CLAIM`, `ORDER_CLAIM_PROSE` |
| `lib/intelligence/selectPromptProse.test.ts` | the marriage between the prompt and `orderMemoCandidates` |
