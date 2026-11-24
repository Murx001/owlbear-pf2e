export interface Pt {
  x: number;
  y: number;
}

/**
 * Posições para os tokens novos da horda: as casas livres mais próximas do token original, em anéis
 * a partir dele. `step` é o lado de uma casa (do tamanho do token) e `occupied` os tokens que já estão
 * no mapa, para não empilhar um em cima do outro.
 */
export function freeCells(base: Pt, step: number, count: number, occupied: Pt[]): Pt[] {
  const taken = [...occupied, base];
  const near = (p: Pt) => taken.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < step * 0.5);
  const out: Pt[] = [];
  for (let ring = 1; out.length < count && ring <= 20; ring++) {
    const cells: [number, number][] = [];
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) cells.push([dx, dy]);
      }
    }
    // Primeiro as casas de lado (mais perto), depois as diagonais; direita antes de esquerda, de cima para baixo.
    cells.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2) || b[0] - a[0] || a[1] - b[1]);
    for (const [dx, dy] of cells) {
      if (out.length >= count) break;
      const p = { x: base.x + dx * step, y: base.y + dy * step };
      if (near(p)) continue;
      out.push(p);
      taken.push(p);
    }
  }
  return out;
}
