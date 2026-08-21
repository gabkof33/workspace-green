/** Índice de calor por endpoint: latência, frequência, erro e p95 num número. */

import type { EventoApi } from "@/types/dominio";

/**
 * Pesos de `H = α·Ln + β·Fn + γ·En + δ·P95n`.
 *
 * Somam 1, então H sai em 0–1 e os limiares de nível se leem como porcentagem.
 * Mudar um peso sem reajustar os outros tira essa garantia.
 */
export const ALFA = 0.4;
export const BETA = 0.3;
export const GAMA = 0.2;
export const DELTA = 0.1;

/** Modelo de três termos, sem p95. Fica para conferir a conta à mão. */
export const PESOS_SIMPLES = { alfa: 0.5, beta: 0.3, gama: 0.2 };

/**
 * Níveis de calor, nos limiares definidos para este painel.
 *
 * Escala ordinal, não contínua: cinco degraus nomeados, cada um com rótulo na
 * legenda e na dica. Uma rampa de matiz variável só é legível assim — sem o
 * nome, ninguém sabe se laranja é mais ou menos que amarelo.
 */
export const NIVEIS = [
  { rotulo: "Neutro", cor: "var(--barra-azul)", ate: 0.2 },
  { rotulo: "Baixo", cor: "var(--barra-verde)", ate: 0.4 },
  { rotulo: "Médio", cor: "var(--barra-amarelo)", ate: 0.6 },
  { rotulo: "Alto", cor: "var(--barra-laranja)", ate: 0.8 },
  { rotulo: "Crítico", cor: "var(--barra-vermelho)", ate: 1.01 },
] as const;

export type Nivel = (typeof NIVEIS)[number];

export function nivelDe(calor: number): Nivel {
  return NIVEIS.find((n) => calor <= n.ate) ?? NIVEIS[NIVEIS.length - 1]!;
}

export interface CalorServico {
  chave: string;
  /** Chamadas na janela. */
  chamadas: number;
  /** Latência média em ms. */
  latencia_ms: number;
  /** Percentil 95 da latência em ms. */
  p95_ms: number;
  /** Taxa de erro de 0 a 1. */
  erro: number;
  /** Índice de calor de 0 a 1. */
  calor: number;
  /** Termos normalizados, para a dica poder explicar de onde veio o calor. */
  ln: number;
  fn: number;
  p95n: number;
  /** Contagem por intervalo, do mais antigo ao mais recente. */
  contagens: number[];
}

/** Percentil por posição, sem interpolar: com 9 amostras interpolar é ilusão. */
function percentil(ordenado: number[], fracao: number): number {
  if (ordenado.length === 0) return 0;
  const i = Math.min(
    ordenado.length - 1,
    Math.max(0, Math.ceil(fracao * ordenado.length) - 1),
  );
  return ordenado[i] ?? 0;
}

/**
 * Calor de cada serviço na janela.
 *
 * As normalizações saem da própria janela, não de um teto fixo: uma manhã
 * calma e uma tarde de incidente têm escalas diferentes, e o que interessa é
 * onde aperta *dentro do que se está olhando*.
 *
 * `Lmax` é a maior latência individual observada, e `Fmax` a maior contagem de
 * um serviço — as duas referências do cálculo conferido à mão.
 */
export function apurarCalor(
  eventos: EventoApi[],
  inicio: number,
  minutos: number,
  pontos: number,
  pesos: { alfa: number; beta: number; gama: number; delta: number } = {
    alfa: ALFA,
    beta: BETA,
    gama: GAMA,
    delta: DELTA,
  },
): CalorServico[] {
  const janelaMs = minutos * 60_000;

  interface Bruto {
    latencias: number[];
    erros: number;
    contagens: number[];
  }
  const porServico = new Map<string, Bruto>();

  for (const evento of eventos) {
    let s = porServico.get(evento.servico_destino);
    if (!s) {
      s = { latencias: [], erros: 0, contagens: new Array(pontos).fill(0) };
      porServico.set(evento.servico_destino, s);
    }
    s.latencias.push(evento.latencia_ms);
    // Erro é 4xx/5xx ou falha de rede, que nem chega a ter status.
    if ((evento.status_code ?? 0) >= 400 || evento.erro_tipo !== null) {
      s.erros += 1;
    }
    const i = Math.floor(
      ((new Date(evento.criado_em).getTime() - inicio) / janelaMs) * pontos,
    );
    if (i >= 0 && i < pontos) s.contagens[i] = (s.contagens[i] ?? 0) + 1;
  }

  const medido = [...porServico.entries()].map(([chave, s]) => {
    const ordenado = [...s.latencias].sort((a, b) => a - b);
    const chamadas = s.latencias.length;
    return {
      chave,
      chamadas,
      latencia_ms: chamadas === 0 ? 0 : s.latencias.reduce((a, b) => a + b, 0) / chamadas,
      p95_ms: percentil(ordenado, 0.95),
      erro: chamadas === 0 ? 0 : s.erros / chamadas,
      contagens: s.contagens,
    };
  });

  // Piso 1: sem chamada nenhuma a divisão seria por zero, e o resultado certo
  // nesse caso é calor zero, não NaN.
  const lMax = Math.max(1, ...eventos.map((e) => e.latencia_ms));
  const fMax = Math.max(1, ...medido.map((m) => m.chamadas));
  const p95Max = Math.max(1, ...medido.map((m) => m.p95_ms));

  return medido
    .map((m) => {
      const ln = m.latencia_ms / lMax;
      const fn = m.chamadas / fMax;
      const p95n = m.p95_ms / p95Max;
      return {
        ...m,
        ln,
        fn,
        p95n,
        calor:
          pesos.alfa * ln +
          pesos.beta * fn +
          pesos.gama * m.erro +
          pesos.delta * p95n,
      };
    })
    .sort((a, b) => b.calor - a.calor || a.chave.localeCompare(b.chave));
}
