# mandate-api (mandate/api): grounding, profiles, the workspace record and the
# actors register over HTTP, for the advisor's agents.
#
# BUILT FROM THE MONOREPO ROOT (Railway: root directory `/`, config file
# /mandate/railway.json), like every service here: see /.dockerignore.
#
# Environment (set on the Railway service, never in git):
#   DATABASE_URL=${{pgvector.MANDATE_DATABASE_URL}}   the mandate_app role
#   MANDATE_SERVICE_TOKEN                             shared with the site (web)
#   BUCKET_ENDPOINT / BUCKET_ACCESS_KEY_ID / BUCKET_SECRET_ACCESS_KEY / BUCKET_NAME
# GROUNDING_REFERENCE_URL is for rehearsals only and is never set here.
FROM python:3.12-slim

WORKDIR /app

COPY mandate/pyproject.toml /app/mandate/pyproject.toml
RUN pip install --no-cache-dir "psycopg[binary]>=3.2" "httpx>=0.27" \
      "fastapi>=0.115" "uvicorn[standard]>=0.30" "pypdf>=5.0"

COPY mandate/ /app/mandate/
# tests and rehearsal tooling are not the service
RUN rm -rf /app/mandate/tests /app/mandate/eval/runs

ENV PYTHONPATH=/app PYTHONUNBUFFERED=1
EXPOSE 8080

# Shell form so Railway's $PORT is substituted at start.
CMD uvicorn mandate.api.app:app --host 0.0.0.0 --port ${PORT:-8080}
