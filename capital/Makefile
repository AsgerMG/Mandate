# EuroInvTracker — common entry points.
# Run `make help` for the list. The data pipeline flows:
#   data/raw -> scripts/extract_* -> db.sqlite -> make analyze+visuals -> site/public/data -> site
#
# Note: extractors are per-source and hit external APIs; run them individually
# (see README). This Makefile covers the regular build/analysis/backup loop.

DATE    := $(shell date +%Y%m%d)
BACKUP  := $(HOME)/EuroInvTracker-backups
ICLOUD  := $(HOME)/Library/Mobile Documents/com~apple~CloudDocs/EuroInvTracker-backups

.PHONY: help analyze visuals data site-dev site-build backup

help:
	@echo "EuroInvTracker make targets:"
	@echo "  make analyze     Rebuild site JSON from db.sqlite (analysis/run.py)"
	@echo "  make visuals     Rebuild home-page visuals (taxonomy, valley, ladder, map)"
	@echo "  make data        analyze + visuals (refresh everything the site reads)"
	@echo "  make site-build  Static build of the Next.js site (site/out/)"
	@echo "  make site-dev    Run the site dev server at localhost:3000"
	@echo "  make backup      Back up db.sqlite + data/ to $(BACKUP) and iCloud"

analyze:
	python3 analysis/run.py

visuals:
	python3 scripts/build_home_visuals.py
	python3 scripts/gen_country_map.py

data: analyze visuals

site-build:
	cd site && npm run build

site-dev:
	cd site && npm run dev

backup:
	mkdir -p "$(BACKUP)" "$(ICLOUD)"
	gzip -c db.sqlite > "$(BACKUP)/db.sqlite.$(DATE).gz"
	tar czf "$(BACKUP)/data-raw.$(DATE).tar.gz" data/raw
	tar czf "$(BACKUP)/data-processed.$(DATE).tar.gz" data/processed
	cp "$(BACKUP)/db.sqlite.$(DATE).gz" "$(BACKUP)/data-raw.$(DATE).tar.gz" "$(BACKUP)/data-processed.$(DATE).tar.gz" "$(ICLOUD)/"
	@echo "Backed up to $(BACKUP) and iCloud."
