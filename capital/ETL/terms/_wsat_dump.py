import sys as _sys, os, json
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib")); break
from etl_env import DB
import psycopg2
pg = psycopg2.connect(os.environ["DATABASE_URL"]); c = pg.cursor()
c.execute("""SELECT fi.id, fi.name, length(fi.eligibility_text), fi.eligibility_source_url,
                    fi.eligibility_text
               FROM funding_instruments fi
              WHERE fi.country='FR' AND fi.is_framework=false
                AND fi.eligibility_text IS NOT NULL AND length(fi.eligibility_text)>0
                AND NOT EXISTS(SELECT 1 FROM eligibility_gates g WHERE g.instrument_id=fi.id)
              ORDER BY fi.name""")
rows = c.fetchall()
print(f"{len(rows)} rows\n")
out = []
for iid, name, ln, url, txt in rows:
    print(f"--- {iid} | {name} | {ln} chars | {url}")
    out.append({"id": iid, "name": name, "url": url, "text": txt})
_Path(sys.argv[1] if False else "/tmp/wsat_fr75.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
