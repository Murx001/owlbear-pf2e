/**
 * Tradução EN→PT-BR de textos de regras (descrição de magias e habilidades) pelo serviço gratuito
 * MyMemory. Termos do sistema são trocados por PT antes de enviar, e o resultado fica em cache no
 * navegador para o mesmo texto não ser traduzido duas vezes.
 */
const ENDPOINT = "https://api.mymemory.translated.net/get";
const CACHE_KEY = "pf2e.translate.cache";
const MAX_CHUNK = 450; // o serviço aceita ~500 bytes por pedido

/** Termos de regra que o tradutor automático costuma errar. Ordem: do mais longo ao mais curto. */
export const GLOSSARY: [RegExp, string][] = [
  [/\boff-guard\b/gi, "desprevenido"],
  [/\bflat-footed\b/gi, "desprevenido"],
  [/\bsaving throw\b/gi, "salvaguarda"],
  [/\bbasic saving throw\b/gi, "salvaguarda básica"],
  [/\bcritical success\b/gi, "sucesso crítico"],
  [/\bcritical failure\b/gi, "falha crítica"],
  [/\bcritically succeed(s)?\b/gi, "obtém sucesso crítico"],
  [/\bsuccess\b/gi, "sucesso"],
  [/\bfailure\b/gi, "falha"],
  [/\bfrightened\b/gi, "amedrontado"],
  [/\bclumsy\b/gi, "desajeitado"],
  [/\bflat check\b/gi, "teste simples"],
  [/\bhit points\b/gi, "pontos de vida"],
  [/\btemporary Hit Points\b/gi, "PV temporários"],
  [/\bcircumstance bonus\b/gi, "bônus de circunstância"],
  [/\bstatus bonus\b/gi, "bônus de estado"],
  [/\bitem bonus\b/gi, "bônus de item"],
  [/\bspell attack\b/gi, "ataque de magia"],
  [/\bDC\b/g, "CD"],
  [/\bAC\b/g, "CA"],
  [/\bfeet\b/gi, "pés"],
  [/\bround(s)?\b/gi, "rodada$1"],
];

const apply = (text: string) => GLOSSARY.reduce((t, [re, pt]) => t.replace(re, pt), text);

function readCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(key: string, value: string) {
  try {
    const all = readCache();
    all[key] = value;
    const keys = Object.keys(all);
    // Evita crescer sem fim: guarda os últimos 200 textos.
    for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete all[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* cache é opcional */
  }
}

/** Divide em pedaços de até `MAX_CHUNK` caracteres, em fim de frase quando der. */
export function chunk(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if ((cur + " " + s).trim().length > MAX_CHUNK && cur) {
      out.push(cur.trim());
      cur = "";
    }
    let rest = s;
    while (rest.length > MAX_CHUNK) {
      out.push(rest.slice(0, MAX_CHUNK));
      rest = rest.slice(MAX_CHUNK);
    }
    cur = `${cur} ${rest}`;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function remote(piece: string): Promise<string> {
  const res = await fetch(`${ENDPOINT}?q=${encodeURIComponent(piece)}&langpair=en|pt-br`);
  if (!res.ok) throw new Error(`o serviço de tradução respondeu ${res.status}`);
  const j = await res.json();
  const out = j?.responseData?.translatedText;
  if (typeof out !== "string" || !out) throw new Error("o serviço de tradução não devolveu texto");
  // Limite diário do serviço: ele devolve um aviso no lugar do texto.
  if (/MYMEMORY WARNING/i.test(out)) throw new Error("limite diário do serviço de tradução atingido");
  return out;
}

/** Traduz um parágrafo (ou vários) para PT-BR. Lança erro legível se o serviço falhar. */
export async function translate(text: string): Promise<string> {
  const key = text.trim();
  if (!key) return "";
  const cached = readCache()[key];
  if (cached) return cached;
  const parts: string[] = [];
  for (const piece of chunk(apply(key))) parts.push(await remote(piece));
  const result = parts.join(" ");
  writeCache(key, result);
  return result;
}
