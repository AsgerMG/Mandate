# Wincent — common entry points.
# Run `make help` for the list. The data pipeline flows:
#   ETL/extract/* -> data/db.sqlite -> ETL/transform/* -> ETL/load/* (+ QA + backup)
#                 -> make data -> website/frontend/public/data -> website/frontend
#
# The ETL block (extract -> transform -> load) lives under ETL/. Extractors are
# per-source and hit external APIs; run them individually (see ETL/README.md).
# The website block (build -> frontend) lives under website/ (see website/README.md).
# This Makefile covers the regular transform/analysis/backup loop.

DATE    := $(shell date +%Y%m%d)
BACKUP  := $(HOME)/Wincent-backups
ICLOUD  := $(HOME)/Library/Mobile Documents/com~apple~CloudDocs/Wincent-backups

.PHONY: help analyze visuals data site-dev site-build backup vault vault-status classify sanity transform sources renew signals signals-digest eligibility pull-db push news republish verify-cron refresh refresh-check

help:
	@echo "Wincent make targets:"
	@echo "  make republish   Make the site serve the corpus the ETL produced (pull -> gate -> regenerate)"
	@echo "  make verify-cron Is the weekly Railway ETL scheduled, deployed, and running this code?"
	@echo "  make check-stores One store of record per table, and no schema drift between stores"
	@echo "  make push-db     Push the local corpus to the volume, having PROVED it loses nothing"
	@echo "  make pull-db     Pull the latest db.sqlite from the Railway ETL volume (run before local work)"
	@echo "  make push        Run cloud-blocked/manual sources locally, then push db.sqlite back to Railway"
	@echo "  make sources     List every source + how to renew it (ETL/events/extract/renew.py --list)"
	@echo "  make renew       Pull fresh data for every AUTO source (then run 'make transform backup')"
	@echo "  make classify    LLM sector_top/subsector/entity_type classification (cost-gated at \$$20, ETL/events/transform/classify_taxonomy.py)"
	@echo "  make sanity      Post-load corpus integrity checks (ETL/events/load/qa/sanity_check.py)"
	@echo "  make transform   classify + sanity (re-derive everything from loaded rows)"
	@echo "  make backup      Back up db.sqlite + data/ to local + iCloud (ETL/events/load/backup.py)"
	@echo "  make vault       Snapshot the two IRRECOVERABLE tables with history + a shrink guard (ETL/events/load/corpus_vault.py)"
	@echo "  make vault-status What the vault holds, how old it is, and whether iCloud has it"
	@echo "  make analyze     Rebuild corpus KPIs (website/build/synthesis.py)"
	@echo "  make visuals     Rebuild home-page visuals (taxonomy, map, coverage)"
	@echo "  make views       Install the read-side views in Postgres (ETL/schema/install_views.py)"
	@echo "  make data        Rebuild EVERY site JSON from Postgres (website/build/build_site_data.py)"
	@echo "  make eligibility Sync YAML -> DB, export instrument_terms.json, publish to Railway Postgres"
	@echo "                   then rebuild both vector indexes (needs VOYAGE_KEY)"
	@echo "  make signals     Check the signals_* tables + status + QA (ETL/intelligence/load/load_signals.py)"
	@echo "  make news        Full news/signals automation cycle (local only, cost-gated at \$$20)"
	@echo "  make site-build  Static build of the Next.js site (website/frontend/out/)"
	@echo "  make site-dev    Run the site dev server at localhost:3000"

sources:
	python3 ETL/events/extract/renew.py --list

renew:
	python3 ETL/events/extract/renew.py --auto

# Keep the corpus current without being asked, and without paying to reproduce
# numbers that were already right. Runs the downstream chain only for sources
# whose raw files actually changed, and stops at the coverage gate rather than
# publishing a corpus that got worse.
#   make refresh-check   what changed, and what would run
#   make refresh         run it
refresh-check:
	python3 ETL/refresh.py --check

refresh:
	python3 ETL/refresh.py

# THE one command that makes the website serve the corpus the ETL produced.
#
# The ETL refreshes a Railway-resident db.sqlite every Sunday at 03:00 UTC. The
# website serves committed build artifacts and does not follow: measured over
# this repo's own history the median gap was 4.6 days and the worst was 32
# (`python3 ETL/lib/drift_window.py`). Closing it by hand took a pull, a
# regeneration, several builders and a commit, remembered in the right order.
# This is that, in order, with the gate in the middle.
#
# It deliberately stops short of the commit. An automated job that pushes to
# main redeploys the whole site on a cron, and the artifacts it would push are
# exactly the ones a human should look at — the headline number a founder reads
# is not a thing to change unattended. So this leaves the diff staged in your
# working tree and tells you what moved.
republish:
	# 1. The ETL's corpus, not last week's copy of it. Wakes the cron service,
	#    downloads, and confirms the schedule was restored afterwards. Via
	#    pull-db so this shares its union semantics: republishing must not be a
	#    way to quietly discard local instrument work on the way past.
	$(MAKE) pull-db
	# 2. Regenerate everything downstream, THROUGH the coverage gate, which
	#    stops the chain rather than publishing a corpus that got worse.
	#    --force because a pull changes db.sqlite, not the raw source files
	#    refresh.py hashes, so nothing would otherwise look changed.
	python3 ETL/refresh.py --force
	# 3. Say what actually moved, so the commit is a decision and not a reflex.
	@echo ""
	@echo "── what changed ────────────────────────────────────────────────"
	@git --no-pager diff --stat -- website/frontend/public/data project-mgmt/coverage_baseline.json
	@echo ""
	@echo "Review, then commit and push — Vercel deploys on push:"
	@echo "  git add website/frontend/public/data project-mgmt"
	@echo "  git commit -m 'Republish the corpus the ETL produced'"

# Is the weekly refresh going to happen, and will it run this code? Reads the
# schedule back from Railway rather than trusting the last write -- see
# ETL/lib/verify_cron.py for the two schedules and why only one of them counts.
# The two store guards, both halves. Named together because they answer one
# question -- "is there one corpus, and does everyone agree what shape it is" --
# and because running only the credential-free half is how the volume stayed 14
# migrations behind without anything going red.
.PHONY: check-stores
check-stores:
	python3 ETL/schema/check_store_of_record.py
	python3 ETL/schema/check_store_schema.py --sqlite data/db.sqlite --postgres

verify-cron:
	python3 ETL/lib/verify_cron.py

classify:
	# Re-apply labels the last reload wiped BEFORE spending anything. companies
	# is destructively reloaded and its surrogate id re-issued, and an entire
	# paid LLM pass was lost that way -- 8 batches submitted, 8 collected, no
	# row carrying sector_taxonomy_method='llm' today, results expired before
	# anyone noticed. Restoring first also means the run below only pays for
	# companies genuinely never classified.
	python3 ETL/events/transform/classify_taxonomy.py restore
	python3 ETL/events/transform/classify_taxonomy.py apply-nace
	python3 ETL/events/transform/classify_taxonomy.py run --max-cost 20
	# Persist immediately, so the next reload cannot undo what was just paid for.
	python3 ETL/events/transform/classify_taxonomy.py persist

sanity:
	python3 ETL/events/load/qa/sanity_check.py

transform: classify sanity

analyze:
	python3 website/build/synthesis.py

# The read-side views (v_events ...) in Postgres, as capital_app. A build checks
# them (install_views.py --check) and cannot install them: it reads as capital_ro.
views:
	python3 ETL/schema/install_views.py

visuals:
	python3 website/build/home_visuals.py
	python3 website/build/country_map.py
	python3 website/build/coverage_indicator.py

# The orchestrator reinstalls the SQL views, runs every builder in dependency
# order, and verifies freshness — use this rather than the partial targets above.
data:
	python3 website/build/build_site_data.py

# Eligibility subsystem (funding_instruments/eligibility_gates/eligibility_clauses):
# sync hand-authored YAML into the served tables in Postgres (schema capital)
# and export the JSON fallback the frontend reads. Not part of `make
# data` since it has its own DATABASE_URL dependency and publish cadence.
# Order matters: triage/encode must run BEFORE eligibility_export.py and
# migrate_to_postgres.py, or both would publish the corpus without the curated
# gate_role / intake_field_resolved / value_spec columns. Both encode steps are
# incremental — a re-run only processes gates that are new or untriaged.
#
# The two vector indexes rebuild LAST, after Postgres has the new corpus.
# They are separate indexes answering different questions and must not be
# conflated: eligibility_embeddings = what a fund DEMANDS (RAG over
# requirements); instrument_profiles = what a fund FUNDS (matching a company
# description to relevant funds). Both are incremental/idempotent, so re-running
# `make eligibility` only embeds what actually changed. Needs VOYAGE_KEY.
eligibility:
	# The encoder reads data/vocabularies.json rather than restating the intake
	# vocabulary, so it is regenerated first -- an encoder working from a stale
	# vocabulary emits values the product cannot match, and the rule silently
	# stops gating rather than failing.
	cd website/frontend && npx tsx scripts/emit_vocabulary.ts
	# Region vocabulary comes from the NUTS reference data for the same reason:
	# a hand-copied list drifts silently and the rule stops gating.
	python3 ETL/terms/emit_regions.py
	python3 ETL/terms/sync_gates_from_yaml.py
	python3 ETL/terms/encode_gates.py triage
	python3 ETL/terms/encode_gates.py encode
	# Text a fetch landed is not a rule until something cuts it into gates.
	# load_scheme_text.py deliberately stops at `eligibility_text`, so without
	# this step a collection workstream can raise a market's coverage from 55%
	# to 74% and change nothing a founder sees -- the ranker scores on gates.
	# Runs AFTER encode above so the gates it cuts are picked up by the encode
	# in the next line, and before encode_regions so a sub-national rule it
	# finds gets the right pass.
	python3 ETL/terms/encode_scheme_text_gates.py run
	python3 ETL/terms/encode_gates.py encode --fresh
	# Sub-national rules get their own pass: encode_gates maps onto a fixed
	# enum, and region is 449 values of which only the founder's country
	# matters. Encoding one as `in entityCountries` PASSES everyone the rule
	# excludes, so this must run before anything publishes.
	python3 ETL/terms/encode_regions.py run
	# Two properties on anything cut from scheme text, asserted against the
	# DATABASE rather than trusted to the code that wrote it. Layer 1 is free
	# and always runs; it also checks corpus-wide that no country field holds a
	# sub-national area, which is the same defect encode_regions exists to fix
	# one field over and which the vocabulary check cannot see (country fields
	# are free text). A violation FAILS the target rather than warning.
	python3 ETL/terms/check_gate_subject.py
	# One field has one answer. Two filter gates on one ORDERED field whose
	# requirement texts state different numeric thresholds cannot both be the
	# bound that one answer is tested against -- they are branches the applicant
	# selects into, and assessInstrument conjoins every filter, which is the
	# narrowest reading and wrong for everyone. innovate_uk sat in that state
	# with both windows of one Smart Grants competition ANDed across an agency
	# of 17,012 awards, and no guard we own could see it: wsGE's by-field
	# counting makes two gates on ONE field ONE thing in the way, so nothing
	# ever blocked and no blocked-count moved. What moved was the qualification
	# BAND, on 109 of 897 founders. FAILS the target, like the line above it.
	python3 ETL/terms/check_gate_branches.py
	# THE BANDS ARE EURO AND THE FUNDER'S SENTENCE IS NOT. `TICKET_BANDS` is
	# labelled in euro and turnoverBand/balanceBand carry the euro thresholds of
	# the SME definition, but a rule is written in the funder's own currency and
	# encode_gates.py had no currency step at all. "maksimalt 500 000 kroner" is
	# EUR 46k and was encoded as a EUR 500k ceiling; "maximum 50 000 000 Ft" is
	# EUR 137k and was encoded as a EUR 50 MILLION one. Sterling at 1.17 lands in
	# the same coarse band and hid the class for months. The check names ONE
	# currency, the euro, and treats anything not shown to be euro as not euro,
	# so a Czech scheme arriving tomorrow is covered with no edit. FAILS the
	# target, like the two lines above it.
	python3 ETL/terms/test_euro_money.py
	python3 ETL/terms/check_gate_currency.py
	# A COMPARATOR THAT NO ANSWER SHAPE CAN SATISFY IS NOT A RULE. comparator.ts
	# opens numeric_gte/numeric_lte with `typeof answer === "number"` and the only
	# number in EligibilityAnswers is foundedYear, which is unreachable and which
	# no gate encodes on -- so all 46 numeric comparators were keyed to fields
	# answered with a string and NOT ONE HAS EVER DECIDED ANYTHING. Proved on 897
	# founders x 34 instruments x every band answer swept: 174,915 assessments,
	# and quarantining all 43 moves no status, no filter checked, no filter
	# passed, no blocking field. The operator is not the defect -- 18 more are
	# inert from boolean_false on a LIST field and from band bounds written in
	# another field's vocabulary -- so the check states the general property
	# (operator must act on the shape its field admits), derives both halves from
	# data/vocabularies.json, and names no gate. It reads POSTGRES as well,
	# because check_comparator_admits.ts deliberately reads only the snapshot and
	# that leaves the store this pass just wrote to unchecked. FAILS the target.
	python3 ETL/terms/check_comparator_storable.py
	# THE SECOND PATH TO PRODUCTION. encode_gates.py triage rewrites gate_role
	# from a paid model pass, so every curated demotion above is reverted by the
	# two lines above it -- and this target then exports and publishes. refresh.py
	# has always reapplied them; this target never did, so `make eligibility`
	# silently shipped a corpus in which the IPCEI selectivity findings, and every
	# other gate demoted for stating something an applicant cannot act on, were
	# filters again and could disqualify a founder. Runs before the audit so the
	# audit sees the roles that will actually ship.
	python3 ETL/terms/apply_gate_role_overrides.py
	# The same correction, one column over. apply_gate_role_overrides makes a
	# gate stop DECIDING; this clears prose that decides nothing but is still
	# shown to a founder under "who may apply" while stating a closed list they
	# cannot join, a cohort already chosen, or the granting body's own name.
	# Here rather than later for two reasons: it must land in SQLite BEFORE the
	# export and migrate_to_postgres below, and before
	# `build_instrument_profiles.py run --rebuild` at the end of this target,
	# which builds the primary ranking index straight out of this column. A
	# retraction applied after that point would be invisible to the ranker --
	# the withdrawn sentence would go on deciding what a founder is shown while
	# no longer being shown to them. The set is derived from the pertinence
	# verdicts, never a list of ids, so it also catches the next one.
	python3 ETL/terms/retract_unpertinent_text.py --write
	# Audit BEFORE publishing, and quarantine rules their own recipients
	# contradict, so a wrong rule cannot reach a founder's brief.
	python3 ETL/terms/audit_encoding_vs_reality.py --quarantine
	# A VERIFIED CORRECTION MUST SURVIVE THIS TARGET. Every step above can write
	# `value_spec`, and one of them did: `encode_gates.py encode` selects
	# `filter AND value_spec IS NULL`, which is the exact shape of a quarantine,
	# so the default pass re-derived comparators over 22 rows across four
	# hand-verified correction sets -- the oldest six days old and never
	# noticed, because the revert is partial and silent and moves no total.
	# Here rather than in CI because the evidence is committed but the corpus is
	# not, and here rather than after the publish because migrate_to_postgres.py
	# below TRUNCATEs eligibility_gates and reloads it from SQLite: this is the
	# last moment at which a reverted correction is still only local. FAILS the
	# target. The population is re-derived from project-mgmt/evidence/ on every
	# run, so the next correction set is covered the day it lands.
	python3 ETL/terms/check_corrections_applied.py
	# Refuse to publish a corpus that got worse. Every serious defect this
	# week was silent -- a thinner corpus still produces a confident brief --
	# so the coverage measurement is made load-bearing here, BEFORE the export
	# and the publish that follow it.
	python3 ETL/terms/coverage_gate.py
	python3 website/build/eligibility_export.py
	# The lexical theme index is DERIVED from the export above, so it is
	# regenerated here rather than beside emit_vocabulary at the top: that one
	# feeds the encoder and must run first, this one consumes the encoder's
	# output. It is what lets relevance.ts stop loading the whole corpus's
	# gates on every request; check_theme_index.ts fails the build if stale.
	cd website/frontend && npx tsx scripts/emit_theme_index.ts
	# (migrate_to_postgres.py, the SQLite -> Postgres truncate-and-reload, was
	# here. Since 2026-11-05 every step above writes the served tables directly.)
	# (A second check_corrections_applied.py, against Postgres after the
	# publish, was here; with one store the run above already asked it.)
	python3 ETL/terms/embed_eligibility.py run
	python3 ETL/terms/build_instrument_profiles.py classify-titles
	python3 ETL/terms/build_instrument_profiles.py run --rebuild
	# The base rate the selector is TOLD, re-measured against the corpus that
	# was just published. It is P(the fund a company actually won is within the
	# first K rows of its accessible pool), and every accessible pool moves when
	# the corpus does -- so a curve left behind here does not degrade a ranking,
	# it makes the prompt state a confident falsehood about the list in front of
	# the model. That is exactly what shipped for four workstreams. Last, and
	# after Postgres, because it reads the published corpus.
	# check_pool_recall_curve.ts fails the build when this has not been re-run.
	cd website/frontend && npx tsx scripts/_wsdr_curve.ts

# News/signals layer (the signals_* tables of schema capital): table check +
# stage counts + QA. Read-only.
# The per-stage transforms (classify_relevance, entity_link_articles,
# classify_signals, embed_articles) run individually — they submit/collect
# Anthropic batches on their own cadence. Extractors are pending the curated
# source registry, so this is a clean no-op until sources exist.
signals:
	python3 ETL/intelligence/load/load_signals.py

# Export the intelligence digest the /for-companies brief reads (topics +
# per-sector passages from the signals_* tables). Run after ingest/hydrate/embed.
signals-digest:
	python3 website/build/signals_digest.py

# Full news/signals automation cycle: sync -> collect last run's batches ->
# ingest -> hydrate -> submit relevance/entity/signal batches (cost-gated at
# $20) -> embed -> digest. Runs LOCALLY (fastembed isn't in the Railway
# image) -- see ETL/intelligence/news_cron.py for why. Run on whatever
# cadence you like; each run's `collect` picks up the previous run's
# submitted batches.
news:
	python3 ETL/intelligence/news_cron.py

site-build:
	cd website/frontend && npm run build

site-dev:
	cd website/frontend && npm run dev

backup:
	python3 ETL/events/load/backup.py

# `backup` writes dated whole-database copies. A dated copy is not a history:
# you can return to the 8th, but you cannot see what changed between the 8th
# and the 9th, or restore ONE table without restoring everything. `vault`
# covers the two tables that cannot be rebuilt from any source we still have,
# with a guard that refuses to replace a good snapshot with a smaller one. It
# also runs daily under launchd -- these targets are for running it by hand.
vault:
	python3 ETL/events/load/corpus_vault.py snapshot

vault-status:
	python3 ETL/events/load/corpus_vault.py status --brctl

# The broad ETL pipeline (43 funder/registry extractors, classify, sanity)
# runs on a weekly Railway cron against a Railway-resident volume, not locally.
# This brings that corpus down for local interactive work (eligibility research,
# ad-hoc analysis). Run before any session that needs fresh data.
#
# It is a UNION, not an overwrite. It used to be `pull_db.py`, which downloads
# straight over data/db.sqlite -- correct only while the volume is ahead of the
# laptop, which is a property nothing established. On 2026-08-07 it was false in
# the other direction and one `make pull-db` would have replaced 1,088
# instruments with 322, silently and with no undo. So: fetch to a side file the
# local corpus is not, then INSERT OR IGNORE the rows the laptop lacks. Rows the
# laptop already has are left exactly as they are.
#
# `pull_db.py` is still there for the case where you genuinely mean to discard
# local state. Read its header first.
# ── WHY THIS IS SCOPED ─────────────────────────────────────────────────────
# The unscoped merge REFUSES, every time, and correctly: keying on `id` across
# these two stores finds 4 collisions and 188 aliases -- four EU joint
# undertakings whose ids mean a different administering body on each side, and
# 174 eligibility gates that are the same rule under two ids. A blind union
# would silently duplicate the gates and take the SHORTER of the two fund names.
#
# `companies` and `public_funding_events` are the two tables the weekly cron
# actually adds to, and both audit clean: 0 collisions, 0 aliases. So the pull
# takes exactly those, and anything else that diverges is a decision somebody
# has to make with the audit in front of them rather than a transfer.
#
# 2026-08-19: an unscoped `make pull-db` inside a script was read as a fatal
# error and stopped the promotion it was the first step of. The refusal is the
# guard working; scoping it is what makes the target usable.
pull-db:
	python3 ETL/events/extract/pull_db_side.py /tmp/volume-db.sqlite
	python3 ETL/lib/merge_volume_into_local.py /tmp/volume-db.sqlite \
	    --only companies,public_funding_events --write

# The other half of the automation split: everything that can't run on
# Railway (cloud-blocked NETWORK sources + MANUAL sources with a file
# dropped in data/manual_inbox/). Pulls fresh, runs what it can locally,
# classifies + sanity-checks, pushes the result back. See
# ETL/events/extract/push_local.py for exactly what runs and what's excluded.
push:
	python3 ETL/events/extract/push_local.py

# The safe half of `push`, on its own: no sources, no LLM spend, just the
# corpus onto the volume with the superset proof in front of it and a readback
# behind it. This is the one to reach for after local instrument work.
.PHONY: push-db
push-db:
	python3 ETL/events/extract/push_db_verified.py --write
