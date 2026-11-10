# Bench run: fintech_guarantees, 2026-11-10

First bench run. Worked by Claude Code following `.claude/agents/wincent.md` (a dry run:
the founder's answers are the scenario's assumed `founder_followup`, not the owner's).
Tools: `web/scripts/brain_tool.ts` against production, read-only. Model cost: EUR 0 API
(owner's plan). Citations `[cN]` resolve in grounding and are stored with quote, URL,
sha256 and span in `2026-11-10_fintech_guarantees.ledger.json`; the profile used is
`2026-11-10_fintech_guarantees.profile.json`.

## The case (founder says)

> We are a fintech lender. We have raised EUR 40M. We want our SME loan portfolio
> guaranteed by public guarantee schemes in Germany, France and Italy, and at EU level.
> We do not have a banking licence. What are our routes?

## Wincent asks first

Before any instrument, I need your structure. Each answer changes the route:
1. **Legal form and seat?** Eligibility is decided by the entity that applies.
2. **Establishments in France or Italy?** Italian schemes, for example, look at who is
   established and authorised in Italy.
3. **Which licences or registrations do you hold** (banking, payment, investment firm,
   a national lender registration)? Every guarantee route below turns on it.
4. **How is the book funded, and how big is it now and in three years?** It sizes the
   cover and tells me whether you are a lender or a platform for someone else's balance sheet.
5. **Are you raising now?** A raise opens other routes and changes the sequencing.

**Founder (scenario's assumed answers):** German GmbH, no branches in France or Italy.
No banking, payment or investment-firm licence. We originate SME loans through our
platform and fund them from a EUR 150M warehouse facility; the book is EUR 120M today,
target EUR 500M in three years. Not raising equity now.

## Tool calls (14)

| # | Tool | Input (short) | What came back |
|---|---|---|---|
| 1 | find_instruments | guarantee, DE/FR/IT/EU | 6 guarantee instruments: 5 IT (Fondo di Garanzia family), 1 DE (Rückbürgschaften, Bürgschaftsbank BW). None FR, none EU. |
| 2 | assess_instrument | fondo_di_garanzia | status unknown; 12 gates from the 2023 Disposizioni operative, all `citation: null` (not linked in grounding) |
| 3 | fund_requirements | fondo_di_garanzia, "soggetti richiedenti ... 106 TUB" | beneficiary-side requirements only (Italian territory, SME, EUR 2.5M cap); nothing on who may request |
| 4 | application_route | fondo_di_garanzia | "Online submission exclusively via the Portale FdG ... by the requesting entity (bank/financial intermediary)" (curated, uncited) |
| 5 | assess_instrument | DE Rückbürgschaften (SA.110928) | status open, gates cited [c1]-[c5]; but assessed as if the company were the borrower |
| 6 | find_precedents | Mediocredito Centrale, guarantee | 3 Italian software SMEs that received FdG guarantees (register records, SA.109544) |
| 7 | find_precedents | European Investment Fund, guarantee | none found |
| 8 | find_precedents | Bpifrance, guarantee | none found |
| 9 | search_law | EU guarantee, financial intermediaries | [c6]-[c11], mostly COM(2011) 662 |
| 10 | search_law | European Competitiveness Fund, InvestEU | [c12]-[c15]; no ECF text in Regina's corpus |
| 11 | WebFetch | eif.org InvestEU Competitiveness capped guarantee | [w1] |
| 12 | WebFetch | bpifrance-creation.fr, guarantees of bank loans | [w2] |
| 13 | WebFetch | legifrance.gouv.fr, CMF L511-5 | [w3] |
| 14 | WebSearch | Bürgschaftsbank via Hausbank; FdG soggetti richiedenti | search excerpts only, not fetched: used as (unverified) |

## Answer

Run the EU first: the EIF's InvestEU guarantee lists alternative lenders as eligible
intermediaries and selects by an open call until 30 June 2027 [w1]. In Germany and
France, a public guarantee is mobilised by the lending bank, so your route is a partner
bank, not your own application [w2] (FR); (unverified) (DE). Italy is the one route that
rewards a licence: the Fondo di Garanzia is requested by the lender, and a supervised
Art. 106 TUB intermediary can request it directly (unverified, confirm in the current
Disposizioni operative). Probe the EIF this month, open one partner-bank conversation in
Germany, and decide on Italy only once Italian volume justifies a 106 authorisation
(judgement).

## Where you stand

- **EU (EIF / InvestEU):** eligible in principle. The product page names "Alternative
  lenders" among intermediary types and says nothing about licensing [w1]. The EU
  guarantee covers intermediaries who "provide debt finance to SMEs while passing on the
  advantage of the guarantee to the final beneficiaries" [c6] (2011 text, the mechanism
  is unchanged in kind: judgement). Due diligence and term-sheet fit decide (judgement).
- **Germany:** not directly. The Rückbürgschaften of the Bund and Länder back the
  Bürgschaftsbanken, which guarantee loans to "Unternehmen der gewerblichen Wirtschaft"
  [c1] "denen ausreichende bankübliche Sicherheiten fehlen" [c3]. That is the borrower
  side; the application normally runs through the borrower's Hausbank (unverified:
  Bürgschaftsbank pages, not fetched). As a non-bank you are not that Hausbank (judgement).
- **France:** not directly, and no lending at all without a status. Habitual credit
  operations are reserved to "un établissement de crédit ou une société de financement"
  [w3]. Bpifrance's bank-loan guarantee is mobilised by the bank: "la banque peut
  mobiliser la garantie de Bpifrance jusqu'à 60 % de son montant" [w2]. So France needs a
  partner bank, or a passported or French status, before any guarantee (judgement).
- **Italy:** not today. The Fondo is applied for "by the requesting entity
  (bank/financial intermediary)" through the Portale FdG (curated route, uncited). Without
  an Italian establishment or 106 status you are not a requesting entity (unverified).
  Beneficiaries not resident in Italy need "una sede o una filiale in Italia" (corpus gate,
  uncited in grounding).

## Flags

1. **No lending licence or registration (high).** Closes direct routes in FR and IT;
   in DE it makes you a non-Hausbank. Fix: partner-bank structure first; a licence only
   where the volume pays for it.
2. **No establishment in FR or IT (high for IT).** Fix: decide per market after the
   partner-bank talks, not before.
3. **Warehouse-funded book (medium).** A guarantee on loans a third party funds needs
   clarity on who is the lender of record (judgement). Fix: map the warehouse contract
   against each scheme's lender definition before any approach.

## Decisions for the founder

- **EIF now, in parallel with one partner bank in DE?** Recommend yes (judgement,
  confidence medium): lowest cost, highest fit.
- **A 106 TUB authorisation in Italy?** Recommend park until Italian origination is
  material (judgement, confidence medium).
- **France via a partner bank or via a société de financement?** Recommend partner bank
  first (judgement, confidence low until the French lending status is checked).

## Actions and drafts

1. Read the EIF call and the SME Competitiveness term sheet; check lender-of-record and
   warehouse funding against it. Owner: CFO. This week.
2. Low-effort probe to the EIF guarantees team (P1: head of the InvestEU SME guarantee /
   alternative-lending desk; name unknown, find through the call contact). Draft below.
3. Identify two German banks already distributing Bürgschaftsbank or KfW-guaranteed SME
   loans as partner-bank candidates (P1: head of SME lending / Förderkredite). This month.
4. Ask a French counsel one question: can your German GmbH originate French SME loans
   through a partner bank without its own status? This month.
5. Register in the EU Transparency Register before engaging Commission officials
   (sequencing; judgement). This month.

**Draft: to the EIF, InvestEU SME guarantees (founder sends)**

> Subject: InvestEU portfolio guarantee for an alternative SME lender
>
> Dear [Head of InvestEU SME guarantees],
>
> [Company] is a German alternative lender financing SMEs in Germany, France and Italy.
> Our book is EUR 120M today and we plan EUR 500M within three years, all to SMEs that
> banks serve poorly on collateral. The InvestEU call lists alternative lenders among
> eligible intermediaries. We would value 30 minutes to understand which of your
> products fits our model and what you would expect from us before an expression of
> interest.
>
> Yours sincerely, [Name], CEO

## Plan

- **This week:** EIF call and term sheet read; probe sent.
- **This month:** two German partner-bank conversations; French counsel question;
  Transparency Register entry.
- **This quarter:** EIF expression of interest if the probe is positive; one partner-bank
  pilot.
- **Later / parked:** Italy (106 TUB) until volume justifies it; France own status.

## Watches

- InvestEU moving under the European Competitiveness Fund: do alternative lenders stay
  eligible? Regina's corpus returned no ECF text (calls 10: [c12]-[c15] are older
  documents), so this rests on the playbook's watch, unverified here.
- EIF call deadline 30 June 2027, "The EIF may determine that the deadline will end on an
  earlier date" [w1].
- STEP's InvestEU window, whose implementing partners "deploy debt (including
  guarantees)" [c14].
- Italy: Fondo di Garanzia operating rules (Disposizioni operative) on requesting
  entities (parked route).
- France: Bpifrance guarantee conditions for partner banks (parked route).

## Precedents

- **Mediocredito Centrale:** 3 Italian software SMEs that received Fondo guarantees in
  May 2026 (PROGTECH S.R.L., IMPROVING SYSTEM S.R.L., VIS.PA S.R.L.; register records,
  https://competition-cases.ec.europa.eu/cases/SA.109544). These are borrowers, not a
  lender like you: no intermediary precedent found.
- **EIF, Bpifrance:** none in Wincent's award records. A first-of-a-kind ask for us;
  look for the EIF's published InvestEU signature list before the probe (judgement).

## Sources

| id | what | URL | sha256 / date |
|---|---|---|---|
| c1, c3 | VDB, staatliche Rückbürgschaften | https://vdb.ermoeglicher.de/de/ueber-uns/service-downloads/staatliche-rueckbuergschaften/ | a9adcbf8cdcf |
| c6, c12 | COM(2011) 662, a framework for the next generation of innovative financial instruments | https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52011DC0662 | 6953eeb3e564 |
| c14 | COM(2023) 335, STEP proposal | https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52023PC0335 | e0500f7aa3e2 |
| w1 | EIF, InvestEU Competitiveness capped guarantee: "Alternative lenders"; "The EIF selects financial intermediaries based on a call for expression of interest"; "30 June 2027" | https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee | 2026-11-10 |
| w2 | Bpifrance Création: "la banque peut mobiliser la garantie de Bpifrance jusqu'à 60 % de son montant, sans instruction préalable de Bpifrance" | https://bpifrance-creation.fr/moment-de-vie/qui-puis-je-solliciter-garantir-mon-emprunt-bancaire | 2026-11-10 |
| w3 | CMF art. L511-5 (version 2015-08-19): "Il est interdit à toute personne autre qu'un établissement de crédit ou une société de financement d'effectuer des opérations de crédit à titre habituel." | https://www.legifrance.gouv.fr/codes/id/LEGIARTI000031063781/2015-08-19 | 2026-11-10 |

The other ledger ids (c2, c4, c5, c7-c11, c13, c15) were returned and not used.

## Questions for the founder

- Who is the lender of record on the warehouse-funded loans? It decides which entity a
  scheme would guarantee.
- Do you have, or want, a bank partner in Germany today?
- How much of the EUR 500M target is France and Italy? It decides whether a licence pays.

## Self-check against the scenario (Claude, not the owner)

Met: asks structure first; licence worked per jurisdiction; FR mechanics cited, not
asserted; EIF alternative-lender eligibility cited; ECF watch; precedents or "none";
prioritised parallel routes with parking; watches; one draft. Weak: the Hausbank
principle and Italy's Art. 106 TUB are **unverified** (search excerpts, not fetched, and
not in grounding), where the scenario wants them cited; P1/P2 named by role only, no
people (actors register empty); political side not mapped.

## Bench findings for the build (not for the founder)

1. **Guarantee fix holds:** `find_instruments` now returns the 6 guarantee instruments in
   scope (before: asked as "loan", none).
2. **Beneficiary vs intermediary is not modelled:** `assess_instrument` rates the DE
   Rückbürgschaften "open" for this company because it assesses the company as the
   borrower. For a lender that reads as a false positive. Phase 2: an intermediary-side
   assessment (playbook §1, "the intermediary route").
3. **Fondo di Garanzia gates are uncited:** all 12 come back `citation: null`; the
   Disposizioni operative 2023 PDF is not linked in `eligibility_grounding`. And
   `fund_requirements` does not surface its "soggetti richiedenti" text.
4. **Precedent kind mislabel:** guarantee awards (StateAidInstrumentG) show
   `kind: "grant"` because the SATR aid element is stored in `grant_amount_eur`.
5. **Regina's corpus:** EU guarantee passages come mostly from a 2011 communication; no
   European Competitiveness Fund document is loaded.
6. **Orchestrator (not changed here):** ask-first and the `licencesHeld` / `raisingNow`
   profile fields belong to the mission orchestrator and profile vocabulary (Phase 1 fix
   list). The bench agent asks first by instruction; production Mandate still does not.

## Grade (owner)

```
grade:
must/must_not:
edits: |
playbook: |
```
