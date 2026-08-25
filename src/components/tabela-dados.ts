/**
 * Tabela de dados — o `DataTable` do iGreen DS em DOM puro.
 *
 * No DS ele é um "smart wrapper": orquestra 17+ hooks (filtro, ordenação,
 * busca, paginação, seleção, densidade, query, exportação, saved views…) e
 * delega o desenho para `<Table>`, `<TableToolbar>`, `<FooterTable>` e, em
 * `viewMode="kanban"`, para `<Kanban>`.
 *
 * Aqui vem o núcleo que esta base consome hoje, com o MESMO contrato de
 * colunas: busca, ordenação por coluna, densidade e paginação, mais o estado
 * vazio e o de carregando. O desenho da grade sai do layer `tabela-ds`
 * (`ds-componentes.css`), que já é a tradução do `<Table>` — por isso a
 * marcação emitida é `.tabela-envolucro > table.tabela`, e não uma nova.
 *
 * O que NÃO veio, e por quê: seleção, exportação, saved views, agrupamento,
 * virtualização e kanban. Não é limitação da porta — é que nenhuma tela desta
 * base age sobre elas, e caixa de seleção que não leva a lugar nenhum é ruído
 * na linha. Cada uma entra quando aparecer a tela que a usa.
 *
 * Server mode também não: as listas aqui já vêm inteiras do banco (o recorte
 * de verdade é o `barra-filtros.ts`), então busca, ordenação e página são
 * resolvidas no cliente, sem ida e volta.
 */

import { h, icone, ICONES, montar } from "@/lib/dom";

export interface ColunaTabela<T> {
  chave: string;
  titulo: string;
  /**
   * Valor bruto da célula — é o que a busca varre e o que a ordenação compara.
   * Sem ele a coluna não ordena nem entra na busca (caso de coluna de ações).
   */
  valor?: (linha: T) => string | number | null;
  /** Célula desenhada. Sem ela, o `valor` vira texto. */
  celula?: (linha: T) => Node | string;
  alinhamento?: "inicio" | "fim";
  /** Identificador técnico (número, matrícula): mono e apagado, o papel `code` do DS. */
  tecnica?: boolean;
}

export type Densidade = "compacta" | "padrao" | "confortavel";

export interface TabelaDados<T> {
  elemento: HTMLElement;
  /** Troca as linhas e volta para a primeira página. */
  definirLinhas(linhas: T[]): void;
  carregando(sim: boolean): void;
}

export interface OpcoesTabelaDados<T> {
  /** `aria-label` da grade — o que ela lista. */
  rotulo: string;
  colunas: Array<ColunaTabela<T>>;
  linhas?: T[];
  /** Placeholder da busca. Sem isto, a barra não tem campo de busca. */
  busca?: string;
  /** Linhas por página. `0` desliga a paginação. */
  porPagina?: number;
  densidade?: Densidade;
  vazio?: { titulo: string; texto: string };
  aoClicarLinha?: (linha: T) => void;
}

/** Alturas de linha do `<Table>` do DS, por densidade. */
const ALTURA: Record<Densidade, string> = {
  compacta: "40px",
  padrao: "56px",
  confortavel: "64px",
};

const CICLO_DENSIDADE: Densidade[] = ["compacta", "padrao", "confortavel"];

const ROTULO_DENSIDADE: Record<Densidade, string> = {
  compacta: "Compacta",
  padrao: "Padrão",
  confortavel: "Confortável",
};

const texto = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? "" : String(v);

export function criarTabelaDados<T>(
  o: OpcoesTabelaDados<T>,
): TabelaDados<T> {
  const porPagina = o.porPagina ?? 0;

  let linhas = o.linhas ?? [];
  let termo = "";
  let ordem: { chave: string; desc: boolean } | null = null;
  let densidade: Densidade = o.densidade ?? "padrao";
  let pagina = 1;
  let ocupada = false;

  const corpo = h("tbody");
  const cabecalho = h("tr");
  const grade = h(
    "table",
    { class: "tabela", aria: { label: o.rotulo } },
    h("thead", {}, cabecalho),
    corpo,
  );
  const envolucro = h("div", { class: "tabela-envolucro" }, grade);

  const contador = h("span", { class: "ds-tabela__contagem" });
  const barra = h("div", { class: "ds-tabela__barra" });
  const rodape = h("div", { class: "ds-tabela__rodape" });

  const elemento = h("div", { class: "ds-tabela" }, barra, envolucro, rodape);

  /* ---------- Dados ---------- */

  const bruto = (coluna: ColunaTabela<T>, linha: T): string | number | null =>
    coluna.valor ? coluna.valor(linha) : null;

  function filtradas(): T[] {
    const alvo = termo.trim().toLowerCase();
    if (!alvo) return linhas;

    // Busca por SUBSTRING em todas as colunas com `valor`, que é o que a
    // `useSearch` do DS faz por padrão.
    return linhas.filter((linha) =>
      o.colunas.some((c) =>
        texto(bruto(c, linha)).toLowerCase().includes(alvo),
      ),
    );
  }

  function ordenadas(lista: T[]): T[] {
    if (!ordem) return lista;
    const coluna = o.colunas.find((c) => c.chave === ordem?.chave);
    if (!coluna?.valor) return lista;

    // Cópia: ordenar no lugar embaralharia a lista que a tela passou.
    return [...lista].sort((a, b) => {
      const x = bruto(coluna, a);
      const y = bruto(coluna, b);
      if (x === y) return 0;
      if (x === null || x === "") return 1;
      if (y === null || y === "") return -1;

      const comparacao =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : // `localeCompare` com `numeric` põe "item 2" antes de "item 10", e
            // acento não muda a ordem alfabética em pt-BR.
            texto(x).localeCompare(texto(y), "pt-BR", { numeric: true });

      return ordem?.desc ? -comparacao : comparacao;
    });
  }

  const visiveis = (): T[] => ordenadas(filtradas());

  /* ---------- Desenho ---------- */

  function pintarCabecalho(): void {
    montar(
      cabecalho,
      ...o.colunas.map((c) => {
        const celula = h("th", {
          class: c.alinhamento === "fim" ? "ds-tabela__fim" : undefined,
          // `aria-sort` é o que o leitor de tela anuncia; o CSS pinta pelo
          // mesmo atributo, sem classe de estado em paralelo.
          aria: {
            sort:
              ordem?.chave === c.chave
                ? ordem.desc
                  ? "descending"
                  : "ascending"
                : "none",
          },
        });

        if (!c.valor) {
          celula.textContent = c.titulo;
          return celula;
        }

        const seta = icone(ICONES.seta_baixo);
        seta.setAttribute("class", "ds-tabela__seta");

        const botao = h(
          "button",
          {
            class: "ds-tabela__ordenar",
            type: "button",
            on: {
              click: () => {
                // Terceiro clique desliga: sem isso não há como voltar à ordem
                // em que a consulta entregou as linhas.
                if (ordem?.chave !== c.chave) ordem = { chave: c.chave, desc: false };
                else if (!ordem.desc) ordem = { chave: c.chave, desc: true };
                else ordem = null;
                pagina = 1;
                pintar();
              },
            },
          },
          c.titulo,
        );
        botao.append(seta);
        celula.append(botao);
        return celula;
      }),
    );
  }

  function pintarBarra(): void {
    const filhos: Array<HTMLElement | null> = [];

    if (o.busca !== undefined) {
      const campo = h("input", {
        class: "entrada ds-tabela__busca",
        type: "search",
        value: termo,
        placeholder: o.busca,
        aria: { label: `Buscar em ${o.rotulo}` },
        on: {
          input: (ev: Event) => {
            termo = (ev.target as HTMLInputElement).value;
            pagina = 1;
            pintarCorpo();
            pintarRodape();
            // Só o corpo se redesenha: recriar a barra tiraria o foco do campo
            // a cada tecla.
          },
        },
      });
      filhos.push(campo);
    }

    filhos.push(contador);
    filhos.push(h("span", { class: "empurra" }));

    filhos.push(
      h(
        "button",
        {
          class: "ds-tabela__densidade",
          type: "button",
          title: "Altura das linhas",
          on: {
            click: () => {
              const i = CICLO_DENSIDADE.indexOf(densidade);
              densidade =
                CICLO_DENSIDADE[(i + 1) % CICLO_DENSIDADE.length] ?? "padrao";
              aplicarDensidade();
              pintarBarra();
            },
          },
        },
        ROTULO_DENSIDADE[densidade],
      ),
    );

    montar(barra, ...filhos);
  }

  function aplicarDensidade(): void {
    elemento.style.setProperty("--ds-tabela-altura", ALTURA[densidade]);
  }

  function pintarCorpo(): void {
    const lista = visiveis();
    const total = lista.length;
    const inicio = porPagina > 0 ? (pagina - 1) * porPagina : 0;
    const pagina_ = porPagina > 0 ? lista.slice(inicio, inicio + porPagina) : lista;

    contador.textContent =
      total === 1 ? "1 registro" : `${total} registros`;

    if (ocupada) {
      montar(
        corpo,
        h(
          "tr",
          {},
          h(
            "td",
            { class: "ds-tabela__estado", colspan: o.colunas.length },
            "Carregando…",
          ),
        ),
      );
      return;
    }

    if (total === 0) {
      const vazio = o.vazio ?? {
        titulo: "Nada para mostrar",
        texto: "Ainda não há registros aqui.",
      };
      montar(
        corpo,
        h(
          "tr",
          {},
          h(
            "td",
            { class: "ds-tabela__estado", colspan: o.colunas.length },
            h(
              "div",
              { class: "vazio" },
              h("h3", {}, termo.trim() ? "Nada com essa busca" : vazio.titulo),
              h(
                "p",
                {},
                termo.trim()
                  ? "Nenhum registro casa com o que foi digitado. Limpe a busca para ver a lista inteira."
                  : vazio.texto,
              ),
            ),
          ),
        ),
      );
      return;
    }

    montar(
      corpo,
      ...pagina_.map((linha) => {
        const tr = h("tr", {
          on: o.aoClicarLinha
            ? { click: () => o.aoClicarLinha?.(linha) }
            : undefined,
        });

        for (const c of o.colunas) {
          const td = h("td", {
            class: [
              c.alinhamento === "fim" ? "ds-tabela__fim" : null,
              c.tecnica ? "tabela__num" : null,
            ]
              .filter(Boolean)
              .join(" "),
          });

          const conteudo = c.celula ? c.celula(linha) : texto(bruto(c, linha));
          if (typeof conteudo === "string") td.textContent = conteudo;
          else td.append(conteudo);

          tr.append(td);
        }

        return tr;
      }),
    );
  }

  function pintarRodape(): void {
    if (porPagina <= 0) {
      montar(rodape);
      rodape.hidden = true;
      return;
    }

    const total = visiveis().length;
    const ultima = Math.max(1, Math.ceil(total / porPagina));
    pagina = Math.min(pagina, ultima);

    const inicio = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
    const fim = Math.min(pagina * porPagina, total);

    const passo = (delta: number, rotulo: string): HTMLElement =>
      h(
        "button",
        {
          class: "ds-tabela__pagina",
          type: "button",
          disabled: delta < 0 ? pagina <= 1 : pagina >= ultima,
          aria: { label: rotulo },
          on: {
            click: () => {
              pagina += delta;
              pintarCorpo();
              pintarRodape();
            },
          },
        },
        rotulo,
      );

    rodape.hidden = false;
    montar(
      rodape,
      h(
        "span",
        { class: "ds-tabela__faixa" },
        h("b", {}, `${inicio}–${fim}`),
        ` de ${total}`,
      ),
      h("span", { class: "empurra" }),
      passo(-1, "Anterior"),
      h("span", { class: "ds-tabela__pagina-atual" }, `${pagina} / ${ultima}`),
      passo(1, "Próxima"),
    );
  }

  function pintar(): void {
    pintarCabecalho();
    pintarCorpo();
    pintarRodape();
  }

  aplicarDensidade();
  pintarBarra();
  pintar();

  return {
    elemento,
    definirLinhas: (novas) => {
      linhas = novas;
      pagina = 1;
      // Chegou dado: o "Carregando…" não precisa ser desligado à mão por quem
      // chama, e esquecer isso deixaria a tabela cheia mostrando o aviso.
      ocupada = false;
      pintar();
    },
    carregando: (sim) => {
      ocupada = sim;
      pintarCorpo();
    },
  };
}
