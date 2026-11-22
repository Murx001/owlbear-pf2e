import type { Creature, CreatureAbility, CreatureAttack } from "./creatures";

/**
 * Bestiário do mestre: filtros, organização e importação de criaturas do repositório
 * foundryvtt/pf2e (arquivos JSON públicos, licença ORC).
 */

/* ---------- organização ---------- */
export interface BestiaryFilter {
  text: string;
  group: string;
  trait: string;
  favorites: boolean;
  sort: "name" | "level";
}

export const NO_GROUP = "Sem grupo";

export const groupOf = (c: Creature) => c.group?.trim() || NO_GROUP;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Modelos que passam nos filtros, já ordenados. */
export function filterTemplates(list: Creature[], f: BestiaryFilter): Creature[] {
  const q = norm(f.text.trim());
  const out = list.filter((c) => {
    if (f.favorites && !c.favorite) return false;
    if (f.group && groupOf(c) !== f.group) return false;
    if (f.trait && !(c.traits ?? []).includes(f.trait)) return false;
    if (!q) return true;
    const hay = norm([c.name, groupOf(c), ...(c.traits ?? []), c.notes].join(" "));
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
  const byName = (a: Creature, b: Creature) => a.name.localeCompare(b.name, "pt-BR", { numeric: true });
  return out.sort(
    f.sort === "level"
      ? (a, b) => (a.level ?? 99) - (b.level ?? 99) || byName(a, b)
      : byName,
  );
}

export const allGroups = (list: Creature[]) => [...new Set(list.map(groupOf))].sort((a, b) => a.localeCompare(b, "pt-BR"));
export const allTraits = (list: Creature[]) =>
  [...new Set(list.flatMap((c) => c.traits ?? []))].sort((a, b) => a.localeCompare(b, "pt-BR"));

/** Cópia de um modelo (ex.: para criar uma variante). */
export function duplicateCreature(c: Creature, id: string): Creature {
  return { ...c, id, name: `${c.name} (cópia)`, favorite: false, hp: c.hpMax, temp: 0, conditions: undefined, durations: undefined };
}

/** "1 (Goblin Warrior)" → "goblin-warrior". */
export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* ---------- importação do Foundry ---------- */
const RAW = "https://raw.githubusercontent.com/foundryvtt/pf2e/HEAD/packs/pf2e";

/** Pacotes de criaturas, do mais comum ao mais raro. */
export const PACKS: { dir: string; label: string }[] = [
  { dir: "pathfinder-monster-core", label: "Monster Core" },
  { dir: "pathfinder-monster-core-2", label: "Monster Core 2" },
  { dir: "pathfinder-bestiary", label: "Bestiary 1" },
  { dir: "pathfinder-bestiary-2", label: "Bestiary 2" },
  { dir: "pathfinder-bestiary-3", label: "Bestiary 3" },
  { dir: "pathfinder-npc-core", label: "NPC Core" },
  { dir: "npc-gallery", label: "NPC Gallery" },
  { dir: "howl-of-the-wild-bestiary", label: "Howl of the Wild" },
  { dir: "rage-of-elements-bestiary", label: "Rage of Elements" },
  { dir: "book-of-the-dead-bestiary", label: "Book of the Dead" },
  { dir: "lost-omens-bestiary", label: "Lost Omens" },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
const damageText = (rolls: unknown): string =>
  Object.values<any>((rolls as Record<string, any>) ?? {})
    .map((d) => `${d.damage ?? ""} ${d.damageType ?? ""}`.trim())
    .filter(Boolean)
    .join(" + ");

const typed = (arr: unknown, withValue: boolean): string[] =>
  (Array.isArray(arr) ? arr : [])
    .map((x: any) => {
      const ex = (Array.isArray(x?.exceptions) ? x.exceptions : [])
        .map((e: any) => (typeof e === "string" ? e : String(e?.type ?? "")))
        .filter(Boolean);
      const tail = ex.length ? ` (except ${ex.join(", ")})` : "";
      return withValue && x?.value !== undefined ? `${x.type} ${x.value}${tail}` : String(x?.type ?? "");
    })
    .filter(Boolean);

/**
 * Lê as habilidades do Foundry que têm salvaguarda com CD fixa (@Check), com dano (@Damage), área
 * (@Template ou "90 feet.") e condição ("inflicts:frightened"). Descrições sem isso ficam só como nota.
 */
export function abilitiesFromFoundry(items: any[]): CreatureAbility[] {
  const out: CreatureAbility[] = [];
  for (const i of items) {
    if (i.type !== "action") continue;
    const html: string = i.system?.description?.value ?? "";
    const check = /@Check\[([^\]]*)\]/.exec(html);
    if (!check) continue;
    const spec = check[1];
    const save = /(?:^|\||type:)(fortitude|reflex|will)\b/.exec(spec)?.[1] as CreatureAbility["save"] | undefined;
    const dc = /dc:(\d+)/.exec(spec)?.[1];
    if (!save || !dc) continue;
    const a: CreatureAbility = { name: String(i.name), save, dc: parseInt(dc, 10), basic: /\|basic\b/.test(spec) || /basic:true/.test(spec) };
    const dmg = /@Damage\[\(?([0-9d+\-\s]+)\)?\[([a-z,\- ]+)\]/i.exec(html);
    if (dmg) {
      a.damage = dmg[1].replace(/\s+/g, "");
      a.damageType = dmg[2].trim();
    }
    const tpl = /@Template\[(burst|emanation|cone|line)[^\]]*distance:(\d+)/i.exec(html);
    const plain = /^\s*<p>\s*(\d+) feet\./i.exec(html);
    if (tpl) a.area = { kind: tpl[1].toLowerCase() as "burst" | "emanation" | "cone" | "line", feet: parseInt(tpl[2], 10) };
    else if (plain && /area-effect/.test(spec)) a.area = { kind: "emanation", feet: parseInt(plain[1], 10) };
    const inflicts = /inflicts:([a-z-]+)/.exec(spec)?.[1];
    if (inflicts) a.conditions = [{ key: inflicts, value: 1 }];
    if (a.damage || a.conditions || a.area) out.push(a);
  }
  return out;
}

/** Converte um arquivo NPC do Foundry numa criatura do bestiário. */
export function foundryToCreature(json: any, id: string, packLabel: string, packDir: string): Creature {
  const s = json.system ?? {};
  const hpMax = Number(s.attributes?.hp?.max ?? 1) || 1;
  const attacks: CreatureAttack[] = (json.items ?? [])
    .filter((i: any) => i.type === "melee")
    .map((i: any) => ({
      name: String(i.name),
      bonus: Number(i.system?.bonus?.value ?? 0) || 0,
      damage: damageText(i.system?.damageRolls),
      traits: Array.isArray(i.system?.traits?.value) ? i.system.traits.value : [],
    }));
  const abilities = (json.items ?? [])
    .filter((i: any) => i.type === "action")
    .map((i: any) => String(i.name));
  const c: Creature = {
    id,
    name: String(json.name),
    ac: Number(s.attributes?.ac?.value ?? 10) || 10,
    hpMax,
    hp: hpMax,
    temp: 0,
    fort: Number(s.saves?.fortitude?.value ?? 0) || 0,
    ref: Number(s.saves?.reflex?.value ?? 0) || 0,
    will: Number(s.saves?.will?.value ?? 0) || 0,
    perception: Number(s.perception?.mod ?? 0) || 0,
    notes: abilities.length ? `Habilidades: ${abilities.join(", ")}.` : "",
    level: Number(s.details?.level?.value ?? 0),
    size: s.traits?.size?.value ? String(s.traits.size.value) : undefined,
    speed: Number(s.attributes?.speed?.value ?? 0) || undefined,
    traits: Array.isArray(s.traits?.value) ? s.traits.value : [],
    group: packLabel,
    source: `Foundry: ${packDir}`,
  };
  const imm = typed(s.attributes?.immunities, false);
  const res = typed(s.attributes?.resistances, true);
  const weak = typed(s.attributes?.weaknesses, true);
  if (imm.length) c.immunities = imm;
  if (res.length) c.resistances = res;
  if (weak.length) c.weaknesses = weak;
  if (attacks.length) c.attacks = attacks;
  const abil = abilitiesFromFoundry(json.items ?? []);
  if (abil.length) c.abilities = abil;
  return c;
}

/** Procura a criatura pelo nome em inglês nos pacotes do Foundry. `null` se não achar. */
export async function findFoundryCreature(
  name: string,
  newId: () => string,
): Promise<{ creature: Creature; pack: string } | null> {
  const slug = slugify(name);
  if (!slug) return null;
  for (const p of PACKS) {
    try {
      const res = await fetch(`${RAW}/${p.dir}/${slug}.json`);
      if (!res.ok) continue;
      const json = await res.json();
      if (json.type !== "npc" && json.type !== "character") continue;
      return { creature: foundryToCreature(json, newId(), p.label, p.dir), pack: p.label };
    } catch {
      /* tenta o próximo pacote */
    }
  }
  return null;
}

/* ---------- pesquisa nos pacotes do Foundry ---------- */
export interface FoundryEntry {
  slug: string;
  /** Nome aproximado, a partir do nome do arquivo ("goblin-warrior" -> "Goblin Warrior"). */
  name: string;
  dir: string;
  label: string;
}

const INDEX_KEY = "pf2e.foundryIndex.v1";
const INDEX_TTL = 7 * 24 * 60 * 60 * 1000;
const API = "https://api.github.com/repos/foundryvtt/pf2e/contents/packs/pf2e";

const titleCase = (slug: string) =>
  slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

/**
 * Lista de criaturas dos pacotes (um pedido por pacote à API do GitHub). Fica guardada por 7 dias
 * no navegador, então só o primeiro uso baixa a lista.
 */
export async function loadFoundryIndex(): Promise<FoundryEntry[]> {
  try {
    const cached = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "null") as { at: number; list: FoundryEntry[] } | null;
    if (cached && Array.isArray(cached.list) && cached.list.length > 0 && Date.now() - cached.at < INDEX_TTL) {
      return cached.list;
    }
  } catch {
    /* sem cache */
  }
  const lists = await Promise.all(
    PACKS.map(async (p) => {
      const res = await fetch(`${API}/${p.dir}`);
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "O GitHub limitou os pedidos por agora. Tente de novo daqui a alguns minutos."
            : `Não foi possível ler a lista do pacote ${p.label} (erro ${res.status}).`,
        );
      }
      const files = (await res.json()) as { name: string }[];
      return files
        .filter((f) => f.name.endsWith(".json") && !f.name.startsWith("_"))
        .map((f): FoundryEntry => {
          const slug = f.name.replace(/\.json$/, "");
          return { slug, name: titleCase(slug), dir: p.dir, label: p.label };
        });
    }),
  );
  const list = lists.flat();
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify({ at: Date.now(), list }));
  } catch {
    /* guarda só na memória desta vez */
  }
  return list;
}

/** Procura por palavras (todas precisam aparecer no nome). Nome que começa com a busca vem primeiro. */
export function searchFoundry(list: FoundryEntry[], query: string, limit = 40): FoundryEntry[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return [];
  const hits = list.filter((e) => words.every((w) => e.slug.includes(w)));
  const q = slugify(query);
  hits.sort((a, b) => Number(b.slug.startsWith(q)) - Number(a.slug.startsWith(q)) || a.name.localeCompare(b.name));
  return hits.slice(0, limit);
}

/** Baixa e converte a criatura escolhida na lista. */
export async function importFoundryEntry(e: FoundryEntry, newId: () => string): Promise<Creature> {
  const res = await fetch(`${RAW}/${e.dir}/${e.slug}.json`);
  if (!res.ok) throw new Error(`Não foi possível baixar ${e.name} (erro ${res.status}).`);
  return foundryToCreature(await res.json(), newId(), e.label, e.dir);
}
