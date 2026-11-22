import { adjustDamage, SECRET_ADJUST, type Defenses } from "./defenses";
import { publishEvent, publishRoll, DEGREE_TEXT, formulaText, type Degree } from "./roll";
import { applyDamage, loadState, saveState } from "./state";

export interface AttackSpec {
  attackerName: string;
  /** Cor do atacante, para o histórico quando outra pessoa rola por ele. */
  attackerColor?: string;
  title: string;
  /** Bônus de ataque já com as condições do atacante. */
  bonus: number;
  /** Penalidade de ataques múltiplos (0, 5 ou 10). */
  mapPenalty: number;
  /** Sem `damage` (ex.: ataque de magia) só se resolve o acerto. */
  damage?: { dice: number; die: number; bonus: number; type: string };
  /** O jogador marcou que o alvo está flanqueado: Desprevenido (−2 na CA) contra este ataque. */
  flanking?: boolean;
}

/** Flanqueado = Desprevenido: −2 de circunstância na CA, que não acumula com outro Desprevenido/Caído. */
export const FLANK_PENALTY = 2;

/** Penalidade de ataques múltiplos: 1º 0, 2º −5, 3º em diante −10. */
export const mapFor = (attackNumber: number) => Math.min(10, Math.max(0, (attackNumber - 1) * 5));

export interface DamageResult {
  absorbed: number;
  toHp: number;
  dropped: boolean;
  /** Texto com os PV restantes; nulo quando o alvo é secreto. */
  hpText: string | null;
}

/** Quem recebe o ataque: ficha de jogador (público) ou criatura do mestre (secreto). */
export interface Target {
  name: string;
  /** CA já com as condições do alvo. */
  ac: number;
  /** Condições do alvo, para o flanqueio não acumular com Desprevenido/Caído. */
  conditions?: Record<string, number>;
  secret: boolean;
  /** Imunidades, fraquezas e resistências do alvo (ajustam o dano por tipo). */
  defenses?: Defenses;
  applyDamage(total: number): Promise<DamageResult>;
}

/**
 * Tudo que o cartão de resultados mostra. Não leva nada secreto: em alvos secretos (criaturas do
 * mestre) `ac` e `hpText` ficam vazios.
 */
export interface AttackResult {
  attacker: string;
  target: string;
  title: string;
  natural: number;
  bonus: number;
  mapPenalty: number;
  total: number;
  /** CA usada na jogada (com flanqueio, se aplicado); ausente se o alvo é secreto. */
  ac?: number;
  /** Presente se o jogador marcou flanqueio: `applied` = false quando o alvo já estava Desprevenido/Caído. */
  flank?: { applied: boolean };
  degree: Degree;
  damage?: {
    formula: string;
    /** Valor rolado (já com o bônus fixo), antes de dobrar. */
    rolled: number;
    /** Valor aplicado (dobrado em acerto crítico). */
    total: number;
    crit: boolean;
    type: string;
    absorbed: number;
    hpText: string | null;
    dropped: boolean;
    /** Ajustes por imunidade, fraqueza ou resistência. */
    adjust?: string[];
  };
  /** Ataque de magia ou similar: acertou, mas o dano é rolado à parte. */
  damageNotAutomated?: boolean;
}

export const hit = (r: AttackResult) => r.degree === "success" || r.degree === "crit-success";

/** Resumo em texto (linha de status). */
export function describeResult(r: AttackResult): string {
  const vs = r.ac !== undefined ? ` (${r.total} contra CA ${r.ac})` : "";
  if (!hit(r)) return `${r.attacker} errou ${r.target} com ${r.title}${vs}.`;
  if (!r.damage) return `${r.attacker} acertou ${r.target} com ${r.title} (${DEGREE_TEXT[r.degree]}).`;
  const d = r.damage;
  const hp = d.hpText ? ` ${d.hpText}.` : "";
  const down = d.dropped ? ` ${r.target} caiu!` : "";
  return `${r.attacker} ${d.crit ? "acertou em cheio" : "acertou"} ${r.target} com ${r.title}: ${d.total} de dano${d.type ? ` ${d.type}` : ""}.${hp}${down}`;
}

/** Rola o ataque contra a CA do alvo e, se acertar, rola e aplica o dano. */
export async function resolveAgainst(spec: AttackSpec, target: Target): Promise<AttackResult> {
  const as = spec.attackerColor
    ? { name: spec.attackerName, color: spec.attackerColor }
    : undefined;
  const map = spec.mapPenalty > 0 ? ` (ataques múltiplos −${spec.mapPenalty})` : "";

  // Flanqueio: Desprevenido (−2 de circunstância). Não acumula com Desprevenido ou Caído já ativos.
  let ac = target.ac;
  let flank: { applied: boolean } | undefined;
  if (spec.flanking) {
    const already = (target.conditions?.["off-guard"] ?? 0) > 0 || (target.conditions?.prone ?? 0) > 0;
    flank = { applied: !already };
    if (!already) ac -= FLANK_PENALTY;
  }
  const flankText = flank ? (flank.applied ? " (alvo flanqueado: CA −2)" : " (alvo flanqueado, já Desprevenido)") : "";

  const roll = await publishRoll({
    title: `${spec.title} → ${target.name}${map}${flankText}`,
    count: 1,
    sides: 20,
    mod: spec.bonus - spec.mapPenalty,
    dc: ac,
    hideTarget: target.secret,
    as,
  });

  const result: AttackResult = {
    attacker: spec.attackerName,
    target: target.name,
    title: spec.title,
    natural: roll.rolls[0],
    bonus: spec.bonus,
    mapPenalty: spec.mapPenalty,
    total: roll.total,
    ac: target.secret ? undefined : ac,
    flank,
    degree: roll.degree ?? "failure",
  };

  const against = target.secret ? "" : ` (${roll.total} contra CA ${ac})`;
  if (!hit(result)) {
    await publishEvent(`errou ${target.name} com ${spec.title}${against}.`, as);
    return result;
  }

  const crit = result.degree === "crit-success";
  if (!spec.damage) {
    result.damageNotAutomated = true;
    await publishEvent(`acertou ${target.name} com ${spec.title} (${DEGREE_TEXT[result.degree]}).`, as);
    return result;
  }

  const dmg = await publishRoll({
    title: `${spec.title} (dano${crit ? " crítico, dobrado" : ""})`,
    count: spec.damage.dice,
    sides: spec.damage.die,
    mod: spec.damage.bonus,
    as,
  });
  const multiplied = crit ? dmg.total * 2 : dmg.total;
  const adj = adjustDamage(multiplied, spec.damage.type, target.defenses, crit);
  const total = adj.final;
  const r = await target.applyDamage(total);
  result.damage = {
    formula: formulaText(spec.damage.dice, spec.damage.die, spec.damage.bonus),
    rolled: dmg.total,
    total,
    crit,
    type: spec.damage.type,
    absorbed: r.absorbed,
    hpText: r.hpText,
    dropped: r.dropped,
    adjust: adj.changed ? (target.secret ? [SECRET_ADJUST] : adj.notes) : undefined,
  };

  const parts = [`${total} de dano${spec.damage.type ? ` ${spec.damage.type}` : ""}`];
  if (adj.changed) parts.push(target.secret ? SECRET_ADJUST : adj.notes.join("; "));
  if (r.absorbed > 0) parts.push(`${r.absorbed} absorvido(s) pelos PV temporários`);
  const hp = r.hpText ? ` ${r.hpText}.` : "";
  const down = r.dropped ? ` ${target.name} caiu!` : "";
  const verb = crit ? "acertou em cheio" : "acertou";
  await publishEvent(`${verb} ${target.name} com ${spec.title}: ${parts.join(", ")}.${hp}${down}`, as);
  return result;
}

/** Ataque contra um token vinculado a uma ficha de jogador (CA e PV na sala). */
export async function resolveAttack(
  spec: AttackSpec,
  targetPbId: string,
  targetName: string,
): Promise<AttackResult> {
  const st = await loadState(targetPbId);
  if (!st || st.ac === undefined) {
    throw new Error(
      `${targetName} ainda não tem CA registrada na sala. Reimporte a ficha dele na aba Ficha.`,
    );
  }
  return resolveAgainst(spec, {
    name: targetName,
    ac: st.ac,
    conditions: st.conditions,
    secret: false,
    applyDamage: async (total) => {
      // O alvo pode ter mudado enquanto rolávamos: relê antes de gravar.
      const fresh = (await loadState(targetPbId)) ?? st;
      const r = applyDamage(fresh, total);
      await saveState(targetPbId, r.state);
      return {
        absorbed: r.absorbed,
        toHp: r.toHp,
        dropped: r.dropped,
        hpText: `PV de ${targetName}: ${r.state.hp}/${fresh.max ?? "?"}`,
      };
    },
  });
}
