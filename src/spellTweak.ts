import { damageParts, slugify, type DamagePart, type SpellData } from "./spellData";
import type { SpellCast } from "./saveSpell";
import { fixFormula } from "./spellFixes";

/**
 * Dano de magia que o jogador ajusta na caixa "deseja rolar?": número de ações gastas e fórmula editável.
 * O ajuste fica guardado no navegador, por magia + rank + ações, e volta sozinho na próxima vez.
 */

const KEY = "pf2e.spell-tweaks";
const FORMULA = /^(\d+)d(\d+)(?:([+-])(\d+))?$/;

/** Magias em que cada ação gasta repete o dano (um projétil por ação). Só as que conferi. */
const REPEAT_PER_ACTION = new Set(["force-barrage", "magic-missile"]);

/** "1 a 3 ações" / "2 a 3 ações" no texto do custo; `null` se o custo é fixo. */
export function actionRange(spell: SpellData): [number, number] | null {
  const m = /(\d)\s*a\s*(?:◆+\s*)?(\d)\s*ações/.exec(spell.info.actions) ?? /\((\d) a (\d) ações\)/.exec(spell.info.actions);
  if (!m) return null;
  const lo = parseInt(m[1], 10);
  const hi = parseInt(m[2], 10);
  return hi > lo ? [lo, hi] : null;
}

/** "1d4+1 force; 1d4+1 force" → partes. `null` se alguma parte não é uma fórmula simples. */
export function parseFormulas(text: string, fallbackType = ""): DamagePart[] | null {
  const parts: DamagePart[] = [];
  for (const raw of text.split(/[;]+/)) {
    const piece = raw.trim();
    if (!piece) continue;
    const m = /^(\S+)(?:\s+(.+))?$/.exec(piece);
    if (!m) return null;
    const d = FORMULA.exec(m[1].replace(/\s+/g, ""));
    if (!d) return null;
    parts.push({
      count: parseInt(d[1], 10),
      die: parseInt(d[2], 10),
      bonus: d[3] ? (d[3] === "-" ? -1 : 1) * parseInt(d[4], 10) : 0,
      type: m[2] ?? fallbackType,
    });
  }
  return parts.length > 0 ? parts : null;
}

export function formatParts(parts: DamagePart[]): string {
  return parts
    .map((p) => `${p.count}d${p.die}${p.bonus === 0 ? "" : p.bonus > 0 ? `+${p.bonus}` : String(p.bonus)}${p.type ? ` ${p.type}` : ""}`)
    .join("; ");
}

/** Dano da magia: a fórmula editada, se houver; senão o do Foundry com intensificar. */
export function castParts(cast: SpellCast): DamagePart[] | null {
  if (cast.formula) {
    const edited = parseFormulas(cast.formula, cast.spell.damage[0]?.type ?? "");
    if (edited) return edited;
  }
  return damageParts(cast.spell, cast.rank, cast.abilityMod);
}

/** Fórmula padrão para N ações: a do Foundry, repetida por ação nas magias de projéteis. */
export function defaultFormula(spell: SpellData, rank: number, abilityMod: number, actions: number): string | null {
  const fix = fixFormula(spell.name, rank, actions); // a correção do repositório vem antes da tabela
  if (fix) return fix;
  const base = damageParts(spell, rank, abilityMod);
  if (!base) return null;
  const n = REPEAT_PER_ACTION.has(slugify(spell.name)) ? Math.max(1, actions) : 1;
  const all: DamagePart[] = [];
  for (let i = 0; i < n; i++) all.push(...base.map((p) => ({ ...p })));
  return formatParts(all);
}

/* ---------- guardado no navegador ---------- */
const tweakKey = (spell: SpellData, rank: number, actions: number) => `${slugify(spell.name)}|${rank}|${actions}`;

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function savedFormula(spell: SpellData, rank: number, actions: number): string | undefined {
  return load()[tweakKey(spell, rank, actions)];
}

export function saveFormula(spell: SpellData, rank: number, actions: number, formula: string | null) {
  const all = load();
  const k = tweakKey(spell, rank, actions);
  if (formula === null) delete all[k];
  else all[k] = formula;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* sem armazenamento: o ajuste vale só desta vez */
  }
}
