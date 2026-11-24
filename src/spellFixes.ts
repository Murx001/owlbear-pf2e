import { asset } from "./assets";
import { slugify } from "./spellData";

/**
 * Correções de dano de magia mantidas no repositório (public/spell-fixes/). Só entram as magias em que o
 * Foundry não basta (dano que muda com as ações gastas, por exemplo). Um índice pequeno diz quais existem;
 * cada magia tem o próprio arquivo, buscado só quando a ficha usa a magia, e guardado no navegador.
 *
 * Arquivo de uma magia: { "name": "Force Barrage", "formulas": { "2@1": "1d4+1 force; 1d4+1 force", "3": "…" } }
 * Chaves: "ações@rank" (mais específica), "ações" (qualquer rank) ou "*" (qualquer ação e rank).
 */

const INDEX_KEY = "pf2e.spell-fixes.index";
const DATA_KEY = "pf2e.spell-fixes.data";
const TIMEOUT_MS = 4000;

interface Index {
  version: number;
  spells: string[];
}
interface Entry {
  name: string;
  formulas: Record<string, string>;
  note?: string;
}
interface Store {
  version: number;
  entries: Record<string, Entry>;
}

const read = <T>(key: string): T | undefined => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
};

async function getJson<T>(path: string): Promise<T | undefined> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(asset(path), { signal: ctl.signal, cache: "no-cache" });
    if (!res.ok) return undefined;
    return (await res.json()) as T;
  } catch {
    return undefined; // sem rede ou lento demais: segue com o que está guardado
  } finally {
    clearTimeout(timer);
  }
}

let indexPromise: Promise<Index | undefined> | undefined;

/** Índice das magias com correção; se a rede falhar, usa o último guardado. */
function loadIndex(): Promise<Index | undefined> {
  indexPromise ??= getJson<Index>("spell-fixes/index.json").then((fresh) => {
    if (fresh && Array.isArray(fresh.spells)) {
      write(INDEX_KEY, fresh);
      return fresh;
    }
    return read<Index>(INDEX_KEY);
  });
  return indexPromise;
}

/**
 * Garante no navegador as correções das magias dadas. Só baixa as que estão no índice e ainda não foram
 * guardadas (ou cuja versão do índice mudou). Nunca lança: falha de rede não atrapalha a conjuração.
 */
export async function prefetchFixes(names: string[]): Promise<void> {
  try {
    const index = await loadIndex();
    if (!index) return;
    let store = read<Store>(DATA_KEY);
    if (!store || store.version !== index.version) store = { version: index.version, entries: {} };
    const wanted = [...new Set(names.map(slugify))].filter((s) => index.spells.includes(s) && !store!.entries[s]);
    if (wanted.length === 0) return;
    const got = await Promise.all(wanted.map((s) => getJson<Entry>(`spell-fixes/${s}.json`)));
    wanted.forEach((s, i) => {
      const e = got[i];
      if (e && e.formulas && typeof e.formulas === "object") store!.entries[s] = e;
    });
    write(DATA_KEY, store);
  } catch {
    /* ignora */
  }
}

/** Fórmula do repositório para esta magia, ações e rank; `undefined` se não há correção. */
export function fixFormula(spellName: string, rank: number, actions: number): string | undefined {
  const e = read<Store>(DATA_KEY)?.entries[slugify(spellName)];
  if (!e) return undefined;
  return e.formulas[`${actions}@${rank}`] ?? e.formulas[String(actions)] ?? e.formulas["*"];
}

/** Texto pronto para colar no arquivo do repositório, quando o jogador sugere uma correção. */
export function suggestionText(spellName: string, rank: number, actions: number, formula: string): string {
  return JSON.stringify({ name: spellName, key: `${actions}@${rank}`, formula });
}
