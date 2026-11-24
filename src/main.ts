import OBR from "@owlbear-rodeo/sdk";
import "./tokens.css";
import "./style.css";
import "./theme.css";
import type { Attack, Character, GearItem, Stat } from "./character";
import { parseDamage } from "./damage";
import { creatureAc, getCreature, type Creature, type CreatureAbility } from "./creatures";
import { cancelCreatureAttack, creatureAttackSelection, setCreatureConfirm, watchCreatureAttack } from "./creatureAttack";
import { abilityCast } from "./creatureAbility";
import { CARD_SHARE, type CardData } from "./cardData";
import { aonSearch, fetchEquipment, fetchFeat } from "./featData";
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
import { applyRecovery, deathLimit, hitWhileDown, recoveryDc, settle, stabilize } from "./dying";
import { CAST_REQ, type CastAction } from "./cardData";
import { showCard } from "./cardView";
import { tokenDistanceFeet } from "./grid";
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
import { listenAttackAcks, sendCreatureAttack, sendCreatureManeuver, sendCreatureSpell } from "./gmResolver";
import { DC_PT, MANEUVERS, maneuverById, resolveManeuver, type Maneuver, type ManeuverId, type ManeuverResult, type ManeuverSpec } from "./maneuver";
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
import { damageParts, fetchSpell, tempHpAmount, type SpellData } from "./spellData";
import { prefetchFixes, suggestionText } from "./spellFixes";
import { closeForTap, onPanelOpened, reopenAfterTap, takeTap, whenTokenTapped } from "./tokenTap";
import { actionRange, defaultFormula, parseFormulas, saveFormula, savedFormula } from "./spellTweak";
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
      <div id="sheet-ficha"></div>
    </section>
    <section id="tab-combate" hidden></section>
    <section id="tab-morrendo" hidden></section>
    <section id="tab-criaturas" hidden>
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
        <button type="button" id="manual-targets" hidden>Alvos à mão</button>
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
    <button data-tab="morrendo" id="dying-tab" class="dying-tab" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10zM3 13h4l2-3 3 5 2-3h7"/></svg><span>Morrendo</span></button>
    <button data-tab="criaturas" id="creatures-tab" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18.5h16M4 18.5 3 8l5 4 4-7 4 7 5-4-1 10.5"/></svg><span>Mestre</span></button>
  </nav>
`;

const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;

/* ---------- abas ---------- */
const TABS = ["agir", "testes", "ficha", "combate", "morrendo", "criaturas"] as const;
type TabName = (typeof TABS)[number];

/** Aba aberta e, no mestre, a criatura em foco (a que ele tocou no mapa). */
let activeTab: TabName = "agir";
let focusedCreatureId: string | null = null;

function switchTab(name: TabName) {
  activeTab = name;
  if (name !== "criaturas") focusedCreatureId = null;
  if (current) renderHud(current);
  else renderMasterHud();
  app.querySelectorAll<HTMLButtonElement>(".tabs button[data-tab]").forEach((x) => {
    x.classList.toggle("active", x.dataset.tab === name);
  });
  for (const t of TABS) $(`#tab-${t}`).hidden = t !== name;
}
app.querySelectorAll<HTMLButtonElement>(".tabs button[data-tab]").forEach((b) =>
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

/** Bônus extra de uma rolagem (ex.: o mestre concedeu +1 pela interpretação). Vale só para a próxima. */
let extraValue = "";
const extraInputs: HTMLInputElement[] = [];
const extraBonus = () => parseInt(extraValue, 10) || 0;
function resetExtra() {
  extraValue = "";
  for (const i of extraInputs) i.value = "";
}

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
    const x = extraBonus();
    resetExtra();
    if (custom) {
      custom(value + x);
      return;
    }
    void (async () => {
      // Antes de rolar, pergunta e deixa somar ou subtrair um bônus só desta rolagem.
      const ask = await confirmRoll(title, [`Modificador: ${signed(value + x)}${target() !== undefined ? ` · CD ${target()}` : ""}`]);
      if (!ask.ok) return;
      const total = x + ask.bonus;
      const t = total ? `${title} (bônus ${signed(total)})` : title;
      const msg = await publishRoll({ title: t, count: 1, sides: 20, mod: value + total, dc: target() });
      void showCard({ kind: "check", msg });
    })();
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
  /** Manobra (Agarrar, Derrubar…): perícia contra a CD do alvo, em vez de ataque contra a CA. */
  maneuver?: ManeuverId;
  /** Ataque de magia: permite ajustar ações e fórmula de dano na caixa de confirmação. */
  tweak?: DamageEdit;
};
/** Dano de magia editável na caixa "deseja rolar?" (ações gastas e fórmula). */
interface DamageEdit {
  spell: SpellData;
  rank: number;
  abilityMod: number;
}
type SpellPending = PendingBase & {
  kind: "spell";
  cast: SpellCast;
  mode: "save" | "auto" | "heal" | "temp";
  /** Habilidade de criatura: token de quem usa (origem da área) e o cartão aparece para todos. */
  casterToken?: string;
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
const handBtn = $<HTMLButtonElement>("#manual-targets");
let handPick = false; // magia de área sem a área: o mestre/jogador marca os alvos clicando nos tokens
const noteEl = $<HTMLDivElement>("#target-note");

/* ---------- perguntar antes de rolar + cartão de resultados ---------- */
const confirmEl = $<HTMLDivElement>("#manual");
/** O jogador sempre confirma antes de os dados rolarem. `ok: false` = cancelou. */
/** Como este ataque conta para a penalidade de ataques múltiplos (MAP). */
type MapMode = "normal" | "none" | "double";

/** Alvos já marcados como flanqueados neste turno (volta a vazio quando o turno muda). */
const flankMemory = new Map<string, boolean>();

function confirmRoll(
  title: string,
  lines: string[],
  /** Em ataques: nome do alvo, para oferecer a opção "alvo flanqueado". */
  flankTarget?: string,
  /** Manobras: sem a opção de flanqueio (só MAP). */
  opts?: { flank?: boolean; damage?: DamageEdit },
): Promise<{ ok: boolean; flanked: boolean; bonus: number; map: MapMode; formula?: string; actions?: number }> {
  return new Promise((resolve) => {
    targetingEl.hidden = true; // uma coisa de cada vez na barra de ação
    confirmEl.replaceChildren();
    const text = el("div");
    text.style.flex = "1 1 100%";
    text.append(el("strong", undefined, `${title}: deseja rolar os dados?`));
    for (const l of lines) text.append(el("div", "sub", l));

    // Contador: soma ou subtrai um bônus só nesta rolagem (o mestre deu +1, terreno difícil…).
    const stepRow = el("div", "import");
    const stepLabel = el("span", "sub", "Bônus nesta rolagem");
    const stepInput = el("input");
    stepInput.type = "number";
    stepInput.value = "0";
    stepInput.style.width = "64px";
    const step = (d: number) => {
      stepInput.value = String((parseInt(stepInput.value, 10) || 0) + d);
    };
    stepRow.append(stepLabel, button("−", () => step(-1), "mini"), stepInput, button("+", () => step(1), "mini"));
    text.append(stepRow);

    // Flanqueio: o alvo fica Desprevenido (−2 na CA) contra este ataque.
    let box: HTMLInputElement | undefined;
    if (flankTarget !== undefined && opts?.flank !== false) {
      const label = el("label", "flank-option");
      box = el("input");
      box.type = "checkbox";
      box.checked = flankMemory.get(flankTarget) ?? false;
      label.append(box, " Inimigo flanqueado (Desprevenido: −2 na CA)");
      text.append(label);
    }

    // MAP: habilidades que ignoram a penalidade (e não contam como ataque) ou contam como dois ataques.
    let mapMode: MapMode = "normal";
    if (flankTarget !== undefined) {
      const group = el("div", "map-options");
      const opt = (mode: MapMode, label: string) => {
        const lab = el("label", "flank-option");
        const r = el("input");
        r.type = "radio";
        r.name = "map-mode";
        r.checked = mode === "normal";
        r.addEventListener("change", () => {
          if (r.checked) mapMode = mode;
        });
        lab.append(r, " " + label);
        group.append(lab);
      };
      opt("normal", "MAP normal");
      opt("none", "Sem MAP (não leva a penalidade nem conta como ataque)");
      opt("double", "Conta como 2 ataques (o MAP do próximo avança em dobro)");
      text.append(group);
    }

    // Dano de magia: ações gastas (se o custo varia) e fórmula editável; o ajuste fica guardado no navegador.
    let formulaInput: HTMLInputElement | undefined;
    let chosenActions = 1;
    const dmg = opts?.damage;
    if (dmg) {
      const range = actionRange(dmg.spell);
      chosenActions = range ? range[0] : 1;
      const group = el("div", "dmg-edit");
      formulaInput = el("input");
      formulaInput.type = "text";
      formulaInput.className = "dmg-formula";
      const fallback = () => defaultFormula(dmg.spell, dmg.rank, dmg.abilityMod, chosenActions) ?? "";
      const note = el("div", "sub");
      const refresh = () => {
        const saved = savedFormula(dmg.spell, dmg.rank, chosenActions);
        formulaInput!.value = saved ?? fallback();
        note.textContent = saved ? "Fórmula guardada neste navegador para esta magia." : "";
      };
      const head = el("div", "import");
      head.append(el("span", "sub", "Dano (pode editar)"));
      if (range) {
        const sel = el("select");
        for (let n = range[0]; n <= range[1]; n++) sel.append(new Option(`${n} ${n === 1 ? "ação" : "ações"}`, String(n)));
        sel.addEventListener("change", () => {
          chosenActions = parseInt(sel.value, 10);
          refresh();
        });
        head.append(sel);
      }
      head.append(
        button("Padrão", () => {
          saveFormula(dmg.spell, dmg.rank, chosenActions, null);
          refresh();
        }, "mini"),
        button("Sugerir correção", () => {
          const txt = suggestionText(dmg.spell.name, dmg.rank, chosenActions, formulaInput!.value.trim());
          void navigator.clipboard?.writeText(txt).then(
            () => say("Correção copiada. Mande para quem cuida do repositório (pasta spell-fixes)."),
            () => say(`Copie e envie: ${txt}`),
          );
        }, "mini"),
      );
      refresh();
      group.append(head, formulaInput, note);
      text.append(group);
    }

    const done = (v: boolean) => {
      if (v && box && flankTarget !== undefined) flankMemory.set(flankTarget, box.checked);
      let formula: string | undefined;
      if (v && dmg && formulaInput) {
        formula = formulaInput.value.trim();
        const same = formula === (defaultFormula(dmg.spell, dmg.rank, dmg.abilityMod, chosenActions) ?? "");
        saveFormula(dmg.spell, dmg.rank, chosenActions, same ? null : formula);
      }
      confirmEl.hidden = true;
      confirmEl.replaceChildren();
      updateBanner(); // volta a faixa de alvo, se ainda houver
      resolve({
        ok: v,
        flanked: v && !!box?.checked,
        bonus: v ? parseInt(stepInput.value, 10) || 0 : 0,
        map: mapMode,
        formula,
        actions: dmg ? chosenActions : undefined,
      });
    };
    const roll = el("button", undefined, "Rolar dados");
    roll.type = "button";
    roll.addEventListener("click", () => {
      if (formulaInput && !parseFormulas(formulaInput.value)) {
        formulaInput.classList.add("bad");
        formulaInput.title = "Use o formato 2d8+3 tipo; separe várias com ponto e vírgula.";
        formulaInput.focus();
        return;
      }
      done(true);
    });
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

// Ataques das criaturas do mestre usam a mesma tela de confirmação dos jogadores.
setCreatureConfirm((title, lines, targetName) => confirmRoll(title, lines, targetName));

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
    casterTokenId: pending.casterToken ?? (await casterTokenId()),
    rangeFeet: pending.cast.spell.rangeFeet,
    free,
  };
  await OBR.broadcast.sendMessage(AREA_ARM, msg, { destination: "LOCAL" });
}

const clearArea = () => void OBR.broadcast.sendMessage(AREA_CLEAR, {}, { destination: "LOCAL" });

const isSpellWithRange = (p: Pending) => p.kind === "spell" && p.cast.spell.rangeFeet !== undefined;

/** Ataque de criatura esperando o alvo: usa a mesma faixa dos ataques dos jogadores. */
let creatureBanner: string | null = null;
watchCreatureAttack((title) => {
  creatureBanner = title;
  updateBanner();
});

function updateBanner() {
  const p = pending;
  targetingEl.hidden = p === null && creatureBanner === null;
  noteEl.hidden = p === null || bannerNote === "";
  noteEl.textContent = bannerNote;
  if (!p) {
    if (creatureBanner !== null) {
      for (const b of [multiBtn, areaBtn, handBtn, resolveBtn, clearBtn]) b.hidden = true;
      targetingEl.querySelector("span")!.textContent = `${creatureBanner}: selecione o token do alvo no mapa.`;
    }
    return;
  }
  const isSpell = p.kind === "spell";
  const area = isSpell ? p.cast.spell.area : undefined;
  multiBtn.hidden = !isSpell;
  multiBtn.textContent = multiMode ? "Um alvo só" : "Vários alvos";
  areaBtn.hidden = !area;
  handBtn.hidden = !area || handPick;
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
  targetingEl.querySelector("span")!.textContent = area && handPick
    ? `${p.title}: alvos à mão, sem a área. ${marked.length} alvo(s) marcado(s)${names}. Clique nos tokens para marcar ou desmarcar e depois em Resolver; Posicionar área volta a usar a área.`
    : area
    ? `${p.title}: ${KIND_PT[area.kind]} de ${area.feet} pés. ${where} ${marked.length} alvo(s) marcado(s)${names}. Ajuste clicando nos tokens e depois em Resolver.`
    : multiMode
      ? `${p.title}: ${marked.length} alvo(s) marcado(s)${names}. Clique nos tokens para marcar ou desmarcar e depois em Resolver.`
      : `${p.title}: selecione o token do alvo no mapa.`;
}

function setTargeting(p: Pending | null) {
  pending = p;
  multiMode = false;
  handPick = false;
  marked = [];
  bannerNote = "";
  if (!p) clearArea(); // apaga a área desenhada no mapa
  updateBanner();
  // Celular: ataque, manobra e magia de um alvo fecham o painel; o próximo token tocado é o alvo.
  // Magia de área precisa do painel aberto (posicionar a área e Resolver), então não fecha.
  if (p && (p.kind === "attack" || !p.cast.spell.area)) {
    void closeForTap().then((closed) => {
      if (closed && pending === p) p.startSelection = ""; // a seleção foi limpa: qualquer toque conta
    });
  }
}

areaBtn.addEventListener("click", () => {
  handPick = false;
  void armArea(true);
  updateBanner();
});
handBtn.addEventListener("click", () => {
  // Descarta a área desenhada e começa uma lista vazia: só entra quem for clicado.
  handPick = true;
  multiMode = true;
  marked = [];
  clearArea();
  updateBanner();
});

function cancelTargeting() {
  if (creatureBanner !== null) cancelCreatureAttack();
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
  if (e.key === "Escape" && (pending || creatureBanner !== null)) cancelTargeting();
});

/** Magias de PV temporários podem ser lançadas em si mesmo. */
const selfIsTarget = () => pending?.kind === "spell" && pending.mode === "temp";

/** Descreve o token como alvo: criatura do mestre ou ficha de jogador (nunca o próprio conjurador). */
async function describeTarget(tokenId: string, allowSelf = false): Promise<Marked | undefined> {
  if (!allowSelf && pending?.kind === "spell" && pending.casterToken === tokenId) return undefined;
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
  const { mode } = p;
  let cast = p.cast;

  // Pergunta antes de rolar; cancelar não gasta nada. Com dano, a fórmula e as ações podem ser ajustadas.
  const alvos = targets.map((t) => t.name).join(", ");
  const hasDamage = mode !== "temp" && (mode !== "save" || !!cast.spell.save?.basic) && !!damageParts(cast.spell, cast.rank, cast.abilityMod);
  const ask = await confirmRoll(
    cast.spell.name,
    [`Alvos: ${alvos}`, `CD ${cast.dc}`],
    undefined,
    hasDamage ? { damage: { spell: cast.spell, rank: cast.rank, abilityMod: cast.abilityMod } } : undefined,
  );
  if (!ask.ok) return;
  if (ask.formula) cast = { ...cast, formula: ask.formula, actions: ask.actions };

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

    const card: CardData = { kind: "spell", cast, mode, rolled, results, offline };
    void showCard(card);
    if (p.casterToken) {
      // Habilidade de criatura: o resultado é público (alvos secretos não vazam PV nem CA).
      void OBR.broadcast.sendMessage(CARD_SHARE, { ...card, sharedBy: "Mestre" }, { destination: "REMOTE" });
    }
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
  tweak?: DamageEdit,
) {
  // O alvo de um ataque é sempre um token escolhido no mapa; o bônus extra vale para este ataque.
  const x = extraBonus();
  resetExtra();
  bonus += x;
  const startSelection = ((await OBR.player.getSelection()) ?? []).join(",");
  setTargeting({ kind: "attack", title, bonus, damage, startSelection, consume, rangeFeet, tweak });
}

/** Clique numa manobra: pede o alvo no mapa (mesma faixa dos ataques), pergunta e rola contra a CD dele. */
async function beginManeuver(m: Maneuver, bonus: number) {
  const startSelection = ((await OBR.player.getSelection()) ?? []).join(",");
  setTargeting({ kind: "attack", title: m.name, bonus, startSelection, maneuver: m.id });
}

/** Rola a manobra no alvo escolhido (ficha de jogador ou criatura do mestre) e aplica as condições. */
async function resolveManeuverOn(p: AttackPending, targetName: string, creatureId: string | undefined, pbId: string | undefined) {
  if (!current) return;
  const m = maneuverById(p.maneuver!);
  const penalty = m.attack ? mapFor(attackNumber) : 0;
  const lines = [
    `Alvo: ${targetName}`,
    `${m.skillName}: d20 ${signed(p.bonus)}${penalty ? ` −${penalty} (ataques múltiplos)` : ""}`,
    `Contra a CD de ${DC_PT[m.dc]} do alvo`,
  ];
  const next = mapFor(attackNumber + 1);
  lines.push(
    m.attack
      ? `Ataque nº ${attackNumber}: MAP ${penalty ? `−${penalty}` : "0"} · o próximo terá ${next ? `−${next}` : "0"}`
      : `${m.name} não tem o traço de ataque: sem MAP (a opção "Conta como 2 ataques" ainda avança o contador)`,
  );
  // A mesma caixa de todas as outras rolagens (bônus nesta rolagem, flanqueio e MAP).
  const answer = await confirmRoll(p.title, lines, targetName);
  if (!answer.ok) return;

  setTargeting(null);
  const spec: ManeuverSpec = {
    attackerName: current.name,
    attackerColor: await OBR.player.getColor(),
    sourceId: current.pathbuilderId,
    title: p.title,
    bonus: p.bonus + answer.bonus,
    mapPenalty: m.attack && answer.map !== "none" ? penalty : 0,
  };
  if (m.attack) attackNumber += answer.map === "none" ? 0 : answer.map === "double" ? 2 : 1;
  else if (answer.map === "double") attackNumber += 2;

  try {
    let result: ManeuverResult | null;
    if (creatureId) {
      say(`Manobra enviada ao mestre contra ${targetName}…`);
      const r = await sendCreatureManeuver(spec, m.id, creatureId);
      if (!r.online) {
        say("O mestre não respondeu. Ele precisa estar na sala com a extensão ativa.", true);
        if (current) renderSheet(current);
        return;
      }
      result = r.result;
    } else {
      result = await resolveManeuver(spec, m, pcSaveTarget(pbId!, targetName));
    }
    if (result) {
      void showCard({ kind: "maneuver", result });
      // Efeitos em quem fez a manobra (ex.: cair no chão ao falhar criticamente) valem na ficha dele.
      if (result.self.length > 0 && current.pathbuilderId) {
        await pcSaveTarget(current.pathbuilderId, current.name).applyConditions(result.self, current.pathbuilderId);
      }
      say(`${p.title} em ${targetName}: ${DEGREE_TEXT[result.degree]}. ${result.text}`);
    } else {
      say("O mestre não conseguiu resolver a manobra (alvo sem dados cadastrados).", true);
    }
  } catch (e) {
    say(e instanceof Error ? e.message : "Não foi possível resolver a manobra.", true);
  }
  if (current) renderSheet(current);
}

async function askSpellTarget(
  title: string,
  cast: SpellCast,
  mode: "save" | "auto" | "heal" | "temp",
  consume: () => void,
  casterToken?: string,
) {
  const startSelection = ((await OBR.player.getSelection()) ?? []).join(",");
  setTargeting({ kind: "spell", title, cast, mode, startSelection, consume, casterToken });
  if (cast.spell.area) {
    // Magia de área: já entra no modo de vários alvos e pede para posicionar a área no mapa.
    multiMode = true;
    updateBanner();
    await armArea();
  }
}

/** Mestre: usa uma habilidade da criatura pelo mesmo sistema dos jogadores (alvos no mapa, área, Resolver). */
async function useCreatureAbility(c: Creature, a: CreatureAbility) {
  if (!a.save || !a.dc) {
    say(`${a.name}: cadastre a salvaguarda e a CD para automatizar.`, true);
    return;
  }
  const cast = await abilityCast(c, a);
  await askSpellTarget(a.name, cast, "save", () => undefined, c.tokenId);
}

async function onTargetPicked(tokenId: string) {
  const p = pending;
  if (!p) return;
  if (p.kind === "attack" && !current) return;
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
  if (!current) return;

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
  if (p.maneuver) {
    await resolveManeuverOn(p, targetName, creature?.id, link?.pathbuilderId);
    return;
  }
  const penalty = mapFor(attackNumber);

  // Pergunta antes de rolar (se a opção está ligada); cancelar mantém o alvo para escolher outro.
  const answer = await confirmRoll(
    p.title,
    attackConfirmLines(p, targetName, penalty),
    targetName,
    p.tweak ? { damage: p.tweak } : undefined,
  );
  if (!answer.ok) return;

  setTargeting(null);
  p.consume?.();
  // Ataque de magia com a fórmula ajustada: vale a primeira parte (o ataque rola um dano só).
  const edited = answer.formula ? parseFormulas(answer.formula, p.damage?.type ?? "")?.[0] : undefined;
  const spec: AttackSpec = {
    attackerName: current.name,
    attackerColor: await OBR.player.getColor(),
    title: p.title,
    bonus: p.bonus + answer.bonus,
    mapPenalty: answer.map === "none" ? 0 : penalty,
    damage: edited ? { dice: edited.count, die: edited.die, bonus: edited.bonus, type: edited.type } : p.damage,
    flanking: answer.flanked,
  };
  // Sem MAP: não conta como ataque. Conta como 2: o contador avança em dobro.
  attackNumber += answer.map === "none" ? 0 : answer.map === "double" ? 2 : 1;

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
  const next = mapFor(attackNumber + 1);
  const lines = [
    `Alvo: ${targetName}`,
    `Ataque: d20 ${signed(p.bonus)}${penalty ? ` −${penalty} (ataques múltiplos)` : ""}`,
    `Ataque nº ${attackNumber}: MAP ${penalty ? `−${penalty}` : "0"} · o próximo terá ${next ? `−${next}` : "0"}`,
  ];
  if (p.damage && !p.tweak) {
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

/* ---------- dano personalizado por arma ---------- */
const sheetDamageText = (a: Attack) =>
  `${formulaText(a.damage.dice, a.damage.die, a.damage.bonus)}${a.damage.type ? ` ${a.damage.type}` : ""}`;

/** Modos da arma: o primeiro é sempre o da ficha; os outros são do jogador. */
function damageModes(a: Attack): { label: string; formula: string }[] {
  const extra = state.dmg?.[a.name]?.modes ?? [];
  return [{ label: "Ficha", formula: sheetDamageText(a) }, ...extra];
}

/** Dano em uso nesta arma (o modo escolhido, ou o da ficha). */
function activeDamage(a: Attack): { spec: Attack["damage"]; label: string } {
  const idx = state.dmg?.[a.name]?.active ?? 0;
  const mode = damageModes(a)[idx];
  const parsed = mode ? parseDamage(mode.formula) : null;
  return parsed && idx > 0 ? { spec: parsed, label: mode.label } : { spec: a.damage, label: "" };
}

const dmgOpen = new Set<string>();

function button(text: string, onClick: () => void, cls?: string): HTMLButtonElement {
  const b = el("button", cls, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

/** Editor: o jogador cria modos de dano (duas mãos, com a runa…) e escolhe qual usar. */
function damageEditor(c: Character, a: Attack): HTMLElement {
  const box = el("div", "visibility");
  const cfg = state.dmg?.[a.name] ?? { modes: [], active: 0 };
  const save = (next: { modes: { label: string; formula: string }[]; active: number }) => {
    const dmg = { ...(state.dmg ?? {}) };
    if (next.modes.length === 0) delete dmg[a.name];
    else dmg[a.name] = next;
    state.dmg = Object.keys(dmg).length > 0 ? dmg : undefined;
    commit(c);
  };
  box.append(el("strong", undefined, `Dano de ${a.name}`));
  box.append(
    el("p", "sub", "Escolha o modo em uso. O ataque aplica o dano dele sozinho ao acertar. Fórmula: 1d12+5 slashing."),
  );
  damageModes(a).forEach((m, i) => {
    const row = el("div", "import");
    const pick = el("input");
    pick.type = "radio";
    pick.name = `dmg-${a.name}`;
    pick.checked = (cfg.active ?? 0) === i;
    pick.addEventListener("change", () => save({ ...cfg, active: i }));
    const label = el("input");
    label.value = m.label;
    label.placeholder = "Nome";
    label.style.width = "90px";
    const formula = el("input");
    formula.value = m.formula;
    formula.placeholder = "1d12+5";
    formula.style.flex = "1";
    if (i === 0) {
      label.disabled = true;
      formula.disabled = true;
    } else {
      const edit = () => {
        if (!parseDamage(formula.value)) {
          say("Fórmula de dano não entendida. Use algo como 1d12+5 slashing.", true);
          return;
        }
        const modes = cfg.modes.map((x, k) => (k === i - 1 ? { label: label.value.trim() || "Modo", formula: formula.value.trim() } : x));
        save({ ...cfg, modes });
      };
      label.addEventListener("change", edit);
      formula.addEventListener("change", edit);
    }
    row.append(pick, label, formula);
    if (i > 0) {
      row.append(
        button("×", () => {
          const modes = cfg.modes.filter((_, k) => k !== i - 1);
          const active = (cfg.active ?? 0) === i ? 0 : (cfg.active ?? 0) > i ? (cfg.active ?? 0) - 1 : (cfg.active ?? 0);
          save({ modes, active });
        }, "mini"),
      );
    }
    box.append(row);
  });
  box.append(
    button("+ Novo modo", () => {
      save({ ...cfg, modes: [...cfg.modes, { label: "Novo modo", formula: sheetDamageText(a) }], active: cfg.active ?? 0 });
    }),
  );
  return box;
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

/** Manobras: cada uma rola uma perícia contra a CD do alvo e aplica as condições do resultado. */
function maneuversBlock(c: Character): HTMLElement {
  const box = el("div");
  const rows = MANEUVERS.map((m) => {
    const skill = c.skills.find((x) => x.key === m.skill);
    const row = el("div", "attack");
    const name = el("span", "aname");
    name.append(el("strong", undefined, m.name), el("span", "sub", m.hint));
    name.style.display = "flex";
    name.style.flexDirection = "column";
    row.append(name);
    if (skill) {
      row.append(
        rollButton(m.skillName, skill.total, m.name, RANK_LETTER[skill.rank] ?? "", { ability: skill.ability }, (bonus) => void beginManeuver(m, bonus)),
      );
    } else row.append(el("span", "sub", "perícia não encontrada"));
    return row;
  });
  const next = mapFor(attackNumber);
  box.append(
    section(
      "Manobras",
      el("p", "sub", `Escolha a manobra e depois o token do alvo no mapa. Agarrar, Derrubar, Empurrar e Desarmar contam como ataque (ataque nº ${attackNumber}, MAP ${next ? `−${next}` : "0"}).`),
      ...rows,
    ),
  );
  return box;
}

let agirView: "acoes" | "manobras" = "acoes";

/** Aba Agir com duas partes: Ataques e magias / Manobras (o campo de bônus extra fica sempre no topo). */
function splitAgir(c: Character) {
  const kids = [...agirEl.children];
  const top = kids.shift();
  const acoes = el("div", "agir-view");
  acoes.append(...kids);
  const man = maneuversBlock(c);
  man.classList.add("agir-view");
  const tabs = el("div", "subtabs");
  const mk = (id: "acoes" | "manobras", text: string) => {
    const b = el("button", id === agirView ? "active" : undefined, text);
    b.type = "button";
    b.addEventListener("click", () => {
      agirView = id;
      acoes.hidden = id !== "acoes";
      man.hidden = id !== "manobras";
      for (const x of tabs.querySelectorAll("button")) x.classList.toggle("active", x === b);
    });
    return b;
  };
  tabs.append(mk("acoes", "Ataques e magias"), mk("manobras", "Manobras"));
  acoes.hidden = agirView !== "acoes";
  man.hidden = agirView !== "manobras";
  agirEl.replaceChildren(...(top ? [top] : []), tabs, acoes, man);
}

/* ---------- aba Morrendo (só fichas de jogador) ---------- */
const dyingEl = $<HTMLDivElement>("#tab-morrendo");
let dyingShown = false;

const isDown = () => state.hp <= 0;
/** Ferido e Condenado duram além do 0 PV: a aba fica até o descanso que os tira. */
const hasLingering = () => (state.conditions.wounded ?? 0) > 0 || (state.conditions.doomed ?? 0) > 0;

/**
 * Mostra a aba a 0 PV (abre sozinha) e depois, enquanto a pessoa estiver Ferida ou Condenada, para
 * ela acompanhar até o descanso. Some quando não há mais nada disso.
 */
function updateDyingTab(c: Character) {
  const down = isDown();
  const visible = down || hasLingering();
  $("#dying-tab").hidden = !visible;
  if (visible) renderDying(c);
  if (down && !dyingShown) switchTab("morrendo"); // só abre sozinha ao cair
  else if (!visible && activeTab === "morrendo") switchTab("agir");
  dyingShown = down;
}

/**
 * Descanso (8 horas): Condenado cai 1; se os PV estão cheios, o Ferido acaba (PV cheios + 10 minutos
 * de descanso). Devolve o que mudou, para avisar na mesa.
 */
function restEffects(): string[] {
  const out: string[] = [];
  const conds = { ...state.conditions };
  if ((conds.doomed ?? 0) > 0) {
    conds.doomed -= 1;
    if (conds.doomed <= 0) delete conds.doomed;
    out.push("Condenado cai 1");
  }
  if ((conds.wounded ?? 0) > 0 && state.hp >= (state.max ?? state.hp) && state.hp > 0) {
    delete conds.wounded;
    out.push("Ferido acaba (PV cheios)");
  }
  state = { ...state, conditions: conds };
  return out;
}

/** Muda o valor de Morrendo, Ferido ou Condenado à mão (correções e efeitos que o sistema não vê). */
function setDyingCond(c: Character, key: "dying" | "wounded" | "doomed", value: number) {
  const conds = { ...state.conditions };
  if (value <= 0) delete conds[key];
  else conds[key] = value;
  state = { ...state, conditions: conds };
  if (key === "dying") {
    if (value <= 0) state = stabilize(state);
    else {
      delete state.stable;
      delete state.dead; // baixou de novo abaixo do limite: não está mais morto
    }
  }
  if (key === "doomed") delete state.dead;
  state = settle(state);
  commit(c);
}

async function recoveryCheck(c: Character) {
  const dying = state.conditions.dying ?? 0;
  if (dying <= 0) return;
  const dc = recoveryDc(dying);
  const ask = await confirmRoll("Teste de recuperação", [`Teste simples: d20 contra CD ${dc} (10 + Morrendo ${dying})`]);
  if (!ask.ok) return;
  const msg = await publishRoll({ title: `Teste de recuperação (Morrendo ${dying})`, count: 1, sides: 20, mod: ask.bonus, dc });
  const degree = msg.degree ?? "failure";
  const r = applyRecovery(state, degree);
  state = r.state;
  commit(c);
  void showCard({ kind: "check", msg });
  say(`${DEGREE_TEXT[degree]}. ${r.text}`);
  void publishEvent(`teste de recuperação: ${DEGREE_TEXT[degree]}. ${r.text}`);
}

/** Aba com PV acima de 0: só acompanha Ferido e Condenado até o descanso. */
function renderLingering(c: Character) {
  const wounded = state.conditions.wounded ?? 0;
  const doomed = state.conditions.doomed ?? 0;
  dyingEl.replaceChildren();
  const head = el("div", "dying-head");
  head.append(
    el("strong", undefined, [wounded ? `Ferido ${wounded}` : "", doomed ? `Condenado ${doomed}` : ""].filter(Boolean).join(" · ")),
    el(
      "div",
      "sub",
      "Consciente. Ferido acaba quando você recupera todos os PV e descansa 10 minutos (e se cair a 0 PV de novo, você cai com Morrendo maior). Condenado cai 1 a cada descanso de uma noite.",
    ),
  );
  dyingEl.append(head);

  const counters = el("div", "dying-counters");
  for (const [key, label] of [["wounded", "Ferido"], ["doomed", "Condenado"]] as const) {
    const v = state.conditions[key] ?? 0;
    const cell = el("div", "dying-counter");
    cell.append(
      el("span", "sub", label),
      button("−", () => setDyingCond(c, key, Math.max(0, v - 1)), "mini"),
      el("strong", undefined, String(v)),
      button("+", () => setDyingCond(c, key, v + 1), "mini"),
    );
    counters.append(cell);
  }
  dyingEl.append(counters);

  const actions = el("div", "dying-actions");
  actions.append(
    button("Descansar (Condenado −1; Ferido acaba se os PV estão cheios)", () => {
      const rested = restEffects();
      commit(c);
      void publishEvent(`descansou. ${rested.length ? rested.join("; ") : "Nada mudou (Ferido só acaba com os PV cheios)."}`);
      say(rested.length ? rested.join("; ") + "." : "Nada mudou: Ferido só acaba com os PV cheios.");
    }),
    button("Ferido acaba (PV cheios + 10 minutos de descanso, ou Tratar Ferimentos)", () => {
      setDyingCond(c, "wounded", 0);
      void publishEvent("deixou de estar Ferido.");
    }),
  );
  dyingEl.append(actions);
}

function renderDying(c: Character) {
  if (!isDown()) return renderLingering(c);
  const dying = state.conditions.dying ?? 0;
  const limit = deathLimit(state.conditions);
  dyingEl.replaceChildren();

  const head = el("div", "dying-head");
  const untracked = dying === 0 && !state.stable && !state.dead; // 0 PV sem Morrendo (ficha antiga ou ajuste à mão)
  head.append(el("strong", undefined, state.dead ? "Morto" : state.stable ? "Estabilizado" : untracked ? "0 PV" : `Morrendo ${dying}`));
  head.append(
    el(
      "div",
      "sub",
      state.dead
        ? `Chegou a Morrendo ${limit}.`
        : state.stable
          ? "Inconsciente com 0 PV. Dano volta a deixar Morrendo; cura devolve a consciência."
          : untracked
            ? "Você está a 0 PV. Aplique Morrendo para seguir as regras."
            : `Morre em Morrendo ${limit}. No início do seu turno: teste de recuperação, CD ${recoveryDc(dying)}.`,
    ),
  );
  dyingEl.append(head);

  // Contadores: Morrendo, Ferido e Condenado.
  const counters = el("div", "dying-counters");
  for (const [key, label] of [["dying", "Morrendo"], ["wounded", "Ferido"], ["doomed", "Condenado"]] as const) {
    const v = state.conditions[key] ?? 0;
    const cell = el("div", "dying-counter");
    cell.append(
      el("span", "sub", label),
      button("−", () => setDyingCond(c, key, Math.max(0, v - 1)), "mini"),
      el("strong", undefined, String(v)),
      button("+", () => setDyingCond(c, key, v + 1), "mini"),
    );
    counters.append(cell);
  }
  dyingEl.append(counters);

  const actions = el("div", "dying-actions");
  if (state.dead) {
    actions.append(
      button("Desfazer a morte (foi engano)", () => {
        const conds = { ...state.conditions, dying: Math.max(1, limit - 1) };
        state = { ...state, conditions: conds };
        delete state.dead;
        commit(c);
      }),
    );
  } else {
    if (untracked) {
      actions.append(
        button("Aplicar Morrendo (queda normal)", () => {
          state = settle(state, 1);
          commit(c);
          void publishEvent("chegou a 0 PV e está Morrendo.");
        }),
      );
    }
    if (dying > 0) actions.append(button(`Teste de recuperação (CD ${recoveryDc(dying)})`, () => void recoveryCheck(c)));
    actions.append(
      button("Levou dano com 0 PV: Morrendo +1", () => {
        state = hitWhileDown(state);
        commit(c);
        void publishEvent("levou dano com 0 PV: Morrendo aumenta.");
      }),
      button("Dano crítico com 0 PV: Morrendo +2", () => {
        state = hitWhileDown(state, true);
        commit(c);
        void publishEvent("levou um golpe crítico com 0 PV: Morrendo aumenta em 2.");
      }),
      button("Estabilizar (Primeiros Socorros / Medicina)", () => {
        state = stabilize(state);
        commit(c);
        void publishEvent("foi estabilizado: Morrendo some, continua inconsciente com 0 PV.");
      }),
      button("Recuperação heroica (gasta todos os Pontos de Herói)", () => {
        state = stabilize(state);
        commit(c);
        void publishEvent("usou Recuperação Heroica: Morrendo some, sem ganhar Ferido.");
      }),
    );
    // Cura: ao passar de 0 PV, perde Morrendo e ganha Ferido 1 (ou +1).
    const heal = el("input");
    heal.type = "number";
    heal.min = "1";
    heal.value = "1";
    heal.className = "dying-heal";
    heal.setAttribute("aria-label", "PV curados");
    const healRow = el("div", "import");
    healRow.append(
      heal,
      button("Curar", () => {
        const n = Math.max(1, parseInt(heal.value, 10) || 1);
        state = { ...state, hp: Math.min(state.max ?? n, state.hp + n) };
        commit(c);
        void publishEvent(`foi curado em ${n} PV: volta à consciência e fica Ferido.`);
      }),
    );
    actions.append(healRow);
  }
  dyingEl.append(actions);
}

function statButton(s: Stat): HTMLButtonElement {
  const isSave = ["fortitude", "reflex", "will"].includes(s.key);
  return rollButton(s.name, s.total, s.name, RANK_LETTER[s.rank] ?? "", {
    ability: s.ability,
    isSave,
  });
}

/** Seções da ficha que começam fechadas (o resto começa aberto). A escolha fica lembrada. */
const CLOSED_BY_DEFAULT = new Set(["Token", "Atributos", "Perícias", "Habilidades", "Equipamento"]);
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

/** Ajustes manuais: o jogador corrige dados errados ou soma efeitos que o sistema não detecta. */
function adjustBlock(c: Character): HTMLElement {
  const note = el("p", "sub", "Some ou subtraia valores quando o sistema não souber de algo (um local que dá +1 de CA, um dado do Pathbuilder errado). Fica salvo na sala.");
  const rows: HTMLElement[] = [note];
  const field = (label: string, key: "ac" | "hp", base: () => number) => {
    const row = el("div", "import");
    const lab = el("label", "target", `${label} `);
    const input = el("input");
    input.type = "number";
    input.placeholder = "0";
    input.value = state.adj?.[key] ? String(state.adj[key]) : "";
    const hint = el("span", "sub", ` (ficha: ${base()})`);
    input.addEventListener("change", () => {
      const n = parseInt(input.value, 10) || 0;
      const adj = { ...(state.adj ?? {}), [key]: n };
      if (!n) delete adj[key];
      state.adj = Object.keys(adj).length > 0 ? adj : undefined;
      commit(c);
    });
    lab.append(input, hint);
    row.append(lab);
    rows.push(row);
  };
  field("Ajuste de CA", "ac", () => c.ac);
  field("Ajuste de PV máximo", "hp", () => c.hpMax);
  return section("Ajustes manuais", ...rows);
}

function tokenBlock(c: Character): HTMLElement {
  const info = el("p", "sub", "Selecione um token no mapa e vincule esta ficha a ele.");
  const msg = el("p", "status");
  const row = el("div", "import");

  const link = el("button", undefined, "Vincular ao token selecionado");
  link.type = "button";
  link.addEventListener("click", () => {
    msg.className = "status";
    msg.textContent = "";
    // Celular: o painel fecha e o próximo token tocado é vinculado (no computador usa o selecionado).
    void whenTokenTapped(async () => {
      try {
        await linkSelectedToken({ pathbuilderId: c.pathbuilderId ?? "", name: c.name });
        if (c.pathbuilderId) await saveState(c.pathbuilderId, state);
        msg.textContent = `Token vinculado a ${c.name}.`;
        say(`Token vinculado a ${c.name}.`);
      } catch (e) {
        const text = e instanceof Error ? e.message : "Não foi possível vincular.";
        msg.textContent = text;
        msg.className = "status error";
        say(text, true);
      }
    });
  });

  const unlink = el("button", undefined, "Desvincular");
  unlink.type = "button";
  unlink.addEventListener("click", () => {
    msg.className = "status";
    msg.textContent = "";
    void whenTokenTapped(async () => {
      try {
        await unlinkSelectedToken();
        msg.textContent = "Vínculo removido do token.";
        say("Vínculo removido do token.");
      } catch (e) {
        const text = e instanceof Error ? e.message : "Não foi possível desvincular.";
        msg.textContent = text;
        msg.className = "status error";
        say(text, true);
      }
    });
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
let lastHp: number | undefined; // PV de antes: se passou de >0 para 0, ficou Morrendo
let targetValue = "";

/** Redesenha a ficha mantendo a rolagem do painel e grava o estado na sala. */
/** PV máximo e CA base, já com os ajustes manuais do jogador. */
const maxHp = (c: Character) => hpMaxWithConditions(c.hpMax + (state.adj?.hp ?? 0), c.level, state.conditions);
const baseAc = (c: Character) => c.ac + (state.adj?.ac ?? 0);

function commit(c: Character) {
  state.baseAc = baseAc(c);
  state.baseMax = c.hpMax + (state.adj?.hp ?? 0);
  state.level = c.level;
  state.max = maxHp(c);
  state.hp = Math.min(state.hp, state.max);
  state.ac = acWithConditions(baseAc(c), state.conditions).value;
  state = settle(state, lastHp); // 0 PV → Morrendo; curado → Ferido
  lastHp = state.hp;
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

/** Liga um bônus de CA de circunstância (escudo) até o início do próximo turno do personagem. */
function setAcEffect(c: Character, key: "shield-raised" | "shield-spell", bonus: number) {
  state.conditions = { ...state.conditions, [key]: bonus };
  state.durations = {
    ...(state.durations ?? {}),
    [key]: { mode: "self-start", remaining: 1, text: "até seu próximo turno" },
  };
  commit(c);
}

function clearAcEffect(c: Character, key: "shield-raised" | "shield-spell") {
  const next = { ...state.conditions };
  delete next[key];
  state.conditions = next;
  state.durations = pruneDurations(next, state.durations);
  commit(c);
}

/** Ação Erguer um Escudo: liga e desliga o bônus de CA do escudo equipado. */
function shieldRow(c: Character): HTMLElement | undefined {
  const up = (state.conditions["shield-raised"] ?? 0) > 0;
  if (c.shieldBonus <= 0 && !up) return undefined;
  const row = el("div", "import");
  const bonus = c.shieldBonus > 0 ? c.shieldBonus : state.conditions["shield-raised"];
  const b = el("button", undefined, up ? `Abaixar o escudo (CA +${bonus})` : `Erguer o escudo (CA +${bonus})`);
  b.type = "button";
  b.addEventListener("click", () => {
    if (up) clearAcEffect(c, "shield-raised");
    else {
      setAcEffect(c, "shield-raised", bonus);
      say(`Escudo erguido: CA ${acWithConditions(baseAc(c), state.conditions).value} até o seu próximo turno.`);
      void publishEvent(`ergueu o escudo (CA +${bonus}).`);
    }
  });
  row.append(b);
  return row;
}

function hpBlock(c: Character): HTMLElement {
  const max = maxHp(c);
  const hp = Math.min(state.hp, max);

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
  const box = el("div", "hp-inline");
  box.append(quick, row);
  return box;
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
  const label = el("label", "target", "CD do teste ");
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

/** Campo "Bônus extra": soma na próxima rolagem e volta a zero. */
function extraField(): HTMLElement {
  const label = el("label", "target", "Bônus extra (próxima rolagem) ");
  const input = el("input");
  input.type = "number";
  input.placeholder = "0";
  input.value = extraValue;
  input.addEventListener("input", () => {
    extraValue = input.value;
    for (const o of extraInputs) if (o !== input) o.value = extraValue;
  });
  extraInputs.push(input);
  label.append(input);
  return label;
}

/**
 * Na aba Mestre o cabeçalho da ficha do mestre só atrapalha: some, e mostra nome, PV e CA apenas da
 * criatura em foco (a que ele tocou no mapa).
 */
function renderMasterHud() {
  hudEl.replaceChildren();
  const c = focusedCreatureId ? getCreature(focusedCreatureId) : undefined;
  if (activeTab !== "criaturas" || !c) {
    hudEl.hidden = activeTab === "criaturas";
    return;
  }
  const ac = creatureAc(c);
  const who = el("div", "hud-name");
  who.append(el("strong", undefined, c.name), el("span", "sub", c.level !== undefined ? `Nível ${c.level}` : "Criatura"));
  const mid = el("div", "hud-hp");
  mid.append(el("span", undefined, `${c.hp}/${c.hpMax} PV${c.temp ? ` (+${c.temp})` : ""}`));
  const scale = Math.max(c.hpMax, c.hp + c.temp);
  const bar = el("div", "hp-bar");
  const fill = el("div", "hp-fill");
  fill.style.width = `${(Math.min(c.hp, c.hpMax) / scale) * 100}%`;
  bar.append(fill);
  if (c.temp > 0) {
    const t = el("div", "hp-temp");
    t.style.width = `${(c.temp / scale) * 100}%`;
    bar.append(t);
  }
  mid.append(bar);
  const acBox = el("div", `hud-ac${ac.penalty > ac.bonus ? " penalized" : ""}`);
  acBox.append(el("strong", undefined, String(ac.value)), el("span", undefined, "CA"));
  const top = el("div", "hud-top");
  top.append(who, mid, acBox);
  hudEl.append(top);
  const tags = condTags(c.conditions, c.durations);
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

/** Cabeçalho fixo, visível em todas as abas: nome, PV, CA e condições. Tocar leva à aba Ficha. */
function renderHud(c: Character) {
  if (activeTab === "criaturas") return renderMasterHud();
  hudEl.replaceChildren();
  const max = maxHp(c);
  const hp = Math.min(state.hp, max);
  const ac = acWithConditions(baseAc(c), state.conditions);

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
hudEl.addEventListener("click", () => {
  if (activeTab !== "criaturas") switchTab("ficha");
});

function renderSheet(c: Character) {
  current = c;
  agirEl.replaceChildren();
  testesEl.replaceChildren();
  fichaEl.replaceChildren();
  targetInputs.length = 0;
  extraInputs.length = 0;
  renderHud(c);

  const head = el("div", "head-card");
  head.append(el("p", "sub", `${c.ancestry} (${c.heritage}) · ${c.className} ${c.level} · ${c.background}`));
  const nums = el("div", "numbers");
  const num = (label: string, v: string | number) => {
    const d = el("div", "num");
    d.append(el("strong", undefined, String(v)), el("span", undefined, label));
    return d;
  };
  const ac = acWithConditions(baseAc(c), state.conditions);
  const acNum = num("CA", ac.value);
  if (ac.penalty > 0 || ac.bonus > 0) {
    if (ac.penalty > ac.bonus) acNum.classList.add("penalized");
    acNum.title = `Base ${baseAc(c)}${ac.bonus ? `, +${ac.bonus} de escudo` : ""}${ac.penalty ? `, −${ac.penalty} por condições` : ""}`;
  }
  void acNum; // a CA aparece no escudo da barra de cima
  nums.append(num("Desl.", `${c.speed} ft`), num("CD de classe", c.classDC));
  head.append(nums, hpBlock(c));

  fichaEl.append(head, tokenBlock(c), conditionsBlock(c), adjustBlock(c));
  agirEl.append(extraField());
  const shield = shieldRow(c);
  if (shield) agirEl.append(shield);
  testesEl.append(targetField(), extraField());

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
      const now = activeDamage(a);
      const atk = attackButton("Ataque", a.bonus, a.name, { isAttack: true }, now.spec);
      const d = now.spec;
      const dmg = el("button", "stat");
      dmg.type = "button";
      dmg.append(
        el("span", "lbl", now.label || "Dano"),
        el("span", "n", formulaText(d.dice, d.die, d.bonus)),
      );
      dmg.title = "Rola o dano do modo em uso (toque na engrenagem para mudar)";
      dmg.addEventListener("click", () => {
        void publishRoll({
          title: `${a.name} (dano${now.label ? ` · ${now.label}` : ""})`,
          count: d.dice,
          sides: d.die,
          mod: d.bonus,
        });
      });
      const gear = el("button", "gear", "⚙");
      gear.type = "button";
      gear.title = "Personalizar o dano desta arma";
      gear.addEventListener("click", () => {
        dmgOpen.has(a.name) ? dmgOpen.delete(a.name) : dmgOpen.add(a.name);
        if (current) renderSheet(current);
      });
      row.append(atk, dmg, gear);
      const wrap = el("div");
      wrap.append(row);
      if (dmgOpen.has(a.name)) wrap.append(damageEditor(c, a));
      return wrap;
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

  splitAgir(c);
  fichaEl.append(featsBlock(c), gearBlock(c));
  updateDyingTab(c);

  if (c.casters.length || c.focusPoints > 0) {
    const rest = el("button", undefined, "Descansar (recuperar espaços e foco)");
    rest.type = "button";
    rest.addEventListener("click", () => {
      state.slotsUsed = {};
      state.focusUsed = 0;
      const rested = restEffects();
      commit(c);
      void publishEvent(`descansou e recuperou espaços de magia e pontos de foco${rested.length ? `. ${rested.join("; ")}` : ""}.`);
    });
    fichaEl.append(rest);
  }
}

/** Título do grupo na ficha (plural). */
const FEAT_GROUP: Record<string, string> = {
  "Class Feat": "Talentos de classe",
  "Ancestry Feat": "Talentos de ancestralidade",
  "Skill Feat": "Talentos de perícia",
  "General Feat": "Talentos gerais",
  "Awarded Feat": "Talentos concedidos",
  Heritage: "Herança",
};

const FEAT_TAG: Record<string, string> = {
  "Class Feat": "Talento de classe",
  "Ancestry Feat": "Talento de ancestralidade",
  "Skill Feat": "Talento de perícia",
  "General Feat": "Talento geral",
  "Awarded Feat": "Talento concedido",
  Heritage: "Herança",
};

/** Clique num talento ou característica: abre o cartão com a descrição (e o botão de traduzir). */
async function openFeatCard(c: Character, name: string, kind: string, level: number) {
  say(`Buscando ${name}…`);
  const info = await fetchFeat(name, kind, level, {
    className: c.className ?? "",
    ancestry: c.ancestry ?? "",
    heritage: c.heritage ?? "",
  }).catch(() => null);
  say("");
  await showCard({ kind: "featinfo", name, tag: FEAT_TAG[kind] ?? "Característica", info, aon: aonSearch(name) });
}

/** Talentos e características importados do Pathbuilder, agrupados; cada um abre a descrição. */
function featsBlock(c: Character): HTMLElement {
  const box = el("div");
  const groups: [string, { name: string; kind: string; level: number }[]][] = [];
  for (const kind of Object.keys(FEAT_TAG)) {
    const list = (c.feats ?? []).filter((f) => f.type === kind).map((f) => ({ name: f.name, kind, level: f.level }));
    if (list.length) groups.push([FEAT_GROUP[kind] ?? FEAT_TAG[kind], list]);
  }
  const known = new Set(Object.keys(FEAT_TAG));
  const others = (c.feats ?? []).filter((f) => !known.has(f.type)).map((f) => ({ name: f.name, kind: f.type, level: f.level }));
  if (others.length) groups.push(["Outros talentos", others]);
  const specials = (c.specials ?? []).map((name) => ({ name, kind: "special", level: c.level }));
  if (specials.length) groups.push(["Características de classe e ancestralidade", specials]);
  if (groups.length === 0) {
    box.append(section("Habilidades", el("p", "sub", "Nenhum talento nesta ficha. Reimporte a ficha do Pathbuilder para atualizar.")));
    return box;
  }
  const note = (c.specials ?? []).length === 0 ? el("p", "sub", "Reimporte a ficha para ver também as características de classe e ancestralidade.") : null;
  const parts = groups.map(([title, list]) => {
    const wrap = el("div", "chips");
    for (const f of list) {
      const b = el("button", "spell", f.level && f.kind !== "special" ? `${f.name} (${f.level})` : f.name);
      b.type = "button";
      b.title = "Ver a descrição";
      b.addEventListener("click", () => void openFeatCard(c, f.name, f.kind, f.level));
      wrap.append(b);
    }
    const g = el("div", "feat-group");
    g.append(el("div", "feat-title", title), wrap);
    return g;
  });
  box.append(section("Habilidades", note ?? el("p", "sub", "Toque num item para ler a descrição, traduzir e mostrar a todos."), ...parts));
  return box;
}

/** Clique num item de equipamento: cartão com a descrição do Foundry (e o botão de traduzir). */
async function openGearCard(name: string, label: string, tag: string) {
  say(`Buscando ${label}…`);
  const info = await fetchEquipment(name).catch(() => null);
  say("");
  await showCard({ kind: "featinfo", name: label, tag, info, aon: aonSearch(name) });
}

/** Equipamento importado do Pathbuilder: armas, armadura, itens e dinheiro; cada item abre a descrição. */
function gearBlock(c: Character): HTMLElement {
  const g = c.gear;
  if (!g) {
    return section("Equipamento", el("p", "sub", "Reimporte a ficha do Pathbuilder para ver o equipamento."));
  }
  const group = (title: string, tag: string, list: GearItem[]) => {
    if (list.length === 0) return null;
    const wrap = el("div", "chips");
    for (const it of list) {
      const text = `${it.label}${it.qty > 1 ? ` ×${it.qty}` : ""}${it.note ? ` (${it.note})` : ""}`;
      const b = el("button", "spell", text);
      b.type = "button";
      b.title = "Ver a descrição";
      b.addEventListener("click", () => void openGearCard(it.name, it.label, tag));
      wrap.append(b);
    }
    const box = el("div", "feat-group");
    box.append(el("div", "feat-title", title), wrap);
    return box;
  };
  const m = g.money;
  const money = m ? [m.pp && `${m.pp} pp`, m.gp && `${m.gp} gp`, m.sp && `${m.sp} sp`, m.cp && `${m.cp} cp`].filter(Boolean).join(" · ") : "";
  const parts = [
    group("Armas", "Arma", g.weapons),
    group("Armadura", "Armadura", g.armor),
    group("Itens", "Item", g.items),
    money ? el("p", "sub", `Dinheiro: ${money}`) : null,
  ].filter(Boolean) as HTMLElement[];
  return section("Equipamento", el("p", "sub", "Toque num item para ler a descrição, traduzir e mostrar a todos."), ...parts);
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
    // Magia Escudo: +1 de circunstância na CA até o início do próximo turno (conta como erguer o escudo).
    if (/^shield$/i.test(name)) setAcEffect(c, "shield-spell", 1);
    else if (rank > 0 || o.spendsFocus) commit(c);
    say(`${name} conjurada. ${left}`.trim());
    if (announce) {
      const how = rank === 0 && !o.spendsFocus ? "lançou o truque" : "conjurou";
      void publishEvent(`${how} ${name}${rank > 0 ? ` (rank ${rank})` : ""}. ${left}`.trim());
    }
  };

  say(`Procurando as regras de ${name}…`);
  await prefetchFixes([name]);
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
        { spell: data, rank: rankForHeighten, abilityMod: cast.abilityMod },
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
    lastHp = state.hp;
    // Garante PV máx. e CA no estado e grava na sala: sem isso, o token vinculado não mostra a barra.
    state.baseAc = baseAc(c);
    state.baseMax = c.hpMax + (state.adj?.hp ?? 0);
    state.level = c.level;
    state.max = maxHp(c);
    state.ac = acWithConditions(baseAc(c), state.conditions).value;
    if (JSON.stringify(stored) !== JSON.stringify(state)) {
      await saveState(id, state).catch(() => undefined);
    }
    renderSheet(c);
    combatUi?.render();
    statusEl.textContent = `Ficha de ${c.name} importada.`;
    // Correções de dano das magias da ficha: baixa as que existem e guarda no navegador.
    void prefetchFixes([
      ...c.focusSpells,
      ...c.casters.flatMap((k) => [...k.prepared, ...k.known].flatMap((l) => l.names)),
    ]);
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
  // Painel da esquerda um pouco maior (o manifesto traz o mesmo tamanho para quem ainda não recarregou).
  void Promise.resolve(OBR.action?.setWidth?.(460)).catch(() => undefined);
  void Promise.resolve(OBR.action?.setHeight?.(700)).catch(() => undefined);
  // Abrir o painel à mão cancela a espera pelo toque num token (celular).
  void Promise.resolve(OBR.action?.onOpenChange?.((open: boolean) => open && onPanelOpened())).catch(() => undefined);
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
    // Em produção o painel mostra só as criaturas em jogo; os testes de tela podem pedir tudo junto.
    const part = (window as unknown as { __PF2E_PART?: "play" | "all" }).__PF2E_PART ?? "play";
    creaturesUi = initCreatures($("#gm-creatures"), () => renderMasterHud(), part, (c, a) => void useCreatureAbility(c, a));
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
    lastHp = state.hp;
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

    // Celular: ação esperando o toque (vincular) roda agora; tocar num alvo reabre o painel para confirmar.
    const tapped = player.selection ?? [];
    if (await takeTap(tapped)) return;
    if (tapped.length > 0) await reopenAfterTap();

    // Mestre: um ataque de criatura espera o token do alvo; essa seleção não abre fichas.
    if (await creatureAttackSelection(player.selection ?? [])) return;

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
        focusedCreatureId = creature.id;
        creaturesUi?.focus(creature.id);
      }
    }
  });
});
