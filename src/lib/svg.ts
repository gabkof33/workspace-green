/** Utilitário mínimo para montar SVG à mão — sem biblioteca de gráfico, mesma filosofia de `dom.ts`. */

const NS = "http://www.w3.org/2000/svg";

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** `<title>` de um elemento SVG — o texto que aparece no hover. */
export function svgTitulo(texto: string): SVGTitleElement {
  const t = svgEl("title");
  t.textContent = texto;
  return t;
}

export function svgTexto(
  x: number,
  y: number,
  texto: string,
  classe: string,
): SVGTextElement {
  const t = svgEl("text", {
    class: classe,
    x: String(x),
    y: String(y),
    "text-anchor": "middle",
  });
  t.textContent = texto;
  return t;
}

export function movimentoReduzido(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
