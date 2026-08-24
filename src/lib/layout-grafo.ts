/**
 * Posiciona uma origem fixa e N destinos em colunas, em zigue-zague.
 *
 * Compartilhado entre o grafo de nós e o mapa de ruas: os dois têm a mesma
 * forma (uma origem, vários destinos) e o mesmo problema (muitos destinos
 * numa coluna só aperta demais o espaço vertical) — só o desenho de cada nó
 * muda, não o layout.
 */

export interface Coordenada {
  x: number;
  y: number;
}

export interface OpcoesColunas {
  xOrigem: number;
  yOrigem?: number;
  /** Posição X de cada coluna — o número de colunas é `colunas.length`. */
  colunas: number[];
  /** Margem superior/inferior, nas unidades do viewBox. */
  margemY?: number;
  /**
   * Altura do viewBox. Assume 100 quando omitida, que era o valor fixo antes
   * — quem desenha um grafo mais alto para caber mais linhas precisa dizer,
   * senão os destinos se acumulariam na metade de cima.
   */
  altura?: number;
}

export function posicionarEmColunas(
  chaveOrigem: string,
  chaves: string[],
  opcoes: OpcoesColunas,
): Map<string, Coordenada> {
  const coords = new Map<string, Coordenada>();
  const altura = opcoes.altura ?? 100;
  const meio = altura / 2;
  coords.set(chaveOrigem, { x: opcoes.xOrigem, y: opcoes.yOrigem ?? meio });

  const numColunas = Math.max(1, opcoes.colunas.length);
  const margemY = opcoes.margemY ?? 10;
  const linhasPorColuna = Math.max(1, Math.ceil(chaves.length / numColunas));

  chaves.forEach((chave, i) => {
    const coluna = i % numColunas;
    const linha = Math.floor(i / numColunas);
    const y =
      linhasPorColuna === 1
        ? meio
        : margemY + ((altura - 2 * margemY) * linha) / (linhasPorColuna - 1);
    coords.set(chave, { x: opcoes.colunas[coluna] ?? opcoes.xOrigem, y });
  });

  return coords;
}
