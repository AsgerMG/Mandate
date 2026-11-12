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

**The senior move.** Asks first: raising now or soon? real R&D? R&D tax credits used? entering a new market? ambitions and constraints? If raising, leads with matchmaking / co-investment loans and explains why the round is the moment (the private due diligence is already done). Names the country's R&D grants and tax credits, researched and cited. Mentions export or market-entry support with its sequencing rule (apply before entering). States what must happen first for the other routes to stay open. Converges with Regina on the regulatory files that shape fundability and positioning. Gives precedents per main route, or says none was found. Ends with prioritised next steps, not an undifferentiated list.

**The owner's verdict.** The owner's own case (9 Nov): "Diagnoses intent BEFORE listing instruments"; "If raising, leads with matchmaking / co-investment loans and explains WHY a round is the moment"; must not "list instruments without first asking about intent and situation" or "treat the regulatory side as out of scope".

Source: mandate/eval/scenarios/edtech_ai_kids.yaml (owner, 9 Nov 2026); mandate/playbooks/funding-routes.md §1b


## 2. A lender across several countries wants its book guaranteed. Which level is the open door?

*owner_confirmed* · checks: open_door, precedent

**Situation.** A non-bank lender with a growing SME loan book, active or expanding in three member states, holding no banking licence, wants public guarantee cover on the portfolio and asks about national schemes in each country and the EU.

**The junior move.** Works every national agency in parallel, out of thoroughness, and spends most of the answer on the regional and federal programmes of the largest market, where the applicant type is shut.

**The senior move.** Names the level whose door is open for THIS applicant type and leads with it. For a lender across several member states that is the EU guarantee layer, which admits alternative lenders as intermediaries, with one agreement covering the whole book; matches the product to the activity being financed; puts the layer's own pending reform on the watchlist; and says plainly that the national agencies come after, not first.

**The owner's verdict.** "The quickest way to guarantees without a banking licence, for a lender operating across several countries, is to almost forget the regional and federal agencies: it goes through the EU." Round 1 had the EU right; what made it fail was the two national markets (see the companion cases).

Source: mandate/eval/scenarios/fintech_guarantees.yaml (owner model answer, round 3, 10 Nov 2026)


## 3. The formal door is shut for this applicant type, and the rules are moving. The route is the reform.

*owner_confirmed* · checks: reform_or_lobby, who_decides, what_not_yet

**Situation.** In one market public guarantees reach SMEs only through licensed banks; a non-bank lender has no route to them today. A reform touching that rule is moving in parliament.

**The junior move.** Dresses up a workaround as the answer ("your route is a partner bank") and plans a partner-bank conversation, without saying there is no route and without finding the reform.

**The senior move.** Says plainly: no route today for this applicant. Then makes the reform the route: finds it and its current state (researched and cited, never from memory), names the ministry that hosts it and the heads of department who can lift it to the political level, and gets the company in that room to help it accelerate. If nothing were moving, the change would become the company's lobby aim: the exact clause, the unit that owns it, the next moment it can change, on the watchlist. The workaround, if mentioned at all, is labelled as what it is and is not the recommendation.

**The owner's verdict.** "Germany: no way without a banking licence. Reforms are moving in parliament, so a good public-affairs advisor says: get in the room with the ministry hosting these conversations, with the right heads of department who can lift it to the political level and accelerate the reform." Round 1's partner-bank answer was graded wrong. Habit (funding-routes.md §4d.3): when the formal door is shut, the route is changing the rule.

Source: mandate/eval/scenarios/fintech_guarantees.yaml (owner model answer); mandate/eval/runs/bench/2026-11-10_fintech_guarantees.md (owner grade block)


## 4. The national scheme is open to intermediaries, but only to a status the company does not hold yet.

*owner_confirmed* · checks: status_unlocks, sequencing, activity_vs_support

**Situation.** In one market the national guarantee fund will cover a lender's portfolio, but the lender must hold the national intermediary status (an authorisation on a supervised register). The company does not have it and would need a local entity, capital and an authorisation procedure to get it.

**The junior move.** Parks the market "until volume justifies the authorisation", and treats a fund vehicle set up elsewhere as a shortcut into the national scheme.

**The senior move.** Recommends obtaining the status, as a plan step with a sequence and a timeline (local entity, capital, filing, supervision), because it is the unlock for the whole market, and keeps the market in the plan in parallel with the open EU door. Says what a fund-only structure does and does not open: permission to do the activity is not access to the support. Cites the scheme's own rules for who may request the guarantee and the authorisation's own requirements.

**The owner's verdict.** "Italy is more open and would guarantee portfolios, but the key is Art. 106 TUB status; once you have it, it is straightforward. A RAIF set-up alone does not give streamlined access to the Italian products." Round 1 parked the market for want of the status: graded wrong. Habit (funding-routes.md §4d.2): when a status unlocks a market, recommend getting the status.

Source: mandate/eval/scenarios/fintech_guarantees.yaml (owner model answer); mandate/eval/runs/bench/2026-11-10_fintech_guarantees.md (owner grade block)


## 5. Entering a market with a financing arm and customers to equip. Work three levels, narrowed twice.

*owner_habit* · checks: open_door, status_unlocks, who_decides, sequencing

**Situation.** A scale-up that places equipment with SME customers and finances it over several years enters a new country, plans a local entity, and weighs a start-up regime against a supervised lender status so it can finance customers itself. It asks which public money fits and where in the country.

**The junior move.** Treats the country as one level, lists every region and programme it can find, assumes the start-up regime applies without checking age, size and the local-site condition, and stops at the regional level without the local one.

**The senior move.** Matches each status to the doors it opens, per role: the lender status opens the guarantee fund and the equipment scheme to the company as a lender; the customers use the equipment scheme themselves, which becomes a sales argument. Checks the start-up regime against its own criteria and flags what must be verified for a subsidiary of an older group. Works national, regional and local separately and leads with the level open for this applicant. Narrows the regions by economic geography, each grounded in the region's own strategy, and keeps the political read current (transition rules, budget laws, regional decisions) on the watchlist. Warns where the incentive effect requires applying before ordering.

**The owner's verdict.** Habits from round 3b (funding-routes.md §4e): "National is three levels: national, regional, local. A senior works all three, and narrows them twice: by status, then by economic geography; keep the political read current." The 11 Nov bench run missed the local level and the start-up regime nuance: the two moves to watch on any entry case.

Source: mandate/playbooks/funding-routes.md §4e; mandate/eval/scenarios/robotics_deployment_it.yaml; mandate/eval/runs/bench/2026-11-11_robotics_deployment_it.md (self-score, not owner-graded)
