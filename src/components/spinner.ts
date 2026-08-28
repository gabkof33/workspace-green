/**
 * Spinner — o indicador de carregamento do iGreen DS.
 *
 * O desenho é o do DS: trilho inteiro a 20% de opacidade e um quarto de volta
 * girando por cima, traço de 3 e ponta arredondada. A animação para sozinha
 * em `prefers-reduced-motion` — está no CSS, e é o que o DS faz com
 * `motion-reduce:animate-none`.
 *
 * Sem legenda visível, de propósito: "Carregando…" escrito na tela é ruído
 * repetido em toda área que espera, e o giro já diz a mesma coisa em menos
 * espaço. Quem usa leitor de tela não perde nada — o `role="status"` com
 * `aria-label` continua anunciando, que é como o Spinner do DS se comporta
 * quando não é decorativo.
 */

import { h, icone, ICONES } from "@/lib/dom";

export type TamanhoSpinner = "sm" | "md" | "lg" | "xl";

export interface OpcoesSpinner {
  tamanho?: TamanhoSpinner;
  /**
   * O que está carregando, para o leitor de tela ("Carregando os passos").
   * Sem isto o spinner é decorativo e some da árvore de acessibilidade — use
   * assim só quando houver outro texto por perto dizendo o que acontece.
   */
  rotulo?: string;
}

export function criarSpinner(o: OpcoesSpinner = {}): SVGSVGElement {
  const svg = icone(ICONES.spinner);
  svg.setAttribute("class", `ds-spinner ds-spinner--${o.tamanho ?? "md"}`);

  if (o.rotulo) {
    svg.setAttribute("role", "status");
    svg.setAttribute("aria-label", o.rotulo);
    svg.removeAttribute("aria-hidden");
  }

  return svg;
}

/**
 * Spinner centrado numa área que está esperando — o `ScreenLoader` do DS.
 *
 * Serve para o miolo de um cartão ou painel; para a página inteira, o que já
 * existe é o esqueleto (`esqueleto.ts`), que preserva a forma do conteúdo em
 * vez de piscar um giro no vazio.
 */
export function areaCarregando(rotulo: string): HTMLElement {
  return h(
    "div",
    { class: "ds-carregando" },
    criarSpinner({ tamanho: "lg", rotulo }),
  );
}

/**
 * Estado de carregamento de um botão — o `loading` do `Button` do DS.
 *
 * Lá o botão em carregamento **mantém o rótulo** e ganha um spinner antes
 * dele; aqui era o texto que virava "Entrando…", "Enviando…", "Salvando…".
 * Trocar o rótulo tem dois problemas: a legenda repete o que o giro já diz, e
 * o texto original precisa ser restaurado à mão depois — é literal no código,
 * então renomear o botão em um lugar e esquecer o outro faz o rótulo mudar
 * sozinho depois do primeiro clique.
 */
export function botaoCarregando(botao: HTMLButtonElement, sim: boolean): void {
  const jaTem = botao.querySelector(".ds-spinner");
  botao.disabled = sim;

  if (!sim) {
    jaTem?.remove();
    return;
  }
  if (jaTem) return;

  botao.prepend(criarSpinner({ tamanho: "sm" }));
}
