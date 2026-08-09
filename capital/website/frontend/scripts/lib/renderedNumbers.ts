// Finding the text a visitor reads, and the quantities in it.
//
// Split out of `scripts/check_rendered_numbers.ts` so the detector can be
// measured and unit-tested rather than trusted. The check is the policy; this
// is the machinery, and the machinery is what was wrong.
//
// ── The blind spot this replaces ───────────────────────────────────────────
// The first version found JSX text with a regex: `>([^<>{}]{4,})<`. A run had
// to start at a tag-close, end at a tag-open, and contain no braces. That is
// not what JSX text is. Any sentence INTERRUPTED BY AN EXPRESSION is bounded by
// `}` on the left or `{` on the right, matches neither end of that regex, and
// was dropped whole.
//
// The paragraph it dropped on /about-public-capital is the one that states the
// corpus figures:
//
//     This manual is built on the funding record itself:{" "}
//     <CountUp value={Number(corpus.events)} … />{" "}
//     public awards to{" "}
//     <CountUp value={Number(corpus.companies)} … />{" "}
//     companies and organisations, {prose.awardWindow}. It answers …
//
// Every fragment of it sits between a `}` and a `{`. Replacing
// `{prose.awardWindow}` with a hardcoded "2021 to 2025" — the exact regression
// the guard exists to stop — exited 0. The guard could not see the sentence it
// was written to protect, and the reason was structural: interpolation is what
// a derived figure LOOKS like, so the extractor was blindest exactly where the
// numbers are.
//
// ── The fix: ask the compiler, not a regex ─────────────────────────────────
// TypeScript is already a dependency and already parses TSX. `ts.JsxText`
// nodes are, by definition, the text a visitor reads; there is no pattern to
// get wrong and no syntax that can surprise it. Template-literal pieces
// (`TemplateHead`/`Middle`/`Tail`) come along for free, which the old regex
// also missed — it only matched templates with no substitutions at all.
//
// ── And the second blind spot, which was worse ─────────────────────────────
// Attribution used a LINE WINDOW: a literal was cleared if a `<Src n={…} />`,
// a `url:` or a provenance comment appeared within eight lines above or four
// below. On app/about-public-capital/page.tsx that cleared 188 of 581 lines —
// a third of the page was unguarded because it is dense with footnotes. Any
// number written near a citation inherited that citation's authority.
//
// Attribution is now structural: a footnote clears the JSX ELEMENT it sits in,
// a `url:` clears the OBJECT LITERAL it belongs to, and a provenance comment
// clears the node it is attached to. Nothing is cleared by being nearby.
import ts from "typescript";

// ── Visitor text ─────────────────────────────────────────────────────────────

/** One stretch of text a visitor reads.
 *
 *  A run is a whole JSX element's worth of text, with `⟨…⟩` standing in for
 *  each expression, so an interpolated sentence is judged as the sentence it
 *  renders as. `segments` keeps every piece's real source position, so a match
 *  anywhere in `text` still reports the line it was actually typed on. */
export interface TextRun {
  /** The joined, reader-facing text, expressions elided. */
  text: string;
  /** Where each piece of `text` came from: [offset in text, source position]. */
  segments: { at: number; pos: number }[];
  /** First source line this run touches — what a message leads with. */
  line: number;
  /** Every source line this run covers, for the coverage measurement. */
  lines: number[];
  /** The AST node a quantity in this run should have its attribution read
   *  from: the JSX element for JSX text, the literal for a string. */
  node: ts.Node;
}

const PLACEHOLDER = " ⟨…⟩ ";

export function parse(file: string, src: string): ts.SourceFile {
  return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** Is this string literal English prose a visitor reads, rather than a class
 *  name, a URL, a SQL fragment or an id?
 *
 *  Three or more purely alphabetic word tokens. Tailwind strings never have
 *  them (`mt-3`, `min-h-[1.25rem]` are not words); sentences always do. */
export function readsAsProse(s: string): boolean {
  return s.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z']*$/.test(w)).length >= 3;
}

const lineAt = (sf: ts.SourceFile, pos: number) =>
  sf.getLineAndCharacterOfPosition(pos).line + 1;

/** Every stretch of text a visitor can read in this module.
 *
 *  Two sources, and between them they are exhaustive for a React module:
 *
 *    JSX TEXT     the children of an element, joined across the expressions
 *                 that interrupt them. This is the half the regex could not do.
 *    LITERALS     strings and template pieces that read as prose — captions,
 *                 labels, question stems, the /brief progress chatter. These
 *                 reach a screen through a prop rather than as children, and a
 *                 literal in one is exactly as visible to a founder. */
export function visitorTextRuns(sf: ts.SourceFile): TextRun[] {
  const runs: TextRun[] = [];
  const claimed = new Set<ts.Node>();  // JsxText already folded into a run


  const visit = (node: ts.Node): void => {
    // ── JSX children: one run per element, expressions elided ──────────────
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      let text = "";
      const segments: { at: number; pos: number }[] = [];
      const lines = new Set<number>();
      let sawText = false;
      for (const child of node.children) {
        if (ts.isJsxText(child)) {
          claimed.add(child);
          if (!/\S/.test(child.text)) continue;
          sawText = true;
          segments.push({ at: text.length, pos: child.getStart() });
          const from = lineAt(sf, child.getStart());
          const to = lineAt(sf, child.getEnd());
          for (let l = from; l <= to; l++) lines.add(l);
          text += child.text;
        } else if (ts.isJsxExpression(child)) {
          // `{" "}` is a space a reader sees; every other expression is a value
          // this check must NOT judge, because a value is the fix, not the bug.
          const inner = child.expression;
          const isSpace = inner !== undefined && ts.isStringLiteral(inner)
            && /^\s+$/.test(inner.text);
          text += isSpace ? " " : PLACEHOLDER;
        } else {
          // A nested element (<span>, <Src/>, <b>) breaks the run visually far
          // less than it does structurally; treat it as a placeholder so the
          // sentence around it stays one sentence.
          text += PLACEHOLDER;
        }
      }
      if (sawText) {
        runs.push({
          text,
          segments,
          line: lineAt(sf, segments[0].pos),
          lines: [...lines],
          node,
        });
      }
    }

    // ── Literals that read as prose ────────────────────────────────────────
    if (ts.isStringLiteral(node)
        || ts.isNoSubstitutionTemplateLiteral(node)
        || ts.isTemplateHead(node)
        || ts.isTemplateMiddle(node)
        || ts.isTemplateTail(node)) {
      const text = (node as ts.LiteralLikeNode).text;
      if (text && readsAsProse(text)) {
        // Every line the literal spans, not just the one it opens on: the
        // SOURCES entries on /about-public-capital are single strings wrapped
        // over four lines each, and counting only the first read as 95%
        // coverage of a file the detector in fact saw whole.
        const from = lineAt(sf, node.getStart());
        const to = lineAt(sf, node.getEnd());
        const lines: number[] = [];
        for (let l = from; l <= to; l++) lines.push(l);
        runs.push({
          text,
          segments: [{ at: 0, pos: node.getStart() }],
          line: from,
          lines,
          node,
        });
      }
    }

    node.forEachChild(visit);
  };
  visit(sf);

  // A JsxText that no element claimed cannot exist (JsxText only occurs as a
  // child), but assert rather than assume: a silent gap here is the whole bug.
  const orphans: number[] = [];
  const findOrphans = (node: ts.Node): void => {
    if (ts.isJsxText(node) && /\S/.test(node.text) && !claimed.has(node)) {
      orphans.push(lineAt(sf, node.getStart()));
    }
    node.forEachChild(findOrphans);
  };
  findOrphans(sf);
  if (orphans.length) {
    throw new Error(
      `visitorTextRuns dropped ${orphans.length} JSX text node(s) at line(s) ` +
      `${orphans.slice(0, 10).join(", ")} in ${sf.fileName}. The extractor is ` +
      `losing text again, which is the defect it was rewritten to fix.`);
  }
  return runs;
}

/** Which source line a character offset inside a run's `text` came from. */
export function lineOfMatch(sf: ts.SourceFile, run: TextRun, at: number): number {
  let seg = run.segments[0];
  for (const s of run.segments) if (s.at <= at) seg = s; else break;
  return lineAt(sf, seg.pos + Math.max(0, at - seg.at));
}

// ── Attribution, scoped to structure rather than to nearby lines ─────────────

const PROVENANCE = /\b(external|corpus|contract)\s*:/i;

/** Does this JSX element (or anything inside it) carry a footnote marker? */
function hasFootnote(node: ts.Node): boolean {
  let found = false;
  const walk = (n: ts.Node) => {
    if (found) return;
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n))
        && n.tagName.getText() === "Src") { found = true; return; }
    n.forEachChild(walk);
  };
  walk(node);
  return found;
}

/** A provenance comment attached to this node — `{/* external: … *\/}` sitting
 *  immediately before a JSX element, or a `// corpus: …` line above a
 *  statement or property. "Attached", never "nearby": the line window this
 *  replaces cleared a third of /about-public-capital by proximity alone. */
function hasAttachedProvenance(sf: ts.SourceFile, node: ts.Node): boolean {
  const full = sf.text;
  const ranges = ts.getLeadingCommentRanges(full, node.getFullStart()) ?? [];
  for (const r of ranges) if (PROVENANCE.test(full.slice(r.pos, r.end))) return true;

  // Inside JSX, a comment is `{/* … */}` — a JsxExpression with no expression.
  // Look only at the immediately preceding sibling, so a comment attaches to
  // one element and not to the rest of the file.
  const parent = node.parent;
  if (parent && (ts.isJsxElement(parent) || ts.isJsxFragment(parent))) {
    const kids = parent.children.filter((c) => !(ts.isJsxText(c) && !/\S/.test(c.text)));
    const i = kids.indexOf(node as ts.JsxChild);
    for (let k = i - 1; k >= 0 && k >= i - 1; k--) {
      const prev = kids[k];
      if (ts.isJsxExpression(prev) && prev.expression === undefined
          && PROVENANCE.test(prev.getText())) return true;
    }
  }
  return false;
}

/** A cited source list entry: the URL beside the figure names where it came
 *  from as surely as a footnote marker does. Scoped to the object literal, not
 *  to a span of lines. */
function inCitedObject(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isObjectLiteralExpression(n)) {
      for (const p of n.properties) {
        if (ts.isPropertyAssignment(p) && p.name.getText() === "url") {
          const v = p.initializer;
          if ((ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v))
              && /^https?:/.test(v.text)) return true;
        }
      }
    }
  }
  return false;
}

/** A JSX element that HOLDS other elements rather than being one — more than
 *  one element child. A comment written above a container was written about the
 *  container, and must not clear every figure inside it. */
function isContainer(n: ts.Node): boolean {
  if (!ts.isJsxElement(n) && !ts.isJsxFragment(n)) return false;
  const kids = n.children.filter(
    (c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c));
  return kids.length > 1;
}

/**
 * Is this quantity attributed — does it say where it came from?
 *
 * Three forms, all structural, all TIGHT. The version this replaces cleared
 * anything within eight lines of a citation, which on
 * app/about-public-capital/page.tsx was 188 of 581 lines: a third of the page
 * inherited the authority of a footnote it had nothing to do with.
 *
 *   FOOTNOTE     a `<Src n={…} />` inside THIS element. Not an ancestor's:
 *                the first rewrite climbed, and a `<Src>` in one paragraph
 *                cleared its neighbour through their shared `<div>`. The
 *                self-test asserts that it no longer can.
 *   CITED OBJECT a `url:` in the same object literal — the SOURCES list.
 *   PROVENANCE   an `external:` / `corpus:` / `contract:` comment attached to
 *                the node, or to an enclosing element up to (not through) the
 *                first container.
 *
 * Nothing is cleared by being nearby.
 */
export function isAttributed(sf: ts.SourceFile, node: ts.Node): boolean {
  if (inCitedObject(node)) return true;
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    // A container is where "the same element" stops meaning what a reader
    // means by it. Break BEFORE testing it, or a <div> holding six paragraphs
    // clears all six on one footnote — which is the bug, in a new shape.
    if (n !== node && isContainer(n)) break;
    if (hasFootnote(n)) return true;
    if (hasAttachedProvenance(sf, n)) return true;
    if (ts.isStatement(n) || ts.isSourceFile(n)) break;
  }
  return false;
}

// ── What a quantity looks like ───────────────────────────────────────────────

/** Magnitudes only a corpus reaches, money, shares, and windows. */
export const NUMERIC_PATTERNS: [RegExp, string][] = [
  [/\d{1,3}(?:,\d{3})+/g, "a thousands-separated count"],
  [/(?<![\w.])\d{4,}(?![\w.])/g, "an integer of four digits or more"],
  [/(?:€|EUR)\s?\d[\d.,]*\s?(?:bn|m|k|B|M|K|billion|million)?/gi, "a euro amount"],
  [/\d+(?:\.\d+)?\s?%/g, "a percentage"],
  [/(?:19|20)\d{2}\s*(?:to|–|—|-)\s*(?:19|20)\d{2}/g, "a year range"],
];

/** English quantity words. A closed class in the language, not a list of this
 *  site's numbers: any of them standing next to a noun the corpus counts is a
 *  magnitude claim about the corpus written out in letters. */
export const QUANTITY_WORDS =
  /\b(?:a |one |two |three |four |several |half a |)?(?:half|thirds?|quarters?|fifths?|dozens?|handful|majority|minority)\b/gi;

const NEAR_WORDS = 6;

export interface Hit { quantity: string; why: string; at: number }

/** Every quantity in one run that makes a claim a reader could check. */
export function quantitiesIn(text: string, nouns: Set<string>): Hit[] {
  const hits: Hit[] = [];
  for (const [re, why] of NUMERIC_PATTERNS) {
    for (const m of text.matchAll(re)) hits.push({ quantity: m[0], why, at: m.index! });
  }
  for (const m of text.matchAll(QUANTITY_WORDS)) {
    const after = text.slice(m.index! + m[0].length).split(/\s+/).slice(0, NEAR_WORDS);
    const before = text.slice(0, m.index!).split(/\s+/).slice(-NEAR_WORDS);
    const near = [...before, ...after].map((w) => w.toLowerCase().replace(/[^a-z]/g, ""));
    if (near.some((w) => w.length >= 4 && nouns.has(w))) {
      hits.push({
        quantity: m[0].trim(),
        why: "a quantity word beside something the corpus counts",
        at: m.index!,
      });
    }
  }
  return hits;
}

// ── Coverage: what the detector reaches, against an independent count ────────

/** Function words. Present in a sentence, absent from a declaration — the
 *  cheapest test in English for "this line is prose, not code". Deliberately
 *  a LANGUAGE list, not a domain one: it says nothing about funding. */
const FUNCTION_WORDS = new Set([
  "the", "a", "an", "of", "and", "or", "to", "in", "that", "this", "for", "is",
  "are", "was", "were", "be", "you", "your", "it", "its", "with", "on", "not",
  "from", "as", "at", "by", "but", "into", "than", "then", "they", "their",
  "we", "our", "what", "which", "who", "how", "when", "there", "have", "has",
]);

/**
 * Lines that CARRY VISITOR TEXT, counted without using the extractor.
 *
 * This is the ground truth the coverage figure is measured against, and its
 * whole value is that it shares no code with `visitorTextRuns`. It is a dumb
 * line-at-a-time test: strip comments, strip markup and expressions, and ask
 * whether what is left reads like a sentence — four or more alphabetic words,
 * at least one of them an English function word.
 *
 * If the extractor regresses the two diverge, which is the alarm. If this
 * measure itself were derived from the extractor, they could never diverge and
 * the coverage number would be decoration.
 */
export function proseBearingLines(src: string): Set<number> {
  const out = new Set<number>();
  const blanked = blankComments(src);
  const lines = blanked.split("\n");
  lines.forEach((raw, i) => {
    if (/^\s*(import|export)\s+.*\bfrom\b/.test(raw)) return;
    const residue = raw
      .replace(/<[^>]*>/g, " ")      // markup
      .replace(/\{[^{}]*\}/g, " ")   // single-line expressions
      .replace(/<[^>]*$/, " ")       // a tag that opens and runs on
      .replace(/^[^<]*>/, " ");      // …and its tail on the next line
    // A SENTENCE, by shape: four or more ordinary English words in a row,
    // separated by single spaces, at least one of them a function word.
    //
    // "Ordinary" excludes SCREAMING_CASE and camelCase, which is what makes
    // this a language test rather than a code test — `const NUMERIC_TO_ISO2:
    // Record = {` reads as four tokens to a naive counter and as no sentence
    // at all to this one, and `"040": "AT"` stops looking like prose the
    // moment "AT" has to be a lowercase word to count.
    for (const m of residue.matchAll(/[A-Za-z][a-z']+(?: [A-Za-z][a-z']+){3,}/g)) {
      const words = m[0].toLowerCase().split(" ");
      if (words.some((w) => FUNCTION_WORDS.has(w))) { out.add(i + 1); return; }
    }
  });
  return out;
}

/** Blank comments in place, preserving every offset. */
export function blankComments(src: string): string {
  const out = src.split("");
  let i = 0;
  let inStr: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (inStr) {
      if (c === "\\") { i += 2; continue; }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; i++; continue; }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") { out[i] = " "; i++; }
      continue;
    }
    if (c === "/" && n === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      out[i] = " "; out[i + 1] = " ";
      i += 2;
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Does this module put markup on a screen?
 *
 *  Asked of the AST, not of a regex. The regex this replaces was
 *  `/<[A-Za-z][\w.]*[\s/>]/`, which matches `Record<string, number>` — so
 *  `lib/corpusFigures.ts` and `regions.generated.ts` counted as rendering
 *  modules, and their log lines and NUTS labels went into the coverage
 *  denominator as visitor text nobody can see. */
export function rendersJsx(sf: ts.SourceFile): boolean {
  let found = false;
  const walk = (n: ts.Node) => {
    if (found) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      found = true; return;
    }
    n.forEachChild(walk);
  };
  walk(sf);
  return found;
}

export interface Coverage {
  file: string;
  expected: number;
  reached: number;
  missed: number[];
}

/** How much of a module's visitor text the detector actually sees. */
export function coverageOf(file: string, src: string, sf: ts.SourceFile): Coverage {
  const expected = proseBearingLines(src);
  const reached = new Set<number>();
  for (const run of visitorTextRuns(sf)) for (const l of run.lines) reached.add(l);
  const missed = [...expected].filter((l) => !reached.has(l)).sort((a, b) => a - b);
  return { file, expected: expected.size, reached: expected.size - missed.length, missed };
}
