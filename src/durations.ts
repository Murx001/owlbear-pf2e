/**
 * Durações das condições aplicadas por magias.
 *
 * O Foundry traz o efeito de cada grau como texto ("Blinded for 1 round", "Fleeing for 1 round").
 * Lemos esse texto, guardamos quanto tempo cada condição dura e, na aba Combate, contamos as
 * rodadas e removemos a condição sozinhos quando acaba. Durações longas (horas, descanso) só
 * ficam como rótulo: não dá para contar em combate.
 */

export type DurMode =
  /** Acaba no início do turno de quem lançou, depois de N turnos dele (padrão do PF2e). */
  | "source-start"
  /** Sem conjurador no combate: conta no início do turno de quem sofre o efeito. */
  | "self-start"
  /** Acaba no fim do turno de quem sofre o efeito ("até o fim do próximo turno dele"). */
  | "self-end"
  /** Não contamos (horas, descanso): só aparece como rótulo. */
  | "none";

/** O que o texto da magia diz, antes de saber quem lançou. */
export interface DurationSpec {
  mode: Exclude<DurMode, "self-start">;
  rounds: number;
  /** Texto curto em PT-BR para mostrar ("1 rodada", "1 minuto"). */
  text: string;
}

/** Duração de uma condição já aplicada a alguém. */
export interface ConditionDuration {
  mode: DurMode;
  /** Turnos que faltam (em rodadas). */
  remaining: number;
  /** Quem lançou (id do combatente), para contar nos turnos dele. */
  sourceId?: string;
  text: string;
}

export type Durations = Record<string, ConditionDuration>;

/* ---------- leitura do texto ---------- */
const MARKER = /⟦([a-z-]+)\|(\d+)⟧/g;

interface Phrase {
  index: number;
  spec: DurationSpec;
}

const PHRASES: { re: RegExp; make: (m: RegExpExecArray) => DurationSpec }[] = [
  {
    re: /\bfor (\d+) rounds?\b/gi,
    make: (m) => ({ mode: "source-start", rounds: +m[1], text: `${m[1]} rodada${+m[1] > 1 ? "s" : ""}` }),
  },
  {
    re: /\bfor (\d+) minutes?\b/gi,
    make: (m) => ({
      mode: "source-start",
      rounds: +m[1] * 10,
      text: `${m[1]} minuto${+m[1] > 1 ? "s" : ""}`,
    }),
  },
  {
    re: /\bfor (\d+) hours?\b/gi,
    make: (m) => ({ mode: "none", rounds: 0, text: `${m[1]} hora${+m[1] > 1 ? "s" : ""}` }),
  },
  {
    re: /\buntil the (?:start|beginning) of your next turn\b/gi,
    make: () => ({ mode: "source-start", rounds: 1, text: "até seu próximo turno" }),
  },
  {
    re: /\buntil the end of (?:its|the target'?s|the creature'?s|their|his|her) next turn\b/gi,
    make: () => ({ mode: "self-end", rounds: 1, text: "até o fim do próximo turno" }),
  },
  {
    re: /\buntil (?:the next time you make your daily preparations|your next daily preparations)\b/gi,
    make: () => ({ mode: "none", rounds: 0, text: "até o descanso" }),
  },
];

/**
 * Recebe o texto de um grau de sucesso já com as condições marcadas como `⟦chave|valor⟧` e devolve
 * a duração de cada uma. A duração de uma condição é a frase de tempo que vem depois dela na mesma
 * frase, sem outra condição no meio ("Frightened 3 and Fleeing for 1 round": só a Fugindo tem tempo).
 */
export function parseConditionDurations(flat: string): Map<string, DurationSpec> {
  const phrases: Phrase[] = [];
  for (const { re, make } of PHRASES) {
    re.lastIndex = 0;
    for (let m = re.exec(flat); m; m = re.exec(flat)) phrases.push({ index: m.index, spec: make(m) });
  }
  const markers = [...flat.matchAll(MARKER)].map((m) => ({ key: m[1], index: m.index! }));
  const out = new Map<string, DurationSpec>();

  // Fim da frase = próximo ponto ou ponto e vírgula depois de `from`.
  const sentenceEnd = (from: number) => {
    const rest = flat.slice(from);
    const i = rest.search(/[.;]/);
    return i === -1 ? flat.length : from + i;
  };
  const sentenceStart = (from: number) => {
    const head = flat.slice(0, from);
    const i = Math.max(head.lastIndexOf("."), head.lastIndexOf(";"));
    return i === -1 ? 0 : i + 1;
  };

  markers.forEach((mk, i) => {
    const nextMarker = markers[i + 1]?.index ?? Infinity;
    const end = sentenceEnd(mk.index);
    // 1º: frase de tempo depois da condição, antes da próxima condição e da pontuação.
    let pick = phrases
      .filter((p) => p.index > mk.index && p.index < end && p.index < nextMarker)
      .sort((a, b) => a.index - b.index)[0];
    // 2º: "For 1 round, the target is Stunned 1": frase de tempo antes, na mesma frase.
    if (!pick) {
      const start = sentenceStart(mk.index);
      const prevMarker = markers[i - 1]?.index ?? -1;
      pick = phrases
        .filter((p) => p.index >= start && p.index < mk.index && p.index > prevMarker)
        .sort((a, b) => b.index - a.index)[0];
    }
    if (pick) {
      const had = out.get(mk.key);
      if (!had || pick.spec.rounds > had.rounds) out.set(mk.key, pick.spec);
    }
  });
  return out;
}

/* ---------- aplicar ---------- */

/** Converte o que o texto diz numa duração concreta; reaplicar mantém o maior tempo restante. */
export function toDuration(
  spec: DurationSpec,
  sourceId: string | undefined,
  existing?: ConditionDuration,
): ConditionDuration {
  const fresh: ConditionDuration =
    spec.mode === "none"
      ? { mode: "none", remaining: 0, text: spec.text }
      : {
          mode: spec.mode === "source-start" && !sourceId ? "self-start" : spec.mode,
          remaining: spec.rounds,
          sourceId: spec.mode === "source-start" ? sourceId : undefined,
          text: spec.text,
        };
  if (!existing || existing.mode === "none") return fresh;
  if (fresh.mode === "none") return existing;
  return fresh.remaining >= existing.remaining ? fresh : existing;
}

/** Tira as durações de condições que não existem mais (ao remover uma condição na mão). */
export function pruneDurations(
  conditions: Record<string, number>,
  durations: Durations | undefined,
): Durations | undefined {
  if (!durations) return undefined;
  const kept = Object.fromEntries(Object.entries(durations).filter(([k]) => (conditions[k] ?? 0) > 0));
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/** "1 rodada", "2 rodadas restantes", "até o descanso": rótulo curto para fichinhas e tags. */
export function durationLabel(d: ConditionDuration | undefined): string {
  if (!d) return "";
  if (d.mode === "none") return d.text;
  return `${d.remaining} rd`;
}

/* ---------- contagem no combate ---------- */
export interface DurationHost {
  /** Id do combatente: ID do Pathbuilder (jogador) ou da criatura. */
  id: string;
  name: string;
  conditions: Record<string, number>;
  durations?: Durations;
}

export interface TickEvent {
  type: "start" | "end";
  /** Combatente cujo turno começa ou termina. */
  id: string;
}

export interface TickResult {
  host: DurationHost;
  /** Condições que acabaram agora. */
  expired: string[];
}

/**
 * Conta um turno. Início do turno: gasta 1 das condições lançadas por esse combatente
 * ("source-start") e das de quem não tem conjurador no combate ("self-start"). Fim do turno:
 * gasta 1 das condições "self-end" de quem terminou o turno. Devolve só quem mudou.
 */
export function tickDurations(
  hosts: DurationHost[],
  ev: TickEvent,
  inCombat: Set<string>,
): TickResult[] {
  const results: TickResult[] = [];
  for (const h of hosts) {
    if (!h.durations) continue;
    const durations: Durations = { ...h.durations };
    const conditions = { ...h.conditions };
    const expired: string[] = [];
    let changed = false;

    for (const [key, d] of Object.entries(h.durations)) {
      if (d.mode === "none") continue;
      let counts = false;
      if (ev.type === "start") {
        if (d.mode === "source-start") {
          // Se quem lançou não está no combate, conta no turno de quem sofre o efeito.
          counts = d.sourceId === ev.id || (!!d.sourceId && !inCombat.has(d.sourceId) && h.id === ev.id);
        } else if (d.mode === "self-start") counts = h.id === ev.id;
      } else if (d.mode === "self-end") counts = h.id === ev.id;
      if (!counts) continue;

      changed = true;
      const remaining = d.remaining - 1;
      if (remaining <= 0) {
        delete durations[key];
        delete conditions[key];
        expired.push(key);
      } else durations[key] = { ...d, remaining };
    }
    if (changed) {
      results.push({
        host: { ...h, conditions, durations: Object.keys(durations).length > 0 ? durations : undefined },
        expired,
      });
    }
  }
  return results;
}
