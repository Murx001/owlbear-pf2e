import OBR from "@owlbear-rodeo/sdk";
import "./tokens.css";
import "./log.css";
import { LOG_KEY, clearLog, loadLog, setUnread } from "./logStore";
import { buildEventItem, buildRollItem } from "./roll";
import { LOG_TOGGLE } from "./sidebar";

const root = document.getElementById("panel")!;
const close = () => void OBR.broadcast.sendMessage(LOG_TOGGLE, {}, { destination: "LOCAL" });

const head = document.createElement("div");
head.className = "log-head";
const title = document.createElement("strong");
title.textContent = "Histórico";
const clear = document.createElement("button");
clear.type = "button";
clear.className = "ghost";
clear.textContent = "Limpar";
clear.title = "Apaga o histórico só neste navegador";
clear.addEventListener("click", () => {
  clearLog();
  render();
});
const x = document.createElement("button");
x.type = "button";
x.className = "ghost";
x.textContent = "×";
x.setAttribute("aria-label", "Fechar histórico");
x.addEventListener("click", close);
const right = document.createElement("div");
right.className = "log-actions";
right.append(clear, x);
head.append(title, right);

const list = document.createElement("ul");
list.className = "log-list";
root.append(head, list);

function render() {
  list.replaceChildren();
  const entries = loadLog();
  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "As rolagens e os avisos da mesa aparecem aqui.";
    list.append(empty);
    return;
  }
  for (const e of entries) list.append(e.t === "roll" ? buildRollItem(e.m) : buildEventItem(e.m));
}

OBR.onReady(() => {
  setUnread(0);
  render();
  // A página de fundo grava cada rolagem; aqui só relemos quando o histórico muda.
  window.addEventListener("storage", (e) => {
    if (e.key === LOG_KEY || e.key === null) render();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
});
