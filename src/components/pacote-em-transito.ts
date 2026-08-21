/**
 * Anima um "pacote" viajando entre dois pontos de um SVG existente.
 *
 * Interpola `cx`/`cy` via `requestAnimationFrame`, não `transform` via CSS:
 * um círculo SVG sob `viewBox` não tem px nativo, e o comportamento de
 * `transform` sobre atributo de forma varia entre navegadores. Mexer direto
 * no atributo é o caminho sem ambiguidade.
 */

const NS = "http://www.w3.org/2000/svg";

export interface OpcoesPacote {
  de: { x: number; y: number };
  para: { x: number; y: number };
  cor: string;
  /** Duração real da chamada que o pacote representa — vira o ritmo da viagem. */
  latenciaMs: number;
}

const DURACAO_MIN_MS = 250;
const DURACAO_MAX_MS = 1200;

export function lancarPacote(svg: SVGSVGElement, opcoes: OpcoesPacote): void {
  const circulo = document.createElementNS(NS, "circle");
  circulo.setAttribute("class", "grafo__pacote");
  circulo.setAttribute("r", "1.6");
  circulo.setAttribute("fill", opcoes.cor);
  circulo.setAttribute("cx", String(opcoes.de.x));
  circulo.setAttribute("cy", String(opcoes.de.y));
  svg.append(circulo);

  // A animação não carrega informação por si — o dado já foi contado no
  // painel. Sem movimento, o pacote só marca presença e some.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.setTimeout(() => circulo.remove(), 200);
    return;
  }

  const duracao = Math.min(
    Math.max(opcoes.latenciaMs, DURACAO_MIN_MS),
    DURACAO_MAX_MS,
  );
  const inicio = performance.now();

  const passo = (agora: number): void => {
    const fracao = Math.min((agora - inicio) / duracao, 1);
    const suavizada = 1 - Math.pow(1 - fracao, 3);

    circulo.setAttribute(
      "cx",
      String(opcoes.de.x + (opcoes.para.x - opcoes.de.x) * suavizada),
    );
    circulo.setAttribute(
      "cy",
      String(opcoes.de.y + (opcoes.para.y - opcoes.de.y) * suavizada),
    );
    circulo.setAttribute("opacity", fracao > 0.85 ? String((1 - fracao) / 0.15) : "1");

    if (fracao < 1) {
      requestAnimationFrame(passo);
    } else {
      circulo.remove();
    }
  };

  requestAnimationFrame(passo);
}
