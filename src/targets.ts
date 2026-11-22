import { withConditions } from "./conditions";
import { toDuration, type Durations } from "./durations";
import { fetchBuild, toCharacter } from "./pathbuilder";
import type { SaveTarget } from "./saveSpell";
import { applyDamage, loadState, saveState } from "./state";

const builds = new Map<string, ReturnType<typeof toCharacter>>();

/** Alvo que é ficha de jogador: a salvaguarda vem da ficha dele (Pathbuilder) e das condições na sala. */
export function pcSaveTarget(pbId: string, name: string): SaveTarget {
  return {
    name,
    async saveMod(stat) {
      let ch = builds.get(pbId);
      if (!ch) {
        ch = toCharacter(await fetchBuild(pbId), pbId);
        builds.set(pbId, ch);
      }
      const s = ch.saves.find((x) => x.key === stat);
      if (!s) throw new Error("Salvaguarda não encontrada na ficha do alvo.");
      const st = await loadState(pbId);
      return withConditions(s.total, st?.conditions ?? {}, { ability: s.ability, isSave: true }).value;
    },
    async perceptionMod() {
      let ch = builds.get(pbId);
      if (!ch) {
        ch = toCharacter(await fetchBuild(pbId), pbId);
        builds.set(pbId, ch);
      }
      const st = await loadState(pbId);
      return withConditions(ch.perception.total, st?.conditions ?? {}, { ability: ch.perception.ability }).value;
    },
    async applyDamage(total) {
      const st = await loadState(pbId);
      if (!st) throw new Error(`${name} ainda não tem estado na sala. Reimporte a ficha dele.`);
      const r = applyDamage(st, total);
      await saveState(pbId, r.state);
      return {
        absorbed: r.absorbed,
        toHp: r.toHp,
        dropped: r.dropped,
        hpText: `PV de ${name}: ${r.state.hp}/${st.max ?? "?"}`,
      };
    },
    async applyHealing(total) {
      const st = await loadState(pbId);
      if (!st) throw new Error(`${name} ainda não tem estado na sala. Reimporte a ficha dele.`);
      const max = st.max ?? st.hp;
      const hp = Math.min(max, st.hp + total);
      await saveState(pbId, { ...st, hp });
      return `PV de ${name}: ${hp}/${max}`;
    },
    async applyTempHp(amount) {
      const st = await loadState(pbId);
      if (!st) throw new Error(`${name} ainda não tem estado na sala. Reimporte a ficha dele.`);
      const temp = Math.max(st.temp, amount); // PV temporários não acumulam: vale o maior
      await saveState(pbId, { ...st, temp });
      return `PV de ${name}: ${st.hp}/${st.max ?? "?"} (+${temp} temporários)`;
    },
    async applyConditions(list, sourceId) {
      const st = await loadState(pbId);
      if (!st) return;
      // O valor só sobe: reaplicar uma condição menor não reduz a que já existe.
      const next = { ...st.conditions };
      const durations: Durations = { ...(st.durations ?? {}) };
      for (const c of list) {
        next[c.key] = Math.max(next[c.key] ?? 0, c.value);
        if (c.duration) durations[c.key] = toDuration(c.duration, sourceId, durations[c.key]);
      }
      await saveState(pbId, {
        ...st,
        conditions: next,
        durations: Object.keys(durations).length > 0 ? durations : undefined,
      });
    },
  };
}
