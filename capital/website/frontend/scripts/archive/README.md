# Archived measurement scripts — routes we have already bought

Nothing in here runs. Nothing in the tree imports it, no guard names it, no
`Makefile` or `package.json` target invokes it. Every file was moved here by
wsEH after being checked individually against the whole repo, and each one is
kept rather than deleted for one reason:

> **A script that is the only record of a dead route's measurement is worth
> keeping. Deleting it invites the next person to re-buy the answer.**

These are not deprecated utilities awaiting a rewrite. They are receipts. If you
are about to open one of the questions below, read the row first — the answer is
already paid for.

The live architecture and the full register of routes measured dead is
[`website/frontend/lib/intelligence/ARCHITECTURE.md`](../../lib/intelligence/ARCHITECTURE.md).

## What each one proved

| script | the question it bought | where the answer is recorded |
|---|---|---|
| `_wsca_probe.ts` | none — a fifteen-line `information_schema` dump of `eligibility_gates` and `funding_instruments`. Not a measurement; kept only so the wsCA cluster is whole | — |
| `_wscb_characterise.ts` | what the unencoded-gate population actually *is*: split by evidence tier, field reachability and encoding method, i.e. why each gate is unencoded | `findings/rich_intake_wsCC.md` |
| `_wscb_perfield.ts` | what re-encoding a tranche would **really** buy once a comparator is held to its field's vocabulary, rather than credited with its whole sentence. 823 distinct requirement texts collapse onto 253 distinct value_specs — a ratio of 0.31, and 0.04 on `lossesOverHalfCapital` | `findings/rich_intake_wsCC.md`; the shipped conclusion is carried by `../_wscb_realistic.ts`, which stays |
| `_wscb_reconcile.ts` | which of the two "unencoded" populations quoted side by side (1,855 NULL-`value_spec` filter gates vs 406 unmapped publishable ones) is the real encoding target | `findings/rich_intake_wsCC.md` |
| `_wscb_samples.ts` | what the unencoded gates literally say, per tranche, so "encodable in principle vs undecidable" is a reading of the text and not an inference from a column | `findings/rich_intake_wsCC.md` |
| `_wscd_diag.ts` | where the stage-2 open-question selector loses its candidates, funnel stage by funnel stage | **Route dead.** Stage-2 open questions measure flat at every question budget — see ARCHITECTURE.md §"Routes measured dead" |
| `_wscd_landscape.ts` | how many published filter requirements can be turned into a fixed answer set at all (decidable comparator / mapped field but no comparator / pure text) | **Route dead.** Same row |
| `_wsce_ceiling.ts` | the ceiling each *crisp* re-encoding tranche buys, separating "is there a determinant?" from "may this pass encode it?", credited only where a reader confirmed the determinant on the 287-gate adjudicated sample | `findings/rich_intake_wsCC.md` |
| `_wsch_prefill.ts` | whether organisation type can be pre-filled from the register's entity designator, so it costs the founder nothing to answer | **Route dead.** Organisation type buys nothing and would have blocked SAP and Diehl Aerospace from schemes they actually received |
| `_wsdi_reach.ts` | what the five unwired evidence stores are worth *before* any of them is wired, measured as sibling pairs uniquely separated inside a multi-leaf regime | **Route dead.** Per-fund evidence — case register and SATR fields — is +0.0, structurally |
| `_wsdq_seam.ts` | the ranker on the twelve archetypes, stopping at the selection seam: depth vs judgement | **Route dead, and its original inference retracted.** wsDQ concluded "depth, not judgement, is binding"; wsDR measured that wrong. Depth is not the constraint — see ARCHITECTURE.md |
| `_wsct_order.ts` | should the memo re-sort the shortlist's order at all — fit vs pool vs verdict, three arms over ONE pool | **Route dead, and the arms it swept are now deleted.** MEMO@6: fit 24.0%, pool 28.8%, verdict 27.6%; `verdict` shipped because it published no row carrying an obstacle where `pool` published 4.6%. Archived by wsGB, which made `AGENT_SELECT=adviser` the default and removed the deterministic memo sort all three were arms of. Two of the three are still runnable from a local sort in the file; the `fit` arm cannot be, because `scoreFitControl` went with it |

### Archived by wsGW, 2026-08-13

Five more, found the same way: their workstream merged its conclusion and left
its instrument behind. Each is the only record of the reading below.

| script | the question it bought | where the answer is recorded |
|---|---|---|
| `_wscv_publishes.ts` | **what an arm publishes, not where the answer ranks** — verdict mix, off-country rows and four other properties of the published five. Written because an ordering that scored 1.2 points more was rejected for putting obstacle-carrying rows on the page, and EXACT@5 cannot see that | `findings/ship_blend_wsCV/` — **route dead.** wsCU's +6.0 was a pure pool re-ordering; end to end on the publishing path the blend is a null |
| `_wscy_rt.ts` | how many published application routes are the fund's own, and how many are a parent regime's addressee printed as this scheme's instruction | Settled and shipped: `emit_offer_route.ts` / `check_offer_route.ts` carry the route rule, and `workstream_y_ipcei_reversal.md` the principle |
| `_wsde_dup.ts` | **how much of the published table is the same thing said again**, per axis, over the whole gradable population — the row-eight question, where EXACT@k keeps climbing ~2 points a row while REGIME@k and CHANNEL@k go flat | Shipped as a property: `lib/intelligence/rowNovelty.ts` + `rowNovelty.test.ts`. The merge is "wsDE: the tail was a catalogue, and it is now advice" |
| `_wsey_menu_demand.ts` | which **open** funds actually reach a real founder's menu, at two depths (`accessiblePool`, ceiling 77.5%, and the `VERDICT_POOL` cut) — the correct prioritisation for text-fetching, against a coverage percentage that counts 228 rows in countries holding no founder | wsEY merged; the P1 it served is superseded. Its wsEO-generation twin is on `archive/wsEO-legibility` |
| `_wsey_targets.ts` | emitted the per-country fetch target list for undescribed open rows, in the shape `load_scheme_text.py` reads back | Same. Kept because it is the only description of that file format outside the loader |

## Two things deliberately NOT archived

`../_wsdw_rows.ts` and `../_wsdm_rows.ts` are also referenced by nothing, and
they stay in `scripts/`. Both measure whether a scheme's own sentence reaches the
row the model reads, and row legibility is the **current live front**, not a
closed route. Archiving the diagnostics for the question presently being worked
would be exactly backwards.

## Re-running one

They were written against a live corpus and most need `DATABASE_URL`. From
`website/frontend`:

```bash
npx tsx scripts/archive/_wscb_perfield.ts
```

Their relative imports were rewritten one directory deeper when they moved
(`../lib/…` → `../../lib/…`); nothing else about them changed.
