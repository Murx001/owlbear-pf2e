import OBR from "@owlbear-rodeo/sdk";
import type { Conditions } from "./conditions";
import type { Durations } from "./durations";

/** Estado vivo de cada ficha, guardado nos metadados da sala (compartilhado com todos). */
const KEY = "com.owlbear-pf2e/state";

export interface CharState {
  hp: number;
  temp: number;
  /** PV máximo efetivo (já com Drenado). Usado pela barra sobre o token. */
  max?: number;
  /** CA efetiva (já com Desprevenido/Caído/Fatigado). Usada no texto sobre o token. */
  ac?: number;
  /** Espaços de magia gastos, por rank ("1", "2"…). */
  slotsUsed?: Record<string, number>;
  /** Pontos de foco gastos. */
  focusUsed?: number;
  conditions: Conditions;
  /** Ajustes manuais do jogador: corrigem dados errados ou efeitos que o sistema não detecta. */
  adj?: { ac?: number; hp?: number };
  /** Quanto tempo falta para cada condição acabar (só as que têm duração contada). */
  durations?: Durations;
}

export type All = Record<string, CharState>;

export function parse(meta: Record<string, unknown>): All {
  const v = meta[KEY];
  return typeof v === "object" && v !== null ? (v as All) : {};
}

/** Dano: os PV temporários absorvem primeiro; só o que sobra vai para os PV. */
export function applyDamage(st: CharState, damage: number) {
  const max = st.max ?? st.hp;
  const hp = Math.min(st.hp, max);
  const absorbed = Math.min(st.temp, damage);
  const toHp = Math.min(hp, damage - absorbed);
  return {
    state: { ...st, temp: st.temp - absorbed, hp: hp - toHp },
    absorbed,
    toHp,
    dropped: hp > 0 && hp - toHp === 0,
  };
}

export async function loadAllStates(): Promise<All> {
  return parse(await OBR.room.getMetadata());
}

export async function loadState(id: string): Promise<CharState | undefined> {
  return parse(await OBR.room.getMetadata())[id];
}

export async function saveState(id: string, st: CharState): Promise<void> {
  const all = parse(await OBR.room.getMetadata());
  await OBR.room.setMetadata({ [KEY]: { ...all, [id]: st } });
}

export function onStateChange(cb: (all: All) => void): () => void {
  return OBR.room.onMetadataChange((meta) => cb(parse(meta)));
}
