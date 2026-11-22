import OBR from "@owlbear-rodeo/sdk";

/** Ajustes da sala, definidos pelo mestre e guardados nos metadados da sala. */
const KEY = "com.owlbear-pf2e/settings";

export interface RoomSettings {
  /**
   * O mestre liberou a rolagem automática. Por padrão é falso: todos os jogadores veem a pergunta
   * "deseja rolar os dados?" antes de cada rolagem de ataque e de magia.
   */
  autoRollAllowed: boolean;
}

const defaults: RoomSettings = { autoRollAllowed: false };

function parse(meta: Record<string, unknown>): RoomSettings {
  const v = meta[KEY] as Partial<RoomSettings> | undefined;
  return { autoRollAllowed: v?.autoRollAllowed === true };
}

export async function loadSettings(): Promise<RoomSettings> {
  try {
    return parse(await OBR.room.getMetadata());
  } catch {
    return defaults;
  }
}

export async function saveSettings(s: RoomSettings): Promise<void> {
  await OBR.room.setMetadata({ [KEY]: s });
}

export function onSettingsChange(cb: (s: RoomSettings) => void): () => void {
  return OBR.room.onMetadataChange((meta) => cb(parse(meta)));
}
