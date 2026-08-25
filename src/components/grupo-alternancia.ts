/**
 * Grupo de alternância — o `ToggleGroup` do iGreen DS em DOM puro.
 *
 * No DS ele é Radix + React:
 *
 *   <ToggleGroup type="multiple" variant="outline" value={v} onValueChange={setV}>
 *     <ToggleGroupItem value="bold">…</ToggleGroupItem>
 *   </ToggleGroup>
 *
 * A Central Green não tem React, então o que se porta é o contrato, não o
 * componente: mesma marcação (`role="group"` com botões de estado), mesmo
 * `data-state="on|off"` que o Radix escreve — é por ele que o CSS pinta o
 * selecionado — e mesmas medidas, em `--ds-*` (ver `.ds-alternancia` no
 * `ds-componentes.css`).
 *
 * Só o modo `multiple`. `type="single"` já tem dono nesta base: é o cartão
 * `.escolha` com rádio dentro, que carrega descrição por opção — coisa que
 * um toggle de uma linha não acomoda.
 *
 * O `aria-pressed` é o que o Radix usa no modo `multiple` (no `single` ele
 * troca para `role="radio"`), e é também o que anuncia o estado ao leitor de
 * tela. Sem classe de estado em paralelo, então não há como o CSS e o ARIA
 * se desencontrarem.
 */

import { h } from "@/lib/dom";

export interface GrupoAlternancia {
  elemento: HTMLElement;
  /** Os valores ligados, na ordem em que as opções foram declaradas. */
  valor(): string[];
}

export interface OpcoesGrupoAlternancia {
  /** Rótulo do conjunto para o leitor de tela — o `aria-label` do grupo. */
  rotulo: string;
  opcoes: string[];
  /** Quais nascem ligadas. */
  valor?: string[];
  aoMudar: (valores: string[]) => void;
}

export function criarGrupoAlternanciaMultipla(
  o: OpcoesGrupoAlternancia,
): GrupoAlternancia {
  const ligados = new Set(o.valor ?? []);

  // A ordem de saída é a das opções, não a dos cliques: o valor gravado no
  // chamado não deve depender de em que sequência a pessoa marcou.
  const valores = (): string[] => o.opcoes.filter((op) => ligados.has(op));

  const itens: HTMLButtonElement[] = [];

  /**
   * Foco rotativo, como no Radix: o grupo inteiro é UMA parada de Tab, e as
   * setas andam entre os itens. Sem isto, um campo com oito opções obrigaria
   * a oito Tabs para chegar ao próximo campo.
   */
  const focar = (indice: number): void => {
    const alvo = itens[(indice + itens.length) % itens.length];
    if (!alvo) return;
    for (const item of itens) item.tabIndex = item === alvo ? 0 : -1;
    alvo.focus();
  };

  const item = (valor: string, indice: number): HTMLButtonElement => {
    const ligado = ligados.has(valor);

    const botao = h(
      "button",
      {
        class: "ds-alternancia__item",
        type: "button",
        // Só o primeiro item entra na ordem de Tab; as setas movem o foco
        // dentro do grupo e levam o `tabindex` consigo.
        tabindex: indice === 0 ? "0" : "-1",
        dataset: { state: ligado ? "on" : "off" },
        aria: { pressed: String(ligado) },
        on: {
          click: () => {
            const agora = botao.dataset.state !== "on";
            if (agora) ligados.add(valor);
            else ligados.delete(valor);
            botao.dataset.state = agora ? "on" : "off";
            botao.setAttribute("aria-pressed", String(agora));
            o.aoMudar(valores());
          },
          keydown: (ev: KeyboardEvent) => {
            const passo =
              ev.key === "ArrowRight" || ev.key === "ArrowDown"
                ? 1
                : ev.key === "ArrowLeft" || ev.key === "ArrowUp"
                  ? -1
                  : 0;
            if (passo !== 0) {
              ev.preventDefault();
              focar(indice + passo);
              return;
            }
            if (ev.key === "Home") {
              ev.preventDefault();
              focar(0);
            } else if (ev.key === "End") {
              ev.preventDefault();
              focar(itens.length - 1);
            }
          },
        },
      },
      valor,
    );

    itens.push(botao);
    return botao;
  };

  const elemento = h(
    "div",
    { class: "ds-alternancia", role: "group", aria: { label: o.rotulo } },
    ...o.opcoes.map(item),
  );

  return { elemento, valor: valores };
}
