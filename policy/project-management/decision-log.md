# Decision Log

Chronological record of scoping and architecture decisions. Newest at the top.
Each entry: what was decided, the options considered, and why.

---

## 2026-07-20 — Brief self-improvement tool (`regina brief-improve`)
**Decision:** Built an on-demand CLI tool (`etl/brief_eval/`) that tests
candidate edits to `briefing.py`'s `SYSTEM_PROMPT` against a fixed 5-profile
company panel, scores them (batched LLM judge + the existing deterministic
canon check), and reports what helped — never applies anything automatically.
Deliberately **not scheduled**: no Railway cron, no API endpoint, run
manually whenever wanted. A hard `$` budget guard (`BudgetGuard`/
`MeteredClient`) stops the run before exceeding its cap, and every run
persists the full generated brief text (not just scores) to a JSON sidecar
so nothing from a billed run is ever unverifiable after the fact.
**Options considered:** a scheduled weekly Railway cron + HTTP endpoint
exposing a prompt-override parameter (rejected — a network-reachable
"override the system prompt" surface is a materially worse attack surface
than a no-argument trigger like `/api/refresh`; the in-process
monkeypatch-and-restore approach used instead needs no such endpoint at
all). A broad diagnostic-sweep mode was also discussed as a complementary future
mode — generate a much larger, diverse batch of briefs under the real
production prompt, batch-judge them, then run one meta-analysis pass over
just the critiques to surface systematic patterns rather than one-off
findings — but not built today; the narrow hill-climbing loop shipped
instead.
**Why:** Real cost surprised us by ~10x on the first raw run ($6.01 for a
partial baseline) — root causes found and fixed: no system-prompt caching
across panel profiles within a round, and (once `sharpen=False` was adopted
for cheap exploration) a wasted 1.25x cache-write premium on retrieved
passages with zero matching reads. A separate real bug was found in the
judge's own canon-issue penalty (`min(2.0, 0.5 * count)`, saturating
instantly against real single-pass counts of 7-32) — masking whether any
candidate fix actually helped; rescaled to `0.05 * count`.
**Real finding from the tool**: four independent critique rounds, across
two full runs, converged on the same defect — see the entry below.
**Total spend across all test runs today: ~$29.75.**

## 2026-07-20 — Fixed verdict/hinge-consistency bug + press retrieval gap
**Decision:** Two related fixes to `briefing.py`, found via the tool above:
1. **Verdict consistency** — a brief's Compliance table could commit a
   definitive verdict (observed: AI Act high-risk/Annex III) while other
   prose elsewhere in the same brief still treated that classification as
   open/unresolved. New `SYSTEM_PROMPT` paragraph + new `REVISE_INSTRUCTION`
   checklist item (9) VERDICT CONSISTENCY CHECK, with explicit remedy
   ordering (fix the prose by default; only downgrade to Monitor if the
   hinge genuinely was never established) to avoid a Monitor-as-hedge
   escape valve. New regression tests lock in that ordering.
2. **Press/political-narrative retrieval** — the corpus holds 701+
   press/news documents, properly ingested and embedded, but retrieval
   never surfaced a single one (0 of 40 slots across the test panel),
   regardless of recency. Root cause: `semantic_search`/`canon_passages`
   are deliberately relevance-ranked and recency-agnostic (correct for
   legal text — GDPR from 2016 is as valid as anything new), but press
   coverage needs the opposite: relevance *and* recency. Added a third
   retrieval pass, `press_passages()`, filtered by a curated `Source.key`
   allowlist (not `document_type` — confirmed unreliable: `heise_news`/
   `golem_news` are typed `OTHER`, not `PRESS`) and a 90-day recency
   window, merged into the same passage set via the existing
   `_merge_passages()`/`_cap_per_document()` (both worked unchanged).
   Includes parliamentary floor-debate transcripts (`ep_verbatim`/
   `an_verbatim`/`de_verbatim`) in the same allowlist — same recency
   concern, same "Political landscape" destination per the existing
   `SYSTEM_PROMPT` paragraph.
**Options considered:** a deterministic code-level check for the
verdict-consistency bug, mirroring `_canon_issues()` (rejected — unlike
instrument-name matching, a clean bounded string/number comparison,
"does this prose contradict that table verdict" is an inherently semantic
judgment with real false-positive risk from a keyword/regex approach, since
the prompt already trains the model to use words like "unresolved" near
instruments with genuinely-open Monitor hinges elsewhere in the same brief).
**Why:** No prompt changes were needed for the press-retrieval fix —
`SYSTEM_PROMPT` already told the model exactly how to treat Press sources
("evidence of enforcement reality... never a substitute for the binding
text"); the system was designed correctly, it just never retrieved the
content that existed.
**Related, not fixed today:** `etl/brief_eval/recency.py`'s own coverage
metric was checking `Document.created_at` (DB row-insertion time) instead
of `Document.date_document` (real-world publication date) — a one-time
bulk reingest event (2026-07-13, ~1,300 docs in a single day) had polluted
it, counting decades-old acts like GDPR as "recent." Fixed alongside this
work since it's the same underlying investigation.
**Also fixed same day, same method:** audited every `KEY_ACTS` canon act's
short name against `TECH_KEYWORDS` (the vocabulary that filters broad
institutional feeds) and added keywords for genuinely tech-policy-scoped
gaps (Machinery Regulation, Data Governance Act, MiCA, critical
infrastructure/entities, accessibility, health data space, and others) —
see the dated comment in `etl/adapters/feeds.py` for the full list and the
ones deliberately left uncovered (DORA's bare acronym — collision risk;
Copyright DSM Directive — bare "copyright" too generic; several
consumer/sustainability acts that are canon for tech-adjacent hinges but
aren't tech-policy news topics).

## 2026-07-20 — Weekly self-improving data loop + review workflow
**Decision:** Two-part weekly loop: (1) a Railway cron service (`refresh-cron`)
hits production `POST /api/refresh` every Sunday 05:00 UTC — no code involved,
just the existing trigger on a schedule; (2) a Claude cloud routine ("Regina
weekly data audit", Sunday 06:30 UTC) audits refresh health, lists what got
newly embedded that week, and web-researches EU/DE/FR regulatory developments
against the current corpus to flag coverage gaps. The routine is **report
only**: no repo access, no commits, no autonomous changes to KEY_ACTS or
adapters — findings get pasted into `weekly-audit-pending.md` for review in
the next working session, and whatever we decide to act on gets its own dated
entry here, after which the pending file is cleared.
**Options considered:** auto-commit verified additions (rejected — a research
agent auto-writing legal-citation data unreviewed is exactly the failure mode
report-only exists to prevent); PR-per-week (rejected as unnecessary process
for something this low-volume); Slack/email/Asana delivery (rejected — the
user wants the artifact to live in the repo, reviewed together, not scattered
across another tool).
**Why:** Data-quality risk (a wrong CELEX number or mislabeled act flowing into
citation-backed briefs) is the real risk here, not cost or infrastructure —
so a human stays in the loop for anything that touches what the corpus
contains, while the mechanical parts (refresh, research, drafting the report)
are fully automated.
**Caveat:** the routine has no GitHub App connection yet (private repo), so it
audits from the public API plus a hardcoded coverage snapshot rather than
live-reading `eurlex_key_acts.py` — connect the GitHub App to upgrade this.
It also can't reliably push a notification from a detached cloud sandbox, so
in practice the trigger for review is the next conversation, not a ping.

## 2026-07-17 — Rebrand: EuroPolTracker → Regina
**Decision:** Full end-to-end rename of the product to **Regina** (a backronym
for **REG**ulatory **IN**telligence **A**nalyst): display name, site title and
copy, PDF wordmark, FastAPI title, Python package (`europoltracker` →
`regina`), CLI console script (`ept` → `regina`), HTTP user agent, local
docker-compose Postgres names, docs, plus the external GitHub repo, Railway
service, and Vercel project (with their generated domains).
**Why:** "EuroPolTracker" reads as security/law-enforcement (Europol) — wrong
associations for a regulatory-intelligence product. "Regina" matches the
"analyst desk, run as software" positioning and the terminology shift to
"regulatory intelligence" already made across the site.
**Implementation notes:** the infra cutover is order-sensitive — the Railway
generated domain is baked into Vercel's `NEXT_PUBLIC_API_URL` at build time,
and the Vercel URL sits in Railway's `CORS_ALLOW_ORIGINS` (see DEPLOYMENT.md
history for the incident this coupling caused). Old identifiers survive only
in historical log entries, annotated with the rename. Python package
directories (`data/`, `etl/`) are unchanged — no imports were renamed.

## 2026-07-09 — Retrieval must filter on `DocumentVersion.is_current`
**Decision:** `semantic_search()`, `canon_passages()`, and `embed_pending()`
in `etl/enrichment/embeddings.py` now all filter/join on
`DocumentVersion.is_current.is_(True)`.
**Why:** Found live while testing whether the new verbatim-transcript
sources actually improved briefing output: re-rendering `ep_verbatim` to fix
an unrelated speaker-attribution bug created new `DocumentVersion` rows for
58 of 73 documents (the pipeline's existing hash-based versioning working
exactly as designed), but the *old* versions' passages — stale text,
"Unknown speaker" bug and all — kept winning top-k slots right alongside the
corrected ones. Retrieval had never filtered on version currency at all.
**Why this matters beyond this session:** the bug is not specific to the
verbatim adapters — it affects every document in the corpus that has ever
been re-versioned (any amendment, correction, or re-fetch that changes
content hash), which is the entire point `DocumentVersion.is_current`
exists for. It was invisible until something forced a document through a
second version and someone actually compared retrieval results before and
after.
**Implementation:** filter added to both retrieval queries and to
`embed_pending()` itself (a superseded version's passages will never be
retrievable, so embedding them going forward is pure waste). Two regression
tests seed a document with an old and a current version, each scored to
otherwise win on similarity, and prove the stale one never surfaces.

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
**Implementation:** `regina serve` runs the API (`uvicorn etl.api:app`); the site
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
parsing are pure/testable; `regina brief --dry-run` runs with no API key; the live
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
change); HNSW cosine index added; `regina embed` + `regina search` verified on the
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
trigger — `regina refresh` — that runs every registered source adapter end-to-end
(discover → fetch → parse → version → chunk). No manual data entry, ever. The
same orchestrator will later be exposed as an API endpoint and a scheduled job.
**Why:** The product promise is current, trustworthy policy intelligence; that
requires the corpus to refresh on demand and on a schedule without human steps.
**Implementation:** `etl/adapters/__init__.py` registry + `etl/pipeline.py`
orchestrator + `regina refresh` CLI. Adding a source = one subclass + one registry
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
