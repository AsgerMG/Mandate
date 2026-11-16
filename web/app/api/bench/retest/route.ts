// LOCAL-ONLY (lib/bench/guard.ts). Re-test: run an eval case
// (mandate/eval/scenarios/<case>.yaml) on the bench with the playbooks as they
// are now, the loop's way: the brain reads a leave-one-out case library (turns.ts),
// then the JUDGE agent grades the answer with mandate/eval/rubric.py's prompt and
// grade rule, and the loop's decide rule compares it with the previous judged
// re-test of the same case: KEEP or REVERT the change it checks. All three steps
// are mandate/eval/bench_retest.py, so the app and the loop cannot drift.
// Records live outside the repo (~/Mandate-backups/bench/retests).
//   GET                         the re-tests (judgement, decision) and the cases
//   POST {case, afterChange?}   run the case (one turn on the case's brain), then judge it
//   POST {action:"score", id}   judge a finished run again
//   POST {action:"revert"|"keep", id}  act on the decision (revert writes the old files back)
import path from "node:path";
import { fail, guard, json, readJson } from "@/lib/bench/guard";
import {
  isId, parseScenario, parseScore, previousJudged, scoreOf, sideOf,
  type BenchConversation, type Brain, type Retest, type RetestDecision, type RetestJudgement,
} from "@/lib/bench/model";
import {
  appendFeedback, benchRetestPy, changesOf, getConversation, getRetest, listRetests, listScenarios, newId, nowIso, playbooksInForce,
  readFeedback, readRepoFile, readScenario, repoPath, repoRoot, saveConversation, saveRetest, SCENARIO_RE, updateConversation, writeRepoFile,
} from "@/lib/bench/store";
import { isRunning, startTurn } from "@/lib/bench/turns";
import { unlinkSync } from "node:fs";

export const dynamic = "force-dynamic";

const brainOfCase = (job: string, id: string): Brain => (/policy|regulat/i.test(`${job} ${id}`) ? "regina" : "wincent");
const scenarioFile = (c: string) => path.join(repoRoot(), "mandate/eval/scenarios", `${c}.yaml`);

function newConversation(c: Omit<BenchConversation, "id" | "session_id" | "messages" | "cites" | "sources" | "saved" | "created_at" | "updated_at">): BenchConversation {
  const now = nowIso();
  const conv: BenchConversation = { id: newId("c"), session_id: null, messages: [], cites: {}, sources: [], saved: [], created_at: now, updated_at: now, ...c };
  saveConversation(conv);
  return conv;
}

const answerOf = (r: Retest) => getConversation(r.run_conversation)?.messages.filter((m) => m.role === "agent" && m.text).map((m) => m.text).join("\n\n---\n\n") ?? "";

/** Step 2: the judge grades the run (the loop's prompt; the answer only, never a self-score). */
function startJudging(r: Retest): Retest {
  const answer = answerOf(r);
  if (!answer) { const next = { ...r, judge_error: "the re-test has no answer to judge" }; saveRetest(next); return next; }
  const p = benchRetestPy(["prompt", "--scenario", scenarioFile(r.case)], answer);
  if (!p.ok) { const next = { ...r, judge_error: `could not build the judge's prompt: ${p.error}` }; saveRetest(next); return next; }
  const conv = newConversation({ mandate_id: null, agent: "judge", brain: r.brain, kind: "score", case: r.case, title: `Judge: ${r.case}` });
  const next: Retest = { ...r, score_conversation: conv.id, score: null, judgement: null, judge_error: null, decision: null };
  saveRetest(next);
  startTurn(conv.id, p.out, { onDone: () => { const cur = getRetest(r.id); if (cur) finishJudging(cur); } });
  return next;
}

/** Step 3: read the judge's JUDGE line through the one grade rule, store it with the
 *  run, and decide against the previous judged re-test of the same case. */
function finishJudging(r: Retest): Retest {
  if (r.judgement || !r.score_conversation || isRunning(r.score_conversation)) return r;
  const c = getConversation(r.score_conversation);
  const last = c?.messages.filter((m) => m.role === "agent").pop();
  if (!c || !last) return r;
  if (c.agent !== "judge") { // a re-test scored by the interviewer before the judge was wired
    const score = parseScore(last.text);
    if (!score || r.score) return r;
    const next = { ...r, score };
    saveRetest(next);
    return next;
  }
  if (last.error || !last.text) { const next = { ...r, judge_error: last.error ?? "the judge gave no reply" }; if (next.judge_error !== r.judge_error) saveRetest(next); return next; }
  const g = benchRetestPy(["grade", "--scenario", scenarioFile(r.case)], last.text);
  if (!g.ok) { const next = { ...r, judge_error: g.error }; if (next.judge_error !== r.judge_error) saveRetest(next); return next; }
  const judgement = JSON.parse(g.out) as RetestJudgement;
  let next: Retest = { ...r, judgement, score: scoreOf(judgement), judge_error: null };
  next = { ...next, decision: decide(next) };
  saveRetest(next);
  // the re-test's conversation is an eval run: the judge's grade is its grade
  updateConversation(r.run_conversation, (run) => {
    if (!run.eval_run) return;
    run.eval_run.grade = judgement.grade;
    run.eval_run.judge = { grade: judgement.grade, holistic: judgement.holistic_grade, scale: judgement.scale, must_met: judgement.must_met,
      must_partly: judgement.must_partly, must_total: judgement.must_total, must_not_hit: judgement.must_not_hit, must_not_total: judgement.must_not_total,
      overall: judgement.overall, strongest: judgement.strongest_move, weakest: judgement.weakest_move, judged_at: judgement.judged_at, judgement: null };
  });
  return next;
}

function decide(r: Retest): RetestDecision | null {
  const prev = previousJudged(listRetests(), r);
  const before = prev && sideOf(prev);
  const after = sideOf(r);
  if (!prev || !before || !after) return null;
  const toRec = (x: Retest) => ({ grade: x.judgement!.grade, must_met: x.judgement!.must_met, must_partly: x.judgement!.must_partly, must_not_hit: x.judgement!.must_not_hit });
  const d = benchRetestPy(["decide", "--case", r.case], JSON.stringify({ before: toRec(prev), after: toRec(r) }));
  if (!d.ok) return null;
  const out = JSON.parse(d.out) as { keep: boolean; reason: string };
  const changes = r.after_change ? changesOf(r.after_change) : [];
  return {
    verdict: out.keep ? "keep" : "revert", reason: out.reason, before, after, decided_at: nowIso(),
    change: r.after_change ? { conversation_id: r.after_change, paths: [...new Set(changes.map((c) => c.path))] } : null,
  };
}

/** Undo the change a re-test checked: each file back to what it was before its FIRST
 *  accepted version in that conversation, only when it still reads as the last
 *  accepted version (a later edit is the owner's: never overwritten). The feedback
 *  the change resolved is reopened. */
function revert(r: Retest): { ok: true; paths: string[] } | { ok: false; error: string } {
  const ch = r.decision?.change;
  if (!ch || !ch.paths.length) return { ok: false, error: "this re-test checks no accepted change" };
  const changes = changesOf(ch.conversation_id);
  const plan: { abs: string; rel: string; before: string | null }[] = [];
  for (const rel of ch.paths) {
    const mine = changes.filter((c) => c.path === rel);
    const abs = repoPath(rel, "proposal");
    if (!abs || !mine.length) return { ok: false, error: `no record of the change to ${rel}` };
    if (readRepoFile(abs) !== mine[mine.length - 1].after) return { ok: false, error: `${rel} has changed since the proposal was accepted; revert it by hand` };
    plan.push({ abs, rel, before: mine[0].before });
  }
  for (const p of plan) {
    if (p.before === null) { try { unlinkSync(p.abs); } catch { /* already gone */ } }
    else writeRepoFile(p.abs, p.before);
  }
  const at = nowIso();
  for (const it of readFeedback()) {
    if (it.status === "resolved" && it.resolution?.by === "accepted" && it.resolution.conversation_id === ch.conversation_id)
      appendFeedback({ type: "status", id: it.id, status: "open", at, by: "reopened", conversation_id: ch.conversation_id });
  }
  return { ok: true, paths: plan.map((p) => p.rel) };
}

/** The next step a re-test is waiting for, done now (a server restart lost the chain). */
function advance(r: Retest): Retest {
  if (isRunning(r.run_conversation) || (r.score_conversation && isRunning(r.score_conversation))) return r;
  // only a re-test made since the judge was wired (judgement: null) is judged unasked
  if (!r.score_conversation && !r.judge_error && r.judgement === null) return answerOf(r) ? startJudging(r) : r;
  return finishJudging(r);
}

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const retests = listRetests().map(advance).map((r) => ({
    ...r, running: isRunning(r.run_conversation) || (!!r.score_conversation && isRunning(r.score_conversation)),
  }));
  return json({ retests, cases: listScenarios() });
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const b = await readJson(req, 5_000);
  if (!b) return fail("expected a JSON object");

  if (b.action === "score" || b.action === "revert" || b.action === "keep") {
    if (!isId(b.id)) return fail("bad id");
    const r = getRetest(b.id);
    if (!r) return fail("no such re-test", 404);
    if (b.action === "score") {
      if (isRunning(r.run_conversation)) return fail("the re-test is still running; judge it when it has answered", 409);
      if (r.score_conversation && isRunning(r.score_conversation)) return fail("it is being judged now", 409);
      const next = startJudging(r);
      if (!next.score_conversation || next.judge_error) return fail(next.judge_error ?? "could not start the judge");
      return json({ retest: next, conversationId: next.score_conversation });
    }
    if (!r.decision) return fail("this re-test has no decision yet");
    if (r.decision.applied) return fail(`already ${r.decision.applied.action}`, 409);
    let paths: string[] = [];
    if (b.action === "revert") {
      const done = revert(r);
      if (!done.ok) return fail(done.error, 409);
      paths = done.paths;
    }
    const next: Retest = { ...r, decision: { ...r.decision, applied: { action: b.action === "revert" ? "reverted" : "kept", at: nowIso(), paths } } };
    saveRetest(next);
    return json({ retest: next });
  }

  if (typeof b.case !== "string" || !SCENARIO_RE.test(b.case)) return fail("pick an eval case");
  const yaml = readScenario(b.case);
  if (!yaml) return fail("no such eval case", 404);
  const s = parseScenario(yaml);
  if (!s.founder_says) return fail("the case has no founder_says to send");
  if (b.afterChange !== undefined && b.afterChange !== null && !isId(b.afterChange)) return fail("bad afterChange");
  const brain = brainOfCase(s.job, b.case);
  const conv = newConversation({
    mandate_id: null, agent: brain, brain, kind: "retest", case: b.case, title: `Re-test: ${b.case}`,
    // an eval run like the loop's: Train, Review runs lists it to read and comment as a chat
    eval_run: { kind: "eval_run", case_id: b.case, brain, tag: "retest", run_file: null, source: "retest", ran_at: nowIso(), grade: null, judge: null, owner_grade: null,
      instruction: "Bench re-test: worked in full in one reply, no questions first." },
  });
  const message = [
    s.founder_says,
    s.founder_followup ? `More about us, so you can answer in one go: ${s.founder_followup}` : "",
    "(Bench re-test: work the case in full in this one reply; do not stop to ask questions first. Do not save the run.)",
  ].filter(Boolean).join("\n\n");
  const pb = playbooksInForce(brain);
  const r: Retest = {
    id: newId("r"), case: b.case, brain, after_change: (b.afterChange as string | undefined) ?? null, playbooks_sha: pb.sha, playbooks_dirty: pb.dirty,
    run_conversation: conv.id, score_conversation: null, score: null, judgement: null, judge_error: null, decision: null, created_at: nowIso(),
  };
  saveRetest(r);
  // the judge follows the brain on the server: no click, and no page needs to be open
  startTurn(conv.id, message, { onDone: (error) => {
    const cur = getRetest(r.id);
    if (!cur) return;
    if (error) saveRetest({ ...cur, judge_error: `the brain's turn failed: ${error}` });
    else startJudging(cur);
  } });
  return json({ retest: r, conversationId: conv.id }, 201);
}
