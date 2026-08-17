// THE RATE DETECTOR, alone, so two guards read one definition of "a rate".
//
// It lived inside `check_prompt_rates.ts`, which runs its whole judgement at
// module top level and exits the process on a red. `check_money_basis.ts`
// needs the same detector for `lib/intelligence/money.ts` -- the other file
// assembled verbatim into a model prompt from a byte-identical literal -- and
// importing that guard to get it would have run it, and could have exited from
// inside another check.
//
// Copying the two regexes instead is the failure this repo names most often: a
// second implementation that agrees on the day it is written. So the detector
// moved down here and both guards import it. The reasoning for WHY a rate may
// not be typed into a prompt, and the self-test that proves the detector on the
// exact sentences that were live, both stay in `check_prompt_rates.ts` with the
// tree they judge.
//
// Hermetic: no imports, no fs, no corpus.

/**
 * A QUANTITY: a numeral, or a number written as a word, or a proportion word.
 *
 * Words are here because the sentence that was live said "about a quarter" and
 * a detector that only reads digits would have missed exactly the case this
 * file exists for.
 */
const QUANTITY = new RegExp([
  String.raw`\b\d+(?:\.\d+)?\s*%`,
  String.raw`\b(?:a|one)\s+(?:quarter|third|half|fifth|tenth)\b`,
  String.raw`\b(?:two|three|four|nine)[- ](?:quarters|thirds|fifths|tenths)\b`,
  String.raw`\bhalf\b`,
  String.raw`\b\d+(?:\.\d+)?\s+(?:in|out of)\s+\d+`,
].join("|"), "i");

/**
 * What turns a quantity into a RATE: the sentence says the quantity is a
 * frequency rather than a count.
 *
 * `%` is on its own a rate marker — a percentage is a proportion by
 * construction and there is no reading of "97%" that is a count of anything.
 * The rest are the constructions English uses to say "how often", and they are
 * matched at the SENTENCE level so "about a quarter" is a rate in "a quarter of
 * the time" and not in "a quarter of the budget".
 */
const RATE_MARKER = new RegExp([
  String.raw`\d\s*%`,
  String.raw`of the (?:time|cases|requests|founders|companies)\b`,
  String.raw`\bon average\b`,
  String.raw`\bas often\b`,
  String.raw`\bhow often\b`,
].join("|"), "i");

export interface Hit { file: string; line: number; sentence: string }

/** Sentences, with the line each starts on. Markdown, so a bullet or a heading
 *  boundary ends a sentence as surely as a full stop does. */
export function sentences(text: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const lines = text.split("\n");
  let buf = "", start = 1;
  const flush = () => { if (buf.trim()) out.push({ line: start, text: buf.trim() }); buf = ""; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || /^[#\-*|>]/.test(l.trim()) || /^\s*-\s/.test(l)) flush();
    if (!buf) start = i + 1;
    buf += ` ${l}`;
    for (const piece of l.split(/(?<=[.!?])\s+/).slice(0, -1)) { void piece; }
    if (/[.!?]\s*$/.test(l.trim())) flush();
  }
  flush();
  // Split the accumulated blocks on sentence ends, keeping the block's line.
  return out.flatMap(({ line, text }) =>
    text.split(/(?<=[.!?])\s+/).map((t) => ({ line, text: t.trim() })).filter((s) => s.text));
}

export function ratesIn(file: string, text: string): Hit[] {
  const out: Hit[] = [];
  for (const s of sentences(text)) {
    if (!QUANTITY.test(s.text)) continue;
    if (!RATE_MARKER.test(s.text)) continue;
    out.push({ file, line: s.line, sentence: s.text });
  }
  return out;
}
