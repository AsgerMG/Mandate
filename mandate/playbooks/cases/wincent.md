# Wincent: worked cases (war stories)

GENERATED from `mandate/eval/cases/*.yaml` by `python -m mandate.eval.case_library build`;
edit the yaml, not this file. Each case is one senior move with the owner's verdict in the
owner's words. The names in a case are evidence, not the rule: swap the country, the fund
or the company and the move must still hold. Before working a case, find the closest one
here and ask what its senior move means for the case in front of you.

Status: **owner_confirmed** = the owner's model answer or grade; **owner_habit** = a habit
from the owner's interviews, applied to a run the owner has not graded yet.


## 1. "How can public money help us?" Diagnose intent before naming an instrument.

*owner_confirmed* · checks: sequencing, precedent, what_not_yet

**Situation.** An early-stage company with private investors, in a regulated activity, asks in general terms how public money can help.

**The junior move.** Lists instruments. Treats the regulatory side as out of scope. Gives routes without precedents or sequencing.

**The senior move.** Asks first: raising now or soon? real R&D? R&D tax credits used? entering a new market? ambitions and constraints? If raising, leads with matchmaking / co-investment loans and explains why the round is the moment (the private due diligence is already done). Names the country's R&D grants and tax credits, researched and cited. Mentions export or market-entry support with its sequencing rule (apply before entering). States what must happen first for the other routes to stay open. Converges with Regina on the regulatory files that shape fundability and positioning. Gives precedents per main route, or says none was found. Ends with prioritised next steps, not an undifferentiated list. In the case (funding-routes.md §1b before generalise-method): "AI-native learning products for young children touch the AI Act (education and minors), children's data under GDPR, and the DSA's protection of minors."

**The owner's verdict.** The owner's own case (9 Nov): "Diagnoses intent BEFORE listing instruments"; "If raising, leads with matchmaking / co-investment loans and explains WHY a round is the moment"; must not "list instruments without first asking about intent and situation" or "treat the regulatory side as out of scope".

Source: mandate/eval/scenarios/edtech_ai_kids.yaml (owner, 9 Nov 2026); mandate/playbooks/funding-routes.md §1b


## 2. A lender across several countries wants its book guaranteed. Which level is the open door?

*owner_confirmed* · checks: open_door, precedent

**Situation.** A non-bank lender with a growing SME loan book, active or expanding in three member states, holding no banking licence, wants public guarantee cover on the portfolio and asks about national schemes in each country and the EU.

**The junior move.** Works every national agency in parallel, out of thoroughness, and spends most of the answer on the regional and federal programmes of the largest market, where the applicant type is shut.

**The senior move.** Names the level whose door is open for THIS applicant type and leads with it. For a lender across several member states that is the EU guarantee layer, which admits alternative lenders as intermediaries, with one agreement covering the whole book; matches the product to the activity being financed; puts the layer's own pending reform on the watchlist; and says plainly that the national agencies come after, not first.

**The owner's verdict.** "The quickest way to guarantees without a banking licence, for a lender operating across several countries, is to almost forget the regional and federal agencies: it goes through the EU." Round 1 had the EU right; what made it fail was the two national markets (see the companion cases).

Source: mandate/eval/scenarios/fintech_guarantees.yaml (owner model answer, round 3, 10 Nov 2026)


## 3. The open door is a guarantee layer with several product windows. Match the window to the activity, and watch the layer's own reform.

*owner_confirmed* · checks: open_door, precedent, sequencing

**Situation.** A lender without a banking licence, operating across several member states, has found that the EU guarantee layer admits alternative lenders as intermediaries. The layer runs several thematic product windows, and the layer itself is being folded into a new programme whose rules are being rewritten.

**The junior move.** Names the guarantee layer as the answer and stops: no product window chosen, no reason why this lender's book fits it, and no word that the rules of the layer are moving.

**The senior move.** Leads with the layer as the quickest route of all for a multi-country lender, skipping the regional and federal agencies. Picks the product window whose purpose matches what the lender's loans actually finance, and says why. Puts the programme merger on the watchlist with the specific question that decides the route (does the applicant type stay eligible, or is a carve-out written out, as the rules are rewritten). In the case: EU / InvestEU (EIF), the digitalisation or SME competitiveness guarantee products, robot deployment fits digitalisation; InvestEU moving under the European Competitiveness Fund, so check whether alternative lenders stay eligible (carve-outs).

**The owner's verdict.** "The quickest way to guarantees without a banking licence, for a lender operating across Italy, Germany and France, is to almost forget the German regional and federal agencies: it goes through the EU, with InvestEU guarantees, probably the digitalisation or SME competitiveness products (robot deployment fits digitalisation)." Playbook wording before generalisation (funding-routes.md §4, §4b): "EU / InvestEU (EIF): more open to alternative lenders as financial intermediaries, and for a lender operating across several member states the quickest route of all (owner, round 3): skip the regional and federal agencies and go to the EU. Match the product to the activity: the InvestEU digitalisation or SME competitiveness guarantee products (robot deployment fits digitalisation). Watch: InvestEU is moving under the European Competitiveness Fund; check whether alternative lenders stay eligible (carve-outs) as the rules are rewritten." "Rules change under you: programmes merge, mandates move, carve-outs appear or vanish (InvestEU into the European Competitiveness Fund is the live example)."

Source: mandate/eval/scenarios/fintech_guarantees.yaml (owner model answer, round 3, 10 Nov 2026); funding-routes.md §4 and §4b before generalise-method


## 4. One market's mechanics are unknown to you. Research and cite them; never fill the gap from another country.

*owner_habit* · checks: grounding, open_door

**Situation.** A lender asks about guarantee routes in several markets. In two of them the mechanics are known (one shut for its applicant type, one open with a status); in the third the agent has only an impression of how the national guarantee products work.

**The junior move.** Fills the third market from instinct, or by analogy with the market next door ("it probably also runs through the banks"), and states it as fact.

**The senior move.** Says the mechanics differ and that it will not assert them from instinct; researches the national promotional bank's own guarantee product pages and the statute that governs who may lend and be guaranteed, cites them, and only then advises. Until then the market is "to confirm", never shut. In the case: France, Bpifrance guarantee products and the Code monétaire et financier.

**The owner's verdict.** Playbook wording before generalisation (funding-routes.md §4, round 3 applied): "France: different mechanics. NOT asserted from instinct: the agent must research and cite the formal documents (Bpifrance guarantee products, Code monétaire et financier) before advising." playbooks/wincent.md: "Never assert a jurisdiction's mechanics from instinct when the corpus lacks them: research and cite the formal documents (France's guarantee products and the Code monetaire et financier are the standing example)."

Source: mandate/eval/scenarios/fintech_guarantees.yaml (owner, round 3 grading, 10 Nov 2026); funding-routes.md §4 before generalise-method


## 5. The formal door is shut for this applicant type, and the rules are moving. The route is the reform.

*owner_confirmed* · checks: reform_or_lobby, who_decides, what_not_yet

**Situation.** In one market public guarantees reach SMEs only through licensed banks; a non-bank lender has no route to them today. A reform touching that rule is moving in parliament.

**The junior move.** Dresses up a workaround as the answer ("your route is a partner bank") and plans a partner-bank conversation, without saying there is no route and without finding the reform.

**The senior move.** Says plainly: no route today for this applicant. Then makes the reform the route: finds it and its current state (researched and cited, never from memory), names the ministry that hosts it and the heads of department who can lift it to the political level, and gets the company in that room to help it accelerate. If nothing were moving, the change would become the company's lobby aim: the exact clause, the unit that owns it, the next moment it can change, on the watchlist. The workaround, if mentioned at all, is labelled as what it is and is not the recommendation. In the case: Germany, where the state guarantees SME lending through the normal banks (the Hausbank principle, KfW and the Bürgschaftsbanken); the reform is hosted by the federal economy ministry (BMWE). As evidence for the lobby-aim branch (funding-routes.md §4d.3, round 3, before generalise-method): "Germany's counter-guarantee for the Bürgschaftsbanken admits only banks, building societies and insurers; it is renegotiated for 2028; the economy ministry's SME-finance unit is the door."

**The owner's verdict.** "Germany: no way without a banking licence. Reforms are moving in parliament, so a good public-affairs advisor says: get in the room with the ministry hosting these conversations, with the right heads of department who can lift it to the political level and accelerate the reform." Round 1's partner-bank answer was graded wrong. Habit (funding-routes.md §4d.3): when the formal door is shut, the route is changing the rule.

Source: mandate/eval/scenarios/fintech_guarantees.yaml (owner model answer); mandate/eval/runs/bench/2026-11-10_fintech_guarantees.md (owner grade block)


## 6. The national scheme is open to intermediaries, but only to a status the company does not hold yet.

*owner_confirmed* · checks: status_unlocks, sequencing, activity_vs_support

**Situation.** In one market the national guarantee fund will cover a lender's portfolio, but the lender must hold the national intermediary status (an authorisation on a supervised register). The company does not have it and would need a local entity, capital and an authorisation procedure to get it.

**The junior move.** Parks the market "until volume justifies the authorisation", and treats a fund vehicle set up elsewhere as a shortcut into the national scheme.

**The senior move.** Recommends obtaining the status, as a plan step with a sequence and a timeline (local entity, capital, filing, supervision), because it is the unlock for the whole market, and keeps the market in the plan in parallel with the open EU door. Says what a fund-only structure does and does not open: permission to do the activity is not access to the support. Cites the scheme's own rules for who may request the guarantee and the authorisation's own requirements. In the case: Italy; authorised financial-intermediary status under Art. 106 TUB is the unlock for the Fondo di Garanzia per le PMI; a Luxembourg RAIF is the fund-only structure that does not give streamlined access.

**The owner's verdict.** "Italy is more open and would guarantee portfolios, but the key is Art. 106 TUB status; once you have it, it is straightforward. A RAIF set-up alone does not give streamlined access to the Italian products." Round 1 parked the market for want of the status: graded wrong. Habit (funding-routes.md §4d.2): when a status unlocks a market, recommend getting the status.

Source: mandate/eval/scenarios/fintech_guarantees.yaml (owner model answer); mandate/eval/runs/bench/2026-11-10_fintech_guarantees.md (owner grade block)


## 7. The company pays a high rate because lenders cannot price its projects. That mispricing is the public side's job; pitch it as one, and quantify the velocity.

*owner_confirmed* · checks: open_door, sequencing

**Situation.** A company carries the upfront cost of every deployment (hardware, installation, integration) and is paid only once the system runs. Private lenders price that project risk badly, so its working capital is dear and each project waits for the last one to pay out.

**The junior move.** Treats it as a generic "cheaper loan" question, lists loan products, or reaches for equity; never names the market failure or quantifies what faster recycling would do.

**The senior move.** Reads the financing gap as a market failure that public guarantees, co-lending and de-risking exist to fix, ties the activity to the public funder's own mission, and makes the case "your mission, a mispriced market, our pipeline". Aims at the company's OWN project and working-capital financing, de-risked by the public side, so capital recycles from project to project faster. Quantifies the velocity from stated assumptions when the client has not given the numbers, and asks for the real ones. In the case: a forklift spatial-awareness integrator (Danish ApS, Bavarian GmbH); the illustrative calculation "if a deployment costs EUR 300k and pays 4 months after install, a EUR 3M guaranteed line funds ~10 projects a year instead of ~3"; Europe's industrial renewal and automation deployment as the public mission.

**The owner's verdict.** (Owner, round 6, in substance.) "An integrator normally borrows from private lenders at a high rate because they cannot price the projects: it deploys hardware and the full integration, gets paid at the end, and only then can take on the next project. Remove that capital constraint and the pipeline scales much faster and larger. ... De-risking loans into Europe's industrial renewal is aligned with public funders' missions. Wincent asks what the public side can do so the project scales without the capital constraint." Playbook wording before generalisation (funding-routes.md §4f.1): "When private lenders price a company's risk badly (an integrator pre-financing deployments pays a high rate because lenders cannot price the projects), that mispricing is exactly what public guarantees, co-lending and de-risking exist to fix ... the case to the institution is 'your mission, a mispriced market, our pipeline'."

Source: mandate/eval/scenarios/forklift_spatial_dk_de.yaml (owner model answer, round 6, 13 Nov 2026); funding-routes.md §4f.1 and §4g before generalise-method


## 8. A regulatory question appears in a money case. Flag it in one line and hand it to Regina; stay on the money.

*owner_confirmed* · checks: what_not_yet

**Situation.** While working a financing case, Wincent notices that the product falls under a product-safety or sector regulation that could affect the company.

**The junior move.** Does the regulatory risk analysis itself, at length, or ignores it.

**The senior move.** Flags the issue in one line, pulls Regina in for the risk assessment, and lets Regina decide whether and how to raise it with the founder. In the case: the Machinery Regulation for hardware fitted to forklifts.

**The owner's verdict.** (Owner, round 6, in substance.) "The Machinery Regulation question is for Regina: Wincent flags it, pulls Regina in for a risk assessment, and Regina decides whether to raise it with the founder."

Source: mandate/eval/scenarios/forklift_spatial_dk_de.yaml (owner model answer, round 6, 13 Nov 2026); funding-routes.md §4f.5 before generalise-method


## 9. The easy answer moves the upfront cost to the customer. The senior answer has the public side carry the risk.

*owner_confirmed* · checks: what_not_yet, open_door

**Situation.** A company that pre-finances deployments could ask its export or promotional agency to finance its buyers instead (buyer credit, leasing), so the customer carries the upfront cost.

**The junior move.** Leads with buyer financing or leasing because it is available and quick, making the company's offer less competitive.

**The senior move.** Leads with the company's own de-risked project and working-capital financing so the public side carries the risk. Customer-side levers (the customers' own grants, tax depreciation, premiums) come after, as a complement that speeds sales, never instead. In the case (the bench's illustrative board after round 6, not an owner grade): EIFO Buyer Financing for foreign customers parked as a complement; an EIFO-guaranteed project and working-capital line through the Danish ApS leads.

**The owner's verdict.** (Owner, round 6, in substance.) "Do not move the cost to the customer; that makes the offer less competitive. The best outcome is that the public side takes the risk." Playbook wording before generalisation (funding-routes.md §4f.2): "Moving the upfront cost to buyers (buyer credit, leasing) makes the company's offer less competitive; the best outcome is that the public side carries the risk, not the customer."

Source: mandate/eval/scenarios/forklift_spatial_dk_de.yaml (owner model answer, round 6, 13 Nov 2026); funding-routes.md §4f.2 before generalise-method


## 10. Write to one level down from the top, in the role that decides, in the language of that institution's own agenda.

*owner_habit* · checks: who_decides, structure_first

**Situation.** The route is clear and the company must now reach the institution: a promotional bank, a ministry, a regional government, a member of parliament.

**The junior move.** Writes to the CEO or board, or to the person in the wrong one of their roles; explains eligibility and operations; sends a long, generic message without knowing the institution's own strategy.

**The senior move.** Ranks P1 one level down from the very top (directors-general, heads of unit, head of the instrument), writes to the role that decides the matter through that role's channel, opens with the institution's own strategic priority (read from its strategy before writing), keeps eligibility for later, and makes the message routable in one read. In the case: Germany and Bavaria, the Mittelstand, KfW, a Bundestag member who is also a ministry official, a Landtag member's morning paper stack.

**The owner's verdict.** Owner interview wording (funding-routes.md before generalisation): "Not the CEO or the board of a KfW: one level down from the very top." "The same person can hold several roles (a Bundestag member who is also a ministry official)." "Example opener for Germany: the CEO is German, the company is a European champion aligned with industrial robotics deployment, and it helps the Mittelstand get the financing it needs to modernise and revive the German industrial agenda. Speak the language they want to hear." "The paper-stack test: picture a German Landtag or Bundestag member who finds a stack of copied papers on the desk every morning and allocates them through the day to the right ministry or head of unit." "Before approaching Bavaria on robotics, know Bavaria's robotics strategy." "A fund open to 'an SME established in Bavaria' is closed to a company with no Bavarian establishment, however good the project." Wincent's drafting voice: "this serves your Mittelstand modernisation agenda".

Source: owner interview rounds 1-2 (9 Nov 2026); funding-routes.md §1, §2b, §3, §3b and playbooks/wincent.md before generalise-method


## 11. Below the national level. Match the status to its products, then narrow the regions by where the activity actually happens.

*owner_habit* · checks: status_unlocks, open_door, who_decides

**Situation.** A company deploying equipment enters a country that is really three levels (national, regional, local) and holds, or could obtain, statuses that open different products at each level.

**The junior move.** Treats the country as one level, lists every region, and guesses which products a status opens.

**The senior move.** Lists what each status opens, per level, and leads with those. Narrows the regions by the economic geography of the activity and grounds each in the region's own strategy (Smart Specialisation, ERDF programme priorities), cited. Keeps the political read of the regions and ministries the plan relies on on the watchlist. In the case: Italy; statuses such as Art. 106 TUB, startup innovativa, an establishment in a region (and, as further examples of the same move, JEI in France, an establishment in a German Land); robot deployment points to the industrial north (Lombardia, Veneto, Piemonte, Emilia-Romagna, Toscana) and to Lazio (defence, the capital).

**The owner's verdict.** Playbook wording before generalisation (funding-routes.md §4e, owner round 3b): "'National' is three levels: national/federal, regional, local. A senior works all three, and narrows them twice: 1. By status. Once the company holds a status (Art. 106 TUB, startup innovativa, JEI, an establishment in a Land), list the products that status opens, at each level, and lead with those. Status is matched, not guessed. 2. By economic geography. The activity decides which regions matter, and their priorities make the case. Example: robot deployment in Italy points to the industrial north (Lombardia, Veneto, Piemonte, Emilia-Romagna, Toscana) and to Lazio (defence, the capital). 3. Keep the political read current. Regional councils and giunte, ministry decrees, budget laws and reforms change what is open." §4d.2: "A licence, registration or authorisation that opens the door (Art. 106 TUB in Italy) is a plan step with a sequence and a timeline, not a reason to park the market."

Source: mandate/eval/scenarios/robotics_deployment_it.yaml (owner interview round 3b, 11 Nov 2026); funding-routes.md §4d and §4e before generalise-method
