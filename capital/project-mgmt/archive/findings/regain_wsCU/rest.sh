#!/usr/bin/env bash
# wsCU sections 2-4 -- the sixth row, the memo/screen gap, and the four buckets,
# all re-measured on the real founder. SEQUENTIAL, for the reason in blend.sh.
#
# The OLD arm reproduces wsCR's and wsCQ's own fictional-founder numbers on
# THIS code, so a difference below is the founder and not the harness.
set -e
ROOT=/Users/asgermollergrimberg/Wincent/.claude/worktrees/wsCU-regain
OUT="$ROOT/project-mgmt/findings/regain_wsCU"
cd "$ROOT/website/frontend"
mkdir -p /tmp/wscu

OLD="IDENTITY=anonymous OWN_HISTORY=withheld CAPITAL=pinned ANSWERS=off"

m () { name=$1; script=$2; shift 2; echo "=== $name ==="
  env "$@" npx tsx "scripts/$script" > "$OUT/$name.txt" 2>&1 || echo "FAILED $name"
  grep -aE "^ranker:|SCREEN@|MEMO@[56] |MEMO@6 |gain of the sixth|██|^  1 |^  2 |^  3 |^  4 |ORACLE" "$OUT/$name.txt" || true
}

# ── section 2/3: the sixth row and MEMO@6 vs SCREEN@6 ──────────────────────
m MEMO_tune_old    _wscu_memo.ts SPLIT=tune    N=250 $OLD
m MEMO_tune_new    _wscu_memo.ts SPLIT=tune    N=250
m MEMO_hold_old    _wscu_memo.ts SPLIT=holdout N=250 $OLD
m MEMO_hold_new    _wscu_memo.ts SPLIT=holdout N=250

# ── section 4: the four autopsy buckets ───────────────────────────────────
# `_wsci_autopsy.ts` already replays through `founderIntake` (it is in STRICT),
# so the only thing that changes here is the policy.
m AUT_tune_new  _wsci_autopsy.ts SPLIT=tune    N=250
m AUT_hold_new  _wsci_autopsy.ts SPLIT=holdout N=250
echo "=== REST DONE ==="
