import { describe, expect, it } from "vitest";
import {
  sanitizeEligibility, sanitizeFreeText, sanitizeInstrumentIds,
  sanitizeProjectAnswers, MAX_DESCRIPTION_CHARS,
} from "./sanitize";
import { loadDbInstruments } from "./corpus";
import { COMMERCIAL_ANSWER_PREFIX } from "./types";
import { VOCABULARY } from "./vocabulary";

/** The real corpus, because the property under test IS corpus membership. A
 *  hand-written stub would let the sanitiser and the funds diverge, which is
 *  the class of defect this whole file exists for. */
const corpus = new Set(loadDbInstruments().map((i) => i.id));
const inCorpus = (id: string) => corpus.has(id);

/**
 * The sanitiser is the only thing between a real request and the pipeline, and
 * it DROPS silently — an unrecognised value simply disappears with no error.
 * That is what made the worst bug of this project invisible for a day.
 */
describe("every offered answer survives the sanitiser", () => {
  // THE BUG: sanitize.ts kept a hand-copy of the sector list. When the
  // vocabulary was split, the copy went stale, so every live request through
  // /api/intelligence had its sector silently discarded — while memo_bench,
  // which calls the pipeline directly and bypasses the route, reported nothing
  // wrong. `activities` was never added at all.
  const fields = Object.entries(VOCABULARY).filter(([, v]) => v.values.length > 0);

  it.each(fields)("%s", (field, vocab) => {
    for (const value of vocab.values) {
      const input = vocab.multi ? { [field]: [value] } : { [field]: value };
      const out = (sanitizeEligibility(input) ?? {}) as Record<string, unknown>;
      const kept = vocab.multi
        ? Array.isArray(out[field]) && (out[field] as string[]).includes(value)
        : out[field] === value;
      expect(kept, `"${value}" is offered for ${field} but the sanitiser drops it`).toBe(true);
    }
  });
});

describe("rejecting what is not offered", () => {
  it("drops a value outside the vocabulary rather than passing it through", () => {
    const out = (sanitizeEligibility({ sector: "not_a_real_sector" }) ?? {}) as Record<string, unknown>;
    expect(out.sector).toBeUndefined();
  });

  it("drops a retired vocabulary value", () => {
    // The pre-split sector names must not quietly still work: a stale client
    // should fail visibly, not be silently accepted into a different meaning.
    for (const retired of ["software_digital", "hardware_robotics", "health_lifesciences"]) {
      const out = (sanitizeEligibility({ sector: retired }) ?? {}) as Record<string, unknown>;
      expect(out.sector).toBeUndefined();
    }
  });

  it("ignores a non-array for a list field", () => {
    const out = (sanitizeEligibility({ activities: "tobacco" }) ?? {}) as Record<string, unknown>;
    expect(out.activities).toBeUndefined();
  });

  // ── region ────────────────────────────────────────────────────────────────
  // THE BUG: `region` was in EligibilityAnswers, in FIELD_ENUM_HINTS and in the
  // adaptive round's evidence path, and absent from this whitelist. The panel
  // merged the founder's answer and all three routes dropped it, so 193
  // `region_within` rules on 163 instruments evaluated as unanswered for every
  // real request while passing every test — because the bench calls
  // computeVerdict directly and never comes through here.
  it("keeps a real NUTS region id", () => {
    const out = (sanitizeEligibility({ region: "FRD" }) ?? {}) as Record<string, unknown>;
    expect(out.region).toBe("FRD");
  });

  it("keeps a NUTS-2 id, which is what most regional schemes are written at", () => {
    const out = (sanitizeEligibility({ region: "ES51" }) ?? {}) as Record<string, unknown>;
    expect(out.region).toBe("ES51");
  });

  // Validated against the generated NUTS reference rather than a shape regex:
  // "FR99" has the right shape and matches no region, so a `region_within`
  // rule could never be evaluated on it.
  it("drops an id the corpus does not know", () => {
    const out = (sanitizeEligibility({ region: "FR99" }) ?? {}) as Record<string, unknown>;
    expect(out.region).toBeUndefined();
  });

  it("drops a region NAME, which is not what the rules match on", () => {
    const out = (sanitizeEligibility({ region: "Normandie" }) ?? {}) as Record<string, unknown>;
    expect(out.region).toBeUndefined();
  });
});

describe("free text bounds", () => {
  // THE BUG: the description reaches eight prompt sites and is the only
  // unbounded unauthenticated input. /verdict capped it at 400 chars; the two
  // PAID routes capped it at nothing, so one request could inflate every
  // prompt in a six-call run.
  it("truncates past the cap", () => {
    const out = sanitizeFreeText("x".repeat(MAX_DESCRIPTION_CHARS + 5_000));
    expect(out).toBeDefined();
    expect(out!.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
  });

  it("leaves ordinary input untouched", () => {
    const text = "Farm management software and soil carbon programmes for arable growers";
    expect(sanitizeFreeText(text)).toBe(text);
  });

  it("returns undefined for empty or non-string input", () => {
    expect(sanitizeFreeText("   ")).toBeUndefined();
    expect(sanitizeFreeText(undefined)).toBeUndefined();
    expect(sanitizeFreeText(42)).toBeUndefined();
  });
});

// ── A ROUND-TWO ANSWER CITES A FUND, OR IT CITES NOTHING (wsFT) ────────────
//
// `sanitizeProjectAnswers` used to require a real instrument id on every
// entry, and the follow-up screen's commercial half is grounded in no fund by
// construction, so every commercial answer a founder typed was deleted at the
// door of /api/intelligence. `founderPath.test.ts` proves the answers now
// arrive over the real route. What is tested HERE is the safety clause that
// made keeping them admissible: the marker is a string a client can type, so
// an entry that declares itself ungrounded must be STRIPPED of everything that
// could attribute it to a fund rather than merely trusted.
//
// The property, not a list of today's four topics: for any entry whose
// `questionId` carries the ungrounded marker, nothing survives that any
// downstream reader uses to attribute an answer to an instrument. Downstream
// keys on the instrument id (pipeline's citation block, `scoreEase`'s
// `instrumentId::gateKey`) or on the quote (agentSelect's "asked because"
// line), so those are exactly the fields asserted empty.
describe("a round-two answer cites a fund or cites nothing", () => {
  const forged = {
    questionId: `${COMMERCIAL_ANSWER_PREFIX}who_pays`,
    question: "Who actually pays for this?",
    answer: "Public hospital procurement teams.",
    // Everything a crafted request would attach to borrow a real fund's
    // authority. Every one is a genuine corpus-shaped value.
    instrumentId: "eic_accelerator",
    instrumentName: "EIC Accelerator",
    gateKey: "establishment",
    quote: "The applicant must be established in a Member State.",
    openKey: "must_be_established_in_a_member_state",
  };

  it("keeps the answer", () => {
    const out = sanitizeProjectAnswers([forged], inCorpus);
    expect(out).toHaveLength(1);
    expect(out![0].answer).toBe(forged.answer);
    expect(out![0].questionId).toBe(forged.questionId);
  });

  it("strips every field that could attribute it to a fund", () => {
    const [got] = sanitizeProjectAnswers([forged], inCorpus)!;
    // Named by property: an ungrounded answer may carry no instrument and no
    // requirement text, whatever the request claimed.
    expect(got.instrumentId).toBe("");
    expect(got.instrumentName).toBe("");
    expect(got.quote).toBe("");
    // `openKey` is the wsCD judge's handle on a verbatim requirement. An
    // ungrounded answer has no requirement to be judged against.
    expect(got.openKey).toBeUndefined();
  });

  it("still refuses a grounded answer with no real instrument id", () => {
    const ungroundedButUnmarked = { ...forged, questionId: "who_pays", instrumentId: "" };
    expect(sanitizeProjectAnswers([ungroundedButUnmarked], inCorpus)).toBeUndefined();
  });

  it("leaves a genuinely grounded answer whole", () => {
    const grounded = { ...forged, questionId: "eic_accelerator::establishment" };
    const [got] = sanitizeProjectAnswers([grounded], inCorpus)!;
    expect(got.instrumentId).toBe("eic_accelerator");
    expect(got.quote).toBe(grounded.quote);
  });

  // The same length rule that ate the shortlist ate the ANSWER, one field over
  // (wsFV). `pickString(b.instrumentId, 60)` plus `/^[a-z0-9_]{1,60}$/` deleted
  // a prose answer whole — the answer, its fund, its gate and its quote —
  // whenever the fund it cited was one of the 394 corpus rows whose id is
  // longer than that. Stated against the corpus's own longest id rather than
  // against a number, so it keeps meaning when the longest id changes.
  it("keeps an answer citing the longest-id fund the corpus holds", () => {
    const longest = [...corpus].reduce((a, b) => (b.length > a.length ? b : a));
    const grounded = {
      ...forged, questionId: `${longest}::establishment`, instrumentId: longest,
    };
    const [got] = sanitizeProjectAnswers([grounded], inCorpus)!;
    expect(got.instrumentId,
      `a prose answer citing ${longest} (${longest.length} chars) was deleted at ` +
      `the memo route`).toBe(longest);
    expect(got.answer).toBe(grounded.answer);
  });
});

// ── THE SHORTLIST ONE ROUTE HANDS THE NEXT (wsFV) ──────────────────────────
//
//   THE PROPERTY
//   An id the corpus can produce is an id this sanitiser keeps, and an id the
//   corpus cannot produce is one it drops.
//
// Stated that way rather than as a shape, because a shape is a claim about
// today's ids: this rule was `/^[a-z0-9_]{1,60}$/` while 394 of the corpus's
// 1,088 ids were longer than 60 characters, so the intake route silently
// deleted 30.5% of every founder's shortlist and left the follow-up questions
// grounded in funds the founder was not looking at. Raising the number would
// have bought a delay, not a fix. The corpus is walked below, so an id format
// introduced next month is covered the day the exporter writes one.
describe("the shortlist survives its own sanitiser", () => {
  it("keeps every id the corpus itself holds, whatever shape it has", () => {
    const ids = [...corpus];
    const kept = new Set(sanitizeInstrumentIds(ids, inCorpus) ?? []);
    const lost = ids.filter((id) => !kept.has(id));
    expect(lost.slice(0, 8),
      `${lost.length} of the corpus's own ${ids.length} instrument ids are ` +
      `deleted by the sanitiser that guards the shortlist handoff. The longest ` +
      `id in the corpus is ${ids.reduce((a, b) => (b.length > a.length ? b : a)).length} ` +
      `characters; a rule that admits a fund's id is a rule that asks whether ` +
      `the fund exists, not what its id looks like.`).toEqual([]);
  });

  it("drops an id no fund holds, however well-shaped", () => {
    // Correct shape under the retired rule, and not a fund. The sanitiser is
    // STRICTER than the regex it replaced, not looser.
    expect(sanitizeInstrumentIds(["not_a_real_fund"], inCorpus)).toBeUndefined();
    expect(sanitizeInstrumentIds(["eic_accelerator", "not_a_real_fund"], inCorpus))
      .toEqual(["eic_accelerator"]);
  });

  it("bounds its own output without a cap, by refusing to repeat a fund", () => {
    // The `.slice(0, 40)` was the old bound and it cost the founder half their
    // shortlist. The bound is now structural: every survivor is a DISTINCT
    // corpus member, so the result can never be longer than the corpus however
    // many ids a client posts, and nothing has to be revised when it grows.
    const flood = Array.from({ length: 5_000 }, () => "eic_accelerator");
    expect(sanitizeInstrumentIds(flood, inCorpus)).toEqual(["eic_accelerator"]);
    const all = [...corpus, ...corpus];
    expect((sanitizeInstrumentIds(all, inCorpus) ?? []).length).toBe(corpus.size);
  });

  it("preserves the verdict route's order, which is best-first", () => {
    // Everything downstream reads a PREFIX of this list — `candidateBlock`
    // takes eight, `stakesByFund` takes eight — so a sanitiser that reordered
    // it would quietly change which funds the question writer is shown.
    const ids = [...corpus].slice(0, 25).reverse();
    expect(sanitizeInstrumentIds(ids, inCorpus)).toEqual(ids);
  });
});
