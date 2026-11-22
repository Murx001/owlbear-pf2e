import type { Ability } from "./character";
import { durationLabel, type Durations } from "./durations";

export interface CondDef {
  key: string;
  pt: string;
  valued: boolean;
}

/** Catálogo da Parte 3 do escopo (nomes PT-BR). Só as marcadas em `calc` mudam números. */
export const CONDITIONS: CondDef[] = [
  { key: "frightened", pt: "Amedrontado", valued: true },
  { key: "sickened", pt: "Enjoado", valued: true },
  { key: "clumsy", pt: "Desajeitado", valued: true },
  { key: "enfeebled", pt: "Enfraquecido", valued: true },
  { key: "stupefied", pt: "Estupefato", valued: true },
  { key: "drained", pt: "Drenado", valued: true },
  { key: "slowed", pt: "Lento", valued: true },
  { key: "stunned", pt: "Atordoado", valued: true },
  { key: "doomed", pt: "Condenado", valued: true },
  { key: "wounded", pt: "Ferido", valued: true },
  { key: "dying", pt: "Morrendo", valued: true },
  { key: "off-guard", pt: "Desprevenido", valued: false },
  { key: "prone", pt: "Caído", valued: false },
  { key: "fatigued", pt: "Fatigado", valued: false },
  { key: "blinded", pt: "Cego", valued: false },
  { key: "dazzled", pt: "Ofuscado", valued: false },
  { key: "deafened", pt: "Surdo", valued: false },
  { key: "concealed", pt: "Ocultado", valued: false },
  { key: "hidden", pt: "Escondido", valued: false },
  { key: "invisible", pt: "Invisível", valued: false },
  { key: "grabbed", pt: "Agarrado", valued: false },
  { key: "immobilized", pt: "Imobilizado", valued: false },
  { key: "restrained", pt: "Contido", valued: false },
  { key: "paralyzed", pt: "Paralisado", valued: false },
  { key: "unconscious", pt: "Inconsciente", valued: false },
  { key: "fleeing", pt: "Fugindo", valued: false },
  { key: "confused", pt: "Confuso", valued: false },
  { key: "petrified", pt: "Petrificado", valued: false },
  { key: "quickened", pt: "Acelerado", valued: false },
  { key: "controlled", pt: "Controlado", valued: false },
  { key: "encumbered", pt: "Sobrecarregado", valued: false },
  { key: "undetected", pt: "Não detectado", valued: false },
  { key: "unnoticed", pt: "Despercebido", valued: false },
  { key: "persistent-damage", pt: "Dano persistente", valued: true },
  /* Bônus de CA (circunstância): o valor é o bônus. Não acumulam entre si, vale o maior. */
  { key: "shield-raised", pt: "Escudo erguido", valued: true },
  { key: "shield-spell", pt: "Magia Escudo", valued: false },
];

export const COND_BY_KEY = new Map(CONDITIONS.map((c) => [c.key, c]));

/** Condição → valor (condições sem valor usam 1). */
export type Conditions = Record<string, number>;

const v = (c: Conditions, k: string) => c[k] ?? 0;

/** Penalidade de *status* (não acumula: vale a maior) sobre um teste. */
export function statusPenalty(c: Conditions, ability?: Ability, isSave = false): number {
  const list = [v(c, "frightened"), v(c, "sickened")];
  if (ability === "dex") list.push(v(c, "clumsy"));
  if (ability === "str") list.push(v(c, "enfeebled"));
  if (ability === "int" || ability === "wis" || ability === "cha") list.push(v(c, "stupefied"));
  if (ability === "con") list.push(v(c, "drained"));
  if (isSave && v(c, "fatigued") > 0) list.push(1);
  return Math.max(0, ...list);
}

export interface ModOpts {
  ability?: Ability;
  isSave?: boolean;
  isAttack?: boolean;
}

/** Aplica as condições a um modificador. `penalty` > 0 indica que houve ajuste. */
export function withConditions(base: number, c: Conditions, o: ModOpts = {}) {
  let penalty = statusPenalty(c, o.ability, o.isSave);
  if (o.isAttack && v(c, "prone") > 0) penalty += 2; // circunstância, tipo diferente: soma
  return { value: base - penalty, penalty };
}

/** CA com condições: desprevenido/caído −2 (circunstância, não acumulam), fatigado −1 (status). */
export function acWithConditions(base: number, c: Conditions) {
  const circ = v(c, "off-guard") > 0 || v(c, "prone") > 0 ? 2 : 0;
  const status = Math.max(statusPenalty(c), v(c, "fatigued") > 0 ? 1 : 0);
  const penalty = circ + status;
  // Bônus de circunstância (escudo erguido, magia Escudo): não acumulam, vale o maior.
  const bonus = Math.max(v(c, "shield-raised"), v(c, "shield-spell") > 0 ? 1 : 0);
  return { value: base - penalty + bonus, penalty, bonus };
}

/** Condição "drenado" reduz o PV máximo em nível × valor. */
export function hpMaxWithConditions(hpMax: number, level: number, c: Conditions): number {
  return Math.max(1, hpMax - level * v(c, "drained"));
}

/* ---------- tags de condição (sobre o token) ---------- */
const GROUPS: [color: string, keys: string[]][] = [
  ["#c2693a", ["frightened", "sickened", "clumsy", "enfeebled", "stupefied", "drained", "fatigued", "off-guard", "prone"]],
  ["#7c6bd6", ["slowed", "stunned", "paralyzed", "unconscious", "immobilized", "restrained", "grabbed", "fleeing", "confused", "petrified", "controlled", "quickened", "encumbered"]],
  ["#b23a48", ["dying", "wounded", "doomed", "persistent-damage"]],
  ["#3f8f6b", ["shield-raised", "shield-spell"]],
  ["#3d7ca8", ["blinded", "dazzled", "deafened", "concealed", "hidden", "invisible", "undetected", "unnoticed"]],
];

export interface ConditionTag {
  text: string;
  color: string;
}

/** Texto e cor da fichinha de uma condição: "Amedrontado 2". Cor por tipo de efeito. */
export function condTag(key: string, value: number): ConditionTag {
  const def = COND_BY_KEY.get(key);
  const name = def?.pt ?? key;
  const color = GROUPS.find(([, keys]) => keys.includes(key))?.[0] ?? "#4a4f66";
  return { text: def?.valued ? `${name} ${value}` : name, color };
}

/** Tags de todas as condições ativas, na ordem em que foram aplicadas. */
export function condTags(conditions: Conditions | undefined, durations?: Durations): ConditionTag[] {
  return Object.entries(conditions ?? {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => {
      const tag = condTag(k, v);
      const left = durationLabel(durations?.[k]);
      return left ? { ...tag, text: `${tag.text} · ${left}` } : tag;
    });
}
