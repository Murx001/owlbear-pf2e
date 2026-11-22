import OBR from "@owlbear-rodeo/sdk";
import "./tokens.css";
import "./style.css";
import "./theme.css";
import "./bestiaryPage.css";
import { closeBestiary } from "./bestiaryView";
import { initCreatures } from "./creaturesUi";

const bar = document.getElementById("bar")!;
const title = document.createElement("strong");
title.textContent = "Bestiário";
const close = document.createElement("button");
close.type = "button";
close.className = "ghost";
close.textContent = "×";
close.setAttribute("aria-label", "Fechar o bestiário");
close.addEventListener("click", closeBestiary);
bar.append(title, close);

OBR.onReady(() => {
  initCreatures(document.getElementById("content")!, undefined, "bestiary");
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeBestiary();
  });
});
