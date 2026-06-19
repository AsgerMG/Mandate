"""Analysis harness for designing a deterministic merge pipeline (read-only).

Quantifies the precision/recall of candidate deterministic signals against the
live corpus so the pipeline design is grounded in evidence, not guesswork:
  A. PIC equality (same EU Participant ID -> same entity, even across names)
  B. Leading distinctive bigram (first two brand tokens) -> brand family
  C. Internal-suffix stripping ("Novo Nordisk A/S - E1" -> "Novo Nordisk A/S")
Prints sizes + samples (including known false-bridge traps) for review.
"""
import re
import sqlite3
import sys
from collections import defaultdict

sys.path.insert(0, "scripts")
from merge_companies import dedup_key, norm_tokens, DB  # noqa: E402

con = sqlite3.connect(DB)
rows = con.execute("""
    SELECT DISTINCT c.id, c.canonical_name, c.country, c.pic, c.parent_group
    FROM companies c JOIN public_funding_events e ON e.company_id = c.id
""").fetchall()
print(f"event-bearing companies analysed: {len(rows)}\n")

# ── A. PIC equality across different names ────────────────────────────────────
pic_groups = defaultdict(list)
for cid, name, country, pic, pg in rows:
    if pic:
        pic_groups[pic].append(name)
pic_xname = {p: v for p, v in pic_groups.items() if len({dedup_key(n) for n in v}) > 1}
print("A. PIC equality")
print(f"   PIC groups spanning >1 distinct normalised name: {len(pic_xname)} "
      f"(+{sum(len(v) for v in pic_xname.values()) - len(pic_xname)} merges)")
for p, v in sorted(pic_xname.items(), key=lambda x: -len(x[1]))[:4]:
    print(f"     {p}: {sorted(set(v))[:3]}")

# ── B. Leading distinctive bigram ─────────────────────────────────────────────
def bigram(name):
    t = norm_tokens(name)
    return tuple(t[:2]) if len(t) >= 2 else None

big = defaultdict(list)
for cid, name, country, pic, pg in rows:
    b = bigram(name)
    if b:
        big[b].append((name, country))
multi = {b: v for b, v in big.items() if len({dedup_key(n) for n, _ in v}) > 1}
covered = sum(len(v) for v in multi.values())
print(f"\nB. Leading distinctive bigram: {len(multi)} families spanning >1 name, "
      f"covering {covered} entities")
print("   largest 25 (size | distinct-names | countries | bigram | sample):")
for b, v in sorted(multi.items(), key=lambda x: -len(x[1]))[:25]:
    names = sorted({n for n, _ in v})
    ctys = sorted({c for _, c in v if c})
    print(f"     {len(v):4} {len(names):3} {len(ctys)}c  {'+'.join(b):24} {names[0][:34]}")

# trap check: do the LLM's false bridges stay SEPARATE under bigram?
print("\n   false-bridge trap check (should be DIFFERENT bigrams):")
for probe in ["josef", "aqua", "giuseppe", "biotech", "partner"]:
    bs = {b for b in big if probe in b}
    members = sum(len(big[b]) for b in bs)
    print(f"     token '{probe}': {len(bs)} distinct bigrams over {members} firms "
          f"(few-per-bigram = robust)")

# ── C. Internal-suffix stripping ──────────────────────────────────────────────
SUFFIX = re.compile(r"\s*[-–]\s*[^-–]{1,14}$")
def stripped_key(name):
    s = name
    for _ in range(2):  # strip up to two trailing "- code" segments
        s2 = SUFFIX.sub("", s)
        if s2 == s:
            break
        s = s2
    return dedup_key(s)

raw_key = {}
strip_key = defaultdict(list)
for cid, name, country, pic, pg in rows:
    raw_key[cid] = dedup_key(name)
    strip_key[stripped_key(name)].append((cid, name))
# new merges = stripped groups with >1 member that did NOT already share a raw key
new = 0
sample = []
for k, v in strip_key.items():
    if len(v) > 1 and len({raw_key[c] for c, _ in v}) > 1:
        new += len(v) - 1
        if len(sample) < 6:
            sample.append((k, [n for _, n in v][:4]))
print(f"\nC. Internal-suffix stripping: ~{new} additional merges beyond Layer 1")
for k, names in sample:
    print(f"     [{k[:26]}] {names}")
