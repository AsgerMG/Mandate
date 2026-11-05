# capital-etl: the weekly ETL cron (railway.json; service root capital/).
#
# Runs ETL/events/extract/railway_cron.py against schema `capital` of the
# Mandate Postgres, as capital_app (DATABASE_URL=${{pgvector.CAPITAL_DATABASE_URL}}
# on the service). There is NO volume and no SQLite file: since 2026-11-05 the
# corpus lives only in Postgres, and this container's filesystem is scratch --
# the extractors' download caches under data/raw/ start empty on every run.
#
# Scope: the AUTO-tier extractors (ETL/events/extract/manifest.py), classify,
# the sanity check, the open-call and ADEME window refreshes, the corpus-side
# guards and the census. Not the NETWORK tier (cloud-IP block risk) or the
# MANUAL tier (needs a human-fetched file).
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

# Python output unbuffered, so a step's progress reaches Railway's log as it
# happens rather than when the step exits.
ENV PYTHONUNBUFFERED=1

# The command is railway.json's startCommand, which Railway's cron runs.
CMD ["python3", "ETL/events/extract/railway_cron.py"]
