# Explicit Dockerfile — Railway's Nixpacks auto-detection for this uv-managed
# project was failing its own auto-generated install step (`pip install
# uv==$NIXPACKS_UV_VERSION` with an empty version substitution, a Nixpacks
# bug/limitation hit live 2026-07-10, not anything in this repo). This
# bypasses that entirely with a standard, well-known uv+Docker pattern.
#
# Playwright's Chromium binary is deliberately NOT installed here — the only
# adapter that needs a real browser (ep_verbatim) is run locally by design
# (see decision-log.md), never by this deployed API service.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Install deps in their own layer first so they cache across code-only pushes.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8080

# Shell form (not exec-form CMD) so $PORT is substituted at container start —
# Railway assigns this dynamically, it isn't always 8080.
CMD uv run ept serve --host 0.0.0.0 --port ${PORT:-8080}
