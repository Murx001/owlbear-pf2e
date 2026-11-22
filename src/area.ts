/**
 * Geometria das áreas de magia do PF2e (explosão, cone, linha, emanação).
 * Tudo em pixels da cena; `ppf` = pixels por pé. Funções puras, sem Owlbear.
 */
export type AreaKind = "burst" | "emanation" | "cone" | "line";

export interface Area {
  kind: AreaKind;
  feet: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** Retângulo pelo canto superior esquerdo. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placement {
  area: Area;
  ppf: number;
  /** Explosão: centro da área. Cone/linha: ponto para onde se mira. */
  pointer: Pt;
  /** Quem conjura: origem do cone/linha e centro da emanação. */
  caster?: Rect;
}

/** Mensagens locais entre o popover e a página de fundo (que cuida da ferramenta no mapa). */
export const AREA_ARM = "pf2e.dice/area-arm";
export const AREA_CLEAR = "pf2e.dice/area-clear";
/** A área posicionada aparece para todos na sala (só a área final; a prévia é de quem posiciona). */
export const AREA_SHARE = "pf2e.dice/area-share";
export const AREA_UNSHARE = "pf2e.dice/area-unshare";
export interface AreaShareMsg {
  pts: { x: number; y: number }[];
}
export const AREA_RESULT = "pf2e.dice/area-result";

export interface AreaArmMsg {
  area: Area;
  /** Token de quem conjura (origem de cone/linha, centro da emanação). */
  casterTokenId?: string;
  /** Alcance da magia em pés: a explosão só pode ser posicionada até essa distância do conjurador. */
  rangeFeet?: number;
  /**
   * Posicionamento livre da emanação: por regra ela sai do conjurador, mas o mestre pode
   * liberar outro centro (aura em outro ponto, conjurador que se moveu…).
   */
  free?: boolean;
}

/** Retângulo com o mesmo tamanho, recentrado em `c`. */
export function recenter(r: Rect, c: Pt): Rect {
  return { x: c.x - r.w / 2, y: c.y - r.h / 2, w: r.w, h: r.h };
}

export interface AreaResultMsg {
  tokenIds: string[];
  cancelled?: boolean;
  error?: string;
}

export const KIND_PT: Record<AreaKind, string> = {
  burst: "explosão",
  emanation: "emanação",
  cone: "cone",
  line: "linha",
};

/** Lê `system.area` do arquivo da magia no Foundry. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function areaFromFoundry(a: any): Area | null {
  if (!a || typeof a !== "object") return null;
  const kind = String(a.type ?? "");
  const feet = Number(a.value);
  if (!["burst", "emanation", "cone", "line"].includes(kind) || !Number.isFinite(feet) || feet <= 0) {
    return null;
  }
  return { kind: kind as AreaKind, feet };
}

/** Cone e linha precisam de quem conjura (a origem); explosão não. */
export const needsCaster = (k: AreaKind) => k !== "burst";

const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * Distância entre dois tokens para medir alcance: o vão entre as bordas mais 5 pés, porque no
 * PF2e casas vizinhas estão a 5 pés (e o alvo na mesma posição, a 0).
 */
export function rangeBetween(a: Rect, b: Rect, ppf: number): number {
  const gap = distRects(a, b) / ppf;
  const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  return overlap ? 0 : gap + 5;
}

/** Distância, em pés, da borda do conjurador até um ponto (alcance medido a partir dele). */
export function distanceFeet(caster: Rect, p: Pt, ppf: number): number {
  return distPointRect(p, caster) / ppf;
}

function distPointRect(p: Pt, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

function distRects(a: Rect, b: Rect): number {
  const dx = Math.max(a.x - (b.x + b.w), 0, b.x - (a.x + a.w));
  const dy = Math.max(a.y - (b.y + b.h), 0, b.y - (a.y + a.h));
  return Math.hypot(dx, dy);
}

/** Ponto onde a reta do centro do conjurador até a mira cruza a borda dele: origem do cone/linha. */
export function apexOn(caster: Rect, aim: Pt): Pt {
  const c = center(caster);
  const dx = aim.x - c.x;
  const dy = aim.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const tx = dx === 0 ? Infinity : caster.w / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : caster.h / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

function direction(pl: Placement): { apex: Pt; dir: Pt } | null {
  if (!pl.caster) return null;
  const apex = apexOn(pl.caster, pl.pointer);
  const dx = pl.pointer.x - apex.x;
  const dy = pl.pointer.y - apex.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  return { apex, dir: { x: dx / len, y: dy / len } };
}

/** Folga (px) para erros de arredondamento ao comparar com a borda da área. */
const EDGE = 0.5;
const LINE_WIDTH_FEET = 5;
const CONE_HALF = Math.PI / 4; // cone de 90°

/** Pontos do contorno para desenhar. `null` se faltar o conjurador. */
export function polygon(pl: Placement): Pt[] | null {
  const R = pl.area.feet * pl.ppf;
  switch (pl.area.kind) {
    case "burst": {
      const pts: Pt[] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push({ x: pl.pointer.x + Math.cos(a) * R, y: pl.pointer.y + Math.sin(a) * R });
      }
      return pts;
    }
    case "emanation": {
      const c = pl.caster;
      if (!c) return null;
      return [
        { x: c.x - R, y: c.y - R },
        { x: c.x + c.w + R, y: c.y - R },
        { x: c.x + c.w + R, y: c.y + c.h + R },
        { x: c.x - R, y: c.y + c.h + R },
      ];
    }
    case "cone": {
      const d = direction(pl);
      if (!d) return null;
      const base = Math.atan2(d.dir.y, d.dir.x);
      const pts: Pt[] = [d.apex];
      for (let i = 0; i <= 24; i++) {
        const a = base - CONE_HALF + (i / 24) * CONE_HALF * 2;
        pts.push({ x: d.apex.x + Math.cos(a) * R, y: d.apex.y + Math.sin(a) * R });
      }
      return pts;
    }
    case "line": {
      const d = direction(pl);
      if (!d) return null;
      const half = (LINE_WIDTH_FEET * pl.ppf) / 2;
      const nx = -d.dir.y * half;
      const ny = d.dir.x * half;
      const end = { x: d.apex.x + d.dir.x * R, y: d.apex.y + d.dir.y * R };
      return [
        { x: d.apex.x + nx, y: d.apex.y + ny },
        { x: end.x + nx, y: end.y + ny },
        { x: end.x - nx, y: end.y - ny },
        { x: d.apex.x - nx, y: d.apex.y - ny },
      ];
    }
  }
}

/** Pontos de teste de um token: centro, cantos e meio das bordas. */
function samples(r: Rect): Pt[] {
  const xs = [r.x, r.x + r.w / 2, r.x + r.w];
  const ys = [r.y, r.y + r.h / 2, r.y + r.h];
  return xs.flatMap((x) => ys.map((y) => ({ x, y })));
}

/** O token (retângulo) está dentro da área? */
export function hits(pl: Placement, token: Rect): boolean {
  const R = pl.area.feet * pl.ppf;
  switch (pl.area.kind) {
    // Tocar só a borda não conta: um token que começa exatamente a R pés está fora da área
    // (na grade, a área de 10 pés cobre 2 casas; a 3ª casa já é de fora).
    case "burst":
      return distPointRect(pl.pointer, token) < R - EDGE;
    case "emanation": {
      if (!pl.caster) return false;
      // A emanação é um quadrado em volta do conjurador (mesma forma que se desenha), não um círculo.
      const c = pl.caster;
      const gapX = Math.max(c.x - (token.x + token.w), 0, token.x - (c.x + c.w));
      const gapY = Math.max(c.y - (token.y + token.h), 0, token.y - (c.y + c.h));
      return Math.max(gapX, gapY) < R - EDGE;
    }
    case "cone": {
      const d = direction(pl);
      if (!d) return false;
      const base = Math.atan2(d.dir.y, d.dir.x);
      return samples(token).some((p) => {
        const dx = p.x - d.apex.x;
        const dy = p.y - d.apex.y;
        const dist = Math.hypot(dx, dy);
        if (dist > R) return false;
        if (dist < 1e-6) return true;
        let diff = Math.atan2(dy, dx) - base;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return Math.abs(diff) <= CONE_HALF + 1e-9;
      });
    }
    case "line": {
      const d = direction(pl);
      if (!d) return false;
      const half = (LINE_WIDTH_FEET * pl.ppf) / 2;
      const inside = (p: Pt) => {
        const dx = p.x - d.apex.x;
        const dy = p.y - d.apex.y;
        const u = dx * d.dir.x + dy * d.dir.y;
        const v = -dx * d.dir.y + dy * d.dir.x;
        return u >= 0 && u <= R && Math.abs(v) <= half;
      };
      if (samples(token).some(inside)) return true;
      // Token maior que a faixa: confere pontos ao longo do eixo da linha.
      const steps = Math.max(2, Math.ceil(R / Math.max(1, pl.ppf)));
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * R;
        const p = { x: d.apex.x + d.dir.x * t, y: d.apex.y + d.dir.y * t };
        if (p.x >= token.x && p.x <= token.x + token.w && p.y >= token.y && p.y <= token.y + token.h) {
          return true;
        }
      }
      return false;
    }
  }
}
