import OBR from "@owlbear-rodeo/sdk";
import { asset } from "./assets";
import { setUnread } from "./logStore";

/** Barra lateral do histórico: um botão de pergaminho na direita abre e fecha o painel. */
export const LOG_BUTTON = "com.owlbear-pf2e/log-button";
export const LOG_PANEL = "com.owlbear-pf2e/log-panel";
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
  const right = phone ? PHONE_RIGHT : BUTTON_RIGHT;
  const bottom = phone ? PHONE_BOTTOM : BUTTON_BOTTOM;
  return {
    phone,
    button: { left: w - right, top: h - bottom },
    panel: { left: phone ? w - PHONE_RIGHT : w - RIGHT_GAP, top: h - (bottom + 52 + 10) },
  };
}

let panelOpen = false;
export const isLogOpen = async () => panelOpen;

async function openButton() {
  const [w, h] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  await OBR.popover.open({
    id: LOG_BUTTON,
    url: asset("logbtn.html"),
    width: 52,
    height: 52,
    anchorReference: "POSITION",
    // Canto inferior direito, logo à esquerda da escala (5ft) do Owlbear.
    anchorPosition: spot(w, h).button,
    anchorOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
    transformOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
    hidePaper: true,
    disableClickAway: true,
  });
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

/** Mostra o botão e liga o abre e fecha. Roda na página de fundo de cada pessoa. */
export async function initSidebar() {
  OBR.broadcast.onMessage(LOG_TOGGLE, async () => {
    if (panelOpen) {
      panelOpen = false;
      await OBR.popover.close(LOG_PANEL);
    }
    else await openPanel();
  });
  await openButton().catch((e) => {
    console.error("PF2e: botão do histórico", e);
    void OBR.notification.show("PF2e: não consegui abrir o botão do histórico. Recarregue a página.", "WARNING");
  });
}
