"""Application-wide configuration, loaded from environment / .env.

Lives in the data layer because the database URL and embedding dimension are
the most load-bearing settings; the ETL layer imports this same object.
"""

from __future__ import annotations

from functools import lru_cache

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# pydantic-settings only parses .env for the fields declared below — it never
# touches the real process environment. ANTHROPIC_API_KEY (read directly via
# os.environ by etl/intelligence/llm.py and the Anthropic SDK itself) needs to
# actually be in os.environ, so load .env there too, once, on import.
load_dotenv()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Database -----------------------------------------------------------
    # Works against any Postgres with the `vector` extension available:
    # Neon (recommended, pgvector built in), Supabase, Docker, or local.
    database_url: str = Field(
        default="local",
        description=(
            "SQLAlchemy URL for the Postgres+pgvector database. The special "
            "value 'local' (default) runs a persistent embedded Postgres under "
            ".localdb/ — zero setup. Set a real URL (e.g. Neon) for a shared corpus."
        ),
    )

    # --- Embeddings ---------------------------------------------------------
    # The passages.embedding column is fixed at this dimension, so changing it
    # requires re-creating the column + re-embedding. Default is a small, free,
    # local model (BGE via fastembed, 384-dim) — no API key, runs offline.
    # Swap to a hosted model (e.g. voyage-3-large, 1024) by setting both fields.
    embedding_dim: int = 384
    embedding_model: str = "BAAI/bge-small-en-v1.5"

    # --- LLM (briefing generation) ------------------------------------------
    # ANTHROPIC_API_KEY is read from the environment by the Anthropic SDK.
    # Sonnet 5 over Opus: faster and sufficient for this task, which matters
    # more now that the brief runs two passes (draft + self-critique/revise).
    llm_model: str = "claude-sonnet-5"
    # Extended thinking (adaptive) consumes part of this budget before the
    # final answer, and the brief's operational detail (dated watchlist,
    # named coalitions, per-instrument table) genuinely runs long — 8000
    # was observed truncating mid-sentence on a real report.
    llm_max_tokens: int = 16000

    # --- API / CORS -----------------------------------------------------------
    # Comma-separated origins the browser is allowed to call the API from.
    # localhost is always included (dev never breaks); add the deployed
    # front-end's real origin(s) here in production — e.g.
    # "https://regina-intel.vercel.app".
    cors_allow_origins: str = ""

    # Guards POST /api/refresh once the API is reachable from the public
    # internet — unset (the local-dev default) means no auth, matching prior
    # behavior; set it before deploying so a random visitor can't trigger a
    # full corpus refresh. Caller sends it back as the X-Refresh-Secret header.
    refresh_secret: str = ""

    # Per-IP hourly caps on the two endpoints that make real, billed Claude
    # API calls (/api/brief runs several calls with draft+revise+retries;
    # /api/questions is one lighter call). Generous enough for a real user
    # working through the wizard a few times, tight enough to bound cost
    # from a public deployment being hit by a script.
    brief_rate_limit_per_hour: int = 10
    questions_rate_limit_per_hour: int = 20

    # --- HTTP / ingestion (used by the ETL layer) ---------------------------
    http_user_agent: str = "Regina/0.1 (+regulatory-intelligence; contact: ops@example.com)"
    http_timeout_seconds: float = 30.0
    request_delay_seconds: float = 1.0  # politeness delay between source requests

    # How far back the "active/recent" backfill reaches, in days. This is a
    # ceiling, not a target: RSS/Atom feeds are naturally capped by their own
    # retention (usually the last 10-50 items) regardless of this value, so
    # raising it costs nothing for them. It matters for the bulk open-data
    # adapters (an_dossiers, senat_dossiers, adlc_decisions), which download
    # their whole dataset every run anyway (no incremental fetch) — for those,
    # a tighter window only throws away free historical signal, so this is set
    # generously (~20 years) and the tech-relevance filter does the real work
    # of deciding what's worth keeping.
    backfill_days: int = 7300

    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Convenience constant for SQLAlchemy column definitions (evaluated at import).
EMBEDDING_DIM = get_settings().embedding_dim
