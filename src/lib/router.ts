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

/**
 * Endereço completo de uma rota, para colar fora do app.
 *
 * `origin` + `pathname` + hash: o `pathname` entra porque a aplicação pode não
 * estar na raiz do domínio, e sem ele o link levaria ao lugar errado em
 * qualquer instalação em subpasta.
 */
export function enderecoAbsoluto(caminho: string): string {
  return `${location.origin}${location.pathname}#/${caminho}`;
}

export function aoMudarRota(callback: () => void): void {
  window.addEventListener("hashchange", callback);
}
