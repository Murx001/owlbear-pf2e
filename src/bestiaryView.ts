import OBR from "@owlbear-rodeo/sdk";
import { asset } from "./assets";

/** Id da janela grande do bestiário (no meio da tela). */
export const BESTIARY_POPOVER = "com.owlbear-pf2e/bestiary";

/**
 * Abre o bestiário numa janela grande, no meio da tela. Dentro dela o mestre pesquisa, importa do
 * Foundry e vincula criaturas aos tokens selecionados, com espaço para ler as fichas.
 */
export async function openBestiary(): Promise<void> {
  const [w, h] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  await OBR.popover.close(BESTIARY_POPOVER).catch(() => undefined);
  await OBR.popover.open({
    id: BESTIARY_POPOVER,
    url: asset("bestiary.html"),
    width: Math.max(320, Math.min(920, w - 60)),
    height: Math.max(360, Math.min(720, h - 80)),
    anchorReference: "POSITION",
    anchorPosition: { left: Math.round(w / 2), top: Math.round(h / 2) },
    anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    hidePaper: true,
    disableClickAway: true,
  });
}

export const closeBestiary = () => void OBR.popover.close(BESTIARY_POPOVER);
