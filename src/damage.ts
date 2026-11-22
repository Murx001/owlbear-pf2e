export interface DamageSpec {
  dice: number;
  die: number;
  bonus: number;
  type: string;
}

/**
 * "1d12+5 slashing" -> dados, bônus e tipo. Se houver mais de um dado ("2d6+4 slashing + 1d6 fire"),
 * usa só o primeiro grupo e marca `partial`. Devolve null se não entender.
 */
export function parseDamage(text: string): (DamageSpec & { partial?: boolean }) | null {
  const m = /^\s*(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*(.*)$/i.exec(text);
  if (!m) return null;
  const dice = parseInt(m[1], 10);
  const die = parseInt(m[2], 10);
  if (dice < 1 || dice > 20 || die < 2 || die > 100) return null;
  const rest = m[5].trim();
  const more = /\s\+\s*\d+\s*d\s*\d+/i.exec(" " + rest);
  const type = (more ? rest.slice(0, Math.max(0, more.index - 1)) : rest).replace(/\s*\+\s*$/, "").trim();
  return {
    dice,
    die,
    bonus: (m[3] === "-" ? -1 : 1) * (parseInt(m[4] ?? "0", 10) || 0),
    type,
    ...(more ? { partial: true } : {}),
  };
}
