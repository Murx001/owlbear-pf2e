import OBR from "@owlbear-rodeo/sdk";
import { rangeBetween, type Rect } from "./area";

/** Pixels por pé: o PF2e usa casas de 5 pés. */
export async function pixelsPerFoot(): Promise<number> {
  const [dpi, scale] = await Promise.all([OBR.scene.grid.getDpi(), OBR.scene.grid.getScale()]);
  const feetPerCell = /ft|feet|pé|pes/i.test(scale.parsed.unit) ? scale.parsed.multiplier : 5;
  return dpi / (feetPerCell || 5);
}

export async function rectOfToken(id: string): Promise<Rect> {
  const b = await OBR.scene.items.getItemBounds([id]);
  return { x: b.min.x, y: b.min.y, w: b.width, h: b.height };
}

/** Distância em pés entre dois tokens, contada como no PF2e (casas adjacentes = 5 pés). */
export async function tokenDistanceFeet(fromId: string, toId: string): Promise<number> {
  const [a, b, ppf] = await Promise.all([rectOfToken(fromId), rectOfToken(toId), pixelsPerFoot()]);
  return rangeBetween(a, b, ppf);
}
