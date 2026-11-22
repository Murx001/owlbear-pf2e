import { areaFromFoundry, KIND_PT, type Area, type AreaKind } from "./area";
import { COND_BY_KEY } from "./conditions";
import { parseConditionDurations, type DurationSpec } from "./durations";

/**
 * Dados de magias vindos do repositório foundryvtt/pf2e (arquivos JSON públicos, licença ORC).
 * Lemos salvaguarda, dano e os efeitos por grau de sucesso. Efeitos que não reconhecemos
 * continuam visíveis como texto para o mestre aplicar na mão.
 */
const RAW = "https://raw.githubusercontent.com/foundryvtt/pf2e/HEAD/packs/pf2e/spells";

export type Outcome = "critSuccess" | "success" | "failure" | "critFailure";
export type SaveStat = "fortitude" | "reflex" | "will";

export interface SpellCondition {
  key: string;
  value: number;
  /** Quanto tempo dura, lido do texto da magia (ausente se o texto não diz). */
  duration?: DurationSpec;
}

export interface SpellData {
  name: string;
  level: number;
  traits: string[];
  save?: { stat: SaveStat; basic: boolean };
  /** Magia que usa jogada de ataque de magia. */
  attack: boolean;
  damage: { formula: string; type: string; applyMod: boolean }[];
  /** Todo o "dano" da magia é cura. */
  healing: boolean;
  /** Área da magia (explosão, cone, linha, emanação), em pés. */
  area?: Area;
  /** Alcance da magia em pés ("30 feet" → 30; "touch" → 5). Ausente se não informado. */
  rangeFeet?: number;
  /** Dano a mais por "intensificar" (+N): fórmula somada a cada N ranks acima do base. */
  heightenInterval?: { interval: number; damage: string[] };
  outcomes: Record<Outcome, { text: string; conditions: SpellCondition[] }> | null;
  /** A magia dá PV temporários ("granting that creature 10 temporary Hit Points"). */
  tempHp?: { amount: number; step: number; perStep: number };
  /** Texto para o cartão "o que esta magia faz". */
  info: SpellInfo;
}

export interface SpellInfo {
  traits: string[];
  traditions: string[];
  /** "◆◆ (2 ações)", "↺ reação"… */
  actions: string;
  range?: string;
  area?: string;
  target?: string;
  duration?: string;
  requirements?: string;
  /** Parágrafos da descrição, em inglês (como no Foundry). */
  description: string[];
}

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Caminhos possíveis: o arquivo fica na pasta do rank base, ou em focus/ (às vezes por classe). */
function candidates(name: string, rank: number, className: string, focus: boolean): string[] {
  const slug = slugify(name);
  const ranks: string[] = [];
  if (rank > 0) for (let r = rank; r >= 1; r--) ranks.push(`spells/rank-${r}`);
  ranks.push("spells/cantrip");
  const focusDirs = ["focus", `focus/${slugify(className)}`, "focus/bard", "focus/magus", "focus/necromancer", "focus/summoner", "focus/wizard"];
  const dirs = focus ? [...focusDirs, ...ranks] : [...ranks, ...focusDirs];
  return [...new Set(dirs)].map((d) => `${RAW}/${d}/${slug}.json`);
}

/* ---------- limpeza do texto do Foundry ---------- */
function stripEnrichers(html: string): string {
  let out = "";
  let i = 0;
  while (i < html.length) {
    if (html[i] === "@" && /[A-Za-z]/.test(html[i + 1] ?? "")) {
      const open = html.indexOf("[", i);
      const kind = html.slice(i + 1, open);
      if (open > 0 && /^[A-Za-z]+$/.test(kind)) {
        let depth = 0;
        let j = open;
        for (; j < html.length; j++) {
          if (html[j] === "[") depth++;
          else if (html[j] === "]" && --depth === 0) break;
        }
        const inner = html.slice(open + 1, j);
        let end = j + 1;
        let label = "";
        if (html[end] === "{") {
          const close = html.indexOf("}", end);
          if (close > 0) {
            label = html.slice(end + 1, close);
            end = close + 1;
          }
        }
        if (label) out += label;
        else if (kind === "Damage") out += inner.replace(/\[([^\]]*)\]/g, " $1").replace(/[()]/g, "");
        else if (kind === "Check") out += "teste";
        else if (kind === "Template") out += "área";
        else out += inner.split(/[.|]/).pop() ?? "";
        i = end;
        continue;
      }
    }
    out += html[i++];
  }
  return out;
}

function toText(html: string): string {
  // Links de "efeito da magia" não são texto de regra: somem.
  const noEffects = html.replace(/@UUID\[Compendium\.pf2e\.spell-effects[^\]]*\](\{[^}]*\})?/g, "");
  return stripEnrichers(noEffects)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function conditionsIn(html: string): SpellCondition[] {
  const found = new Map<string, number>();
  const re = /@UUID\[Compendium\.pf2e\.conditionitems\.Item\.([^\]]+)\](?:\{([^}]*)\})?/g;
  // Troca cada condição reconhecida por um marcador, para ler depois a duração de cada uma no texto.
  const marked = html.replace(re, (whole: string, name: string, label?: string) => {
    let key = name.toLowerCase().replace(/\s+/g, "-");
    if (key === "flat-footed") key = "off-guard";
    if (!COND_BY_KEY.has(key)) return whole;
    const n = /(\d+)\s*$/.exec(label ?? "");
    const value = COND_BY_KEY.get(key)!.valued ? parseInt(n?.[1] ?? "1", 10) : 1;
    found.set(key, Math.max(found.get(key) ?? 0, value));
    return `⟦${key}|${value}⟧`;
  });
  const durations = parseConditionDurations(toText(marked));
  return [...found].map(([key, value]) => {
    const duration = durations.get(key);
    return duration ? { key, value, duration } : { key, value };
  });
}

function parseOutcomes(html: string): SpellData["outcomes"] {
  const re = /<strong>\s*(Critical Success|Success|Failure|Critical Failure)\s*<\/strong>/gi;
  const marks = [...html.matchAll(re)];
  if (marks.length === 0) return null;
  const map: Record<string, Outcome> = {
    "critical success": "critSuccess",
    success: "success",
    failure: "failure",
    "critical failure": "critFailure",
  };
  const out = {} as NonNullable<SpellData["outcomes"]>;
  const empty = { text: "", conditions: [] };
  for (const k of ["critSuccess", "success", "failure", "critFailure"] as Outcome[]) out[k] = empty;
  marks.forEach((m, i) => {
    const start = m.index! + m[0].length;
    let end = marks[i + 1]?.index ?? html.length;
    const hr = html.indexOf("<hr", start);
    if (hr !== -1 && hr < end) end = hr;
    const chunk = html.slice(start, end);
    out[map[m[1].toLowerCase()]] = { text: toText(chunk), conditions: conditionsIn(chunk) };
  });
  return out;
}

/** Descrição em parágrafos (quebra em </p>, <br> e <hr>). */
export function paragraphs(html: string): string[] {
  const marked = html.replace(/<\/p>|<br\s*\/?>|<hr[^>]*>/gi, "\u0001");
  return toText(marked)
    .split("\u0001")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Custo de ações do Foundry ("2", "reaction", "1 to 3") em texto curto. */
export function actionLabel(time: unknown): string {
  const t = String(time ?? "").toLowerCase().trim();
  if (t === "1") return "◆ (1 ação)";
  if (t === "2") return "◆◆ (2 ações)";
  if (t === "3") return "◆◆◆ (3 ações)";
  if (t === "reaction") return "↺ reação";
  if (t === "free") return "◇ ação livre";
  if (t === "1 to 2") return "◆ a ◆◆ (1 a 2 ações)";
  if (t === "1 to 3") return "◆ a ◆◆◆ (1 a 3 ações)";
  if (t === "2 to 3") return "◆◆ a ◆◆◆ (2 a 3 ações)";
  return t ? t.replace("minutes", "minutos").replace("minute", "minuto").replace("hours", "horas").replace("hour", "hora") : "—";
}

/** "Concede 10 PV temporários" e quanto sobe ao intensificar. Só texto simples; o resto fica para o mestre. */
function tempHpIn(html: string): SpellData["tempHp"] {
  const text = toText(html);
  const base = /(?:granting|grants|gain|gains|you gain)\s+(?:that creature\s+|the target\s+|it\s+)?(\d+)\s+temporary Hit Points/i.exec(text);
  if (!base) return undefined;
  const up = /Heightened\s*\(\+(\d+)\)[^.]*?temporary Hit Points (?:increase|increases) by (\d+)/i.exec(text);
  return {
    amount: parseInt(base[1], 10),
    step: up ? parseInt(up[1], 10) : 0,
    perStep: up ? parseInt(up[2], 10) : 0,
  };
}

/** PV temporários concedidos ao conjurar em `rank` (intensificar soma por degrau). */
export function tempHpAmount(spell: SpellData, rank: number): number | null {
  const t = spell.tempHp;
  if (!t) return null;
  const steps = t.step > 0 && rank > spell.level ? Math.floor((rank - spell.level) / t.step) : 0;
  return t.amount + steps * t.perStep;
}

/** "30 feet" → 30; "touch" → 5 (corpo a corpo); texto desconhecido → sem alcance. */
function rangeInFeet(value: unknown): number | undefined {
  const s = String(value ?? "").toLowerCase().trim();
  if (!s) return undefined;
  if (s.startsWith("touch")) return 5;
  const m = /^(\d+)\s*(feet|foot|ft)/.exec(s);
  return m ? parseInt(m[1], 10) : undefined;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseSpell(json: any): SpellData {
  const sys = json.system ?? {};
  const html: string = sys.description?.value ?? "";
  const save = sys.defense?.save;
  const damage = Object.values<any>(sys.damage ?? {})
    .filter((d) => typeof d?.formula === "string")
    .map((d) => ({
      formula: d.formula.replace(/\s+/g, ""),
      type: String(d.type ?? ""),
      applyMod: !!d.applyMod,
      heal: Array.isArray(d.kinds) && d.kinds.includes("healing") && !d.kinds.includes("damage"),
    }));
  const h = sys.heightening;
  return {
    name: json.name,
    level: sys.level?.value ?? 1,
    traits: sys.traits?.value ?? [],
    save: save?.statistic
      ? { stat: save.statistic as SaveStat, basic: !!save.basic }
      : undefined,
    attack: /spell attack roll/i.test(html) && !save?.statistic,
    damage: damage.map(({ formula, type, applyMod }) => ({ formula, type, applyMod })),
    healing: damage.length > 0 && damage.every((d) => d.heal),
    area: areaFromFoundry(sys.area) ?? undefined,
    rangeFeet: rangeInFeet(sys.range?.value),
    heightenInterval:
      h?.type === "interval" && h.damage
        ? { interval: h.interval ?? 1, damage: Object.values<string>(h.damage) }
        : undefined,
    outcomes: save?.statistic ? parseOutcomes(html) : null,
    tempHp: tempHpIn(html),
    info: {
      traits: sys.traits?.value ?? [],
      traditions: sys.traits?.traditions ?? [],
      actions: actionLabel(sys.time?.value),
      range: sys.range?.value || undefined,
      area: sys.area
        ? `${KIND_PT[sys.area.type as AreaKind] ?? sys.area.type ?? ""}${sys.area.value ? ` de ${sys.area.value} pés` : ""}`.trim() || undefined
        : undefined,
      target: sys.target?.value || undefined,
      duration: sys.duration?.value ? `${sys.duration.value}${sys.duration.sustained ? " (mantida)" : ""}` : undefined,
      requirements: sys.requirements || undefined,
      description: paragraphs(html),
    },
  };
}

/* ---------- busca com cache ---------- */
const memory = new Map<string, SpellData | null>();

function cacheGet(k: string): SpellData | undefined {
  try {
    const raw = localStorage.getItem(`pf2e.spell4:${k}`);
    return raw ? (JSON.parse(raw) as SpellData) : undefined;
  } catch {
    return undefined;
  }
}
function cacheSet(k: string, v: SpellData) {
  try {
    localStorage.setItem(`pf2e.spell4:${k}`, JSON.stringify(v));
  } catch {
    /* sem cache: busca de novo na próxima vez */
  }
}

/** Busca os dados da magia pelo nome em inglês (como vem do Pathbuilder). `null` se não achar. */
export async function fetchSpell(
  name: string,
  rank: number,
  className: string,
  focus = false,
): Promise<SpellData | null> {
  const key = `${slugify(name)}:${focus ? "f" : rank}`;
  if (memory.has(key)) return memory.get(key)!;
  const cached = cacheGet(key);
  if (cached) {
    memory.set(key, cached);
    return cached;
  }
  for (const url of candidates(name, rank, className, focus)) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = parseSpell(await res.json());
      memory.set(key, data);
      cacheSet(key, data);
      return data;
    } catch {
      /* tenta o próximo caminho */
    }
  }
  memory.set(key, null);
  return null;
}

/* ---------- dano ---------- */
export interface DamagePart {
  count: number;
  die: number;
  bonus: number;
  type: string;
}

const DICE = /^(\d+)d(\d+)(?:([+-])(\d+))?$/;

/** Dano da magia conjurada em `rank` (com intensificar). `null` se alguma fórmula não for simples. */
export function damageParts(spell: SpellData, rank: number, abilityMod = 0): DamagePart[] | null {
  const parts: DamagePart[] = [];
  for (const d of spell.damage) {
    const m = DICE.exec(d.formula);
    if (!m) return null;
    parts.push({
      count: parseInt(m[1], 10),
      die: parseInt(m[2], 10),
      // Truques como Arco Elétrico somam o modificador de conjuração ao dano.
      bonus: (m[3] ? (m[3] === "-" ? -1 : 1) * parseInt(m[4], 10) : 0) + (d.applyMod ? abilityMod : 0),
      type: d.type,
    });
  }
  const h = spell.heightenInterval;
  if (h && rank > spell.level) {
    const steps = Math.floor((rank - spell.level) / h.interval);
    h.damage.forEach((f, i) => {
      const m = DICE.exec(f.replace(/\s+/g, ""));
      if (!m || !parts[i]) return;
      if (parseInt(m[2], 10) === parts[i].die) parts[i].count += parseInt(m[1], 10) * steps;
      parts[i].bonus += m[3] ? (m[3] === "-" ? -1 : 1) * parseInt(m[4], 10) * steps : 0;
    });
  }
  return parts;
}
