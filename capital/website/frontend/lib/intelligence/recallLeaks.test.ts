// The leak detector, tested on leaks it is deliberately given.
//
// A check that has only ever returned green has not been shown to be capable
// of returning red. Today's leak survived weeks of green suites, so this suite
// poisons the REAL active recall set with text taken out of the REAL profile
// the won fund is scored against, and requires the detector to catch it — at
// each of the three strictnesses, on the won fund and on a sibling.
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { ACTIVE_RECALL_SET } from "../../scripts/recallSet";
import { checkSquashProbes, grams, makeLeakDetector, squash } from "./recallLeaks";
import type { LeakIndexFile, LeakRow } from "./recallLeaks";

const read = (f: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "lib", "intelligence", f), "utf8"));

const idx = read("profileLeakIndex.generated.json") as LeakIndexFile;
// The ACTIVE set, imported rather than named. The docstring above says this
// suite poisons "the REAL active recall set", and it named a file instead — so
// the day the active set changed, the one suite asserting the detector can
// return red would have gone on poisoning a retired file and passing. The
// comment was the specification; the literal was the bug.
const rows = read(ACTIVE_RECALL_SET) as LeakRow[];
const detect = makeLeakDetector(idx);

/** A fund that has a profile AND at least one sibling with one — the case the
 *  sibling rule exists for. Chosen by searching the corpus rather than named,
 *  so the test keeps working when the corpus changes. */
function findGroup(): { won: string; sibling: string } {
  const heads = new Map<string, string[]>();
  for (const id of Object.keys(idx.profile)) {
    const head = idx.parent[id] ?? id;
    (heads.get(head) ?? heads.set(head, []).get(head)!).push(id);
  }
  for (const [, members] of [...heads].sort()) {
    const withText = members.filter((m) => (idx.profile[m] ?? "").split(" ").length > 40);
    if (withText.length >= 2) return { won: withText[0], sibling: withText[1] };
  }
  throw new Error("no sibling group with two profiled members");
}

/** Twelve consecutive words lifted out of a profile: longer than the 8-word
 *  unit, so it is a leak by any reading. */
const stolen = (id: string, from = 5) =>
  (idx.profile[id] ?? "").split(" ").slice(from, from + 12).join(" ");

describe("squash agrees with the Python guards", () => {
  it("reproduces every probe the artifact carries", () => {
    expect(idx.squashProbes?.length ?? 0).toBeGreaterThan(50);
    expect(checkSquashProbes(idx)).toEqual([]);
  });

  it("normalises accents, punctuation and whitespace away", () => {
    expect(squash("Régime  cadre — exempté, 2024/2026!")).toBe("regime cadre exempte 2024 2026");
  });

  it("takes eight-word windows", () => {
    expect([...grams("a b c d e f g h i")]).toEqual([
      "a b c d e f g h", "b c d e f g h i",
    ]);
  });
});

describe("the active recall set", () => {
  it("has no leaking description", () => {
    const bad = rows.filter((r) => detect(r));
    expect(bad.map((r) => `${r.name} -> ${r.instrument}: ${detect(r)}`)).toEqual([]);
  });
});

describe("a deliberately poisoned row is caught", () => {
  const { won, sibling } = findGroup();
  const base: LeakRow = { name: "PoisonCo", instrument: won, description: "" };

  it("passes on an honest description", () => {
    expect(detect({ ...base, description: "We build small autonomous survey drones for offshore wind inspection." }))
      .toBeNull();
  });

  it("catches the whole profile pasted in verbatim", () => {
    expect(detect({ ...base, description: idx.profile[won] }))
      .toContain("verbatim in the won fund's profile");
  });

  it("catches eight consecutive words lifted from the won fund's profile", () => {
    const why = detect({ ...base, description: `Our company does interesting work. ${stolen(won)}` });
    expect(why).toContain("won fund's profile");
  });

  it("catches text lifted from a SIBLING's profile", () => {
    // Not asserted as a SIBLING hit: siblings sit at 0.947 cosine and mostly
    // share the same sentences, so the won fund usually matches first. Either
    // reason is the same finding — the query is quoting the answer's family.
    expect(detect({ ...base, description: `Our company does interesting work. ${stolen(sibling)}` }))
      .not.toBeNull();
  });

  it("attributes it to the SIBLING when only the sibling carries the text", () => {
    // A hand-built index isolates the rule the corpus cannot: the won fund has
    // no profile at all, so a hit can only have come from the family.
    const only = makeLeakDetector({
      parent: { leaf_a: "regime", leaf_b: "regime" },
      profile: { leaf_b: "we support the deployment of tidal stream arrays in atlantic coastal waters" },
    });
    expect(only({ instrument: "leaf_a", description: "Deployment of tidal stream arrays in Atlantic coastal waters, phase two." }))
      .toContain("SIBLING");
    expect(only({ instrument: "leaf_a", description: "We make industrial enzymes for textile finishing." }))
      .toBeNull();
  });

  it("catches a poisoned row inside the real set, which is otherwise clean", () => {
    const victim = rows.find((r) => (r.description ?? "").trim()
      && r.descriptionSource !== "own_project_title_leaks"
      && (idx.profile[r.instrument] ?? "").split(" ").length > 40);
    expect(victim).toBeDefined();
    const poisoned = rows.map((r) => r === victim
      ? { ...r, description: `${r.description} ${stolen(r.instrument)}` } : r);
    expect(poisoned.filter((r) => detect(r)).length).toBe(1);
    expect(rows.filter((r) => detect(r)).length).toBe(0);
  });

  it("does not fire on a row whose leak the set already records", () => {
    expect(detect({ ...base, description: idx.profile[won],
                    descriptionSource: "own_project_title_leaks" })).toBeNull();
  });
});
