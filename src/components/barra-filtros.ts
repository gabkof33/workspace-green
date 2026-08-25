/**
 * Barra de filtros — chips + "adicionar filtro", como a toolbar do `DataTable`
 * do iGreen DS.
 *
 * A barra nasce com o que está valendo e nada mais: cada filtro em uso é um
 * chip removível, e o resto mora atrás do botão de adicionar (o ícone
 * `line-filter-add` do DS). O que se ganha em relação à barra antiga — todos os
 * controles sempre na tela — é que a tela diz o RECORTE, não o formulário: com
 * seis controles visíveis, ler "o que está filtrado agora" exigia conferir cada
 * um deles.
 *
 * Quem declara os filtros é a página, porque só ela sabe o que a sua consulta
 * aceita. A barra é dona dos VALORES: uma fonte só, então o chip nunca discorda
 * do que a lista mostra.
 *
 *   const barra = criarBarraFiltros({
 *     aoMudar: () => desenhar(),
 *     filtros: [
 *       { chave: "data", rotulo: "Período", tipo: "periodo" },
 *       { chave: "prioridade", rotulo: "Prioridade", tipo: "opcoes",
 *         opcoes: [{ valor: "P1", texto: "P1" }] },
 *       { chave: "encerrados", rotulo: "Ocultar encerrados", tipo: "liga",
 *         padrao: true },
 *     ],
 *   });
 *   // …
 *   listar({ prioridade: barra.opcao("prioridade"), ...barra.periodo("data") });
 *
 * As abas e os botões de ação da página NÃO entram aqui: aba é navegação e
 * botão é comando, e nenhum dos dois recorta a lista.
 */

import { criarFlutuante } from "@/lib/flutuante";
import {
  criarSeletorPeriodoDs,
  type SeletorPeriodoDs,
} from "@/components/periodo-ds";
import { h, icone, ICONES, montar } from "@/lib/dom";
import type { Periodo } from "@/lib/periodo";

interface Comum {
  chave: string;
  rotulo: string;
}

export type FiltroDeclarado =
  | (Comum & {
      tipo: "periodo";
      /** Default: os mesmos atalhos que a barra antiga oferecia. */
      atalhos?: Array<{ texto: string; dias: number | null }>;
    })
  | (Comum & {
      tipo: "opcoes";
      opcoes: Array<{ valor: string; texto: string }>;
      padrao?: string | null;
    })
  | (Comum & { tipo: "liga"; padrao?: boolean });

export interface BarraFiltros {
  elemento: HTMLElement;
  /** `{ de: null, ate: null }` quando o filtro não está na barra. */
  periodo(chave: string): Periodo;
  opcao(chave: string): string | null;
  ligado(chave: string): boolean;
}

export interface OpcoesBarraFiltros {
  filtros: FiltroDeclarado[];
  aoMudar: () => void;
}

/**
 * "Tudo" primeiro porque é a saída — desfaz o recorte sem procurar o ✕ —, e o
 * atalho pra FRENTE existe porque nem toda lista recorta passado: rotinas
 * filtram execução agendada, e demandas, prazo de entrega.
 */
const ATALHOS_PADRAO = [
  { texto: "Tudo", dias: null },
  { texto: "7 dias", dias: 7 },
  { texto: "30 dias", dias: 30 },
  { texto: "90 dias", dias: 90 },
  { texto: "Próximos 30", dias: -30 },
];

const SEM_PERIODO: Periodo = { de: null, ate: null };

/** Um destaque só por painel, escrito por ponteiro e teclado no mesmo lugar. */
function destacar(itens: HTMLElement[], indice: number): void {
  for (const [i, item] of itens.entries()) {
    item.dataset.ativo = i === indice ? "sim" : "nao";
  }
}

interface Estado {
  def: FiltroDeclarado;
  /** Na barra como chip. Fora dela, o valor não conta pra consulta. */
  ativo: boolean;
  periodo: Periodo;
  opcao: string | null;
  ligado: boolean;
  /** O do período é criado uma vez: é ele que guarda o mês navegado. */
  seletor?: SeletorPeriodoDs;
}

/**
 * Setas, Enter e Escape num painel de itens — o que o Radix dá de graça e aqui
 * é à mão. O destaque é o mesmo `data-ativo` que o ponteiro escreve, então
 * teclado e mouse nunca acendem duas linhas ao mesmo tempo.
 */
function tecladoDeLista(
  painel: HTMLElement,
  itens: HTMLElement[],
  escolher: (indice: number) => void,
  fechar: () => void,
): void {
  let ativo = 0;

  const marcar = (indice: number): void => {
    if (itens.length === 0) return;
    ativo = (indice + itens.length) % itens.length;
    for (const [i, item] of itens.entries()) {
      item.dataset.ativo = i === ativo ? "sim" : "nao";
    }
    itens[ativo]?.scrollIntoView({ block: "nearest" });
  };

  painel.addEventListener("keydown", (ev) => {
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
    // Tab sem `preventDefault`: fecha e deixa o foco seguir dali.
    if (ev.key === "Escape" || ev.key === "Tab") {
      if (ev.key === "Escape") ev.preventDefault();
      fechar();
    }
  });
}

export function criarBarraFiltros(o: OpcoesBarraFiltros): BarraFiltros {
  const elemento = h("div", {
    class: "ds-barra-filtros",
    role: "group",
    aria: { label: "Filtros" },
  });

  const estados = new Map<string, Estado>();
  for (const def of o.filtros) {
    const opcao = def.tipo === "opcoes" ? (def.padrao ?? null) : null;
    const ligado = def.tipo === "liga" ? (def.padrao ?? false) : false;
    estados.set(def.chave, {
      def,
      // Filtro com default já nasce como chip: senão a lista viria recortada
      // por um filtro que a barra não mostra.
      ativo: opcao !== null || ligado,
      periodo: { ...SEM_PERIODO },
      opcao,
      ligado,
    });
  }

  const mudou = (): void => {
    desenhar();
    o.aoMudar();
  };

  /** Chip de período: o gatilho é o próprio seletor, com o calendário atrás. */
  function chipPeriodo(e: Estado): HTMLElement {
    if (!e.seletor) {
      const def = e.def as Extract<FiltroDeclarado, { tipo: "periodo" }>;
      e.seletor = criarSeletorPeriodoDs({
        rotulo: def.rotulo,
        aparencia: "chip",
        atalhos: def.atalhos ?? ATALHOS_PADRAO,
        aoMudar: (p) => {
          e.periodo = p;
          mudou();
        },
      });
    }
    return e.seletor.elemento;
  }

  /** Chip de opções: lista no mesmo desenho da lista do select do DS. */
  function chipOpcoes(e: Estado): HTMLElement {
    const def = e.def as Extract<FiltroDeclarado, { tipo: "opcoes" }>;
    const escolhida = def.opcoes.find((op) => op.valor === e.opcao);

    const corpo = h(
      "button",
      {
        class: "ds-filtro-chip__corpo",
        type: "button",
        dataset: { state: "closed" },
        aria: { haspopup: "listbox", expanded: "false" },
      },
      h("span", { class: "ds-filtro-chip__nome" }, def.rotulo),
      escolhida ? h("span", { class: "ds-filtro-chip__op" }, "é") : null,
      escolhida
        ? h("span", { class: "ds-filtro-chip__valor" }, escolhida.texto)
        : null,
    );
    if (!escolhida) corpo.setAttribute("data-placeholder", "");

    const escolher = (indice: number): void => {
      const op = def.opcoes[indice];
      if (!op) return;
      e.opcao = op.valor;
      flutuante.fechar();
      mudou();
    };

    const itens = def.opcoes.map((op, indice) =>
      h(
        "div",
        {
          class: "ds-selecao__item",
          role: "option",
          aria: { selected: String(op.valor === e.opcao) },
          on: {
            click: () => escolher(indice),
            pointermove: () => destacar(itens, indice),
          },
        },
        h("span", { class: "ds-selecao__marca" }, icone(ICONES.confere)),
        h("span", {}, op.texto),
      ),
    );

    const lista = h(
      "div",
      {
        class: "ds-flutuante ds-selecao__lista",
        role: "listbox",
        tabindex: "-1",
        aria: { label: def.rotulo },
      },
      ...itens,
    );

    const flutuante = criarFlutuante({
      gatilho: corpo,
      painel: lista,
      aoAbrir: () => lista.focus(),
    });

    corpo.addEventListener("click", () => {
      if (flutuante.aberto()) flutuante.fechar();
      else flutuante.abrir();
    });
    tecladoDeLista(lista, itens, escolher, () => flutuante.fechar(true));

    return corpo;
  }

  /** Chip liga/desliga: sem painel, porque a escolha tem só dois lados. */
  function chipLiga(e: Estado): HTMLElement {
    return h(
      "button",
      {
        class: "ds-filtro-chip__corpo",
        type: "button",
        aria: { pressed: String(e.ligado) },
        on: {
          click: () => {
            e.ligado = !e.ligado;
            mudou();
          },
        },
      },
      h("span", { class: "ds-filtro-chip__nome" }, e.def.rotulo),
      h(
        "span",
        { class: "ds-filtro-chip__valor" },
        e.ligado ? "sim" : "não",
      ),
    );
  }

  function chip(e: Estado): HTMLElement {
    const corpo =
      e.def.tipo === "periodo"
        ? chipPeriodo(e)
        : e.def.tipo === "opcoes"
          ? chipOpcoes(e)
          : chipLiga(e);

    const descartar = h(
      "button",
      {
        class: "ds-filtro-chip__x",
        type: "button",
        aria: { label: `Remover filtro de ${e.def.rotulo.toLowerCase()}` },
        on: {
          click: () => {
            e.ativo = false;
            // Zera junto: o chip de volta pra lista de adicionar não pode
            // guardar um recorte que a barra não mostra mais.
            e.periodo = { ...SEM_PERIODO };
            e.opcao = null;
            e.ligado = false;
            e.seletor?.definir(SEM_PERIODO);
            mudou();
          },
        },
      },
      icone(ICONES.fechar),
    );

    return h("span", { class: "ds-filtro-chip" }, corpo, descartar);
  }

  /** O botão de adicionar e a lista do que ainda não está na barra. */
  function adicionar(): HTMLElement | null {
    const disponiveis = o.filtros.filter((d) => !estados.get(d.chave)?.ativo);
    // Sem nada a adicionar o botão sai da barra: um menu que só pode estar
    // vazio é um convite a um clique sem resposta.
    if (disponiveis.length === 0) return null;

    const gatilho = h(
      "button",
      {
        class: "ds-barra-filtros__adicionar",
        type: "button",
        dataset: { state: "closed" },
        aria: { haspopup: "menu", expanded: "false" },
      },
      icone(ICONES.filtro_adicionar, { preenchido: true }),
      h("span", {}, "Filtros"),
    );

    const acrescentar = (indice: number): void => {
      const def = disponiveis[indice];
      const e = def ? estados.get(def.chave) : undefined;
      if (!e) return;
      e.ativo = true;
      // `liga` não tem painel: entrar na barra já é ligar.
      if (e.def.tipo === "liga") e.ligado = true;
      flutuante.fechar();
      mudou();
    };

    const itens = disponiveis.map((def, indice) =>
      h(
        "div",
        {
          class: "ds-selecao__item",
          role: "menuitem",
          tabindex: "-1",
          on: {
            click: () => acrescentar(indice),
            pointermove: () => destacar(itens, indice),
          },
        },
        // Canaleta vazia: alinha o texto com a lista de opções, onde ela
        // guarda o "✓" do escolhido.
        h("span", { class: "ds-selecao__marca" }),
        h("span", {}, def.rotulo),
      ),
    );

    const menu = h(
      "div",
      {
        class: "ds-flutuante ds-selecao__lista",
        role: "menu",
        tabindex: "-1",
        aria: { label: "Adicionar filtro" },
      },
      ...itens,
    );

    const flutuante = criarFlutuante({
      gatilho,
      painel: menu,
      aoAbrir: () => menu.focus(),
    });

    gatilho.addEventListener("click", () => {
      if (flutuante.aberto()) flutuante.fechar();
      else flutuante.abrir();
    });
    tecladoDeLista(menu, itens, acrescentar, () => flutuante.fechar(true));

    return gatilho;
  }

  /** Só a partir de dois chips: com um, o ✕ dele já é o "limpar". */
  function limparTudo(quantos: number): HTMLElement | null {
    if (quantos < 2) return null;
    return h(
      "button",
      {
        class: "ds-barra-filtros__limpar",
        type: "button",
        on: {
          click: () => {
            for (const e of estados.values()) {
              e.ativo = false;
              e.periodo = { ...SEM_PERIODO };
              e.opcao = null;
              e.ligado = false;
              e.seletor?.definir(SEM_PERIODO);
            }
            mudou();
          },
        },
      },
      "Limpar filtros",
    );
  }

  function desenhar(): void {
    const ativos = o.filtros
      .map((d) => estados.get(d.chave))
      .filter((e): e is Estado => e !== undefined && e.ativo);

    montar(
      elemento,
      ...ativos.map(chip),
      adicionar(),
      limparTudo(ativos.length),
    );
  }

  desenhar();

  const lido = (chave: string): Estado | null => {
    const e = estados.get(chave);
    return e && e.ativo ? e : null;
  };

  return {
    elemento,
    periodo: (chave) => lido(chave)?.periodo ?? SEM_PERIODO,
    opcao: (chave) => lido(chave)?.opcao ?? null,
    ligado: (chave) => lido(chave)?.ligado ?? false,
  };
}
