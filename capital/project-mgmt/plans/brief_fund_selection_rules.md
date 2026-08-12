# Every rule that can remove or demote a fund

Audit run 2026-07-29, after the Bending Words brief deleted EIC Accelerator
while its own eligibility screen showed EIC's gates as met.

Companion to `brief_output_architecture.md`. That plan says how output becomes
diagnosable; this says what is currently steering it that nobody voted for.

---

## The organising distinction

Not all hardcoding is bad, and the audit is useless without the line between
the two kinds:

- **A fact about an instrument.** "This scheme is French." "This instrument's
  capital type is `grant`." "This aid is filed under GBER Art. 25." Encoding
  these is correct and scales, because the fact lives in the data and the code
  just reads it.
- **An opinion about a founder.** "Application-layer companies should not be
  shown EIC." "EIC does not serve asks above €15M." "Everyday entry points
  should outrank strategic vehicles." These are judgements someone made once,
  hardcoded, applied to every founder forever, and invisible in the output
  except as a fund that is not there.

**Every item in Tier 1 and Tier 2 below is the second kind.** That is the list
worth acting on.

A second axis matters as much: **where in the pipeline the rule fires.** A rule
that fires *before* the writer removes a fund from the universe — nothing
downstream can recover it, and the brief cannot even mention its absence. A
rule that fires *after* the writer at least leaves a trace. The pre-writer
rules are the dangerous ones.

---

## Tier 1 — Opinions that delete funds outright

### 1. `CHANNEL_BANDS` — hardcoded ticket ranges per channel
`shortlist.ts:103-115`. Fires **pre-writer**, in `channelServesBand()`.

```ts
eic: [0, 2],       // ⇒ any ask above €15M removes EIC ENTIRELY
eit: [0, 1],       // ⇒ any ask above €2.5M removes the EIT KICs
ipcei: [3, 4],     // ⇒ any ask below €15M removes IPCEI
```

Eleven channels, each with a hand-set `[min,max]` index into `TICKET_BANDS`.
A channel outside the founder's band never enters `codes`, so it is absent from
the shortlist, absent from the adaptive round's gate evidence, and absent from
the writer's candidate list. It cannot be recovered or explained.

**The comment above it already concedes the point:** *"Coarse by design — the
terms engine (W1) replaces this with verified ticket gates."* That replacement
never landed. A stopgap is steering fund availability in production.

**Disposition: replace with real ticket gates from `eligibility_gates`.** Where
no ticket gate is encoded, do not filter — an unknown ceiling is not a low one.
This is the single highest-leverage item in the audit.

### 2. The EIC / deep-tech archetype veto
`_agent_instructions.md:97-106`. Fires **inside the writer**, as prose in the
system prompt.

> "**Do not push EIC, Chips JU or deep-tech routes at an application-layer
> company**; say why, and point to the workhorse layer instead."

Pure editorial opinion, applied to an entire class of company, with no data
behind it. It is what deleted EIC from the Bending Words brief — the rule is
visible executing verbatim in that brief's positioning paragraph ("Skip the
EIC's deep-tech register entirely").

It also directly contradicts the encoded gates, which had assessed EIC
Accelerator's own TRL 6-8 criterion as **met** on the same page.

**Disposition: delete.** Already agreed. Gates decide eligibility; the writer
may rank low, never veto.

### 3. `worthPursuing: false` — model-side deletion
`pipeline.ts:1045-1084`, schema field at `pipeline.ts:850`. Fires **inside the
writer**.

A boolean the model sets that deletes a row from the brief entirely. The
prompt then spends **forty lines** trying to stop it misfiring: it is "NOT a
ranking device", "NOT for weak or long-shot options", capped at "NONE or ONE",
then immediately un-capped ("that cap is a guard against over-rejecting, NOT a
budget"), plus three separate paragraphs of examples from real bad runs
(eAgronom, Nebius, sennder).

**Forty lines of guardrails around one boolean is the diagnosis.** The
mechanism is wrong, not under-specified. It also violates the repo's own
documented doctrine — *the writer RANKS, code CUTS*.

**Disposition: remove the flag.** The writer returns a full ordering; code
takes the top five. A fund that is genuinely wrong ranks last and falls off the
cut naturally, leaving a trace in the run record instead of vanishing.

### 4. `actionableNow` + the `WATCH_ONLY_COPY` regex
`watchOnly.ts:14`, enforced in `pipeline.ts`. Fires **post-writer**.

```
/\b(monitor|deprioriti[sz]e|informational|watch|wait for|only pursue if|
   act if|revisit|keep an eye|fall ?back|longer[- ]horizon)\b/i
```

Double jeopardy: a row is deleted if the model flags it OR if this regex
matches its own prose. The intent is sound — a brief is a list of things to do.
The mechanism is a regex over natural language containing the words **"watch"**,
**"revisit"** and **"act if"**, any of which can appear in a perfectly good next
step ("act if the call reopens in Q1" is a real instruction, not a non-action).

**Disposition: keep the rule, change the enforcement.** Becomes a contract rule
with an ID, enforced by rewriting the row's `nextStep` or demoting it, not by
silent deletion. The regex stays as a *detector* feeding the scoreboard, not as
an executioner.

**CARRIED OUT, in two steps, and the intermediate one was worse than it looked
(wsGK, 2026-08-13).** Deletion became demotion in Phase 4 and stopped there.
Demotion is deletion whenever the published cap is below the writer's: with 8
candidates cut to 7, one match anywhere in the table made the seven
non-matching rows exactly the published seven, so the matching fund was cut and
the rank-8 fund took its seat — at rank 1 as readily as at rank 8. Since the
ranker took the selection seat, that is a regex over one model's prose
overruling another model's ranking.

Measured on `brief_records` in Postgres, 35 briefs — **not** on
`corpus-ledger/operational/brief_records.jsonl`, which holds ids 2-20 and
nothing after 2026-07-30, so it shows only the era below and reads as current:

| era | briefs | candidate rows | matches |
|---|---:|---:|---:|
| to 2026-07-30 | 19 | 128 | 8 (6 briefs) |
| since 2026-08-08 | 14 | 107 | **0** |

The last match is dated the day FUND-4 entered the writer's contract. So the
enforcement is being removed at its cheapest moment: the case for removing it
is not the saving, it is that one firing costs a fund nobody can see was lost,
and the benefit is now carried by an instruction to the writer instead of by a
sort. At 0/107 the 95% upper bound is still 2.8% of rows.

The regex is now a detector and nothing else: `FUND-4` on the scoreboard,
`WRT-WATCH-ONLY` in the exclusion log, and the row publishes at its rank
carrying the writer's own sentence — which is how the founder is told to wait,
in words rather than by the fund's absence. The sentence in `02-funds.md` that
said such a row "does not belong in the brief at all" is a selection claim in a
writing contract and is gone with it.

### 5. `Fit:` — consortium gating on one answer
`fund-processes/*.md` line ~55 in each, read by `fitOf()`, enforced at
`shortlist.ts:407` and `:419`, demoted at `:464-468`. Fires **pre-writer**.

Five of eleven channels are declared `consortium_institutional` — Horizon
Pillar II, Horizon partnership, EIT, EDF, Chips JU. All five are excluded from
the default pool and from thematic top-up unless `consortiumOk`.

Verified during this audit: `consortiumOk` is passed as
`eligibility?.consortium !== "no"` (`pipeline.ts:1350`, `:1440`), so "unsure"
and unanswered both keep them in play. **That part is correct** — a previously
fixed bug, and it stayed fixed.

The remaining problem is upstream: `Fit:` is a hand-written line in a markdown
file, one value for an entire channel. `horizon_eu_partnership` holds nine
Joint Undertakings with materially different partner requirements, and all nine
inherit one editorial verdict.

**Disposition: derive from encoded gates per instrument, not per channel.** The
consortium requirement is real requirement text; it should be read, not
declared.

---

## Tier 2 — Opinions that shape the pool before anyone looks

### 6. `DEFAULT_INSTRUMENTS` — the universal fallback
`shortlist.ts:95`. Five hardcoded channels
(`national_dev_banks`, `state_aid_satr`, `eic`, `horizon_eu_pillar_ii`, `eit`).

A founder whose peers used nothing gets exactly these five as their universe.
EDF and Chips JU are deliberately excluded on the grounds that thematic
matching should surface them — which is defensible, and load-bearing on the
thematic layer actually working (see items 10-12, which are all unmeasured).

### 7. `INSTRUMENT_PRIORITY` — a global ranking prior
`shortlist.ts:83`, derived from the key order of `INSTRUMENT_NAME`. The comment
says it plainly: *"Order doubles as relevance priority: the everyday entry
points first, the slow strategic vehicles last."*

One fixed ordering applied to every founder in Europe, as the final sort key.
EIC sits third, behind national dev banks and state aid, for everyone.

### 8. `LARGE_SCALE_TOPUP` + `LARGE_SCALE_RELEVANCE_FLOOR`
`shortlist.ts:127`, `:335`, gate at `:350-391`. EIB, Innovation Fund and IPCEI
appear only when the ask is band index ≥ 3 (€15M+) **and** at least one leaf
clears a semantic score of `0.5`. Below €15M these three are unreachable
regardless of fit.

### 9. The topic-routing map — what the political sections may see
`pipeline.ts:485-534`. ~50 lines of hardcoded `if` statements mapping sector and
capital type to digest topics:

```ts
if (sectorTop === "software_data_ai") topics.add("digital_ai");
if (sectorTop === "defense_security") topics.add("defence");
if (req.companyType === "Deep-tech breakthrough") topics.add("step");
```

This decides which political evidence `positioning` and `stateOfPlay` are even
allowed to see. Bending Words got France's AI plan because `software_data_ai` →
`digital_ai` fired. An EdTech selling into public procurement had no path to
education-policy or procurement evidence, because no rule maps to it.

**This is the hidden ceiling on the section you said was the best one.**

---

## Tier 3 — Unmeasured thresholds

Every number here was hand-set, none was tuned against outcomes, and each one
silently changes which funds appear.

| # | Constant | Value | Where | Effect |
|---|---|---|---|---|
| 10 | `RELEVANCE_FLOOR` | 0.35 | `relevance.ts:186` | Below this, thematic score is discarded and ordering falls back to event count |
| 11 | `TOPUP_THRESHOLD` | 0.8 | `relevance.ts:190` | How good a theme match must be to pull in a whole new channel |
| 12 | `MIN_RAW_HIT` | 2.5 | `relevance.ts:107` | IDF floor before any thematic match counts |
| 13 | `LARGE_SCALE_RELEVANCE_FLOOR` | 0.5 | `shortlist.ts:335` | Gate on the €15M+ lane |
| 14 | `W_RESOLVED` / `W_PRECEDENT` | 0.55 / 0.45 | `ease.ts` | Ease ranking weights. Comment: *"a tuning starting point, not a finding"* |
| 15 | `K` shrinkage | 5 | `ease.ts` | Penalises thinly-documented instruments |
| 16 | `administeringBodyShare` | 0.6 | `shortlist.ts:541` | Whether a row is named for its granting authority or as "National state aid" |
| 17 | `topicSignature` overlap | 0.45 | `adaptiveRound.ts:349` | When two round-2 questions count as duplicates |

**Caps, separately** — these are structural rather than judgemental, but they
compound: `MIN_CHANNELS_CONSIDERED` 7, `selectLeafInstruments` slice 2,
`thematicChannelTopUp` limit 2, `DISPLAY_CAP` 6, `VERDICT_POOL` 18,
`BRIEF_INSTITUTION_CAP` 5. The chain 7 channels × 2 leaves → 18 pool → 5
published is why briefs bottom out at two or three rows when several funds are
blocked. This chain has already been raised once (from 4 channels) for exactly
that reason.

---

## Tier 4 — Hardcoded word lists

| # | List | Where | Risk |
|---|---|---|---|
| 18 | `STOP` (40+ words) | `relevance.ts:34` | Includes **"innovation"**, **"development"**, **"new"** — a company describing itself as "innovation in X" loses that signal entirely |
| 19 | `THEMATIC_FAMILIES` = `{G5_use_of_funds}` | `relevance.ts:30` | Only ONE gate family is read for theme; `G1_nexus` explicitly excluded |
| 20 | `ADMIN_NOISE` regex | `relevance.ts:83` | Sentences matching it are dropped from an instrument's theme text |
| 21 | `VAGUE_OPTION` regex | `adaptiveRound.ts:86` | Strips answer options; a legitimate option starting "Both..." is deleted |

---

## What is correctly hardcoded, and should stay

Stated so the audit is not read as "remove all constants":

- **Country filtering** (`instrumentServesCountry`, `NATIONAL_CHANNELS`) — a
  fact about the instrument. The comment at `shortlist.ts:229-237` is right:
  an out-of-country national scheme is never usable, and it does not need a
  gate to be true.
- **`CAPITAL_SOUGHT_TO_DB`** — a vocabulary join, already guarded by
  `check_vocabularies.ts` against exactly the drift that made it wrong before.
- **`GBER_ARTICLE_LABEL`** — display labels for real encoded values.
- **`verdict.ts`'s asymmetry** — failing a filter is conclusive, passing the
  ones we hold is not proof. This is the most carefully reasoned decision in
  the codebase and nothing here touches it.

---

## Order of removal

Slots into `brief_output_architecture.md` as follows:

**Phase 0** — every Tier 1 and Tier 2 rule gets a check that records *when it
fires and what it removed*, written into the run record. Nothing is removed
yet. Today none of these rules leaves any trace, so we cannot measure the
before state.

**Revised 2026-07-29** after the user's governing principle: a fund drops out
by not fitting, never by a rule. Nothing in Tier 1 or Tier 2 is deleted until
the fit score can do its job — see `brief_output_architecture.md` §2.0.

**Phase 3 (shadow)** — the fit score subsumes them as scored components:
`scale` replaces `CHANNEL_BANDS` (#1) and `LARGE_SCALE_TOPUP` (#8);
`structure` replaces per-channel `Fit:` gating (#5); `theme` replaces the
archetype veto (#2) and `TOPUP_THRESHOLD` (#11). Both orderings recorded, no
published brief changes.

**Phase 4 (removal, one change)** — once shadow mode clears its exit
condition, delete #1, #2, #3, #5 and convert #4 to demotion. Each is now
removing something the score already does better.

**Phase 5** — replace the topic-routing map (#9) with semantic retrieval over
the digest, so `positioning` and `stateOfPlay` stop being limited to a
hand-picked slice of the corpus. Sequenced here because the business-model
answers from round 2 are what make the retrieval query good.

**Phase 8** (after the bench is trustworthy) — sweep Tier 3. Every threshold
gets measured against the 13 archetypes rather than argued about. The ones that
change nothing get deleted; the ones that matter get a rule ID and a regression
check. `INSTRUMENT_PRIORITY` (#7) and `DEFAULT_INSTRUMENTS` (#6) are resolved
here too: with a real fit score, a global priority order and a fixed fallback
pool are both dead weight, but neither can be removed until the score is
carrying the ranking.

**Not scheduled** — Tier 4 word lists. Real but low-yield, and the semantic
layer is meant to supersede the lexical one entirely.
