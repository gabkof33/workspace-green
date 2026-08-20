/** Peças de gráfico: indicador, área com crosshair e barra horizontal. */

import { h, montar } from "@/lib/dom";

const NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/* ==========================================================================
   Indicador
   ========================================================================== */

export interface OpcoesIndicador {
  rotulo: string;
  valor: string;
  /** Sufixo em tom menor, para a unidade não competir com o número. */
  unidade?: string;
  /** Delta contra o período anterior: positivo verde, negativo vermelho. */
  variacao?: {
    valor: number;
    /** Já formatado: "12 min", "3%", "1 chamado". */
    texto: string;
    referencia: string;
  } | null;
  nota?: string;
  cor?: string;
}

export function indicador(o: OpcoesIndicador): HTMLElement {
  const v = o.variacao;
  const parado = v ? v.valor === 0 : false;
  const positivo = v ? v.valor > 0 : false;

  return h(
    "div",
    { class: "kpi" },
    h(
      "div",
      { class: "kpi__rotulo" },
      o.cor
        ? h("span", { class: "kpi__ponto", style: `background:${o.cor}` })
        : null,
      o.rotulo,
    ),
    h(
      "div",
      { class: "kpi__valor" },
      o.valor,
      o.unidade ? h("span", { class: "kpi__unidade" }, o.unidade) : null,
    ),
    v
      ? h(
          "div",
          {
            class: `kpi__variacao kpi__variacao--${
              parado ? "neutro" : positivo ? "bom" : "ruim"
            }`,
            title: `Δ contra ${v.referencia}`,
          },
          // Símbolo, sinal e seta juntos: o sentido precisa sobreviver ao
          // daltonismo e à impressão, onde a cor não chega.
          h("span", { class: "kpi__delta" }, "Δ"),
          h(
            "b",
            {},
            `${v.valor > 0 ? "+" : v.valor < 0 ? "−" : "±"}${v.texto}`,
          ),
          h("span", {}, parado ? "■" : v.valor > 0 ? "▲" : "▼"),
          h("span", { class: "kpi__ref" }, v.referencia),
        )
      : o.nota
        ? h("div", { class: "kpi__nota" }, o.nota)
        : null,
  );
}

/* ==========================================================================
   Área com crosshair
   ========================================================================== */

export interface PontoSerie {
  rotulo: string;
  valor: number;
}

export interface OpcoesArea {
  titulo: string;
  subtitulo?: string;
  pontos: PontoSerie[];
  cor: string;
  /** Formata o valor no eixo e na dica. */
  formatar: (v: number) => string;
  altura?: number;
}

/**
 * Área de uma série só — por isso sem legenda: o título já a nomeia.
 *
 * Duas séries de escalas diferentes viriam a pedir dois eixos, que é o erro
 * mais comum em gráfico. Quando há duas medidas, são dois gráficos.
 */
export function areaTemporal(o: OpcoesArea): HTMLElement {
  // O SVG carrega só as marcas, num sistema de 0–100 esticado pelo CSS.
  // Rótulo de eixo fica em HTML: dentro de um SVG com
  // `preserveAspectRatio="none"` o texto estica junto e sai deformado.
  const svg = svgEl("svg", {
    class: "grafico__svg",
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none",
    "aria-hidden": "true",
  });

  const valores = o.pontos.map((x) => x.valor);
  const maximo = Math.max(1, ...valores);
  // Teto arredondado para o rótulo do eixo não sair quebrado.
  const passo = Math.pow(10, Math.floor(Math.log10(maximo)));
  const topo = Math.ceil(maximo / passo) * passo;

  const n = Math.max(o.pontos.length - 1, 1);
  const px = (i: number): number => (i / n) * 100;
  const py = (v: number): number => 100 - (v / topo) * 100;

  for (let i = 0; i <= 4; i += 1) {
    svg.append(
      svgEl("line", {
        class: "grafico__grade",
        x1: "0",
        x2: "100",
        y1: String(py((topo / 4) * i)),
        y2: String(py((topo / 4) * i)),
      }),
    );
  }

  const linha = o.pontos.map((x, i) => `${px(i)},${py(x.valor)}`).join(" L ");

  svg.append(
    svgEl("path", {
      class: "grafico__area",
      d: `M ${linha} L 100,100 L 0,100 Z`,
      fill: o.cor,
    }),
    svgEl("path", { class: "grafico__linha", d: `M ${linha}`, stroke: o.cor }),
  );

  const cursor = svgEl("line", {
    class: "grafico__cursor",
    y1: "0",
    y2: "100",
  });
  svg.append(cursor);

  // A marca fica em HTML pelo mesmo motivo do texto: um círculo dentro do
  // SVG esticado viraria elipse.
  const marca = h("span", { class: "grafico__marca" });
  marca.style.background = o.cor;

  const dica = h("div", { class: "grafico__dica" });

  const eixoY = h(
    "div",
    { class: "grafico__eixo-y" },
    ...[4, 3, 2, 1, 0].map((i) => h("span", {}, o.formatar((topo / 4) * i))),
  );

  const plot = h("div", { class: "grafico__plot" }, svg, marca, dica);
  const moldura = h("div", { class: "grafico__area-plot" }, eixoY, plot);

  // O alvo do ponteiro é a área inteira, não a marca: acertar um ponto de 5px
  // com o mouse é trabalho, e ninguém deveria ter esse trabalho.
  plot.addEventListener("pointermove", (ev) => {
    const caixa = plot.getBoundingClientRect();
    const rel = (ev.clientX - caixa.left) / caixa.width;
    const i = Math.min(Math.max(Math.round(rel * n), 0), n);
    const ponto = o.pontos[i];
    if (!ponto) return;

    moldura.classList.add("grafico__area-plot--ativo");
    cursor.setAttribute("x1", String(px(i)));
    cursor.setAttribute("x2", String(px(i)));
    marca.style.left = `${px(i)}%`;
    marca.style.top = `${py(ponto.valor)}%`;

    montar(
      dica,
      h("b", {}, o.formatar(ponto.valor)),
      h("span", {}, ponto.rotulo),
    );
    // Presa às bordas nos extremos, senão a dica sai para fora do cartão.
    dica.style.left = `${Math.min(Math.max(px(i), 8), 92)}%`;
  });
  plot.addEventListener("pointerleave", () =>
    moldura.classList.remove("grafico__area-plot--ativo"),
  );

  const salto = Math.max(1, Math.ceil(o.pontos.length / 7));

  return h(
    "div",
    { class: "cartao grafico" },
    h(
      "div",
      { class: "grafico__cabecalho" },
      h("h3", { class: "grafico__titulo" }, o.titulo),
      o.subtitulo
        ? h("span", { class: "grafico__subtitulo" }, o.subtitulo)
        : null,
    ),
    moldura,
    h(
      "div",
      { class: "grafico__eixo-x" },
      ...o.pontos
        .filter((_, i) => i % salto === 0)
        .map((x) => h("span", {}, x.rotulo)),
    ),
  );
}

/* ==========================================================================
   Barras horizontais
   ========================================================================== */

export interface BarraItem {
  rotulo: string;
  valor: number;
  cor: string;
  /** Texto à direita: sempre presente, nunca só a cor. */
  detalhe: string;
  /** Marca de meta na trilha, na mesma escala. */
  meta?: number;
}

export function barras(
  titulo: string,
  itens: BarraItem[],
  formatar: (v: number) => string,
  vazio = "Sem dados no período.",
): HTMLElement {
  const maximo = Math.max(
    1,
    ...itens.map((i) => Math.max(i.valor, i.meta ?? 0)),
  );

  return h(
    "div",
    { class: "cartao grafico" },
    h(
      "div",
      { class: "grafico__cabecalho" },
      h("h3", { class: "grafico__titulo" }, titulo),
    ),
    itens.length === 0
      ? h("p", { class: "texto-sutil" }, vazio)
      : h(
          "div",
          { class: "barras" },
          ...itens.map((i) =>
            h(
              "div",
              {
                class: "barras__item",
                title: `${i.rotulo}: ${formatar(i.valor)}`,
              },
              h("span", { class: "barras__rotulo" }, i.rotulo),
              h(
                "span",
                { class: "barras__trilha" },
                h("span", {
                  class: "barras__preenchimento",
                  style: `width:${Math.max((i.valor / maximo) * 100, 1.5)}%;background:${i.cor}`,
                }),
                i.meta !== undefined
                  ? h("span", {
                      class: "barras__meta",
                      style: `left:${(i.meta / maximo) * 100}%`,
                      title: `Meta: ${formatar(i.meta)}`,
                    })
                  : null,
              ),
              h("span", { class: "barras__valor" }, i.detalhe),
            ),
          ),
        ),
  );
}
