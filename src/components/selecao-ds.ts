/**
 * Seleção única — o `Select` do iGreen DS em DOM puro.
 *
 * Por que não o `<select>` nativo: a lista dele é desenhada pelo SISTEMA, e
 * nenhum CSS do app a alcança. No tema escuro isso apagava as opções — o
 * texto vai claro (`--ds-fg-default`) sobre o painel BRANCO que o Windows
 * pinta quando o fundo do campo é translúcido (`--ds-bg-input` é branco a 4%).
 * Só a linha destacada, que o SO pinta de azul, ficava legível.
 *
 * Mesmo contrato do Radix `Select`, então o CSS é tradução e não invenção:
 * gatilho com `aria-haspopup="listbox"` e `data-state="open|closed"`, lista
 * `role="listbox"` com filhos `role="option"`, e `data-placeholder` no gatilho
 * vazio. Medidas e cor no `.ds-selecao` do `ds-componentes.css`.
 *
 * A ancoragem no `<body>` é do `flutuante.ts`, compartilhada com o seletor de
 * período: dentro do campo a lista seria cortada pelo primeiro ancestral com
 * `overflow`.
 */

import { criarSpinner } from "@/components/spinner";
import { criarFlutuante } from "@/lib/flutuante";
import { h, icone, ICONES, montar } from "@/lib/dom";

/**
 * Texto puro quando o valor É o rótulo (opção de `schema_formulario`), par
 * quando não é — setor tem id no valor e caminho na tela.
 */
export type OpcaoSelecao = string | { valor: string; texto: string };

export interface SelecaoDs {
  elemento: HTMLElement;
  valor(): string;
  /** Troca a lista inteira — para opções que chegam de consulta. */
  definirOpcoes(opcoes: OpcaoSelecao[], valor?: string): void;
  /** Texto do gatilho sem escolha ("Nenhum setor cadastrado ainda"). */
  definirPlaceholder(texto: string): void;
  desabilitar(sim: boolean): void;
  /** Lista a caminho: gira no lugar do valor e trava o gatilho. */
  carregando(sim: boolean): void;
}

export interface OpcoesSelecaoDs {
  /** Rótulo do campo — o `aria-label` do gatilho e da lista. */
  rotulo: string;
  opcoes: OpcaoSelecao[];
  valor?: string;
  /** Texto do gatilho sem escolha. */
  placeholder?: string;
  aoMudar: (valor: string) => void;
}

const emPar = (o: OpcaoSelecao): { valor: string; texto: string } =>
  typeof o === "string" ? { valor: o, texto: o } : o;

/** Dois campos na mesma tela não podem repetir o id do `aria-activedescendant`. */
let sequencia = 0;

export function criarSelecaoDs(o: OpcoesSelecaoDs): SelecaoDs {
  const prefixo = `ds-selecao-${++sequencia}`;

  let vazio = o.placeholder ?? "Selecione…";
  let pares = o.opcoes.map(emPar);
  let itens: HTMLElement[] = [];
  let escolhido = pares.some((p) => p.valor === o.valor) ? o.valor! : "";
  let ativo = 0;

  const texto = h("span", { class: "ds-selecao__valor" });
  const seta = icone(ICONES.seta_baixo);
  seta.setAttribute("class", "ds-selecao__seta");

  const gatilho = h(
    "button",
    {
      class: "ds-selecao__gatilho",
      type: "button",
      dataset: { state: "closed" },
      aria: { haspopup: "listbox", expanded: "false", label: o.rotulo },
      on: {
        click: () => (flutuante.aberto() ? fechar() : abrirLista()),
        keydown: (ev: KeyboardEvent) => {
          // Enter e Espaço já chegam como `click` no botão; só as setas abrem.
          if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
          ev.preventDefault();
          abrirLista();
        },
      },
    },
    texto,
    seta,
  );

  const lista = h("div", {
    class: "ds-flutuante ds-selecao__lista",
    role: "listbox",
    tabindex: "-1",
    aria: { label: o.rotulo },
    on: { keydown: (ev: KeyboardEvent) => naTecla(ev) },
  });

  function montarItens(): void {
    itens = pares.map((par, indice) =>
      h(
        "div",
        {
          class: "ds-selecao__item",
          id: `${prefixo}-op-${indice}`,
          role: "option",
          on: {
            click: () => escolher(indice),
            // Ponteiro só MARCA; o CSS pinta pelo `data-ativo`, então teclado
            // e mouse compartilham um destaque só, em vez de dois concorrentes.
            pointermove: () => marcar(indice),
          },
        },
        h("span", { class: "ds-selecao__marca" }, icone(ICONES.confere)),
        h("span", {}, par.texto),
      ),
    );
    montar(lista, ...itens);
  }

  const indiceDe = (valor: string): number =>
    pares.findIndex((p) => p.valor === valor);

  function pintar(): void {
    const par = pares.find((p) => p.valor === escolhido);
    texto.textContent = par?.texto ?? vazio;
    gatilho.toggleAttribute("data-placeholder", par === undefined);
    for (const [i, item] of itens.entries()) {
      item.setAttribute("aria-selected", String(pares[i]?.valor === escolhido));
    }
  }

  function marcar(indice: number): void {
    if (itens.length === 0) return;
    ativo = (indice + itens.length) % itens.length;
    for (const [i, item] of itens.entries()) {
      item.dataset.ativo = i === ativo ? "sim" : "nao";
    }
    const item = itens[ativo];
    if (!item) return;
    lista.setAttribute("aria-activedescendant", item.id);
    item.scrollIntoView({ block: "nearest" });
  }

  const flutuante = criarFlutuante({
    gatilho,
    painel: lista,
    larguraDoGatilho: true,
    aoAbrir: () => {
      marcar(Math.max(0, indiceDe(escolhido)));
      lista.focus();
    },
  });

  function abrirLista(): void {
    if (itens.length === 0) return;
    flutuante.abrir();
  }

  function fechar(devolverFoco = false): void {
    flutuante.fechar(devolverFoco);
  }

  function escolher(indice: number): void {
    const par = pares[indice];
    if (par === undefined) return;
    escolhido = par.valor;
    pintar();
    fechar(true);
    o.aoMudar(escolhido);
  }

  /** Busca por letra, como no nativo: "w" pula pra "Windows". */
  function procurar(letra: string): number {
    const alvo = letra.toLowerCase();
    for (let passo = 1; passo <= itens.length; passo++) {
      const i = (ativo + passo) % itens.length;
      if (pares[i]?.texto.toLowerCase().startsWith(alvo)) return i;
    }
    return -1;
  }

  function naTecla(ev: KeyboardEvent): void {
    const passo = ev.key === "ArrowDown" ? 1 : ev.key === "ArrowUp" ? -1 : 0;
    if (passo !== 0) {
      ev.preventDefault();
      marcar(ativo + passo);
      return;
    }
    if (ev.key === "Home" || ev.key === "End") {
      ev.preventDefault();
      marcar(ev.key === "Home" ? 0 : itens.length - 1);
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      escolher(ativo);
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      fechar(true);
      return;
    }
    // Tab sem `preventDefault`: o foco volta ao gatilho e o navegador segue
    // dali pro próximo campo, como faria se a lista nunca tivesse aberto.
    if (ev.key === "Tab") {
      fechar(true);
      return;
    }
    if (ev.key.length === 1) {
      const i = procurar(ev.key);
      if (i >= 0) marcar(i);
    }
  }

  montarItens();
  pintar();

  return {
    elemento: h("div", { class: "ds-selecao" }, gatilho),
    valor: () => escolhido,

    /**
     * Lista que chega depois — os setores vêm de consulta.
     *
     * O valor escolhido é revalidado contra a lista nova: guardar um id que
     * saiu da lista deixaria o formulário mandando ao banco uma referência
     * que a tela não mostra mais.
     */
    definirOpcoes: (opcoes, valor) => {
      pares = opcoes.map(emPar);
      const alvo = valor ?? escolhido;
      escolhido = pares.some((p) => p.valor === alvo) ? alvo : "";
      montarItens();
      pintar();
    },

    definirPlaceholder: (novo) => {
      vazio = novo;
      pintar();
    },

    desabilitar: (sim) => {
      gatilho.disabled = sim;
      if (sim) fechar();
    },

    /**
     * Giro no lugar do texto, em vez de "Carregando…" escrito no gatilho.
     * O rótulo continua existindo para o leitor de tela, no `role="status"`
     * do spinner — o que sai é a legenda VISÍVEL.
     */
    carregando: (sim) => {
      gatilho.disabled = sim;
      if (!sim) {
        pintar();
        return;
      }
      fechar();
      montar(
        texto,
        criarSpinner({
          tamanho: "sm",
          rotulo: `Carregando ${o.rotulo.toLowerCase()}`,
        }),
      );
    },
  };
}
