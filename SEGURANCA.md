# Segurança da Central Green

Este documento existe para dizer, sem rodeio, **o que cada camada de defesa
faz e onde ela falha**. Camada com limitação não escrita vira falsa confiança,
e falsa confiança é pior que ausência de defesa: leva a decidir errado.

## A premissa que organiza tudo

A Central Green é uma SPA estática (Vite + TypeScript) servida pela Vercel,
falando direto com o Supabase pelo navegador. Não existe servidor de aplicação
nosso no meio.

Consequência que não tem como contornar:

- Todo o JavaScript da aplicação está na máquina de quem abre a página.
- A `VITE_SUPABASE_PUBLISHABLE_KEY` vai no bundle. É pública por projeto — é
  para ser.
- Qualquer pessoa autenticada pode falar com a API REST do Supabase
  diretamente, com `curl`, sem passar por tela nenhuma.

Portanto: **nenhuma verificação feita no navegador é uma fronteira de
segurança.** `ehAgente()`, `abaVisivel()`, botão escondido, rota barrada — tudo
isso é *ergonomia*: existe para a pessoa não ver uma tela que não é dela. Quem
decide o que cada um lê e escreve é a RLS no Postgres.

As camadas abaixo estão em ordem de quanto realmente protegem.

---

## 1. RLS e permissões no banco — a única fronteira real

**O que é:** 34 tabelas em `public`, todas com `row level security` ligada e
com policy. Funções auxiliares (`sou_agente()`, `meu_papel()`,
`pode_gerir_perfil()`) são `SECURITY DEFINER` de propósito: precisam ler
`perfis` para decidir, e a RLS de `perfis` esconderia a linha de quem está
perguntando.

**Corrigido nesta rodada** (migration
`20260821130000_endurecimento_seguranca.sql`):

| Problema | Antes | Depois |
| --- | --- | --- |
| `vw_diretorio` com `security_invoker=off` e grant para `authenticated` | solicitante lia **todas** as linhas de pessoas ativas | `security_invoker=on`: a view respeita `perfis_leitura` |
| `diretorio()` `SECURITY DEFINER` sem checagem de papel | qualquer autenticado recebia o organograma completo por `/rest/v1/rpc/diretorio` | exige `sou_agente()`; solicitante recebe zero linhas |
| Menção precisava do diretório | usava a RPC completa | nova `diretorio_mencoes()` devolve só `id`, `nome_completo`, `avatar_url` |
| 3 funções de observabilidade com `search_path` mutável | sequestro de nome não qualificado era possível | `search_path = ''` fixo |
| `fn_restaurar_restrito`, `fn_validar_exclusao_chamado` com EXECUTE para `anon` | apareciam como endpoint RPC | EXECUTE revogado |

A prova do furo principal, com o papel simulado no banco:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<id de um solicitante>"}';
select (select count(*) from perfis)       as via_rls,      -- 1
       (select count(*) from vw_diretorio) as via_view,     -- era 3, hoje 1
       (select count(*) from diretorio())  as via_rpc;      -- era 3, hoje 0
```

**Limitações:**

- RLS protege *linha*, não *coluna*. Uma policy que libera a linha libera
  todas as colunas dela. Recorte de coluna só acontece via view ou RPC — que
  é exatamente o que `diretorio_mencoes()` faz.
- `SECURITY DEFINER` ignora RLS por definição. Cada função dessas é uma
  exceção que precisa se justificar sozinha; foi assim que o furo do
  diretório nasceu.
- Policy não valida *conteúdo*. Regra de negócio (motivo de exclusão
  obrigatório, SLA, P1 exigindo ativo) mora em `check` e em trigger, não em
  policy.
- A `service_role` key ignora RLS inteira. Ela nunca pode ir para o
  frontend, nem para `.env.local`.

**Aberto, decisão sua:**

- `setores_para_cadastro()` é chamável por `anon` — a tela de cadastro precisa
  listar setores antes do login. O efeito é que **a árvore de setores da
  empresa é legível por qualquer pessoa na internet** que conheça a URL do
  projeto. Fecha-se movendo o cadastro para uma Edge Function com captcha, ou
  aceita-se como informação não sensível.
- `sistema_vazio()` idem, e vaza um booleano só (existe algum perfil?). Baixo.
- **Proteção contra senha vazada está desligada** no Supabase Auth. Ligar é um
  clique no painel (Authentication → Policies) e checa a senha contra o
  HaveIBeenPwned no cadastro. É a melhoria de maior retorno por esforço em
  toda esta lista.

---

## 2. CSP e cabeçalhos — a defesa que o navegador aplica, não a gente

**O que é:** [vercel.json](vercel.json) manda uma CSP restritiva em toda
resposta.

```
default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self';
connect-src 'self' https://<projeto>.supabase.co wss://<projeto>.supabase.co;
base-uri 'none'; object-src 'none'; frame-src 'none';
frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests
```

Isto é qualitativamente diferente de tudo no arquivo `sentinela.ts`: quem
aplica é o navegador, **antes** de executar, e nenhum JavaScript da página
desliga. `script-src 'self'` sem `'unsafe-inline'` nem `'unsafe-eval'` é o que
transforma um eventual XSS refletido em nada — o script injetado simplesmente
não roda. Confirmado que o build não precisa dessas brechas: a saída do Vite
não tem script inline nem `eval`.

**Limitações:**

- `style-src` tem `'unsafe-inline'`, e não é enfeite: o `<style>` da tela de
  carregamento em `index.html` e ~136 atributos `style=` gerados por
  `h({ style })` dependem dele. CSS injetado permite exfiltrar por seletor de
  atributo e desfigurar a tela; **não** permite executar código. Fechar isto
  exige nonce por resposta (a Vercel não gera para arquivo estático) ou
  migrar os 136 pontos para classe.
- `connect-src` fixa o host do projeto Supabase **em texto**. Trocar de
  projeto e esquecer este arquivo quebra a aplicação inteira, silenciosamente
  em produção.
- CSP não protege contra abuso de API por sessão legítima. Quem está logado e
  usa `curl` não passa por CSP nenhuma — passa pela RLS.
- `frame-ancestors 'none'` mais `X-Frame-Options: DENY` resolvem clickjacking;
  são redundantes de propósito, para navegador antigo.

**Próximo passo real, não feito:** `require-trusted-types-for 'script'`
transformaria as três atribuições de `innerHTML` em erro do navegador, o que
fecharia a categoria de XSS por DOM de forma definitiva. Exige criar uma
policy de Trusted Types e converter `icone()`/`h({html})` para produzir
`TrustedHTML`. Ligar sem isso quebra os ícones.

---

## 3. XSS — fechado no compilador, não em tempo de execução

**O que é:** a aplicação monta DOM com `document.createTextNode`, que escapa
por construção. Não há `document.write`, `eval`, `new Function`,
`insertAdjacentHTML` nem `outerHTML` em nenhum lugar do `src`.

Sobravam três atribuições de `innerHTML` — `h({ html })`, `icone()` e a
insígnia de hierarquia — todas com literal do código, mas com tipo `string`,
ou seja, aceitando qualquer coisa que um autor futuro passasse.

Agora existe um tipo ramificado em [src/lib/dom.ts](src/lib/dom.ts):

```ts
export type MarcacaoEstatica = string & { readonly __estatica: unique symbol };

// Tag de template sem interpolação: `estatico`<path/>`` compila,
// `estatico`<b>${x}</b>`` não — vira chamada de dois argumentos.
export function estatico(partes: TemplateStringsArray): MarcacaoEstatica;
```

`h({ html })` e `icone()` só aceitam `MarcacaoEstatica`. Passar uma variável
com conteúdo de banco, de URL ou de formulário **não compila**. As três
fronteiras auditadas onde texto cru é promovido estão marcadas no código
(`TRACADOS_ICONES` em `dom.ts`, `TRACADOS` em `insignia.ts`, `OLHO_*` em
`login.ts`).

**Limitações:**

- É garantia de *compilação*. `as MarcacaoEstatica` fura, e `@ts-expect-error`
  fura. Protege contra descuido, não contra quem quer contornar.
- Não cobre XSS por atributo: `href`/`src` com `javascript:` continuam
  possíveis pela API de atributo. Hoje nenhum ponto do código monta `href` a
  partir de dado de usuário — se passar a montar, precisa validar o esquema.
- Não cobre XSS armazenado que o navegador renderize fora do nosso caminho de
  DOM. Hoje não existe esse caminho.
- O texto de menção (`texto-mencao.ts`) monta `RegExp` a partir de nomes do
  diretório, com escape (`escaparRegex`). Nome hostil é problema de ReDoS, não
  de XSS, e o escape está no lugar.

---

## 4. Armazenamento local — integridade, nunca confidencialidade

**O que é:** [src/lib/armazenamento.ts](src/lib/armazenamento.ts) centraliza
`localStorage` atrás de um registro de chaves conhecidas, cada uma com
validador. Leitura inválida cai no padrão, apaga a chave e registra evento;
`try/catch` em toda operação (modo privado e cota estourada lançam).

Os cinco pontos que tocavam `localStorage` na mão foram migrados: tema,
gavetas do menu, painel recolhido, filtro de data e aviso do navegador.

**Limitações — e esta é a mais importante do documento:**

- **Não existe proteção contra manipulação de `localStorage`.** É
  armazenamento do cliente, sob controle total do cliente. Qualquer pessoa
  reescreve qualquer chave pelo console, inclusive as do Supabase.
- **O token de sessão do Supabase vive em `localStorage`**
  (`persistSession: true`). Isso é escolha de arquitetura da biblioteca. A
  consequência: XSS bem-sucedido rouba a sessão. É por isso que o item 2 (CSP)
  e o item 3 (XSS) importam muito mais do que qualquer detector de tamper —
  eles atacam a *causa*.
- Trocar por `sessionStorage` não protegeria de XSS (mesma origem, mesmo
  acesso) e perderia sessão entre abas. Cookie `HttpOnly` protegeria, mas
  exige um backend nosso emitindo cookie — o que esta arquitetura não tem.
- O validador impede que preferência corrompida derrube a tela. Não impede
  nada além disso: privilégio não vem de `localStorage`, vem do JWT.

---

## 5. Detectores de manipulação — telemetria, e só

[src/lib/sentinela.ts](src/lib/sentinela.ts) tem quatro detectores. Por
decisão explícita, **nenhum reage**: não derrubam sessão, não recarregam
página, não bloqueiam tela. Todos apenas gravam em `eventos_seguranca`.

| Detector | Sinal | Como falha |
| --- | --- | --- |
| `devtools_suspeito` | delta entre `outerWidth/Height` e `innerWidth/Height` | **Falso positivo:** zoom ≠ 100%, barra de extensão, tela dividida. **Falso negativo:** DevTools em janela separada não muda nada; navegador dirigido por CDP também não. Não existe API que responda "o inspetor está aberto" |
| `dom_mutado` | `MutationObserver` vendo `script`/`iframe`/`object`/`embed` injetado | O observer é um objeto JS na mesma página: `observer.disconnect()` desliga. Extensão legítima que reescreve DOM gera ruído |
| `integridade_divergente` | script de origem externa na página | Compara **referência**, não conteúdo. Proxy que altere o corpo mantendo o nome passa batido |
| `csp_violada` | `securitypolicyviolation` | O único que não é heurística nossa: quem gerou o evento foi o navegador, já tendo bloqueado |

**A limitação que vale para os quatro:** este código roda no ambiente do
atacante. Um breakpoint no arranque, ou um proxy removendo o módulo antes de
chegar ao navegador, e nada disso executa. Como *defesa*, valem zero. Como
*sinal agregado*, valem: cem eventos de `dom_mutado` numa conta em uma tarde é
uma pergunta que vale fazer.

Por isso não há reação. Reagir a heurística falível pune gente legítima —
quem usa leitor de tela, zoom, monitor externo — e não segura quem sabe o que
está fazendo. O custo cai todo no lado errado.

**Sobre a trilha:** todo campo de `eventos_seguranca` é preenchido pelo
cliente, e um cliente hostil mente ou simplesmente não envia. Serve para ver
padrão no conjunto, **nunca para acusar uma sessão**. A tabela é
insert-própria, sem UPDATE/DELETE, leitura restrita a quem não é solicitante,
com teto de 50 eventos por carga de página. `detalhe` nunca recebe payload,
token, texto digitado nem valor de armazenamento — replicar isso para dentro
do banco seria transformar a trilha em veículo do que se quer conter.

---

## 6. Ofuscação — decidido não fazer

Ofuscar não acrescenta fronteira nenhuma aqui, e o motivo é o item 0: o
segredo que protege dado está no Postgres, não no bundle. Renomear
identificadores aumenta o custo de **ler** o código, não o de **usá-lo** —
quem quer a API abre a aba de rede e vê as chamadas prontas, sem tocar no
JavaScript.

O custo é concreto: bundle maior, build mais lento e stack trace ilegível —
numa aplicação que tem uma tela de Observabilidade de APIs justamente para ler
erro de produção.

O que ficou, e é o que de fato importa: `sourcemap: false` em
[vite.config.ts](vite.config.ts). Com source map, o F12 remonta o TypeScript
original inteiro — nomes, comentários, estrutura de arquivos — a partir do
bundle minificado. É a diferença real entre ler código-fonte comentado e ler
minificado. Somado a `legalComments: "none"` e `drop: ["debugger"]`.

---

## Ordem de prioridade, se for mexer em uma coisa só

1. **Ligar proteção contra senha vazada** no painel do Supabase. Um clique.
2. Decidir sobre `setores_para_cadastro()` exposto a `anon`.
3. Migrar os 136 `style=` para classe e tirar `'unsafe-inline'` de `style-src`.
4. Trusted Types (item 2), que fecha XSS por DOM de forma definitiva.
5. Revisar as ~20 funções `SECURITY DEFINER` uma a uma: cada uma é uma exceção
   à RLS, e foi numa delas que o furo do diretório morava.

## O que este documento não cobre

- **Postgres local na máquina de desenvolvimento.** Há um
  `postgresql-x64-17` escutando em `0.0.0.0:5432` nesta estação, com
  `listen_addresses = '*'`. Não tem relação com a Central Green — a aplicação
  fala com o Supabase hospedado por HTTPS e nunca com um banco local. O
  `pg_hba.conf` só autoriza `127.0.0.1/32` e `::1/128`, então conexão de outra
  máquina é recusada na autenticação mesmo com o firewall aberto; o que fica
  exposto é a porta ser descobrível e a superfície pré-autenticação. Corrigir
  é trocar `listen_addresses` para `localhost` e reiniciar o serviço.
- Segurança do painel da Vercel e do Supabase (2FA nas contas, quem tem acesso
  ao projeto). É onde mora o poder de verdade, e nenhuma linha de código deste
  repositório protege isso.
- Backup e restauração.
