# Observabilidade de APIs

## Objetivo

A tela de Observabilidade mostra chamadas reais feitas pelo frontend da Central Green ao Supabase. Ela não simula dependências de servidor: a topologia é propositalmente uma estrela, em que a origem é o próprio aplicativo web e cada destino representa uma RPC, tabela, autenticação ou outro endpoint chamado.

O ponto de entrada da tela é `src/pages/observabilidade.ts`, pela função `renderizarObservabilidade`.

## O que é capturado

Cada chamada instrumentada gera um evento com metadados operacionais:

| Campo | Descrição |
| --- | --- |
| Serviço de destino | Ex.: `rpc:kpis_observabilidade`, `tabela:chamados` ou `auth:login`. |
| Método e endpoint | Método HTTP e caminho da API, sem query string. |
| Status | Código HTTP, quando disponível. |
| Latência | Tempo total da chamada no navegador. |
| Tempo de banco | Melhor esforço via `Server-Timing`; pode ser nulo. |
| Quantidade de registros | Melhor esforço via `Content-Range`; pode ser nula. |
| Erro | Categoria (`rede`, `cliente` ou `servidor`) e mensagem resumida. |
| Trace | Identificadores para agrupar chamadas disparadas por uma mesma ação. |

Por privacidade, a instrumentação não lê corpo de requisição/resposta, token de autenticação, cabeçalhos sensíveis nem parâmetros de filtro da URL. A única exceção é `grant_type` em `/auth/v1/token`: sem ele, uma senha errada (`auth:login`) e uma sessão expirada (`auth:refresh`) apareceriam como o mesmo erro no mesmo endpoint. É um enum do protocolo OAuth, não dado da pessoa.

## Como o fluxo funciona

```text
fetch do cliente
  -> fetch instrumentado
  -> evento capturado localmente
  -> fila em lote
  -> eventos_api no Supabase
  -> RPCs/consultas de leitura
  -> tela de Observabilidade
```

A aba de fluxo em tempo real também recebe o evento local imediatamente. Em paralelo, ela assina inserções de `eventos_api` via Supabase Realtime para receber chamadas de outras sessões. O `request_id` evita duplicação entre a versão local e a versão que retorna pelo Realtime.

## Abas da tela

### Mapa de serviços

Leitura visual e editável da topologia. Cada cartão representa um serviço, mostra volume e p95, e as linhas tracejadas representam as conexões partindo da Central Green.

- Arraste a Central Green ou qualquer serviço para reorganizar o diagrama.
- Clique em uma linha para focar a conexão e aplicar zoom.
- Arraste a alça exibida no meio da linha selecionada para ajustar sua curvatura.
- Clique no fundo para retornar à visão geral.

As animações são ilustrativas: chamadas, taxa de erro, p95 e cores são os dados factuais; os pulsos só ajudam a ler o fluxo.

### Grafo (RED)

Aplica o modelo RED aos destinos:

- **R — Rate:** quantidade de chamadas; também controla a espessura relativa da conexão.
- **E — Errors:** taxa de chamadas com erro.
- **D — Duration:** latência p95.

A cor de cada nó e aresta representa o pior estado entre taxa de erro e p95.

| Estado | Taxa de erro | p95 |
| --- | --- | --- |
| Amostra curta | menos de 20 chamadas na janela | — |
| OK | abaixo de 1% | abaixo de 300 ms |
| Alerta | 1% a 4,99% | 300 ms a 999 ms |
| Crítico | 5% ou mais | 1 s ou mais |

Abaixo de 20 chamadas na janela o nó fica cinza e o tooltip diz "amostra curta", em vez de aplicar os limiares. Com 3 requisições a menor taxa de erro possível diferente de zero é 33% — sete vezes o limiar de crítico. Serviços de baixo volume por natureza, como `auth:login`, ficariam permanentemente vermelhos sem nada ter acontecido. O número real continua visível: só a cor é suspensa.

Selecione um nó para abrir um painel com chamadas, taxa de erro e p95. A mesma ação pode ser feita pelo teclado com `Tab` e `Enter`/`Espaço`.

### Distributed tracing

Lista traços recentes e permite selecionar um deles para ver a cascata de spans. Um traço agrupa chamadas realizadas dentro de uma ação instrumentada com `comEscopoDeTraco`.

O navegador observa que as chamadas aconteceram sob a mesma ação; ele não inventa uma árvore de causalidade de servidor que não foi capturada.

### Fluxo em tempo real

Usa uma topologia estável de 60 minutos para posicionar os nós e anima apenas eventos reais recebidos durante a sessão.

- O status do cabeçalho informa a última chamada observada.
- A conexão e o destino da última chamada ficam destacados.
- Pacotes verdes representam chamadas sem erro; pacotes vermelhos representam status HTTP `>= 400`.
- A tabela mostra até 40 chamadas recebidas na sessão atual.

## Janela de tempo e KPIs

As abas Mapa, Grafo e Tracing aceitam janelas de 15 min, 1 h, 4 h ou 24 h. Os indicadores exibem total de requisições, taxa de erro, p95/p50 e usuários ativos para a janela selecionada.

## Arquivos principais

| Arquivo | Responsabilidade |
| --- | --- |
| `src/pages/observabilidade.ts` | Estado da tela, filtros, montagem das abas e composição de dados. |
| `src/lib/observabilidade-nucleo.ts` | Instrumentação do `fetch` e proteção de dados sensíveis. |
| `src/lib/observabilidade-fila.ts` | Agrupamento e gravação dos eventos. |
| `src/lib/observabilidade.ts` | Consultas, formatação e limiares de saúde. |
| `src/lib/observabilidade-tempo-real.ts` | Assinatura local + Supabase Realtime, com deduplicação. |
| `src/components/mapa-ruas.ts` | Mapa editável com linhas tracejadas, zoom e ajustes de rota. |
| `src/components/grafo-servicos.ts` | Grafo RED/topologia, seleção de nós e destaque de conexão ao vivo. |
| `src/components/cascata-traco.ts` | Cascata visual de spans de um trace. |
| `src/components/pacote-em-transito.ts` | Animação de um evento real no SVG. |

## Limitações conhecidas

- A visão atual cobre somente chamadas observáveis do cliente web ao Supabase.
- Não há agente no servidor; dependências internas do backend não aparecem.
- Tempo de banco e quantidade de registros dependem de cabeçalhos expostos pela API e podem ser nulos.
- Ajustes manuais do mapa são mantidos enquanto a visualização está aberta; ainda não são persistidos por usuário.

## Como estender

Para incluir outro destino, mantenha a classificação em `servicoDestinoDaUrl` e garanta que a chamada passe pelo cliente Supabase instrumentado. Para métricas de backend, seria necessário adicionar instrumentação no serviço correspondente e unificar os eventos em um formato compatível com `eventos_api`.
