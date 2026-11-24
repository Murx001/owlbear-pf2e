import OBR from "@owlbear-rodeo/sdk";
import "./tokens.css";
import "./style.css";
import "./theme.css";
import "./popup.css";
import { CONDITIONS } from "./conditions";
import { closeMenuPopover } from "./tokenMenu";
import { loadTargets, setConditionOn, type CondTarget } from "./tokenConditions";

/**
 * Condições dos tokens selecionados: + e − nas que têm valor, liga e desliga nas que não têm.
 * Vale para todos os tokens de uma vez e é gravado na hora (criaturas no navegador do mestre,
 * fichas de jogador na sala).
 */
const ids = (new URLSearchParams(location.search).get("ids") ?? "").split(",").filter(Boolean);

// Condições que têm tela própria (Morrendo) ou que são efeitos de escudo vêm da ficha, não daqui.
const HIDDEN = new Set(["dying", "shield-raised", "shield-spell"]);
const QUICK = ["prone", "grabbed", "off-guard", "frightened", "stunned"];

const bar = document.getElementById("bar")!;
const content = document.getElementById("content")!;
const title = document.createElement("strong");
title.textContent = "Condições";
const close = document.createElement("button");
close.type = "button";
close.className = "ghost";
close.textContent = "×";
close.setAttribute("aria-label", "Fechar");
close.addEventListener("click", closeMenuPopover);
bar.append(title, close);

let targets: CondTarget[] = [];

/** Valor comum a todos os alvos; `null` quando eles diferem. */
const commonValue = (key: string): number | null => {
  const vals = targets.map((t) => t.conditions[key] ?? 0);
  return vals.every((v) => v === vals[0]) ? vals[0] : null;
};

async function apply(key: string, value: number) {
  await setConditionOn(targets, key, value);
  targets = await loadTargets(ids);
  render();
}

function row(key: string, pt: string, valued: boolean): HTMLElement {
  const v = commonValue(key);
  const on = v === null || v > 0;
  const r = document.createElement("div");
  r.className = `pp-cond${on ? " on" : ""}`;
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = pt;
  r.append(name);
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mini";
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  };
  if (valued) {
    const val = document.createElement("span");
    val.className = `val${v === null ? " mixed" : ""}`;
    val.textContent = v === null ? "~" : String(v);
    r.append(btn("−", () => void apply(key, (v ?? 1) - 1)), val, btn("+", () => void apply(key, (v ?? 0) + 1)));
  } else {
    r.append(btn(v !== null && v > 0 ? "Tirar" : "Aplicar", () => void apply(key, v !== null && v > 0 ? 0 : 1)));
  }
  return r;
}

function render() {
  content.replaceChildren();
  const who = document.createElement("p");
  who.className = "pp-msg";
  who.textContent =
    targets.length === 0
      ? "Nenhum dos tokens selecionados tem ficha ou criatura vinculada."
      : `${targets.length} token(s): ${targets.map((t) => t.name).join(", ")}. A mudança vale para todos e já fica salva.`;
  content.append(who);
  if (targets.length === 0) return;

  const defs = CONDITIONS.filter((c) => !HIDDEN.has(c.key));
  const quick = QUICK.map((k) => defs.find((d) => d.key === k)).filter((d): d is (typeof defs)[number] => !!d);
  const rest = defs.filter((d) => !QUICK.includes(d.key));
  for (const d of [...quick, ...rest]) content.append(row(d.key, d.pt, d.valued));
}

OBR.onReady(async () => {
  targets = await loadTargets(ids);
  render();
});
