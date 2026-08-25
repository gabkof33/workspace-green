/** Recorte por data: o tipo e as duas regras, sem UI. */

export interface Periodo {
  /** ISO `YYYY-MM-DD`, inclusivo. `null` = sem limite. */
  de: string | null;
  ate: string | null;
}

/** Hoje em ISO local. `toISOString()` daria o dia em UTC. */
export function hojeIso(): string {
  return diasAtras(0);
}

export function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDeData(d);
}

/** ISO local de um `Date` — `toISOString()` daria o dia em UTC. */
export function isoDeData(d: Date): string {
  const dois = (x: number): string => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** Meia-noite local do dia ISO. `new Date("2026-08-01")` seria UTC. */
export function dataDeIso(iso: string): Date {
  return new Date(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
}

/**
 * `ate` vira o instante final do dia escolhido.
 *
 * As colunas são `timestamptz`; comparar com a data crua deixaria de fora
 * tudo que aconteceu no próprio dia depois da meia-noite — o filtro perderia
 * justamente o dia que a pessoa quis ver.
 */
export function limiteFinal(ate: string): string {
  return `${ate}T23:59:59.999`;
}

/**
 * Recorte no cliente, para listas que já vêm inteiras do banco.
 *
 * `null` e `undefined` passam: item sem data não é item fora do período, e
 * escondê-lo faria sumir registro que ninguém pediu para esconder.
 */
export function dentroDoPeriodo(
  iso: string | null | undefined,
  periodo: Periodo,
): boolean {
  if (!iso) return true;
  const dia = iso.slice(0, 10);
  if (periodo.de && dia < periodo.de) return false;
  if (periodo.ate && dia > periodo.ate) return false;
  return true;
}
