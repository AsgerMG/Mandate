"""Generic RSS/Atom feed adapter + the curated registry of policy monitors.

The monitoring layer of the corpus: regulator announcements, DPA guidance,
parliamentary agendas, legislative pipelines and specialist press for the EU,
France and Germany. One ``FeedSpec`` per channel; every URL here was verified
live before inclusion (see project-management/source-map.md, which also lists
the channels that could NOT be integrated and why).

Feeds whose whole output is on-topic (CNIL, EDPB, netzpolitik…) ingest as-is;
broad institutional feeds (EP press, Bundestag agendas, Sénat bills…) are
filtered against a multilingual tech-policy vocabulary so the corpus stays
focused.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from email.utils import parsedate_to_datetime

import structlog
from bs4 import BeautifulSoup
from lxml import etree

from data.models import DocumentType, Jurisdiction, LifecycleStage

from .base import DocRef, ParsedDocument, RawDocument, SourceAdapter, is_noise_collision

log = structlog.get_logger(__name__)

# Multilingual (EN/FR/DE) tech-policy vocabulary for filtering broad feeds.
TECH_KEYWORDS = [
    # EN
    "artificial intelligence", " ai ", "digital", "data protection", "privacy",
    "cyber", "platform", "online", "internet", "telecom", "algorithm", "cloud",
    "crypto", "software", "surveillance", "biometric", "chip", "semiconductor",
    "dsa", "dma", "gdpr", "nis2", "e-evidence", "data act", "ai act",
    # EU tech/scale-up economy vocabulary — added 2026-07-09 for verbatim-
    # transcript title matching (e.g. "The 28th Regime: a new legal
    # framework for innovative companies" names no other tech keyword).
    "innovative compan", "start-up", "startup", "scale-up",
    # Recall gaps found via a full audit of every EP verbatim item title,
    # kept and dropped, across a 2-year window (2026-07-09) — each verified
    # to hit exactly once across 2,445 dropped titles, no collisions. Bare
    # "media freedom" was tried and rejected: it also matches an unrelated
    # Georgia press-freedom debate and a journalist-memorial debate; the
    # specific instrument name avoids both.
    "media freedom act", "communication infrastructure", "tech race",
    # FR
    "intelligence artificielle", "numérique", "données", "cybersécurité",
    "plateforme", "en ligne", "télécom", "algorithme", "biométri",
    "rgpd", "informatique",
    # Recall gaps found via the same full-audit method applied to
    # an_verbatim (2026-07-09): "TikTok" (a coined brand name, not a
    # dictionary word — low collision risk, unlike "Google"/"Amazon"/
    # "Apple", which were considered and rejected for exactly that reason)
    # and "réseaux sociaux" (social networks), neither caught by
    # "plateforme"/"en ligne". Each verified to hit exactly once across
    # 928 dropped AN titles.
    "tiktok", "réseaux sociaux",
    # DE
    "künstliche intelligenz", " ki ", "digitale", "datenschutz", "daten",
    "cybersicherheit", "plattform", "telekommunikation", "algorithmus",
    "biometrie", "dsgvo", "software",
    # "netz" (bare) removed 2026-07-09 — found live via de_verbatim: German
    # freely compounds nouns, so "netz" (network) matches "Gasnetzentgelten"
    # (gas-network fees) and "BNetzA" just as readily as anything digital.
    # Same class of bug as " ai "/"chip"/"daten" colliding in EP/AN speech
    # text — except this one was in the ORIGINAL keyword list, exposed only
    # once a source's titles got long/technical enough to collide (likely
    # already a silent false-positive source in bundesrat_neueingaenge/
    # bundestag_hib/gesetze_aktudienst too, which share this filter — not
    # yet re-audited). Replaced with specific, collision-safe compounds.
    "netzneutralität", "mobilfunknetz", "telekommunikationsnetz",
    "breitbandnetz", "glasfasernetz", "soziale netzwerke",
    # "netzabdeckung" (network coverage) added same day: catches a genuine
    # telecom-connectivity motion ("Mobilfunklücken schließen – Nationale
    # Netzabdeckung") that the compound replacements above missed. Verified
    # against both confirmed "netz" false positives above — no collision.
    "netzabdeckung",
    # Recall gap found 2026-07-20: the Machinery Regulation (32023R1230) is a
    # canon act (KEY_ACTS) — AI-embedded machinery falls under its Annex I
    # high-risk overlap with the AI Act — but "machinery" never appeared in
    # this list, so broad-feed coverage of it was silently dropped unless an
    # article also happened to mention an existing keyword. Zero press
    # coverage existed in the corpus for an instrument with 73+ AI Act
    # articles, which is what surfaced the gap.
    "machinery regulation", "machinery directive",
    # Same day, same method, applied systematically: ran every KEY_ACTS
    # canon act's short name through is_tech_relevant() and added a keyword
    # for each miss whose act is genuinely tech-policy scoped. Unlike the
    # entries above, these were not verified against 2 years of live
    # dropped-title data — they're reasoned from term distinctiveness, not
    # empirically confirmed collision-free, and worth spot-checking once
    # more feed volume runs through them.
    "data governance act", "mica",  # "mica" collides with the mineral;
    # accepted given these feeds are already policy-scoped, not open web
    "political advertising", "critical infrastructure", "critical entities",
    "product liability", "accessibility act", "web accessibility",
    "electronic communications code", "health data space",
    "gigabit infrastructure", "interoperable europe", "geo-blocking",
    "geoblocking", "open data directive",
    # Deliberately NOT added a keyword for: DORA (bare "dora" collides
    # heavily with the name/cartoon — relies on "digital" catching
    # spelled-out "Digital Operational Resilience Act" mentions instead,
    # accepted residual gap for acronym-only headlines); Copyright DSM
    # Directive (bare "copyright" is too generic/collision-prone for a
    # broad-institutional-feed filter — same reasoning as rejecting bare
    # "netz"); Package Travel Directive (x2), Consumer Rights Directive,
    # ECGT, CSRD/CSDDD, Industrial Accelerator Act, GPSR, European Business
    # Wallet — these are canon for their EU-tech-adjacent hinges (e.g.
    # ECGT's "comparison tool" activity hinge) but are fundamentally
    # consumer/sustainability law, not tech-policy news topics; forcing a
    # keyword for each would broaden this filter past the "keep the corpus
    # focused" purpose stated at the top of this file.
]


def is_tech_relevant(text: str) -> bool:
    if is_noise_collision(text):
        return False
    lowered = f" {text.lower()} "
    return any(kw in lowered for kw in TECH_KEYWORDS)


@dataclass(frozen=True, slots=True)
class FeedSpec:
    """One monitored channel. ``filter_tech`` gates broad feeds through the
    tech vocabulary; single-topic channels ingest everything."""

    key: str
    name: str
    url: str
    jurisdiction: Jurisdiction
    document_type: DocumentType = DocumentType.PRESS
    lifecycle_stage: LifecycleStage = LifecycleStage.UNKNOWN
    language: str = "en"
    filter_tech: bool = False
    # Some servers (eulawlive.com) attach the real feed body to a 3xx response
    # and only serve the HTML homepage once a client follows the redirect.
    follow_redirects: bool = True
    # Whether to attempt fetching the full article when the RSS summary is
    # thin. Off for Google News specs: their <link> is an opaque redirect
    # through a Google consent page, not a resolvable article URL (confirmed
    # 2026-07-03 — the article id no longer base64-decodes to a real URL),
    # so every attempt would just waste a request on a cookie-consent page.
    deep_fetch: bool = True


FEED_SPECS: list[FeedSpec] = [
    # --- EU: institutions & regulators ---------------------------------------
    FeedSpec(
        key="ec_digital",
        name="EC Digital Strategy news (DG CONNECT)",
        url="https://digital-strategy.ec.europa.eu/en/rss.xml",
        jurisdiction=Jurisdiction.EU,
    ),
    FeedSpec(
        key="eprs_blog",
        name="EPRS — European Parliamentary Research Service",
        url="https://epthinktank.eu/feed/",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        filter_tech=True,
    ),
    FeedSpec(
        key="berec_news",
        name="BEREC news (EU telecom regulators)",
        url="https://www.berec.europa.eu/en/rss.xml",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.GUIDELINE,
    ),
    # Google News query feeds: the workaround for bot-blocked/paywalled outlets
    # (Euractiv, Politico, MLex…) — their coverage surfaces through the query.
    FeedSpec(
        key="gnews_eu_tech",
        name="News monitor — EU tech regulation (Google News)",
        url=(
            "https://news.google.com/rss/search?q=%22AI+Act%22+OR+%22Digital+Services+Act%22"
            "+OR+%22Digital+Markets+Act%22+OR+%22Data+Act%22+EU+regulation&hl=en&gl=BE&ceid=BE:en"
        ),
        jurisdiction=Jurisdiction.EU,
        deep_fetch=False,
    ),
    FeedSpec(
        key="ec_press",
        name="Commission press corner",
        url="https://ec.europa.eu/commission/presscorner/api/rss?language=en",
        jurisdiction=Jurisdiction.EU,
        filter_tech=True,
    ),
    FeedSpec(
        key="ep_press",
        name="European Parliament press releases",
        url="https://www.europarl.europa.eu/rss/doc/press-releases/en.xml",
        jurisdiction=Jurisdiction.EU,
        filter_tech=True,
    ),
    FeedSpec(
        key="edpb_news",
        name="EDPB news (data protection board)",
        url="https://www.edpb.europa.eu/feed/news_en",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.GUIDELINE,
    ),
    # --- EU: additional channels (verified live 2026-07-03) -------------------
    FeedSpec(
        key="eurlex_oj_l",
        name="EUR-Lex — Official Journal L series (legislation)",
        url="https://eur-lex.europa.eu/EN/display-feed.rss?rssId=222",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        filter_tech=True,
    ),
    FeedSpec(
        key="eurlex_com_proposals",
        name="EUR-Lex — Commission proposals and related documents",
        url="https://eur-lex.europa.eu/EN/display-feed.rss?rssId=161",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.PROPOSAL,
        lifecycle_stage=LifecycleStage.PROPOSED,
        filter_tech=True,
    ),
    FeedSpec(
        key="eurlex_ep_council_legislation",
        name="EUR-Lex — all Parliament and Council legislation",
        url="https://eur-lex.europa.eu/EN/display-feed.rss?rssId=162",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        filter_tech=True,
    ),
    FeedSpec(
        key="ep_texts_adopted",
        name="European Parliament — texts adopted",
        url="https://www.europarl.europa.eu/rss/doc/texts-adopted/en.xml",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        filter_tech=True,
    ),
    FeedSpec(
        key="ep_written_questions",
        name="European Parliament — written questions",
        url="https://www.europarl.europa.eu/rss/doc/written-questions/en.xml",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        filter_tech=True,
    ),
    FeedSpec(
        key="ecb_press",
        name="ECB — press, speeches and interviews",
        url="https://www.ecb.europa.eu/rss/press.html",
        jurisdiction=Jurisdiction.EU,
        filter_tech=True,
    ),
    FeedSpec(
        key="eba_news",
        name="EBA — European Banking Authority news",
        url="https://www.eba.europa.eu/rss.xml",
        jurisdiction=Jurisdiction.EU,
        filter_tech=True,
    ),
    FeedSpec(
        key="esma_news",
        name="ESMA — European Securities and Markets Authority news",
        url="https://www.esma.europa.eu/rss.xml",
        jurisdiction=Jurisdiction.EU,
        filter_tech=True,
    ),
    FeedSpec(
        key="eu_law_analysis",
        name="EU Law Analysis (Steve Peers — CJEU/EU law commentary)",
        url="https://eulawanalysis.blogspot.com/feeds/posts/default",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
    ),
    FeedSpec(
        key="verfassungsblog",
        name="Verfassungsblog (EU digital-constitutionalism analysis)",
        url="https://verfassungsblog.de/feed/",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        filter_tech=True,
    ),
    FeedSpec(
        key="sifted",
        name="Sifted (EU tech/startup policy)",
        url="https://sifted.eu/feed",
        jurisdiction=Jurisdiction.EU,
    ),
    FeedSpec(
        key="techcrunch_eu",
        name="TechCrunch — European Union tag",
        url="https://techcrunch.com/tag/european-union/feed/",
        jurisdiction=Jurisdiction.EU,
    ),
    FeedSpec(
        key="euobserver",
        name="EUobserver (independent EU journalism)",
        url="https://euobserver.com/feed",
        jurisdiction=Jurisdiction.EU,
        filter_tech=True,
    ),
    FeedSpec(
        key="eu_ombudsman",
        name="European Ombudsman — decisions and news",
        url="https://www.ombudsman.europa.eu/rest/rss?lang=en&max=20",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.DECISION,
        filter_tech=True,
    ),
    FeedSpec(
        key="eiopa_news",
        name="EIOPA — European Insurance and Occupational Pensions Authority",
        url="https://www.eiopa.europa.eu/node/4816/rss_en",
        jurisdiction=Jurisdiction.EU,
        filter_tech=True,
    ),
    FeedSpec(
        key="etsi_news",
        name="ETSI — telecom/tech standards news",
        url="https://www.etsi.org/feed/",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        filter_tech=True,
    ),
    FeedSpec(
        key="eu_law_live",
        name="EU Law Live (EU legal analysis, incl. CJEU case law)",
        url="https://eulawlive.com/feed/",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        filter_tech=True,
        follow_redirects=False,
    ),
    FeedSpec(
        key="contexte_articles",
        name="Contexte — articles (French/EU policy intelligence)",
        url="https://www.contexte.com/articles/rss",
        jurisdiction=Jurisdiction.EU,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="contexte_news",
        name="Contexte — brèves (short-form policy news)",
        url="https://www.contexte.com/news/rss",
        jurisdiction=Jurisdiction.EU,
        language="fr",
        filter_tech=True,
    ),
    # --- EU: political-currency sources (verified live 2026-07-22) ------------
    FeedSpec(
        key="techpolicy_press",
        name="Tech Policy Press",
        url="https://www.techpolicy.press/rss/feed.xml",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
    ),
    FeedSpec(
        key="dg_comp_news",
        name="DG COMP news (EU competition authority)",
        url="https://ec.europa.eu/newsroom/comp/feed?item_type_id=1066&lang=en&orderby=item_date",
        jurisdiction=Jurisdiction.EU,
    ),
    FeedSpec(
        key="dg_grow_news",
        name="DG GROW news (Internal Market, Industry, Entrepreneurship and SMEs)",
        # Confirmed live via the site's own News page — the plan's original
        # node/2046 guess 404s; node/2 is the current News feed.
        url="https://single-market-economy.ec.europa.eu/node/2/rss_en",
        jurisdiction=Jurisdiction.EU,
    ),
    FeedSpec(
        key="politico_eu",
        name="Politico Europe",
        url="https://www.politico.eu/feed/",
        jurisdiction=Jurisdiction.EU,
        filter_tech=True,
    ),
    # --- France ---------------------------------------------------------------
    FeedSpec(
        key="cnil_news",
        name="CNIL actualités (French DPA)",
        url="https://www.cnil.fr/fr/rss.xml",
        jurisdiction=Jurisdiction.FR,
        document_type=DocumentType.GUIDELINE,
        language="fr",
    ),
    FeedSpec(
        key="anssi_news",
        name="ANSSI actualités (French cyber agency)",
        url="https://cyber.gouv.fr/actualites/rss/",
        jurisdiction=Jurisdiction.FR,
        language="fr",
    ),
    FeedSpec(
        key="senat_textes",
        name="Sénat — derniers textes législatifs",
        url="https://www.senat.fr/rss/textes.rss",
        jurisdiction=Jurisdiction.FR,
        document_type=DocumentType.PROPOSAL,
        lifecycle_stage=LifecycleStage.PROPOSED,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="arcom_news",
        name="ARCOM actualités (French media & digital regulator)",
        url="https://www.arcom.fr/rss.xml",
        jurisdiction=Jurisdiction.FR,
        document_type=DocumentType.GUIDELINE,
        language="fr",
    ),
    FeedSpec(
        key="conseil_etat_actu",
        name="Conseil d'État — actualités",
        url="https://www.conseil-etat.fr/rss/actualites-rss",
        jurisdiction=Jurisdiction.FR,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="conseil_etat_avis",
        name="Conseil d'État — avis sur les projets de loi",
        url="https://www.conseil-etat.fr/rss/avis-rss",
        jurisdiction=Jurisdiction.FR,
        document_type=DocumentType.OTHER,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="laquadrature",
        name="La Quadrature du Net (French digital-rights monitor)",
        url="https://www.laquadrature.net/feed/",
        jurisdiction=Jurisdiction.FR,
        language="fr",
    ),
    FeedSpec(
        key="gnews_fr_tech",
        name="News monitor — régulation numérique France (Google News)",
        url=(
            "https://news.google.com/rss/search?q=r%C3%A9gulation+num%C3%A9rique+France+loi"
            "&hl=fr&gl=FR&ceid=FR:fr"
        ),
        jurisdiction=Jurisdiction.FR,
        language="fr",
        deep_fetch=False,
    ),
    # --- France: additional channels (verified live 2026-07-03) ---------------
    FeedSpec(
        key="arcep_presse",
        name="ARCEP — communiqués de presse (telecoms/postal regulator)",
        url="https://www.arcep.fr/actualites/suivre-actualite-regulation-arcep/communiques-de-presse/rss.xml",
        jurisdiction=Jurisdiction.FR,
        language="fr",
    ),
    FeedSpec(
        key="amf_presse",
        name="AMF — communiqués de presse (financial markets authority)",
        url="https://www.amf-france.org/fr/flux-rss/display/23",
        jurisdiction=Jurisdiction.FR,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="defenseurdesdroits_actu",
        name="Défenseur des droits — actualités",
        url="https://www.defenseurdesdroits.fr/rss.xml",
        jurisdiction=Jurisdiction.FR,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="ccomptes_rapports",
        name="Cour des comptes — rapports et publications",
        url="https://www.ccomptes.fr/fr/rss/general",
        jurisdiction=Jurisdiction.FR,
        document_type=DocumentType.OTHER,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="next_ink",
        name="Next.ink (ex Next INpact — French tech/digital-law press)",
        url="https://next.ink/feed/",
        jurisdiction=Jurisdiction.FR,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="lemonde_pixels",
        name="Le Monde — Pixels (digital culture & policy)",
        url="https://www.lemonde.fr/pixels/rss_full.xml",
        jurisdiction=Jurisdiction.FR,
        language="fr",
        filter_tech=True,
    ),
    # --- France: political-currency sources (verified live 2026-07-22) --------
    FeedSpec(
        key="lemonde_politique",
        name="Le Monde — Politique",
        url="https://www.lemonde.fr/politique/rss_full.xml",
        jurisdiction=Jurisdiction.FR,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="lemonde_europe",
        name="Le Monde — International/Europe",
        url="https://www.lemonde.fr/europe/rss_full.xml",
        jurisdiction=Jurisdiction.FR,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="numerama",
        name="Numerama (French tech/AI/digital-rights press)",
        url="https://www.numerama.com/feed/",
        jurisdiction=Jurisdiction.FR,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="01net",
        name="01net (French tech press)",
        url="https://www.01net.com/feed/",
        jurisdiction=Jurisdiction.FR,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="siecledigital",
        name="Siècle Digital (French digital-economy press)",
        url="https://siecledigital.fr/feed/",
        jurisdiction=Jurisdiction.FR,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="publicsenat",
        name="Public Sénat (Senate-adjacent broadcast/news)",
        url="https://www.publicsenat.fr/rss",
        jurisdiction=Jurisdiction.FR,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="latribune",
        name="La Tribune — actualité (French business press)",
        url="https://www.latribune.fr/rss/rubriques/actualite.html",
        jurisdiction=Jurisdiction.FR,
        language="fr",
        filter_tech=True,
    ),
    FeedSpec(
        key="inria_news",
        name="INRIA — actualités (AI/digital research institute)",
        url="https://www.inria.fr/fr/news_events/rss.xml",
        jurisdiction=Jurisdiction.FR,
        document_type=DocumentType.OTHER,
        language="fr",
        filter_tech=True,
    ),
    # --- Germany ----------------------------------------------------------------
    FeedSpec(
        key="bfdi_news",
        name="BfDI Meldungen (German DPA)",
        url="https://www.bfdi.bund.de/SiteGlobals/Functions/RSSFeed/Allgemein/rssnewsfeed.xml",
        jurisdiction=Jurisdiction.DE,
        document_type=DocumentType.GUIDELINE,
        language="de",
    ),
    FeedSpec(
        key="bundestag_hib",
        name="Bundestag — heute im bundestag (committee agendas)",
        url="https://www.bundestag.de/static/appdata/includes/rss/hib.rss",
        jurisdiction=Jurisdiction.DE,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="netzpolitik",
        name="netzpolitik.org (German digital-policy press)",
        url="https://netzpolitik.org/feed/",
        jurisdiction=Jurisdiction.DE,
        language="de",
    ),
    FeedSpec(
        key="bkarta_news",
        name="Bundeskartellamt Meldungen (German competition authority)",
        url="https://www.bundeskartellamt.de/DE/Service/RSS/_documents/rssnewsfeed.xml",
        jurisdiction=Jurisdiction.DE,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="gnews_de_tech",
        name="News monitor — Digitalregulierung Deutschland (Google News)",
        url=(
            "https://news.google.com/rss/search?q=Digitalgesetz+OR+KI-Verordnung"
            "+OR+Plattformregulierung+Deutschland&hl=de&gl=DE&ceid=DE:de"
        ),
        jurisdiction=Jurisdiction.DE,
        language="de",
        deep_fetch=False,
    ),
    # --- Germany: additional channels (verified live 2026-07-03) --------------
    FeedSpec(
        key="bgbl1",
        name="Bundesgesetzblatt Teil I (official federal law gazette)",
        url="https://www.recht.bund.de/rss/feeds/rss_bgbl-1.xml?nn=211452",
        jurisdiction=Jurisdiction.DE,
        document_type=DocumentType.OTHER,
        language="de",
    ),
    FeedSpec(
        key="bundesrat_neueingaenge",
        name="Bundesrat — Beratungsvorgänge (Neueingänge)",
        url="https://www.bundesrat.de/SiteGlobals/Functions/RSSFeed/RSSGenerator_Announcement.xml",
        jurisdiction=Jurisdiction.DE,
        document_type=DocumentType.PROPOSAL,
        lifecycle_stage=LifecycleStage.PROPOSED,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="bgh_presse",
        name="Bundesgerichtshof — Pressemitteilungen",
        url="https://www.bundesgerichtshof.de/DE/Service/RSSFeed/Function/RSS_PM.xml?nn=373238",
        jurisdiction=Jurisdiction.DE,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="bverwg_presse",
        name="Bundesverwaltungsgericht — Pressemitteilungen",
        url="https://www.bverwg.de/rss/pressemitteilungen.rss",
        jurisdiction=Jurisdiction.DE,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="bag_presse",
        name="Bundesarbeitsgericht — Pressemitteilungen",
        url="https://www.bundesarbeitsgericht.de/feed/presse/neueste",
        jurisdiction=Jurisdiction.DE,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="bnetza_presse",
        name="Bundesnetzagentur — Pressemitteilungen",
        url=(
            "https://www.bundesnetzagentur.de/SiteGlobals/Functions/RSSFeed/DE/"
            "RSSNewsfeed/RSSNewsfeed_Pressemitteilungen.xml?nn=693926"
        ),
        jurisdiction=Jurisdiction.DE,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="bsi_presse",
        name="BSI — Presse und Veranstaltungen (federal cyber agency)",
        url="https://www.bsi.bund.de/SiteGlobals/Functions/RSSFeed/RSSNewsfeed/RSSNewsfeed_Presse_Veranstaltungen.xml",
        jurisdiction=Jurisdiction.DE,
        language="de",
    ),
    FeedSpec(
        key="hmbbfdi_news",
        name="HmbBfDI — Hamburg state data protection authority",
        url="https://datenschutz-hamburg.de/rss",
        jurisdiction=Jurisdiction.DE,
        document_type=DocumentType.GUIDELINE,
        language="de",
    ),
    FeedSpec(
        key="heise_news",
        name="heise online (German tech press)",
        url="https://www.heise.de/rss/heise-atom.xml",
        jurisdiction=Jurisdiction.DE,
        document_type=DocumentType.OTHER,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="golem_news",
        name="Golem.de (German tech press)",
        url="https://rss.golem.de/rss.php?feed=RSS2.0",
        jurisdiction=Jurisdiction.DE,
        document_type=DocumentType.OTHER,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="irights_info",
        name="iRights.info (German digital-policy/copyright press)",
        url="https://irights.info/feed",
        jurisdiction=Jurisdiction.DE,
        document_type=DocumentType.OTHER,
        language="de",
    ),
    FeedSpec(
        key="gesetze_aktudienst",
        name="Gesetze-im-internet.de — Aktualitätendienst (consolidated statute updates)",
        url="https://www.gesetze-im-internet.de/aktuDienst-rss-feed.xml",
        jurisdiction=Jurisdiction.DE,
        document_type=DocumentType.OTHER,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="bmi_presse",
        name="BMI — Bundesministerium des Innern Pressemitteilungen",
        url="https://www.bmi.bund.de/DE/service/rss-newsfeed/function/rssnewsfeed-pressemitteilungen.xml",
        jurisdiction=Jurisdiction.DE,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="bmwe_presse",
        name="BMWE — Bundeswirtschaftsministerium Pressemitteilungen (renamed from BMWK)",
        url="https://www.bundeswirtschaftsministerium.de/SiteGlobals/BMWI/Functions/RSSFeed/DE/RSSFeed-Pressemitteilung.xml",
        jurisdiction=Jurisdiction.DE,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="stiftung_datenschutz",
        name="Stiftung Datenschutz — DatenschutzWoche digest",
        url="https://stiftungdatenschutz.org/startseite/datenschutzwoche.xml",
        jurisdiction=Jurisdiction.DE,
        document_type=DocumentType.OTHER,
        language="de",
        filter_tech=True,
    ),
    FeedSpec(
        key="bitkom_presse",
        name="Bitkom — Presseinformationen (digital-industry association)",
        url="https://www.bitkom.org/Presse/Presseinformation/index.xml",
        jurisdiction=Jurisdiction.DE,
        document_type=DocumentType.OTHER,
        language="de",
        filter_tech=True,
    ),
    # --- Germany: political-currency sources (verified live 2026-07-22) -------
    FeedSpec(
        key="handelsblatt_politik",
        name="Handelsblatt — Politik",
        url="https://www.handelsblatt.com/contentexport/feed/politik",
        jurisdiction=Jurisdiction.DE,
        document_type=DocumentType.OTHER,
        language="de",
        filter_tech=True,
    ),
]


def _text(el, *tags: str) -> str | None:
    """First non-empty text among child tags, namespace-agnostic."""
    if el is None:
        return None
    for child in el.iter():
        tag = etree.QName(child).localname if isinstance(child.tag, str) else ""
        if tag in tags:
            content = (child.text or "").strip()
            if content:
                return content
            href = child.get("href")
            if href:
                return href
    return None


def parse_feed(content: bytes) -> list[dict]:
    """RSS 2.0 / RDF / Atom → [{id, url, title, summary, date}]. lxml reads the
    XML prolog, so declared encodings (e.g. Sénat's iso-8859-15) just work."""
    root = etree.fromstring(content, parser=etree.XMLParser(recover=True))
    if root is None:
        return []
    items = []
    for el in root.iter():
        tag = etree.QName(el).localname if isinstance(el.tag, str) else ""
        if tag not in ("item", "entry"):
            continue
        title = _text(el, "title")
        url = _text(el, "link", "guid")
        guid = _text(el, "guid", "id") or url
        # Strip markup immediately: URLs inside href="..." must never reach the
        # relevance filter (the EP feed's boilerplate links to /privacy-policy).
        summary = _strip_html(_text(el, "description", "summary", "content") or "")
        date = _parse_date(_text(el, "pubDate", "published", "updated", "date"))
        if guid and title:
            # Google News guids exceed the external_id column (255); hash long
            # ids to a stable digest, keeping the readable form when it fits.
            if len(guid) > 200:
                guid = "sha256:" + hashlib.sha256(guid.encode("utf-8")).hexdigest()
            items.append(
                {"id": guid, "url": url or guid, "title": title, "summary": summary, "date": date}
            )
    return items


def _parse_date(value: str | None) -> dt.date | None:
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).date()  # RFC 822 (RSS)
    except (TypeError, ValueError):
        pass
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).date()  # Atom
    except ValueError:
        return None



# Below this, an RSS summary is thin enough to be worth trying to enrich with
# the full article body (most institutional press RSS give only a one-line
# teaser; the real text lives at the linked page).
THIN_SUMMARY_CHARS = 400
# The extracted body must clear this floor to be stored at all — short of it,
# it's more likely a paywall stub or a near-empty page than real content.
MIN_ARTICLE_CHARS = 200
# Phrases that mean "this is a bot-check/paywall page", not an article — seen
# on live bot-verification challenges during source verification (2026-07-03).
_BOT_WALL_MARKERS = (
    "captcha",
    "verify you are human",
    "enable javascript",
    "checking your browser",
    "access denied",
    "attention required",
    "unusual traffic",
    "please enable cookies",
)


def _fetch_article_text(http, url: str | None) -> str | None:
    """Best-effort full-article fetch for a feed item whose RSS summary is
    thin. Returns None — never raises — on anything short of a clean win:
    no URL, network failure, non-HTML, a bot/paywall wall, or a body that
    isn't actually richer than a summary. Callers always have the feed's own
    summary to fall back on."""
    if not url or not url.startswith("http"):
        return None
    try:
        resp = http.get(url, accept="text/html,application/xhtml+xml")
    except Exception:  # noqa: BLE001 - optional enrichment, never fatal
        return None
    if "html" not in resp.headers.get("content-type", ""):
        return None
    soup = BeautifulSoup(resp.content, "lxml")
    container = soup.find("article") or soup.find("main") or soup.body
    if container is None:
        return None
    paragraphs = [p.get_text(" ", strip=True) for p in container.find_all("p")]
    text = " ".join(p for p in paragraphs if len(p) > 20)
    if len(text) < MIN_ARTICLE_CHARS:
        return None
    if any(marker in text.lower() for marker in _BOT_WALL_MARKERS):
        return None
    return text


class FeedAdapter(SourceAdapter):
    """Shared implementation; concrete per-channel classes are built from
    FEED_SPECS by ``make_feed_adapters`` below."""

    spec: FeedSpec  # set on subclasses

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        resp = self.http.get(
            self.spec.url,
            accept="application/rss+xml, application/xml, */*",
            follow_redirects=self.spec.follow_redirects,
        )
        for item in parse_feed(resp.content):
            if self.spec.filter_tech and not is_tech_relevant(
                f"{item['title']} {item['summary']}"
            ):
                continue
            if since and item["date"] and item["date"] < since:
                continue
            yield DocRef(
                external_id=item["id"], url=item["url"], title=item["title"], hint={"item": item}
            )

    def fetch(self, ref: DocRef) -> RawDocument:
        item = dict(ref.hint["item"])
        if self.spec.deep_fetch and len(item.get("summary") or "") < THIN_SUMMARY_CHARS:
            article_text = _fetch_article_text(self.http, item.get("url"))
            if article_text and len(article_text) > len(item.get("summary") or ""):
                item["summary"] = article_text
        payload = {**item, "date": str(item["date"] or "")}
        return RawDocument(
            ref=ref,
            content=json.dumps(payload).encode("utf-8"),
            content_type="application/json",
            fetched_at=dt.datetime.now(dt.UTC),
        )

    def parse(self, raw: RawDocument) -> ParsedDocument:
        item = json.loads(raw.content)
        summary = _strip_html(item.get("summary") or "")
        date = dt.date.fromisoformat(item["date"]) if item.get("date") else None
        return ParsedDocument(
            external_id=item["id"],
            title=item["title"],
            jurisdiction=self.spec.jurisdiction,
            document_type=self.spec.document_type,
            lifecycle_stage=self.spec.lifecycle_stage,
            text=f"{item['title']}\n\n{summary}".strip(),
            raw_format="text",
            language=self.spec.language,
            url=item.get("url"),
            date_document=date,
            extra={"channel": self.spec.key},
        )


def _strip_html(text: str) -> str:
    if "<" not in text:
        return text
    return BeautifulSoup(text, "lxml").get_text(" ", strip=True)


def make_feed_adapters() -> list[type[FeedAdapter]]:
    """One concrete adapter class per spec, so the registry/CLI/pipeline see
    ordinary SourceAdapter subclasses with stable keys."""
    classes = []
    for spec in FEED_SPECS:
        cls = type(
            f"Feed_{spec.key}",
            (FeedAdapter,),
            {
                "spec": spec,
                "key": spec.key,
                "name": spec.name,
                "jurisdiction": spec.jurisdiction,
                "base_url": spec.url,
            },
        )
        classes.append(cls)
    return classes


FEED_ADAPTERS: list[type[FeedAdapter]] = make_feed_adapters()
