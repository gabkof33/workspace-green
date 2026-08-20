/** Esqueleto de carregamento. */

import { h, montar } from "@/lib/dom";

type Forma = "tabela" | "ficha" | "painel" | "lista";

/** Barra de brilho. */
function barra(largura: number, altura = 11): HTMLElement {
  return h("span", {
    class: "esq",
    style: `width:${largura}%;height:${altura}px`,
  });
}

/** Larguras que não se repetem em coluna. */
const LARGURAS = [92, 64, 78, 55, 86, 70, 60, 81];

function esqueletoTabela(linhas = 7): HTMLElement {
  return h(
    "div",
    { class: "cartao esq-bloco" },
    h(
      "div",
      { class: "esq-linha esq-linha--cabecalho" },
      barra(18, 9),
      barra(34, 9),
      barra(12, 9),
      barra(14, 9),
    ),
    ...Array.from({ length: linhas }, (_, i) =>
      h(
        "div",
        { class: "esq-linha" },
        barra(16),
        barra(LARGURAS[i % LARGURAS.length] ?? 70),
        barra(11),
        barra(13),
      ),
    ),
  );
}

function esqueletoLista(linhas = 5): HTMLElement {
  return h(
    "div",
    { class: "esq-bloco pilha" },
    ...Array.from({ length: linhas }, (_, i) =>
      h(
        "div",
        { class: "cartao esq-cartao" },
        barra(LARGURAS[i % LARGURAS.length] ?? 70, 13),
        barra(46, 9),
      ),
    ),
  );
}

/** Duas colunas, como a ficha de chamado e a de demanda. */
function esqueletoFicha(): HTMLElement {
  return h(
    "div",
    { class: "esq-bloco esq-ficha" },
    h(
      "div",
      { class: "pilha" },
      h("div", { class: "cartao esq-cartao" }, barra(58, 16), barra(30, 9)),
      h(
        "div",
        { class: "cartao esq-cartao" },
        barra(92),
        barra(86),
        barra(74),
        barra(40),
      ),
      h("div", { class: "cartao esq-cartao" }, barra(46, 13), barra(88)),
    ),
    h(
      "div",
      { class: "pilha" },
      h(
        "div",
        { class: "cartao esq-cartao" },
        barra(36, 9),
        barra(70),
        barra(30, 9),
        barra(62),
        barra(34, 9),
        barra(54),
      ),
    ),
  );
}

function esqueletoPainel(): HTMLElement {
  return h(
    "div",
    { class: "esq-bloco pilha" },
    h(
      "div",
      { class: "esq-indicadores" },
      ...Array.from({ length: 4 }, () =>
        h("div", { class: "cartao esq-cartao" }, barra(52, 9), barra(38, 22)),
      ),
    ),
    h(
      "div",
      { class: "cartao esq-cartao" },
      barra(30, 11),
      h("span", { class: "esq esq--grafico" }),
    ),
  );
}

const FORMAS: Record<Forma, () => HTMLElement> = {
  tabela: () => esqueletoTabela(),
  lista: () => esqueletoLista(),
  ficha: esqueletoFicha,
  painel: esqueletoPainel,
};

/** Pinta o esqueleto **só quando a área está vazia**. */
export function aguardando(area: HTMLElement, forma: Forma = "tabela"): void {
  if (area.childElementCount > 0) return;
  montar(area, FORMAS[forma]());
}

/** Esqueleto sem a condição de área vazia. */
export function esqueleto(forma: Forma = "tabela"): HTMLElement {
  return FORMAS[forma]();
}
