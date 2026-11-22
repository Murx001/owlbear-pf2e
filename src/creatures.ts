import { acWithConditions, withConditions } from "./conditions";
import type { Durations } from "./durations";
/**
 * Criaturas do mestre. Ficam só no navegador do mestre (localStorage): CA, PV e salvaguardas
 * nunca vão para a sala. Para os jogadores só segue um estado grosseiro (Ileso, Ferido…).
 */
const STORE = "pf2e.creatures";

import type { CreatureLink } from "./token";

/** O que os jogadores veem desta criatura. Tudo visível, a menos que o mestre desligue (engrenagem). */
export interface CreatureShow {
  /** O token aparece no mapa para os jogadores (padrão: escondido). */
  token?: boolean;
  /** O nome real; desligado mostra "Criatura" (padrão: escondido). */
  name?: boolean;
  /** Barra e estado de PV (Ileso, Ferido…), sem números (padrão: visível). */
  bar?: boolean;
  /** PV em números, como 12/20 (padrão: escondido). */
  numbers?: boolean;
  /** Condições nas fichinhas do token (padrão: escondidas). */
  conditions?: boolean;
  /** A CA, no escudinho do token (padrão: escondida). */
  ac?: boolean;
}

/** Visibilidade já com os padrões: tudo escondido, menos a barra de PV. */
export function showOf(c: Pick<Creature, "show">): Required<CreatureShow> {
  const s = c.show ?? {};
  return {
    token: s.token ?? false,
    name: s.name ?? false,
    bar: s.bar ?? true,
    numbers: s.numbers ?? false,
    conditions: s.conditions ?? false,
    ac: s.ac ?? false,
  };
}

export interface Creature {
  id: string;
  name: string;
  ac: number;
  hpMax: number;
  hp: number;
  temp: number;
  fort: number;
  ref: number;
  will: number;
  perception: number; // também usada na iniciativa
  notes: string;
  /** Condições aplicadas por magias (só marcadores; o mestre decide o efeito). */
  conditions?: Record<string, number>;
  /** Tempo restante das condições com duração contada na aba Combate. */
  durations?: Durations;
  /* ---- bestiário (todos opcionais) ---- */
  level?: number;
  size?: string;
  speed?: number;
  /** Traços ("goblin", "humanoid"…), usados para filtrar. */
  traits?: string[];
  /** Pasta do bestiário (campanha, encontro, livro). */
  group?: string;
  favorite?: boolean;
  attacks?: CreatureAttack[];
  immunities?: string[];
  resistances?: string[];
  weaknesses?: string[];
  /** De onde veio (ex.: "Foundry: pathfinder-monster-core"). */
  source?: string;
  /** Presente nas instâncias: de qual modelo a criatura foi copiada. Cada token tem a sua. */
  templateId?: string;
  /** Token do mapa a que esta instância está ligada. */
  tokenId?: string;
  /** Visibilidade para os jogadores. */
  show?: CreatureShow;
}

export interface CreatureAttack {
  name: string;
  bonus: number;
  /** "1d6 slashing" */
  damage: string;
  traits: string[];
}

export const isInstance = (c: Creature) => c.templateId !== undefined;

/**
 * Cria uma instância (cópia com PV cheios) por token, numerada: "Goblin 1", "Goblin 2"…
 * Cada instância tem os próprios PV e condições, então cada token é resolvido separadamente.
 */
export function makeInstances(template: Creature, existing: Creature[], tokenIds: string[]): Creature[] {
  const used = existing
    .filter((c) => c.templateId === template.id)
    .map((c) => parseInt(c.name.slice(template.name.length).trim(), 10))
    .filter((n) => Number.isFinite(n));
  let n = Math.max(0, ...used);
  return tokenIds.map((tokenId) => ({
    ...template,
    id: `cr-${crypto.randomUUID()}`,
    name: `${template.name} ${++n}`,
    hp: template.hpMax,
    temp: 0,
    conditions: {},
    templateId: template.id,
    tokenId,
  }));
}

export type StatusKey = "unhurt" | "hurt" | "bloodied" | "critical" | "down";

export interface Status {
  key: StatusKey;
  label: string;
  /** Fração mostrada aos jogadores (grosseira de propósito). */
  ratio: number;
}

export function statusOf(c: Pick<Creature, "hp" | "hpMax">): Status {
  const r = c.hpMax > 0 ? c.hp / c.hpMax : 0;
  if (c.hp <= 0) return { key: "down", label: "Caído", ratio: 0 };
  if (r >= 1) return { key: "unhurt", label: "Ileso", ratio: 1 };
  if (r > 0.5) return { key: "hurt", label: "Ferido", ratio: 0.75 };
  if (r > 0.25) return { key: "bloodied", label: "Muito ferido", ratio: 0.4 };
  return { key: "critical", label: "Crítico", ratio: 0.15 };
}

/** Resumo público da criatura (vai no token), já sem o que o mestre escondeu. */
export function publicLink(c: Creature): CreatureLink {
  const sh = showOf(c);
  const s = statusOf(c);
  return {
    id: c.id,
    name: sh.name ? c.name : "Criatura",
    status: sh.bar ? s.label : "",
    ratio: sh.bar ? s.ratio : 1,
    conditions: sh.conditions ? (c.conditions ?? {}) : {},
    durations: sh.conditions ? c.durations : undefined,
    ...(sh.bar ? {} : { noBar: true }),
    ...(sh.ac ? { ac: creatureAc(c).value } : {}),
    ...(sh.numbers ? { pv: `${Math.max(0, c.hp)}/${c.hpMax}${c.temp ? ` +${c.temp}` : ""}` } : {}),
  };
}

export function loadCreatures(): Creature[] {
  try {
    const raw = localStorage.getItem(STORE);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveCreatures(list: Creature[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    /* sem armazenamento: os dados valem só até fechar a página */
  }
}

export function getCreature(id: string): Creature | undefined {
  return loadCreatures().find((c) => c.id === id);
}

export function upsertCreature(c: Creature) {
  const list = loadCreatures();
  const i = list.findIndex((x) => x.id === c.id);
  if (i === -1) list.push(c);
  else list[i] = c;
  saveCreatures(list);
}

export function removeCreature(id: string) {
  saveCreatures(loadCreatures().filter((c) => c.id !== id));
}

/** Aplica dano em uma criatura: PV temporários primeiro. */
export function damageCreature(c: Creature, damage: number) {
  const absorbed = Math.min(c.temp, damage);
  const toHp = Math.min(c.hp, damage - absorbed);
  const next: Creature = { ...c, temp: c.temp - absorbed, hp: c.hp - toHp };
  return { creature: next, absorbed, toHp, dropped: c.hp > 0 && next.hp === 0 };
}

/* ---------- efeitos das condições nos números da criatura ---------- */
export type CreatureSave = "fortitude" | "reflex" | "will";

const SAVE_ABILITY: Record<CreatureSave, "con" | "dex" | "wis"> = {
  fortitude: "con",
  reflex: "dex",
  will: "wis",
};

/** CA da criatura com as condições (mesmas regras das fichas de jogador). */
export function creatureAc(c: Creature) {
  return acWithConditions(c.ac, c.conditions ?? {});
}

/** Salvaguarda com as condições: Amedrontado/Enjoado em tudo; Desajeitado em Reflexos etc. */
export function creatureSave(c: Creature, stat: CreatureSave) {
  const base = stat === "fortitude" ? c.fort : stat === "reflex" ? c.ref : c.will;
  return withConditions(base, c.conditions ?? {}, { ability: SAVE_ABILITY[stat], isSave: true });
}

/** Percepção (usada na iniciativa) com as condições. */
export function creaturePerception(c: Creature) {
  return withConditions(c.perception, c.conditions ?? {}, { ability: "wis" });
}

/* ---------- backup (exportar e importar) ---------- */
const BACKUP_APP = "owlbear-pf2e";
const BACKUP_VERSION = 1;
const LAST_BACKUP = "pf2e.creatures.lastBackup";

export interface Backup {
  app: typeof BACKUP_APP;
  type: "creatures";
  version: number;
  exportedAt: string;
  creatures: Creature[];
}

export function makeBackup(list: Creature[], now = new Date()): Backup {
  return {
    app: BACKUP_APP,
    type: "creatures",
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    creatures: list,
  };
}

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Confere um item do arquivo e devolve a criatura limpa, ou `null` se não servir. */
function cleanCreature(raw: unknown): Creature | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id === "" || typeof r.name !== "string" || r.name.trim() === "") return null;
  const hpMax = num(r.hpMax, NaN);
  if (!Number.isFinite(hpMax) || hpMax <= 0 || !Number.isFinite(num(r.ac, NaN))) return null;
  const conditions: Record<string, number> = {};
  if (typeof r.conditions === "object" && r.conditions !== null) {
    for (const [k, v] of Object.entries(r.conditions as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) conditions[k] = v;
    }
  }
  const c: Creature = {
    id: r.id,
    name: r.name.trim(),
    ac: num(r.ac),
    hpMax,
    hp: Math.min(hpMax, Math.max(0, num(r.hp, hpMax))),
    temp: Math.max(0, num(r.temp)),
    fort: num(r.fort),
    ref: num(r.ref),
    will: num(r.will),
    perception: num(r.perception),
    notes: typeof r.notes === "string" ? r.notes : "",
  };
  if (Object.keys(conditions).length > 0) c.conditions = conditions;
  const strs = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
  if (Number.isFinite(r.level)) c.level = r.level as number;
  if (typeof r.size === "string") c.size = r.size;
  if (Number.isFinite(r.speed)) c.speed = r.speed as number;
  if (strs(r.traits)?.length) c.traits = strs(r.traits);
  if (typeof r.group === "string" && r.group.trim()) c.group = r.group.trim();
  if (r.favorite === true) c.favorite = true;
  if (strs(r.immunities)?.length) c.immunities = strs(r.immunities);
  if (strs(r.resistances)?.length) c.resistances = strs(r.resistances);
  if (strs(r.weaknesses)?.length) c.weaknesses = strs(r.weaknesses);
  if (typeof r.source === "string") c.source = r.source;
  if (Array.isArray(r.attacks)) {
    const atk = (r.attacks as unknown[]).flatMap((a): CreatureAttack[] => {
      if (typeof a !== "object" || a === null) return [];
      const x = a as Record<string, unknown>;
      if (typeof x.name !== "string" || !Number.isFinite(x.bonus)) return [];
      return [
        {
          name: x.name,
          bonus: x.bonus as number,
          damage: typeof x.damage === "string" ? x.damage : "",
          traits: strs(x.traits) ?? [],
        },
      ];
    });
    if (atk.length > 0) c.attacks = atk;
  }
  if (typeof r.templateId === "string") c.templateId = r.templateId;
  if (typeof r.tokenId === "string") c.tokenId = r.tokenId;
  return c;
}

/** Lê o texto de um arquivo de backup. Itens inválidos são ignorados e contados. */
export function parseBackup(text: string): { creatures: Creature[]; ignored: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("O arquivo não é um JSON válido.");
  }
  const d = data as Partial<Backup> | null;
  if (!d || d.app !== BACKUP_APP || d.type !== "creatures" || !Array.isArray(d.creatures)) {
    throw new Error("Este arquivo não é um backup de criaturas do Owlbear PF2e.");
  }
  if (typeof d.version === "number" && d.version > BACKUP_VERSION) {
    throw new Error("Este backup é de uma versão mais nova da extensão. Atualize a extensão e tente de novo.");
  }
  const creatures: Creature[] = [];
  let ignored = 0;
  const seen = new Set<string>();
  for (const raw of d.creatures) {
    const c = cleanCreature(raw);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      creatures.push(c);
    } else ignored++;
  }
  return { creatures, ignored };
}

/** Mesclar: o que tem o mesmo id é atualizado, o resto é acrescentado. Substituir: troca tudo. */
export function applyBackup(existing: Creature[], incoming: Creature[], mode: "merge" | "replace"): Creature[] {
  if (mode === "replace") return incoming;
  const byId = new Map(existing.map((c) => [c.id, c]));
  for (const c of incoming) byId.set(c.id, c);
  return [...byId.values()];
}

export function lastBackupAt(): Date | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

export function markBackupDone(now = new Date()) {
  try {
    localStorage.setItem(LAST_BACKUP, now.toISOString());
  } catch {
    /* sem armazenamento */
  }
}
