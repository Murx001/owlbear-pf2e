import OBR from "@owlbear-rodeo/sdk";
import { asset } from "./assets";
import { CARD_POPOVER, type CardData } from "./cardData";

const WIDTH = 440;

/**
 * Mostra o cartão de resultados no meio da tela de quem rolou. Os dados vão na URL, então não
 * dependem de armazenamento do navegador. Rolar de novo troca o cartão; ✕, Esc ou um clique
 * fora o fecham.
 */
export async function showCard(full: CardData): Promise<void> {
  // O cartão não usa o texto completo das regras da magia: tira para a URL ficar curta.
  const data: CardData =
    full.kind === "spell"
      ? { ...full, cast: { ...full.cast, spell: { ...full.cast.spell, outcomes: null } } }
      : full.kind === "spellinfo" && full.spell
        ? { ...full, spell: { ...full.spell, outcomes: null } }
        : full;
  const [w, h] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  await OBR.popover.close(CARD_POPOVER).catch(() => undefined);
  await OBR.popover.open({
    id: CARD_POPOVER,
    url: `${asset("card.html")}#${encodeURIComponent(JSON.stringify(data))}`,
    width: WIDTH,
    height: 280, // a página do cartão ajusta a altura ao conteúdo
    anchorReference: "POSITION",
    anchorPosition: { left: Math.round(w / 2), top: Math.round(h / 2) },
    anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    hidePaper: true,
  });
}
