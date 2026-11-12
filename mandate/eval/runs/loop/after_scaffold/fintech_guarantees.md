# Loop run: fintech_guarantees (after_scaffold)

Case: `mandate/eval/scenarios/fintech_guarantees.yaml`. Brain: Wincent. Playbooks at e3aea05487. One-reply re-test on the bench (no API spend), 2026-11-12T22:11:25+00:00, 228.4s.

## The case

> We are a fintech lender. We have raised EUR 40M. We want our SME loan portfolio guaranteed by public guarantee schemes in Germany, France and Italy, and at EU level. We do not have a banking licence. What are our routes?
> 
> More about us, so you can answer in one go: We are a German GmbH with no branches yet in France or Italy. We hold no banking, payment or investment-firm licence. We originate SME loans through our platform and fund them from a EUR 150M warehouse facility; the book is EUR 120M today and we want to reach EUR 500M in three years. We are not raising equity right now.
> 
> (Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)

## Wincent's answer

# Guarantee cover for your SME loan book (Germany, France, Italy, EU)

## 1. Answer

Start at EU level. The EIF's InvestEU SME guarantee lists alternative lenders among the eligible intermediaries [c46]. It is open to intermediaries established or operating in an EU member state [c45]. It is the only door open to you today without a licence, and one agreement could cover the whole book (judgement). Applications close on 30 June 2027 [c44], and the EIF may close the call earlier [w1].

In Italy, get Art. 106 TUB status through an Italian subsidiary. With that status you can request the Fondo di Garanzia's direct and portfolio guarantees yourself [c3][c5][c6]. Plan it now, alongside the EU route.

In Germany there is no route today. The work there is lobbying for the next renewal of the federal and Länder counter-guarantee rules. France is shut too until you hold a French lending status, so the EU route should cover French loans first.

There is one question to settle before any of this: who is the legal lender on your loans today?

## 2. Where you stand

| Front | Today | What opens it |
|---|---|---|
| **EU (EIF, InvestEU)** | Open. Alternative lenders are eligible [c46]. Cover up to 80%, with a portfolio cap under 25% [w1]. You need a call application, EIF selection and a guarantee agreement [c47]. | An application this quarter |
| **Italy (Fondo di Garanzia)** | Shut to you now. Open to Art. 106 intermediaries for direct guarantees [c2][c3][c4] and for portfolios after accreditation [c5][c6]. Borrowers must have a seat in Italy [c12]. | Art. 106 status. It needs an Italian registered office and head office [c9], paid-up capital set by the Bank of Italy [c10], and a company limited to lending activities [c11]. In practice that means a dedicated Italian company. |
| **Germany (Bürgschaftsbanken)** | Shut to a non-bank. The Bürgschaftsbanken share risk with the Hausbanken (the borrower's own bank), and they describe their guarantees as security for "Banken, Sparkassen und andere Finanzierungsinstitute" [w2]. The scheme's borrower tests look easy to pass [c51][c53], but they say who may *borrow*, not who may *lend*. Don't read them as a door. | A rule change. The current federal and Länder counter-guarantee declarations cover 2023 to 2027 [w2], so the next period is being negotiated now. |
| **France (Bpifrance)** | Shut today. Bpifrance's guarantee covers loans made by banks [w3] and usually covers 40% to 70% of the loan [w3]. Lending on a regular basis is reserved to credit institutions and *sociétés de financement*, the French licensed lender status (Art. L511-5 CMF, unverified: confirm on Légifrance). | A French lending licence or a passported one (judgement). Whether Bpifrance signs with a *société de financement* is unverified; ask Bpifrance's guarantee department. |

## 3. Flags

1. **Who is the legal lender on your loans? (critical).** In Germany, making loans commercially is a banking activity [w6] and needs BaFin authorisation [w7]. You hold none, so a fronting bank or a fund probably sits on the loans. The answer decides which entity applies to the EIF and whether lending into France and Italy is lawful. Regina should take this half. Fix: send us your origination chart.
2. **The Italian status takes time (high).** Fix: set up the Italian company and file with the Bank of Italy. Authorisation probably takes 6 to 12 months (unverified: confirm with Italian counsel).
3. **The EIF deadline (high).** The call can close before 30 June 2027 [w1]. Fix: file this quarter.

## 4. Decisions

- **Apply to the EIF now?** Yes. The door is open, the deal is sized to your book, and the deadline is real.
- **Set up an Italian Art. 106 company?** Yes, once flag 1 is answered (judgement).
- **Get a German banking licence just to reach the Bürgschaftsbanken?** No. That cost is out of proportion when the EIF covers German loans (judgement).
- **Get a French *société de financement* licence?** Not yet. Revisit once the French book justifies it.

## 5. Actions and drafts

1. Regina: who is lender of record in DE, FR and IT, and whether the EIF agreement sits with you, your warehouse vehicle or a fronting bank.
2. **EIF** (decides: head of SME and inclusive-finance guarantees; forwards: the InvestEU guarantee deal team). Short probe below.
3. **Italy** (decides: Mediocredito Centrale, head of the Fondo di Garanzia; authorises: the Bank of Italy's supervision of financial intermediaries; political: MIMIT, the industry ministry's incentives directorate). Request a meeting once the Italian company is decided.
4. **Germany** (decides: the federal economy ministry's SME-finance unit; forwards: the Bürgschaftsbanken association, VDB). Ask for alternative lenders to be admitted in the post-2027 counter-guarantee declarations.
5. **France** (Bpifrance's guarantee department; Treasury, business finance). A low-effort probe on whether *sociétés de financement* are admitted.

**Draft to the EIF:**

> Subject: InvestEU SME guarantee: alternative SME lender, Germany, France, Italy
>
> Dear Head of Guarantees,
>
> [Company] is a German SME lender with a EUR 120M book, financed by a EUR 150M warehouse, growing to EUR 500M in three years across Germany, France and Italy. Our borrowers are the small firms that banks under-serve, which is the gap InvestEU exists to close.
>
> We intend to apply under the current InvestEU SME competitiveness call and would welcome 30 minutes with your team on the right product and structure for a multi-country book.
>
> Yours sincerely,
> [Name], CEO

## 6. Plan

- **This week:** answer flag 1 and send the EIF probe.
- **This month:** prepare the EIF application. Instruct Italian counsel on the company and the Art. 106 filing. Brief the German ministry unit.
- **This quarter:** file with the EIF and with the Bank of Italy.
- **Later:** Fondo di Garanzia accreditation once authorised. France stays parked.

## 7. Watches

- The InvestEU call deadline [c44][w1].
- InvestEU moving into the European Competitiveness Fund: will alternative lenders stay eligible? The Council took a partial position in June 2026 (unverified).
- The German counter-guarantee declarations after 2027 [w2].
- A Fondo di Garanzia reform decree for 2027 (unverified).
- Whether Bpifrance admits *sociétés de financement*.

## 8. Precedents

- **EU:** Froda, an SME-lending fintech, expanded its EIF-backed guarantees to €150m with coverage across the EU [w5]. Whether Froda holds a banking licence is not stated. Our own award records had no EIF deal with a non-bank lender.
- **Italy:** none found for a non-bank lender. The awards on record are guarantees to borrowers, not to lenders.
- **Germany and France:** none found. These would be first-of-a-kind asks.

## 9. Sources

- [c2–c4], [c12] Fondo di Garanzia operating rules 2023, sha 10198c227b8c
- [c5][c6] [Fondo portfolio rules, circ. 6/2018](https://www.fondidigaranzia.it/wp-content/uploads/2018/06/1_Modalita-operative-portafogli-fin_circ_6-2018.pdf), sha 68016c68454e
- [c8] [TUB Art. 106](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1993-09-01;385~art106), sha f7dfd42ca0f5
- [c9–c11] [TUB Art. 107](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1993-09-01;385~art107), sha c144a0b23168
- [c44–c47] EIF InvestEU guarantee products page, sha d3142570c7e7
- [c51][c53] [VDB counter-guarantee page](https://vdb.ermoeglicher.de/de/ueber-uns/service-downloads/staatliche-rueckbuergschaften/), sha a9adcbf8cdcf
- [w1] [EIF capped guarantee](https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee), 12 Nov 2026: "Alternative lenders"; "< 80%"; "< 25%"; "The EIF may determine that the deadline will end on an earlier date."
- [w2] [VDB](https://vdb.ermoeglicher.de/de/ueber-uns/service-downloads/staatliche-rueckbuergschaften/), 12 Nov 2026: "Die Rückbürgschaftserklärungen (RBE) und Rückgarantieerklärungen (RGE) für die Jahre 2023 bis 2027"; "Für Banken, Sparkassen und andere Finanzierungsinstitute sind ihre Bürgschaften als Kreditsicherheiten besonders wertvoll."
- [w3] [French Senate report](https://www.senat.fr/rap/r22-876/r22-876_mono.html), 12 Nov 2026: "Peuvent bénéficier de la garantie les prêts octroyés par les banques commerciales"; "entre 40 % et 70 %"
- [w5] [fintech.global on Froda](https://fintech.global/2025/02/07/froda-secures-e150m-eif-backed-guarantee-to-expand-sme-financing-across-europe/), 12 Nov 2026: "€150m in lending guarantees"
- [w6] [KWG §1](https://www.gesetze-im-internet.de/kredwg/__1.html): "die Gewährung von Gelddarlehen und Akzeptkrediten (Kreditgeschäft);"
- [w7] [KWG §32](https://www.gesetze-im-internet.de/kredwg/__32.html): "bedarf der schriftlichen oder elektronischen Erlaubnis der Aufsichtsbehörde;"

## 10. Questions for you

1. **Who is the legal lender on your loans, and in which entity do they sit?** That entity is the one that applies to the EIF and to the Italian fund.
2. **What share of the EUR 500M will be French and Italian loans?** That sets when the Italian status and a French licence pay off.
3. **Does your warehouse lender allow guarantee cover and a subsidiary in Italy?** Its terms could block either step.

**Note for the owner:** the funding playbook says a German reform is moving in parliament. I could not find one. The rule-change window I found is the counter-guarantee renewal after 2027, so please update the playbook or point me to the bill.
