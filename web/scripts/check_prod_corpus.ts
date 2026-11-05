/**
 * WHICH CORPUS IS THE DEPLOYMENT RANKING ON, RIGHT NOW, FOR FREE.
 *
 * ── Why this is separate from prodcheck ────────────────────────────────────
 * `prodcheck` is the right instrument for "is the brief any good": it drives
 * one founder's whole path and costs about EUR 0.25 of the deployment's quota,
 * so it is something a person runs deliberately, a few times a day at most.
 * Its own header is emphatic that it is a look and not a number, and that is
 * the correct framing for a JUDGEMENT about one founder's rows.
 *
 * "Which store did the deployment rank on" is not that kind of question. It is
 * a binary property of the deployment, observed exactly rather than sampled,
 * and one observation of the wrong answer is proof rather than evidence. It
 * also needs no model call at all: `/api/intelligence/verdict` is the
 * code-only route and it has served `corpus: corpusProvenance()` since wsHW.
 *
 * So the invariant gets its own instrument, and the instrument is free. This
 * can run every minute in a loop; prodcheck cannot.
 *
 * ── Why it fans out, and why that is not cheating ──────────────────────────
 * A serverless deployment is not one process. Provenance is decided ONCE per
 * instance, at its first request, and every later request to that instance
 * reports the decision the instance already made. So sequential polling asks
 * the same warm instance the same question over and over and learns nothing
 * about the others. Concurrency is what reaches distinct instances, and
 * `hydratedAt` is what identifies them: it is the instant that instance
 * hydrated, so two responses sharing one are one process answering twice.
 *
 * The tension is real and worth stating rather than hiding: a fan-out large
 * enough to reach many instances is itself a burst of cold starts, and a burst
 * of cold starts is exactly the condition under which the phase-one read used
 * to be cancelled. A prober that manufactures the failure it reports is not an
 * instrument. Two things keep this one honest — the default fan-out is small
 * enough to sit inside ordinary traffic, and since a degraded instance now
 * retries Postgres (lib/intelligence/corpus.ts), an instance this probe did
 * unsettle repairs itself within the cooldown instead of staying broken.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *     every instance serving founders ranks on the live register
 *
 * Stated as what must be TRUE, so an unforeseen way to be wrong — a store name
 * nobody has invented yet, a deployment that lost DATABASE_URL entirely, a
 * response that carries no provenance at all — fails it without anyone having
 * to have listed that way in advance.
 *
 * Run:
 *   npx tsx scripts/check_prod_corpus.ts        # the published deployment
 *   PROBE_FANOUT=12 npx tsx scripts/check_prod_corpus.ts
 *   PRODCHECK_URL=http://localhost:3000 npx tsx scripts/check_prod_corpus.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/** Same source as prodcheck: where a reader without credentials reaches this
 *  product is already written down once, and typing a host here would be a
 *  second copy of it that nothing keeps honest. */
const REPO_ROOT = path.join(process.cwd(), "..", "capital");
const FEED = (JSON.parse(readFileSync(
  path.join(REPO_ROOT, "data", "guard_registry.json"), "utf8")) as
  { feed: { url: string } }).feed.url;
const BASE = (process.env.PRODCHECK_URL || process.env.GUARD_FEED_URL
  || new URL(FEED).origin).replace(/\/$/, "");

/** Small on purpose. See the fan-out note above. */
const FANOUT = Number(process.env.PROBE_FANOUT ?? 6);

/** The store a deployment is supposed to rank on. The one value stated
 *  positively, rather than a list of the ways it could be wrong. */
const LIVE_REGISTER = "postgres";

interface Provenance {
  source?: string; degraded?: boolean; instruments?: number;
  hydratedAt?: string; observedAt?: string; error?: string;
}

/** One request, and nothing about it that a model would be asked to price.
 *  The body is the minimum the verdict route accepts; the answer we want is in
 *  the envelope, not in the verdict. */
async function probe(n: number): Promise<{ ok: true; corpus: Provenance | undefined; ms: number }
  | { ok: false; why: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/intelligence/verdict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company: `corpus probe ${n}`, country: "FI" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    const body = await res.json() as { corpus?: Provenance };
    return { ok: true, corpus: body.corpus, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const results = await Promise.all(
    Array.from({ length: FANOUT }, (_, i) => probe(i)));

  const unreachable = results.filter((r) => !r.ok);
  const answered = results.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);

  console.log(`check_prod_corpus: ${BASE}`);
  console.log(`  ${FANOUT} requests to /api/intelligence/verdict, no model call, ` +
    `${answered.length} answered`);

  // ── THE ONE THING THAT IS NOT A FAILURE: NO SUBJECT ─────────────────────
  // If not one request reached the deployment, this instrument had nothing to
  // observe. That is the same judgement `check_degradation` makes when it has
  // no live register to referee with: a run that could not happen must say so
  // rather than publish a verdict it did not earn. A laptop on a train and a
  // total outage look identical from here, and a total outage is not this
  // check's subject — the deployment being down is louder elsewhere and does
  // not need this file to invent a claim about the corpus.
  //
  // Note carefully what this does NOT cover: a deployment that ANSWERS and
  // carries no provenance is not unreachable, it is unaskable, and that fails
  // below. "Unobservable is not passing" holds wherever there was a subject.
  if (!answered.length) {
    console.error(`\ncheck_prod_corpus: could not run — no request reached ` +
      `${BASE}, so there is nothing to observe.\n` +
      unreachable.map((r) => `  - ${(r as { why: string }).why}`).join("\n") +
      `\n  This is NOT a pass. It is the absence of an observation.`);
    process.exit(2);
  }

  // One hydration event is one instance. Grouping by it is what turns N
  // requests into an observation about the fleet rather than about whichever
  // instance the load balancer favoured.
  const byInstance = new Map<string, { corpus: Provenance; requests: number }>();
  for (const r of answered) {
    const key = r.corpus?.hydratedAt ?? "(no provenance served)";
    const seen = byInstance.get(key);
    if (seen) seen.requests++;
    else byInstance.set(key, { corpus: r.corpus ?? {}, requests: 1 });
  }

  const wrong: string[] = [];
  console.log(`  ${byInstance.size} distinct instance(s), by the instant each hydrated\n`);
  for (const [hydratedAt, { corpus, requests }] of [...byInstance].sort()) {
    const live = corpus.source === LIVE_REGISTER && corpus.degraded !== true;
    console.log(`  ${hydratedAt}  ${String(corpus.source ?? "UNOBSERVABLE").padEnd(9)}` +
      `  ${String(corpus.instruments ?? "?").padStart(5)} instruments` +
      `  ${String(requests).padStart(2)} of ${answered.length} requests` +
      `  ${live ? "ok" : "██ NOT THE LIVE REGISTER"}`);
    if (corpus.error) console.log(`      Postgres said: ${corpus.error}`);
    if (corpus.observedAt && corpus.source !== LIVE_REGISTER) {
      console.log(`      the copy it is serving was cut at ${corpus.observedAt}`);
    }
    if (!live) {
      wrong.push(`${hydratedAt}: source=${corpus.source ?? "unobservable"}` +
        `${corpus.error ? ` (${corpus.error})` : ""}, serving ${requests} of ` +
        `${answered.length} sampled requests`);
    }
  }
  for (const r of unreachable) console.log(`  (a request never answered: ${(r as { why: string }).why})`);

  if (wrong.length) {
    console.error(`\ncheck_prod_corpus: FAILED — ${wrong.length} of ${byInstance.size} ` +
      `instance(s) are not ranking on the live register.\n`);
    for (const w of wrong) console.error(`  - ${w}`);
    console.error(`\n  Every gate correction this project publishes lives in Postgres.` +
      `\n  A founder routed to one of these instances is ranked on a copy, and` +
      `\n  nothing they read carries any correction made since that copy was cut.` +
      `\n  Instances repair themselves once the register answers again` +
      `\n  (lib/intelligence/corpus.ts, HYDRATION_RETRY_AFTER_MS), so a red here` +
      `\n  that persists across runs is the register refusing, not a lost race.`);
    process.exit(1);
  }
  console.log(`\ncheck_prod_corpus: ok — all ${byInstance.size} instance(s) observed are ` +
    `ranking on the live register.`);
}

main().catch((e) => {
  console.error("check_prod_corpus: FAILED to run —", e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
