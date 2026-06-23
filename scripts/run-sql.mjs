// Executa um arquivo .sql no projeto Supabase via Management API.
// Uso: SB_PAT=token SB_REF=ref node scripts/run-sql.mjs caminho/arquivo.sql
import fs from "node:fs";

const file = process.argv[2];
const pat = process.env.SB_PAT;
const ref = process.env.SB_REF;

if (!file || !pat || !ref) {
  console.error("Uso: SB_PAT=... SB_REF=... node scripts/run-sql.mjs arquivo.sql");
  process.exit(1);
}

const sql = fs.readFileSync(file, "utf8");

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  }
);

const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text.slice(0, 3000));
process.exit(res.ok ? 0 : 1);
