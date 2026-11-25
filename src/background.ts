import OBR, { buildPath, buildShape, buildText, type Item } from "@owlbear-rodeo/sdk";
import { initAreaTool } from "./areaTool";
import { listenRolls } from "./logStore";
import { initSidebar, isLogOpen } from "./sidebar";
import { initTokenMenu } from "./tokenMenu";
import { CARD_SHARE, type CardData } from "./cardData";
import { showCard } from "./cardView";
import { condTags, type ConditionTag } from "./conditions";
import { creatureAc, getCreature, publicLink } from "./creatures";
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
  `${MARK}/bartxt/${token}`,
  `${MARK}/acbg/${token}`,
  `${MARK}/actxt/${token}`,
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
  /** Texto sob o nome (estado grosseiro das criaturas para os jogadores). */
  line: string;
  /** PV em números, escritos dentro da barra (ex.: "12/48 +5"). Vazio: barra sem números. */
  barText: string;
  /** CA, no escudinho ao lado do token. Indefinida: sem escudo (CA secreta). */
  ac?: number;
  hp: number;
  max: number;
  temp: number;
  /** Condições ativas, desenhadas como fichinhas acima do token. */
  tags: ConditionTag[];
  /** Mostra a barra de PV (o mestre pode esconder dos jogadores). */
  bar: boolean;
}


/** Mestre: copia o estado de cada criatura para o token, para os jogadores verem só o resumo. */
async function publishCreatureStatuses() {
  if (!isGM || !(await OBR.scene.isReady())) return;
  const tokens = await OBR.scene.items.getItems((i: Item) => isCreatureLink(i.metadata[CREATURE_KEY]));
  const stale = tokens.filter((t) => {
    const link = t.metadata[CREATURE_KEY] as CreatureLink;
    const c = getCreature(link.id);
    if (!c) return false;
    const p = publicLink(c);
    return (
      link.status !== p.status ||
      link.ratio !== p.ratio ||
      link.name !== p.name ||
      !!link.noBar !== !!p.noBar ||
      (link.pv ?? "") !== (p.pv ?? "") ||
      (link.ac ?? -1) !== (p.ac ?? -1) ||
      JSON.stringify(link.conditions ?? {}) !== JSON.stringify(p.conditions ?? {}) ||
      JSON.stringify(link.durations ?? {}) !== JSON.stringify(p.durations ?? {})
    );
  });
  if (stale.length === 0) return;
  await OBR.scene.items.updateItems(stale, (items) => {
    for (const item of items) {
      const link = item.metadata[CREATURE_KEY] as CreatureLink;
      const c = getCreature(link.id);
      if (!c) continue;
      item.metadata[CREATURE_KEY] = publicLink(c);
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
      out.push({
        tokenId: token.id,
        visible: token.visible,
        name: pc.name,
        line: "",
        barText: `${hp}/${st.max}${st.temp ? ` +${st.temp}` : ""}`,
        ac: st.ac,
        hp,
        max: st.max,
        temp: st.temp,
        tags: condTags(st.conditions, st.durations),
        bar: true,
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
        line: "",
        barText: `${hp}/${c.hpMax}${c.temp ? ` +${c.temp}` : ""}`,
        ac: creatureAc(c).value,
        hp,
        max: c.hpMax,
        temp: c.temp,
        tags: condTags(c.conditions, c.durations),
        bar: true,
      });
    } else {
      // Jogadores (ou mestre sem os dados neste navegador): só o estado grosseiro.
      out.push({
        tokenId: token.id,
        visible: token.visible,
        name: link.name,
        line: [link.status, link.noBar && link.pv ? `PV ${link.pv}` : ""].filter(Boolean).join(" · "),
        barText: link.noBar ? "" : (link.pv ?? ""),
        ac: link.ac,
        hp: Math.round((link.ratio ?? 1) * 100),
        max: 100,
        temp: 0,
        tags: condTags(link.conditions, link.durations),
        bar: !link.noBar,
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
      o.barText,
      o.ac ?? "",
      o.hp,
      o.max,
      o.temp,
      o.tags.map((t) => t.text).join(","),
      b.min.x,
      b.min.y,
      b.width,
      b.height,
      o.visible,
      o.bar,
    ].join("|");
    if (drawn.get(o.tokenId) === key) continue;

    const ratio = Math.max(0, Math.min(1, o.hp / o.max));
    const scale = Math.max(o.max, o.hp + o.temp); // a barra representa o PV máximo
    const barH = Math.max(o.barText ? 16 : 7, dpi * (o.barText ? 0.2 : 0.12));
    // Barra em pílula, um pouco mais estreita que o token e encostada na borda de baixo (cabe no círculo).
    const barW = b.width * 0.8;
    const barX = b.center.x - barW / 2;
    const barY = b.max.y - barH * 0.7;
    const textW = Math.max(b.width, dpi * 1.5);
    const [bgId, fillId, txtId, tempId, barTxtId, acBgId, acTxtId] = idsFor(o.tokenId);

    // Retângulo de cantos redondos nos lados pedidos (esquerda/direita), como a barra de PV.
    const rect = (id: string, name: string, x: number, w: number, color: string, opacity = 1, roundLeft = true, roundRight = true) => {
      const ww = Math.max(0.5, w);
      const r = Math.min(barH / 2, ww / 2);
      const K = 0.5523 * r;
      const MOVE = 0, LINE = 1, CUBIC = 4, CLOSE = 5;
      const cmds: number[][] = [[MOVE, roundLeft ? r : 0, 0], [LINE, ww - (roundRight ? r : 0), 0]];
      if (roundRight) {
        cmds.push([CUBIC, ww - r + K, 0, ww, r - K, ww, r], [CUBIC, ww, r + K, ww - r + K, barH, ww - r, barH]);
      } else cmds.push([LINE, ww, 0], [LINE, ww, barH]);
      cmds.push([LINE, roundLeft ? r : 0, barH]);
      if (roundLeft) cmds.push([CUBIC, r - K, barH, 0, r + K, 0, r], [CUBIC, 0, r - K, r - K, 0, r, 0]);
      else cmds.push([LINE, 0, 0]);
      cmds.push([CLOSE]);
      return buildPath()
        .id(id)
        .name(name)
        .commands(cmds as never)
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
    };

    const items: Item[] = [
      ...(o.bar
        ? [
            rect(bgId, "PF2e PV (fundo)", barX, barW, "#10121c", 0.85),
            rect(fillId, "PF2e PV", barX, barW * (o.hp / scale), colorFor(ratio), 1, true, o.temp === 0 && o.hp >= scale),
          ]
        : []),
      buildText()
        .id(txtId)
        .name("PF2e PV (texto)")
        .textType("PLAIN") // o padrão é RICH, que ignora o plainText
        .plainText(o.line ? `${o.name}\n${o.line}` : o.name)
        .width(textW)
        .height(dpi * 0.4)
        .lineHeight(1.15)
        .position({ x: b.center.x - textW / 2, y: (o.bar ? barY + barH : b.max.y) + 2 })
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
    if (o.bar && o.barText) {
      items.push(
        buildText()
          .id(barTxtId)
          .name("PF2e PV (números)")
          .textType("PLAIN")
          .plainText(o.barText)
          .width(barW)
          .height(barH)
          .padding(0)
          .lineHeight(1)
          .textAlign("CENTER")
          .textAlignVertical("MIDDLE")
          .fontSize(Math.max(9, barH * 0.68))
          .fontWeight(700)
          .fillColor("#ffffff")
          .strokeColor("#10121c")
          .strokeWidth(1.5)
          .position({ x: barX, y: barY })
          .layer("TEXT")
          .disableHit(true)
          .locked(true)
          .visible(o.visible)
          .metadata({ [MARK]: true })
          .build(),
      );
    }

    // CA no escudinho, no canto inferior direito do token, perto da barra de PV.
    if (o.ac !== undefined) {
      const sz = Math.max(21, dpi * 0.27);
      // Canto inferior direito, sobre a borda do token e logo acima da ponta direita da barra de PV.
      const sx = b.max.x - b.width * 0.06 - sz / 2;
      const sy = b.max.y - b.height * 0.24 - sz * 0.5;
      const pt = (x: number, y: number) => [x * sz, y * sz];
      const [x0, y0] = pt(0, 0);
      const [x1] = pt(1, 0);
      const [, y1] = pt(0, 0.55);
      const [xm, ym] = pt(0.5, 1);
      // Contorno de escudo: topo reto, laterais retas e a ponta embaixo.
      const MOVE = 0, LINE = 1, CUBIC = 4, CLOSE = 5;
      const commands = [
        [MOVE, x0, y0],
        [LINE, x1, y0],
        [LINE, x1, y1],
        [CUBIC, x1, sz * 0.82, sz * 0.72, sz * 0.95, xm, ym],
        [CUBIC, sz * 0.28, sz * 0.95, x0, sz * 0.82, x0, y1],
        [CLOSE],
      ] as never;
      items.push(
        buildPath()
          .id(acBgId)
          .name("PF2e CA (escudo)")
          .commands(commands)
          .position({ x: sx, y: sy })
          .fillColor("#1b1d2e")
          .fillOpacity(0.92)
          .strokeColor("#d3ae64")
          .strokeWidth(2)
          .layer("ATTACHMENT")
          .disableHit(true)
          .locked(true)
          .visible(o.visible)
          .metadata({ [MARK]: true })
          .build(),
        buildText()
          .id(acTxtId)
          .name("PF2e CA (número)")
          .textType("PLAIN")
          .plainText(String(o.ac))
          .width(sz)
          .height(sz * 0.95)
          .padding(0)
          .lineHeight(1)
          .textAlign("CENTER")
          .textAlignVertical("MIDDLE")
          .fontSize(sz * 0.5)
          .fontWeight(700)
          .fillColor("#f2e3b8")
          .strokeWidth(0)
          .position({ x: sx, y: sy })
          .layer("TEXT")
          .disableHit(true)
          .locked(true)
          .visible(o.visible)
          .metadata({ [MARK]: true })
          .build(),
      );
    }

    if (o.bar && o.temp > 0) {
      items.push(
        rect(tempId, "PF2e PV temporário", barX + barW * (o.hp / scale), barW * (o.temp / scale), TEMP_COLOR, 1, o.hp <= 0, o.hp + o.temp >= scale),
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
    // Os itens ficam soltos (sem `attachedTo`): anexá-los ao token fez as barras sumirem e travou a
    // página da extensão numa sala com vários tokens (o painel ficou preto). Seguir o token durante o
    // arrasto precisa de outra abordagem, testada numa sala real antes de publicar.
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
  if (isGM) void initTokenMenu().catch((e) => console.error("PF2e: menu do token", e)); // Horda e Condições nos 3 pontinhos
  void initSidebar(); // sem esperar: as tentativas do botão não atrasam o resto
  // Cartão mostrado por outra pessoa ("Mostrar a todos"): abre no meio da tela.
  OBR.broadcast.onMessage(CARD_SHARE, (event) => void showCard(event.data as CardData));
  schedule();
  OBR.scene.onReadyChange(() => schedule());
  OBR.scene.items.onChange(() => schedule());
  OBR.room.onMetadataChange(() => schedule());
  // O formulário de criaturas (popover) grava no mesmo localStorage: avisa esta página.
  window.addEventListener("storage", () => schedule());
});
