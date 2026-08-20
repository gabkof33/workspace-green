# Central Green — Operação de TI

Workspace de gestão de demandas de TI cobrindo quatro pilares: central de chamados
com SLA, demandas de engenharia com cronograma, rotinas preventivas de operação, e
inventário de ativos com base de conhecimento.

A especificação de arquitetura que orienta este código está no blueprint:
schema relacional, matriz de prioridade, esteiras de estado, regras de automação
e estrutura de CMDB.

## Duas unidades de trabalho

O sistema separa deliberadamente dois tipos de coisa, porque elas têm
governança diferente:

| | **Chamado** | **Demanda** |
| --- | --- | --- |
| Natureza | Algo quebrou ou alguém precisa de um serviço | Trabalho planejado de melhoria |
| Governança | SLA cronometrado, pausa e retomada | Cronograma com início e entrega |
| Prioridade | Derivada de impacto × urgência | Escolhida no registro |
| Atribuição | Roteada para uma fila | Escolhida por quem vai fazer |
| Exemplo | "ERP fora do ar" | "Melhorar o layout da tela de pedidos" |

Demanda é onde entram pedidos como *organizar os endpoints GET da API* ou
*automatizar a conferência de backup*. Quem publica define o prazo; quem pega
assume esse prazo. O cronograma em Gantt mostra as duas coisas ao mesmo tempo:
quanto do prazo já passou e quanto do trabalho andou.

## Stack

| Camada       | Escolha                                                        |
| ------------ | -------------------------------------------------------------- |
| Runtime      | Node.js 24                                                      |
| Build        | Vite 6                                                          |
| Linguagem    | TypeScript 5 em modo estrito, com projetos separados             |
| Interface    | HTML, CSS e DOM nativo — sem framework                          |
| Dados        | Supabase (PostgreSQL 15, Auth, RLS)                             |
| Configuração | JSON para catálogo de serviços e formulários dinâmicos          |

Sem framework de UI por decisão: a aplicação é orientada a formulário e tabela,
e o custo de um framework não se paga aqui. O módulo `src/lib/dom.ts` cobre a
construção de elementos, e escapa texto por construção.

### Configuração do TypeScript

Três arquivos, no formato de referências de projeto do Vite:

| Arquivo | Cobre | Por quê |
| --- | --- | --- |
| `tsconfig.json` | — | Só aponta para os outros dois |
| `tsconfig.app.json` | `src/` | Libs de DOM, **`"types": []`** |
| `tsconfig.node.json` | `vite.config.ts` | Libs de Node, `"types": ["node"]` |

O `"types": []` no projeto da aplicação é o ponto que mais importa: sem ele,
`@types/node` vaza para o código do navegador e `process`, `Buffer` e `fs`
passam no typecheck sem existir em runtime — o erro só aparece em produção.

O `exclude` de `**/*.gerado.ts` também é deliberado: arquivos gerados por
redirecionamento de saída podem conter qualquer coisa que o comando imprima, e
não devem derrubar a compilação.

## Como rodar

```bash
npm install
cp .env.example .env.local   # já vem preenchido para o projeto atual
npm run dev
```

A aplicação sobe em `http://localhost:5173`.

Outros comandos:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + build de produção em dist/
npm run preview     # serve o build de produção
```

## Hierarquia e promoção

Dois eixos separados, deliberadamente:

- **`papel`** — controle de acesso. Quem vê a fila de atendimento, quem administra.
- **`hierarquia`** — cadeia de comando. Quem responde por quem, e quem promove.

Um agente N3 pode ser colaborador; um coordenador pode não atender chamado nenhum.

| Nível | Insígnia | Pode alterar |
| --- | --- | --- |
| Coordenador | Losango | Qualquer pessoa, qualquer campo |
| Gestor | Escudo | Apenas colaboradores; não concede papel de gestor nem admin |
| Colaborador | Círculo | Ninguém |

A insígnia aparece no perfil, na lista de pessoas, nas sugestões de menção e
nos comentários — inclusive quando alguém passa uma demanda. A forma carrega a
mesma informação que a cor, então os três níveis continuam distinguíveis por
quem não diferencia cores.

**Senioridade** é um terceiro campo, independente: estagiário, júnior, pleno,
sênior, especialista, executivo.

### As travas moram no banco

A tela Pessoas esconde o que não adianta tentar, mas quem recusa é a trigger
`fn_validar_alteracao_perfil`:

- ninguém altera o próprio papel, hierarquia ou senioridade — nem o coordenador.
  Promoção é sempre ato de outra pessoa, e é isso que deixa rastro legível na
  auditoria;
- só coordenador promove alguém a coordenador;
- gestor não concede papel de gestor nem de administrador;
- toda promoção carimba `promovido_em`, notifica quem foi promovido e grava
  antes/depois em `auditoria`.

### Confirmação de e-mail

Por padrão o projeto Supabase exige confirmação de e-mail no cadastro. A conta
e o perfil são criados na hora, mas o login fica bloqueado até o link ser
aberto — e o SMTP embutido do Supabase é limitado a poucas mensagens por hora,
além de frequentemente não entregar em domínio corporativo.

Três saídas, em ordem de praticidade:

1. **Desligar a exigência** em *Authentication → Providers → Email*, tirando
   *Confirm email*. Adequado para uso interno com cadastro por e-mail
   corporativo.

2. **Confirmar manualmente** pelo SQL Editor, quando for um caso isolado:

   ```sql
   update auth.users
   set email_confirmed_at = now()
   where email = 'pessoa@igreenenergy.com.br'
     and email_confirmed_at is null;
   ```

3. **Configurar um SMTP próprio** em *Project Settings → Authentication → SMTP*.
   É o certo para produção — sem isso a entrega nunca será confiável.

Na tela de login, quando o erro for de e-mail não confirmado, aparece um botão
de reenvio abaixo do formulário.

### A primeira conta

Com o banco vazio, a primeira pessoa a se cadastrar entra como **coordenador e
administrador**. Sem isso o sistema nasceria travado: ninguém teria poder de
promover ninguém. Da segunda conta em diante, todo mundo entra como
colaborador solicitante.

A tela de cadastro detecta essa condição (`sistema_vazio()`) e avisa quem está
entrando.

## Primeiro acesso

Crie a conta pela aba **Criar conta** da própria tela de acesso. Sendo a
primeira do sistema, ela entra como coordenador e administrador — ver *A
primeira conta*, acima.

Para vincular alguém a uma equipe (necessário para atuar na fila e para ver o
canal de conversa daquela equipe), use a tela **Pessoas**, ou o SQL Editor:

```sql
update perfis set equipe_id = (select id from equipes where nome = 'Service Desk')
where email = 'pessoa@igreenenergy.com.br';
```

Número do chamado, fila, prazos e prioridade são resolvidos pelo Postgres — o
frontend só envia título, descrição, serviço, impacto e urgência.

### Regenerar os tipos após uma migration

O comando lê o schema pela API de gerenciamento da Supabase, então precisa de um
**Personal Access Token** da sua conta — a chave publicável do `.env.local` não
serve, porque ela identifica o aplicativo, não você.

Gere o token em [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
e registre-o como variável de ambiente do usuário, uma vez só:

```powershell
[Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'sbp_seu_token', 'User')
```

Abra um terminal novo depois disso — variáveis de ambiente só entram em sessões
iniciadas após a gravação. Alternativa por sessão:

```powershell
$env:SUPABASE_ACCESS_TOKEN = 'sbp_seu_token'
```

Ou, se preferir o fluxo interativo do CLI: `npx supabase login`.

Com o token no lugar:

```bash
npm run types:db
```

A saída vai para `supabase/database.gerado.ts`, **fora de `src/`** e no
`.gitignore`. Isso é deliberado: o arquivo é gerado por redirecionamento de
saída, e qualquer coisa que o comando imprima — um prompt do `npx`, uma
mensagem de erro — acaba gravada dentro dele. Fora de `src/` isso não quebra o
`npm run typecheck`.

Quem vale para a aplicação é `src/types/database.ts`, mantido à mão. A forma
gerada usa auto-referência (`Update: Partial<Database[...]["Insert"]>`), que
cria circularidade e faz o cliente inferir `never` em `.insert()` e
`.update()` — por isso os tipos de cada tabela ficam içados para nomes
próprios. Use o arquivo gerado para conferir o que mudou e replique o ajuste.

## Sem dados de demonstração

O sistema começa vazio e é alimentado pelo uso. Não há modo mock, seed de
exemplo nem `localStorage` fazendo as vezes de banco: toda leitura e escrita
passa pelo Postgres, sob RLS.

O que já vem no banco é **configuração**, não dado transacional — 12 serviços
de catálogo, 4 políticas de SLA, 5 equipes e 2 calendários. Sem isso não há
como abrir chamado nenhum, porque o catálogo é o que define fila, prazo e
formulário. Chamados, demandas, pessoas, ativos e notificações começam em zero.

## Estrutura

```
src/
  main.ts                 Ponto de entrada: sessão, rota e shell
  lib/
    api.ts                Sessão, cadastro, pessoas, catálogo, chamados
    demandas.ts           Demandas, comentários e notificações
    cmdb.ts               Ativos e grafo de dependências
    rotinas.ts            Rotinas, runbooks e execuções
    conhecimento.ts       Artigos e erros conhecidos
    painel.ts             Indicadores e comparação com metas
    supabase.ts           Cliente tipado e tradução de erros do banco
    prioridade.ts         Matriz impacto × urgência e políticas de SLA
    formato.ts            Datas, prazos e rótulos de domínio
    dom.ts                Construção de elementos e notificações
    router.ts             Roteamento por hash
  components/
    shell.ts              Navegação, cabeçalho, tema, sino
    tabela-chamados.ts    Tabela com barra de SLA
    campo-mencao.ts       Área de texto com menção por @
    insignia.ts           Ícone de hierarquia
  pages/
    login.ts              Entrar, criar conta e login Microsoft
    abrir.ts              Formulário de abertura em 4 etapas
    fila.ts               Fila do agente com métricas
    meus.ts               Portal do solicitante
    chamado.ts            Detalhe, linha do tempo e encerramento
    demandas.ts           Quadro de demandas e registro
    demanda.ts            Detalhe, progresso e discussão
    gantt.ts              Cronograma
    pessoas.ts            Organograma e promoção
    ativos.ts             CMDB
    rotinas.ts            Rotinas, runbook e execução
    conhecimento.ts       Artigos e KEDB
    painel.ts             Governança
  styles/
    tokens.css            Cor, tipografia e espaçamento
    base.css              Reset e elementos nativos
    layout.css            Shell e grades
    components.css        Botões, campos, cartões, tabelas, Gantt
  types/
    dominio.ts            Tipos do domínio
    database.ts           Tipos do schema Supabase
```

## Identidade visual

Verde e preto. O verde (`--c-accent`) é o acento da marca; o preto aparece no
logotipo e como fundo no tema escuro. A semântica de prioridade — vermelho,
âmbar, azul, cinza — fica deliberadamente **fora** da família verde: um P1 não
pode parecer positivo. Todas as cores saem de `src/styles/tokens.css` e nenhum
componente declara hex literal.

Os três estados de tema são cobertos: claro, escuro e "seguir o sistema".

## Decisões que sustentam o modelo

**Prioridade é derivada, nunca digitada.** `calcularPrioridade()` reproduz no
frontend a função `calcular_prioridade()` do Postgres, apenas para dar retorno
imediato ao usuário. O valor gravado é sempre o que o banco calcula, porque
`chamados.prioridade` é coluna gerada. Se divergirem, o banco vence.

**O formulário não pergunta urgência.** Pergunta quantas pessoas foram afetadas
e se a pessoa consegue trabalhar — fatos observáveis. Perguntada de forma direta,
a urgência vira sempre "alta" e a matriz perde o sentido.

**Regras de integridade moram no banco.** A trava que impede fechar chamado sem
causa raiz e solução existe aqui como validação de interface, mas a que vale é o
`CHECK constraint` no Postgres. Regra que mora só no frontend é contornada pela
primeira importação de planilha.

## Próximas fases

| Fase | Entrega                                               | Estado                          |
| ---- | ----------------------------------------------------- | ------------------------------- |
| F1   | Núcleo: perfis, hierarquia, calendários, auditoria, RLS | **aplicada**                  |
| F2   | Catálogo de serviços, SLA e horário útil              | **aplicada** — 12 serviços      |
| F3   | CMDB, grafo de dependências e contratos               | **aplicada** — com interface    |
| F4   | Chamados, interações e relógio de SLA                 | **aplicada**                    |
| F5   | Automações R-03, R-07 a R-10, R-12 a R-14             | a fazer — exigem Edge Functions |
| F6   | Base de conhecimento, KEDB e post-mortem              | **aplicada**                    |
| F7   | Rotinas, runbooks, execuções e plantão                | **aplicada**                    |
| F8   | Demandas, cronograma, menções e notificações          | **aplicada**                    |
| F8b  | Mudanças, CAB e deploys                               | a fazer                         |
| F9   | Painel de governança                                  | **aplicada**                    |

As automações que rodam como trigger no banco já estão ativas: R-01 (triagem e
roteamento), R-02 (elevação por VIP), R-04 (carimbo de primeira resposta),
R-05 e R-06 (pausa e retomada do relógio), R-11 (bloqueio de fechamento sem
documentação) e R-18 (falha em rotina abre incidente). As que dependem de
tempo — alerta de prazo, escalonamento, fechamento por decurso, geração
automática de execuções recorrentes — precisam de Edge Function agendada, que
é a F5.

## Os quatro módulos de operação

**CMDB.** A coluna "sem conferir" fica na lista, não escondida na ficha:
inventário que ninguém confere vira ficção em seis meses, e a defesa é deixar
a data envelhecendo à vista. Cadastrar já conta como conferir. O botão
*Conferir* registra a verificação física de hoje. Expandir um ativo mostra o
alcance de impacto — o que para junto se ele cair, calculado percorrendo o
grafo de dependências.

**Rotinas preventivas.** Rotina sem runbook não pode ser agendada: o botão
fica desabilitado até existir ao menos um passo. Executar é percorrer os
passos marcando OK, Falha ou N/A, e encerrar exige todos marcados. Se qualquer
passo falhou, o encerramento abre um incidente automaticamente, herdando a
criticidade e os ativos da rotina — ela não termina "com ressalva".

**Base de conhecimento.** Duas coisas em abas separadas de propósito: o
artigo ensina o que funciona; o erro conhecido documenta o que está quebrado e
ainda não tem correção. Publicar exige revisor diferente do autor — quem
escreve não revisa o próprio texto. Artigo publicado tem validade; vencido
volta a *em revisão*, o que combate documentação zumbi. O KEDB guarda o custo
mensal do contorno, que é o argumento de orçamento para priorizar a correção.

**Painel de governança.** Cada indicador aparece ao lado da meta e pintado
pela distância até ela — indicador sem meta é decoração. Tudo é apurado no
Postgres em `painel_governanca()` e chega em uma viagem só.

## Progresso automático

A demanda tem uma **lista de verificação**: cada item é um passo, com uma
observação opcional. Marcar itens move o percentual — 3 de 4 marcados são 75%.

O cálculo vive no banco, na trigger `fn_recalcular_progresso`, e não na tela.
Isso importa porque o Gantt, o quadro e o painel leem `demandas.percentual`
direto: se o cálculo estivesse no navegador, cada tela poderia mostrar um
número diferente do mesmo trabalho.

Três regras que sustentam o número:

- **Sem itens, o percentual volta a ser manual.** Demandas que não comportam
  checklist continuam com a barra arrastável.
- **Com itens, a barra fica só de leitura.** Deixá-la arrastável criaria dois
  donos do mesmo número, e a marcação seguinte sobrescreveria o que alguém
  arrastou.
- **Concluir a demanda fecha a lista inteira.** Sem isso, o cabeçalho diria
  100% e a lista mostraria itens abertos — dois números discordando sobre a
  mesma coisa.

Cada marcação registra quem concluiu e quando.

## Corrigir e excluir

Erro de digitação e data trocada **se corrigem**, não se apagam: apagar e
refazer perde os comentários e o histórico. Por isso a demanda tem *Corrigir
dados* — título, descrição, tipo, prioridade e datas — e a alteração fica na
auditoria com o antes e o depois.

Excluir existe para o registro que nunca deveria ter existido: duplicata,
teste, engano completo.

### Nada sai do banco

"Excluir" é lógico. O registro permanece, marcado com `excluida_em`,
`excluida_por` e `motivo_exclusao`, e some das listas, do Gantt e dos
indicadores do painel. A aba **Excluídas** mostra o que foi removido, com o
motivo, e permite restaurar.

O `DELETE` físico é recusado pelo banco:

```sql
delete from demandas where id = '…';
-- ERROR: Demandas não são apagadas fisicamente. Marque `excluida_em` …
```

A trava é uma trigger, não uma regra de interface — porque a interface não é a
única porta: o painel do Supabase também é.

| Quem | Pode excluir |
| --- | --- |
| Autor | Enquanto ninguém assumiu e está em backlog, refinamento ou disponível |
| Gestor e coordenador | Qualquer uma, exceto concluída |
| Admin | Qualquer uma |

Demanda **concluída** nunca é excluída: ela conta no histórico de entrega e nos
indicadores, e apagar reescreveria o passado. O caminho é o status `cancelada`.

**Chamados não têm exclusão, nem lógica.** Eles têm SLA cronometrado, trilha
de eventos e peso nos indicadores de governança — o caminho é `cancelado`, com
justificativa. A ausência está registrada como `comment on table` no banco para
não parecer esquecimento.

## Conversas

Um canal por equipe, criado automaticamente por trigger quando a equipe nasce,
mais um canal geral aberto a todos. As mensagens chegam por websocket
(`supabase_realtime`), então a conversa atualiza sem recarregar.

**Não existe tabela de membros.** O acesso a um canal de equipe é derivado de
`perfis.equipe_id`, mais coordenadores e gestores. Uma lista de membros
paralela ao organograma inevitavelmente diverge dele — e aí alguém sai da
equipe e continua lendo a conversa dela.

Três coisas que a conversa faz além de conversar:

- **`@` menciona** — a lista vem do diretório, a menção grava o id (não o
  texto) e a pessoa recebe notificação.
- **"Virar demanda"** — qualquer mensagem vira demanda **na fila da equipe
  dona do canal**, com título, tipo, prioridade e prazo. Depois de criada, um
  aviso automático fica no canal com o código. É o caminho curto entre "alguém
  pediu no chat" e "está na fila com prazo"; sem ele o pedido morre na
  conversa.
- **Códigos viram links** — `DEM-2026-000012` ou `INC-2026-000041` escritos no
  texto abrem o registro direto.

O contador de não lidas usa `canal_leituras`, com uma marca por pessoa e
canal — não varre a tabela de mensagens.

### Recorte do cronograma

O padrão é **±7 dias**: sete dias antes, hoje e sete depois. É a janela que
responde "o que está atrasado e o que vence esta semana" — a pergunta que se
faz todo dia. Ver o projeto inteiro é ocasional, e para isso existe **Tudo**.

| Recorte | Dias | Coluna |
| --- | --- | --- |
| ±7 dias | 15 | 58px |
| ±30 dias | 61 | 27px |
| Tudo | da demanda mais antiga à mais distante, teto de 180 | 21px |

Nos recortes fixos a janela não depende das datas das demandas. É isso que
mantém a coluna de hoje sempre no centro e a largura estável entre uma visita
e outra — antes, uma demanda com prazo distante espremia todas as outras.

### Duas armadilhas do Postgres que já custaram caro aqui

**Coluna gerada não existe em trigger `BEFORE`.** `chamados.prioridade` é
`generated always as (...) stored`, e o Postgres a calcula *depois* de rodarem
os triggers `BEFORE`. Ler `new.prioridade` ali devolve `NULL` — sem erro, sem
aviso. Dentro desses triggers, calcule com
`calcular_prioridade(new.impacto, new.urgencia)`.

**Trigger que escreve em tabela protegida precisa de `SECURITY DEFINER`.**
`sla_eventos`, `auditoria` e `notificacoes` não têm policy de `INSERT`, de
propósito: ninguém deve poder forjar um evento de SLA nem uma linha de
auditoria. Mas a trigger que alimenta essas trilhas roda com os privilégios de
quem chamou, e o RLS a recusa — derrubando a transação inteira. Toda função de
trigger que grava nessas tabelas é `SECURITY DEFINER` com `search_path`
fixo, e tem `EXECUTE` revogado de `anon` e `authenticated` para não virar RPC.

## Tags no chamado

Classificação transversal que o catálogo não cobre: `fechamento-mensal`,
`auditoria`, `cliente-x`. O catálogo diz *que serviço* é; a tag diz *a que
aquilo pertence*. Até 8 por chamado, opcionais.

**A normalização mora no banco.** `trg_normalizar_tags` põe em minúscula,
remove acento, une palavras com hífen, tira repetição e descarta o que for
curto demais. Sem isso, "Financeiro", "financeiro" e "  FINANCEIRO " viram
três tags distintas e o filtro deixa de servir para qualquer coisa — e a tela
não é a única porta de entrada. Verificado: oito variantes entram, quatro tags
saem.

O componente repete as mesmas regras no cliente, mas só para exibição: o chip
mostra a tag como ela será gravada, evitando a surpresa depois. Quem manda é a
trigger.

**O vocabulário é compartilhado.** `tags_sugeridas()` é `SECURITY DEFINER` de
propósito: um solicitante que só enxerga os próprios chamados não teria
sugestão nenhuma e inventaria a própria variante, que é exatamente o que a
normalização tenta evitar. A função expõe apenas o texto da tag e a contagem
de usos — nunca o conteúdo dos chamados — e é concedida só a `authenticated`.

Na fila, clicar numa tag filtra por ela. O filtro usa `contains` sobre o array,
que aproveita o índice GIN.

## Parâmetros livres da demanda

Prioridade, tipo e datas são o esqueleto fixo. O que varia de demanda para
demanda — `ambiente: produção`, `versão alvo: 3.2`, `risco: alto`,
`custo estimado: 5000` — vira **parâmetro nomeado**, e qualquer colaborador
pode acrescentar na demanda específica. A alternativa seria enfiar isso na
descrição, onde vira texto corrido que ninguém consegue comparar entre
demandas depois.

Cada parâmetro tem nome, tipo e valor. O tipo é o que dá utilidade ao campo:

| Tipo | O banco recusa |
| --- | --- |
| Número | `"uns cinco mil, acho"` |
| Data | `31/02/2026` |
| Sim ou não | qualquer coisa fora de sim/não, e normaliza `SIM` → `sim` |

**O nome é normalizado**, como nas tags: "Ambiente Alvo", "ambiente alvo" e
"AMBIENTE ALVO" são o mesmo parâmetro `ambiente-alvo`, e a mesma demanda não
aceita dois — seriam contradição, não informação.

`parametros_sugeridos()` devolve o vocabulário já usado com o tipo mais
frequente, então escolher um nome conhecido já traz o tipo certo junto. Como
nas tags, é `SECURITY DEFINER` e expõe apenas nome, tipo e contagem — nunca os
valores, que podem conter dado sensível.

Quem criou o parâmetro pode removê-lo; a gestão remove qualquer um.

## Setores

A estrutura da empresa, em árvore de áreas e subsetores. **Setor é quem pede;
equipe é a fila de TI que atende.** Sem essa separação, "Financeiro" seria ao
mesmo tempo um departamento e uma fila de chamados, e o painel misturaria
carga de trabalho com origem da demanda.

Estrutura inicial já cadastrada — 5 áreas e 18 subsetores:

```
Tecnologia        Operações      Atendimento              Comercial              Administrativo
├ Desenvolvimento ├ Validação    ├ Suporte ao Licenciado  ├ Vendas               ├ Financeiro
├ Suporte Técnico ├ Contratos    ├ Suporte ao Cliente     ├ Expansão             ├ RH
├ Dados / BI      ├ Pós-venda    └ Relacionamento         └ Pós-venda Comercial  ├ Jurídico
└ Infraestrutura  └ Backoffice                                                   └ Compliance
```

O nome é único **dentro do pai**, não globalmente — por isso "Pós-venda"
convive em Operações com "Pós-venda Comercial" em Comercial. A restrição usa
`nulls not distinct` para valer também entre as áreas de topo.

**Só as folhas podem solicitar.** Pedir "em nome de Tecnologia" quando existem
quatro subsetores esconde quem realmente precisa e o indicador por setor perde
resolução. Área sem subsetor continua elegível, porque aí ela é a folha.

O campo vem pré-preenchido com o setor da pessoa: na maioria das vezes é ela
pedindo para o próprio setor, e um campo pré-respondido certo vale mais que um
campo em branco.

Excluir um setor com subsetores é recusado pelo banco (`on delete restrict`) —
o caminho é desativar, que preserva o histórico das demandas que apontam para
ele. Só a gestão altera a estrutura.

## Fundo animado da tela de acesso

Malha de pontos em canvas, no painel escuro do login, com dois movimentos
somados: uma **respiração lenta e contínua**, que existe mesmo sem ninguém
mexer, e um **empurrão do cursor**, que afasta os pontos próximos e os deixa
voltar com amortecimento. Um sem o outro fica errado — só a respiração é
decorativo inerte; só o cursor é uma tela morta esperando interação.

Canvas e não SVG: são centenas de pontos redesenhados a cada quadro, e um nó
de DOM por ponto derrubaria o quadro a quadro.

Quatro cuidados que a implementação carrega:

- **`prefers-reduced-motion`** desliga a animação e o efeito do cursor — a
  malha é desenhada uma vez, estática.
- **Aba escondida cancela o `requestAnimationFrame`**, e o relógio é
  reiniciado ao voltar, para não haver salto de tempo acumulado.
- **Uma malha viva por vez**: a tela de acesso se redesenha ao alternar entre
  Entrar e Criar conta, e o laço anterior é encerrado antes de o novo começar.
  Sem isso, cada troca de aba deixaria um laço órfão rodando.
- **A cor sai de `--c-accent`**, lida do CSS, então a malha acompanha o tema.

A influência do cursor sobe ao entrar na área e desce ao sair, em vez de cortar
de uma vez: os pontos desaceleram em vez de travar.

## Mau contato na marca

A palavra **Central Green** na tela de acesso falha como imagem de tubo com
mau contato. Três coisas acontecem juntas na rajada:

1. **a própria palavra deforma** — inclina, estica e desloca;
2. **os canais de cor se separam**, via `text-shadow` — feito assim, e não com
   cópias sobrepostas, a separação acompanha a letra já deformada em vez de
   flutuar por cima dela;
3. **duas cópias recortadas em faixas horizontais** escapam para os lados, o
   que dá a leitura de linha de varredura fora de sincronia.

O ciclo passa **84% do tempo completamente parado** e só falha em rajadas
curtas. Efeito contínuo deixa de ser um detalhe e vira uma tela que parece
quebrada.

As cópias usam `content: attr(data-texto)` em pseudo-elementos, então ficam
fora da árvore de acessibilidade — sem isso o leitor de tela anunciaria a
marca três vezes. E `prefers-reduced-motion` desliga tudo: mau contato é
movimento por definição, então a alternativa acessível é a marca parada.

As cores dos canais são tokens próprios (`--c-canal-a`, `--c-canal-b`), e não
`--c-p1`/`--c-p3` — reaproveitar aquelas seria sequestrar cores que significam
prioridade de chamado.

## Telas restritas à equipe de TI

Quatro telas só aparecem para quem tem papel de agente, gestor ou
administrador — quem é apenas `solicitante` não as vê:

| Tela | Por quê |
| --- | --- |
| Setores | Estrutura da empresa é ferramenta de TI e gestão |
| Ativos (CMDB) | Inventário técnico |
| Rotinas preventivas | Procedimento operacional |
| Painel de governança | Indicadores internos |

**Esconder o item no menu não é a proteção.** Sem guarda, qualquer pessoa que
digitasse `#/setores` na barra de endereço entraria na tela — o RLS ainda
protegeria a escrita, mas ela veria uma interface de administração que não é
dela e descobriria botões que só vão falhar. Por isso existe `ROTAS_DE_TI` em
`main.ts`, verificada antes do despacho.

A fila de atendimento fica **fora** dessa lista de propósito: ela é o destino
padrão quando o hash está vazio, e barrá-la ali jogaria todo solicitante na
tela de acesso negado a cada recarregamento. O caso `fila` já desvia
silenciosamente para "Meus chamados" — desvio é o certo para um padrão; o
aviso fica para quem digitou a rota de propósito.

### O que continua aberto, e por quê

A **leitura** de `setores` permanece liberada a qualquer pessoa autenticada.
Não é descuido: o formulário de nova demanda precisa da lista para preencher o
setor solicitante. O que se restringe é o **quadro de gestão** da estrutura,
não o dado em si — e a escrita já era exclusiva da gestão pelo RLS.

## Abas por setor

Cada setor define quais abas as pessoas dele veem no menu. A configuração fica
na tela **Setores**, no botão *Abas* de cada área.

Configuração inicial:

| Área | Abas |
| --- | --- |
| Tecnologia | todas — é quem atende |
| Operações, Atendimento, Comercial, Administrativo | abrir chamado, meus chamados, demandas, cronograma, conversas, base de conhecimento |

**Subsetor herda da área.** Configurar Comercial vale para Vendas, Expansão e
Pós-venda Comercial sem tocar em nenhum deles — configurar 18 subsetores um a
um seria convite ao esquecimento. Um subsetor pode ter configuração própria,
e aí ela vence; o botão *Herdar do padrão* devolve a herança.

### Visibilidade, não permissão

Esta é a distinção que sustenta o recurso: a configuração do setor **reduz** o
que aparece dentro do que o papel já permite — nunca concede nada. Marcar
"Fila de atendimento" para o Financeiro não transforma ninguém em agente; o
papel continua barrando e a aba segue escondida. A tela de configuração diz
isso, em vez de deixar a pessoa descobrir depois que o botão não funciona.

Na prática são duas camadas em série:

1. **`perfis.papel`** — permissão de verdade, aplicada no menu, na guarda de
   rota e no RLS do banco;
2. **`setores.abas`** — recorte de menu por área, aplicado sobre o que sobrou.

### Três travas contra tranca acidental

- **"Meus chamados" nunca sai da lista.** A trigger reinsere se alguém tirar —
  sem ela a pessoa perderia acesso aos próprios registros.
- **Array vazio vira nulo.** Salvar "nenhuma aba" trancaria o setor fora do
  sistema; o banco trata isso como "não configurado".
- **Administrador nunca é filtrado.** Uma configuração equivocada poderia
  esconder dele a própria tela de Setores, e não haveria caminho de volta pela
  interface.

A fila de atendimento também tem tratamento próprio: é o destino padrão quando
o hash está vazio, então um setor sem essa aba **desvia** para "Meus chamados"
em vez de mostrar acesso negado a cada recarregamento.

## O chamado é um protocolo, não um cadastro

A abertura tem quatro etapas — serviço, problema, contexto, detalhes — e a
quarta era a que fazia as pessoas desistirem. O catálogo nascera com
formulários de processo: "Desligamento de colaborador" pedia data, urgência
de revogação e destino dos dados; "Acesso para novo colaborador" pedia cargo,
gestor direto e centro de custo, com regra de cinco dias úteis de
antecedência. Nada disso é triagem de TI — é rotina de RH e de compras
transcrita para dentro do chamado.

A migration `f12_formularios_como_protocolo_de_atendimento` cortou esses
campos dos serviços de incidente. Sobraram, por serviço, no máximo dois
seletores, e **nenhum é obrigatório**: o que decide fila e prioridade já foi
respondido nas etapas 2 e 3, e o relato em texto livre cobre o resto. A
migration também apaga a `condicional` de um campo cujo campo-pai foi
removido — sem isso o campo ficaria invisível para sempre, esperando uma
resposta que ninguém mais tem onde dar.

Cortar demais, porém, tem o custo simétrico. Desligamento ficou sem nenhum
campo, e aí o chamado abria sem dizer **quem** havia saído. A migration
`f12b_desligamento_coleta_dados_de_revogacao` devolveu o formulário certo:
nome, setor, cargo, e-mail corporativo, último dia, acessos a revogar, destino
dos arquivos e equipamentos a devolver. "Transferir para quem" só aparece
quando o destino é transferência. Admissão recebeu a simetria mínima — nome e
setor —, e segue sem cargo, gestor, centro de custo ou regra de antecedência.

O telefone de contato saiu junto, do formulário e do `RascunhoChamado`. O
perfil já tem telefone desde o cadastro; repetir o número a cada chamado só
produzia dado divergente. Chamados antigos que o gravaram continuam exibindo
o rótulo na tela de detalhe.

### Por que a etapa 4 travava a digitação

Cada tecla disparava um redesenho de todos os campos. O `input` chamava
`registrar`, que chamava `aoMudar`, que chamava `desenharCampos` — e
`montar()` faz `replaceChildren()`. O `<input>` em foco era destruído e
recriado a cada letra: a tecla parecia falhar e o cursor saltava para fora.

Trocar o evento de `input` para `change` esconderia o sintoma e criaria
outro: os campos condicionais só reagiriam quando o campo perdesse o foco. O
redesenho existe por causa deles, e só por causa deles. Então a condição
passou a ser a real:

```ts
if (assinatura() !== assinaturaDesenhada) desenharCampos();
```

`assinatura()` é a lista de chaves visíveis no momento. Digitar não muda essa
lista; escolher numa `<select>` pode. Só o segundo caso reconstrói a tela — e
aí o foco está num seletor recém-usado, onde perder o cursor não incomoda
ninguém.

### Requisição tem três etapas, não quatro

Contexto — alcance, urgência, o que já foi tentado — é etapa de incidente. Ela
existe para alimentar a matriz de prioridade. Requisição não tem o que medir:
o prazo vem de `impacto_padrao` e `urgencia_padrao` no catálogo. Mantidas as
quatro etapas, a terceira sobrava com uma pergunta só e a quarta carregava o
formulário inteiro.

`etapasDe(servico)` devolve a trilha conforme o tipo:

| Tipo | Etapas |
|---|---|
| Incidente | Serviço · Problema · Contexto · Detalhes |
| Requisição | Serviço · Descrição · **Dados do pedido** |

"Dados do pedido" junta o local, o formulário do serviço, a classificação já
calculada e o botão de abrir. Num desligamento é ali que se informa quem saiu
e o que revogar — que é o que a equipe precisa saber, e o que a etapa de
contexto nunca perguntou.

Duas consequências que o código trata explicitamente: trocar de serviço pode
encurtar a trilha sob os pés de quem já avançou, então `desenhar()` reduz
`etapa` ao último índice válido; e o "onde você está" da requisição divide
tela com o formulário, então quem cobra o campo é `enviar()`, não `avancar()`
— não existe etapa anterior que já o tivesse barrado.

## Tags com cor, em botão

A tag nasceu como texto livre, com sugestão vinda do que já havia sido usado
(`tags_sugeridas`). Isso funciona depois que o vocabulário existe — e num
sistema recém-aberto ele não existe. O resultado previsível: cada pessoa
inventando a sua. "fechamento", "fechamento-mensal", "fech-mensal".

`tags_catalogo` dá o ponto de partida. Quinze tags prontas, cada uma com sua
cor, oferecidas como botão que liga e desliga. Digitar continua valendo: quem
precisa de uma tag fora da lista digita, e ela também aparece como botão nas
próximas vezes, junto das mais usadas.

### Cor sem cadastro

A cor do catálogo vence, porque foi escolhida. Toda outra tag recebe uma cor
derivada do próprio texto, por FNV-1a sobre os oito nomes da paleta:

```ts
let h = 0x811c9dc5;
for (let i = 0; i < tag.length; i += 1) {
  h ^= tag.charCodeAt(i);
  h = Math.imul(h, 0x01000193);
}
return PALETA_TAG[(h >>> 0) % PALETA_TAG.length];
```

Mesma tag, mesma cor, em qualquer sessão e em qualquer máquina, sem persistir
nada — a cor **é** o texto. A alternativa era exigir cadastro para colorir,
que deixaria metade das tags cinza; e cinza no meio de coloridas lê como
"menos importante", que não é o que a falta de cadastro significa.

### Por que a cor é um nome, e não um hexadecimal

O catálogo guarda `cor` como um nome de uma lista fechada — `verde`,
`ambar`, `vermelho`, `azul`, `roxo`, `ciano`, `rosa`, `cinza` —
com `check` no banco. `tokens.css` traduz cada nome num par tinta/fundo por
tema, e `components.css` resolve o par ativo pelo `data-cor` do elemento:

```css
[data-cor="ambar"] { --tag-f: var(--tag-ambar-f); --tag-b: var(--tag-ambar-b); }
.tags__chip[data-cor], .tags__marca[data-cor] { background: var(--tag-b); color: var(--tag-f); }
```

Deixar a gestão escolher `#RRGGBB` teria produzido, na primeira semana, uma
tag legível no tema claro e invisível no escuro — e ninguém revisa cor de tag
depois de criada. Com nome, os dois temas são decididos uma vez, aqui.

### O mesmo vocabulário nos dois lados

`f13b` levou `tags` também para `demandas`, reaproveitando
`fn_normalizar_tags` — a mesma trigger, o mesmo teto de oito, a mesma
grafia. Sem isso a mesma tag teria duas formas e duas cores conforme o lado do
sistema em que fosse escrita.

`tags_sugeridas` passou a somar os dois: antes, uma tag usada só em demanda
nunca aparecia como sugestão na abertura de chamado. E `demandas.tags` ganhou
índice GIN, porque filtrar por tag varre o quadro inteiro.

### Quem escreve o catálogo

Leitura é de todos — a lista é o menu de botões da tela. Escrita é de
`sou_gestor()`. Se qualquer um pudesse criar tag de catálogo, ela viraria o
mesmo texto livre que o catálogo veio resolver.

A chave passa por `normalizar_tag()` na própria trigger de `tags_catalogo`.
Sem isso, "Fechamento Mensal" cadastrado no catálogo nunca casaria com
`fechamento-mensal` gravado no chamado, e a cor simplesmente não apareceria.

## A fila entra no cronograma

O Gantt mostrava só demanda. A fila de atendimento — que consome as mesmas
pessoas e os mesmos dias — ficava fora dele. Quem olhava o cronograma via
metade da carga da equipe e concluía que havia folga onde não havia.

Chamado não precisou de campo novo: `aberto_em` é o início e `prazo_solucao`,
calculado pelo SLA na abertura, é o fim. A migration
`f14_prazo_de_chamado_e_obrigatorio` tornou os dois `not null`. Antes eles
eram preenchidos por gatilho — o que é um acordo entre gatilhos, não uma
regra: bastava um caminho de escrita novo para entrar chamado sem prazo. E
chamado sem prazo não tem barra; ele some do planejamento em silêncio, que é a
pior forma de sumir.

### Traduzir em vez de unificar

Demanda e chamado não compartilham tabela nem vocabulário: status, prioridade
e percentual são conceitos diferentes dos dois lados. Em vez de forçar um tipo
comum no banco — uma view com tudo em `text` e o significado perdido —, cada
um é traduzido no cliente para `ItemCronograma`, que tem só o que o gráfico
consome: duas datas, um percentual e três rótulos.

O percentual do chamado vem do estado, já que ele não tem checklist como a
demanda. Resolvido para em 90: o fechamento ainda depende do aceite de quem
abriu, e mostrar 100% antes disso esconde o que falta.

| Estado | Avanço |
|---|---|
| novo · triado · atribuído | 5 · 15 · 25 |
| em atendimento · pendente | 55 |
| resolvido | 90 |
| fechado · cancelado | 100 |

### Detalhes que a leitura exige

As linhas vêm ordenadas por prazo, misturadas. Agrupar por origem faria o
chamado que vence hoje aparecer abaixo da demanda do mês que vem.

A barra do chamado tem borda **tracejada**, e o rótulo leva um selo `CH` ou
`DE` antes do título. A cor já estava toda ocupada por atrasado, bloqueado e
concluído; e quem imprime o cronograma perde a cor inteira.

"Minhas" no chamado usa o mesmo recorte de **Meus chamados** — vale ter
aberto ou estar atendendo, não só atender.

O filtro de tipo (melhoria, bug, tarefa…) é vocabulário de demanda. Com ele
ligado, os chamados nem são buscados: seriam uma lista descartada inteira.

## O cronograma ganhou desenho de Gantt

O gráfico já tinha a mecânica certa — janela centrada em hoje, recorte por
período, barra proporcional. Faltava a leitura: barra retangular pálida, sem
ligação entre tarefas encadeadas, e a cor gasta em estado.

### Seis cores, e elas dizem prioridade

A cor da barra é a prioridade, porque é o que se procura ao varrer o
cronograma de cima a baixo:

| Cor | Chamado | Demanda |
|---|---|---|
| Vermelho | P1 | crítica |
| Laranja | P2 | alta |
| Amarelo | P3 | média |
| Azul | P4 | baixa |
| Violeta | pendente de usuário, terceiro ou mudança | bloqueada |
| Verde | resolvido, fechado, cancelado | concluída |

Violeta e verde são exceções de estado: o que está parado e o que terminou
saem da disputa por atenção, seja qual for a prioridade com que entraram.

**Atraso não gasta uma cor.** Ele entra como hachura diagonal e contorno
vermelho *por cima* da barra. Por isso convive com a prioridade em vez de
apagá-la: uma P1 atrasada continua vermelha, e passa a ser vermelha listrada.
Antes, atrasado e P1 eram a mesma cor e a informação se perdia.

### Setas de dependência

`demandas.depende_de_id` existia desde a F8 e nunca tinha sido desenhado —
aparecia só como texto "depois de D-004" no rótulo. Agora vira cotovelo do fim
do antecessor até o começo do dependente.

A camada é uma `<svg>` sobreposta a todas as trilhas, não um desenho dentro da
linha: uma seta atravessa linhas, e dentro de uma delas seria cortada pelo
próprio recorte. Fica em `z-index: 0`, abaixo das barras, com
`pointer-events: none` — a linha passa por trás e o clique continua chegando
na barra.

Duas decisões de traçado:

- Quando o dependente **começa antes** de o antecessor terminar — o que
  acontece —, uma reta cruzaria as duas barras e não se leria. O desvio passa
  pela borda entre as linhas, que está sempre livre.
- A ponta é um `<polygon>` próprio, não `marker-end`: o marcador herda o traço
  do caminho em parte dos navegadores, e a seta sai listrada.

Isso exigiu **altura de linha fixa** (`ALTURA_LINHA = 45`, e `height: 44px` na
trilha em vez de `min-height`). A camada posiciona por cálculo, não por
medição do DOM; uma linha que crescesse desalinharia todas as setas dali para
baixo.

### Detalhes menores que mudam a leitura

Barra em cápsula (`border-radius: 999px`) com cor sólida e texto branco, em
vez de fundo lavado com borda. A grade de colunas de dia passou a ser
desenhada no fundo da trilha por `repeating` gradient, presa a `--gantt-dia`.
E o chamado leva um contorno tracejado por dentro da cápsula: a barra dele é
prazo de SLA, não plano acordado com alguém.

### `column "evento" is of type evento_sla but expression is of type text`

Travava exatamente o "Marcar como resolvido", e só ele. O gatilho
`fn_chamado_transicao` gravava o evento assim:

```sql
case when new.sla_solucao_ok then 'cumprido' else 'violado' end
```

Um literal solto — `'iniciado'` nos outros gatilhos — chega ao `INSERT` como
`unknown`, e o Postgres o coage para o tipo da coluna. Mas o `CASE` resolve o
próprio tipo **antes** disso: com os dois ramos `unknown`, o padrão é `text`,
e de `text` para enum não existe conversão implícita.

A correção é castar cada ramo (`'cumprido'::evento_sla`), como
`fn_primeira_resposta` já fazia desde a F4 — a mesma armadilha tinha sido
evitada lá e passou aqui. Migration
`f15_corrige_tipo_do_evento_de_sla_ao_resolver`.

O sintoma enganava: o erro fala de tipo de coluna, mas o chamado não fechava
porque a transação inteira abortava na gravação do evento de SLA. A resolução
depende do evento; o evento é que estava quebrado.

## Gavetas no menu lateral

Os quatro grupos — Atendimento, Demandas, Organização, Operação — viraram
gavetas. O rótulo, que era texto morto, virou o botão que abre e fecha, com
seta à direita que gira 90°. A escolha fica guardada em `localStorage`.

### Guardar o que está fechado, não o que está aberto

`central-green:menu-fechado` armazena a lista de grupos **fechados**. É o
inverso do óbvio, e de propósito: grupos novos aparecem a cada fase da
implantação, e guardando os abertos um grupo novo nasceria escondido — sem
constar da lista salva, seria tratado como fechado, e ninguém o encontraria.
Guardando os fechados, o que é novo nasce aberto sem precisar de migração da
preferência salva.

Preferência corrompida cai num `catch` que devolve conjunto vazio. Um JSON
inválido no `localStorage` não pode derrubar a navegação inteira.

### Fechar a gaveta da página atual é permitido

Quando a gaveta fechada contém a página aberta, um ponto verde aparece no
cabeçalho. A alternativa seria abri-la à força, o que desfaria a escolha da
pessoa toda vez que ela navegasse. A escolha é dela; o aviso basta para não
perder a orientação.

### Por que `grid-template-rows` e não `max-height`

```css
.rail__gaveta { display: grid; grid-template-rows: 1fr; overflow: hidden; }
.rail__grupo--fechado .rail__gaveta { grid-template-rows: 0fr; }
```

`1fr → 0fr` anima até a altura **real** do conteúdo. Com `max-height` é
preciso chutar um teto: o chute ou corta o grupo grande, ou deixa a animação
arrastada no grupo pequeno, porque a transição percorre a distância inteira do
teto. O filho precisa de `min-height: 0` para poder ser espremido, e o
`overflow: hidden` impede que os itens continuem desenhados fora da faixa de
`0fr` e vazem por cima do grupo seguinte.

`prefers-reduced-motion` desliga a transição: a gaveta é conforto de
organização, não informação, então quem pediu menos movimento recebe o mesmo
resultado, instantâneo.

## Esqueleto de carregamento

Entre o clique e a resposta do Supabase a tela ficava em branco. Em branco não
se distingue "carregando" de "não há nada aqui" — e as duas levam a ações
opostas: esperar ou reclamar. O esqueleto responde antes de o dado chegar,
desenhando a forma que a tela terá.

A varredura vai do **verde escuro ao verde claro**, os dois da marca —
`#10251a → #1e523a` no tema escuro, `#cfe4d6 → #eef7f1` no claro. Cinza seria
mais discreto e teria o defeito de parecer conteúdo desativado.

### `aguardando` só pinta se a área estiver vazia

```ts
export function aguardando(area: HTMLElement, forma: Forma = "tabela"): void {
  if (area.childElementCount > 0) return;
  montar(area, FORMAS[forma]());
}
```

É o que separa a primeira carga de um redesenho por filtro. As telas de lista
chamam `desenhar()` a cada tecla no campo de busca; trocar a lista já visível
por esqueleto a cada tecla piscaria a tela inteira. Mantendo o conteúdo antigo
até o novo chegar, a busca fica estável e o esqueleto aparece uma vez só —
quando não havia mesmo nada.

O chat é a exceção e usa `esqueleto()` direto, sem a condição: ali a troca é
de assunto, não de filtro. Manter as mensagens do canal anterior enquanto as
novas chegam mostraria conversa errada, o que é pior que mostrar esqueleto.

### Quatro formas

| Forma | Onde |
|---|---|
| `tabela` | fila, meus chamados, demandas, ativos, pessoas, cronograma |
| `lista` | base de conhecimento, rotinas, setores, chat |
| `ficha` | detalhe do chamado e da demanda (duas colunas) |
| `painel` | governança — quatro indicadores e a área do gráfico |

As larguras das barras seguem uma sequência fixa (`LARGURAS`) em vez de
sorteio. Barras do mesmo tamanho empilhadas leem como grade e não como texto;
mas sorteá-las faria dois carregamentos seguidos da mesma tela parecerem telas
diferentes.

O gradiente usa `background-size: 220%` para que a faixa clara atravesse a
barra inteira, em vez de nascer e morrer dentro dela. Com
`prefers-reduced-motion` a varredura para: o esqueleto já diz que está
carregando pela forma, a animação não carrega informação.

## A marca da iGreen Energy

O "G" da iGreen — a lâmpada formada pelo G com as folhas — substituiu o
logotipo provisório em SVG que existia desde a primeira fase. Ele aparece no
cabeçalho, na tela de acesso, no carregamento inicial e na aba do navegador.

O arquivo vive em `public/igreen-g.png`, e não em `src/img`, porque o mesmo
asset serve o `index.html` — que é HTML estático e não passa pelo
empacotador, então não pode receber uma URL com hash.

### O favicon precisou de um quadrado

O "G" é retrato: 812×1080. Solto num `rel="icon"`, o navegador o achata para
caber no quadrado da aba. `public/favicon.svg` resolve embutindo o PNG em
base64 dentro de um SVG de `viewBox` quadrado, centralizado sobre o carvão da
marca:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0A1410"/>
  <image href="data:image/png;base64,…" x="16" y="10" width="33" height="44"/>
</svg>
```

O fundo escuro não é decoração: é o que garante contraste tanto na aba clara
quanto na escura. Um G verde sobre transparente sumiria numa das duas.

### Um arquivo só para os dois temas

Dentro da aplicação o G entra como PNG cru, sem badge — verde sobre
transparente funciona nos dois temas. Ter uma versão clara e outra escura
obrigaria a trocar o `src` durante a transição de tema, e a troca pisca.

O `alt` é vazio de propósito: ao lado do logo já vem "Central Green" em texto,
e um leitor de tela anunciando os dois leria a marca duas vezes.

Na tela de carregamento o G pulsa devagar. É o único sinal de vida naquele
intervalo — o esqueleto das telas só existe depois que o JS roda.

## O que o F12 mostra, e o que não pode mostrar

`build.sourcemap` estava em `true`. Com ele, o bundle minificado carrega um
`.map` que o DevTools usa para remontar o TypeScript original inteiro —
arquivos, nomes de variáveis e todos os comentários. Era isso que aparecia na
aba Sources. Agora é `false`, e `dist/` sai sem nenhum `.map`.

### O que continua visível, e por que está certo

A `VITE_SUPABASE_URL` e a chave publicável **são públicas por projeto**.
Qualquer cliente que fale com o Supabase precisa apresentá-las; elas aparecem
no cabeçalho de toda requisição na aba Network, com ou sem source map, com ou
sem minificação. Escondê-las no código não esconderia nada.

Quem protege o dado é o RLS, e ele está de pé: as 33 tabelas do schema
`public` têm `row level security` ligado, todas com ao menos uma policy. As
regras de verdade — quem lê a fila, quem promove perfil, quem exclui demanda —
moram no banco, não no navegador. Um atacante com a chave publicável em mãos
consegue exatamente o que um usuário anônimo consegue: nada.

O que **nunca** pode ir para o front é a `service_role key`, que ignora RLS.
Ela não está no repositório, não está no `.env.example` e não está no bundle.
O `.env.local` é ignorado pelo git.

## Comentário: uma ou duas linhas

Todo comentário do código foi reduzido a uma ou duas linhas — 787 linhas a
menos. O "porquê" longo vive aqui no README, onde não atravessa a leitura do
código.

A redução foi feita com varredura por caractere, não por regex: `//` dentro de
string, template ou regex não é comentário, e um replace cego destruiria o
código. A prova de que nada quebrou: removendo **todos** os comentários das
duas versões, os 41 arquivos `.ts` ficaram byte a byte idênticos.

## Tela de carregamento

O `index.html` é servido antes de o bundle existir, então o que ele mostra é o
único sinal de vida nesse intervalo. Agora é um anel redondo em volta do "G":
trilha completa no verde escuro, arco de um quarto de volta no verde claro
girando por cima, e a marca pulsando por baixo — ela não gira junto.

O `.boot` pinta o próprio fundo com `var(--c-bg)` em vez de herdá-lo. Sem
isso, o instante antes de o CSS da aplicação montar pisca branco no tema
escuro.

Com `prefers-reduced-motion` o anel fica inteiro no verde claro, parado —
ainda se lê como espera, sem girar.

### Por que a tela de carregamento aparecia crua

Em desenvolvimento o Vite entrega o CSS **dentro do bundle JS**. Até o bundle
executar, o `index.html` não tem folha de estilo nenhuma — e o `.boot`, cujas
regras moravam em `base.css`, era texto sem formatação encostado no topo da
página. Parecia uma tela genérica de HTML porque, naquele instante, era
exatamente isso.

O estilo do `.boot` passou a morar **inline no `<head>` do `index.html`**, com
cores literais e `prefers-color-scheme` próprio, sem depender dos tokens. É a
única parte do projeto que precisa valer no primeiro paint, então é a única
que se repete fora de `src/styles`.

O bloco inline vem antes do `<link>` da aplicação, então tudo que os dois
definem em comum é decidido pela folha da aplicação — como deve ser.

Junto veio um `animation-delay` de 300ms: a tela de espera só aparece se a
carga passar disso. Numa carga rápida ninguém vê o lampejo, que incomoda mais
do que informa.

## O raio da tela de acesso

iGreen **Energy**. O raio dá um evento à tela, onde a malha de pontos dá só
ambiente. Fica no escuro da coluna direita, atrás do formulário, encostado na
borda e sangrando um pouco para fora — é fundo, não ilustração, e não pode
disputar leitura com os campos.

### O suspense está no risco, não no raio

Três camadas do mesmo contorno:

| Camada | Papel |
|---|---|
| `raio__risco` | segmento curto e claro correndo à frente — o suspense |
| `raio__traco` | contorno que fica para trás, marcando o caminho |
| `raio__corpo` | preenchimento, só depois que o contorno fecha |

O truque é `stroke-dasharray` com um traço curto e um vão do tamanho do resto
do caminho: animando `stroke-dashoffset`, o segmento percorre o contorno.
Vê-se **para onde** vai antes de ver **o quê**.

O comprimento vem de `getTotalLength()`, medido depois de o elemento entrar
no documento. Com um número chutado o risco sobra ou é cortado antes de
fechar. Até a medida chegar, `.raio` fica em `opacity: 0` — senão o contorno
inteiro apareceria de uma vez no primeiro quadro, entregando o desenho.

### A parede retangular em volta do raio

Havia `filter: drop-shadow()` nos `<path>`. A região padrão de um filtro SVG
é a caixa do elemento mais 10%; num `viewBox` de 120 unidades, um brilho de
26 unidades estoura essa região e **é cortado no retângulo**. O corte aparecia
como uma parede reta em volta do raio, como se ele tivesse fundo próprio.

A correção não foi aumentar a região: foi tirar todo brilho de dentro do SVG.
O clarão é um `<span>` irmão, com `radial-gradient` e sem filtro nenhum — e
gradiente não tem região para recortar.

### O flash tem dois tempos

```
39,5%  estouro    → traço vai a 7px e clareia, clarão em 1,05 de escala
43%    apagão     → volta a 4px, opacidade 0,22
45-46% rescaldo   → reacende mais fraco, depois assenta
```

Um pulso só lê como *fade*. Descarga de verdade tem estouro e rescaldo, e é a
segunda batida que faz o olho registrar como flash.

### Verde, e só verde

A primeira versão usava `--c-canal-a` (o ciano do efeito de mau contato) no
estouro. O raio inteiro puxava para o ciano e a marca sumia. Agora o realce é
`--c-accent-hover`, o verde claro da própria paleta: um segundo tom rouba o
efeito para si.

O ciclo dura 8s, com pausa escura no fim — o raio precisa ser esperado para
valer alguma coisa. Com `prefers-reduced-motion` fica desenhado e parado.
Abaixo de 1200px some, largura em que ele passaria por cima do formulário.

## Dashboard de tempos

O painel de governança responde "quantos" e "dentro do SLA?". Não responde
"quanto tempo". São perguntas diferentes: cumprir o SLA de 8h com média de
7h50 e com média de 40min dá o mesmo indicador verde e são duas operações
completamente distintas.

`painel_tempos(p_dias)` traz média de **espera de fila** — da abertura até a
primeira resposta, o tempo em que o chamado existe e ninguém tocou nele — e
média de **solução**, que desconta os minutos pausados. Quebradas por dia, por
prioridade e por fila.

A função é `security invoker` de propósito: o RLS decide o que cada um soma.
Um solicitante que chegasse ali veria a média dos próprios chamados, não a da
empresa.

### A paleta foi validada, não escolhida no olho

As cinco cores pedidas — verde, amarelo, laranja, vermelho, violeta — foram
passadas pelo validador do skill de dataviz, em claro e em escuro. A primeira
tentativa **reprovou**: amarelo fora da banda de luminosidade e
laranja↔vermelho com ΔE 12,7 para visão normal, abaixo do piso de 15.

Reposicionar os tons não bastou, porque o problema é estrutural: das cinco
cores, três são quentes, e o validador compara **pares adjacentes**. A solução
foi a ordem alternada quente-frio-quente-frio-quente:

| Ordem | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Claro | `#a87a06` | `#12915a` | `#e2620a` | `#7846c9` | `#b02418` |
| Escuro | `#b8890c` | `#20a065` | `#dc7024` | `#9070de` | `#cf4f45` |

Assim nenhum par de quentes fica vizinho. Restou um WARN de separação em
6–8 ΔE entre verde e amarelo, que é legal **apenas com codificação
secundária** — por isso toda barra tem rótulo direto com o valor, as barras
têm folga entre si, e a tabela existe.

### Decisões de forma

- **Uma série por gráfico.** Espera e solução são ambas em minutos, mas
  solução é ~10× maior; juntas, achatariam a espera. Duas medidas, dois
  gráficos — nunca dois eixos.
- **Meta como marca na trilha**, não como segunda barra: é referência, não
  dado.
- **Variação com seta e sinal**, não só cor, para sobreviver ao daltonismo e à
  impressão. E `null` quando não há janela anterior — 0% mentiria dizendo
  "estável".
- **Rótulo de eixo em HTML, fora do SVG.** O SVG usa
  `preserveAspectRatio="none"` para esticar as marcas na largura disponível; o
  texto dentro dele esticaria junto e sairia deformado. Pelo mesmo motivo a
  marca do crosshair é um `<span>` redondo, não um `<circle>` — que viraria
  elipse.
- **A tabela abaixo dos gráficos** não é redundância: é o que permite conferir
  o valor exato que a barra só aproxima, e o que torna o painel legível para
  leitor de tela.

Com a base ainda sem chamados o dashboard mostra zeros — o que é o resultado
correto, não uma falha de carga.

## Filtro de período

Atalhos de 7, 30 e 90 dias mais "Escolher" com data inicial e final, na barra
de filtros de oito telas. O cronograma ficou fora — ele já tem o próprio
recorte de janela, e dois controles de tempo na mesma tela competiriam.

| Grupo | Telas | Data usada |
|---|---|---|
| Atendimento | Fila, Meus chamados | abertura |
| Demandas | Quadro de demandas | criação |
| Organização | Pessoas, Setores | cadastro |
| Operação | Rotinas, Ativos, Base de conhecimento | execução, cadastro, publicação |

Também ficaram fora **Abrir chamado**, que é formulário e não lista, e
**Conversas**, que é fluxo contínuo — recortar mensagem por data esconderia
metade de um diálogo.

### No banco onde o teto de linhas importa

Chamados, demandas e ativos filtram no banco, com `gte`/`lte` na consulta. As
três têm teto de 500 ou 1000 linhas: filtrar depois de receber faria o período
mentir sobre o que ficou de fora, porque o corte já teria acontecido no
servidor por outro critério.

As demais listas vêm inteiras, e aí `dentroDoPeriodo` resolve no cliente sem
uma consulta a mais. Item sem data passa pelo filtro: ausência de data não é
"fora do período", e escondê-lo faria sumir registro que ninguém pediu para
esconder.

`limiteFinal` transforma o "até" no fim daquele dia. As colunas são
`timestamptz`; comparar com a data crua deixaria de fora tudo que aconteceu
depois da meia-noite — o filtro perderia justamente o dia escolhido.

`f16` acrescentou `criado_em` a `vw_diretorio` e `vw_setores`, que não
expunham a data e portanto não tinham o que comparar.

### Camada

A lógica pura — o tipo `Periodo`, `limiteFinal`, `dentroDoPeriodo` — mora em
`src/lib/periodo.ts`. Ela nasceu dentro do componente, e isso obrigava
`api.ts`, `demandas.ts` e `cmdb.ts` a importar de `components/`: a camada de
consulta passando a depender da de interface. `src/lib/` não importa
`src/components/` em nenhum arquivo.

### O grupo é um rádio de verdade

```
┌ Filtro ───────────┐
│ DATA              │
│ ◉ Tudo            │
│ ○ 7 dias          │
│ ○ 30 dias         │
│ ○ 90 dias         │
│ ○ Escolher        │
│   de [] até []    │
└───────────────────┘
```

Um `<fieldset>` com `<legend>Filtro</legend>`, e dentro as opções como
`<input type="radio">` **visíveis**, uma por linha. Com o círculo à vista o
estado se lê sem depender de cor de fundo — e é uma escolha entre alternativas
exclusivas, que é exatamente o que o rádio diz.

`fieldset`/`legend` é o contêiner que o HTML já tem para o caso, então a
legenda fica amarrada ao grupo sem nenhum `aria-`. De brinde vêm a navegação
por setas e o anúncio "3 de 5" do leitor de tela, comportamento que teria de
ser reimplementado à mão sobre botões com `aria-pressed`.

Os campos de intervalo ficam **dentro do bloco**, numa segunda linha recuada
até o texto das opções: o intervalo pertence a "Escolher", não ao filtro
inteiro. Vazio, o contêiner não ocupa espaço.

O `name` do grupo leva um contador por instância — dois filtros na mesma
página compartilhariam o grupo, e um desmarcaria o outro.

### A gaveta nasce fechada

```
┌ ▸ FILTRO  30 dias ─┐        clicou
└────────────────────┘   →    abre e mostra as opções
```

Filtro é ferramenta de exceção. Aberto o tempo todo, ele empurra a lista — que
é o conteúdo — para baixo da dobra. O botão que abre vive **dentro da
`<legend>`**, o que é válido e mantém a legenda amarrada ao grupo de rádio.

O cabeçalho mostra o que está valendo, em verde quando há recorte ativo. Sem
isso a gaveta fechada esconderia um filtro em vigor, e a lista pareceria
incompleta sem explicação.

A preferência guarda o que está **aberto** — o inverso do menu lateral. Lá o
padrão é aberto, e guardar os fechados faz um grupo novo nascer visível; aqui
o padrão é fechado, e guardar os abertos faz um filtro novo nascer recolhido.
Em ambos os casos, a lista salva registra o desvio do padrão, nunca o padrão.

A animação é a mesma `grid-template-rows: 1fr → 0fr` do menu, pelo mesmo
motivo: ela anima até a altura real do conteúdo, sem teto chutado.

### Quatro defeitos do campo de data

1. **O foco fugia.** O `change` redesenhava a barra inteira, e `montar` recria
   os elementos — o campo recém-usado era destruído. Agora os dois `<input>`
   são criados uma vez e reaproveitados; o `change` atualiza só o resumo. É a
   mesma armadilha do travamento de digitação na etapa 4 do chamado.
2. **O seletor nativo saía no esquema errado.** `:root` declara
   `color-scheme: light dark`, então com o tema forçado pelo botão contra a
   preferência do sistema o navegador desenhava o calendário no esquema do
   sistema — ícone escuro sobre campo escuro. `:root[data-tema="escuro"]` agora
   declara `color-scheme: dark`, e o claro o oposto.
3. **Intervalo invertido devolvia lista vazia sem explicação.** Escolher "de"
   depois de "até" é erro de digitação, não de intenção: as duas datas são
   trocadas, e a troca aparece nos campos — senão a tela mostraria um
   intervalo e o filtro usaria outro.
4. **Não dava para digitar o ano.** O Chrome dispara `change` a cada dígito do
   ano assim que os três segmentos têm algum valor: digitar "2" já forma
   `0002-08-19`, uma data completa. O filtro era aplicado ali, a tela
   redesenhava, o foco sumia — e nunca se chegava ao "2026". Agora o `change`
   é descartado enquanto o ano tiver menos de quatro dígitos, o `min` do campo
   é `2000-01-01`, e um `blur` recolhe o valor final caso o `change` tenha
   sido ignorado.

Como a tela reconstrói a barra a cada consulta, e `montar` desanexa a caixa
por um instante — o que apaga o foco —, o componente guarda o elemento focado
e o devolve quando a caixa volta ao documento.

## "O Supabase não reconhece meu usuário"

O sintoma era entrar e cair na tela de acesso como se a conta não existisse.
Investigado, eram três coisas somadas.

### A causa: perfil apagado à mão

O log do Postgres mostrou, na janela do problema, tentativas de `DELETE` em
`perfis` vindas do Table Editor do painel. Apagar a linha de `perfis` **não
apaga o usuário em `auth.users`**: a conta continua autenticando, e a
aplicação, que busca o perfil pelo id do usuário, não acha nada.

Duas das três contas do projeto estavam nesse estado. Foram reparadas a partir
dos metadados que o próprio cadastro gravou em `raw_user_meta_data` — nome,
cargo, departamento e telefone estavam todos lá.

`f18` acrescentou `garantir_perfil()`: quando a sessão autentica mas não acha
perfil, o banco refaz a linha a partir desses metadados. A função lê
`auth.uid()` e nada mais, então ninguém consegue criar ou reanimar o perfil de
outra pessoa. O painel do Supabase não sabe da regra de que um registro depende
do outro, e vai acontecer de novo.

### Dois defeitos que transformavam qualquer tropeço em "deslogado"

**`sessaoAtual()` devolvia `null` para tudo.** Sem sessão, falha de rede ao
buscar o perfil e conta sem perfil viravam o mesmo `null`, e `null` mandava
para a tela de acesso. Agora `obterSessao()` devolve o estado real —
`anonimo`, `autenticado`, `sem_perfil` ou `indisponivel` — e cada um tem sua
tela. Falha de carga mostra o motivo e um botão de tentar de novo, não o
formulário de login.

**O arranque usava `getUser()`**, que bate na rede. Um segundo de rede ruim
respondia "você não está logado". Passou a usar `getSession()`, que lê do
armazenamento local; a validação do token continua acontecendo pela renovação
automática do cliente, e um token de fato inválido chega pelo
`onAuthStateChange`.

**E o catálogo deslogava.** No `.catch` do arranque, qualquer erro zerava o
perfil — inclusive uma falha ao carregar o catálogo de serviços, que é
conteúdo, não credencial. Agora falhar ali avisa e segue.

Junto veio o `onAuthStateChange`: sessão encerrada em outra aba, ou token
revogado, agora reflete na tela em vez de esperar o próximo recarregamento.

## Senha: o que dá para ver e o que não dá

**Não dá para ver a senha de ninguém.** O que `auth.users.encrypted_password`
guarda é um hash bcrypt, e hash não tem volta — nem para a TI, nem para o
suporte do Supabase. Isso é uma garantia, não uma limitação: se desse para
ler, um vazamento do banco entregaria a senha de todo mundo, e como as pessoas
repetem senha, entregaria junto o banco e o e-mail pessoal delas.

O que se recupera é o **acesso**, não a senha.

### O fluxo de recuperação

1. "Esqueci minha senha" na tela de acesso pede o e-mail.
2. `resetPasswordForEmail` manda um token de uso único, válido por uma hora,
   apontando para `#/nova-senha`.
3. O link abre uma sessão de recuperação; o cliente dispara
   `PASSWORD_RECOVERY` e a tela vira a de senha nova.
4. `updateUser({ password })` grava, e a sessão de recuperação é encerrada —
   quem trocou entra de novo, agora com a senha que definiu.

Duas decisões que importam:

**A resposta é a mesma para e-mail cadastrado e não cadastrado.** Dizer "esta
conta não existe" entrega quem tem conta aqui a quem estiver testando
endereços.

**A sessão de recuperação não entra no sistema.** Ela autentica, mas
`trocandoSenha` prende a tela na troca de senha: deixar passar seria permitir
entrar com um link de e-mail, pulando a senha inteira.

Para um coordenador disparar a recuperação de outra pessoa, o caminho hoje é o
painel do Supabase — **Authentication → Users → Send recovery email**. Fazer
isso de dentro da Central Green exigiria a `service_role key`, que ignora RLS
e por isso não pode existir no navegador; seria uma Edge Function, não código
de front.

### O olho no campo de senha

Campo de senha ganhou o botão de mostrar. Quem digita às cegas erra e não sabe
onde — a alternativa é errar a senha três vezes até desconfiar do teclado.

A senha volta a ficar escondida quando o campo perde o foco: revelada, ela não
pode ficar na tela depois que a pessoa parou de digitar. E o botão tem
`tabindex="-1"`, porque no Tab o caminho natural é senha → Entrar, não senha →
olho → Entrar.

## Excluir chamado sem apagar do banco

Mesma regra que já valia para demanda: `excluido_em`, `excluido_por` e
`motivo_exclusao`. O registro some das listas e continua auditável — um
gatilho `BEFORE DELETE` recusa o apagamento físico com a mensagem explicando o
caminho certo.

Aqui a razão é mais forte que na demanda: chamado carrega prazo de SLA,
eventos e interações. Apagar a linha reescreveria o indicador do mês **depois**
de ele já ter sido lido.

### Quem pode, e quando

| | Solicitante | Gestão |
|---|---|---|
| Antes da primeira resposta | pode | pode |
| Depois da primeira resposta | não — combine e cancele | pode |
| Resolvido ou fechado | não | só admin |

Chamado resolvido conta no SLA do período: para desfazer o atendimento
reabre-se, para encerrar sem solução usa-se o status "cancelado". Excluir
seria mudar um número que a gestão pode já ter lido.

O motivo é obrigatório, com no mínimo cinco caracteres — é ele que explica o
sumiço para quem procurar o chamado depois. A restauração é ato de gestão e
limpa `excluido_por` e `motivo_exclusao`.

A policy de leitura mostra o excluído apenas para a gestão e para quem o
abriu; a fila ganhou o botão **Excluídos** para quem pode restaurar. E a
apuração de tempos passou a ignorá-los: saíram das listas, não podem continuar
contando na média.

## Delta nos indicadores

"Esperando agora: 8" não diz se a fila está enchendo ou esvaziando — e é essa
a pergunta.

| Indicador | Delta contra |
|---|---|
| Espera média na fila | a janela anterior de mesmo tamanho, em minutos |
| Esperando agora | o retrato de 24h atrás, em unidades |

O retrato de ontem é reconstruído dos carimbos: estava aberto naquele
instante, ainda sem resposta naquele instante, e sem encerramento até lá.

O delta aparece como `Δ +2 ▲ vs. ontem` — símbolo, sinal e seta juntos, e a
cor segue o sinal: **verde para positivo, vermelho para negativo**, zero em
cinza. Símbolo e seta acompanham porque a cor sozinha não chega a quem não a
distingue, nem ao papel impresso.

Vale saber o que isso significa nestes dois indicadores: como ambos medem
espera, um delta positivo é fila crescendo — e aparece em verde. Se preferir a
leitura invertida em tempo de espera, é uma linha em `indicador()`.

`null` quando não há período anterior para comparar. Zero mentiria dizendo
"estável".

## Setor e senioridade vêm do cadastro

`perfis.setor_id` nascia nulo em todo mundo. Como `minhas_abas()` só devolve
recorte quando há setor, a configuração de abas por setor — construída na F11
— nunca chegava a valer: o menu inteiro aparecia para todos.

Agora o cadastro pede o setor, numa lista que vem de
`setores_para_cadastro()`. A função é `security definer` e devolve **só id e
caminho de folhas ativas**: pedir "em nome de Tecnologia" quando existem
quatro subsetores esconde quem realmente precisa. Setor inexistente entra como
nulo em vez de derrubar o cadastro.

### Senioridade sai do cargo; hierarquia não

`senioridade_do_cargo()` lê o texto digitado e deriva o rótulo:

| Cargo contém | Senioridade |
|---|---|
| estagiário, trainee, aprendiz, auxiliar, junior, jr | junior |
| senior, sr, III | senior |
| especialista, principal, staff, arquiteto, líder, head | especialista |
| diretor, executivo, CTO, CEO, CFO | executivo |
| qualquer outra coisa | pleno |

Isso é seguro porque **senioridade é rótulo**: nenhuma policy a consulta.

`hierarquia` fica de fora de propósito, e é a parte que importa. Ela decide
`sou_gestor()`, que aparece em política de RLS de quase toda tabela. Deduzi-la
de um cargo autodeclarado deixaria qualquer pessoa escrever "Coordenador" no
cadastro e sair com poder de gestão sobre a operação inteira. Promover
continua sendo ato de um coordenador, pela tela Pessoas — que é também o que
deixa rastro legível na auditoria.

`garantir_perfil()` recebeu as mesmas regras: quem for recuperado nasce com o
setor e a senioridade do próprio cadastro, não com o padrão.

## O sino que não aparecia

O sino de notificações existia desde a F8 — `construirSino` montado no
cabeçalho, contador de não lidas, painel com a lista. Só o ícone não aparecia:
via-se o número vermelho flutuando sozinho.

`icone()` monta o SVG só com `viewBox`, sem `width` nem `height`. Sem dimensão
declarada o navegador aplica o tamanho padrão de elemento substituído, e
dentro de um botão em flex o resultado é o ícone sumir ou estourar. Existia
uma regra dimensionando SVG — `.rail__item svg` —, mas ela cobria só o menu
lateral, que é onde os outros ícones estavam. Por isso "Alternar tema" e
"Sair" apareciam e o sino não.

A correção é uma regra para qualquer ícone dentro de botão, mais uma classe
própria para o sino, que é maior que os demais.

## Branco e verde no tema claro

O cabeçalho e o menu já eram brancos — usavam `--c-surface`. O que faltava era
o verde: no claro, a marca precisa aparecer.

| | Claro | Escuro |
|---|---|---|
| Fundo do cabeçalho | **verde** `#0b7a45` | verde profundo `#0d2b1c` |
| Texto do cabeçalho | branco | `#eef7f1` |
| Fundo do menu | branco | `#0e1411` |
| Borda do menu | verde claro `#cfe4d6` | neutra |
| Rótulos dos grupos | verde | cinza |
| "Central Green" no topo do menu | verde | claro |

O cabeçalho é verde preenchido, não branco com filete: barra cheia dá à marca
presença que uma linha de 2px não dá. No escuro o mesmo verde vivo brilharia
demais sobre o preto, então lá ele é um verde profundo — reconhecível como
verde, sem virar farol.

Contraste conferido: branco sobre `#0b7a45` dá 5,4:1 e o subtítulo 4,2:1;
no escuro, 13,7:1 e 7,4:1. Todos passam em AA para texto normal.

Os botões do cabeçalho precisaram de tratamento próprio. A regra vale para
`.btn--sutil`, não para `.btn` inteiro: pegar todos apagaria um botão
primário que alguma página venha a colocar no slot de ações — hoje vazio, mas
o slot existe. O primário sobre o verde inverte, para não sumir dentro dele.

A troca é por token, não por regra fixa no layout, porque o escuro precisa do
oposto: sobre preto, o mesmo verde nos filetes e rótulos vira ruído e disputa
atenção com o item selecionado — que é a única coisa ali que deveria puxar o
olho. Por isso os dois lados existem declarados, e nenhum é derivado do outro.

O item ativo já era verde (`--c-accent-wash` com texto em `--c-accent`) e
continua sendo: agora, no claro, ele fica sobre branco em vez de sobre o
cinza-esverdeado do fundo, e o contraste aumenta sem mudar cor nenhuma.

### O menu também é verde

Cabeçalho e menu formam um L verde contínuo. Isso obrigou a rever tudo que ali
dentro usava a própria cor da marca — sobre verde cheio, verde não separa nada.

| Peça | Antes | Agora |
|---|---|---|
| Logo | G verde | **G branco** (`igreen-g-branco.png`) |
| "OPERAÇÃO DE TI" | verde | verde-claro sobre o verde |
| Item selecionado | fundo verde-lavado, texto verde | **fundo branco, texto verde** |
| Item em hover | cinza claro | verde mais escuro |
| Insígnia de hierarquia | verde / âmbar / cinza | tinta clara |

O item selecionado **inverte** em vez de escurecer: num menu verde, outro
verde para marcar a página atual não se distingue do fundo. Branco sobre verde
separa por luminosidade, não por matiz — que é o que sobrevive ao daltonismo.

### O escuro fica como estava

O verde é só do tema claro. No escuro, cabeçalho e menu voltam à superfície
neutra de sempre — sobre preto, uma barra verde cheia vira farol e rouba a
atenção do item selecionado, que é a única coisa ali que deveria puxar o olho.

Isso exigiu que as correções de contraste do menu verde **desaparecessem** no
escuro, sem virar um segundo conjunto de regras. A saída foi um token que só
existe no claro:

```css
:root            { --c-menu-tinta: #ffffff; }
:root[data-tema="escuro"] { --c-menu-tinta: initial; }

.rail .insignia--coordenador { color: var(--c-menu-tinta, var(--c-accent)); }
.rail .insignia--gestor      { color: var(--c-menu-tinta, var(--c-p3)); }
```

`initial` num custom property faz o `var()` cair no fallback. Cada peça volta
sozinha à cor original, e não existe uma linha sequer duplicando a regra por
tema.

O logo troca de arquivo: branco no claro, verde no escuro, alternados por
`display`. A tela de acesso e o carregamento seguem com o G verde — lá o fundo
é claro no claro e preto no escuro, e o verde funciona nos dois.

Conferido no CSS compilado: todos os valores do tema escuro batem com os de
antes — `#0e1411` no fundo, `#1c2620` nas bordas, `#0c2418` no item ativo.

### A grade fica montada mesmo vazia

Sem nada no recorte, o cronograma trocava o gráfico por um cartão de aviso — e
com ele iam embora a régua de datas, as faixas de fim de semana e a coluna de
hoje. Justamente o que situa quem está olhando: vazio, o cronograma ainda
responde "que semana é esta".

Agora a grade fica montada e o aviso ocupa uma única linha, no lugar onde as
barras apareceriam. A legenda continua abaixo.

Isso exigiu extrair `fundoDaTrilha()` — fins de semana e coluna de hoje —, que
antes vivia dentro de `linha()`. A linha vazia precisa do mesmo fundo, e
duplicar vinte linhas para isso teria deixado duas versões da mesma regra para
divergir depois.

A linha vazia é a única que cresce (`min-height` em vez de altura fixa), porque
o texto é longo. As demais seguem em 44px, que é o que mantém as setas de
dependência alinhadas — elas posicionam por cálculo, não por medição.
