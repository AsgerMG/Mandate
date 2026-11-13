// Reviewing eval runs as chats: the comment storage (a comment per reply, by a
// named reviewer, in the feedback queue linked to the run, the case and the
// message, and on the conversation), the run list and the review sets. Against
// a temp store; the conversation fixture is the shape
// mandate/eval/run_conversation.py writes (mandate/tests/test_run_conversation.py).
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as fbGET, POST as fbPOST } from "@/app/api/bench/feedback/route";
import { GET as runsGET } from "@/app/api/bench/eval-runs/route";
import { GET as setGET, POST as setPOST } from "@/app/api/bench/review-sets/route";
import {
  distilMessage, evalRunSummary, groupEvalRuns, recordReview, reviewerName, validateReviewSet,
  type BenchConversation, type FeedbackItem,
} from "./model";
import { getConversation, saveConversation } from "./store";

let tmp: string;
const req = (url: string, init: RequestInit & { json?: unknown } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("host", "localhost:3000");
  if (init.json !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${url}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
};
const body = async (r: Response) => r.json() as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

const run = (id: string, over: Partial<BenchConversation["eval_run"]> = {}, ran_at = "2026-11-13T07:19:46+00:00"): BenchConversation => ({
  id, mandate_id: null, agent: "regina", brain: "regina", kind: "eval_run", title: "kids policy (loo)", session_id: null,
  messages: [
    { role: "client", text: "We build an AI tutor.\n\nUK company.", at: ran_at },
    { role: "agent", text: "## Answer\n\nClassify under the AI Act first.", at: ran_at },
  ],
  cites: {}, sources: [], saved: [], case: "kids_policy",
  eval_run: { kind: "eval_run", case_id: "kids_policy", brain: "regina", tag: "loo", run_file: "mandate/eval/runs/loop/loo/kids_policy.md", source: "loop",
    ran_at, grade: 3, judge: null, owner_grade: null, ...over },
  created_at: ran_at, updated_at: ran_at,
});

beforeAll(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "bench-review-"));
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("MANDATE_BENCH_LOCAL", "1");
  vi.stubEnv("MANDATE_BENCH_DATA", path.join(tmp, "data"));
  vi.stubEnv("MANDATE_BENCH_ROOT", path.join(tmp, "repo"));
  delete process.env.VERCEL;
  saveConversation(run("run-loop-loo-kids-policy-aaaa1111"));
  saveConversation(run("run-loop-iter1-kids-policy-bbbb2222", { tag: "iter1", grade: 4 }, "2026-11-14T08:00:00+00:00"));
  saveConversation({ ...run("c-plain-chat-0001"), kind: "chat", eval_run: undefined, agent: "wincent", brain: "wincent" });
});
afterAll(() => { vi.unstubAllEnvs(); rmSync(tmp, { recursive: true, force: true }); });

describe("a comment on a reply of an eval run", () => {
  it("is a feedback item linked to the run, the case, the reply and its reviewer, and sits on the message", async () => {
    const r = await fbPOST(req("/api/bench/feedback", { method: "POST", json: {
      kind: "reply", conversationId: "run-loop-loo-kids-policy-aaaa1111", messageIndex: 1, rating: "off", theme: "method", note: "Lead with the GDPR age gate.", reviewer: "Dr Expert" } }));
    expect(r.status).toBe(201);
    const { item, conversation } = await body(r);
    expect(item).toMatchObject({ kind: "reply", brain: "regina", rating: "off", theme: "method", note: "Lead with the GDPR age gate.", status: "open",
      conversation_id: "run-loop-loo-kids-policy-aaaa1111", message_index: 1, run_file: "mandate/eval/runs/loop/loo/kids_policy.md", case: "kids_policy", reviewer: "Dr Expert" });
    expect(item.excerpt).toContain("Classify under the AI Act");
    expect(conversation.messages[1].reviews).toEqual([{ item_id: item.id, reviewer: "Dr Expert", rating: "off", note: "Lead with the GDPR age gate.", at: item.created_at }]);
    // the queue Distil reads has it, open
    const queue = (await body(await fbGET(req("/api/bench/feedback")))).items;
    expect(queue.find((i: FeedbackItem) => i.id === item.id)?.status).toBe("open");
  });

  it("may be a note without a rating; several reviewers stack on one reply; nothing is overwritten", async () => {
    const r = await fbPOST(req("/api/bench/feedback", { method: "POST", json: {
      kind: "reply", conversationId: "run-loop-loo-kids-policy-aaaa1111", messageIndex: 1, note: "Good structure, wrong order.", reviewer: "" } }));
    expect(r.status).toBe(201);
    const { item } = await body(r);
    expect(item.rating).toBeNull();
    expect(item.reviewer).toBe("Owner"); // an empty name is the owner
    const c = getConversation("run-loop-loo-kids-policy-aaaa1111")!;
    expect(c.messages[1].reviews!.map((x) => x.reviewer)).toEqual(["Dr Expert", "Owner"]);
    expect(c.messages[1].feedback).toBeUndefined();
  });

  it("refuses an empty comment, a comment on the founder's message, and keeps a plain chat's one quick rating", async () => {
    expect((await fbPOST(req("/api/bench/feedback", { method: "POST", json: { kind: "reply", conversationId: "run-loop-loo-kids-policy-aaaa1111", messageIndex: 1, note: "" } }))).status).toBe(400);
    expect((await fbPOST(req("/api/bench/feedback", { method: "POST", json: { kind: "reply", conversationId: "run-loop-loo-kids-policy-aaaa1111", messageIndex: 0, rating: "good" } }))).status).toBe(400);
    const plain = await fbPOST(req("/api/bench/feedback", { method: "POST", json: { kind: "reply", conversationId: "c-plain-chat-0001", messageIndex: 1, rating: "good" } }));
    expect(plain.status).toBe(201);
    const p = await body(plain);
    expect(p.item.reviewer).toBeUndefined();
    expect(p.conversation.messages[1].feedback).toEqual({ rating: "good", item_id: p.item.id });
    expect(p.conversation.messages[1].reviews).toBeUndefined();
    expect((await fbPOST(req("/api/bench/feedback", { method: "POST", json: { kind: "reply", conversationId: "c-plain-chat-0001", messageIndex: 1, note: "no rating" } }))).status).toBe(400);
  });

  it("an overall 1-5 grade is kept per reviewer, oldest first", async () => {
    for (const [grade, reviewer] of [[2, "Dr Expert"], [4, "Owner"]] as const) {
      const r = await fbPOST(req("/api/bench/feedback", { method: "POST", json: { kind: "conversation", conversationId: "run-loop-loo-kids-policy-aaaa1111", grade, note: "", reviewer } }));
      expect(r.status).toBe(201);
    }
    const c = getConversation("run-loop-loo-kids-policy-aaaa1111")!;
    expect(c.review_grades!.map((g) => [g.reviewer, g.grade])).toEqual([["Dr Expert", 2], ["Owner", 4]]);
    expect(c.grade?.grade).toBe(4);
    const lines = readFileSync(path.join(tmp, "data", "feedback.jsonl"), "utf8").trim().split("\n");
    expect(lines.length).toBe(5); // append-only: every comment and grade is its own line
  });

  it("reaches Distil with the reviewer, the run, the case and the reply", () => {
    const item = { id: "f-x-1", kind: "reply", brain: "regina", rating: "off", grade: null, theme: "method", note: "Lead with the age gate.", mandate_id: null,
      conversation_id: "run-loop-loo-kids-policy-aaaa1111", message_index: 1, run_file: "mandate/eval/runs/loop/loo/kids_policy.md", excerpt: "x",
      playbooks: { sha: "abc", dirty: false, files: [] }, created_at: "t", status: "open", reviewer: "Dr Expert", case: "kids_policy" } as FeedbackItem;
    const msg = distilMessage("regina", [item], {});
    expect(msg).toContain("run mandate/eval/runs/loop/loo/kids_policy.md (eval case kids_policy), reply 1");
    expect(msg).toContain('The reviewer (Dr Expert): "Lead with the age gate."');
    expect(distilMessage("regina", [{ ...item, reviewer: "Owner" }], {})).toContain('The owner: "Lead with the age gate."');
  });
});

describe("the runs and the review sets", () => {
  it("lists only eval runs, with grades and comment counts, grouped by case and brain, latest first", async () => {
    const { runs } = await body(await runsGET(req("/api/bench/eval-runs")));
    expect(runs.map((r: { id: string }) => r.id).sort()).toEqual(["run-loop-iter1-kids-policy-bbbb2222", "run-loop-loo-kids-policy-aaaa1111"]);
    const loo = runs.find((r: { tag: string }) => r.tag === "loo");
    expect(loo).toMatchObject({ judge_grade: 3, comments: 2, replies: 1, review_grade: { grade: 4, reviewer: "Owner" } });
    expect(loo.reviewers.sort()).toEqual(["Dr Expert", "Owner"]);
    const g = groupEvalRuns(runs);
    expect(g).toHaveLength(1);
    expect(g[0].runs.map((r) => r.tag)).toEqual(["iter1", "loo"]);
  });

  it("a review set keeps its runs in order and opens by id; a set of non-runs is refused", async () => {
    const made = await setPOST(req("/api/bench/review-sets", { method: "POST", json: { title: "Regina for the expert", conversation_ids: ["run-loop-loo-kids-policy-aaaa1111", "run-loop-iter1-kids-policy-bbbb2222"] } }));
    expect(made.status).toBe(201);
    const { set, url } = await body(made);
    expect(url).toBe(`/bench/review/${set.id}`);
    const got = await body(await setGET(req(`/api/bench/review-sets?id=${set.id}`)));
    expect(got.runs.map((r: { tag: string }) => r.tag)).toEqual(["loo", "iter1"]);
    expect((await setPOST(req("/api/bench/review-sets", { method: "POST", json: { title: "x", conversation_ids: ["c-plain-chat-0001"] } }))).status).toBe(404);
    expect((await setGET(req("/api/bench/review-sets?id=set-nope-000000"))).status).toBe(404);
  });

  it("validates names and sets", () => {
    expect(reviewerName("  Maria  Rossi ")).toBe("Maria Rossi");
    expect(reviewerName("<script>")).toBe("Owner");
    expect(reviewerName(undefined)).toBe("Owner");
    expect(validateReviewSet({ title: "", conversation_ids: ["run-a-000000"] }).ok).toBe(false);
    expect(validateReviewSet({ title: "t", conversation_ids: [] }).ok).toBe(false);
    const ok = validateReviewSet({ title: "t", conversation_ids: ["run-a-000000", "run-a-000000"] });
    expect(ok.ok && ok.value.conversation_ids).toEqual(["run-a-000000"]);
  });

  it("recordReview never touches another message, and a plain conversation is not a run", () => {
    const c = run("run-x-000000");
    recordReview(c, { id: "f-1", kind: "reply", message_index: 1, rating: "good", note: "", reviewer: "Owner", created_at: "t" } as FeedbackItem);
    expect(c.messages[0].reviews).toBeUndefined();
    expect(c.messages[1].reviews).toHaveLength(1);
    expect(evalRunSummary({ ...c, eval_run: undefined })).toBeNull();
  });
});
