#!/usr/bin/env bash
#
# improve_loop.sh — EuroInvTracker continuous-improvement loop (PR-only).
#
# A self-contained "Ralph" loop: each iteration injects live repo state into the
# RALPH.md prompt, pipes it to a fresh `claude -p` context, and lets the agent
# complete + verify + commit ONE backlog item on an isolated branch. A human
# reviews the branch and opens/merges the PR — this script never pushes or merges.
#
# Usage:   scripts/improve_loop.sh [iterations] [branch]
# Example: scripts/improve_loop.sh 3
#          scripts/improve_loop.sh 5 improve/coverage-sweep
#
# Guardrails:
#   - refuses to run unless the working tree is clean
#   - refuses to run on main; creates/switches to an improve/* branch
#   - bounded by the iteration count (cost ceiling)
#   - never pushes, never opens/merges PRs (the agent prompt enforces the rest)
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ITERS="${1:-3}"
BRANCH="${2:-improve/$(date +%Y%m%d-%H%M)}"
RALPH="$ROOT/RALPH.md"

command -v claude >/dev/null 2>&1 || { echo "✗ 'claude' CLI not found on PATH."; exit 1; }
[ -f "$RALPH" ] || { echo "✗ RALPH.md not found at $RALPH"; exit 1; }

# Guardrail: clean tree only.
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Working tree is dirty. Commit or stash first — the loop needs a clean base."
  git status --short
  exit 1
fi

# Guardrail: never on main.
CURRENT="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT" = "main" ] || [ "$CURRENT" = "master" ]; then
  echo "→ On $CURRENT; creating isolated branch $BRANCH"
  git checkout -b "$BRANCH" || exit 1
elif [ "$CURRENT" != "$BRANCH" ]; then
  echo "→ Switching to $BRANCH (from $CURRENT)"
  git checkout -B "$BRANCH" || exit 1
fi

# Prompt body = everything after the closing '---' of the YAML frontmatter.
PROMPT_BODY="$(awk 'f>=2{print} /^---[[:space:]]*$/{f++}' "$RALPH")"

echo "════════════════════════════════════════════════════════════"
echo " EuroInvTracker improvement loop"
echo " branch: $BRANCH   iterations: $ITERS"
echo "════════════════════════════════════════════════════════════"

for i in $(seq 1 "$ITERS"); do
  echo ""
  echo "──── iteration $i/$ITERS ────────────────────────────────────"

  # Live feedback injected into the fresh context.
  LIVE="$(
    echo "## Live state (iteration $i/$ITERS)"
    echo ""
    echo "branch: $(git rev-parse --abbrev-ref HEAD)"
    echo ""
    echo "### git status"
    git status --short || true
    echo ""
    echo "### site-data freshness"
    python3 scripts/build_site_data.py --check 2>&1 || true
    echo ""
    echo "### stop-gate"
    python3 scripts/hooks/stop_gate.py 2>&1 || true
    echo ""
    echo "### backlog (top)"
    sed -n '1,80p' plans/improvement_backlog.md 2>&1 || true
  )"

  PROMPT="$LIVE

$PROMPT_BODY"

  # Fresh context each iteration. --dangerously-skip-permissions is required for
  # non-interactive runs; branch isolation + the prompt's hard rules contain it.
  printf '%s' "$PROMPT" | claude -p --dangerously-skip-permissions
  RC=$?
  if [ $RC -ne 0 ]; then
    echo "⚠ claude exited $RC on iteration $i — stopping the loop."
    break
  fi

  # If the agent left the tree dirty (a half-finished or reverted item), stop so a
  # human can look rather than compounding the mess.
  if [ -n "$(git status --porcelain)" ]; then
    echo "⚠ Working tree dirty after iteration $i (uncommitted changes). Stopping for review."
    git status --short
    break
  fi
done

echo ""
echo "════════════════════════════════════════════════════════════"
echo " Loop finished on $BRANCH. Commits this run:"
git log --oneline "main..$BRANCH" 2>/dev/null | sed 's/^/   /' || true
echo ""
echo " Next (human): review the branch, then open a PR:"
echo "   gh pr create --base main --head $BRANCH --fill"
echo "════════════════════════════════════════════════════════════"
