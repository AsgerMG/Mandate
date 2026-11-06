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

## Retired guards (wsHT, 2026-08-18)

Not measurement receipts — GUARDS, removed from `npm run check` and from CI
because they failed the build over something no founder experiences. The suite
went from 0 checks on 14 July to 59 on 18 August and thirteen were red on main
with seven of them a week old; the full argument is in
`project-mgmt/findings/redchecks_wsHT/`. They are kept, and runnable by hand,
because each states a real property and one of them may earn its way back.

| retired guard | what it asserted | why it is not a build failure |
|---|---|---|
| `retired_check_doc_identifiers.ts` | an ALL-CAPS name in code font in `lib/intelligence/*.md` resolves to a real symbol | it grades markdown. A doc naming a symbol that has been renamed is worth fixing and is not worth stopping a branch |
| `retired_check_ws_scripts.ts` | every `_ws*.ts` is named by something durable, or declared in flight | the rule is backwards: naming is what happens to a file automatically as it is written about, so its steady state is that nothing is ever retired — 104 files, then 134, then 136. The property it should assert is the `@ws-active until <date>` marker already in the files' own headers, enforced |
| `retired_check_archetypes.ts` | the corpus holds funds for each of the twelve profiles | superseded by `check_memo_table`, which says so in its own header: an archetype was receiving ZERO ROWS while this one reported it passing. A guard whose stronger twin exists is a second opinion that can only ever be wrong |
| `retired_check_guard_subject.ts` | every guard reading the wide side of a seam also reads the narrow side | a guard about guards. In a suite being cut for inattention, a check whose subject is the checks is the thing protecting itself |

## E2 archive, 2026-11-06: one-off workstream scripts and unreached measure/diagnose/probe/show scripts

Moved by E2 (archive and CI). The owner's decision: everything the
founder-facing product does not reach is archived, never deleted. Each file was
checked against every tracked code and config file in the monorepo
(`.ts/.tsx/.mjs/.py/.json/.yml/.sh`, Makefile, package.json, workflows, the
cron): **no kept file imports any of them**, and no pipeline, `npm` script,
Makefile target or workflow invokes them. The column says where the filename
still appears; every such mention is a comment, a docstring or a hand-kept
allowlist entry (`check_harness_intake.ts`), not an import or an invocation.

Their relative imports were rewritten one directory deeper (`../lib/...` ->
`../../lib/...`, `./kept` -> `../kept`), so each still runs by hand from
`web/` as `npx tsx scripts/archive/<file>`. This directory is excluded from
`tsc`, ESLint and CI. Embedding-calling scripts stay on
`mandate/embedding/boundary_ratchet.json` under their archive path.

Kept in `scripts/` despite the naming pattern, because a live file reaches them:
`measure_funnel.ts` (`npm run stages`), `measure_recall.ts` (cuts the
tapes `replay_tape.ts` replays), `measure_signal_power.ts` (writes the
features `fit_signal_blend.ts` reads), `_wsco_window.ts` (producer of
`findings/wsCO_window_register.json`, which `check_window_evidence.ts` reads
and tells you to re-run), `probe_stale_snapshot.ts` (`check_degradation.ts`
prints it as the remedy). `_wsdr_curve.ts` was PROMOTED to
`emit_pool_recall_curve.ts`: it is the producer of
`poolRecallCurve.generated.json` (Makefile target, `check_pool_recall_curve`).

| script | evidence it is unreached |
|---|---|
| `_wsca_ceilings.ts` | named by no kept file |
| `_wsca_fields.ts` | named by no kept file |
| `_wsca_founder.ts` | named by no kept file |
| `_wsca_fte.ts` | named by no kept file |
| `_wsca_marginal.ts` | named by no kept file; otherwise used only by other archived scripts (_wsci_autopsy.ts) |
| `_wsca_newq.ts` | named by no kept file |
| `_wsca_unmapped.ts` | named by no kept file |
| `_wscb_realistic.ts` | named by no kept file |
| `_wscb_tranche.ts` | named by no kept file; otherwise used only by other archived scripts (_wscb_realistic.ts) |
| `_wscc_ceiling.ts` | named by no kept file; otherwise used only by other archived scripts (_wscc_classify.ts, _wsch_ceiling.ts) |
| `_wscc_classify.ts` | named by no kept file; otherwise used only by other archived scripts (_wscc_ceiling.ts) |
| `_wscc_demand.ts` | named by no kept file; otherwise used only by other archived scripts (_wscc_ceiling.ts, _wscc_classify.ts, _wscc_exact_bound.ts, _wscc_pilot.ts ...) |
| `_wscc_exact_bound.ts` | named (comments/prose only) by `web/scripts/check_published_figures.ts` |
| `_wscc_pilot.ts` | named (comments/prose only) by `web/scripts/check_harness_intake.ts` |
| `_wscd2_reach.ts` | named (comments/prose only) by `web/scripts/check_harness_intake.ts`; otherwise used only by other archived scripts (measure_open_questions.ts) |
| `_wsce_split.ts` | named by no kept file; otherwise used only by other archived scripts (_wsce_adjudicate.py) |
| `_wscg_bodyshare.ts` | named (comments/prose only) by `web/lib/intelligence/rowIdentity.ts` |
| `_wsch_ceiling.ts` | named by no kept file |
| `_wsch_derive.ts` | named by no kept file; otherwise used only by other archived scripts (_wsch_ceiling.ts) |
| `_wsci_autopsy.ts` | named (comments/prose only) by `web/scripts/check_harness_intake.ts`, `web/scripts/check_recall_floor.ts`; otherwise used only by other archived scripts (_wscj_territory.ts, _wsck_residual.ts, _wsck_topic.ts, _wscl_collapse.ts ...) |
| `_wsci_chan.ts` | named by no kept file |
| `_wscj_screen.ts` | named (comments/prose only) by `web/scripts/check_winner_not_blocked.ts`, `web/scripts/emit_official_catchments.ts` |
| `_wscj_territory.ts` | named by no kept file; otherwise used only by other archived scripts (_wscj_screen.ts) |
| `_wsck_money.ts` | named (comments/prose only) by `web/scripts/check_harness_intake.ts`; otherwise used only by other archived scripts (_wsck_probe.ts) |
| `_wsck_oracle.ts` | named by no kept file |
| `_wsck_probe.ts` | named by no kept file |
| `_wsck_real.ts` | named (comments/prose only) by `mandate/embedding/boundary_ratchet.json` |
| `_wsck_residual.ts` | named by no kept file; otherwise used only by other archived scripts (_wsck_oracle.ts, _wsck_topic.ts) |
| `_wsck_topic.ts` | named (comments/prose only) by `mandate/embedding/boundary_ratchet.json`; otherwise used only by other archived scripts (_wsck_oracle.ts, _wsck_real.ts) |
| `_wscl_collapse.ts` | named by no kept file; otherwise used only by other archived scripts (_wscl_official.ts, _wscl_recurrence.ts) |
| `_wscl_official.ts` | named (comments/prose only) by `web/scripts/_wsco_window.ts` |
| `_wscl_recurrence.ts` | named (comments/prose only) by `web/lib/intelligence/liveness.ts`; otherwise used only by other archived scripts (_wscl_collapse.ts, _wscl_sourcepage.ts, _wsgt_recur.ts) |
| `_wscl_sourcepage.ts` | named by no kept file; otherwise used only by other archived scripts (_wscl_collapse.ts) |
| `_wscm_stages.ts` | named (comments/prose only) by `web/scripts/check_harness_intake.ts`, `web/scripts/rankerTape.ts`; otherwise used only by other archived scripts (_wscm_tiers.ts) |
| `_wscm_tiers.ts` | named (comments/prose only) by `web/scripts/check_harness_intake.ts` |
| `_wsct_blocks.ts` | named by no kept file |
| `_wscu_memo.ts` | named by no kept file; otherwise used only by other archived scripts (_wsdc_rows.ts, _wsds_curve.sh) |
| `_wscw_dump.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts`, `web/lib/intelligence/tableTrace.ts`, `web/scripts/rankerTape.ts`; otherwise used only by other archived scripts (_wscw_seats.ts, _wsda_rows.ts, _wsec_compose.ts) |
| `_wscw_seats.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts`, `web/scripts/mcnemar.ts` |
| `_wscx_names.ts` | named (comments/prose only) by `web/lib/intelligence/applyableBody.test.ts` |
| `_wscy_funnel.ts` | named by no kept file |
| `_wscy_routes.ts` | named (comments/prose only) by `web/lib/intelligence/types.ts` |
| `_wscz_aleph.ts` | named (comments/prose only) by `web/scripts/measure_recall.ts` |
| `_wscz_precision.ts` | named by no kept file |
| `_wsda_rows.ts` | named (comments/prose only) by `web/scripts/mcnemar.ts`, `web/scripts/rankerCache.ts`, `web/scripts/replay_tape.ts` |
| `_wsdc_rows.ts` | named (comments/prose only) by `web/lib/intelligence/briefChecks.ts`; otherwise used only by other archived scripts (_wsdm_rows.ts) |
| `_wsde_prompt.ts` | named (comments/prose only) by `web/lib/intelligence/pipeline.ts`, `web/scripts/measure_recall.ts`; otherwise used only by other archived scripts (_wshm_money.ts) |
| `_wsdi_leak.ts` | named (comments/prose only) by `web/lib/intelligence/corpus.ts` |
| `_wsdl_equiv.ts` | named (comments/prose only) by `web/lib/intelligence/agentSelect.ts`, `web/lib/intelligence/pipeline.ts`; otherwise used only by other archived scripts (_wsdp_order.ts) |
| `_wsdl_menu.ts` | named (comments/prose only) by `web/lib/intelligence/agentSelect.ts`; otherwise used only by other archived scripts (_wsgv_rowfields.ts) |
| `_wsdm_rows.ts` | named by no kept file |
| `_wsdp_order.ts` | named by no kept file |
| `_wsdq_diff.ts` | named by no kept file; otherwise used only by other archived scripts (_wsdq_run.ts) |
| `_wsdq_founder.ts` | named by no kept file; otherwise used only by other archived scripts (_wsdq_run.ts) |
| `_wsdq_paths.ts` | named by no kept file; otherwise used only by other archived scripts (_wsdq_diff.ts, _wsdq_founder.ts, _wsdq_run.ts) |
| `_wsdq_pick.ts` | named by no kept file; otherwise used only by other archived scripts (_wsdq_probe.ts) |
| `_wsdq_probe.ts` | named by no kept file |
| `_wsdq_run.ts` | named (comments/prose only) by `web/lib/intelligence/agentSelect.ts`; otherwise used only by other archived scripts (_wsdq_founder.ts) |
| `_wsdr_seam.ts` | named (comments/prose only) by `web/lib/intelligence/agentSelect.ts`, `web/lib/intelligence/pipeline.ts`; otherwise used only by other archived scripts (_wsej_asks.ts, _wsga_headtohead.ts) |
| `_wsds_curve.sh` | named by no kept file |
| `_wsds_probe.ts` | named (comments/prose only) by `web/lib/intelligence/caps.ts` |
| `_wsdw_rows.ts` | named by no kept file |
| `_wsdy_budget.ts` | named by no kept file |
| `_wsdy_slots.ts` | named (comments/prose only) by `web/lib/intelligence/agentSelect.ts`, `web/scripts/_ruler.ts`; otherwise used only by other archived scripts (_wsho_harvest.ts, _wsho_strata.ts) |
| `_wsec_compose.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts`, `web/scripts/_ruler.ts` |
| `_wsec_descriptor.ts` | named (comments/prose only) by `web/lib/intelligence/sectorClause.test.ts`, `web/lib/intelligence/shortlist.ts`, `web/scripts/check_answer_not_reachable.ts` |
| `_wsec_pool.ts` | named by no kept file; otherwise used only by other archived scripts (_wsec_compose.ts) |
| `_wsei_depth.ts` | named by no kept file; otherwise used only by other archived scripts (_wsgd_stages.ts) |
| `_wsei_depth_arms.ts` | named (comments/prose only) by `web/lib/intelligence/agentSelect.ts` |
| `_wsei_reread_wsdr.ts` | named by no kept file |
| `_wsej_asks.ts` | named (comments/prose only) by `web/lib/intelligence/rankerAsks.test.ts` |
| `_wsey_census.ts` | named by no kept file; otherwise used only by other archived scripts (_wsey_legible_staged.ts) |
| `_wsey_legible_staged.ts` | named by no kept file |
| `_wsfc_divergence.ts` | named (comments/prose only) by `web/lib/intelligence/founderPath.test.ts` |
| `_wsfe_seats.ts` | named (comments/prose only) by `web/lib/intelligence/rowRenderedLabel.test.ts`, `web/lib/intelligence/shortlist.ts` |
| `_wsfg_cost.ts` | named by no kept file; otherwise used only by other archived scripts (_wsga_plan.ts) |
| `_wsfg_silence.ts` | named (comments/prose only) by `web/lib/intelligence/agentSelect.ts`, `web/lib/intelligence/schemeText.ts` |
| `_wsfx_cost.ts` | named by no kept file |
| `_wsfx_pull.ts` | named by no kept file |
| `_wsga_headtohead.ts` | named (comments/prose only) by `web/lib/intelligence/agentSelect.ts`, `web/lib/intelligence/caps.ts`; otherwise used only by other archived scripts (_wsho_strata.ts) |
| `_wsga_plan.ts` | named by no kept file |
| `_wsga_stats.ts` | named by no kept file; otherwise used only by other archived scripts (_wsga_headtohead.ts, _wsga_plan.ts, _wsho_strata.ts) |
| `_wsgd_stages.ts` | named by no kept file; otherwise used only by other archived scripts (_wsim_mediator.ts) |
| `_wsge_attribution.ts` | named (comments/prose only) by `web/lib/intelligence/accessMode.ts`, `web/lib/intelligence/verdict.ts` |
| `_wsge_counterfactual.ts` | named (comments/prose only) by `web/lib/intelligence/verdict.ts` |
| `_wsgl_arms.ts` | named by no kept file |
| `_wsgl_contradictions.ts` | named by no kept file |
| `_wsgl_floor.ts` | named by no kept file |
| `_wsgl_rows.ts` | named by no kept file |
| `_wsgl_snapshot.ts` | named by no kept file |
| `_wsgo_consensus.ts` | named by no kept file; otherwise used only by other archived scripts (_wshi_tokens.ts) |
| `_wsgp_audit.ts` | named by no kept file |
| `_wsgt_caveats.ts` | named (comments/prose only) by `web/lib/intelligence/liveness.ts` |
| `_wsgt_founder.ts` | named (comments/prose only) by `web/lib/intelligence/liveness.ts` |
| `_wsgt_lifted.ts` | named (comments/prose only) by `web/lib/intelligence/liveness.ts` |
| `_wsgt_recur.ts` | named by no kept file |
| `_wsgu_blockers.ts` | named by no kept file |
| `_wsgu_constant_fields.ts` | named by no kept file |
| `_wsgu_counterfactual.ts` | named (comments/prose only) by `web/lib/intelligence/corpus.ts`, `web/scripts/check_winner_not_gated.ts`, `web/scripts/gateCorrections.ts`, `web/scripts/measure_funnel.ts`; otherwise used only by other archived scripts (_wshd_pg_drift.ts, _wsic_band_counterfactual.ts) |
| `_wsgu_production_answers.ts` | named (comments/prose only) by `web/scripts/check_winner_not_gated.ts` |
| `_wsgv_rowfields.ts` | named (comments/prose only) by `web/lib/intelligence/agentSelect.ts`, `web/scripts/check_answer_not_reachable.ts` |
| `_wsgx_pairs.ts` | named by no kept file; otherwise used only by other archived scripts (_wsir_score.ts) |
| `_wsgy_rankshape.ts` | named by no kept file; otherwise used only by other archived scripts (_wsgy_report.ts, _wsha_doors.ts, _wsip_fieldtier.ts) |
| `_wsgy_report.ts` | named by no kept file; otherwise used only by other archived scripts (_wsgy_rankshape.ts, _wsha_report.ts, _wshh_report.ts) |
| `_wsgz_sector_resolution.ts` | named by no kept file |
| `_wsha_doors.ts` | named by no kept file; otherwise used only by other archived scripts (_wsha_evidence.ts, _wsha_gates.ts, _wsha_report.ts, _wshe_arms.ts ...) |
| `_wsha_evidence.ts` | named by no kept file |
| `_wsha_gates.ts` | named by no kept file |
| `_wsha_report.ts` | named by no kept file; otherwise used only by other archived scripts (_wsha_doors.ts, _wsha_evidence.ts, _wsha_gates.ts) |
| `_wshd_pg_drift.ts` | named by no kept file |
| `_wshe_arms.ts` | named by no kept file; otherwise used only by other archived scripts (_wsha_doors.ts) |
| `_wshe_award.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts` |
| `_wshf_foldaudit.ts` | named by no kept file |
| `_wshf_funnel_diff.ts` | named by no kept file |
| `_wshf_labels.ts` | named by no kept file |
| `_wshf_probe.ts` | named by no kept file |
| `_wshf_prove.ts` | named by no kept file |
| `_wshf_successor_count.py` | named by no kept file |
| `_wshf_sweep.ts` | named by no kept file |
| `_wshg_doors.ts` | named by no kept file |
| `_wshg_useoffunds.ts` | named by no kept file; otherwise used only by other archived scripts (_wshg_doors.ts) |
| `_wshh_components.ts` | named (comments/prose only) by `mandate/embedding/boundary_ratchet.json` |
| `_wshh_cosines.ts` | named (comments/prose only) by `mandate/embedding/boundary_ratchet.json`; otherwise used only by other archived scripts (_wshh_components.ts, _wshh_report.ts) |
| `_wshh_report.ts` | named by no kept file; otherwise used only by other archived scripts (_wsho_harvest.ts) |
| `_wshi_tokens.ts` | named (comments/prose only) by `web/lib/intelligence/caps.ts`, `web/scripts/check_maxtok_headroom.ts` |
| `_wshl_wiring.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts` |
| `_wshm_money.ts` | named (comments/prose only) by `web/lib/intelligence/money.ts` |
| `_wshn_successor_reach.ts` | named by no kept file |
| `_wsho_harvest.ts` | named (comments/prose only) by `web/scripts/_ruler.ts`; otherwise used only by other archived scripts (_wsho_strata.ts, _wshz_replay.ts, _wsib_ruler.ts) |
| `_wsho_strata.ts` | named (comments/prose only) by `web/scripts/check_env_loader.ts`, `web/scripts/rankingArms.test.ts`; otherwise used only by other archived scripts (_wsho_harvest.ts) |
| `_wshq_horizon.ts` | named by no kept file |
| `_wshq_lag.ts` | named (comments/prose only) by `web/lib/intelligence/liveness.ts` |
| `_wshq_probe.ts` | named by no kept file |
| `_wshr_labels.ts` | named by no kept file |
| `_wshx_dead_answers.ts` | named by no kept file |
| `_wshz_replay.ts` | named (comments/prose only) by `web/scripts/_ruler.ts` |
| `_wsib_ruler.ts` | named (comments/prose only) by `web/lib/intelligence/agentSelect.ts`, `web/scripts/_ruler.ts`; otherwise used only by other archived scripts (_wsdy_slots.ts, _wsec_compose.ts, _wsho_harvest.ts, _wshz_replay.ts) |
| `_wsic_band_counterfactual.ts` | named by no kept file; otherwise used only by other archived scripts (_wsie_currency_counterfactual.ts) |
| `_wsid_collide.ts` | named (comments/prose only) by `web/lib/intelligence/rowTitleCut.ts`, `web/lib/intelligence/shortlist.ts` |
| `_wsid_reach.ts` | named by no kept file |
| `_wsie_currency_counterfactual.ts` | named by no kept file |
| `_wsif_facts.ts` | named by no kept file |
| `_wsif_no.ts` | named by no kept file |
| `_wsif_reach.ts` | named by no kept file; otherwise used only by other archived scripts (_wsiu_ceiling.ts) |
| `_wsif_size.ts` | named by no kept file |
| `_wsif_sources.ts` | named by no kept file |
| `_wsif_tables.ts` | named by no kept file |
| `_wsig_classify.ts` | named by no kept file |
| `_wsig_dump.ts` | named by no kept file |
| `_wsig_inert_all.ts` | named by no kept file |
| `_wsig_inert_counterfactual.ts` | named by no kept file |
| `_wsih_de_branch_counterfactual.ts` | named by no kept file |
| `_wsii_noise.ts` | named by no kept file |
| `_wsij_conditional.ts` | named (comments/prose only) by `web/lib/intelligence/agentSelect.ts` |
| `_wsil_ctx.ts` | named (comments/prose only) by `web/lib/intelligence/research.ts`; otherwise used only by other archived scripts (_wsim_mediator.ts) |
| `_wsim_mediator.ts` | named by no kept file |
| `_wsin_catchall.ts` | named by no kept file |
| `_wsio_prior.ts` | named (comments/prose only) by `capital/ETL/terms/emit_channel_prior.py`; otherwise used only by other archived scripts (_wsip_fieldtier.ts) |
| `_wsip_fieldtier.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts` |
| `_wsiq_rescore.ts` | named (comments/prose only) by `web/lib/intelligence/poolBlend.ts`; otherwise used only by other archived scripts (_wsir_score.ts) |
| `_wsir_redact.ts` | named by no kept file; otherwise used only by other archived scripts (_wsit_draw.ts) |
| `_wsir_score.ts` | named by no kept file; otherwise used only by other archived scripts (_wsit_arms.py) |
| `_wsit_draw.ts` | named by no kept file |
| `_wsiu_ceiling.ts` | named by no kept file |
| `_wsiu_fixture.ts` | named by no kept file |
| `_wsiu_link.ts` | named by no kept file |
| `_wsiu_titles.ts` | named (comments/prose only) by `web/scripts/check_row_titles_distinct.ts` |
| `_wsiv_answer_lift.ts` | named by no kept file |
| `_wsiv_look.mjs` | named by no kept file |
| `diag_gate2.ts` | named (comments/prose only) by `mandate/embedding/boundary_ratchet.json` |
| `diagnose_capital_pool.ts` | named (comments/prose only) by `capital/ETL/terms/recall_capital_facts.py`, `web/scripts/check_harness_intake.ts` |
| `diagnose_corpus_variance.ts` | named (comments/prose only) by `web/scripts/check_harness_intake.ts`; otherwise used only by other archived scripts (_wscu_memo.ts) |
| `diagnose_fr_ademe.ts` | named by no kept file |
| `diagnose_fr_regimes.ts` | named by no kept file |
| `diagnose_ordering.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts`, `web/scripts/check_harness_intake.ts` |
| `diagnose_pool_filters.ts` | named by no kept file |
| `diagnose_pool_miss.ts` | named by no kept file |
| `diagnose_rank.ts` | named by no kept file |
| `diagnose_region_drop.ts` | named (comments/prose only) by `web/scripts/check_harness_intake.ts`; otherwise used only by other archived scripts (diagnose_region_reach.ts) |
| `diagnose_region_reach.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts` |
| `measure_country_class.ts` | named (comments/prose only) by `web/lib/intelligence/liveness.ts`, `web/scripts/check_liveness.ts`, `web/scripts/emit_liveness.ts`; otherwise used only by other archived scripts (measure_offer_route.ts) |
| `measure_country_offerable.ts` | named by no kept file |
| `measure_description_lift.ts` | named (comments/prose only) by `capital/ETL/terms/enrich_recall_set.py`, `web/lib/intelligence/panel.tsx`, `web/lib/intelligence/types.ts`, `web/scripts/check_harness_intake.ts`, `web/scripts/founderIntake.ts`; otherwise used only by other archived scripts (_wsiv_answer_lift.ts) |
| `measure_door_recovery.ts` | named (comments/prose only) by `web/lib/intelligence/rowIdentity.test.ts` |
| `measure_evidence_reach.ts` | named (comments/prose only) by `web/lib/intelligence/fit.ts`, `web/scripts/check_harness_intake.ts` |
| `measure_funnel_recall.ts` | named (comments/prose only) by `web/scripts/check_harness_intake.ts` |
| `measure_gate2.ts` | named (comments/prose only) by `web/scripts/build_gate1_fixture.ts` |
| `measure_gate_separation.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts` |
| `measure_gate_standalone.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts`, `web/scripts/check_harness_intake.ts` |
| `measure_offer_route.ts` | named by no kept file |
| `measure_offer_separability.ts` | named by no kept file |
| `measure_open_questions.ts` | named (comments/prose only) by `web/lib/intelligence/openJudge.ts`, `web/scripts/check_harness_intake.ts` |
| `measure_region_routing.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts`; otherwise used only by other archived scripts (measure_sibling_choice.ts) |
| `measure_sibling_by_country.ts` | named (comments/prose only) by `capital/ETL/events/load/populate_funding_instruments.py`, `web/scripts/simulate_text_lift.ts`; otherwise used only by other archived scripts (measure_country_offerable.ts) |
| `measure_sibling_choice.ts` | named (comments/prose only) by `web/lib/intelligence/fit.ts`, `web/lib/intelligence/sectorPrior.ts`, `web/scripts/regimeCases.ts` |
| `measure_sibling_coverage.ts` | named (comments/prose only) by `capital/ETL/terms/load_bdns_open_calls.py`, `capital/ETL/terms/load_scheme_text.py`, `capital/ETL/terms/measure_scheme_evidence.py`; otherwise used only by other archived scripts (_wsay_ceilings.py, measure_country_class.ts, measure_country_offerable.ts, measure_offer_separability.ts ...) |
| `measure_ticket_effect.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts` |
| `probe_leafcap.ts` | named (comments/prose only) by `web/scripts/check_leaf_cap.ts` |
| `probe_leafcap_ceiling.ts` | named (comments/prose only) by `web/lib/intelligence/shortlist.ts` |
| `probe_leafcap_effect.ts` | named by no kept file |
| `probe_missing_data_neutral.ts` | named (comments/prose only) by `web/lib/intelligence/fit.ts` |
| `probe_pool_cost.ts` | named by no kept file |
| `probe_publishable_set.ts` | named (comments/prose only) by `web/scripts/probe_stale_snapshot.ts` |
| `probe_standalone_pool.ts` | named (comments/prose only) by `web/lib/intelligence/fit.ts`, `web/scripts/check_missing_data_neutral.ts`; otherwise used only by other archived scripts (measure_evidence_reach.ts) |
| `probe_suppression.ts` | named by no kept file |
| `show_es_rows.ts` | named by no kept file |
| `show_rows.ts` | named by no kept file |
| `wsgl_corpus_stage.ts` | named (comments/prose only) by `web/scripts/measure_funnel.ts` |
