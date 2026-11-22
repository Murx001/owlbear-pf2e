import OBR from "@owlbear-rodeo/sdk";
import { type Creature, type CreatureAbility, publicLink } from "./creatures";
import type { SpellCast } from "./saveSpell";
import type { SpellCondition, SpellData } from "./spellData";

/**
 * Habilidade de criatura (ex.: Sopro, Presença Aterradora) usada pelo mestre contra os tokens
 * selecionados no mapa. Reaproveita as regras das magias de salvaguarda: a CD, a salvaguarda de
 * cada alvo, o dano básico (×0, ×½, ×1, ×2) e as condições por grau de sucesso.
 */
export function abilityToSpell(a: CreatureAbility): SpellData {
  const conds: SpellCondition[] = (a.conditions ?? []).map((c) => ({
    key: c.key,
    value: c.value,
    duration:
      c.rounds && c.rounds > 0
        ? { mode: "source-start", rounds: c.rounds, text: `${c.rounds} rodada${c.rounds > 1 ? "s" : ""}` }
        : undefined,
  }));
  const none = { text: "", conditions: [] as SpellCondition[] };
  const failText = a.damage && !a.basic ? `Dano: ${a.damage}${a.damageType ? ` ${a.damageType}` : ""}` : "";
  return {
    name: a.name,
    level: 0,
    traits: [],
    save: a.save ? { stat: a.save, basic: !!a.basic } : undefined,
    attack: false,
    damage: a.damage ? [{ formula: a.damage, type: a.damageType ?? "", applyMod: false }] : [],
    healing: false,
    area: a.area,
    // Condições valem na falha e na falha crítica (o mestre ajusta o valor ao cadastrar).
    outcomes: {
      critSuccess: none,
      success: none,
      failure: { text: failText, conditions: conds },
      critFailure: { text: failText, conditions: conds },
    },
    info: { traits: [], traditions: [], actions: "", description: [] },
  };
}

export const abilityLabel = (a: CreatureAbility) => {
  const parts: string[] = [];
  if (a.save && a.dc) parts.push(`${{ fortitude: "Fort", reflex: "Ref", will: "Vont" }[a.save]} CD ${a.dc}${a.basic ? " básica" : ""}`);
  if (a.damage) parts.push(`${a.damage}${a.damageType ? ` ${a.damageType}` : ""}`);
  if (a.area) parts.push(`${{ burst: "explosão", emanation: "emanação", cone: "cone", line: "linha" }[a.area.kind]} ${a.area.feet} pés`);
  for (const c of a.conditions ?? []) parts.push(`${c.key}${c.value > 1 ? ` ${c.value}` : ""}`);
  return parts.join(" · ");
};

/**
 * A magia equivalente da habilidade, para usar o MESMO sistema dos jogadores: faixa de alvos no
 * mapa, área, vários alvos, Resolver, confirmação, cartão e salvaguarda de cada alvo.
 */
export async function abilityCast(c: Creature, a: CreatureAbility): Promise<SpellCast> {
  return {
    casterName: publicLink(c).name,
    casterId: c.id,
    casterColor: await OBR.player.getColor(),
    spell: abilityToSpell(a),
    rank: 1,
    dc: a.dc ?? 10,
    abilityMod: 0,
  };
}
