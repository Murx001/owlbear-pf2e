import OBR from "@owlbear-rodeo/sdk";
import type { Character } from "./character";
import {
  addCombatant,
  emptyCombat,
  endCombat,
  loadCombat,
  nextTurn,
  onCombatChange,
  removeCombatant,
  saveCombat,
  type Combat,
  type Combatant,
} from "./combat";
import { COND_BY_KEY, withConditions } from "./conditions";
import { tickDurations, type DurationHost, type TickEvent } from "./durations";
import { showCard } from "./cardView";
import { goToToken, tokenForCombatant } from "./focusToken";
import { getCreature, loadCreatures, upsertCreature } from "./creatures";
import { resetCreatureMaps } from "./creatureAttack";
import { publishEvent, publishRoll } from "./roll";
import { loadAllStates, loadState, saveState, type CharState } from "./state";

export interface CombatDeps {
  getCharacter(): Character | null;
  getState(): CharState;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, onClick: () => void, cls?: string) {
  const b = el("button", cls, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

/** Ao fim do turno, Amedrontado cai 1 (regra da Parte 3 do escopo). */
/** Efeitos de uma troca de turno: Amedrontado cai no fim do turno e as durações são contadas. */
async function applyTurnEffects(combat: Combat, ended: Combatant | undefined, now: Combatant | undefined) {
  if (ended?.pathbuilderId) await endOfTurnEffects(ended.pathbuilderId, ended.name);
  else if (ended) await endOfTurnCreature(ended.id, ended.name);
  await tickDurationsOnTurn(combat, ended, now);
}

/**
 * Conta as durações das condições a cada troca de turno: fim do turno de quem terminou e início do
 * turno de quem começa. Condições que chegam a zero são removidas e a sala é avisada.
 */
async function tickDurationsOnTurn(combat: Combat, ended: Combatant | undefined, now: Combatant | undefined) {
  const inCombat = new Set(combat.list.map((c) => c.id));
  const nameOf = (id: string, fallback: string) => combat.list.find((c) => c.id === id)?.name ?? fallback;
  const events: TickEvent[] = [];
  if (ended) events.push({ type: "end", id: ended.id });
  if (now) events.push({ type: "start", id: now.id });

  for (const ev of events) {
    // Fichas de jogador (estado na sala)
    const states = await loadAllStates().catch(() => ({}) as Awaited<ReturnType<typeof loadAllStates>>);
    const pcHosts: DurationHost[] = Object.entries(states).map(([id, st]) => ({
      id,
      name: nameOf(id, id),
      conditions: st.conditions ?? {},
      durations: st.durations,
    }));
    for (const r of tickDurations(pcHosts, ev, inCombat)) {
      const st = states[r.host.id];
      await saveState(r.host.id, { ...st, conditions: r.host.conditions, durations: r.host.durations });
      await announceExpired(r.host.name, r.expired);
    }
    // Criaturas do mestre (dados neste navegador)
    const creatures = loadCreatures();
    const crHosts: DurationHost[] = creatures.map((c) => ({
      id: c.id,
      name: c.name,
      conditions: c.conditions ?? {},
      durations: c.durations,
    }));
    for (const r of tickDurations(crHosts, ev, inCombat)) {
      const c = creatures.find((x) => x.id === r.host.id)!;
      upsertCreature({ ...c, conditions: r.host.conditions, durations: r.host.durations });
      await announceExpired(r.host.name, r.expired);
    }
  }
}

async function announceExpired(name: string, keys: string[]) {
  for (const k of keys) await publishEvent(`${name}: ${COND_BY_KEY.get(k)?.pt ?? k} terminou.`);
}

/** O mesmo para criaturas do mestre (os dados estão neste navegador, o do mestre). */
async function endOfTurnCreature(id: string, name: string) {
  const c = getCreature(id);
  const value = c?.conditions?.frightened ?? 0;
  if (!c || value <= 0) return;
  const next = { ...c.conditions };
  if (value - 1 <= 0) delete next.frightened;
  else next.frightened = value - 1;
  upsertCreature({ ...c, conditions: next });
  await publishEvent(
    value - 1 > 0 ? `${name}: Amedrontado cai para ${value - 1}.` : `${name}: Amedrontado terminou.`,
  );
}

async function endOfTurnEffects(pathbuilderId: string, name: string) {
  const st = await loadState(pathbuilderId).catch(() => undefined);
  const value = st?.conditions.frightened ?? 0;
  if (!st || value <= 0) return;
  const next = value - 1;
  if (next <= 0) delete st.conditions.frightened;
  else st.conditions.frightened = next;
  await saveState(pathbuilderId, st);
  await publishEvent(
    next > 0
      ? `${name}: Amedrontado cai para ${next}.`
      : `${name}: Amedrontado terminou.`,
  );
}

export async function initCombat(root: HTMLElement, deps: CombatDeps) {
  const isGM = (await OBR.player.getRole()) === "GM";
  let combat: Combat = await loadCombat().catch(emptyCombat);
  let message = "";

  const write = async (next: Combat) => {
    combat = next;
    render();
    await saveCombat(next).catch(() => {
      message = "Não foi possível salvar o combate na sala.";
      render();
    });
  };

  function render() {
    root.replaceChildren();

    // Cabeçalho
    const head = el("div", "head-card");
    const cur = combat.active ? combat.list[combat.turn] : undefined;
    head.append(
      el("h3", undefined, combat.active ? `Rodada ${combat.round}` : "Combate parado"),
      el("p", "sub", cur ? `Turno de ${cur.name}` : "Role a iniciativa para entrar no combate."),
    );
    root.append(head);

    // Controles do mestre
    if (isGM) {
      const row = el("div", "import");
      row.append(
        button(combat.active ? "Próximo turno" : "Iniciar combate", async () => {
          const r = nextTurn(combat);
          if (r.combat.round !== combat.round || !r.combat.active) resetCreatureMaps();
          await write(r.combat);
          const now = r.combat.list[r.combat.turn];
          await applyTurnEffects(r.combat, r.ended, now);
          if (now) await publishEvent(`Rodada ${r.combat.round}: turno de ${now.name}.`);
        }),
        ...(combat.active
          ? [
              button("Próximo round", async () => {
                // Passa por todos os turnos que faltam, contando as condições de cada um, e começa
                // o round seguinte. O MAP de todos volta ao 1º ataque (o round mudou).
                let c = combat;
                const startRound = c.round;
                for (let guard = 0; c.round === startRound && guard < 200; guard++) {
                  const r = nextTurn(c);
                  c = r.combat;
                  await applyTurnEffects(c, r.ended, c.list[c.turn]);
                }
                resetCreatureMaps();
                await write(c);
                const first = c.list[c.turn];
                await publishEvent(
                  `Rodada ${c.round} começou${first ? `: turno de ${first.name}` : ""}. O MAP de todos foi zerado.`,
                );
              }),
            ]
          : []),
        button("Encerrar", () => write(endCombat(combat))),
        button("Limpar", () => write(emptyCombat())),
      );
      root.append(row);
    }

    // Iniciativa da própria personagem
    const c = deps.getCharacter();
    if (c) {
      const stats = [c.perception, ...c.skills];
      const select = el("select");
      for (const s of stats) select.append(new Option(s.name, s.key));
      const rollBtn = button(`Rolar iniciativa de ${c.name}`, async () => {
        const stat = stats.find((s) => s.key === select.value) ?? c.perception;
        const { value } = withConditions(stat.total, deps.getState().conditions, {
          ability: stat.ability,
        });
        const msg = await publishRoll({
          title: `Iniciativa (${stat.name})`,
          count: 1,
          sides: 20,
          mod: value,
        });
        void showCard({ kind: "check", msg });
        await write(
          addCombatant(combat, {
            id: c.pathbuilderId ?? c.name,
            name: c.name,
            value: msg.total,
            pathbuilderId: c.pathbuilderId,
          }),
        );
      });
      const row = el("div", "import");
      row.append(select, rollBtn);
      root.append(row);
    } else {
      root.append(el("p", "sub", "Importe uma ficha na aba Ficha para rolar a iniciativa dela."));
    }

    // Criatura do mestre
    if (isGM) {
      const name = el("input");
      name.placeholder = "Criatura";
      const value = el("input");
      value.type = "number";
      value.placeholder = "Inic.";
      value.style.width = "70px";
      const add = button("Adicionar", async () => {
        const v = parseInt(value.value, 10);
        if (!name.value.trim() || !Number.isFinite(v)) return;
        await write(
          addCombatant(combat, {
            id: `npc-${crypto.randomUUID()}`,
            name: name.value.trim(),
            value: v,
          }),
        );
      });
      const row = el("div", "import");
      row.append(name, value, add);
      root.append(row);
    }

    if (message) root.append(el("p", "status error", message));

    // Ordem de iniciativa
    const list = el("ol", "order");
    combat.list.forEach((x, i) => {
      const li = el("li", combat.active && i === combat.turn ? "current" : undefined);
      const nameEl = el("span", "n", x.name);
      // Tocar no nome leva a tela até o token (e, no celular, fecha o painel).
      nameEl.style.cursor = "pointer";
      nameEl.title = "Ir até o token";
      nameEl.addEventListener("click", async () => {
        try {
          const tokenId = await tokenForCombatant(x);
          if (!tokenId) {
            message = `${x.name} não tem token vinculado no mapa.`;
            render();
            return;
          }
          if (message) {
            message = "";
            render();
          }
          await goToToken(tokenId);
        } catch {
          message = "Não foi possível ir até o token.";
          render();
        }
      });
      li.append(el("span", "v", String(x.value)), nameEl);
      const mine = x.pathbuilderId !== undefined && x.pathbuilderId === deps.getCharacter()?.pathbuilderId;
      if (isGM || mine) {
        li.append(button("×", () => write(removeCombatant(combat, x.id)), "mini"));
      }
      list.append(li);
    });
    root.append(list);
  }

  onCombatChange((next) => {
    combat = next;
    render();
  });
  render();
  return { render };
}
