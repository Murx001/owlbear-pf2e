import OBR from "@owlbear-rodeo/sdk";
import { asset } from "./assets";
import { setUnread } from "./logStore";

/** Barra lateral do histórico: um botão de pergaminho na direita abre e fecha o painel. */
export const LOG_BUTTON = "com.owlbear-pf2e/log-button";
export const LOG_PANEL = "com.owlbear-pf2e/log-panel";
export const LOG_TOGGLE = "pf2e.dice/log-toggle";

const RIGHT_GAP = 82; // deixa livre a barra de ferramentas do Owlbear, no canto direito

let panelOpen = false;
export const isLogOpen = async () => panelOpen;

async function openButton() {
  const [w] = await Promise.all([OBR.viewport.getWidth()]);
  await OBR.popover.open({
    id: LOG_BUTTON,
    url: asset("logbtn.html"),
    width: 52,
    height: 52,
    anchorReference: "POSITION",
    anchorPosition: { left: w - RIGHT_GAP, top: 110 },
    anchorOrigin: { horizontal: "RIGHT", vertical: "TOP" },
    transformOrigin: { horizontal: "RIGHT", vertical: "TOP" },
    hidePaper: true,
    disableClickAway: true,
  });
}

async function openPanel() {
  const [w, h] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  await OBR.popover.open({
    id: LOG_PANEL,
    url: asset("log.html"),
    width: Math.min(340, Math.max(220, w - RIGHT_GAP - 12)),
    height: Math.max(260, Math.min(h - 200, 620)),
    anchorReference: "POSITION",
    anchorPosition: { left: w - RIGHT_GAP, top: 172 },
    anchorOrigin: { horizontal: "RIGHT", vertical: "TOP" },
    transformOrigin: { horizontal: "RIGHT", vertical: "TOP" },
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
    void OBR.notification.show("PF2e: não consegui abrir o botão do histórico. Use a aba Histórico.", "WARNING");
  });
}
