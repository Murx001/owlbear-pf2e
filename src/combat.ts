import OBR from "@owlbear-rodeo/sdk";

/** Ordem de iniciativa e turnos, guardada nos metadados da sala (compartilhada). */
const KEY = "com.owlbear-pf2e/combat";

export interface Combatant {
  id: string; // ID do Pathbuilder (personagem) ou aleatório (criatura do mestre)
  name: string;
  value: number;
  pathbuilderId?: string;
}

export interface Combat {
  active: boolean;
  round: number;
  turn: number; // índice em `list`
  list: Combatant[];
}

export const emptyCombat = (): Combat => ({ active: false, round: 0, turn: 0, list: [] });

export function parseCombat(meta: Record<string, unknown>): Combat {
  const v = meta[KEY] as Partial<Combat> | undefined;
  if (!v || !Array.isArray(v.list)) return emptyCombat();
  return {
    active: !!v.active,
    round: v.round ?? 0,
    turn: v.turn ?? 0,
    list: v.list,
  };
}

export async function loadCombat(): Promise<Combat> {
  return parseCombat(await OBR.room.getMetadata());
}

export async function saveCombat(c: Combat): Promise<void> {
  await OBR.room.setMetadata({ [KEY]: c });
}

export function onCombatChange(cb: (c: Combat) => void): () => void {
  return OBR.room.onMetadataChange((meta) => cb(parseCombat(meta)));
}

/** Insere (ou substitui) um combatente mantendo a ordem por valor, do maior para o menor. */
export function addCombatant(c: Combat, entry: Combatant): Combat {
  const currentId = c.active ? c.list[c.turn]?.id : undefined;
  const list = c.list.filter((x) => x.id !== entry.id);
  // Empate: quem já estava na lista fica na frente.
  let at = list.findIndex((x) => x.value < entry.value);
  if (at === -1) at = list.length;
  list.splice(at, 0, entry);
  // Quem está com a vez continua com ela, mesmo que a lista mude.
  const turn = currentId ? Math.max(0, list.findIndex((x) => x.id === currentId)) : c.turn;
  return { ...c, list, turn };
}

export function removeCombatant(c: Combat, id: string): Combat {
  const idx = c.list.findIndex((x) => x.id === id);
  if (idx === -1) return c;
  const list = c.list.filter((x) => x.id !== id);
  let turn = c.turn;
  if (idx < turn) turn -= 1;
  if (turn >= list.length) turn = 0;
  return { ...c, list, turn };
}

/** Avança um turno. Devolve também quem acabou de terminar o turno (se o combate já estava ativo). */
export function nextTurn(c: Combat): { combat: Combat; ended?: Combatant } {
  if (c.list.length === 0) return { combat: c };
  if (!c.active) return { combat: { ...c, active: true, round: 1, turn: 0 } };
  const ended = c.list[c.turn];
  let turn = c.turn + 1;
  let round = c.round;
  if (turn >= c.list.length) {
    turn = 0;
    round += 1;
  }
  return { combat: { ...c, turn, round }, ended };
}

export const endCombat = (c: Combat): Combat => ({ ...c, active: false, round: 0, turn: 0 });
