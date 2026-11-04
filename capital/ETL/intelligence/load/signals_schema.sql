-- data/signals.sqlite — the news/signals layer (2026-07-08 scoping).
--
-- Qualitative, forward-looking corpus: press articles entity-linked back to
-- the companies/investors in db.sqlite, tagged with public-awards-intelligence
-- signals, and chunk-embedded for local vector retrieval (sqlite-vec).
-- Lives in its own file so its rebuild cadence never touches the events DB.
-- Applied idempotently by ETL/load/load_signals.py.
--
-- Embeddings live in a PLAIN table (chunk_embeddings, created by
-- embed_articles.py): macOS framework Python cannot load SQLite extensions,
-- and at this corpus scale (tens of thousands of chunks) a numpy brute-force
-- cosine scan beats the operational cost of an ANN index anyway. pgvector/HNSW
-- is the documented upgrade path if the corpus ever reaches millions.

CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,        -- registry key (news_sources.py SOURCES dict)
    name TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('funder_press', 'trade_press', 'general_news')),
    country TEXT,                    -- ISO 2-letter; NULL for pan-EU sources
    language TEXT NOT NULL,          -- ISO 639-1: en, de, fr, ...
    kind TEXT,                       -- rss | html | gnews
    feed_url TEXT,                   -- feed URL, listing URL, or gnews query
    topics TEXT,                     -- comma-joined topic tags from the registry
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES sources(id),
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    published_at DATE,
    fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    language TEXT,
    raw_text TEXT NOT NULL,          -- stub (title+summary) until hydrated
    -- Hydration: ingest stores a cheap stub; the relevance gate judges the
    -- stub; full article text is fetched ONLY for relevant articles (hydrate
    -- step in news_ingest.py). Downstream stages require full_text_fetched=1.
    full_text_fetched INTEGER NOT NULL DEFAULT 0,
    resolved_url TEXT,               -- publisher URL when `url` is a gnews redirect
    is_relevant INTEGER,             -- NULL = not yet classified; 0/1 post-gate
    relevance_reason TEXT,           -- short model rationale, for auditing the gate
    -- Stage markers: an article can legitimately yield zero entities or zero
    -- signals, so "processed" must be tracked explicitly, not inferred from
    -- row existence in the child tables.
    entities_extracted_at TIMESTAMP,
    signals_extracted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_id);
CREATE INDEX IF NOT EXISTS idx_articles_relevant ON articles(is_relevant) WHERE is_relevant = 1;
CREATE INDEX IF NOT EXISTS idx_articles_pending ON articles(is_relevant) WHERE is_relevant IS NULL;

CREATE TABLE IF NOT EXISTS article_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL REFERENCES articles(id),
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    -- Exact character offsets into articles.raw_text — what lets a generated
    -- claim cite a precise span, not just "the article".
    char_start INTEGER,
    char_end INTEGER,
    UNIQUE (article_id, chunk_index)
);

-- One row: which embedding model built chunk_embeddings, at what dimension.
-- Changing the model means DROP TABLE chunk_embeddings + re-embed — vectors
-- from different models are not comparable.
CREATE TABLE IF NOT EXISTS embedding_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    model TEXT NOT NULL,
    dim INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_article ON article_chunks(article_id);

-- Entity links back into db.sqlite. company_id references companies(id) in the
-- OTHER database file — SQLite cannot enforce a cross-file FK, so the loader's
-- QA step validates it via ATTACH instead.
CREATE TABLE IF NOT EXISTS article_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL REFERENCES articles(id),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('company', 'investor', 'person', 'program')),
    mention_text TEXT NOT NULL,      -- raw text as it appeared in the article
    company_id INTEGER,              -- resolved id in db.sqlite companies; NULL if unmatched
    match_method TEXT,               -- exact/prefix/reverse_prefix/fuzzy/none (lib/matching.py)
    match_confidence REAL
);
CREATE INDEX IF NOT EXISTS idx_entities_article ON article_entities(article_id);
CREATE INDEX IF NOT EXISTS idx_entities_company ON article_entities(company_id) WHERE company_id IS NOT NULL;

-- The "what to anticipate / who to reach out to" payload. Category names are
-- deliberately public-awards-intelligence framing, NOT competitor-tracking —
-- see the site-wide register rule (memory: site-design-guidelines).
CREATE TABLE IF NOT EXISTS article_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL REFERENCES articles(id),
    signal_type TEXT NOT NULL CHECK (signal_type IN (
        'funding_award', 'funding_pipeline_signal', 'programme_policy_change',
        'stakeholder_appointment', 'partnership_collaboration', 'regulatory_development'
    )),
    confidence REAL NOT NULL,
    summary TEXT NOT NULL,           -- one line, declarative, no urgency framing
    anticipated_impact TEXT          -- same register; NULL when nothing actionable
);
CREATE INDEX IF NOT EXISTS idx_signals_article ON article_signals(article_id);
CREATE INDEX IF NOT EXISTS idx_signals_type ON article_signals(signal_type);
