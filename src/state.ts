import OBR from "@owlbear-rodeo/sdk";
import { acWithConditions, hpMaxWithConditions, type Conditions } from "./conditions";
import type { Durations } from "./durations";
import { hitWhileDown, settle } from "./dying";

/** Estado vivo de cada ficha, guardado nos metadados da sala (compartilhado com todos). */
const KEY = "com.owlbear-pf2e/state";

export interface CharState {
  hp: number;
  temp: number;
  /** PV máximo efetivo (já com Drenado). Usado pela barra sobre o token. */
  max?: number;
  /** CA efetiva (já com Desprevenido/Caído/Fatigado). Usada no texto sobre o token. */
  ac?: number;
  /** Valores sem condições, para recalcular CA e PV máx. sempre que as condições mudam (de quem for). */
  baseAc?: number;
  baseMax?: number;
  level?: number;
  /** Espaços de magia gastos, por rank ("1", "2"…). */
  slotsUsed?: Record<string, number>;
  /** Pontos de foco gastos. */
  focusUsed?: number;
  conditions: Conditions;
  /** Ajustes manuais do jogador: corrigem dados errados ou efeitos que o sistema não detecta. */
  adj?: { ac?: number; hp?: number };
  /** Modos de dano personalizados por arma (ex.: duas mãos 1d12+3). `active` é o modo em uso. */
  dmg?: Record<string, { modes: { label: string; formula: string }[]; active: number }>;
  /** Quanto tempo falta para cada condição acabar (só as que têm duração contada). */
  durations?: Durations;
  /** Estabilizado: 0 PV, inconsciente, sem Morrendo (até receber dano ou ser curado). */
  stable?: boolean;
  /** Chegou ao limite de Morrendo. */
  dead?: boolean;
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
  let next: CharState = { ...st, temp: st.temp - absorbed, hp: hp - toHp };
  // Já a 0 PV e ainda levou dano: Morrendo sobe (ou volta, se estava estabilizado).
  if (hp === 0 && damage > absorbed) next = hitWhileDown(next);
  else next = settle(next, hp);
  return { state: next, absorbed, toHp, dropped: hp > 0 && hp - toHp === 0 };
}

export async function loadAllStates(): Promise<All> {
  return parse(await OBR.room.getMetadata());
}

export async function loadState(id: string): Promise<CharState | undefined> {
  return parse(await OBR.room.getMetadata())[id];
}

/**
 * CA e PV máximo efetivos a partir dos valores base e das condições de agora. Assim, quando uma
 * condição some (acabou o tempo, foi removida), o que ela mudava na ficha e no token some junto.
 */
export function derive(st: CharState): CharState {
  return settle(deriveNumbers(st));
}

function deriveNumbers(st: CharState): CharState {
  if (st.baseAc === undefined && (st.baseMax === undefined || st.level === undefined)) return st;
  const next = { ...st };
  if (st.baseAc !== undefined) next.ac = acWithConditions(st.baseAc, st.conditions).value;
  if (st.baseMax !== undefined && st.level !== undefined) {
    next.max = hpMaxWithConditions(st.baseMax, st.level, st.conditions);
    next.hp = Math.min(next.hp, next.max);
  }
  return next;
}

export async function saveState(id: string, st: CharState): Promise<void> {
  const all = parse(await OBR.room.getMetadata());
  await OBR.room.setMetadata({ [KEY]: { ...all, [id]: derive(st) } });
}

export function onStateChange(cb: (all: All) => void): () => void {
  return OBR.room.onMetadataChange((meta) => cb(parse(meta)));
}
