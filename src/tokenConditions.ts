import OBR from "@owlbear-rodeo/sdk";
import { COND_BY_KEY } from "./conditions";
import { getCreature, upsertCreature } from "./creatures";
import { pruneDurations } from "./durations";
import { loadState, saveState } from "./state";
import { CREATURE_KEY, LINK_KEY, isCreatureLink, isLink } from "./token";

/** Um token com ficha de jogador ou criatura, e as condições dele agora. */
export interface CondTarget {
  tokenId: string;
  kind: "creature" | "pc";
  id: string;
  name: string;
  conditions: Record<string, number>;
}

/** Condições de uma lista de tokens (tokens sem ficha nem criatura vinculada ficam de fora). */
export async function loadTargets(tokenIds: string[]): Promise<CondTarget[]> {
  const items = await OBR.scene.items.getItems(tokenIds);
  const out: CondTarget[] = [];
  for (const item of items) {
    const cl = item.metadata[CREATURE_KEY];
    const pl = item.metadata[LINK_KEY];
    if (isCreatureLink(cl)) {
      const c = getCreature(cl.id);
      if (c) out.push({ tokenId: item.id, kind: "creature", id: c.id, name: c.name, conditions: { ...(c.conditions ?? {}) } });
    } else if (isLink(pl)) {
      const st = await loadState(pl.pathbuilderId);
      if (st) out.push({ tokenId: item.id, kind: "pc", id: pl.pathbuilderId, name: pl.name, conditions: { ...(st.conditions ?? {}) } });
    }
  }
  return out;
}

/** Valor novo da condição: zero (ou menos) a remove; condição sem valor vale 1. */
export function withCondition(current: Record<string, number>, key: string, value: number): Record<string, number> {
  const next = { ...current };
  const v = COND_BY_KEY.get(key)?.valued === false ? Math.min(1, value) : value;
  if (v <= 0) delete next[key];
  else next[key] = v;
  return next;
}

/** Aplica o valor a todos os alvos. Valor zero tira a condição (e a contagem de tempo dela). */
export async function setConditionOn(targets: CondTarget[], key: string, value: number): Promise<void> {
  for (const t of targets) {
    const next = withCondition(t.conditions, key, value);
    if (t.kind === "creature") {
      const c = getCreature(t.id);
      if (c) upsertCreature({ ...c, conditions: next, durations: pruneDurations(next, c.durations) });
    } else {
      const st = await loadState(t.id);
      if (st) await saveState(t.id, { ...st, conditions: next, durations: pruneDurations(next, st.durations) });
    }
  }
}
