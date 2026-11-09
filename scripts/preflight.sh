#!/usr/bin/env bash
# Runs, on this laptop, the same checks GitHub and Vercel run, for the parts a
# push changes, in environments built from the same declarations CI uses. A
# failure stops the push here instead of in the owner's inbox.
#
#   bash scripts/preflight.sh            # against origin/main
#   (runs automatically as the pre-push hook: git config core.hooksPath .githooks)
#
# Covered: Vercel config (what failed every deploy on 9 Nov), mandate-ci (clean
# env from mandate/pyproject.toml [test]: what failed on anthropic), policy CI
# (uv sync --frozen, exactly as CI). NOT covered: capital CI (24 min; its own
# checks run there). Skip once, deliberately: SKIP_PREFLIGHT=1 git push
set -uo pipefail
[ "${SKIP_PREFLIGHT:-0}" = 1 ] && { echo "preflight: skipped (SKIP_PREFLIGHT=1)"; exit 0; }
cd "$(git rev-parse --show-toplevel)"
BASE=$(git merge-base HEAD origin/main 2>/dev/null || echo HEAD^)
CHANGED=$(git diff --name-only "$BASE" HEAD; git diff --name-only HEAD)
touched() { echo "$CHANGED" | /usr/bin/grep -qE "$1"; }
FAIL=0
step() { printf 'preflight: %-34s' "$1"; shift; if out=$("$@" 2>&1); then echo ok; else echo FAILED; echo "$out" | tail -15; FAIL=1; fi; }

if touched '^web/vercel\.json|^web/scripts/vercel_ignore'; then
  step "vercel.json" python3 -c '
import json, sys
d = json.load(open("web/vercel.json"))
ic = d.get("ignoreCommand", "")
assert len(ic) <= 256, f"ignoreCommand is {len(ic)} chars; Vercel rejects > 256"
'
fi
if touched '^mandate/|\.py$|^\.github/workflows/mandate-ci'; then
  run_mandate() {
    PYTHONPATH=. uv run --isolated --no-project --python 3.12 --with './mandate[test]' sh -c '
      python mandate/embedding/check_boundary.py && python mandate/vocabulary/check.py &&
      python mandate/profile/fixtures.py --check && python -m pytest mandate/tests -q -x'
  }
  step "mandate-ci (clean env)" run_mandate
fi
if touched '^policy/|^mandate/'; then
  run_policy() { (cd policy && uv sync -q --frozen --extra dev --python 3.12 && uv run --frozen pytest -q -x); }
  step "policy CI" run_policy
fi
[ "$FAIL" = 0 ] || { echo "preflight: FAILED. Fix it, or push anyway with SKIP_PREFLIGHT=1 (it will fail in CI)."; exit 1; }
