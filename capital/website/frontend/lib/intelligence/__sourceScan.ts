/**
 * READING A SOURCE FILE THE WAY A COMPILER WOULD, FOR THE GUARDS THAT DO IT.
 *
 * Several checks in this repo answer a question about the tree by reading its
 * own source: "does this harness write an intake literal", "does this route
 * read a field the panel cannot send". Every one of them has the same first
 * problem — a name inside a comment or a string is not a name the program uses
 * — and the same failure when it is skipped.
 *
 * That failure is not hypothetical. `routeReads` in `__founderPath.ts` matched
 * `/\bbody\.([A-Za-z0-9_]+)/g` over the raw file. When wsIK deleted
 * `body.sector`, `body.companyType` and `body.targetMarkets` from
 * `app/api/intelligence/route.ts` and left a comment saying which three reads
 * had gone, the guard went on reporting all three as live reads — it was
 * grading the comment. A guard that reads a comment as code is a guard that
 * cannot be cleared by fixing the code, and one that cannot be cleared is one
 * that gets muted.
 *
 * `check_harness_intake.ts` had already solved it, privately, with a stripper
 * it exported for its own tests. There is now ONE copy and both read it.
 *
 * Deliberately crude: it OVER-strips rather than under-strips (a regex literal
 * containing a quote loses more than it should), because the direction of that
 * error is the safe one for a guard that must not cry wolf. It is a leaf — no
 * `fs`, no `pg`, no imports at all — so `check_client_boundary` is unaffected.
 */

/** Comments and string bodies removed, so a name that appears inside a doc
 *  block or a message cannot be mistaken for one the program uses. String
 *  literals collapse to `""` so that the surrounding syntax still parses. */
export function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === "\\") i++; i++; }
      i++; out += '""'; continue;
    }
    out += c; i++;
  }
  return out;
}

/**
 * The index of the `)` that closes the `(` at `open`.
 *
 * Returns `-1` when the source runs out first, which is a truncated file rather
 * than a finding, and every caller treats it as "no span".
 */
export function matchParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** The index of the `}` that closes the `{` at `open`, or `-1`. */
export function matchBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/**
 * One object literal's top-level members, split on its own commas.
 *
 * `{ a: 1, b: { c: 2 }, ...d, e }` yields the segments `a: 1`, `b: { c: 2 }`,
 * `...d`, `e`. A nested object is a VALUE and never contributes a key: a guard
 * that flattened it would report a request field for every
 * `eligibility: { sector: ... }` in the tree.
 */
export function topLevelMembers(objectBody: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < objectBody.length; i++) {
    const c = objectBody[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) { out.push(objectBody.slice(start, i)); start = i + 1; }
  }
  out.push(objectBody.slice(start));
  return out.map((m) => m.trim()).filter(Boolean);
}

/**
 * The keys one object literal names at its top level.
 *
 * BOTH forms, because a request body uses both: `candidateInstrumentIds` is
 * shorthand in `panel.tsx` and `wantProfileSignal: true` is not, and a scanner
 * that only understood the second would report that the panel cannot send the
 * shortlist — which is a false alarm on a guard whose whole value is that it
 * does not raise them.
 */
export function topLevelKeys(objectBody: string): string[] {
  const keys: string[] = [];
  for (const m of topLevelMembers(objectBody)) {
    const withValue = /^([A-Za-z_$][\w$]*)\s*:/.exec(m);
    if (withValue) { keys.push(withValue[1]); continue; }
    const shorthand = /^([A-Za-z_$][\w$]*)$/.exec(m);
    if (shorthand) keys.push(shorthand[1]);
  }
  return keys;
}

/** The identifiers spread into one object literal at its top level: the
 *  `x` of `{ ...x, a: 1 }`, and the `f` of `{ ...f(y) }`. */
export function topLevelSpreads(objectBody: string): string[] {
  const out: string[] = [];
  for (const m of topLevelMembers(objectBody)) {
    const s = /^\.\.\.\s*([A-Za-z_$][\w$]*)/.exec(m);
    if (s) out.push(s[1]);
  }
  return out;
}
