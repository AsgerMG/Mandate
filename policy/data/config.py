"""Application-wide configuration, loaded from environment / .env.

Lives in the data layer because the database URL and embedding dimension are
the most load-bearing settings; the ETL layer imports this same object.
"""

from __future__ import annotations

from functools import lru_cache

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from mandate.embedding import DIM

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
    # Not configurable here any more. The model and dimension are
    # mandate/embedding's (MODEL, DIM): one definition for every brain, so the
    # passages column, the vectors in it and the queries against it cannot
    # disagree. EMBEDDING_MODEL / EMBEDDING_DIM in an environment are ignored.

    # --- Reranking ----------------------------------------------------------
    # A cross-encoder second pass over the passages a bi-encoder embedding
    # search returned. Unlike the embedder this is NOT a stored-data decision
    # — nothing is persisted, so it can be switched on and off freely without
    # re-embedding anything. Voyage-hosted (reuses VOYAGE_API_KEY); empty
    # disables reranking and falls back to pure embedding order, which is also
    # what happens automatically when no key is set, so local/offline runs
    # need no configuration.
    rerank_model: str = "rerank-2.5"

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

    # The model that JUDGES briefs (brief-check/brief-compare/brief-improve), as
    # opposed to the one that writes them. Deliberately separate from llm_model:
    # the judge is the measuring instrument, so it must not move when the subject
    # does. Pointing llm_model at a cheaper model to test it would otherwise also
    # swap the judge, making the resulting scores incomparable with every score
    # recorded before — and a cheaper judge is a worse instrument regardless.
    eval_model: str = "claude-sonnet-5"

    # --- API / CORS -----------------------------------------------------------
    # Comma-separated origins the browser is allowed to call the API from.
    # localhost is always included (dev never breaks); add the deployed
    # front-end's real origin(s) here in production — e.g.
    # "https://regina-ai.eu,https://www.regina-ai.eu" — apex and www are separate
    # origins to a browser, so list both if both resolve.
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

    # --- Brief self-improvement (optional, off by default) ------------------
    # Gates the ONE hook this feature adds to the live /api/brief path: a
    # best-effort log of which retrieved passages actually got cited, used to
    # answer "is the vector DB content we're paying to embed actually being
    # used". Everything else (the eval panel, judge, candidate search loop)
    # lives in etl/brief_eval/ and is only imported when `regina
    # brief-improve` is run directly — this flag does not gate that; it only
    # gates whether real /api/brief traffic gets logged.
    brief_eval_enabled: bool = False
    # RetrievalEvent rows carry real user-submitted company descriptions
    # (the retrieval query text) — self-pruned on every write rather than
    # kept indefinitely, so no separate cleanup job is needed.
    brief_eval_retention_days: int = 14


@lru_cache
def get_settings() -> Settings:
    return Settings()


# The passages column dimension: mandate.embedding's, never a local choice.
EMBEDDING_DIM = DIM
