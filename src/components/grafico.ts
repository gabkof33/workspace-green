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
  /**
   * Curva suave em vez de segmentos retos — o `type="monotone"` das linhas do
   * DS. Ver `caminhoSuave` para o motivo de não ser um spline qualquer.
   */
  suave?: boolean;
}

/**
 * Caminho cúbico MONÓTONO (Fritsch–Carlson), não um spline solto.
 *
 * Um spline comum passa pelos pontos mas ultrapassa entre eles: numa série de
 * contagens, a curva mergulharia abaixo de zero entre dois dias de valor 1 e
 * 0, desenhando um número negativo que não existe. A regra monótona zera a
 * tangente onde a série inverte e limita a inclinação ao triplo da menor
 * variação vizinha — a curva ondula, mas nunca inventa mínimo nem máximo.
 *
 * É a mesma garantia do `monotone` do recharts, que é o que o DS usa.
 */
function caminhoSuave(
  pontos: Array<[number, number]>,
): string {
  if (pontos.length < 2) {
    const [p] = pontos;
    return p ? `M ${p[0]},${p[1]}` : "";
  }

  const n = pontos.length;
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = pontos[i]!;
    const b = pontos[i + 1]!;
    delta.push((b[1] - a[1]) / (b[0] - a[0]));
  }

  const tangente: number[] = [delta[0] ?? 0];
  for (let i = 1; i < n - 1; i++) {
    const d0 = delta[i - 1]!;
    const d1 = delta[i]!;
    // Inversão de sentido: tangente zero, senão a curva passa do ponto.
    if (d0 * d1 <= 0) {
      tangente.push(0);
      continue;
    }
    const media = (d0 + d1) / 2;
    const teto = 3 * Math.min(Math.abs(d0), Math.abs(d1));
    tangente.push(Math.sign(media) * Math.min(Math.abs(media), teto));
  }
  tangente.push(delta[n - 2] ?? 0);

  let d = `M ${pontos[0]![0]},${pontos[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const a = pontos[i]!;
    const b = pontos[i + 1]!;
    const h = (b[0] - a[0]) / 3;
    const c1 = `${a[0] + h},${a[1] + tangente[i]! * h}`;
    const c2 = `${b[0] - h},${b[1] - tangente[i + 1]! * h}`;
    d += ` C ${c1} ${c2} ${b[0]},${b[1]}`;
  }
  return d;
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

  const coordenadas: Array<[number, number]> = o.pontos.map((x, i) => [
    px(i),
    py(x.valor),
  ]);
  const linha = o.suave
    ? caminhoSuave(coordenadas)
    : `M ${coordenadas.map(([x, y]) => `${x},${y}`).join(" L ")}`;

  svg.append(
    svgEl("path", {
      class: "grafico__area",
      // Fecha a área descendo às bordas: o `L` aqui é de fechamento, não faz
      // parte da curva.
      d: `${linha} L 100,100 L 0,100 Z`,
      fill: o.cor,
    }),
    svgEl("path", { class: "grafico__linha", d: linha, stroke: o.cor }),
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

/* ==========================================================================
   Histograma empilhado
   ========================================================================== */

export interface SerieEmpilhada {
  chave: string;
  rotulo: string;
  cor: string;
  /** Um valor por faixa, na mesma ordem de `faixas`. */
  valores: number[];
}

export interface OpcoesHistograma {
  titulo: string;
  subtitulo?: string;
  /** Rótulo de cada faixa no eixo x, já formatado. */
  faixas: string[];
  /** A ordem do array é a ordem do empilhamento, de baixo para cima. */
  series: SerieEmpilhada[];
  formatar?: (v: number) => string;
  vazio?: string;
}

/**
 * Barras empilhadas ao longo do tempo — volume e composição no mesmo desenho.
 *
 * Em HTML/CSS, não SVG. As outras peças deste arquivo usam um viewBox 0–100
 * esticado por `preserveAspectRatio="none"`, o que é ótimo para área e linha e
 * ruim para barra: a folga entre segmentos e o canto arredondado esticariam
 * junto e sairiam deformados, cada um com largura diferente conforme a
 * proporção do cartão. Em CSS a folga é 2px em qualquer largura.
 *
 * Puramente apresentacional: recebe séries com cor e rótulo já resolvidos.
 * Quem chama decide o que cada série significa.
 */
export function histogramaEmpilhado(o: OpcoesHistograma): HTMLElement {
  const formatar = o.formatar ?? ((v: number): string => String(v));
  const n = o.faixas.length;

  const totalDaFaixa = (i: number): number =>
    o.series.reduce((soma, s) => soma + (s.valores[i] ?? 0), 0);

  const totalGeral = o.series.reduce(
    (soma, s) => soma + s.valores.reduce((a, b) => a + b, 0),
    0,
  );

  const cabecalho = h(
    "div",
    { class: "grafico__cabecalho" },
    h("h3", { class: "grafico__titulo" }, o.titulo),
    o.subtitulo ? h("span", { class: "grafico__subtitulo" }, o.subtitulo) : null,
  );

  if (n === 0 || totalGeral === 0) {
    return h(
      "div",
      { class: "cartao grafico" },
      cabecalho,
      h(
        "p",
        { class: "texto-sutil" },
        o.vazio ?? "Sem chamadas na janela escolhida.",
      ),
    );
  }

  // Teto arredondado, pelo mesmo motivo de `areaTemporal`: rótulo de eixo
  // quebrado ("2847") é mais difícil de ler que um redondo ("3000").
  const maximo = Math.max(1, ...o.faixas.map((_, i) => totalDaFaixa(i)));
  const passo = Math.pow(10, Math.floor(Math.log10(maximo)));
  const topo = Math.max(passo, Math.ceil(maximo / passo) * passo);

  const dica = h("div", { class: "hist__dica" });
  const colunas = h("div", { class: "hist__colunas" });

  o.faixas.forEach((_, i) => {
    const coluna = h("div", { class: "hist__coluna" });

    // Só as séries com valor entram no DOM. Segmento de altura zero ainda
    // consumiria o `gap` da coluna e abriria um buraco de 2px no lugar dele.
    const presentes = o.series.filter((s) => (s.valores[i] ?? 0) > 0);

    presentes.forEach((s, ordem) => {
      const valor = s.valores[i] ?? 0;
      const segmento = h("span", {
        class: `hist__seg${ordem === presentes.length - 1 ? " hist__seg--topo" : ""}`,
        style: `height:${(valor / topo) * 100}%;background:${s.cor}`,
      });
      coluna.append(segmento);
    });

    colunas.append(coluna);
  });

  const eixoY = h(
    "div",
    { class: "hist__eixo-y" },
    ...[4, 3, 2, 1, 0].map((i) => h("span", {}, formatar((topo / 4) * i))),
  );

  const grade = h(
    "div",
    { class: "hist__grade", aria: { hidden: "true" } },
    ...[0, 1, 2, 3, 4].map(() => h("span", {})),
  );

  const plot = h("div", { class: "hist__plot" }, grade, colunas, dica);
  const moldura = h("div", { class: "hist__area" }, eixoY, plot);

  // O alvo é a faixa inteira da coluna, não o segmento pintado: exigir que o
  // ponteiro acerte 3px de barra vermelha seria exigir mira.
  plot.addEventListener("pointermove", (ev) => {
    const caixa = plot.getBoundingClientRect();
    const rel = (ev.clientX - caixa.left) / caixa.width;
    const i = Math.min(Math.max(Math.floor(rel * n), 0), n - 1);

    moldura.classList.add("hist__area--ativa");
    colunas.querySelectorAll(".hist__coluna--ativa").forEach((el) =>
      el.classList.remove("hist__coluna--ativa"),
    );
    colunas.children[i]?.classList.add("hist__coluna--ativa");

    montar(
      dica,
      h("b", {}, o.faixas[i] ?? ""),
      // Toda série aparece, inclusive em zero: "erro 0" é a informação de que
      // não houve erro naquele minuto, e omitir a linha faria parecer que o
      // dado não existe.
      ...o.series.map((s) =>
        h(
          "span",
          { class: "hist__dica-linha" },
          h("i", { class: "hist__ponto", style: `background:${s.cor}` }),
          h("span", { class: "hist__dica-rotulo" }, s.rotulo),
          h("b", {}, formatar(s.valores[i] ?? 0)),
        ),
      ),
    );

    const posicao = ((i + 0.5) / n) * 100;
    dica.style.left = `${Math.min(Math.max(posicao, 0), 100)}%`;
    // Vira para o outro lado depois da metade, senão sai fora do cartão.
    dica.style.transform =
      posicao > 60 ? "translateX(-100%)" : "translateX(0)";
  });

  plot.addEventListener("pointerleave", () => {
    moldura.classList.remove("hist__area--ativa");
    colunas.querySelectorAll(".hist__coluna--ativa").forEach((el) =>
      el.classList.remove("hist__coluna--ativa"),
    );
  });

  const salto = Math.max(1, Math.ceil(n / 7));

  // Legenda com total por série — a leitura que o gráfico não dá: a barra
  // mostra a forma no tempo, o total mostra o tamanho do todo.
  const legenda = h(
    "div",
    { class: "hist__legenda" },
    ...o.series.map((s) =>
      h(
        "span",
        { class: "hist__legenda-item" },
        h("i", { class: "hist__ponto", style: `background:${s.cor}` }),
        h("span", {}, s.rotulo),
        h(
          "b",
          {},
          formatar(s.valores.reduce((a, b) => a + b, 0)),
        ),
      ),
    ),
  );

  return h(
    "div",
    { class: "cartao grafico" },
    cabecalho,
    moldura,
    h(
      "div",
      { class: "hist__eixo-x" },
      ...o.faixas
        .filter((_, i) => i % salto === 0)
        .map((r) => h("span", {}, r)),
    ),
    legenda,
  );
}

/* ==========================================================================
   Rosca — o donut do DS
   ==========================================================================
   Do bloco de gráfico do DS: `innerRadius 64 / outerRadius 92` (razão 0.70),
   `paddingAngle 3` e `strokeWidth 0` — o vão entre fatias separa por espaço,
   não por contorno, que é o que mantém a leitura limpa em fatia fina.

   Rosca e não pizza porque o furo do meio cabe o total: o número que quase
   sempre é a primeira pergunta de quem olha uma distribuição. */

export interface FatiaRosca {
  rotulo: string;
  valor: number;
  /** Cor da fatia. Sem ela, entra a série do DS na ordem. */
  cor?: string;
}

export interface OpcoesRosca {
  titulo: string;
  subtitulo?: string;
  fatias: FatiaRosca[];
  /** O que o furo do meio conta. Default: a soma. */
  centro?: { valor: string; rotulo: string };
  vazio?: string;
}

const SERIE_DS = [
  "var(--ds-chart-1)",
  "var(--ds-chart-2)",
  "var(--ds-chart-3)",
  "var(--ds-chart-4)",
  "var(--ds-chart-5)",
];

/** Ponto na circunferência, com 0° no topo e sentido horário. */
function pontoNoArco(grau: number, raio: number): [number, number] {
  const rad = ((grau - 90) * Math.PI) / 180;
  return [50 + raio * Math.cos(rad), 50 + raio * Math.sin(rad)];
}

export function rosca(o: OpcoesRosca): HTMLElement {
  const total = o.fatias.reduce((s, f) => s + f.valor, 0);
  const presentes = o.fatias.filter((f) => f.valor > 0);

  const svg = svgEl("svg", {
    class: "grafico__rosca",
    viewBox: "0 0 100 100",
    // Sem `preserveAspectRatio="none"` aqui, ao contrário da área: círculo
    // esticado vira elipse, e aí a fatia deixa de ser proporcional ao ângulo.
    role: "img",
    "aria-label": `${o.titulo}: ${total}`,
  });

  const RAIO_EXTERNO = 46;
  const RAIO_INTERNO = 32; // 0.70 do externo, a razão do DS
  const VAO = 3; // graus entre fatias

  if (total > 0) {
    let inicio = 0;

    presentes.forEach((fatia, i) => {
      const fracao = fatia.valor / total;
      // Uma fatia só ocupa a volta inteira: com o vão, ela não fecharia e
      // apareceria como um anel quebrado sem motivo.
      const vao = presentes.length === 1 ? 0 : VAO;
      const angulo = fracao * 360 - vao;
      const fim = inicio + Math.max(angulo, 0.5);

      const [x1, y1] = pontoNoArco(inicio, RAIO_EXTERNO);
      const [x2, y2] = pontoNoArco(fim, RAIO_EXTERNO);
      const [x3, y3] = pontoNoArco(fim, RAIO_INTERNO);
      const [x4, y4] = pontoNoArco(inicio, RAIO_INTERNO);
      const maior = fim - inicio > 180 ? 1 : 0;

      svg.append(
        svgEl("path", {
          class: "grafico__fatia",
          d: [
            `M ${x1} ${y1}`,
            `A ${RAIO_EXTERNO} ${RAIO_EXTERNO} 0 ${maior} 1 ${x2} ${y2}`,
            `L ${x3} ${y3}`,
            `A ${RAIO_INTERNO} ${RAIO_INTERNO} 0 ${maior} 0 ${x4} ${y4}`,
            "Z",
          ].join(" "),
          fill: fatia.cor ?? SERIE_DS[i % SERIE_DS.length] ?? SERIE_DS[0]!,
        }),
      );

      inicio = fim + vao;
    });
  } else {
    // Anel apagado no lugar de espaço em branco: sem ele o cartão parece
    // quebrado em vez de vazio.
    svg.append(
      svgEl("circle", {
        class: "grafico__rosca-vazia",
        cx: "50",
        cy: "50",
        r: String((RAIO_EXTERNO + RAIO_INTERNO) / 2),
        "stroke-width": String(RAIO_EXTERNO - RAIO_INTERNO),
      }),
    );
  }

  const centro = o.centro ?? { valor: String(total), rotulo: "no total" };

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
    h(
      "div",
      { class: "grafico__rosca-corpo" },
      h(
        "div",
        { class: "grafico__rosca-area" },
        svg,
        h(
          "div",
          { class: "grafico__rosca-centro" },
          h("b", {}, centro.valor),
          h("span", {}, centro.rotulo),
        ),
      ),
      h(
        "div",
        { class: "grafico__legenda" },
        ...(total === 0
          ? [
              h(
                "span",
                { class: "grafico__legenda-vazio" },
                o.vazio ?? "Nada para distribuir agora.",
              ),
            ]
          : presentes.map((fatia, i) =>
              h(
                "span",
                { class: "grafico__legenda-item" },
                h("span", {
                  class: "grafico__legenda-cor",
                  style: `background:${fatia.cor ?? SERIE_DS[i % SERIE_DS.length] ?? SERIE_DS[0]!}`,
                }),
                h("span", { class: "grafico__legenda-rotulo" }, fatia.rotulo),
                h(
                  "b",
                  {},
                  `${fatia.valor} · ${Math.round((fatia.valor / total) * 100)}%`,
                ),
              ),
            )),
      ),
    ),
  );
}
