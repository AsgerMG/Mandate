"""WS-AT baseline: French gate coverage, read out of Postgres."""
import sys as _sys, os
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib")); break
from etl_env import DB
import psycopg2, sqlite3

CC = _sys.argv[1] if len(_sys.argv) > 1 else 'FR'
pg = psycopg2.connect(os.environ["DATABASE_URL"]); c = pg.cursor()
def q(sql, p=()):
    c.execute(sql, p); return c.fetchall()

print(f"=== Postgres, country={CC} ===")
for label, sql in [
  ("instruments (non-framework)", "SELECT COUNT(*) FROM funding_instruments WHERE country=%s AND is_framework=false"),
  ("  with eligibility_text", "SELECT COUNT(*) FROM funding_instruments WHERE country=%s AND is_framework=false AND eligibility_text IS NOT NULL AND length(eligibility_text)>0"),
  ("  with ANY gate", "SELECT COUNT(DISTINCT g.instrument_id) FROM eligibility_gates g JOIN funding_instruments fi ON fi.id=g.instrument_id WHERE fi.country=%s AND fi.is_framework=false"),
  ("  with a CITED gate", "SELECT COUNT(DISTINCT g.instrument_id) FROM eligibility_gates g JOIN funding_instruments fi ON fi.id=g.instrument_id WHERE fi.country=%s AND fi.is_framework=false AND g.verification_level IN ('llm_cited','llm_2pass','human_verified')"),
  ("  with an ENCODED gate", "SELECT COUNT(DISTINCT g.instrument_id) FROM eligibility_gates g JOIN funding_instruments fi ON fi.id=g.instrument_id WHERE fi.country=%s AND fi.is_framework=false AND g.value_spec IS NOT NULL"),
  ("  text AND a gate", "SELECT COUNT(*) FROM funding_instruments fi WHERE fi.country=%s AND fi.is_framework=false AND fi.eligibility_text IS NOT NULL AND length(fi.eligibility_text)>0 AND EXISTS(SELECT 1 FROM eligibility_gates g WHERE g.instrument_id=fi.id)"),
  ("  text AND NO gate  <- the gap", "SELECT COUNT(*) FROM funding_instruments fi WHERE fi.country=%s AND fi.is_framework=false AND fi.eligibility_text IS NOT NULL AND length(fi.eligibility_text)>0 AND NOT EXISTS(SELECT 1 FROM eligibility_gates g WHERE g.instrument_id=fi.id)"),
  ("  text AND no ENCODED gate", "SELECT COUNT(*) FROM funding_instruments fi WHERE fi.country=%s AND fi.is_framework=false AND fi.eligibility_text IS NOT NULL AND length(fi.eligibility_text)>0 AND NOT EXISTS(SELECT 1 FROM eligibility_gates g WHERE g.instrument_id=fi.id AND g.value_spec IS NOT NULL)"),
]:
    print(f"{label:34} {q(sql,(CC,))[0][0]:>6}")

print("\ngates by verification_level:")
for lvl, n, enc in q("""SELECT g.verification_level, COUNT(*), COUNT(g.value_spec)
      FROM eligibility_gates g JOIN funding_instruments fi ON fi.id=g.instrument_id
     WHERE fi.country=%s AND fi.is_framework=false GROUP BY 1 ORDER BY 2 DESC""", (CC,)):
    print(f"  {str(lvl):20} {n:5}  encoded={enc}")
print("\ngates by gate_role:")
for r, n in q("""SELECT COALESCE(g.gate_role,'(NULL)'), COUNT(*)
      FROM eligibility_gates g JOIN funding_instruments fi ON fi.id=g.instrument_id
     WHERE fi.country=%s AND fi.is_framework=false GROUP BY 1 ORDER BY 2 DESC""", (CC,)):
    print(f"  {r:20} {n:5}")

print("\n=== SQLite mirror (same country) ===")
s = sqlite3.connect(DB)
for label, sql in [
  ("  with eligibility_text", "SELECT COUNT(*) FROM funding_instruments WHERE country=? AND is_framework=0 AND eligibility_text IS NOT NULL AND length(eligibility_text)>0"),
  ("  with ANY gate", "SELECT COUNT(DISTINCT g.instrument_id) FROM eligibility_gates g JOIN funding_instruments fi ON fi.id=g.instrument_id WHERE fi.country=? AND fi.is_framework=0"),
  ("  text AND NO gate", "SELECT COUNT(*) FROM funding_instruments fi WHERE fi.country=? AND fi.is_framework=0 AND fi.eligibility_text IS NOT NULL AND length(fi.eligibility_text)>0 AND NOT EXISTS(SELECT 1 FROM eligibility_gates g WHERE g.instrument_id=fi.id)"),
]:
    print(f"{label:34} {s.execute(sql,(CC,)).fetchone()[0]:>6}")
