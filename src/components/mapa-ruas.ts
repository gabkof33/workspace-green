/**
 * Mapa de serviços como mapa de ruas: cada serviço chamado é um "prédio" ao
 * lado de uma "rua" que sai da Central Green, com carrinhos indicando
 * volume de tráfego.
 *
 * Decorativo, não factual quadro a quadro: ao contrário do Fluxo (que anima
 * por evento real via Realtime), os carros aqui se movem de forma contínua
 * e ambiente — o que é dado real é a contagem de chamadas (número dentro do
 * prédio, no hover, na legenda) e a cor do prédio (saúde do serviço). O
 * movimento em si só ilustra "há tráfego", não replica cada requisição.
 */

import { desenharLegendaServicos } from "@/components/legenda-servicos";
import { h } from "@/lib/dom";
import { posicionarEmColunas } from "@/lib/layout-grafo";
import { movimentoReduzido, svgEl, svgTitulo } from "@/lib/svg";
import type { Situacao } from "@/lib/observabilidade";

export interface PredioRua {
  chave: string;
  rotulo: string;
  situacao: Situacao;
  /** Texto curto para dentro do prédio — tipicamente a contagem de chamadas. */
  valor: string;
  detalhe: string;
}

export interface RuaSegmento {
  /** Chave de um dos `predios` — a origem é sempre a Central Green, fixa internamente. */
  destino: string;
  /** Quantos carrinhos desenhar na pista — 0 a 3, já decidido por quem chama. */
  carros: number;
  detalhe: string;
}

const CORES_SITUACAO: Record<Situacao, string> = {
  ok: "var(--c-ok)",
  alerta: "var(--c-alerta)",
  critico: "var(--c-erro)",
};

const LARGURA_PREDIO = 13;
const ALTURA_PREDIO = 9;
const LARGURA_HUB = 15;
const ALTURA_HUB = 11;

function retanguloPredio(
  x: number,
  y: number,
  largura: number,
  altura: number,
  classe: string,
  corBorda: string,
): SVGRectElement {
  return svgEl("rect", {
    class: classe,
    x: String(x - largura / 2),
    y: String(y - altura / 2),
    width: String(largura),
    height: String(altura),
    rx: "1.6",
    stroke: corBorda,
  });
}

/**
 * Um carro no início da rua (`x1, y1`), sempre andando para frente — nunca
 * de ré: o `<animateTransform>` translada em linha reta até o fim da rua
 * (`distancia`, no eixo local já alinhado pelo `rotate`) e reinicia. Vários
 * carros na mesma rua começam defasados (`begin` negativo) para já
 * nascerem espalhados ao longo da pista, em vez de em fila no início.
 */
function desenharCarro(
  x1: number,
  y1: number,
  distancia: number,
  anguloGraus: number,
  indice: number,
  totalCarros: number,
  duracaoBase: number,
): SVGGElement {
  const grupo = svgEl("g", {
    class: "rua__carro",
    transform: `rotate(${anguloGraus} ${x1} ${y1})`,
  });
  grupo.append(
    svgEl("rect", {
      x: String(x1 - 2.2),
      y: String(y1 - 1.1),
      width: "4.4",
      height: "2.2",
      rx: "0.7",
    }),
  );

  if (movimentoReduzido()) {
    // Sem animação: distribui os carros ao longo da rua em posições fixas,
    // em vez de todos empilhados no início.
    const t = (indice + 1) / (totalCarros + 1);
    grupo.setAttribute(
      "transform",
      `rotate(${anguloGraus} ${x1} ${y1}) translate(${(distancia * t).toFixed(2)} 0)`,
    );
    return grupo;
  }

  const defasagem = -((indice / totalCarros) * duracaoBase);
  grupo.append(
    svgEl("animateTransform", {
      attributeName: "transform",
      type: "translate",
      additive: "sum",
      values: `0 0; ${distancia.toFixed(2)} 0`,
      dur: `${duracaoBase}s`,
      begin: `${defasagem.toFixed(2)}s`,
      repeatCount: "indefinite",
    }),
  );

  return grupo;
}

export interface ResultadoMapaRuas {
  elemento: HTMLElement;
}

export function desenharMapaRuas(
  titulo_: string,
  rotuloOrigem: string,
  predios: PredioRua[],
  ruas: RuaSegmento[],
  vazio = "Sem chamadas na janela escolhida.",
): ResultadoMapaRuas {
  const ORIGEM_CHAVE = "__origem__";
  const coords = posicionarEmColunas(
    ORIGEM_CHAVE,
    predios.map((p) => p.chave),
    { xOrigem: 10, colunas: [56, 88], margemY: 14 },
  );

  const cabecalho = h(
    "div",
    { class: "grafico__cabecalho" },
    h("h3", { class: "grafico__titulo" }, titulo_),
  );

  if (predios.length === 0) {
    return {
      elemento: h(
        "div",
        { class: "cartao grafico" },
        cabecalho,
        h("p", { class: "texto-sutil" }, vazio),
      ),
    };
  }

  const svg = svgEl("svg", {
    class: "grafo__svg rua__svg",
    viewBox: "0 0 100 100",
    preserveAspectRatio: "xMidYMid meet",
    "aria-hidden": "true",
  });

  for (const rua of ruas) {
    const de = coords.get(ORIGEM_CHAVE);
    const para = coords.get(rua.destino);
    if (!de || !para) continue;

    const dx = para.x - de.x;
    const dy = para.y - de.y;
    const distancia = Math.max(Math.hypot(dx, dy), 0.001);
    const encolhe = LARGURA_PREDIO / 2 + 1;
    const x2 = para.x - (dx / distancia) * encolhe;
    const y2 = para.y - (dy / distancia) * encolhe;
    const x1 = de.x + (dx / distancia) * (LARGURA_HUB / 2 + 1);
    const y1 = de.y + (dy / distancia) * (LARGURA_HUB / 2 + 1);

    const asfalto = svgEl("line", {
      class: "rua__asfalto",
      x1: String(x1),
      y1: String(y1),
      x2: String(x2),
      y2: String(y2),
    });
    asfalto.append(svgTitulo(rua.detalhe));
    svg.append(asfalto);

    svg.append(
      svgEl("line", {
        class: "rua__faixa",
        x1: String(x1),
        y1: String(y1),
        x2: String(x2),
        y2: String(y2),
      }),
    );

    const angulo = (Math.atan2(dy, dx) * 180) / Math.PI;
    const distanciaRua = Math.hypot(x2 - x1, y2 - y1);
    // Velocidade ~constante: rua mais longa recebe um percurso proporcionalmente mais longo.
    const duracaoBase = Math.min(5, Math.max(2.2, distanciaRua / 14));
    for (let i = 0; i < rua.carros; i += 1) {
      svg.append(
        desenharCarro(x1, y1, distanciaRua, angulo, i, rua.carros, duracaoBase),
      );
    }
  }

  const hub = coords.get(ORIGEM_CHAVE);
  if (hub) {
    const predioHub = retanguloPredio(
      hub.x,
      hub.y,
      LARGURA_HUB,
      ALTURA_HUB,
      "rua__predio rua__predio--hub",
      "var(--c-surface)",
    );
    predioHub.append(svgTitulo(`Origem: ${rotuloOrigem}`));
    svg.append(predioHub);
  }

  for (const predio of predios) {
    const c = coords.get(predio.chave);
    if (!c) continue;

    const corBorda = CORES_SITUACAO[predio.situacao];
    const bloco = retanguloPredio(
      c.x,
      c.y,
      LARGURA_PREDIO,
      ALTURA_PREDIO,
      "rua__predio",
      corBorda,
    );
    bloco.append(svgTitulo(`${predio.rotulo} — ${predio.detalhe}`));
    svg.append(bloco);

    const texto = svgEl("text", {
      class: "rua__predio-valor",
      x: String(c.x),
      y: String(c.y + 1.4),
      "text-anchor": "middle",
    });
    texto.textContent = predio.valor;
    svg.append(texto);
  }

  const legenda = desenharLegendaServicos(
    predios.map((p) => ({
      cor: CORES_SITUACAO[p.situacao],
      rotulo: p.rotulo,
      detalhe: p.detalhe,
    })),
  );

  return {
    elemento: h(
      "div",
      { class: "cartao grafico" },
      cabecalho,
      h("div", { class: "grafo__moldura" }, svg),
      legenda,
    ),
  };
}
