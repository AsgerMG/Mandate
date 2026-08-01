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

.PHONY: help analyze visuals data site-dev site-build backup classify sanity transform sources renew signals signals-digest eligibility pull-db push news

help:
	@echo "Wincent make targets:"
	@echo "  make pull-db     Pull the latest db.sqlite from the Railway ETL volume (run before local work)"
	@echo "  make push        Run cloud-blocked/manual sources locally, then push db.sqlite back to Railway"
	@echo "  make sources     List every source + how to renew it (ETL/events/extract/renew.py --list)"
	@echo "  make renew       Pull fresh data for every AUTO source (then run 'make transform backup')"
	@echo "  make classify    LLM sector_top/subsector/entity_type classification (cost-gated at \$$20, ETL/events/transform/classify_taxonomy.py)"
	@echo "  make sanity      Post-load corpus integrity checks (ETL/events/load/qa/sanity_check.py)"
	@echo "  make transform   classify + sanity (re-derive everything from loaded rows)"
	@echo "  make backup      Back up db.sqlite + data/ to local + iCloud (ETL/events/load/backup.py)"
	@echo "  make analyze     Rebuild corpus KPIs (website/build/synthesis.py)"
	@echo "  make visuals     Rebuild home-page visuals (taxonomy, map, coverage)"
	@echo "  make data        Rebuild EVERY site JSON from db.sqlite (website/build/build_site_data.py)"
	@echo "  make eligibility Sync YAML -> DB, export instrument_terms.json, publish to Railway Postgres"
	@echo "                   then rebuild both vector indexes (needs VOYAGE_KEY)"
	@echo "  make signals     Ensure signals.sqlite schema + status + QA (ETL/intelligence/load/load_signals.py)"
	@echo "  make news        Full news/signals automation cycle (local only, cost-gated at \$$20)"
	@echo "  make site-build  Static build of the Next.js site (website/frontend/out/)"
	@echo "  make site-dev    Run the site dev server at localhost:3000"

sources:
	python3 ETL/events/extract/renew.py --list

renew:
	python3 ETL/events/extract/renew.py --auto

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

views:
	sqlite3 data/db.sqlite < data/views.sql

visuals:
	python3 website/build/home_visuals.py
	python3 website/build/country_map.py
	python3 website/build/coverage_indicator.py

# The orchestrator reinstalls the SQL views, runs every builder in dependency
# order, and verifies freshness — use this rather than the partial targets above.
data:
	python3 website/build/build_site_data.py

# Eligibility subsystem (funding_instruments/eligibility_gates/eligibility_clauses):
# sync hand-authored YAML into db.sqlite, export the JSON fallback the
# frontend reads, then publish to Railway Postgres (the live read path once
# DATABASE_URL is set — see the Railway migration plan). Not part of `make
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
	# Sub-national rules get their own pass: encode_gates maps onto a fixed
	# enum, and region is 449 values of which only the founder's country
	# matters. Encoding one as `in entityCountries` PASSES everyone the rule
	# excludes, so this must run before anything publishes.
	python3 ETL/terms/encode_regions.py run
	# Audit BEFORE publishing, and quarantine rules their own recipients
	# contradict, so a wrong rule cannot reach a founder's brief.
	python3 ETL/terms/audit_encoding_vs_reality.py --quarantine
	# Refuse to publish a corpus that got worse. Every serious defect this
	# week was silent -- a thinner corpus still produces a confident brief --
	# so the coverage measurement is made load-bearing here, BEFORE the export
	# and the publish that follow it.
	python3 ETL/terms/coverage_gate.py
	python3 website/build/eligibility_export.py
	python3 ETL/terms/migrate_to_postgres.py
	python3 ETL/terms/embed_eligibility.py run
	python3 ETL/terms/build_instrument_profiles.py classify-titles
	python3 ETL/terms/build_instrument_profiles.py run --rebuild

# News/signals layer (data/signals.sqlite): schema install + stage counts + QA.
# The per-stage transforms (classify_relevance, entity_link_articles,
# classify_signals, embed_articles) run individually — they submit/collect
# Anthropic batches on their own cadence. Extractors are pending the curated
# source registry, so this is a clean no-op until sources exist.
signals:
	python3 ETL/intelligence/load/load_signals.py

# Export the intelligence digest the /for-companies brief reads (topics +
# per-sector passages from signals.sqlite). Run after ingest/hydrate/embed.
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

# The broad ETL pipeline (43 funder/registry extractors, classify, sanity)
# now runs on a weekly Railway cron job against a Railway-resident volume,
# not locally (see the ETL-to-Railway migration plan) -- this pulls that
# volume's current db.sqlite down for local interactive work (eligibility
# research, ad-hoc analysis). Run before any session that needs fresh data;
# --overwrite replaces the local copy each time, mirroring `git pull`.
pull-db:
	python3 ETL/events/extract/pull_db.py

# The other half of the automation split: everything that can't run on
# Railway (cloud-blocked NETWORK sources + MANUAL sources with a file
# dropped in data/manual_inbox/). Pulls fresh, runs what it can locally,
# classifies + sanity-checks, pushes the result back. See
# ETL/events/extract/push_local.py for exactly what runs and what's excluded.
push:
	python3 ETL/events/extract/push_local.py
