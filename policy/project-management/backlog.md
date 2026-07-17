# Backlog

Status legend: ✅ done · 🔄 in progress · ⬜ todo

## Milestone 1 — ETL + DB foundation (current)

- ✅ Repo structure mirroring architecture (`etl` / `data` / `website` / PM)
- ✅ Canonical schema: sources, documents, versions, passages, enrichments, vocab
- ✅ Session + `init_db()` bootstrap (pgvector extension + tables)
- ✅ Controlled-vocabulary seeds (policy areas, sectors)
- ✅ Adapter interface + registry (`SourceAdapter`, `ADAPTERS`)
- ✅ Pipeline orchestrator: hashing, versioning, upsert, chunking, cursors
- ✅ Polite/retrying HTTP client
- ✅ Passage chunker with char-offset preservation
- ✅ EUR-Lex reference adapter (SPARQL discovery + content fetch + parse)
- ✅ Single-trigger CLI: `init`, `sources`, `refresh`, `run`
- ✅ Verify EUR-Lex SPARQL discovery against live endpoint (137 docs, sectors 3+5)
- ✅ Verify EUR-Lex fetch+parse end-to-end (Cellar machine endpoint, no WAF)
- ✅ Run `regina refresh` end-to-end on real Postgres+pgvector (embedded pgserver):
      10 docs / 10 versions / 175 passages from live EUR-Lex + Have Your Say
- ✅ Zero-infra local runner (`scripts/run_local_refresh.py`) + pgvector integration tests
- 🔄 Run against managed Postgres (Neon) for the persistent/shared corpus
- ⬜ PDF-text fallback for acts with no HTML/XHTML manifestation (pypdf) —
      now has a concrete blocked customer: the CSAM Regulation proposal
      (52022PC0209) is PDF-only in Cellar and is commented out of
      `eurlex_key_acts.py` until this lands
- ✅ Foundational-acts seeder (`eurlex_key_acts`, 2026-07-06): the discovery
      adapter is recency-filtered, so GDPR/DMA/DSA/AI Act etc. were NEVER in
      the corpus — briefs grounded themselves in press and Commission reports
      instead of the law itself. Curated CELEX list now pulls 16 full texts
      (incl. Data Act, DGA, NIS2, CRA, DORA, MiCA, TTPA, P2B, eIDAS 2, EMFA,
      ePrivacy, DST proposal). Note: the "DFA" (Digital Fairness Act) has no
      CELEX yet — it's still at fitness-check stage, tracked via have_your_say
- ✅ `regina export` (2026-07-06): materializes the corpus into
      `exports/corpus/<source_key>/` folders — one Markdown file per document
      (metadata front matter + current version's full text). The Postgres DB
      (embedded, under `.localdb/`) stays canonical — it is what powers
      versioning, pgvector retrieval and citations; the export is a browsable
      per-source view, regenerate anytime. 974 docs / 68 source folders on
      first run. `exports/` is gitignored
- ⬜ Tune EUR-Lex discovery: title-match → EuroVoc concept URIs for precision
- ✅ Implement OEIL adapter — via EP Open Data API (procedures by year, detail
      fetch, multilingual tech filter, off-topic cursor cache)
- ✅ Implement Have Your Say adapter (brpapi JSON; 234 tech initiatives, verified)
- ⬜ Have Your Say: fetch per-initiative detail for fuller body (search payload is title-thin)
- ✅ Commission press adapter — superseded by the generic feed framework
- ✅ Generic RSS/Atom feed adapter (`feeds.py`) + 20 live-verified channels
      across EU/FR/DE incl. Google News query monitors (paywalled-outlet
      workaround); inventory + blocked channels in project-management/source-map.md
- ✅ Source expansion pass (2026-07-03): mapped ~113 candidate outlets across
      EU/FR/DE (news, regulators, law/pipeline). Integrated 34 new `FeedSpec`
      channels + 2 new bespoke `SourceAdapter`s (59 sources total, up from
      23), confirmed end-to-end via `regina refresh` + `regina embed` against the
      local corpus (762+ documents, 1,100+ passages, all embedded). Remaining
      candidates (needs-verification and confirmed-blocked) tracked in
      project-management/source-map.md's "Backlog — mapped but not yet
      integrated" section
- ✅ Assemblée Nationale open data adapter (`an_dossiers`) — bulk dossier zip,
      flattens the nested `actesLegislatifs` timeline, tech-filtered; the real
      fix for the broken AN RSS. Verified live (20 tech-relevant dossiers on
      first run, real content e.g. C3BO cyber-capacity-centre ratification,
      online CSAM-content-removal bill, resale-platform regulation)
- ✅ Sénat open data adapter (`senat_dossiers`) — dossier CSV, adds
      procedural stage/CC decision/promulgation number beyond `senat_textes`.
      Verified live (e.g. critical-infrastructure-resilience & cybersecurity
      bill, crypto-asset markets ordinance ratification)
- ✅ Gesetze-im-internet.de Aktualitätendienst — turned out to be a live
      no-auth RSS feed (not a bespoke API), added as `gesetze_aktudienst`
- ✅ Investigated Judilibre (Cour de cassation API) — **correction**: requires
      the same PISTE OAuth account as Légifrance, not a separate no-auth API
      as initially believed (confirmed via a live unauthenticated call
      returning `400 "Unable to find token in the message"`). Folded into the
      existing Légifrance key-registration blocker rather than a separate item
- ✅ Investigated OffeneGesetze.de (BGBl mirror API) — genuinely open/no-auth,
      but the site stopped updating 2023-01-01 per its own notice; historical
      backfill only, not integrated for ongoing monitoring
- ✅ Re-verified needs-verification candidates with browser UAs/autodiscovery/
      data.gouv.fr lookups (2026-07-03, round 2): confirmed and integrated 13
      more channels — `eu_ombudsman`, `eiopa_news`, `etsi_news`, `eu_law_live`,
      `contexte_articles`, `contexte_news`, `publicsenat`, `latribune`,
      `inria_news`, `bmi_presse`, `bmwe_presse`, `stiftung_datenschutz`,
      `bitkom_presse` — plus one new bespoke adapter, `adlc_decisions`
      (Autorité de la concurrence merger-control decisions, via the lightweight
      metadata CSV rather than the 220MB full-text export). Genuine dead ends
      confirmed (not bot-blocked, just don't exist): BMDV (renamed to BMV, no
      RSS replacement), Bundesverfassungsgericht (redesign dropped RSS), European
      Court of Auditors (SharePoint, no feed), ACPR (email-only), PEReN
      (nothing published), Acteurs Publics (feed persistently empty), DGCCRF
      (Cloudflare wall; RappelConso open data exists but isn't tech-policy
      relevant). 73 sources total now (up from 23); 926 documents / 1,272
      passages, all embedded
- ✅ Fixed a real reliability gap found while re-running the full refresh: a
      single source's unhandled failure (e.g. a DNS blip) crashed `regina refresh`
      entirely via one big transaction, silently rolling back every source
      already processed in that run. `refresh()` in `etl/cli.py` now commits
      per-source and isolates per-source exceptions, matching the pipeline's
      existing "one bad document doesn't abort the run" principle at the
      source level too
- ✅ Added `follow_redirects` support to `HttpClient.get()` and `FeedSpec` —
      needed for `eu_law_live`, whose server attaches the real feed body to a
      3xx response and only serves the HTML homepage once a client follows it
- ✅ Widened `backfill_days` 730 → 7,300 (2 → 20 years): the bulk open-data
      adapters (`an_dossiers`, `senat_dossiers`, `adlc_decisions`) download
      their entire dataset every run regardless of this setting, so a tight
      window was only discarding history already paid for. Tested by
      resetting cursors and re-running — no pre-2024 tech-relevant matches
      surfaced even across Sénat's 1973+ and ADLC's 1988+ archives (the
      keyword filter is the real bottleneck, not the date window), but the
      wider setting is still correct going forward at zero cost
- ⬜ Remaining needs-verification (short list): EU Agency for Fundamental
      Rights, CEN/CENELEC, Global Competition Review, VoxEurop, ZDNet France,
      a franceinfo tech-specific feed, Bundeskartellamt Sektoruntersuchungen
      (PDF-only)
- ✅ Diagnosed a real quality gap while stress-testing `regina brief`: RSS
      summaries are mostly headline-only (avg 62-400 chars for most feed
      sources vs. 5,000-79,000 for real legal/regulatory text), so the LLM
      could gesture at "coverage suggests controversy" but couldn't cite
      specific counter-arguments — the substance was never captured. Also
      found the briefing prompt passes no `document_type`/`jurisdiction`
      metadata at all (title + raw text only), so the model has no structural
      signal to distinguish binding law from press commentary, and the
      system prompt's "never hedge, BE DECISIVE" instruction actively works
      against surfacing genuine cross-source disagreement
- ✅ Added article-depth enrichment to `FeedAdapter.fetch()` (feeds.py):
      fetches the full page when a summary is under 400 chars, extracts body
      text, and only keeps it past a quality gate (200-char floor, must beat
      the existing summary, must not match a bot-wall/CAPTCHA marker) —
      confirmed live: Sifted up to 5,872 chars (was ~60), BNetzA up to 4,356
      (was ~110); Contexte's paywall and most of BMWE's bot-wall correctly
      fall back to the summary instead of storing garbage. Opted out for the
      3 `gnews_*` monitors — confirmed their Google redirect no longer
      decodes to a real article URL (tested the base64 payload directly)
- ✅ Backfilled the enrichment across all 31 remaining thin `FeedAdapter`
      sources (reset cursors, re-ran, zero errors). Broad, often dramatic
      gains: `eurlex_com_proposals` 219→152,741 avg chars (full proposal
      text, not headlines), `bverwg_presse` 140→21,844, `conseil_etat_avis`
      150→19,496, `eurlex_oj_l` 185→11,250, `laquadrature` 298→13,018,
      `senat_textes` 336→9,008. A handful stayed flat where a bot-wall or
      page-structure mismatch correctly triggered the fallback instead of
      storing garbage: `stiftung_datenschutz`, `hmbbfdi_news`, `arcep_presse`,
      `heise_news`, `ep_written_questions`, `bundesrat_neueingaenge`. Corpus
      now 958 documents / 1,558 passages, avg ~1,750 chars/passage (up from
      near-headline-length), all embedded
- ✅ Extended depth enrichment to `have_your_say`. Its own `SourceAdapter`
      doesn't inherit the feeds.py fix, and its public initiative page turned
      out to be a client-rendered Angular SPA (checked directly — raw HTML has
      no body content, not fetchable without a JS-executing browser). Root
      cause was different than assumed: `initiativeTranslations` genuinely
      only carries `SHORT_TITLE` per language (no body field at all, contrary
      to the old docstring's claim), but the search API's top-level `snippet`
      field — a real body excerpt, previously ignored entirely — was already
      there for the taking. Added `_clean_snippet()` to strip highlight markup
      and dedupe the overlapping "..." truncated halves. Verified live:
      ~71 → ~450-570 avg chars (6-8x)
- ✅ Passed `document_type` + `jurisdiction` into the briefing prompt.
      `semantic_search()` now selects and returns both; `build_documents()`
      prefixes each source title `[Jurisdiction · Type]` (e.g.
      `[EU · Regulation]`, `[DE · Press]`); the system prompt explains the
      convention and instructs Claude to treat Press/Other/Communication as
      evidence of enforcement reality or controversy, never as a substitute
      for binding Regulation/Directive/Decision/Guideline text, and to say so
      explicitly when a press account conflicts with the binding text rather
      than silently picking one. Added `test_build_documents_prefix_
      jurisdiction_and_type` to lock in the format. Verified live: the
      re-run AdReach brief correctly wove Bitkom in as the actual named
      lobbying vehicle in Strategic Play rather than a generic out-of-scope
      footnote — a concrete quality improvement, not just a formatting change
- ⬜ Consider a narrow exception to the "never hedge" briefing instruction
      specifically for cases where retrieved sources materially disagree
      (e.g. official framing vs. documented enforcement precedent) — current
      wording optimizes for executive decisiveness at the cost of surfacing
      real disagreement between sources
- ✅ Pipeline: adapters may return None from parse() to drop off-topic docs
      after deep fetch (counted as `skipped`)
- ⬜ Lifecycle enrichment from Cellar in-force/repeal metadata
- ⬜ Alembic migrations once schema stabilizes
- 🔄 Tests: ✅ chunker offsets, ✅ type/stage classification; ⬜ version-dedup (needs DB)
- ✅ Cellar 300 manifestation-picking fallback + 5 new curated acts (2026-07-13),
      from direct user feedback naming specific instruments the corpus was
      missing (machinery regulation, digital euro, "data omnibus", industrial
      accelerator act/public procurement act, CADA). Checked each live against
      Cellar first: only the Machinery Regulation (32023R1230) resolved
      cleanly — the other four all hit the exact ambiguous-manifestation 300
      response `eurlex_key_acts.py` already flagged as unresolved for the
      GDPR/ePrivacy Digital Omnibus proposal (52025PC0837). Inspected the 300
      body directly (`HttpClient._resolve_ambiguous`, `etl/http.py`): Cellar
      lists every part of the matching manifestation as a direct `DOC_N` URL
      in `stream_order` (part 1 = main act text, part 2 = annex) — exactly the
      "fetch the 300's choice list, take the first HTML one" fallback the old
      comment proposed but never built. Implemented and verified live: all
      five acts now ingest with 0 errors — Machinery Regulation (32023R1230,
      323K chars), Digital Euro Regulation proposal (52023PC0369, 206K),
      Digital Omnibus/GDPR-ePrivacy-Data Act simplification (52025PC0837,
      358K — the previously-blocked one), Industrial Accelerator Act proposal
      (52026PC0100, 277K), Cloud and AI Development Act/CADA proposal
      (52026PC0502, 326K). CSAM (52022PC0209) stays excluded — different
      failure mode (no HTML/XHTML manifestation exists at all → 404, not 300),
      still needs the separate PDF-text fallback. The **EU Public Procurement
      Act** the user also named is a distinct, not-yet-published initiative
      (Commission's 2026 Work Programme target was Q2 2026; as of 2026-07-13
      only the pre-proposal evaluation/consultation is out, no COM number
      exists yet to track) — nothing to add until the Commission tables it.
      **Council Recommendations** (also user-named, as source material for
      policy recommendations): confirmed these need no separate adapter —
      they're EU legal acts with CELEX ids, already in scope for `eurlex`/
      `eurlex_oj_l`/`eurlex_ep_council_legislation`'s existing title-keyword
      discovery. A DB check found zero currently ingested, because that
      discovery is recency-scoped — the exact same gap `eurlex_key_acts` was
      built to close for GDPR/DMA/AI Act. Per direct user follow-up
      ("we need the council recommendation... just keep pushing"), identified
      and added 7 real, currently-relevant, verified-live cybersecurity/
      critical-infrastructure Council/Commission Recommendations to
      `eurlex_key_acts` (found via a live SPARQL sweep for "recommendation"
      + tech terms across all history, cross-checked against known real
      instruments before adding): Council Recommendations on the EU Blueprint
      for Cyber Crisis Management (32025H03445, 2025) and on a coordinated
      response to critical-infrastructure disruptions (32024H04371, 2024) and
      resilience (32023H0120(01), 2022); Commission Recommendations on
      cyber-surveillance export guidelines (32024H2659, 2024), the 5G
      Cybersecurity Toolbox (32021H0946, 2021), the Joint Cyber Unit
      (32021H1086, 2021), and 5G network cybersecurity (32019H0534, 2019,
      the Toolbox's foundational predecessor). All 7 ingested live with 0
      errors. Found and fixed a real, separate bug along the way: CELEX ids
      with a parenthetical suffix (documents sharing an OJ number, e.g.
      corrigenda or same-issue recommendations) 404'd unencoded —
      `CELLAR_CONTENT_URL.format()` left literal `(01)` in the URL, which
      Cellar's server rejects even though bare parentheses are valid URI
      sub-delims and `httpx` passes them through unescaped. Added
      `cellar_content_url()` (percent-encodes via `urllib.parse.quote`) and
      switched both call sites (`eurlex.py`, `eurlex_key_acts.py`) to it.
- ✅ Legislation recency-filter audit (2026-07-13), from direct user pushback
      ("for legislation there is no recency filter, please audit and ensure
      all legislation is present in data corpus" — tech legislation
      specifically, not a scope-widening ask). Found the general `eurlex`
      keyword-discovery adapter was silently much narrower than intended, via
      two compounding bugs, neither visible from `backlog.md`'s own earlier
      claim of a 730→7,300-day widening: (1) **`.env`'s `BACKFILL_DAYS=730`
      was overriding the code's already-widened 7,300-day default** — the
      env file was never updated when the code default changed, so every
      `eurlex` run was still scoped to 2 years, not 20; (2) even with a wide
      window, `discovery_limit = 200` combined with the SPARQL query's
      `ORDER BY DESC(?date) LIMIT 200` means older matches within the window
      were silently dropped in favor of the newest 200 — a wide `since` alone
      can't fix a hard result cap applied after sorting. Quantified the real
      scope via a live SPARQL `COUNT` against Cellar with no date filter at
      all: **1,814** distinct sector-3/5 works match `TECH_SUBJECT_TERMS` by
      title across ALL of EU legal history — a small, entirely tractable
      number, not a reason to keep the window narrow. Fixed: `.env` corrected
      to `7300`; `discovery_limit` raised 200 → 3,000 (headroom above the
      live count); `eurlex`'s source cursor reset (`last_run_at = None`) and
      re-run, since `_since()` in `pipeline.py` uses `last_run_at` for any
      source that has ever run before and only falls back to `backfill_days`
      on a genuinely first run — fixing the settings alone would have been a
      silent no-op against the already-initialized production source. Full
      historical re-run completed live: 1,550 of the 1,814 discovered (some
      of the count's 264-work gap is non-English-title works excluded by the
      SPARQL query's `lang:ENG` requirement), **906 new documents** ingested
      with 0 fetch errors of their own — the run's 624 errors are almost all
      `ValueError: No HTML/XHTML manifestation` on pre-~2010 acts that are
      genuinely PDF-only in Cellar (confirmed via a sample, e.g.
      `52006AB0038`, an ECB opinion) — the same class of gap already tracked
      as its own backlog item (PDF-text fallback), not a new failure mode.
      This is the same root-cause shape as the Council Recommendations gap
      above and the pre-`eurlex_key_acts` GDPR/DMA/AI Act gap — recency-scoped
      discovery structurally can't surface anything older than its window's
      first run, however wide that window nominally is, unless nothing above
      it (env override, result
      cap) silently narrows it back down.
- ✅ CELEX parenthetical-suffix encoding bug (2026-07-13), found while adding
      one of the Council Recommendations above: `32023H0120(01)` 404'd from
      Cellar even though it's a real, live document. Root cause:
      `CELLAR_CONTENT_URL.format(celex=celex)` left the literal `(01)` in the
      URL — bare parentheses are valid URI sub-delims so `httpx` passes them
      through unescaped, but Cellar's own server rejects the unencoded form
      (percent-encoded `%2801%29` resolves fine). Any CELEX with a
      parenthetical suffix — corrigenda, or multiple documents sharing one OJ
      number, which recommendations often do — was silently unfetchable.
      Added `cellar_content_url()` (`etl/adapters/eurlex.py`, percent-encodes
      via `urllib.parse.quote`) and switched both call sites to it.
- ✅ `an_verbatim` 13-month discovery gap (2026-07-13), from direct user
      follow-up ("recheck whether we have french parliament... transcripts
      ingested properly"). DB check found the most recent `an_verbatim`
      document was dated 2025-06-11 despite the live site having sittings
      through 2026-07-10, and the most recent `regina refresh` had discovered
      exactly 0 new items from it. Root cause: the module docstring's claim
      that "the root listing page inlines every sitting in the current
      session directly" was wrong (or stopped being true) — live-checked and
      found the root page only inlines a rolling ~5-week window (23-36
      sittings). `PRIOR_YEAR_GROUPS` already worked around this for the
      *previous* legislative year by crawling each group's own full-history
      index page directly, but nothing did the equivalent for the *current*
      year — so any refresh gap wider than ~5 weeks permanently dropped every
      sitting in between, since they'd scroll off the root page's window
      before ever being seen and weren't archived under last year's groups
      either. Confirmed live: the current year's own group index page
      (`session-ordinaire-de-2025-2026`) inlines its full 592-sitting history
      back to October 2025, the same way a prior-year group's page does.
      Added `CURRENT_YEAR_GROUPS` (mirrors `PRIOR_YEAR_GROUPS`, same "bump
      forward each legislative year" discipline) and now crawl it the same
      way. Verified live: re-run recovered real content spanning the full
      gap — genuine tech-relevant floor debates on AI's economic impact,
      minors and social media, and digital-tools merchant protection, dated
      2025-06-11 through 2026-02-16. `de_verbatim` was checked too and has no
      equivalent bug — it uses the Bundestag's real paginated API with an
      explicit `WINDOW_DAYS` date filter, not a single-page HTML listing, so
      it can't silently truncate the same way.
- ✅ Machinery/robotics keyword-widening audit (2026-07-13), from the same
      user follow-up ("all legal texts on tech, from digital stuff to machine
      production"). `DIGITAL_ECONOMY_SUBJECT_TERMS` (`etl/adapters/base.py`)
      has zero machinery/robotics/automation terms — confirmed as the reason
      the Machinery Regulation needed manual curation rather than being
      auto-discovered. Live-tested candidate terms ("machinery", "robot",
      "autonomous vehicle", "automated vehicle", "industrial automation",
      "3d printing", "additive manufactur[ing]") against all of Cellar before
      committing to anything, per this project's established
      test-before-integrate discipline. Result: **not added to the shared
      discovery vocabulary** — the sweep's 100 matches were almost entirely
      merger-control notices (concentration cases mentioning a company
      literally named "ROBOTICS", e.g. "SBG / ABB ROBOTICS") and implementing-
      decision/corrigendum administrivia, not standalone instruments; adding
      these terms to `eurlex`'s general discovery would flood every future
      refresh with that noise for one real hit. That one real hit — Directive
      2006/42/EC, the Machinery *Directive* — was added directly to
      `eurlex_key_acts` instead: it's the currently-in-force machinery law
      until the Machinery *Regulation* (32023R1230, added earlier today)
      takes over on 20 January 2027, so a brief generated today needs it, not
      just its eventual successor. Verified live, 0 errors.
- ✅ Live brief test on today's new content + 2 real bugs found and fixed
      (2026-07-13), per direct user request to "test what this new ingestion
      does" and assess critically. Ran a real `regina brief` (AutoForge
      Robotics, an AI-driven industrial-robotics profile chosen to exercise
      Machinery Regulation, AI Act, CRA and the new Recommendations) with a
      live Anthropic call, not `--dry-run`. Found: (1) **`eurlex_key_acts`
      data error** — `32021H0946` was labeled "5G Cybersecurity Toolbox" but
      its real text (checked directly) is the Commission's Recommendation on
      a toolbox for the European Digital Identity Framework (eIDAS2-
      adjacent) — a research mistake from the original candidate sweep, not
      a code bug. The brief's own output surfaced it: it cited "5G
      Cybersecurity Toolbox (2019/534)" — the real 5G recommendation's
      number attached to the wrong instrument's name — which sent us back to
      the source. Corrected the label; confirmed no standalone numbered
      Recommendation exists for the actual "5G Cybersecurity Toolbox" (the
      NIS Cooperation Group's Jan-2020 report was endorsed via Council
      conclusions/a joint communication, never its own CELEX instrument), so
      it isn't re-added under a different id. `_persist()` in `pipeline.py`
      refreshes `doc.title` on every sighting regardless of content-hash
      changes, so a plain re-run of `eurlex_key_acts` fixed the DB without
      re-ingesting content. (2) **Real SYSTEM_PROMPT gap**: the same test
      run called Machinery Directive 2006/42/EC "superseded" by the
      Machinery Regulation 2023/1230 — wrong, since the Regulation isn't
      applicable until 20 January 2027, which is the entire reason
      2006/42/EC was added earlier today. No existing rule told the model to
      check a successor's stated application date before treating a
      predecessor as dead law. Added a TRANSITIONAL APPLICABILITY rule to
      `SYSTEM_PROMPT` naming this exact case. Re-ran the identical brief
      after both fixes: Machinery Directive correctly landed **In Scope/
      Prio 1** ("remains the binding text... Regulation only takes over from
      20 January 2027"), the Regulation itself correctly landed **Monitor**
      with the transition date carried into the Watchlist, the corrected eID
      toolbox recommendation appeared with accurate reasoning, and resolved
      citations rose from 2 to 5 — including a real grounded quote from
      CADA (52026PC0502) and a correct, non-hallucinated use of the Digital
      Omnibus (52025PC0837) as a Monitor-verdict watch item. Confirms today's
      additions are usable in a live brief, not just present in the DB.
- ⬜ Newsletter ingestion — user-requested (2026-07-13): a source-agnostic way
      to pull in policy newsletters the team already reads (candidates:
      EDPS's own ~10/yr newsletter, already flagged as an unconfirmed feed-
      based workaround in source-map.md; sector newsletters from law firms/
      trade press). Needs scoping — most newsletters are email-delivery only,
      no public RSS, so this likely means either a forwarding-address ingest
      (email → adapter) or per-newsletter feed discovery same as the existing
      `FeedSpec` sweep. Backlogged, not built.

## Milestone 2 — Enrichment + embeddings

- ✅ Pluggable embedder; local default (BGE/fastembed, 384-dim, no API key)
- ✅ `regina embed` backfills NULL passage vectors in batches
- ✅ HNSW cosine index on `passages.embedding`
- ✅ `regina search` — semantic search returning citation-ready passages (verified
      on live corpus: "AI obligations" → AI files; "cybersecurity" → Digital Networks Act)
- ⬜ Optional hosted embedder (Voyage/OpenAI) behind the same interface
- ⬜ Auto-embed as part of `refresh` (currently a separate step)
- ⬜ LLM enrichment: summary, plain-language "what to expect", what-changes
- ⬜ Citation capture linking each enrichment field to backing passage ids
- ⬜ Auto-classify policy areas + sectors per document

## Milestone 3 — Intelligence (RAG)

- ✅ `CompanyProfile` model + profile → retrieval query
- ✅ Retrieval over passages (semantic search; profile-driven)
- ✅ Citation-grounded briefing via Claude's native Citations feature
      (each passage a citation-enabled document; claims map back to source)
- ✅ `regina brief` CLI (works `--dry-run` with no API key; full run with key)
- ✅ `intelligence/` package + tests (assembly + citation parsing, fake client)
- ✅ `[Jurisdiction · Type]` prefix on every retrieved source's citation title
      (`build_documents()` in briefing.py) so Claude has a structural signal
      to weigh binding law over press/commentary instead of inferring it
- ✅ Competitive/coalition lens for Strategic play (2026-07-03): a new
      unconditional, jargon-free scoping question (`competitive_context` in
      `questions.py`) asks whether a bigger rival or uneven rule change puts
      the company at a disadvantage. It has no dedicated `CompanyProfile`
      field — lands in the generic `answers` bag by design, which already
      flowed into retrieval/scoping with zero API or UI changes needed.
      `SYSTEM_PROMPT`'s Strategic play instructions were extended (not a new
      section — protects the 600-750 word budget) to name a competitor's
      regulatory constraint or a live coalition as a commercial opening when,
      and only when, both the profile and retrieved evidence support it —
      guarded against speculation ("never infer a competitor's identity from
      context alone", "without upgrading a pending investigation or draft
      text into a certainty", explicit "leave this angle out entirely" when
      there's nothing real to say). Deliberately spans DMA/antitrust, DSA
      duties, AI Act compliance-cost asymmetries, and Digital-Omnibus-style
      deregulation — not just competition-law cases (broadened after initial
      feedback that the first draft read too DMA-specific). Verified live:
      a price-comparison profile naming "Google Shopping self-preferencing"
      correctly surfaced the real, dated Commission Article 6(5) preliminary
      finding against Alphabet as a citable competitive opening with concrete
      next actions; a "no dominant rival, fragmented market" profile
      correctly declined to fabricate the angle and stayed compliance-focused
- ✅ **Critical bug fix** in `_extract_text()` (`etl/adapters/eurlex.py`,
      2026-07-06): walking both `<p>` and `<div>` tags double- (or many-times-)
      counted text — a `<div>` wrapping several `<p>` children got its own
      `get_text()` call AND each child `<p>` got one too, compounding with
      nesting depth. Real EUR-Lex legal markup nests deeply, so this was
      severe: MiCA came out at 3,646,337 chars (should be ~600K — "crypto-asset"
      appeared 10,918 times), AI Act 3,000,531 (should be ~575K), DSA
      2,245,854 (should be ~417K) — a 5-7x multiplication across every act.
      This was also the real cause of "computer is laggy": the pending-embed
      queue was 6,092 passages, of which purging and re-ingesting the
      affected sources (`eurlex`, `eurlex_key_acts`) dropped it to 59 —
      the rest was near-duplicate junk from this bug, not genuine corpus
      growth. Fixed by only collecting leaf blocks (no block-level
      descendant), locked in with `test_extract_text_does_not_duplicate_
      nested_paragraphs`. Also fixed `eurlex_key_acts` titles landing on raw
      Cellar manifestation filenames (e.g. "L_2023150EN.01004001.xml")
      instead of a real title for acts served as bare XML with no
      `<p id="title">` — now falls back to the curated short name when the
      extracted title looks like a filename
- ✅ EU Law Tracker adapter (`law_tracker`, 2026-07-06): law-tracker.europa.eu
      has a working undocumented JSON API (reverse-engineered; POST `/search`
      with EUR-Lex directory-code filter + GET `/notice/timeline` per
      procedure). Ingests all COD procedures under directory 13.20.60
      (IT/telecoms/data) with merged Commission/EP/Council event timelines —
      20 live procedures on first run incl. Cybersecurity Act 2, Digital
      Networks Act, NIS2 simplification. Needed a new `HttpClient.post_json()`
      (same retry/politeness policy as get). Coverage dense 2021+ only —
      foundational acts come from `eurlex_key_acts`, this is "what's moving"
- ✅ Report format upgrade (2026-07-06), based on direct user feedback that
      the output wasn't operational enough: (1) Compliance exposure table now
      includes major **Out of Scope** instruments as rows with the precise
      disqualifying threshold or article (e.g. "DMA — Out of Scope — not a
      gatekeeper: below Art. 3(2) thresholds"), not a vague summary line;
      (2) Political radar must name WORKING-level actors — rapporteur/shadow
      rapporteurs/committee, lead DG, Council working party/presidency,
      national regulator — explicitly barred from padding with
      president-level names unless that person personally drives the file;
      (3) Strategic play restructured into three labelled parts: **Lobbying
      focus** (single highest-leverage dossier + venue + ask), **Coalitions**
      (2-4 named bullets from retrieved sources, or an honest "none found"),
      **Watchlist** (3-6 dated upcoming decisions/milestones). Word budget
      raised 600-750 → 700-1000 to fit the added structure. `law_tracker`'s
      timeline text now carries rapporteur/shadow-rapporteur/committee/
      Commissioner/lead-DG/Council fields per event specifically to feed
      part (2) with real names instead of forcing the model to guess
- ✅ Dual-query retrieval for competitive context (2026-07-06): a real-world
      test (GetYourGuide-style profile) showed the competitive angle losing
      retrieval to the profile's compliance signal — the blended single query
      returned AI Act content and missed the Google-travel/DMA dynamic even
      though the corpus had it. `generate_briefing` now runs a second,
      dedicated semantic search on the `competitive_context` answer (skipped
      for "no"-style answers via `_competitive_query`), steered toward
      enforcement content, merged dedup'd into the passage set
      (`_merge_passages`). Guarantees the dynamic a seat in the passages; the
      prompt guardrails still decide whether it's worth writing about
- ✅ Citation-hygiene + escalation-realism fixes (2026-07-06/07), found via a
      deliberately different critical test (SentriCam, a CRA-facing hardware
      profile with no competitor context): the model was blending its own
      sentence directly into unquoted verbatim EU legal-recital text with no
      punctuation boundary, and phrasing a 90-day action as a mid-size company
      unilaterally "taking on" a dominant rival. Added a CITATION HYGIENE rule
      (paraphrase fully or quote with marks — never let formal legislative
      phrasing bleed into analyst prose unmarked) and an escalation-sequencing
      rule (coalition-building/consultation input before any unilateral
      complaint) to `SYSTEM_PROMPT` and `REVISE_INSTRUCTION`; generalized the
      SENTENCE-LEVEL SHARPNESS rule from banned exact phrases to the
      underlying announcing-template pattern, since the model was dodging
      exact wording while keeping the same structure
- ✅ Two-pass self-critique/sharpen + Sonnet 5 switch (2026-07-06):
      `generate_briefing(..., sharpen=True)` (default on) makes a second
      `messages.create()` call where the model rereads its own draft against
      the sharpness/hygiene/escalation checklist before returning a final
      version — a model catches its own template-dodging far more reliably
      looking at finished text than from instructions alone. Moved
      `llm_model` to `claude-sonnet-5` (from Opus 4.8) and `llm_max_tokens`
      8000 → 16000 (a real report was truncating mid-sentence once the
      prompt and two-pass output grew)
- ✅ Latency fix — `output_config.effort` (2026-07-07): end-to-end brief
      generation was taking multiple minutes, well past the "max 3 min" bar.
      Root cause: neither `messages.create()` call set `output_config`, so
      Sonnet 5 defaulted adaptive thinking to `effort: "high"` on *both*
      passes of the two-pass sharpen — content generation against retrieved
      sources doesn't need that depth. Set `effort: "medium"` on the draft
      pass and `effort: "low"` on the revise pass (a mechanical checklist
      self-edit over already-written text). GetYourGuide end-to-end: 89.1s
      (was 2:47+ and climbing before being killed)
- ✅ Full-circle Compliance-table coverage — `canon_passages()` (2026-07-07):
      found via direct user feedback on a real GetYourGuide brief — the table
      only showed instruments that won open semantic retrieval (DMA/DSA/AI
      Act) and silently *omitted* CRA, NIS2, and sector law like the Package
      Travel Directive, rather than stating them Out of Scope. Root cause:
      without a retrieved passage the model has no grounded basis to write
      that row at all, so it just doesn't — indistinguishable from "not
      checked." New `etl/enrichment/embeddings.py::canon_passages()` fetches
      one best-matching passage per instrument in the foundational-act canon
      (`KEY_ACTS`) via `DISTINCT ON`, guaranteeing every canon act a seat in
      context regardless of whether it wins the open top-k; wired into
      `generate_briefing` via `_merge_passages`. `SYSTEM_PROMPT`'s Compliance
      exposure instruction now explicitly demands a row for every canon
      instrument present among retrieved sources, "even when the verdict is
      a flat, one-line Out of Scope." Verified live: GetYourGuide's table grew
      from 3 rows to 16, explicitly stating CRA/NIS2/DORA/MiCA/DGA/eIDAS2/
      Data Act Out of Scope with the disqualifying fact for each
- ✅ Zero-citation retry (2026-07-07): found via the SentriCam re-test — the
      exact same profile, re-run, returned a full ~1000-word brief with
      **zero** `[n]` citation markers once, then normal citation counts (6-7)
      on a repeat run. Root cause: Claude's native Citations feature only
      attaches a citation when the model's own phrasing lands close enough to
      a retrieved span to match — stochastic, and the new CITATION HYGIENE
      rule actively pushes toward paraphrase, which can occasionally paraphrase
      *everything* far enough from source wording that nothing matches at
      all. That's a silent total grounding failure — reads as a normal report
      unless someone counts citations. `generate_briefing` now retries the
      whole draft+sharpen pass once if the parsed result comes back with zero
      citations despite non-empty retrieved passages; keeps the retry's
      result only if it actually has citations, and gives up gracefully
      (returns what it has) rather than looping
- ✅ Sector-agnostic discovery vocabulary (2026-07-07): cross-checked a real
      company's own internal EU tech-policy tracker against the corpus.
      Found it named several real, currently in-force EU instruments we had
      never ingested — the revised Package Travel Directive ((EU) 2026/1024),
      the Platform Work Directive ((EU) 2024/2831), the Empowering Consumers
      for the Green Transition Directive ((EU) 2024/825), the CSRD/CSDDD
      Omnibus I ((EU) 2026/470), and the Digital Omnibus on AI proposal
      (COM(2025) 836) — added all five to `KEY_ACTS` (the sibling GDPR/
      ePrivacy Digital Omnibus proposal, COM(2025) 837, hits an unresolved
      Cellar 300 Multiple-Choices response on every manifestation and is
      commented out pending a fallback, same as the CSAM PDF-only gap).
      The deeper fix is upstream, not another one-off addition: the general
      `eurlex`/`have_your_say` discovery adapters only title-match a narrow
      AI/data/cyber "tech" keyword list, so ANY new EU consumer-protection,
      sustainability-reporting or platform-economy instrument — regardless of
      sector — silently never enters the corpus on its own. Centralized both
      adapters' previously-drifted keyword lists into one
      `DIGITAL_ECONOMY_SUBJECT_TERMS` constant (`etl/adapters/base.py`) and
      broadened it with sector-agnostic terms (consumer protection, distance
      contract, unfair commercial practices, package travel, sustainability
      reporting, platform work, online marketplace, payment service) so
      future instruments in this wider space get picked up continuously for
      any company/sector, not just reactively when someone's own tracker
      happens to surface a gap
- ✅ `HttpClient.negotiate()` 300-status bug (2026-07-07): found while
      ingesting the acts above — Cellar returns HTTP 300 (Multiple Choices,
      not 404) when a CELEX has manifestations but none matches an Accept
      header cleanly; `negotiate()` only treated 404 as "try the next
      representation" and let 300 propagate as a crash. Now skips 300 the
      same way, falling through to the next Accept type in the list
- ✅ `eurlex_key_acts` filename-title bug, generalized (2026-07-07): the
      existing filename-detection only matched `.xml`/`.xhtml` extensions; a
      COM proposal's manifestation filename ending `.docx` slipped through
      unreplaced into a citation title. Replaced the extension allowlist with
      a "real titles have whitespace, manifestation filenames never do" check
      — catches any extension, not one more to enumerate next time
- ✅ Main table / Appendix split (2026-07-07), from direct user feedback
      comparing against a real internal tech-policy tracker: `canon_passages()`
      guaranteeing coverage meant the main Compliance table ballooned to 16
      rows for GetYourGuide, burying the "quick overview" under an exhaustive
      scope map. Split into two tables: main Compliance exposure now holds
      only **In Scope**/**Monitor** rows (a short action list); every **Out
      of Scope** verdict moves to a new one-line-per-row "Appendix: Out of
      Scope Register" at the end. Nothing is silently dropped (the completeness
      guarantee holds — 20/20 canon acts got a row across both tables in the
      cleanest test run), but the primary read stays scannable. Target ~2-2.5
      printed pages for the whole document, main body + appendix
- ✅ Instrument-identity hallucination guard (2026-07-07), found on a live
      GetYourGuide run: `canon_passages()` had the real, retrieved ECGT text
      in context, but the model named a different, real EU proposal it knew
      from training ("Green Claims Directive" — per the user's own tracker, a
      *stalled, never-enacted* proposal, not the enacted ECGT) with no
      citation marker at all, and dropped the real ECGT row entirely.
      Existing CITATION HYGIENE didn't catch it — that rule guards obligation
      *content*, not instrument *identity*. Added an explicit rule ("never
      name a law/directive/regulation/proposal not among the retrieved
      documents, even a real one you recognize from training") plus a
      REVISE_INSTRUCTION checklist item (7) that cross-checks every named
      instrument against the actual retrieved document titles. Fixed cleanly
      on the next run (ECGT appeared correctly, cited); **partially
      recurred** on a later run — same instrument mislabeled "Directive on
      Green Claims (2024/825)" while the citation/CELEX stayed correctly
      anchored to the real ECGT text. Down to a display-name slip rather than
      a full hallucination, but not fully reliable after one fix — flagged
      for the user rather than claimed fixed
- ✅ Citation hygiene, round 2 — table cells + whole-sentence verbatim
      (2026-07-07): re-testing after the appendix split surfaced the *same*
      hygiene defect in a shape the original fix didn't cover. (a) Why/Trigger
      table cells strung together unquoted verbatim source clauses back to
      back — terse enough that the "blending mid-sentence" framing didn't
      obviously apply, so the model treated cells as exempt. Extended the
      rule explicitly to table cells in both `SYSTEM_PROMPT` and
      `REVISE_INSTRUCTION`; verified fixed on the next run (all main-table
      cells came back as clean paraphrases). (b) A *whole sentence* copied
      closely from a source and stated as flat analyst narration — no
      mid-sentence blend to even point at, since the entire sentence WAS the
      source. Added a concrete trigger ("8+ consecutive words matching the
      source = needs quotation marks, no third option of stating it as
      narration") instead of relying on the vaguer "boundary" framing. Fixed
      3 of 4 affected rows on the next run (P2B, Package Travel Directive,
      CRA all now quote properly); **one specific recital sentence — the DMA
      Art. 6(5) "gatekeepers... more favourably..." definition — survived
      unquoted across every single test run this session**, including after
      this fix. Likely because the model treats *defining* a legal provision
      as stating settled fact rather than citing it. Diminishing returns on
      prompt-only iteration at this point — flagged for the user rather than
      chased further; a programmatic n-gram-overlap check on generated text
      (flag/auto-quote spans with high source overlap) would be the more
      reliable next lever if this needs to go to zero
- ✅ Report format v3 (2026-07-07), from direct stakeholder (boss) feedback
      on a real GetYourGuide brief ("SIGNIFICANTLY better", plus four asks):
      (1) **Prio 1-3 column** added to the Compliance table next to Verdict,
      assigned by exactly three guardrails supplied by the stakeholder —
      material non-compliance exposure under a live regime, direct commercial
      upside from a competitor/gatekeeper being forced to comply, or looming
      material financial damage; rows sort by Prio, not verdict. Verified
      live: DMA/Google lands Prio 1 via the upside guardrail, routine
      GDPR/DSA/ePrivacy land Prio 2. (2) **Political radar + Strategic play
      merged** into '## Political landscape & strategic play', explicitly
      biased toward verifiable landscape facts (who runs the file, live
      proceedings, dates, venues) over strategic-advice prose — the PA team
      tailors strategy by hand; the escalation-realism rule moved into the
      Lobbying focus instruction. (3) **Action column dropped** (too slim/
      vague) and the **Next actions 30/90-day section dropped entirely** —
      action sequencing is the team's manual value-add. (4) **Export/site
      split**: the PDF is the shareable executive artifact — `_export_markdown`
      in pdf.py truncates the appendix and strips inline [n] markers, and the
      Sources block is gone from the PDF; the website keeps everything in a
      'Coverage & sources' fold-out (`ReportCoverage` in Report.tsx) where
      each source now lists every claim it supports ("Used for: ..." via
      cited_text snippets) — traceability by source, not by inline marker.
      Also banned positional appendix references from the main body ("the
      register below") since exports omit the appendix
- 🔄 Instrument-identity mislabeling, third occurrence (2026-07-07): the
      format-v3 live run mislabeled Regulation (EU) 2024/900 (Political
      Advertising Regulation/TTPA, correctly retrieved and in context) as a
      "Dark Patterns Regulation" and gave it an In Scope verdict on
      booking-flow design — a wrong verdict on a real instrument, no
      citation on the row. The prompt-level identity check (SYSTEM_PROMPT +
      revise checklist) reduced but does not eliminate this failure mode.
      Next lever is deterministic, not prompt: post-generation validation
      mapping every instrument name in table rows to the canonical KEY_ACTS
      short name via the row's resolved citation CELEX, auto-correcting or
      flagging mismatches — scoped narrowly to table Instrument cells where
      the name↔citation correspondence is unambiguous. Fourth occurrence on
      the very next run (2026-07-07): Dir. 2024/825 (ECGT) rendered as "Green
      Claims Directive" in the appendix — right number and substance, wrong
      display name
- 🔄 Run-to-run verdict instability on borderline instruments (2026-07-07),
      observed across two consecutive identical GetYourGuide runs: NIS2
      flipped Monitor → Out of Scope ("no evidence GYG qualifies") even
      though NIS2's own definition covers "online marketplace" digital
      providers and the client's real internal tracker treats it as likely
      applicable; ePrivacy flipped In Scope → Monitor; the CSRD/CSDDD
      Omnibus I (32026L0470, in canon and in context) was mischaracterized
      as an "administrative support portal Directive" in one run and omitted
      entirely in the next, despite the client's tracker rating GYG "very
      likely in scope" from FY2027; TTPA got a wrong In-Scope row in one run
      and no row at all in the next. (A "verdict hints by business model" map
      was considered and dropped on user feedback — it would hardcode domain
      judgment into the tool and go stale.)
- ✅ Anti-freelancing layers (2026-07-07), the systematic fix for the two
      entries above, designed around the user's constraint that verdicts stay
      100% the model's call and deterministic code only checks "spelling":
      (1) **Facts for verdicts** — `SIZE_QUESTION` bands sharpened to the
      thresholds instruments actually turn on (split the coarse "large 250+"
      bucket into 250-999/€50-450M and 1,000+/€450M+, resolving the CSRD line
      that caused the guessing), plus a deterministic hinge rule in
      `SYSTEM_PROMPT`: a verdict hinging on a threshold fact the profile
      doesn't answer is ALWAYS Monitor with the hinge named ("hinges on
      whether turnover exceeds €450M — confirm"), never a run-to-run
      coin-flip. The LLM-extras question step may now ask a threshold-hinge
      question when genuine doubt exists — explicitly the exception, not the
      default, per user direction. (2) **Deterministic canon cross-check**
      (`_canon_issues` in briefing.py) — judgment-free by construction: for
      every table row carrying a year/number reference that maps to a canon
      act in context, verify the row's instrument name matches that act's
      canonical name (catches "Green Claims Directive (2024/825)" vs the real
      ECGT); and verify every canon act in context has a row in one of the
      two tables (catches the dropped CSRD/TTPA rows). Violations are handed
      back to the MODEL in one targeted correction call (`build_fix_request`)
      — the check finds, the model fixes, verdicts/priorities/substance never
      touched by code. One fix call max; anything still unresolved surfaces
      as `canon_notes` in the CLI output and API response (never silently
      shipped). Name-matching is deliberately lenient (acronym / bigram /
      distinctive-word) so a spurious mismatch — the costlier error — stays
      rare
- ✅ Activity-hinge questions without adding friction (2026-07-08): the
      user's constraint was explicit — capture just enough to tailor,
      never ask a SaaS company about manufacturing. Three changes, all
      inside the existing conditional-question mechanism, zero new
      questions added to the static set: (1) the LLM-extras retrieval step
      now gets the same `canon_passages()` guarantee `generate_briefing`
      already has, so an instrument whose activity question matters most
      (CRA, P2B, ECGT) can't lose its chance to be asked about just because
      it doesn't win the open top-k for a thin/off-vocabulary description;
      (2) `build_extras_request()` now includes `profile.scoping_lines()` —
      previously it only saw name/description/sectors/two booleans, so it
      could (and did, on a real PriceScout run) propose a question
      re-deriving a fact — monthly EU users — already answered; (3) the
      `ai_role` question's "provider" option split into GPAI-model-provider
      vs. system-provider-on-others'-models, since only the former carries
      the AI Act's Chapter V duties — same single click, no new screen.
      Caught and fixed during live verification: change (1) initially
      backfired — a pure invoicing SaaS company got asked about "connected
      accounting hardware" because a CRA passage's mere guaranteed presence
      in context read to the model as grounds for doubt. Tightened
      EXTRAS_SYSTEM to state explicitly that canon passages are guaranteed
      for every company regardless of relevance (so the report can say Out
      of Scope), and that a question needs the company's own profile to
      give a specific, plausible reason — not an invented hypothetical.
      Verified live post-fix: SaaS company → 0 extras; hardware company
      (thin description) → 2 well-targeted questions (Data Act connected-
      product data access, CRA remote-updatable firmware); PriceScout →
      duplicate MAU question gone, replaced by two non-duplicate P2B/DSA
      questions.
- ✅ Draft/revise call-count reduction + prompt caching (2026-07-07): brief
      generation was taking 86-192s even before retries, and one real run hit
      316s — traced to the citation-retry safety net always re-running the
      *entire* draft+revise pass (2 calls) even when only revise had dropped
      citations the draft already had. Three changes, no prompt/effort/
      quality change: (1) `cache_control` on the last passage document block
      — confirmed working via a direct probe (call 1: 7,812 tokens written to
      cache; call 2, same passages: 7,812 read, 0 written) — so every call
      after the first within one report reuses the already-processed source
      text instead of reprocessing it; (2) citations now checked right after
      the draft, before the mandatory revise call, so a citation-less draft
      retries itself alone instead of paying for draft+revise again; (3) the
      deterministic canon check now runs on the draft too, folding any fix
      into the same revise call instead of a dedicated 3rd call. Also added:
      when revise's own rewrite drops citations the draft had (the actual
      316s root cause), retry revise alone on the same draft before falling
      back to the full-pass retry.
- ✅ Sub-140s latency target vs. quality — real floor found, accepted as a
      soft target (2026-07-07): a 3-profile sweep after the fixes above measured
      139.5s / 144.8s / 258.1s end to end (target: 120-140s). Root cause is
      structural, not a bug: the single mandatory draft call alone measured
      77-117s across profiles (effort=medium, adaptive thinking, ~1000-word
      structured output with two tables) — caching cannot help this call
      (nothing to read from cache yet on the first call of a report), so this
      is the real latency floor, not overhead. The 258s run additionally
      needed a full draft retry (the draft came back with zero citations; the
      retry redid the entire ~120s draft from scratch). Any further latency
      win now requires touching generation itself — lower draft effort,
      shorter target length, or a looser citation-retry threshold — all real
      quality trade-offs, not free reordering. Decision (2026-07-07): accept
      120-140s as a soft target rather than touch generation quality to force
      a hard ceiling — the live stage-progress panel (below) already makes
      the wait transparent, and occasional runs past 140s are an acceptable
      trade against not degrading report quality. Revisit if it recurs often
      enough to matter. Also surfaced in the same sweep: the Acme Robotics
      run shipped with only 1 resolved citation across a ~9,300-character
      report with ~10 compliance-table rows — passes the existing "zero
      citations" retry check (1 > 0) but is barely better grounded than zero
      for a product whose core promise is "every claim traced to its
      source." The retry threshold checks presence, not sufficiency, of
      citations — worth a look independent of the latency question.
- ✅ Deterministic Compliance-table row sort (2026-07-07), from user review of
      a real idealo run: the model rendered a Prio-2 In-Scope row (ePrivacy)
      *after* the Prio-3 AI Act row, violating SYSTEM_PROMPT's explicit
      "Prio ascending, In Scope before Monitor" rule. Ordering is pure
      presentation with a fully specified rule, so — unlike names/verdicts,
      which stay the model's call — it's now enforced in code:
      `_sort_compliance_table()` stable-sorts body rows of any table whose
      header has a Prio column (the appendix has none, so it's untouched)
      after all generation/fix passes. Same user review also verified a
      confidentiality worry: the report's "Staff Working Document" reference
      resolved to the Commission's own public DMA-review SWD (52026SC0123,
      ingested from EUR-Lex) — NOT the user's internal tracker template,
      which has never been ingested (no upload path exists; all sources are
      official public feeds; the tracker was only used manually as a
      KEY_ACTS gap cross-check).
- ✅ Competitive-context retrieval bias (2026-07-07/08), same idealo review:
      naming Google as the dominant rival made the whole run DMA-heavy —
      DMA got the sole Prio-1 row, and the LLM-extras scoping questions
      skewed DMA too. Mechanics: (a) the dedicated competitive retrieval
      pass guarantees rival-focused passages a seat (by design, bounded at
      4); (b) the freshly ingested DMA Art. 53 review report + SWD are
      large, recent, DMA-dense docs that won many open-retrieval slots on
      raw similarity; (c) extras questions are generated FROM retrieved
      passages, so retrieval bias compounds into question bias. Decision:
      KEEP the competitive-context question — the report's grounding rules
      deliberately forbid inferring a competitor from world knowledge
      ("never infer a competitor's identity from context alone"), so the
      question is the only guardrail-compatible source for the strategic-
      play angle; removing it loses that half of the product or reopens
      hallucinated-rival risk. Bounded its influence instead: (b) fixed via
      `_cap_per_document()` — open retrieval now over-fetches 2k and keeps
      at most 3 passages per document, backfilling capped slots with other
      documents' next-best; (c) fixed via EXTRAS_SYSTEM diversity rule —
      never two questions on one instrument, retrieval volume ≠ open
      scoping facts, a named rival must not pull every question toward the
      competition file.
- ✅ Conditional-applicability verdicts — activity-hinge rule (2026-07-08),
      same review: ECGT (2024/825) got a flat "In Scope" for idealo on the
      comparison-tool provision — but that provision only bites if the
      platform actually compares environmental/social characteristics
      (idealo compares prices). The hinge rule covered quantitative
      thresholds and value-chain roles; an *activity* hinge ("does the
      company do X at all?") slipped through to a flat verdict — the exact
      credibility failure the verdict discipline exists to prevent.
      Extended SYSTEM_PROMPT's deterministic exception to activity facts
      ("must NOT get a flat In Scope merely because the company is the
      kind of business that COULD do X") with a mirror discipline so it
      can't overcorrect (profile answers the fact → commit, Monitor is
      never a hedge), and added VERDICT HINGE CHECK as revise-pass check
      (8) with row-changing authority like the identity check. Same row's
      Why cell was near-verbatim directive text without quote marks —
      citation-hygiene defect surviving the revise pass; existing check
      (5) covers it, kept as a watch item.
- ✅ Verbatim-transcript sources wired into the briefing layer, and two real
      retrieval bugs found along the way (2026-07-09) — the user asked to
      "run some tests on how this affects the output," which surfaced more
      than the prompt-tuning question it started as:
      (1) **Zero of 2,545 new ep_verbatim/an_verbatim/de_verbatim passages
      were embedded.** `regina embed` had never been run after ingestion — the
      new content was completely invisible to `semantic_search()` no matter
      how good the prompts were. Obvious in hindsight, invisible until
      someone actually tried to retrieve it.
      (2) **Retrieval had no `is_current` filter at all** — a real,
      previously-invisible bug, not new to this session: `semantic_search()`
      and `canon_passages()` joined `Passage` → `DocumentVersion` → `Document`
      but never filtered on `DocumentVersion.is_current`, so a superseded
      version's passages stay permanently retrievable forever alongside the
      current one. Found live: re-rendering `ep_verbatim` to fix the
      speaker-attribution bug below created new `DocumentVersion` rows, but
      the *old*, buggy-text passages kept winning top-k right alongside the
      corrected ones — same document, two versions, both live in search
      results. Fixed in `etl/enrichment/embeddings.py`: added
      `DocumentVersion.is_current.is_(True)` to both retrieval queries and
      to `embed_pending()` itself (no point spending CPU embedding a
      passage that can never be retrieved once superseded). Two new
      regression tests (`test_embed_pending_skips_superseded_versions`,
      `test_semantic_search_never_returns_superseded_version_passages`)
      seed a document with an old and current version and prove the stale
      one never surfaces even when it would otherwise win on similarity.
      This bug predates the verbatim adapters entirely — any document that
      ever gets amended/corrected (which is the whole *point* of the
      versioning schema) was silently affected the same way.
      (3) **EP speaker attribution bug**: re-checking real retrieved
      passages surfaced "Unknown speaker —" in several of the
      highest-relevance hits. Root cause: an MEP's remarks are split across
      several `<p class="contents">` tags in the EP's HTML, but the name
      markup only appears on the first one — `_split_items()` treated every
      untagged continuation paragraph as a fresh, unattributed speaker turn
      instead of the same person still talking. Fixed by tracking a running
      per-item "current speaker" and merging continuation paragraphs into
      the last entry. Re-rendered all 84 EP days: 58 of 73 documents
      changed text (confirms the bug was widespread, not an edge case),
      0 "Unknown speaker" remaining across all of them. AN/DE were checked
      and don't have this bug — their HTML/XML wraps one whole speech in a
      single container element, so there's no cross-tag continuation to
      lose.
      (4) **SYSTEM_PROMPT changes**: `document_type` for all three verbatim
      adapters is "other" (the schema has no dedicated type, by design —
      see decision-log.md 2026-07-09), so a floor-speech transcript was
      structurally indistinguishable from a press summary in Claude's own
      document labels. Added a `kind` field end-to-end
      (`Document.extra["kind"]` → `_row_to_passage()` → passage dict →
      `_source_label()`) so a verbatim source gets its own
      `[Jurisdiction · Verbatim debate]` label instead of the generic
      "Other" bucket, plus new SYSTEM_PROMPT guidance in the Political
      landscape & strategic play section: a Verbatim debate source outranks
      a generic "the rapporteur" reference, name the actual speaker/group
      and what they said (paraphrase or quote per existing CITATION HYGIENE
      rules), and treat it as a direct input to the Coalitions bullets
      (one MEP's remarks ≠ their whole group's settled position, though).
      Also propagated the `kind` tag through to the human-facing citation
      list (CLI/PDF/website), not just Claude's internal document labels —
      previously only the model could tell a floor speech apart from any
      other source.
      **Live proof, real API call** (SentriCam, an industrial IoT/camera
      manufacturer profile): the model independently found and used two
      different verbatim sources, naming Executive Vice-President Henna
      Virkkunen and Commissioner Costas Kadis by name and role, quoting
      each properly with quotation marks (citation-hygiene compliant, not
      blended unmarked), and correctly declined to invent a coalition when
      none was named in the sources rather than fabricate one. The
      generated Sources footer now reads e.g. "[1] US AI chip export
      restrictions... (debate) (verbatim debate) https://...". This is one
      test, not a broad sweep — worth another pass on a France/Germany-
      weighted profile to confirm `an_verbatim`/`de_verbatim` content gets
      used the same way, since this run only exercised `ep_verbatim`.
- ⬜ Jurisdiction/lifecycle/sector metadata filters on retrieval
- ✅ Run a real briefing once ANTHROPIC_API_KEY is provided — done 2026-07-09
      (see entry above); ANTHROPIC_API_KEY was already configured
- ⬜ Optional hosted embedder (Voyage) for higher retrieval quality
- ⬜ PDF-text / manifestation-choice fallback for Cellar 300/no-HTML acts —
      now has two blocked documents: CSAM proposal (52022PC0209, PDF-only)
      and the GDPR/ePrivacy Digital Omnibus proposal (52025PC0837, ambiguous
      300 on every Accept type tried)
- ✅ EP plenary verbatim reports (`ep_verbatim`, 2026-07-09) — real debate
      transcripts (named speaker, role/group, full speech text, linked OEIL
      procedure ref) for tech-relevant agenda items, not just document
      metadata. The EP's `doceo/document/CRE-*.html` sits behind an AWS WAF
      JS challenge with no machine-readable fallback (confirmed live: every
      content type, full browser headers, no Cellar-equivalent, no working
      captions API); a real headless Chromium (Playwright) passes it where
      `httpx` gets nothing — the one adapter in the codebase that renders a
      browser instead of a plain request. See decision-log.md 2026-07-09 for
      the full trade-off. Verified live end-to-end against the real site and
      local DB: correctly surfaced named MEP/Commissioner speeches on the
      Cybersecurity Act, the Digital Networks Act, and AI-deepfakes
      enforcement, each linked to its OEIL procedure reference. A real
      parsing bug was caught and fixed during live verification: the
      dash-splitting heuristic matched plain ASCII hyphens too, so roles
      like "Executive Vice-President" cut the speech text at the wrong
      point — fixed to match only the EP's actual en-dash separator. A real
      incremental-refresh bug was also caught (only visible across two live
      runs, not unit tests): using the pipeline's generic `since` cursor
      would silently stop discovering every past sitting day forever after
      the first run (it collapses to "today"); fixed with a dedicated
      `processed_days` cursor entry, mirroring `oeil.py`'s "current +
      previous year, ignore `since`" convention instead
- ✅ Assemblée Nationale verbatim (`an_verbatim`, 2026-07-09) — the FR
      sibling to `ep_verbatim`. No bot wall at all on this one (plain
      `httpx` works); discovery covers the current + previous legislative
      year (mirrors `ep_verbatim`'s 2-year window) by also crawling the
      root listing page's sibling session-group index pages, which the
      root page doesn't inline. A transient 503 from the AN's server was
      caught crashing the *entire* source run (an unhandled exception
      inside `discover()`'s generator, unlike `fetch()`/`parse()` which
      pipeline.py already isolates per-document) — fixed with a try/except
      around the per-sitting fetch that skips and leaves the sitting
      un-marked-processed (retried next run) rather than aborting
- ✅ False-positive fix + full recall audit, both verbatim adapters
      (2026-07-09): a first bulk run surfaced systemic false positives —
      "Post-election situation in Uganda", "Gender pay and pension gap",
      "Questions au gouvernement" all got ingested. Root cause: relevance
      was checked against title *plus* the first few speakers' raw text
      (added for recall — some genuine debates have generic titles), but
      that text is long and multilingual, and a few `TECH_KEYWORDS` entries
      are short/ambiguous substrings that collide inside it — " ai " inside
      French "j'ai", "chip" inside "citizenship"/"relationship", "daten"
      inside German "Mandaten", "internet" inside the boilerplate
      "available on Parliament's website" sign-off every item ends with.
      Verified live on a 34-doc batch: 9/9 genuine matches already passed
      on title alone; 0/16 false positives did. Fix: dropped the
      speaker-text fallback entirely, title-only now (mirrors `oeil.py`).
      Purged the false positives, reset both cursors, re-ran clean.
      User pushback ("28th Regime is also relevant... arising from the
      need for tech startups to scale across Europe") correctly rejected
      the sacrifice-recall tradeoff — fixed by widening `TECH_KEYWORDS`
      with a few precise, title-safe phrases ("innovative compan",
      "start-up"/"startup"/"scale-up") instead of reopening the risky
      fallback. Then, rather than assume title-only was sufficient, ran a
      full audit: re-scanned every one of the 2,515 EP items (84 sitting
      days) and 929 AN items (317 sittings) in the 2-year window, dumping
      every title — kept AND dropped — for a full manual eyeball review.
      Found 5 genuine, concrete misses this way, each verified to hit
      exactly once across the full dropped set before adding (same
      collision-safety discipline as the fix above): EP — "media freedom
      act" (a debate on the EU's own EMFA, one of the 24 pinned foundational
      acts; bare "media freedom" was tried and rejected, since it also
      matches an unrelated Georgia press-freedom debate and a journalist
      memorial), "communication infrastructure", "tech race"; AN —
      "tiktok" (a coined brand name, low collision risk, unlike "Google"/
      "Amazon"/"Apple" which were considered and rejected for exactly that
      dictionary-word-collision reason), "réseaux sociaux". Also tested and
      rejected a theoretically safer alternative signal — cross-checking
      each item's linked OEIL procedure reference against the existing
      `oeil`/`law_tracker` corpus — because the reference lives in speech
      content, not the title (still needs a fetch either way), and that
      corpus only tracks 26 procedures total, too sparse to be a useful
      oracle yet. Final: 73 `ep_verbatim` + 3 `an_verbatim` documents, 0
      title-only-check failures on re-verification, local DB 149MB (from
      164MB baseline — far under an initial ~300-400MB worst-case estimate,
      since the false-positive fix cut ingested volume substantially)
- ✅ Bundestag verbatim (`de_verbatim`, 2026-07-09) — the DE sibling to
      `ep_verbatim`/`an_verbatim`, and unblocked the same day it was parked:
      re-checking the DIP API's own help page (rendered live, not assumed
      from the earlier backlog note) surfaced an official public demo key
      published directly on it (`R2BZaee...`, valid through 2027-05) —
      distinct from the dead community-maintained key already confirmed
      revoked. No user action needed. Best-structured of the three sources:
      real semantic XML (`<redner>` tags with structured name/party fields,
      no HTML-class parsing) at `dserver.bundestag.de`, no bot wall
      anywhere, no headless browser needed — plain `httpx`. Agenda-item
      titles come from the protocol's own table of contents, matched to
      the body by a shared `top-id` string. Same `processed_protocols`
      cursor pattern as the other two, and the same per-item try/except
      fix as `an_verbatim` (a not-yet-published sitting 404s for a day or
      two; skipped and retried, not fatal to the run). Caught a real,
      *pre-existing* bug in the shared `TECH_KEYWORDS` list this way: bare
      "netz" (network) matched "Gasnetzentgelten" (gas-network fees) and
      "BNetzA" just as readily as anything digital — German compounds
      nouns freely, so this was likely already a silent false-positive
      source in `bundesrat_neueingaenge`/`bundestag_hib`/
      `gesetze_aktudienst` too (not yet re-audited). Replaced with specific
      compounds ("netzneutralität", "mobilfunknetz", "netzabdeckung", etc.)
      — one of which ("netzabdeckung") had to be added back after the
      first replacement pass over-corrected and dropped a genuine telecom-
      coverage motion. Final: 41 documents, full 2-year window (Sept 2024–
      Jun 2026), 0 title-only-check failures on re-verification, including
      Germany's own AI Act and Data Act implementation laws, a "Digitale
      Zeitenwende für Deutschland" motion, and an AfD motion to abolish the
      DSA. Local DB 150MB (from 149MB)
- ⬜ Council of Europe PACE plenary verbatim records — investigated
      alongside `ep_verbatim` (2026-07-09) since the user asked about them
      directly; blocked by a Cloudflare JS challenge (different vendor than
      the EP's AWS WAF) with no open-data fallback found. Not pursued: PACE
      is also a different institution/jurisdiction (Council of Europe) than
      this tracker's EU/FR/DE scope, so it would be a new jurisdiction, not
      an extension of existing coverage — worth a deliberate scope decision
      before investing in it, not a quick add
- ⬜ Roll-call vote data (`howtheyvote.eu`, MIT-licensed, no-auth JSON API) —
      found while investigating `ep_verbatim`: a real, live, per-MEP
      FOR/AGAINST/ABSTENTION breakdown for every EP plenary vote back to
      2019, with a per-political-group summary, linked directly to the OEIL/
      COD procedure reference (same `reference` format `law_tracker.py`
      already uses). Not yet integrated as its own adapter — would be a
      lighter-weight, purely structural complement to `ep_verbatim`'s actual
      speech text (a MEP's recorded position on a specific tech dossier,
      without needing to parse rhetoric): a real "who stands where" signal,
      not a replacement for it
- ✅ Bottom line restructured into ACTION + ATTENTION bullets (2026-07-14),
      direct user feedback: the Bottom line was mixing all Prio levels
      together and had no explicit risk/opportunity framing — "only start
      with urgent stuff that requires action, then the attention getters
      that highlight regulatory risks and regulatory opportunities."
      `SYSTEM_PROMPT`'s Bottom line instruction (`briefing.py`) now specifies
      two bullet types in fixed order: ACTION bullets — exactly one per
      Prio 1 row in the Compliance table, nothing lower-priority, with an
      explicit "zero Prio 1 rows → say so in one bullet" fallback instead of
      padding with Prio 2/3; then up to two ATTENTION bullets — RISK (the
      most material Prio-1-criterion-(a) row's concrete downside: the
      instrument's actual penalty ceiling from the retrieved sources, plus
      licence/designation/market-access exposure when the sources support
      it) and OPPORTUNITY (the most material Prio-1-criterion-(b) row's
      concrete business opening from a named competitor/gatekeeper's own
      compliance dynamic) — both explicitly optional and never fabricated to
      hit a bullet-count target, reusing the existing "never infer a
      competitor from world knowledge alone" guardrail from the Political
      landscape section. Verified live (ClickHarbor: a marketplace profile
      with a self-declared GDPR gap and Amazon named as a competitor):
      Bottom line came back as exactly 2 ACTION bullets (GDPR, DSA — its two
      real Prio 1 rows, no Prio 2/3 leakage), 1 RISK bullet, and 1
      OPPORTUNITY bullet naming Amazon's VLOP obligations as a concrete
      opening. Notably the RISK bullet correctly declined to state a fine
      percentage — the retrieved CPC-network precedent (Wish.com, Tinder)
      showed the realistic outcome is a forced practice change, not a
      penalty, and the guardrail against stating an unsupported figure held
      rather than defaulting to generic "large fines" language. All 45
      existing tests pass unchanged (neither test file asserts Bottom line's
      internal structure).
- ✅ Vertical end-to-end ProgressRail for the brief wizard (2026-07-14),
      direct user request: the old horizontal 3-step bar (company → scoping
      → report) gave no sense of progress during report generation, "so
      people are not discouraged while waiting for AI stuff." Went through
      several rounds of live-tested iteration to the final design — a new
      `brief/ProgressRail.tsx`, right-side, spanning the whole flow: one flat
      list of every real screen the user passes through (profile, each
      scoping group actually shown, then each AI call streamed from
      `/api/brief`'s `on_stage` events in `generate_briefing`), not the
      nested macro/sub-step structure first tried. Every step gets a hand-
      drawn inline-SVG icon and a wordplay name on the real EU legislative
      process, deliberately non-repeating end to end: informal intake reads
      as preliminary process (Filing the dossier → Preliminary review →
      Impact assessment → Technical consultation → Stakeholder consultation
      → Committee referral), the AI's actual writing reads as the formal
      readings that follow (First reading → Committee markup → Second
      reading → Point of order → Plenary vote). Elapsed-time timers only
      appear on steps that are real LLM calls (drafting/sharpening/
      verifying/cross-checking) — not on scoping groups, not on "First
      reading" (`retrieving`, a vector-search DB query, not an LLM call) —
      and freeze once a step completes rather than ticking forever. Scoping
      groups are known in full once questions are fetched, so they're pre-
      rendered as upcoming; AI sub-stages are appended only once they
      actually happen, preserving `generate_briefing`'s own documented
      guarantee that a progress UI built on it "never claims a step that
      didn't occur." Layout: `.brief-layout` (flex, `align-items: stretch`,
      14px gap) makes the rail match whichever box is on the left at its
      natural height, dropped once the finished report renders full-width.
      Fixed a real bug found via live screenshot during iteration: with only
      one step known (before scoping questions load), the connecting line
      (drawn once for the whole list, not per-row, so it stays correct under
      `justify-content: space-between`'s variable gaps) dangled into empty
      space — scoped the line to `.rail-steps.multi` (2+ steps only).
      Verified live end-to-end with a real Anthropic call: all ~8 steps for
      a real profile (RailTest GmbH) correctly show done/current/upcoming
      states, "Committee markup" ticks a live per-second timer, no
      horizontal overflow at 700/1400px. Removed as dead code in the
      process: the old `.stepper`/`.stepper-head`/`.stepper-name`/
      `.brief-width` CSS and the `.stage-list`/`.stage-dot`/`stage-pulse`
      keyframes it used.

## Milestone 4 — Website

- ✅ HTTP API (`etl/api.py`, FastAPI): stats, meta, documents, search, brief
- ✅ `regina serve` command
- ✅ Next.js app in `website/` (App Router, TS) — builds clean, serves 200
- ✅ Company profile intake → briefing UI (sources when no key; cited when key)
- ✅ "What's moving" dashboard grouped by lifecycle stage + document detail view
- ✅ Scoping step regrouped into a paginated wizard + vertical answer rows
      (2026-07-07): the single scoping screen could show up to 9 questions at
      once with horizontal chip-cloud answers — friction flagged directly by
      the user. Regrouped into business/users_data/ai/context/more sections
      (one screen per group, with its own sub-progress indicator), switched
      choice/multi answers to a vertical stacked-row layout, and trimmed the
      competitive-context question from a ~100-word single ask down to one
      sentence with the examples moved into the textarea placeholder.
- ✅ Live stage-progress panel during report generation (2026-07-07):
      `/api/brief` now streams newline-delimited JSON — a status event each
      time `generate_briefing`'s `on_stage` callback fires for a real unit of
      work (retrieval, draft, revise, and the conditional citation/canon
      recovery passes), then a final result event — instead of one JSON body
      returned after a silent 1-3+ minute wait. The brief page shows an
      elapsed-time counter and the live stage list in place of a static
      button label. Verified live in-browser: stages append progressively as
      each real LLM call starts, no console errors.
- ⬜ Briefing as a conversational/chat UI (currently single-shot)
- ⬜ Render inline citation markers within the briefing text (not just a list)
- ✅ Deploy (API + site) — closed 2026-07-13, but the item was stale in both
      directions: the stack had ALREADY been deployed (Railway Postgres
      `pgvector` + Railway API service `EuroPolTracker` (renamed `Regina` in
      the 2026-07-17 rebrand), git-connected
      auto-deploy; Vercel site `euro-pol-tracker` (now `regina`)) without this line being
      checked off, AND the site had been silently broken since its first
      deploy — `NEXT_PUBLIC_API_URL` existed in Vercel's production env but
      was EMPTY, so `lib/api.ts` fell back to `http://127.0.0.1:8000` and
      every data-driven page showed its empty-state ("Corpus is empty")
      while the static marketing pages rendered fine, masking the failure.
      Fixed the var, redeployed (NEXT_PUBLIC_ vars are baked at build time —
      the env fix alone changes nothing), and also corrected the Railway
      service's stale `BACKFILL_DAYS=730` (same drift as the local `.env`,
      fixed earlier the same day). Verified truly end-to-end with a real
      headless-browser run against production: the live register shows the
      full corpus (2,441 documents), and the complete brief wizard — live
      `/api/meta` chips, LLM-generated scoping questions, streamed
      generation — produced a real cited report against the live DB,
      correctly applying same-day corpus additions (Machinery Directive
      transition handled per the new TRANSITIONAL APPLICABILITY rule; prod
      runs commit 413f64d with all of today's changes). Full security pass
      done the same day: no secrets in git history, `/api/refresh` 403s
      without the secret, CORS scoped to the Vercel origin, rate limits on
      both LLM endpoints; `website/.gitignore` (excludes `.vercel`/`.env*`)
      turned out to never have been committed — added. Secret rotation
      (ANTHROPIC_API_KEY / DB password / REFRESH_SECRET were printed into a
      session by `railway variables`) deliberately deferred by the user to
      the onboarding milestone. Runbook now exists: DEPLOYMENT.md at repo
      root — wiring, env vars with their gotchas, redeploy commands, and
      what deliberately does NOT run in the deployed container
      (ep_verbatim's headless browser, heavy embedding)
- ✅ Bottom line → bullets (2026-07-13), direct user feedback that the top
      section needs to work for a VC/investor/founder reader's attention span:
      `SYSTEM_PROMPT`'s Bottom line instruction changed from "one dense
      paragraph (5-12 lines)" to "4-6 bullets, each one line, no sub-bullets,"
      told to lead every bullet with the verdict/number rather than a lead-in
      clause. No downstream code changes needed — both the PDF renderer
      (`_flush_table`-adjacent line handling in `pdf.py`) and the website's
      `ReportMarkdown` (`Report.tsx`) already handle `- `/`* ` bullet lines
      generically, and the word-budget line already excludes bullet lists
      from the 700-1000 word count (same treatment as Coalitions/Watchlist).
      `test_pdf.py`/`test_briefing.py` don't assert on Bottom line's internal
      structure — all 45 tests still pass unchanged.
- ✅ Dev-facing content audit (2026-07-13), per direct user request to check
      the public site for anything that belongs in this backlog instead.
      Found three CLI-leak error/empty-states written for a developer running
      locally, not a real visitor: `documents/page.tsx`'s fetch-failure and
      empty-corpus messages named `uv run regina serve` / `regina refresh` / `regina
      embed` directly, and `brief/page.tsx`'s fetch-failure message did the
      same. Replaced all three with plain user-facing copy ("temporarily
      unavailable — try again shortly" / "No documents to show right now").
      Separately, removed the About page's `PLANNED_SOURCES` "Next" roadmap
      entries (Légifrance PISTE/DILA key, Bundestag DIP procedure adapter) —
      internal blocker detail (which API key is missing, whether an adapter
      is built yet) has no business being advertised to a company evaluating
      the product, and both facts were already tracked here (Jurisdiction
      depth section above). Deleted `PlannedSource`/`PLANNED_SOURCES` from
      `lib/sourceCategories.ts` as dead code rather than leaving it unused.
- ✅ About/Live-register IA rework (2026-07-13), direct user feedback on two
      fronts: (1) the About page's "How it's built" 2x2 read as an engineering
      changelog, not a pitch to a compliance/PA buyer — rewrote all four
      principles from implementation detail ("single-trigger collection",
      "hashed and versioned", "polled politely, rate-limited, retried with
      backoff") to plain benefit statements ("Nothing goes stale", "Every
      claim is sourced", "Changes are tracked, not hidden", "One bad source
      can't break the rest"). (2) The About page's "Coverage" section (per-
      category live counts, jurisdiction badges, source list) was flagged as
      misplaced — genuinely useful for intelligibility, but about the corpus,
      not the company pitch — and the Live register's own filtering was
      needlessly split across two parallel, drifting taxonomies: a 4-value
      `SourceCategory` (`lib/sourceCategories.ts`, law/regulator/press/
      consultation, used by About) and a separate ad-hoc 2-value `LAYERS`
      constant local to `documents/page.tsx` (law-vs-monitor by
      `document_type`). Moved Coverage from About into the register page
      wholesale and made its category cards the actual category filter
      (`category` state + `categoryFor()`, replacing `LAYERS`/`LAW_TYPES`
      entirely) — clicking a card both narrows the list below and shows the
      same live-count/jurisdiction/source-list detail that used to live on
      About. About now ends at the "How it's built" grid before "Why this
      exists"; no longer fetches `getSources()` at all. Verified live:
      `tsc --noEmit` and `next build` both clean, and in-browser — clicking
      "Law & legislative pipeline" narrows 200→29 documents and highlights
      the active card, "Clear category filter" resets it, no horizontal
      overflow at 1400px.
- ✅ Live register filters simplified (2026-07-14), direct user feedback: (1)
      the Consultations coverage tile was noise — hidden from the Coverage
      grid (its one source, `have_your_say`, stays in the register list and
      in `categoryFor`'s classification, just not called out as its own
      card). (2) The "Showing (200 of latest 200, 2441 total)" line was
      confusing — it exposed `FETCH_LIMIT`, an internal client-side fetch-
      window cap, as if it were meaningful to a visitor. Deleted it
      entirely, along with the `getStats()` call and `totalDocs` state that
      only existed to feed it — the per-stage headers below ("Proposed (2)",
      "In force (1)") already show real counts. Presented the user three
      revamp options with ASCII previews (delete only the count line; show a
      plain count only when filtered; fold a total into the hero intro) —
      user asked to simplify the whole filters block instead, so merged
      search + Market chips into one row with no heading, dropped the
      "MARKET" text label (kept as an `aria-label` for accessibility), and
      moved "Clear category filter" from separate button text onto a small
      × directly on the active Coverage card (`.card-clear`, absolutely
      positioned, `.card.on h3` gets right-padding so long labels don't run
      under it). Removed now-dead `.filter-group`/`.filter-label` CSS.
      Verified live: 3 Coverage cards (no Consultations), one-line search +
      chips row, no count text anywhere, clicking a card still narrows the
      register and shows a × on the active card to clear it.
- ✅ Register search fixed + stage grouping dropped for "Hot right now"
      (2026-07-14), direct user feedback that search "is still ass" and the
      Proposed/In force/Other stage grouping at the bottom is pointless when
      a group has 1-2 items. Found a real, separate bug while investigating:
      the search box only ever filtered the client's already-fetched newest-
      200-document window (`docs.filter(title.includes(q))`), so searching
      for anything older than that window silently returned nothing — not a
      styling complaint, a correctness bug on a page whose whole job is
      being the ground truth. Fixed by making search hit `/api/documents`'s
      real `q` (title ILIKE) + `jurisdiction` params server-side instead,
      debounced 300ms, across the full corpus. Verified live: searching
      "Machinery" now correctly surfaces the 2023 Machinery Regulation AND
      the 2006 Machinery Directive, neither of which is anywhere near the
      newest-200 window. Separately, replaced the whole
      Proposed/In force/Other `STAGE_ORDER`-grouped listing with one flat,
      date-sorted list (stage still shown per-row via the existing inline
      badge, just no more group headers/per-group show-more) and added a new
      "Hot right now" section: 6 curated topics (AI Act, GDPR & data
      protection, Minors & social media age limits, DSA enforcement, DMA &
      gatekeepers, Digital Omnibus), each with a live-fetched doc count
      (never hardcoded, per website/CLAUDE.md's no-hardcoded-corpus-numbers
      rule) and click-through to its real matching documents. The six were
      not guessed — ran a real frequency pass (`data.session_scope` direct
      DB query) over the last 60 days of titles across ~20 candidate
      instrument/topic keyword groups before picking: AI Act (36 recent
      mentions), GDPR/data protection (23), and the minors/social-media
      fight (18) were the clear top three by volume; a generic
      "cybersecurity" bucket scored high (20) but turned out mostly
      unrelated G7-summit security logistics on inspection, so it was left
      out in favor of DSA/DMA/Digital Omnibus — lower raw counts but clean,
      zero-false-positive signal and genuinely major live news (Apple's DMA
      gatekeeper-status court loss, Meta's DSA addictive-design finding).
      Each topic's keyword variants (e.g. GDPR/RGPD/Datenschutz for the
      multilingual data-protection bucket) are fetched in parallel and
      deduped by document id once on page load, so the tile count and its
      click-through result list are always the same underlying data — no
      separate "trending" computation that could drift from what clicking
      the tile actually shows. `tsc --noEmit` and `next build` both clean;
      verified live clicking "Digital Omnibus" correctly returns all 17 real
      matches (the actual COM(2025) 836/837 proposals, EP vote records, law-
      firm client alerts, press coverage), sorted newest first.

## Automation / ops

- ✅ Expose `refresh` as an API endpoint (POST /api/refresh, non-blocking,
      lock-guarded; GET /api/refresh for status) — augmentation is triggerable
- ✅ Auto-embed as part of `refresh` (CLI and API) — corpus is retrieval-ready
      after every trigger
- ⬜ Scheduled refresh (cron) for hands-off freshness
- ⬜ Run observability: per-source stats, failure alerts

## Jurisdiction depth (monitors live; law-text adapters pending)

- ✅ France — CNIL, ANSSI, Sénat bill feed integrated
- ✅ Germany — BfDI, Bundestag agendas, netzpolitik integrated
- ⬜ France — Légifrance adapter (needs PISTE/DILA API key)
- ⬜ Germany — Bundestag DIP procedure API for `bundestag_hib`-quality
      structured procedure data (replacing RSS-agenda filtering). No longer
      actually blocked as of 2026-07-09 — see `de_verbatim` below, which
      found the Bundestag's own official public demo key on its help page
      (no registration needed). Not yet built for this specific use;
      `de_verbatim` only uses the key for Plenarprotokoll lookup so far
