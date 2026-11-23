import type { DamageResult } from "./attack";
import { adjustDamage, SECRET_ADJUST, type Defenses } from "./defenses";
import { degreeOf, DEGREE_TEXT, publishEvent, publishRoll, type Degree } from "./roll";
import { castParts } from "./spellTweak";
import { type Outcome, type SaveStat, type SpellCondition, type SpellData } from "./spellData";

export interface SpellCast {
  casterName: string;
  /** Id do combatente de quem lança (ID do Pathbuilder): as durações contam nos turnos dele. */
  casterId?: string;
  casterColor?: string;
  spell: SpellData;
  /** Rank do espaço usado (para intensificar). */
  rank: number;
  /** CD de magia da conjuradora. */
  dc: number;
  /** Modificador do atributo de conjuração (somado ao dano de certos truques). */
  abilityMod: number;
  /** Fórmula de dano ajustada na caixa "deseja rolar?" ("2d8+3 fire; 1d6 fire"); vale no lugar da do Foundry. */
  formula?: string;
  /** Ações gastas (magias com custo variável). */
  actions?: number;
}

/** Quem sofre a magia: ficha de jogador (calculada aqui) ou criatura (resolvida no mestre). */
export interface SaveTarget {
  name: string;
  /** Alvo secreto (criatura do mestre): o resultado não revela PV. */
  secret?: boolean;
  /** Imunidades, fraquezas e resistências do alvo. */
  defenses?: Defenses;
  /** Modificador total da salvaguarda, já com condições. */
  saveMod(stat: SaveStat): Promise<number>;
  /** Modificador de Percepção (CD de Fintar), já com condições. */
  perceptionMod?(): Promise<number>;
  applyDamage(total: number): Promise<DamageResult>;
  /** `sourceId`: quem lançou, para contar as durações nos turnos dele. */
  applyConditions(list: SpellCondition[], sourceId?: string): Promise<void>;
  /** Cura; devolve o texto de PV restantes (nulo se o alvo é secreto). */
  applyHealing(total: number): Promise<string | null>;
  /** PV temporários (não acumulam: vale o maior); devolve o texto de PV (nulo se secreto). */
  applyTempHp(amount: number): Promise<string | null>;
}

/** Resultado de uma magia em UM alvo: o que o cartão mostra. Nada secreto vai aqui. */
export interface SpellTargetResult {
  target: string;
  save?: {
    stat: SaveStat;
    natural: number;
    mod: number;
    total: number;
    dc: number;
    degree: Degree;
  };
  damage?: {
    /** Dano rolado (com o bônus fixo). */
    rolled: number;
    /** Multiplicador pelo grau da salvaguarda básica ("×0", "×½", "×1", "×2"); vazio se não há. */
    multiplier: string;
    final: number;
    type: string;
    absorbed: number;
    hpText: string | null;
    dropped: boolean;
    /** Ajustes por imunidade, fraqueza ou resistência. */
    adjust?: string[];
  };
  healed?: { total: number; hpText: string | null };
  tempGranted?: { amount: number; hpText: string | null };
  /** Condições aplicadas ao alvo. */
  conditions: SpellCondition[];
  /** Texto do efeito no grau de sucesso do alvo (regras do Foundry). */
  effect: string;
  /** Avisos (ex.: dano não automatizado). */
  notes: string[];
  error?: string;
}

const OUTCOME_OF: Record<Degree, Outcome> = {
  "crit-success": "critSuccess",
  success: "success",
  failure: "failure",
  "crit-failure": "critFailure",
};

const MULTIPLIER: Record<Degree, string> = {
  "crit-success": "×0",
  success: "×½",
  failure: "×1",
  "crit-failure": "×2",
};

export const STAT_PT: Record<SaveStat, string> = {
  fortitude: "Fortitude",
  reflex: "Reflexos",
  will: "Vontade",
};

const asOf = (cast: SpellCast) =>
  cast.casterColor ? { name: cast.casterName, color: cast.casterColor } : undefined;

/**
 * Rola o dano (ou a cura) da magia UMA vez, como manda a regra: em magias de área todos os alvos
 * sofrem o mesmo dano rolado. Devolve `null` se a magia não tem dano que possamos rolar sozinhos.
 */
export async function rollSpellDamage(cast: SpellCast, kind: "dano" | "cura"): Promise<number | null> {
  const parts = castParts(cast);
  if (!parts || parts.length === 0) return null;
  let total = 0;
  for (const p of parts) {
    const r = await publishRoll({
      title: `${cast.spell.name} (${kind}${p.type && kind === "dano" ? ` ${p.type}` : ""})`,
      count: p.count,
      sides: p.die,
      mod: p.bonus,
      as: asOf(cast),
    });
    total += r.total;
  }
  return total;
}

const damageTypes = (cast: SpellCast) =>
  (castParts(cast) ?? [])
    .map((p) => p.type)
    .filter(Boolean)
    .join("/");

/** Magia que concede PV temporários (ex.: Barreira de Músculos). */
export async function resolveTempSpell(
  cast: SpellCast,
  target: SaveTarget,
  amount: number | null,
): Promise<SpellTargetResult> {
  if (amount === null) throw new Error(`${cast.spell.name}: PV temporários não automatizados.`);
  const hp = await target.applyTempHp(amount);
  await publishEvent(
    `conjurou ${cast.spell.name} em ${target.name}: ${amount} PV temporários.${hp ? ` ${hp}.` : ""}`,
    asOf(cast),
  );
  return {
    target: target.name,
    tempGranted: { amount, hpText: hp },
    conditions: [],
    effect: "",
    notes: [],
  };
}

/** Salvaguarda básica: sucesso crítico ×0, sucesso ×½ (para baixo), falha ×1, falha crítica ×2. */
export function basicMultiplied(total: number, degree: Degree): number {
  if (degree === "crit-success") return 0;
  if (degree === "success") return Math.floor(total / 2);
  if (degree === "crit-failure") return total * 2;
  return total;
}

function damageNotes(r: DamageResult, targetName: string): string[] {
  const notes: string[] = [];
  if (r.absorbed > 0) notes.push(`${r.absorbed} absorvido(s) pelos PV temporários`);
  if (r.hpText) notes.push(r.hpText);
  if (r.dropped) notes.push(`${targetName} caiu!`);
  return notes;
}

/** Magia que acerta automaticamente (ex.: Force Barrage): aplica o dano já rolado. */
export async function resolveAutoSpell(
  cast: SpellCast,
  target: Pick<SaveTarget, "name" | "applyDamage" | "defenses" | "secret">,
  rolled: number | null,
): Promise<SpellTargetResult> {
  if (rolled === null) throw new Error(`${cast.spell.name}: dano não automatizado.`);
  const adj = adjustDamage(rolled, damageTypes(cast), target.defenses);
  const r = await target.applyDamage(adj.final);
  const extra = damageNotes(r, target.name);
  const adjText = adj.changed ? (target.secret ? [SECRET_ADJUST] : adj.notes) : [];
  extra.unshift(...adjText);
  await publishEvent(
    `conjurou ${cast.spell.name} em ${target.name} (acerto automático): ${adj.final} de dano.${
      extra.length ? ` ${extra.join("; ")}.` : ""
    }`,
    asOf(cast),
  );
  return {
    target: target.name,
    damage: {
      rolled,
      multiplier: "",
      final: adj.final,
      type: damageTypes(cast),
      absorbed: r.absorbed,
      hpText: r.hpText,
      dropped: r.dropped,
      adjust: adjText.length ? adjText : undefined,
    },
    conditions: [],
    effect: "",
    notes: [],
  };
}

/** Magia de cura: soma os PV já rolados ao alvo (sem passar do máximo). */
export async function resolveHealSpell(
  cast: SpellCast,
  target: SaveTarget,
  rolled: number | null,
): Promise<SpellTargetResult> {
  if (rolled === null) throw new Error(`${cast.spell.name}: cura não automatizada.`);
  const hp = await target.applyHealing(rolled);
  await publishEvent(
    `conjurou ${cast.spell.name} em ${target.name}: ${rolled} PV curados.${hp ? ` ${hp}.` : ""}`,
    asOf(cast),
  );
  return { target: target.name, healed: { total: rolled, hpText: hp }, conditions: [], effect: "", notes: [] };
}

/**
 * Rola a salvaguarda de UM alvo contra a CD, aplica o dano já rolado (se a salvaguarda é básica)
 * e as condições do grau de sucesso dele. Em magias de área, chame uma vez por alvo.
 */
export async function resolveSaveSpell(
  cast: SpellCast,
  target: SaveTarget,
  rolled: number | null,
): Promise<SpellTargetResult> {
  const { spell } = cast;
  if (!spell.save) throw new Error(`${spell.name} não usa salvaguarda.`);

  // A salvaguarda é do alvo: aparece no histórico em nome dele.
  const mod = await target.saveMod(spell.save.stat);
  const roll = await publishRoll({
    title: `${STAT_PT[spell.save.stat]} vs CD ${cast.dc} (${spell.name})`,
    count: 1,
    sides: 20,
    mod,
    dc: cast.dc,
    as: { name: target.name, color: "#e0a04a" },
  });
  const degree = roll.degree ?? degreeOf(roll.total, cast.dc, roll.rolls[0]);
  const outcome = spell.outcomes?.[OUTCOME_OF[degree]];

  const result: SpellTargetResult = {
    target: target.name,
    save: {
      stat: spell.save.stat,
      natural: roll.rolls[0],
      mod,
      total: roll.total,
      dc: cast.dc,
      degree,
    },
    conditions: [],
    effect: outcome?.text ?? "",
    notes: [],
  };
  const notes: string[] = [];

  // Dano (só de salvaguarda básica; nas demais o texto do efeito diz o que fazer).
  if (spell.save.basic) {
    if (rolled === null) {
      notes.push("dano não automatizado: role na aba Dados");
      result.notes.push("Dano não automatizado: role na aba Dados.");
    } else {
      const types = damageTypes(cast);
      const adj = adjustDamage(basicMultiplied(rolled, degree), types, target.defenses);
      const final = adj.final;
      const adjText = adj.changed ? (target.secret ? [SECRET_ADJUST] : adj.notes) : [];
      if (final > 0) {
        const r = await target.applyDamage(final);
        notes.push(`${final} de dano${types ? ` ${types}` : ""}`, ...adjText, ...damageNotes(r, target.name));
        result.damage = {
          rolled,
          multiplier: MULTIPLIER[degree],
          final,
          type: types,
          absorbed: r.absorbed,
          hpText: r.hpText,
          dropped: r.dropped,
          adjust: adjText.length ? adjText : undefined,
        };
      } else {
        notes.push("nenhum dano", ...adjText);
        result.damage = {
          rolled,
          multiplier: MULTIPLIER[degree],
          final: 0,
          type: types,
          absorbed: 0,
          hpText: null,
          dropped: false,
          adjust: adjText.length ? adjText : undefined,
        };
      }
    }
  }

  // Condições reconhecidas no texto do grau de sucesso.
  const conds = outcome?.conditions ?? [];
  if (conds.length > 0) {
    await target.applyConditions(conds, cast.casterId);
    result.conditions = conds;
    notes.push(`aplicado: ${conds.map((c) => `${c.key}${c.value > 1 ? ` ${c.value}` : ""}`).join(", ")}`);
  }

  const effect = outcome?.text ? ` Efeito: ${outcome.text}` : "";
  await publishEvent(
    `conjurou ${spell.name} em ${target.name}: ${DEGREE_TEXT[degree]} (CD ${cast.dc}).${
      notes.length ? ` ${notes.join("; ")}.` : ""
    }${effect}`,
    asOf(cast),
  );
  return result;
}

/** Resumo em uma linha (linha de status). */
export function describeSpellResult(cast: SpellCast, r: SpellTargetResult): string {
  if (r.error) return `${r.target}: ${r.error}`;
  if (r.healed) return `${cast.casterName} curou ${r.target} em ${r.healed.total} PV.`;
  if (r.tempGranted) return `${r.target} ganhou ${r.tempGranted.amount} PV temporários.`;
  const deg = r.save ? ` ${DEGREE_TEXT[r.save.degree]}` : "";
  const dmg = r.damage ? `, ${r.damage.final} de dano` : "";
  return `${r.target}:${deg}${dmg}.`;
}
