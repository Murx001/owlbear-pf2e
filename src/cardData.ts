import type { AttackResult } from "./attack";
import type { RollMessage } from "./roll";
import type { SpellCast, SpellTargetResult } from "./saveSpell";
import type { SpellData } from "./spellData";

/** Id do popover do cartão (no centro da tela). */
export const CARD_POPOVER = "com.owlbear-pf2e/card";

/** Mensagem que faz um cartão aparecer na tela de todos na sala ("Mostrar a todos"). */
export const CARD_SHARE = "pf2e.dice/card-share";

/** O cartão da magia pede ao painel principal para conjurá-la (clique em "Conjurar"). */
export const CAST_REQ = "pf2e.dice/cast-request";

/** O que o botão "Conjurar" do cartão da magia deve fazer no painel. */
export interface CastAction {
  mode: "spell" | "focus" | "focusCantrip";
  name: string;
  /** 0 = truque. */
  rank: number;
  slotTotal: number;
}

/**
 * Um único cartão para tudo que se rola ou se consulta: ataques, magias, testes (perícias,
 * salvaguardas, iniciativa, dados avulsos) e "o que esta magia faz".
 */
export type CardData = (
  | { kind: "attack"; result: AttackResult; nextPenalty: number }
  | {
      kind: "spell";
      cast: SpellCast;
      mode: "save" | "auto" | "heal" | "temp";
      rolled: number | null;
      results: SpellTargetResult[];
      offline: boolean;
    }
  | { kind: "check"; msg: RollMessage }
  | {
      kind: "spellinfo";
      name: string;
      rank: number;
      /** `null` se não achamos as regras da magia. */
      spell: SpellData | null;
      /** Presente só no cartão aberto por quem vai conjurar: mostra o botão Conjurar. */
      cast?: CastAction;
      /** Descrição já traduzida (PT-BR) por quem mostrou: aparece traduzida para todos. */
      translated?: string[];
    }
) & {
  /** Preenchido quando outra pessoa mostrou este cartão a todos. */
  sharedBy?: string;
};
