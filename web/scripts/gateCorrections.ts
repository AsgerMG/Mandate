/**
 * A proposed gate-encoding correction, and the one way to apply a set of them
 * to a snapshot in memory.
 *
 * ── Why this is a module and not a function in one harness ─────────────────
 * `_wsgu_counterfactual.ts` owned the loader and the applier, and the second
 * workstream to propose a correction set needed both. Copying them is how two
 * counterfactuals end up with two drift rules, one of which is quietly laxer —
 * the same failure `apply_gate_encoding_corrections.py` writes `build_plan`
 * once to avoid, one store over. So the shape, the loader and the applier live
 * here and the harnesses differ only in WHAT THEY MEASURE.
 *
 * ── It verifies rather than trusts, and it throws rather than skips ────────
 * Every correction carries the comparator it was written against. If the
 * snapshot no longer holds it, the proposal was derived against a corpus that
 * has moved and applying it would overwrite a decision the file knows nothing
 * about. A counterfactual that silently applied none of its corrections and
 * then reported an improvement is the worst output either harness could have,
 * so a mismatch is fatal here rather than counted.
 *
 * FREE. Reads two committed files, calls nothing.
 */
import { readFileSync } from "fs";
import path from "path";

export interface Correction {
  instrument_id: string;
  gate_key: string;
  action: string;
  clause: string;
  current_value_spec: Record<string, unknown> | null;
  proposed_value_spec: Record<string, unknown> | null;
}

/** Key order is not part of a comparator's identity — the emitter sorts, the
 *  snapshot does not — so specs are compared canonically. */
const canon = (o: unknown): string =>
  JSON.stringify(o, Object.keys((o ?? {}) as object).sort());

export function loadCorrections(file: string): Correction[] {
  return readFileSync(path.join(process.cwd(), file), "utf8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l) as Correction);
}

/** Deep-copy the records and apply every correction. `null` = quarantined: the
 *  requirement stays, the machine verdict stops. */
export function applyCorrections<T extends { id: string; gates?: unknown[] }>(
  records: T[], corrections: Correction[],
): T[] {
  const out = JSON.parse(JSON.stringify(records)) as T[];
  const byId = new Map(out.map((r) => [r.id, r]));
  let applied = 0;
  for (const c of corrections) {
    const inst = byId.get(c.instrument_id);
    const gate = ((inst?.gates ?? []) as { id: string; valueSpec: unknown }[])
      .find((g) => g.id === c.gate_key);
    if (!gate) {
      throw new Error("correction targets a gate that is not in the snapshot: "
        + `${c.instrument_id} [${c.gate_key}]`);
    }
    if (canon(gate.valueSpec) !== canon(c.current_value_spec)) {
      throw new Error(`correction is stale — ${c.instrument_id} [${c.gate_key}] now holds `
        + `${JSON.stringify(gate.valueSpec)}, the correction was written against `
        + `${JSON.stringify(c.current_value_spec)}`);
    }
    gate.valueSpec = c.proposed_value_spec;
    applied += 1;
  }
  if (applied !== corrections.length) throw new Error("not every correction applied");
  return out;
}
