/**
 * The Anthropic client, offline.
 *
 * ── Why a stand-in and not a real call ─────────────────────────────────────
 * `founderPath.test.ts` runs on every build, in CI, on a machine with no
 * credentials. A guard that costs money per run is a guard somebody disables,
 * and a guard that needs a key is a guard that silently skips — which is how
 * `check_recall_floor` printed SKIPPED and exited 0 while `npm run check` went
 * green.
 *
 * ── What it is honest about ────────────────────────────────────────────────
 * This stands in for the model's WORDS and for nothing else. Every line of
 * route code, every sanitiser, every merge, every contract check and the whole
 * ranking run for real. The one leg it replaces is the one leg whose output is
 * prose, and the property under test — that an answer survives the boundary and
 * reaches the ranker — does not turn on prose.
 *
 * ── Why it reads the prompt instead of hard-coding a reply ─────────────────
 * The planner's reply must name fields that are actually open for THIS founder;
 * a canned list would either name fields the route never offered (and be
 * dropped by `planAdaptiveScreen`'s own `fieldNames.includes(q.ref)` check,
 * producing an empty screen and a vacuously green test) or freeze the
 * vocabulary the way `sanitize.ts`'s hand-copied sector list froze it. So the
 * reply is derived from the Pool A block the ROUTE assembled, which is the same
 * discipline the rest of this repo applies to every other list.
 *
 * The words it writes are deliberately useless. It returns no option labels at
 * all, which drives `planAdaptiveScreen` down its own documented fallback —
 * `coversAll` false, so the founder is shown `FIELD_ENUM_HINTS`'s curated stem
 * and options. That is a path a real founder takes whenever the model's labels
 * do not cover the field's values, and it is the path whose answer space is
 * fixed by our code rather than by a model, which is exactly what a boundary
 * test wants underneath it.
 *
 * The writer and the comparable-company researcher are NOT answered. They
 * throw, `runIntelligence` degrades to no comparables and then fails at the
 * writer, and the ranked set has already been emitted by then. See
 * `driveFounderPath`'s `stopAt`.
 */

type CreateParams = {
  output_config?: { format?: { schema?: { properties?: Record<string, unknown> } } };
  messages?: { role: string; content: string }[];
};

/**
 * Whether the planner comes back with a usable screen.
 *
 * `"silent"` is not a contrivance. `planAdaptiveScreen` returns null on a
 * timeout, an unparseable reply, an empty reply or a thrown call, and
 * `fetchRound` takes the same branch when the request itself fails — the
 * panel's own comment reads "a null/empty round (nothing left worth asking, or
 * any failure) just runs the memo straight away". That branch calls `runMemo`
 * IN THE SAME TICK as `setProfileSignal`, which is the one place the panel's
 * state hazard is still live, so a harness that can only produce the happy
 * screen cannot see it.
 */
export let PLANNER: "answers" | "silent" = "answers";
export function setPlanner(mode: "answers" | "silent"): void { PLANNER = mode; }

/**
 * The refs the route put in one pool, read back out of the prompt IT built.
 *
 * All four pools are answered, not just the fixed-option one. A stand-in that
 * only fills Pool A produces a much thinner screen than production's — and,
 * worse, an EMPTY one whenever a founder has no open enum fields left, which
 * silently routes every such run down the panel's empty-round branch. The
 * harness would then be grading a failure path while believing it was grading
 * the happy one.
 *
 * ── AND THEY ARE INTERLEAVED, NOT CONCATENATED (wsFV) ──────────────────────
 * The four pools used to be emitted one whole pool at a time, A then B then D
 * then C. `planAdaptiveScreen` enforces `SCREEN_QUESTION_CAP` in the order the
 * reply arrives, so that made "which pool reaches the founder" a property of
 * this stand-in's writing order rather than of the code under test: with Pool A
 * full, the cap was spent before Pool C was read and no probe could ever answer
 * a commercial question. It was masked, because a truncated shortlist
 * under-filled Pool A on four of the twelve archetypes; restoring the founder's
 * real shortlist filled it on all twelve and the coverage went to zero.
 *
 * Concatenating was also the stand-in DISOBEYING the prompt it was given, which
 * is the one thing a stand-in may not do. That prompt says "include at least one
 * and at most two from Pool C when a description exists" and "when Pool D is not
 * empty you MUST include at least one" — instructions a real reply spreads
 * across pools to satisfy. Round-robin is the smallest reply shape that obeys
 * them, so the cap now truncates a spread reply, which is what production's cap
 * actually meets.
 */
function poolRefs(prompt: string, pool: "A" | "B" | "C" | "D"): string[] {
  const start = prompt.indexOf(`## Pool ${pool}`);
  if (start < 0) return [];
  const rest = prompt.slice(start);
  const next = rest.slice(1).search(/\n## (Pool |How to choose)/);
  const block = next >= 0 ? rest.slice(0, next + 1) : rest;
  return [...block.matchAll(/ref "([^"]+)"/g)].map((m) => m[1]);
}

/** Two substantive options, which is the floor `planAdaptiveScreen` enforces
 *  for a written question, and neither of them matches its VAGUE_OPTION test. */
const WRITTEN_OPTIONS = [
  { value: "", label: "That is exactly what we do" },
  { value: "", label: "We do something close to it, with one difference" },
];

function reply(body: unknown) {
  return {
    model: "offline",
    usage: { input_tokens: 0, output_tokens: 0 },
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(body) }],
  };
}

export class OfflineAnthropic {
  messages = {
    create: async (params: CreateParams) => {
      const props = params.output_config?.format?.schema?.properties ?? {};
      const prompt = params.messages?.map((m) => m.content).join("\n") ?? "";
      if ("techDepthRead" in props) {
        return reply({
          techDepthRead: "Deep-tech breakthrough",
          note: "The description leads with the hardware they build themselves.",
        });
      }
      if ("questions" in props) {
        const written = (source: string, pool: "B" | "C" | "D") =>
          poolRefs(prompt, pool).map((ref) => ({
            source, ref,
            question: `Does this describe your company? (${ref})`,
            stake: "Decides whether this route stays open to you",
            // An open question has no options by construction, and
            // `planAdaptiveScreen` deliberately applies no option floor to it.
            options: pool === "D" ? [] : WRITTEN_OPTIONS,
          }));
        const pools = [
          poolRefs(prompt, "A").map((ref) => ({
            source: "field", ref, question: "", stake: "", options: [] as { value: string; label: string }[],
          })),
          written("gate", "B"),
          written("open", "D"),
          written("commercial", "C"),
        ];
        // Round-robin, so no pool can be starved by the cap purely for being
        // written last. See the note above `poolRefs`.
        const spread: unknown[] = [];
        for (let i = 0; i < Math.max(...pools.map((p) => p.length), 0); i++) {
          for (const p of pools) if (p[i]) spread.push(p[i]);
        }
        return reply({
          theme: "A few more things",
          questions: PLANNER === "silent" ? [] : spread,
        });
      }
      throw new Error(
        "__offlineModel: this call has no stand-in and must not reach the API. " +
        "Only the adaptive-round planner and the profile-signal read are answered " +
        "offline; the researcher and the writer are deliberately not.");
    },
    stream: () => {
      throw new Error(
        "__offlineModel: the writer is never called. The ranked set is emitted " +
        "before it (pipeline.ts, the `partial` event), which is what makes this " +
        "harness free.");
    },
  };
}

export default OfflineAnthropic;
