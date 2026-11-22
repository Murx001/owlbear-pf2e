/**
 * Imunidades, fraquezas e resistências (Player Core, "Immunity, Weakness, and Resistance").
 * Ordem: o dano já vem multiplicado (crítico, salvaguarda básica); depois vêm imunidade,
 * fraqueza (soma) e resistência (subtrai, mínimo 0). Cada fraqueza/resistência vale uma vez por
 * golpe; resistências repetidas ao mesmo tipo valem só a maior.
 */
export interface Defenses {
  /** Textos do Foundry: "fire", "critical-hits"… */
  immunities?: string[];
  /** "fire 5", "physical 10 (except silver)"… */
  resistances?: string[];
  weaknesses?: string[];
}

const ALIASES: Record<string, string> = {
  s: "slashing",
  p: "piercing",
  b: "bludgeoning",
  cortante: "slashing",
  perfurante: "piercing",
  contundente: "bludgeoning",
  fogo: "fire",
  frio: "cold",
  ácido: "acid",
  acido: "acid",
  eletricidade: "electricity",
  sônico: "sonic",
  sonico: "sonic",
  veneno: "poison",
  mental: "mental",
  força: "force",
  forca: "force",
  vitalidade: "vitality",
  vazio: "void",
  físico: "physical",
  fisico: "physical",
  energia: "energy",
  precisão: "precision",
  precisao: "precision",
};

const PHYSICAL = new Set(["bludgeoning", "piercing", "slashing"]);
const ENERGY = new Set(["acid", "cold", "electricity", "fire", "sonic", "force", "vitality", "void", "positive", "negative"]);

const norm = (s: string) => {
  const k = s.trim().toLowerCase().replace(/\s+/g, "-");
  return ALIASES[k] ?? k;
};

/** Tipos de dano de um texto como "fire", "slashing/fire" ou "fire, cold". */
export function damageTypeList(types: string): string[] {
  return types
    .split(/[\/,+]|\be\b|\band\b/i)
    .map(norm)
    .filter(Boolean);
}

interface Entry {
  type: string;
  value: number;
  except: string[];
}

/** "physical 10 (except silver)" → {type:"physical", value:10, except:["silver"]}. */
export function parseEntry(text: string): Entry | null {
  const m = /^\s*(.+?)(?:\s+(\d+))?\s*(?:\((?:except\s+)?([^)]*)\))?\s*$/i.exec(text);
  if (!m) return null;
  const type = norm(m[1]);
  if (!type) return null;
  const except = (m[3] ?? "")
    .split(/,|\bor\b|\bou\b/i)
    .map(norm)
    .filter(Boolean);
  return { type, value: m[2] ? Number(m[2]) : 0, except };
}

function matches(entryType: string, damageTypes: string[]): boolean {
  if (entryType === "all" || entryType === "all-damage") return true;
  if (entryType === "physical") return damageTypes.some((t) => PHYSICAL.has(t));
  if (entryType === "energy") return damageTypes.some((t) => ENERGY.has(t));
  return damageTypes.includes(entryType);
}

/** Entradas que valem para o dano; a mesma categoria/tipo repetida fica com a maior. */
function applicable(list: string[] | undefined, damageTypes: string[]) {
  const best = new Map<string, Entry>();
  for (const text of list ?? []) {
    const e = parseEntry(text);
    if (!e || e.value <= 0) continue;
    // Exceção que é um tipo de dano presente (ex.: "physical 10 (except bludgeoning)") não vale.
    if (e.except.some((x) => damageTypes.includes(x))) continue;
    if (!matches(e.type, damageTypes)) continue;
    const old = best.get(e.type);
    if (!old || e.value > old.value) best.set(e.type, e);
  }
  return [...best.values()];
}

export interface Adjusted {
  /** Dano que de fato entra nos PV. */
  final: number;
  /** Explicação em PT-BR: "resistência fogo 5: −5". */
  notes: string[];
  /** Houve qualquer ajuste. */
  changed: boolean;
}

/**
 * `total`: dano já multiplicado. `types`: tipos do dano ("fire", "slashing/fire"); vazio = sem ajuste.
 * `crit`: o dano é de um acerto crítico (o dobro); imunidade a críticos o desfaz.
 */
export function adjustDamage(total: number, types: string, defenses: Defenses | undefined, crit = false): Adjusted {
  const out: Adjusted = { final: total, notes: [], changed: false };
  if (!defenses || total <= 0) return out;
  const list = damageTypeList(types);

  // Imunidade a acertos críticos: o dano crítico volta ao normal.
  if (crit && (defenses.immunities ?? []).some((i) => norm(i) === "critical-hits")) {
    out.final = Math.floor(out.final / 2);
    out.notes.push("imune a acertos críticos: dano normal");
  }
  if (list.length === 0) {
    out.changed = out.final !== total;
    return out;
  }

  // Imunidade: só zera se TODOS os tipos do dano são imunes (a divisão por tipo não é conhecida).
  const imm = (defenses.immunities ?? []).map(norm).filter((i) => i !== "critical-hits");
  const covered = list.filter((t) => imm.some((i) => matches(i, [t])));
  if (covered.length === list.length) {
    out.notes.push(`imunidade ${covered.join("/")}: dano ignorado`);
    out.final = 0;
    out.changed = true;
    return out;
  }
  if (covered.length > 0) out.notes.push(`imune a ${covered.join("/")}, mas o dano tem outro tipo: sem ajuste por imunidade`);

  // Fraquezas somam; depois, as resistências subtraem.
  for (const w of applicable(defenses.weaknesses, list)) {
    out.final += w.value;
    out.notes.push(`fraqueza ${w.type} ${w.value}: +${w.value}`);
  }
  for (const r of applicable(defenses.resistances, list)) {
    const cut = Math.min(out.final, r.value);
    out.final -= cut;
    out.notes.push(`resistência ${r.type} ${r.value}: −${cut}`);
  }
  out.changed = out.final !== total || out.notes.length > 0;
  return out;
}

/** Texto para quem não pode saber os números (alvo secreto). */
export const SECRET_ADJUST = "o dano foi ajustado pelas defesas do alvo";
