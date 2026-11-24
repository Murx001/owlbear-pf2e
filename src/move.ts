import OBR from "@owlbear-rodeo/sdk";
import "./tokens.css";
import "./logbtn.css";
import { BTN_SIZE, LOG_MOVE_DONE, clampPos, type MoveDone } from "./logPos";

/**
 * Tela de ajuste do botão do histórico: cobre a tela inteira, mostra o botão para arrastar e devolve
 * a posição escolhida. Como ela começa no canto superior esquerdo da tela do Owlbear, as coordenadas
 * daqui são as da tela.
 */
const q = new URLSearchParams(location.search);
const W = Number(q.get("w")) || window.innerWidth;
const H = Number(q.get("h")) || window.innerHeight;
let pos = clampPos({ right: Number(q.get("r")) || 16, bottom: Number(q.get("b")) || 96 }, W, H);

const css = document.createElement("style");
css.textContent = `
  html, body { height: 100%; overflow: hidden; touch-action: none; }
  #stage { position: fixed; inset: 0; background: rgba(8, 9, 14, 0.55); font-family: var(--sans, sans-serif); color: #ece6d6; }
  #ghost { position: absolute; width: ${BTN_SIZE}px; height: ${BTN_SIZE}px; touch-action: none; cursor: grab; }
  #ghost.drag { cursor: grabbing; }
  #hint { position: absolute; left: 50%; top: 18%; transform: translateX(-50%); width: min(320px, 86%); text-align: center;
    background: #1a1d2c; border: 1px solid var(--gold, #d3ae64); border-radius: 12px; padding: 12px 14px; box-shadow: 0 6px 24px rgba(0,0,0,.6); }
  #hint p { margin: 0 0 10px; font-size: 14px; line-height: 1.35; }
  #hint .row { display: flex; gap: 8px; justify-content: center; }
  #hint button { min-height: 44px; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--gold, #d3ae64); background: #232740; color: inherit; font: 600 14px var(--sans, sans-serif); }
`;
document.head.append(css);

const stage = document.getElementById("stage")!;
const ghost = document.createElement("div");
ghost.id = "ghost";
ghost.innerHTML = `<div id="btn"><button type="button" id="scroll" aria-label="Botão do histórico" style="pointer-events:none">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10a2 2 0 0 1 2 2V17a2.5 2.5 0 0 1-2.5 2.5H8M7 3.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9.5M10 8.5h6M10 12h6"/></svg></button></div>`;

const place = () => {
  ghost.style.left = `${W - pos.right - BTN_SIZE}px`;
  ghost.style.top = `${H - pos.bottom - BTN_SIZE}px`;
};

let grab: { dx: number; dy: number } | null = null;
ghost.addEventListener("pointerdown", (e) => {
  ghost.setPointerCapture(e.pointerId);
  ghost.classList.add("drag");
  const r = ghost.getBoundingClientRect();
  grab = { dx: e.clientX - r.left, dy: e.clientY - r.top };
});
ghost.addEventListener("pointermove", (e) => {
  if (!grab) return;
  const left = e.clientX - grab.dx;
  const top = e.clientY - grab.dy;
  pos = clampPos({ right: W - left - BTN_SIZE, bottom: H - top - BTN_SIZE }, W, H);
  place();
});
const drop = () => {
  grab = null;
  ghost.classList.remove("drag");
};
ghost.addEventListener("pointerup", drop);
ghost.addEventListener("pointercancel", drop);

const send = (msg: MoveDone) => void OBR.broadcast.sendMessage(LOG_MOVE_DONE, msg, { destination: "LOCAL" });

const hint = document.createElement("div");
hint.id = "hint";
const text = document.createElement("p");
text.textContent = "Arraste o botão do histórico para onde preferir e toque em Pronto.";
const row = document.createElement("div");
row.className = "row";
const mk = (label: string, fn: () => void) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", fn);
  return b;
};
row.append(
  mk("Pronto", () => send({ pos })),
  mk("Posição padrão", () => send({ reset: true })),
);
hint.append(text, row);

stage.append(ghost, hint);
place();

OBR.onReady(() => {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") send({ pos });
  });
});
