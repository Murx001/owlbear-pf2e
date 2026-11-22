import OBR, { buildPath, Command, type Item, type PathCommand } from "@owlbear-rodeo/sdk";
import { asset } from "./assets";
import {
  AREA_ARM,
  AREA_CLEAR,
  AREA_RESULT,
  distanceFeet,
  hits,
  needsCaster,
  polygon,
  recenter,
  type Area,
  type AreaArmMsg,
  type AreaResultMsg,
  type Placement,
  type Pt,
  type Rect,
} from "./area";
import { pixelsPerFoot, rectOfToken as rectOf } from "./grid";
import { CREATURE_KEY, LINK_KEY, isCreatureLink, isLink } from "./token";

/**
 * Ferramenta "Área PF2e" no mapa (roda na página de fundo). O popover pede para posicionar uma
 * área; aqui mostramos a prévia seguindo o mouse, e no clique devolvemos quais tokens estão dentro.
 */
const TOOL = "com.owlbear-pf2e/area";
const MODE = "com.owlbear-pf2e/area/place";
const SHAPE_ID = "com.owlbear-pf2e/area-shape";

interface Armed {
  area: Area;
  ppf: number;
  casterTokenId?: string;
  casterRect?: Rect;
  prevTool: string;
  /** Emanação posicionada livremente (outro centro que não o conjurador). */
  free?: boolean;
  /** Alcance da magia em pés (explosão: o centro tem de ficar a esta distância do conjurador). */
  rangeFeet?: number;
}

/** O ponto está dentro do alcance da magia? Só a explosão tem centro livre para medir. */
function inRange(a: Armed, pointer: Pt): boolean {
  // Vale para a explosão e para a emanação posicionada livremente: o centro tem de ficar no alcance.
  if ((a.area.kind !== "burst" && !a.free) || a.rangeFeet === undefined || !a.casterRect) return true;
  return distanceFeet(a.casterRect, pointer, a.ppf) <= a.rangeFeet + 0.01;
}

const outOfRangeMsg = (a: Armed) =>
  `Fora do alcance da magia (${a.rangeFeet} pés). Escolha um ponto mais perto do conjurador.`;

/** A área na posição atual: emanação livre usa o retângulo do conjurador recentrado no ponteiro. */
function placementOf(a: Armed, pointer: Pt): Placement {
  const caster = a.free && a.casterRect ? recenter(a.casterRect, pointer) : a.casterRect;
  return { area: a.area, ppf: a.ppf, pointer, caster };
}

let armed: Armed | null = null;
let drawing = false;
let drawn = false;

async function clearShape() {
  drawn = false;
  await OBR.scene.local.deleteItems([SHAPE_ID]).catch(() => undefined);
}

/** `ok = false` pinta a área de vermelho (fora do alcance). */
async function drawShape(pts: Pt[], final: boolean, ok = true) {
  if (drawing) return; // descarta atualizações enquanto a anterior termina
  drawing = true;
  try {
    const cmds: PathCommand[] = pts.map((p, i) =>
      i === 0 ? [Command.MOVE, p.x, p.y] : [Command.LINE, p.x, p.y],
    );
    cmds.push([Command.CLOSE]);
    const color = ok ? "#a99bff" : "#e5534b";
    const item = buildPath()
      .id(SHAPE_ID)
      .name("Área PF2e")
      .commands(cmds)
      .fillColor(color)
      .fillOpacity(final ? 0.38 : 0.22)
      .strokeColor(color)
      .strokeWidth(3)
      .strokeDash(final ? [] : [14, 8])
      .layer("DRAWING")
      .disableHit(true)
      .locked(true)
      .build();
    if (drawn) await OBR.scene.local.deleteItems([SHAPE_ID]);
    await OBR.scene.local.addItems([item]);
    drawn = true;
  } finally {
    drawing = false;
  }
}

const send = (msg: AreaResultMsg) =>
  OBR.broadcast.sendMessage(AREA_RESULT, msg, { destination: "LOCAL" });

/** Tokens com ficha ou criatura vinculada que estão dentro da área. */
async function tokensIn(pl: Placement, casterTokenId?: string): Promise<string[]> {
  const items = await OBR.scene.items.getItems(
    (i: Item) => isLink(i.metadata[LINK_KEY]) || isCreatureLink(i.metadata[CREATURE_KEY]),
  );
  const out: string[] = [];
  for (const it of items) {
    if (pl.area.kind !== "burst" && it.id === casterTokenId) continue; // não atinge o próprio conjurador
    if (hits(pl, await rectOf(it.id))) out.push(it.id);
  }
  return out;
}

async function restoreTool(prev: string) {
  if (prev && prev !== TOOL) await OBR.tool.activateTool(prev).catch(() => undefined);
}

async function finish(pointer: Pt) {
  const a = armed;
  if (!a) return;
  armed = null;
  try {
    const pl = placementOf(a, pointer);
    const pts = polygon(pl);
    if (pts) await drawShape(pts, true);
    await restoreTool(a.prevTool);
    // Na emanação livre o conjurador pode estar dentro da área; no resto ele nunca é atingido.
    await send({ tokenIds: await tokensIn(pl, a.free ? undefined : a.casterTokenId) });
  } catch (e) {
    await restoreTool(a.prevTool);
    await send({
      tokenIds: [],
      error: `Não foi possível posicionar a área: ${e instanceof Error ? e.message : "erro desconhecido"}.`,
    });
  }
}

async function cancel() {
  const a = armed;
  armed = null;
  await clearShape();
  if (a) {
    await restoreTool(a.prevTool);
    await send({ tokenIds: [], cancelled: true });
  }
}

async function arm(msg: AreaArmMsg) {
  try {
    await clearShape();
    const ppf = await pixelsPerFoot();
    let casterRect: Rect | undefined;
    if (needsCaster(msg.area.kind)) {
      if (!msg.casterTokenId) {
        await send({
          tokenIds: [],
          error: "Para cone, linha e emanação, vincule a sua ficha a um token no mapa (aba Ficha → Token).",
        });
        return;
      }
      casterRect = await rectOf(msg.casterTokenId);
    } else if (msg.rangeFeet !== undefined && msg.casterTokenId) {
      // Explosão: precisamos do conjurador só para medir o alcance.
      casterRect = await rectOf(msg.casterTokenId);
    }

    // Emanação livre só existe se a magia tem alcance; sem alcance ela fica no conjurador.
    const wantsFree = msg.area.kind === "emanation" && !!msg.free;
    const free = wantsFree && msg.rangeFeet !== undefined;
    if (wantsFree && !free) {
      await send({
        tokenIds: [],
        error: "Esta magia não tem alcance: a emanação sai do próprio conjurador e não pode ser movida.",
      });
    }

    // Emanação normal não precisa de clique: é ao redor do conjurador.
    if (msg.area.kind === "emanation" && !free) {
      armed = { area: msg.area, ppf, casterRect, casterTokenId: msg.casterTokenId, prevTool: "" };
      await finish({ x: 0, y: 0 });
      return;
    }

    // Se a ferramenta já estava ativa (posicionamento anterior), mantém a ferramenta de antes.
    const active = await OBR.tool.getActiveTool();
    const prevTool = active === TOOL ? (armed?.prevTool ?? "") : active;
    armed = {
      area: msg.area,
      ppf,
      casterRect,
      casterTokenId: msg.casterTokenId,
      prevTool,
      free,
      rangeFeet: msg.rangeFeet,
    };
    await OBR.tool.activateTool(TOOL);
    await OBR.tool.activateMode(TOOL, MODE).catch(() => undefined);
  } catch (e) {
    await send({
      tokenIds: [],
      error: `Não foi possível iniciar a área: ${e instanceof Error ? e.message : "erro desconhecido"}.`,
    });
  }
}

/** Posição do ponteiro: explosão encaixa nas interseções da grade; emanação livre, no centro da casa. */
async function aim(p: Pt): Promise<Pt> {
  const a = armed;
  if (a?.area.kind === "burst") {
    return OBR.scene.grid.snapPosition(p, 1, true, false).catch(() => p);
  }
  if (a?.free) {
    return OBR.scene.grid.snapPosition(p, 1, false, true).catch(() => p);
  }
  return p;
}

/** Clique no mapa: fora do alcance não deixa posicionar (a área fica vermelha). */
async function place(raw: Pt) {
  const a = armed;
  if (!a) return;
  const pointer = await aim(raw);
  if (!inRange(a, pointer)) {
    await send({ tokenIds: [], error: outOfRangeMsg(a) });
    return;
  }
  await finish(pointer);
}

export async function initAreaTool() {
  try {
    await OBR.tool.create({
      id: TOOL,
      icons: [{ icon: asset("area-icon.svg"), label: "Área PF2e" }],
      defaultMode: MODE,
    });
    await OBR.tool.createMode({
      id: MODE,
      icons: [{ icon: asset("area-icon.svg"), label: "Posicionar área" }],
      cursors: [{ cursor: "crosshair" }],
      onToolMove: async (_ctx, e) => {
        const a = armed;
        if (!a) return;
        const pointer = await aim(e.pointerPosition);
        const pts = polygon(placementOf(a, pointer));
        if (pts) await drawShape(pts, false, inRange(a, pointer));
      },
      onToolClick: async (_ctx, e) => {
        await place(e.pointerPosition);
        return false;
      },
      // Um clique com leve movimento vira "arrasto": também posiciona a área.
      onToolDragEnd: async (_ctx, e) => {
        await place(e.pointerPosition);
      },
      onKeyDown: (_ctx, e) => {
        if (e.key === "Escape") void cancel();
      },
    });
  } catch {
    /* já registrada (recarga da página): segue com a existente */
  }

  OBR.broadcast.onMessage(AREA_ARM, (event) => void arm(event.data as AreaArmMsg));
  OBR.broadcast.onMessage(AREA_CLEAR, async () => {
    const a = armed;
    armed = null;
    await clearShape();
    if (a) await restoreTool(a.prevTool);
  });
}
