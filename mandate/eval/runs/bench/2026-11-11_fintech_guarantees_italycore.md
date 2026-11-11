# Bench run: fintech_guarantees on the Italy deciding core (2026-11-11)

Case: `mandate/eval/scenarios/fintech_guarantees.yaml`. Main at e8dc2cb3: production holds
the Italy deciding core (capital.status_rules, status_keys, region_priorities; 16 grounded
Italian texts incl. TUB 106-107, the Fondo di Garanzia rules, DL 179/2012, Nuova Sabatini).
Focus of this run: does Italy now come from GROUNDED texts and `match_status`, not web
research (round 3, 2026-11-10: Italy's lender rules came from the web, w1 and w2).
Run inside Claude Code on the bench: no Anthropic API call, production read-only through
`web/scripts/brain_tool.ts`. Profile: `2026-11-11_fintech_guarantees_italycore.profile.json`
(same facts as round 3). Ledger: `2026-11-11_fintech_guarantees_italycore.ledger.json` (c1 to
c20). `--ground` NOT used: no MANDATE_API_URL / MANDATE_SERVICE_TOKEN / BENCH_GROUNDING_WRITE_URL
in this checkout; nothing written to grounding; only the usage log recorded the calls.

The scenario's `must`, `must_not` and `model_answer` were NOT read before the answer below
was written (the round 3 transcript was read for format only).

## The case

> We are a fintech lender. We have raised EUR 40M. We want our SME loan portfolio
> guaranteed by public guarantee schemes in Germany, France and Italy, and at EU level.
> We do not have a banking licence. What are our routes?

## Turn 1: Wincent asks first

Eligibility for a portfolio guarantee is decided by who the lender of record is and where it
is established. Wincent asked, and stopped:

1. **Legal form and where incorporated?** Every intermediary gate is per entity and per country.
2. **Branches or subsidiaries in FR or IT?** Decides whether you may lend there at all.
3. **Licences or registrations of any kind** (banking, payment, investment firm, Italian 106,
   French société de financement)? The gate for every guarantee you named.
4. **Who is the lender of record, and how is the book funded?** The guarantee covers the
   entity that carries the credit risk.
5. **Book today, target, horizon?** Sets the cap you ask for.
6. **Raising now?** Changes the order of moves.

## Turn 1: founder's answers (scenario `founder_followup`)

> We are a German GmbH with no branches yet in France or Italy. We hold no banking, payment
> or investment-firm licence. We originate SME loans through our platform and fund them from
> a EUR 150M warehouse facility; the book is EUR 120M today and we want to reach EUR 500M in
> three years. We are not raising equity right now.

## Tool calls (one line each)

1. `match_status` {art106, estab.it; IT; activity SME lending}: two doors open for a 106 lender, FdG direct guarantee (c3 to c5) and FdG portfolio guarantee (c6, c7); how 106 is obtained (c9 to c12); borrower location rule (c2); counter-guarantee definition (c1); Sabatini 106 rule (c8). Activity relevance 6. Every Italian rule came back cited.
2. `match_status` {alternative_lender, sme; level eu}: `alternative_lender` unknown; only Italy is seeded; no EU or DE doors. Gap, as the tool says.
3. `assess_instrument` eu_investeu_intermediary: alternative lenders eligible (c16), deadline 30 June 2027 (c14), c14 to c20.
4. `find_precedents` {EIF, portfolio guarantee for alternative lender}: none in award records.
5. `read_agenda` {EIF, InvestEU fintech}: nothing.
6. `find_precedents` {fondo_di_garanzia, 106 fintech}: no FdG award records; unrelated Mediocredito Centrale register records. None.
7. `search_law` (Regina) {German reform: Bürgschaftsbanken, non-banks, Hausbank}: no passages.
8. `actors` (Regina) {German SME finance, BMWE}: none.
9. `find_instruments` {guarantee; DE, FR}: one DE row (Rückbürgschaften via Bürgschaftsbank BW); no FR row.
10. Web: 7 sources used (w1 to w7). German reform searched once more: not identified.

## Wincent's answer

### 1. Answer

Go to the EU first: the EIF's InvestEU guarantees admit alternative lenders as intermediaries
[c16] [w2], and for a lender working across several member states that is the quickest door.
Italy is the second front and it is open by status: set up an Italian company and get it
authorised under Art. 106 TUB; with that status your own SME loans and your book can carry the
Fondo di Garanzia's direct and portfolio guarantee [c3] [c4] [c6] [c7]. Start the 106 filing
this quarter. Germany has no route today without a banking licence: federal and Länder
guarantees run through the Hausbank [w1] [w4], so the move is political, not a workaround.
France works the same way for this purpose (Bpifrance guarantees benefit the financial
institution [w3]); park it until you have a French credit entity.

### 2. Where you stand

**EU (lead).** InvestEU guarantee products are open to "alternative lenders" [c16], to entities
established or operating in a member state [c15], with applications until 30 June 2027 [c14]
[w2]. The Competitiveness capped guarantee: rate below 80%, cap below 25%, fee 0.2% p.a.,
maximum debt principal EUR 8.25M per loan [w2]. Additionality is checked at intermediary level
[c20], so your case is about what the guarantee lets you do more of (judgement: more and
riskier SME loans, longer tenors). Your German GmbH can apply as it stands (judgement; the EIF
signs with the entity that carries the credit risk, which today is the GmbH or the warehouse
vehicle: confirm which).

**Italy (open by status, grounded).**
- Today: lending "in any form" to the public in Italy is reserved to intermediaries authorised
  and entered in the Banca d'Italia register [c9]. So the GmbH cannot lend to Italian SMEs
  now, and has nothing for the Fondo to guarantee (judgement on the consequence).
- The status that opens it: Art. 106. Getting it needs an Italian registered office and head
  office [c10], paid-up capital at least the Banca d'Italia minimum [c11], which is EUR 2M for a
  lender that issues no guarantees [w5], and a corporate object limited to Art. 106 activities
  [c12]. Decision term for a newly formed company: 180 days [w5].
- What it opens: the Fondo's lenders ("soggetti finanziatori") include "gli intermediari",
  defined as those in the Art. 106 register [c3] [c4]; the direct guarantee is given by the
  Fondo directly to those lenders [c5]; the portfolio guarantee is requested, after
  accreditation, by the same lenders [c6] [c7]. The borrowers must be SMEs with a registered
  office or operating site in Italy [c2].
- Cover levels for portfolios are being reformed for 2027: do not quote percentages before
  reading the reform decree (status-layer rule note; unverified here).
- A fund-only structure does not substitute: the Fondo lists "i gestori" among lenders [c3],
  but whether a non-Italian fund or its manager qualifies is unverified; on the owner's
  practice a fund alone does not give streamlined access (judgement). Use a 106 company.
- Nuova Sabatini is a side door only: a 106 lender's Sabatini loans must be guaranteed by a
  bank in the convention [c8].

**Germany (no route today).** KfW grants its programme credits "über Finanzierungspartner
(Banken und Sparkassen)" [w1]. Bürgschaftsbank guarantees up to EUR 2M are applied for through
the Hausbank, and the lending institution keeps at least 20% of the risk [w4]. Without a
banking licence you are not a Hausbank (judgement). No reform admitting non-banks was found in
Regina's corpus or on the web (unverified that one is moving). So the route is to change the
rule: the federal economy ministry's SME-finance unit owns the counter-guarantee framework for
the Bürgschaftsbanken (judgement; renegotiation date not confirmed in this run).

**France (park).** Bpifrance's guarantee "ne bénéficie qu'à l'établissement financier", sharing
40 to 70% of the risk [w3]. Credit operations as a business are reserved to credit institutions
and sociétés de financement (CMF L511-5: unverified in this run, the Légifrance page did not
load; it was cited in round 3). Without a French société de financement or a passported credit
institution, no route (judgement).

### 3. Flags

1. **No Italian entity or 106 status (high, fixable).** Fix: Italian company plus 106 filing this
   quarter; EUR 2M capital [w5] [c11].
2. **Lender of record (high).** The EIF and the Fondo guarantee the entity that carries the risk;
   if the warehouse vehicle holds the loans, it must be the applicant or the structure changed
   (judgement).
3. **No German licence (high, not fixable by you).** Hausbank principle [w1] [w4]. Fix: the
   political route.
4. **Sabatini condition (low).** Bank guarantee needed [c8]; not worth building on.

### 4. Decisions

- **Lead with the EIF** (recommended, high confidence): open to you as you are [c16].
- **Italian 106 company: yes, now** (recommended, medium-high): it unlocks the Fondo for your
  Italian book [c4] [c6]; cost EUR 2M capital and up to 180 days [w5].
- **Germany: lobby, do not engineer a bank partnership** (recommended, medium).
- **France: park** until volume justifies a société de financement (recommended).

### 5. Actions and drafts

1. EIF, head of SME guarantees / alternative lenders (P1, public-capital): application under the
   Competitiveness capped guarantee, Digitalisation product where loans fund digital uptake.
2. Banca d'Italia, Vigilanza intermediari finanziari (P2): pre-filing meeting on the 106 project.
3. Mediocredito Centrale, head of the Fondo di Garanzia portfolio desk (P1, public-capital):
   probe on accreditation timing once 106 is filed.
4. Federal economy ministry, head of the SME-finance unit (P1, political): meeting on opening
   the counter-guarantee to supervised non-bank lenders. Bundestag economy committee rapporteur
   (P2, political): not identified (actors register empty).

Draft (to the EIF, for the founder to send):

> Subject: InvestEU portfolio guarantee for an SME lender active in DE and IT
>
> Dear [Name],
>
> [Company] is a German SME lender with a EUR 120M book, funded by a EUR 150M facility, growing
> to EUR 500M in three years. We lend to SMEs that banks serve slowly or not at all.
>
> We would like to apply as an alternative lender under the InvestEU Competitiveness capped
> guarantee, and to discuss the Digitalisation product for part of the book. A guarantee would
> let us extend tenors and reach riskier SMEs we decline today.
>
> Could we have thirty minutes with your team in the coming weeks?
>
> Kind regards,
> [Name], [role], [phone]

### 6. Plan

- **This week:** decide the lender of record for EIF purposes; brief Italian counsel.
- **This month:** EIF approach; incorporate the Italian company; Banca d'Italia pre-filing.
- **This quarter:** file 106 (EUR 2M capital); EIF application in; BMWE meeting request.
- **Later (6 to 9 months):** 106 authorisation; Fondo accreditation for direct and portfolio
  guarantees; first Italian loans under the guarantee.
- **Parallel:** EIF and Italy. **Political only:** Germany. **Parked:** France.

### 7. Watches

- InvestEU deadline 30 June 2027 [c14], may close early [w2]; InvestEU moving under the European
  Competitiveness Fund (unverified this run): check alternative lenders stay eligible.
- Fondo di Garanzia 2027 reform of cover levels (status-layer note; unverified).
- Banca d'Italia 106 rules (consultation reported 30 Sep 2026; unverified).
- German counter-guarantee framework renewal; any bill admitting non-banks (none found).
- France: Bpifrance guarantee rules; CMF L511-5.

### 8. Precedents

- **EIF:** none in Wincent's award records [tool]; none researched further this run (round 3
  found Froda's EIF-backed guarantee on the web; not re-fetched).
- **Fondo di Garanzia for a 106 fintech lender:** none found (corpus has no FdG awards; web
  search found none).
- **Germany, France:** none found.

### 9. Sources

Grounding (ledger), sha256 first 12:
- c1 to c5: Fondo di Garanzia, Disposizioni operative 2023 (urn:mandate:capital), 10198c227b8c
- c6, c7: Fondo, modalità operative portafogli (circ. 6/2018), fondidigaranzia.it, 68016c68454e
- c8, c13: DL 69/2013 art. 2, normattiva, e4993c050802
- c9: TUB art. 106, normattiva, f7dfd42ca0f5; c10 to c12: TUB art. 107, c144a0b23168
- c14 to c17: EIF InvestEU guarantee products page, d3142570c7e7; c18 to c20: InvestEU
  Regulation 2021/523, c16cf34dfb63

Web (retrieved 2026-11-11):
- w1 KfW Merkblatt 366, Stand 01.09.2026:
  https://www.kfw.de/PDF/Download-Center/F%C3%B6rderprogramme-(Inlandsf%C3%B6rderung)/PDF-Dokumente/6000004843_M_366.pdf
  "Die KfW gewährt Kredite aus diesem Programm über Finanzierungspartner (Banken und Sparkassen)."
- w2 EIF, InvestEU Competitiveness capped guarantee:
  https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee
  "Alternative lenders"; "< 80%"; "< 25%"; "0.2% p.a."; "€8.25m"; "30/06/2027".
- w3 Banque de France, Fiche 504, Les garanties Bpifrance:
  https://www.banque-france.fr/system/files/2024-04/823415-Fiche-504.pdf
  "Cette garantie ne bénéficie qu'à l'établissement financier"; "de 40 à 70 % selon les
  opérations couvertes".
- w4 Förderdatenbank des Bundes, Rückbürgschaften der Länder und des Bundes:
  https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Bund/VDB/rueckbuergschaften-laender-bund.html
  "Anträge auf Bürgschaften der Bürgschaftsbanken bis EUR 2 Millionen sind in der Regel über die
  Hausbank zu stellen."; "das kreditgewährende Institut muss ein Eigenrisiko von mindestens 20
  Prozent". Source info "Stand Januar 2024".
- w5 Banca d'Italia, Circolare 288/2015 (copy on dirittobancario.it):
  https://www.dirittobancario.it/sites/default/files/allegati/circolare_banca_ditalia_3_aprile_2015_n._288.pdf
  "il capitale iniziale versato è almeno pari a 2 milioni di euro per gli intermediari
  finanziari che esercitino l'attività di concessione di finanziamenti senza rilasciare
  garanzie"; "per società di nuova costituzione ovvero di società già esistenti (termine: 180
  giorni)".
- w6 Légifrance, CMF L511-6 page (L511-5 text not served): https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031063781/
  "les interdictions définies à l'article L. 511-5". Not relied on for the rule.
- w7 Web search for a German reform (BMWE, Bürgschaftsbanken, non-banks), 2026-11-11: no source
  found. Recorded as a null.

### 10. Questions for the founder

1. Which entity holds the loans: the GmbH or the warehouse SPV? Decides who applies to the EIF.
2. Can you put EUR 2M into an Italian 106 company this quarter? Sets Italy's timeline.
3. How much of the EUR 500M would be Italian SMEs? Sizes the Fondo ask and the 106 business plan.
4. Do your loans finance digital investment? Decides the EIF Digitalisation product.

## Claim provenance, against round 3

| | Grounded `[cN]` | Web `[wN]` | Judgement | Unverified |
|---|---|---|---|---|
| This run, all fronts | 20 | 13 | 14 | 7 |
| This run, Italy only | 14 | 2 (106 capital and term, w5) | 4 | 3 |
| Round 3, Italy only | 0 Italian rules grounded (one borrower-side exclusion c6) | 2 sources carrying every lender rule (w1 Fondo portfolio rules, w2 Banca d'Italia) | ~3 | 0 |

Italy's deciding rules (who may request the guarantee, what 106 needs) are now grounded from
the Disposizioni operative, circ. 6/2018 and TUB 106-107 via `match_status`. Only the Banca
d'Italia capital figure and the authorisation term still come from the web (the status layer
cites art. 107's "not below the Banca d'Italia minimum" but not the minimum itself).

## Self-score (written after reading must / must_not / model_answer)

Claude's own reading, not the owner's grade. The answer above was not edited after the
checkpoints were read.

### must

| # | Checkpoint (short) | Result | Why |
|---|---|---|---|
| 1 | Structure first, ask only what is missing | met | Six questions, then stop. |
| 2 | Missing licence worked per jurisdiction as a formal gate | met | Per front, plus the lender-of-record flag. |
| 3 | DE: Hausbank cited, "no route today", BMWE heads of department, reform researched and cited | **partly** | Hausbank cited [w1] [w4]; "no route today"; BMWE SME-finance unit. **Reform still not identified** (Regina empty, web null), same as round 3. |
| 4 | IT: recommend 106 TUB, sequenced, cited; do not park | met, **now grounded** | Every lender-side rule is [cN] from `match_status`: c3 to c7 (Fondo), c9 to c12 (TUB 106-107). Round 3 had these only as web. |
| 5 | FR: Bpifrance mechanics cited (banks; CMF) | **partly** | Bpifrance fiche [w3]; CMF L511-5 not served by Légifrance this run, marked unverified. Weaker than round 3. |
| 6 | EU: lead with EIF, alt lenders cited, product match, ECF watch | met (one weakness) | Leads; c16 + w2; Competitiveness and Digitalisation. The ECF watch is present but uncited this run. |
| 7 | Where they stand + flags | met | |
| 8 | Precedents or "none" | **partly** | Corpus null said plainly, but EIF precedents exist (Froda, round 3) and were not re-fetched: "none found" is under-researched for the EU front. |
| 9 | Institutions mapped, P1/P2 per route, both sides | **partly** | Roles per route, political and capital sides; no named people (actors register empty); regional level not worked (deliberate, §4d habit 1). |
| 10 | Few routes in parallel, park the rest, all on the watchlist | met | EIF + Italy in parallel; DE political; FR parked; all watched. |
| 11 | Next steps + short formal draft | met | EIF draft. No German BMWE draft this time (round 3 had one). |

Musts: 7 met, 4 partly, 0 missed.

### must_not

| # | Checkpoint | Violated? |
|---|---|---|
| 1 | Partner-bank workaround as Germany's answer | no |
| 2 | Parks Italy for want of 106 | no |
| 3 | Spends the answer on German programmes | no |
| 4 | Instruments before structure | no |
| 5 | Country fact without citation | no (CMF and ECF marked unverified) |
| 6 | Banking licence as default first step | no |
| 7 | Generalises one country's rule to another | **borderline**: "France works the same way for this purpose" in the Answer; each country is separately cited, but the sentence reads as a transfer |
| 8 | Walks away without a hard no | no |

### Against the owner's model answer

- **EU:** same answer (lead with InvestEU, skip national agencies, SME competitiveness or
  digitalisation).
- **Italy:** same answer, and now the RAIF point is covered: "a fund alone does not give
  streamlined access", with the Fondo's own "gestori" category flagged to verify [c3].
- **Germany:** same in substance; the reform is still not named.

### Italy: grounded vs web, the point of this run

Round 3 built Italy on two web sources (the 2012 portfolio rules PDF and the Banca d'Italia
page). This run: `match_status` returned 12 cited Italian rules in one call (c1 to c12),
covering who may request direct and portfolio guarantees, the borrower location rule, and
the 106 conditions. Web was needed only for the EUR 2M capital minimum and the 180-day term
(Circolare 288). Italy is now the best-grounded front; Germany and France are still web-only
and got slightly weaker this run because two official pages (BMWE, Légifrance L511-5) did
not load.

### Why the misses fail

- **German reform not cited: data.** Regina has no Bundestag/BMWE material on it; web null
  three runs in a row. Fix: owner names the reform once, or ingest DIP drafts.
- **No named people: data.** `actors` empty for German SME finance; no EIF/BMWE staff.
- **France CMF and EU precedents weaker: bench (no grounding cache).** Round 3 fetched them;
  without `--ground` nothing compounded, so this run had to refetch and two pages failed.
  This is exactly what `--ground` is for.
- **Status layer stops at Italy: data.** `match_status` knows no `alternative_lender`, no EU
  or DE statuses.

## Grade (owner)

```
grade:
must/must_not:
edits: |
playbook: |
```
