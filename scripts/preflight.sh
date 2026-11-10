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
# (uv sync --frozen, exactly as CI), web CI without the build, capital CI from
# its own workflow file. NOT covered:
# capital CI (its ETL tests need a throwaway Postgres; they run there). Skip
# once, deliberately: SKIP_PREFLIGHT=1 git push
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
if touched '^web/|^mandate/vocabulary/|^mandate/profile/|^\.github/workflows/web-ci'; then
  # web-ci.yml minus the build and the corpus prebuild (it uses the site data
  # already on disk). Needs web/node_modules.
  # A worktree has neither node_modules nor the generated site data
  # (web/public/data, gitignored, built by the corpus prebuild): borrow both
  # from the main checkout for the duration of the check, as CI has its own.
  MAIN=$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')
  BORROWED=""
  if [ ! -e web/node_modules ] && [ -d "$MAIN/web/node_modules" ]; then
    ln -s "$MAIN/web/node_modules" web/node_modules; BORROWED="web/node_modules"
  fi
  mkdir -p web/public/data
  for f in "$MAIN"/web/public/data/*; do   # file by file: some may be tracked here
    [ -e "$f" ] || continue
    t="web/public/data/$(basename "$f")"
    if [ ! -e "$t" ]; then ln -s "$f" "$t"; BORROWED="$BORROWED $t"; fi
  done
  if [ ! -f web/public/data/instrument_terms.json ]; then
    echo "preflight: web CI needs the site data once: python3 capital/website/build/build_site_data.py (in the main checkout, ~5 min)"
    FAIL=1
  else
    run_web() {
      (cd web && npx tsc --noEmit && npx vitest run && npx eslint . &&
        npx tsx scripts/check_revalidate_literal.ts && npx tsx scripts/check_rendered_numbers.ts &&
        NO_PG=1 npx tsx scripts/check_vocabularies.ts && npx tsx scripts/check_client_boundary.ts)
    }
    step "web CI (no build)" run_web
  fi
  for d in $BORROWED; do rm -f "$d"; done
fi
if touched '^capital/|^mandate/vocabulary/|^\.github/workflows/capital-ci|^scripts/run_ci_job'; then
  # capital CI's own run steps, read from the workflow (scripts/run_ci_job.py),
  # in a clean copy of HEAD: no .env.local, so nothing can reach production,
  # exactly like CI. Needs Homebrew postgresql@18 + pgvector for its database.
  run_capital() {
    local tmp; tmp=$(mktemp -d)/c
    git worktree add -q --detach "$tmp" HEAD || return 1
    (cd "$tmp" && uv run -q --isolated --no-project --python 3.11 \
        --with-requirements capital/requirements.txt --with pyyaml \
        python scripts/run_ci_job.py .github/workflows/capital-ci.yml etl)
    local rc=$?; git worktree remove --force "$tmp"; return $rc
  }
  step "capital CI (clean copy)" run_capital
fi
if touched '^policy/|^mandate/'; then
  run_policy() { (cd policy && uv sync -q --frozen --extra dev --python 3.12 && uv run --frozen pytest -q -x); }
  step "policy CI" run_policy
fi
[ "$FAIL" = 0 ] || { echo "preflight: FAILED. Fix it, or push anyway with SKIP_PREFLIGHT=1 (it will fail in CI)."; exit 1; }
