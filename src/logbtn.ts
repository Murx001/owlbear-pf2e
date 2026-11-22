import OBR from "@owlbear-rodeo/sdk";
import "./tokens.css";
import "./logbtn.css";
import { UNREAD_KEY, getUnread } from "./logStore";
import { LOG_TOGGLE } from "./sidebar";

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
  document.getElementById("scroll")!.addEventListener("click", () => {
    void OBR.broadcast.sendMessage(LOG_TOGGLE, {}, { destination: "LOCAL" });
  });
});
