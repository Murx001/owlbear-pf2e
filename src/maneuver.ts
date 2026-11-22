import { adjustDamage, SECRET_ADJUST } from "./defenses";
import { DEGREE_TEXT, publishEvent, publishRoll, type Degree } from "./roll";
import type { SaveTarget } from "./saveSpell";
import type { SaveStat, SpellCondition } from "./spellData";

/**
 * Manobras (Agarrar, Derrubar, Empurrar, Desarmar, Amedrontar, Fintar): uma perícia contra a CD do
 * alvo (Fortitude, Reflexos, Vontade ou Percepção). O grau de sucesso decide o efeito e as condições.
 */
export type ManeuverId = "grapple" | "trip" | "shove" | "disarm" | "demoralize" | "feint";
type DcKind = SaveStat | "perception";

export interface ManeuverOutcome {
  text: string;
  /** Condições no alvo. */
  conditions: SpellCondition[];
  /** Condições em quem fez a manobra (ex.: cair no chão ao falhar criticamente). */
  self?: SpellCondition[];
  /** Dano no alvo (ex.: Derrubar com sucesso crítico: 1d6 contundente). */
  damage?: { dice: number; die: number; type: string };
}

export interface Maneuver {
  id: ManeuverId;
  name: string;
  skill: "athletics" | "intimidation" | "deception";
  skillName: string;
  dc: DcKind;
  /** Tem o traço de ataque: conta para a penalidade de ataques múltiplos. */
  attack: boolean;
  /** Resumo para a lista. */
  hint: string;
  outcomes: Record<Degree, ManeuverOutcome>;
}

const until = (turns: number, text: string) => ({ mode: "source-start" as const, rounds: turns, text });
const cond = (key: string, value = 1, turns = 0, text = ""): SpellCondition => ({
  key,
  value,
  duration: turns ? until(turns, text) : undefined,
});

export const MANEUVERS: Maneuver[] = [
  {
    id: "grapple",
    name: "Agarrar",
    skill: "athletics",
    skillName: "Atletismo",
    dc: "fortitude",
    attack: true,
    hint: "Atletismo vs Fortitude · Agarrado / Contido",
    outcomes: {
      "crit-success": { text: "O alvo fica Contido até o fim do seu próximo turno (se você não o soltar nem se mover).", conditions: [cond("restrained", 1, 2, "até o fim do seu próximo turno")] },
      success: { text: "O alvo fica Agarrado até o fim do seu próximo turno (se você não o soltar nem se mover).", conditions: [cond("grabbed", 1, 2, "até o fim do seu próximo turno")] },
      failure: { text: "Você solta o alvo, se o estava agarrando ou contendo.", conditions: [] },
      "crit-failure": { text: "Você solta o alvo, e ele pode agarrar você ou derrubá-lo no chão (à escolha dele).", conditions: [] },
    },
  },
  {
    id: "trip",
    name: "Derrubar",
    skill: "athletics",
    skillName: "Atletismo",
    dc: "reflex",
    attack: true,
    hint: "Atletismo vs Reflexos · Caído",
    outcomes: {
      "crit-success": { text: "O alvo cai no chão e sofre 1d6 de dano contundente.", conditions: [cond("prone")], damage: { dice: 1, die: 6, type: "bludgeoning" } },
      success: { text: "O alvo cai no chão.", conditions: [cond("prone")] },
      failure: { text: "Nada acontece.", conditions: [] },
      "crit-failure": { text: "Você perde o equilíbrio e cai no chão.", conditions: [], self: [cond("prone")] },
    },
  },
  {
    id: "shove",
    name: "Empurrar",
    skill: "athletics",
    skillName: "Atletismo",
    dc: "fortitude",
    attack: true,
    hint: "Atletismo vs Fortitude · empurra 1,5 m",
    outcomes: {
      "crit-success": { text: "Você empurra o alvo até 3 m (10 pés) para longe e pode acompanhá-lo.", conditions: [] },
      success: { text: "Você empurra o alvo 1,5 m (5 pés) para longe e pode acompanhá-lo.", conditions: [] },
      failure: { text: "Nada acontece.", conditions: [] },
      "crit-failure": { text: "Você perde o equilíbrio e cai no chão.", conditions: [], self: [cond("prone")] },
    },
  },
  {
    id: "disarm",
    name: "Desarmar",
    skill: "athletics",
    skillName: "Atletismo",
    dc: "reflex",
    attack: true,
    hint: "Atletismo vs Reflexos · item do alvo",
    outcomes: {
      "crit-success": { text: "O item cai no chão, no espaço do alvo (ou você o toma, se tiver a mão livre).", conditions: [] },
      success: { text: "O alvo sofre −2 de circunstância nos ataques com o item e testes que o usem, até o início do seu próximo turno (o mestre confirma o efeito).", conditions: [] },
      failure: { text: "Nada acontece.", conditions: [] },
      "crit-failure": { text: "Você fica Desprevenido até o início do seu próximo turno.", conditions: [], self: [cond("off-guard", 1, 1, "até seu próximo turno")] },
    },
  },
  {
    id: "demoralize",
    name: "Amedrontar",
    skill: "intimidation",
    skillName: "Intimidação",
    dc: "will",
    attack: false,
    hint: "Intimidação vs Vontade · Amedrontado",
    outcomes: {
      "crit-success": { text: "O alvo fica Amedrontado 2. Depois disso, ele fica imune a Amedrontar por 10 minutos.", conditions: [cond("frightened", 2)] },
      success: { text: "O alvo fica Amedrontado 1. Depois disso, ele fica imune a Amedrontar por 10 minutos.", conditions: [cond("frightened", 1)] },
      failure: { text: "Nada acontece.", conditions: [] },
      "crit-failure": { text: "Nada acontece.", conditions: [] },
    },
  },
  {
    id: "feint",
    name: "Fintar",
    skill: "deception",
    skillName: "Enganação",
    dc: "perception",
    attack: false,
    hint: "Enganação vs Percepção · Desprevenido",
    outcomes: {
      "crit-success": { text: "O alvo fica Desprevenido contra seus ataques corpo a corpo até o fim do seu próximo turno.", conditions: [cond("off-guard", 1, 2, "até o fim do seu próximo turno")] },
      success: { text: "O alvo fica Desprevenido contra o seu próximo ataque corpo a corpo, até o fim do seu turno atual.", conditions: [cond("off-guard", 1, 1, "até o fim do seu turno")] },
      failure: { text: "Nada acontece.", conditions: [] },
      "crit-failure": { text: "Você fica Desprevenido contra os ataques corpo a corpo do alvo até o fim do seu próximo turno.", conditions: [] },
    },
  },
];

export const maneuverById = (id: ManeuverId) => MANEUVERS.find((m) => m.id === id)!;

export interface ManeuverSpec {
  attackerName: string;
  attackerColor?: string;
  /** Id do combatente de quem faz a manobra: as durações contam nos turnos dele. */
  sourceId?: string;
  title: string;
  /** Bônus da perícia, já com condições. */
  bonus: number;
  mapPenalty: number;
}

/** Tudo que o cartão mostra. Nada secreto: com alvo secreto, a CD e os PV ficam vazios. */
export interface ManeuverResult {
  attacker: string;
  target: string;
  title: string;
  maneuver: ManeuverId;
  natural: number;
  bonus: number;
  mapPenalty: number;
  total: number;
  /** CD do alvo; ausente se o alvo é secreto. */
  dc?: number;
  dcKind: DcKind;
  degree: Degree;
  text: string;
  conditions: SpellCondition[];
  /** Condições para quem fez a manobra: quem pediu aplica na própria ficha. */
  self: SpellCondition[];
  damage?: { final: number; type: string; adjust?: string[] };
  notes: string[];
}

export const DC_PT: Record<DcKind, string> = {
  fortitude: "Fortitude",
  reflex: "Reflexos",
  will: "Vontade",
  perception: "Percepção",
};

/** Rola a perícia contra a CD do alvo, aplica as condições dele e devolve o que fica para quem agiu. */
export async function resolveManeuver(
  spec: ManeuverSpec,
  m: Maneuver,
  target: SaveTarget & { perceptionMod?: () => Promise<number> },
): Promise<ManeuverResult> {
  const as = spec.attackerColor ? { name: spec.attackerName, color: spec.attackerColor } : undefined;
  const mod = m.dc === "perception" ? await target.perceptionMod?.() : await target.saveMod(m.dc);
  if (mod === undefined) throw new Error(`Não sei a Percepção de ${target.name}.`);
  const dc = 10 + mod;
  const map = spec.mapPenalty > 0 ? ` (ataques múltiplos −${spec.mapPenalty})` : "";

  const roll = await publishRoll({
    title: `${spec.title} → ${target.name}${map}`,
    count: 1,
    sides: 20,
    mod: spec.bonus - spec.mapPenalty,
    dc,
    hideTarget: target.secret,
    as,
  });
  const degree: Degree = roll.degree ?? "failure";
  const out = m.outcomes[degree];

  const result: ManeuverResult = {
    attacker: spec.attackerName,
    target: target.name,
    title: spec.title,
    maneuver: m.id,
    natural: roll.rolls[0],
    bonus: spec.bonus,
    mapPenalty: spec.mapPenalty,
    total: roll.total,
    dc: target.secret ? undefined : dc,
    dcKind: m.dc,
    degree,
    text: out.text,
    conditions: out.conditions,
    self: out.self ?? [],
    notes: [],
  };

  if (out.conditions.length > 0) await target.applyConditions(out.conditions, spec.sourceId);
  if (out.damage) {
    const d = await publishRoll({ title: `${spec.title} (dano)`, count: out.damage.dice, sides: out.damage.die, mod: 0, as });
    const adj = adjustDamage(d.total, out.damage.type, target.defenses);
    await target.applyDamage(adj.final);
    result.damage = {
      final: adj.final,
      type: out.damage.type,
      adjust: adj.changed ? (target.secret ? [SECRET_ADJUST] : adj.notes) : undefined,
    };
  }

  const names = out.conditions.map((c) => c.key).join(", ");
  await publishEvent(
    `usou ${spec.title} em ${target.name}: ${DEGREE_TEXT[degree]}${target.secret ? "" : ` (${roll.total} contra CD ${dc})`}.${names ? ` Aplicado: ${names}.` : ""}`,
    as,
  );
  return result;
}
