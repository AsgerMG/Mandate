# The three-minute brief: a UX plan for the wait

> **Status: implemented 2026-07-30**, except the deferred `BriefJob` persistence
> (Phase D). Verified against four real briefs at 320/375/768/1280/1920/2560px.
> What the live runs found is recorded in §8 — including a fatal pre-existing bug
> in `/api/brief` that meant **every real brief had been failing at the finish
> line**, and an ETA of mine that was calibrated 5x too high.

Written 2026-07-29, immediately after the Haiku/Sonnet A/B settled the model
question. The verdict there was "keep Sonnet", which means **~3 minutes per brief
is now a fixed constraint of the product, not a bug to optimise away**. This plan
is about making those three minutes feel like watching something valuable being
built rather than staring at a stalled page.

Everything below is grounded in two things: measurements from the 20 real briefs
generated today, and published patterns for long-running agent UX. Where the
generic advice conflicts with our own numbers, our numbers win and the deviation
is argued rather than assumed.

---

## 1. What we actually measured

From the two 10-profile panel runs (`exports/ab-baseline-sonnet.json`,
`exports/ab-challenger-haiku.json`):

| | Sonnet 5 |
|---|---|
| Median brief | **184s** |
| p10 – p90 | **138s – 267s** |
| Worst observed | 558s |
| Clean path (2 calls, 8/10 profiles) | 138–234s, median 176s |
| Correction path (>2 calls, 2/10) | 267–558s, median 412s |
| Retrieval share of wall clock | **~7s (4%)** |
| Model share of wall clock | **96%** |

### The finding the whole ETA design rests on

Latency correlates with **output tokens** at **r = +1.00**. It correlates with
retrieved context size at **r = −0.16** — i.e. not at all.

And the generation rate is remarkably stable:

```
Sonnet output rate: mean 93.6 tok/s, median 93.7, stdev 2.1  (range 90.7–96.7)
```

A 6% spread across ten profiles ranging from 13,164 to 53,901 output tokens.
**A brief takes exactly as long as the text it produces, at a near-constant
rate.** That is an unusually kind property: it means an honest, self-correcting
ETA is arithmetic rather than guesswork.

It also closes the loose end from the A/B: Haiku's median rate was **86.9 tok/s**
— slower *per token*, while also generating *more* tokens. A double penalty, and
proof the slowdown wasn't just the thinking budget I picked for it.

### The two-population problem

The distribution is bimodal, not noisy: eight briefs took 138–234s on the clean
two-call path; two took 267–558s because the deterministic canon/prio check found
problems and triggered correction rounds. **A single point estimate would be
wrong for one population or the other.** But we know which population we're in
*the moment the correction fires*, because `generate_briefing` already emits a
`cross-checking` / `verifying` stage event when it happens. So the ETA can widen
at exactly the moment we learn it must — which is the honest version of
"dynamically adjust estimates as processing continues".

---

## 1a. Governing principle: adaptive, not preset

Everything in this plan must describe *this run*, not a run in general. A preset
progress experience is the thing that makes a three-minute wait feel fake — it is
visibly a template, so the user correctly infers that nothing on screen is
actually connected to what the machine is doing.

But "adaptive" has to mean *driven by a real signal*, otherwise it degrades into
animated guessing, which is worse than an honest static statement. So for every
element the question is: **what does this run tell us, and when?** We measured the
answer rather than assuming it.

### Where adaptivity is real, and where claiming it would be fake

I tested whether anything known at **retrieval time** (~7s, before any drafting)
predicts how big this run will be — which would let the estimate personalise
almost immediately. Across all 20 briefs:

| retrieval-time feature | correlation with output tokens |
|---|---|
| facet count | +0.15 |
| passages retrieved | −0.25 |
| substantive passages | −0.25 |
| documents | +0.11 |
| context chars | −0.19 |
| depth ratio | +0.39 |

**Nothing predicts it.** Substantive passages vary 31→67 while output varies
13,164→53,901, and the two are unrelated. So a personalised estimate at t=7s is
not available, and faking one — "large corpus for your profile, this may take
longer" — would be theatre dressed as adaptivity.

What *is* real:

| Signal | Available from | What adapts |
|---|---|---|
| **Output-token rate** (r=+1.00, stdev 2.1 tok/s) | ~5s into drafting | The ETA, accurately, and it self-corrects continuously |
| **Correction-pass event** | The moment it fires | The ETA revises upward *with a stated reason*; a new stage appears |
| **Which scoping groups apply** | Before the wizard renders | Which steps exist at all |
| **Instruments retrieved** | End of retrieval (~7s) | The named list of what's being read |
| **Final counts** (instruments, citations, canon issues) | Completion | The summary |

So the shape is: **one honest measured range up front, then genuine per-run
adaptation from the first tokens onward, and an explicit refusal to pretend
adaptivity in the ~7-second window where we have no predictive signal.**

The t=0 range is the single unavoidable preset — and even that is not
hand-written: it is computed from stored run history and updates itself as the
pipeline changes (see Phase A). The rule from the design guidelines applies
unchanged: no hardcoded number that describes measured reality.

---

## 2. What we already have (and must not throw away)

This is not a greenfield design. `website/app/brief/ProgressRail.tsx` (309 lines)
already implements something better than most of what the research describes:

- A **9-step canonical backbone** visible from t=0 — profile → 5 scoping groups →
  3 AI calls — rather than a list that grows as you go. The trade is deliberate
  and documented in the file: a stable, predictable rail over per-run precision.
- **Hand-drawn thin-line SVG icons**, `currentColor`, 1.5px stroke, matching the
  site's parliament illustrations rather than a filled icon-font look.
- **EU legislative wordplay naming**, non-repeating end to end: *Filing the
  dossier · Preliminary review · Impact assessment · Technical consultation ·
  Stakeholder consultation · Committee referral · First reading · Committee
  markup · Second reading*, plus conditional *Point of order* and *Plenary vote*
  for retries.
- **Per-step elapsed timers** and `done`/`current`/`upcoming` states.
- A **streaming NDJSON API** (`POST /api/brief`) that already emits one
  `{"type":"status","stage":…,"label":…}` per real stage, then a final `result`.

So the naming, the iconography and the transport are done. **What is missing is
everything about the wait itself**: no ETA, no progress magnitude, no substance
behind each stage name, no tab-away support, and no survival if the connection
drops.

The single most valuable observation in this document: **the legislative metaphor
already in the rail is also the right structure for progressive disclosure of the
output.** A bill has a first reading, gets amended in committee, then a second
reading. Our pipeline literally does draft → self-critique → final. We can show
the user a bill moving through parliament, with real text, instead of a spinner.
Nobody else's agent UI can do that, because nobody else's domain metaphor happens
to match their execution graph.

---

## 3. What best-in-class actually does

Synthesised from the sources listed at the end.

**Strawberry (agentic browser)** — its defining design choice is a *visible,
collaborative* agent flow: users can watch, guide, pause and replay what the agent
is doing rather than handing work to a black box; the agent asks approval before
consequential actions. The lesson is not "add a log"; it's that **visibility is
the product feature**, not a debug affordance.

**OpenAI Deep Research** — real-time progress you can watch, interrupt, and
refine mid-flight; a visual experience built around start → track → review as
three first-class states. The lesson: **"review later" is a designed state**, not
what happens if you leave.

**The pattern literature** converges on a four-layer status model — *ambient*
(persistent unobtrusive badge) → *progress* (glanceable panel on demand) →
*attention* (interrupt, only for genuine decisions) → *summary* (completion
report). With two hard rules worth quoting:

> "An interrupt is for a decision, not for a status."

> "If the user has to keep the status panel open and watch it to feel safe, your
> ambient layer has failed."

**Concrete techniques that transfer directly:**

- Stage-based indicators beat spinners because **each stage transition resets the
  patience clock** by delivering fresh information.
- **Contextual activity visualisation** — animate the thing being made (text
  appearing, sources being scanned) — beats abstract progress.
- **Ranges, not false precision**: "typically 2–4 minutes" outperforms a
  confident single number that then disappoints.
- **Explanation during wait**: "Analysing 2.3 million data points" justifies the
  delay; silence reads as failure.
- Anti-pattern, stated bluntly: *a loading spinner on a 45-second AI task is an
  abandonment trigger*. Ours is 184 seconds.
- Setting expectations **before** initiation measurably improves tolerance.

**One place we should deliberately deviate.** The literature recommends escalating
a background-processing offer at 15s → 30s → 60s. That's tuned for tasks whose
duration is unknown and often short. Ours is *always* ~3 minutes and we know it
before we start. Escalation would just be three interruptions on the way to a
foregone conclusion. **We offer "leave this running" from t=0, as a normal part of
the design, and never nag.**

---

## 4. The plan

Five phases, ordered by value-per-unit-effort. Phases A–C are frontend-only and
independently shippable. D is the one real backend change. E is polish.

### Phase 0 — Make the rail itself adaptive (revises an earlier decision)

`ProgressRail.tsx` currently renders a **preset 9-step backbone**: all five
scoping groups always appear, even the ones this company will never be asked.
The file argues for that explicitly — a stable, predictable rail over per-run
precision, so nothing shifts under the user mid-flow.

**That trade was right for the reason given and wrong in its conclusion**, and the
adaptive principle is why. A group that never goes `current` and is silently swept
to `done` at the end is a step the user was shown, never did, and got credit for.
It teaches them the rail is decorative. Worse, it's avoidable: `questions.py`
already knows which groups apply *before the wizard renders*, so the real list is
available at exactly the moment we currently choose to ignore it.

The fix keeps the property the original decision actually cared about:

- **Compute the real step list once, when the run's shape becomes known**, and
  render exactly that. Scoping groups are known before the first question; the
  three AI stages are unconditional; correction stages are genuinely conditional
  and already insert on fire.
- **No jitter, because nothing is removed** — the list is built from real data up
  front rather than grown incrementally. Stability was never in conflict with
  accuracy here; it was in conflict with *late* knowledge, and we have it early.
- Where a step genuinely cannot be known in advance (a correction pass), it
  appears when it fires **with a reason**, which is information rather than
  instability.

Small change, and it's the precondition for the rest: an ETA layered on a rail the
user has already learned to distrust doesn't get believed either.

### Phase A — Set expectations, then keep an honest promise

*Before the run starts*, on the button itself and in the panel that replaces the
form:

> **Drafting your brief — usually 2 to 4 minutes.**
> It reads the actual instruments and cites every claim, which is why it isn't
> instant. Feel free to switch tabs — we'll keep working and can notify you when
> it's ready.

**Say "switch tabs", not "leave".** With Phase D deferred, backgrounding a tab is
safe but *closing* it loses the work. The copy has to match what the system can
actually keep — this is the one place the deferral is user-visible, and a promise
we can't honour would undermine every other honest number on the screen. Once D
ships, the wording can widen.

`2 to 4 minutes` is p10–p90 (138–267s) rounded outward, not an average. Sourced
from `brief-check --history`, not hand-written — the same rule the design
guidelines already impose on corpus counts: **no hardcoded number that describes
measured reality.** Add `GET /api/brief/expected` returning
`{p10, p50, p90, sample_size, measured_at}` computed from stored reports, so the
promise updates itself as the pipeline changes.

**The ETA model**, once running:

```
remaining_seconds = (expected_total_tokens − tokens_emitted) / observed_rate
```

- `observed_rate` starts at the measured 93.7 tok/s and is **replaced by this
  run's own live rate after ~500 tokens** — about five seconds in. Given a
  population stdev of 2.1 tok/s, it converges essentially immediately, and from
  then on the number on screen is derived from this run and nothing else.
- `expected_total_tokens` starts at the clean-path median (~16,000) and is
  revised **upward** the instant a `cross-checking` / `verifying` stage arrives,
  because that event *is* the signal we've entered the correction population
  (median 412s vs 176s).
- **Explicitly do not "refine" the estimate when retrieval completes.** It is the
  obvious place to show adaptivity — a stage just finished, numbers just arrived —
  and the measurements say those numbers carry no predictive signal (§1a). A
  visible refinement there would be the plan's own anti-pattern: motion that looks
  like intelligence and isn't. Hold the range; adapt when there is something to
  adapt to.
- Render as a **decaying range** — "about 3 minutes left", then "about 90 seconds
  left", then "almost there" under 30s. Never a ticking second-by-second number:
  precision we can't honour reads as a broken promise, and the research is
  explicit that consistently-disappointing estimates are worse than ranges.
- **Never let the ETA go up silently.** If the correction pass fires, say so:
  *"Found an inconsistency in the compliance table — running a correction pass,
  about a minute more."* An ETA that increases with a reason is trustworthy; one
  that increases without a reason destroys the whole instrument.

### Phase B — Make the wait substantive (the highest-value change)

Right now each of the three AI steps is a名 with a timer. During *Committee
markup* the user watches a 90-second nothing. Two changes fix that, both using
data we already have and throw away.

**B1 — Stream the first reading.** Switch `generate_briefing` from
`client.messages.create` to `client.messages.stream(...)` + `.get_final_message()`
and forward text deltas over the existing NDJSON channel as
`{"type":"delta","stage":"drafting","text":…}`. The draft then *appears* — the
"contextual activity visualisation" pattern, and the strongest possible answer to
"is this thing stuck".

This is also what unlocks the accurate ETA, because token counts become live
rather than known-only-at-the-end. Two birds, one change.

**The metaphor does the hard design work here.** Label the streaming pane
**First reading — provisional text**, visually marked as such (lighter weight,
a thin rule, the existing `.excerpt` treatment). When the sharpen pass runs, the
label becomes **Committee markup** and amended passages highlight briefly before
settling. The user is not watching a draft get thrown away and replaced — they
are watching a bill be amended, which is exactly what is happening, and exactly
what our rail has been calling it all along.

Risk to manage: users may screenshot or act on provisional text. Mitigate with
the explicit "provisional" marker, and by *not* offering copy/export until the
second reading completes.

**B2 — Name what is being read.** During retrieval we know precisely which
instruments came back — we just don't tell anyone. Emit them:

```json
{"type":"sources","stage":"retrieving",
 "found":[{"title":"AI Act","celex":"32024R1689","article":"Art. 6"}, …],
 "counts":{"instruments":84,"passages":112}}
```

and render a short, live-appending list under *First reading*:

> Reading **AI Act** · Art. 6 — high-risk classification
> Reading **GDPR** · Art. 22 — automated decision-making
> …and 82 more instruments

This is the "Analysing 2.3 million data points" justification pattern with real
specifics, and it doubles as a trust signal: the user sees we are reading actual
law, which is the entire differentiator over a generic chatbot. Cap the visible
list (5 rows, fading) so it informs without becoming a firehose.

### Phase C — Let them leave (zero new backend)

Three cheap mechanisms, in ascending order of intrusiveness, matching the
four-layer model:

**C1 — Ambient: the tab itself.**
- `document.title` becomes `(~2m) Drafting your brief · Regina`, updated on each
  ETA revision. Costs nothing, needs no permission, and is the single most
  effective tab-away signal.
- **A live favicon progress ring.** Draw the favicon on a canvas each tick: a
  thin-stroke ring filling clockwise, in the site's accent colour, matching the
  1.5px hand-drawn icon language. Falls back silently to the static favicon where
  unsupported. This is on-brand in a way a generic spinner can't be — the same
  line weight as the rail icons, just rendered at 32px.
- On completion: title becomes `✓ Your brief is ready · Regina`, favicon ring
  completes and holds.

**C2 — Attention: one notification, only on completion.** Request Notification
permission **only when the user actively chooses "notify me"** — never on page
load, which is the classic permission-prompt anti-pattern. Fire exactly one
notification, on completion or failure. Per the interrupt-budget rule, we fire
**zero** notifications for progress milestones. The brief needs no mid-run
decisions, so there is no legitimate second interrupt.

**C3 — Keep the tab alive.** Background tabs get throttled timers, which is fine
for our ETA (it self-corrects on the next event) but can stall a `fetch` reader
on some browsers. Use the **Page Visibility API** to detect return and immediately
reconcile state from the server rather than trusting accumulated client timers.

### Phase D — Survive the connection — **DEFERRED 2026-07-30**

**Decision: not building this now.** Revisit only if abandonment turns out to be a
real problem in practice. Recorded here with its trigger so the deferral is a
decision rather than a gap someone rediscovers later.

**What deferring actually costs.** Two things, and the first is smaller than it
first appears:

1. *Backgrounding a tab is already safe.* The stream is a normal HTTP response;
   switching tabs keeps the connection open, the reader keeps draining it, and the
   brief arrives. Only **closing** the tab (or a network drop) loses the work — the
   worker thread finishes, writes to a queue nobody is reading, and the result is
   discarded. So Phase C keeps almost all of its value; what changes is the wording
   (see below), not the mechanism.
2. *An abandoned brief costs $0.72 and we cannot currently count them.* That is the
   real gap — not the loss itself, but that we're blind to its frequency.

**So the one thing to build now is the counter, not the persistence.** Starlette
cancels the streaming generator when the client goes away, which is a detectable
event:

```python
# in event_stream(), around the drain loop
except asyncio.CancelledError:
    log.warning("brief_abandoned", company=req.name,
                stage=last_stage, elapsed_s=round(time.monotonic() - started, 1))
    raise
```

~5 lines, no schema, no retention question. It gives us the number that decides
this phase: **how often does a user close the tab mid-brief, and at which stage?**
Without it, deferring D is a guess we can never settle, because a completed brief
nobody fetched looks identical to an abandoned one.

**Revisit D when** the abandonment rate is high enough that the wasted spend or the
lost user work justifies the schema — or when a paying customer asks for a brief
they can come back to, which is a product requirement rather than a UX one.

**Related leak, worth noting even while deferred:** the rate limiter counts
*requests*, not *work*, so a user who reloads three times costs three briefs and is
charged one hit. Persistence would fix that as a side effect. Until then it is
bounded by the per-IP hourly cap, which is why this is tolerable rather than urgent.

<details>
<summary>The design, for when we do build it</summary>

Minimal honest design:

1. `POST /api/brief` creates a **`BriefJob`** row (`id`, `profile`, `status`,
   `stage`, `tokens_emitted`, `expected_tokens`, `partial_text`, `result`,
   `created_at`, `finished_at`) and returns its id immediately.
2. Generation runs against that row, updating stage/token/partial columns as it
   goes — the same events currently pushed to the queue, persisted instead of
   only broadcast.
3. `GET /api/brief/{id}/stream` streams from the current state onward;
   `GET /api/brief/{id}` returns a snapshot. Reconnect = re-subscribe, exactly the
   consolidation pattern our own agent tooling uses elsewhere.
4. A **"Recent briefs"** entry point lists the last N jobs for the session with
   their status, so returning users *find* their work instead of restarting it.
5. Retention: jobs carry real user-submitted company descriptions, so they self-
   prune on the same schedule as `RetrievalEvent`
   (`brief_eval_retention_days`, default 14) rather than accumulating.

This also makes the rate limiter honest, and a reload re-attaches instead of
re-spending.

</details>

### Phase E — Polish that earns its keep

- **Stage micro-animations, one per stage, in the existing line-art language.**
  Not a generic spinner: the `BookIcon`'s pages turn during *First reading*; the
  `PenIcon` traces a short stroke during *Committee markup*; the `LoopIcon`
  rotates once per revision during *Second reading*; the `BallotIcon` ticks during
  *Plenary vote*. All CSS `stroke-dashoffset` / `transform` on the SVGs already in
  the file — no new assets, no library. Respect `prefers-reduced-motion`: fall
  back to a static "current" state.
- **A progress arc on the rail**, not a bar: a thin ring around the current
  step's icon, filling by token progress. Consistent with the favicon ring, so
  the tab and the page tell the same story in the same visual language.
- **Elapsed *and* remaining** on the current step — we already show elapsed, and
  the pair reads as competence where elapsed alone reads as a stopwatch on a
  stalled process.
- **Completion summary**, per the four-layer model's summary tier: *"Done in 3m
  12s · 84 instruments read · 41 claims cited · 0 consistency issues."* Those are
  all values we already compute (`retrieval_stats`, `citations`, `canon_notes`) and
  currently discard at the UI layer. It closes the loop on why the wait was worth
  it, and it's honest — including when `canon_notes` isn't zero.

---

## 4a. The visual language, concretely

The existing icon set is the constraint and the opportunity: 20×20 viewBox,
`stroke-width: 1.5`, `currentColor`, round caps, no fills. Everything new must be
drawable in that language or it will look bolted on. Nothing here needs a new
asset or an icon library — the SVGs are already in `ProgressRail.tsx`.

### Stage identity: what each icon does while it is `current`

Each animation is chosen to depict *the actual work*, not to signal "busy". All are
CSS on the existing paths (`stroke-dasharray`/`stroke-dashoffset`, `transform`),
and all collapse to a static `current` state under `prefers-reduced-motion`.

| Stage | Icon | Motion while current | Why this motion |
|---|---|---|---|
| First reading | `BookIcon` | Centre spine holds; the two page curves flex ~2px, 2s ease-in-out | Reading, not loading |
| Committee markup | `PenIcon` | Nib traces its own diagonal stroke, 1.5s, repeating | Text is being written — and it literally is |
| Second reading | `LoopIcon` | One 360° rotation per revision event received | Rotation count = real work count, not decoration |
| Point of order | `FlagIcon` | Flag ripples once, then holds | An exception was raised, and it's momentary |
| Plenary vote | `BallotIcon` | Tick draws itself in over 400ms | A check being made, not spun |
| Filing / scoping | existing | No motion | The user is acting, not waiting |

The rule embedded here: **motion appears only where the user is waiting on us.**
During the wizard the user is the slow part, and animating our icons then would
imply we're busy when we're idle.

### Progress geometry: one ring, three places

A single visual idiom, rendered at three scales, so the tab, the rail and the
favicon all say the same thing:

- **Rail** — a 1.5px ring around the current step's icon, filling clockwise by
  token progress. Determinate during drafting/sharpening (we have real token
  counts); a slow indeterminate sweep during retrieval (we don't, and §1a says
  don't fake it). The two states must be *visually distinguishable* — a filling
  arc versus a travelling arc — so the user is never told a guess is a measurement.
- **Favicon** — the same ring at 32px on a canvas, accent stroke on transparent,
  redrawn on each ETA revision. Same geometry, same weight, so a glance at the tab
  is continuous with the page.
- **Completion** — ring closes and holds; it does not vanish. A finished ring is
  the ambient "your work is done" signal that survives a tab switch.

### Typographic treatment of provisional text

Phase B1 streams a first-reading draft that will later be amended. It must be
unmistakably provisional without being unreadable:

- Draft body in the existing `.excerpt` treatment (lighter weight, slightly
  reduced contrast), capped at the site's `max-width: 760px` reading measure.
- A thin left rule in the accent colour, and a persistent inline label
  **First reading — provisional**.
- On transition to Committee markup, amended passages get a brief background
  wash (~600ms, single pass, no loop) then settle into final styling. Diff-flash,
  not diff-view: the user sees *that* it changed, without being asked to read a
  changelog.
- Copy and export stay disabled until the second reading completes. The
  provisional marker is a promise; letting someone export provisional text breaks
  it.

---

## 5. What not to build

- **No percentage that isn't real.** We can compute honest token-based progress
  during drafting; we cannot during retrieval. Show a determinate ring only where
  the number means something, and an indeterminate state where it doesn't. A fake
  87% that sits still is worse than no number.
- **No progress notifications.** The interrupt budget is finite and there are no
  mid-run decisions to make. One completion notification, chosen by the user.
- **No forced watching.** If the rail must be open for the user to feel safe, the
  ambient layer has failed. Title + favicon are the test: does the tab alone tell
  you enough?
- **No "estimated 2:47 remaining" countdown.** False precision on a bimodal
  distribution. Ranges that decay.
- **No chat-style fake reasoning narration.** We can show what the model *is*
  doing (real stages, real instruments, real text). Inventing plausible-sounding
  interior monologue would be fabrication, and it's the same line the brief prompt
  already forbids crossing about stakeholders.

---

## 6. Sequencing and effort

| Phase | Effort | Ships independently | Why this order |
|---|---|---|---|
| 0 — adaptive rail | S | ✅ | Precondition: an ETA on a rail the user distrusts isn't believed |
| A — expectations + ETA | S | ✅ | Pure win, no backend; the promise the rest depends on |
| B1 — stream the draft | M | ✅ | Biggest perceived change; also unlocks A's live token feed |
| B2 — name the sources | S | ✅ | Uses data already retrieved and thrown away |
| C1 — title + favicon ring | S | ✅ | Cheapest tab-away support that exists |
| C2 — completion notification | S | ✅ | Opt-in only |
| D′ — abandonment counter | XS | ✅ | ~5 lines; the number that decides whether D is ever needed |
| ~~D — job persistence~~ | **L** | — | **Deferred 2026-07-30** until abandonment proves to be a real problem |
| E — polish | M | ✅ | Only after the substance is right |

A, B2 and C1 together are a day's work and change the experience most. With D
deferred, the whole plan is now frontend plus two small backend touches: streaming
the draft (B1) and the abandonment counter (D′).

**Do A before B1.** B1 is more exciting, but if the ETA is wrong the streaming
text just makes a broken promise more visible.

---

## 7. How we'll know it worked

The A/B taught us to define the measurement before running the change:

- **Abandonment rate** — from the Phase D′ counter: how often the client
  disconnects mid-brief, and at which stage. This is the trigger for reopening
  Phase D, so it has to exist even though D doesn't. Note the asymmetry it
  resolves: without it, a completed brief nobody fetched is indistinguishable
  from an abandoned one.
- **ETA honesty** — |predicted − actual| / actual per run, logged. Target: within
  25% on the clean path. We have the data to backtest this offline against the 20
  briefs already generated *before writing any UI*, which is the cheapest possible
  validation.
- **Tab-away rate** — how often the Page Visibility API sees a hide during
  generation. If it's high, C and D are load-bearing rather than nice-to-have.
- No quality regression: `brief-check --history` already tracks score, cost and
  latency per run, so a UX change that accidentally alters generation shows up.

---

## Sources

- [Strawberry — agentic browser](https://strawberrybrowser.com/) ·
  [Product Hunt](https://www.producthunt.com/products/strawberry) ·
  [review of its visible/guidable agent flow](https://skywork.ai/blog/vibecoding/strawberry-browser-review-2025-pros-cons-real-use-cases-3/)
- [OpenAI — Introducing deep research](https://openai.com/index/introducing-deep-research/)
- [Long-Running AI Tasks in UIs: Patterns That Keep Users Engaged](https://particula.tech/blog/long-running-ai-tasks-user-interface-patterns)
- [Agent Status Monitoring — AI Design Patterns](https://www.aiuxdesign.guide/patterns/agent-status-monitoring)
- [Loading UI/UX Patterns for AI Applications](https://www.telerik.com/blogs/loading-ui-ux-patterns-ai-applications)
- [Agent UX: designing UI for AI agents in 2026](https://fuselabcreative.com/ui-design-for-ai-agents/)
- [Background Agents — AI UX Playground](https://aiuxplayground.com/glossary/background-agent/)
- [Handling Long-Running Operations with Background Responses — Microsoft Agent Framework](https://devblogs.microsoft.com/agent-framework/handling-long-running-operations-with-background-responses/)
- Our own measurements: `exports/ab-baseline-sonnet.json`,
  `exports/ab-challenger-haiku.json`, `regina brief-check --history`


---

## 8. What building it actually found

Four real briefs were run end to end through a browser. Every item below was found
by that, not by review — and the first two were invisible to the existing test
suite and to `brief-check`, because neither goes through `etl/api.py`.

**1. `/api/brief` was broken for every real brief — pre-existing, fatal.**
`log.info("brief_generated", …, passages=len(...), **retrieval_stats)` passed
`passages` twice, since `retrieval_stats` carries its own `passages` key. It raised
*after* the full ~3 minutes of generation was paid for, so a user saw "Report
generation failed" having cost us $0.72. Confirmed pre-existing at `HEAD` with
`git show`. The CLI path (`brief-check`) doesn't import `api.py`, which is exactly
why every panel run looked healthy while the product was broken.

**2. The ETA was calibrated 5x too high.** It assumed streamed characters ≈
`output_tokens x 4`. Measured against the stored briefs: visible text is only
**~19%** of that, because output tokens include thinking *and* both passes while
`text_stream` yields text only. Recalibrated on measured final-text length
(~26,500 chars across the two streaming passes).

**3. The ETA rose, breaking this plan's own rule.** Observed live: "about a minute
left" jumped back to "about 3 minutes left" the moment the token-based estimate
took over from the median fallback. Now clamped monotonically; it may only rise
when a correction pass fires, which is announced with a reason.

**4. A transient 529 lost a whole brief.** Anthropic returned
`overloaded_error` ~40s in and the brief died. The retry policy for exactly this
failure existed only in `etl/brief_eval/cost.py` — the eval path — while production
streamed with none. Now retried up to 3 times, but **only while no text has been
forwarded**: once the user has read something, a retry would duplicate or
contradict it, so the error surfaces instead.

Also: a stale `ept serve` from the pre-rebrand `EuroPolTracker` checkout was
holding port 8000, so local testing had been hitting the old backend; and
`restoreFavicon()` left `href=""` (a visibly broken icon) when the page had no
icon link of its own.

### The dead zone, and how it was actually closed

First pass at this shipped a *label* for the ~90–100s before any report text
exists ("Reading the retrieved provisions…") and recorded the real fix as not
done. That was settling too early, and the user pushed back correctly: **this is
precisely the window where someone decides whether the thing is working.**

The API already had the answer. Adaptive thinking defaults to
`display: "omitted"`, which streams thinking blocks with empty text — the
documented consequence being that it "looks like a long pause before output."
Setting `thinking: {type: "adaptive", display: "summarized"}` returns the model's
**own summarised reasoning**, streamable, billed identically (display controls
visibility only, not whether thinking happens).

So the pre-writing stretch is now filled with real reasoning rather than a label.
Measured on a live brief:

| | before | after |
|---|---|---|
| First content on screen | ~90–100s (report text) | **~20s** (reasoning) |
| Dead zone | ~100s | **~20s**, itself covered by the reading list (~7s) |

And the content earns its place. Verbatim from the run:

> *"I'm noticing a contradiction in the profile data — it claims the company
> doesn't handle personal data, but automated credit scoring inherently requires
> processing personal data. The activity description makes it clear that personal
> data is being handled…"*

The user watches the model catch a real inconsistency in their own input. That is
a trust-building moment, and it cost nothing but a parameter and an event type.

**Why this and not invented narration.** Streaming the model's actual reasoning is
honest; generating plausible-sounding progress commentary would be the same
fabrication the brief's own prompt forbids about stakeholders. The distinction is
the whole design: real signal or none.

Implementation notes: `_generate` iterates raw stream events rather than
`stream.text_stream` (which yields answer text only), forwarding `thinking_delta`
and `text_delta` separately; the client keeps only the last 1,200 characters,
because this is a live "working" signal and not a transcript to scroll; the pane is
bottom-anchored so new reasoning appears at a stable position; and it clears at
each stage change so one call's tail never sits under the next call's output.

### Verified live

```
t=  0s  reasoning=0     draft=0       eta=about 3 minutes left
t= 20s  reasoning=789   draft=0       eta=about 3 minutes left   <- reasoning starts
t= 90s  reasoning=1198  draft=0       eta=about 90 seconds left
t=110s  reasoning=0     draft=3242    eta=under a minute left    <- text starts
t=150s  reasoning=0     draft=0       eta=under a minute left    <- second reading
t=190s  reasoning=0     draft=11775   eta=almost there
t=200s  FINISHED — 'Done in 3m 14s · 64 instruments read · 15 claims cited · no consistency issues'
        title='✓ Your brief is ready · Regina'
```

No horizontal overflow at 320/375/768/1280/1920/2560px with the panel live.
