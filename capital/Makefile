# EuroInvTracker — common entry points.
# Run `make help` for the list. The data pipeline flows:
#   ETL/extract/* -> data/db.sqlite -> ETL/transform/* -> ETL/load/* (+ QA + backup)
#                 -> make data -> website/frontend/public/data -> website/frontend
#
# The ETL block (extract -> transform -> load) lives under ETL/. Extractors are
# per-source and hit external APIs; run them individually (see ETL/README.md).
# The website block (build -> frontend) lives under website/ (see website/README.md).
# This Makefile covers the regular transform/analysis/backup loop.

DATE    := $(shell date +%Y%m%d)
BACKUP  := $(HOME)/EuroInvTracker-backups
ICLOUD  := $(HOME)/Library/Mobile Documents/com~apple~CloudDocs/EuroInvTracker-backups

.PHONY: help analyze visuals data site-dev site-build backup classify sanity transform sources renew

help:
	@echo "EuroInvTracker make targets:"
	@echo "  make sources     List every source + how to renew it (ETL/extract/renew.py --list)"
	@echo "  make renew       Pull fresh data for every AUTO source (then run 'make transform backup')"
	@echo "  make classify    Re-derive sector/entity classification (ETL/transform/classify.py)"
	@echo "  make sanity      Post-load corpus integrity checks (ETL/load/qa/sanity_check.py)"
	@echo "  make transform   classify + sanity (re-derive everything from loaded rows)"
	@echo "  make backup      Back up db.sqlite + data/ to local + iCloud (ETL/load/backup.py)"
	@echo "  make analyze     Rebuild corpus KPIs (website/build/synthesis.py)"
	@echo "  make visuals     Rebuild home-page visuals (taxonomy, map, coverage)"
	@echo "  make data        Rebuild EVERY site JSON from db.sqlite (website/build/build_site_data.py)"
	@echo "  make site-build  Static build of the Next.js site (website/frontend/out/)"
	@echo "  make site-dev    Run the site dev server at localhost:3000"

sources:
	python3 ETL/extract/renew.py --list

renew:
	python3 ETL/extract/renew.py --auto

classify:
	python3 ETL/transform/classify.py

sanity:
	python3 ETL/load/qa/sanity_check.py

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

site-build:
	cd website/frontend && npm run build

site-dev:
	cd website/frontend && npm run dev

backup:
	python3 ETL/load/backup.py
