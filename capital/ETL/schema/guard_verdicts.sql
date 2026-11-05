-- The published-verdict channel.
--
-- ONE definition of the table, read as text by both writers: Python
-- (ETL/lib/guard_verdicts.py, inside the Railway container) and TypeScript
-- (web/scripts/guardVerdict.ts, on a machine with credentials).
-- Two hand-kept CREATE TABLEs is how the columns diverge; this file is the
-- schema, and neither writer carries its own copy.
--
-- ── The split it exists for ───────────────────────────────────────────────
-- A guard that needs the corpus can only run where the corpus is. Giving CI a
-- DATABASE_URL would widen a compromised workflow from "can read our code" to
-- "can read and write every award, company and fund we hold". So the guard runs
-- where the data already is, writes what it found here, and anything that wants
-- to assert on it reads the verdict rather than the database.
--
-- ── Why `detail` is a separate column from `summary` ──────────────────────
-- `summary` is written for publication: it is served, unauthenticated, by
-- /api/guards so that CI needs no credential of any kind. `detail` is not
-- served — the route does not select it. That is a structural guarantee rather
-- than a rule somebody has to remember: the endpoint cannot leak a column it
-- never reads. Anything a guard would rather not publish goes in `detail`.
CREATE TABLE IF NOT EXISTS guard_verdicts (
  id                BIGSERIAL PRIMARY KEY,
  guard             TEXT        NOT NULL,
  -- 'ok' | 'failed' | 'error'. 'error' is the guard itself falling over, which
  -- is not the same claim as the thing it guards being broken, and must not be
  -- reported as one.
  status            TEXT        NOT NULL,
  taken_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  produced_by       TEXT        NOT NULL,
  -- Hash of the code this verdict judges, over the paths the registry names for
  -- this guard. A verdict produced against a different hash is DRIFTED: it is a
  -- true statement about code that is no longer what we ship.
  code_fingerprint  TEXT        NOT NULL,
  -- One line, written to be read by whoever the failure wakes up. Public.
  summary           TEXT        NOT NULL DEFAULT '',
  -- Numbers the guard measured. Public. Keep it to figures that are either
  -- already on the site or are a pass/fail.
  metrics           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- Full output. NOT served.
  detail            TEXT        NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS guard_verdicts_guard_taken_idx
  ON guard_verdicts USING btree (guard, taken_at DESC);
