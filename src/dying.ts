import type { Degree } from "./roll";
import type { CharState } from "./state";

/**
 * Morrendo (Player Core): ao chegar a 0 PV a pessoa fica Inconsciente e Morrendo 1 (+ o valor de
 * Ferido). Morre ao chegar a Morrendo 4 (menos o valor de Condenado). No início do turno dela faz um
 * teste de recuperação (teste simples contra CD 10 + Morrendo). Curada a mais de 0 PV, perde Morrendo
 * e ganha Ferido 1 (ou +1).
 */
export const DEATH_AT = 4;

/** Valor de Morrendo em que morre (Condenado reduz). */
export const deathLimit = (conditions: Record<string, number>) => Math.max(1, DEATH_AT - (conditions.doomed ?? 0));

/** Quanto o teste de recuperação muda o valor de Morrendo. */
export const RECOVERY_DELTA: Record<Degree, number> = {
  "crit-success": -2,
  success: -1,
  failure: 1,
  "crit-failure": 2,
};

/** CD do teste de recuperação. */
export const recoveryDc = (dying: number) => 10 + dying;

/**
 * Deixa o estado coerente com os PV: caiu a 0 → Morrendo; curado → Morrendo some e Ferido sobe;
 * Morrendo no limite → morto. `before` = PV de antes (para saber se acabou de cair).
 */
export function settle(st: CharState, before?: number): CharState {
  const conds = { ...st.conditions };
  const next: CharState = { ...st, conditions: conds };
  const dying = conds.dying ?? 0;
  const wasDown = dying > 0 || !!st.stable || !!st.dead;

  if (st.hp > 0) {
    if (wasDown) {
      if (dying > 0) conds.wounded = (conds.wounded ?? 0) + 1;
      delete conds.dying;
      delete conds.unconscious;
    }
    delete next.stable;
    delete next.dead;
    return next;
  }

  if (before !== undefined && before > 0 && !wasDown) {
    conds.dying = 1 + (conds.wounded ?? 0);
    conds.unconscious = 1;
  }
  if ((conds.dying ?? 0) >= deathLimit(conds)) {
    next.dead = true;
    conds.unconscious = 1;
  }
  return next;
}

/** Levou dano com 0 PV: Morrendo +1 (+2 se o golpe foi crítico); estabilizado volta a Morrendo. */
export function hitWhileDown(st: CharState, crit = false): CharState {
  if (st.dead) return st;
  const conds = { ...st.conditions };
  const next: CharState = { ...st, conditions: conds };
  if ((conds.dying ?? 0) > 0) conds.dying = conds.dying + (crit ? 2 : 1);
  else {
    conds.dying = 1 + (conds.wounded ?? 0) + (crit ? 1 : 0);
    conds.unconscious = 1;
  }
  delete next.stable;
  return settle(next);
}

/** Resultado do teste de recuperação aplicado ao estado. */
export function applyRecovery(st: CharState, degree: Degree): { state: CharState; text: string } {
  const dying = st.conditions.dying ?? 0;
  const conds = { ...st.conditions };
  const next: CharState = { ...st, conditions: conds };
  const value = dying + RECOVERY_DELTA[degree];
  if (value <= 0) {
    delete conds.dying;
    conds.wounded = (conds.wounded ?? 0) + 1; // perdeu Morrendo recuperando-se com 0 PV
    next.stable = true;
    return { state: next, text: `Morrendo some: você estabiliza (inconsciente com 0 PV) e fica Ferido ${conds.wounded}.` };
  }
  conds.dying = value;
  const settled = settle(next);
  return {
    state: settled,
    text: settled.dead ? `Morrendo ${value}: você morre.` : `Morrendo agora é ${value} (morre em ${deathLimit(conds)}).`,
  };
}

/** Estabilizar (Primeiros Socorros) ou Recuperação Heroica: Morrendo some, continua com 0 PV inconsciente. */
export function stabilize(st: CharState): CharState {
  const conds = { ...st.conditions };
  delete conds.dying;
  conds.unconscious = 1;
  const next: CharState = { ...st, conditions: conds, stable: true };
  delete next.dead;
  return next;
}
