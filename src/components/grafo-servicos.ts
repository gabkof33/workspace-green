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
  const coords = posicionarEmColunas(
    origem.chave,
    destinos.map((d) => d.chave),
    { xOrigem: 52, colunas: destinos.length > 5 ? [178, 256] : [230] },
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
    viewBox: "0 0 300 100",
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

    if (d.valor) {
      svg.append(svgTexto(c.x, c.y + 1.6, d.valor, "grafo__valor"));
    }
  }

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
      h("div", { class: "grafo__moldura" }, svg),
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
