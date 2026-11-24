import OBR from "@owlbear-rodeo/sdk";
import type { Combatant } from "./combat";
import { getCreature } from "./creatures";
import { LINK_KEY, isLink } from "./token";
import { isPhone } from "./tokenTap";

/**
 * Tocar numa criatura (ou personagem) da lista de iniciativa leva a tela até o token dele, seleciona
 * o token e, no celular, fecha o painel para o mapa ficar à vista.
 */
let focusing = false;

/** Verdadeiro logo depois de irmos até um token: a seleção feita por nós não deve abrir fichas nem trocar de aba. */
export const isFocusingToken = () => focusing;

/** Token do mapa de quem está na iniciativa; `undefined` se não há token vinculado. */
export async function tokenForCombatant(x: Combatant): Promise<string | undefined> {
  const creature = getCreature(x.id);
  if (creature?.tokenId) {
    const [t] = await OBR.scene.items.getItems([creature.tokenId]);
    return t?.id;
  }
  const pb = x.pathbuilderId ?? x.id;
  const linked = await OBR.scene.items.getItems((i) => {
    const l = i.metadata[LINK_KEY];
    return isLink(l) && l.pathbuilderId === pb;
  });
  return linked[0]?.id;
}

/** Centraliza a tela no token mantendo o zoom de agora. */
async function centerOn(tokenId: string) {
  const [item] = await OBR.scene.items.getItems([tokenId]);
  if (!item) return;
  const [vw, vh, scale] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight(), OBR.viewport.getScale()]);
  const halfW = vw / scale / 2;
  const halfH = vh / scale / 2;
  await OBR.viewport.animateToBounds({
    min: { x: item.position.x - halfW, y: item.position.y - halfH },
    max: { x: item.position.x + halfW, y: item.position.y + halfH },
    width: halfW * 2,
    height: halfH * 2,
    center: { x: item.position.x, y: item.position.y },
  });
}

export async function goToToken(tokenId: string): Promise<void> {
  focusing = true;
  window.setTimeout(() => (focusing = false), 1500);
  try {
    await centerOn(tokenId);
    await OBR.player.select([tokenId]).catch(() => undefined);
  } finally {
    // Celular: o painel cobre o mapa; fecha para a pessoa ver o token.
    if (await isPhone()) await OBR.action.close().catch(() => undefined);
  }
}
