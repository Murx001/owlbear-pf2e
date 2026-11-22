import OBR from "@owlbear-rodeo/sdk";
import "./tokens.css";
import "./card.css";
import { CARD_POPOVER, CARD_SHARE, CAST_REQ, type CardData } from "./cardData";
import { renderCard } from "./cardRender";

const root = document.getElementById("card")!;
const close = () => void OBR.popover.close(CARD_POPOVER);

OBR.onReady(async () => {
  let data: CardData | null = null;
  try {
    data = JSON.parse(decodeURIComponent(location.hash.slice(1))) as CardData;
  } catch {
    root.textContent = "Não foi possível mostrar o cartão.";
  }
  const myName = await OBR.player.getName().catch(() => "");
  if (data) {
    const shown = data;
    renderCard(root, shown, {
      close,
      // "Conjurar": pede ao painel principal (que tem a ficha) para conjurar e fecha o cartão.
      cast: (a) => {
        void OBR.broadcast.sendMessage(CAST_REQ, a, { destination: "LOCAL" });
        close();
      },
      // "Mostrar a todos": o mesmo cartão (sem o botão Conjurar) aparece na tela dos outros.
      share: (translated) => {
        const copy: Record<string, unknown> = { ...shown, sharedBy: myName || "Alguém" };
        delete copy.cast;
        // Se está lendo a tradução, os outros recebem o cartão traduzido também.
        if (translated && (shown.kind === "spellinfo" || shown.kind === "featinfo")) copy.translated = translated;
        void OBR.broadcast.sendMessage(CARD_SHARE, copy, { destination: "REMOTE" });
      },
    });
  }
  // Ajusta a altura do popover ao conteúdo do cartão.
  requestAnimationFrame(() => {
    const h = Math.ceil(root.getBoundingClientRect().height) + 24;
    void OBR.popover.setHeight(CARD_POPOVER, Math.min(h, 640));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
});
