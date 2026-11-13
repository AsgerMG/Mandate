# Loop run: fintech_guarantees (loo)

Case: `mandate/eval/scenarios/fintech_guarantees.yaml`. Brain: Wincent. Playbooks at e46289aad5. One-reply re-test on the bench (no API spend), 2026-11-13T07:19:46+00:00, 178.8s.
Leave-one-out case library: 3 entries derived from this case left out (fintech_eu_open_door, fintech_shut_door_reform, fintech_status_unlocks_market); reads of mandate/eval/ and mandate/playbooks/cases/ denied.

## The case

> We are a fintech lender. We have raised EUR 40M. We want our SME loan portfolio guaranteed by public guarantee schemes in Germany, France and Italy, and at EU level. We do not have a banking licence. What are our routes?
> 
> More about us, so you can answer in one go: We are a German GmbH with no branches yet in France or Italy. We hold no banking, payment or investment-firm licence. We originate SME loans through our platform and fund them from a EUR 150M warehouse facility; the book is EUR 120M today and we want to reach EUR 500M in three years. We are not raising equity right now.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

# Public guarantees for your SME loan book: Germany, France, Italy and EU

## 1. Answer

Start with the EU. The European Investment Fund's InvestEU portfolio guarantees name alternative lenders as eligible intermediaries [c3]. It is also the only door that covers all three of your markets with one agreement (judgement). Italy is the second route, but it needs a status you don't have yet. With a licence called Art. 106 TUB, a non-bank lender can put its own SME loans under Italy's state guarantee fund, the Fondo di Garanzia, loan by loan or as a portfolio [c10][c12][c13]. Getting that licence means setting up an Italian company [c16].

Germany has no route today without a banking licence (judgement). The way in there is to change the rule. France has to be researched before I advise: on what I could check, the guarantee runs through banks that have signed an agreement with Bpifrance, the French public bank [w3].

One question comes before all of this: who is the lender of record on your loans? Your answers to every front depend on it.

## 2. Where you stand

| Front | Can you do the activity? | Can you get the support? | Today |
|---|---|---|---|
| **EU (EIF / InvestEU)** | Depends on your licensing (see flag 1) | Alternative lenders are eligible [c3] if established or operating in the EU [c2]. You must apply, be selected by the EIF and sign a guarantee agreement [c4]. | **Open door.** Deadline 30 June 2027, which can be brought forward [c1]. |
| **Italy (Fondo di Garanzia)** | Lending to the public in Italy is reserved to authorised Art. 106 intermediaries [c15] | Art. 106 intermediaries can request the Fund's guarantee directly [c9][c10][c11] and on portfolios after accreditation [c12][c13] | **Shut today, opens with the licence.** This is a plan step, not a reason to park Italy. |
| **Germany (Bürgschaftsbanken plus federal and Land counter-guarantees)** | Depends on your model (flag 1) | The counter-guarantees back Bürgschaftsbank guarantees on house-bank loans [w2]. The lender types are listed in each declaration. I could not read the text of one myself (unverified). | **No route today.** |
| **France (Bpifrance)** | Lending to firms on a regular basis is reserved to credit institutions and finance companies (sociétés de financement) under Art. L511-5 of the Monetary and Financial Code (unverified; confirm on Legifrance) | The bank either signs Bpifrance's delegation agreement or applies case by case [w3]. I have not found whether a finance company can sign that agreement. | **Unresolved.** I won't advise until this is researched. |

## 3. Flags

1. **Who is the lender of record? (High.)** You hold no licence, yet you originate German SME loans. So either a partner bank fronts the loans, or the structure is something else. The EIF looks at your regulatory standing. Its fintech precedent, Froda, is "a licensed credit market company" [w1]. This is the regulatory half of the case, and I am handing it to Regina. Fix: send us a one-page description of your origination structure.
2. **Italy needs an Italian company. (High, fixable.)** The licence requires:
   - a registered office and head office in Italy [c16];
   - paid-up capital at the minimum Banca d'Italia sets [c17];
   - a company purpose limited to Art. 106 activities [c18].

   Fix: an Italian subsidiary, authorised by Banca d'Italia and entered in its register [c15].
3. **No precedent found for this exact deal. (Medium.)** I found none for an EIF or Fondo di Garanzia guarantee to a non-bank lender in your position. The Fondo di Garanzia records I have are borrower-side awards, not lenders (register records, e.g. https://competition-cases.ec.europa.eu/cases/SA.109544). On the web, the nearest is Froda (judgement). That makes the case stronger to argue, but not routine.

## 4. Decisions

- **Lead with the EIF?** I recommend yes. One agreement, one application, three markets (judgement).
- **Set up an Italian Art. 106 company?** I recommend deciding this quarter, sized to how much of the EUR 500M target is Italian. The licence opens the Fondo di Garanzia directly [c12].
- **Take a lobby role in Germany?** I recommend yes, at low cost and through your trade association. The current counter-guarantees run 2023 to 2027, and new ones are negotiated every five years [w2]. The next round is the moment to change the rule.

## 5. Actions and drafts

- **EIF:** the head of the guarantees or alternative-lending team (P1), forwarded to the InvestEU SME competitiveness product team (P2, product name unverified).
- **Banca d'Italia:** the authorisations unit for financial intermediaries (P2 operational). Ask for a pre-filing meeting.
- **Germany:**
  - The federal economy ministry's SME-finance unit (P1; the unit code VIIC4 in our records is uncited, so treat it as unverified).
  - The Land economy ministries, which co-issue the counter-guarantees [w2].
  - The Bürgschaftsbanken association (VDB), which negotiates them collectively [w2].
- **Bpifrance:** the head of guarantee partnerships. A one-question probe: may a finance company sign the guarantee agreement?

**Draft to the EIF (P1):**
> Dear [Name],
> [Company] is a German SME lender with a EUR 120M book across Germany, France and Italy, growing to EUR 500M by 2029. Small firms in these markets remain underserved by bank credit; your InvestEU portfolio guarantees exist for exactly that gap, and name alternative lenders as eligible. We would value 30 minutes to discuss a multi-country portfolio guarantee ahead of the June 2027 deadline.
> Yours sincerely, [CEO]

## 6. Plan

- **This week:**
  - Describe the origination structure and send it to Regina.
  - Send the EIF probe.
- **This month:**
  - Assemble the EIF application pack: portfolio data, default history, pipeline by country.
  - Make an Italy go/no-go decision.
- **This quarter:**
  - Incorporate the Italian company and file with Banca d'Italia.
  - Send the Bpifrance probe.
  - Approach the German ministry through the VDB.
- **Later:** Fondo di Garanzia accreditation, once the licence is granted [c13].

The EIF and Italy routes run in parallel. Germany is a lobby track. France is parked until research resolves it.

**The money logic:** a guarantee moves default risk onto the public balance sheet. Your warehouse lender should then need a thinner first-loss layer, and your EUR 40M equity carries more book. For illustration: at a 10% first loss, EUR 500M needs EUR 50M of equity. If guaranteed loans earn better advance rates, your existing equity could carry that growth (assumption; please send your actual warehouse terms).

## 7. Watches

- The EIF deadline, which could be brought forward [c1].
- InvestEU moving into the European Competitiveness Fund, and whether alternative lenders stay eligible (unverified).
- The renegotiation of Germany's counter-guarantees for the period after 2027 [w2]. I found no reform bill moving now (unverified).
- The 2027 Fondo di Garanzia reform decree on cover levels (unverified).
- Bpifrance's partner agreement terms.

## 8. Precedents

- **EIF:** none in our records. On the web, Froda: in February 2025, EUR 100M of new lending under the InvestEU microfinance guarantee [w1].
- **Fondo di Garanzia:** none found for a lender in your position.
- **Germany and France:** none found.

## 9. Sources

- **[c1]–[c4]** EIF InvestEU guarantee products page (corpus copy).
- **[c9]–[c11], [c8]** Fondo di Garanzia operating rules 2023, sha 10198c227b8c.
- **[c12], [c13]** Portfolio operating rules (circ. 6/2018), fondidigaranzia.it, sha 68016c68454e.
- **[c14]** DL 69/2013 art. 2, normattiva, sha e4993c050802.
- **[c15]** Banking Act (TUB) art. 106, normattiva, sha f7dfd42ca0f5.
- **[c16]–[c18]** TUB art. 107, normattiva, sha c144a0b23168.
- **[w1]** eif.org/press/all/eif-approves-extended-support-for-froda-with-eu-wide-microfinancing-guarantee-under-investeu, 13 Nov 2026: "a licensed credit market company"; "InvestEU Microfinance, Social and Entrepreneurship Guarantee Product".
- **[w2]** vdb.ermoeglicher.de/de/ueber-uns/service-downloads/staatliche-rueckbuergschaften/, 13 Nov 2026: "für die Jahre 2023 bis 2027"; "alle fünf Jahre neue Erklärungen für die nächste Förderperiode".
- **[w3]** bpifrance-creation.fr/moment-de-vie/garanties-bancaires-quoi-sagit-il, 13 Nov 2026: "Cette possibilité est offerte à toutes les banques signataires de la convention de délégation proposée par Bpifrance."

## 10. Questions for you

1. **Who is the lender of record in Germany, France and Italy?** It decides whether you can do the activity and which licence each front needs.
2. **How does your book split by country today and in the 2029 plan?** It sizes the EIF ask and tells us whether Italy justifies its own company.
3. **What are the warehouse terms (advance rate, first loss)?** They let me show what the guarantee is worth in equity saved.
