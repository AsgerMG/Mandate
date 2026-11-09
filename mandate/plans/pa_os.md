# Mandate as a public-affairs operating system: plan v1

Status: PLAN, no code. Written 2026-11-10 for the owner. Ten-minute read.

**The idea in one paragraph.** A public-affairs team runs a portfolio of client
mandates. For each mandate it keeps files (dossiers), watches the world, and
turns what changes into advice, drafts and decisions. Mandate becomes the
team's operating system for that work: Wincent (public capital, the pilot) and
Regina (EU law and policy) advise and draft inside each mandate; JEV, a cheap
fast triage classifier, decides which incoming items are worth a brain's time;
humans decide and send. We prove it works the only way a PA team would accept:
by running classic PA workflows on scripted mandates and having the owner grade
the output as if a junior had produced it.

Sources read: `PLATFORM.md`, the approved agent-platform plan
(`~/.claude/plans/mutable-waddling-teacup.md`), `mandate/playbooks/*.md`,
`RESUME_HERE.md`, `web/lib/mandate/workspace.ts`, `mandate/db/{workspace,actors,profiles,eval_runs}.sql`,
`mandate/api/app.py` routes, and (read only) the owner's in-progress
`web/app/workspace/page.tsx` and the character design package.
`MANDATE_CREATIVE_BRIEF.md` is not in the repo or the primary checkout; this
plan does not depend on it. Note: the design package still says the experts
"watch and tell, do not draft"; the owner's 9 Nov decision (advise AND draft,
humans send) supersedes it.

---

## 1. The team's real work, as workflows

Eleven workflows. Each one is also an eval (section 5). "Brain" = who does the
work; Mandate (the orchestrator) always frames and writes the final answer.

**W1. Onboard a new client mandate**
- Trigger: a client signs, or the team scopes a pitch.
- Inputs: client brief, website, filings, the team's call notes.
- Brains: Mandate, both specialists for a first scan.
- Outputs: company profile v1; mandate charter (objectives, scope, red lines,
  jurisdictions); 3-6 files opened; first watchlist; questions for the client.
- Human decision: approve the charter and the watch scope.
- Good: the questions a senior would ask in the first meeting, and none a
  junior would skip (structure, licences, establishments, sequencing).

**W2. Stakeholder map**
- Trigger: a new file, or a file entering a new phase (trilogue, call opening).
- Inputs: the file, the actors register, policy actors on the file.
- Brains: Regina (political side), Wincent (public-capital side).
- Outputs: per institution, P1/P2 people by function, political vs operational
  stakeholder, stance (labelled judgement), route in, each entry cited.
- Human decision: who we engage, and in what order.
- Good: the right FUNCTION one level below the top (playbook 2b), no wrong-function
  contacts, no guessed address stored as verified.

**W3. Monitor, alert, assess, recommend** (the JEV loop, section 4)
- Trigger: a new item in any feed matches a mandate's watchlist.
- Inputs: the item, the watch it hit, the file and its open decisions.
- Brains: JEV triage, then the owning brain assesses.
- Outputs: an assessment (what changed, so what for this client, how urgent)
  and a recommended action, landing in the signal inbox.
- Human decision: act, park, or dismiss (dismissal is a label we learn from).
- Good: few alerts, each one changes a decision, a route or a deadline.

**W4. Consultation response**
- Trigger: an open consultation or call for evidence in scope.
- Inputs: the consultation text, the client's position, prior submissions.
- Brains: Regina leads; Wincent when the measure touches funding.
- Outputs: a position outline, then a draft answering the actual questions,
  with the deadline as a plan step.
- Human decision: the position, then sign-off of the text.
- Good: answers the questions asked, in the Commission's own terms, every
  factual claim cited, filed before the deadline.

**W5. Meeting prep brief**
- Trigger: a meeting is booked with an official, MEP, fund or journalist.
- Inputs: the person's public role and record, the file, the client's ask.
- Brains: whichever owns the file.
- Outputs: one page: who they are, what they care about, our ask, likely
  objections, three lines to land, what to leave behind.
- Human decision: the ask.
- Good: fits on a page, speaks the counterpart's agenda, no AI voice.

**W6. Funding route plan** (the pilot; playbook `funding-routes.md` exists)
- Trigger: the client asks "how can public money help us", or a raise.
- Inputs: profile, capital corpus, live research.
- Brains: Wincent; Regina when the activity is regulated.
- Outputs: routes per jurisdiction (pursue / probe / park), flags, precedents,
  sequenced plan, P1/P2 targets, outreach drafts, watches.
- Human decision: which 2-3 routes to run in parallel.
- Good: the owner's eval cases pass (diagnose intent, structure first,
  deal-breakers, precedents, cited).

**W7. Positioning and media pitch**
- Trigger: a launch, a policy moment, a client wanting visibility.
- Inputs: the client's story, the policy context, the media layer of the register.
- Brains: Regina (policy angle); media brain later.
- Outputs: the grounded angle, target outlets and beats, pitch drafts.
- Human decision: the angle and the outlets.
- Good: sharp, politically appropriate, defensible line by line.

**W8. Coalition building**
- Trigger: the client cannot win a file alone.
- Inputs: memberships and topics in the register, the stakeholder map.
- Brains: Regina; coalitions brain later.
- Outputs: candidate coalitions and associations per country, what each
  costs and gives, an approach draft.
- Human decision: join, build, or stay solo.
- Good: names bodies that actually work the file, with cited membership.

**W9. Weekly client report**
- Trigger: Friday, per mandate.
- Inputs: the week's assessments, decisions, actions and their status.
- Brains: Mandate.
- Outputs: a one-page report: what moved, what it means, what we did, what we
  need from the client.
- Human decision: edit and send to the client.
- Good: the owner sends it with light edits; nothing in it is new to the team.

**W10. Rapid reaction** (leak, vote, ruling, raid, call closing early)
- Trigger: a high-urgency signal (W3 with urgency = now).
- Inputs: the item, the file, the client's standing position.
- Brains: owning brain, fast path.
- Outputs: within the hour: what happened, the exposure, holding line,
  who to call first.
- Human decision: whether to move, and the holding line.
- Good: correct and fast; says what is not yet known.

**W11. Targeted outreach** (meeting request, probe letter)
- Trigger: a plan step says "approach X".
- Inputs: the person's role and agenda, precedent, the ask.
- Brains: the owning brain.
- Outputs: a short, formal, local draft to the right function, with the
  contact point and whether it is verified.
- Human decision: send or not (always a human).
- Good: passes the paper-stack test (playbook 3).

---

## 2. The information architecture

```
Portfolio (the team)
  └─ Mandate (a client)          charter, profile, team members
       └─ File (dossier)         "DE guarantees", "Google DMA case"
            ├─ Watchlist         what we watch for this file
            │    └─ Signals      items JEV scored against a watch
            │         └─ Assessment   a brain's reading of a passed signal
            ├─ Missions          conversations that worked the file
            ├─ Stakeholders      the file's map, over the actors register
            ├─ Actions / drafts  next steps; drafts a human sends
            └─ Decisions log     what was recommended, what the human chose
```

| Layer | Exists today | Missing |
|---|---|---|
| Portfolio | `mandate.workspaces` + `workspace_members` (one company each) | `portfolios` (the team) and `portfolio_mandates` (insert-only link). Today a workspace IS a company, so a team has no home above it. |
| Mandate | `workspaces` + `company_profiles` / `company_profile_versions` | `mandate_charters` (versioned: objectives, scope, red lines, jurisdictions, status active/paused/closed, lead member). |
| File | nothing | `files` (mandate, title, kind, status) and `file_id` on missions and watchlist items. Missions are per question; a file holds many. |
| Watchlist | `watchlist_items` (kind, subject, trigger, jurisdiction, route_status), keyed by mission | `file_id`; machine-readable `terms` (the only thing triage may see); source scope; per-watch threshold override. |
| Signals | nothing in `mandate` (items land in grounding, policy and capital tables) | `signals` (item: source, url, grounding sha256, published_at) and `signal_scores` (signal x watch: classifier, model version, relevance, urgency, confidence, passed). Append-only like the rest. |
| Assessment | nothing | Reuse missions: an assessment is a mission with `job = 'signal-assessment'` and a `signal_id`, so it lands decisions, flags and actions through the existing endpoints. One new column, no new store. |
| Actions / drafts | `actions` (draft, stakeholder), `action_events` (open, in_progress, done, dismissed) | `action_drafts` (versions: agent draft, human edit) and events `approved` and `sent_by_human`. The edit between agent and human version is our best quality signal. |
| Stakeholders | `actor_*` register (public, global, cited, personal-data line) | `file_stakeholders` (file x organisation or role: priority P1/P2, political vs operational, stance as labelled judgement, last touch). Client-confidential; never in the public register. |
| Decisions log | `decisions` (+ `supersedes`, `decisions_current`) | The human's choice: today `created_by` allows `founder`; a PA team needs `member` (add, keep `founder` valid) and a `decision_outcomes` row (accepted / overridden / deferred, by whom, why). |
| Interactions | nothing | `interactions` (meeting, call, email sent: who, when, outcome), entered by humans. Needed by W5 and W9. Later. |
| Evals | `eval_runs` (rubric, citations, owner re-grade via `grades_run`) | `workflow` on each run; `triage_labels` (the benchmark set, section 4). |

Every new table follows the existing rules: in schema `mandate`, written only
by mandate-api as `mandate_app`, append-only with `supersedes`, claims labelled.

---

## 3. The interface, low-fi

Conversation is the input. The structured workspace is where results land.
These map onto the owner's page: Today = Mandate cockpit, Radar = Signal inbox,
Actions = Draft review, Company = the mandate charter and profile. The
Portfolio overview is a new level above them.

**S1. Portfolio overview** (the team's Monday morning)
```
+--------------------------------------------------------------------------+
| MANDATE  Portfolio: <team>                       Week 46   [Ask Mandate] |
+--------------------------------------------------------------------------+
| Mandate            Lead   Files  New signals  Decisions due  Drafts      |
| Fintech lender     AMG      4     3 (1 now)    2 (Thu)        2 to review|
| Travel platform    AMG      2     5            1              0          |
| Trust-AI startup   --       3     0            0              1          |
| Edtech (kids, AI)  --       2     1            1 (Fri)        0          |
+--------------------------------------------------------------------------+
| ! NOW  Fintech lender / EU guarantees: InvestEU rule text published      |
|        Wincent: "Alternative lenders kept in scope; one new condition"   |
|        [Open assessment]                                                 |
+--------------------------------------------------------------------------+
```

**S2. Mandate cockpit**
```
+------------------------+-------------------------------------------------+
| Fintech lender         | Files                                           |
| Charter v2  [edit]     |  DE guarantees     probe   2 watches  1 action  |
| Profile v3             |  IT Fondo 106 TUB  pursue  3 watches  2 actions |
| Lead: AMG              |  FR Bpifrance      probe   1 watch    research  |
|                        |  EU InvestEU/EIF   pursue  4 watches  1 decision|
| Wincent  watching 10   +-------------------------------------------------+
| Regina   watching 4    | Decision queue (by consequence)                 |
|                        |  1 Apply for 106 TUB status?   rec: yes   Thu   |
| [Ask Wincent]          |  2 Probe EIF before close?     rec: yes   Fri   |
| [Ask Regina]           +-------------------------------------------------+
| [Weekly report]        | Open flags: 1 blocker (no banking licence, DE)  |
+------------------------+-------------------------------------------------+
```

**S3. Signal inbox with triage**
```
+--------------------------------------------------------------------------+
| Signals  [All mandates v] [Passed v] [This week v]        5 shown / 212  |
+--------------------------------------------------------------------------+
| NOW   Fintech / EU InvestEU     rel .91  conf .88   JEV  -> Wincent       |
|       "Draft regulation on the European Competitiveness Fund..."         |
|       Assessment: keeps alternative lenders; adds a reporting duty.      |
|       Recommended: update EIF probe letter.  [Act] [Park] [Dismiss: why] |
+--------------------------------------------------------------------------+
| WEEK  Travel / DMA case        rel .77  conf .70   JEV  -> Regina         |
|       "Commission preliminary findings ..."   [Act] [Park] [Dismiss]     |
+--------------------------------------------------------------------------+
| Below the line (207): scored, not surfaced.  [Audit a sample]            |
+--------------------------------------------------------------------------+
```
"Dismiss: why" and "Audit a sample" are how the team labels JEV for free.

**S4. Conversation with a brain inside a mandate**
```
+-----------------------------------------+--------------------------------+
| Fintech lender > IT Fondo 106 TUB       | Landed in this file            |
|                                         |  Decision: apply for 106 TUB   |
| You: what does 106 TUB status take, and |   rec yes, conf medium [c3][c7]|
|      how long?                          |  Flag (major): capital minimum |
| Wincent: Registration with the Bank of  |  Plan: 1 file application (Q1) |
|   Italy as a financial intermediary     |  Watch: Bank of Italy circular |
|   [c3]. The capital minimum is [c7].    |  Draft: letter to Fondo head   |
|   Judgement: 4-6 months. Start now: the |   of guarantees  [review]      |
|   Fondo route waits on it.              |                                |
|  > used: research, application_route    |  Questions for the client (2)  |
| [type...]                    [Send]     |                                |
+-----------------------------------------+--------------------------------+
```

**S5. Action and draft review**
```
+--------------------------------------------------------------------------+
| Draft: letter to head of guarantees, Fondo di Garanzia      by Wincent   |
| To: <role>, contact point: published press office (verified 2026-11-08)  |
+-------------------------------------+------------------------------------+
| Agent draft                         | Your version (edit)                |
| ...                                 | ...                                |
+-------------------------------------+------------------------------------+
| Claims: 3 cited, 1 judgement, 0 unverified   Precedent: [c9]             |
| [Approve]  [Mark sent by me]  [Send back with note]  [Dismiss]           |
| Nothing leaves Mandate. Sending is yours.                                |
+--------------------------------------------------------------------------+
```

---

## 4. The JEV trigger loop

**What is watched, per mandate.** The six existing watch kinds (route, rule,
institution, consultation, case, agenda) plus people's public roles on a file.
Each watch carries `terms`: a short machine-readable set (instrument names,
CELEX or case numbers, programme names, institution and unit names,
jurisdiction). Agents create watches (method.md already mandates `save_watch`
for every route and rule); humans add and stop them.

**The feeds** (all already land in grounding or a brain's schema): policy's
refresh (EUR-Lex, consultations, press, parliamentary records), capital's
weekly refresh (instruments, calls, awards), and, new, daily targeted watches on
the sources the watches name (a regulator's press page, a case register).

**How a signal becomes a flag.**
1. **Ingest.** Item stored in grounding (sha256, fetch date). No duplicates by construction.
2. **Prefilter, free.** Jurisdiction and kind match, plus lexical and embedding
   similarity of the item to each watch's terms. Keeps maybe 5-10% of item x
   watch pairs. Tuned for recall, never for precision.
3. **Triage (JEV, or the baseline).** Per pair, a typed answer: relevant (bool),
   relevance 0-1, urgency (now / this_week / later), which watch field it
   touches (route opens or closes, deadline, rule text, actor move), a reason in
   under 25 words, confidence. Written to `signal_scores`.
4. **Threshold.** Pass if relevance >= 0.5 and confidence >= 0.4, or urgency =
   now at any relevance >= 0.3. Starting values; the benchmark sets them so
   that recall on must-flag items is >= 95%.
5. **Assessment (Claude, inside our stack).** The owning brain reads the item
   with the full mandate context (profile, file, open decisions) and either
   writes an assessment mission (decision, flag, action) or records "no change
   to advice". Only assessments that change a decision, route or deadline
   reach the inbox.
6. **Budget.** At most N surfaced per mandate per week (decision 3); the rest
   are below the line, auditable.

**Benchmark: JEV vs Claude Haiku Batches.**
- Labelled set: the four scripted mandates (section 5) x a frozen 4-week
  window of real items from our feeds, after the prefilter: roughly 600 pairs.
  Claude pre-labels; the owner labels a stratified 200 and adjudicates every
  disagreement. Stored in `triage_labels`.
- Metrics: recall on must-flag (primary), precision, calibration (does 0.8
  confidence mean right 80% of the time), urgency accuracy, latency, cost per
  1,000 pairs.
- Adoption rule: JEV is adopted if its must-flag recall is within 2 points of
  Haiku's at the same threshold and calibration is no worse. Otherwise Haiku
  Batches, which is already in our stack (`mandate/llm/batch.py`). Batches can
  take up to 24 h, so W10 (rapid reaction) needs a live path either way.
- Cost: a Haiku run on 600 pairs is a few dollars at Batches pricing (check the
  current table before quoting). Not run in this plan; it needs the owner's go.
- Provider-neutral interface: one `triage(item, watch_terms) -> Score`
  contract, so switching costs one config line.

**Data residency.** TypeSafe appears US-hosted. JEV receives only the item
text (public) and the watch terms, keyed by an opaque watch id. Never the
client's name, profile, charter, stakeholder map, objectives or drafts. One
catch the brief did not name: **watch terms are themselves strategy** ("106 TUB
alternative lender guarantee" says what a client is planning). Decision 2.
Open checks carried from the approved plan: early-access availability, a DPA,
and an EU region.

---

## 5. How we test it

The test is the work. Each workflow becomes a scenario in the existing
`mandate/eval/scenarios/*.yaml` must / must_not format, tagged `workflow: W1..W11`.

**Scripted mandates: the owner's four cases**, each as a full client mandate
with a charter and 2-4 files:
1. Fintech lender, EUR 40M raised, portfolio guarantees DE / FR / IT / EU, no
   banking licence (`fintech_guarantees.yaml` exists).
2. Travel scale-up following antitrust enforcement against Google (case
   tracker, coalitions, media).
3. Trust-AI startup, EUR 2M raised, distribution and positioning as Europe's
   safe alternative (media, journalists, associations).
4. Edtech, AI for young children, "how can public money help us"
   (`edtech_ai_kids.yaml` exists).

**A simulated week.** Replay a frozen past week of real items (by sha256, so
it is reproducible), plus planted events per mandate with known right answers:
e.g. an amendment touching InvestEU intermediary eligibility; a Commission step
in a Google case; AI Act guidance on minors; a consultation opening in scope.
Add near-miss distractors (right institution, wrong instrument). The week
runs W3 and W10 daily and W9 on Friday; W2, W4, W5, W11 fire from what the week
produces. That is one realistic week of PA work per mandate, about 40 workflow
outputs in all.

**Automated, every run, near zero cost:**
- every citation resolves in grounding and its quote matches;
- zero unlabelled claims (the DB CHECK is the floor);
- each workflow saved its required objects (W6: routes, flags, plan, watches;
  W11: draft plus contact point with verified flag);
- nothing left Mandate (no outbound calls beyond research fetches);
- triage recall and precision on planted events; surfaced count per mandate-week;
- a Claude judge pre-grades must / must_not, so the owner reads its verdict
  rather than a blank page;
- cost and latency per workflow.

**Owner-graded, weekly, about 45 minutes:**
- per output: would I send this, or act on it, as is? (5 = send, 4 = light
  edit, 3 = rewrite a part, 2 = rewrite, 1 = wrong);
- for drafts, the owner's edit itself (S5 stores both versions): how much was
  rewritten is the objective companion to the grade;
- per mandate-week, the pivot metric: did the team find something worth
  acting on?
- grades stored as `eval_runs` rows with `judge = 'owner'` and `grades_run`.

**Pass bars** (a workflow ships to the UI when it clears them):
- citations 100% resolve and match; 0 unlabelled claims;
- triage: recall >= 95% on planted must-flags; <= 5 surfaced per mandate-week;
- owner: median grade >= 4 on that workflow across at least 3 of the 4 mandates;
- pivot metric: "worth acting on" in >= 3 of 4 mandate-weeks;
- judge vs owner agreement >= 80%, before the judge may guard regressions alone.

---

## 6. Build order (data, brains, wiring, exposure last)

**Phase A: data and grounding (now; RESUME_HERE step 1).**
Per-brain audit of what the four cases need and what is grounded. Freeze the
replay week. Build the triage label set. No UI, no new tables.

**Phase B: brains, tested through plain conversation (now, before any OS UI).**
What already exists is enough: `/api/mandate/mission` streams MissionEvents,
continues a mission with `missionId`, and saves decisions, flags, actions,
plan steps, watches and a deliverable through mandate-api; `mandate/eval` runs
scenarios. Testable this way, today:
- W6 funding route plan (playbook exists; two scenarios exist);
- W11 outreach drafts, W5 meeting prep, W4 consultation response (Regina has
  consultations), W1 onboarding as a conversation;
- W3 by hand: paste an item into the conversation, "what does this mean for
  this client?". This proves the assessment half before JEV exists.
Needed: one playbook interview per workflow family (Regina next), and a
plain chat surface (a terminal loop or a bare page) that the owner uses
instead of the eval runner.

**Phase C: brains wired to data.**
Portfolio, charter, files, `file_id`, watch terms, signals and scores,
assessment-as-mission, draft versions, decision outcomes, file stakeholders.
The triage benchmark, then the daily loop on the replay week, then live
feeds. W2, W3, W9, W10 become testable end to end.

**Phase D: exposure.** UI pieces arrive only when their workflow passes:
1. S4 conversation inside a mandate (first: it is the input, and it exists in raw form);
2. S3 signal inbox (when W3 passes; it is where the loop is judged);
3. S5 draft review (when W11 passes; captures the owner's edits);
4. S2 mandate cockpit (the owner's Today view, wired to real data);
5. S1 portfolio overview (last: it only aggregates).
The owner's session owns visuals; I own the API contract the screens read.

---

## 7. Decisions for the owner

**D1. What is a workspace?**
(a) One client mandate, with a new portfolio (team) above it.
(b) The team's portfolio, with mandates as a new level inside it.
*Recommend (a):* profiles, missions and members already hang off a workspace
as one company; (a) adds a table above instead of re-parenting everything.

**D2. What may JEV see, given watch terms reveal client strategy?**
(a) Item text plus each mandate's watch terms (as briefed).
(b) Item text plus one pooled term set across all mandates, mapped back to
watches in our stack, so no term is attributable to a client.
(c) Nothing: triage on Claude only.
*Recommend (b) if JEV wins the benchmark; (c) until then.*

**D3. How many signals may reach the team per mandate per week?**
3 / 5 / 10, the rest below the line.
*Recommend 5:* enough to catch a real week, few enough that each is read.

**D4. Which workflows make the pilot set?**
*Recommend W6 funding route, W3 monitor-assess, W11 outreach, W9 weekly report:*
Wincent-led, best data, and together they are a complete week for a client.

**D5. Who grades, and how often?**
(a) The owner grades every output. (b) The owner grades the first two rounds of
each workflow, then 20% spot-checks once the judge agrees >= 80%.
*Recommend (b).*

**D6. Who sees the OS?**
(a) The team only; clients get exported reports. (b) A client portal.
*Recommend (a) for the pilot:* the team's judgement stays between agent and client.

**D7. How much do we store about stakeholders' stances?**
(a) Stance and priority per file, on public-role people and organisations,
labelled as our judgement; no private notes about a person.
(b) Organisation level only.
*Recommend (a):* a stakeholder map without people is not a PA map, and the
personal-data line (public roles only, labelled, erasable) already covers it.

**D8. When does a real client mandate enter?**
(a) Never in the pilot: the four scripted cases only.
(b) One live mandate of the owner's team, with the client's consent, once the
pilot set clears its bars on the scripted cases.
*Recommend (b).*
