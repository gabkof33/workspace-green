/**
 * Grafo de nós e arestas: uma origem no centro-esquerda, destinos em duas
 * colunas em zigue-zague à direita — a topologia real desta aplicação, que
 * só tem uma origem observável (o próprio frontend).
 *
 * Nós em anel (contorno colorido, miolo vazio) com o número por dentro, no
 * espírito do Node Graph do Grafana. Sem rótulo de texto solto ao lado de
 * cada nó: com muitos serviços, texto colado à linha de outro nó virava
 * ilegível. Nome e detalhe completos ficam no `title` (hover) e na legenda
 * textual abaixo — que também é o que torna a informação acessível a leitor
 * de tela, já que o SVG em si não é.
 *
 * Puramente apresentacional: cor, espessura e texto já chegam prontos de
 * quem chama. É o que permite o Mapa (neutro) e o Grafo (com métricas RED)
 * compartilharem o mesmo desenho — cada tela só monta os dados de um jeito
 * diferente antes de passar para aqui.
 */

import { desenharLegendaServicos } from "@/components/legenda-servicos";
import { h } from "@/lib/dom";
import { posicionarEmColunas } from "@/lib/layout-grafo";
import { svgEl, svgTexto, svgTitulo } from "@/lib/svg";

export interface NoGrafo {
  chave: string;
  rotulo: string;
  cor: string;
  detalhe: string;
  /** Texto curto para dentro do círculo — tipicamente a contagem de chamadas. */
  valor?: string;
}

export interface ArestaGrafo {
  origem: string;
  destino: string;
  cor: string;
  /** Já normalizada por quem chama, tipicamente 0.4–2. */
  espessura: number;
  detalhe: string;
}

export interface ResultadoGrafo {
  elemento: HTMLElement;
  /** Para quem anima pacotes por cima reaproveitar exatamente este layout. */
  coordenadaDoNo: (chave: string) => { x: number; y: number } | null;
  destacarConexao: (destino: string) => void;
}

const RAIO_ORIGEM = 8;
const RAIO_DESTINO = 6.5;

/** Folga mínima entre a borda de dois nós vizinhos, em unidades do viewBox. */
const FOLGA_ENTRE_NOS = 3;

/** Passo vertical mínimo para dois nós não se encostarem. */
const PASSO_MINIMO = 2 * RAIO_DESTINO + FOLGA_ENTRE_NOS;

const MARGEM_Y = 10;
const LARGURA = 300;
const ALTURA_BASE = 100;

/**
 * Colunas em função de quantos destinos existem.
 *
 * O limite é vertical e é aritmético: a faixa útil tem
 * `ALTURA - 2 * MARGEM_Y` unidades e cada nó ocupa `2 * RAIO_DESTINO`. Com 16
 * destinos em duas colunas davam 8 linhas e passo de 11,4 para nós de 13 — se
 * sobrepunham, e o miolo opaco de cada um cobria o número do de cima.
 *
 * Mais coluna é o que reduz linha. Três é o teto: além disso as arestas que
 * vão para a coluna do fundo cruzam nó de duas colunas antes, e o desenho
 * fica pior do que ficaria mais alto.
 */
function colunasPara(n: number): number[] {
  if (n <= 5) return [230];
  if (n <= 12) return [178, 256];
  return [150, 205, 262];
}

/**
 * Altura do viewBox: cresce só quando as linhas não caberiam.
 *
 * Com poucos nós devolve `ALTURA_BASE` e a proporção 3:1 de sempre — nada
 * muda nas abas de Mapa e Grafo. Passando do que três colunas absorvem, o
 * desenho fica mais alto em vez de apertar os nós: encolher o anel deixaria o
 * número de dentro ilegível, que é justamente a informação que ele carrega.
 */
function alturaPara(linhas: number): number {
  const necessaria = 2 * MARGEM_Y + (linhas - 1) * PASSO_MINIMO;
  return Math.max(ALTURA_BASE, Math.ceil(necessaria));
}

let contadorMarcador = 0;

export function desenharGrafoServicos(
  titulo_: string,
  origem: NoGrafo,
  destinos: NoGrafo[],
  arestas: ArestaGrafo[],
  vazio = "Sem chamadas na janela escolhida.",
  aoSelecionarNo?: (no: NoGrafo) => void,
): ResultadoGrafo {
  const n = destinos.length;
  const colunas = colunasPara(n);
  // `linhasPorColuna`, não `linhas`: `linhas` já é o mapa de arestas por
  // destino, mais abaixo.
  const linhasPorColuna = Math.max(1, Math.ceil(n / colunas.length));
  const altura = alturaPara(linhasPorColuna);
  const coords = posicionarEmColunas(
    origem.chave,
    destinos.map((d) => d.chave),
    { xOrigem: 52, colunas, margemY: MARGEM_Y, altura },
  );

  const coordenadaDoNo = (chave: string): { x: number; y: number } | null =>
    coords.get(chave) ?? null;

  const cabecalho = h(
    "div",
    { class: "grafico__cabecalho" },
    h("h3", { class: "grafico__titulo" }, titulo_),
  );

  if (n === 0) {
    return {
      elemento: h(
        "div",
        { class: "cartao grafico" },
        cabecalho,
        h("p", { class: "texto-sutil" }, vazio),
      ),
      coordenadaDoNo,
      destacarConexao: () => undefined,
    };
  }

  const idMarcador = `grafo-seta-${contadorMarcador++}`;

  const svg = svgEl("svg", {
    class: "grafo__svg",
    viewBox: `0 0 ${LARGURA} ${altura}`,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": "Grafo de serviços; selecione um nó para ver as métricas.",
  });
  const circulos = new Map<string, SVGCircleElement>();
  const linhas = new Map<string, SVGLineElement>();
  const selecionar = (no: NoGrafo, circulo: SVGCircleElement): void => {
    circulos.forEach((item) => item.classList.remove("grafo__no--selecionado"));
    circulo.classList.add("grafo__no--selecionado");
    aoSelecionarNo?.(no);
  };

  const defs = svgEl("defs");
  const marcador = svgEl("marker", {
    id: idMarcador,
    viewBox: "0 0 10 10",
    refX: "8.5",
    refY: "5",
    markerWidth: "4.2",
    markerHeight: "4.2",
    orient: "auto-start-reverse",
  });
  marcador.append(svgEl("path", { class: "grafo__seta", d: "M0,0 L10,5 L0,10 Z" }));
  defs.append(marcador);
  svg.append(defs);

  for (const aresta of arestas) {
    const de = coords.get(aresta.origem);
    const para = coords.get(aresta.destino);
    if (!de || !para) continue;

    // Encolhe a ponta no raio do destino, senão a seta desenha por dentro do nó.
    const dx = para.x - de.x;
    const dy = para.y - de.y;
    const distancia = Math.max(Math.hypot(dx, dy), 0.001);
    const x2 = para.x - (dx / distancia) * (RAIO_DESTINO + 1);
    const y2 = para.y - (dy / distancia) * (RAIO_DESTINO + 1);

    const linha = svgEl("line", {
      class: "grafo__aresta",
      "data-destino": aresta.destino,
      x1: String(de.x),
      y1: String(de.y),
      x2: String(x2),
      y2: String(y2),
      stroke: aresta.cor,
      "stroke-width": String(aresta.espessura),
      "marker-end": `url(#${idMarcador})`,
    });
    linha.append(svgTitulo(aresta.detalhe));
    linhas.set(aresta.destino, linha);
    svg.append(linha);
  }

  const noOrigem = coords.get(origem.chave);
  if (noOrigem) {
    const circulo = svgEl("circle", {
      class: "grafo__no grafo__no--origem",
      cx: String(noOrigem.x),
      cy: String(noOrigem.y),
      r: String(RAIO_ORIGEM),
      fill: origem.cor,
    });
    circulo.append(svgTitulo(origem.detalhe));
    svg.append(
      circulo,
      svgTexto(
        noOrigem.x,
        noOrigem.y + RAIO_ORIGEM + 7,
        origem.rotulo,
        "grafo__rotulo grafo__rotulo--origem",
      ),
    );
  }

  const valores: SVGTextElement[] = [];

  for (const d of destinos) {
    const c = coords.get(d.chave);
    if (!c) continue;

    const circulo = svgEl("circle", {
      class: "grafo__no",
      cx: String(c.x),
      cy: String(c.y),
      r: String(RAIO_DESTINO),
      fill: "var(--c-surface)",
      stroke: d.cor,
      tabindex: "0",
      role: "button",
      "aria-label": `${d.rotulo}: ${d.detalhe}. Ver detalhes`,
    });
    circulo.append(svgTitulo(`${d.rotulo} — ${d.detalhe}`));
    circulos.set(d.chave, circulo);
    circulo.addEventListener("click", () => selecionar(d, circulo));
    circulo.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" || evento.key === " ") {
        evento.preventDefault();
        selecionar(d, circulo);
      }
    });
    svg.append(circulo);

    if (d.valor) valores.push(svgTexto(c.x, c.y + 1.6, d.valor, "grafo__valor"));
  }

  // Todos os números depois de todos os anéis, nunca intercalados.
  //
  // O anel tem miolo opaco (`fill: var(--c-surface)`), então intercalar fazia
  // o nó seguinte cobrir o número do anterior sempre que dois se
  // aproximassem. A geometria acima já impede a sobreposição, mas a ordem de
  // pintura é o que garante que um encoste futuro não volte a esconder dado.
  svg.append(...valores);

  // Tabela ao lado, não lista solta: a mesma razão da tabela em `tempos.ts`
  // — o SVG não é legível por leitor de tela nem dá para conferir o número
  // exato, e é aqui que o nome completo do serviço aparece (o nó só mostra
  // o número).
  const legenda = desenharLegendaServicos(
    destinos.map((d) => ({ cor: d.cor, rotulo: d.rotulo, detalhe: d.detalhe })),
  );

  return {
    elemento: h(
      "div",
      { class: "cartao grafico" },
      cabecalho,
      // O quadro só troca a altura fixa por proporção quando o viewBox
      // cresceu. No caso comum sai exatamente como antes — e `mapa-ruas`, que
      // divide esta classe e anima o próprio viewBox, não é afetado.
      h(
        "div",
        {
          class: "grafo__moldura",
          ...(altura > ALTURA_BASE
            ? { style: `height:auto;aspect-ratio:${LARGURA} / ${altura}` }
            : {}),
        },
        svg,
      ),
      legenda,
    ),
    coordenadaDoNo,
    destacarConexao: (destino: string): void => {
      linhas.forEach((linha) => linha.classList.remove("grafo__aresta--ativa"));
      circulos.forEach((circulo) => circulo.classList.remove("grafo__no--ativo"));
      linhas.get(destino)?.classList.add("grafo__aresta--ativa");
      circulos.get(destino)?.classList.add("grafo__no--ativo");
    },
  };
}
