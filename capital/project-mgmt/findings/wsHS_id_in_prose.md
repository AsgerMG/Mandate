# wsHS — an id is a key, and no founder reads a key

wsHR took the instrument id out of the row **names** and that fix held across
two production runs; the writer then put it straight back in its own **prose**,
in the first substantive bullet of a real founder's brief — *"Start with the
Grand Est regional scheme (`satr_fr_rnd__sa_111728__region_grand_est`)"* — and
every offline guard passed, because `check_row_name_not_id` grades rows and this
was not a row. The writer has those ids **legitimately**: `pipeline.ts` hands it
one per candidate as `key "<id>"` and requires a note back per key, because 322
instruments share 143 display names and a name cannot key a table, so starving
the input would only put note-keying back on a string that does not identify a
row. The fix therefore holds the **output**: contract rule **BRIEF-5** now tells
the writer plainly that a key is ours and the reader is shown what the fund is
called, and `redactInternalIds` puts the fund's **name** where the key was
before the brief is served — substitution rather than deletion, because the
writer prints a key where it means the fund, so the name is what belonged in
that position. The property is stated once and asked of the whole reader
surface: *nothing a founder reads may contain an internal identifier*, where a
token is one of our keys if it carries a word that came from an id and from
nothing anybody wrote, or if it **is** the whole key however spelled — asked of
the ids the request itself handed over rather than of an id **format**, so a
shape introduced next year is inside the test the day it appears, and asked of
one whitespace token, which is what keeps it off prose ("Horizon EU CL4" is
three tokens and can never be `horizon_eu_cl4`). `readerText` moved into
`readerSurface.ts` so the check and the repair walk the same fields — a repair
scoped to one field list and a check scoped to another is how the next defect
ships — and the same guard now covers the **round-two questions**, which carry
the identical exposure (`ref "<instrument id>::<gate key>"`) and are model prose
the founder reads *before* the memo. Second, the instrument that reads
production had the same defect twice, once fixed and once not: `prodcheck`
matched bullets to rows on **display name only** and annotated *"[names no row
on the table]"* beside a bullet containing a row's exact id; it now asks by id
as well and says when a bullet names a row **by its id**, because that is itself
the defect, and it prints a whole-memo scan of every founder-facing string
against every id the deployment served. Measured false positives: **0** over 742
publishable funds and the 1,411 strings the register wrote about them, 0 over
the eight prose blocks of the run-1 memo, and 0 over the twelve archetype tables
— which `check_memo_table` now enforces at build time. Proven red-then-green
against `main`: main's `checkBrief` returns `[]` on the exact production bullet;
this returns `BRIEF-5`.

---

## What was wrong, precisely

| | |
|---|---|
| **Defect 1** | The memo printed a raw internal identifier to the founder. Bottom line, first substantive bullet, live production. |
| **Why nothing saw it** | `check_row_name_not_id` grades a row's NAME. The rows were clean. Prose was outside every guard's subject. |
| **Defect 2** | `prodcheck`'s bullet matcher was name-only, so it reported `[names no row on the table]` for a bullet carrying row 6's exact id — the mirror image of the false positive wsHR caught in the published-rank matcher, and worse, because a false negative reads clean. |

## Why the writer has ids at all — established before choosing a fix

Legitimate. `writerCandidateEvidence` renders one line per candidate as
`- key "<instrument id>" (<name>)`, and the writer's output schema requires one
`institutionNotes` entry per key. The reason is the same one
`InstitutionEntry.instrumentId` exists for: **322 instruments share 143 display
names**, so a name cannot address a row. Removing the key would reintroduce the
defect wsHR closed.

So: input kept, output guarded, and the boundary stated in the one place it was
never stated — at the point the key is handed over, and in the contract.

## The property, and its test for a case nobody has seen

**Nothing a founder reads may contain an internal identifier.** An id is a key,
not a name.

Two ways a single whitespace token is one of our keys, and both are needed:

1. **It carries a word that came from an id and from nothing anybody wrote about
   the fund** — the row-name property (`internalIdWordsIn`), asked of one token.
2. **It is the whole key, however spelled** — separator- and case-independent.
   This catches a key whose every word the fund's own title accounts for, which
   test (1) is blind to by construction.

Not a pattern for "our id format": the ids in play are read off the request, so
the vocabulary is derived from the corpus and an id shape introduced next year
is covered with no edit. `check_contracts`'s enumeration guard is satisfied
because nothing here lists a case.

**What keeps it off prose**: prose spells a compound with spaces. A single word
in a sentence is never examined, and a hyphenated one is examined only against
words the register did not write.

## What the accounted-for text is, and the correction that took

The first run over the twelve archetypes reported three leaks and all three were
false: `Technologie-Beratungs-Institut` and `Noord-Nederland` are granting
bodies the row itself prints as `schemeOperators`, and the accounted-for text
was a hand-written list of nine fields that did not include them. That is the
defect `readerText` exists to remove one layer up. `fundText` is now **derived**
from the row — everything the row publishes, minus the writer's own three
fields, because prose cannot certify itself. `administeringBody` raw is still
never read: `schemeOperators` is a published field admitted as published text;
the column the register refused to print is not.

The third, `R&D&I`, was junk: 125 ids in this corpus carry a one-character word,
almost all of them a French elision the slug split off. A letter identifies
nothing, so a single-character match is no longer evidence.

## Where it lives

| file | what |
|---|---|
| `lib/intelligence/rowIdentity.ts` | `internalIdTokensIn`, `redactInternalIds` — beside the words property they extend |
| `lib/intelligence/readerSurface.ts` | `readerText` + `mapReaderText`: ONE definition of which text a founder reads, walked by both the check and the repair |
| `contracts/brief/00-document.md` | BRIEF-5, and the same sentence at the point `pipeline.ts` hands the key over |
| `lib/intelligence/briefChecks.ts` | the rule; `fundText` derived from the row |
| `lib/intelligence/pipeline.ts` | the repair, before the report is served; `memo_id_redacted` telemetry |
| `lib/intelligence/adaptiveRound.ts` | the same guard on the round-two questions |
| `scripts/prodcheck.ts` | the bullet matcher fixed, and a whole-memo id scan |
| `lib/intelligence/readerId.test.ts` | 13 cases, red on main and green here |

`memo_id_redacted` is a **degradation**, not an error: the founder reads clean
prose, and the event is the only way the contract's effect on a live model is
visible from outside. `memo_id_redact_failed` is an error, because then an
identifier may have reached the page.

## Production run 4 — the memo, from the deployment a founder uses

`npm run prodcheck`, default founder, `https://euro-inv-tracker.vercel.app`,
deployment `dpl_4ntLA5BCaxFCSghVF97r7r8ysSc7` (production target, aliased, built
from this merge). One brief, **EUR 0.317**, against a EUR 1 budget.

```
row names   ok — none of 7 reveals an instrument id
memo ids    ok — none of 349 founder-facing strings carries one of the 7 ids
            this deployment served
```

and the bullet matcher tells the truth now: bullet 4 reads `[names row 2]`,
which run 2's name-only matcher could not have said.

**The interesting part is in the deployment's own log**, and it is not what was
expected:

```
[degraded] memo_id_redacted: an internal identifier was written into
founder-facing text and replaced: state_aid_satr { count: 1 }
```

The guard fired on its first live run and what it caught was **not the writer**.
`state_aid_satr` is a source-family code, and it was sitting in `self.channels`
— a list `panelReport` never prints (it renders `euCapital`,
`channelBreakdown` and `activeYears` from that block and nothing else).
`NON_READER_KEYS` carried the singular `channel` and not the plural, so BRIEF-3
and BRIEF-4 had been grading a value nobody reads and the repair rewrote it.
`channels` is now classified where it belongs, with a regression test rather
than a second paid run: the classification is a pure code fact and buying a
brief to observe it would be a run with no question behind it. That the miss and
the wrong repair are the same one-line fact, in one file, is the argument for
the check and the repair sharing the walk.

**Read the two together.** `prodcheck` sees what the founder sees, which is the
report *after* the repair; the deployment's log is where the pre-repair truth
lives. A clean `memo ids` line plus no `memo_id_redacted` means the writer wrote
nothing wrong; a clean line plus the event means it did and we caught it. Run 4
was the second case, on a field that turned out not to be the writer's.

## Verification

- `npx tsc --noEmit` clean; `npx vitest run` 841 passing including
  `founderPath.test.ts` and the new `readerId.test.ts`.
- `check_contracts`, `check_ws_scripts`, `check_row_name_not_id` (with `PROVE=1`),
  `check_check_reachability`, `check_guard_subject`, `check_doc_identifiers`,
  `check_memo_table` all green.
- Red-then-green, run against the `main` checkout: `checkBrief` on the exact
  production bullet returns `[]` there and `BRIEF-5` here.

## Also corrected

`InstitutionEntry.instrumentId` was documented as "never rendered, never handed
to a model". Half of that was false, and had been for as long as there have been
per-row notes. The comment now says what is true.
