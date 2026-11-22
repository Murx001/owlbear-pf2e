import type { Creature, CreatureAttack } from "./creatures";

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
    .map((x: any) => (withValue && x?.value !== undefined ? `${x.type} ${x.value}` : String(x?.type ?? "")))
    .filter(Boolean);

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
