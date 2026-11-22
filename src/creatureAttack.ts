import OBR from "@owlbear-rodeo/sdk";
import { describeResult, resolveAgainst, resolveAttack, type AttackResult, type AttackSpec, type Target } from "./attack";
import { CARD_SHARE, type CardData } from "./cardData";
import { showCard } from "./cardView";
import { withConditions } from "./conditions";
import {
  creatureAc,
  damageCreature,
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
  opts: { extra: number; flanked: boolean },
  say: (text: string) => void,
  done: () => void,
) {
  job = { creatureId: c.id, attack, ...opts, say, done };
  say(`${attack.name}: selecione no mapa o token do alvo.`);
}

export function cancelCreatureAttack() {
  job = null;
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
  if (ids.length !== 1) return true;
  const c = getCreature(j.creatureId);
  if (!c) {
    job = null;
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

  job = null;
  const n = attacksMade(c.id);
  const penalty = creatureMapPenalty(n, j.attack);
  const parsed = parseDamage(j.attack.damage);
  const bonus = withConditions(j.attack.bonus, c.conditions ?? {}, { isAttack: true }).value + j.extra;
  const spec: AttackSpec = {
    attackerName: publicLink(c).name,
    attackerColor: await OBR.player.getColor(),
    title: j.attack.name,
    bonus,
    mapPenalty: penalty,
    damage: parsed ? { dice: parsed.dice, die: parsed.die, bonus: parsed.bonus, type: parsed.type } : undefined,
    flanking: j.flanked,
  };
  try {
    const result: AttackResult = tc
      ? await resolveAgainst(spec, target!)
      : await resolveAttack(spec, pc!.pathbuilderId, pc!.name);
    counts.set(c.id, n + 1);
    const card: CardData = { kind: "attack", result, nextPenalty: creatureMapPenalty(n + 1, j.attack) };
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
