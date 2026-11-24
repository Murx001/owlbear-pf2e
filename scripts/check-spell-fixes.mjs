// Confere public/spell-fixes: o índice bate com os arquivos e todas as fórmulas têm formato válido.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../public/spell-fixes/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const KEY = /^(\d+@\d+|\d+|\*)$/;
const PART = /^\d+d\d+([+-]\d+)?(\s+\S.*)?$/;
const errors = [];
const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
if (!Number.isInteger(index.version)) errors.push("index.json: 'version' deve ser inteiro.");
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5));
for (const s of index.spells) if (!files.includes(s)) errors.push(`índice cita '${s}', mas não há ${s}.json`);
for (const f of files) {
  if (!index.spells.includes(f)) errors.push(`${f}.json existe, mas não está no índice`);
  let e;
  try {
    e = JSON.parse(readFileSync(join(dir, `${f}.json`), "utf8"));
  } catch (err) {
    errors.push(`${f}.json: JSON inválido (${err.message})`);
    continue;
  }
  if (typeof e.name !== "string") errors.push(`${f}.json: falta 'name'`);
  for (const [k, v] of Object.entries(e.formulas ?? {})) {
    if (!KEY.test(k)) errors.push(`${f}.json: chave inválida '${k}' (use "ações@rank", "ações" ou "*")`);
    for (const p of String(v).split(";")) if (!PART.test(p.trim())) errors.push(`${f}.json: fórmula inválida em '${k}': "${p.trim()}"`);
  }
  if (!e.formulas || Object.keys(e.formulas).length === 0) errors.push(`${f}.json: sem fórmulas`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok: ${index.spells.length} magia(s) com correção.`);
