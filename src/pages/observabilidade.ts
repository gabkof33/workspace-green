/**
 * Observabilidade de APIs: Mapa de serviços, Grafo (RED), Distributed
 * Tracing e Fluxo de requisições em tempo real — as quatro leituras do
 * mesmo log de chamadas reais deste frontend ao Supabase.
 *
 * Topologia em estrela de propósito: só há uma origem observável (este
 * próprio app) — sem agente do lado do servidor não há como ver mais do que
 * isso, e fingir uma malha de vários serviços seria inventar dado.
 */

import { aguardando } from "@/components/esqueleto";
import { histogramaEmpilhado, indicador } from "@/components/grafico";
import {
  desenharGrafoServicos,
  type ArestaGrafo,
  type NoGrafo,
} from "@/components/grafo-servicos";
import {
  desenharMapaRuas,
  type PredioRua,
  type RuaSegmento,
} from "@/components/mapa-ruas";
import { desenharCascataDeTraco } from "@/components/cascata-traco";
import { desenharFluxoTermico } from "@/components/fluxo-termico";
import { lancarPacote } from "@/components/pacote-em-transito";
import { avisar, h, montar } from "@/lib/dom";
import { tempoRelativo } from "@/lib/formato";
import {
  agruparVolume,
  amostraCurta,
  avaliarLatencia,
  avaliarTaxaErro,
  carregarEventosRecentes,
  carregarGrafoServicos,
  carregarKpisObservabilidade,
  carregarSpansDoTraco,
  carregarTracosRecentes,
  corDaSituacao,
  duracaoMs,
  porcentagem,
  type Situacao,
} from "@/lib/observabilidade";
import {
  iniciarFluxoTempoReal,
  pararFluxoTempoReal,
} from "@/lib/observabilidade-tempo-real";
import type {
  EventoApi,
  GrafoServicos,
  KpisObservabilidade,
  Perfil,
  TracoResumo,
} from "@/types/dominio";

const ORIGEM_CHAVE = "central-ti-web";

type SubAba = "mapa" | "grafo" | "tracos" | "fluxo";

const SUB_ABAS: Array<[SubAba, string]> = [
  ["mapa", "Mapa de serviços"],
  ["grafo", "Grafo (RED)"],
  ["tracos", "Distributed tracing"],
  ["fluxo", "Fluxo em tempo real"],
];

const PERIODOS: Array<[number, string]> = [
  [15, "15 min"],
  [60, "1 h"],
  [240, "4 h"],
  [1440, "24 h"],
];

function rotuloJanela(minutos: number): string {
  return PERIODOS.find(([v]) => v === minutos)?.[1] ?? `${minutos} min`;
}

/* ---------- Volume de chamadas no tempo ---------- */

/**
 * Quantas faixas o histograma usa, por janela.
 *
 * Não é um número fixo: 48 faixas em 15 minutos dariam baldes de 18 segundos,
 * onde quase toda coluna é 0 ou 1 e a forma desaparece no ruído. O alvo é um
 * balde que agregue o suficiente para ter forma.
 */
function faixasPara(minutos: number): number {
  if (minutos <= 15) return 30;
  if (minutos <= 60) return 40;
  return 48;
}

/** Só a hora no eixo; a data completa fica no tooltip via `rotuloFaixa`. */
function rotuloFaixa(iso: string, minutos: number): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    // Segundos só nas janelas curtas, onde o balde é menor que um minuto e
    // duas faixas vizinhas mostrariam o mesmo rótulo.
    ...(minutos <= 15 ? { second: "2-digit" } : {}),
  });
}

/**
 * Histograma de volume por desfecho.
 *
 * A ordem das séries é a ordem do empilhamento, de baixo para cima: o volume
 * que respondeu forma a base em cinza recessivo, e o que falhou fica por cima,
 * onde se vê contra ela. Gastar cor saturada na base roubaria peso visual de
 * exatamente o que se procura num gráfico de observabilidade.
 */
function volumeNoTempo(eventos: EventoApi[], minutos: number): HTMLElement {
  const faixas = agruparVolume(eventos, minutos, faixasPara(minutos));

  return histogramaEmpilhado({
    titulo: "Volume de chamadas",
    subtitulo: `${faixas.length} faixas na janela de ${rotuloJanela(minutos)}`,
    faixas: faixas.map((f) => rotuloFaixa(f.inicio, minutos)),
    series: [
      {
        chave: "ok",
        rotulo: "Respondeu",
        cor: "var(--g-vol-ok)",
        valores: faixas.map((f) => f.ok),
      },
      {
        chave: "sem-resposta",
        rotulo: "Sem resposta",
        cor: "var(--g-vol-sem-resposta)",
        valores: faixas.map((f) => f.semResposta),
      },
      {
        chave: "erro",
        rotulo: "Erro (4xx/5xx)",
        cor: "var(--g-vol-erro)",
        valores: faixas.map((f) => f.erro),
      },
    ],
    vazio:
      "Nenhuma chamada nesta janela — use outra tela da Central Green para gerar tráfego.",
  });
}

/* ---------- Grafo: mesma RPC, duas maneiras de colorir ---------- */

function piorSituacao(primeira: Situacao, segunda: Situacao): Situacao {
  const peso = { "amostra-curta": 0, ok: 0, alerta: 1, critico: 2 } as const;
  return peso[primeira] >= peso[segunda] ? primeira : segunda;
}

function montarGrafo(
  dados: GrafoServicos,
  modo: "topologia" | "red",
): { origem: NoGrafo; destinos: NoGrafo[]; arestas: ArestaGrafo[] } {
  const maxRequisicoes = Math.max(1, ...dados.nos.map((n) => n.requisicoes));

  const destinos: NoGrafo[] = dados.nos.map((n) => ({
    chave: n.servico,
    rotulo: n.servico,
    cor: modo === "red" ? corDaSituacao(piorSituacao(avaliarTaxaErro(n.taxa_erro, n.requisicoes), avaliarLatencia(n.p95_ms))) : "var(--g2)",
    valor: String(n.requisicoes),
    detalhe: `${n.requisicoes} chamada${n.requisicoes === 1 ? "" : "s"} · ${porcentagem(n.taxa_erro)} erro${amostraCurta(n.requisicoes) ? " (amostra curta)" : ""} · p95 ${duracaoMs(n.p95_ms)}`,
  }));

  const arestas: ArestaGrafo[] = dados.arestas.map((a) => ({
    origem: ORIGEM_CHAVE,
    destino: a.destino,
    cor: modo === "red" ? corDaSituacao(piorSituacao(avaliarTaxaErro(a.taxa_erro, a.requisicoes), avaliarLatencia(a.p95_ms))) : "var(--g-eixo)",
    espessura: Math.max(0.4, Math.round((a.requisicoes / maxRequisicoes) * 2 * 10) / 10),
    detalhe: `${a.requisicoes} chamada${a.requisicoes === 1 ? "" : "s"} · p95 ${duracaoMs(a.p95_ms)}`,
  }));

  return {
    origem: {
      chave: ORIGEM_CHAVE,
      rotulo: "Central Green (web)",
      cor: "var(--c-accent)",
      detalhe: "Origem: este frontend",
    },
    destinos,
    arestas,
  };
}

/** Mesma RPC do grafo, só que para o desenho de ruas/prédios/carros. */
function montarMapaRuas(
  dados: GrafoServicos,
): { predios: PredioRua[]; ruas: RuaSegmento[] } {
  const maxRequisicoes = Math.max(1, ...dados.arestas.map((a) => a.requisicoes));

  const predios: PredioRua[] = dados.nos.map((n) => ({
    chave: n.servico,
    rotulo: n.servico,
    situacao: avaliarTaxaErro(n.taxa_erro, n.requisicoes),
    valor: String(n.requisicoes),
    detalhe: `${n.requisicoes} chamada${n.requisicoes === 1 ? "" : "s"} · ${porcentagem(n.taxa_erro)} erro${amostraCurta(n.requisicoes) ? " (amostra curta)" : ""} · p95 ${duracaoMs(n.p95_ms)}`,
  }));

  const ruas: RuaSegmento[] = dados.arestas.map((a) => ({
    destino: a.destino,
    carros: Math.max(1, Math.round((a.requisicoes / maxRequisicoes) * 3)),
    detalhe: `${a.requisicoes} chamada${a.requisicoes === 1 ? "" : "s"} · p95 ${duracaoMs(a.p95_ms)}`,
  }));

  return { predios, ruas };
}

export function renderizarObservabilidade(
  alvo: HTMLElement,
  _perfil: Perfil,
): void {
  let subAba: SubAba = "mapa";
  let minutos = 60;
  let tracoSelecionado: string | null = null;
  let linhasFluxo: EventoApi[] = [];

  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  const aoSair = (): void => {
    pararFluxoTempoReal();
    window.removeEventListener("hashchange", aoSair);
  };
  window.addEventListener("hashchange", aoSair);

  const trocarSubAba = (proxima: SubAba): void => {
    if (subAba === proxima) return;
    if (subAba === "fluxo") pararFluxoTempoReal();
    subAba = proxima;
    tracoSelecionado = null;
    desenhar();
  };

  const trocarPeriodo = (v: number): void => {
    minutos = v;
    desenhar();
  };

  /* ---------- Cabeçalho: sub-abas + janela ---------- */

  const cabecalho = (): HTMLElement => {
    const filhos: Array<HTMLElement | null> = SUB_ABAS.map(([chave, rotulo]) =>
      h(
        "button",
        {
          class: `btn btn--sm${subAba === chave ? " btn--primario" : ""}`,
          type: "button",
          on: { click: () => trocarSubAba(chave) },
        },
        rotulo,
      ),
    );

    if (subAba !== "fluxo") {
      filhos.push(h("span", { class: "empurra" }));
      filhos.push(h("span", { class: "filtro-data__rotulo" }, "Janela"));
      for (const [v, rotulo] of PERIODOS) {
        filhos.push(
          h(
            "button",
            {
              class: `btn btn--sm${minutos === v ? " btn--primario" : ""}`,
              type: "button",
              on: { click: () => trocarPeriodo(v) },
            },
            rotulo,
          ),
        );
      }
    }

    return h("div", { class: "grade-filtros" }, ...filhos);
  };

  /* ---------- KPIs ---------- */

  const indicadores = (k: KpisObservabilidade): HTMLElement =>
    h(
      "div",
      { class: "grade-kpi" },
      indicador({
        rotulo: "Requisições",
        valor: String(k.total_requisicoes),
        cor: "var(--g2)",
        nota: `Janela de ${rotuloJanela(k.janela_minutos)}`,
      }),
      indicador({
        rotulo: "Taxa de erro",
        valor: porcentagem(k.taxa_erro),
        cor: corDaSituacao(avaliarTaxaErro(k.taxa_erro, k.total_requisicoes)),
        nota: `${k.total_erros} erro${k.total_erros === 1 ? "" : "s"}${amostraCurta(k.total_requisicoes) ? " · amostra curta" : ""}`,
      }),
      indicador({
        rotulo: "Latência p95",
        valor: duracaoMs(k.p95_ms),
        cor: corDaSituacao(avaliarLatencia(k.p95_ms)),
        nota: `p50 ${duracaoMs(k.p50_ms)}`,
      }),
      indicador({
        rotulo: "Usuários ativos",
        valor: String(k.usuarios_ativos),
        cor: "var(--g4)",
      }),
    );

  const detalheDoNo = (no: NoGrafo): HTMLElement => {
    const [chamadas, erro, p95] = no.detalhe.split(" · ");
    return h(
      "div",
      { class: "cartao grafico" },
      h(
        "div",
        { class: "grafico__cabecalho" },
        h("h3", { class: "grafico__titulo" }, `Detalhes: ${no.rotulo}`),
      ),
      h(
        "div",
        { class: "grade-kpi" },
        indicador({ rotulo: "Chamadas", valor: chamadas ?? "—", cor: no.cor }),
        indicador({ rotulo: "Taxa de erro", valor: erro ?? "—", cor: no.cor }),
        indicador({ rotulo: "Latência p95", valor: p95 ?? "—", cor: no.cor }),
      ),
    );
  };

  /* ---------- Traços ---------- */

  const listaDeTracos = (
    tracos: TracoResumo[],
    selecionar: (traceId: string) => void,
  ): HTMLElement => {
    if (tracos.length === 0) {
      return h("p", { class: "texto-sutil" }, "Nenhum traço na janela escolhida.");
    }
    return h(
      "div",
      { class: "cartao grafico" },
      h(
        "div",
        { class: "grafico__cabecalho" },
        h("h3", { class: "grafico__titulo" }, "Traços recentes"),
      ),
      h(
        "div",
        { class: "tabela-rolagem" },
        h(
          "table",
          { class: "tabela" },
          h(
            "thead",
            {},
            h(
              "tr",
              {},
              h("th", {}, "Quando"),
              h("th", {}, "Ação"),
              h("th", {}, "Serviços"),
              h("th", { class: "num" }, "Spans"),
              h("th", { class: "num" }, "Duração"),
              h("th", { class: "num" }, "Erros"),
            ),
          ),
          h(
            "tbody",
            {},
            ...tracos.map((t) =>
              h(
                "tr",
                {
                  class: `linha-clicavel${tracoSelecionado === t.trace_id ? " linha-clicavel--ativa" : ""}`,
                  on: { click: () => selecionar(t.trace_id) },
                },
                h("td", {}, tempoRelativo(t.iniciado_em)),
                h("td", {}, t.nome_operacao ?? "—"),
                h("td", { class: "texto-sutil" }, t.servicos.join(", ")),
                h("td", { class: "num mono" }, String(t.spans)),
                h("td", { class: "num mono" }, duracaoMs(t.duracao_ms)),
                h(
                  "td",
                  { class: `num mono${t.erros > 0 ? " tag--critica" : ""}` },
                  String(t.erros),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  };

  /* ---------- Tabela de chamadas: embaixo de qualquer uma das quatro sub-abas ---------- */

  const tabelaDeChamadas = (
    eventos: EventoApi[],
    tituloTabela: string,
    vazio = "Nenhuma chamada na janela escolhida.",
  ): HTMLElement => {
    if (eventos.length === 0) {
      return h("p", { class: "texto-sutil" }, vazio);
    }
    return h(
      "div",
      { class: "cartao grafico" },
      h(
        "div",
        { class: "grafico__cabecalho" },
        h("h3", { class: "grafico__titulo" }, tituloTabela),
      ),
      h(
        "div",
        { class: "tabela-rolagem" },
        h(
          "table",
          { class: "tabela" },
          h(
            "thead",
            {},
            h(
              "tr",
              {},
              h("th", {}, "Hora"),
              h("th", {}, "Serviço"),
              h("th", {}, "Endpoint"),
              h("th", {}, "Método"),
              h("th", { class: "num" }, "Status"),
              h("th", { class: "num" }, "Latência"),
              h("th", {}, "Erro"),
            ),
          ),
          h(
            "tbody",
            {},
            ...eventos.map((l) =>
              h(
                "tr",
                {},
                h(
                  "td",
                  { class: "mono" },
                  new Date(l.criado_em).toLocaleTimeString(),
                ),
                h("td", {}, l.servico_destino),
                h("td", { class: "mono" }, l.endpoint),
                h("td", {}, l.metodo_http),
                h(
                  "td",
                  { class: "num mono" },
                  l.status_code === null ? "—" : String(l.status_code),
                ),
                h("td", { class: "num mono" }, duracaoMs(l.latencia_ms)),
                h("td", { class: "texto-sutil" }, l.erro_tipo ?? "—"),
              ),
            ),
          ),
        ),
      ),
    );
  };

  /* ---------- Desenho principal ---------- */

  const desenhar = (): void => {
    aguardando(area, "painel");

    if (subAba === "mapa") {
      void Promise.all([
        carregarGrafoServicos(minutos),
        carregarKpisObservabilidade(minutos),
        carregarEventosRecentes(minutos),
      ])
        .then(([grafo, kpis, eventos]) => {
          const { predios, ruas } = montarMapaRuas(grafo);
          const resultado = desenharMapaRuas(
            "Mapa de serviços",
            "Central Green (web)",
            predios,
            ruas,
          );
          montar(
            area,
            cabecalho(),
            indicadores(kpis),
            resultado.elemento,
            tabelaDeChamadas(eventos, "Chamadas na janela"),
          );
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha ao carregar o mapa.", "erro"),
        );
      return;
    }

    if (subAba === "grafo") {
      void Promise.all([
        carregarGrafoServicos(minutos),
        carregarKpisObservabilidade(minutos),
        carregarEventosRecentes(minutos),
      ])
        .then(([grafo, kpis, eventos]) => {
          const montado = montarGrafo(grafo, "red");
          const painelDetalhe = h(
            "div",
            {},
            h(
              "p",
              { class: "texto-sutil" },
              "Selecione uma faixa do fluxo para ver as métricas do serviço.",
            ),
          );
          const resultado = desenharFluxoTermico(
            "Fluxo térmico (RED)",
            montado.destinos,
            eventos,
            minutos,
            (no) => montar(painelDetalhe, detalheDoNo(no)),
          );
          montar(
            area,
            cabecalho(),
            indicadores(kpis),
            resultado,
            painelDetalhe,
            volumeNoTempo(eventos, minutos),
            tabelaDeChamadas(eventos, "Chamadas na janela"),
          );
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha ao carregar o grafo.", "erro"),
        );
      return;
    }

    if (subAba === "tracos") {
      void Promise.all([
        carregarTracosRecentes(minutos),
        carregarEventosRecentes(minutos),
      ])
        .then(([tracos, eventos]) => {
          const containerDetalhe = h("div", {});

          const desenharDetalhe = (): void => {
            if (!tracoSelecionado) {
              montar(
                containerDetalhe,
                h(
                  "p",
                  { class: "texto-sutil" },
                  "Selecione um traço para ver a cascata de chamadas.",
                ),
              );
              return;
            }

            const idSelecionado = tracoSelecionado;
            montar(containerDetalhe, h("p", { class: "texto-sutil" }, "Carregando…"));

            void carregarSpansDoTraco(idSelecionado)
              .then((spans) => {
                // Trocou de traço enquanto carregava: o resultado antigo não vale mais.
                if (tracoSelecionado !== idSelecionado) return;
                montar(
                  containerDetalhe,
                  h(
                    "div",
                    { class: "cartao grafico" },
                    h(
                      "div",
                      { class: "grafico__cabecalho" },
                      h("h3", { class: "grafico__titulo" }, "Cascata do traço"),
                    ),
                    desenharCascataDeTraco(spans),
                  ),
                );
              })
              .catch((e: unknown) =>
                avisar(e instanceof Error ? e.message : "Falha ao carregar o traço.", "erro"),
              );
          };

          const selecionar = (traceId: string): void => {
            tracoSelecionado = traceId;
            desenharDetalhe();
          };

          montar(
            area,
            cabecalho(),
            listaDeTracos(tracos, selecionar),
            containerDetalhe,
            tabelaDeChamadas(eventos, "Chamadas na janela"),
          );
          desenharDetalhe();
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha ao carregar os traços.", "erro"),
        );
      return;
    }

    // Fluxo: topologia fixa de 60 min só para ter coordenadas de nó estáveis;
    // quem alimenta a animação e a tabela é o Realtime, não este RPC.
    pararFluxoTempoReal();
    linhasFluxo = [];

    void carregarGrafoServicos(60)
      .then((grafo) => {
        const montado = montarGrafo(grafo, "topologia");
        const resultado = desenharGrafoServicos(
          "Fluxo de requisições em tempo real",
          montado.origem,
          montado.destinos,
          montado.arestas,
          "Sem tráfego na última hora — use outra aba da Central Green para ver os pacotes chegarem aqui.",
        );
        resultado.elemento.classList.add("fluxo__grafo");
        const statusFluxo = h(
          "div",
          { class: "fluxo__status" },
          h("span", { class: "fluxo__pulso" }),
          h("span", {}, "Aguardando chamadas reais nesta sessão…"),
        );
        resultado.elemento.querySelector(".grafico__cabecalho")?.append(statusFluxo);
        const svg = resultado.elemento.querySelector<SVGSVGElement>(".grafo__svg");

        const containerTabela = h("div", {});
        const desenharTabela = (): void =>
          montar(
            containerTabela,
            tabelaDeChamadas(
              linhasFluxo,
              "Últimas chamadas (tempo real)",
              "Nenhuma chamada capturada ainda nesta sessão. Use outra aba da Central Green para gerar tráfego.",
            ),
          );
        desenharTabela();

        montar(area, cabecalho(), resultado.elemento, containerTabela);

        iniciarFluxoTempoReal((evento) => {
          linhasFluxo = [evento, ...linhasFluxo].slice(0, 40);
          resultado.destacarConexao(evento.servico_destino);
          statusFluxo.lastElementChild!.textContent = `Agora: ${evento.servico_destino} · ${duracaoMs(evento.latencia_ms)}`;

          const origemCoord = resultado.coordenadaDoNo(ORIGEM_CHAVE);
          const destinoCoord = resultado.coordenadaDoNo(evento.servico_destino);
          if (svg && origemCoord && destinoCoord) {
            const comErro = evento.status_code !== null && evento.status_code >= 400;
            lancarPacote(svg, {
              de: origemCoord,
              para: destinoCoord,
              cor: comErro ? "var(--c-erro)" : "var(--c-accent)",
              latenciaMs: evento.latencia_ms,
            });
          }

          desenharTabela();
        });
      })
      .catch((e: unknown) =>
        avisar(e instanceof Error ? e.message : "Falha ao carregar o fluxo.", "erro"),
      );
  };

  desenhar();
}
