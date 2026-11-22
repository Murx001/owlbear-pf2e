import OBR from "@owlbear-rodeo/sdk";
import { resolveAgainst, type AttackResult, type AttackSpec } from "./attack";
import {
  creatureAc,
  creatureSave,
  damageCreature,
  defensesOf,
  getCreature,
  upsertCreature,
  type Creature,
} from "./creatures";
import { toDuration, type Durations } from "./durations";
import { publishEvent } from "./roll";
import {
  resolveAutoSpell,
  resolveHealSpell,
  resolveSaveSpell,
  resolveTempSpell,
  type SaveTarget,
  type SpellCast,
  type SpellTargetResult,
} from "./saveSpell";

/**
 * Ataques contra criaturas são resolvidos no navegador do mestre, onde ficam a CA e os PV.
 * O jogador só envia o pedido e recebe o resultado pelo histórico da sala.
 */
const REQ = "pf2e.dice/attack-request";
const SPELL_REQ = "pf2e.dice/spell-request";
const ACK = "pf2e.dice/attack-ack";
const ATTACK_RESULT = "pf2e.dice/attack-result";
const SPELL_RESULT = "pf2e.dice/spell-result";
const WAIT_MS = 6000;

interface AttackRequest {
  requestId: string;
  spec: AttackSpec;
  creatureId: string;
}

/* ---------- lado do jogador (e do mestre, quando ele mesmo ataca) ---------- */
const waiting = new Map<string, (ok: boolean) => void>();
const results = new Map<string, (r: AttackResult | null) => void>();
const spellResults = new Map<string, (r: SpellTargetResult[]) => void>();
const RESULT_WAIT_MS = 15000;

export function listenAttackAcks() {
  OBR.broadcast.onMessage(ACK, (event) => {
    const id = (event.data as { requestId: string }).requestId;
    waiting.get(id)?.(true);
    waiting.delete(id);
  });
  OBR.broadcast.onMessage(ATTACK_RESULT, (event) => {
    const m = event.data as { requestId: string; result: AttackResult | null };
    results.get(m.requestId)?.(m.result);
    results.delete(m.requestId);
  });
  OBR.broadcast.onMessage(SPELL_RESULT, (event) => {
    const m = event.data as { requestId: string; results: SpellTargetResult[] };
    spellResults.get(m.requestId)?.(m.results);
    spellResults.delete(m.requestId);
  });
}

/**
 * Envia o ataque ao mestre e espera o resultado (sem CA nem PV da criatura).
 * `online: false` = ninguém respondeu a tempo (mestre offline?).
 */
export async function sendCreatureAttack(
  spec: AttackSpec,
  creatureId: string,
): Promise<{ online: boolean; result: AttackResult | null }> {
  const requestId = crypto.randomUUID();
  const ack = new Promise<boolean>((resolve) => {
    waiting.set(requestId, resolve);
    window.setTimeout(() => {
      if (waiting.delete(requestId)) resolve(false);
    }, WAIT_MS);
  });
  const result = new Promise<AttackResult | null>((resolve) => {
    results.set(requestId, resolve);
    window.setTimeout(() => {
      if (results.delete(requestId)) resolve(null);
    }, RESULT_WAIT_MS);
  });
  const req: AttackRequest = { requestId, spec, creatureId };
  await OBR.broadcast.sendMessage(REQ, req, { destination: "ALL" });
  const online = await ack;
  if (!online) {
    results.delete(requestId);
    return { online: false, result: null };
  }
  return { online: true, result: await result };
}

interface SpellRequest {
  requestId: string;
  cast: SpellCast;
  mode: "save" | "auto" | "heal" | "temp";
  /** Uma ou mais criaturas (cada token tem a sua instância). */
  creatureIds: string[];
  /** Dano/cura já rolado pelo conjurador (uma vez só, para todos os alvos). */
  rolled: number | null;
}

/** Magia contra criaturas: o mestre rola a salvaguarda de cada uma e aplica o resultado. */
export async function sendCreatureSpell(
  cast: SpellCast,
  mode: "save" | "auto" | "heal" | "temp",
  creatureIds: string[],
  rolled: number | null,
): Promise<{ online: boolean; results: SpellTargetResult[] }> {
  const requestId = crypto.randomUUID();
  const ack = new Promise<boolean>((resolve) => {
    waiting.set(requestId, resolve);
    window.setTimeout(() => {
      if (waiting.delete(requestId)) resolve(false);
    }, WAIT_MS);
  });
  const answer = new Promise<SpellTargetResult[]>((resolve) => {
    spellResults.set(requestId, resolve);
    window.setTimeout(() => {
      if (spellResults.delete(requestId)) resolve([]);
    }, RESULT_WAIT_MS);
  });
  const req: SpellRequest = { requestId, cast, mode, creatureIds, rolled };
  await OBR.broadcast.sendMessage(SPELL_REQ, req, { destination: "ALL" });
  const online = await ack;
  if (!online) {
    spellResults.delete(requestId);
    return { online: false, results: [] };
  }
  return { online: true, results: await answer };
}

/** Alvo criatura, lido e gravado no navegador do mestre. */
export function creatureSaveTarget(id: string, fallback: Creature): SaveTarget {
  return {
    name: fallback.name,
    secret: true,
    defenses: defensesOf(fallback),
    async saveMod(stat) {
      const c = getCreature(id) ?? fallback;
      return creatureSave(c, stat).value; // já com as condições (Amedrontado, Desajeitado…)
    },
    async applyDamage(total) {
      const fresh = getCreature(id) ?? fallback;
      const r = damageCreature(fresh, total);
      upsertCreature(r.creature);
      return { absorbed: r.absorbed, toHp: r.toHp, dropped: r.dropped, hpText: null };
    },
    async applyHealing(total) {
      const fresh = getCreature(id) ?? fallback;
      upsertCreature({ ...fresh, hp: Math.min(fresh.hpMax, fresh.hp + total) });
      return null; // os PV da criatura são secretos
    },
    async applyTempHp(amount) {
      const fresh = getCreature(id) ?? fallback;
      upsertCreature({ ...fresh, temp: Math.max(fresh.temp, amount) });
      return null; // os PV da criatura são secretos
    },
    async applyConditions(list, sourceId) {
      const fresh = getCreature(id) ?? fallback;
      const next = { ...(fresh.conditions ?? {}) };
      const durations: Durations = { ...(fresh.durations ?? {}) };
      for (const c of list) {
        next[c.key] = Math.max(next[c.key] ?? 0, c.value);
        if (c.duration) durations[c.key] = toDuration(c.duration, sourceId, durations[c.key]);
      }
      upsertCreature({
        ...fresh,
        conditions: next,
        durations: Object.keys(durations).length > 0 ? durations : undefined,
      });
    },
  };
}

/* ---------- lado do mestre ---------- */
/** Liga o resolvedor no cliente do mestre. `onChange` é chamado quando uma criatura muda. */
export async function startGmResolver(onChange: () => void) {
  if ((await OBR.player.getRole()) !== "GM") return;

  OBR.broadcast.onMessage(SPELL_REQ, async (event) => {
    const req = event.data as SpellRequest;
    await OBR.broadcast.sendMessage(ACK, { requestId: req.requestId }, { destination: "ALL" });
    const as = req.cast.casterColor
      ? { name: req.cast.casterName, color: req.cast.casterColor }
      : undefined;
    // Cada criatura (token) é resolvida separadamente, com a própria salvaguarda, PV e condições.
    const out: SpellTargetResult[] = [];
    for (const id of req.creatureIds) {
      const creature = getCreature(id);
      if (!creature) {
        await publishEvent("tentou usar uma magia, mas um dos alvos não tem dados cadastrados pelo mestre.", as);
        out.push({ target: "Alvo", conditions: [], effect: "", notes: [], error: "sem dados: a criatura não está no bestiário do navegador do mestre (o mestre precisa vincular o token de novo)." });
        continue;
      }
      try {
        const target = creatureSaveTarget(id, creature);
        out.push(
          req.mode === "auto"
            ? await resolveAutoSpell(req.cast, target, req.rolled)
            : req.mode === "heal"
              ? await resolveHealSpell(req.cast, target, req.rolled)
              : req.mode === "temp"
                ? await resolveTempSpell(req.cast, target, req.rolled)
                : await resolveSaveSpell(req.cast, target, req.rolled),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "A magia não pôde ser resolvida.";
        await publishEvent(msg, as);
        out.push({ target: creature.name, conditions: [], effect: "", notes: [], error: msg });
      }
    }
    onChange();
    // Os resultados já saem sem PV (alvos secretos): só o que o jogador pode saber.
    await OBR.broadcast.sendMessage(
      SPELL_RESULT,
      { requestId: req.requestId, results: out },
      { destination: "ALL" },
    );
  });

  OBR.broadcast.onMessage(REQ, async (event) => {
    const req = event.data as AttackRequest;
    await OBR.broadcast.sendMessage(ACK, { requestId: req.requestId }, { destination: "ALL" });

    const creature = getCreature(req.creatureId);
    const as = req.spec.attackerColor
      ? { name: req.spec.attackerName, color: req.spec.attackerColor }
      : undefined;
    if (!creature) {
      await publishEvent("tentou atacar, mas o alvo não tem dados cadastrados pelo mestre.", as);
      await OBR.broadcast.sendMessage(
        ATTACK_RESULT,
        { requestId: req.requestId, result: null },
        { destination: "ALL" },
      );
      return;
    }

    let result: AttackResult | null = null;
    try {
      result = await resolveAgainst(req.spec, {
        name: creature.name,
        ac: creatureAc(creature).value, // CA com as condições (Desprevenido, Caído…)
        conditions: creature.conditions,
        secret: true,
        defenses: defensesOf(creature),
        applyDamage: async (total) => {
          // Relê: a criatura pode ter mudado enquanto os dados rolavam.
          const fresh = getCreature(req.creatureId) ?? creature;
          const r = damageCreature(fresh, total);
          upsertCreature(r.creature);
          return { absorbed: r.absorbed, toHp: r.toHp, dropped: r.dropped, hpText: null };
        },
      });
    } finally {
      onChange();
      // O resultado já vem sem CA e sem PV (alvo secreto): só o que o jogador pode saber.
      await OBR.broadcast.sendMessage(
        ATTACK_RESULT,
        { requestId: req.requestId, result },
        { destination: "ALL" },
      );
    }
  });
}
