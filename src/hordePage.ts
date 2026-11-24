import OBR, { isImage, type Item } from "@owlbear-rodeo/sdk";
import "./tokens.css";
import "./style.css";
import "./theme.css";
import "./popup.css";
import { closeMenuPopover } from "./tokenMenu";
import { freeCells, type Pt } from "./hordeLayout";
import { getCreature, isInstance, loadCreatures, makeInstances, publicLink, upsertCreature, type Creature } from "./creatures";
import { CREATURE_KEY, LINK_KEY, isCreatureLink, linkCreatureTokens } from "./token";

/**
 * Horda: clona o token escolhido e dá uma criatura numerada a cada cópia ("Goblin 1", "Goblin 2"…).
 * Se o token já é uma criatura, ele fica como está e os clones continuam a numeração.
 */
const ids = (new URLSearchParams(location.search).get("ids") ?? "").split(",").filter(Boolean);

const bar = document.getElementById("bar")!;
const content = document.getElementById("content")!;
const title = document.createElement("strong");
title.textContent = "Horda";
const close = document.createElement("button");
close.type = "button";
close.className = "ghost";
close.textContent = "×";
close.setAttribute("aria-label", "Fechar");
close.addEventListener("click", closeMenuPopover);
bar.append(title, close);

const msg = document.createElement("p");
msg.className = "pp-msg";
const say = (t: string, error = false) => {
  msg.textContent = t;
  msg.className = `pp-msg${error ? " error" : ""}`;
};

async function build() {
  const [base] = await OBR.scene.items.getItems(ids.slice(0, 1));
  if (!base) {
    content.textContent = "Não achei o token. Feche e tente de novo.";
    return;
  }
  const link = base.metadata[CREATURE_KEY];
  const own = isCreatureLink(link) ? getCreature(link.id) : undefined;
  const template: Creature | undefined = own ? (own.templateId ? getCreature(own.templateId) ?? own : own) : undefined;

  const intro = document.createElement("p");
  intro.className = "pp-msg";
  intro.textContent = template
    ? `Este token é ${own!.name}. Os clones usam a ficha de ${template.name}, com PV e condições próprios, numerados em sequência.`
    : "Este token ainda não tem criatura. Escolha o modelo do bestiário: este token vira o nº 1 e os clones seguem a numeração.";
  content.append(intro);

  let model: Creature | undefined = template;
  if (!template) {
    const models = loadCreatures().filter((c) => !isInstance(c)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (models.length === 0) {
      say("O bestiário está vazio. Cadastre ou importe uma criatura primeiro.", true);
      content.append(msg);
      return;
    }
    const row = document.createElement("div");
    row.className = "pp-row";
    const sel = document.createElement("select");
    sel.style.flex = "1";
    for (const m of models) sel.append(new Option(`${m.name}${m.level !== undefined ? ` (nível ${m.level})` : ""}`, m.id));
    model = models[0];
    sel.addEventListener("change", () => (model = models.find((m) => m.id === sel.value)));
    row.append(sel);
    content.append(row);
  }

  const qtyRow = document.createElement("div");
  qtyRow.className = "pp-row";
  const label = document.createElement("label");
  label.textContent = "Quantas criaturas no total?";
  const qty = document.createElement("input");
  qty.type = "number";
  qty.min = "2";
  qty.max = "30";
  qty.value = "4";
  qtyRow.append(label, qty);
  content.append(qtyRow);

  const go = document.createElement("button");
  go.type = "button";
  go.textContent = "Criar horda";
  go.addEventListener("click", async () => {
    const total = Math.max(2, Math.min(30, parseInt(qty.value, 10) || 0));
    if (!model) return;
    go.disabled = true;
    try {
      await createHorde(base.id, model, own !== undefined, total);
    } catch (e) {
      say(e instanceof Error ? e.message : "Não foi possível criar a horda.", true);
      go.disabled = false;
    }
  });
  content.append(go, msg);
}

async function createHorde(baseId: string, model: Creature, baseHasCreature: boolean, total: number) {
  const [base] = await OBR.scene.items.getItems([baseId]);
  const dpi = await OBR.scene.grid.getDpi().catch(() => 150);
  const step =
    isImage(base) ? (base.image.width * base.scale.x * dpi) / (base.grid.dpi || dpi) : dpi;
  const others = await OBR.scene.items.getItems((i) => i.id !== baseId && (i.layer === "CHARACTER" || i.layer === "MOUNT"));
  const occupied: Pt[] = others.map((i) => i.position);
  const clones = Math.max(1, total - 1);
  const spots = freeCells(base.position, step, clones, occupied);
  if (spots.length < clones) throw new Error("Não há espaço livre suficiente perto do token.");

  const copies: Item[] = spots.map((p) => {
    const c = { ...structuredClone(base), id: crypto.randomUUID(), position: p } as Item;
    delete c.attachedTo;
    delete c.metadata[CREATURE_KEY];
    delete c.metadata[LINK_KEY];
    return c;
  });
  await OBR.scene.items.addItems(copies);

  // Criaturas: um token já ligado fica como está; um token sem criatura vira o nº 1.
  const tokenIds = baseHasCreature ? copies.map((c) => c.id) : [baseId, ...copies.map((c) => c.id)];
  const made = makeInstances(model, loadCreatures(), tokenIds);
  for (const inst of made) upsertCreature(inst);
  await linkCreatureTokens(made.map((m) => ({ tokenId: m.tokenId!, link: publicLink(m) })));
  // A horda segue a visibilidade do token original (linkCreatureTokens esconde criaturas novas).
  if (base.visible) await OBR.scene.items.updateItems(tokenIds, (items) => items.forEach((i) => (i.visible = true)));

  void OBR.notification.show(`Horda criada: ${made.map((m) => m.name).join(", ")}.`, "SUCCESS");
  closeMenuPopover();
}

OBR.onReady(() => void build());
