# ETL service image (broad companies/events pipeline — 24 AUTO-tier extractors
# + classify + sanity_check). Runs on a Railway Cron Job against a persistent
# volume mounted at /app/data (etl_env.py's DATA = ROOT / "data" resolves to
# this path since ROOT is the repo root = WORKDIR here).
#
# Scope: NOT the eligibility subsystem (that's Postgres, already live) and NOT
# the 9 NETWORK-tier extractors (excluded — see project-mgmt plan, cloud-IP
# block risk) or 8 MANUAL-tier extractors (need a human-fetched file).
FROM python:3.11-slim

WORKDIR /app

# certifi: same root-cert insurance ndb_ssl.py already applies for macOS: a
# fresh Linux image needs its own CA bundle for the extractors' HTTPS calls.
RUN pip install --no-cache-dir certifi

# curl: 10 extractors shell out to it directly (SSL-workaround pattern from
# ndb_ssl.py) rather than using requests/urllib -- python:3.11-slim doesn't
# ship it by default.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# No image-level CMD: the Railway Cron Job specifies the actual command
# (renew.py --auto && classify.py && sanity_check.py) so this image is just
# the runtime the cron job executes against.
