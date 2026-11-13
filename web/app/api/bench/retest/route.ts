// LOCAL-ONLY (lib/bench/guard.ts). Re-test: run an eval case
// (mandate/eval/scenarios/<case>.yaml) on the bench with the playbooks as they
// are now, then have the interviewer score the answer against the case's must /
// must_not, so a playbook change shows as before / after. Records live outside
// the repo (~/Mandate-backups/bench/retests).
//   GET                         the re-tests (scores filled in once scored) and the cases
//   POST {case, afterChange?}   run the case (one turn on the case's brain)
//   POST {action:"score", id}   score a finished run
import { fail, guard, json, readJson } from "@/lib/bench/guard";
import { isId, parseScenario, parseScore, type BenchConversation, type Brain, type Retest } from "@/lib/bench/model";
import {
  getConversation, getRetest, listRetests, listScenarios, newId, nowIso, playbooksInForce, readScenario, saveConversation, saveRetest, SCENARIO_RE, updateConversation,
} from "@/lib/bench/store";
import { isRunning, startTurn } from "@/lib/bench/turns";

export const dynamic = "force-dynamic";

const brainOfCase = (job: string, id: string): Brain => (/policy|regulat/i.test(`${job} ${id}`) ? "regina" : "wincent");

function newConversation(c: Omit<BenchConversation, "id" | "session_id" | "messages" | "cites" | "sources" | "saved" | "created_at" | "updated_at">): BenchConversation {
  const now = nowIso();
  const conv: BenchConversation = { id: newId("c"), session_id: null, messages: [], cites: {}, sources: [], saved: [], created_at: now, updated_at: now, ...c };
  saveConversation(conv);
  return conv;
}

/** Fill in a score once its grading turn has finished. */
function withScore(r: Retest): Retest {
  if (r.score || !r.score_conversation || isRunning(r.score_conversation)) return r;
  const c = getConversation(r.score_conversation);
  const last = c?.messages.filter((m) => m.role === "agent").pop();
  const score = last ? parseScore(last.text) : null;
  if (!score) return r;
  const next = { ...r, score };
  saveRetest(next);
  // the re-test's conversation is an eval run: its grade is the score's
  updateConversation(r.run_conversation, (run) => {
    if (!run.eval_run) return;
    run.eval_run.grade = score.grade;
    run.eval_run.judge = { grade: score.grade, holistic: null, must_met: score.must_met, must_partly: null, must_total: score.must_total,
      must_not_hit: score.must_not_hit, must_not_total: score.must_not_total, judgement: null, judged_at: nowIso() };
  });
  return next;
}

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const retests = listRetests().map(withScore).map((r) => ({
    ...r, running: isRunning(r.run_conversation) || (!!r.score_conversation && isRunning(r.score_conversation)),
  }));
  return json({ retests, cases: listScenarios() });
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const b = await readJson(req, 5_000);
  if (!b) return fail("expected a JSON object");

  if (b.action === "score") {
    if (!isId(b.id)) return fail("bad id");
    const r = getRetest(b.id);
    if (!r) return fail("no such re-test", 404);
    if (isRunning(r.run_conversation)) return fail("the re-test is still running; score it when it has answered", 409);
    if (r.score_conversation && isRunning(r.score_conversation)) return fail("it is being scored now", 409);
    const run = getConversation(r.run_conversation);
    const answer = run?.messages.filter((m) => m.role === "agent" && m.text).map((m) => m.text).join("\n\n---\n\n");
    if (!answer) return fail("the re-test has no answer to score");
    const conv = newConversation({ mandate_id: null, agent: "interviewer", brain: r.brain, kind: "score", case: r.case, title: `Score: ${r.case}` });
    startTurn(conv.id, `Score this answer against the eval case mandate/eval/scenarios/${r.case}.yaml (Read it first; ignore its model_answer for scoring the musts, use it only as a reference for the grade).

For each "must": met or not met, one line why. For each "must_not": hit or not, one line why. Then a grade 1-5 as the owner would give it (5 send as is, 4 light edits, 3 right idea / rework, 2 misses the point, 1 wrong). Be strict: a must is met only if the answer actually does it.

End your reply with exactly one line, nothing after it:
SCORE {"must_met": <n>, "must_total": <n>, "must_not_hit": <n>, "must_not_total": <n>, "grade": <1-5>}

The answer to score:

${answer}`);
    const next = { ...r, score_conversation: conv.id, score: null };
    saveRetest(next);
    return json({ retest: next, conversationId: conv.id });
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
    run_conversation: conv.id, score_conversation: null, score: null, created_at: nowIso(),
  };
  saveRetest(r);
  startTurn(conv.id, message);
  return json({ retest: r, conversationId: conv.id }, 201);
}
