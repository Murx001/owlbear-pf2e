import {
  applyBackup,
  lastBackupAt,
  makeBackup,
  markBackupDone,
  parseBackup,
  saveCreatures,
  creatureAc,
  creaturePerception,
  creatureSave,
  damageCreature,
  isInstance,
  loadCreatures,
  makeInstances,
  removeCreature,
  statusOf,
  publicLink,
  showOf,
  upsertCreature,
  type Creature,
} from "./creatures";
import OBR from "@owlbear-rodeo/sdk";
import {
  NO_GROUP,
  allGroups,
  allTraits,
  duplicateCreature,
  filterTemplates,
  findFoundryCreature,
  groupOf,
  importFoundryEntry,
  loadFoundryIndex,
  searchFoundry,
  type BestiaryFilter,
  type FoundryEntry,
} from "./bestiary";
import { addCombatant, loadCombat, saveCombat } from "./combat";
import { COND_BY_KEY } from "./conditions";
import { durationLabel, pruneDurations } from "./durations";
import { showCard } from "./cardView";
import { publishRoll, signed } from "./roll";
import {
  CREATURE_KEY,
  creatureOfToken,
  isCreatureLink,
  linkCreatureTokens,
  selectedTokenIds,
  unlinkCreatureEverywhere,
  type CreatureLink,
} from "./token";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, onClick: () => void | Promise<void>, cls?: string) {
  const b = el("button", cls, text);
  b.type = "button";
  b.addEventListener("click", () => void onClick());
  return b;
}

/** Botão dentro de um <summary>: não pode abrir/fechar o cartão ao ser tocado. */
function summaryButton(text: string, onClick: () => void | Promise<void>, cls?: string) {
  const b = el("button", cls, text);
  b.type = "button";
  b.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    void onClick();
  });
  return b;
}

const FIELDS: { key: keyof Creature; label: string; type: "text" | "number" }[] = [
  { key: "name", label: "Nome", type: "text" },
  { key: "level", label: "Nível", type: "number" },
  { key: "ac", label: "CA", type: "number" },
  { key: "hpMax", label: "PV", type: "number" },
  { key: "fort", label: "Fort.", type: "number" },
  { key: "ref", label: "Ref.", type: "number" },
  { key: "will", label: "Vont.", type: "number" },
  { key: "perception", label: "Percep.", type: "number" },
  { key: "speed", label: "Desl. (pés)", type: "number" },
];

const byName = (a: Creature, b: Creature) =>
  a.name.localeCompare(b.name, "pt-BR", { numeric: true });

/**
 * Bestiário e aba do mestre. Cada **modelo** (ficha da criatura) pode ser ligado a vários tokens:
 * cada token ganha a sua própria **instância**, com PV e condições próprios, resolvida
 * separadamente. Os modelos podem ser buscados, filtrados, agrupados em pastas, marcados como
 * favoritos, duplicados e importados do Foundry. Os dados ficam só neste navegador.
 */
export function initCreatures(root: HTMLElement) {
  let editing: Creature | null = null;
  let message = "";
  let showForm = false;
  let showImport = false;
  const view: BestiaryFilter = { text: "", group: "", trait: "", favorites: false, sort: "name" };
  const openCards = new Set<string>(); // modelos com a ficha aberta
  const closedGroups = new Set<string>(); // pastas fechadas
  const openSheets = new Set<string>(); // instâncias com a ficha completa aberta

  const say = (text: string) => {
    message = text;
    render();
  };

  /* ---------- formulário do modelo ---------- */
  function form(): HTMLElement | null {
    if (!showForm && !editing) return null;
    const box = el("section", "block");
    box.append(el("h4", undefined, editing ? `Editando ${editing.name}` : "Nova criatura"));

    const inputs = new Map<keyof Creature, HTMLInputElement>();
    const grid = el("div", "fields wrap");
    for (const f of FIELDS) {
      const label = el("label", undefined, f.label);
      const input = el("input");
      input.type = f.type;
      if (f.type === "number") input.inputMode = "numeric";
      const v = editing ? editing[f.key] : "";
      input.value = v === undefined ? "" : String(v);
      inputs.set(f.key, input);
      label.append(input);
      grid.append(label);
    }

    const groups = allGroups(loadCreatures().filter((c) => !isInstance(c)));
    const list = el("datalist");
    list.id = "bestiary-groups";
    for (const g of groups) if (g !== NO_GROUP) list.append(new Option(g));
    const group = el("input");
    group.placeholder = "Pasta / grupo (ex.: Estrada do Norte)";
    group.setAttribute("list", "bestiary-groups");
    group.value = editing?.group ?? "";
    const traits = el("input");
    traits.placeholder = "Traços, separados por vírgula (ex.: undead, skeleton)";
    traits.value = (editing?.traits ?? []).join(", ");
    const notes = el("input");
    notes.placeholder = "Notas (opcional)";
    notes.value = editing?.notes ?? "";

    const save = button(editing ? "Salvar alterações" : "Cadastrar", () => {
      const num = (k: keyof Creature) => parseInt(inputs.get(k)!.value, 10);
      const name = inputs.get("name")!.value.trim();
      const ac = num("ac");
      const hpMax = num("hpMax");
      if (!name || !Number.isFinite(ac) || !Number.isFinite(hpMax) || hpMax <= 0) {
        return say("Informe pelo menos nome, CA e PV (maior que zero).");
      }
      const or0 = (n: number) => (Number.isFinite(n) ? n : 0);
      const level = num("level");
      const speed = num("speed");
      const c: Creature = {
        ...(editing ?? {}), // mantém ataques, defesas e origem de uma criatura importada
        id: editing?.id ?? `cr-${crypto.randomUUID()}`,
        name,
        ac,
        hpMax,
        hp: hpMax,
        temp: 0,
        fort: or0(num("fort")),
        ref: or0(num("ref")),
        will: or0(num("will")),
        perception: or0(num("perception")),
        notes: notes.value.trim(),
        level: Number.isFinite(level) ? level : undefined,
        speed: Number.isFinite(speed) && speed > 0 ? speed : undefined,
        group: group.value.trim() || undefined,
        traits: traits.value
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      };
      upsertCreature(c);
      openCards.add(c.id);
      editing = null;
      showForm = false;
      say(`${c.name} salva. Instâncias já criadas não mudam.`);
    });
    const row = el("div", "import");
    row.append(save);
    row.append(
      button("Cancelar", () => {
        editing = null;
        showForm = false;
        render();
      }),
    );
    box.append(grid, group, list, traits, notes, row);
    return box;
  }

  /* ---------- importar do Foundry ---------- */
  function importBox(): HTMLElement | null {
    if (!showImport) return null;
    const box = el("section", "block");
    box.append(
      el("h4", undefined, "Importar do Foundry"),
      el(
        "p",
        "sub",
        "Pesquise pelo nome em inglês (ex.: goblin, skeleton, wolf) e toque no resultado para adicionar. Traz nível, CA, PV, salvaguardas, Percepção, traços, ataques e defesas.",
      ),
    );
    const name = el("input");
    name.placeholder = "Nome da criatura em inglês";
    const go = button("Buscar e adicionar", async () => {
      const wanted = name.value.trim();
      if (!wanted) return;
      message = `Buscando ${wanted}…`;
      go.disabled = true;
      const found = await findFoundryCreature(wanted, () => `cr-${crypto.randomUUID()}`);
      if (!found) {
        return say(
          `Não achei "${wanted}" nos pacotes do Foundry. Confira o nome em inglês (por exemplo "Giant Rat").`,
        );
      }
      const c = found.creature;
      upsertCreature(c);
      openCards.add(c.id);
      showImport = false;
      say(`${c.name} importado (${found.pack}): nível ${c.level}, CA ${c.ac}, PV ${c.hpMax}. Pasta: ${c.group}.`);
    });
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go.click();
    });
    const row = el("div", "import");
    row.append(name, go);
    box.append(row);

    // Pesquisa: ao digitar, lista as criaturas dos pacotes (a lista é baixada uma vez e guardada).
    const results = el("div", "import-results");
    const hint = el("p", "sub", "Carregando a lista de criaturas do Foundry…");
    results.append(hint);
    box.append(results);
    let index: FoundryEntry[] | null = null;
    const show = () => {
      results.replaceChildren();
      const q = name.value.trim();
      if (!index) return results.append(hint);
      if (!q) return results.append(el("p", "sub", `${index.length} criaturas disponíveis. Digite para pesquisar (em inglês).`));
      const found = searchFoundry(index, q);
      if (found.length === 0) return results.append(el("p", "sub", "Nada encontrado. Tente outra palavra (em inglês)."));
      for (const e of found) {
        const b = el("button", "result");
        b.type = "button";
        b.append(el("strong", undefined, e.name), el("span", "sub", ` · ${e.label}`));
        b.addEventListener("click", async () => {
          b.disabled = true;
          try {
            const c = await importFoundryEntry(e, () => `cr-${crypto.randomUUID()}`);
            upsertCreature(c);
            openCards.add(c.id);
            showImport = false;
            say(`${c.name} importado (${e.label}): nível ${c.level}, CA ${c.ac}, PV ${c.hpMax}. Pasta: ${c.group}.`);
          } catch (err) {
            b.disabled = false;
            say(err instanceof Error ? err.message : "Não foi possível importar.");
          }
        });
        results.append(b);
      }
    };
    name.addEventListener("input", show);
    loadFoundryIndex().then(
      (list) => {
        index = list;
        show();
      },
      (err) => {
        hint.textContent = err instanceof Error ? err.message : "Não foi possível carregar a lista.";
      },
    );
    return box;
  }

  /* ---------- vincular a tokens ---------- */
  async function linkSelected(c: Creature) {
    try {
      const ids = await selectedTokenIds();
      if (ids.length === 0) return say("Selecione um ou mais tokens no mapa primeiro.");

      // Token que já era uma criatura é substituído pela nova instância.
      for (const id of ids) {
        const old = await creatureOfToken(id);
        if (old) removeCreature(old.id);
      }
      const made = makeInstances(c, loadCreatures(), ids);
      for (const inst of made) upsertCreature(inst);
      await linkCreatureTokens(
        made.map((inst) => {
          return {
            tokenId: inst.tokenId!,
            link: publicLink(inst),
          };
        }),
      );
      say(`${made.length} token(s) vinculado(s): ${made.map((m) => m.name).join(", ")}.`);
    } catch (e) {
      say(e instanceof Error ? e.message : "Não foi possível vincular.");
    }
  }

  /** Tudo sobre a criatura: traços, números, defesas, ataques, notas e origem. */
  function statBlock(c: Creature): HTMLElement {
    const body = el("div", "stat-block");
    if (c.traits?.length) {
      const chips = el("div", "traits");
      for (const t of c.traits) chips.append(el("span", "trait", t));
      body.append(chips);
    }
    const line = (label: string, text: string) => {
      const p = el("div", "sub");
      p.append(el("strong", undefined, `${label}: `), text);
      body.append(p);
    };
    line(
      "Números",
      `CA ${c.ac} · PV ${c.hpMax} · Fort ${signed(c.fort)} · Ref ${signed(c.ref)} · Vont ${signed(c.will)} · Percep. ${signed(c.perception)}${
        c.speed ? ` · Desl. ${c.speed} pés` : ""
      }${c.size ? ` · Tamanho ${c.size}` : ""}${c.level !== undefined ? ` · Nível ${c.level}` : ""}`,
    );
    if (c.immunities?.length) line("Imunidades", c.immunities.join(", "));
    if (c.resistances?.length) line("Resistências", c.resistances.join(", "));
    if (c.weaknesses?.length) line("Fraquezas", c.weaknesses.join(", "));
    for (const a of c.attacks ?? []) {
      line(
        "Ataque",
        `${a.name} ${signed(a.bonus)}${a.damage ? ` (${a.damage})` : ""}${a.traits.length ? ` [${a.traits.join(", ")}]` : ""}`,
      );
    }
    if (c.notes) line("Notas", c.notes);
    if (c.source) body.append(el("div", "sub", `Origem: ${c.source}`));
    return body;
  }

  /* ---------- modelo (ficha do bestiário) ---------- */
  function templateCard(c: Creature): HTMLElement {
    const d = el("details", "creature template");
    d.open = openCards.has(c.id);
    d.addEventListener("toggle", () => {
      if (d.open) openCards.add(c.id);
      else openCards.delete(c.id);
    });

    // Linha resumo: favorito, nome, nível, números e o botão de vincular.
    const sum = el("summary", "tpl-sum");
    const star = summaryButton(c.favorite ? "★" : "☆", () => {
      upsertCreature({ ...c, favorite: !c.favorite });
      render();
    }, "star");
    star.title = c.favorite ? "Tirar dos favoritos" : "Marcar como favorita";
    star.setAttribute("aria-label", star.title);
    const name = el("span", "tpl-name");
    name.append(
      el("strong", undefined, c.name),
      el("span", "sub", `${c.level !== undefined ? `Nv ${c.level} · ` : ""}CA ${c.ac} · PV ${c.hpMax}`),
    );
    sum.append(star, name, summaryButton("Vincular", () => linkSelected(c), "link"));
    d.append(sum);

    // Corpo: a ficha completa e as ações.
    const body = el("div", "tpl-body");
    body.append(statBlock(c));
    const actions = el("div", "import wrap");
    actions.append(
      button("Vincular aos tokens selecionados", () => linkSelected(c)),
      button("Editar", () => {
        editing = c;
        render();
      }),
      button("Duplicar", () => {
        const copy = duplicateCreature(c, `cr-${crypto.randomUUID()}`);
        upsertCreature(copy);
        openCards.add(copy.id);
        say(`Criada ${copy.name}. Use Editar para ajustar.`);
      }),
      button("Remover", () => {
        if (confirm(`Remover o modelo ${c.name}? As instâncias em jogo continuam.`)) {
          removeCreature(c.id);
          render();
        }
      }),
    );
    body.append(actions);
    d.append(body);
    return d;
  }

  /** Lista de modelos filtrada, agrupada por pasta. */
  function templateList(): HTMLElement {
    const all = loadCreatures().filter((c) => !isInstance(c));
    const shown = filterTemplates(all, view);
    const box = el("div", "bestiary-list");
    box.append(
      el(
        "p",
        "sub",
        all.length === 0
          ? "Nenhuma criatura no bestiário ainda. Use “Nova criatura” ou “Importar do Foundry”."
          : `${shown.length} de ${all.length} criatura(s)`,
      ),
    );

    const groups = new Map<string, Creature[]>();
    for (const c of shown) groups.set(groupOf(c), [...(groups.get(groupOf(c)) ?? []), c]);
    const names = [...groups.keys()].sort((a, b) =>
      a === NO_GROUP ? 1 : b === NO_GROUP ? -1 : a.localeCompare(b, "pt-BR"),
    );
    for (const g of names) {
      const det = el("details", "grp");
      det.open = !closedGroups.has(g);
      det.addEventListener("toggle", () => {
        if (det.open) closedGroups.delete(g);
        else closedGroups.add(g);
      });
      det.append(el("summary", "grp-sum", `${g} (${groups.get(g)!.length})`));
      const ul = el("ul", "creatures");
      for (const c of groups.get(g)!) {
        const li = el("li");
        li.append(templateCard(c));
        ul.append(li);
      }
      det.append(ul);
      box.append(det);
    }
    return box;
  }

  /** Busca e filtros. Digitar na busca só refaz a lista (o campo não perde o foco). */
  function toolbar(): HTMLElement {
    const box = el("section", "block");
    box.append(el("h4", undefined, "Bestiário"));
    const all = loadCreatures().filter((c) => !isInstance(c));

    let listEl: HTMLElement;
    const refreshList = () => {
      const fresh = templateList();
      listEl.replaceWith(fresh);
      listEl = fresh;
    };

    const search = el("input");
    search.type = "search";
    search.placeholder = "Buscar por nome, traço, pasta ou nota…";
    search.value = view.text;
    search.addEventListener("input", () => {
      view.text = search.value;
      refreshList();
    });

    const select = (label: string, options: [string, string][], current: string, set: (v: string) => void) => {
      const s = el("select");
      s.setAttribute("aria-label", label);
      for (const [v, t] of options) s.append(new Option(t, v, false, v === current));
      s.addEventListener("change", () => {
        set(s.value);
        refreshList();
      });
      return s;
    };
    const row = el("div", "import wrap");
    row.append(
      select("Ordenar", [["name", "Nome"], ["level", "Nível"]], view.sort, (v) => (view.sort = v as BestiaryFilter["sort"])),
      select("Pasta", [["", "Todas as pastas"], ...allGroups(all).map((g): [string, string] => [g, g])], view.group, (v) => (view.group = v)),
      select("Traço", [["", "Todos os traços"], ...allTraits(all).map((t): [string, string] => [t, t])], view.trait, (v) => (view.trait = v)),
    );
    const fav = el("button", view.favorites ? "fav on" : "fav", view.favorites ? "★ Favoritas" : "☆ Favoritas");
    fav.type = "button";
    fav.addEventListener("click", () => {
      view.favorites = !view.favorites;
      render();
    });
    row.append(fav);

    const actions = el("div", "import wrap");
    actions.append(
      button(showForm || editing ? "Fechar formulário" : "+ Nova criatura", () => {
        editing = null;
        showForm = !showForm;
        render();
      }),
      button(showImport ? "Fechar importação" : "Importar do Foundry", () => {
        showImport = !showImport;
        render();
      }),
    );

    listEl = templateList();
    box.append(search, row, actions, listEl);
    return box;
  }

  /* ---------- instância (um token) ---------- */
  const gearOpen = new Set<string>();

  /** Engrenagem: o que os jogadores enxergam desta criatura. */
  function visibilityPanel(c: Creature): HTMLElement {
    const box = el("div", "visibility");
    box.append(el("strong", undefined, "Visível aos jogadores"));
    const row = (label: string, key: keyof NonNullable<Creature["show"]>, apply?: (on: boolean) => Promise<void>) => {
      const lab = el("label", "manual-toggle");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = showOf(c)[key];
      cb.addEventListener("change", () => {
        upsertCreature({ ...c, show: { ...(c.show ?? {}), [key]: cb.checked } });
        void apply?.(cb.checked).catch((e) => say(e instanceof Error ? e.message : "Não foi possível mudar."));
        render();
      });
      lab.append(cb, " " + label);
      box.append(lab);
    };
    row("O token no mapa", "token", async (on) => {
      if (!c.tokenId) return;
      await OBR.scene.items.updateItems([c.tokenId], (items) => {
        for (const it of items) it.visible = on;
      });
    });
    row("O nome (desligado: \"Criatura\")", "name");
    row("A barra e o estado de PV (sem números)", "bar");
    row("Os PV em números", "numbers");
    row("A CA (escudinho no token)", "ac");
    row("As condições nas fichinhas", "conditions");
    return box;
  }

  function instanceCard(c: Creature): HTMLElement {
    const s = statusOf(c);
    const li = el("li", "creature");
    li.dataset.cid = c.id; // para achar o cartão ao tocar no token
    const ac = creatureAc(c);
    const head = el("div", "chead");
    head.append(
      el("strong", undefined, c.name),
      el(
        "span",
        "sub",
        `CA ${ac.value}${ac.penalty > 0 ? ` (base ${c.ac})` : ""} · PV ${c.hp}/${c.hpMax}${c.temp ? ` +${c.temp}` : ""} · ${s.label}`,
      ),
    );
    head.append(summaryButton("⚙", () => { gearOpen.has(c.id) ? gearOpen.delete(c.id) : gearOpen.add(c.id); render(); }, "gear"));
    li.append(head);
    if (gearOpen.has(c.id)) li.append(visibilityPanel(c));

    // Salvaguardas e Percepção já com as condições; o que mudou fica destacado.
    const eff = el("div", "sub");
    const part = (label: string, r: { value: number; penalty: number }) => {
      const sp = el("span", r.penalty > 0 ? "penalized" : undefined, `${label} ${signed(r.value)}`);
      eff.append(sp, " · ");
    };
    part("Fort", creatureSave(c, "fortitude"));
    part("Ref", creatureSave(c, "reflex"));
    part("Vont", creatureSave(c, "will"));
    part("Percep.", creaturePerception(c));
    eff.lastChild?.remove(); // tira o último " · "
    li.append(eff);

    const conds = Object.entries(c.conditions ?? {});
    if (conds.length > 0) {
      const chips = el("div", "chips");
      for (const [key, val] of conds) {
        const chip = el("span", "chip");
        chip.append(
          el(
            "span",
            undefined,
            `${COND_BY_KEY.get(key)?.pt ?? key}${val > 1 ? ` ${val}` : ""}${c.durations?.[key] ? ` · ${durationLabel(c.durations[key])}` : ""}`,
          ),
          button(
            "×",
            () => {
              const next = { ...(c.conditions ?? {}) };
              delete next[key];
              upsertCreature({ ...c, conditions: next, durations: pruneDurations(next, c.durations) });
              render();
            },
            "mini",
          ),
        );
        chips.append(chip);
      }
      li.append(chips);
    }

    const amount = el("input");
    amount.type = "number";
    amount.min = "0";
    amount.placeholder = "valor";
    const read = () => Math.max(0, parseInt(amount.value, 10) || 0);
    const hpRow = el("div", "import");
    hpRow.append(
      amount,
      button("Dano", () => {
        const n = read();
        if (!n) return;
        upsertCreature(damageCreature(c, n).creature);
        render();
      }),
      button("Cura", () => {
        const n = read();
        if (!n) return;
        upsertCreature({ ...c, hp: Math.min(c.hpMax, c.hp + n) });
        render();
      }),
      button("Temp.", () => {
        const n = read();
        if (!n) return;
        upsertCreature({ ...c, temp: Math.max(c.temp, n) });
        render();
      }),
    );

    const actions = el("div", "import wrap");
    actions.append(
      button("Iniciativa", async () => {
        const msg = await publishRoll({
          title: `Iniciativa (${c.name})`,
          count: 1,
          sides: 20,
          mod: creaturePerception(c).value, // com as condições
        });
        void showCard({ kind: "check", msg });
        await saveCombat(
          addCombatant(await loadCombat(), { id: c.id, name: c.name, value: msg.total }),
        );
      }),
      button("Ver no mapa", async () => {
        if (c.tokenId) await OBR.player.select([c.tokenId]);
      }),
      button("Remover", async () => {
        if (confirm(`Remover ${c.name}? O vínculo com o token também será desfeito.`)) {
          removeCreature(c.id);
          await unlinkCreatureEverywhere(c.id).catch(() => undefined);
          render();
        }
      }),
    );
    // Ficha completa (traços, defesas, ataques, notas), como a do bestiário.
    const sheet = el("details", "inst-sheet");
    sheet.open = openSheets.has(c.id);
    sheet.addEventListener("toggle", () => {
      if (sheet.open) openSheets.add(c.id);
      else openSheets.delete(c.id);
    });
    sheet.append(el("summary", "sub", "Ficha completa"), statBlock(c));
    li.append(hpRow, actions, sheet);
    return li;
  }

  /* ---------- backup ---------- */
  let backupText = ""; // texto do backup mostrado/colado na caixa (alternativa ao arquivo)

  function download(name: string, text: string) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function importText(text: string, mode: "merge" | "replace") {
    try {
      const { creatures, ignored } = parseBackup(text);
      const current = loadCreatures();
      if (mode === "replace") {
        const ok = confirm(
          `Substituir TODAS as ${current.length} criatura(s) atuais pelas ${creatures.length} do arquivo? Uma cópia das atuais fica guardada como segurança.`,
        );
        if (!ok) return;
        try {
          localStorage.setItem("pf2e.creatures.beforeImport", JSON.stringify(current));
        } catch {
          /* sem armazenamento para a cópia de segurança */
        }
      }
      saveCreatures(applyBackup(current, creatures, mode));
      backupText = "";
      say(
        `${creatures.length} criatura(s) importada(s)${mode === "replace" ? " (substituindo tudo)" : " (mesclando)"}${
          ignored ? `; ${ignored} item(ns) inválido(s) ignorado(s)` : ""
        }. Os tokens já vinculados voltam a funcionar se o mapa for o mesmo.`,
      );
    } catch (e) {
      say(e instanceof Error ? e.message : "Não foi possível importar o backup.");
    }
  }

  function backupSection(): HTMLElement {
    const box = el("section", "block");
    box.append(el("h4", undefined, "Backup das criaturas"));
    const count = loadCreatures().length;
    const last = lastBackupAt();
    const days = last ? (Date.now() - last.getTime()) / 86_400_000 : Infinity;
    box.append(
      el(
        "p",
        "sub",
        `As criaturas ficam só neste navegador (${count} cadastrada(s)). ${
          last ? `Último backup: ${last.toLocaleString("pt-BR")}.` : "Nenhum backup feito ainda."
        }`,
      ),
    );
    if (count > 0 && days > 7) {
      box.append(
        el(
          "p",
          "status error",
          last
            ? "Faz mais de 7 dias do último backup: exporte de novo."
            : "Exporte um backup agora: se os dados do navegador forem apagados, as criaturas se perdem.",
        ),
      );
    }

    const text = () => JSON.stringify(makeBackup(loadCreatures()), null, 2);
    const stamp = new Date().toISOString().slice(0, 10);

    const row = el("div", "import wrap");
    row.append(
      button("Exportar arquivo", () => {
        try {
          download(`criaturas-pf2e-${stamp}.json`, text());
          markBackupDone();
          say("Backup exportado. Se o download não começar, use Copiar backup.");
        } catch {
          backupText = text();
          say("Não foi possível baixar o arquivo. Copie o texto da caixa abaixo e salve num arquivo.");
        }
      }),
      button("Copiar backup", async () => {
        const t = text();
        try {
          await navigator.clipboard.writeText(t);
          markBackupDone();
          say("Backup copiado. Cole num arquivo de texto e guarde.");
        } catch {
          backupText = t;
          markBackupDone();
          say("O navegador não deixou copiar. O texto está na caixa abaixo: selecione e copie.");
        }
      }),
    );
    box.append(row);

    const file = el("input");
    file.type = "file";
    file.accept = ".json,application/json";
    file.hidden = true;
    let mode: "merge" | "replace" = "merge";
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      file.value = "";
      if (f) importText(await f.text(), mode);
    });
    const importRow = el("div", "import wrap");
    importRow.append(
      button("Importar arquivo (mesclar)", () => {
        mode = "merge";
        file.click();
      }),
      button("Importar arquivo (substituir tudo)", () => {
        mode = "replace";
        file.click();
      }),
    );
    box.append(importRow, file);

    // Alternativa sem arquivo: ver, copiar ou colar o texto do backup.
    const details = el("details");
    details.open = backupText !== "";
    details.append(el("summary", "sub", "Ver ou colar o texto do backup"));
    const area = el("textarea");
    area.rows = 5;
    area.value = backupText;
    area.placeholder = "Cole aqui o texto de um backup para importar";
    area.style.width = "100%";
    area.addEventListener("input", () => {
      backupText = area.value;
    });
    const pasteRow = el("div", "import wrap");
    pasteRow.append(
      button("Importar texto (mesclar)", () => importText(area.value, "merge")),
      button("Importar texto (substituir tudo)", () => importText(area.value, "replace")),
    );
    details.append(area, pasteRow);
    box.append(details);
    return box;
  }

  /** Tokens ligados a criaturas que este navegador não tem: os ataques contra eles falham. */
  function orphanNotice(): HTMLElement {
    const box = el("div");
    void (async () => {
      try {
        const known = new Set(loadCreatures().map((c) => c.id));
        const tokens = await OBR.scene.items.getItems((i) => isCreatureLink(i.metadata[CREATURE_KEY]));
        const orphans = tokens.filter((t) => !known.has((t.metadata[CREATURE_KEY] as CreatureLink).id));
        if (orphans.length === 0) return;
        box.append(
          el(
            "p",
            "status error",
            `${orphans.length} token(s) no mapa estão ligados a criaturas que NÃO existem neste navegador. Ataques e magias contra eles dão "sem dados cadastrados". Vincule esses tokens de novo (a partir do bestiário) ou importe o backup das criaturas.`,
          ),
          button("Desvincular esses tokens", async () => {
            await OBR.scene.items.updateItems(
              orphans.map((t) => t.id),
              (items) => {
                for (const it of items) delete it.metadata[CREATURE_KEY];
              },
            );
            render();
          }),
        );
      } catch {
        /* sem cena pronta */
      }
    })();
    return box;
  }

  function render() {
    root.replaceChildren();
    root.append(
      el(
        "p",
        "sub",
        "Ligue um modelo a vários tokens: cada token vira uma criatura própria, com PV e condições separados. Os jogadores só veem o estado (Ileso, Ferido…).",
      ),
    );
    const f = form();
    const imp = importBox();
    if (f) root.append(f);
    if (imp) root.append(imp);
    if (message) root.append(el("p", "status", message));
    root.append(toolbar());

    const instances = loadCreatures().filter(isInstance).sort(byName);
    const inst = el("section", "block");
    inst.append(el("h4", undefined, `Em jogo (${instances.length})`));
    const iul = el("ul", "creatures");
    if (instances.length === 0) {
      iul.append(el("li", "sub", "Selecione tokens no mapa e use “Vincular” numa criatura do bestiário."));
    }
    for (const c of instances) iul.append(instanceCard(c));
    inst.append(iul);
    inst.append(orphanNotice());

    root.append(inst, backupSection());
  }

  /** Tocou no token de uma criatura: abre a ficha dela e rola até o cartão, com destaque. */
  function focus(id: string) {
    openSheets.add(id);
    render();
    const node = root.querySelector<HTMLElement>(`[data-cid="${id}"]`);
    if (!node) return;
    // Se o cartão está dentro de uma seção recolhida (Em jogo), abre para a criatura aparecer.
    for (let d = node.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    node.classList.add("focus");
    window.setTimeout(() => node.classList.remove("focus"), 2500);
  }

  render();
  // Mudanças feitas pela página de fundo (ataques e magias dos jogadores) aparecem aqui.
  window.addEventListener("storage", () => {
    // Não apaga o que o mestre está digitando.
    if (
      (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) &&
      root.contains(document.activeElement)
    )
      return;
    render();
  });
  return { render, focus };
}
