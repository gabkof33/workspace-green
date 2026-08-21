/** Suavização monotônica para série empilhada. Sem DOM, para poder ser testada. */

/**
 * Tangentes de Fritsch–Carlson.
 *
 * Monotônica de propósito: spline comum (Catmull-Rom, cardinal) ultrapassa os
 * pontos e afunda abaixo de zero num vale — desenharia contagem negativa.
 */
export function tangentes(y: number[]): number[] {
  const n = y.length;
  if (n < 2) return [0];

  const d: number[] = [];
  for (let i = 0; i < n - 1; i += 1) d.push((y[i + 1] ?? 0) - (y[i] ?? 0));

  const m = new Array<number>(n).fill(0);
  m[0] = d[0] ?? 0;
  m[n - 1] = d[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i += 1) {
    const a = d[i - 1] ?? 0;
    const b = d[i] ?? 0;
    m[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }

  // Limitador: mantém a curva dentro do intervalo dos próprios pontos.
  for (let i = 0; i < n - 1; i += 1) {
    const dk = d[i] ?? 0;
    if (dk === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] ?? 0) / dk;
    const b = (m[i + 1] ?? 0) / dk;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * dk;
      m[i + 1] = t * b * dk;
    }
  }
  return m;
}

/** Hermite cúbico avaliado em `sub` amostras por intervalo. */
export function amostrar(y: number[], sub: number): number[] {
  const m = tangentes(y);
  const saida: number[] = [];
  for (let i = 0; i < y.length - 1; i += 1) {
    for (let s = 0; s < sub; s += 1) {
      const t = s / sub;
      const t2 = t * t;
      const t3 = t2 * t;
      saida.push(
        (2 * t3 - 3 * t2 + 1) * (y[i] ?? 0) +
          (t3 - 2 * t2 + t) * (m[i] ?? 0) +
          (-2 * t3 + 3 * t2) * (y[i + 1] ?? 0) +
          (t3 - t2) * (m[i + 1] ?? 0),
      );
    }
  }
  saida.push(y[y.length - 1] ?? 0);
  return saida;
}

/**
 * Impede fronteira de cruzar a de baixo, e qualquer uma de descer abaixo de
 * zero.
 *
 * A curva monotônica limita o excesso dentro de cada intervalo, mas não em
 * relação a *outra* curva: uma fronteira que sobe rápido pode passar por cima
 * da de cima no meio do vão, e a faixa entre as duas sairia invertida.
 */
export function travar(curvas: number[][]): void {
  let piso: number[] | null = null;
  for (const curva of curvas) {
    for (let j = 0; j < curva.length; j += 1) {
      curva[j] = Math.max(piso?.[j] ?? 0, curva[j] ?? 0);
    }
    piso = curva;
  }
}

/** Soma corrente: cada linha é o topo da faixa daquela série. */
export function acumular(contagens: number[][], pontos: number): number[][] {
  const saida: number[][] = [];
  let anterior = new Array<number>(pontos).fill(0);
  for (const linha of contagens) {
    const atual = anterior.map((v, i) => v + (linha[i] ?? 0));
    saida.push(atual);
    anterior = atual;
  }
  return saida;
}

/**
 * Densidade: espalha cada contagem num bulbo gaussiano sobre os vizinhos.
 *
 * Sem isto o gráfico é histograma cru, e três intervalos com evento entre
 * trinta e seis vazios desenham uma agulha de aresta dura. Fluxo é densidade,
 * não contagem por casinha.
 *
 * A massa é preservada: o núcleo é normalizado e as bordas recebem de volta o
 * peso que cairia fora do vetor. Sem essa devolução o começo e o fim da janela
 * afundariam sozinhos, inventando uma queda que não existe no dado.
 */
export function densidade(contagens: number[], raio: number): number[] {
  if (raio < 1) return contagens.slice();

  // Gaussiana truncada no raio; sigma = raio/2 põe ~95% do peso dentro dele.
  const sigma = raio / 2;
  const nucleo: number[] = [];
  for (let d = -raio; d <= raio; d += 1) {
    nucleo.push(Math.exp(-(d * d) / (2 * sigma * sigma)));
  }
  const soma = nucleo.reduce((a, b) => a + b, 0);
  const peso = nucleo.map((v) => v / soma);

  const n = contagens.length;
  const saida = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const valor = contagens[i] ?? 0;
    if (valor === 0) continue;
    for (let d = -raio; d <= raio; d += 1) {
      const j = i + d;
      const w = peso[d + raio] ?? 0;
      // Fora do vetor volta para a borda mais próxima.
      const alvo = j < 0 ? 0 : j >= n ? n - 1 : j;
      saida[alvo] = (saida[alvo] ?? 0) + valor * w;
    }
  }
  return saida;
}
