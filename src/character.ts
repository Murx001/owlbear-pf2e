/** Modelo interno da ficha, independente da fonte (JSON ou PDF do Pathbuilder). */

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface Stat {
  key: string;
  name: string; // PT-BR
  ability: Ability;
  total: number;
  rank: number; // 0 destreinado, 2 treinado, 4 especialista, 6 mestre, 8 lendário
}

export interface Attack {
  name: string;
  bonus: number;
  damage: { dice: number; die: number; bonus: number; type: string };
}

export interface SpellList {
  rank: number; // 0 = truque
  names: string[];
}

export interface Caster {
  name: string;
  tradition: string;
  ability: Ability;
  attack: number;
  dc: number;
  slots: number[]; // por rank, índice 0 = truques
  prepared: SpellList[];
  known: SpellList[];
}

export interface Character {
  source: "pathbuilder-json";
  pathbuilderId?: string;
  name: string;
  level: number;
  ancestry: string;
  heritage: string;
  background: string;
  className: string;
  abilities: Record<Ability, number>; // modificadores
  hpMax: number;
  ac: number;
  speed: number;
  classDC: number;
  perception: Stat;
  saves: Stat[];
  skills: Stat[];
  lores: Stat[];
  attacks: Attack[];
  casters: Caster[];
  focusPoints: number;
  focusCantrips: string[];
  focusSpells: string[];
  languages: string[];
  feats: { name: string; type: string; level: number }[];
}
