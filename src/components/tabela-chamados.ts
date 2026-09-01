/**
 * Tabela de chamados com barra de SLA — usada na fila do agente e no portal.
 */

import { corDaTag } from "@/lib/api";
import { botaoCopiarLink } from "@/components/copiar-link";
import { h } from "@/lib/dom";
import { navegar } from "@/lib/router";
import { corpoOuVazio } from "@/components/tabela-vazia";
import {
  avaliarSla,
  classeStatus,
  dataCurta,
  rotuloStatus,
  rotuloTipo,
} from "@/lib/formato";
import { POLITICAS_SLA } from "@/lib/prioridade";
import {
  diasRestantes,
  estaAtrasada,
  STATUS_ABERTOS,
} from "@/lib/demandas";
import type { ChamadoEnriquecido, DemandaEnriquecida } from "@/types/dominio";

export function barraSla(chamado: ChamadoEnriquecido): HTMLElement {
  const politica = POLITICAS_SLA[chamado.prioridade];
  const estado = avaliarSla(
    chamado.aberto_em,
    chamado.prazo_solucao,
    chamado.pausado_desde,
    politica.pct_alerta,
  );

  const largura = Math.min(estado.fracao * 100, 100);

  return h(
    "div",
    { class: "sla" },
    h(
      "div",
      { class: "sla__topo" },
      h("span", {}, estado.rotulo),
      h("span", {}, `${Math.round(estado.fracao * 100)}%`),
    ),
    h(
      "div",
      { class: "sla__trilho" },
      h("div", {
        class:
          `sla__barra sla__barra--${estado.severidade === "ok" ? "" : estado.severidade}`.trim(),
        style: `width:${largura}%`,
      }),
    ),
  );
}

export interface OpcoesTabela {
  chamados: ChamadoEnriquecido[];
  mostrarSolicitante?: boolean;
  mostrarResponsavel?: boolean;
  vazio: { titulo: string; texto: string };
  /** Quando informado, cada tag vira um atalho de filtro. */
  aoClicarTag?: (tag: string) => void;
}

export function tabelaChamados(opcoes: OpcoesTabela): HTMLElement {
  const cabecalho = h(
    "tr",
    {},
    h("th", {}, "Chamado"),
    h("th", {}, "Pri."),
    h("th", {}, "Assunto"),
    opcoes.mostrarSolicitante ? h("th", {}, "Solicitante") : null,
    opcoes.mostrarResponsavel ? h("th", {}, "Responsável") : null,
    h("th", {}, "Status"),
    h("th", {}, "SLA de solução"),
    h("th", {}, "Aberto"),
  );

  const linhas = opcoes.chamados.map((c) =>
    h(
      "tr",
      {
        on: { click: () => navegar(`chamado/${c.numero}`) },
      },
      // O número é o protocolo do atendimento, e é ele que se manda para
      // alguém — daí o botão de link morar aqui, e não numa coluna de ações.
      h(
        "td",
        { class: "tabela__num" },
        h(
          "span",
          { class: "tabela__protocolo" },
          c.numero,
          botaoCopiarLink({
            caminho: `chamado/${c.numero}`,
            rotulo: `Copiar link de ${c.numero}`,
            compacto: true,
          }),
        ),
      ),
      h(
        "td",
        {},
        h("span", { class: `pri pri--${c.prioridade}` }, c.prioridade),
      ),
      h(
        "td",
        {},
        h("span", { class: "tabela__titulo", title: c.titulo }, c.titulo),
        h(
          "span",
          { class: "tabela__meta" },
          `${rotuloTipo(c.tipo)} · ${c.servico_nome}`,
        ),
        c.tags.length > 0
          ? h(
              "span",
              { class: "tags__linha" },
              ...c.tags.map((t) =>
                h(
                  "button",
                  {
                    class: "tags__marca",
                    dataset: { cor: corDaTag(t) },
                    type: "button",
                    title: opcoes.aoClicarTag ? `Filtrar por ${t}` : t,
                    on: {
                      click: (ev: Event) => {
                        // Sem isto o clique abriria o chamado em vez de
                        // filtrar.
                        ev.stopPropagation();
                        opcoes.aoClicarTag?.(t);
                      },
                    },
                  },
                  t,
                ),
              ),
            )
          : null,
      ),
      opcoes.mostrarSolicitante ? h("td", {}, c.solicitante_nome) : null,
      opcoes.mostrarResponsavel
        ? h(
            "td",
            { class: c.responsavel_nome ? "" : "texto-sutil" },
            c.responsavel_nome ?? "não atribuído",
          )
        : null,
      h(
        "td",
        {},
        h("span", { class: classeStatus(c.status) }, rotuloStatus(c.status)),
      ),
      h("td", {}, barraSla(c)),
      h("td", { class: "tabela__num" }, dataCurta(c.aberto_em)),
    ),
  );

  return h(
    "div",
    { class: "tabela-envolucro" },
    h(
      "table",
      { class: "tabela" },
      h("thead", {}, cabecalho),
      // O `colspan` sai da contagem real de células do cabeçalho, porque duas
      // colunas daqui são condicionais (`mostrarSolicitante`,
      // `mostrarResponsavel`). Número fixo envelheceria na primeira coluna
      // nova, e a célula de vazio pararia de atravessar a tabela.
      h(
        "tbody",
        {},
        ...corpoOuVazio(
          linhas,
          cabecalho.childElementCount,
          opcoes.vazio.titulo,
          opcoes.vazio.texto,
        ),
      ),
    ),
  );
}

/**
 * Bloco compacto de demandas para a fila.
 *
 * A fila é a rota padrão de quem entra no app, e até aqui ela só falava de
 * chamado. Demanda criada só aparecia para quem lembrasse de trocar de aba —
 * o que, para trabalho que dura semanas, é o mesmo que não aparecer.
 *
 * Compacto de propósito: quem está na fila está atendendo chamado. O bloco
 * responde "tem demanda me esperando?" em uma olhada; o quadro de demandas
 * continua sendo o lugar de trabalhar nelas.
 */
export interface OpcoesBlocoDemandas {
  demandas: DemandaEnriquecida[];
  /** Quem está olhando — separa "minhas" de "disponíveis". */
  perfilId: string;
}

export function blocoDemandas(o: OpcoesBlocoDemandas): HTMLElement | null {
  const minhas = o.demandas.filter(
    (d) => d.responsavel_id === o.perfilId && STATUS_ABERTOS.includes(d.status),
  );
  const disponiveis = o.demandas.filter((d) => d.status === "disponivel");

  // Nada seu e nada livre: o bloco some em vez de anunciar um zero. A fila
  // já tem cinco indicadores; um sexto dizendo "nenhuma" é ruído.
  if (minhas.length === 0 && disponiveis.length === 0) return null;

  const linha = (d: DemandaEnriquecida): HTMLElement => {
    const dias = diasRestantes(d.data_fim_prevista);
    const atrasada = estaAtrasada(d);

    return h(
      "button",
      {
        class: "demanda-fila",
        type: "button",
        on: { click: () => navegar(`demanda/${d.codigo}`) },
      },
      h("span", { class: "demanda-fila__codigo" }, d.codigo),
      h("span", { class: "demanda-fila__titulo", title: d.titulo }, d.titulo),
      d.responsavel_id === o.perfilId
        ? null
        : h("span", { class: "selo selo--aberto" }, "livre"),
      h(
        "span",
        {
          class: `demanda-fila__prazo${atrasada ? " demanda-fila__prazo--atrasada" : ""}`,
        },
        d.data_fim_prevista === null
          ? "sem prazo"
          : atrasada
            ? "atrasada"
            : dias === null
              ? "sem prazo"
              : dias === 0
                ? "vence hoje"
                : `${dias} d`,
      ),
    );
  };

  const secao = (
    titulo: string,
    lista: DemandaEnriquecida[],
  ): HTMLElement | null =>
    lista.length === 0
      ? null
      : h(
          "div",
          { class: "demanda-fila__grupo" },
          h(
            "div",
            { class: "demanda-fila__rotulo" },
            titulo,
            h("span", { class: "demanda-fila__conta" }, String(lista.length)),
          ),
          // Teto de cinco por grupo: o bloco é um aviso, não a lista inteira.
          ...lista.slice(0, 5).map(linha),
          lista.length > 5
            ? h(
                "button",
                {
                  class: "demanda-fila__mais",
                  type: "button",
                  on: { click: () => navegar("demandas") },
                },
                `ver as outras ${lista.length - 5} no quadro`,
              )
            : null,
        );

  return h(
    "div",
    { class: "cartao demanda-fila__bloco" },
    h(
      "div",
      { class: "cartao__cabecalho" },
      h("span", { class: "cartao__titulo" }, "Demandas"),
      h(
        "button",
        {
          class: "btn btn--sm btn--sutil empurra",
          type: "button",
          on: { click: () => navegar("demandas") },
        },
        "Abrir o quadro",
      ),
    ),
    secao("Suas", minhas),
    secao("Disponíveis", disponiveis),
  );
}
