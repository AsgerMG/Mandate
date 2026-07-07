# Source map — EU / France / Germany

The channel inventory behind `ept refresh`. Three layers:

1. **Law & pipeline** — authoritative texts and live procedure state
2. **Regulators & institutions** — DPAs, sector regulators, courts, agencies
3. **News monitors** — specialist press and query-based news sweeps

Every URL below was verified live before integration (initial pass 2026-07-02;
expansion batch 2026-07-03). Adapters live in `etl/adapters/`; RSS/Atom
channels are one `FeedSpec` each in `feeds.py`. All extraction is **automated
and triggerable**: `ept refresh` (CLI) or `POST /api/refresh` (HTTP) runs
every enabled source incrementally (cursors + content hashing dedupe) and
auto-embeds, so the corpus augments itself with the newest developments on
every trigger.

73 sources are integrated as of 2026-07-03 (up from 23): 47 new `FeedSpec`
channels plus 3 bespoke `SourceAdapter`s (Assemblée Nationale, Sénat, and
Autorité de la concurrence open data). After the article-depth enrichment
pass (see Design notes below), the corpus stands at 958 documents / 1,558
passages, all embedded, averaging ~1,750 chars/passage (vs. mostly
headline-only before). See "Backlog — mapped but not yet integrated" at the
end of this file for what's still open, split by why (needs a bespoke
adapter, needs further verification, or genuinely blocked).

## Layer 1 — law & pipeline

| Key | Channel | Juris. | What it gives us |
|---|---|---|---|
| `eurlex` | EUR-Lex (SPARQL + Cellar) | EU | Regulations, directives, decisions — the law itself (recent, discovery-based) |
| `eurlex_key_acts` | EUR-Lex — curated foundational acts (full texts) | EU | GDPR, DMA, DSA, AI Act, Data Act, DGA, NIS2, CRA, DORA, MiCA, TTPA, P2B, eIDAS 2, EMFA, ePrivacy, DST proposal, Package Travel Directive (2015 + revised 2026), Consumer Rights Directive, Platform Work Directive, Empowering Consumers for the Green Transition Directive, CSRD/CSDDD Omnibus I, Digital Omnibus on AI proposal — the acts recency-based discovery can never surface. Every brief gets a guaranteed best-matching passage per act (`canon_passages()`) so Out-of-Scope verdicts are as grounded as In-Scope ones. Fixed CELEX list in `eurlex_key_acts.py`; adding an act = one line. Sibling GDPR/ePrivacy Digital Omnibus proposal (COM(2025) 837) blocked on an unresolved Cellar 300 response, same bucket as the CSAM PDF-only gap |
| `oeil` | Legislative Observatory via **EP Open Data API** | EU | Live procedure state (COD/CNS files, reading/phase) — the EU pipeline |
| `law_tracker` | **EU Law Tracker** (law-tracker.europa.eu, undocumented JSON API) | EU | Interinstitutional COD procedure timelines, filtered to EUR-Lex directory 13.20.60 (IT/telecoms/data) — tech-relevant by construction. Dense 2021+ only; complements OEIL. API reverse-engineered 2026-07-06 (POST `/search` + GET `/notice/timeline`), no auth — may change without notice |
| `have_your_say` | Better Regulation portal (brpapi) | EU | Roadmaps, calls for evidence, consultations — 6–18 months ahead |
| `senat_textes` | Sénat — derniers textes (RSS) | FR | Bills tabled in the French Senate, tech-filtered |
| `eurlex_oj_l` | EUR-Lex — Official Journal L series (RSS) | EU | All enacted EU legislation, tech-filtered — lighter-weight than SPARQL for "what's new" |
| `eurlex_com_proposals` | EUR-Lex — Commission proposals (RSS) | EU | New Commission legislative proposals, tech-filtered |
| `eurlex_ep_council_legislation` | EUR-Lex — all EP+Council legislation (RSS) | EU | Cross-topic adopted legislation, tech-filtered |
| `ep_texts_adopted` | EP — texts adopted (RSS) | EU | Plenary-adopted resolutions/legislation, tech-filtered |
| `ep_written_questions` | EP — written questions (RSS) | EU | MEP written questions to the Commission, tech-filtered |
| `bgbl1` | Bundesgesetzblatt Teil I (RSS) | DE | Official federal law gazette — enacted German statutes |
| `bundesrat_neueingaenge` | Bundesrat — Beratungsvorgänge Neueingänge (RSS) | DE | New legislative consultations entering the Bundesrat, tech-filtered |
| `bgh_presse` | Bundesgerichtshof Pressemitteilungen (RSS) | DE | Federal Court of Justice rulings, tech-filtered |
| `bverwg_presse` | Bundesverwaltungsgericht Pressemitteilungen (RSS) | DE | Federal Administrative Court rulings, tech-filtered |
| `bag_presse` | Bundesarbeitsgericht Pressemitteilungen (RSS) | DE | Federal Labour Court rulings, tech-filtered |
| `ccomptes_rapports` | Cour des comptes — rapports (RSS) | FR | Public-spending audits incl. digital admin/cyber budgets, tech-filtered |
| `an_dossiers` | Assemblée Nationale — dossiers législatifs (open data zip) | FR | The real fix for the broken AN RSS: full dossier timeline (deposits, readings, votes), tech-filtered |
| `senat_dossiers` | Sénat — dossiers législatifs (open data CSV) | FR | Richer than `senat_textes`: adds procedural stage, Conseil constitutionnel decision, promulgated law number |
| `gesetze_aktudienst` | Gesetze-im-internet.de — Aktualitätendienst (RSS) | DE | Per-statute amendment notifications (rolling ~6mo window), tech-filtered |

## Layer 2 — regulators & institutions

| Key | Channel | Juris. | What it gives us |
|---|---|---|---|
| `ec_digital` | EC Digital Strategy (DG CONNECT) | EU | AI Act / DSA / DMA / Data Act implementation |
| `ec_press` | Commission press corner (filtered) | EU | Proposals announced, infringements, enforcement |
| `ep_press` | European Parliament press (filtered) | EU | Committee votes, trilogues, plenary positions |
| `eprs_blog` | EPRS think tank (filtered) | EU | Analysis of files in the pipeline |
| `edpb_news` | EDPB news | EU | DP guidance, opinions, coordinated enforcement |
| `berec_news` | BEREC news | EU | Telecom/net-neutrality regulatory positions |
| `cnil_news` | CNIL actualités | FR | French DPA guidance and sanctions |
| `anssi_news` | ANSSI actualités | FR | French cyber requirements (NIS2 signals) |
| `arcom_news` | ARCOM actualités | FR | French media & platform regulation |
| `conseil_etat_actu` | Conseil d'État actualités (filtered) | FR | Top administrative court — tech rulings |
| `conseil_etat_avis` | Conseil d'État avis (filtered) | FR | Opinions on draft bills — pre-legislative signal |
| `bfdi_news` | BfDI Meldungen | DE | German federal DPA positions |
| `bkarta_news` | Bundeskartellamt (filtered) | DE | Competition enforcement incl. big tech |
| `bundestag_hib` | Bundestag "heute im bundestag" (filtered) | DE | Committee agendas, hearings, bill progress |
| `ecb_press` | ECB press, speeches & interviews | EU | Digital euro, DORA-adjacent supervisory signal, tech-filtered |
| `eba_news` | EBA news | EU | MiCA fine-setting, DORA resilience, tech-filtered |
| `esma_news` | ESMA news | EU | MiCA/crypto-assets, DLT pilot regime, tech-filtered |
| `arcep_presse` | ARCEP communiqués de presse | FR | Telecoms/postal regulator — net neutrality, 5G, fibre, platform interop |
| `amf_presse` | AMF communiqués de presse | FR | Crypto-asset/MiCA & fintech surveillance, tech-filtered |
| `defenseurdesdroits_actu` | Défenseur des droits actualités | FR | Algorithmic-discrimination complaints/recommendations, tech-filtered |
| `bnetza_presse` | Bundesnetzagentur Pressemitteilungen | DE | Telecom/platform regulatory decisions, tech-filtered |
| `bsi_presse` | BSI Presse und Veranstaltungen | DE | Federal cybersecurity agency positions |
| `hmbbfdi_news` | HmbBfDI (Hamburg state DPA) | DE | State-level DPA enforcement — often leads federal BfDI on Big Tech cases |
| `eu_ombudsman` | European Ombudsman — decisions and news | EU | Maladministration decisions, sometimes AI Office-adjacent, tech-filtered |
| `eiopa_news` | EIOPA news | EU | Insurtech, DORA-adjacent, tech-filtered |
| `etsi_news` | ETSI news | EU | Telecom/tech standards (CRA, RED mandates), tech-filtered |
| `bmi_presse` | BMI Pressemitteilungen | DE | Interior-ministry digital/AI announcements, tech-filtered |
| `bmwe_presse` | BMWE Pressemitteilungen (renamed from BMWK) | DE | Digital-economy policy, tech-filtered |
| `stiftung_datenschutz` | Stiftung Datenschutz — DatenschutzWoche | DE | Weekly digest: DPA actions, court decisions, tech-filtered |
| `bitkom_presse` | Bitkom Presseinformationen | DE | Digital-industry association — anticipates lobbying positions, tech-filtered |
| `adlc_decisions` | Autorité de la concurrence — décisions (open data) | FR | Merger-control & competition decisions incl. telecoms/digital sectors |

## Layer 3 — news monitors

| Key | Channel | Juris. | What it gives us |
|---|---|---|---|
| `gnews_eu_tech` | Google News query: AI Act / DSA / DMA / Data Act | EU | Cross-outlet sweep (Euractiv, Politico, Reuters… surface here despite their own feeds being bot-blocked) |
| `gnews_fr_tech` | Google News query: régulation numérique France | FR | French policy press sweep |
| `gnews_de_tech` | Google News query: Digitalgesetz / KI-Verordnung / Plattformregulierung | DE | German policy press sweep |
| `netzpolitik` | netzpolitik.org | DE | German digital-policy reporting |
| `laquadrature` | La Quadrature du Net | FR | French digital-rights monitoring |
| `eu_law_analysis` | EU Law Analysis (blog) | EU | Academic commentary on live CJEU cases |
| `verfassungsblog` | Verfassungsblog | EU | Digital-constitutionalism analysis (GDPR/DSA/AI Act), tech-filtered |
| `sifted` | Sifted | EU | EU tech/startup policy, antitrust, scale-up funds |
| `techcrunch_eu` | TechCrunch — EU tag | EU | DSA enforcement, AI Act compliance, digital sovereignty |
| `euobserver` | EUobserver | EU | Independent EU journalism, tech-filtered |
| `next_ink` | Next.ink (ex Next INpact) | FR | Digital law/security/AI coverage, tech-filtered |
| `lemonde_pixels` | Le Monde — Pixels | FR | Digital-culture desk, tech-filtered |
| `numerama` | Numerama | FR | AI/digital-rights coverage, tech-filtered |
| `01net` | 01net | FR | AI/cybersecurity/gaming coverage, tech-filtered |
| `siecledigital` | Siècle Digital | FR | Digital-economy coverage, tech-filtered |
| `heise_news` | heise online | DE | General tech press, reliably covers policy, tech-filtered |
| `golem_news` | Golem.de | DE | General tech press, tech-filtered |
| `irights_info` | iRights.info | DE | Copyright/data-protection/digital-policy commentary |
| `eu_law_live` | EU Law Live | EU | CJEU rulings, Ombudsman decisions, DSA analysis, tech-filtered |
| `contexte_articles` | Contexte — articles | EU/FR | French/EU policy-intelligence long-form, tech-filtered |
| `contexte_news` | Contexte — brèves | EU/FR | French/EU policy-intelligence short-form news, tech-filtered |
| `publicsenat` | Public Sénat | FR | Senate-adjacent broadcast/news, tech-filtered |
| `latribune` | La Tribune — actualité | FR | French business press, tech-filtered |
| `inria_news` | INRIA — actualités | FR | AI/digital research institute publications, tech-filtered |

## Still blocked (workarounds attempted 2026-07-02, re-verified 2026-07-03)

| Channel | Blocker | Workaround status |
|---|---|---|
| Council of the EU press | Akamai 403 on all paths + newsroom | Re-confirmed still 403; Council outcomes surface via `gnews_eu_tech` + EP press |
| European Council | Same consilium.europa.eu infra as Council press | Same Akamai block; no separate path found |
| EDPS press | 403 / empty responses | Re-confirmed still 403; EDPB covers the DP signal. EDPS runs a ~10/yr newsletter that may be a feed-based workaround — unconfirmed, worth a direct check |
| CJEU (curia) press | No working RSS found on re-test (`communiques/rss.htm`, `site/rss.jsp`, `feeds/rssfren.xml` all return HTML/404) | Confirmed still blocked as of 2026-07-03; rulings surface via news monitors |
| ENISA news | **Confirmed permanently discontinued**, not transiently down — ENISA's own site states RSS was dropped in a relaunch with a replacement "coming soon," no ETA | Periodic re-probing won't help; would need a different watch mechanism (e.g. sitemap diffing) if this source matters |
| Euractiv / Politico / MLex / Table.Media / Bloomberg Law direct | Cloudflare 403 / hard paywall, no RSS | **Solved via Google News monitors** for Euractiv/Politico/MLex; Bloomberg Law and Table.Media confirmed to have no public feed at any price point checked. **Correction (2026-07-03)**: Contexte *does* have public feeds (`contexte_articles`, `contexte_news`, now integrated) — the earlier "no public feed" finding was wrong, its homepage `<head>` autodiscovery revealed both |
| Assemblée nationale feeds | Feeds carry ≤1 item | Sénat feed + `gnews_fr_tech` cover FR pipeline; `data.assemblee-nationale.fr` open-data platform is the real fix (bespoke adapter, not yet built — see backlog) |
| Légifrance | Requires PISTE/DILA API key | **User action: register key** → adapter slot ready. Stopgap: third-party OSS wrapper `justicelibre` (GitHub) mirrors ~3M court decisions + LEGI/JORF/KALI |
| Judilibre (Cour de cassation case-law) | **Correction (2026-07-03)**: same PISTE gateway/account as Légifrance, not a separate no-auth API as initially believed — confirmed by a live unauthenticated call returning `HTTP 400 "Unable to find token in the message"` | **User action: register the same PISTE key** used for Légifrance also unlocks this — one registration, two adapters |
| Bundestag DIP API | Requires (free) API key; documented public key rotated out | **User action: register key** via parlamentsdokumentation@bundestag.de. Interim: community-maintained rotating key (`bundesAPI/dip-bundestag-api`, valid through 05/2026) |
| BMDV RSS | Ministry renamed/restructured | **Correction (2026-07-03)**: `bmdv.bund.de` now permanently redirects to `bmv.de` (renamed Bundesministerium für Verkehr) — no RSS replacement found; genuine absence post-restructuring, not a bot block. BMWK's equivalent issue was resolved: it's `bmwe_presse` now (see above) |
| Bundesverfassungsgericht | No RSS found | Site redesign dropped RSS in favor of an email newsletter only; genuine absence, not a block (confirmed 2026-07-03: robots.txt disallows the old service path, no autodiscovery, no working guessed URL) |
| European Court of Auditors | No RSS found | Runs on SharePoint with no public feed endpoint (native SharePoint feed routes redirect to the homepage); genuine absence, not a block |
| ACPR / Banque de France | No RSS found | Both `acpr.banque-france.fr/fr/alertes` and `banque-france.fr/fr/alertes` only offer an email-newsletter opt-in; genuine absence, not a block |
| PEReN | Nothing published | No RSS, no data.gouv.fr dataset found under its name; publishes only PDF "Éclairage sur…" notes with no machine-readable index |
| Acteurs Publics | Feed persistently empty | `/feed` and category feeds (`/numerique/feed`, `/tech/feed`) return valid RSS XML but 0 `<item>` elements on repeated checks — not viable |
| DGCCRF | Cloudflare JS challenge on every path | Genuine bot-protection wall on economie.gouv.fr, not bypassed. Their RappelConso open-data API works (`data.economie.gouv.fr`) but is a product-recall database (food/appliance safety) — not digital-policy relevant, so not integrated despite being accessible |
| BaFin | No RSS found (warning-page site structure) | Scrape-only; not attempted (would need a bespoke HTML adapter, low priority vs. feed-based sources) |
| Bavaria state DPA (BayLfD) | RSS exists but every item is dated 2017–2018 | Feed is abandoned/dead, not blocked — excluded rather than integrated |
| vie-publique.fr | RSS paths serve JS-rendered HTML | Covered via `gnews_fr_tech` |
| Conseil national du numérique (CNNum) | **Dissolved June–July 2025**, replaced by the Conseil de l'intelligence artificielle et du numérique (CIANum) at a new domain | Not a feed problem — track `conseil-ia-numerique.fr` going forward if this body is worth monitoring |

## Design notes

- **Broad vs. focused channels**: single-topic channels ingest wholesale;
  institution-wide channels pass the multilingual tech-keyword filter
  (`TECH_KEYWORDS` in `feeds.py`).
- **Deep-fetch relevance**: OEIL fetches per-procedure detail, judges the
  multilingual title, and returns `None` from `parse()` for off-topic files —
  the pipeline counts them as `skipped` and the cursor prevents re-fetching.
- **Feed items are documents**: title + summary become the passage text; the
  `url` links to the full item.
- **Article-depth enrichment (added 2026-07-03)**: most RSS summaries are a
  one-line teaser — the real body lives at the linked page. `FeedAdapter.fetch()`
  now attempts a full-article fetch when an item's summary is under 400 chars,
  extracts body text via `<article>`/`<main>`/`<p>` tags, and only keeps it if
  it's genuinely longer than the summary, at least 200 chars, and doesn't match
  a bot-wall marker (`captcha`, `verify you are human`, etc.) — so a CAPTCHA or
  paywall stub never silently overwrites a working summary. Opt out per channel
  via `FeedSpec(deep_fetch=False)`; the three `gnews_*` monitors use this since
  their `<link>` is an opaque Google redirect that doesn't resolve to a real
  article URL (confirmed by testing the base64 payload — it no longer decodes
  to a URL, so older "Google News decoder" tricks are dead). Verified live:
  Sifted items grew from ~60 chars to up to 5,872; BNetzA press releases from
  ~110 chars to up to 4,356. Genuinely paywalled sources (Contexte) and
  bot-gated ones (BMWE, most of the time) correctly fall back to the summary
  rather than storing a wall/CAPTCHA page.
- **Not yet extended to non-feed adapters**: `have_your_say` has the same
  thin-body issue (flagged in backlog.md — its search payload only carries a
  short description; the portal likely has a fuller per-initiative detail
  endpoint) but uses its own `SourceAdapter`, not `FeedAdapter`, so the feeds.py
  enrichment doesn't apply to it automatically.
- **Adding a channel** = one `FeedSpec` (verified URL!) in
  `etl/adapters/feeds.py`. Non-feed sources get a full `SourceAdapter`.

## Backlog — mapped but not yet integrated

From a broader sweep (2026-07-03) of ~113 candidate outlets across EU/FR/DE.
33 of them are now integrated above; these are the rest, grouped by why.

**Needs a bespoke `SourceAdapter` (real open-data/API, not a feed — same
pattern as `eurlex.py`/`oeil.py`/`have_your_say.py`)**

| Candidate | Jurisdiction | Why it's worth the adapter |
|---|---|---|
| QPC360 (Conseil constitutionnel) | FR | `rss.xml` returns 200 but 0 items — site's real feed mechanism is a JS-driven tree, not a static URL; needs the API/JSON layer behind it, not RSS |
| Bundestag DIP API | DE | Blocked on a key (see above) — once registered, replaces `bundestag_hib` filtering with real structured procedure data |

**Needs further verification** (a feed/API might exist; not confirmed after
two verification passes) — a much shorter list now: EU Agency for Fundamental
Rights, CEN/CENELEC, Global Competition Review, VoxEurop, ZDNet France,
franceinfo (a tech-specific feed, as opposed to their general one), Bitkom
(press RSS is now integrated as `bitkom_presse`, but no dedicated
digital-policy vertical was found), Bundeskartellamt Sektoruntersuchungen
(PDF reports only, no feed).

**Confirmed blocked or not worth pursuing** — see the "Still blocked" table
above for the institutional/regulatory blockers (Council of the EU, European
Council, EDPS, CJEU, ENISA, Bundesverfassungsgericht, European Court of
Auditors, ACPR, PEReN, Acteurs Publics, DGCCRF, BaFin, Bavaria state DPA,
vie-publique.fr, BMDV). On the press side: Table.Media, Politico
(Europe/France/Berlin Playbook), Bloomberg Law (EU/DE), IAPP (Daily Dashboard
is now email-only, no RSS), DIVSI and Netzpiloten (inactive), LCP (video-only,
no text channel), Digitalrat (wound down 2021).
**OffeneGesetze.de** (third-party BGBl mirror) was verified live and has a
genuinely open, no-auth API — but the site itself confirms it stopped
updating on 2023-01-01 ("nicht mehr aktuell"), so it's a historical-backfill
source only, not useful for ongoing monitoring; not integrated.

## Backfill window (updated 2026-07-03)

`backfill_days` was widened from 730 to 7,300 (2 → 20 years) since the bulk
open-data adapters (`an_dossiers`, `senat_dossiers`, `adlc_decisions`)
download their entire dataset on every run regardless of this setting — a
tighter window was only throwing away history they'd already paid to fetch.
Tested by resetting `senat_dossiers` and `adlc_decisions`'s cursors and
re-running: **no additional pre-2024 matches surfaced** for either, even
across Sénat's full 1973+ archive and the Autorité de la concurrence's
1988+ archive. The tech-relevance keyword filter, not the date window, is
the actual bottleneck — digital-policy content genuinely doesn't appear in
French legislative/competition history before ~2024, consistent with
AI Act/DSA/DMA-driven national implementation being a recent wave. The wider
window is still correct going forward (no cost, and it'll matter more as
`TECH_KEYWORDS` coverage improves or as older adjacent topics get added).
