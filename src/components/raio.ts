/** Raio que se desenha sozinho no fundo escuro da tela de acesso. */

const NS = "http://www.w3.org/2000/svg";

// Contorno do raio. Fechado, para que o traço volte ao ponto de partida.
const CONTORNO = "M 78 6 L 26 126 L 60 126 L 44 234 L 100 100 L 64 100 Z";

function caminho(classe: string): SVGPathElement {
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", CONTORNO);
  p.setAttribute("class", classe);
  return p;
}

/**
 * O comprimento vem de `getTotalLength()` e não de um chute: é ele que faz o
 * risco correr o contorno inteiro, sem sobra nem corte.
 */
export function criarRaio(): HTMLElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "raio__svg");
  svg.setAttribute("viewBox", "0 0 120 240");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const corpo = caminho("raio__corpo");
  const traco = caminho("raio__traco");
  const risco = caminho("raio__risco");
  svg.append(corpo, traco, risco);

  // O clarão é um irmão em HTML, não um filtro no SVG: assim a luz estoura
  // livre, sem a região do filtro recortá-la num retângulo.
  const clarao = document.createElement("span");
  clarao.className = "raio__clarao";

  const caixa = document.createElement("div");
  caixa.className = "raio";
  caixa.setAttribute("aria-hidden", "true");
  caixa.append(clarao, svg);

  // Medido depois de entrar no documento: path solto não tem geometria.
  requestAnimationFrame(() => {
    const total = traco.getTotalLength();
    if (!total) return;
    caixa.style.setProperty("--raio-l", String(total));
    caixa.classList.add("raio--pronto");
  });

  return caixa;
}
