# Extensão PF2e para Owlbear Rodeo — Documento completo

> Versão consolidada (21/11/2026) para uso no Claude Code. Reúne **tudo** o que foi analisado e decidido na conversa. Estado: **análise e desenho; nada foi construído.**

## Índice

- **Parte 1 — Escopo do projeto:** arquitetura, importação do PDF/JSON do Pathbuilder, modelo de dados, funcionalidades, regras, rolagens e permissões, mobile, tradução, riscos e roteiro.
- **Parte 2 — Combate entre tokens, criaturas e estética.**
- **Parte 3 — Sistema de tags e efeitos:** traços, defesa, condições, motor de regras, grau de sucesso e dano.
- **Parte 4 — Registro cronológico da conversa:** perguntas, conclusões, decisões, pendências e fontes.

**Leitura rápida para o Claude Code:** comece pelas *decisões consolidadas* (Parte 4, seção 2) e pelos *testes rápidos* (Parte 4, seção 3), depois siga o roteiro da Parte 1.

---

# PARTE 1 — Escopo do projeto

> Documento de escopo para usar no Claude Code. Estado: **análise de viabilidade concluída, nada construído ainda.**
> Idioma da interface e da documentação: **PT-BR**. Nomes de regras ficam em inglês (como vêm do Pathbuilder), com glossário PT-BR por cima.

---

## 1. Objetivo

Extensão para o **Owlbear Rodeo** que permite a cada jogador de **Pathfinder 2e** controlar a própria ficha dentro da mesa virtual:

- importar a ficha gerada no **Pathbuilder 2e** (PDF; JSON como opção extra);
- controlar PV, condições, espaços de magia e pontos de foco;
- lançar magias e fazer rolagens (públicas ou secretas);
- vincular a ficha a um token do mapa;
- o mestre cria a sessão, convida os jogadores e define as permissões de cada um.

Público: mesas entre amigos e, no futuro, o público do canal "Runas & Presságios" (PT-BR).

---

## 2. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Plataforma | Extensão do Owlbear Rodeo (SDK `@owlbear-rodeo/sdk`, MIT), iframe estático em HTTPS |
| Fonte da ficha | **PDF e JSON do Pathbuilder, ambos suportados em PC e celular** (decisão confirmada). PDF lido no navegador (`pdf-lib`/`pdf.js`), sem enviar a servidor. JSON buscado pelo ID de 6 dígitos |
| Mobile | Extensão **responsiva** (uma tela por vez) no MVP; **página companheira (PWA)** para celular na fase 2, mesma sessão Supabase. No celular o ID do JSON é o caminho mais simples; PDF via seletor de arquivo |
| Backend | **Híbrido**: Supabase guarda dados simples; arquivos pesados ficam com o mestre |
| Permissões | Configuradas pelo mestre por jogador; aplicadas por **RLS no Supabase** (não só na interface). Com permissão dada, o mestre não precisa validar |
| Regras (descrições) | Índice local do **foundryvtt/pf2e** (JSON público). AoN só como link |
| Vínculo ao AoN | **Manual por URL** como rede de segurança quando o cruzamento automático falhar |
| Tradução | Interface em PT-BR + glossário do canal. Tradução do navegador só como apoio opcional |
| MCP | Não é necessário para ler a ficha. Opcional no futuro (ex.: "Claude, importa a ficha do João") |

---

## 3. Arquitetura

```
Jogador/Mestre (Owlbear Rodeo)
 └─ Extensão (iframe, HTTPS estático)
     ├─ Importador de PDF Pathbuilder (local, no navegador)
     ├─ UI: ficha, PV, condições, espaços, magias, rolagens
     ├─ Índice de regras (foundryvtt/pf2e, busca por nome)
     └─ Cliente Supabase (auth anônimo/convite + realtime)
Supabase
 ├─ Postgres + RLS (sessões, membros, permissões, estado, rolagens)
 └─ Realtime (sincroniza estado e log)
Arquivos do mestre (local/exportável)
 └─ homebrew, imagens de token, notas, backup da sessão
```

### O que vai para o Supabase (dados leves)
- Sessões, membros (mestre/jogador) e permissões por jogador.
- **Resumo da ficha**: nome, nível, PV máx., CA, salvaguardas, CD de magia, ataque de magia, perícias.
- **Estado vivo**: PV atual/temporários, condições com valor, espaços de magia usados, pontos de foco, pontos de heroísmo.
- Vínculo ficha ↔ token do Owlbear.
- Log de rolagens (com visibilidade).
- Vínculos manuais de habilidade → URL do AoN.
- ID do Pathbuilder (se usado), para rebaixar o JSON quando precisar.

### O que fica com o mestre (arquivos)
- Fichas que ele mesmo sobe, imagens/mapas/tokens.
- Homebrew, notas e cache de descrições.
- Backup da sessão (exportar/importar arquivo).

---

## 4. Importação do PDF do Pathbuilder

O PDF é a **ficha oficial da Paizo (AcroForm, 4 páginas, 1.088 campos)** preenchida pelo Pathbuilder. Os nomes dos campos são estáveis entre jogadores → um único mapa de campos serve.

### Campos confirmados (ficha de teste: "Linari", Strix Necromancer, nível 4)

**Identidade**: `Character Name`, `Ancestry`, `Heritage and Traits`, `Background`, `Class`, `Deity or Philosophy`, `LEVEL`, `AGE`, `GENDER & PRONOUNS`.

**Atributos (modificadores)**: `STRENGTH STAT`, `DEXTERITY STAT`, `CONSTITUTION STAT`, `INTELLIGENCE STAT`, `WISDOM STAT`, `CHARISMA STAT`.

**Defesas**: `AC` (+ `AC CALCULATION 1 DEXTERITY`, `AC CALCULATION 2 PROFICIENCY`, `AC CALCULATION 3 ITEM`), `FORTITUDE`, `REFLEX`, `WILL` (+ `... ITEM`, `... TRAINED/EXPERT`), `MAXIMUM HIT POINTS`, `SPEED`, `PERCEPTION`, `SENSES AND NOTES`, `LANGUAGES`, `CLASS DC`.

**Perícias** (padrão por perícia): total (`ARCANA`), atributo (`ARCANA INTELLIGENCE`), proficiência (`ARCANA PROFICIENCY`), item (`ARCANA ITEM`), treino (`ARCANA TRAINED`, `LORE1 EXPERT` etc. = `"Yes"`). Lores: `LORE CATAGORY 1` (sic), `LORE CATEGORY 2`.

**Ataques**: `MELEE STRIKE n` (nome), `... ATTACK BONUS`, `... DAMAGE`, `... TRAITS AND NOTES` (n = 1..3; existem campos análogos para à distância — confirmar).

**Magias**:
- `SPELL ATTACK`, `SPELL SAVE DC`, `SPELLS PER DAY n`, `CANTRIPS RANK`.
- Truques: `CANTRIP NAME n`, `CANTRIP n ACTIONS`.
- Magias: `SPELL n`, `SPELL ACTION n`, `SPELL RANK n`.
- Foco: `FOCUS SPELL n`, `FOCUS SPELL ACTIONS n`, `FOCUS SPELL RANK`.

**Habilidades**: `ANCESTRY FEAT`, `ANCESTRY & HERITAGE ABILITIES`, `CLASS FEATS & FEATURES` (texto multilinha), `CLASS FEAT n-1`, `BACKGROUND SKILL FEAT`, `SKILL FEAT n-n`, ações (`ACTION NAME n`, `TRAIT(S)n`, `EFFECTS n-1`) e reações (`REACTION NAME n`, `REACTIONS TRIGGER n-1`, `REACTIONS EFFECTS n-1`).

**Inventário**: `HELD n` + `HELD BULK n`, `WORN n` + `WORN BULK n`, `INVESTED n`, `BULK TOTAL`, `COPPER/SILVER/GOLD/PLATINUM`.

### Pontos de atenção
- A ficha tem **erros de digitação nos nomes dos campos** (`ATHELETICS TRAINED`, `LORE 1 PFOCIENCY`, `CATAGORY`, `ITENLLIGENCE`). O mapa deve ser feito **à mão** e tolerante.
- Textos livres misturam PT/EN (ex.: "2d6 contra dragão"). Parser tolerante.
- Magias vêm **só com nome, ação e rank, sem descrição** → cruzar com o índice de regras.
- **PV atual e condições não estão no PDF** → viram estado vivo da sessão.
- Checkboxes vêm como `"Yes"` / `/Off`.
- Notas, altura e peso podem não vir preenchidos.

### Arquitetura do importador
1. Ler campos do PDF no navegador.
2. Normalizar para um **modelo interno** (`Character`) independente do PDF.
3. **Importação por JSON (suportada junto com o PDF, em PC e celular):** o jogador exporta no Pathbuilder (*Export JSON* / *Export to Foundry VTT (JSON)*), recebe um **ID de 6 dígitos** e a extensão busca `pathbuilder2e.com/json.php?id=<ID>`. No celular é o caminho mais prático (evita mover arquivo). **A testar CORS**; a exportação JSON pode exigir conta paga (confirmar). O ID dá acesso à ficha: não divulgar em público.
4. Quando houver PDF e JSON da mesma ficha, **mesclar** no modelo interno (JSON para dados estruturados, PDF como complemento/conferência). Ainda não analisamos um JSON real: pedir a um jogador um ID de teste para comparar.
5. Reimportar ao subir de nível preservando PV atual e condições.

---

## 5. Modelo de dados (rascunho Supabase)

```
sessions(id, owner_id, name, owlbear_room_id, invite_code, created_at)
members(session_id, user_id, role['gm'|'player'], display_name)
permissions(session_id, user_id, flags jsonb)
  -- flags: edit_hp, edit_conditions, edit_slots, roll_public,
  --        roll_secret_to_gm, view_others_sheets, edit_token_link
characters(id, session_id, owner_user_id, summary jsonb, pathbuilder_id text null,
           token_item_id text null, updated_at)
character_state(character_id, hp_current, hp_temp, conditions jsonb,
                spell_slots_used jsonb, focus_points, hero_points, version int)
rolls(id, session_id, character_id null, author_id, label, formula, result jsonb,
      visibility['public'|'gm_only'], created_at)
aon_links(session_id, kind, name_en, url, created_by)
```

- **RLS** impõe as permissões (ver/editar por papel e flags).
- **Edições simultâneas**: gravar PV/dano como **variação** (delta) ou com `version` otimista, nunca sobrescrever o valor final.
- Rolagem secreta do mestre: tabela/linhas legíveis só pelo mestre.
- Rolagem secreta de jogador: sorteada no cliente (aceitável entre amigos); para blindar, passar por **Edge Function** do Supabase.

---

## 6. Funcionalidades

### Núcleo (MVP)
1. Sessão com convite (código/link) e papéis mestre/jogador.
2. Importar ficha (**PDF e JSON por ID**, em PC e celular) e mostrar resumo.
3. PV (atual/temp), condições com valor (frightened 2 etc.), espaços de magia, foco, heroísmo.
4. Vincular ficha a token do Owlbear (ID do item nos metadados do token; mostrar PV/condições sobre o token).
5. Log de rolagens públicas e secretas, com grau de sucesso do PF2e (crítico a ±10).
6. Painel de permissões do mestre.

### Fase 2
- Magias: lançar gasta espaço/foco, descrição via índice local, envio da rolagem ao log/Dice+.
- Cruzamento automático de habilidades com foundryvtt/pf2e.
- **Vínculo manual ao AoN** (URL por habilidade, prioridade sobre o automático, abre em nova aba).
- Glossário PT-BR do canal (nome em inglês ↔ termo em PT-BR).
- Automação de condições (decrementar no fim do turno).

### Ideias futuras
- Rastreador de combate PF2e (iniciativa, ações por turno) a partir do exemplo oficial.
- MCP opcional para o mestre importar fichas por conversa com o Claude.
- Integração com Dice+.

---

## 7. Regras e referência (cruzamento de dados)

Ordem de resolução de uma habilidade (magia/talento/ação):

1. **Automático**: nome em inglês da ficha → índice local do **foundryvtt/pf2e** (JSON de `json-assets.zip` das releases; conteúdo sob licença da comunidade/ORC). Retorna descrição, traços, ações, alcance, duração, salvaguarda.
2. **Manual**: o jogador/mestre cola a URL do AoN daquela habilidade. Salva em `aon_links` (por sessão). Botão "ver no AoN" abre essa página.
3. **Sem vínculo**: botão abre a busca do AoN pelo nome.

**Sobre o AoN**: não tem API pública oficial; a Paizo informou que restrições de licença impedem hospedar uma API. Existe endpoint interno (Elasticsearch) que não deve ser usado em massa nem como base. A extensão **só abre links**; não lê o conteúdo (CORS) e **não está confirmado** que o AoN aceite iframe.

---

## 8. Rolagens e permissões

- **Pública**: vai para todos e aparece no log.
- **Escondida**: só o mestre recebe; o jogador vê "rolou em segredo" ou nada, conforme regra da mesa.
- ⚠️ **A confirmar no SDK**: se `OBR.broadcast` permite destino apenas ao mestre. A suposição inicial pode estar errada (a doc sugere destinos local/remoto/todos). Por segurança, a rolagem secreta deve passar pelo **Supabase com RLS**, e não só por broadcast.
- Permissões são **por jogador**, configuradas pelo mestre, e aplicadas no banco.
- Sem a permissão: pedido recusado ou pendente de aprovação do mestre.

---

## 8.1 Mobile

- **MVP:** extensão responsiva dentro do Owlbear (funciona bem em PC e tablet; em celular, uma tela por vez: PV, Condições, Magias, Rolagens, botões grandes). Comportamento dos painéis de extensão em tela pequena **a testar em aparelho real**.
- **Importação no celular:** ID do JSON (principal) ou PDF via seletor de arquivos.
- **Fase 2 — página companheira (PWA):** interface só para o celular do jogador, usando a mesma sessão do Supabase (login por código de convite). Ver/editar PV, condições, espaços e rolar dados; o log de rolagens aparece no Owlbear de quem o tiver aberto. Componentes de ficha **compartilhados** entre extensão e PWA (só muda a "casca").
- **Limite:** vincular ficha a token depende do SDK do Owlbear, então é feito de dentro do Owlbear (ex.: pelo mestre).

---

## 9. Tradução

- Rótulos da interface: **PT-BR nativo** (PV, Condições, Rolagens, Magias...).
- **Glossário do canal Runas & Presságios** (arquivo editável): nome em inglês → termo PT-BR; mostrar o traduzido com o original ao lado.
- Descrições longas: tradução do navegador como apoio opcional (a testar se alcança o iframe do Owlbear; pode quebrar telas dinâmicas — marcar campos sensíveis com `translate="no"`; números e dados não podem ser traduzidos).
- Possibilidade futura: API de tradução no dispositivo do Chrome (**verificar disponibilidade/versão**).

---

## 10. Riscos e pendências

| Item | Risco | Ação |
|---|---|---|
| Destino do `OBR.broadcast` (só mestre?) | Médio | Ler docs/testar no começo |
| CORS no `pathbuilder2e.com/json.php` | Médio | Testar com ID real; se bloquear, proxy serverless |
| Exportação JSON exige conta paga? | Médio | Confirmar; se exigir, PDF cobre quem não tiver acesso |
| Painéis de extensão em celular | Médio | Testar em aparelho real; PWA companheira na fase 2 |
| Permissões do jogador em tokens (SDK) | Médio | Testar edição de metadados do próprio token |
| Tamanho dos metadados do Owlbear | Médio | Guardar ficha fora (Supabase); só estado leve no Owlbear |
| Limites/pausa do plano gratuito do Supabase | Baixo | Monitorar; dados são pequenos |
| AoN em iframe | Baixo | Assumir "abrir em nova aba" |
| Tradução do navegador no iframe | Baixo | Teste de 5 min; não depender disso |
| Casamento de nomes de magias/itens | Médio | Vínculo manual + glossário |
| Privacidade das fichas | Baixo | Aviso simples aos jogadores |

---

## 11. Roteiro sugerido

0. **Testes rápidos (≈ 1h):** broadcast só-mestre; permissões em token; CORS do Pathbuilder; tradução no iframe.
1. Esqueleto: TypeScript + Vite + `@owlbear-rodeo/sdk`; `manifest.json`; hospedagem estática (Vercel/GitHub Pages); instalar no perfil do Owlbear.
2. Supabase: tabelas, RLS, auth por convite, realtime.
3. Importador do PDF (mapa de campos) **e do JSON por ID** → modelo `Character`.
4. UI: ficha, PV, condições, espaços, foco; vínculo de token.
5. Log de rolagens + permissões do mestre.
6. Fase 2: magias, índice foundryvtt/pf2e, vínculo AoN, glossário.

### Stack sugerida
TypeScript, Vite, `@owlbear-rodeo/sdk`, `pdf-lib` (ou `pdfjs-dist`), Supabase (`@supabase/supabase-js`), UI leve (Svelte ou React). Testes do mapa de campos com o PDF de exemplo (Linari).

---

## 12. Referências

- SDK e docs do Owlbear: https://docs.owlbear.rodeo/extensions/ · https://github.com/owlbear-rodeo/sdk
- Loja de extensões: https://extensions.owlbear.rodeo
- Dados de regras: https://github.com/foundryvtt/pf2e (releases → `json-assets.zip`)
- Referência de MCP com esses dados: https://pypi.org/project/pf2e-mcp/
- Pathbuilder 2e: https://pathbuilder2e.com
- Archives of Nethys (apenas links): https://2e.aonprd.com


---

# PARTE 2

# Combate entre tokens, criaturas e estética

> Decisões tomadas depois do escopo base. Complementa a Parte 1 e usa as regras da Parte 3.

## C.1 Interação entre tokens (animação + ataque + efeitos)

Fluxo desejado: o jogador, com a ficha vinculada ao seu token, **seleciona o token inimigo** e clica no botão da magia (ex.: um raio de fogo) → **animação** do seu token até o alvo → **rolagem de ataque** com os modificadores da ficha, comparada com a **CA** do alvo; se a magia usa **CD**, o **mestre aprova** e a criatura rola a salvaguarda → o sistema **subtrai o dano e aplica os efeitos** necessários.

| Etapa | Entrega | Dificuldade |
|---|---|---|
| A | Animação entre tokens | Baixa |
| B | Ataque contra CA, com grau de sucesso | Média |
| C | Magias de CD, com aprovação do mestre | Média |
| D | Aplicar dano e condições, com confirmação | Alta |

- **A (animação):** a extensão lê o token selecionado e as posições no mapa e desenha um elemento temporário (linha, forma, imagem) movido quadro a quadro; o evento é enviado aos outros jogadores por mensagem e cada navegador desenha. O SDK não tem sistema de partículas; efeitos simples em celular fraco.
- **B (ataque):** bônus de ataque de magia vem da ficha (ex.: +10 na Linari); o d20 é rolado e o grau calculado pelas regras da Parte 3 (seção 4.1). A CA vem da criatura vinculada, **oculta do jogador** (ele só vê "acertou/errou/crítico").
- **C (CD):** pedido ao mestre (ou aprovação automática pelas permissões) → a criatura rola a salvaguarda com o bônus do cadastro → o grau define o efeito.
- **D (aplicar):** subtrair PV do alvo e aplicar condições simples com um clique/confirmação do mestre. Resistências, fraquezas, áreas, linha de efeito e efeitos em texto livre ficam parciais, com confirmação manual.
- **A confirmar no SDK:** efeitos temporários, permissões do jogador sobre tokens inimigos, desempenho em celular.
- Entra na **fase 2**, começando pela etapa A.

## C.2 Criaturas (cadastro do mestre)

- **Cadastro manual** (formulário: CA, PV, Fort/Ref/Vont, resistências, fraquezas, traços, ataques) **ou importação do foundryvtt/pf2e** (busca por nome no bestiário; também importação do JSON de um ator do Foundry).
- Não foi encontrada extensão de **bestiário de PF2e** para o Owlbear; provavelmente será feita uma tela de busca sobre os dados já carregados.
- Colar stat block em texto (estilo AoN) é frágil: só último recurso.
- Cada criatura é **vinculada a um token** do mapa, igual à ficha do jogador.
- **Onde ficam os dados:** só na **máquina do mestre** (arquivo/IndexedDB do navegador dele). **Nada de CA, salvaguardas ou PV de monstro vai ao Supabase**, então o jogador não tem como espiar.
- **Fluxo:** o pedido do jogador chega ao navegador do mestre, que confere CA/salvaguarda, devolve só o **resultado** (acertou/falhou/crítico), atualiza o PV da criatura localmente e dispara a animação para todos.
- **Consequências:** o mestre precisa estar **online no combate**; o jogador pode rolar e deixar o resultado pendente; é preciso **exportar backup** da sessão (se o navegador for limpo, perde-se a campanha).

## C.3 Estética e experiência

- Combinar com o visual **escuro e minimalista** do Owlbear; fantasia em detalhes (ícones, títulos, bordas finas), sem texturas pesadas.
- **Legibilidade:** números grandes (PV, CA, ataque, CD); botões grandes (~44 px); **uma tela por vez** no celular com navegação fixa (Ficha, Combate, Magias, Rolagens).
- **Linguagem do PF2e:** ícones padronizados das **3 ações e reação**; **graus de sucesso** com cor **e** símbolo/texto (daltonismo e brilho baixo); condições como fichas com ícone e valor, também no token; barra de PV com faixas e número escrito.
- **Identidade:** cor de destaque por jogador/personagem (log e anel do token); tema opcional com paleta/tipografia do canal Runas & Presságios (precisa do material visual).
- Animações curtas e discretas nas rolagens (crítico com destaque), **com opção de desligar**; modo claro/escuro; fonte ajustável; fonte decorativa só em títulos.
- **Direitos:** ícones e arte oficiais da Paizo têm regras de uso — no MVP usar ícones próprios ou de bibliotecas livres.
- **Pendente:** protótipo visual de 2–3 telas (celular e desktop), oferecido e ainda não feito.

## C.4 Interação com a Parte 1 (ajustes ao escopo base)

- **Vínculo manual ao AoN** é a rede de segurança do cruzamento automático (três camadas: automático → manual → busca no AoN pelo nome).
- **Rolagem secreta:** não depender do `OBR.broadcast` só-mestre (não confirmado); passar pelo Supabase com RLS.
- **Mobile:** extensão responsiva no MVP; PWA companheira na fase 2; importação por **ID do JSON** como caminho principal no celular.
- **Tradução:** interface PT-BR + glossário do canal; tradução do navegador só como apoio (testar o iframe).


---

# PARTE 3 — Sistema de tags e efeitos

> Complemento do `owlbear-pf2e-extension.md`. Estado: **desenho, nada construído.**
> Inspirado nos **traços (traits)** e **condições** do PF2e. Lista de condições conferida no Archives of Nethys (2e.aonprd.com/Conditions.aspx); descrições abaixo são resumos próprios.

---

## 1. Ideia central

Cada habilidade (magia, talento, ação, item) recebe **tags**. Existem três tipos, como no próprio PF2e:

| Tipo | O que é | Exemplo | Efeito no sistema |
|---|---|---|---|
| **Traço** (descritivo) | Classifica a habilidade | `fire`, `mental`, `fear`, `incapacitation`, `visual`, `auditory`, `healing` | Interage com criaturas: imunidade, resistência, fraqueza, regras especiais |
| **Defesa** | Contra o que a habilidade rola | `ac` (ataque), `save:fortitude|reflex|will`, `basic` | Define como o resultado é calculado |
| **Efeito** (condição) | Algo que se aplica ao alvo | `frightened:2`, `slowed:1`, `prone`, `persistent:fire:1d6` | Muda os números/estado do alvo |

Uma habilidade é então: **traços + defesa + resultados por grau de sucesso**, cada resultado com uma lista de efeitos.

---

## 2. Formato de dados (rascunho)

```json
{
  "id": "fear",
  "name_en": "Fear",
  "name_pt": "Medo",
  "rank": 1,
  "traits": ["emotion", "fear", "mental"],
  "defense": { "type": "save", "save": "will", "basic": false },
  "damage": null,
  "outcomes": {
    "critSuccess": [],
    "success":     [ { "apply": "frightened", "value": 1 } ],
    "failure":     [ { "apply": "frightened", "value": 2 } ],
    "critFailure": [ { "apply": "frightened", "value": 3 },
                     { "apply": "fleeing", "duration": { "unit": "round", "count": 1 } } ]
  },
  "source": "foundry|manual",
  "aon_url": null
}
```
> Exemplo **ilustrativo**: os valores reais de cada magia devem ser conferidos no texto oficial antes de entrar no catálogo.

Magia de dano com salvaguarda básica:
```json
{
  "defense": { "type": "save", "save": "reflex", "basic": true },
  "damage": [ { "formula": "6d6", "type": "fire" } ],
  "heighten": { "step": 1, "add": "2d6" }
}
```
Salvaguarda básica = `critSuccess ×0`, `success ×½`, `failure ×1`, `critFailure ×2`.
Magia de ataque (`defense.type = "ac"`): acerto = sucesso; crítico dobra o dano.

---

## 3. Catálogo de condições (tags de efeito)

Automação: **A** = números calculados automaticamente · **M** = marcador/sinalizador, o mestre aplica na mão · **T** = rastreador (contador).

### Penalidades com valor (A) — penalidade de *status*, não acumulam (vale a pior)
| Tag | Resumo | Afeta | Fim típico |
|---|---|---|---|
| `frightened:N` | –N em todas as jogadas e CDs | tudo | cai 1 no fim de cada turno do alvo |
| `sickened:N` | –N em tudo; não pode ingerir | tudo | testes de Fortitude/repouso |
| `clumsy:N` | –N em Destreza (CA, Reflexos, Acrobacia, Furtividade, Ladroagem) | Des | manual/duração |
| `enfeebled:N` | –N em Força (Atletismo etc.) | For | manual/duração |
| `stupefied:N` | –N em Int/Sab/Car; magias podem falhar | Int/Sab/Car | manual/duração |
| `drained:N` | –N em Constituição; reduz PV máx. (nível × N) | Con/PV | descanso |
| `slowed:N` | perde N ações por turno | ações | duração |
| `stunned:N` | perde ações; valor cai ao perdê-las | ações | automático |
| `doomed:N` / `wounded:N` / `dying:N` | trilha de morte | morte | regras próprias (T) |

### Estados que mexem em CA/ataque (A)
| Tag | Resumo |
|---|---|
| `off-guard` | –2 de circunstância na CA |
| `prone` | desprevenido e –2 em ataques; só Rastejar/Levantar |
| `fatigued` | –1 na CA e salvaguardas |
| `quickened` | +1 ação por turno |
| `encumbered` | desajeitado 1 e –3 m (10 pés) de Deslocamento |

### Dano persistente (T)
`persistent:<tipo>:<dado>` — causa dano no fim do turno; teste simples CD 15 para encerrar (reduzido pela ajuda). Aparece como ficha com o tipo e o dado.

### Impedimentos de movimento/ação (M, com sinalizadores)
`grabbed`, `immobilized`, `restrained`, `paralyzed`, `petrified`, `unconscious`, `fleeing`, `confused`, `controlled`, `broken` (objetos).
→ O sistema mostra o ícone, aplica `off-guard` quando a regra manda e avisa o mestre. Não decide as ações do alvo.

### Sentidos e detecção (M)
`blinded`, `dazzled`, `deafened`, `concealed`, `hidden`, `undetected`, `unnoticed`, `invisible`, `observed`.
→ Marcador + lembrete do teste simples (ex.: CD 5 em ocultado, CD 11 em escondido).

### Atitudes (M)
`friendly`, `helpful`, `indifferent`, `unfriendly`, `hostile` — só rótulo.

---

## 4. Regras de aplicação (motor de efeitos)

1. **Penalidades de status não acumulam:** para cada estatística vale o **maior** valor entre as condições aplicáveis. Bônus de status idem (o maior).
2. **Valor só sobe:** reaplicar `frightened:1` sobre `frightened:2` mantém 2.
3. **Duração:** cada efeito tem `duration` = `round` (n), `until_end_of_turn`, `sustained`, `until_rest`, `permanent` ou `manual`.
4. **Gatilhos:** eventos do combate disparam regras, por exemplo:
   - fim do turno do alvo → `frightened` –1; dano persistente causa dano e abre o teste de encerrar;
   - início do turno → `slowed`/`stunned` reduz as ações disponíveis.
5. **Imunidade/resistência/fraqueza por traço:** a criatura tem listas (ex.: imunidade `mental`, fraqueza `cold 5`). Se o traço/tipo de dano da habilidade casa, aplica-se a regra. Resistências e fraquezas só entram na fase de dano.
6. **Incapacitação (`incapacitation`):** se a habilidade tem esse traço, o grau do alvo sobe uma categoria quando o nível dele for alto. Implementar como regra do traço, comparando nível do alvo com o rank da magia. *Conferir a regra exata no texto oficial antes de codificar.*
7. **Exibição:** o modificador mostrado na ficha já inclui as penalidades (ex.: Arcanismo 10 → 8 com `frightened:2`), com um ícone que explica a origem.
8. **Quem aplica:** conforme a permissão da sessão — automático, aprovação do mestre ou só sugestão.

---

## 4.1 Grau de sucesso e dano (conferido no AoN / Player Core)

**Ordem de cálculo (igual para ataque contra CA e salvaguarda contra CD):**
1. **Grau pelos números:** total ≥ alvo + 10 → sucesso crítico; total ≥ alvo → sucesso; total ≤ alvo − 10 → falha crítica; senão → falha.
2. **Ajuste de d20 natural:** 20 natural sobe **um** grau; 1 natural desce **um** grau. Limites: se 20 + modificador ficar 10 ou mais abaixo da CD, o 20 natural ainda é falha; se 1 + modificador superar a CD em 10 ou mais, o 1 natural ainda pode ser sucesso. Este ajuste é aplicado **antes** de qualquer habilidade que mude o grau.
3. **Habilidades que mudam o grau** (ex.: "trate sua salvaguarda como um grau melhor"): **um passo por jogada**, nunca mais. *(Convenção esclarecida por desenvolvedor em fórum; não é texto literal das regras. Os efeitos que sobem e descem tendem a se anular; o mestre decide a ordem.)*

**Ataque (grau de quem ataca):** sucesso crítico = dano **dobrado**; sucesso = dano normal; falha e falha crítica = sem dano.

**Salvaguarda básica (grau do alvo):**
| Resultado do alvo | Dano sofrido |
|---|---|
| Sucesso crítico | nenhum (×0) |
| Sucesso | metade (×½) |
| Falha | normal (×1) |
| Falha crítica | dobro (×2) |

**Arredondamento:** regra geral = arredondar **para baixo**, salvo indicação contrária (ex.: 7 de dano → metade = 3). **Não foi encontrada regra de dano mínimo** ao reduzir pela metade; não assumir mínimo. *Verificar o Player Core (seção de dano) antes de codificar resistências e casos especiais.*

*Atenção ao ponto de vista:* no ataque o grau é de quem ataca; na salvaguarda o grau é do alvo, então o sucesso do alvo reduz o dano.

Fontes: https://2e.aonprd.com/Rules.aspx?ID=2287 · https://2e.aonprd.com/Rules.aspx?ID=2297 · https://roll20.net/compendium/pf2/Rules:General%20Rules%20%28Legacy%29

---

## 5. De onde vêm as tags

1. **Automático (base):** o índice do foundryvtt/pf2e já traz, por magia/talento, os **traços**, o tipo de **defesa** (CA ou salvaguarda) e a **fórmula de dano**. Isso preenche `traits`, `defense` e `damage`.
2. **Curado (efeitos):** o bloco `outcomes` com as condições aplicadas **não é derivado com confiabilidade** só dos dados. Começar por um **catálogo curado das magias mais usadas** (as das fichas reais da mesa).
3. **Manual:** o mestre/jogador edita tags de uma habilidade (homebrew ou correção) em um editor simples.
4. **Sem tags:** a habilidade funciona como antes (nome, ação, rank, link do AoN); o mestre aplica o efeito na mão.

Catálogo e ajustes do mestre ficam **no computador do mestre**; só o resultado aplicado (condição no alvo, dano) entra no estado da sessão.

---

## 6. Fluxo de uma magia (com tags)

1. Jogador seleciona o token alvo e a magia.
2. Se `defense = ac`: rola ataque de magia com o bônus da ficha; o computador do mestre compara com a CA da criatura vinculada (oculta do jogador) e devolve o **grau**.
3. Se `defense = save`: o mestre aprova (ou aprovação automática) → a criatura rola a salvaguarda contra a CD da conjuradora → **grau**.
4. O motor lê `outcomes[grau]`: aplica **dano** (com resistência/fraqueza/imunidade) e **condições** (com duração).
5. A animação roda; o log registra o que aconteceu; o mestre pode **desfazer ou ajustar** qualquer item.

---

## 7. Interface das tags

- **Ficha das criaturas e dos jogadores:** fichas pequenas de condição com ícone, valor e duração restante; toque abre a explicação curta.
- **Token:** anel e ícones das condições principais.
- **Habilidade:** chips dos traços (ex.: 🔥 fire, 🧠 mental) e dos efeitos que ela pode causar.
- **Editor de tags** (mestre): escolher traço/defesa/efeito por grau de sucesso, com pré-visualização.
- Cor **e** símbolo/texto (acessibilidade), PT-BR com glossário (nome em inglês ao lado).

---

## 8. Riscos e decisões em aberto

| Item | Nota |
|---|---|
| Completar o catálogo de `outcomes` | Trabalho curado e contínuo; priorizar magias e talentos das fichas reais |
| Regras especiais (resistências, áreas, incapacitação, efeitos sustentados) | Começar parcial, com confirmação do mestre |
| Durações e ordem de turno | Dependem de um rastreador de iniciativa/turnos (previsto no combate) |
| Conferir textos oficiais | Cada efeito catalogado deve ser verificado contra a fonte antes de entrar |
| Direitos | Guardar só estruturas e resumos próprios; texto integral só como link para o AoN |
| Mensagem original do usuário | Foi cortada em "…aplicam os efeitos das tags e": confirmar o que vinha depois |

## 9. Roteiro

1. Catálogo base de condições (seção 3) + motor de penalidades (regras 1–3, 7).
2. Aplicar/remover condições manualmente na ficha e no token (sem magias).
3. Traços e imunidades/resistências/fraquezas nas criaturas.
4. `outcomes` para um conjunto pequeno de magias (as da Linari como piloto).
5. Fluxo completo da seção 6 com aprovação do mestre.
6. Editor de tags e ampliação do catálogo.


---

# PARTE 4 — Registro da conversa

> Resumo cronológico e organizado de toda a conversa (21/11/2026), com perguntas, conclusões, decisões e pendências.
> Não é transcrição literal. Os detalhes técnicos completos estão em `owlbear-pf2e-extension.md` (escopo) e `owlbear-pf2e-tags-e-efeitos.md` (tags, condições e regras de dano).

---

## 1. Linha do tempo

### 1.1 Ponto de partida
- **Pedido:** verificar a viabilidade de criar uma extensão para Pathfinder.
- **Primeira análise:** opções avaliadas — módulo do Foundry VTT (PF2e), extensão de navegador sobre o Archives of Nethys (AoN) e servidor MCP para o Claude (já existe `pf2e-mcp`, com banco local do foundryvtt/pf2e).
- **Decisão do usuário:** a extensão será para o **Owlbear Rodeo**.

### 1.2 Owlbear Rodeo
- Extensões são páginas web carregadas em iframe, feitas com o SDK oficial (`@owlbear-rodeo/sdk`, MIT), com tutoriais e exemplos (dado e iniciativa, open source).
- Não foi encontrada extensão de PF2e na loja do Owlbear.
- Limitações: SDK enxuto, documentação básica; é um tabuleiro leve, sem automação de regras como o Foundry.

### 1.3 Visão do usuário
Algo como um módulo MCP que usa a **ficha em PDF do jogador** para subir os dados ao Owlbear, deixando o jogador controlar a ficha dentro do Owlbear: magias, condições, controle do personagem e **vinculação de token**.

**Análise:** viável, com ajuste de arquitetura — o MCP não é a peça certa (o jogador usa o navegador); a leitura da ficha pode ser feita na própria extensão. Riscos: leitura do PDF, vínculo de token, armazenamento (metadados do Owlbear têm limite pequeno), sincronização.

### 1.4 Pathbuilder
- O usuário informou que as fichas são do **Pathbuilder**.
- O app exporta JSON e entrega um **ID de 6 dígitos**; o JSON é acessível em `pathbuilder2e.com/json.php?id=<ID>`.
- Pontos a verificar: CORS, se o JSON exige conta paga (informação indireta), dados que não saem (notas, altura/peso).

### 1.5 Rolagens, permissões e sessões
- Rolagens **públicas ou escondidas**; permissões **a critério do mestre**; **Supabase** com sessões criadas pelo mestre e convite aos jogadores; ficha enviada pelo jogador ou subida pelo mestre.
- **Correção feita na conversa:** foi afirmado que o `OBR.broadcast` poderia ter destino só ao mestre; isso **não está confirmado** (parece só local/remoto/todos). Por isso a rolagem secreta deve passar pelo Supabase com RLS.

### 1.6 Onde guardar os dados
- Ideia do usuário: usar a **máquina do mestre** para hospedar os dados.
- Opções discutidas (servidor local + túnel, mestre como host no navegador, híbrido).
- **Decisão:** **híbrido** — Supabase guarda dados simples; arquivos ficam com o mestre; **mestre não precisa validar** se já deu permissão ao jogador (RLS aplica as permissões).

### 1.7 PDF enviado pelo usuário
- Ficha oficial da Paizo (AcroForm, 4 páginas, 1.088 campos), **gerada pelo Pathbuilder** — personagem de teste: **Linari**, Strix, Necromancer, nível 4.
- Confirmado: nomes de campos **estáveis**; dá para ler identidade, atributos, defesas, perícias, ataques, magias (nome/ação/rank), talentos, ações/reações, inventário, idiomas, PV máximo.
- Limites: erros de digitação nos nomes dos campos, textos mistos PT/EN, magias sem descrição, PV atual e condições fora do PDF.

### 1.8 Cruzamento de dados de habilidades
- **AoN:** sem API pública oficial; licença impede hospedar API; endpoint interno (Elasticsearch) existe, mas não é base recomendada.
- **Recomendação:** base de regras = **foundryvtt/pf2e** (JSON público); AoN apenas como **link**.
- **Vínculo manual ao AoN** (por URL, salvo na sessão, prioridade sobre o automático) como **rede de segurança** quando o cruzamento automático falhar.
- Três camadas: automático → manual → busca no AoN pelo nome.

### 1.9 Tradução
- Tradução do navegador: provavelmente funciona, mas com ressalvas (iframe do Owlbear, termos de jogo, quebras de tela).
- **Decisão:** interface em PT-BR + glossário do canal; tradução do navegador só como apoio.

### 1.10 Resumo de decisões e primeiro .md
- Foi gerado `owlbear-pf2e-extension.md` com a estrutura completa.

### 1.11 Mobile
- Extensão **responsiva** no MVP; **página companheira (PWA)** na fase 2, com a mesma sessão Supabase.
- Ficou claro o que é o **ID do JSON** (atalho do Pathbuilder para tirar a ficha do app sem arquivo).
- **Decisão:** usar **JSON e PDF** para importar fichas, em **PC e celular**. O `.md` foi atualizado.

### 1.12 Estética
- Dicas: combinar com o visual escuro do Owlbear, números grandes, botões grandes, ícones das 3 ações, graus de sucesso com cor **e** símbolo, condições como fichas, cor por jogador, animações discretas, respeitar direitos de arte da Paizo.
- Oferta de protótipo visual (**ainda não feito**).

### 1.13 Interação entre tokens
- Desejo: selecionar o token inimigo, clicar numa magia, ver **animação** do token do jogador ao inimigo, **rolar o ataque** com os modificadores da ficha e comparar com a CA; se for CD, o mestre aprova e o sistema subtrai/aplica efeitos.
- Etapas: A) animação (baixa); B) ataque contra CA (média); C) magias de CD com aprovação (média); D) aplicar dano e condições (alta).

### 1.14 Criaturas
- **Decisão:** criaturas **cadastradas pelo mestre** (manual ou importação do foundryvtt/pf2e), guardadas **na máquina do mestre**; CA/salvaguardas/PV ocultos dos jogadores; o computador do mestre resolve o ataque e devolve só o resultado.
- Consequência: mestre precisa estar online no combate; precisa exportar backup da sessão.
- Não foi achada extensão de bestiário de PF2e para Owlbear.

### 1.15 Sistema de tags e efeitos
- Pedido: aproveitar o sistema de tags do PF2e nas habilidades e criar algo parecido; a mensagem veio cortada em "…aplicam os efeitos das tags e".
- Desenho: **traços** (descritivos), **defesa** (CA/salvaguarda) e **efeitos** (condições), com resultados por grau de sucesso; catálogo de condições (lido no AoN) com nível de automação; motor com regras (penalidade de status não acumula, valor só sobe, duração, gatilhos, imunidade/resistência/fraqueza por traço, incapacitação).
- **Ponto de atenção explicado:** o Foundry traz traços, defesa e dano de forma estruturada, mas **os efeitos por grau estão em texto corrido** → exigem um **catálogo curado**, começando pelas magias das fichas reais (piloto: Linari).
- Gerado `owlbear-pf2e-tags-e-efeitos.md`.

### 1.16 Regras de grau de sucesso e dano (conferidas)
- Grau: ≥ alvo+10 crítico; ≥ alvo sucesso; ≤ alvo−10 falha crítica; senão falha.
- **20 natural** sobe um grau e **1 natural** desce um (com limites por DC muito alta/baixa); aplicado antes de habilidades que mudam o grau; **um passo por jogada** (convenção de desenvolvedor, não texto literal).
- Ataque: crítico dobra; sucesso normal; falha sem dano.
- Salvaguarda básica (grau do alvo): crítico ×0, sucesso ×½, falha ×1, falha crítica ×2.
- Arredondamento: **para baixo**; **não foi achada regra de dano mínimo** ao dividir pela metade.

---

## 2. Decisões consolidadas

| Tema | Decisão |
|---|---|
| Plataforma | Extensão do Owlbear Rodeo (SDK oficial) |
| Importação | PDF **e** JSON (ID) do Pathbuilder, em PC e celular |
| Backend | Híbrido: Supabase (dados leves, permissões, estado vivo, log) + arquivos do mestre |
| Permissões | Por jogador, configuradas pelo mestre, aplicadas por RLS; sem validação se já permitido |
| Rolagem secreta | Via Supabase/RLS (broadcast só-mestre não confirmado) |
| Regras/descrições | Índice do foundryvtt/pf2e; AoN só por link |
| Fallback | Vínculo manual ao AoN por URL |
| Criaturas | Cadastro manual ou importação do foundryvtt/pf2e; dados na máquina do mestre |
| Tradução | Interface PT-BR + glossário do canal; tradução do navegador como apoio |
| Mobile | Extensão responsiva (MVP) + PWA companheira (fase 2) |
| Tags/efeitos | Traços + defesa + efeitos; catálogo curado, piloto com as magias da Linari |

---

## 3. Pendências e testes

**Testes rápidos (≈ 1 h):**
1. `OBR.broadcast` permite destino só ao mestre?
2. Permissões do jogador sobre tokens (editar metadados do próprio token / alvo inimigo).
3. CORS do `pathbuilder2e.com/json.php`; JSON exige conta paga?
4. Tradução do navegador alcança o iframe do Owlbear?
5. Painéis de extensão em celular real.

**Pendências de regra:** dano mínimo ao reduzir pela metade (Player Core); regra exata de incapacitação; resistências/fraquezas.

**Pedidos em aberto do usuário:**
- Mensagem cortada ("…aplicam os efeitos das tags e") — confirmar o que faltava.
- Protótipo visual (2–3 telas) — oferecido, não feito.
- Um JSON real do Pathbuilder para comparar com o PDF.

---

## 4. Arquivos gerados

| Arquivo | Conteúdo |
|---|---|
| `owlbear-pf2e-extension.md` | Escopo completo: arquitetura, mapa de campos do PDF, modelo de dados, funcionalidades, riscos, roteiro |
| `owlbear-pf2e-tags-e-efeitos.md` | Sistema de tags/efeitos, catálogo de condições, motor, regras de grau e dano |
| `conversa-extensao-owlbear-pf2e.md` | Este registro |

> Observação: este documento consolida os três arquivos anteriores (`owlbear-pf2e-extension.md`, `owlbear-pf2e-tags-e-efeitos.md` e `conversa-extensao-owlbear-pf2e.md`), já com o combate entre tokens, o cadastro de criaturas e o sistema de tags.

---

## 5. Fontes consultadas

- Owlbear Rodeo — SDK: https://github.com/owlbear-rodeo/sdk · docs: https://docs.owlbear.rodeo/extensions/ · loja: https://extensions.owlbear.rodeo
- PF2e no Foundry VTT: https://github.com/foundryvtt/pf2e · https://foundryvtt.com/packages/pf2e
- `pf2e-mcp`: https://pypi.org/project/pf2e-mcp/
- Pathbuilder JSON/ID (discussões de integração): fórum do Fantasy Grounds (t-77652) e repositório `foundry-pathbuilder2e-import`
- Archives of Nethys — condições: https://2e.aonprd.com/Conditions.aspx · regras de grau: https://2e.aonprd.com/Rules.aspx?ID=2287 · salvaguarda básica: https://2e.aonprd.com/Rules.aspx?ID=2297
- Paizo — API e licença do AoN: https://paizo.com/threads/rzs43f3f
- Arredondamento: https://roll20.net/compendium/pf2/Rules:General%20Rules%20%28Legacy%29
- Esclarecimento de mudança de grau (fórum): https://paizo.com/threads/rzs43bk5

