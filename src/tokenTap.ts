import OBR from "@owlbear-rodeo/sdk";

/**
 * Celular: o painel da extensão cobre o mapa, então não dá para tocar num token com ele aberto.
 * Ações que pedem um token (vincular, atacar, magia de um alvo, manobra) fecham o painel, esperam o
 * próximo toque num token e reabrem o painel para confirmar. No computador nada disso acontece.
 */
const PHONE_WIDTH = 640;

/** Tela estreita (celular). Se o Owlbear não responder, trata como computador. */
export async function isPhone(): Promise<boolean> {
  try {
    return (await OBR.viewport.getWidth()) < PHONE_WIDTH;
  } catch {
    return false;
  }
}

let armed: ((selection: string[]) => Promise<void>) | null = null;
let closedByUs = false;
let reopening = false;

/** Fecha o painel e limpa a seleção, para que tocar no mesmo token de novo conte como um toque novo. */
export async function closeForTap(): Promise<boolean> {
  if (!(await isPhone())) return false;
  try {
    await OBR.player.deselect();
  } catch {
    /* sem seleção para limpar */
  }
  try {
    await OBR.action.close();
    closedByUs = true;
    return true;
  } catch {
    return false;
  }
}

/** Reabre o painel, se foi fechado por esta lógica. */
export async function reopenAfterTap(): Promise<void> {
  if (!closedByUs) return;
  closedByUs = false;
  reopening = true;
  try {
    await OBR.action.open();
  } catch {
    /* o painel pode ser aberto à mão */
  } finally {
    setTimeout(() => (reopening = false), 600);
  }
}

/**
 * Executa `run` com o token que for tocado a seguir. No celular o painel fecha enquanto espera; no
 * computador roda já, com a seleção atual.
 */
export async function whenTokenTapped(run: (selection: string[]) => Promise<void>): Promise<void> {
  if (await closeForTap()) {
    armed = run;
    return;
  }
  await run((await OBR.player.getSelection()) ?? []);
}

/** A seleção mudou: se há uma ação esperando o toque, roda e reabre o painel. */
export async function takeTap(selection: string[]): Promise<boolean> {
  if (!armed || selection.length === 0) return false;
  const run = armed;
  armed = null;
  try {
    await run(selection);
  } finally {
    await reopenAfterTap();
  }
  return true;
}

export const waitingForTap = () => armed !== null || closedByUs;

/** A pessoa abriu o painel à mão: desiste da espera. */
export function onPanelOpened() {
  if (reopening) return;
  armed = null;
  closedByUs = false;
}
