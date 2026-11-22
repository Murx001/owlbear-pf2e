import OBR from "@owlbear-rodeo/sdk";
import { CARD_SHARE, type CardData } from "./cardData";
import { AREA_ARM, AREA_CLEAR, AREA_RESULT, KIND_PT, type AreaArmMsg, type AreaResultMsg } from "./area";
import { showCard } from "./cardView";
import { type Creature, type CreatureAbility, getCreature, publicLink } from "./creatures";
import { creatureSaveTarget } from "./gmResolver";
import { DEGREE_TEXT, publishEvent } from "./roll";
import {
  describeSpellResult,
  resolveSaveSpell,
  rollSpellDamage,
  type SaveTarget,
  type SpellCast,
  type SpellTargetResult,
} from "./saveSpell";
import type { SpellCondition, SpellData } from "./spellData";
import { pcSaveTarget } from "./targets";
import { creatureOfToken, linkOfToken } from "./token";

/**
 * Habilidade de criatura (ex.: Sopro, Presença Aterradora) usada pelo mestre contra os tokens
 * selecionados no mapa. Reaproveita as regras das magias de salvaguarda: a CD, a salvaguarda de
 * cada alvo, o dano básico (×0, ×½, ×1, ×2) e as condições por grau de sucesso.
 */
export function abilityToSpell(a: CreatureAbility): SpellData {
  const conds: SpellCondition[] = (a.conditions ?? []).map((c) => ({
    key: c.key,
    value: c.value,
    duration:
      c.rounds && c.rounds > 0
        ? { mode: "source-start", rounds: c.rounds, text: `${c.rounds} rodada${c.rounds > 1 ? "s" : ""}` }
        : undefined,
  }));
  const none = { text: "", conditions: [] as SpellCondition[] };
  const failText = a.damage && !a.basic ? `Dano: ${a.damage}${a.damageType ? ` ${a.damageType}` : ""}` : "";
  return {
    name: a.name,
    level: 0,
    traits: [],
    save: a.save ? { stat: a.save, basic: !!a.basic } : undefined,
    attack: false,
    damage: a.damage ? [{ formula: a.damage, type: a.damageType ?? "", applyMod: false }] : [],
    healing: false,
    area: a.area,
    // Condições valem na falha e na falha crítica (o mestre ajusta o valor ao cadastrar).
    outcomes: {
      critSuccess: none,
      success: none,
      failure: { text: failText, conditions: conds },
      critFailure: { text: failText, conditions: conds },
    },
    info: { traits: [], traditions: [], actions: "", description: [] },
  };
}

export const abilityLabel = (a: CreatureAbility) => {
  const parts: string[] = [];
  if (a.save && a.dc) parts.push(`${{ fortitude: "Fort", reflex: "Ref", will: "Vont" }[a.save]} CD ${a.dc}${a.basic ? " básica" : ""}`);
  if (a.damage) parts.push(`${a.damage}${a.damageType ? ` ${a.damageType}` : ""}`);
  if (a.area) parts.push(`${{ burst: "explosão", emanation: "emanação", cone: "cone", line: "linha" }[a.area.kind]} ${a.area.feet} pés`);
  for (const c of a.conditions ?? []) parts.push(`${c.key}${c.value > 1 ? ` ${c.value}` : ""}`);
  return parts.join(" · ");
};

/** A área desenhada some depois de alguns segundos (todos acompanham o resultado). */
const AREA_SHOWN_MS = 8000;
const clearArea = () => void OBR.broadcast.sendMessage(AREA_CLEAR, {}, { destination: "LOCAL" });
const clearAreaLater = (ms = AREA_SHOWN_MS) => void setTimeout(clearArea, ms);

/**
 * Habilidade com área: abre a ferramenta de área no mapa (igual às magias dos jogadores). O mestre
 * posiciona a área (cone e linha saem do token da criatura; a emanação já sai dela) e voltam os
 * tokens que ficaram dentro. `null` se cancelou ou deu erro. A área continua desenhada até o fim.
 */
async function pickArea(c: Creature, a: CreatureAbility, say: (t: string) => void): Promise<string[] | null> {
  const area = a.area!;
  if (area.kind !== "burst" && !c.tokenId) {
    say(`${a.name}: a criatura precisa estar ligada a um token para sair dela (${KIND_PT[area.kind]}).`);
    return null;
  }
  say(
    area.kind === "emanation"
      ? `${a.name}: emanação de ${area.feet} pés ao redor da criatura.`
      : `${a.name}: ${KIND_PT[area.kind]} de ${area.feet} pés. Posicione no mapa (Esc cancela).`,
  );
  return new Promise((resolve) => {
    let off: (() => void) | undefined;
    const timer = setTimeout(() => {
      off?.();
      say(`${a.name}: a área não foi posicionada a tempo.`);
      resolve(null);
    }, 5 * 60 * 1000);
    off = OBR.broadcast.onMessage(AREA_RESULT, (event) => {
      const r = event.data as AreaResultMsg;
      // Erros que não encerram (ex.: fora do alcance) só avisam; o mestre tenta de novo.
      if (r.error && !r.cancelled) {
        say(r.error);
        if (!r.tokenIds || r.tokenIds.length === 0) return;
      }
      clearTimeout(timer);
      off?.();
      resolve(r.cancelled ? null : r.tokenIds);
    });
    const msg: AreaArmMsg = { area, casterTokenId: c.tokenId };
    void OBR.broadcast.sendMessage(AREA_ARM, msg, { destination: "LOCAL" });
  });
}

/** Rola e aplica a habilidade nos tokens dados e mostra o cartão para todos. */
async function runAbility(c: Creature, a: CreatureAbility, picked: string[], say: (t: string) => void): Promise<void> {
  const casterName = publicLink(c).name;
  const spell = abilityToSpell(a);
  const cast: SpellCast = {
    casterName,
    casterId: c.id,
    casterColor: await OBR.player.getColor(),
    spell,
    rank: 1,
    dc: a.dc ?? 10,
    abilityMod: 0,
  };

  // Alvos: fichas de jogador ou criaturas do mestre.
  const targets: { name: string; target: SaveTarget | null }[] = [];
  for (const id of picked) {
    const tc = await creatureOfToken(id);
    if (tc) {
      const data = getCreature(tc.id);
      targets.push({ name: tc.name, target: data ? creatureSaveTarget(tc.id, data) : null });
      continue;
    }
    const pc = await linkOfToken(id);
    if (pc?.pathbuilderId) targets.push({ name: pc.name, target: pcSaveTarget(pc.pathbuilderId, pc.name) });
  }
  if (targets.length === 0) {
    say("Nenhum dos tokens selecionados tem ficha ou criatura vinculada.");
    return;
  }

  if (!a.save || !a.dc) {
    say(`${a.name}: cadastre a salvaguarda e a CD para automatizar.`);
    return;
  }

  // Dano rolado uma vez, igual para todos os alvos (regra do PF2e).
  const rolled = a.damage ? await rollSpellDamage(cast, "dano") : null;
  const results: SpellTargetResult[] = [];
  for (const t of targets) {
    if (!t.target) {
      results.push({ target: t.name, conditions: [], effect: "", notes: [], error: "sem dados: vincule o token de novo." });
      continue;
    }
    try {
      results.push(await resolveSaveSpell(cast, t.target, rolled));
    } catch (e) {
      results.push({ target: t.name, conditions: [], effect: "", notes: [], error: e instanceof Error ? e.message : "erro" });
    }
  }

  const card: CardData = { kind: "spell", cast, mode: "save", rolled, results, offline: false };
  void showCard(card);
  void OBR.broadcast.sendMessage(CARD_SHARE, { ...card, sharedBy: "Mestre" }, { destination: "REMOTE" });
  void publishEvent(`${casterName} usou ${a.name} (CD ${cast.dc}) em ${targets.length} alvo(s).`).catch(() => undefined);
  say(
    results
      .map((r) => describeSpellResult(cast, r) || `${r.target}: ${r.save ? DEGREE_TEXT[r.save.degree] : ""}`)
      .join(" "),
  );
}

/** Uso direto (sem lista para ajustar): área no mapa, ou os tokens já selecionados. */
export async function useAbility(c: Creature, a: CreatureAbility, say: (t: string) => void): Promise<void> {
  let picked: string[];
  if (a.area) {
    const inside = await pickArea(c, a, say);
    if (!inside) {
      clearArea();
      return;
    }
    picked = inside.filter((id) => id !== c.tokenId);
    if (picked.length === 0) {
      clearAreaLater();
      say(`${a.name}: nenhum token com ficha ou criatura vinculada ficou dentro da área.`);
      return;
    }
  } else {
    picked = ((await OBR.player.getSelection()) ?? []).filter((id) => id !== c.tokenId);
    if (picked.length === 0) {
      say(`${a.name}: selecione no mapa os tokens que sofrem a habilidade (vários, com Shift) e toque de novo.`);
      return;
    }
  }
  await runAbility(c, a, picked, say);
  if (a.area) clearAreaLater();
}

/* ---------- uso com lista de alvos que o mestre ajusta ---------- */
export interface AbilityTarget {
  tokenId: string;
  name: string;
}

interface Job {
  creatureId: string;
  ability: CreatureAbility;
  targets: AbilityTarget[];
  say: (t: string) => void;
  refresh: () => void;
}

let job: Job | null = null;

export const abilityJobFor = (creatureId: string): Job | null => (job && job.creatureId === creatureId ? job : null);

async function labelOf(tokenId: string): Promise<string | null> {
  const tc = await creatureOfToken(tokenId);
  if (tc) return tc.name;
  const pc = await linkOfToken(tokenId);
  return pc?.pathbuilderId ? pc.name : null;
}

async function addTargets(j: Job, ids: string[]) {
  for (const id of ids) {
    if (j.targets.some((t) => t.tokenId === id)) continue;
    const name = await labelOf(id);
    if (name) j.targets.push({ tokenId: id, name });
  }
}

/**
 * Começa o uso de uma habilidade. `area`: posiciona a área no mapa e os tokens de dentro entram na
 * lista. `manual`: o mestre monta a lista selecionando os tokens. Nos dois casos ele ajusta a lista
 * (selecionar um token novo o adiciona; selecionar um da lista o tira) e toca em Resolver.
 */
export async function beginAbility(
  c: Creature,
  a: CreatureAbility,
  mode: "area" | "manual",
  say: (t: string) => void,
  refresh: () => void,
): Promise<void> {
  cancelAbility();
  const mine: Job = { creatureId: c.id, ability: a, targets: [], say, refresh };
  job = mine;
  refresh();
  if (mode === "area" && a.area) {
    const ids = await pickArea(c, a, say);
    if (job !== mine) return; // cancelado enquanto posicionava
    if (!ids) {
      job = null;
      clearArea();
      refresh();
      return;
    }
    await addTargets(mine, ids.filter((id) => id !== c.tokenId));
    say(
      mine.targets.length > 0
        ? `${a.name}: ${mine.targets.length} alvo(s) na área. Ajuste selecionando tokens e toque em Resolver.`
        : `${a.name}: nenhum token vinculado dentro da área. Selecione os alvos à mão ou cancele.`,
    );
  } else {
    say(`${a.name}: selecione no mapa os tokens que sofrem a habilidade (vários, com Shift) e toque em Resolver.`);
  }
  mine.refresh();
}

/** Seleção do mestre enquanto monta a lista: novo token entra, token da lista sai. */
export async function abilitySelection(ids: string[]): Promise<boolean> {
  const j = job;
  if (!j) return false;
  const c = getCreature(j.creatureId);
  if (!c) {
    job = null;
    return false;
  }
  const others = ids.filter((id) => id !== c.tokenId);
  if (others.length === 0) return true;
  if (others.length === 1 && j.targets.some((t) => t.tokenId === others[0])) {
    j.targets = j.targets.filter((t) => t.tokenId !== others[0]);
  } else {
    await addTargets(j, others);
  }
  j.refresh();
  return true;
}

export function removeAbilityTarget(tokenId: string) {
  if (!job) return;
  job.targets = job.targets.filter((t) => t.tokenId !== tokenId);
  job.refresh();
}

export function cancelAbility() {
  if (!job) return;
  const j = job;
  job = null;
  clearArea();
  j.refresh();
}

export async function resolveAbilityJob(): Promise<void> {
  const j = job;
  if (!j) return;
  const c = getCreature(j.creatureId);
  job = null;
  if (!c) return;
  await runAbility(c, j.ability, j.targets.map((t) => t.tokenId), j.say);
  if (j.ability.area) clearAreaLater();
  j.refresh();
}
