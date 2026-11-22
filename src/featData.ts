/**
 * Talentos e características (classe, ancestralidade, herança) do foundryvtt/pf2e: a descrição em
 * inglês, ações, traços e pré-requisitos. Busca só quando o jogador abre o item, com cache.
 */
import { actionLabel, paragraphs, slugify } from "./spellData";

const RAW = "https://raw.githubusercontent.com/foundryvtt/pf2e/HEAD/packs/pf2e";

export interface FeatInfo {
  name: string;
  level?: number;
  /** "◆ (1 ação)", "↺ reação"… vazio para passivos. */
  actions: string;
  traits: string[];
  prerequisites: string[];
  description: string[];
}

export interface FeatContext {
  className: string;
  ancestry: string;
  heritage: string;
}

/** Tipo do Pathbuilder ("Class Feat") ou "special" para o que vem de `specials`. */
export type FeatKind = string;

const sans = (name: string) => name.replace(/\([^)]*\)/g, "").trim();

/** Caminhos possíveis (em ordem de preferência) para um talento/característica. */
export function featCandidates(name: string, kind: FeatKind, level: number, ctx: FeatContext): string[] {
  const slug = slugify(sans(name));
  const full = slugify(name);
  const cls = slugify(ctx.className);
  const anc = slugify(ctx.ancestry);
  const her = slugify(ctx.heritage);
  const levels = Array.from({ length: Math.max(1, level) }, (_, i) => Math.max(1, level) - i); // do nível pego para baixo
  const lv = (dir: string) => levels.map((l) => `feats/${dir}/level-${l}/${slug}`);
  const out: string[] = [];
  switch (kind) {
    case "Class Feat":
      out.push(...lv(`class/${cls}`));
      break;
    case "Ancestry Feat":
      out.push(...lv(`ancestry/${anc}`));
      break;
    case "Skill Feat":
      out.push(...lv("skill"), ...lv("general"));
      break;
    case "General Feat":
      out.push(...lv("general"), ...lv("skill"));
      break;
    case "Heritage":
      out.push(`heritages/${anc}/${slug}`, `heritages/${slug}`, `heritages/${anc}/${full}`);
      break;
    default:
      // características (specials), talentos concedidos etc.
      out.push(
        // "Blood Fascination" no Pathbuilder é só "blood" no Foundry (pasta da classe).
        ...(/ fascination$/i.test(sans(name)) ? [`class-features/${cls}/${slugify(sans(name).replace(/ fascination$/i, ""))}`] : []),
        `class-features/${cls}/${slug}`,
        `class-features/${slug}`,
        `ancestry-features/${anc}/${slug}`,
        `ancestry-features/${slug}`,
        `heritages/${anc}/${slug}`,
        `heritages/${her}/${slug}`,
        `heritages/${slug}`,
        `actions/${slug}`,
        ...lv(`class/${cls}`),
        ...lv(`ancestry/${anc}`),
        ...lv("general"),
        ...lv("skill"),
      );
  }
  return [...new Set(out)];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseFeat(json: any): FeatInfo {
  const sys = json.system ?? {};
  const type = sys.actionType?.value;
  const n = sys.actions?.value;
  const actions = type === "reaction" ? actionLabel("reaction") : type === "free" ? actionLabel("free") : n ? actionLabel(String(n)) : "";
  const pre = (Array.isArray(sys.prerequisites?.value) ? sys.prerequisites.value : [])
    .map((p: any) => String(p?.value ?? ""))
    .filter(Boolean);
  return {
    name: String(json.name ?? ""),
    level: typeof sys.level?.value === "number" ? sys.level.value : undefined,
    actions,
    traits: Array.isArray(sys.traits?.value) ? sys.traits.value : [],
    prerequisites: pre,
    description: paragraphs(String(sys.description?.value ?? "")),
  };
}

/** Sentidos comuns que o Foundry não tem como item (vêm da ancestralidade). */
const BUILTIN: Record<string, string> = {
  darkvision: "You can see in darkness and dim light just as well as you can see in bright light, though your vision in darkness is in black and white.",
  "low-light-vision": "You can see in dim light as though it were bright light, so you ignore the concealed condition due to dim light.",
};

const memory = new Map<string, FeatInfo | null>();

const cacheKey = (name: string, kind: string, ctx: FeatContext) =>
  `pf2e.feat1:${slugify(name)}:${slugify(kind)}:${slugify(ctx.className)}:${slugify(ctx.ancestry)}`;

/** Busca no Foundry (todos os caminhos ao mesmo tempo; vale o primeiro na ordem). `null` se não achar. */
export async function fetchFeat(
  name: string,
  kind: FeatKind,
  level: number,
  ctx: FeatContext,
): Promise<FeatInfo | null> {
  const key = cacheKey(name, kind, ctx);
  if (memory.has(key)) return memory.get(key)!;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const v = JSON.parse(raw) as FeatInfo;
      memory.set(key, v);
      return v;
    }
  } catch {
    /* sem cache */
  }
  const builtin = BUILTIN[slugify(sans(name))];
  if (builtin) return { name: sans(name), actions: "", traits: [], prerequisites: [], description: [builtin] };
  const urls = featCandidates(name, kind, level, ctx).map((p) => `${RAW}/${p}.json`);
  const found = await Promise.all(
    urls.map((u) =>
      fetch(u)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
  );
  const hit = found.find((j) => j && j.system);
  const info = hit ? parseFeat(hit) : null;
  memory.set(key, info);
  if (info) {
    try {
      localStorage.setItem(key, JSON.stringify(info));
    } catch {
      /* ok */
    }
  }
  return info;
}

/** Busca no Archives of Nethys, para quando o Foundry não tem o item. */
export const aonSearch = (name: string) => `https://2e.aonprd.com/Search.aspx?q=${encodeURIComponent(sans(name))}`;
