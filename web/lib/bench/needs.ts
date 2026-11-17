// LOCAL-ONLY (server). "Needs you": everything the owner can do that improves
// one brain, in order of value, each a single action. Read from what already
// exists (the eval runs as conversations, the loop log, the scenarios, the
// feedback inbox); the owner's answers are appended to one file in the bench
// folder (owner-reviews.jsonl), never written into the repo by the app.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { BRAINS, type Brain, evalRunSummary, type EvalRunSummary } from "./model";
import { dataRoot, listConversations, listScenarios, readFeedback, readRepoFile, readScenario, repoRoot } from "./store";

export type NeedKind = "grade" | "approve" | "confirm" | "feedback" | "expert";
export type Need = {
  kind: NeedKind;
  /** stable id of what is asked about: a conversation id, "proposal:2", "case:<id>" */
  ref: string;
  title: string;
  detail: string;
  /** where to do it, when it is done elsewhere in the bench */
  href: string | null;
  minutes: number;
  /** what to show inline to decide (a proposal's text, a case's checks) */
  body?: { markdown?: string; asks?: string; must?: string[]; must_not?: string[] };
};
export type BrainStanding = {
  brain: Brain;
  /** median judge grade of the latest run of each held-out case, or null */
  heldout_median: number | null;
  heldout_cases: number;
  bar: number;
  owner_grades: number;
};

/** The brain a scenario belongs to: the same rule as mandate/eval/loop.py brain_of. */
export const brainOfScenario = (id: string, job: string): Brain => (/policy|regulat/.test(`${job} ${id}`) ? "regina" : "wincent");

/** The top-level scalars and the must / must_not lists of a scenario file.
 *  Our scenarios are written in one shape (list items "  - text", continued on
 *  deeper-indented lines, optionally quoted), so this reads them without a YAML
 *  dependency; anything it cannot read is left out, not guessed. */
export function readScenarioHead(text: string): { id: string; job: string; status: string; founder_says: string; must: string[]; must_not: string[] } {
  const scalar = (k: string) => (text.match(new RegExp(`^${k}:[ \\t]*([^\\n#>|]*)`, "m"))?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
  const block = (k: string) => {
    const m = text.match(new RegExp(`^${k}:[ \\t]*[>|]-?\\n((?:[ \\t]+.*\\n?)+)`, "m"));
    return m ? m[1].split("\n").map((l) => l.trim()).filter(Boolean).join(" ") : scalar(k);
  };
  const list = (k: string) => {
    const m = text.match(new RegExp(`^${k}:[ \\t]*\\n((?:(?:[ \\t]+.*)?\\n?)+?)(?=^\\S|$(?![\\s\\S]))`, "m"));
    if (!m) return [];
    const items: string[] = [];
    for (const line of m[1].split("\n")) {
      const item = line.match(/^\s{1,4}-\s+(.*)$/);
      if (item) items.push(item[1]);
      else if (line.trim() && items.length) items[items.length - 1] += ` ${line.trim()}`;
    }
    return items.map((s) => s.trim().replace(/^["']|["']$/g, "").replace(/\\"/g, '"')).filter(Boolean);
  };
  return { id: scalar("id"), job: scalar("job"), status: scalar("status"), founder_says: block("founder_says"), must: list("must"), must_not: list("must_not") };
}

type LoopRec = { step: string; n?: number; proposal?: number; brain?: string; check?: string; verdict?: string; at?: string; files?: string[]; reason?: string; rows?: { case: string; before: number; after: number }[] };
function loopLog(): LoopRec[] {
  const t = readRepoFile(path.join(repoRoot(), "mandate/eval/loop/log.jsonl")) ?? "";
  return t.split("\n").filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l) as LoopRec]; } catch { return []; } });
}

export type OwnerReview = { kind: "approve" | "confirm"; ref: string; verdict: "ok" | "change"; note: string; at: string };
const reviewsFile = () => path.join(dataRoot(), "owner-reviews.jsonl");
export function readOwnerReviews(): OwnerReview[] {
  try { return readFileSync(reviewsFile(), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as OwnerReview); }
  catch { return []; }
}
export function appendOwnerReview(r: OwnerReview): void {
  mkdirSync(dataRoot(), { recursive: true, mode: 0o700 });
  appendFileSync(reviewsFile(), JSON.stringify(r) + "\n", { mode: 0o600 });
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const latestPerCase = (runs: EvalRunSummary[]) => {
  const by = new Map<string, EvalRunSummary>();
  for (const r of runs) { const o = by.get(r.case_id); if (!o || r.ran_at > o.ran_at) by.set(r.case_id, r); }
  return [...by.values()];
};
const reviewed = (r: EvalRunSummary) => r.owner_grade != null || r.review_grade != null;

/** What a brain needs from the owner, most valuable first. */
export function needsFor(brain: Brain): { standing: BrainStanding; needs: Need[] } {
  if (!BRAINS.includes(brain)) throw new Error("unknown brain");
  const runs = listConversations().map(evalRunSummary).filter((r): r is EvalRunSummary => !!r && r.brain === brain);
  const latest = latestPerCase(runs);
  const heldout = latest.filter((r) => r.case_id.startsWith("heldout_") && r.judge_grade != null);
  const standing: BrainStanding = {
    brain, heldout_median: median(heldout.map((r) => r.judge_grade!)), heldout_cases: heldout.length, bar: 4,
    owner_grades: runs.filter(reviewed).length,
  };
  const done = new Set(readOwnerReviews().map((r) => `${r.kind}:${r.ref}`));
  const needs: Need[] = [];

  // 1. grades: the judge only counts once it agrees with yours (>= 5 needed)
  for (const r of latest.filter((x) => !reviewed(x)).sort((a, b) => b.ran_at.localeCompare(a.ran_at))) {
    const name = r.case_id.replace(/^(heldout|train)_/, "").replace(/_/g, " ");
    const kind = r.mode === "conversation" ? `a ${r.turns}-turn conversation` : "a one-reply answer";
    const set = r.case_id.startsWith("heldout_") ? "unseen case" : r.case_id.startsWith("train_") ? "training case" : "tuned case";
    needs.push({
      kind: "grade", ref: r.id, title: `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
      detail: `${set}, ${kind}, ${r.ran_at.slice(0, 10)}. The judge gave ${r.judge_grade ?? "no grade"}; what would you give it, 1 to 5?`,
      href: `#/train/review/${r.id}`, minutes: r.mode === "conversation" ? 5 : 3,
    });
  }

  // 2. playbook changes the loop kept: the owner reviews every accepted diff
  const log = loopLog();
  for (const d of log.filter((x) => x.step === "decide" && x.verdict === "KEEP")) {
    const p = log.find((x) => x.step === "propose" && x.n === d.proposal);
    if (!p || (p.brain ?? "wincent") !== brain || done.has(`approve:proposal:${d.proposal}`)) continue;
    const file = `mandate/eval/loop/proposals/${String(d.proposal).padStart(2, "0")}_${p.check}.md`;
    const md = readRepoFile(path.join(repoRoot(), file));
    const moved = (d.rows ?? []).map((r) => `${r.case.replace(/_/g, " ")} ${r.before} → ${r.after}`).join(", ");
    needs.push({
      kind: "approve", ref: `proposal:${d.proposal}`, title: `Approve a playbook change the loop kept (${(p.check ?? "").replace(/_/g, " ")})`,
      detail: `Kept because it scored better and nothing got worse: ${moved}. It is already in the playbook; say if it reads right.`,
      href: null, minutes: 3, body: { markdown: md ?? `(${file} not found)` },
    });
  }

  // 3. draft checks on the cases: the judge grades against these
  for (const id of listScenarios()) {
    const text = readScenario(id);
    if (!text) continue;
    const h = readScenarioHead(text);
    if (brainOfScenario(h.id || id, h.job) !== brain) continue;
    if (h.status === "draft_pending_owner" && !done.has(`confirm:case:${id}`)) {
      needs.push({
        kind: "confirm", ref: `case:${id}`, title: `Confirm the checks on ${id.replace(/^(heldout|train)_/, "").replace(/_/g, " ")}`,
        detail: `${h.must.length} things a senior answer must do and ${h.must_not.length} it must not. Written from your method; the judge grades against them.`,
        href: null, minutes: 3, body: { asks: h.founder_says, must: h.must, must_not: h.must_not },
      });
    } else if (h.status === "draft_pending_expert") {
      needs.push({
        kind: "expert", ref: `case:${id}`, title: `For the expert interview: ${id.replace(/^regina_/, "").replace(/_/g, " ")}`,
        detail: "Checks wait for the policy expert's model answer (say \"let's do the interview for Regina\").",
        href: null, minutes: 0, body: { asks: h.founder_says, must: h.must, must_not: h.must_not },
      });
    }
  }

  // 4. notes you left that are not yet turned into a lesson
  const open = readFeedback().filter((f) => f.status === "open" && f.brain === brain);
  if (open.length) {
    needs.push({
      kind: "feedback", ref: "feedback", title: `Turn ${open.length} note${open.length === 1 ? "" : "s"} into a lesson`,
      detail: "Your comments on replies. Distil proposes one playbook change from them; you accept it, then it is re-tested.",
      href: "#/train/feedback", minutes: 5,
    });
  }
  return { standing, needs };
}
