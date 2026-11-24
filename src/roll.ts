import OBR from "@owlbear-rodeo/sdk";

export const ROLL_CHANNEL = "pf2e.dice/roll";

export type Degree = "crit-success" | "success" | "failure" | "crit-failure";

export interface RollMessage {
  /** Identifica a rolagem: duas abas do mesmo navegador recebem a mesma mensagem e só uma grava. */
  id?: string;
  name: string;
  color: string;
  title?: string; // ex: "Atletismo"
  label: string; // ex: "1d20+7"
  rolls: number[];
  modifier: number;
  total: number;
  dc?: number;
  degree?: Degree;
}

export interface RollRequest {
  title?: string;
  count: number;
  sides: number;
  mod: number;
  /** CD/CA do alvo. Só vale para um único d20. */
  dc?: number;
  /** Mostra só o grau de sucesso, sem revelar a CD/CA (alvos secretos). */
  hideTarget?: boolean;
  /** Rola em nome de outra pessoa (ex.: o mestre resolvendo o ataque de um jogador). */
  as?: { name: string; color: string };
}

export const DEGREE_TEXT: Record<Degree, string> = {
  "crit-success": "Sucesso crítico",
  success: "Sucesso",
  failure: "Falha",
  "crit-failure": "Falha crítica",
};

const ORDER: Degree[] = ["crit-failure", "failure", "success", "crit-success"];

/** Grau de sucesso do PF2e: alvo±10 e ajuste por 20/1 natural. */
export function degreeOf(total: number, dc: number, nat: number): Degree {
  let i = 1;
  if (total >= dc + 10) i = 3;
  else if (total >= dc) i = 2;
  else if (total <= dc - 10) i = 0;
  if (nat === 20) i = Math.min(3, i + 1);
  else if (nat === 1) i = Math.max(0, i - 1);
  return ORDER[i];
}

export function rollDie(sides: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / sides) * sides;
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return (buf[0] % sides) + 1;
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function formulaText(count: number, sides: number, mod: number): string {
  return `${count}d${sides}${mod === 0 ? "" : signed(mod)}`;
}

export const EVENT_CHANNEL = "pf2e.dice/event";

export interface EventMessage {
  id?: string;
  name: string;
  color: string;
  text: string;
}

/** Cor do jogador legível sobre fundo escuro (clareia cores escuras). */
export function readableColor(color: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const [r, g, bl] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255;
  if (lum >= 0.5) return color;
  const mix = (c: number) => Math.round(c + (255 - c) * 0.6);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(bl)})`;
}

/** Uma linha de rolagem do histórico. */
export function buildRollItem(msg: RollMessage): HTMLLIElement {
  const li = document.createElement("li");
  if (msg.degree) li.className = msg.degree;

  const head = document.createElement("div");
  head.className = "head";
  const who = document.createElement("span");
  who.className = "who";
  who.style.color = readableColor(msg.color);
  who.textContent = msg.name;
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = msg.title ? `${msg.title} · ${msg.label}` : msg.label;
  head.append(who, label);

  const body = document.createElement("div");
  body.className = "body";
  const total = document.createElement("strong");
  total.textContent = String(msg.total);
  const detail = document.createElement("span");
  detail.className = "detail";
  const mod = msg.modifier === 0 ? "" : msg.modifier > 0 ? ` + ${msg.modifier}` : ` − ${-msg.modifier}`;
  detail.textContent = ` [${msg.rolls.join(", ")}]${mod}`;
  body.append(total, detail);

  if (msg.degree) {
    const deg = document.createElement("span");
    deg.className = "degree";
    deg.textContent =
      msg.dc !== undefined ? `${DEGREE_TEXT[msg.degree]} (${msg.dc})` : DEGREE_TEXT[msg.degree];
    body.append(deg);
  }

  li.append(head, body);
  return li;
}

/** Uma linha de aviso do histórico ("Linari conjurou…"). */
export function buildEventItem(msg: EventMessage): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "event";
  const who = document.createElement("span");
  who.className = "who";
  who.style.color = readableColor(msg.color);
  who.textContent = msg.name;
  li.append(who, document.createTextNode(` ${msg.text}`));
  return li;
}

/** Anuncia algo na sala (ex.: "conjurou Bless") sem rolagem. */
export async function publishEvent(text: string, as?: { name: string; color: string }) {
  const msg: EventMessage = {
    id: crypto.randomUUID(),
    name: as?.name ?? (await OBR.player.getName()),
    color: as?.color ?? (await OBR.player.getColor()),
    text,
  };
  await OBR.broadcast.sendMessage(EVENT_CHANNEL, msg, { destination: "ALL" });
}

export async function publishRoll(req: RollRequest): Promise<RollMessage> {
  const count = Math.min(20, Math.max(1, req.count));
  const rolls = Array.from({ length: count }, () => rollDie(req.sides));
  const total = rolls.reduce((a, b) => a + b, 0) + req.mod;

  const msg: RollMessage = {
    id: crypto.randomUUID(),
    name: req.as?.name ?? (await OBR.player.getName()),
    color: req.as?.color ?? (await OBR.player.getColor()),
    title: req.title,
    label: formulaText(count, req.sides, req.mod),
    rolls,
    modifier: req.mod,
    total,
  };

  if (req.sides === 20 && count === 1 && req.dc !== undefined && Number.isFinite(req.dc)) {
    if (!req.hideTarget) msg.dc = req.dc;
    msg.degree = degreeOf(total, req.dc, rolls[0]);
  }

  await OBR.broadcast.sendMessage(ROLL_CHANNEL, msg, { destination: "ALL" });
  return msg;
}
