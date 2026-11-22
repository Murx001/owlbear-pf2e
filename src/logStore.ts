import OBR from "@owlbear-rodeo/sdk";
import {
  EVENT_CHANNEL,
  ROLL_CHANNEL,
  type EventMessage,
  type RollMessage,
} from "./roll";

/**
 * Histórico da sala. A página de fundo (sempre ativa) escuta as rolagens e os avisos, guarda as
 * últimas no armazenamento do navegador e mostra as notificações. A barra lateral só lê daqui,
 * então nada se perde enquanto ela está fechada.
 */
export const LOG_KEY = "pf2e.log";
export const UNREAD_KEY = "pf2e.log.unread";
const MAX = 100;

export type LogEntry =
  | { t: "roll"; at: number; m: RollMessage }
  | { t: "event"; at: number; m: EventMessage };

export function loadLog(): LogEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveLog(list: LogEntry[]) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(list));
  } catch {
    /* sem armazenamento: o histórico vale só enquanto a página está aberta */
  }
}

export function pushLog(e: LogEntry) {
  saveLog([e, ...loadLog()].slice(0, MAX));
}

export function clearLog() {
  saveLog([]);
  setUnread(0);
}

export function getUnread(): number {
  try {
    return parseInt(localStorage.getItem(UNREAD_KEY) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

export function setUnread(n: number) {
  try {
    localStorage.setItem(UNREAD_KEY, String(n));
  } catch {
    /* ignora */
  }
}

/** Liga a escuta (página de fundo): guarda no histórico e conta os não lidos. Sem balões: o histórico já mostra tudo. */
export function listenRolls(isLogOpen: () => Promise<boolean>) {
  const note = async (e: LogEntry) => {
    pushLog(e);
    if (!(await isLogOpen())) setUnread(getUnread() + 1);
  };
  OBR.broadcast.onMessage(EVENT_CHANNEL, (event) => {
    const msg = event.data as EventMessage;
    void note({ t: "event", at: Date.now(), m: msg });
  });
  OBR.broadcast.onMessage(ROLL_CHANNEL, (event) => {
    const msg = event.data as RollMessage;
    void note({ t: "roll", at: Date.now(), m: msg });
  });
}
