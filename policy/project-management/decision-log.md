# Decision Log

Chronological record of scoping and architecture decisions. Newest at the top.
Each entry: what was decided, the options considered, and why.

---

## 2026-07-09 — Re-verify blockers by rendering the actual page, not the note
**Decision:** Before building `de_verbatim.py`, re-checked the Bundestag DIP
API's own help page live (headless-rendered, since it's a JS app) instead of
trusting the existing backlog note that it "needs a registered key." Found an
official public demo API key published directly on the page
(`R2BZaee.DjdCyihKZMf8AOjtScubP2EVydegzjmBIQ`, valid through 2027-05) —
distinct from a since-revoked community-maintained fallback key that WAS
correctly confirmed dead the same session. No registration needed after all.
**Why:** The earlier "needs a key" conclusion was reasonable given what was
checked at the time (a dead fallback key, a JS-shell help page not rendered),
but it was a conclusion about a *specific key*, not proof no usable key
exists. A stale "confirmed blocked" note is exactly as risky as a stale
"confirmed working" one — both should be re-checked live before being acted
on, especially once new tooling (headless rendering, added this session for
`ep_verbatim`) makes the re-check cheap.
**Implementation impact:** `de_verbatim.py` uses the public key directly (no
`.env` config needed) and turned out to be the easiest of the three verbatim
adapters — real semantic XML, no bot wall, plain `httpx`. Also unblocks the
separate, not-yet-built "Bundestag DIP procedure API for `bundestag_hib`"
backlog item, which shares the same key.

## 2026-07-09 — Headless-browser exception for EP plenary verbatim reports (CRE)
**Decision:** Added `etl/adapters/ep_verbatim.py`, ingesting the actual text of
European Parliament plenary debates — named speaker, role/political-group cue,
full speech text, linked OEIL procedure reference — via headless Chromium
(Playwright), the one adapter in the codebase that renders a real browser
instead of a plain `httpx` request.
**Why:** The stated goal was a much better read on live EU tech-policy
conversations: who's actually saying what, not just which files exist. The
EP's own verbatim-report pages (`doceo/document/CRE-*.html`) sit behind an AWS
WAF JS challenge — confirmed live on every content type (HTML/PDF/XML), with
full browser headers, with no Cellar-equivalent machine endpoint (checked and
404s) and no working captions API either. Council of Europe PACE verbatim
records were checked too and are blocked the same way by Cloudflare, with no
open-data fallback (403 on every path tried) — not pursued further since PACE
is also a different jurisdiction than this tracker's EU/FR/DE scope. This
project has consistently accepted this class of block elsewhere (Council of
the EU press, CJEU, EDPS — see source-map.md) rather than fight it. The
difference here: a real headless browser demonstrably solves the EP's
challenge (verified live — 614KB of correct, real page content back where
`curl`/`httpx` get an empty 202), and the resulting content — named MEPs,
rapporteurs, Commissioners, on record, on a specific dossier — was judged
worth the one-time cost of a new heavy dependency.
**Options considered:** (1) Stop at structural stakeholder metadata only (who
attended/voted, no words) — rejected as insufficient once the browser route
proved to work live; (2) roll-call vote data (`howtheyvote.eu`, MIT-licensed,
itself scrapes the EP's RCV XML past this same wall) as a lighter-weight
proxy for "who stands where" — a good complementary future source, not yet
integrated, tracked in backlog.md; (3) headless-browser rendering — chosen.
**Trade-offs accepted:** `playwright` + a ~260MB Chromium binary is now a real
project dependency (`uv run playwright install chromium`, one-time, see
README); each new plenary sitting day costs a several-second browser render
(mitigated by a `processed_days` cursor entry so a day is only ever rendered
once, never per-refresh). Relevance filtering judges title *and* the first
few speakers' actual words, not title alone — a real gap found live (e.g.
"The 28th Regime: a new legal framework for innovative companies" carries no
literal tech keyword despite being a digital-economy debate).
**Findings baked in:** discovery deliberately mirrors `oeil.py`'s hardcoded
current+previous-year window rather than the generic 20-year `backfill_days`
(rendering a decade of sittings on first run would be prohibitive); a
day-processed cursor is necessary and separate from the item-level off-topic
cursor, because `since` (which collapses to "today" after the first run)
would otherwise silently stop discovering every past day forever — caught by
running the adapter live twice, not just by unit tests.

## 2026-06-26 — Strictly four top-level folders; web = FastAPI + Next.js
**Decision:** The repo keeps exactly four architecture folders — **ETL, Data,
Website, Project-management** — and every module maps into them. The Python
backend (ingestion, enrichment, embeddings, the RAG **intelligence** layer, and
the **API**) all live under `etl/` (`etl/intelligence/`, `etl/api.py`). `website/`
is the Next.js front-end only; it talks to the API over HTTP (CORS-enabled),
holding no business logic. Earlier top-level `intelligence/` and `api/` folders
were folded back in to honor this.
**Why:** The user fixed the four-folder structure ("all ops linked to these").
Decoupling the Next.js client from the Python backend via HTTP (not imports)
keeps the split clean and lets either side be deployed/replaced independently.
**Implementation:** `ept serve` runs the API (`uvicorn etl.api:app`); the site
is `cd website && npm run dev`. Verified end-to-end: site serves 200, API feeds
real corpus data, briefing dry-run returns ranked sources.

## 2026-06-26 — Intelligence layer uses Claude's native Citations feature
**Decision:** The company-facing briefing is generated by Claude (`claude-opus-4-8`,
adaptive thinking) with each retrieved passage passed as a **Citations-enabled
`document` block**. Claude returns text whose cited spans carry a `citations`
array (`cited_text` + `document_index`); we map the index back to the passage's
provenance (CELEX, URL, char offsets). Lives in a new `intelligence/` package
(the layer the methodology places between data and website).
**Why:** This enforces grounding structurally — the model returns the exact
source span for each claim, rather than us trusting a "please cite" instruction.
Directly delivers the "very realistic, no hallucinated obligations" requirement.
**Findings baked in:** built key-free — retrieval, request assembly, and citation
parsing are pure/testable; `ept brief --dry-run` runs with no API key; the live
run needs only `ANTHROPIC_API_KEY`. Verified retrieval end-to-end (a fintech/AI
profile surfaces the AI Act/liability/ethics instruments).

## 2026-06-26 — Local-first by default: storage and embeddings
**Decision:** Default to fully local, zero-infra operation. (1) `DATABASE_URL=local`
runs a **persistent** embedded Postgres+pgvector under `.localdb/` (no Docker,
no accounts; survives restarts — verified across separate processes). (2) The
default embedder is a **local** model (BGE `bge-small-en-v1.5` via fastembed,
384-dim, no API key, runs offline). Both are pluggable: set `DATABASE_URL` to
Neon for a shared corpus; set `embedding_model`/`embedding_dim` for a hosted
embedder (Voyage/OpenAI).
**Why:** The user wanted to "just store locally for now" and keep the system
self-driving. Local-first removes all setup friction while preserving the exact
same schema/capability — including citations — as the hosted path.
**Findings baked in:** embedding dimension is config-driven (column rebuilt on
change); HNSW cosine index added; `ept embed` + `ept search` verified on the
live corpus (semantic discrimination confirmed). Citation capability is a
property of the schema (full text + passage char-offsets + version + URL), so
it is identical whether storage is local or hosted.

## 2026-06-26 — EUR-Lex content via Cellar, not the eur-lex.europa.eu site
**Decision:** Fetch document content from the Publications Office **Cellar**
endpoint (`publications.europa.eu/resource/celex/{CELEX}`) using content
negotiation with `Accept-Language: eng` and a prioritized Accept list
(`text/html`, then `application/xhtml+xml`), taking the first that exists.
**Why:** Verified against live endpoints during the foundation build — the
human-facing `eur-lex.europa.eu/legal-content` host sits behind an **AWS WAF**
that bot-challenges programmatic clients (first requests succeed, then a JS/
CAPTCHA challenge page is returned instead of the document). Cellar is the
official machine-access path and does not challenge.
**Findings baked in:** (1) discovery via the SPARQL host works and is filtered
to CELEX sectors 3 (legislation) + 5 (preparatory acts/proposals), dropping
case-law/treaty title-matches; (2) manifestation availability varies by doc
type, hence the Accept fallback; (3) PDF-only acts have no HTML manifestation
and are skipped pending a PDF-text fallback (backlog); (4) HTTP retry now fires
only on transient errors (network/429/5xx), never on 404.

## 2026-06-26 — Fully automated, single-trigger data collection
**Decision:** All corpus data is collected programmatically. A refresh is one
trigger — `ept refresh` — that runs every registered source adapter end-to-end
(discover → fetch → parse → version → chunk). No manual data entry, ever. The
same orchestrator will later be exposed as an API endpoint and a scheduled job.
**Why:** The product promise is current, trustworthy policy intelligence; that
requires the corpus to refresh on demand and on a schedule without human steps.
**Implementation:** `etl/adapters/__init__.py` registry + `etl/pipeline.py`
orchestrator + `ept refresh` CLI. Adding a source = one subclass + one registry
line; the trigger picks it up automatically.

## 2026-06-26 — Repository structure mirrors the architecture
**Decision:** Top-level folders map to architecture layers:
`data/` (schema + config + session), `etl/` (adapters + pipeline + enrichment),
`website/` (Next.js, later), `project-management/` (this folder).
**Options:** conventional `backend/` + `frontend/` split (rejected — hides the
pipeline/data/web separation that defines the system).
**Why:** Makes the ETL → Data → Website flow legible from the directory tree.

## 2026-06-26 — Intelligence layer = RAG with mandatory citations
**Decision:** The company-facing answers are generated via retrieval-augmented
generation where every claim links back to a specific passage of a specific
document version.
**Why:** The product must be "very realistic" — no hallucinated obligations.
**Implementation impact (now):** schema chunks text into `passages` with char
offsets + embeddings, and `enrichments.citations` records backing passage ids,
even though the RAG/UI layer is a later milestone.

## 2026-06-26 — Stack: Python ETL + Next.js web, Postgres + pgvector
**Decision:** Python (ETL/enrichment/LLM orchestration), Next.js + React (web),
Postgres + pgvector (storage + vector search). Toolchain: `uv` + Python 3.12.
**Why:** Strongest data/LLM ecosystem in Python; React for composable UI; one DB
for relational + vector avoids a separate vector store.
**Env note:** No Docker/Homebrew/Postgres on the dev machine, so all DB access is
via `DATABASE_URL` — runs identically on managed Postgres (Neon recommended) or
local Docker.

## 2026-06-26 — Coverage: EU first, then FR + DE
**Decision:** MVP covers the EU level; France (Légifrance) and Germany
(Bundesgesetzblatt/BMWK) follow once the EU pipeline is proven.
**Why:** Cleanest structured data (CELEX/ELI, English-first), broadest reach.

## 2026-06-26 — EU source set: full circle
**Decision:** Ingest EUR-Lex (legal acts), OEIL (procedure/lifecycle), Have Your
Say (consultations/forward signal), and Commission press (context). EUR-Lex is
the reference adapter; the other three are scaffolded skeletons.
**Why:** Together they cover the full lifecycle: what's coming → in procedure →
adopted → in force, plus the narrative of what changed and why.

## 2026-06-26 — First milestone: ETL + DB foundation
**Decision:** Build robust ingestion + the canonical schema first; LLM/company
UI comes after the corpus exists.
**Why:** The moat is enrichment quality + freshness + grounded citations, which
all depend on a well-modelled corpus.
