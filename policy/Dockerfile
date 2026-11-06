# The policy API. BUILT FROM THE MONOREPO ROOT (Railway: root directory `/`,
# config file /policy/railway.json), because the project depends on mandate/
# (the shared grounding store and embedding module) by path, and a build can
# only COPY what is inside its context. See /.dockerignore.
#
# Explicit Dockerfile -- Railway's Nixpacks auto-detection for this uv-managed
# project was failing its own auto-generated install step (`pip install
# uv==$NIXPACKS_UV_VERSION` with an empty version substitution, a Nixpacks
# bug/limitation hit live 2026-07-10, not anything in this repo).
#
# Playwright's Chromium binary is deliberately NOT installed here -- the only
# adapter that needs a real browser (ep_verbatim) is run locally by design
# (see decision-log.md), never by this deployed API service.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# /app mirrors the monorepo: /app/policy is the project, /app/mandate the path
# dependency its pyproject names as ../mandate.
WORKDIR /app/policy

# Deps in their own layer first so they cache across code-only pushes. mandate/
# comes first because uv installs the path dependency in this step.
COPY mandate/ /app/mandate/
COPY policy/pyproject.toml policy/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY policy/ ./
RUN uv sync --frozen --no-dev

ENV PATH="/app/policy/.venv/bin:$PATH"
EXPOSE 8080

# Shell form (not exec-form CMD) so $PORT is substituted at container start --
# Railway assigns this dynamically, it isn't always 8080.
CMD uv run regina serve --host 0.0.0.0 --port ${PORT:-8080}
