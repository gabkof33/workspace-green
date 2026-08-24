/** Mapa de serviços em formato de fluxo. */

import { desenharLegendaServicos } from "@/components/legenda-servicos";
import { h } from "@/lib/dom";
import { movimentoReduzido, svgEl, svgTitulo } from "@/lib/svg";
import type { Situacao } from "@/lib/observabilidade";

export interface PredioRua { chave: string; rotulo: string; situacao: Situacao; valor: string; detalhe: string; }
export interface RuaSegmento { destino: string; carros: number; detalhe: string; }

const CORES_SITUACAO: Record<Situacao, string> = { ok: "var(--c-ok)", alerta: "var(--c-alerta)", critico: "var(--c-erro)", "amostra-curta": "var(--c-neutro)" };
const LARGURA_SERVICO = 62;
const ALTURA_SERVICO = 11;
const LARGURA_MAPA = 300;
let contadorFluxo = 0;

function cartaoServico(x: number, y: number, largura: number, altura: number, classe: string, corBorda: string): SVGRectElement {
  return svgEl("rect", { class: classe, x: String(x - largura / 2), y: String(y - altura / 2), width: String(largura), height: String(altura), rx: "2.4", stroke: corBorda });
}

function desenharPacote(idCaminho: string, indice: number, total: number, duracao: number): SVGGElement {
  const grupo = svgEl("g", { class: "rua__pacote" });
  grupo.append(svgEl("circle", { r: "1.15" }));
  if (movimentoReduzido()) return grupo;
  const animacao = svgEl("animateMotion", { dur: `${duracao}s`, begin: `${(-((indice / total) * duracao)).toFixed(2)}s`, repeatCount: "indefinite", rotate: "auto" });
  animacao.append(svgEl("mpath", { href: `#${idCaminho}` }));
  grupo.append(animacao);
  return grupo;
}

function rotuloCurto(rotulo: string): string {
  const semPrefixo = rotulo.replace(/^(rpc|tabela):/i, "");
  return semPrefixo.length > 18 ? `${semPrefixo.slice(0, 17)}…` : semPrefixo;
}

function detalheCurto(detalhe: string): string {
  const [chamadas, , p95] = detalhe.split(" · ");
  return [chamadas, p95].filter(Boolean).join("  /  ");
}

function caminhoFluxo(de: { x: number; y: number }, para: { x: number; y: number }, desvio = 0): string {
  const controle = Math.max(18, (para.x - de.x) * 0.48);
  return `M ${de.x} ${de.y} C ${de.x + controle} ${de.y + desvio}, ${para.x - controle} ${para.y + desvio}, ${para.x} ${para.y}`;
}

function coordenadasMapa(chaves: string[]): Map<string, { x: number; y: number }> {
  const coords = new Map<string, { x: number; y: number }>();
  coords.set("__origem__", { x: 52, y: 50 });
  const margem = 13;
  const colunas = chaves.length > 5 ? [184, 260] : [236];
  const porColuna = Math.ceil(chaves.length / colunas.length);
  chaves.forEach((chave, indice) => {
    const coluna = Math.floor(indice / porColuna);
    const linha = indice % porColuna;
    const itensNaColuna = Math.min(porColuna, chaves.length - coluna * porColuna);
    const intervalo = itensNaColuna === 1 ? 0 : (100 - margem * 2) / (itensNaColuna - 1);
    coords.set(chave, { x: colunas[coluna] ?? 236, y: itensNaColuna === 1 ? 50 : margem + intervalo * linha });
  });
  return coords;
}

function adicionarTexto(x: number, y: number, texto: string, classe: string, ancora = "start"): SVGTextElement {
  const elemento = svgEl("text", { class: classe, x: String(x), y: String(y), "text-anchor": ancora });
  elemento.textContent = texto;
  return elemento;
}

function animarJanela(svg: SVGSVGElement, para: { x: number; y: number; largura: number; altura: number }): void {
  const atual = svg.viewBox.baseVal;
  const de = { x: atual.x, y: atual.y, largura: atual.width, altura: atual.height };
  const aplicar = (progresso: number): void => {
    const interpolar = (inicio: number, fim: number): string => (inicio + (fim - inicio) * progresso).toFixed(2);
    svg.setAttribute("viewBox", `${interpolar(de.x, para.x)} ${interpolar(de.y, para.y)} ${interpolar(de.largura, para.largura)} ${interpolar(de.altura, para.altura)}`);
  };
  if (movimentoReduzido()) { aplicar(1); return; }
  const inicio = performance.now();
  const quadro = (agora: number): void => {
    const t = Math.min(1, (agora - inicio) / 260);
    aplicar(1 - (1 - t) ** 3);
    if (t < 1) requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);
}

export interface ResultadoMapaRuas { elemento: HTMLElement; }

export function desenharMapaRuas(titulo_: string, rotuloOrigem: string, predios: PredioRua[], ruas: RuaSegmento[], vazio = "Sem chamadas na janela escolhida."): ResultadoMapaRuas {
  const ORIGEM_CHAVE = "__origem__";
  const coords = coordenadasMapa(predios.map((p) => p.chave));
  const cabecalho = h("div", { class: "grafico__cabecalho" }, h("h3", { class: "grafico__titulo" }, titulo_));
  if (predios.length === 0) return { elemento: h("div", { class: "cartao grafico" }, cabecalho, h("p", { class: "texto-sutil" }, vazio)) };

  const svg = svgEl("svg", { class: "grafo__svg rua__svg", viewBox: `0 0 ${LARGURA_MAPA} 100`, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
  const indice = contadorFluxo++;
  const defs = svgEl("defs");
  const padrao = svgEl("pattern", { id: `rua-grade-${indice}`, width: "8", height: "8", patternUnits: "userSpaceOnUse" });
  padrao.append(svgEl("path", { d: "M 8 0 L 0 0 0 8", fill: "none", stroke: "var(--c-ink-2)", "stroke-width": "0.18", opacity: "0.3" }));
  defs.append(padrao);
  const fundo = svgEl("rect", { class: "rua__fundo", x: "0", y: "0", width: String(LARGURA_MAPA), height: "100", fill: `url(#rua-grade-${indice})` });
  svg.append(defs, fundo);
  const ajustesDeRota = new Map<string, number>();
  const rotas = new Map<string, { trilha: SVGPathElement; guia: SVGPathElement; alca: SVGCircleElement }>();
  const nosEditaveis = new Map<string, { grupo: SVGGElement; base: { x: number; y: number } }>();

  const atualizarRota = (destino: string, desvio: number): void => {
    const rota = rotas.get(destino);
    const origem = coords.get(ORIGEM_CHAVE);
    const destinoCoord = coords.get(destino);
    if (!rota || !origem || !destinoCoord) return;
    const inicio = { x: origem.x + 13, y: origem.y };
    const fim = { x: destinoCoord.x - LARGURA_SERVICO / 2 - 2, y: destinoCoord.y };
    const limitado = Math.max(-28, Math.min(28, desvio));
    ajustesDeRota.set(destino, limitado);
    const d = caminhoFluxo(inicio, fim, limitado);
    rota.trilha.setAttribute("d", d);
    rota.guia.setAttribute("d", d);
    rota.alca.setAttribute("cx", String((inicio.x + fim.x) / 2));
    rota.alca.setAttribute("cy", String((inicio.y + fim.y) / 2 + limitado));
  };

  const limparFoco = (): void => {
    svg.classList.remove("rua__svg--foco");
    svg.querySelectorAll(".rua__asfalto--ativo, .rua__predio--ativo, .rua__alca--ativa").forEach((elemento) => elemento.classList.remove("rua__asfalto--ativo", "rua__predio--ativo", "rua__alca--ativa"));
    animarJanela(svg, { x: 0, y: 0, largura: LARGURA_MAPA, altura: 100 });
  };
  const focarLigacao = (destino: string): void => {
    const origem = coords.get(ORIGEM_CHAVE);
    const para = coords.get(destino);
    if (!origem || !para) return;
    svg.classList.add("rua__svg--foco");
    svg.querySelectorAll(".rua__asfalto--ativo, .rua__predio--ativo, .rua__alca--ativa").forEach((elemento) => elemento.classList.remove("rua__asfalto--ativo", "rua__predio--ativo", "rua__alca--ativa"));
    svg.querySelector<SVGPathElement>(`.rua__asfalto[data-destino="${CSS.escape(destino)}"]`)?.classList.add("rua__asfalto--ativo");
    svg.querySelector<SVGRectElement>(`.rua__predio[data-no="${CSS.escape(ORIGEM_CHAVE)}"]`)?.classList.add("rua__predio--ativo");
    svg.querySelector<SVGRectElement>(`.rua__predio[data-no="${CSS.escape(destino)}"]`)?.classList.add("rua__predio--ativo");
    svg.querySelector<SVGCircleElement>(`.rua__alca[data-destino="${CSS.escape(destino)}"]`)?.classList.add("rua__alca--ativa");
    const minX = Math.max(0, Math.min(origem.x - 18, para.x - LARGURA_SERVICO / 2 - 10));
    const maxX = Math.min(LARGURA_MAPA, Math.max(origem.x + 18, para.x + LARGURA_SERVICO / 2 + 10));
    const altura = 64;
    const y = Math.max(0, Math.min(100 - altura, (origem.y + para.y) / 2 - altura / 2));
    animarJanela(svg, { x: minX, y, largura: maxX - minX, altura });
  };
  fundo.addEventListener("click", limparFoco);

  for (const rua of ruas) {
    const de = coords.get(ORIGEM_CHAVE);
    const para = coords.get(rua.destino);
    if (!de || !para) continue;
    const inicio = { x: de.x + 13, y: de.y };
    const fim = { x: para.x - LARGURA_SERVICO / 2 - 2, y: para.y };
    const caminho = caminhoFluxo(inicio, fim, ajustesDeRota.get(rua.destino));
    const idCaminho = `fluxo-servico-${contadorFluxo++}`;
    const trilha = svgEl("path", { class: "rua__asfalto", d: caminho, "data-destino": rua.destino });
    trilha.append(svgTitulo(rua.detalhe));
    trilha.addEventListener("click", (evento) => { evento.stopPropagation(); focarLigacao(rua.destino); });
    const guia = svgEl("path", { class: "rua__faixa", id: idCaminho, d: caminho });
    const alca = svgEl("circle", { class: "rua__alca", "data-destino": rua.destino, cx: String((inicio.x + fim.x) / 2), cy: String((inicio.y + fim.y) / 2), r: "2.3" });
    rotas.set(rua.destino, { trilha, guia, alca });
    alca.addEventListener("pointerdown", (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      alca.setPointerCapture(evento.pointerId);
      const mover = (movimento: PointerEvent): void => {
        const matriz = svg.getScreenCTM();
        if (!matriz) return;
        const ponto = new DOMPoint(movimento.clientX, movimento.clientY).matrixTransform(matriz.inverse());
        const origemAtual = coords.get(ORIGEM_CHAVE);
        const destinoAtual = coords.get(rua.destino);
        if (!origemAtual || !destinoAtual) return;
        atualizarRota(rua.destino, ponto.y - (origemAtual.y + destinoAtual.y) / 2);
      };
      alca.addEventListener("pointermove", mover);
      alca.addEventListener("pointerup", () => alca.removeEventListener("pointermove", mover), { once: true });
      alca.addEventListener("pointercancel", () => alca.removeEventListener("pointermove", mover), { once: true });
    });
    svg.append(trilha, guia, alca);
    const duracao = 3.8 + Math.abs(para.y - de.y) / 34;
    for (let i = 0; i < rua.carros; i += 1) svg.append(desenharPacote(idCaminho, i, rua.carros, duracao));
  }

  const hub = coords.get(ORIGEM_CHAVE);
  if (hub) {
    const grupo = svgEl("g", { class: "rua__no-editavel" });
    const origem = cartaoServico(hub.x, hub.y, 24, 18, "rua__predio rua__predio--hub", "var(--c-surface)");
    origem.setAttribute("data-no", ORIGEM_CHAVE);
    origem.append(svgTitulo(`Origem: ${rotuloOrigem}`));
    grupo.append(origem, svgEl("circle", { class: "rua__hub-nucleo", cx: String(hub.x), cy: String(hub.y), r: "3.8" }), adicionarTexto(hub.x, hub.y + 13, "CENTRAL GREEN", "rua__hub-rotulo", "middle"), adicionarTexto(hub.x, hub.y + 17, "ORIGEM", "rua__hub-subtitulo", "middle"));
    svg.append(grupo);
    nosEditaveis.set(ORIGEM_CHAVE, { grupo, base: { ...hub } });
  }

  for (const predio of predios) {
    const c = coords.get(predio.chave);
    if (!c) continue;
    const grupo = svgEl("g", { class: "rua__no-editavel" });
    const bloco = cartaoServico(c.x, c.y, LARGURA_SERVICO, ALTURA_SERVICO, "rua__predio", CORES_SITUACAO[predio.situacao]);
    bloco.setAttribute("data-no", predio.chave);
    bloco.append(svgTitulo(`${predio.rotulo} — ${predio.detalhe}`));
    grupo.append(bloco, adicionarTexto(c.x - LARGURA_SERVICO / 2 + 4, c.y - 1.2, rotuloCurto(predio.rotulo), "rua__servico-rotulo"), adicionarTexto(c.x - LARGURA_SERVICO / 2 + 4, c.y + 3.4, detalheCurto(predio.detalhe), "rua__servico-meta"), adicionarTexto(c.x + LARGURA_SERVICO / 2 - 3.4, c.y + 1.2, predio.valor, "rua__servico-valor", "end"));
    svg.append(grupo);
    nosEditaveis.set(predio.chave, { grupo, base: { ...c } });
  }

  for (const [chave, no] of nosEditaveis) {
    no.grupo.addEventListener("pointerdown", (evento) => {
      evento.preventDefault();
      no.grupo.setPointerCapture(evento.pointerId);
      const mover = (movimento: PointerEvent): void => {
        const matriz = svg.getScreenCTM();
        const coord = coords.get(chave);
        if (!matriz || !coord) return;
        const ponto = new DOMPoint(movimento.clientX, movimento.clientY).matrixTransform(matriz.inverse());
        const metade = chave === ORIGEM_CHAVE ? 13 : LARGURA_SERVICO / 2 + 3;
        coord.x = Math.max(metade, Math.min(LARGURA_MAPA - metade, ponto.x));
        coord.y = Math.max(8, Math.min(92, ponto.y));
        no.grupo.setAttribute("transform", `translate(${coord.x - no.base.x} ${coord.y - no.base.y})`);
        if (chave === ORIGEM_CHAVE) rotas.forEach((_, destino) => atualizarRota(destino, ajustesDeRota.get(destino) ?? 0));
        else atualizarRota(chave, ajustesDeRota.get(chave) ?? 0);
      };
      no.grupo.addEventListener("pointermove", mover);
      no.grupo.addEventListener("pointerup", () => no.grupo.removeEventListener("pointermove", mover), { once: true });
      no.grupo.addEventListener("pointercancel", () => no.grupo.removeEventListener("pointermove", mover), { once: true });
    });
  }

  const legenda = desenharLegendaServicos(predios.map((p) => ({ cor: CORES_SITUACAO[p.situacao], rotulo: p.rotulo, detalhe: p.detalhe })));
  return { elemento: h("div", { class: "cartao grafico" }, cabecalho, h("div", { class: "grafo__moldura rua__moldura" }, svg), legenda) };
}
