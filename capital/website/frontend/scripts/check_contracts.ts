/**
 * Does the spec still describe the thing we actually build?
 *
 * FREE — reads the contracts, the report schema and the check module. No model
 * calls, no DB.
 *
 * ── The structural fault this exists to stop ──────────────────────────────
 * The writer's instruction file spent weeks describing a version of the report
 * that had been retired: it specified fields (`overview.headline`,
 * `stakeholderMap`, `todos`) the schema no longer had, and specified word
 * budgets for a nine-section memo while the pipeline emitted four sections.
 * Every request paid to send it, and every request ignored it, because the
 * schema and the user message overrode it silently.
 *
 * It survived because nothing broke when it drifted. That is the same fault
 * check_vocabularies.ts exists to stop for intake vocabularies, and this is
 * the same remedy applied to output: a failing check is the only thing that
 * keeps two sources married.
 *
 * Run: npx tsx scripts/check_contracts.ts
 */
import {
  loadContracts, briefContracts, assembleInstructions,
  PROMPTS, UNROUTED_STAGES, type PromptName,
} from "../lib/intelligence/contracts";
import { BRIEF_LIMITS, CHECK_RULE_IDS } from "../lib/intelligence/briefChecks";
import { QUESTION_RULE_IDS } from "../lib/intelligence/questionChecks";
import { SELECTION_RULE_IDS } from "../lib/intelligence/selectionChecks";
import { UNENFORCED_RULES } from "../lib/intelligence/unenforcedRules";
import { REPORT_SCHEMA_FIELDS, EVIDENCE_BLOCKS } from "../lib/intelligence/types";
// The funnel check below reads the caps themselves, never a copy of them.
// `caps.ts` imports NOTHING: importing them from `memoCandidates`/`shortlist`
// pulled the corpus layer in behind them and this check stopped being
// hermetic, which `check_env_loader` caught.
import { VERDICT_POOL, WRITER_CANDIDATE_CAP } from "../lib/intelligence/caps";

interface Problem { axis: string; detail: string; }

function main() {
  const problems: Problem[] = [];
  const contracts = loadContracts();
  if (!contracts.length) problems.push({ axis: "contracts", detail: "no contracts found" });

  const declaredRules = new Set(contracts.flatMap((c) => c.ruleIds));

  for (const c of contracts) {
    if (!c.id) problems.push({ axis: "frontmatter", detail: `${c.file}: no id` });
    if (!c.stage) problems.push({ axis: "frontmatter", detail: `${c.file}: no stage` });

    // Every rule id must belong to its own contract's prefix, or the shared
    // namespace collapses and two files can mint the same id.
    for (const r of c.ruleIds) {
      if (!r.startsWith(`${c.id}-`)) {
        problems.push({ axis: "rule-id", detail: `${c.file}: rule ${r} does not use this contract's ${c.id}- prefix` });
      }
    }

    // A contract may only govern fields the report actually has. This is the
    // exact drift that made the old instructions file describe a dead schema.
    for (const f of c.schemaFields) {
      if (!REPORT_SCHEMA_FIELDS.includes(f)) {
        problems.push({ axis: "schema", detail: `${c.file}: governs "${f}", which the report schema does not have` });
      }
    }

    // A contract may only claim evidence the pipeline actually assembles,
    // otherwise it promises the model context it will never receive.
    for (const e of c.evidence) {
      if (!EVIDENCE_BLOCKS.includes(e)) {
        problems.push({ axis: "evidence", detail: `${c.file}: claims evidence "${e}", which the pipeline does not assemble` });
      }
    }
  }

  // Every schema field must be governed by exactly one brief contract. An
  // ungoverned field is a section nobody specified.
  const governed = new Map<string, string[]>();
  for (const c of briefContracts()) {
    for (const f of c.schemaFields) governed.set(f, [...(governed.get(f) ?? []), c.file]);
  }
  for (const f of REPORT_SCHEMA_FIELDS) {
    const owners = governed.get(f) ?? [];
    if (owners.length === 0) problems.push({ axis: "coverage", detail: `report field "${f}" has no contract` });
    if (owners.length > 1) problems.push({ axis: "coverage", detail: `report field "${f}" governed by ${owners.join(" and ")}` });
  }

  // No orphan checks: a check enforcing a rule no contract declares is
  // enforcing something nobody agreed to.
  const enforced = new Set<string>([
    ...CHECK_RULE_IDS, ...QUESTION_RULE_IDS, ...SELECTION_RULE_IDS,
  ]);
  for (const id of enforced) {
    if (!declaredRules.has(id)) {
      problems.push({ axis: "orphan-check", detail: `a check enforces ${id}, which no contract declares` });
    }
  }

  // ── A rule id means one rule ────────────────────────────────────────────
  // `declaredRules` is a Set, so a duplicate id was silently absorbed and the
  // success line quietly under-counted. One id was in fact declared twice, in
  // one file, on two different rules -- and if either were ever promoted to a
  // checked rule, one check would satisfy both.
  const seenIds = new Map<string, string[]>();
  for (const c of contracts) {
    for (const r of c.ruleIds) seenIds.set(r, [...(seenIds.get(r) ?? []), c.file]);
  }
  for (const [id, files] of seenIds) {
    if (files.length > 1) {
      problems.push({ axis: "rule-id", detail: `${id} is declared ${files.length} times (${[...new Set(files)].join(", ")})` });
    }
  }

  // ── EVERY RULE IS ENFORCED OR DECLARED UNENFORCED. No third state. ──────
  // This loop used to read `/^-\s+([A-Z]+-\d+)\s+\(hard\)/` and so was blind
  // twice over to the strongest thing a contract can say: a Banned rule
  // presents `B1` where the pattern demands a digit, and carries no `(hard)`
  // marker at all. All fifteen Banned rules were therefore invisible to the
  // check that exists to find unenforced rules -- while three other regexes in
  // this same file already used the correct `([A-Z]+-B?\d+)`.
  //
  // It also exempted every `(judged)` and `(soft)` rule, on the stated grounds
  // that a model reading the contract scores them. There is no such model. So
  // the exemption is gone and the register in unenforcedRules.ts takes its
  // place: a rule in neither the checks nor the register fails the build, which
  // forces the decision at the moment a rule is written.
  for (const c of contracts) {
    for (const r of c.ruleIds) {
      const isEnforced = enforced.has(r);
      const isDeclared = Boolean(UNENFORCED_RULES[r]);
      if (!isEnforced && !isDeclared) {
        problems.push({ axis: "unenforced", detail:
          `${c.file}: ${r} is enforced by nothing and is not declared in unenforcedRules.ts. ` +
          `State the predicate that would decide it and why it does not run.` });
      }
      if (isEnforced && isDeclared) {
        problems.push({ axis: "unenforced", detail:
          `${c.file}: ${r} is both enforced and declared unenforced. Remove it from the register.` });
      }
    }
  }
  for (const id of Object.keys(UNENFORCED_RULES)) {
    if (!declaredRules.has(id)) {
      problems.push({ axis: "unenforced", detail:
        `unenforcedRules.ts declares ${id}, which no contract has. A register entry for a rule ` +
        `that no longer exists hides the next one.` });
    }
  }

  // ── EVERY CONTRACT REACHES A PROMPT, OR SAYS WHY IT DOES NOT ────────────
  //
  // The writer's assembler used to select contracts by excluding one stage.
  // `contracts/selection/` (stage `gate2.select`) was therefore appended to the
  // memo writer's system prompt on every request, instructing it to return five
  // indices "best first" alongside FUND-2's seven-row cap and FUND-12's ban on
  // calling any row first or best. Nothing noticed, because nothing asserted
  // that a contract only reaches the stage it was written for.
  //
  // Stated over the routing table itself, so a contract directory added
  // tomorrow is judged with no edit here: its stage must be admitted by a
  // prompt, or declared unrouted with the reason.
  const stages = [...new Set(contracts.map((c) => c.stage))].filter(Boolean);
  for (const stage of stages) {
    const readers = (Object.keys(PROMPTS) as PromptName[]).filter((p) => PROMPTS[p].reads(stage));
    const declared = Boolean(UNROUTED_STAGES[stage]);
    if (!readers.length && !declared) {
      problems.push({ axis: "routing", detail:
        `stage "${stage}" is read by no prompt and is not declared in UNROUTED_STAGES. ` +
        `Route it in PROMPTS, or say why no prompt may carry it.` });
    }
    if (readers.length && declared) {
      problems.push({ axis: "routing", detail:
        `stage "${stage}" is declared unrouted but ${readers.join(" and ")} reads it. ` +
        `Remove it from the register.` });
    }
  }
  for (const stage of Object.keys(UNROUTED_STAGES)) {
    if (!stages.includes(stage)) {
      problems.push({ axis: "routing", detail:
        `UNROUTED_STAGES declares "${stage}", which no contract has. A register entry ` +
        `for a stage that no longer exists hides the next one.` });
    }
  }
  // And the assembled text itself, not just the predicate: a prompt must carry
  // every contract routed to it and no other. The bug was visible in the STRING
  // the model received, so that is what this reads.
  for (const p of Object.keys(PROMPTS) as PromptName[]) {
    const text = assembleInstructions(p);
    for (const c of contracts) {
      const marker = `# CONTRACT ${c.id} — ${c.stage}`;
      const present = text.includes(marker);
      const should = PROMPTS[p].reads(c.stage);
      if (present !== should) {
        problems.push({ axis: "routing", detail:
          `${PROMPTS[p].what}'s system prompt ${present ? "carries" : "omits"} ${c.file} ` +
          `(stage ${c.stage}), which its routing ${should ? "requires" : "excludes"}` });
      }
    }
  }

  // ── A cap the writer is TOLD must be the cap the code CUTS to ───────────
  // The contract text is the writer's prompt verbatim (assembleWriterInstructions),
  // so a row cap written here is an independent copy of a number that also
  // lives in `BRIEF_LIMITS` and, through it, in the pipeline's cut. Three
  // copies of five sat in this repo with nothing comparing them, which is how
  // the instant screen came to build and render a sixth row that the memo
  // silently discarded.
  //
  // Stated as a property, not a register: ANY contract rule that writes "at
  // most <n> rows" is claiming the published row cap, whatever the section, so
  // a rule added tomorrow is held to the same tie with no edit here.
  const NUMBER_WORDS: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10,
  };
  let capStated = 0;
  for (const c of contracts) {
    for (const line of c.body.split("\n")) {
      const m = line.match(/^-\s+([A-Z]+-B?\d+)\s+\(\w+\)\s+At most ([a-z]+|\d+) rows\b/i);
      if (!m) continue;
      capStated++;
      const stated = NUMBER_WORDS[m[2].toLowerCase()] ?? Number(m[2]);
      if (!Number.isFinite(stated)) {
        problems.push({ axis: "row-cap", detail: `${c.file}: ${m[1]} states a row cap this check cannot read ("${m[2]}")` });
      } else if (stated !== BRIEF_LIMITS.institutionsMax) {
        problems.push({
          axis: "row-cap",
          detail: `${c.file}: ${m[1]} tells the writer at most ${stated} rows, ` +
            `but BRIEF_LIMITS.institutionsMax (which the pipeline cuts to and ` +
            `checkBrief enforces) is ${BRIEF_LIMITS.institutionsMax}`,
        });
      }
    }
  }
  // A tie nothing is tied to is not a guard. If the sentence is reworded out
  // of existence the number stops being stated to the writer at all, and this
  // check would go green while the prompt lost its cap.
  if (capStated !== 1) {
    problems.push({
      axis: "row-cap",
      detail: `expected exactly one contract rule to state the published row cap, found ${capStated}. ` +
        `Zero means the writer is never told it; more than one means two copies again.`,
    });
  }

  // ── THE FUNNEL MUST NARROW, AND NOTHING ASSERTED THAT IT DID ─────────────
  //
  // Five caps stand between the corpus and the published table, and each one
  // is a separate constant in a separate file:
  //
  //     VERDICT_POOL -> WRITER_CANDIDATE_CAP -> institutionsMax -> the floor
  //
  // They only work as a funnel if each is STRICTLY wider than the next. A cap
  // that is narrower upstream than downstream cannot be reached: the pipeline
  // would cut to a number of rows it never assembled, and the brief would go
  // short with nothing anywhere saying why. The audit that produced this check
  // found the ordering correct today and found NOTHING asserting it -- so the
  // day someone raises the published cap without raising the writer's, the
  // only symptom is shorter briefs.
  //
  // The strictness matters and is not decoration. `WRITER_CANDIDATE_CAP` minus
  // `institutionsMax` IS the number of candidates the writer may decline
  // before the table is short, and the writer declines candidates routinely
  // (`WRT-NO-NOTE`, `WRT-WATCH-ONLY`). At equality that headroom is zero and
  // every candidate must land, which no measurement here supports.
  //
  // Stated over the constants themselves, so a cap moved tomorrow is judged
  // with no edit here. Each pair names WHY it must hold, because a guard that
  // only says "3 < 4" teaches the person who trips it nothing.
  const funnel: { wider: string; wide: number; narrower: string; narrow: number; why: string }[] = [
    {
      wider: "VERDICT_POOL", wide: VERDICT_POOL,
      narrower: "WRITER_CANDIDATE_CAP", narrow: WRITER_CANDIDATE_CAP,
      why: "the pool is what the writer's candidates are drawn from, and it is " +
        "spent further by the blocked drop and the display-name dedupe before the cut",
    },
    {
      wider: "WRITER_CANDIDATE_CAP", wide: WRITER_CANDIDATE_CAP,
      narrower: "BRIEF_LIMITS.institutionsMax", narrow: BRIEF_LIMITS.institutionsMax,
      why: "a candidate the writer never wrote a note for cannot be published, so the " +
        "difference is the number of candidates it may decline before the table goes short",
    },
  ];
  for (const f of funnel) {
    if (f.wide > f.narrow) continue;
    problems.push({
      axis: "row-cap",
      detail: `${f.wider} is ${f.wide} and ${f.narrower} is ${f.narrow}. The funnel must narrow ` +
        `strictly at every step: ${f.why}.`,
    });
  }

  // ── A rule states a property; it does not enumerate cases ──────────────
  // A register of banned phrases is the failure this whole architecture
  // exists to stop, and it is seductive because each entry is individually
  // correct. It does not scale: it only ever covers the cases someone has
  // already seen, and the next fund, language or phrasing walks straight past
  // it.
  //
  // Detected by shape rather than by meaning. A rule that quotes three or more
  // literals in a row is almost always listing instances instead of naming the
  // property they share. The fix is always the same: replace the list with a
  // TEST the reader can apply to a word or case nobody has seen yet.
  for (const c of contracts) {
    for (const block of c.body.split(/\n(?=- [A-Z]+-)/)) {
      const m = block.match(/^-\s+([A-Z]+-B?\d+)/);
      if (!m) continue;
      // Ignore the evidence note: quoting the run that revealed a rule is
      // exactly what evidence is for.
      const ruleText = block.split(/\*\*evidence:/)[0];
      const quoted = ruleText.match(/"[^"]{2,40}"/g) ?? [];
      if (quoted.length >= 3) {
        problems.push({
          axis: "enumeration",
          detail: `${c.file}: ${m[1]} lists ${quoted.length} quoted cases (${quoted.slice(0, 3).join(", ")}…). ` +
            `State the property and give a test that works on cases not yet seen.`,
        });
      }
    }
  }

  // House rule: a rule names a property, never an instance. Company names are
  // not detectable generically, but the shape that caused the problem is —
  // rule text citing a specific run belongs in an evidence note beside the
  // rule, never inside it.
  for (const c of contracts) {
    for (const line of c.body.split("\n")) {
      const m = line.match(/^-\s+([A-Z]+-B?\d+)\s+\((?:hard|soft)\)\s+(.*)$/);
      if (m && /\bevidence:\s/i.test(m[2])) {
        problems.push({ axis: "house-rule", detail: `${c.file}: ${m[1]} carries evidence inside the rule text; move it to a separate note` });
      }
    }
  }

  if (problems.length) {
    console.error(`\ncheck_contracts: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  [${p.axis}] ${p.detail}`);
    console.error("");
    process.exit(1);
  }
  const declaredUnenforced = Object.keys(UNENFORCED_RULES).length;
  const byReason = new Map<string, number>();
  for (const r of Object.values(UNENFORCED_RULES)) byReason.set(r.why, (byReason.get(r.why) ?? 0) + 1);
  console.log(
    `check_contracts: ok — ${contracts.length} contracts, ${seenIds.size} rules, ` +
    `${enforced.size} enforced, ${declaredUnenforced} declared unenforced ` +
    `(${[...byReason].sort().map(([k, n]) => `${k} ${n}`).join(", ")}), ` +
    `${REPORT_SCHEMA_FIELDS.length} report fields governed`);
}

main();
