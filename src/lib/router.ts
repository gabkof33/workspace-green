/** Roteador por hash. */

export interface Rota {
  caminho: string;
  parametro: string | null;
}

/**
 * O pouso é o Quadro de demandas.
 *
 * Era `fila`, e mudou quando a fila deixou de ser aba própria e virou uma aba
 * do quadro: pousar numa tela que não existe mais no menu deixaria a primeira
 * coisa que a pessoa vê inalcançável pelo caminho normal. O quadro é onde
 * agora se registra trabalho e onde a fila mora.
 */
export function rotaAtual(): Rota {
  const bruto = location.hash.replace(/^#\/?/, "");
  const partes = bruto.split("/").filter(Boolean);
  return {
    caminho: partes[0] ?? "demandas",
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
