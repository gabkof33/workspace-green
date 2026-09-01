/**
 * Linha de estado vazio DENTRO da tabela.
 *
 * Antes daqui, as telas com tabela montada à mão trocavam a tabela inteira por
 * um cartão quando a lista vinha vazia. O efeito é que, num sistema que começa
 * zerado e é alimentado pelo uso, a pessoa nunca via a estrutura: abria
 * "Quadro de demandas" e não tinha como saber que a lista tem código,
 * prioridade, situação, responsável, progresso e prazo — a tabela só existia
 * depois de existir dado.
 *
 * Aqui a tabela fica sempre desenhada, com o cabeçalho à vista, e o vazio
 * ocupa uma linha só. É exatamente o que o `tabela-dados.ts` (o port do
 * DataTable do DS) já fazia; este helper leva o mesmo comportamento para as
 * tabelas que não passam por ele.
 *
 * Reusa `ds-tabela__estado` de propósito, e não uma classe nova: aquela regra
 * não é escopada em `.ds-tabela` (é utilitária, zera o padding da célula e a
 * borda do `.vazio` de dentro), e é ela que garante que o vazio da tabela à
 * mão e o do DataTable sejam a mesma coisa na tela. Classe própria aqui seria
 * duas regras para o mesmo papel, prontas para divergir.
 */

import { h } from "@/lib/dom";

export function linhaVazia(
  colunas: number,
  titulo: string,
  texto: string,
): HTMLElement {
  return h(
    "tr",
    // Sem `click` e sem hover: não é registro, e uma linha de estado que
    // reage ao mouse convida a clicar no nada.
    { class: "tabela__linha-vazia" },
    h(
      "td",
      { class: "ds-tabela__estado", colspan: colunas },
      h("div", { class: "vazio" }, h("h3", {}, titulo), h("p", {}, texto)),
    ),
  );
}

/**
 * Corpo da tabela: as linhas, ou a linha de vazio quando não há nenhuma.
 *
 * Existe para o chamador não repetir o ternário em cada tela — e para o
 * `colspan` sair do mesmo lugar que decide se o vazio aparece, que é o que
 * impede o número de envelhecer quando alguém acrescenta uma coluna.
 */
export function corpoOuVazio(
  linhas: HTMLElement[],
  colunas: number,
  titulo: string,
  texto: string,
): HTMLElement[] {
  return linhas.length > 0 ? linhas : [linhaVazia(colunas, titulo, texto)];
}
