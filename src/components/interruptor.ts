/**
 * Interruptor (`Switch` do DS) com rótulo.
 *
 * Geometria e tempo do `switch.tsx` do DS, sem mudar nada: trilho 42×24 em
 * raio cheio, polegar 20×20 branco com sombra, viagem de 2px a 20px em 180ms
 * `cubic-bezier(0.4, 0, 0.2, 1)`, cor do trilho em 150ms. O contrato de
 * acessibilidade é o do Radix — `role="switch"`, `aria-checked` e
 * `data-state="checked|unchecked"` —, e é o `data-state` que o CSS lê, nunca
 * uma classe paralela: estado que existe em dois lugares sai de sincronia.
 *
 * A animação EXTRA (o disco virando lua, as estrelas) mora só no CSS, em
 * camadas por cima dessa base. Ver `ds-componentes.css`.
 */

import { h } from "@/lib/dom";

export interface Interruptor {
  elemento: HTMLElement;
  /** Reflete um estado que mudou por fora, sem disparar `aoMudar`. */
  definir(ligado: boolean): void;
  ligado(): boolean;
}

export interface OpcoesInterruptor {
  rotulo: string;
  ligado: boolean;
  /**
   * `origem` é o centro do trilho na tela, para quem quiser animar a partir
   * do controle. Vem do centro do elemento e não do ponteiro de propósito:
   * acionado pelo teclado não existe ponteiro, e a animação tem de sair do
   * mesmo lugar nos dois casos.
   */
  aoMudar: (ligado: boolean, origem: { x: number; y: number }) => void;
  /** Precisa ser único na página: é o alvo do `for` do rótulo. */
  id: string;
  /** Descrição para leitor de tela, quando o rótulo visível não basta. */
  descricao?: string;
}

export function criarInterruptor(o: OpcoesInterruptor): Interruptor {
  let ligado = o.ligado;

  const polegar = h(
    "span",
    { class: "ds-interruptor__polegar" },
    h("span", { class: "ds-interruptor__disco" }),
  );

  // Três estrelas de tamanhos diferentes: o céu aparece do lado que o polegar
  // desocupa ao ir para a direita. Céu uniforme não parece céu.
  const ceu = h(
    "span",
    { class: "ds-interruptor__ceu" },
    h("i", { class: "ds-interruptor__estrela ds-interruptor__estrela--1" }),
    h("i", { class: "ds-interruptor__estrela ds-interruptor__estrela--2" }),
    h("i", { class: "ds-interruptor__estrela ds-interruptor__estrela--3" }),
  );

  const botao = h(
    "button",
    {
      class: "ds-interruptor",
      type: "button",
      id: o.id,
      role: "switch",
      ...(o.descricao ? { aria: { description: o.descricao } } : {}),
    },
    ceu,
    polegar,
  ) as HTMLButtonElement;

  const aplicar = (): void => {
    botao.setAttribute("aria-checked", String(ligado));
    botao.dataset["state"] = ligado ? "checked" : "unchecked";
  };

  botao.addEventListener("click", () => {
    ligado = !ligado;
    aplicar();

    const caixa = botao.getBoundingClientRect();
    o.aoMudar(ligado, {
      x: caixa.left + caixa.width / 2,
      y: caixa.top + caixa.height / 2,
    });
  });

  aplicar();

  return {
    // `<label for>` num `<button>` é válido — botão é elemento rotulável — e é
    // o que dá nome accessível ao interruptor, além de fazer o clique no texto
    // acionar o controle. É o mesmo par `<Switch id>` + `<Label htmlFor>` do
    // DS.
    elemento: h(
      "div",
      { class: "ds-interruptor__linha" },
      botao,
      h("label", { class: "ds-rotulo", for: o.id }, o.rotulo),
    ),
    definir: (novo) => {
      if (novo === ligado) return;
      ligado = novo;
      aplicar();
    },
    ligado: () => ligado,
  };
}
