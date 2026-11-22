# Roteiro de teste na sala do Owlbear

Marque cada item. Quando algo falhar, anote o **número do passo**, o que apareceu e (se puder) um print.
Os testes com o Owlbear simulado já passaram; este roteiro cobre o que só a sala real mostra. **Recarregue a sala antes de começar** (o código mudou: cartão central, alcance, área).

## 0. Preparação

1. No PowerShell, na pasta do projeto: `npm run dev` (precisa ficar rodando). A porta tem de ser **5173**.
2. No Owlbear, no perfil, **remova** a extensão "Owlbear PF2e" e **adicione de novo** com `http://localhost:5173/manifest.json`.
   (O manifest ganhou a página de fundo; sem reinstalar, as barras sobre os tokens e a ferramenta de área não carregam.)
3. Abra uma sala **como mestre** (conta dona da sala). Importe a ficha da Linari (ID `487618`) na aba **Ficha**.
4. Para o teste de jogador (passos 9 e 10): abra a mesma sala numa **janela anônima** com outra conta, como jogador, e instale a extensão lá também.

**Esperado:** a aba Ficha mostra a Linari; no topo há as abas Ficha, Combate, **Criaturas** (só o mestre vê) e Dados.

## 1. Token da Linari

1. Selecione o token da Linari no mapa → aba Ficha → **Vincular ao token selecionado**.
2. Aplique **Dano 5**.

**Esperado:** o token mostra o nome, `CA 21 · PV 43/48` e a barra de PV (com 5 de dano). A ferramenta **Área PF2e** aparece na barra de ferramentas do mapa.

## 2. Criaturas: um modelo, vários tokens

1. Aba **Criaturas** → cadastre um modelo: Nome `Goblin`, CA `15`, PV `20`, Fort `5`, Ref `7`, Vont `3`, Percep `4`.
2. No mapa, selecione **3 tokens** (Shift ou arrastando). Clique em **Vincular aos tokens selecionados**.

**Esperado:**
- A lista **Em jogo (3)** mostra Goblin 1, Goblin 2, Goblin 3, cada um com PV 20/20.
- Cada token mostra o próprio nome e a linha `CA 15 · PV 20/20` (para o mestre).
- **Dano 8** no Goblin 1 não muda os outros dois.

## 3. Ataque simples com cartão

1. Por padrão a pergunta **já vem ligada para todos**: nada rola sem você confirmar. (Não há nada para ligar.)
2. Clique em **Ataque** da Bastard Sword. A faixa pede o alvo. Clique no token do Goblin 1.
3. Aparece "deseja rolar os dados?" com o alvo, o bônus e o dano. Clique em **Rolar dados**.

**Esperado:** um **cartão** com `d20 N +10 = total contra a CA do alvo → grau`, o dano (dobra no crítico), e na linha de baixo
`Penalidade: neste ataque: nenhuma · no próximo ataque: −5`. O cartão **não mostra a CA nem os PV** do Goblin. O token do Goblin 1 atualiza a barra.

4. Ataque de novo no mesmo goblin.

**Esperado:** o ataque sai com `−5` e o cartão diz `no próximo ataque: −10`.
5. Teste também **Cancelar** na pergunta: nada deve ser rolado, e o alvo continua escolhível.
6. **Rolagem automática: removida.** Todo ataque, teste e salvaguarda sempre pergunta antes de rolar (com o contador de bônus).

## 4. Magia de um alvo (acerto automático e ataque)

1. Conjure **Force Barrage** (rank 1) e clique num goblin.
2. Conjure **Needle Darts** (truque) e clique num goblin.

**Esperado:** Force Barrage gasta uma bolinha do rank 1 e aplica dano sem teste. Needle Darts rola ataque contra a CA. Em ambos, o cartão aparece.

## 5. Magia de área com salvaguarda

1. Conjure **Vomit Swarm** (rank 2). A faixa muda para "cone de 30 pés. Posicione no mapa".
2. Mova o mouse sobre o mapa.

**Esperado:** o contorno do cone acompanha o mouse, partindo do token da Linari.

3. Aponte para os 3 goblins e **clique**.

**Esperado:** os goblins dentro do cone ficam marcados ("3 alvo(s) marcado(s) (Goblin 1, ...)"). Clique num token para marcar/desmarcar. Se errar, **Posicionar área** reposiciona.

4. Clique em **Resolver (N)**.

**Esperado — o cartão:**
- uma linha de **dano rolado uma vez** (2d8);
- um bloco por goblin, com `Reflexos: d20 N +7 = total contra CD 20`, o grau, o multiplicador (×0, ×½, ×1, ×2) e o dano final;
- **sem PV dos goblins**;
- os PV reais de cada goblin (aba Criaturas) mudaram de forma diferente.

5. Confira que a bolinha do rank 2 foi gasta só ao resolver (e não ao cancelar com Esc).

## 6. Magia com efeitos (condições)

1. Conjure **Dizzying Colors** (rank 1, cone de 15 pés) e resolva em 2 ou 3 goblins.

**Esperado:** o cartão mostra o grau de cada um, o texto do efeito e as **Condições** (Atordoado 1, Cego, Ofuscado conforme o grau). Na aba Criaturas, as condições aparecem em fichinhas com **×** para remover.

## 7. Cura e ficha de jogador como alvo

1. Aplique Dano 20 no token do Zar (ou outra ficha vinculada). Conjure **Soothe** nele.

**Esperado:** o cartão mostra a cura e os PV restantes. Num alvo de ficha de jogador, o cartão **mostra** os PV (são públicos).

## 8. Emanação

1. Conjure **Necrotic Bomb** (magia de foco): emanação de 10 pés ao redor do token da Linari. Sem clique: a área aparece e marca os vizinhos.

## 9. Como jogador (janela anônima)

1. Importe uma ficha, vincule ao token dele e ataque um goblin.

**Esperado:** o cartão do jogador **não mostra CA nem PV** do Goblin. O token do goblin mostra só o **estado** (Ileso, Ferido, Muito ferido, Crítico, Caído) e uma barra aproximada, sem números.

2. Peça para o mestre fechar a aba e repita o ataque.

**Esperado:** depois de uns 6 segundos, "O mestre não respondeu".

## 10. Iniciativa e turnos

1. Aba **Combate** → role a iniciativa da Linari; no mestre, na aba Criaturas, **Iniciativa** de cada goblin.
2. **Iniciar combate** e **Próximo turno**.
3. Aplique **Amedrontado 2** na Linari e passe o turno dela.

**Esperado:** a ordem aparece para todos, o turno atual fica destacado, e o Amedrontado cai para 1 no fim do turno dela.

## O que mandar de volta se algo falhar

- O número do passo e o que você esperava versus o que aconteceu.
- A frase da faixa de status (a linha abaixo da faixa roxa), se houver erro em vermelho.
- Um print do mapa para problemas de posição (barras, texto ou área).
- Se o problema for no mestre ou no jogador.

Os pontos mais prováveis de precisar de ajuste: o desenho e o encaixe do cone, a posição do texto sob os tokens e o tamanho do cartão dentro do popover.

---

## Novidades para conferir (rodada mais recente)

### 11. Cartão no meio da tela, para qualquer rolagem
1. Clique numa **perícia** (por exemplo Ocultismo), numa **salvaguarda** e num **atributo** na aba Ficha.
2. Role um dado na aba **Dados** (d20 com bônus e CD).
3. Role a **iniciativa** na aba Combate.

**Esperado:** em cada um abre um cartão **no centro da tela** (não dentro do painel), com a rolagem (`d20 [14] +9 = 23`) e, havendo CD, `contra CD 20 → Sucesso`. Rolar de novo **troca** o cartão. O **×**, o Esc e um clique fora o fecham. Ataques e magias abrem o mesmo cartão com mais linhas.

### 12. Emanação: reposicionar
1. Conjure **Necrotic Bomb** (foco). A emanação aparece ao redor do seu token, sem clique.
2. Clique em **Posicionar área** e depois num ponto do mapa.

**Esperado:** o contorno acompanha o mouse (encaixado no centro das casas) e, ao clicar, a área muda de lugar e os tokens dentro dela são remarcados (agora o conjurador também conta, se estiver dentro). O cone, que já funcionou, deve continuar certo.

### 13. Alcance da explosão (área vermelha)
1. Conjure uma magia de **explosão** com alcance (qualquer uma com área tipo burst).
2. Passe o mouse mais longe que o alcance.

**Esperado:** o contorno fica **vermelho**; clicar mostra "Fora do alcance da magia (N pés)" e **não posiciona**. Voltando para dentro do alcance, o contorno volta a roxo e o clique funciona.

### 14. Alcance de magia de um alvo
1. Com a Linari vinculada a um token, conjure **Fear** (30 pés) e clique num goblin a **mais de 6 casas** de distância.
2. Depois num goblin mais perto.
3. Ligue **Vários alvos**, marque um perto e um longe.

**Esperado:** o longe é recusado com `Fora do alcance: Goblin 2 está a 45 pés e Fear alcança 30 pés.` e **nada é gasto**; o perto funciona e abre o cartão. No modo de vários alvos só o de perto fica marcado.

Medida: casas vizinhas (inclusive na diagonal) = 5 pés; 6 casas em linha = 30 pés.

### 15. Backup das criaturas (aba Criaturas)
1. Com alguns goblins cadastrados e em jogo, clique em **Exportar arquivo**. Deve baixar `criaturas-pf2e-AAAA-MM-DD.json`. Se o download não começar (o Owlbear pode bloquear), use **Copiar backup**: o texto vai para a área de transferência (ou aparece na caixa "Ver ou colar o texto do backup").
2. A frase "Último backup" deve mostrar a data e hora.
3. Aplique dano num goblin e apague um modelo. Depois clique em **Importar arquivo (mesclar)** e escolha o arquivo: o modelo apagado volta, e os goblins em jogo voltam ao PV do arquivo.
4. **Importar arquivo (substituir tudo)** pede confirmação e troca tudo pelo conteúdo do arquivo. (Uma cópia das criaturas anteriores fica guardada como segurança.)
5. Tente importar um arquivo qualquer (outro .json ou um texto): deve recusar com uma mensagem clara, sem alterar nada.
6. Os tokens que já estavam vinculados voltam a funcionar depois de importar (mesmo mapa).
7. Com criaturas cadastradas e nenhum backup (ou mais de 7 dias), aparece o aviso vermelho para exportar.

### 16. Durações das condições e Próximo round
1. Com a Linari e dois goblins na iniciativa, **inicie o combate**. No turno da Linari, conjure **Fear** num goblin até dar **falha crítica** (ou aplique à mão uma condição para ver o rótulo).
2. O cartão mostra `Amedrontado 3, Fugindo (1 rodada)`. Na aba Criaturas a fichinha vira `Fugindo · 1 rd`, e a tag sobre o token também.
3. **Próximo turno** até voltar ao turno da Linari: **Fugindo acaba** e a sala recebe "Goblin 1: Fugindo terminou." (o Amedrontado 3 fica; ele cai 1 no fim do turno do goblin).
4. Conjure **Dizzying Colors** (falha: Cego por 1 rodada): mesma contagem.
5. **Próximo round** (botão novo, ao lado de Próximo turno, só com o combate ativo): passa por todos os turnos que faltam, contando as condições de cada um, e abre o round seguinte. A sala recebe "Rodada N começou: turno de X. O MAP de todos foi zerado.".
6. Em cada jogador: depois do Próximo round, o ataque volta a ser o **nº 1** (sem −5). Também volta ao nº 1 quando chega o turno da própria personagem.
7. Remover uma condição pelo ×/− tira também o tempo dela.

Limites: durações longas (1 hora, até o descanso) só aparecem como rótulo; Atordoado, Lento e Morrendo ainda não perdem ações sozinhos.

### 17. Ajustes rápidos de interface (toque e organização)
1. **Seções recolhíveis na Ficha:** toque no título de cada bloco (Pontos de vida, Condições, Atributos, Perícias, Ataques, Magias…) para abrir ou fechar. Atributos, Perícias e Token começam **fechados**; o resto, aberto. Recarregue a sala: a escolha de cada bloco deve ficar lembrada.
2. **PV com um toque:** no bloco Pontos de vida, os botões **−5 −1 +1 +5** tiram ou curam na hora (o PV temporário absorve o dano primeiro), sem digitar.
3. **Barra de ação embaixo:** a pergunta "deseja rolar os dados?" e a escolha de alvo agora ficam **abaixo do painel**, fora da rolagem, e **só uma aparece por vez** (enquanto a pergunta está aberta, a faixa de alvo se esconde e volta depois). O aviso vermelho de alcance fica dentro dela.
4. **Toque:** num celular ou tablet (tela de toque), botões, caixas e seleções têm pelo menos 44 px, com 8 px de folga. No computador ficam um pouco maiores que antes (36 px).

### 18. Abas por tarefa e cabeçalho fixo
**Reinstale a extensão** (o manifest mudou: o painel ficou mais alto, 600 px).
1. Abas novas: **Agir** (ataques, magias, foco), **Testes** (atributos, salvaguardas, perícias e dados avulsos), **Ficha** (PV, condições, token, importar, descansar), **Combate** e **Mestre** (só o mestre; criaturas, backup e backup). Antes havia Ficha, Combate, Criaturas e Dados.
2. **Cabeçalho fixo** em todas as abas: nome, classe, PV com barra, CA e até 4 condições. Tocar nele abre a aba Ficha.
3. Sem ficha importada, o painel abre na aba Ficha. Com ficha, abre em **Agir**. Selecionar um token vinculado também leva para Agir.
4. O campo **Alvo (CD/CA)** aparece em Agir e em Testes e é o mesmo valor nos dois.
5. A linha de status (erros e resumos) agora fica **na barra de baixo**, visível em qualquer aba.
6. **Celular ou tablet:** a barra de abas vai para **baixo** da tela. No computador ela fica em cima.

### 19. Cartão de magia, "Mostrar a todos" e Barreira de Músculos
1. Na aba **Agir**, **toque numa magia** (por exemplo Fear ou Bless). Abre **no meio da tela** o cartão "o que esta magia faz": rank, tradições, traços, ações (◆ ◆◆ ◆◆◆, reação), alcance, área, alvos, duração, descrição (em inglês, como no Foundry) e uma linha dizendo **o que a extensão automatiza** (ou "Sem automação").
2. **Conjurar** só acontece ao clicar no botão **Conjurar** do cartão: o cartão fecha e o fluxo de sempre começa (alvo, pergunta, cartão de resultado).
3. O botão discreto **Mostrar a todos** (rodapé, canto direito, em todos os cartões, inclusive ataques e magias): o mesmo cartão aparece no meio da tela de **todos os outros** na sala, com "Mostrado por NOME" e sem o botão Conjurar. Teste com uma janela de jogador.
4. **Barreira de Músculos** (Muscle Barrier, magia de foco da Linari): Conjurar → escolha o alvo (**pode ser você mesma ou um aliado**, até 30 pés). Concede **20 PV temporários** (10 base + 10 por rank acima do 1º; magia de foco no nível 4 = rank 2). Os PV temporários **não acumulam** (vale o maior). O cartão mostra "PV temporários +20". O +1 de Atletismo e a perda do servo (thrall) ficam com você.

### 20. Bestiário do mestre (aba Mestre)
1. **Busca** por nome, traço, pasta ou nota; **ordenar** por nome ou nível; filtros de **pasta** e de **traço**; ★ **Favoritas**.
2. Cada criatura é uma linha com ★, nome, nível, CA e PV, e o botão **Vincular**; toque na linha para **abrir a ficha**: traços, salvaguardas, Percepção, deslocamento, imunidades/resistências/fraquezas, ataques, notas e origem. Botões: Vincular aos tokens selecionados, Editar, **Duplicar**, Remover.
3. As criaturas ficam em **pastas** (grupos) que abrem e fecham. "Sem grupo" fica por último.
4. **+ Nova criatura:** nome, nível, CA, PV, salvaguardas, Percepção, deslocamento, **pasta** (com sugestões das já usadas) e **traços** (separados por vírgula).
5. **Importar do Foundry:** digite o nome **em inglês** (Goblin Warrior, Skeleton Guard…). Traz nível, CA, PV, salvaguardas, Percepção, traços, deslocamento, ataques e defesas, e põe na pasta do livro (por exemplo "Monster Core"). Nome que não existe mostra um aviso claro.
6. Editar uma criatura importada **mantém** os ataques e a origem. O **backup** (Exportar/Importar) leva todos os campos novos.

### 21. Tocar no token de uma criatura (mestre)
1. Com criaturas vinculadas a tokens, **toque num token de criatura** no mapa (como mestre). O painel vai sozinho para a aba **Mestre**, rola até o cartão dessa criatura em **Em jogo**, destaca com um contorno roxo por uns segundos e **abre a ficha completa** dela (traços, números, defesas, ataques, notas).
2. Tocar no token de um **jogador** continua abrindo a ficha dele na aba Agir.
3. Em **Em jogo**, cada criatura também tem "Ficha completa" para abrir e fechar à mão. A escolha fica lembrada enquanto o painel está aberto.

### 22. Histórico na barra da direita (todos)
1. À direita da tela há um botão redondo com um **pergaminho**. Toque nele: abre a barra **Histórico** com as rolagens e avisos da mesa (mais recentes no topo). Toque de novo (ou no **×**, ou Esc) para fechar. Vale para mestre e jogadores.
2. O painel principal não tem mais a lista de rolagens, e os balões de rolagens e avisos foram removidos (só o histórico mostra). Erros ainda aparecem como aviso.
3. Com a barra **fechada**, cada rolagem nova acende uma bolinha vermelha com a contagem no pergaminho; ao abrir, zera.
4. Os **nomes** dos jogadores aparecem claros e legíveis, mesmo com cores escuras.
5. **Limpar** apaga o histórico só no seu navegador. O histórico guarda as últimas 100 entradas.
6. Se o botão cobrir algo do Owlbear no seu monitor, me diga a posição que prefere (hoje: 82 px da borda direita, 110 px do topo).

### 23. Tema "grimório"
Confira nos dois painéis e nos cartões: fundo escuro com detalhes dourados, títulos em Cinzel, CA em escudo, abas com ícones (barra de baixo no celular) e contornos legíveis. Reporte o que ficar apertado ou ilegível.

### 24. Cada jogador só abre a própria ficha
1. O jogador coloca o **próprio token** no mapa, importa a ficha dele (Ficha) e usa **Vincular ao token selecionado**. Num token que ele não colocou, aparece o aviso "só pode vincular a um token seu".
2. Depois de vinculado, ao reabrir a extensão a ficha **já vem fixa** ("Ficha fixada ao seu token") e o campo de importar some.
3. Tocar no token de **outro jogador** não abre a ficha dele. O **mestre** (dono da sala) abre qualquer ficha tocando no token.
4. Tokens vinculados antes desta versão valem para quem os criou.

### 25. Engrenagem de visibilidade das criaturas (mestre)
1. Em **Em jogo**, cada criatura tem uma engrenagem **⚙**. Ela abre "Visível aos jogadores" com seis opções separadas: **o token no mapa**, **o nome**, **a barra e o estado de PV (sem números)**, **os PV em números**, **as condições nas fichinhas** e **a CA (escudinho no token)**.
2. **Padrão** de uma criatura recém-vinculada: token **escondido** dos jogadores, nome "Criatura", sem condições, sem números. A **barra de PV** aparece (só com o estado: Ileso, Ferido…).
3. Marque cada opção e confira, numa janela de jogador, que só aquilo muda: o token surge/some, o nome real aparece, os PV viram "PV 12/20", as condições voltam como fichinhas.
4. O mestre sempre vê tudo (CA, PV, condições). A CA só aparece para os jogadores se a opção da CA estiver ligada (padrão: escondida).
5. Criaturas vinculadas antes desta versão passam a usar o padrão acima (nome "Criatura" até você ligar a opção).

### 26. PV dentro da barra, CA no escudinho e bônus de CA
1. No token vinculado, os **PV em números** ficam **dentro da barra** (ex.: "12/48 +5" com PV temporários). Sob o token fica só o nome.
2. A **CA** aparece num **escudinho ao lado esquerdo** do token (as fichinhas de condição continuam à direita). Nas criaturas, só o mestre vê o escudo; os jogadores nunca veem a CA.
3. **Erguer o escudo:** quem tem escudo na ficha (Pathbuilder) vê, na aba Agir, o botão "Erguer o escudo (CA +N)". Ao usar, a CA sobe N (no cabeçalho, na ficha e no escudinho), aparece a fichinha "Escudo erguido" e o bônus **cai no início do seu próximo turno** (na aba Combate). Clicar de novo abaixa o escudo.
4. **Truque Escudo (Shield):** ao lançar (Linari tem preparado), a CA sobe **+1** até o início do seu próximo turno. Bônus de circunstância **não acumulam**: com o escudo erguido (+2) e a magia (+1) vale o maior (+2).
5. Condições continuam mexendo na CA: Desprevenido/Caído −2 (circunstância, soma com o bônus do escudo), Amedrontado/Fatigado (status).
6. Um ataque contra o personagem usa a CA **já com** o escudo.

### 27. Alcance das áreas (emanação e explosão)
Na grade, uma **emanação de 10 pés** cobre **2 casas** em volta do conjurador (um quadrado); a 3ª casa fica de fora. Teste com a Necrotic Bomb: um token **colado** (5 pés) e um a **2 casas** (10 pés) são atingidos; a **3ª casa** (15 pés) e a diagonal da 3ª casa **não**. O conjurador não é atingido. Uma **explosão de 20 pés** cobre 4 casas a partir do centro; a 5ª fica de fora.

### 28. Bônus extra e ajustes manuais
1. O campo **Alvo (CD/CA)** saiu da aba Agir: ataques escolhem o alvo pelo **token** no mapa. Na aba **Testes** ele virou **CD do teste** (opcional), para testes de perícia contra uma CD.
2. **Bônus extra (próxima rolagem)** está em Agir e em Testes (é o mesmo campo). Digite, por exemplo, +2 (ou −1) e role: o bônus entra **só nessa rolagem** e o campo volta a zero. Em testes, o cartão mostra "(bônus extra +2)".
3. Na aba **Ficha**, o bloco **Ajustes manuais** corrige dados: **Ajuste de CA** (ex.: +1 num lugar que dá bônus de defesa) e **Ajuste de PV máximo**. Mudam a CA no cabeçalho, na ficha, no escudinho do token e a CA usada contra ataques. Apagar o número desfaz o ajuste.

### 29. Área visível a todos, escudo no canto e toque no token (mestre)
1. **Área de magia para todos:** ao posicionar a área (cone, explosão, emanação), ela aparece **também para os outros jogadores** na hora em que é posicionada (a prévia seguindo o mouse é só de quem conjura). Depois de resolver, ela some para os outros em cerca de 6 segundos. Se estiver fora do alcance (vermelha), não é mostrada.
2. **Escudo da CA** agora fica no **canto inferior direito** do token, encostado na ponta da barra de PV.
3. **Mestre toca num token de criatura:** vai para a aba Mestre, **abre a seção "Em jogo"** se estiver recolhida, rola até o cartão da criatura, destaca e abre a ficha completa.

### 30. Criaturas sem dados
1. (A rolagem automática foi removida; o flanqueio fica sempre no cartão de confirmação.)
2. Na aba **Mestre**, em **Em jogo**, aparece um aviso vermelho quando há tokens ligados a criaturas que **não existem neste navegador** (causa do erro "sem dados cadastrados"). O botão **Desvincular esses tokens** limpa o vínculo para vincular de novo a partir do bestiário.

### 31. Dano personalizado por arma e contador de bônus antes de rolar
1. Em **Agir > Ataques**, cada arma tem uma engrenagem **⚙**. Ela abre o editor de **modos de dano**: o primeiro é o da ficha; use **+ Novo modo** para criar outros (por exemplo "Duas mãos" 1d12+3, ou "Com Ikon" 1d12+5), com nome e fórmula (`1d12+5 slashing`). Marque o círculo do modo em uso.
2. O botão **Dano** mostra a fórmula do modo em uso e rola esse dano. O **ataque aplica o dano do modo escolhido sozinho** ao acertar, inclusive o dobro no crítico. Fórmula inválida mostra um aviso e não é salva.
3. **Perícias, atributos, salvaguardas e Percepção** agora **perguntam antes de rolar** e têm um **contador de bônus** (− e +, ou digite) para somar ou subtrair só naquela rolagem. O mesmo contador está na confirmação de ataque. O cartão mostra "(bônus +2)".

### 32. Ícone da ferramenta de área
O ícone roxo "Área PF2e" **não fica mais na barra de ferramentas**. Ele aparece só enquanto você posiciona uma área de magia (cone, explosão, linha) e some quando a área é posicionada, cancelada (Esc) ou resolvida. O posicionamento funciona igual: clique no mapa, fora do alcance fica vermelho, Esc cancela.

### 33. Pesquisar criaturas do Foundry (mestre)
1. Aba **Mestre > Importar do Foundry**: ao abrir, a extensão baixa **uma vez** a lista de criaturas dos pacotes (Monster Core, Bestiários 1 a 3, NPC Core, etc.) e guarda por 7 dias. Na primeira vez pode levar alguns segundos.
2. **Digite** parte do nome em inglês (ex.: `goblin`, `wolf`, `skeleton guard`): aparece a lista de resultados com o pacote de cada um. **Toque no resultado** para importar (nível, CA, PV, salvaguardas, ataques…). Pode usar várias palavras em qualquer ordem.
3. O botão "Buscar e adicionar" (nome exato) continua funcionando.
4. Se o GitHub limitar os pedidos, aparece um aviso para tentar de novo em alguns minutos.

### 34. Ataques automáticos das criaturas (mestre)
1. Em **Mestre > Em jogo**, cada criatura com ataques tem o bloco **Atacar (automático)**, com um botão por ataque (ex.: "Fangs +19 (2d12+10 piercing)"), o contador **Ataque nº** (com **Novo turno**), um campo de **Bônus** e a caixa **Alvo flanqueado**.
2. Toque no ataque e **selecione no mapa o token do alvo** (um jogador ou outra criatura), como os jogadores fazem. O sistema rola contra a CA (com condições, flanqueio e penalidade de ataques múltiplos: −5/−10, ou −4/−8 em ataque ágil), **aplica o dano** (PV temporários primeiro) e mostra o cartão **para todos**. A CA e os PV de criaturas continuam secretos nos cartões.
3. O contador de ataques volta a 1 com **Novo turno**, ou sozinho quando a rodada muda (Próximo turno / Próximo round na aba Combate).
4. Dano com mais de um dado ("2d6+4 slashing + 1d6 fire") automatiza só o primeiro; dano não lido aparece como "dano manual".
5. **Rolar iniciativa de todas** (em Em jogo) rola Percepção + d20 de todas as criaturas e as coloca na iniciativa de uma vez. Nos dois casos, o nome na iniciativa respeita a engrenagem (escondido = "Criatura").

### 35. Cabeçalho da aba Mestre e condições à mão
1. Na aba **Mestre**, o cabeçalho da ficha do mestre (nome, PV, CA) **some**, ganhando espaço. Ao tocar num token de criatura, o cabeçalho passa a mostrar **só a criatura em foco** (nome, PV, CA e condições). Ao sair da aba, volta o cabeçalho da ficha.
2. Em cada criatura de **Em jogo**, a linha **[condição] [valor] [rodadas] [Valor −1 por rodada] + Condição** aplica uma condição à mão. Com **rodadas**, ela acaba sozinha depois desse tempo (contado no início do turno de quem sofre). Com **Valor −1 por rodada**, o valor cai 1 no fim do turno dele até acabar (aparece "−1/rd"). **Amedrontado** já cai 1 por turno sozinho.
3. **Atordoado** segue a regra do PF2e: no início do turno de quem sofre, o valor cai pela quantidade de ações perdidas (até 3) e acaba.
4. Entraram condições que faltavam: Petrificado, Acelerado, Controlado, Sobrecarregado, Não detectado, Despercebido e Dano persistente. A contagem funciona para quem está na iniciativa (criaturas entram com **Iniciativa** ou **Rolar iniciativa de todas**).

### 36. Bestiário em janela grande
1. Na aba **Mestre**, o botão **Abrir bestiário (tela grande)** abre uma janela grande **no meio da tela** com a busca, os filtros, **Importar do Foundry** (com pesquisa por nome), **+ Nova criatura** e a lista de modelos. A aba Mestre fica só com **Em jogo**, iniciativa e backup.
2. **Selecione os tokens no mapa antes** de abrir (a janela cobre parte do mapa) e toque em **Vincular** na criatura escolhida. As criaturas novas aparecem em **Em jogo** na hora, sem fechar a janela. Feche com **×** ou **Esc**.
3. Na importação do Foundry, digite parte do nome em inglês (ex.: `wolf`, `dragon`) e toque no resultado.

### 37. O que a condição muda some junto com ela
Ao acabar a condição (tempo contado na aba Combate, ou removida à mão), a **CA** e o **PV máximo** voltam ao normal na ficha, no cabeçalho, no escudinho do token e para os ataques contra o personagem. Teste: lance Escudo (CA 21 → 22), passe o turno/rodada até a fichinha sumir e confira que a CA voltou a 21 em todo lugar. Vale também para Desprevenido, Caído, Fatigado, Drenado e Escudo erguido. Fichas salvas antes desta versão passam a se corrigir sozinhas quando o personagem faz qualquer ação ou é importado de novo.

### 38. Habilidades das criaturas (mestre)
1. Criaturas importadas do Foundry trazem suas **habilidades com salvaguarda** já cadastradas (ex.: Breath Weapon: Reflexos CD 30 básica, 12d6 ácido, linha de 80 pés; Frightful Presence: Vontade CD 28, emanação de 90 pés, Amedrontado). Em **Em jogo**, o bloco **Habilidades (automáticas)** lista cada uma com um botão **Usar**.
2. **Selecione no mapa os alvos** (Shift para vários) e toque em **Usar**: o sistema rola a salvaguarda de cada alvo contra a CD, rola o dano **uma vez** para todos, aplica ×0/×½/×1/×2 (básica) e as **condições** na falha. O cartão aparece para todos; a CA e os PV de criaturas continuam secretos.
3. **+ Nova habilidade** cadastra à mão: nome, salvaguarda, CD, básica ou não, dano (`12d6 acid`), área (cone, linha, explosão, emanação), condição na falha com valor e duração. O **×** remove.
4. **Habilidades com área** (cone, linha, explosão, emanação): **Usar** abre a **área no mapa**, como nas magias dos jogadores (cone e linha saem do token da criatura; a emanação já sai dela; Esc cancela). Os tokens de dentro entram numa **lista de alvos** sob a habilidade; você **ajusta**: selecionar um token novo o adiciona, selecionar um da lista o tira (ou toque no × do alvo). **Resolver (N)** rola tudo; **Cancelar** descarta. **Alvos à mão** pula a área e deixa você montar a lista selecionando os tokens (Shift para vários). A área fica visível para **todos** enquanto você posiciona e por alguns segundos depois de resolver.

### 39. Rolagem automática removida e botão Histórico
1. Não existe mais a opção de rolagem automática (nem para o mestre, nem para o jogador): tudo pergunta antes de rolar.
2. O botão **Histórico** abre e fecha a barra da direita e **não esconde mais o painel** (antes ele deixava a janela vazia).
3. O dano de um ataque vai primeiro para os **PV temporários**; por isso um ataque pode "não tirar PV" se o alvo tinha PV temporários (o cartão e o histórico mostram "PV de X: a/b").

### 40. Lixeira para remover criaturas
1. No **bestiário (janela grande)**, cada modelo tem um ícone de **lixeira** ao lado de Vincular: remove o modelo do bestiário (pede confirmação). Serve para apagar duplicatas. As criaturas já em jogo continuam.
2. Em **Mestre > Em jogo**, cada criatura tem uma lixeira no cabeçalho: **desvincula do token e remove** a criatura (pede confirmação).

### 41. Habilidades pelo mesmo sistema dos jogadores
**Usar** numa habilidade abre a **mesma faixa de alvos** das magias dos jogadores (Posicionar área, Vários alvos, Resolver, Limpar, Cancelar): a área no mapa (visível a todos), a seleção de tokens, a confirmação "Rolar dados" com o contador de bônus e o cartão com o resultado (que aparece para todos). Substitui a lista de alvos própria que a habilidade tinha antes.

### 42. Imunidades, fraquezas e resistências
O dano das criaturas do mestre passa a ser ajustado **por tipo** (ataques, magias de salvaguarda e acerto automático): primeiro os multiplicadores (crítico ×2, salvaguarda básica), depois **imunidade** (zera), **fraqueza** (soma) e **resistência** (subtrai, mínimo 0; só a maior por tipo). "Físico" cobre cortante/perfurante/contundente; "exceto" é respeitado quando é um tipo de dano. Imunidade a acertos críticos devolve o dano crítico ao normal. O cartão mostra a linha **Defesas** (ex.: "resistência fire 5: −5"); para criaturas secretas aparece só "o dano foi ajustado pelas defesas do alvo". Fichas de jogador ainda não têm defesas.

### 43. Tradução nos cartões de magia
No cartão "o que esta magia faz", o botão **Traduzir para PT-BR** traduz a descrição (serviço gratuito MyMemory, com glossário de termos de regra e cache no navegador); **Ver original (inglês)** volta. Se você clicar em **Mostrar a todos** com a tradução na tela, o cartão chega **já traduzido** para os outros (que também podem ver o original). Tradução automática: confira termos de regra. Se o limite diário do serviço acabar, o cartão avisa.

### 44. Talentos e características na ficha
Na aba **Ficha**, a seção **Habilidades** lista os talentos importados do Pathbuilder (classe, ancestralidade, perícia, geral, herança, concedidos) e as **características de classe e ancestralidade**. Tocar num item abre o cartão com a descrição do Foundry (ações, traços, pré-requisitos), o botão **Traduzir para PT-BR** e **Mostrar a todos** (que envia traduzido se estiver traduzido). O que o Foundry não tem (ex.: Thralls, Nephilim) mostra um link para o Archives of Nethys. Fichas importadas antes desta versão precisam ser **reimportadas** para ganhar as características de classe.

### 45. Criar criaturas com o mesmo esquema da importação
No bestiário, **+ Nova criatura** (e **Editar**) agora tem os mesmos campos de uma criatura importada do Foundry: além dos números, **Imunidades, Resistências e Fraquezas** (textos separados por vírgula, ex.: `fire 5`), a lista de **Ataques** (nome, bônus, dano, traços) e as **Habilidades** automáticas (CD, salvaguarda, dano, área, condição). Ataques e habilidades ficam num rascunho e só valem ao **Cadastrar**/**Salvar alterações**. Editar uma criatura importada também permite mudar essas listas.

### 46. Painel do mestre mais limpo
Em **Mestre**, cada criatura em jogo é uma **linha só** (nome, CA, PV, estado, ⚙ e lixeira); toque para abrir. Aberta, mostra salvaguardas, condições ativas e a linha **Dano/Cura/Temp./Iniciativa/Ver no mapa**; **Ataques**, **Habilidades**, **Aplicar condição** e **Ficha completa** são grupos que abrem só quando você precisa. Tocar no token de uma criatura abre o cartão dela. O **Backup** ficou recolhido e os textos de ajuda foram removidos.

### 47. Iniciativa só das criaturas marcadas
Em **Mestre > Em jogo**, cada criatura tem uma **caixinha** à esquerda. Marque as que entram na iniciativa: ao marcar, aparece um campo para **digitar a iniciativa** (vazio = rola d20 + Percepção, com as condições). **Iniciativa das marcadas (N)** coloca todas de uma vez; **Marcar todas/Desmarcar todas** ajuda. O botão **Iniciativa** de dentro do cartão também usa o valor digitado. Substitui o antigo "Rolar iniciativa de todas".
