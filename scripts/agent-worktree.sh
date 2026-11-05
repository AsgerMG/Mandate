#!/usr/bin/env bash
# Create an isolated git worktree for an agent WITHOUT copying a gigabyte.
#
# A bare worktree of this repo is 67 MB. An agent that then runs `npm ci` adds
# 659 MB of node_modules, and one that copies data/db.sqlite adds 615 MB more.
# Seventeen agents in one session filled a 228 GB disk to 2 GB free.
#
# Nothing about those two directories needs to be per-worktree: node_modules is
# derived from a lockfile the worktree already shares, and db.sqlite is a local
# cache of a corpus that lives in Railway Postgres. So both are symlinked to the
# primary checkout. A worktree made this way costs ~67 MB instead of ~1.3 GB.
#
#   scripts/agent-worktree.sh wsBD-my-workstream [base-branch]     (from the monorepo root)
#
# Remove YOUR OWN worktree when YOUR branch merges -- and only your own:
#   git worktree remove --force .claude/worktrees/wsBD-my-workstream
#
# NEVER remove a worktree you did not create. Another agent's worktree may hold
# uncommitted work that exists nowhere else, and --force bypasses git's
# dirty-tree protection silently. On 2026-08-08 an agent force-removed two
# worktrees belonging to other workstreams; the committed work survived only
# because both branches happened to be merged already. Cleaning up someone
# else's tree is not tidiness, it is an unrecoverable delete of work you cannot
# see.
set -euo pipefail

NAME="${1:?usage: agent-worktree.sh <branch-name> [base]}"
BASE="${2:-main}"
ROOT="$(git rev-parse --show-toplevel)"
DEST="$ROOT/.claude/worktrees/$NAME"

if [ -e "$DEST" ]; then
  echo "worktree already exists: $DEST" >&2
  exit 1
fi

git -C "$ROOT" worktree add -b "$NAME" "$DEST" "$BASE"

# node_modules: derived from a lockfile both trees share. A per-worktree copy is
# 659 MB of the same bytes, and `npm ci` takes 25 seconds to produce them.
# Per brain. Each line is skipped when the primary checkout has no such path.
link() { [ -e "$ROOT/$1" ] && mkdir -p "$(dirname "$DEST/$1")" && ln -s "$ROOT/$1" "$DEST/$1"; true; }

# node_modules / .venv: derived from lockfiles both trees share. A per-worktree
# copy is hundreds of MB of the same bytes.
link capital/website/frontend/node_modules
link policy/website/node_modules
link policy/.venv

# Env files are gitignored, so a fresh worktree has no credentials and every
# harness in it fails or -- worse -- silently skips. Symlinked rather than
# copied so a rotated key reaches every worktree at once, and so no secret is
# ever duplicated onto disk.
link capital/.env.local
link capital/website/frontend/.env.local
link policy/.env

# There is NO local corpus to link any more. Since 2026-11-05 every brain's data
# lives only in the Mandate Postgres, one schema per brain, and the env files
# above already point at it. A worktree that writes, writes to the real store:
# an experiment that mutates the corpus must say so in its brief.

echo "worktree ready: $DEST"
echo "  node_modules, .venv and env files are SYMLINKS to $ROOT"
echo "  size: $(du -sh "$DEST" 2>/dev/null | cut -f1) (a copied one is ~1.3G)"
echo "  remove with: git worktree remove --force $DEST"
echo
# ── THE ONE THING THE SYMLINK BREAKS, AND ITS WORKAROUND ────────────────────
# Turbopack resolves the real path of every root it is given and refuses one
# that escapes the project: "Symlink [project]/node_modules is invalid, it
# points out of the filesystem root". That is EXACTLY the symlink four lines
# up, so `npm run dev` and `npm run drive` cannot start in a worktree at all.
#
# Every agent told to render a page and look at it hits this, discovers it
# alone, and either works around it or quietly skips the looking -- which is the
# expensive outcome, because the last two founder-facing defects we shipped were
# both invisible to a typecheck and obvious in a browser at 390px.
#
# The webpack dev server has no such rule and starts in about a third of a
# second. Printed here rather than fixed in package.json because `npm run dev`
# in the PRIMARY checkout should stay on the fast path.
echo "  LOOKING AT A PAGE FROM HERE: \`npm run dev\` and \`npm run drive\` will NOT start."
echo "    Turbopack rejects the node_modules symlink above (\"points out of the"
echo "    filesystem root\"). Use:  npx next dev --webpack"
echo "    Do not skip the looking: it is where founder-facing defects show up."
