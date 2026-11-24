import OBR from "@owlbear-rodeo/sdk";
import "./tokens.css";
import "./logbtn.css";
import { UNREAD_KEY, getUnread } from "./logStore";
import { LOG_TOGGLE } from "./sidebar";
import { LOG_MOVE_REQ } from "./logPos";

const root = document.getElementById("btn")!;
root.innerHTML = `
  <button type="button" id="scroll" aria-label="Abrir ou fechar o histórico" title="Histórico da mesa">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h10a2 2 0 0 1 2 2V17a2.5 2.5 0 0 1-2.5 2.5H8M7 3.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9.5M10 8.5h6M10 12h6"/>
    </svg>
    <span class="dot" id="dot" hidden></span>
  </button>`;
const dot = document.getElementById("dot")!;

function showUnread() {
  const n = getUnread();
  dot.hidden = n <= 0;
  dot.textContent = n > 9 ? "9+" : String(n);
}

OBR.onReady(() => {
  showUnread();
  window.addEventListener("storage", (e) => {
    if (e.key === UNREAD_KEY || e.key === null) showUnread();
  });
  const btn = document.getElementById("scroll")!;
  // Segurar o botão (ou clicar com o botão direito) abre a tela de ajuste da posição.
  let hold: number | undefined;
  let moved = false;
  let held = false;
  let start = { x: 0, y: 0 };
  btn.addEventListener("pointerdown", (e) => {
    held = false;
    moved = false;
    start = { x: e.clientX, y: e.clientY };
    hold = window.setTimeout(() => {
      held = true;
      void OBR.broadcast.sendMessage(LOG_MOVE_REQ, {}, { destination: "LOCAL" });
    }, 600);
  });
  btn.addEventListener("pointermove", (e) => {
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
      moved = true;
      window.clearTimeout(hold);
    }
  });
  const stop = () => window.clearTimeout(hold);
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointercancel", stop);
  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    stop();
    held = true;
    void OBR.broadcast.sendMessage(LOG_MOVE_REQ, {}, { destination: "LOCAL" });
  });
  btn.addEventListener("click", () => {
    if (held || moved) return; // foi para ajustar, não para abrir
    void OBR.broadcast.sendMessage(LOG_TOGGLE, {}, { destination: "LOCAL" });
  });
});
