import fs from "fs";
import pg from "pg";
for (const p of ["/Users/asgermollergrimberg/Wincent/.env.local"]) {
  for (const l of fs.readFileSync(p,"utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g,"");
  }
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query(process.argv[2]);
console.log(JSON.stringify(rows).slice(0, 8000));
await c.end();
