# The register's window policy, recorded rather than inferred

Workstream BE, task 2. Closes workstream AJ.

## The self-cancelling clause

The degradation policy withholds a row when a request has fallen back to the
committed snapshot and the row's openness rests on our holding no application
deadline for it. To do that it had to know which registers publish deadlines at
all — otherwise it deletes half the product every time a copy is used — and it
worked that out by **counting how many of a population's rows carried one**.

That is self-cancelling, and no refinement of the count fixes it:

> a copy stale enough to be dangerous carries no deadlines, so every register
> reads as one that publishes none, and the safeguard does nothing on exactly
> the corpus it exists for.

Measured 2026-08-07 on the snapshot pushed back to its pre-call-register shape:
**812 offered, 0 withheld, 84 of them closed** according to the live register.
Identical under the earlier membership rule and the later proportion rule. The
only clause that ever fired was `basis_not_supplied`, a test of the copy's
*schema* rather than its currency, and it withheld 381 of 814 rows to do it.

## The fix, and the property it encodes

`source_window_policy` is written per row at ETL time from
`data/reference/source_window_policy.json` — one answer per feed, plus the field
and the page it was read off. A copy carries it however far behind it has
fallen, which is the property a tally over the rows in hand can never have.

The property, and the discriminator that decides every entry and will decide the
next one:

> A row is `publishes_window` when the register record we ingest **for that
> object** carries an application-window field; `publishes_no_window` when that
> record has no such field at all; `declares_open_ended` when the field is there
> and the register states, for that object, that there is no closing date.
>
> Operationally: is the object we hold a register entry for the **aid**, or an
> aggregate we built out of **awards**? An award register publishes grants
> already made. It has no window field, has never had one, and never will, so a
> copy of it cannot be missing a deadline at any age.

Unseen cases are **not defaulted**. A feed with no entry leaves the column NULL,
the product reads NULL as "nobody has asked" and withholds the row from every
fallback copy, and `check_liveness.ts` now fails the build when a publishable row
carries no policy — or one outside the vocabulary. A new feed is loud and
conservative rather than silently cleared.

## Acceptance test

Three-copy experiment re-run 2026-08-08 (`probe_stale_snapshot.ts`), referee is
the live Postgres:

| copy | offered | withheld | dead offered |
|---|---|---|---|
| current | 767 | 34 | 0 |
| stale (no call deadlines) | 644 | **163** | **0** |
| no-basis (the 2026-08-06 shape) | 261 | 335 | 0 |

Of the 163 withheld on the stale copy, **94 are rows the live register refuses**
— 78 Spanish, 16 French. It was 84 offered and none caught. The count moved from
84 to 94 because the corpus has since loaded more call deadlines, chiefly ADEME's.

## Two things the sources contradicted

**BDNS files 87 of Spain's 175 leaves as rootless `bdns_conv_<number>` rows** —
no parent, no root, in a bucket (`state_aid_satr`) they share with the award
register that publishes no window at all. A declaration keyed on `root_id` alone
left the entire population that carries the dead calls undeclared. Hence
`id_prefix` as a match key: the id is what the loader stamped, so it is a fact
about the feed and not about the copy.

**Three ADEME rows had been hand-marked `declares_open_ended`** and the portal
pages say otherwise: two state a `Date de fin de l'aide` of 31/12/2026 and the
third has no such field at all. Neither is a statement that the aid is open
ended. They are `publishes_window` like the rest of the feed.

The wider ADEME reading stands and is the reason the derived rule had to go: of
the 107 dispositif pages our rows cite, 102 resolve, **86 state a closing date
and 38 of those have already passed**, while the open-data extract we ingest
leaves `date_cloture` empty for 97 of 107. The population the proportion had
cleared as a catalogue of standing aids was the one whose windows we were
missing — cleared, precisely, *because* our copy was thin.

## France Relance

Closed, and nothing recorded it: the AAPs took their last applications on
**7 September 2021**, the laureate dataset was frozen 2022-04-08, and the
successor is France 2030.

It is declared `publishes_window` — the claim is about the source, and the
France Relance measure published closing dates for its dispositifs, so our row
carrying none is a gap in our copy of a register that states them.

The closure itself rides on the same declaration as `closed_on`, with its
citation. That is why the entry is row-level: `scheme_end_date` is rewritten from
the extractors on every load, so a hand `UPDATE` survives until the next rebuild
and no longer, while a committed declaration is re-applied by every run of
`assign_source_window_policy.py`. `route_status = 'none'` would have been the
wrong instrument — it claims there is no way into a fund, and the truth is that
the way in shut.

## Where the honest answer is "we cannot source it"

Nowhere, for the corpus as it stands: every one of the 1,031 leaves is covered by
a declaration, and 0 are unmatched. But the coverage rests on a class judgement
for the long tail — 200 singleton national-development-bank programmes built from
award lists (NFR's project bank, Altum, EIS, TACR, Innovationsfonden, Innovasjon
Norge, Bpifrance) are `publishes_no_window` because the file we ingest is an
award file, not because anyone read 200 bank websites.

That is a true statement about the record we hold and a narrower guarantee than
"these programmes have no deadline". If one of those banks starts publishing
calls into the same feed, the declaration goes stale — which is the failure mode
a per-feed declaration has and a derived proportion does not, and why
`contradictsDeclaredPolicy()` exists: a row declared `publishes_no_window` that
nonetheless carries a call deadline is a contradiction with one honest reading.
Falsification survives staleness for the same reason derivation does not — it can
only fire on evidence that IS present, so a thin copy proves nothing rather than
accusing wrongly.

## Open, deliberately not done here

- **ADEME's portal windows are not loaded.** 86 dispositif pages state a closing
  date; our extract carries 46 of them. The 38 already-passed dates are rows we
  are probably still offering off Postgres. That is a loader job, not a policy
  one, and it is the single largest remaining liveness gap in the French corpus.
- `contradictsDeclaredPolicy()` is exported and unit-tested but no harness calls
  it yet. It wants a place on the weekly cron, where the corpus is.
