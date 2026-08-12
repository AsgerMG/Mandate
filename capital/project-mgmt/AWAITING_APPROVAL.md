# Awaiting your approval

Everything that costs money or is your decision, in one place. Nothing here has
been done. Free work continues meanwhile.

Kept newest-first within each section. When an item is decided, it moves out of
this file and into the commit that acts on it.

---

## Spending

### 1. The blind relevance grader — EUR 1.6

**You approved this before going to sleep; I have parked it anyway**, because
you then said free work only while you are away, and its result reframes the
target rather than unblocking any work. Nothing is waiting on it tonight.

Our answer key is *"the fund that paid this company"* — history, not relevance.
Hand-checking found it arguable on **4 of 9** losses: the population describes a
founder using prose from an award under a *different* regime, so a
multi-project company is described by project X while the key is the fund that
paid for project Y. A founder we score as a miss may have been shown a *better*
fund than the one they happened to win.

The grader is already built and leak-tested (`scripts/_wsdx_grade.ts`,
`check_grader_blind.ts`), reports the historical key and the adviser's judgement
side by side and throws rather than print one alone, and carries a
pre-registered decoy test that discards the metric if it fails.

**Why it matters:** if the key is arguable on a third of cases, 90% against it
is neither reachable nor desirable, and every measurement we take meanwhile
inherits the doubt.

### 2. Widening the shortlist the AI sees, 18 → 40 — EUR 11-13 to confirm

The single largest loss in the product: **28.5 points**. Eighteen was never a
cost or accuracy figure — git shows it was a stopgap for three filters that have
all since moved elsewhere.

Free evidence says widening is right: it costs about **1.3 euro-cents a brief**,
and the old "a longer list makes the model worse" result is contradicted by our
own paid run — on funds sitting at ranks 7-18 the model found them **22 times of
51** where the old arithmetic found them **none**.

The EUR 11-13 buys the confirmation that the model's accuracy does not collapse
on the longer list. **The change itself is free and needs no new code.**

### 3. Sampling the model more than once — 3x the per-brief cost

Not yet designed, so not yet priced. The paid run showed the model disagreeing
with **itself** on 18% of founders given an identical prompt. Asking three times
and taking the consensus is the standard way to turn that variance into
accuracy. Worth designing free and measuring the gain per sample before
anything ships.

---

## Your decision, no money involved

### 4. A permission rule so four corpus corrections can be applied

Blocked by the sandbox, for me and for every agent. Four rows, dry runs clean,
each grounded in the funder's own page — including Fondo di garanzia, where the
**bank** submits rather than the SME. Two eligibility checks stay red until
they land.

### 5. Removing 24 rows that are not funds

wsFX checked every questionable row against the funder's own page and committed
the evidence. The proposal is **24 rows, 3.1% of the pool** — far smaller than
the ~90 I originally described, because the funders said most of those funds are
open. Ireland loses a third of its nine and deserves a second look.

**Blocked on mechanism, not permission:** the removal command selects by parent,
and these rows sit beside live schemes under the same parents, so running it
as-is would take real funds with them.

### 6. Your personal caches — about 7.6 GB

Not project data, so not mine to clear. Disk is at 32 GB free, so there is no
urgency.

- **Spotify, 4.5 GB** — offline downloads re-download; no re-login
- **Chrome page cache, 3.1 GB** — no logins or bookmarks lost; sites reload
  slower once

The 1.7 GB of stale app-updater files you approved is already gone.

---

## Added overnight

### 7. A live prompt change that free work cannot verify

`contracts/brief/02-funds.md` is the memo writer's own system prompt. wsGK
removed one sentence from it:

> *"A row whose honest next step is to wait does not belong in the brief at all."*

That is a **selection** claim sitting in a **writing** contract, and it is false
now — the ranker decides membership, and as of last night nothing in the
writer's reply can change which funds publish. It is replaced by a stronger
instruction closing the same escape: every row you are given has already been
chosen and will publish. The prohibition on hedging itself is kept verbatim.

**Why it is here:** a prompt change alters what the model writes, and the only
way to see the effect is a paid bench run. `bench_report`'s watch-only counter
is the number to read. Nothing is broken meanwhile — the change makes the
contract agree with the code rather than contradict it.
