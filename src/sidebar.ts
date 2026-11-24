import OBR from "@owlbear-rodeo/sdk";
import { asset } from "./assets";
import { setUnread } from "./logStore";
import { BTN_SIZE, LOG_MOVE_DONE, LOG_MOVE_REQ, clampPos, savePos, savedPos, type MoveDone } from "./logPos";

/** Barra lateral do histórico: um botão de pergaminho na direita abre e fecha o painel. */
export const LOG_BUTTON = "com.owlbear-pf2e/log-button";
export const LOG_PANEL = "com.owlbear-pf2e/log-panel";
export const LOG_MOVER = "com.owlbear-pf2e/log-mover";
export const LOG_TOGGLE = "pf2e.dice/log-toggle";

const RIGHT_GAP = 82; // deixa livre a barra de ferramentas do Owlbear, no canto direito
const BUTTON_RIGHT = 104; // o botão fica à esquerda da escala (5ft) do Owlbear
const BUTTON_BOTTOM = 18;
/** Celular: a barra de baixo do Owlbear (Ativos) cobre a borda inferior, então o botão sobe e fica no canto. */
const PHONE_WIDTH = 640;
const PHONE_RIGHT = 16;
const PHONE_BOTTOM = 96;

/** Onde ficam o botão e o painel, conforme a tela (celular ou computador). */
function spot(w: number, h: number) {
  const phone = w < PHONE_WIDTH;
  const mine = savedPos(); // posição que a pessoa escolheu, se houver
  const right = mine ? clampPos(mine, w, h).right : phone ? PHONE_RIGHT : BUTTON_RIGHT;
  const bottom = mine ? clampPos(mine, w, h).bottom : phone ? PHONE_BOTTOM : BUTTON_BOTTOM;
  return {
    phone,
    right,
    bottom,
    button: { left: w - right, top: h - bottom },
    panel: { left: mine || phone ? w - right : w - RIGHT_GAP, top: h - (bottom + BTN_SIZE + 10) },
  };
}

let panelOpen = false;
export const isLogOpen = async () => panelOpen;

/** Tamanho da tela do Owlbear; se ele não responder (celular), usa o da própria página. */
async function viewportSize(): Promise<[number, number]> {
  try {
    return await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  } catch {
    return [window.innerWidth || 390, window.innerHeight || 800];
  }
}

async function openButton() {
  const [w, h] = await viewportSize();
  const base = {
    id: LOG_BUTTON,
    url: asset("logbtn.html"),
    width: 52,
    height: 52,
    anchorReference: "POSITION" as const,
    // Canto inferior direito, logo à esquerda da escala (5ft) do Owlbear.
    anchorPosition: spot(w, h).button,
    anchorOrigin: { horizontal: "RIGHT" as const, vertical: "BOTTOM" as const },
    transformOrigin: { horizontal: "RIGHT" as const, vertical: "BOTTOM" as const },
  };
  // Algumas telas (celular) recusam certas opções: tenta da mais completa para a mais simples.
  const variants = [{ ...base, hidePaper: true, disableClickAway: true }, { ...base, hidePaper: true }, base];
  let last: unknown;
  for (const v of variants) {
    try {
      await OBR.popover.open(v);
      return;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

async function openPanel() {
  const [w, h] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  await OBR.popover.open({
    id: LOG_PANEL,
    url: asset("log.html"),
    width: Math.min(340, Math.max(220, w - (spot(w, h).phone ? PHONE_RIGHT * 2 : RIGHT_GAP + 12))),
    height: Math.max(220, Math.min(h - 200, 620)),
    anchorReference: "POSITION",
    // Abre para cima, logo acima do botão do canto inferior direito.
    anchorPosition: spot(w, h).panel,
    anchorOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
    transformOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
    hidePaper: true,
    disableClickAway: true,
  });
  panelOpen = true;
  setUnread(0);
}

/** Tela de ajuste: fecha o botão e o painel e abre uma camada que cobre a tela para arrastar o botão. */
async function startMove() {
  const [w, h] = await viewportSize();
  if (panelOpen) {
    panelOpen = false;
    await OBR.popover.close(LOG_PANEL).catch(() => undefined);
  }
  const s = spot(w, h);
  await OBR.popover.close(LOG_BUTTON).catch(() => undefined);
  await OBR.popover.open({
    id: LOG_MOVER,
    url: `${asset("move.html")}?w=${w}&h=${h}&r=${s.right}&b=${s.bottom}`,
    width: w,
    height: h,
    anchorReference: "POSITION",
    anchorPosition: { left: 0, top: 0 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    hidePaper: true,
    disableClickAway: true,
  });
}

/** Mostra o botão e liga o abre e fecha. Roda na página de fundo de cada pessoa. */
export async function initSidebar() {
  OBR.broadcast.onMessage(LOG_TOGGLE, async () => {
    if (panelOpen) {
      panelOpen = false;
      await OBR.popover.close(LOG_PANEL);
    }
    else await openPanel();
  });
  OBR.broadcast.onMessage(LOG_MOVE_REQ, () => void startMove().catch(() => void openButton()));
  OBR.broadcast.onMessage(LOG_MOVE_DONE, async (event) => {
    const done = event.data as MoveDone;
    if (done.reset) savePos(null);
    else if (done.pos) savePos(done.pos);
    await OBR.popover.close(LOG_MOVER).catch(() => undefined);
    await openButton().catch(() => undefined);
  });
  // Na primeira vez a sala pode ainda não estar pronta (celular): tenta de novo antes de avisar.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await openButton();
      return;
    } catch (e) {
      console.error("PF2e: botão do histórico", e);
      if (attempt === 3) {
        const why = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
        void OBR.notification.show(`PF2e: não consegui abrir o botão do histórico (${why || "erro desconhecido"}). Recarregue a página.`, "WARNING");
      } else {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
}
