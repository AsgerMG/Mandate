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
- ✅ Run `ept refresh` end-to-end on real Postgres+pgvector (embedded pgserver):
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
- ✅ `ept export` (2026-07-06): materializes the corpus into
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
      23), confirmed end-to-end via `ept refresh` + `ept embed` against the
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
      single source's unhandled failure (e.g. a DNS blip) crashed `ept refresh`
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
- ✅ Diagnosed a real quality gap while stress-testing `ept brief`: RSS
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

## Milestone 2 — Enrichment + embeddings

- ✅ Pluggable embedder; local default (BGE/fastembed, 384-dim, no API key)
- ✅ `ept embed` backfills NULL passage vectors in batches
- ✅ HNSW cosine index on `passages.embedding`
- ✅ `ept search` — semantic search returning citation-ready passages (verified
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
- ✅ `ept brief` CLI (works `--dry-run` with no API key; full run with key)
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
- ⬜ Jurisdiction/lifecycle/sector metadata filters on retrieval
- ⬜ Run a real briefing once ANTHROPIC_API_KEY is provided
- ⬜ Optional hosted embedder (Voyage) for higher retrieval quality
- ⬜ PDF-text / manifestation-choice fallback for Cellar 300/no-HTML acts —
      now has two blocked documents: CSAM proposal (52022PC0209, PDF-only)
      and the GDPR/ePrivacy Digital Omnibus proposal (52025PC0837, ambiguous
      300 on every Accept type tried)

## Milestone 4 — Website

- ✅ HTTP API (`etl/api.py`, FastAPI): stats, meta, documents, search, brief
- ✅ `ept serve` command
- ✅ Next.js app in `website/` (App Router, TS) — builds clean, serves 200
- ✅ Company profile intake → briefing UI (sources when no key; cited when key)
- ✅ "What's moving" dashboard grouped by lifecycle stage + document detail view
- ⬜ Briefing as a conversational/chat UI (currently single-shot)
- ⬜ Render inline citation markers within the briefing text (not just a list)
- ⬜ Deploy (API + site) once a shared Postgres (Neon) is chosen

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
- ⬜ Germany — Bundestag DIP procedure API (needs free key); Bundesgesetzblatt scraper
