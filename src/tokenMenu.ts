import OBR from "@owlbear-rodeo/sdk";
import { asset } from "./assets";

/**
 * Menu de 3 pontinhos do token (só para o mestre): "Horda" (clona o token com uma criatura por cópia)
 * e "Condições" (aplica ou tira condições dos tokens selecionados). Cada um abre uma janelinha.
 */
const HORDE_MENU = "com.owlbear-pf2e/menu-horde";
const COND_MENU = "com.owlbear-pf2e/menu-conditions";
export const MENU_POPOVER = "com.owlbear-pf2e/menu-popover";

async function openMenuPopover(page: "horde.html" | "conditions.html", ids: string[], height: number) {
  const [w, h] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]).catch(
    () => [window.innerWidth || 390, window.innerHeight || 700] as [number, number],
  );
  await OBR.popover.close(MENU_POPOVER).catch(() => undefined);
  await OBR.popover.open({
    id: MENU_POPOVER,
    url: `${asset(page)}?ids=${encodeURIComponent(ids.join(","))}`,
    width: Math.min(360, Math.max(260, w - 24)),
    height: Math.min(height, Math.max(260, h - 80)),
    anchorReference: "POSITION",
    anchorPosition: { left: Math.round(w / 2), top: Math.round(h / 2) },
    anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    hidePaper: true,
    disableClickAway: true,
  });
}

export const closeMenuPopover = () => void OBR.popover.close(MENU_POPOVER);

/** Registra os dois itens do menu do token. Só roda na página de fundo do mestre. */
export async function initTokenMenu() {
  const tokens = { roles: ["GM" as const], every: [{ key: "layer", value: "CHARACTER" }] };
  await OBR.contextMenu.create({
    id: HORDE_MENU,
    icons: [{ icon: asset("horde-icon.svg"), label: "PF2e: Horda", filter: { ...tokens, max: 1 } }],
    onClick: (ctx) => void openMenuPopover("horde.html", ctx.items.map((i) => i.id), 430),
  });
  await OBR.contextMenu.create({
    id: COND_MENU,
    icons: [{ icon: asset("condition-icon.svg"), label: "PF2e: Condições", filter: tokens }],
    onClick: (ctx) => void openMenuPopover("conditions.html", ctx.items.map((i) => i.id), 620),
  });
}
