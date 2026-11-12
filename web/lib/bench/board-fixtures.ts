// Case-board fixtures: two conversations whose replies carry mandate-board
// blocks, to build and check the board without a brain turn.
//
// - fintech: the board a brain would emit for the real bench run
//   mandate/eval/runs/bench/2026-11-10_fintech_guarantees_round3.md; every
//   citation, quote and URL is that run's own.
// - forklift: ILLUSTRATIVE. The eval case forklift_spatial_dk_de has no graded
//   run yet; the levers are the ones the owner named, but the URLs point to the
//   institutions' home pages and the conditions are marked (unverified). It is
//   a layout fixture, never evidence.
import type { Citation } from "./events";
import type { BenchConversation } from "./model";

const block = (o: unknown) => "```mandate-board\n" + JSON.stringify(o, null, 2) + "\n```";
const AT = "2026-11-12T09:00:00.000Z";
const at = (min: number) => new Date(Date.parse(AT) + min * 60_000).toISOString();

// ── forklift (illustrative) ────────────────────────────────────────────────

const FK_WEB: Record<string, Citation> = {
  w1: { label: "EIFO, Export and Investment Fund of Denmark: financing and guarantees", url: "https://www.eifo.dk/en/" },
  w2: { label: "EIFO: buyer financing for foreign customers of Danish exporters", url: "https://www.eifo.dk/en/" },
  w3: { label: "EIFO: venture and growth equity, co-investment", url: "https://www.eifo.dk/en/" },
  w4: { label: "European Investment Fund: InvestEU guarantee products (via banks and lessors)", url: "https://www.eif.org/InvestEU/index.htm" },
  w5: { label: "KfW: SME loans through the Hausbank", url: "https://www.kfw.de/" },
  w6: { label: "Bürgschaftsbank Bayern: guarantees for SME bank loans", url: "https://www.bb-bayern.de/" },
  w7: { label: "EIC Fund (European Innovation Council)", url: "https://eic.ec.europa.eu/" },
  w8: { label: "KfW Capital: fund-of-funds for German VC funds", url: "https://www.kfw-capital.de/" },
  w9: { label: "Regulation (EU) 2023/1230 on machinery (EUR-Lex)", url: "https://eur-lex.europa.eu/eli/reg/2023/1230/oj", quote: "It shall apply from 20 January 2027." },
  w10: { label: "BGHW, Berufsgenossenschaft Handel und Warenlogistik: prevention", url: "https://www.bghw.de/" },
  w11: { label: "BG BAU: prevention incentives (Arbeitsschutzprämien)", url: "https://www.bgbau.de/" },
};

const FK_SOURCES = Object.entries(FK_WEB).map(([id, c]) => `- [${id}] ${c.label}, ${c.url}`).join("\n");

const fkTurn2 = {
  title: "Forklift spatial awareness: cheaper capital for deployments, public money in the Series A",
  stage: "diagnose",
  answer: {
    lines: [
      "Two problems, two kinds of money: debt for the hardware you pre-finance, equity for growth.",
      "Equity is the most expensive way to carry installed kit; lead with Danish public debt through the ApS.",
    ],
    confidence: "medium",
    confidence_why: "The doors are open on paper; the Danish content share and the contracting entity are not confirmed.",
    open_question: "Does the Danish ApS stay the contracting party for German customers, and what share of each system is Danish or EU content?",
    cite: ["judgement"],
  },
  routes: {
    levels: [
      { id: "dk", level: "national", label: "Denmark", country: "DK", doors: [
        { id: "eifo-guarantee", name: "EIFO guarantee on the bank working-capital line", institution: "EIFO", status: "open", why: "Lets the ApS's bank lend more against deployments at a lower margin.", cite: ["w1"] },
        { id: "eifo-buyer", name: "EIFO Buyer Financing", institution: "EIFO", status: "probe", why: "Moves the upfront cost to the customer's bank; conditions decide it.", conditions: ["ApS is the exporter of record", "Danish content share (unverified threshold)"], cite: ["w2", "unverified"] },
      ] },
    ],
  },
};

const fkTurn3 = {
  stage: "options",
  answer: {
    lines: [
      "Split the problem: debt for installed hardware, equity for growth. Equity is the dearest way to pre-finance kit.",
      "Lead with EIFO through the ApS: a guaranteed working-capital line now, Buyer Financing to move the upfront cost to the customer's bank.",
      "Put EIFO co-investment in the Series A term sheet before close; use the Bavarian GmbH for KfW and the Bürgschaftsbank.",
    ],
    confidence: "medium",
    confidence_why: "EIFO's doors are open on paper; the content share and the lead investor's appetite for a public co-investor are unconfirmed.",
    open_question: "Will the lead accept EIFO alongside it on the same terms, and can the term sheet wait the four to six weeks that takes?",
    cite: ["judgement"],
  },
  routes: {
    levels: [
      { id: "eu", level: "eu", label: "EU", doors: [
        { id: "investeu-lessors", name: "InvestEU guarantees via your banks and lessors", institution: "EIF", via: "the house bank or a leasing company holding an InvestEU guarantee", status: "open", why: "The EU money reaches you through an intermediary that already carries the guarantee: ask which of yours do.", cite: ["w4"] },
        { id: "eic-fund", name: "EIC Fund", institution: "European Innovation Council", status: "probe", why: "Deep-tech equity, but its timeline rarely fits a four-month close.", conditions: ["EIC Accelerator selection first (unverified for this round)"], cite: ["w7", "unverified"] },
        { id: "eif-vc", name: "EIF via the VC funds it backs", institution: "EIF", via: "EIF-backed VC funds in or near the round", status: "probe", why: "No direct ticket: check which candidate funds have EIF as an LP.", cite: ["w4", "judgement"] },
      ] },
      { id: "dk", level: "national", label: "Denmark", country: "DK", doors: [
        { id: "eifo-guarantee", name: "EIFO guarantee on the bank working-capital line", institution: "EIFO", status: "open", why: "Lets the ApS's bank lend more against deployments at a lower margin.", conditions: ["Applied for by the bank, with the ApS"], cite: ["w1"] },
        { id: "eifo-growth", name: "EIFO Growth Loan", institution: "EIFO", status: "open", why: "Direct, subordinated debt for scaling companies with revenue; fits EUR 6M turnover.", conditions: ["Co-financing by bank or investors (unverified ratio)"], cite: ["w1", "unverified"] },
        { id: "eifo-buyer", name: "EIFO Buyer Financing", institution: "EIFO", status: "open", why: "The customer's bank lends to the customer under EIFO cover; you are paid at go-live.", conditions: ["ApS is the exporter of record", "Danish content share (threshold unverified)", "Ticket size worth the paperwork per customer"], cite: ["w2", "unverified"] },
        { id: "eifo-coinvest", name: "EIFO co-investment in the Series A", institution: "EIFO", status: "open", why: "Public equity alongside a private lead, on the lead's terms.", conditions: ["Private lead in place", "In the term sheet before close"], cite: ["w3"] },
      ] },
      { id: "de", level: "national", label: "Germany", country: "DE", doors: [
        { id: "kfw-380", name: "KfW 380 via the Hausbank", institution: "KfW", via: "the GmbH's Hausbank", status: "probe", why: "Only through the GmbH and its bank; useful if the GmbH carries German deployments.", conditions: ["The GmbH is the investing entity", "Applied for by the Hausbank"], cite: ["w5", "unverified"] },
        { id: "kfw-capital", name: "KfW Capital via the funds it backs", institution: "KfW Capital", via: "German VC funds with KfW Capital as LP", status: "probe", why: "Public equity reaches the round through its funds, not directly.", cite: ["w8"] },
      ] },
      { id: "by", level: "regional", label: "Bavaria", country: "DE-BY", doors: [
        { id: "bb-bayern", name: "Bürgschaftsbank Bayern guarantee", institution: "Bürgschaftsbank Bayern", via: "the GmbH's Hausbank", status: "probe", why: "Backs part of the Hausbank loan to the GmbH; adds no cash itself.", cite: ["w6", "unverified"] },
      ] },
      { id: "customer", level: "customer", label: "Customer side", doors: [
        { id: "prevention", name: "BG BAU / BGHW prevention premium", institution: "BGHW, BG BAU", status: "probe", why: "Accident insurers reward safety investments; could cut the customer's net cost.", conditions: ["Is your system on the insurer's eligible list? (unverified)"], cite: ["w10", "w11", "unverified"] },
        { id: "depreciation", name: "Customer tax depreciation and investment grants", status: "probe", why: "Lowers the buyer's cost; varies by country and customer.", cite: ["judgement"] },
      ] },
      { id: "lobby", level: "lobby", label: "Regulation", doors: [
        { id: "machinery", name: "Machinery Regulation as a sales tailwind", institution: "European Commission, DG GROW", status: "open", why: "Applies from 20 January 2027; safety functions become a compliance argument.", cite: ["w9"] },
      ] },
    ],
  },
  roadmap: {
    origin: "2026-12",
    horizon: 9,
    tracks: [
      { id: "debt", label: "Debt", steps: [
        { id: "eifo-call", label: "First call with EIFO", start: 0, end: 0.5, owner: "us", status: "active" },
        { id: "bank-line", label: "Guaranteed WC line with ApS bank", start: 0.5, end: 3, owner: "institution", status: "planned", depends_on: ["eifo-call"], cite: ["w1"] },
        { id: "growth-loan", label: "EIFO Growth Loan application", start: 1, end: 3.5, owner: "client", status: "planned", depends_on: ["eifo-call"] },
        { id: "wc-live", label: "Working capital in place", start: 4, milestone: true, owner: "client", status: "planned", depends_on: ["bank-line"] },
      ] },
      { id: "customer", label: "Customer financing", steps: [
        { id: "buyer-terms", label: "Confirm Buyer Financing terms", start: 0.25, end: 1.5, owner: "us", status: "planned", cite: ["w2"] },
        { id: "lessor", label: "Shortlist InvestEU-backed lessors", start: 1, end: 2.5, owner: "us", status: "planned", cite: ["w4"] },
        { id: "pilot", label: "Pilot deal with one German customer", start: 2, end: 5.5, owner: "client", status: "planned", depends_on: ["buyer-terms"] },
      ] },
      { id: "equity", label: "Equity", steps: [
        { id: "lead-brief", label: "Brief the lead on EIFO", start: 0, end: 0.5, owner: "client", status: "active" },
        { id: "eifo-ts", label: "EIFO co-invest into the term sheet", start: 0.5, end: 3, owner: "institution", status: "planned", depends_on: ["lead-brief"], cite: ["w3"] },
        { id: "lp-map", label: "Map EIF / KfW Capital-backed funds", start: 0, end: 1, owner: "us", status: "planned", cite: ["w8"] },
        { id: "close", label: "Series A close", start: 4, milestone: true, owner: "client", status: "planned", depends_on: ["eifo-ts"] },
      ] },
      { id: "germany", label: "Germany (GmbH)", steps: [
        { id: "hausbank", label: "Hausbank on KfW 380", start: 1, end: 3, owner: "client", status: "planned", cite: ["w5"] },
        { id: "bb", label: "Bürgschaftsbank Bayern", start: 2, end: 4.5, owner: "institution", status: "planned", depends_on: ["hausbank"], cite: ["w6"] },
      ] },
      { id: "regulatory", label: "Regulatory and customer", steps: [
        { id: "premium", label: "Probe BG prevention premium", start: 1, end: 2.5, owner: "us", status: "planned", cite: ["w10"] },
        { id: "mr-applies", label: "Machinery Regulation applies", start: "2027-01-20", milestone: true, owner: "institution", status: "planned", cite: ["w9"] },
        { id: "roi", label: "Customer ROI sheet with every lever", start: 2, end: 3, owner: "us", status: "planned", depends_on: ["premium"] },
      ] },
    ],
  },
  stakeholders: {
    institutions: [
      { id: "eifo", name: "EIFO", side: "public-capital", country: "DK", units: [
        { id: "sme", name: "Growth and SME lending", roles: [{ id: "am", role: "Account manager, growth loans", priority: "P1", reach: "EIFO's business contact line, as an existing Danish exporter", status: "to_approach", cite: ["w1"] }] },
        { id: "export", name: "Export and buyer financing", roles: [{ id: "buyer", role: "Head of buyer financing", priority: "P1", reach: "Through the account manager; bring one live German deal", status: "to_approach", cite: ["w2"] }] },
        { id: "equity", name: "Venture and growth equity", roles: [{ id: "id", role: "Investment director, co-investment", priority: "P1", reach: "Warm intro from the lead investor", status: "engaged", note: "Lead has co-invested with EIFO before (client, unverified)", cite: ["w3", "unverified"] }] },
      ] },
      { id: "eif", name: "European Investment Fund", side: "public-capital", country: "EU", units: [
        { id: "guarantees", name: "InvestEU guarantees", roles: [{ id: "via", role: "Not approached directly: the bank or lessor holding the guarantee", priority: "P2", reach: "Ask your banks and lessors which carry InvestEU cover", status: "to_approach", cite: ["w4"] }] },
      ] },
      { id: "kfw", name: "KfW", side: "public-capital", country: "DE", units: [
        { id: "hausbank", name: "SME lending (via Hausbank)", roles: [{ id: "rm", role: "Relationship manager at the GmbH's Hausbank", priority: "P1", reach: "The GmbH's existing bank; KfW is applied for by the bank", status: "to_approach", cite: ["w5"] }] },
      ] },
      { id: "bbb", name: "Bürgschaftsbank Bayern", side: "public-capital", country: "DE-BY", units: [
        { id: "credit", name: "Guarantees", roles: [{ id: "officer", role: "Credit officer, SME guarantees", priority: "P2", reach: "Through the Hausbank's application", status: "to_approach", cite: ["w6"] }] },
      ] },
      { id: "lead", name: "Series A lead investor", side: "market", units: [
        { id: "deal", name: "Deal team", roles: [{ id: "partner", role: "Lead partner", priority: "P1", reach: "Direct (client relationship)", status: "engaged", cite: ["judgement"] }] },
      ] },
      { id: "bghw", name: "BGHW and BG BAU", side: "market", country: "DE", units: [
        { id: "prev", name: "Prevention departments", roles: [{ id: "pm", role: "Prevention adviser for intralogistics", priority: "P2", reach: "Through a customer that is a member", status: "to_approach", cite: ["w10", "w11"] }] },
      ] },
      { id: "dggrow", name: "European Commission, DG GROW", side: "political", country: "EU", units: [
        { id: "machinery", name: "Machinery and equipment unit", roles: [{ id: "po", role: "Policy officer, machinery safety (Regina's file)", priority: "P2", reach: "Via Regina: industry dialogue on implementation guidance", status: "to_approach", cite: ["w9"] }] },
      ] },
    ],
  },
  funding_stack: {
    currency: "EUR",
    need: { amount: 20_000_000, label: "Series A EUR 12M plus about EUR 8M deployment working capital over 18 months (client estimate)" },
    instruments: [
      { id: "private", name: "Series A, private lead and syndicate", type: "equity", amount: 8_000_000, amount_max: 9_000_000, terms: "Most expensive money; growth, team, product", status: "in_progress", cite: ["judgement"] },
      { id: "eifo-co", name: "EIFO co-investment", type: "public_coinvest", amount: 2_500_000, amount_max: 3_500_000, terms: "Pari passu with the lead; needs the term sheet", status: "probe", cite: ["w3"] },
      { id: "eifo-guar", name: "Bank WC line with EIFO guarantee", type: "guarantee_debt", amount: 2_000_000, amount_max: 3_000_000, terms: "Bank margin plus guarantee fee (unverified)", status: "probe", cite: ["w1", "unverified"] },
      { id: "investeu", name: "Lessor / bank line with InvestEU cover", type: "guarantee_debt", amount: 1_000_000, amount_max: 2_000_000, terms: "Through the intermediary; cheaper than unguaranteed", status: "probe", via: "a bank or lessor", cite: ["w4"] },
      { id: "growth", name: "EIFO Growth Loan", type: "loan", amount: 1_500_000, amount_max: 2_500_000, terms: "Subordinated, longer tenor (unverified)", status: "probe", cite: ["w1", "unverified"] },
      { id: "kfw", name: "KfW 380 via Hausbank (GmbH)", type: "loan", amount: 500_000, amount_max: 1_000_000, terms: "Low rate; GmbH only", status: "planned", cite: ["w5"] },
      { id: "buyer", name: "EIFO Buyer Financing", type: "customer_side", amount: 2_000_000, amount_max: 3_000_000, terms: "Customer's bank pays you at go-live; off your balance sheet", status: "probe", cite: ["w2"] },
      { id: "bb", name: "Bürgschaftsbank Bayern", type: "guarantee_debt", terms: "Backs the KfW/Hausbank loan; adds no cash", status: "planned", cite: ["w6"] },
      { id: "premium", name: "BG prevention premium", type: "customer_side", terms: "Lowers the customer's net cost; per insurer", status: "probe", cite: ["w10", "w11"] },
    ],
  },
  process: [
    { id: "buyer-financing", title: "How EIFO Buyer Financing moves the upfront cost", caption: "The ApS delivers; the customer's bank pays at go-live under EIFO cover; the customer repays its bank, not you.", nodes: [
      { id: "aps", label: "Your ApS", sub: "Denmark, exporter", kind: "client", col: 0, row: 0 },
      { id: "eifo", label: "EIFO", sub: "guarantees the loan", kind: "institution", col: 0, row: 1 },
      { id: "bank", label: "Customer's bank", sub: "lends to the buyer", kind: "bank", col: 1, row: 1 },
      { id: "cust", label: "German customer", sub: "warehouse operator", kind: "customer", col: 2, row: 0 },
    ], edges: [
      { from: "aps", to: "cust", label: "delivers and installs", kind: "asset" },
      { from: "eifo", to: "bank", label: "covers the credit risk", kind: "risk" },
      { from: "bank", to: "aps", label: "pays at go-live", kind: "money" },
      { from: "cust", to: "bank", label: "repays over 3 to 5 years", kind: "money" },
    ], cite: ["w2", "unverified"] },
    { id: "equity-channels", title: "How public equity reaches the round", caption: "Directly through EIFO co-investment; indirectly through the VC funds that KfW Capital and the EIF back.", nodes: [
      { id: "kfwc", label: "KfW Capital", sub: "fund-of-funds", kind: "institution" },
      { id: "eif", label: "EIF", sub: "fund-of-funds", kind: "institution" },
      { id: "vc", label: "VC funds", sub: "lead and syndicate", kind: "fund" },
      { id: "eifo", label: "EIFO", sub: "co-investor", kind: "institution" },
      { id: "co", label: "Your company", sub: "Series A", kind: "client" },
    ], edges: [
      { from: "kfwc", to: "vc", label: "LP commitment", kind: "money" },
      { from: "eif", to: "vc", label: "LP commitment", kind: "money" },
      { from: "vc", to: "co", label: "about EUR 8-9M", kind: "money" },
      { from: "eifo", to: "co", label: "co-invests, same terms", kind: "money" },
    ], cite: ["w3", "w8"] },
  ],
  risks_flags: [
    { id: "content", kind: "deal_breaker", severity: "high", title: "Buyer Financing depends on Danish content and an ApS contract", detail: "If the GmbH signs German contracts, or Danish content is too low, the door shuts.", fix: "Keep the ApS as contracting party; document the Danish and EU value share per system.", cite: ["w2", "unverified"] },
    { id: "timing", kind: "flag", severity: "high", title: "EIFO co-investment must be in the term sheet before close", fix: "Brief the lead this week; EIFO joins at term sheet stage, not after.", cite: ["w3"] },
    { id: "balance", kind: "flag", severity: "medium", title: "Hardware sits on your balance sheet until go-live", detail: "That is what makes working capital scale with every deployment.", fix: "Move title to the lessor or the customer's bank at delivery.", cite: ["judgement"] },
    { id: "gmbh", kind: "flag", severity: "medium", title: "KfW and the Bürgschaftsbank work only through the GmbH", fix: "Decide which German deployments the GmbH carries before the Hausbank meeting.", cite: ["w5", "w6"] },
    { id: "eic", kind: "flag", severity: "low", title: "EIC Fund timing does not fit a four-month close", fix: "Treat it as a follow-on, not part of this round.", cite: ["w7", "judgement"] },
  ],
};

const fkTurn4 = {
  stage: "next_steps",
  routes: { levels: [
    { id: "dk", level: "national", label: "Denmark", country: "DK", doors: [
      { id: "eifo-coinvest", name: "EIFO co-investment in the Series A", institution: "EIFO", status: "open", why: "The lead has agreed to bring EIFO in at term sheet stage.", conditions: ["Private lead in place: yes", "In the term sheet before close"], cite: ["w3"] },
    ] },
  ] },
  roadmap: { tracks: [
    { id: "equity", label: "Equity", steps: [
      { id: "lead-brief", label: "Brief the lead on EIFO", start: 0, end: 0.5, owner: "client", status: "done" },
      { id: "eifo-ts", label: "EIFO co-invest into the term sheet", start: 0.5, end: 3, owner: "institution", status: "active", depends_on: ["lead-brief"], cite: ["w3"] },
    ] },
  ] },
};

export const FORKLIFT: BenchConversation = {
  id: "fixture-forklift",
  mandate_id: null, agent: "wincent", brain: "wincent", kind: "chat",
  title: "Forklift spatial awareness: deployment capital and the Series A",
  session_id: null, saved: [], sources: [],
  cites: FK_WEB,
  created_at: at(0), updated_at: at(40),
  messages: [
    { role: "client", at: at(0), text: "We build spatial-awareness hardware fitted to forklifts and other intralogistics vehicles, with monitoring software. HQ in Denmark (ApS) with a German subsidiary (GmbH). We deploy like a system integrator: we carry all upfront costs and the customer pays only once everything runs. That working-capital burden holds back our scaling. What can we do at state level to get cheaper capital for this model? And we are about to raise an equity round: can we get public equity into the round?" },
    { role: "agent", at: at(2), text: "Two things decide the routes before any instrument.\n\n1. **Which entity signs the customer contracts, and where is the hardware made?** Danish export finance follows the exporter of record and the Danish content (judgement).\n2. **How big is the round, and when does it close?** Public co-investment has to be in the term sheet, not added after.\n\nWhich entity signs, and when do you close?" },
    { role: "client", at: at(10), text: "The Danish ApS signs most contracts, including German ones; hardware is assembled in Denmark from EU components. Hardware stays on our balance sheet until go-live, then passes to the customer. Revenue about EUR 6M, 45 staff. Raising EUR 12M Series A, lead in talks, close in about four months. The GmbH sits in Bavaria." },
    { role: "agent", at: at(14), text: `That changes the picture. You have two problems, and they want different money. The installed hardware is a **debt** problem: equity is the most expensive way to carry kit that pays back at go-live (judgement). The round is the **equity** problem.\n\nBecause the ApS signs and assembles in Denmark, the open door is EIFO, through the parent [w1]. Its Buyer Financing could move the upfront cost to the customer's bank, if the Danish content holds [w2] (unverified threshold).\n\nDoes that match how your German customers buy today?\n\n${block(fkTurn2)}` },
    { role: "client", at: at(22), text: "Yes. Most of them would rather not pay upfront either. What are the options?" },
    { role: "agent", at: at(30), text: `Three routes, run in parallel:\n\n- **Debt through the ApS (lead).** An EIFO guarantee on your bank's working-capital line and a Growth Loan [w1].\n- **Move the cost off you.** Buyer Financing and InvestEU-backed lessors [w2][w4].\n- **Public equity in the round.** EIFO co-investment, in the term sheet [w3]; KfW Capital and the EIF only through the funds they back [w8].\n\nThe GmbH in Bavaria opens KfW and the Bürgschaftsbank, but only for what the GmbH itself carries [w5][w6]. On the customer side, the accident insurers' prevention premiums are worth a probe [w10][w11], and the Machinery Regulation, applying from 20 January 2027, makes safety a compliance argument [w9].\n\nWill your lead accept EIFO alongside it on the same terms?\n\n${block(fkTurn3)}\n\nSources (illustrative fixture):\n${FK_SOURCES}` },
    { role: "client", at: at(36), text: "The lead says yes, bring EIFO in at term sheet stage. I briefed them yesterday." },
    { role: "agent", at: at(40), text: `Good: that moves EIFO co-investment from a probe to a live track [w3]. Next: I draft the note to EIFO's co-investment team for your lead to forward, and we book the first call on the debt side this week.\n\nShall I draft it?\n\n${block(fkTurn4)}` },
  ],
};

// ── fintech guarantees (from the real round-3 run) ─────────────────────────

const FT_CITES: Record<string, Citation> = {
  c1: { label: "EIF InvestEU guarantee products page", quote: "Deadline for applications: 30 June 2027" },
  c3: { label: "EIF InvestEU guarantee products page", quote: "For guarantees: credit or financial institutions, alternative lenders, leasing companies." },
  c4: { label: "EIF InvestEU guarantee products page", quote: "application, EIF selection, guarantee agreement" },
  w1: { label: "Fondo di Garanzia: modalità operative, portafogli", url: "https://www.fondidigaranzia.it/wp-content/uploads/2019/12/Modalità-operative-portafogli-20121218.pdf", quote: "“Intermediari”: gli intermediari finanziari iscritti nell’albo di cui all’articolo 106 del TUB" },
  w2: { label: "Banca d'Italia: intermediari finanziari, accesso al mercato", url: "https://www.bancaditalia.it/compiti/vigilanza/accesso-mercato/intermediari-finanziari/index.html", quote: "sede legale e direzione generale situate in Italia" },
  w3: { label: "KfW Merkblatt 366 (Stand 01.09.2026)", url: "https://www.kfw.de/PDF/Download-Center/F%C3%B6rderprogramme-(Inlandsf%C3%B6rderung)/PDF-Dokumente/6000004843_M_366.pdf", quote: "Die KfW gewährt Kredite aus diesem Programm über Finanzierungspartner (Banken und Sparkassen)." },
  w4: { label: "Banque de France, Fiche 504: Les garanties Bpifrance", url: "https://www.banque-france.fr/system/files/2024-04/823415-Fiche-504.pdf", quote: "Cette garantie ne bénéficie qu’à l’établissement financier" },
  w5: { label: "Légifrance, Code monétaire et financier, art. L511-5", url: "https://www.legifrance.gouv.fr/codes/id/LEGIARTI000031063781/2015-08-19", quote: "Il est interdit à toute personne autre qu'un établissement de crédit ou une société de financement" },
  w6: { label: "KWG §1", url: "https://www.gesetze-im-internet.de/kredwg/__1.html", quote: "die Gewährung von Gelddarlehen und Akzeptkrediten (Kreditgeschäft);" },
  w8: { label: "EIF, InvestEU Competitiveness capped guarantee", url: "https://www.eif.org/guarantee-products/all/investeu-competitiveness-capped-guarantee", quote: "alternative lenders; rate < 80%, cap < 25%, fee 0.2% p.a." },
  w9: { label: "EIF, InvestEU Innovation and Digitalisation capped guarantee", url: "https://www.eif.org/guarantee-products/all/investeu-innovation-digitalisation-capped-guarantee", quote: "support the uptake of digital technologies and digital transformation of enterprises." },
  w10: { label: "ERA Austria: Council position on the European Competitiveness Fund", url: "https://era.gv.at/news-items/council-agrees-its-position-on-european-competitiveness-fund/", quote: "aligns key features of the ECF's InvestEU instrument with the current InvestEU programme." },
  w11: { label: "FinTech Global: Froda secures EUR 150M EIF-backed guarantee", url: "https://fintech.global/2025/02/07/froda-secures-e150m-eif-backed-guarantee-to-expand-sme-financing-across-europe/", quote: "across all 27 EU member states" },
  w12: { label: "KfW, Der Deutschlandfonds, Faktenblatt", url: "https://www.kfw.de/Presse-Newsroom/Aktuelles/Deutschlandfonds/Der-Deutschlandfonds_Faktenblatt_171225_final.pdf", quote: "Industrie und Mittelstand bis zu 8 Milliarden Euro Garantien" },
};

const ftBoard = {
  title: "Fintech lender: public guarantees on the SME book, DE · FR · IT · EU",
  stage: "write_up",
  answer: {
    lines: [
      "Go to the EU first: the EIF's InvestEU guarantees name alternative lenders and one agreement covers all three markets.",
      "Italy: get Art. 106 TUB status through an Italian entity; it unlocks the Fondo di Garanzia.",
      "Germany: no route without a banking licence; work the reform through the BMWE. France: park.",
    ],
    confidence: "medium",
    confidence_why: "High on the EIF's eligibility of the type; medium on fit until the lender of record is known.",
    open_question: "Who signs each loan and who holds it: the GmbH, a fronting bank, or the warehouse SPV?",
    cite: ["c3", "w8", "w1", "w3"],
  },
  routes: { levels: [
    { id: "eu", level: "eu", label: "EU", doors: [
      { id: "sme-comp", name: "InvestEU SME Competitiveness guarantee", institution: "EIF", status: "open", why: "Built for the riskier slice of an SME book; alternative lenders named; open to 30 June 2027.", conditions: ["Rate under 80%, cap under 25%, fee 0.2% p.a.", "Expression of interest, EIF due diligence, agreement"], cite: ["c1", "c3", "w8"] },
      { id: "innov-dig", name: "InvestEU Innovation and Digitalisation guarantee", institution: "EIF", status: "probe", why: "Only for loans that finance digital uptake.", cite: ["w9"] },
    ] },
    { id: "it", level: "national", label: "Italy", country: "IT", doors: [
      { id: "fondo", name: "Fondo di Garanzia per le PMI, portfolio guarantee", institution: "MCC / Fondo di Garanzia", status: "probe", why: "Open to 106 intermediaries; the status is the unlock, a plan step.", conditions: ["Italian entity with seat and head office in Italy", "EUR 2M paid-in capital", "Accreditation with the Fondo"], cite: ["w1", "w2"] },
    ] },
    { id: "de", level: "national", label: "Germany", country: "DE", doors: [
      { id: "kfw", name: "KfW risk relief and Bürgschaftsbanken", institution: "KfW", status: "shut", why: "Runs only through banks and savings banks; no door for a non-bank today.", cite: ["w3"] },
    ] },
    { id: "fr", level: "national", label: "France", country: "FR", doors: [
      { id: "bpi", name: "Bpifrance guarantee", institution: "Bpifrance", status: "park", why: "Benefits only the lending institution; lending is reserved to banks and sociétés de financement.", conditions: ["Decide on a French status after the EIF numbers"], cite: ["w4", "w5"] },
    ] },
    { id: "lobby", level: "lobby", label: "Policy", doors: [
      { id: "reform", name: "German reform admitting non-bank lenders", institution: "BMWE", status: "open", why: "The political route: engage the unit before the Deutschlandfonds guarantees are designed around banks.", conditions: ["Bill not yet identified (unverified)"], cite: ["w12", "unverified"] },
      { id: "ecf", name: "InvestEU into the Competitiveness Fund", institution: "Council / Commission", status: "probe", why: "Watch that alternative lenders stay eligible intermediaries.", cite: ["w10"] },
    ] },
  ] },
  roadmap: {
    origin: "2026-11",
    horizon: 12,
    tracks: [
      { id: "eu", label: "EU guarantee", steps: [
        { id: "flag1", label: "Answer: who is the lender of record", start: 0, end: 0.25, owner: "client", status: "active" },
        { id: "probe", label: "EIF probe (draft 1)", start: 0, end: 0.25, owner: "us", status: "planned" },
        { id: "eoi-prep", label: "Prepare expression of interest", start: 0.25, end: 1, owner: "client", status: "planned", depends_on: ["flag1"] },
        { id: "eoi", label: "File expression of interest", start: 1, end: 3, owner: "client", status: "planned", depends_on: ["eoi-prep"], cite: ["c4"] },
        { id: "dd", label: "EIF due diligence", start: 3, end: 7, owner: "institution", status: "planned", depends_on: ["eoi"] },
        { id: "signed", label: "EIF agreement signed", start: 8, milestone: true, owner: "institution", status: "planned", depends_on: ["dd"] },
        { id: "deadline", label: "Call closes 30 June 2027", start: "2027-06-30", milestone: true, owner: "institution", status: "planned", cite: ["c1"] },
      ] },
      { id: "it", label: "Italy", steps: [
        { id: "counsel", label: "Instruct Italian counsel", start: 0.25, end: 1, owner: "client", status: "planned" },
        { id: "entity", label: "Italian entity, EUR 2M capital", start: 1, end: 3, owner: "client", status: "planned", depends_on: ["counsel"], cite: ["w2"] },
        { id: "106", label: "Art. 106 authorisation", start: 3, end: 9, owner: "institution", status: "planned", depends_on: ["entity"], cite: ["w2"] },
        { id: "fondo", label: "Fondo accreditation", start: 9, end: 11, owner: "institution", status: "planned", depends_on: ["106"], cite: ["w1"] },
      ] },
      { id: "lobby", label: "Germany (political)", steps: [
        { id: "bmwe-letter", label: "Send draft 2 to BMWE", start: 0.25, end: 1, owner: "us", status: "planned" },
        { id: "bmwe-meet", label: "Meet BMWE unit", start: 1.5, end: 3, owner: "client", status: "planned", depends_on: ["bmwe-letter"] },
        { id: "bundestag", label: "Committee rapporteur", start: 3.5, end: 6, owner: "us", status: "planned", depends_on: ["bmwe-meet"] },
      ] },
      { id: "fr", label: "France", steps: [
        { id: "fr-decide", label: "Decide French status on EIF numbers", start: 8, end: 9, owner: "client", status: "blocked", depends_on: ["signed"] },
      ] },
    ],
  },
  stakeholders: { institutions: [
    { id: "eif", name: "European Investment Fund", side: "public-capital", country: "EU", units: [
      { id: "investeu", name: "InvestEU guarantees team", roles: [
        { id: "head", role: "Head of SME guarantee products", priority: "P1", reach: "The call's guarantees inbox on the EIF call pages; contact person unverified", status: "to_approach", cite: ["w8", "unverified"] },
      ] },
    ] },
    { id: "bmwe", name: "BMWE (federal economy ministry)", side: "political", country: "DE", units: [
      { id: "mittelstand", name: "Unit for Mittelstandsfinanzierung", roles: [
        { id: "hou", role: "Head of unit, Bürgschaft counter-guarantees", priority: "P1", reach: "Formal letter (draft 2); unit name per register record, unverified", status: "to_approach", cite: ["unverified"] },
      ] },
    ] },
    { id: "bundestag", name: "Bundestag", side: "political", country: "DE", units: [
      { id: "econ", name: "Economic affairs committee", roles: [
        { id: "rapp", role: "Rapporteur for Mittelstand finance", priority: "P2", reach: "After the ministry meeting; check the lobby register first", status: "to_approach", cite: ["judgement"] },
      ] },
    ] },
    { id: "bdi", name: "Banca d'Italia", side: "public-capital", country: "IT", units: [
      { id: "vig", name: "Supervision, market access", roles: [
        { id: "prefile", role: "Pre-filing contact for 106 applications", priority: "P2", reach: "Through Italian counsel", status: "to_approach", cite: ["w2"] },
      ] },
    ] },
    { id: "mcc", name: "Fondo di Garanzia (MCC)", side: "public-capital", country: "IT", units: [
      { id: "acc", name: "Accreditation", roles: [
        { id: "acc-officer", role: "Accreditation desk for soggetti finanziatori", priority: "P2", reach: "After 106 status", status: "to_approach", cite: ["w1"] },
      ] },
    ] },
    { id: "warehouse", name: "Warehouse lender", side: "market", units: [
      { id: "credit", name: "Credit committee", roles: [
        { id: "cm", role: "Relationship lead", priority: "P1", reach: "Direct: will a guaranteed book get better terms?", status: "engaged", cite: ["judgement"] },
      ] },
    ] },
  ] },
  funding_stack: {
    currency: "EUR",
    need: { amount: 500_000_000, label: "Loan book target in three years (EUR 120M today)" },
    instruments: [
      { id: "equity", name: "Equity raised", type: "equity", amount: 40_000_000, terms: "First-loss capital", status: "secured", cite: ["judgement"] },
      { id: "warehouse", name: "Warehouse facility", type: "loan", amount: 150_000_000, terms: "Senior funding of the book", status: "secured", cite: ["judgement"] },
      { id: "eif-uplift", name: "Warehouse headroom from an EIF-guaranteed book", type: "guarantee_debt", amount: 100_000_000, amount_max: 200_000_000, terms: "Guarantee under 80% per loan, cap under 25%, 0.2% p.a.; size depends on the warehouse lender", status: "probe", cite: ["w8", "judgement"] },
      { id: "fondo", name: "Fondo di Garanzia cover on the Italian book", type: "guarantee_debt", terms: "After 106 status; cover per loan", status: "planned", cite: ["w1"] },
    ],
  },
  process: [
    { id: "eif-guarantee", title: "How an InvestEU portfolio guarantee works for a lender", caption: "The EIF takes part of each loan's loss, up to a cap on the portfolio; the lender keeps originating and the warehouse lends against a safer book.", nodes: [
      { id: "eif", label: "EIF", sub: "InvestEU guarantee", kind: "institution", col: 0, row: 0 },
      { id: "wh", label: "Warehouse lender", sub: "senior funding", kind: "bank", col: 0, row: 1 },
      { id: "lender", label: "You (lender of record)", sub: "originates SME loans", kind: "client", col: 1, row: 0 },
      { id: "smes", label: "SME borrowers", sub: "DE, IT, FR", kind: "customer", col: 2, row: 0 },
    ], edges: [
      { from: "eif", to: "lender", label: "covers under 80% per loan", kind: "risk" },
      { from: "wh", to: "lender", label: "funds the book", kind: "money" },
      { from: "lender", to: "smes", label: "SME loans", kind: "money" },
      { from: "smes", to: "lender", label: "repayments", kind: "money" },
    ], cite: ["w8"] },
  ],
  risks_flags: [
    { id: "lor", kind: "deal_breaker", severity: "high", title: "Who is the lender of record?", detail: "Granting loans is a banking business in Germany; a GmbH without a licence is almost certainly using a fronting bank, a fund or a loan purchase.", fix: "Send the origination chain; Regina to confirm the KWG position.", cite: ["w6", "judgement"] },
    { id: "it-entity", kind: "flag", severity: "high", title: "No Italian entity", fix: "Incorporate an Italian SpA or Srl with EUR 2M or more and file with the Banca d'Italia.", cite: ["w2"] },
    { id: "fr-status", kind: "flag", severity: "high", title: "No French status (France only)", fix: "Decide société de financement versus a French partner lender after the EIF agreement.", cite: ["w5"] },
    { id: "first", kind: "flag", severity: "medium", title: "First of a kind in Germany", fix: "Argue the reform from the EU deal and the Italian authorisation once both exist.", cite: ["judgement"] },
    { id: "budget", kind: "flag", severity: "medium", title: "EIF call may close early on budget", fix: "File the expression of interest this quarter.", cite: ["w8", "w10"] },
  ],
};

export const FINTECH: BenchConversation = {
  id: "fixture-fintech",
  mandate_id: null, agent: "wincent", brain: "wincent", kind: "chat",
  title: "Fintech lender: public guarantees on the SME book",
  session_id: null, saved: [], sources: [],
  cites: FT_CITES,
  created_at: at(0), updated_at: at(30),
  messages: [
    { role: "client", at: at(0), text: "We are a fintech lender. We have raised EUR 40M. We want our SME loan portfolio guaranteed by public guarantee schemes in Germany, France and Italy, and at EU level. We do not have a banking licence. What are our routes?" },
    { role: "agent", at: at(2), text: "Before any scheme: where are you incorporated, do you have branches in France or Italy, and which licences do you hold? Without a banking licence the answer turns on who is the lender of record (judgement).\n\nWho signs the loans today?" },
    { role: "client", at: at(10), text: "We are a German GmbH with no branches yet in France or Italy. We hold no banking, payment or investment-firm licence. We fund loans from a EUR 150M warehouse facility; the book is EUR 120M and we want EUR 500M in three years. Please write it up." },
    { role: "agent", at: at(30), text: `Go to the EU first. The EIF's InvestEU portfolio guarantees name alternative lenders as eligible intermediaries [c3][w8], one agreement can cover a book across member states [w11], and the call is open to 30 June 2027 [c1][w8]. In Italy, get Art. 106 TUB status through an Italian subsidiary: it unlocks the Fondo di Garanzia [w1][w2]. In Germany there is no route today without a banking licence: KfW's risk relief goes to "Banken und Sparkassen" [w3]. The route there is political, through the BMWE. France: park until a status decision [w4][w5].\n\nThe board carries the routes, the plan and who to approach.\n\n${block(ftBoard)}\n\nWho signs each loan and who holds it?` },
  ],
};

export const BOARD_FIXTURES: Record<string, BenchConversation> = { forklift: FORKLIFT, fintech: FINTECH };
