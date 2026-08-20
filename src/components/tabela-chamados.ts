/**
 * Tabela de chamados com barra de SLA — usada na fila do agente e no portal.
 */

import { corDaTag } from "@/lib/api";
import { h } from "@/lib/dom";
import { navegar } from "@/lib/router";
import {
  avaliarSla,
  classeStatus,
  dataCurta,
  rotuloStatus,
  rotuloTipo,
} from "@/lib/formato";
import { POLITICAS_SLA } from "@/lib/prioridade";
import type { ChamadoEnriquecido } from "@/types/dominio";

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
  if (opcoes.chamados.length === 0) {
    return h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "vazio" },
        h("h3", {}, opcoes.vazio.titulo),
        h("p", {}, opcoes.vazio.texto),
      ),
    );
  }

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
      h("td", { class: "tabela__num" }, c.numero),
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
      h("tbody", {}, ...linhas),
    ),
  );
}
