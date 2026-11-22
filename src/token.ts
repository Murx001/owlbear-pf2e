import OBR from "@owlbear-rodeo/sdk";
import type { Durations } from "./durations";

/** Chave dos metadados do token. Guardamos só o necessário (limite de tamanho do Owlbear). */
export const LINK_KEY = "com.owlbear-pf2e/character";
const KEY = LINK_KEY;

export interface TokenLink {
  pathbuilderId: string;
  name: string;
  /** Jogador dono do token (quem vinculou). Só ele e o mestre abrem esta ficha. */
  ownerId?: string;
}

export function isLink(v: unknown): v is TokenLink {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as TokenLink).pathbuilderId === "string" &&
    typeof (v as TokenLink).name === "string"
  );
}

async function selectedId(): Promise<string> {
  const sel = (await OBR.player.getSelection()) ?? [];
  if (sel.length !== 1) throw new Error("Selecione exatamente um token no mapa.");
  return sel[0];
}

/** Vínculo do token atualmente selecionado (se houver um só token selecionado). */
export async function linkOfSelection(): Promise<TokenLink | undefined> {
  const sel = (await OBR.player.getSelection()) ?? [];
  if (sel.length !== 1) return undefined;
  const [item] = await OBR.scene.items.getItems([sel[0]]);
  const v = item?.metadata[KEY];
  return isLink(v) ? v : undefined;
}

/** Vínculo de token com criatura do mestre. Só leva o que os jogadores podem ver. */
export const CREATURE_KEY = "com.owlbear-pf2e/creature";

export interface CreatureLink {
  id: string;
  name: string;
  status: string;
  ratio: number;
  /** O mestre escondeu o estado de PV: o token mostra só o nome, sem barra. */
  noBar?: boolean;
  /** PV em números (ex.: "12/20"), só quando o mestre libera. */
  pv?: string;
  /** Condições da criatura, visíveis a todos (aparecem como tags no token). */
  conditions?: Record<string, number>;
  /** Tempo restante das condições, para mostrar nas tags. */
  durations?: Durations;
}

export function isCreatureLink(v: unknown): v is CreatureLink {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as CreatureLink).id === "string" &&
    typeof (v as CreatureLink).name === "string"
  );
}

export async function creatureOfToken(id: string): Promise<CreatureLink | undefined> {
  const [item] = await OBR.scene.items.getItems([id]);
  const v = item?.metadata[CREATURE_KEY];
  return isCreatureLink(v) ? v : undefined;
}

export async function linkCreatureToSelection(link: CreatureLink): Promise<void> {
  const id = await selectedId();
  await OBR.scene.items.updateItems([id], (items) => {
    for (const item of items) {
      item.metadata[CREATURE_KEY] = link;
      delete item.metadata[KEY]; // um token é ficha de jogador OU criatura
    }
  });
}

/** IDs de todos os tokens selecionados (um ou vários). */
export async function selectedTokenIds(): Promise<string[]> {
  return (await OBR.player.getSelection()) ?? [];
}

/** Liga cada token à sua própria criatura (instância). */
export async function linkCreatureTokens(
  pairs: { tokenId: string; link: CreatureLink }[],
): Promise<void> {
  if (pairs.length === 0) return;
  const byToken = new Map(pairs.map((p) => [p.tokenId, p.link]));
  await OBR.scene.items.updateItems([...byToken.keys()], (items) => {
    for (const item of items) {
      const link = byToken.get(item.id);
      if (!link) continue;
      item.metadata[CREATURE_KEY] = link;
      item.visible = false; // criatura nova começa escondida dos jogadores; o mestre revela na engrenagem
      delete item.metadata[KEY]; // um token é ficha de jogador OU criatura
    }
  });
}

/** Remove o vínculo de todo token ligado a esta criatura. */
export async function unlinkCreatureEverywhere(creatureId: string): Promise<void> {
  await OBR.scene.items.updateItems(
    (i) => (i.metadata[CREATURE_KEY] as CreatureLink | undefined)?.id === creatureId,
    (items) => {
      for (const item of items) delete item.metadata[CREATURE_KEY];
    },
  );
}

export async function unlinkCreatureFromSelection(): Promise<void> {
  const id = await selectedId();
  await OBR.scene.items.updateItems([id], (items) => {
    for (const item of items) delete item.metadata[CREATURE_KEY];
  });
}

/** Vínculo de um token específico (por ID). */
export async function linkOfToken(id: string): Promise<TokenLink | undefined> {
  const [item] = await OBR.scene.items.getItems([id]);
  const v = item?.metadata[KEY];
  return isLink(v) ? v : undefined;
}

export async function linkSelectedToken(link: TokenLink): Promise<void> {
  const id = await selectedId();
  const me = OBR.player.id;
  const isGm = (await OBR.player.getRole()) === "GM";
  const [item] = await OBR.scene.items.getItems([id]);
  // Jogador só prende a ficha a um token que ele mesmo colocou na mesa.
  if (!isGm && item && item.createdUserId !== me) {
    throw new Error("Você só pode vincular a sua ficha a um token seu (um que você mesmo colocou no mapa).");
  }
  const owner = isGm ? (item?.createdUserId ?? me) : me;
  try {
    await OBR.scene.items.updateItems([id], (items) => {
      for (const it of items) it.metadata[KEY] = { ...link, ownerId: owner };
    });
  } catch {
    throw new Error("Sem permissão para alterar esse token. Peça ao mestre ou use um token seu.");
  }
}

/** Dono efetivo da ficha ligada a um token: quem vinculou ou, em vínculos antigos, quem criou o token. */
export function sheetOwner(link: TokenLink, createdUserId: string): string {
  return link.ownerId ?? createdUserId;
}

/** Vínculo do token selecionado, só se este jogador puder abrir a ficha (dono ou mestre). */
export async function openableLinkOfSelection(): Promise<TokenLink | undefined> {
  const sel = (await OBR.player.getSelection()) ?? [];
  if (sel.length !== 1) return undefined;
  const [item] = await OBR.scene.items.getItems([sel[0]]);
  const v = item?.metadata[KEY];
  if (!item || !isLink(v)) return undefined;
  if ((await OBR.player.getRole()) === "GM") return v;
  return sheetOwner(v, item.createdUserId) === OBR.player.id ? v : undefined;
}

/** A ficha fixada ao token deste jogador (o primeiro token seu com ficha), se existir. */
export async function myPinnedLink(): Promise<TokenLink | undefined> {
  const me = OBR.player.id;
  const items = await OBR.scene.items.getItems((i) => isLink(i.metadata[KEY]));
  for (const it of items) {
    const v = it.metadata[KEY] as TokenLink;
    if (sheetOwner(v, it.createdUserId) === me) return v;
  }
  return undefined;
}

export async function unlinkSelectedToken(): Promise<void> {
  const id = await selectedId();
  try {
    await OBR.scene.items.updateItems([id], (items) => {
      for (const item of items) delete item.metadata[KEY];
    });
  } catch {
    throw new Error("Sem permissão para alterar esse token.");
  }
}
