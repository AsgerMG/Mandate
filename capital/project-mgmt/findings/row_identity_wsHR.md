# wsHR — a row can be named, and the name is the fund's

**Three defects wsHP found on one real founder's production brief. They share a
cause: a published row had no identity, so nothing downstream could say which
fund it was — including the code that gives it a name.**

Reproduction and run record:
* `scripts/_wshr_labels.ts` — the label measurement, free, live corpus.
* `scripts/check_row_name_not_id.ts` — the guard, hermetic, in `npm run check`.
* `lib/intelligence/rowNameNotAnId.test.ts` — the property, on ids nobody has seen.
* `row_identity_wsHR_prodcheck.txt` — the closing brief, end to end.

---

## 1. `InstitutionEntry` now carries the instrument id — fix this first, and it did

The enabling defect. A published row carried `institution` (a display name that
322 instruments share 143 of), `channel` (a source family that legitimately
emits several rows) and `schemeCode` (a notified regime with up to eighteen
leaves under it), and **nothing that named the fund**. So `prodcheck` had to
match a founder's won fund against her table by name, the won name sat inside a
DIFFERENT notified scheme's rendered label, and it reported a hit two regimes
and six years apart. `brief_records` recorded seven rows a brief and could not
say which funds they were.

`instrumentId` is carried through `buildInstitutions`, recorded on
`brief_records` (JSONB, no migration), and pinned at both hops by
`rowToEntry.test.ts`. `prodcheck`'s published rank is an exact id match now,
the same comparison its pool rank always used.

## 2. A row's displayed name is the fund's name, never our storage key

`distinguishRowNames`' last-resort token was `instrumentId.slice(prefix)` with
the underscores turned into spaces. Two of one founder's seven rows read

> Régime cadre exempté ... 2024-2026 · `rnd  sa 111728  ministere de l economie
> et des finances` · via Conseil régional

three weeks after wsHN renamed 22 rows away from exactly that ministry.
`nameableBody` REFUSES to name a ministry as a door; the id fragment printed it
anyway, as prose, with the refusal intact.

**Measured before touching it** (`_wshr_labels.ts`, 36 recall founders, live
Postgres): the branch fired on **20 of 252 published rows across 9 of 36
founders**, and on that population it was the **only** branch that ever fired —
zero rows were named by their granting body.

**Why**: `bodyDistinguishes` was `bodies.size === peers.length` over the RAW
column, so one duplicate body anywhere in a group threw the body away for every
peer in it. The French group holds `satr_fr_rnd__sa_111728__ministere...` and
`satr_fr_equity__sa_111728__ministere...` — two regimes, one title, one body —
so five rows whose granting authorities are published at a 1.0 vote share, four
of them distinct and nameable, fell to the id fragment together. `shortlist.ts`
records fixing this exact all-or-nothing shape once already, for `nameableBody`,
and left it standing one line above.

**The rule now asks nothing of the group.** Each row is named from what IT can
support — the door the register lets us name, the delivery region BY NAME, the
notified code, the kind of capital through `CAPITAL_WORD` — and the only
group-level question is whether the labels come out different. Where nothing we
may state separates two rows they stay identical and `resolveNameCollisions`
demotes one, which is what that function is for: a name we invent does not make
two rows two options, it makes them one option and a leak.

**The property, with its test for the unseen case.** Not "strip ministry names":
a slug is whatever the loader built out of whatever the register published, so
the next one is unguessable and a register of bad fragments would fail this
repo's own enumeration rule. `internalIdWordsIn` flattens the appended qualifier
and the id the same way and asks whether any word reached the page from the id
and from nothing anybody wrote about the fund. `rowNameNotAnId.test.ts` runs it
over ids carrying a ministry, a named individual, a URL, a street address, a hex
digest and a NUTS code, and names none of them in an assertion.

**After**: 0 of 252 published and 0 of 1,438 menu rows reveal an id, on 36
recall founders and on the 12 archetypes; the same founder's SA.111728 row now
reads `· via Conseil régional d'Ile-de-France`. Duplicate seats on the rendered
label — what the disambiguator exists to prevent — are unchanged at **0
published, 0 menu** on the recall population.

## 3. The writer's page and the founder's page are the same page

Her third bottom-line bullet gave *PACTE Industrie* a verdict and a blocker and
there was no PACTE Industrie row. `WRITER_CANDIDATE_CAP` was
`institutionsMax + 1`, the writer writes before the cut, and since wsGK removed
the watch-only sort `w(r)` is identically zero — so rank 8 is unpublishable at
ANY value of that cap. The spare seat bought nothing and cost that.

**The fix is the cut, not a rule about what the writer may name.** BL-B1
("naming a fund that is not in the published table") is already a Banned rule
and did not fire, because it tests whether a bullet CONTAINS a cut candidate's
full display name and the writer wrote the fund's short name. Tightening that
is chasing a model's phrasing with a string match; the next brief abbreviates
differently. The cut removes the thing being named: with the candidate list
equal to the published table there is no fund on the writer's page that is not
on the founder's, whatever the model calls it, and BL-B1 becomes a tripwire on
the caps rather than a filter on prose.

**It is not `worth: Boolean(note)` returning (wsGC), and the direction is the
difference.** That let the writer's SILENCE delete a row the ranker had chosen.
This is code cutting by RANK before the call: the ranker still chooses every
seat, the writer still cannot add, drop or reorder one, and a candidate it
writes nothing about still publishes from its own facts. `check_contracts.ts`
ties the two caps in both directions, each with its own reason — a cap below the
published count ships rows with no assessment, a cap above it hands the writer a
fund the founder cannot see.

---

## What this did NOT fix, and it is the same live open item wsHF recorded

`ROW_TITLE_CHARS` is 120 and SA.111723's title is 129 characters. **Nothing
appended to it can ever be read** — not a body, not a region, not the id
fragment — so on two of the twelve archetypes eleven pool rows render as one
string in the selector's menu. That is truncation, not naming: the count moved
16 → 21 across the same two founders when the slug went, and both numbers are
the same defect, because the slug was never readable there either.

The fix is that the RENDERER must cut the title and keep the qualifier
(`oneLine(title) + qualifiers + via body`), which is what wsFE's own finding
says is wrong — "the disambiguator did its work and the renderer removed it" —
and it changes which rows the collapse demotes, so it needs a funnel run rather
than a label run. **Left open deliberately**, with the number above.

## Verification

`npx tsc --noEmit` clean; `npx vitest run` 817 pass, 60 files, `founderPath.test.ts`
green; `check_contracts` ok; `npm run check` — the new check green, `recall floor`
green, and the 16 other reds reproduce byte-for-byte on the base commit
(`7b125138`) in a detached worktree, so none of them is this branch's.

Red-then-green proven on all three guards: `rowToEntry.test.ts` (drop the id
carry), `rowNameNotAnId.test.ts` and `check_row_name_not_id.ts` (re-add the id
branch — 56 of 742 publishable rows flagged), `check_contracts` (put the writer
cap back to 8). `check_row_name_not_id.ts` also carries `PROVE=1`, which grades
one real corpus row relabelled the old way and fails if the grader comes back
clean.
