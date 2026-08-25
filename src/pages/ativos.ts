/** CMDB — inventário de ativos. */

import { criarBarraFiltros } from "@/components/barra-filtros";
import { aguardando } from "@/components/esqueleto";
import { avisar, h, montar } from "@/lib/dom";
import { confirmar } from "@/components/dialogo";
import { dataCurta } from "@/lib/formato";
import {
  ativosImpactados,
  confirmarVerificacao,
  criarAtivo,
  diasSemVerificar,
  excluirAtivo,
  inventarioSujo,
  listarAtivos,
  ROTULOS_CRITICIDADE,
  ROTULOS_STATUS_ATIVO,
  ROTULOS_TIPO_ATIVO,
} from "@/lib/cmdb";
import type {
  Ambiente,
  AtivoEnriquecido,
  Criticidade,
  Perfil,
  RascunhoAtivo,
  StatusAtivo,
  TipoAtivo,
} from "@/types/dominio";

export function renderizarAtivos(alvo: HTMLElement, perfil: Perfil): void {
  let formAberto = false;
  let expandido: string | null = null;

  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  // `barraFiltros` e não `barra`: o nome já é da função que monta a linha.
  const barraFiltros = criarBarraFiltros({
    aoMudar: () => desenhar(),
    filtros: [
      { chave: "data", rotulo: "Cadastro", tipo: "periodo" },
      {
        chave: "tipo",
        rotulo: "Tipo",
        tipo: "opcoes",
        opcoes: (Object.keys(ROTULOS_TIPO_ATIVO) as TipoAtivo[]).map((t) => ({
          valor: t,
          texto: ROTULOS_TIPO_ATIVO[t],
        })),
      },
      { chave: "sujos", rotulo: "Só inventário sujo", tipo: "liga" },
    ],
  });

  // Criada uma vez: recriada a cada consulta, a busca perdia o foco a cada
  // tecla digitada.
  const busca = h("input", {
    class: "entrada",
    type: "search",
    placeholder: "Buscar por nome, patrimônio, série ou modelo…",
    style: "max-width:300px",
    on: { input: () => desenhar() },
  }) as HTMLInputElement;

  const desenhar = (): void => {
    aguardando(area, "tabela");
    void listarAtivos({
      texto: busca.value,
      tipo: barraFiltros.opcao("tipo") as TipoAtivo | null,
      apenasSujos: barraFiltros.ligado("sujos"),
      ...barraFiltros.periodo("data"),
    })
      .then((ativos) => {
        montar(
          area,
          metricas(ativos),
          barra(),
          formAberto ? formNovo() : null,
          barraFiltros.ligado("sujos")
            ? h(
                "div",
                { class: "aviso aviso--alerta" },
                h("span", { class: "aviso__icone" }, "!"),
                h(
                  "span",
                  {},
                  h("b", {}, "Inventário sujo. "),
                  "Ativos sem conferência há mais de 180 dias, ou nunca conferidos. O registro deles não é confiável até alguém verificar fisicamente.",
                ),
              )
            : null,
          lista(ativos),
        );
      })
      .catch((e: unknown) =>
        avisar(e instanceof Error ? e.message : "Falha ao carregar.", "erro"),
      );
  };

  const metricas = (ativos: AtivoEnriquecido[]): HTMLElement => {
    const criticos = ativos.filter((a) => a.criticidade === "critico").length;
    const sujos = ativos.filter((a) => inventarioSujo(a)).length;
    const semDono = ativos.filter((a) => !a.dono_tecnico_id).length;

    const cartao = (
      rotulo: string,
      valor: number,
      nota: string,
      variante = "",
    ): HTMLElement =>
      h(
        "div",
        { class: `metrica${variante ? ` metrica--${variante}` : ""}` },
        h("div", { class: "metrica__rotulo" }, rotulo),
        h("div", { class: "metrica__valor" }, String(valor)),
        h("div", { class: "metrica__nota" }, nota),
      );

    return h(
      "div",
      { class: "grade-metricas" },
      cartao("Ativos", ativos.length, "no inventário"),
      cartao(
        "Críticos",
        criticos,
        "param serviço se caírem",
        criticos > 0 ? "alerta" : "",
      ),
      cartao(
        "Sem dono técnico",
        semDono,
        "ninguém responde por eles",
        semDono > 0 ? "critica" : "ok",
      ),
      cartao(
        "Inventário sujo",
        sujos,
        "sem conferência há 180+ dias",
        sujos > 0 ? "alerta" : "ok",
      ),
    );
  };

  const barra = (): HTMLElement => {
    return h(
      "div",
      { class: "grade-filtros" },
      busca,
      barraFiltros.elemento,
      h(
        "button",
        {
          class: "btn btn--primario empurra",
          type: "button",
          on: {
            click: () => {
              formAberto = !formAberto;
              desenhar();
            },
          },
        },
        formAberto ? "Cancelar" : "Novo ativo",
      ),
    );
  };

  const lista = (ativos: AtivoEnriquecido[]): HTMLElement => {
    if (ativos.length === 0) {
      return h(
        "div",
        { class: "cartao" },
        h(
          "div",
          { class: "vazio" },
          h("h3", {}, "Nenhum ativo cadastrado"),
          h(
            "p",
            {},
            "Comece pelos ativos de produção — servidores, links e aplicações. São eles que, ao cair, param o negócio, e é o vínculo com eles que dá sentido ao ranking de incidentes.",
          ),
        ),
      );
    }

    const linhas = ativos.flatMap((a) => {
      const dias = diasSemVerificar(a);
      const sujo = inventarioSujo(a);

      const principal = h(
        "tr",
        {
          on: {
            click: () => {
              expandido = expandido === a.id ? null : a.id;
              desenhar();
            },
          },
        },
        h("td", { class: "tabela__num" }, a.tag_patrimonio ?? "—"),
        h(
          "td",
          {},
          h("span", { class: "tabela__titulo", title: a.nome }, a.nome),
          h(
            "span",
            { class: "tabela__meta" },
            [ROTULOS_TIPO_ATIVO[a.tipo_ativo], a.fabricante, a.modelo]
              .filter(Boolean)
              .join(" · "),
          ),
        ),
        h(
          "td",
          {},
          h(
            "span",
            { class: `tag tag--${criticidadeClasse(a.criticidade)}` },
            ROTULOS_CRITICIDADE[a.criticidade],
          ),
        ),
        h(
          "td",
          {},
          h("span", { class: "selo" }, ROTULOS_STATUS_ATIVO[a.status_ativo]),
        ),
        h(
          "td",
          { class: a.dono_tecnico_nome ? "" : "texto-sutil" },
          a.dono_tecnico_nome ?? "sem dono",
        ),
        h(
          "td",
          {},
          h(
            "span",
            {
              class: `prazo ${sujo ? "prazo--atrasado" : "prazo--ok"}`,
              title: a.ultima_verificacao
                ? `Conferido em ${dataCurta(a.ultima_verificacao)}`
                : "Nunca conferido",
            },
            dias === null ? "nunca" : `${dias} dias`,
          ),
        ),
        h(
          "td",
          {},
          h(
            "button",
            {
              class: "btn btn--sm",
              type: "button",
              title: "Registra a conferência física de hoje",
              on: {
                click: (ev: Event) => {
                  ev.stopPropagation();
                  void confirmarVerificacao(a.id)
                    .then(() => {
                      avisar(`${a.nome} conferido hoje.`, "ok");
                      desenhar();
                    })
                    .catch((e: unknown) =>
                      avisar(
                        e instanceof Error ? e.message : "Falha ao conferir.",
                        "erro",
                      ),
                    );
                },
              },
            },
            "Conferir",
          ),
        ),
      );

      if (expandido !== a.id) return [principal];
      return [principal, linhaDetalhe(a)];
    });

    return h(
      "div",
      { class: "tabela-envolucro" },
      h(
        "table",
        { class: "tabela" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            h("th", {}, "Patrimônio"),
            h("th", {}, "Ativo"),
            h("th", {}, "Criticidade"),
            h("th", {}, "Situação"),
            h("th", {}, "Dono técnico"),
            h("th", {}, "Sem conferir"),
            h("th", {}, ""),
          ),
        ),
        h("tbody", {}, ...linhas),
      ),
    );
  };

  const linhaDetalhe = (a: AtivoEnriquecido): HTMLElement => {
    const impacto = h(
      "div",
      { class: "texto-sutil" },
      "Consultando dependências…",
    );

    void ativosImpactados(a.id)
      .then((lista) => {
        montar(
          impacto,
          lista.length === 0
            ? h(
                "span",
                { class: "texto-sutil" },
                "Nenhum ativo depende deste. Se houver dependências reais, cadastre-as para que o protocolo P1 saiba o que avisar.",
              )
            : h(
                "div",
                {},
                h(
                  "div",
                  { style: "margin-bottom:6px" },
                  h(
                    "b",
                    {},
                    `${lista.length} ativo(s) param junto se este cair:`,
                  ),
                ),
                h(
                  "div",
                  { class: "linha-flex" },
                  ...lista.map((i) =>
                    h(
                      "span",
                      { class: `tag tag--${criticidadeClasse(i.criticidade)}` },
                      `${i.nome} (${i.saltos} salto${i.saltos > 1 ? "s" : ""})`,
                    ),
                  ),
                ),
              ),
        );
      })
      .catch(() => montar(impacto, h("span", { class: "texto-sutil" }, "—")));

    const podeExcluir =
      perfil.papel === "admin" || perfil.hierarquia !== "colaborador";

    return h(
      "tr",
      {},
      h(
        "td",
        { colspan: 7, style: "background:var(--c-surface-2)" },
        h(
          "div",
          { class: "grade-2", style: "gap:var(--s-5)" },
          h(
            "dl",
            { class: "definicoes" },
            def("Série", a.numero_serie ?? "—"),
            def(
              "Local",
              [a.unidade, a.sala].filter(Boolean).join(" · ") || "—",
            ),
            def("Ambiente", a.ambiente ?? "—"),
            def("Garantia até", dataCurta(a.fim_garantia)),
            def("Usuário", a.usuario_nome ?? "—"),
            a.observacoes ? def("Observações", a.observacoes) : null,
          ),
          h(
            "div",
            {},
            h("h4", { style: "margin:0 0 6px" }, "Alcance de impacto"),
            impacto,
            podeExcluir
              ? h(
                  "button",
                  {
                    class: "btn btn--perigo btn--sm",
                    type: "button",
                    style: "margin-top:var(--s-4)",
                    on: {
                      click: (ev: Event) => {
                        ev.stopPropagation();
                        void confirmar({
                          titulo: `Excluir ${a.nome}?`,
                          texto: `${ROTULOS_TIPO_ATIVO[a.tipo_ativo]}${a.tag_patrimonio ? ` · ${a.tag_patrimonio}` : ""}`,
                          consequencia:
                            "Os chamados vinculados a ele perdem a referência, e o ativo some do ranking de incidentes. Se ele apenas saiu de uso, prefira mudar a situação para descartado.",
                          rotuloConfirmar: "Excluir do inventário",
                          perigo: true,
                        }).then((segue) => {
                          if (!segue) return;
                          void excluirAtivo(a.id)
                            .then(() => {
                              avisar("Ativo excluído.", "ok");
                              expandido = null;
                              desenhar();
                            })
                            .catch((e: unknown) =>
                              avisar(
                                e instanceof Error
                                  ? e.message
                                  : "Falha ao excluir.",
                                "erro",
                              ),
                            );
                        });
                      },
                    },
                  },
                  "Excluir do inventário",
                )
              : null,
          ),
        ),
      ),
    );
  };

  const formNovo = (): HTMLElement => {
    const rascunho: RascunhoAtivo = {
      nome: "",
      tag_patrimonio: "",
      tipo_ativo: "servidor",
      status_ativo: "em_uso",
      criticidade: "medio",
      ambiente: "",
      unidade: "",
      sala: "",
      fabricante: "",
      modelo: "",
      numero_serie: "",
      fim_garantia: "",
      observacoes: "",
    };

    const entrada = (
      rotulo: string,
      chave: keyof RascunhoAtivo,
      tipoCampo = "text",
    ): HTMLElement =>
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        h("input", {
          class: "entrada",
          type: tipoCampo,
          on: {
            input: (ev: Event) => {
              rascunho[chave] = (ev.target as HTMLInputElement).value as never;
            },
          },
        }),
      );

    const sel = <T extends string>(
      rotulo: string,
      chave: keyof RascunhoAtivo,
      opcoes: Array<[T, string]>,
      inicial: T,
    ): HTMLElement => {
      const s = h(
        "select",
        {
          class: "selecao",
          on: {
            change: (ev: Event) => {
              rascunho[chave] = (ev.target as HTMLSelectElement).value as never;
            },
          },
        },
        ...opcoes.map(([v, t]) => h("option", { value: v }, t)),
      ) as HTMLSelectElement;
      s.value = inicial;
      return h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        s,
      );
    };

    const botao = h(
      "button",
      { class: "btn btn--primario", type: "submit" },
      "Cadastrar ativo",
    );

    return h(
      "form",
      {
        class: "cartao",
        on: {
          submit: (ev: Event) => {
            ev.preventDefault();
            if (rascunho.nome.trim().length < 2) {
              return avisar("Informe o nome do ativo.", "erro");
            }
            botao.disabled = true;
            void criarAtivo(rascunho)
              .then((novo) => {
                avisar(`${novo.nome} cadastrado e conferido hoje.`, "ok");
                formAberto = false;
                desenhar();
              })
              .catch((e: unknown) => {
                avisar(
                  e instanceof Error ? e.message : "Falha ao cadastrar.",
                  "erro",
                );
                botao.disabled = false;
              });
          },
        },
      },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Novo ativo"),
        h(
          "span",
          { class: "texto-sutil empurra" },
          "Cadastrar é conferir — o registro nasce verificado hoje",
        ),
      ),
      h(
        "div",
        { class: "grade-campos" },
        entrada("Nome ou hostname", "nome"),
        entrada("Tag de patrimônio", "tag_patrimonio"),
      ),
      h(
        "div",
        { class: "grade-campos" },
        sel<TipoAtivo>(
          "Tipo",
          "tipo_ativo",
          (Object.keys(ROTULOS_TIPO_ATIVO) as TipoAtivo[]).map((t) => [
            t,
            ROTULOS_TIPO_ATIVO[t],
          ]),
          "servidor",
        ),
        sel<StatusAtivo>(
          "Situação",
          "status_ativo",
          (Object.keys(ROTULOS_STATUS_ATIVO) as StatusAtivo[]).map((s) => [
            s,
            ROTULOS_STATUS_ATIVO[s],
          ]),
          "em_uso",
        ),
        sel<Criticidade>(
          "Criticidade",
          "criticidade",
          (Object.keys(ROTULOS_CRITICIDADE) as Criticidade[]).map((c) => [
            c,
            ROTULOS_CRITICIDADE[c],
          ]),
          "medio",
        ),
        sel<Ambiente | "">(
          "Ambiente",
          "ambiente",
          [
            ["", "—"],
            ["producao", "Produção"],
            ["homologacao", "Homologação"],
            ["desenvolvimento", "Desenvolvimento"],
            ["dr", "Contingência (DR)"],
          ],
          "",
        ),
      ),
      h(
        "div",
        { class: "grade-campos" },
        entrada("Fabricante", "fabricante"),
        entrada("Modelo", "modelo"),
        entrada("Número de série", "numero_serie"),
      ),
      h(
        "div",
        { class: "grade-campos" },
        entrada("Unidade", "unidade"),
        entrada("Sala ou rack", "sala"),
        entrada("Garantia até", "fim_garantia", "date"),
      ),
      h(
        "div",
        { class: "linha-flex" },
        h(
          "button",
          {
            class: "btn",
            type: "button",
            on: {
              click: () => {
                formAberto = false;
                desenhar();
              },
            },
          },
          "Cancelar",
        ),
        h("span", { class: "empurra" }),
        botao,
      ),
    );
  };

  desenhar();
}

function def(rotulo: string, valor: string): HTMLElement {
  return h("div", {}, h("dt", {}, rotulo), h("dd", {}, valor));
}

function criticidadeClasse(c: Criticidade): string {
  return c === "critico"
    ? "critica"
    : c === "alto"
      ? "alta"
      : c === "medio"
        ? "media"
        : "baixa";
}
