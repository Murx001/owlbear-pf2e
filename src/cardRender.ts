import { hit, type AttackResult } from "./attack";
import type { CardData, CastAction } from "./cardData";
import { KIND_PT } from "./area";
import { COND_BY_KEY } from "./conditions";
import { DEGREE_TEXT, formulaText, signed, type RollMessage } from "./roll";
import { STAT_PT, type SpellCast, type SpellTargetResult } from "./saveSpell";
import { translate } from "./translate";
import { damageParts, type SpellData } from "./spellData";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const strong = (t: string) => el("strong", undefined, t);

function row(label: string, value: Node | string, cls?: string): HTMLElement {
  const d = el("div", `card-row${cls ? ` ${cls}` : ""}`);
  d.append(el("span", "k", label));
  const v = el("span", "v");
  v.append(value);
  d.append(v);
  return d;
}

function header(title: string, sub: string, onClose: () => void): HTMLElement {
  const head = el("div", "card-head");
  const names = el("div");
  names.append(el("strong", undefined, title), el("div", "sub", sub));
  const close = el("button", "mini", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Fechar cartão");
  close.addEventListener("click", onClose);
  head.append(names, close);
  return head;
}

const penaltyText = (n: number) => (n > 0 ? `−${n}` : "nenhuma");

/* ---------- ataque ---------- */
function attackCard(root: HTMLElement, r: AttackResult, nextPenalty: number, onClose: () => void) {
  root.className = `card ${r.degree}`;
  root.append(header(`${r.attacker} → ${r.target}`, r.title, onClose));

  const atk = el("span");
  atk.append(
    `d20 ${r.natural} ${signed(r.bonus)}`,
    r.mapPenalty > 0 ? ` −${r.mapPenalty}` : "",
    " = ",
    strong(String(r.total)),
    r.ac !== undefined ? " contra " : " contra a CA do alvo",
  );
  if (r.ac !== undefined) atk.append(strong(`CA ${r.ac}`));
  atk.append(" → ", strong(DEGREE_TEXT[r.degree]));
  root.append(row("Ataque", atk, "big"));
  if (r.flank) {
    root.append(
      row(
        "Flanqueio",
        r.flank.applied
          ? "alvo flanqueado: Desprevenido, −2 na CA contra este ataque"
          : "alvo flanqueado, mas já Desprevenido/Caído: o −2 não acumula",
      ),
    );
  }

  if (r.damage) {
    const d = r.damage;
    const dmg = el("span");
    dmg.append(`${d.formula} = ${d.rolled}`);
    if (d.crit) dmg.append(" × 2 (crítico)");
    dmg.append(" = ", strong(`${d.total}`), d.type ? ` ${d.type}` : "");
    root.append(row("Dano", dmg, "big"));
    if (d.adjust?.length) root.append(row("Defesas", d.adjust.join("; ")));
    if (d.absorbed > 0) root.append(row("PV temporários", `${d.absorbed} absorvido(s)`));
    if (d.hpText) root.append(row("Resultado", d.hpText));
    if (d.dropped) root.append(row("", `${r.target} caiu!`, "down"));
  } else if (hit(r) && r.damageNotAutomated) {
    root.append(row("Dano", "role na aba Dados (esta magia não tem dano automático)"));
  } else if (!hit(r)) {
    root.append(row("Dano", "nenhum (o ataque errou)"));
  }

  root.append(
    row(
      "Penalidade",
      `neste ataque: ${penaltyText(r.mapPenalty)} · no próximo ataque: ${penaltyText(nextPenalty)}`,
      "pen",
    ),
  );
}

/* ---------- magia ---------- */
function spellCard(
  root: HTMLElement,
  cast: SpellCast,
  mode: "save" | "auto" | "heal" | "temp",
  rolled: number | null,
  results: SpellTargetResult[],
  offline: boolean,
  onClose: () => void,
) {
  root.className = "card spell";
  const sp = cast.spell;
  const sub = [
    cast.rank > 0 ? `Rank ${cast.rank}` : "Truque",
    sp.save ? `${STAT_PT[sp.save.stat]}${sp.save.basic ? " básica" : ""} · CD ${cast.dc}` : "",
    sp.area ? `${KIND_PT[sp.area.kind]} de ${sp.area.feet} pés` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  root.append(header(`${cast.casterName} conjura ${sp.name}`, sub, onClose));

  // O dano é rolado uma vez e vale para todos os alvos.
  const parts = damageParts(sp, cast.rank, cast.abilityMod);
  if (rolled !== null && parts && parts.length > 0) {
    const formula = parts.map((x) => formulaText(x.count, x.die, x.bonus)).join(" + ");
    const types = parts.map((x) => x.type).filter(Boolean).join("/");
    root.append(
      row(
        mode === "heal" ? "Cura rolada" : "Dano rolado",
        `${formula} = ${rolled}${types && mode !== "heal" ? ` ${types}` : ""} (uma vez, vale para todos)`,
      ),
    );
  }

  for (const r of results) {
    const box = el("div", `card-target${r.save ? ` ${r.save.degree}` : ""}`);
    const title = el("div", "card-row");
    title.append(strong(r.target));
    if (r.save) title.append(el("span", `badge ${r.save.degree}`, DEGREE_TEXT[r.save.degree]));
    box.append(title);

    if (r.error) {
      box.append(row("Erro", r.error, "down"));
    } else {
      if (r.save) {
        const s = r.save;
        box.append(
          row(STAT_PT[s.stat], `d20 ${s.natural} ${signed(s.mod)} = ${s.total} contra CD ${s.dc}`),
        );
      }
      if (r.damage) {
        const d = r.damage;
        const mult = d.multiplier ? ` ${d.multiplier}` : "";
        box.append(
          row(
            "Dano",
            d.final === 0 && d.multiplier
              ? `nenhum (${d.rolled}${mult})`
              : `${d.rolled}${mult} = ${d.final}${d.type ? ` ${d.type}` : ""}${
                  d.absorbed > 0 ? ` · ${d.absorbed} absorvido(s) por PV temporários` : ""
                }`,
          ),
        );
        if (d.adjust?.length) box.append(row("Defesas", d.adjust.join("; ")));
        if (d.hpText) box.append(row("Resultado", d.hpText));
        if (d.dropped) box.append(row("", `${r.target} caiu!`, "down"));
      }
      if (r.healed) {
        box.append(row("Cura", `${r.healed.total} PV`));
        if (r.healed.hpText) box.append(row("Resultado", r.healed.hpText));
      }
      if (r.tempGranted) {
        box.append(row("PV temporários", `+${r.tempGranted.amount}`));
        if (r.tempGranted.hpText) box.append(row("Resultado", r.tempGranted.hpText));
      }
      if (r.conditions.length > 0) {
        box.append(
          row(
            "Condições",
            r.conditions
              .map(
                (c) =>
                  `${COND_BY_KEY.get(c.key)?.pt ?? c.key}${c.value > 1 ? ` ${c.value}` : ""}${
                    c.duration ? ` (${c.duration.text})` : ""
                  }`,
              )
              .join(", "),
          ),
        );
      }
      for (const n of r.notes) box.append(row("Aviso", n));
      if (r.effect) box.append(row("Efeito", r.effect, "effect"));
    }
    root.append(box);
  }

  if (offline) {
    root.append(row("", "O mestre não respondeu: as criaturas não foram atingidas.", "down"));
  }
}

/* ---------- teste simples (perícia, salvaguarda, iniciativa, dados) ---------- */
function checkCard(root: HTMLElement, m: RollMessage, onClose: () => void) {
  root.className = `card${m.degree ? ` ${m.degree}` : ""}`;
  root.append(header(m.title ?? m.label, m.name, onClose));

  const mod = m.modifier === 0 ? "" : ` ${signed(m.modifier)}`;
  const calc = el("span");
  calc.append(`${m.label.replace(/[+-]\d+$/, "")} [${m.rolls.join(", ")}]${mod} = `, strong(String(m.total)));
  root.append(row("Rolagem", calc, "big"));

  if (m.degree) {
    const res = el("span");
    if (m.dc !== undefined) res.append(`contra CD ${m.dc} → `);
    else res.append("→ ");
    res.append(strong(DEGREE_TEXT[m.degree]));
    root.append(row("Resultado", res));
  }
}

/* ---------- "o que esta magia faz" ---------- */
/** Diz o que a extensão automatiza nesta magia, para ninguém esperar o que ela não faz. */
function automationNote(sp: SpellData): string {
  const where = sp.area ? " Posicione a área no mapa." : "";
  if (sp.save) {
    const dano = sp.save.basic && sp.damage.length ? " e o dano básico" : "";
    return `Automático: salvaguarda de ${STAT_PT[sp.save.stat]} contra a sua CD${dano}, e as condições do grau de sucesso.${where}`;
  }
  if (sp.tempHp) return "Automático: concede os PV temporários ao alvo (bônus e outros efeitos ficam com você)." + where;
  if (sp.healing) return "Automático: rola a cura e soma os PV do alvo." + where;
  if (sp.attack && sp.damage.length) return "Automático: ataque de magia contra a CA e o dano." + where;
  if (sp.damage.length) return "Automático: acerto automático e dano." + where;
  return "Sem automação: o efeito é aplicado por você. Este cartão serve de lembrete para todos na mesa.";
}

function featInfoCard(root: HTMLElement, d: Extract<CardData, { kind: "featinfo" }>, act: CardActions) {
  root.className = "card spell";
  const i = d.info;
  root.append(header(d.name, [d.tag, i?.level ? `nível ${i.level}` : ""].filter(Boolean).join(" · "), act.close));
  if (!i) {
    const p = el("p", "sub", "Não encontrei a descrição nos dados do Foundry. ");
    const a = el("a", undefined, "Procurar no Archives of Nethys");
    a.href = d.aon;
    a.target = "_blank";
    a.rel = "noreferrer";
    p.append(a);
    root.append(p);
    return;
  }
  if (i.traits.length > 0) {
    const traits = el("div", "traits");
    for (const t of i.traits) traits.append(el("span", "trait", t));
    root.append(traits);
  }
  if (i.actions) root.append(row("Ações", i.actions));
  if (i.prerequisites.length) root.append(row("Pré-requisitos", i.prerequisites.join("; ")));
  const desc = el("div", "spell-desc");
  const paras = i.description.map((p) => el("p", undefined, p));
  desc.append(...paras);
  root.append(desc);
  if (i.description.length > 0) root.append(translateButton(root, i.description, paras, d.translated));
}

function spellInfoCard(
  root: HTMLElement,
  d: Extract<CardData, { kind: "spellinfo" }>,
  act: CardActions,
) {
  root.className = "card spell";
  const sp = d.spell;
  const kind = d.rank > 0 ? `Rank ${d.rank}` : "Truque";
  const trad = sp?.info.traditions.length ? ` · ${sp.info.traditions.join(", ")}` : "";
  root.append(header(d.name, `${kind}${trad}`, act.close));

  if (!sp) {
    root.append(
      el("p", "sub", "Não encontrei as regras desta magia nos dados do Foundry. Consulte o Archives of Nethys."),
    );
  } else {
    if (sp.info.traits.length > 0) {
      const traits = el("div", "traits");
      for (const t of sp.info.traits) traits.append(el("span", "trait", t));
      root.append(traits);
    }
    const rows: [string, string | undefined][] = [
      ["Ações", sp.info.actions],
      ["Alcance", sp.info.range],
      ["Área", sp.info.area],
      ["Alvos", sp.info.target],
      ["Duração", sp.info.duration],
      ["Requisitos", sp.info.requirements],
    ];
    for (const [k, v] of rows) if (v) root.append(row(k, v));
    const desc = el("div", "spell-desc");
    const paras = sp.info.description.map((p) => el("p", undefined, p));
    desc.append(...paras);
    root.append(desc);
    if (sp.info.description.length > 0) root.append(translateButton(root, sp.info.description, paras, d.translated));
    root.append(el("p", "sub", automationNote(sp)));
  }

  if (d.cast && act.cast) {
    const cast = d.cast;
    const b = el("button", "cast", "Conjurar");
    b.type = "button";
    b.addEventListener("click", () => act.cast!(cast));
    root.append(b);
  }
}

/** Botão que alterna a descrição entre o original (inglês) e a tradução automática. */
/** Tradução que o cartão está mostrando agora (vai junto no "Mostrar a todos"). */
const shownTranslation = new WeakMap<HTMLElement, string[] | null>();

function translateButton(
  root: HTMLElement,
  original: string[],
  paras: HTMLElement[],
  initial?: string[],
): HTMLElement {
  const wrap = el("div", "translate");
  const b = el("button", "translate-btn", "Traduzir para PT-BR");
  b.type = "button";
  const note = el("span", "sub");
  let translated: string[] | null = initial && initial.length === original.length ? initial : null;
  let showing = false;
  const show = () => {
    paras.forEach((p, i) => (p.textContent = translated![i]));
    showing = true;
    shownTranslation.set(root, translated);
    b.textContent = "Ver original (inglês)";
    note.textContent = "Tradução automática: confira termos de regra.";
  };
  if (translated) show();
  b.addEventListener("click", async () => {
    if (showing) {
      paras.forEach((p, i) => (p.textContent = original[i]));
      showing = false;
      shownTranslation.set(root, null);
      b.textContent = "Traduzir para PT-BR";
      note.textContent = "";
      return;
    }
    b.disabled = true;
    b.textContent = "Traduzindo…";
    note.textContent = "";
    try {
      translated ??= await Promise.all(original.map((p) => translate(p)));
      show();
    } catch (e) {
      b.textContent = "Traduzir para PT-BR";
      note.textContent = `Não consegui traduzir: ${e instanceof Error ? e.message : "erro de rede"}.`;
    } finally {
      b.disabled = false;
    }
  });
  wrap.append(b, note);
  return wrap;
}

/** Rodapé: o botão discreto "Mostrar a todos" (ou quem mostrou, no cartão recebido). */
function footer(root: HTMLElement, data: CardData, act: CardActions) {
  const foot = el("div", "card-foot");
  if (data.sharedBy) {
    foot.append(el("span", "sub", `Mostrado por ${data.sharedBy}`));
  } else if (act.share) {
    const b = el("button", "share", "Mostrar a todos");
    b.type = "button";
    b.title = "Mostra este cartão na tela de todos na sala";
    b.addEventListener("click", () => {
      act.share!(shownTranslation.get(root) ?? undefined);
      b.textContent = "Mostrado ✓";
      b.disabled = true;
    });
    foot.append(b);
  }
  root.append(foot);
}

export interface CardActions {
  close: () => void;
  /** Conjurar a magia (só no cartão aberto por quem vai conjurar). */
  cast?: (a: CastAction) => void;
  /** Mostrar este cartão a todos na sala. */
  share?: (translated?: string[]) => void;
}

/** Desenha o cartão de qualquer rolagem ou magia dentro de `root`. */
export function renderCard(root: HTMLElement, data: CardData, act: CardActions) {
  root.replaceChildren();
  switch (data.kind) {
    case "attack":
      attackCard(root, data.result, data.nextPenalty, act.close);
      break;
    case "spell":
      spellCard(root, data.cast, data.mode, data.rolled, data.results, data.offline, act.close);
      break;
    case "check":
      checkCard(root, data.msg, act.close);
      break;
    case "spellinfo":
      spellInfoCard(root, data, act);
      break;
    case "featinfo":
      featInfoCard(root, data, act);
      break;
  }
  footer(root, data, act);
}
