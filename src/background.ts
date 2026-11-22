import OBR, { buildShape, buildText, type Item } from "@owlbear-rodeo/sdk";
import { initAreaTool } from "./areaTool";
import { listenRolls } from "./logStore";
import { initSidebar, isLogOpen } from "./sidebar";
import { CARD_SHARE, type CardData } from "./cardData";
import { showCard } from "./cardView";
import { condTags, type ConditionTag } from "./conditions";
import { creatureAc, getCreature, statusOf } from "./creatures";
import { startGmResolver } from "./gmResolver";
import { parse, type All } from "./state";
import { CREATURE_KEY, LINK_KEY, isCreatureLink, isLink, type CreatureLink } from "./token";

/**
 * Página de fundo: roda para todos na sala. Desenha, só localmente, uma barra de PV e um texto
 * sobre cada token vinculado. Fichas de jogador mostram números; criaturas do mestre mostram
 * números só para o mestre e um estado grosseiro (Ileso, Ferido…) para os jogadores.
 * No mestre, também resolve os ataques contra criaturas e publica o estado delas nos tokens.
 */
const MARK = "com.owlbear-pf2e/hp-overlay";
const STATE_KEY = "com.owlbear-pf2e/state";
const TEMP_COLOR = "#4aa8ff";

let isGM = false;

// Itens locais já desenhados: token -> chave do que foi desenhado.
const drawn = new Map<string, string>();

const idsFor = (token: string) => [
  `${MARK}/bg/${token}`,
  `${MARK}/fill/${token}`,
  `${MARK}/txt/${token}`,
  `${MARK}/temp/${token}`,
];

function colorFor(ratio: number): string {
  if (ratio <= 0) return "#6b7080";
  if (ratio > 0.5) return "#4cc38a";
  if (ratio > 0.25) return "#e0a04a";
  return "#e5534b";
}

const TAG_PREFIX = (token: string) => `${MARK}/tag/${token}/`;

/** Apaga as fichinhas de condição de um token (a quantidade muda conforme as condições). */
async function deleteTags(token: string) {
  const old = await OBR.scene.local.getItems((i: Item) => i.id.startsWith(TAG_PREFIX(token)));
  if (old.length > 0) await OBR.scene.local.deleteItems(old.map((i) => i.id));
}

async function removeOverlay(token: string) {
  drawn.delete(token);
  await OBR.scene.local.deleteItems(idsFor(token));
  await deleteTags(token);
}

interface Overlay {
  tokenId: string;
  visible: boolean;
  name: string;
  line: string;
  hp: number;
  max: number;
  temp: number;
  /** Condições ativas, desenhadas como fichinhas acima do token. */
  tags: ConditionTag[];
}


/** Mestre: copia o estado de cada criatura para o token, para os jogadores verem só o resumo. */
async function publishCreatureStatuses() {
  if (!isGM || !(await OBR.scene.isReady())) return;
  const tokens = await OBR.scene.items.getItems((i: Item) => isCreatureLink(i.metadata[CREATURE_KEY]));
  const stale = tokens.filter((t) => {
    const link = t.metadata[CREATURE_KEY] as CreatureLink;
    const c = getCreature(link.id);
    if (!c) return false;
    const s = statusOf(c);
    return (
      link.status !== s.label ||
      link.ratio !== s.ratio ||
      link.name !== c.name ||
      JSON.stringify(link.conditions ?? {}) !== JSON.stringify(c.conditions ?? {}) ||
      JSON.stringify(link.durations ?? {}) !== JSON.stringify(c.durations ?? {})
    );
  });
  if (stale.length === 0) return;
  await OBR.scene.items.updateItems(stale, (items) => {
    for (const item of items) {
      const link = item.metadata[CREATURE_KEY] as CreatureLink;
      const c = getCreature(link.id);
      if (!c) continue;
      const s = statusOf(c);
      item.metadata[CREATURE_KEY] = {
        id: c.id,
        name: c.name,
        status: s.label,
        ratio: s.ratio,
        conditions: c.conditions ?? {},
        durations: c.durations,
      };
    }
  });
}

async function collectOverlays(): Promise<Overlay[]> {
  const [tokens, meta] = await Promise.all([
    OBR.scene.items.getItems(
      (i: Item) => isLink(i.metadata[LINK_KEY]) || isCreatureLink(i.metadata[CREATURE_KEY]),
    ),
    OBR.room.getMetadata(),
  ]);
  const states: All = parse({ [STATE_KEY]: meta[STATE_KEY] });
  const out: Overlay[] = [];

  for (const token of tokens) {
    const pc = token.metadata[LINK_KEY];
    if (isLink(pc)) {
      const st = states[pc.pathbuilderId];
      if (!st || !st.max) continue;
      const hp = Math.min(st.hp, st.max);
      const hpText = `PV ${hp}/${st.max}${st.temp ? ` +${st.temp}` : ""}`;
      out.push({
        tokenId: token.id,
        visible: token.visible,
        name: pc.name,
        line: st.ac !== undefined ? `CA ${st.ac} · ${hpText}` : hpText,
        hp,
        max: st.max,
        temp: st.temp,
        tags: condTags(st.conditions, st.durations),
      });
      continue;
    }

    const link = token.metadata[CREATURE_KEY];
    if (!isCreatureLink(link)) continue;
    const c = isGM ? getCreature(link.id) : undefined;
    if (c) {
      const hp = Math.min(c.hp, c.hpMax);
      out.push({
        tokenId: token.id,
        visible: token.visible,
        name: c.name,
        line: `CA ${creatureAc(c).value} · PV ${hp}/${c.hpMax}${c.temp ? ` +${c.temp}` : ""}`,
        hp,
        max: c.hpMax,
        temp: c.temp,
        tags: condTags(c.conditions, c.durations),
      });
    } else {
      // Jogadores (ou mestre sem os dados neste navegador): só o estado grosseiro.
      out.push({
        tokenId: token.id,
        visible: token.visible,
        name: link.name,
        line: link.status ?? "",
        hp: Math.round((link.ratio ?? 1) * 100),
        max: 100,
        temp: 0,
        tags: condTags(link.conditions, link.durations),
      });
    }
  }
  return out;
}

async function sync() {
  if (!(await OBR.scene.isReady())) {
    drawn.clear();
    return;
  }
  await publishCreatureStatuses();
  const [overlays, dpi] = await Promise.all([collectOverlays(), OBR.scene.grid.getDpi()]);
  const alive = new Set<string>();

  for (const o of overlays) {
    alive.add(o.tokenId);
    const b = await OBR.scene.items.getItemBounds([o.tokenId]);
    const key = [
      o.name,
      o.line,
      o.hp,
      o.max,
      o.temp,
      o.tags.map((t) => t.text).join(","),
      b.min.x,
      b.min.y,
      b.width,
      b.height,
      o.visible,
    ].join("|");
    if (drawn.get(o.tokenId) === key) continue;

    const ratio = Math.max(0, Math.min(1, o.hp / o.max));
    const scale = Math.max(o.max, o.hp + o.temp); // a barra representa o PV máximo
    const barH = Math.max(6, dpi * 0.12);
    const barY = b.max.y - barH;
    const textW = Math.max(b.width, dpi * 1.5);
    const [bgId, fillId, txtId, tempId] = idsFor(o.tokenId);

    const rect = (id: string, name: string, x: number, w: number, color: string, opacity = 1) =>
      buildShape()
        .id(id)
        .name(name)
        .shapeType("RECTANGLE")
        .width(Math.max(0.01, w))
        .height(barH)
        .position({ x, y: barY })
        .fillColor(color)
        .fillOpacity(opacity)
        .strokeColor(color)
        .strokeWidth(0)
        .layer("ATTACHMENT")
        .disableHit(true)
        .locked(true)
        .visible(o.visible)
        .metadata({ [MARK]: true })
        .build();

    const items: Item[] = [
      rect(bgId, "PF2e PV (fundo)", b.min.x, b.width, "#10121c", 0.85),
      rect(fillId, "PF2e PV", b.min.x, b.width * (o.hp / scale), colorFor(ratio)),
      buildText()
        .id(txtId)
        .name("PF2e PV (texto)")
        .textType("PLAIN") // o padrão é RICH, que ignora o plainText
        .plainText(o.line ? `${o.name}\n${o.line}` : o.name)
        .width(textW)
        .height(dpi * 0.4)
        .lineHeight(1.15)
        .position({ x: b.center.x - textW / 2, y: b.max.y + 2 })
        .textAlign("CENTER")
        .fontSize(Math.max(10, dpi * 0.1))
        .fontWeight(700)
        .fillColor("#ffffff")
        .strokeColor("#10121c")
        .strokeWidth(1.5)
        .layer("TEXT")
        .disableHit(true)
        .locked(true)
        .visible(o.visible)
        .metadata({ [MARK]: true })
        .build(),
    ];
    if (o.temp > 0) {
      items.push(
        rect(tempId, "PF2e PV temporário", b.min.x + b.width * (o.hp / scale), b.width * (o.temp / scale), TEMP_COLOR),
      );
    }

    // Fichinhas de condição: uma coluna à direita do token, de cima para baixo (a mais antiga primeiro).
    // Cada uma é um retângulo com texto, em medidas da cena, para não se sobreporem; só cabem as que
    // ficam dentro da altura do token (as demais viram "+N"), assim a coluna não invade o token de baixo.
    const fontSize = Math.max(9, dpi * 0.09);
    const tagH = fontSize * 1.3 + 6;
    const gap = 3;
    const fit = Math.max(2, Math.floor((b.height + gap) / (tagH + gap)));
    const shown = o.tags.length <= fit ? o.tags : o.tags.slice(0, fit - 1);
    const extra = o.tags.length - shown.length;
    const labels = extra > 0 ? [...shown, { text: `+${extra}`, color: "#4a4f66" }] : shown;
    labels.forEach((t, i) => {
      const w = Math.ceil(t.text.length * fontSize * 0.62) + 12;
      const x = b.max.x + 4;
      const y = b.min.y + i * (tagH + gap);
      const base = `${TAG_PREFIX(o.tokenId)}${i}`;
      items.push(
        buildShape()
          .id(`${base}/bg`)
          .name(`PF2e condição: ${t.text}`)
          .shapeType("RECTANGLE")
          .width(w)
          .height(tagH)
          .position({ x, y })
          .fillColor(t.color)
          .fillOpacity(0.95)
          .strokeColor(t.color)
          .strokeWidth(0)
          .layer("ATTACHMENT")
          .disableHit(true)
          .locked(true)
          .visible(o.visible)
          .metadata({ [MARK]: true })
          .build(),
        buildText()
          .id(`${base}/txt`)
          .name(`PF2e condição (texto): ${t.text}`)
          .textType("PLAIN")
          .plainText(t.text)
          .width(w)
          .height(tagH)
          .padding(0)
          .lineHeight(1)
          .textAlign("CENTER")
          .textAlignVertical("MIDDLE")
          .fontSize(fontSize)
          .fontWeight(700)
          .fillColor("#ffffff")
          .strokeWidth(0)
          .position({ x, y })
          .layer("TEXT")
          .disableHit(true)
          .locked(true)
          .visible(o.visible)
          .metadata({ [MARK]: true })
          .build(),
      );
    });

    await OBR.scene.local.deleteItems(idsFor(o.tokenId));
    await deleteTags(o.tokenId);
    await OBR.scene.local.addItems(items);
    drawn.set(o.tokenId, key);
  }

  // Remove a sobreposição de tokens desvinculados, apagados ou sem estado.
  for (const id of [...drawn.keys()]) {
    if (!alive.has(id)) await removeOverlay(id);
  }
}

let timer: number | undefined;
function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void sync().catch(() => undefined), 80);
}

OBR.onReady(async () => {
  isGM = (await OBR.player.getRole()) === "GM";
  await startGmResolver(schedule);
  await initAreaTool();
  // Histórico: guarda rolagens e avisos (mesmo com a barra fechada) e mostra o botão de pergaminho.
  listenRolls(isLogOpen);
  await initSidebar();
  // Cartão mostrado por outra pessoa ("Mostrar a todos"): abre no meio da tela.
  OBR.broadcast.onMessage(CARD_SHARE, (event) => void showCard(event.data as CardData));
  schedule();
  OBR.scene.onReadyChange(() => schedule());
  OBR.scene.items.onChange(() => schedule());
  OBR.room.onMetadataChange(() => schedule());
  // O formulário de criaturas (popover) grava no mesmo localStorage: avisa esta página.
  window.addEventListener("storage", () => schedule());
});
