# EuroInvTracker — common entry points.
# Run `make help` for the list. The data pipeline flows:
#   ETL/extract/* -> db.sqlite -> ETL/transform/* -> ETL/load/* (+ QA + backup)
#                 -> make analyze+visuals -> site/public/data -> site
#
# The ETL block (extract -> transform -> load) lives under ETL/. Extractors are
# per-source and hit external APIs; run them individually (see ETL/README.md).
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
	@echo "  make analyze     Rebuild site JSON from db.sqlite (analysis/run.py)"
	@echo "  make visuals     Rebuild home-page visuals (taxonomy, valley, ladder, map)"
	@echo "  make data        analyze + visuals (refresh everything the site reads)"
	@echo "  make site-build  Static build of the Next.js site (site/out/)"
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
	python3 analysis/run.py

views:
	sqlite3 db.sqlite < analysis/views.sql

visuals:
	python3 scripts/build_home_visuals.py
	python3 scripts/gen_country_map.py
	python3 scripts/gen_coverage_indicator.py

data: views analyze visuals

site-build:
	cd site && npm run build

site-dev:
	cd site && npm run dev

backup:
	python3 ETL/load/backup.py
