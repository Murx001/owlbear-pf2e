import OBR from "@owlbear-rodeo/sdk";
import { describeResult, resolveAgainst, resolveAttack, type AttackResult, type AttackSpec, type Target } from "./attack";
import { CARD_SHARE, type CardData } from "./cardData";
import { showCard } from "./cardView";
import { withConditions } from "./conditions";
import {
  creatureAc,
  damageCreature,
  defensesOf,
  getCreature,
  publicLink,
  upsertCreature,
  type Creature,
  type CreatureAttack,
} from "./creatures";
import { parseDamage } from "./damage";
import { publishEvent } from "./roll";
import { creatureOfToken, linkOfToken } from "./token";

/**
 * Ataque automático de uma criatura do mestre, como o dos jogadores: toca em Atacar, escolhe o
 * token do alvo no mapa e o sistema rola contra a CA, aplica o dano e mostra o cartão.
 */
interface Job {
  creatureId: string;
  attack: CreatureAttack;
  extra: number;
  flanked: boolean;
  /** Avisos e atualização da tela do mestre. */
  say: (text: string) => void;
  done: () => void;
}

let job: Job | null = null;
let confirming = false; // a tela "deseja rolar os dados?" está aberta

/** Como este ataque conta para a penalidade de ataques múltiplos. */
export type CreatureMapMode = "normal" | "none" | "double";
/** A mesma tela de confirmação dos jogadores (bônus nesta rolagem, flanqueio, MAP). */
export type ConfirmAttack = (
  title: string,
  lines: string[],
  targetName: string,
) => Promise<{ ok: boolean; flanked: boolean; bonus: number; map: CreatureMapMode }>;
let confirmFn: ConfirmAttack | null = null;
/** Avisa a tela quando um ataque de criatura começa/termina a esperar o alvo (para mostrar a mesma faixa dos jogadores). */
let watcher: ((title: string | null) => void) | null = null;
export const watchCreatureAttack = (fn: (title: string | null) => void) => void (watcher = fn);
export const setCreatureConfirm = (fn: ConfirmAttack) => void (confirmFn = fn);

/** Ataques que cada criatura já fez neste turno (para a penalidade de ataques múltiplos). */
const counts = new Map<string, number>();
export const attacksMade = (id: string) => counts.get(id) ?? 0;
export const resetCreatureMap = (id: string) => void counts.delete(id);
export const resetCreatureMaps = () => counts.clear();

/** Penalidade de ataques múltiplos da criatura: −5/−10, ou −4/−8 em ataques ágeis. */
export function creatureMapPenalty(n: number, a: CreatureAttack): number {
  const agile = a.traits.some((t) => t.toLowerCase() === "agile");
  return agile ? Math.min(8, n * 4) : Math.min(10, n * 5);
}

export const creatureAttackActive = (id?: string) => job !== null && (id === undefined || job.creatureId === id);

export function beginCreatureAttack(
  c: Creature,
  attack: CreatureAttack,
  opts: { extra: number; flanked: boolean } = { extra: 0, flanked: false },
  say: (text: string) => void,
  done: () => void,
) {
  job = { creatureId: c.id, attack, ...opts, say, done };
  watcher?.(attack.name);
  say(`${attack.name}: selecione no mapa o token do alvo.`);
}

export function cancelCreatureAttack() {
  job = null;
  watcher?.(null);
}

/** Alvo criatura: a CA e os PV ficam no navegador do mestre (resultado secreto). */
function creatureTarget(id: string): Target | null {
  const c = getCreature(id);
  if (!c) return null;
  return {
    name: publicLink(c).name,
    ac: creatureAc(c).value,
    conditions: c.conditions,
    secret: true,
    defenses: defensesOf(c),
    applyDamage: async (total) => {
      const fresh = getCreature(id) ?? c;
      const r = damageCreature(fresh, total);
      upsertCreature(r.creature);
      return { absorbed: r.absorbed, toHp: r.toHp, dropped: r.dropped, hpText: null };
    },
  };
}

/**
 * Chamado quando a seleção do mestre muda. Devolve true se há um ataque esperando alvo (então o
 * painel não deve abrir fichas por causa dessa seleção).
 */
export async function creatureAttackSelection(ids: string[]): Promise<boolean> {
  const j = job;
  if (!j) return false;
  if (confirming || ids.length !== 1) return true;
  const c = getCreature(j.creatureId);
  if (!c) {
    job = null;
    watcher?.(null);
    return false;
  }
  const tokenId = ids[0];
  if (tokenId === c.tokenId) return true; // ainda é o token de quem ataca

  const tc = await creatureOfToken(tokenId);
  const pc = tc ? undefined : await linkOfToken(tokenId);
  if (!tc && !pc?.pathbuilderId) {
    j.say("Esse token não tem ficha nem criatura vinculada, então não sei a CA dele. Escolha outro.");
    return true;
  }
  const target = tc ? creatureTarget(tc.id) : null;
  if (tc && !target) {
    j.say("Essa criatura não está no bestiário deste navegador. Vincule o token de novo.");
    return true;
  }

  const n = attacksMade(c.id);
  const penalty = creatureMapPenalty(n, j.attack);
  const parsed = parseDamage(j.attack.damage);
  const base = withConditions(j.attack.bonus, c.conditions ?? {}, { isAttack: true }).value + j.extra;

  // Pergunta antes de rolar, como nos ataques dos jogadores; cancelar mantém o ataque para outro alvo.
  let answer: { flanked: boolean; bonus: number; map: CreatureMapMode } = { flanked: j.flanked, bonus: 0, map: "normal" };
  if (confirmFn) {
    const next = creatureMapPenalty(n + 1, j.attack);
    const lines = [
      `Alvo: ${tc?.name ?? pc!.name}`,
      `Ataque: d20 ${base >= 0 ? "+" : "−"}${Math.abs(base)}${penalty ? ` −${penalty} (ataques múltiplos)` : ""}`,
      `Ataque nº ${n + 1}: MAP ${penalty ? `−${penalty}` : "0"} · o próximo terá ${next ? `−${next}` : "0"}`,
    ];
    if (parsed) lines.push(`Dano: ${parsed.dice}d${parsed.die}${parsed.bonus ? (parsed.bonus > 0 ? `+${parsed.bonus}` : String(parsed.bonus)) : ""}${parsed.type ? ` ${parsed.type}` : ""}`);
    confirming = true;
    const a = await confirmFn(j.attack.name, lines, tc?.name ?? pc!.name).finally(() => (confirming = false));
    if (!a.ok) {
      j.say(`${j.attack.name}: escolha outro alvo no mapa ou cancele.`);
      return true;
    }
    answer = { flanked: a.flanked, bonus: a.bonus, map: a.map };
  }
  job = null;
  watcher?.(null);
  const bonus = base + answer.bonus;
  const spec: AttackSpec = {
    attackerName: publicLink(c).name,
    attackerColor: await OBR.player.getColor(),
    title: j.attack.name,
    bonus,
    mapPenalty: answer.map === "none" ? 0 : penalty,
    damage: parsed ? { dice: parsed.dice, die: parsed.die, bonus: parsed.bonus, type: parsed.type } : undefined,
    flanking: answer.flanked,
  };
  try {
    const result: AttackResult = tc
      ? await resolveAgainst(spec, target!)
      : await resolveAttack(spec, pc!.pathbuilderId, pc!.name);
    // Sem MAP: não conta como ataque. Conta como 2: o contador avança em dobro.
    const made = n + (answer.map === "none" ? 0 : answer.map === "double" ? 2 : 1);
    counts.set(c.id, made);
    const card: CardData = { kind: "attack", result, nextPenalty: creatureMapPenalty(made, j.attack) };
    void showCard(card);
    // O ataque de uma criatura é público: o cartão aparece para todos (o alvo secreto não vaza a CA).
    void OBR.broadcast.sendMessage(CARD_SHARE, { ...card, sharedBy: "Mestre" }, { destination: "REMOTE" });
    j.say(
      `${describeResult(result)}${parsed?.partial ? " (só o primeiro dado de dano foi automatizado)" : ""}${
        parsed ? "" : " (o dano desta criatura não pôde ser lido: role à mão)"
      }`,
    );
    void publishEvent(`${spec.attackerName} atacou ${result.target} com ${spec.title}.`).catch(() => undefined);
  } catch (e) {
    j.say(e instanceof Error ? e.message : "Não foi possível resolver o ataque.");
  }
  j.done();
  return true;
}
