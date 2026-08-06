import os,sys,psycopg2,re
env={}
for line in open('/Users/asgermollergrimberg/Wincent/.env.local'):
    line=line.strip()
    if line.startswith('#') or '=' not in line: continue
    k,v=line.split('=',1); env[k]=v.strip().strip('"').strip("'")
conn=psycopg2.connect(env['DATABASE_URL'])
cur=conn.cursor()
q=sys.argv[1]
cur.execute(q)
cols=[d[0] for d in cur.description]
print(" | ".join(cols))
for r in cur.fetchall():
    print(" | ".join("" if x is None else str(x)[:90] for x in r))
