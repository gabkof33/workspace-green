/** Roteador por hash. */

export interface Rota {
  caminho: string;
  parametro: string | null;
}

export function rotaAtual(): Rota {
  const bruto = location.hash.replace(/^#\/?/, "");
  const partes = bruto.split("/").filter(Boolean);
  return {
    caminho: partes[0] ?? "fila",
    parametro: partes[1] ?? null,
  };
}

export function navegar(caminho: string): void {
  location.hash = `#/${caminho}`;
}

export function aoMudarRota(callback: () => void): void {
  window.addEventListener("hashchange", callback);
}
