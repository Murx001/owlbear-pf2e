import type { Ability, Attack, Caster, Character, SpellList, Stat } from "./character";

const ENDPOINT = "https://pathbuilder2e.com/json.php?id=";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

const mod = (score: number) => Math.floor((score - 10) / 2);
/** Bônus de proficiência: destreinado = 0; senão nível + valor do grau (2/4/6/8). */
const prof = (rank: number, level: number) => (rank > 0 ? rank + level : 0);

const SKILLS: [key: string, pt: string, ability: Ability][] = [
  ["acrobatics", "Acrobacia", "dex"],
  ["arcana", "Arcanismo", "int"],
  ["athletics", "Atletismo", "str"],
  ["crafting", "Ofícios", "int"],
  ["deception", "Enganação", "cha"],
  ["diplomacy", "Diplomacia", "cha"],
  ["intimidation", "Intimidação", "cha"],
  ["medicine", "Medicina", "wis"],
  ["nature", "Natureza", "wis"],
  ["occultism", "Ocultismo", "int"],
  ["performance", "Atuação", "cha"],
  ["religion", "Religião", "wis"],
  ["society", "Sociedade", "int"],
  ["stealth", "Furtividade", "dex"],
  ["survival", "Sobrevivência", "wis"],
  ["thievery", "Ladroagem", "dex"],
];

const STRIKING: Record<string, number> = {
  striking: 2,
  greaterStriking: 3,
  majorStriking: 4,
};

export async function fetchBuild(id: string): Promise<Raw> {
  if (!/^\d{3,10}$/.test(id)) throw new Error("O ID deve conter só números.");
  const res = await fetch(ENDPOINT + id);
  if (!res.ok) throw new Error(`Pathbuilder respondeu ${res.status}.`);
  const json = await res.json();
  if (!json.success || !json.build) {
    throw new Error(json.error ? `Pathbuilder: ${json.error}` : "Ficha não encontrada.");
  }
  return json.build;
}

function spellLists(raw: any): SpellList[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: Raw) => ({ rank: Number(s.spellLevel), names: (s.list ?? []) as string[] }))
    .filter((s) => s.names.length > 0)
    .sort((a, b) => a.rank - b.rank);
}

/** `focus` vem como { tradição: { atributo: { focusCantrips, focusSpells } } }. */
function focusList(focus: any, key: "focusCantrips" | "focusSpells"): string[] {
  const out: string[] = [];
  if (focus && typeof focus === "object") {
    for (const tradition of Object.values<any>(focus)) {
      for (const entry of Object.values<any>(tradition ?? {})) {
        if (Array.isArray(entry?.[key])) out.push(...entry[key]);
      }
    }
  }
  return out;
}

export function toCharacter(b: Raw, pathbuilderId?: string): Character {
  const level: number = b.level;
  const ab = b.abilities as Raw;
  const m: Record<Ability, number> = {
    str: mod(ab.str),
    dex: mod(ab.dex),
    con: mod(ab.con),
    int: mod(ab.int),
    wis: mod(ab.wis),
    cha: mod(ab.cha),
  };
  const p = b.proficiencies as Raw;

  const stat = (key: string, name: string, ability: Ability, rank: number): Stat => ({
    key,
    name,
    ability,
    rank,
    total: m[ability] + prof(rank, level),
  });

  const attrs = b.attributes as Raw;
  const hpMax =
    attrs.ancestryhp + (attrs.classhp + m.con + (attrs.bonushpPerLevel ?? 0)) * level + (attrs.bonushp ?? 0);

  const keyAbility = (b.keyability as Ability) ?? "int";

  const attacks: Attack[] = ((b.weapons as Raw[]) ?? []).map((w) => ({
    name: w.display ?? w.name,
    bonus: w.attack,
    damage: {
      dice: STRIKING[w.str] ?? 1,
      die: parseInt(String(w.die).replace("d", ""), 10) || 4,
      bonus: w.damageBonus ?? 0,
      type: w.damageType ?? "",
    },
  }));

  const casters: Caster[] = ((b.spellCasters as Raw[]) ?? []).map((c) => {
    const ability = (c.ability as Ability) ?? "int";
    const attack = m[ability] + prof(c.proficiency, level);
    return {
      name: c.name,
      tradition: c.magicTradition,
      ability,
      attack,
      dc: 10 + attack,
      slots: c.perDay ?? [],
      prepared: spellLists(c.prepared),
      known: spellLists(c.spells),
    };
  });

  const feats = ((b.feats as any[]) ?? []).map((f) => ({
    name: String(f[0]),
    type: String(f[2] ?? ""),
    level: Number(f[3] ?? 0),
  }));

  return {
    source: "pathbuilder-json",
    pathbuilderId,
    name: b.name,
    level,
    ancestry: b.ancestry,
    heritage: b.heritage,
    background: b.background,
    className: b.class,
    abilities: m,
    hpMax,
    ac: b.acTotal?.acTotal ?? 10,
    speed: attrs.speed + (attrs.speedBonus ?? 0),
    classDC: 10 + m[keyAbility] + prof(p.classDC, level),
    perception: stat("perception", "Percepção", "wis", p.perception),
    saves: [
      stat("fortitude", "Fortitude", "con", p.fortitude),
      stat("reflex", "Reflexos", "dex", p.reflex),
      stat("will", "Vontade", "wis", p.will),
    ],
    skills: SKILLS.map(([key, pt, a]) => stat(key, pt, a, p[key] ?? 0)),
    lores: ((b.lores as [string, number][]) ?? []).map(([name, rank]) =>
      stat(`lore:${name}`, `Saber: ${name}`, "int", rank),
    ),
    attacks,
    casters,
    focusPoints: b.focusPoints ?? 0,
    focusCantrips: focusList(b.focus, "focusCantrips"),
    focusSpells: focusList(b.focus, "focusSpells"),
    languages: b.languages ?? [],
    feats,
  };
}
