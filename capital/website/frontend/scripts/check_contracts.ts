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
import { loadContracts, briefContracts } from "../lib/intelligence/contracts";
import { CHECK_RULE_IDS } from "../lib/intelligence/briefChecks";
import { QUESTION_RULE_IDS } from "../lib/intelligence/questionChecks";
import { REPORT_SCHEMA_FIELDS, EVIDENCE_BLOCKS } from "../lib/intelligence/types";

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
  for (const id of [...CHECK_RULE_IDS, ...QUESTION_RULE_IDS]) {
    if (!declaredRules.has(id)) {
      problems.push({ axis: "orphan-check", detail: `briefChecks enforces ${id}, which no contract declares` });
    }
  }

  // No dead spec: a hard rule with no enforcing check is a rule that will
  // rot, which is how the previous instructions file died.
  const enforced = new Set<string>([...CHECK_RULE_IDS, ...QUESTION_RULE_IDS]);
  for (const c of contracts) {
    for (const line of c.body.split("\n")) {
      const m = line.match(/^-\s+([A-Z]+-\d+)\s+\(hard\)/);
      if (m && !enforced.has(m[1])) {
        problems.push({ axis: "unenforced", detail: `${c.file}: ${m[1]} is (hard) but nothing checks it` });
      }
    }
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
  console.log(
    `check_contracts: ok — ${contracts.length} contracts, ${declaredRules.size} rules, ` +
    `${CHECK_RULE_IDS.length + QUESTION_RULE_IDS.length} enforced, ${REPORT_SCHEMA_FIELDS.length} report fields governed`);
}

main();
