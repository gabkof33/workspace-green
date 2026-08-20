/** Dashboard de tempos: média de atendimento e espera de fila. */

import { aguardando } from "@/components/esqueleto";
import { areaTemporal, barras, indicador } from "@/components/grafico";
import { avisar, h, montar } from "@/lib/dom";
import { carregarTempos, duracao, META_ESPERA } from "@/lib/tempos";
import type {
  PainelTempos,
  Perfil,
  TemposPorEquipe,
  TemposPorPrioridade,
} from "@/types/dominio";

const PERIODOS: Array<[number, string]> = [
  [7, "7 dias"],
  [30, "30 dias"],
  [90, "90 dias"],
];

/** Cor por prioridade, a mesma do cronograma. */
const COR_PRIORIDADE: Record<string, string> = {
  P1: "var(--g5)",
  P2: "var(--g3)",
  P3: "var(--g1)",
  P4: "var(--g2)",
};

const COR_FILA = [
  "var(--g1)",
  "var(--g2)",
  "var(--g3)",
  "var(--g4)",
  "var(--g5)",
];

export function renderizarTempos(alvo: HTMLElement, _perfil: Perfil): void {
  let dias = 30;

  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  const desenhar = (): void => {
    aguardando(area, "painel");

    void carregarTempos(dias)
      .then((p) => {
        montar(
          area,
          filtros(),
          indicadores(p),
          h(
            "div",
            { class: "grade-graficos" },
            serieDeEspera(p),
            barrasPorPrioridade(p.por_prioridade),
          ),
          barrasPorFila(p.por_equipe),
          tabela(p),
        );
      })
      .catch((e: unknown) =>
        avisar(
          e instanceof Error ? e.message : "Falha ao apurar os tempos.",
          "erro",
        ),
      );
  };

  const filtros = (): HTMLElement =>
    h(
      "div",
      { class: "grade-filtros" },
      h("span", { class: "filtro-data__rotulo" }, "Janela"),
      ...PERIODOS.map(([v, rotulo]) =>
        h(
          "button",
          {
            class: `btn btn--sm${dias === v ? " btn--primario" : ""}`,
            type: "button",
            on: {
              click: () => {
                dias = v;
                desenhar();
              },
            },
          },
          rotulo,
        ),
      ),
      h(
        "span",
        { class: "texto-sutil empurra" },
        "Espera = da abertura até a primeira resposta. Solução desconta pausas.",
      ),
    );

  /* ---------- Indicadores ---------- */

  const indicadores = (p: PainelTempos): HTMLElement => {
    const r = p.resumo;
    return h(
      "div",
      { class: "grade-kpi" },
      indicador({
        rotulo: "Espera média na fila",
        valor: duracao(r.espera_media_min),
        cor: "var(--g2)",
        variacao:
          r.delta_espera_min === null
            ? null
            : {
                valor: r.delta_espera_min,
                texto: duracao(Math.abs(r.delta_espera_min)),
                referencia: `vs. ${p.periodo_dias}d anteriores`,
              },
        nota: "Sem período anterior para comparar",
      }),
      indicador({
        rotulo: "Solução média",
        valor: duracao(r.solucao_media_min),
        cor: "var(--g4)",
        nota: `${r.chamados} chamado${r.chamados === 1 ? "" : "s"} na janela`,
      }),
      indicador({
        rotulo: "Esperando agora",
        valor: String(r.fila_agora),
        unidade: r.fila_agora === 1 ? " chamado" : " chamados",
        cor: "var(--g3)",
        variacao: {
          valor: r.delta_fila,
          texto: String(Math.abs(r.delta_fila)),
          referencia: "vs. ontem",
        },
      }),
      indicador({
        rotulo: "Pior espera aberta",
        valor: duracao(r.espera_atual_pior_min),
        cor: "var(--g5)",
        nota: "O mais antigo ainda sem primeira resposta",
      }),
    );
  };

  /* ---------- Série ---------- */

  const serieDeEspera = (p: PainelTempos): HTMLElement =>
    areaTemporal({
      titulo: "Espera média por dia",
      subtitulo: `Últimos ${p.periodo_dias} dias`,
      cor: "var(--g2)",
      formatar: duracao,
      pontos: p.por_dia.map((d) => ({
        rotulo: d.dia.slice(8) + "/" + d.dia.slice(5, 7),
        valor: d.espera_min,
      })),
    });

  /* ---------- Barras ---------- */

  const barrasPorPrioridade = (lista: TemposPorPrioridade[]): HTMLElement =>
    barras(
      "Espera por prioridade",
      lista.map((i) => ({
        rotulo: i.prioridade,
        valor: i.espera_min,
        cor: COR_PRIORIDADE[i.prioridade] ?? "var(--g2)",
        detalhe: duracao(i.espera_min),
        ...(META_ESPERA[i.prioridade] !== undefined
          ? { meta: META_ESPERA[i.prioridade] as number }
          : {}),
      })),
      duracao,
      "Nenhum chamado no período.",
    );

  const barrasPorFila = (lista: TemposPorEquipe[]): HTMLElement =>
    barras(
      "Espera média por fila",
      lista.map((i, n) => ({
        rotulo: i.equipe,
        valor: i.espera_min,
        cor: COR_FILA[n % COR_FILA.length] as string,
        detalhe: `${duracao(i.espera_min)} · ${i.chamados}`,
      })),
      duracao,
      "Nenhuma fila movimentou chamado no período.",
    );

  /* ---------- Tabela ---------- */

  /**
   * Os mesmos números dos gráficos, em texto.
   *
   * Não é redundância: é o que torna o painel legível para quem usa leitor de
   * tela, e o que permite conferir um valor exato que a barra só aproxima.
   */
  const tabela = (p: PainelTempos): HTMLElement => {
    const linhas = [
      ...p.por_prioridade.map((i) => ({
        grupo: "Prioridade",
        nome: i.prioridade,
        chamados: i.chamados,
        espera: i.espera_min,
        solucao: i.solucao_min,
        aguardando: null as number | null,
      })),
      ...p.por_equipe.map((i) => ({
        grupo: "Fila",
        nome: i.equipe,
        chamados: i.chamados,
        espera: i.espera_min,
        solucao: i.solucao_min,
        aguardando: i.aguardando,
      })),
    ];

    return h(
      "div",
      { class: "cartao grafico" },
      h(
        "div",
        { class: "grafico__cabecalho" },
        h("h3", { class: "grafico__titulo" }, "Números do período"),
        h(
          "span",
          { class: "grafico__subtitulo" },
          "Os mesmos dados dos gráficos, em valores exatos",
        ),
      ),
      linhas.length === 0
        ? h("p", { class: "texto-sutil" }, "Sem chamados na janela escolhida.")
        : h(
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
                  h("th", {}, "Recorte"),
                  h("th", {}, "Nome"),
                  h("th", { class: "num" }, "Chamados"),
                  h("th", { class: "num" }, "Espera média"),
                  h("th", { class: "num" }, "Solução média"),
                  h("th", { class: "num" }, "Esperando"),
                ),
              ),
              h(
                "tbody",
                {},
                ...linhas.map((l) =>
                  h(
                    "tr",
                    {},
                    h("td", { class: "texto-sutil" }, l.grupo),
                    h("td", {}, l.nome),
                    h("td", { class: "num mono" }, String(l.chamados)),
                    h("td", { class: "num mono" }, duracao(l.espera)),
                    h("td", { class: "num mono" }, duracao(l.solucao)),
                    h(
                      "td",
                      { class: "num mono" },
                      l.aguardando === null ? "—" : String(l.aguardando),
                    ),
                  ),
                ),
              ),
            ),
          ),
    );
  };

  desenhar();
}
