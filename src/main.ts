import OBR from "@owlbear-rodeo/sdk";
import "./tokens.css";
import "./style.css";
import "./theme.css";
import type { Character, Stat } from "./character";
import {
  COND_BY_KEY,
  CONDITIONS,
  condTags,
  acWithConditions,
  hpMaxWithConditions,
  withConditions,
  type ModOpts,
} from "./conditions";
import { durationLabel, pruneDurations, type Durations } from "./durations";
import { loadState, onStateChange, saveState, type CharState } from "./state";
import { CAST_REQ, type CastAction } from "./cardData";
import { showCard } from "./cardView";
import { tokenDistanceFeet } from "./grid";
import { loadSettings, onSettingsChange, saveSettings } from "./settings";
import { initCombat } from "./combatUi";
import { fetchBuild, toCharacter } from "./pathbuilder";
import { DEGREE_TEXT, publishEvent, publishRoll, signed, formulaText } from "./roll";
import {
  LINK_KEY,
  creatureOfToken,
  linkOfSelection,
  openableLinkOfSelection,
  myPinnedLink,
  linkOfToken,
  linkSelectedToken,
  unlinkSelectedToken,
} from "./token";
import { describeResult, hit, mapFor, resolveAttack, type AttackResult, type AttackSpec } from "./attack";
import { onCombatChange } from "./combat";
import { initCreatures } from "./creaturesUi";
import { listenAttackAcks, sendCreatureAttack, sendCreatureSpell } from "./gmResolver";
import {
  STAT_PT,
  describeSpellResult,
  resolveAutoSpell,
  resolveHealSpell,
  resolveSaveSpell,
  resolveTempSpell,
  rollSpellDamage,
  type SpellCast,
  type SpellTargetResult,
} from "./saveSpell";
import { damageParts, fetchSpell, tempHpAmount } from "./spellData";
import { pcSaveTarget } from "./targets";
import {
  AREA_ARM,
  AREA_CLEAR,
  AREA_RESULT,
  KIND_PT,
  type AreaArmMsg,
  type AreaResultMsg,
} from "./area";

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;
const RANK_LETTER: Record<number, string> = { 0: "D", 2: "T", 4: "E", 6: "M", 8: "L" };
const STORE_ID = "pf2e.pathbuilderId";

const store = {
  get: () => {
    try {
      return localStorage.getItem(STORE_ID) ?? "";
    } catch {
      return "";
    }
  },
  set: (v: string) => {
    try {
      localStorage.setItem(STORE_ID, v);
    } catch {
      /* sem armazenamento: segue sem lembrar o ID */
    }
  },
};

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="hud" class="hud" hidden></div>
  <div class="panels">
    <section id="tab-agir">
      <div id="sheet-agir"><p class="sub">Importe a ficha na aba Ficha para ver ataques e magias.</p></div>
    </section>
    <section id="tab-testes" hidden>
      <div id="sheet-testes"><p class="sub">Importe a ficha na aba Ficha para ver perícias e salvaguardas.</p></div>
      <section class="block dice-block">
        <h4>Dados avulsos</h4>
        <div class="dice" id="dice"></div>
        <div class="fields">
          <label>Qtd <input id="count" type="number" min="1" max="20" value="1" /></label>
          <label>Bônus <input id="mod" type="number" value="0" /></label>
          <label>CD <input id="dc" type="number" min="0" placeholder="opc." /></label>
        </div>
        <button id="roll" class="roll">Rolar 1d20</button>
      </section>
    </section>
    <section id="tab-ficha" hidden>
      <form id="import" class="import">
        <input id="pbid" inputmode="numeric" placeholder="ID do Pathbuilder (6 dígitos)" />
        <button type="submit">Importar</button>
      </form>
      <label class="manual-toggle" id="auto-player" hidden>
        <input type="checkbox" id="auto-roll" />
        Rolar automaticamente, sem perguntar antes (liberado pelo mestre)
      </label>
      <div id="sheet-ficha"></div>
    </section>
    <section id="tab-combate" hidden></section>
    <section id="tab-criaturas" hidden>
      <div id="gm-settings">
        <label class="manual-toggle" id="auto-gm" hidden>
          <input type="checkbox" id="allow-auto" />
          Permitir que os jogadores rolem automaticamente (padrão: sempre perguntar)
        </label>
      </div>
      <div id="gm-creatures"></div>
    </section>
  </div>
  <div class="actionbar">
    <p id="status" class="status"></p>
    <div id="manual" class="targeting manual" hidden></div>
    <div id="targeting" class="targeting" hidden>
      <span></span>
      <div id="target-note" class="target-note" hidden></div>
      <div class="tbtns">
        <button type="button" id="rearm-area" hidden>Posicionar área</button>
        <button type="button" id="multi-target" hidden>Vários alvos</button>
        <button type="button" id="resolve-targets" hidden>Resolver</button>
        <button type="button" id="clear-targets" hidden>Limpar</button>
        <button type="button" id="cancel-target">Cancelar</button>
      </div>
    </div>
  </div>
  <nav class="tabs" id="tabs">
    <button data-tab="agir" class="active"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 18 6M14 4h6v6M20 20 6 6M4 10V4h6"/></svg><span>Agir</span></button>
    <button data-tab="testes"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9zM12 2.5v19M3.5 7.5 20.5 16.5M20.5 7.5 3.5 16.5"/></svg><span>Testes</span></button>
    <button data-tab="ficha"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h11a2 2 0 0 1 2 2V20H8a2 2 0 0 1-2-2zM6 18a2 2 0 0 0 2 2M10 8.5h6M10 12.5h6"/></svg><span>Ficha</span></button>
    <button data-tab="combate"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10M7 20.5h10M8 3.5v4l4 4.5-4 4.5v4M16 3.5v4l-4 4.5 4 4.5v4"/></svg><span>Combate</span></button>
    <button data-tab="criaturas" id="creatures-tab" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18.5h16M4 18.5 3 8l5 4 4-7 4 7 5-4-1 10.5"/></svg><span>Mestre</span></button>
    <button type="button" id="log-toggle" class="logtab" title="Histórico da mesa (barra da direita)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10a2 2 0 0 1 2 2V17a2.5 2.5 0 0 1-2.5 2.5H8M7 3.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9.5M10 8.5h6M10 12h6"/></svg><span>Histórico</span></button>
  </nav>
`;

const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
$("#log-toggle").addEventListener("click", () => {
  void OBR.broadcast.sendMessage("pf2e.dice/log-toggle", {}, { destination: "LOCAL" });
});

/* ---------- abas ---------- */
const TABS = ["agir", "testes", "ficha", "combate", "criaturas"] as const;
type TabName = (typeof TABS)[number];

function switchTab(name: TabName) {
  app.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((x) => {
    x.classList.toggle("active", x.dataset.tab === name);
  });
  for (const t of TABS) $(`#tab-${t}`).hidden = t !== name;
}
app.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) =>
  b.addEventListener("click", () => switchTab(b.dataset.tab as TabName)),
);

/* ---------- aba Dados ---------- */
const diceEl = $<HTMLDivElement>("#dice");
const countEl = $<HTMLInputElement>("#count");
const modEl = $<HTMLInputElement>("#mod");
const dcEl = $<HTMLInputElement>("#dc");
const rollBtn = $<HTMLButtonElement>("#roll");
let sides = 20;

const int = (el: HTMLInputElement, fallback: number) => {
  const n = parseInt(el.value, 10);
  return Number.isFinite(n) ? n : fallback;
};
const diceForm = () => ({
  count: Math.min(20, Math.max(1, int(countEl, 1))),
  mod: int(modEl, 0),
});

function refreshDice() {
  diceEl.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.sides === String(sides));
  });
  const f = diceForm();
  dcEl.disabled = !(sides === 20 && f.count === 1);
  rollBtn.textContent = `Rolar ${formulaText(f.count, sides, f.mod)}`;
}

for (const d of DICE) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = `d${d}`;
  b.dataset.sides = String(d);
  b.addEventListener("click", () => {
    sides = d;
    refreshDice();
  });
  diceEl.appendChild(b);
}
[countEl, modEl].forEach((el) => el.addEventListener("input", refreshDice));

rollBtn.addEventListener("click", () => {
  const f = diceForm();
  const dcRaw = dcEl.value.trim();
  void publishRoll({
    count: f.count,
    sides,
    mod: f.mod,
    dc: dcRaw === "" ? undefined : parseInt(dcRaw, 10),
  }).then((msg) => showCard({ kind: "check", msg }));
});

/* ---------- aba Ficha ---------- */
const agirEl = $<HTMLDivElement>("#sheet-agir");
const testesEl = $<HTMLDivElement>("#sheet-testes");
const fichaEl = $<HTMLDivElement>("#sheet-ficha");
const hudEl = $<HTMLDivElement>("#hud");
const statusEl = $<HTMLParagraphElement>("#status");
const pbidEl = $<HTMLInputElement>("#pbid");

const target = () => {
  const n = parseInt(targetValue, 10);
  return Number.isFinite(n) ? n : undefined;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function rollButton(
  label: string,
  base: number,
  title: string,
  extra?: string,
  opts?: ModOpts,
  /** Se informado, substitui a rolagem padrão ao clicar (recebe o bônus já com condições). */
  custom?: (bonus: number) => void,
): HTMLButtonElement {
  const { value, penalty } = withConditions(base, state.conditions, opts);
  const b = el("button", "stat");
  b.type = "button";
  const n = el("span", "n", signed(value));
  if (penalty > 0) {
    n.classList.add("penalized");
    b.title = `Base ${signed(base)}, −${penalty} por condições`;
  }
  b.append(el("span", "lbl", label), n);
  if (extra) b.append(el("span", "rank", extra));
  b.addEventListener("click", () => {
    if (custom) custom(value);
    else {
      void publishRoll({ title, count: 1, sides: 20, mod: value, dc: target() }).then((msg) =>
        showCard({ kind: "check", msg }),
      );
    }
  });
  return b;
}

/* ---------- ataques com alvo ---------- */
interface PendingBase {
  title: string;
  startSelection: string;
  /** Gasta o recurso (espaço de magia ou ponto de foco) quando um alvo válido é escolhido. */
  consume?: () => void;
}
type AttackPending = PendingBase & {
  kind: "attack";
  bonus: number;
  damage?: AttackSpec["damage"];
  /** Alcance em pés (ataques de magia). Armas não têm: o Pathbuilder não informa o alcance. */
  rangeFeet?: number;
};
type SpellPending = PendingBase & {
  kind: "spell";
  cast: SpellCast;
  mode: "save" | "auto" | "heal" | "temp";
};
type Pending = AttackPending | SpellPending;

/** Alvo válido: ficha de jogador ("pc") ou criatura do mestre. Um por token. */
interface Marked {
  tokenId: string;
  type: "pc" | "creature";
  id: string;
  name: string;
}

let pending: Pending | null = null;
let multiMode = false; // magias: marcar vários alvos e resolver todos de uma vez
let marked: Marked[] = [];
let bannerNote = ""; // último aviso (ex.: alvo fora do alcance), mostrado dentro da faixa de alvos
let attackNumber = 1; // ataque nº do turno, para a penalidade de ataques múltiplos

const targetingEl = $<HTMLDivElement>("#targeting");
const multiBtn = $<HTMLButtonElement>("#multi-target");
const resolveBtn = $<HTMLButtonElement>("#resolve-targets");
const clearBtn = $<HTMLButtonElement>("#clear-targets");
const areaBtn = $<HTMLButtonElement>("#rearm-area");
const noteEl = $<HTMLDivElement>("#target-note");

/* ---------- perguntar antes de rolar + cartão de resultados ---------- */
const AUTO_KEY = "pf2e.autoRoll";
const confirmEl = $<HTMLDivElement>("#manual");
const autoPlayerLabel = $<HTMLLabelElement>("#auto-player");
const autoToggle = $<HTMLInputElement>("#auto-roll");
const gmLabel = $<HTMLLabelElement>("#auto-gm");
const allowToggle = $<HTMLInputElement>("#allow-auto");

/** Liberado pelo mestre na sala (padrão: não). */
let autoAllowed = false;
/** Escolha deste jogador, valendo só se o mestre liberou. */
let playerAuto = false;
try {
  playerAuto = localStorage.getItem(AUTO_KEY) === "1";
} catch {
  /* sem armazenamento: começa perguntando */
}

/** Padrão: sempre pergunta antes de rolar. Só rola direto se o mestre liberou E o jogador escolheu. */
const mustAsk = () => !(autoAllowed && playerAuto);

function applySettings() {
  autoPlayerLabel.hidden = !autoAllowed;
  autoToggle.checked = autoAllowed && playerAuto;
  allowToggle.checked = autoAllowed;
}
autoToggle.addEventListener("change", () => {
  playerAuto = autoToggle.checked;
  try {
    localStorage.setItem(AUTO_KEY, playerAuto ? "1" : "0");
  } catch {
    /* ignora */
  }
});
allowToggle.addEventListener("change", () => {
  autoAllowed = allowToggle.checked;
  applySettings();
  void saveSettings({ autoRollAllowed: autoAllowed }).catch(() => {
    say("Não foi possível salvar o ajuste na sala.", true);
  });
});

/** Por padrão o jogador confirma antes de os dados rolarem. `ok: false` = cancelou. */
/** Alvos já marcados como flanqueados neste turno (volta a vazio quando o turno muda). */
const flankMemory = new Map<string, boolean>();

function confirmRoll(
  title: string,
  lines: string[],
  /** Em ataques: nome do alvo, para oferecer a opção "alvo flanqueado". */
  flankTarget?: string,
): Promise<{ ok: boolean; flanked: boolean }> {
  if (!mustAsk()) return Promise.resolve({ ok: true, flanked: false });
  return new Promise((resolve) => {
    targetingEl.hidden = true; // uma coisa de cada vez na barra de ação
    confirmEl.replaceChildren();
    const text = el("div");
    text.style.flex = "1 1 100%";
    text.append(el("strong", undefined, `${title}: deseja rolar os dados?`));
    for (const l of lines) text.append(el("div", "sub", l));

    // Flanqueio: o alvo fica Desprevenido (−2 na CA) contra este ataque.
    let box: HTMLInputElement | undefined;
    if (flankTarget !== undefined) {
      const label = el("label", "flank-option");
      box = el("input");
      box.type = "checkbox";
      box.checked = flankMemory.get(flankTarget) ?? false;
      label.append(box, " Inimigo flanqueado (Desprevenido: −2 na CA)");
      text.append(label);
    }

    const done = (v: boolean) => {
      if (v && box && flankTarget !== undefined) flankMemory.set(flankTarget, box.checked);
      confirmEl.hidden = true;
      confirmEl.replaceChildren();
      updateBanner(); // volta a faixa de alvo, se ainda houver
      resolve({ ok: v, flanked: v && !!box?.checked });
    };
    const roll = el("button", undefined, "Rolar dados");
    roll.type = "button";
    roll.addEventListener("click", () => done(true));
    const cancel = el("button", undefined, "Cancelar");
    cancel.type = "button";
    cancel.addEventListener("click", () => done(false));
    const row = el("div", "tbtns");
    row.append(roll, cancel);
    confirmEl.append(text, row);
    confirmEl.hidden = false;
    roll.focus();
  });
}

/* ---------- área no mapa ---------- */
/** Token da conjuradora: o que está selecionado se for dela, senão o primeiro vinculado à ficha. */
async function casterTokenId(): Promise<string | undefined> {
  if (!current?.pathbuilderId) return undefined;
  const mine = await OBR.scene.items.getItems(
    (i) => (i.metadata[LINK_KEY] as { pathbuilderId?: string } | undefined)?.pathbuilderId === current?.pathbuilderId,
  );
  const sel = new Set((await OBR.player.getSelection()) ?? []);
  return (mine.find((i) => sel.has(i.id)) ?? mine[0])?.id;
}

/** `free`: escolher outro centro para a emanação (o botão "Posicionar área"). */
async function armArea(free = false) {
  if (pending?.kind !== "spell" || !pending.cast.spell.area) return;
  const msg: AreaArmMsg = {
    area: pending.cast.spell.area,
    casterTokenId: await casterTokenId(),
    rangeFeet: pending.cast.spell.rangeFeet,
    free,
  };
  await OBR.broadcast.sendMessage(AREA_ARM, msg, { destination: "LOCAL" });
}

const clearArea = () => void OBR.broadcast.sendMessage(AREA_CLEAR, {}, { destination: "LOCAL" });

const isSpellWithRange = (p: Pending) => p.kind === "spell" && p.cast.spell.rangeFeet !== undefined;

function updateBanner() {
  const p = pending;
  targetingEl.hidden = p === null;
  noteEl.hidden = p === null || bannerNote === "";
  noteEl.textContent = bannerNote;
  if (!p) return;
  const isSpell = p.kind === "spell";
  const area = isSpell ? p.cast.spell.area : undefined;
  multiBtn.hidden = !isSpell;
  multiBtn.textContent = multiMode ? "Um alvo só" : "Vários alvos";
  areaBtn.hidden = !area;
  resolveBtn.hidden = !multiMode;
  clearBtn.hidden = !multiMode;
  resolveBtn.textContent = `Resolver (${marked.length})`;
  resolveBtn.disabled = marked.length === 0;
  clearBtn.disabled = marked.length === 0;
  const names = marked.length ? ` (${marked.map((m) => m.name).join(", ")})` : "";
  const where =
    area?.kind === "emanation"
      ? isSpellWithRange(p)
        ? `Sai do seu token; para escolher outro centro, clique em Posicionar área e depois no mapa, no máximo a ${(p as SpellPending).cast.spell.rangeFeet} pés de você (fora do alcance fica vermelha; Esc cancela).`
        : "Sai do seu token e não pode ser movida (a magia não tem alcance)."
      : area?.kind === "burst" && isSpellWithRange(p)
        ? `Posicione no mapa, no máximo a ${(p as SpellPending).cast.spell.rangeFeet} pés de você: fora do alcance a área fica vermelha (Esc cancela).`
        : "Posicione no mapa (Esc cancela).";
  targetingEl.querySelector("span")!.textContent = area
    ? `${p.title}: ${KIND_PT[area.kind]} de ${area.feet} pés. ${where} ${marked.length} alvo(s) marcado(s)${names}. Ajuste clicando nos tokens e depois em Resolver.`
    : multiMode
      ? `${p.title}: ${marked.length} alvo(s) marcado(s)${names}. Clique nos tokens para marcar ou desmarcar e depois em Resolver.`
      : `${p.title}: selecione o token do alvo no mapa.`;
}

function setTargeting(p: Pending | null) {
  pending = p;
  multiMode = false;
  marked = [];
  bannerNote = "";
  if (!p) clearArea(); // apaga a área desenhada no mapa
  updateBanner();
}

areaBtn.addEventListener("click", () => void armArea(true));

function cancelTargeting() {
  setTargeting(null);
  say("Cancelado.");
}
$("#cancel-target").addEventListener("click", cancelTargeting);
multiBtn.addEventListener("click", () => {
  multiMode = !multiMode;
  marked = [];
  updateBanner();
});
clearBtn.addEventListener("click", () => {
  marked = [];
  updateBanner();
});
resolveBtn.addEventListener("click", () => {
  if (pending?.kind === "spell" && marked.length > 0) void resolveSpellOn(pending, marked);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pending) cancelTargeting();
});

/** Magias de PV temporários podem ser lançadas em si mesmo. */
const selfIsTarget = () => pending?.kind === "spell" && pending.mode === "temp";

/** Descreve o token como alvo: criatura do mestre ou ficha de jogador (nunca o próprio conjurador). */
async function describeTarget(tokenId: string, allowSelf = false): Promise<Marked | undefined> {
  const creature = await creatureOfToken(tokenId);
  if (creature) return { tokenId, type: "creature", id: creature.id, name: creature.name };
  const pc = await linkOfToken(tokenId);
  if (!pc?.pathbuilderId || (!allowSelf && pc.pathbuilderId === current?.pathbuilderId)) return undefined;
  return { tokenId, type: "pc", id: pc.pathbuilderId, name: pc.name };
}

/**
 * Alcance de magias de um alvo só (e de ataques de magia): mede do seu token ao do alvo.
 * Magias de área usam o alcance na ferramenta de área. Sem token seu no mapa, não mede.
 */
async function rangeError(tokenId: string, name: string): Promise<string | undefined> {
  const p = pending;
  if (!p) return undefined;
  const range = p.kind === "spell" ? (p.cast.spell.area ? undefined : p.cast.spell.rangeFeet) : p.rangeFeet;
  if (range === undefined) return undefined;
  const caster = await casterTokenId();
  if (!caster || caster === tokenId) return undefined;
  try {
    const d = await tokenDistanceFeet(caster, tokenId);
    if (d > range + 0.01) {
      return `Fora do alcance: ${name} está a ${Math.round(d)} pés e ${p.title} alcança ${range} pés.`;
    }
  } catch {
    /* não conseguiu medir (token apagado?): deixa passar */
  }
  return undefined;
}

/** Seleção mudou enquanto se espera o alvo. */
async function onSelectionWhilePending(sel: string[], key: string) {
  const p = pending;
  if (!p) return;
  if (p.kind === "attack" || !multiMode) {
    if (sel.length === 1 && key !== p.startSelection) await onTargetPicked(sel[0]);
    return;
  }
  // Vários alvos: um clique num token já marcado desmarca; seleção em grupo só adiciona.
  let skipped = 0;
  const tooFar: string[] = [];
  for (const id of sel) {
    const t = await describeTarget(id, selfIsTarget());
    if (!t) {
      skipped++;
      continue;
    }
    const at = marked.findIndex((m) => m.tokenId === id);
    if (at === -1) {
      const far = await rangeError(id, t.name);
      if (far) {
        tooFar.push(far);
        continue;
      }
      marked.push(t);
    } else if (sel.length === 1) marked.splice(at, 1);
  }
  updateBanner();
  if (tooFar.length > 0) warn(tooFar.join(" "));
  else if (skipped > 0) say(`${skipped} token(s) sem ficha nem criatura vinculada foram ignorados.`, true);
}

/** Resolve a magia em todos os alvos: dano rolado uma vez, salvaguarda e efeitos por alvo. */
async function resolveSpellOn(p: SpellPending, targets: Marked[]) {
  const { cast, mode } = p;

  // Pergunta antes de rolar (se a opção está ligada); cancelar não gasta nada.
  const alvos = targets.map((t) => t.name).join(", ");
  if (!(await confirmRoll(cast.spell.name, [`Alvos: ${alvos}`, `CD ${cast.dc}`])).ok) return;

  setTargeting(null);
  p.consume?.();
  const results: SpellTargetResult[] = [];
  let offline = false;
  try {
    const rolled =
      mode === "temp"
        ? tempHpAmount(cast.spell, cast.rank)
        : mode === "save"
        ? cast.spell.save?.basic
          ? await rollSpellDamage(cast, "dano")
          : null
        : await rollSpellDamage(cast, mode === "heal" ? "cura" : "dano");

    for (const t of targets.filter((x) => x.type === "pc")) {
      const tg = pcSaveTarget(t.id, t.name);
      try {
        results.push(
          mode === "auto"
            ? await resolveAutoSpell(cast, tg, rolled)
            : mode === "heal"
              ? await resolveHealSpell(cast, tg, rolled)
              : mode === "temp"
                ? await resolveTempSpell(cast, tg, rolled)
              : await resolveSaveSpell(cast, tg, rolled),
        );
      } catch (e) {
        results.push({
          target: t.name,
          conditions: [],
          effect: "",
          notes: [],
          error: e instanceof Error ? e.message : "não foi possível resolver.",
        });
      }
    }

    const creatures = targets.filter((x) => x.type === "creature");
    if (creatures.length > 0) {
      say(`Magia enviada ao mestre contra ${creatures.length} criatura(s)…`);
      const r = await sendCreatureSpell(cast, mode, creatures.map((c) => c.id), rolled);
      if (r.online) results.push(...r.results);
      else offline = true;
    }

    void showCard({ kind: "spell", cast, mode, rolled, results, offline });
    say(
      offline
        ? "O mestre não respondeu. Ele precisa estar na sala com a extensão ativa."
        : results.map((r) => describeSpellResult(cast, r)).join(" "),
      offline,
    );
  } catch (e) {
    say(e instanceof Error ? e.message : "Não foi possível resolver a magia.", true);
  }
  if (current) renderSheet(current);
}

/** Clique num botão de ataque: com alvo manual rola direto; senão pede para selecionar o token. */
async function beginAttack(
  title: string,
  bonus: number,
  damage?: AttackSpec["damage"],
  consume?: () => void,
  rangeFeet?: number,
) {
  const manual = target();
  const penalty = mapFor(attackNumber);
  if (manual !== undefined) {
    // Alvo digitado à mão: só rola contra aquela CA.
    consume?.();
    attackNumber += 1;
    const msg = await publishRoll({ title, count: 1, sides: 20, mod: bonus - penalty, dc: manual });
    void showCard({ kind: "check", msg });
    if (current) renderSheet(current);
    return;
  }
  const startSelection = ((await OBR.player.getSelection()) ?? []).join(",");
  setTargeting({ kind: "attack", title, bonus, damage, startSelection, consume, rangeFeet });
}

async function askSpellTarget(
  title: string,
  cast: SpellCast,
  mode: "save" | "auto" | "heal" | "temp",
  consume: () => void,
) {
  const startSelection = ((await OBR.player.getSelection()) ?? []).join(",");
  setTargeting({ kind: "spell", title, cast, mode, startSelection, consume });
  if (cast.spell.area) {
    // Magia de área: já entra no modo de vários alvos e pede para posicionar a área no mapa.
    multiMode = true;
    updateBanner();
    await armArea();
  }
}

async function onTargetPicked(tokenId: string) {
  const p = pending;
  if (!p || !current) return;
  // Criatura do mestre: a CA e os PV ficam no navegador do mestre, que resolve o ataque.
  const creature = await creatureOfToken(tokenId);

  if (p.kind === "spell") {
    const t = await describeTarget(tokenId, p.mode === "temp");
    if (!t) {
      say("Esse token não tem ficha nem criatura vinculada (ou é o próprio conjurador). Escolha outro.", true);
      return;
    }
    const far = await rangeError(tokenId, t.name);
    if (far) {
      warn(far);
      return;
    }
    await resolveSpellOn(p, [t]);
    return;
  }

  const link = creature ? undefined : await linkOfToken(tokenId);
  if (!creature) {
    if (!link || !link.pathbuilderId) {
      say("Esse token não tem ficha nem criatura vinculada, então não sei a CA dele. Escolha outro.", true);
      return;
    }
    if (link.pathbuilderId === current.pathbuilderId) {
      say("Escolha outro token como alvo.", true);
      return;
    }
  }
  const targetName = creature?.name ?? link!.name;
  const far = await rangeError(tokenId, targetName);
  if (far) {
    warn(far);
    return;
  }
  const penalty = mapFor(attackNumber);

  // Pergunta antes de rolar (se a opção está ligada); cancelar mantém o alvo para escolher outro.
  const answer = await confirmRoll(p.title, attackConfirmLines(p, targetName, penalty), targetName);
  if (!answer.ok) return;

  setTargeting(null);
  p.consume?.();
  const spec: AttackSpec = {
    attackerName: current.name,
    attackerColor: await OBR.player.getColor(),
    title: p.title,
    bonus: p.bonus,
    mapPenalty: penalty,
    damage: p.damage,
    flanking: answer.flanked,
  };
  attackNumber += 1;

  try {
    let result: AttackResult | null;
    if (creature) {
      say(`Ataque enviado ao mestre contra ${creature.name}…`);
      const r = await sendCreatureAttack(spec, creature.id);
      if (!r.online) {
        say("O mestre não respondeu. Ele precisa estar na sala com a extensão ativa.", true);
        if (current) renderSheet(current);
        return;
      }
      result = r.result;
    } else {
      result = await resolveAttack(spec, link!.pathbuilderId, link!.name);
    }
    if (result) {
      void showCard({ kind: "attack", result, nextPenalty: mapFor(attackNumber) });
      say(describeResult(result));
    } else {
      say("O mestre não conseguiu resolver o ataque (alvo sem dados cadastrados).", true);
    }
  } catch (e) {
    say(e instanceof Error ? e.message : "Não foi possível resolver o ataque.", true);
  }
  if (current) renderSheet(current);
}

function attackConfirmLines(p: AttackPending, targetName: string, penalty: number): string[] {
  const lines = [
    `Alvo: ${targetName}`,
    `Ataque: d20 ${signed(p.bonus)}${penalty ? ` −${penalty} (ataques múltiplos)` : ""}`,
  ];
  if (p.damage) {
    const d = p.damage;
    lines.push(`Dano: ${formulaText(d.dice, d.die, d.bonus)}${d.type ? ` ${d.type}` : ""}`);
  }
  return lines;
}

function attackButton(
  label: string,
  base: number,
  title: string,
  opts: ModOpts,
  damage?: AttackSpec["damage"],
): HTMLButtonElement {
  return rollButton(label, base, title, undefined, opts, (bonus) => {
    void beginAttack(title, bonus, damage);
  });
}

function mapRow(): HTMLElement {
  const p = mapFor(attackNumber);
  const row = el("div", "import");
  const txt = el("span", "sub", `Ataque nº ${attackNumber}${p ? ` (−${p})` : ""}`);
  txt.style.flex = "1";
  const reset = el("button", undefined, "Novo turno");
  reset.type = "button";
  reset.addEventListener("click", () => {
    attackNumber = 1;
    flankMemory.clear();
    if (current) renderSheet(current);
  });
  row.append(txt, reset);
  return row;
}

function statButton(s: Stat): HTMLButtonElement {
  const isSave = ["fortitude", "reflex", "will"].includes(s.key);
  return rollButton(s.name, s.total, s.name, RANK_LETTER[s.rank] ?? "", {
    ability: s.ability,
    isSave,
  });
}

/** Seções da ficha que começam fechadas (o resto começa aberto). A escolha fica lembrada. */
const CLOSED_BY_DEFAULT = new Set(["Token", "Atributos", "Perícias"]);
const OPEN_PREFIX = "pf2e.open.";

function readOpen(title: string): boolean {
  try {
    const v = localStorage.getItem(OPEN_PREFIX + title);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* sem armazenamento: usa o padrão */
  }
  return !CLOSED_BY_DEFAULT.has(title);
}

/** Bloco recolhível: toque no título para abrir ou fechar. */
function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const d = document.createElement("details");
  d.className = "block";
  d.open = readOpen(title);
  const summary = document.createElement("summary");
  summary.append(el("h4", undefined, title));
  d.append(summary, ...children);
  d.addEventListener("toggle", () => {
    try {
      localStorage.setItem(OPEN_PREFIX + title, d.open ? "1" : "0");
    } catch {
      /* ignora */
    }
  });
  return d;
}

function grid(...children: HTMLElement[]): HTMLElement {
  const g = el("div", "grid");
  g.append(...children);
  return g;
}

let current: Character | null = null;

function tokenBlock(c: Character): HTMLElement {
  const info = el("p", "sub", "Selecione um token no mapa e vincule esta ficha a ele.");
  const msg = el("p", "status");
  const row = el("div", "import");

  const link = el("button", undefined, "Vincular ao token selecionado");
  link.type = "button";
  link.addEventListener("click", async () => {
    msg.className = "status";
    try {
      await linkSelectedToken({ pathbuilderId: c.pathbuilderId ?? "", name: c.name });
      if (c.pathbuilderId) await saveState(c.pathbuilderId, state);
      msg.textContent = `Token vinculado a ${c.name}.`;
    } catch (e) {
      msg.textContent = e instanceof Error ? e.message : "Não foi possível vincular.";
      msg.className = "status error";
    }
  });

  const unlink = el("button", undefined, "Desvincular");
  unlink.type = "button";
  unlink.addEventListener("click", async () => {
    msg.className = "status";
    try {
      await unlinkSelectedToken();
      msg.textContent = "Vínculo removido do token.";
    } catch (e) {
      msg.textContent = e instanceof Error ? e.message : "Não foi possível desvincular.";
      msg.className = "status error";
    }
  });

  row.append(link, unlink);
  return section("Token", info, row, msg);
}

/* ---------- estado vivo: PV e condições ---------- */
const newState = (c: Character): CharState => ({
  hp: c.hpMax,
  temp: 0,
  max: c.hpMax,
  ac: c.ac,
  conditions: {},
});
let state: CharState = { hp: 0, temp: 0, conditions: {} };
let targetValue = "";

/** Redesenha a ficha mantendo a rolagem do painel e grava o estado na sala. */
function commit(c: Character) {
  state.max = hpMaxWithConditions(c.hpMax, c.level, state.conditions);
  state.hp = Math.min(state.hp, state.max);
  state.ac = acWithConditions(c.ac, state.conditions).value;
  const scroll = $("#tab-ficha").parentElement!.scrollTop;
  renderSheet(c);
  $("#tab-ficha").parentElement!.scrollTop = scroll;
  if (c.pathbuilderId) {
    saveState(c.pathbuilderId, state).catch(() => {
      statusEl.textContent = "Não foi possível salvar o estado na sala.";
      statusEl.className = "status error";
    });
  }
}

function hpBlock(c: Character): HTMLElement {
  const max = hpMaxWithConditions(c.hpMax, c.level, state.conditions);
  const hp = Math.min(state.hp, max);

  const big = el("div", "hp-big");
  big.append(
    el("strong", undefined, String(hp)),
    el("span", undefined, ` / ${max} PV${state.temp ? `  (+${state.temp} temp.)` : ""}`),
  );
  // A barra representa o PV máximo; o PV temporário vem logo depois do PV atual, em azul.
  const scale = Math.max(max, hp + state.temp);
  const bar = el("div", "hp-bar");
  const fill = el("div", "hp-fill");
  fill.style.width = `${(hp / scale) * 100}%`;
  bar.append(fill);
  if (state.temp > 0) {
    const tempFill = el("div", "hp-temp");
    tempFill.style.width = `${(state.temp / scale) * 100}%`;
    bar.append(tempFill);
  }

  const amount = el("input");
  amount.type = "number";
  amount.min = "0";
  amount.placeholder = "valor";
  const act = (label: string, fn: (n: number) => string | void) => {
    const b = el("button", undefined, label);
    b.type = "button";
    b.addEventListener("click", () => {
      const n = Math.max(0, parseInt(amount.value, 10) || 0);
      if (n === 0) return;
      const note = fn(n);
      commit(c);
      statusEl.className = "status";
      statusEl.textContent = note ?? "";
    });
    return b;
  };
  // PV temporários absorvem o dano primeiro; só o que sobra vai para os PV.
  const damage = (n: number) => {
    const absorbed = Math.min(state.temp, n);
    const toHp = Math.min(hp, n - absorbed);
    state.temp -= absorbed;
    state.hp = hp - toHp;
    return absorbed > 0
      ? `Dano ${n}: ${absorbed} nos PV temporários, ${toHp} nos PV.`
      : `Dano ${n}: ${toHp} nos PV.`;
  };
  const heal = (n: number) => {
    state.hp = Math.min(max, hp + n);
  };

  // Ajuste rápido com um toque: −5, −1, +1, +5.
  const quick = el("div", "quick");
  for (const [label, delta] of [["−5", -5], ["−1", -1], ["+1", 1], ["+5", 5]] as const) {
    const b = el("button", delta < 0 ? "dmg" : "heal", label);
    b.type = "button";
    b.setAttribute("aria-label", delta < 0 ? `Tirar ${-delta} PV` : `Curar ${delta} PV`);
    b.addEventListener("click", () => {
      const note = delta < 0 ? damage(-delta) : heal(delta);
      commit(c);
      statusEl.className = "status";
      statusEl.textContent = note ?? "";
    });
    quick.append(b);
  }

  const row = el("div", "import");
  row.append(
    amount,
    act("Dano", damage),
    act("Cura", heal),
    act("Temp.", (n) => {
      state.temp = Math.max(state.temp, n); // PV temporários não acumulam: vale o maior
    }),
  );
  return section("Pontos de vida", big, bar, quick, row);
}

const durSuffix = (d: Durations[string] | undefined) => (d ? ` · ${durationLabel(d)}` : "");

function conditionsBlock(c: Character): HTMLElement {
  const set = (key: string, value: number) => {
    if (value <= 0) delete state.conditions[key];
    else state.conditions[key] = value;
    state.durations = pruneDurations(state.conditions, state.durations);
    commit(c);
  };

  const chips = el("div", "chips");
  for (const [key, val] of Object.entries(state.conditions)) {
    const def = COND_BY_KEY.get(key);
    if (!def) continue;
    const chip = el("span", "chip");
    const mini = (text: string, fn: () => void, label: string) => {
      const b = el("button", "mini", text);
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.addEventListener("click", fn);
      return b;
    };
    if (def.valued) {
      chip.append(
        mini("−", () => set(key, val - 1), `Diminuir ${def.pt}`),
        el("span", undefined, `${def.pt} ${val}${durSuffix(state.durations?.[key])}`),
        mini("+", () => set(key, val + 1), `Aumentar ${def.pt}`),
      );
    } else {
      chip.append(el("span", undefined, `${def.pt}${durSuffix(state.durations?.[key])}`), mini("×", () => set(key, 0), `Remover ${def.pt}`));
    }
    chips.append(chip);
  }
  if (!chips.children.length) chips.append(el("span", "sub", "Nenhuma condição ativa."));

  const select = el("select");
  for (const d of CONDITIONS) select.append(new Option(d.pt, d.key));
  const add = el("button", undefined, "Adicionar");
  add.type = "button";
  add.addEventListener("click", () => {
    const key = select.value;
    if (!(key in state.conditions)) set(key, 1);
  });
  const row = el("div", "import");
  row.append(select, add);

  return section("Condições", chips, row);
}

/** Campo "Alvo (CD/CA)": existe em Agir e em Testes, sempre com o mesmo valor. */
const targetInputs: HTMLInputElement[] = [];
function targetField(): HTMLElement {
  const label = el("label", "target", "Alvo (CD/CA) ");
  const input = el("input");
  input.type = "number";
  input.placeholder = "opcional";
  input.value = targetValue;
  input.addEventListener("input", () => {
    targetValue = input.value;
    for (const o of targetInputs) if (o !== input) o.value = targetValue;
  });
  targetInputs.push(input);
  label.append(input);
  return label;
}

/** Cabeçalho fixo, visível em todas as abas: nome, PV, CA e condições. Tocar leva à aba Ficha. */
function renderHud(c: Character) {
  hudEl.replaceChildren();
  const max = hpMaxWithConditions(c.hpMax, c.level, state.conditions);
  const hp = Math.min(state.hp, max);
  const ac = acWithConditions(c.ac, state.conditions);

  const who = el("div", "hud-name");
  who.append(el("strong", undefined, c.name), el("span", "sub", `${c.className} ${c.level}`));

  const mid = el("div", "hud-hp");
  mid.append(el("span", undefined, `${hp}/${max} PV${state.temp ? ` (+${state.temp})` : ""}`));
  const scale = Math.max(max, hp + state.temp);
  const bar = el("div", "hp-bar");
  const fill = el("div", "hp-fill");
  fill.style.width = `${(hp / scale) * 100}%`;
  bar.append(fill);
  if (state.temp > 0) {
    const t = el("div", "hp-temp");
    t.style.width = `${(state.temp / scale) * 100}%`;
    bar.append(t);
  }
  mid.append(bar);

  const acBox = el("div", `hud-ac${ac.penalty > 0 ? " penalized" : ""}`);
  acBox.append(el("strong", undefined, String(ac.value)), el("span", undefined, "CA"));

  const top = el("div", "hud-top");
  top.append(who, mid, acBox);
  hudEl.append(top);

  const tags = condTags(state.conditions, state.durations);
  if (tags.length > 0) {
    const row = el("div", "hud-tags");
    for (const t of tags.slice(0, 4)) {
      const chip = el("span", "hud-tag", t.text);
      chip.style.background = t.color;
      row.append(chip);
    }
    if (tags.length > 4) row.append(el("span", "hud-tag", `+${tags.length - 4}`));
    hudEl.append(row);
  }
  hudEl.hidden = false;
}
hudEl.addEventListener("click", () => switchTab("ficha"));

function renderSheet(c: Character) {
  current = c;
  agirEl.replaceChildren();
  testesEl.replaceChildren();
  fichaEl.replaceChildren();
  targetInputs.length = 0;
  renderHud(c);

  const head = el("div", "head-card");
  head.append(
    el("h3", undefined, c.name),
    el("p", "sub", `${c.ancestry} (${c.heritage}) · ${c.className} ${c.level} · ${c.background}`),
  );
  const nums = el("div", "numbers");
  const num = (label: string, v: string | number) => {
    const d = el("div", "num");
    d.append(el("strong", undefined, String(v)), el("span", undefined, label));
    return d;
  };
  const ac = acWithConditions(c.ac, state.conditions);
  const acNum = num("CA", ac.value);
  if (ac.penalty > 0) {
    acNum.classList.add("penalized");
    acNum.title = `Base ${c.ac}, −${ac.penalty} por condições`;
  }
  nums.append(acNum, num("Desl.", `${c.speed} ft`), num("CD de classe", c.classDC));
  head.append(nums);

  fichaEl.append(head, hpBlock(c), conditionsBlock(c), tokenBlock(c));
  agirEl.append(targetField());
  testesEl.append(targetField());

  const abilityNames: [keyof Character["abilities"], string][] = [
    ["str", "FOR"],
    ["dex", "DES"],
    ["con", "CON"],
    ["int", "INT"],
    ["wis", "SAB"],
    ["cha", "CAR"],
  ];
  testesEl.append(
    section(
      "Atributos",
      grid(
        ...abilityNames.map(([k, n]) =>
          rollButton(n, c.abilities[k], `Teste de ${n}`, undefined, { ability: k }),
        ),
      ),
    ),
  );

  testesEl.append(
    section("Percepção e salvaguardas", grid(statButton(c.perception), ...c.saves.map(statButton))),
    section("Perícias", grid(...c.skills.map(statButton), ...c.lores.map(statButton))),
  );

  if (c.attacks.length) {
    const rows = c.attacks.map((a) => {
      const row = el("div", "attack");
      row.append(el("span", "aname", a.name));
      const atk = attackButton("Ataque", a.bonus, a.name, { isAttack: true }, a.damage);
      const d = a.damage;
      const dmg = el("button", "stat");
      dmg.type = "button";
      dmg.append(
        el("span", "lbl", "Dano"),
        el("span", "n", formulaText(d.dice, d.die, d.bonus)),
      );
      dmg.addEventListener("click", () => {
        void publishRoll({ title: `${a.name} (dano)`, count: d.dice, sides: d.die, mod: d.bonus });
      });
      row.append(atk, dmg);
      return row;
    });
    agirEl.append(section("Ataques", mapRow(), ...rows));
  }

  for (const caster of c.casters) {
    const info = el(
      "p",
      "sub",
      `${caster.tradition} · ataque ${signed(caster.attack)} · CD ${caster.dc}`,
    );
    const attack = attackButton(
      "Ataque de magia",
      caster.attack,
      `${caster.name} (ataque de magia)`,
      { ability: caster.ability, isAttack: true },
    );
    const lists = caster.prepared.length ? caster.prepared : caster.known;

    // Espaços de magia: uma fileira de marcadores por rank.
    const slotRows: HTMLElement[] = [];
    caster.slots.forEach((total, rank) => {
      if (rank === 0 || total <= 0) return;
      const used = Math.min(total, state.slotsUsed?.[rank] ?? 0);
      const row = el("div", "pips");
      row.append(el("span", "lbl", `Rank ${rank}`));
      row.append(
        ...pips(total, used, (next) => {
          state.slotsUsed = { ...state.slotsUsed, [rank]: next };
          commit(c);
        }),
      );
      slotRows.push(row);
    });

    const spellRows = lists.map((l) => {
      const row = el("div", "spellrow");
      row.append(el("strong", undefined, l.rank === 0 ? "Truques" : `Rank ${l.rank}`));
      const wrap = el("div", "chips");
      for (const name of l.names) {
        const b = el("button", "spell", name);
        b.type = "button";
        b.title = l.rank === 0 ? "Lançar truque" : `Conjurar (gasta um espaço de rank ${l.rank})`;
        b.addEventListener("click", () =>
          void openSpellCard(c, { mode: "spell", name, rank: l.rank, slotTotal: caster.slots[l.rank] ?? 0 }),
        );
        wrap.append(b);
      }
      row.append(wrap);
      return row;
    });
    agirEl.append(
      section(
        `Magias — ${caster.name}`,
        info,
        ...(c.attacks.length ? [] : [mapRow()]),
        attack,
        ...slotRows,
        ...spellRows,
      ),
    );
  }

  if (c.focusPoints > 0 || c.focusSpells.length || c.focusCantrips.length) {
    const used = Math.min(c.focusPoints, state.focusUsed ?? 0);
    const row = el("div", "pips");
    row.append(el("span", "lbl", "Foco"));
    row.append(
      ...pips(c.focusPoints, used, (next) => {
        state.focusUsed = next;
        commit(c);
      }),
    );
    const wrap = el("div", "chips");
    for (const name of c.focusCantrips) {
      const b = el("button", "spell", name);
      b.type = "button";
      b.title = "Truque de foco (não gasta ponto)";
      b.addEventListener("click", () => void openSpellCard(c, { mode: "focusCantrip", name, rank: 0, slotTotal: 0 }));
      wrap.append(b);
    }
    for (const name of c.focusSpells) {
      const b = el("button", "spell focus", name);
      b.type = "button";
      b.title = "Magia de foco (gasta 1 ponto de foco)";
      b.addEventListener("click", () => void openSpellCard(c, { mode: "focus", name, rank: 0, slotTotal: 0 }));
      wrap.append(b);
    }
    agirEl.append(section("Magias de foco", row, wrap));
  }

  if (c.casters.length || c.focusPoints > 0) {
    const rest = el("button", undefined, "Descansar (recuperar espaços e foco)");
    rest.type = "button";
    rest.addEventListener("click", () => {
      state.slotsUsed = {};
      state.focusUsed = 0;
      commit(c);
      void publishEvent("descansou e recuperou espaços de magia e pontos de foco.");
    });
    fichaEl.append(rest);
  }
}

/** Fileira de marcadores: cheio = disponível. Clicar num cheio gasta; num vazio devolve. */
function pips(total: number, used: number, onChange: (used: number) => void): HTMLElement[] {
  return Array.from({ length: total }, (_, i) => {
    const available = i < total - used;
    const b = el("button", `pip${available ? " on" : ""}`);
    b.type = "button";
    b.setAttribute("aria-label", available ? "Gastar" : "Recuperar");
    b.addEventListener("click", () => onChange(available ? used + 1 : used - 1));
    return b;
  });
}

function say(text: string, error = false) {
  statusEl.textContent = text;
  statusEl.className = error ? "status error" : "status";
  // A linha de status fica no alto da ficha e pode estar fora da tela: erros também viram aviso.
  if (error) void OBR.notification.show(text, "ERROR");
}

/** Aviso bem visível durante a escolha de alvo: na própria faixa roxa e num aviso na tela. */
function warn(text: string) {
  bannerNote = text;
  updateBanner();
  say(text, true);
}

interface CastOpts {
  name: string;
  /** 0 = truque. */
  rank: number;
  slotTotal: number;
  /** Magia de foco: gasta 1 ponto (truques de foco não gastam). */
  spendsFocus: boolean;
  /** Procurar o arquivo da magia na pasta de magias de foco. */
  focusFile: boolean;
}

/**
 * Conjura uma magia. Se os dados dela (foundryvtt/pf2e) mostram salvaguarda, dano ou ataque,
 * pede o alvo e resolve tudo; senão só gasta o recurso e avisa a sala.
 */
async function castCore(c: Character, o: CastOpts) {
  const { name, rank } = o;
  if (rank > 0 && (state.slotsUsed?.[rank] ?? 0) >= o.slotTotal) {
    say(`Sem espaços de magia de rank ${rank} para conjurar ${name}.`, true);
    return;
  }
  if (o.spendsFocus && (state.focusUsed ?? 0) >= c.focusPoints) {
    say(`Sem pontos de foco para ${name}.`, true);
    return;
  }

  /** Gasta o recurso; `announce` avisa a sala (quando a magia não tem alvo). */
  const spend = (announce: boolean) => {
    let left = "";
    if (rank > 0) {
      const used = state.slotsUsed?.[rank] ?? 0;
      state.slotsUsed = { ...state.slotsUsed, [rank]: used + 1 };
      left = `Restam ${o.slotTotal - used - 1} espaço(s) de rank ${rank}.`;
    }
    if (o.spendsFocus) {
      const used = state.focusUsed ?? 0;
      state.focusUsed = used + 1;
      left = `Restam ${c.focusPoints - used - 1} ponto(s) de foco.`;
    }
    if (rank > 0 || o.spendsFocus) commit(c);
    say(`${name} conjurada. ${left}`.trim());
    if (announce) {
      const how = rank === 0 && !o.spendsFocus ? "lançou o truque" : "conjurou";
      void publishEvent(`${how} ${name}${rank > 0 ? ` (rank ${rank})` : ""}. ${left}`.trim());
    }
  };

  say(`Procurando as regras de ${name}…`);
  const data = await fetchSpell(name, rank, c.className, o.focusFile).catch(() => null);
  if (!data) {
    spend(true);
    return;
  }

  // Truques e magias de foco crescem sozinhos: metade do nível, arredondada para cima.
  const rankForHeighten = rank > 0 ? rank : Math.ceil(c.level / 2);
  const caster = c.casters[0];
  const cast: SpellCast = {
    casterName: c.name,
    casterId: c.pathbuilderId,
    casterColor: await OBR.player.getColor(),
    spell: data,
    rank: rankForHeighten,
    dc: caster?.dc ?? c.classDC,
    abilityMod: caster ? c.abilities[caster.ability] : 0,
  };
  const parts = damageParts(data, rankForHeighten, cast.abilityMod);

  if (data.save) {
    await askSpellTarget(name, cast, "save", () => spend(false));
    return;
  }
  if (data.tempHp) {
    await askSpellTarget(name, cast, "temp", () => spend(false));
    return;
  }
  if (parts && parts.length > 0) {
    if (data.healing) {
      await askSpellTarget(name, cast, "heal", () => spend(false));
    } else if (data.attack) {
      const p = parts[0];
      const bonus = withConditions(caster?.attack ?? 0, state.conditions, {
        ability: caster?.ability,
        isAttack: true,
      }).value;
      await beginAttack(
        name,
        bonus,
        { dice: p.count, die: p.die, bonus: p.bonus, type: p.type },
        () => spend(false),
        data.rangeFeet,
      );
    } else {
      await askSpellTarget(name, cast, "auto", () => spend(false));
    }
    return;
  }
  spend(true); // sem alvo (ex.: bênção): só gasta e avisa
  if (data.damage.length > 0) {
    say(`${name} conjurada. O dano não é automático nesta magia: role na aba Dados.`);
  }
}

/**
 * Clique numa magia: abre o cartão "o que esta magia faz" (no meio da tela), com o botão Conjurar
 * e, discreto, "Mostrar a todos". Conjurar de verdade só acontece ao clicar em Conjurar.
 */
async function openSpellCard(c: Character, a: CastAction) {
  say(`Buscando as regras de ${a.name}…`);
  const spell = await fetchSpell(a.name, a.rank, c.className, a.mode !== "spell").catch(() => null);
  say("");
  // Magias de foco crescem até metade do nível; truques de foco aparecem como truque.
  const shownRank = a.mode === "focus" ? Math.ceil(c.level / 2) : a.rank;
  await showCard({ kind: "spellinfo", name: a.name, rank: shownRank, spell, cast: a });
}

function castSpell(c: Character, slotTotal: number, rank: number, name: string) {
  return castCore(c, { name, rank, slotTotal, spendsFocus: false, focusFile: false });
}

function castFocus(c: Character, name: string) {
  return castCore(c, { name, rank: 0, slotTotal: 0, spendsFocus: true, focusFile: true });
}

function castFocusCantrip(c: Character, name: string) {
  return castCore(c, { name, rank: 0, slotTotal: 0, spendsFocus: false, focusFile: true });
}

async function importById(id: string) {
  statusEl.textContent = "Buscando ficha…";
  statusEl.className = "status";
  try {
    const build = await fetchBuild(id);
    const c = toCharacter(build, id);
    store.set(id);
    const stored = await loadState(id).catch(() => undefined);
    state = stored ?? newState(c);
    // Garante PV máx. e CA no estado e grava na sala: sem isso, o token vinculado não mostra a barra.
    state.max = hpMaxWithConditions(c.hpMax, c.level, state.conditions);
    state.ac = acWithConditions(c.ac, state.conditions).value;
    if (JSON.stringify(stored) !== JSON.stringify(state)) {
      await saveState(id, state).catch(() => undefined);
    }
    renderSheet(c);
    combatUi?.render();
    statusEl.textContent = `Ficha de ${c.name} importada.`;
  } catch (e) {
    statusEl.textContent = e instanceof Error ? e.message : "Não foi possível importar a ficha.";
    statusEl.className = "status error";
  }
}

$("#import").addEventListener("submit", (ev) => {
  ev.preventDefault();
  void importById(pbidEl.value.trim());
});

let combatUi: { render(): void } | undefined;
let creaturesUi: { render(): void; focus(id: string): void } | undefined;
let isGmRole = false;
/** Ficha fixada ao token do jogador: é a única que ele abre. */
let pinned = false;

OBR.onReady(async () => {
  listenAttackAcks();
  refreshDice();
  // O botão Conjurar do cartão da magia manda conjurar aqui (é este painel que tem a ficha).
  OBR.broadcast.onMessage(CAST_REQ, (event) => {
    const a = event.data as CastAction;
    if (!current) return;
    if (a.mode === "focus") void castFocus(current, a.name);
    else if (a.mode === "focusCantrip") void castFocusCantrip(current, a.name);
    else void castSpell(current, a.slotTotal, a.rank, a.name);
  });

  // A ferramenta de área (página de fundo) devolve os tokens que ficaram dentro dela.
  // Ajuste do mestre: rolagem automática liberada ou não (padrão: todos veem a pergunta).
  if ((await OBR.player.getRole()) === "GM") gmLabel.hidden = false;
  autoAllowed = (await loadSettings()).autoRollAllowed;
  applySettings();
  onSettingsChange((cfg) => {
    autoAllowed = cfg.autoRollAllowed;
    applySettings();
  });
  OBR.broadcast.onMessage(AREA_RESULT, async (event) => {
    const r = event.data as AreaResultMsg;
    if (pending?.kind !== "spell") return;
    if (r.error) {
      say(r.error, true);
      return;
    }
    if (r.cancelled) {
      say("Posicionamento cancelado. Use “Posicionar área” de novo ou marque os alvos clicando nos tokens.");
      return;
    }
    marked = [];
    for (const id of r.tokenIds) {
      const t = await describeTarget(id, selfIsTarget());
      if (t) marked.push(t);
    }
    updateBanner();
    say(
      marked.length > 0
        ? `Área posicionada: ${marked.length} alvo(s) marcado(s). Ajuste clicando nos tokens, ou clique em Resolver.`
        : "Nenhum token com ficha ou criatura vinculada dentro da área. Marque os alvos à mão ou reposicione.",
      marked.length === 0,
    );
  });
  // Aba de criaturas: só o mestre vê (os dados ficam no navegador dele).
  if ((await OBR.player.getRole()) === "GM") {
    $("#creatures-tab").hidden = false;
    creaturesUi = initCreatures($("#gm-creatures"));
    isGmRole = true;
  }
  combatUi = await initCombat($("#tab-combate"), {
    getCharacter: () => current,
    getState: () => state,
  });
  // Jogador: a ficha presa ao token dele vira a única ficha disponível.
  const mine = isGmRole ? undefined : await myPinnedLink().catch(() => undefined);
  if (mine?.pathbuilderId) {
    pinned = true;
    store.set(mine.pathbuilderId);
    pbidEl.value = mine.pathbuilderId;
    $("#import").hidden = true;
    const note = document.createElement("p");
    note.className = "sub";
    note.textContent = `Ficha fixada ao seu token: ${mine.name}.`;
    $("#import").after(note);
    void importById(mine.pathbuilderId);
  }
  const saved = store.get();
  if (pinned) {
    /* já carregada acima */
  } else if (saved) {
    pbidEl.value = saved;
    void importById(saved);
  } else {
    switchTab("ficha"); // sem ficha ainda: começa onde se importa
  }

  // Novo turno de combate: volta ao 1º ataque (penalidade de ataques múltiplos).
  // O MAP de todos volta ao 1º ataque quando o round muda (ou o combate acaba) e, para cada
  // jogador, quando chega o turno da própria personagem.
  let lastRound = -1;
  let turnKey = "";
  onCombatChange((c) => {
    const key = `${c.active}-${c.round}-${c.turn}`;
    if (key === turnKey) return;
    turnKey = key;
    const roundChanged = c.round !== lastRound || !c.active;
    lastRound = c.round;
    const myTurn = !!current?.pathbuilderId && c.active && c.list[c.turn]?.id === current.pathbuilderId;
    if (!roundChanged && !myTurn) return;
    attackNumber = 1;
    flankMemory.clear();
    if (current) renderSheet(current);
  });

  // Mudanças de PV/condições feitas por outras pessoas na sala.
  onStateChange((all) => {
    const id = current?.pathbuilderId;
    const incoming = id ? all[id] : undefined;
    if (!current || !incoming || JSON.stringify(incoming) === JSON.stringify(state)) return;
    state = incoming;
    const scroll = $("#tab-ficha").parentElement!.scrollTop;
    renderSheet(current);
    $("#tab-ficha").parentElement!.scrollTop = scroll;
  });

  // Ao selecionar um token vinculado, abre a ficha dele.
  let lastSelection = "";
  OBR.player.onChange(async (player) => {
    const key = (player.selection ?? []).join(",");
    if (key === lastSelection) return;
    lastSelection = key;

    // Esperando o alvo de um ataque: o próximo token selecionado é o alvo.
    if (pending) {
      await onSelectionWhilePending(player.selection ?? [], key);
      return;
    }

    // Jogador só abre a ficha do próprio token; a de outro jogador não abre. O mestre abre todas.
    const link = await openableLinkOfSelection();
    if (pinned) return;
    if (link && link.pathbuilderId && link.pathbuilderId !== current?.pathbuilderId) {
      pbidEl.value = link.pathbuilderId;
      switchTab("agir");
      void importById(link.pathbuilderId);
      return;
    }

    // Mestre: tocar no token de uma criatura abre a ficha dela na aba Mestre, como nas fichas dos jogadores.
    const picked = player.selection ?? [];
    if (isGmRole && picked.length === 1) {
      const creature = await creatureOfToken(picked[0]);
      if (creature) {
        switchTab("criaturas");
        creaturesUi?.focus(creature.id);
      }
    }
  });
});
