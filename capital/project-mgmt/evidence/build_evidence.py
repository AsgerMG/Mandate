#!/usr/bin/env python3
"""Build project-mgmt/evidence/funder_evidence_2026-08-12.jsonl.

One line per instrument row. Every line carries the URL that was read, the
date it was read, what the page said, and a verdict. A row whose page could not
be reached says so explicitly.

Sources, in the order they are allowed to decide:
  1. the funder's own page                (the standing rule)
  2. the EC state-aid case register       (official, but about the NOTIFICATION,
                                           not about whether you can apply)
  3. nothing else. Corpus-internal inference never produces a verdict here.
"""
import json
import re

CHECKED_AT = "2026-08-12"

# ── 1. Verdicts read off the funder's own page, one per fetched URL ────────
# Transcribed from the four page-reading passes. `q` is verbatim from the page.
PAGE = {}


def p(key, verdict, says, q, window="none stated", mismatch=None, conf="high"):
    PAGE[key] = dict(verdict=verdict, says=says, quote=q, window=window,
                     mismatch=mismatch, confidence=conf)


p("satr_at_rnd__sa_102782__austria_wirtschaftsservice_gmbh_aws", "open",
  "The aws T&I Richtlinie 2024-2026 is in force from 01.01.2024; calls may be "
  "published and applications decided under it until 31.12.2026 (competitive "
  "procedures to 30.06.2027). Today is inside that window.",
  "Die AWS T&I Richtlinie 2024-2026 tritt am 01.01.2024 in Kraft ... "
  "Ausschreibungen auf Basis dieser Richtlinie koennen bis 31.12.2026 "
  "veroeffentlicht werden.",
  "in force 01.01.2024; calls publishable to 31.12.2026; competitive decisions to 30.06.2027")
p("satr_at_rnd__sa_112257__austria_wirtschaftsservice_gmbh_aws", "open",
  "aws's directive page presents a current aws erp-Kredit directive effective "
  "1 January 2026 under a new block-exemption number; the 2024 version is archived.",
  "Aktuell Richtlinie: aws erp-Kredit - ab 01. Jaenner 2026 - Version vom "
  "15.01.2026 AGVO-Freistellungsmitteilung SA. 121833",
  "ab 01. Jaenner 2026",
  "our SA.112257 (2024) is superseded; the live notification is SA.121833")
p("satr_at_rnd__sa_113408__oemag_abwicklungsstelle_fur_okostrom_ag", "open",
  "The Austrian legal gazette shows the EAG electricity investment-grant "
  "regulation consolidated and in force today, amended as recently as "
  "BGBl. II Nr. 12/2026.",
  "Gesamte Rechtsvorschrift fuer EAG-Investitionszuschuesseverordnung-Strom, "
  "Fassung vom 12.08.2026",
  "applies to Foerderantraege submitted from 23.6.2025",
  "our row names the 2024 amending ordinance; the page is the consolidated base regulation",
  "medium")
p("satr_at_rnd__sa_41223__kommunalkredit_public_consulting_gmbh_kpc", "open",
  "The Investitionsfoerderungsrichtlinien 2022 for Umweltfoerderung im Inland "
  "entered into force 1 April 2022 and the PDF states no end date; the scheme "
  "is the standing UFG environmental support run via umweltfoerderung.at.",
  "§ 15. (1) Diese Richtlinien treten mit 1. April 2022 in Kraft.",
  "in force from 1 April 2022, no end date stated", None, "medium")
p("satr_cz_equity__sa_51154__podpurny_a_garancni_rolnicky_a_lesnicky_fond_a_s", "open",
  "PGRLF states applications are being accepted right now, under the 20th round "
  "rules effective 1 December 2025.",
  "PRIJEM ZADOSTI PROBIHA.", "20. kolo ucinne od 1. prosince 2025",
  "the page now cites ABER 2022/2472 as legal basis, not the SA.51154 notification we hold")
p("satr_de_equity__sa_101543__lfa_forderbank_bayern", "unsettled",
  "The document at this URL is FilmFernsehFonds Bayern's FILM funding "
  "guidelines - project and script development, cinema and television "
  "production, distribution. It is not the LfA Foerderbank Bayern instrument "
  "our row names, so it cannot settle that row either way.",
  "Der FilmFernsehFonds Bayern (im Folgenden: FFF Bayern) gewaehrt Zuwendungen",
  "none stated",
  "YES - our row is named 'LfA Foerderbank Bayern' and the page is FFF Bayern's "
  "film funding directive. LfA appears only as a co-signatory. The source URL is wrong for this row.")
p("satr_de_equity__sa_61341__kreditanstalt_fur_wiederaufbau", "open",
  "KfW's live product page for the Umweltprogramm (240/241) presents the loan "
  "as currently available, with an eligibility pre-check and an application "
  "route through a financing partner.",
  "Erhalten Sie den Kredit? ... Antrag beim Finanzierungspartner stellen",
  "none stated (rolling product)")
p("satr_de_rnd__sa_102344__ministerium_fur_wirtschaft_arbeit_und_tourismus", "open",
  "Invest BW presents the innovation funding in the present tense and refers to "
  "a currently valid call, but names later directive generations that supersede "
  "the version our row holds.",
  "Fachlicher Bezug zum aktuell geltenden Foerderaufruf",
  "none stated",
  "our row's instrument (VwV Invest BW - Innovation II, 2022) is at least two generations out of date",
  "medium")
p("satr_de_rnd__sa_102510__bundesamt_fur_wirtschaft_und_ausfuhrkontrolle", "open",
  "BAFA's EEW overview presents all six modules as current funding offers. On "
  "the same site BAFA marks discontinued programmes with an explicit end date, "
  "and EEW carries no such marker.",
  "Hier finden Sie eine Uebersicht ueber alle aktuellen Informationen der "
  "Bundesfoerderung fuer Energie- und Ressourceneffizienz in der Wirtschaft (EEW).")
p("satr_de_rnd__sa_105184__tuv_rheinland_forschungs_und_innovationsmanageme", "retired",
  "The ministry describes InnoNT in the past tense as delivered and launches a "
  "named successor, InnoNT+, whose directive and first call are already published.",
  "Mit dem 5G-Innovationsprogramm und der Foerderinitiative InnoNT konnten "
  "bereits zahlreiche Projekte in die Praxis umgesetzt ... Mit unserem neuen "
  "Transfer- und Innovationsprogramm \"InnoNT+ - Smarte Konnektivitaet fuer die Wirtschaft\"",
  "none stated; InnoNT+ 1. Foerderaufruf published", None, "medium")
p("satr_de_rnd__sa_106032__sachsen_sab", "open",
  "Saxony's legal register shows the directive in force since 28 June 2024 and "
  "not expiring until the end of 2030.",
  "Fassung gueltig ab: 28. Juni 2024 Vorschrift ausser Kraft mit Ablauf des: 31. Dezember 2030",
  "expires 31 December 2030")
p("satr_de_rnd__sa_106076__sachsen_sab", "open",
  "SAB announces further money and a submission window opening 8 September 2026.",
  "Interessierte Akteurinnen und Akteure koennen ihre Vorhabenideen ab dem "
  "08.09.2026 ueber das Foerderportal der SAB einreichen.",
  "opens 08.09.2026; project runtime 01.01.2027 - 31.12.2028")
p("satr_de_rnd__sa_107108__thuringer_aufbaubank", "open",
  "Thueringer Aufbaubank's page, updated 15 April 2026, presents FTI-Thueringen "
  "TECHNOLOGIE as applied for online today, with rules newly set for "
  "applications received from 1 January 2026.",
  "zuletzt aktualisiert am 15.04.2026 ... Jetzt online beantragen",
  "rules apply from 01.01.2026; sub-instrument InnoDecide closed from 01.01.2026",
  "the InnoDecide voucher inside this row is retired from 01.01.2026 and must not be offered")
p("satr_de_rnd__sa_56245__fa_fur_korperschaften_ii", "open",
  "The federal finance ministry presents the Forschungszulage as a standing "
  "statutory R&D tax incentive with a live two-stage application route (BSFZ "
  "certificate, then application to the tax office via Mein ELSTER).",
  "Die Beantragung der Forschungszulage erfolgt ueber ein elektronisches "
  "Antragsformular auf dem Online-Portal \"Mein ELSTER\"",
  "none stated (standing statutory entitlement)",
  "YES on granularity - the scheme is real and open, but our row is NAMED AFTER A "
  "TAX OFFICE and there are 18 such rows for this one scheme")
p("satr_de_rnd__sa_56379__kreditanstalt_fur_wiederaufbau", "unsettled",
  "bundeswirtschaftsministerium.de returned a Radware bot-protection "
  "interstitial, so nothing about the scheme was returned.",
  "Radware Page Verifying your browser before proceeding...")
p("satr_de_rnd__sa_61980__bundesministerium_fur_bildung_und_forschung", "unsettled",
  "The page is the verbatim 2019 Foerderbekanntmachung with a rolling two-stage "
  "route and no status banner; its validity clause is conditional (tied to the "
  "GBER's life and the 7th Energy Research Programme), so the page does not say "
  "whether it is in force today.",
  "Die Laufzeit dieser Foerderbekanntmachung ist bis zum Zeitpunkt des "
  "Auslaufens seiner beihilferechtlichen Grundlage, der AGVO ... befristet.",
  "bis zum 30. Juni 2021, conditional and self-extending")
p("satr_de_rnd__sa_63988__bundesministerium_fur_wirtschaft_und_klimaschutz", "unsettled",
  "zim.de returned a Radware CAPTCHA block. ZIM is Germany's flagship SME "
  "innovation programme and is almost certainly live; this row must not be "
  "touched on this evidence.",
  "Radware Captcha Page")
p("satr_hu_equity__sa_57198__avhga", "unsettled",
  "The fetch hit a security check on adozona.hu, and the URL we hold is a "
  "tax-news article rather than AVHGA's own page.",
  "Ellenorizzuk, hogy a kapcsolat biztonsagos-e az adozona.hu elereséhez.",
  "none stated",
  "the held URL is a press article on a tax portal, not the funder's own page")
p("satr_it_equity__sa_102955__ministero_delle_imprese_e_del_made_in_italy_dire", "between_calls",
  "MIMIT presents Accordi per l'innovazione as a live measure in management, "
  "with a 2025-2026 sportello whose window has closed and whose rankings were "
  "still being updated in May 2026.",
  "I termini per la presentazione delle domande si sono chiusi il 18 febbraio 2026.",
  "dalle ore 10.00 del 14 gennaio 2026 e sino alle ore 18:00 del 18 febbraio 2026")
p("satr_it_equity__sa_103469__invitalia_agenzia_nazionale_per_l_attrazione_deg", "open",
  "Invitalia marks Legge 181/89 as an active incentive with an apply "
  "affordance and several territorial sportelli reopening or open.",
  "Stato incentivo Attivo Presenta la domanda ... Sportelli Aperti Gela - "
  "Avviso di riapertura sportello pubblicato",
  "per-territory sportelli; circolare n. 2006 del 5 settembre 2025")
p("satr_it_equity__sa_104270__agenzia_nazionale_per_l_attrazione_degli_investi", "between_calls",
  "The Ministero del Turismo presents FRI-Tur as a live PNRR measure in its "
  "implementation phase, with completion extended to 31 August 2026, but lists "
  "only past avvisi and shows no open application window.",
  "Differimento al 31 agosto 2026 del termine per la realizzazione degli interventi",
  "no application window open; past avvisi 2023 and 2024", None, "medium")
p("satr_it_equity__sa_57625__banca_del_mezzogiorno_mediocredito_centrale_s_p_", "open",
  "MIMIT presents the Fondo di garanzia per le PMI as a standing, operational "
  "guarantee facility with a live application route through banks and confidi.",
  "Il Fondo di Garanzia per le PMI e uno strumento istituito con la Legge n. "
  "662/1996 ... e operativo dal 2000 ... Come presentare la domanda",
  "none stated (always-on facility); page Ultima modifica 01 Luglio 2026")
p("satr_it_equity__sa_60788__ministero_delle_imprese_e_del_made_in_italy_dire", "retired",
  "The incentives catalogue shows the incentive opened and closed on the same "
  "day, 13/12/2016, definitively closed because the endowment was exhausted on "
  "the first day, with no successor round.",
  "Data apertura 13/12/2016 Data chiusura 13/12/2016 Note Chiuso per "
  "esaurimento della dotazione finanziaria al termine del primo giorno utile "
  "di presentazione delle domande.",
  "opened and closed 13/12/2016", None, "medium")
p("satr_it_equity__sa_60800__ministero_delle_imprese_e_del_made_in_italy_dire", "retired",
  "MIMIT records that submissions were suspended from 19.00 on 18 October 2016; "
  "the rest of the page covers only rankings and project implementation, with "
  "no route to apply and no reopening.",
  "Con decreto direttoriale 18 ottobre 2016 e disposta, a partire dalle ore "
  "19.00 del 18 ottobre 2016, la sospensione dei termini di presentazione "
  "delle domande di agevolazioni.",
  "suspended from 19.00 on 18 October 2016", None, "medium")
p("satr_it_equity__sa_62814__invitalia_agenzia_nazionale_per_l_attrazione_deg", "open",
  "NITO-ON is running as a rolling sportello and still accepting applications; "
  "a 30 June 2026 notice says only that the grant component is exhausted, so "
  "new applications are financed by the soft loan alone.",
  "Per le domande presentate successivamente alla pubblicazione del presente "
  "avviso, le agevolazioni verranno quindi concesse nella sola forma del "
  "finanziamento agevolato. ... Presenta la domanda",
  "rolling sportello reopened 24 marzo 2022; page Ultima modifica 30 Giugno 2026")
p("satr_it_rnd__sa_102452__direzione_generale_dell_internazionalizzazione_e", "unsettled",
  "Only the title rendered - the MUR research portal is a JavaScript shell and "
  "returned no body text.", None)
p("satr_it_rnd__sa_102644__ministero_delle_imprese_e_del_made_in_italy_dire", "between_calls",
  "The Fondo impresa femminile exists and is still being managed and "
  "refinanced, but both application sportelli were shut in 2022 on exhaustion "
  "of resources and new applications are 'currently' not possible.",
  "Per gli incentivi previsti dal Fondo impresa femminile attualmente non e "
  "possibile presentare nuove domande.",
  "sportelli closed 20 maggio 2022 and 8 giugno 2022")
p("satr_it_rnd__sa_103131__ministero_della_transizione_ecologica_dipartimen", "retired",
  "The page is the single PNRR avviso for Linea A, whose submission window ran "
  "15 December 2021 to 14 February 2022 and is stated as expired in the title; "
  "the page has not been touched since 04.05.2023 and offers no further round.",
  "SCADENZA 14 FEBBRAIO 2022 ... Le proposte possono essere presentate a "
  "partire dal 15 dicembre 2021 fino al 14 febbraio 2022.",
  "15 dicembre 2021 - 14 febbraio 2022",
  "the page carries a stale metadata field 'Stato Aperto' contradicting its own "
  "expired scadenza; the verbatim scadenza is taken to win", "medium")
p("satr_it_rnd__sa_103132__ministero_della_transizione_ecologica_dipartimen", "retired",
  "The document is the PNRR avviso M2C.1.1 I1.2 Linea C for new plastics "
  "recycling plants - a single one-shot PNRR call, not a standing scheme.",
  "AVVISO M2C.1.1 I 1.2 Linea d'intervento C \"Realizzazione di nuovi impianti "
  "per il riciclo dei rifiuti plastici\"",
  "a single PNRR avviso; no further round on the document", None, "medium")
p("satr_it_rnd__sa_103136__ministero_della_transizione_ecologica_dipartimen", "unsettled",
  "The MASE tenders index returned an access-denied edge error.",
  "Access Denied You don't have permission to access \"http://www.mase.gov.it/bandi\" on this server.")
p("satr_it_rnd__sa_106168__agenzia_delle_entrate", "retired",
  "The government's own description states the Mezzogiorno R&D tax credit was "
  "extended only up to the year 2022, with no later extension and no "
  "application route.",
  "e stata prorogata dall'articolo 1, commi 185 e 186, della legge n. 178/2020 sino all'anno 2022",
  "sino all'anno 2022", None, "medium")
p("satr_it_rnd__sa_106430__ministero_delle_imprese_e_del_made_in_italy_dire", "open",
  "MIMIT presents Horizon Europe partnership co-funding as a live instrument, "
  "headlining two 2026 calls; page last updated 6 August 2026.",
  "Bando HORIZON-JU-EUROHPC-2026-COE-LH-01 - 2026 ... Ultima modifica: 06 Agosto 2026",
  "Ultima modifica: 06 Agosto 2026")
p("satr_it_rnd__sa_106978__finpiemonte_s_p_a", "between_calls",
  "Piedmont marks this call's status as expired, with a 2023 window, while the "
  "underlying PR FESR 2021-2027 action continues.",
  "Stato Scaduto ... Domande dal Gio, 30/03/2023 - 09:00 Scadenza Ven, 29/09/2023 - 12:00",
  "30/03/2023 - 29/09/2023", None, "medium")
p("satr_it_rnd__sa_107454__lazio_innova_s_p_a", "between_calls",
  "Lazio Innova labels the avviso closed; the page is now an administrative "
  "record under the continuing PR FESR Lazio 2021-2027.",
  "PR FESR - Riposizionamento Competitivo RSI Chiuso giovedi 29 Dicembre 2022",
  "Chiuso 29 Dicembre 2022", None, "medium")
p("satr_it_rnd__sa_108488__fi_l_s_e_s_p_a", "between_calls",
  "Regione Liguria gives a fixed 2023 opening and closing date that has passed, "
  "while the call sits under the continuing PR FESR 2021-2027 programme.",
  "Data apertura: 30 Giugno 2023 Data chiusura: 21 Luglio 2023",
  "30 Giugno 2023 - 21 Luglio 2023", None, "medium")
p("satr_it_rnd__sa_47037__ministero_dell_istruzione_dell_universita_e_dell", "unsettled",
  "The MUR funding page returned only an anti-bot interstitial.", "Just a moment...")
p("satr_it_rnd__sa_48424__gse_gestore_servizi_energetici_s_p_a", "unsettled",
  "The GSE page returned only site navigation JSON and the global footer - the "
  "body is absent (JavaScript shell).", "Incentivi {1} ##LOC[OK]##")
p("satr_it_rnd__sa_48482__regione_autonoma_friuli_venezia_giulia_direzione", "unsettled",
  "The FVG decree PDF did not load - the server returned HTTP 406.",
  "HTTP Error 406 - Client browser does not accept the MIME type of the requested page.")
p("satr_it_rnd__sa_51460__provincia_autonoma_di_bolzano_ripartizione_innov", "open",
  "The province presents a permanently open, deadline-free application route "
  "for industrial research and experimental development grants, under criteria "
  "in force since 14.11.2025 and amended in 2026.",
  "Non e prevista alcuna scadenza per la presentazione delle domande di aiuto. "
  "Si possono presentare piu domande in un anno.",
  "criteria in force from 14.11.2025, amended by delibera 149/2026")
p("satr_it_rnd__sa_53347__gse_gestore_servizi_energetici_s_p_a", "unsettled",
  "The GSE page returned only navigation JSON and the footer (JavaScript shell).",
  "Documenti {1} ##LOC[OK]##")
p("satr_it_rnd__sa_53666__gse_gestore_servizi_energetici_s_p_a", "unsettled",
  "The GSE page returned only navigation JSON and the footer (JavaScript shell).",
  "ACCESSO AGLI INCENTIVI {1} ##LOC[OK]##")
p("satr_it_rnd__sa_53676__ministero_dello_sviluppo_economico_direzione_gen", "between_calls",
  "The incentives catalogue records a 2019 window that has closed, while the "
  "underlying legge 808/85 aerospace instrument continues and the page links to "
  "a 'nuovo bando aerospazio'.",
  "Data apertura 01/07/2019 Data chiusura 30/10/2019 ... Sito di riferimento "
  ".../incentivi/nuovo-bando-aerospazio",
  "01/07/2019 - 30/10/2019", None, "medium")
p("satr_it_rnd__sa_55956__autorita_di_gestione_fesr_campania", "unsettled",
  "An archival call page whose deadline passed in 2019 and whose last entries "
  "are award decrees and a reallocation of the leftover envelope. It never "
  "states whether the scheme has ended or will reopen.",
  "i termini per la presentazione della domanda di partecipazione sono stati "
  "prorogati alle ore 17:00 del giorno 26/07/2019",
  "prorogati alle ore 17:00 del 26/07/2019", None, "medium")
p("satr_it_rnd__sa_60776__regione_puglia_dipartimento_sviluppo_economico_i", "not_a_fund",
  "The document is Regione Puglia's 2014 regional REGULATION for block-exempted "
  "aid - the legal framework under which Puglia's individual bandi are issued. "
  "It is not itself something a company applies to.",
  "REGOLAMENTO REGIONALE 30 settembre 2014, n. 17 Regolamento della Puglia per "
  "gli aiuti compatibili con il mercato interno ai sensi del TFUE",
  "entra in vigore il giorno della pubblicazione sul Bollettino Ufficiale",
  "the row is the umbrella regulation, not a call. Its own text refers to "
  "'la scadenza prevista nel bando', i.e. the applicable unit is the bando.")
p("satr_it_rnd__sa_60793__invitalia_agenzia_nazionale_per_l_attrazione_deg", "open",
  "The incentives catalogue lists Smart&Start Italia with an opening date of "
  "16/02/2015, no closing date, and rolling assessment until funds run out.",
  "Data apertura 16/02/2015 Data chiusura - Note Si valutano le domande in base "
  "all'ordine di arrivo, fino ad esaurimento dei fondi.",
  "opened 16/02/2015, no closing date", None, "medium")
p("satr_lu_rnd__sa_111794__ministere_de_l_economie", "open",
  "Luxinnovation presents the investment aid for renewable energy, renewable "
  "hydrogen and high-efficiency cogeneration as currently available under the "
  "Law of 8 December 2025, applied for online via MyGuichet.lu.",
  "Under the Law of 8 December 2025 on Luxembourg's environmental and climate "
  "protection aid scheme, the Ministry of the Economy offers investment aid to businesses",
  "none stated (rolling); application must precede any binding commitment")
p("satr_lu_rnd__sa_111797__ministere_de_l_economie", "open",
  "Guichet.lu presents financial aid for SME innovation as an active procedure "
  "with an online application, last updated 16.06.2025, resting on the Loi du "
  "6 juin 2025.",
  "Applications for aid must be submitted using the online assistant available on My Guichet.lu.",
  "none stated",
  "our row names the Loi du 17 mai 2017; the regime now runs under the Loi du 6 juin 2025")
p("satr_lu_rnd__sa_48476__ministere_de_l_economie", "open",
  "Luxinnovation presents aid for industrial research and experimental "
  "development projects as currently available via MyGuichet.lu.",
  "Applications must be submitted online via MyGuichet.lu.",
  "none stated (rolling)",
  "this row and SA.111797 resolve to the same live Luxembourg RDI regime under "
  "successive laws - a probable duplicate")
p("satr_lu_rnd__sa_48601__ministere_de_l_energie_et_de_l_amenagement_du_te", "open",
  "Klima-Agence sets out currently applicable renewable-electricity "
  "remuneration per technology, including a July 2024 amending regulation.",
  "Grand-ducal regulation of 31 July 2024 amending the preceding regulations",
  "premium guaranteed for 15 years from first injection", None, "medium")
p("satr_nl_equity__sa_62153__ministerie_van_economische_zaken_en_klimaat", "open",
  "RVO marks Vroegefasefinanciering as open for applications for the whole of 2026.",
  "Open voor aanvragen ... Startdatum: donderdag 1 januari 2026 00:00 "
  "Einddatum: donderdag 31 december 2026 23:59",
  "1 januari 2026 - 31 december 2026")
p("satr_nl_rnd__sa_103892__ministerie_van_economische_zaken_en_klimaat", "open",
  "RVO marks VEKI as open with a window running to 28 January 2027 and a "
  "EUR 123.2m budget; content verified 10 July 2026.",
  "Open voor aanvragen ... U kunt subsidie aanvragen vanaf 7 mei 2026, 09:00 "
  "uur tot 28 januari 2027, 17:00 uur.",
  "7 mei 2026 09:00 - 28 januari 2027 17:00")
p("satr_nl_rnd__sa_113866__ministerie_van_economische_zaken_en_klimaat", "open",
  "RVO marks STUDI as open to 31 March 2027 and explicitly urges continued "
  "applying despite the budget being fully committed.",
  "Open voor aanvragen ... Update 13 juli: er zijn meer aanvragen dan er budget "
  "is, maar blijf toch aanvragen. / Deze subsidie heette eerder TSE Industrie studies.",
  "18 mei 2026 09:00 - 31 maart 2027 17:00",
  "renamed from TSE Industrie studies; open but 0% budget remaining on 13 July 2026")
p("satr_nl_rnd__sa_44328__ministerie_van_financien", "open",
  "RVO presents MIA/Vamil as a currently usable tax facility with a direct "
  "application route; content verified 6 August 2026.",
  "Maak dan gebruik van de Milieu-investeringsaftrek (MIA) en/of Willekeurige "
  "afschrijving milieu-investeringen (Vamil) ... Direct aanvragen",
  "none stated; page checked 6 augustus 2026",
  "the page says 'In opdracht van: Ministerie van Infrastructuur en Waterstaat'; "
  "our row holds Ministerie van Financien")
p("satr_nl_rnd__sa_53946__ministerie_van_economische_zaken_en_klimaat", "open",
  "The DEI+ hub is live with six modules, two open for applications now, while "
  "others are marked temporarily closed.",
  "DEI+: Verduurzaming gebouwde omgeving Open voor aanvragen ... Aanvragen "
  "vanaf 27 januari 2026 tot en met 27 augustus 2026.",
  "27 januari 2026 - 27 augustus 2026",
  "the flagship module 'DEI+: Energie- en klimaatinnovaties' is TIJDELIJK "
  "GESLOTEN - a founder routed to DEI+ generically may hit a closed module")
p("satr_nl_rnd__sa_55349__ministerie_van_economische_zaken_en_klimaat", "open",
  "The RVO energy-innovation overview lists numerous modules currently open "
  "with 2026-2027 windows.",
  "MOOI: Industrie Open voor aanvragen ... Aanvragen vanaf 2 juni 2026 tot en "
  "met 3 september 2026.",
  "2 juni 2026 - 3 september 2026 (MOOI); 18 mei 2026 - 31 maart 2027 (STUDI)",
  "our row names a specific 2019 openstelling; the liveness here is the family's, not that round's",
  "medium")
p("satr_nl_rnd__sa_61208__provincie_zuid_holland", "between_calls",
  "The consolidated provincial regulation is in force today and does not expire "
  "until 31 December 2030, but application periods are set separately when each "
  "subsidy ceiling is published, and the page states no current window.",
  "Geldend van 11-04-2026 t/m heden ... kunnen subsidieaanvragen worden "
  "ingediend gedurende de periode die bij de publicatie van het subsidieplafond "
  "bekend wordt gemaakt",
  "in force 11-04-2026 to date; expires 31 december 2030")


# ── 2. What the EC case register says about the SA number ──────────────────
EVAL_PLAN = re.compile(
    r"evaluation plan|evaluierungsplan|plan d.{0,2}.valuation|piano di valutazione", re.I)
UMBRELLA = re.compile(r"r.gime cadre|block exemption scheme|sch.ma\s+.t.tnej", re.I)


def main():
    raw = json.load(open("raw.json"))
    sa = json.load(open("sa_facts.json"))
    succ = json.load(open("sa_succ.json"))
    status = {}
    for line in open("pages_held/_status.tsv"):
        parts = line.rstrip("\n").split("\t")
        if len(parts) == 3:
            status[parts[0]] = (int(parts[1]), parts[2])
    titles = {k: v["title"] for k, v in json.load(open("pagetext.json")).items()}

    held = [r for r in raw if r["scheme_end_date_basis"] == "notified_duration"]
    # which fetched key covers each URL
    url_to_key = {u: k for k, (_, u) in status.items()}

    out = []
    for r in sorted(held, key=lambda x: (x["country"], x["scheme_code"], x["id"])):
        code = r["scheme_code"]
        ec = sa.get(code, {})
        sc = succ.get(code, {})
        ectitle = ec.get("title") or ""
        url = r["eligibility_source_url"]
        key = url_to_key.get(url) if url else None
        pv = PAGE.get(key) if key else None
        # a row keyed on an evaluation plan or a framework regime is settled on
        # the Commission's OWN title, which is an official source.
        artefact = None
        if EVAL_PLAN.search(ectitle):
            artefact = "evaluation_plan"
        elif UMBRELLA.search(ectitle):
            artefact = "framework_regime"

        if pv:
            verdict = pv["verdict"]
            says, quote = pv["says"], pv["quote"]
            window, mismatch = pv["window"], pv["mismatch"]
            conf = pv["confidence"]
            basis = "the funder's own page, fetched " + CHECKED_AT
            http, page_title = status.get(key, (None, None))[0], titles.get(key)
        else:
            verdict = "unsettled"
            quote, window, conf = None, "none stated", "high"
            http, page_title = (status.get(key, (None, None))[0] if key else None), None
            mismatch = None
            if not url:
                says = ("We hold no funder page for this row at all, so nothing "
                        "was checked. This is a worse state than a page that "
                        "failed to load: nobody has ever recorded where this "
                        "row's funder publishes it.")
                basis = "no source URL on the row"
            else:
                says = "The page was fetched but no verdict was recorded for it."
                basis = "page fetched, not read"

        # The Commission's own title can settle WHAT THE ROW IS even when the
        # funder page is missing. It cannot settle whether anything is open.
        if artefact and verdict == "unsettled":
            verdict = "not_a_fund"
            says = (
                "The Commission's own case register titles this SA number "
                + ("an EVALUATION PLAN" if artefact == "evaluation_plan"
                   else "a FRAMEWORK REGIME (regime cadre / block-exemption umbrella)")
                + ": \"" + ectitle + "\". That is a register artefact, not a "
                "scheme a company applies to. Real aid is granted under it by "
                "individual calls, which are the applicable unit.")
            quote = ectitle
            basis = ("the EC state-aid case register's own caseTitle for "
                     + code + ", fetched " + CHECKED_AT)
            mismatch = ("yes - the row is a register artefact carrying an "
                        "award history, not an offerable fund")
            conf = "high"
        elif artefact and verdict == "open":
            mismatch = ((mismatch + " | " if mismatch else "")
                        + "the SA number our row is keyed on is "
                        + ("an evaluation plan" if artefact == "evaluation_plan"
                           else "a framework regime")
                        + ", not the scheme itself: \"" + ectitle + "\"")

        action = {
            "open": "keep", "between_calls": "keep",
            "retired": "suppress", "not_a_fund": "suppress",
            "unsettled": "none",
        }[verdict]

        out.append({
            "instrument_id": r["id"],
            "country": r["country"],
            "we_claim": {
                "name": r["name"],
                "scheme_code": code,
                "scheme_end_date": r["scheme_end_date"],
                "scheme_end_date_basis": r["scheme_end_date_basis"],
                "last_year": r["last_year"],
                "event_count": r["event_count"],
                "total_eur": r["total_eur"],
                "administering_body": r["administering_body"],
                "why_offered": (
                    "the notified duration expired on " + str(r["scheme_end_date"])
                    + " and isClosed() reopened the row because our own award "
                    "history shows a later award year (" + str(r["last_year"]) + ")"),
            },
            "checked": {"url": url, "http_status": http,
                        "checked_at": CHECKED_AT, "page_title": page_title},
            "funder_says": says,
            "quote": quote,
            "window": window,
            "verdict": verdict,
            "basis": basis,
            "confidence": conf,
            "corroboration": {
                "source": "EC state-aid case register",
                "case": code,
                "case_title": ectitle or None,
                "measure_end_date": ec.get("end") or None,
                "commission_expenditure_years": ec.get("expenditureYears") or [],
                "expenditure_runs_past_measure_end": sc.get("expPastEnd"),
                "later_ending_linked_cases": sc.get("successors") or [],
            },
            "mismatch": mismatch,
            "action": action,
        })
    return out


if __name__ == "__main__":
    for rec in main():
        print(json.dumps(rec, ensure_ascii=False))
