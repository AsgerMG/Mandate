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

## 3. Two channels hand the writer an unpublished fund, and wsHP named the wrong one

Her third bottom-line bullet gave *PACTE Industrie* a verdict and a blocker and
there was no PACTE Industrie row. wsHP read that as the writer being shown one
more candidate than the table publishes. **It was not**, and the way to find out
was to close that channel and run the same founder again: the bullet came back,
about ADEME's écoconception route.

**Channel A — the spare candidate seat. Closed by CUTTING, and it was free.**
`WRITER_CANDIDATE_CAP` was `institutionsMax + 1`, the writer writes before the
cut, and since wsGK removed the watch-only sort `w(r)` is identically zero — so
rank 8 is unpublishable at ANY value of that cap. The spare seat bought nothing
(`caps.ts` measures its whole reach at 0.12 points against a ±3.2 half-width)
and could still hand the writer a fund the founder cannot see. `check_contracts`
now ties the two caps in both directions, each with its own reason.

It is **not** `worth: Boolean(note)` returning (wsGC), and the direction is the
difference. That let the writer's SILENCE delete a row the ranker had chosen.
This is code cutting by RANK before the call: the ranker still chooses every
seat, the writer still cannot add, drop or reorder one, and a candidate it
writes nothing about still publishes from its own facts.

**Channel B — the round-two facts, and this is the one that fired.**
`brief_funnel_v2` Stage 2b puts one line per answered question into the writer's
prompt: *`<fund>` requires: "`<verbatim gate text>`" / Asked: ... / They
answered: ...*, and closes "where an answer shows a requirement is not met, say
so plainly and give the cure". Those questions are grounded in the **whole
candidate pool by design** — their answers are what decides which funds publish,
so the grounding cannot be the published table without being circular — and the
fund that prompted one is routinely not a row. The writer did exactly what it
was told, about a fund the founder would never see, on both runs.

**CONSTRAINED, not cut, and not redacted.** Cutting is impossible (see the
circularity). Redacting is worse than it looks: the name sits inside the fund's
own verbatim quote and inside the question phrased from it, so stripping it
either breaks the quotation or leaves the name in the line beneath. What CAN be
stated exactly is the boundary, and it is now stated in the block: these lines
are facts about the FOUNDER, the funds in them were screened and are not the
table, use the answer anywhere and never give one of them a verdict, a blocker,
a next step or a recommendation.

**And BL-B1 was blind, for a reason worth writing down.** The rule already
exists — "naming a fund that is not in the published table" — and did not fire
on either brief. It required the bullet to contain the fund's WHOLE display
name, and the corpus name is *"PACTE Industrie - Parcours Accompagnement et
Compétences pour la Transition Énergétique de l'Industrie"*, 101 characters. A
writer calls it PACTE Industrie. It also had nothing left to compare against
once channel A closed, because its evidence set was the candidate list and that
list is now the table. It is given the round-two fund names as well, and
compares on the lead segment of a name as well as the whole of it. Both sides
are compared on the head of the name, so a published row's appended door does
not read as a fund that is not in the table.

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

## The closing run — same founder, same path

`row_identity_wsHR_prodcheck.txt`. A.M.L. MICROTECHNIQUE LORRAINE, the four
route calls over HTTP against a server running this branch, live Postgres, one
real brief. **`PRODCHECK_URL` is set, and the run says so in its own header**:
Vercel preview deployments sit behind deployment protection and there is no
bypass secret on the project, so the alternative was a production deploy of
unreviewed work. This is the founder's path end to end on this code; it is not
the published deployment, and nothing here should be read as one.

```
row names   ok — none of 7 reveals an instrument id
```

Seven rows, every one carrying its instrument id. Four are named by the door
they are — `· via REGION GRAND EST`, `· via Conseil régional`, `· via Conseil
régional Occitanie` — where the run three hours earlier printed
`· rnd  sa 111728  ministere de l economie et des finances` on two of them.
Note what the id fragment was actually saying on row 5: its id names the
MINISTRY that notified SA.40453, while the door the founder is given is Conseil
régional Occitanie. The slug was not merely unreadable, it was a second body in
the same name.

Every fund the bottom line names is a published row: Horizon EU CL4 (row 1), the
three French R&D regimes by their granting bodies (rows 2-4), the CNC-run scheme
(row 7) and the equity regime via Conseil régional (row 6). No PACTE Industrie,
no ADEME route, no fund that is not on the page.

Two paid briefs, ~EUR 0.5 against a EUR 1 budget. The first is what established
that channel A was not the one firing; without it this workstream would have
shipped a correct fix and a wrong diagnosis.

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
