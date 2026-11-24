/**
 * Posição do botão do histórico, que a pessoa pode mover (segurar o botão para ajustar).
 * Guardada no navegador de cada pessoa, em pixels a partir do canto inferior direito da tela.
 */
export const LOG_MOVE_REQ = "pf2e.dice/log-move-req";
export const LOG_MOVE_DONE = "pf2e.dice/log-move-done";
/** Tamanho da janelinha do botão (44 px do botão + 4 px de folga de cada lado). */
export const BTN_SIZE = 52;

export interface Pos {
  right: number;
  bottom: number;
}

/** Resposta da tela de ajuste: nova posição, ou `reset` para voltar à posição padrão. */
export interface MoveDone {
  pos?: Pos;
  reset?: boolean;
}

const KEY = "pf2e.log-button-pos";

export function savedPos(): Pos | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Pos | null;
    return v && Number.isFinite(v.right) && Number.isFinite(v.bottom) ? v : null;
  } catch {
    return null;
  }
}

export function savePos(p: Pos | null) {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

/** Mantém o botão dentro da tela (a tela pode ter mudado de tamanho desde que a posição foi guardada). */
export function clampPos(p: Pos, w: number, h: number): Pos {
  return { right: clamp(p.right, 4, w - BTN_SIZE - 4), bottom: clamp(p.bottom, 4, h - BTN_SIZE - 4) };
}
