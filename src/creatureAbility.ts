import OBR from "@owlbear-rodeo/sdk";
import { CARD_SHARE, type CardData } from "./cardData";
import { showCard } from "./cardView";
import { type Creature, type CreatureAbility, getCreature, publicLink } from "./creatures";
import { creatureSaveTarget } from "./gmResolver";
import { DEGREE_TEXT, publishEvent } from "./roll";
import {
  describeSpellResult,
  resolveSaveSpell,
  rollSpellDamage,
  type SaveTarget,
  type SpellCast,
  type SpellTargetResult,
} from "./saveSpell";
import type { SpellCondition, SpellData } from "./spellData";
import { pcSaveTarget } from "./targets";
import { creatureOfToken, linkOfToken } from "./token";

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

/** Usa a habilidade contra os tokens que o mestre selecionou (um ou vários). */
export async function useAbility(c: Creature, a: CreatureAbility, say: (t: string) => void): Promise<void> {
  const picked = ((await OBR.player.getSelection()) ?? []).filter((id) => id !== c.tokenId);
  if (picked.length === 0) {
    say(`${a.name}: selecione no mapa os tokens que sofrem a habilidade (vários, com Shift) e toque de novo.`);
    return;
  }
  const casterName = publicLink(c).name;
  const spell = abilityToSpell(a);
  const cast: SpellCast = {
    casterName,
    casterId: c.id,
    casterColor: await OBR.player.getColor(),
    spell,
    rank: 1,
    dc: a.dc ?? 10,
    abilityMod: 0,
  };

  // Alvos: fichas de jogador ou criaturas do mestre.
  const targets: { name: string; target: SaveTarget | null }[] = [];
  for (const id of picked) {
    const tc = await creatureOfToken(id);
    if (tc) {
      const data = getCreature(tc.id);
      targets.push({ name: tc.name, target: data ? creatureSaveTarget(tc.id, data) : null });
      continue;
    }
    const pc = await linkOfToken(id);
    if (pc?.pathbuilderId) targets.push({ name: pc.name, target: pcSaveTarget(pc.pathbuilderId, pc.name) });
  }
  if (targets.length === 0) {
    say("Nenhum dos tokens selecionados tem ficha ou criatura vinculada.");
    return;
  }

  if (!a.save || !a.dc) {
    say(`${a.name}: cadastre a salvaguarda e a CD para automatizar.`);
    return;
  }

  // Dano rolado uma vez, igual para todos os alvos (regra do PF2e).
  const rolled = a.damage ? await rollSpellDamage(cast, "dano") : null;
  const results: SpellTargetResult[] = [];
  for (const t of targets) {
    if (!t.target) {
      results.push({ target: t.name, conditions: [], effect: "", notes: [], error: "sem dados: vincule o token de novo." });
      continue;
    }
    try {
      results.push(await resolveSaveSpell(cast, t.target, rolled));
    } catch (e) {
      results.push({ target: t.name, conditions: [], effect: "", notes: [], error: e instanceof Error ? e.message : "erro" });
    }
  }

  const card: CardData = { kind: "spell", cast, mode: "save", rolled, results, offline: false };
  void showCard(card);
  void OBR.broadcast.sendMessage(CARD_SHARE, { ...card, sharedBy: "Mestre" }, { destination: "REMOTE" });
  void publishEvent(`${casterName} usou ${a.name} (CD ${cast.dc}) em ${targets.length} alvo(s).`).catch(() => undefined);
  say(
    results
      .map((r) => describeSpellResult(cast, r) || `${r.target}: ${r.save ? DEGREE_TEXT[r.save.degree] : ""}`)
      .join(" "),
  );
}
