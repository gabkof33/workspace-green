/**
 * Legenda dos serviços como tabela — não como lista solta.
 *
 * O texto corrido ("28 chamadas · 0.0% erro · p95 134 ms") quebra linha de
 * jeitos diferentes por item e o resultado lê como se um item invadisse o
 * outro. Cada estatística do `detalhe` (separadas por " · ") vai para a
 * própria coluna, alinhada com a coluna de cima e de baixo.
 */

import { h } from "@/lib/dom";

export interface ItemLegenda {
  cor: string;
  rotulo: string;
  /** Três estatísticas separadas por " · " — o mesmo formato em todo lugar que monta isto. */
  detalhe: string;
}

export function desenharLegendaServicos(itens: ItemLegenda[]): HTMLElement {
  if (itens.length === 0) return h("div", {});

  return h(
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
          h("th", {}, ""),
          h("th", {}, "Serviço"),
          h("th", { class: "num" }, "Chamadas"),
          h("th", { class: "num" }, "Erro"),
          h("th", { class: "num" }, "p95"),
        ),
      ),
      h(
        "tbody",
        {},
        ...itens.map((item) => {
          const [chamadas, erro, p95] = item.detalhe.split(" · ");
          return h(
            "tr",
            {},
            h(
              "td",
              {},
              h("span", {
                class: "grafo__legenda-ponto",
                style: `background:${item.cor}`,
              }),
            ),
            h("td", { class: "mono" }, item.rotulo),
            h("td", { class: "num mono" }, chamadas ?? "—"),
            h("td", { class: "num mono" }, erro ?? "—"),
            h("td", { class: "num mono" }, p95 ?? "—"),
          );
        }),
      ),
    ),
  );
}
