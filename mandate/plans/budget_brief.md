# Mandate: model budget request

**Ask:** USD 100 now, then a monthly cap of USD 150 (alert at USD 50), for the
Anthropic API that runs Mandate's advisors. Roughly 5 weeks of pilot work per USD 100.

## What Mandate is
An operating system for a public-affairs team. Specialist AI advisors, one per domain
(public funding first, EU policy next), work each client mandate: they find the routes,
rules and people that matter, cite every fact to an official source, and draft the
outreach. The team decides and sends. The data foundation (one database of funds,
awards, EU law and policy documents, all source-cited) is built and runs weekly.

## What the money buys
| Use | Cost | Why it matters |
|---|---|---|
| Pilot: the funding advisor works 4 real-shaped client cases, graded by our team, 2 rounds | ~USD 25 | Proves (or disproves) the advisor against a senior practitioner's judgement |
| Data integration: re-test after each of ~7 new data sources (EU officials and lobby register, banking rules, EIF deals, start-up loans, tax credits, export credit) | ~USD 45 | Each source must measurably improve the advice, or it is not kept |
| Monitoring trial: triage of a real week of EU news for 4 mandates, plus a benchmark of a cheaper classifier | ~USD 50 | Decides whether daily monitoring can run at low cost |
| Weekly data refresh (news and classification) | a few USD a week | Keeps the knowledge current |

Today one advisor question costs about USD 2. The integration work targets under USD 1,
because grounded data replaces live web research.

## Controls
- A hard monthly cap and an email alert; a budget switch pauses all paid calls in one
  command, and the system keeps running on what it already knows.
- Every answer is cited or labelled as judgement; nothing is sent without a person.
- Each spend step has a pass/fail test, so money stops where results do not come.

## What happens without it
The foundation, data integration and design work continue (they cost no model budget).
The advisor cannot be tested live, so we cannot show whether it gives advice a team
would act on. That proof is what this budget buys.
