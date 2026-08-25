/** Base de conhecimento e erros conhecidos. */

import { criarBarraFiltros } from "@/components/barra-filtros";
import { dentroDoPeriodo } from "@/lib/periodo";
import { aguardando } from "@/components/esqueleto";
import { avisar, h, montar } from "@/lib/dom";
import { perguntar } from "@/components/dialogo";
import { dataCurta } from "@/lib/formato";
import { ehAgente } from "@/lib/api";
import {
  artigoVencido,
  atualizarErro,
  avaliarArtigo,
  criarArtigo,
  criarErro,
  listarArtigos,
  listarErros,
  publicarArtigo,
  razaoUtilidade,
  revisarVencidos,
  ROTULOS_PUBLICO,
  ROTULOS_STATUS_ARTIGO,
  ROTULOS_STATUS_ERRO,
  ROTULOS_TIPO_ARTIGO,
} from "@/lib/conhecimento";
import type {
  ArtigoEnriquecido,
  ErroConhecido,
  Perfil,
  PublicoArtigo,
  RascunhoArtigo,
  RascunhoErro,
  StatusArtigo,
  StatusErro,
  TipoArtigo,
} from "@/types/dominio";

type Aba = "artigos" | "erros";

export function renderizarConhecimento(
  alvo: HTMLElement,
  perfil: Perfil,
): void {
  let aba: Aba = "artigos";
  let texto = "";
  let formAberto = false;
  let aberto: string | null = null;

  const agente = ehAgente(perfil);
  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  // `barraFiltros` e não `barra`: o nome já é da função que monta a linha.
  const barraFiltros = criarBarraFiltros({
    aoMudar: () => desenhar(),
    filtros: [{ chave: "data", rotulo: "Publicado", tipo: "periodo" }],
  });

  const desenhar = (): void => {
    aguardando(area, "lista");
    void Promise.all([
      listarArtigos({ texto }),
      agente ? listarErros(texto) : Promise.resolve([] as ErroConhecido[]),
    ])
      .then(([todosArtigos, todosErros]) => {
        // No cliente: as duas listas já vêm inteiras, e um recorte no banco
        // exigiria duas consultas a mais sem ganho nenhum.
        const p = barraFiltros.periodo("data");
        const artigos = todosArtigos.filter((x) =>
          dentroDoPeriodo(x.publicado_em ?? x.criado_em, p),
        );
        const erros = todosErros.filter((x) => dentroDoPeriodo(x.criado_em, p));

        montar(
          area,
          metricas(artigos, erros),
          barra(),
          formAberto ? (aba === "artigos" ? formArtigo() : formErro()) : null,
          aba === "artigos" ? listaArtigos(artigos) : listaErros(erros),
        );
      })
      .catch((e: unknown) =>
        avisar(e instanceof Error ? e.message : "Falha ao carregar.", "erro"),
      );
  };

  const metricas = (
    artigos: ArtigoEnriquecido[],
    erros: ErroConhecido[],
  ): HTMLElement => {
    const publicados = artigos.filter((a) => a.status_artigo === "publicado");
    const vencidos = artigos.filter(artigoVencido).length;
    const evitados = artigos.reduce((s, a) => s + a.chamados_evitados, 0);
    const semSolucao = erros.filter(
      (e) => !e.solucao_definitiva && e.status_erro !== "resolvido",
    ).length;

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
      cartao("Publicados", publicados.length, "disponíveis para consulta"),
      cartao(
        "Vencidos",
        vencidos,
        "passaram da validade",
        vencidos > 0 ? "alerta" : "ok",
      ),
      cartao(
        "Chamados evitados",
        evitados,
        "autoatendimento que funcionou",
        "ok",
      ),
      agente
        ? cartao(
            "Erros sem correção",
            semSolucao,
            "só com contorno",
            semSolucao > 0 ? "alerta" : "ok",
          )
        : cartao("Artigos", artigos.length, "na base"),
    );
  };

  const barra = (): HTMLElement => {
    const botao = (valor: Aba, rotulo: string): HTMLElement =>
      h(
        "button",
        {
          class: `btn btn--sm${aba === valor ? " btn--primario" : ""}`,
          type: "button",
          on: {
            click: () => {
              aba = valor;
              formAberto = false;
              desenhar();
            },
          },
        },
        rotulo,
      );

    return h(
      "div",
      { class: "grade-filtros" },
      barraFiltros.elemento,
      botao("artigos", "Artigos"),
      agente ? botao("erros", "Erros conhecidos (KEDB)") : null,
      h("input", {
        class: "entrada",
        type: "search",
        value: texto,
        placeholder:
          aba === "artigos"
            ? "Buscar por título, resumo ou conteúdo…"
            : "Buscar pelo sintoma como o usuário relata…",
        style: "max-width:320px",
        on: {
          input: (ev: Event) => {
            texto = (ev.target as HTMLInputElement).value;
            desenhar();
          },
        },
      }),
      agente
        ? h(
            "button",
            {
              class: "btn btn--sm",
              type: "button",
              title: "Move para revisão os artigos publicados fora da validade",
              on: {
                click: () => {
                  void revisarVencidos()
                    .then((n) => {
                      avisar(
                        n === 0
                          ? "Nenhum artigo vencido."
                          : `${n} artigo(s) movido(s) para revisão.`,
                        "ok",
                      );
                      desenhar();
                    })
                    .catch((e: unknown) =>
                      avisar(e instanceof Error ? e.message : "Falha.", "erro"),
                    );
                },
              },
            },
            "Revisar vencidos",
          )
        : null,
      agente
        ? h(
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
            formAberto
              ? "Cancelar"
              : aba === "artigos"
                ? "Novo artigo"
                : "Registrar erro conhecido",
          )
        : null,
    );
  };

  /* ---------- Artigos ---------- */

  const listaArtigos = (artigos: ArtigoEnriquecido[]): HTMLElement => {
    if (artigos.length === 0) {
      return vazio(
        "Nenhum artigo na base",
        agente
          ? "Escreva o primeiro a partir de um chamado que você acabou de resolver — a solução ainda está fresca, e é isso que evita o próximo chamado igual."
          : "Quando a equipe de TI publicar guias, eles aparecem aqui.",
      );
    }

    return h(
      "div",
      { class: "pilha" },
      ...artigos.map((a) => {
        const vencido = artigoVencido(a);
        const razao = razaoUtilidade(a);

        return h(
          "div",
          { class: "cartao" },
          h(
            "div",
            { class: "linha-flex" },
            h("span", { class: "mono texto-sutil" }, a.codigo),
            h("b", { style: "flex:1;min-width:200px" }, a.titulo),
            h("span", { class: "tag" }, ROTULOS_TIPO_ARTIGO[a.tipo_artigo]),
            h(
              "span",
              { class: classeArtigo(a.status_artigo) },
              ROTULOS_STATUS_ARTIGO[a.status_artigo],
            ),
            vencido
              ? h("span", { class: "tag tag--critica" }, "vencido")
              : null,
            h("span", { class: "empurra" }),
            h(
              "button",
              {
                class: "btn btn--sm",
                type: "button",
                on: {
                  click: () => {
                    aberto = aberto === a.id ? null : a.id;
                    desenhar();
                  },
                },
              },
              aberto === a.id ? "Fechar" : "Abrir",
            ),
          ),
          h(
            "div",
            { class: "texto-sutil", style: "margin-top:var(--s-2)" },
            a.resumo,
          ),
          aberto === a.id
            ? h(
                "div",
                { class: "pilha", style: "margin-top:var(--s-4)" },
                a.pre_requisitos
                  ? h(
                      "div",
                      { class: "aviso" },
                      h("span", { class: "aviso__icone" }, "i"),
                      h(
                        "span",
                        {},
                        h("b", {}, "Pré-requisitos: "),
                        a.pre_requisitos,
                      ),
                    )
                  : null,
                h(
                  "div",
                  { style: "white-space:pre-wrap;line-height:1.65" },
                  a.corpo,
                ),
                h(
                  "dl",
                  { class: "definicoes" },
                  def("Autor", a.autor_nome),
                  def("Revisor", a.revisor_nome ?? "sem revisor"),
                  def("Público", ROTULOS_PUBLICO[a.publico_alvo]),
                  def("Válido até", dataCurta(a.valido_ate)),
                  def(
                    "Utilidade",
                    razao === null
                      ? "ainda sem avaliação"
                      : `${razao}% acharam útil (${a.util_sim + a.util_nao} votos)`,
                  ),
                  def("Chamados evitados", String(a.chamados_evitados)),
                ),
                h(
                  "div",
                  { class: "linha-flex" },
                  h(
                    "button",
                    {
                      class: "btn btn--sm",
                      type: "button",
                      on: {
                        click: () => {
                          void avaliarArtigo(a, true)
                            .then(() => {
                              avisar("Obrigado — registrado como útil.", "ok");
                              desenhar();
                            })
                            .catch(() => avisar("Falha ao avaliar.", "erro"));
                        },
                      },
                    },
                    "Isto resolveu meu problema",
                  ),
                  h(
                    "button",
                    {
                      class: "btn btn--sm",
                      type: "button",
                      on: {
                        click: () => {
                          void avaliarArtigo(a, false)
                            .then(() => {
                              avisar(
                                "Registrado. O artigo entra na fila de reescrita.",
                                "ok",
                              );
                              desenhar();
                            })
                            .catch(() => avisar("Falha ao avaliar.", "erro"));
                        },
                      },
                    },
                    "Não ajudou",
                  ),
                  h("span", { class: "empurra" }),
                  agente && a.status_artigo !== "publicado"
                    ? h(
                        "button",
                        {
                          class: "btn btn--primario btn--sm",
                          type: "button",
                          disabled: a.autor_id === perfil.id,
                          title:
                            a.autor_id === perfil.id
                              ? "Quem escreve não revisa o próprio texto — peça a outra pessoa"
                              : "Publicar como revisor",
                          on: {
                            click: () => {
                              void publicarArtigo(a.id, perfil)
                                .then(() => {
                                  avisar("Artigo publicado.", "ok");
                                  desenhar();
                                })
                                .catch((e: unknown) =>
                                  avisar(
                                    e instanceof Error ? e.message : "Falha.",
                                    "erro",
                                  ),
                                );
                            },
                          },
                        },
                        "Revisar e publicar",
                      )
                    : null,
                ),
              )
            : null,
        );
      }),
    );
  };

  const formArtigo = (): HTMLElement => {
    const r: RascunhoArtigo = {
      titulo: "",
      tipo_artigo: "solucao_conhecida",
      publico_alvo: "agente",
      categoria: "",
      resumo: "",
      pre_requisitos: "",
      corpo: "",
    };

    const entrada = (
      rotulo: string,
      chave: keyof RascunhoArtigo,
    ): HTMLElement =>
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        h("input", {
          class: "entrada",
          type: "text",
          on: {
            input: (ev: Event) => {
              r[chave] = (ev.target as HTMLInputElement).value as never;
            },
          },
        }),
      );

    const area2 = (
      rotulo: string,
      chave: keyof RascunhoArtigo,
      placeholder: string,
      altura = "110px",
    ): HTMLElement =>
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        h("textarea", {
          class: "area-texto",
          style: `min-height:${altura}`,
          placeholder,
          on: {
            input: (ev: Event) => {
              r[chave] = (ev.target as HTMLTextAreaElement).value as never;
            },
          },
        }),
      );

    const selTipo = seletor(
      (Object.keys(ROTULOS_TIPO_ARTIGO) as TipoArtigo[]).map((t) => [
        t,
        ROTULOS_TIPO_ARTIGO[t],
      ]),
      "solucao_conhecida",
      (v) => {
        r.tipo_artigo = v as TipoArtigo;
      },
    );

    const selPublico = seletor(
      (Object.keys(ROTULOS_PUBLICO) as PublicoArtigo[]).map((p) => [
        p,
        ROTULOS_PUBLICO[p],
      ]),
      "agente",
      (v) => {
        r.publico_alvo = v as PublicoArtigo;
      },
    );

    const botao = h(
      "button",
      { class: "btn btn--primario", type: "submit" },
      "Salvar rascunho",
    );

    return h(
      "form",
      {
        class: "cartao",
        on: {
          submit: (ev: Event) => {
            ev.preventDefault();
            if (r.titulo.trim().length < 8) {
              return avisar(
                "O título precisa de ao menos 8 caracteres.",
                "erro",
              );
            }
            if (r.resumo.trim().length < 20) {
              return avisar(
                "O resumo precisa de ao menos 20 caracteres.",
                "erro",
              );
            }
            if (r.corpo.trim().length < 40) {
              return avisar(
                "O conteúdo precisa de ao menos 40 caracteres.",
                "erro",
              );
            }
            botao.disabled = true;
            void criarArtigo(r, perfil)
              .then((novo) => {
                avisar(
                  `${novo.codigo} salvo como rascunho. Outra pessoa precisa revisar para publicar.`,
                  "ok",
                );
                formAberto = false;
                desenhar();
              })
              .catch((e: unknown) => {
                avisar(e instanceof Error ? e.message : "Falha.", "erro");
                botao.disabled = false;
              });
          },
        },
      },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Novo artigo"),
        h(
          "span",
          { class: "texto-sutil empurra" },
          "Publicar exige revisão de outra pessoa",
        ),
      ),
      entrada("Título — escreva como o usuário perguntaria", "titulo"),
      h(
        "div",
        { class: "grade-campos" },
        h(
          "div",
          { class: "campo" },
          h("label", { class: "campo__rotulo" }, "Tipo"),
          selTipo,
        ),
        h(
          "div",
          { class: "campo" },
          h("label", { class: "campo__rotulo" }, "Público"),
          selPublico,
        ),
        entrada("Categoria", "categoria"),
      ),
      area2(
        "Resumo",
        "resumo",
        "Uma ou duas frases. É o que aparece na busca do formulário de abertura.",
        "70px",
      ),
      area2(
        "Pré-requisitos",
        "pre_requisitos",
        "Acessos e ferramentas necessários.",
        "70px",
      ),
      area2(
        "Conteúdo",
        "corpo",
        "Passo a passo numerado, com o resultado esperado de cada etapa.",
        "180px",
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

  /* ---------- Erros conhecidos ---------- */

  const listaErros = (erros: ErroConhecido[]): HTMLElement => {
    if (erros.length === 0) {
      return vazio(
        "Nenhum erro conhecido registrado",
        "Registre aqui o que está quebrado e ainda não tem correção definitiva. É o que permite o N1 aplicar o contorno certo em vez de investigar do zero toda vez.",
      );
    }

    return h(
      "div",
      { class: "pilha" },
      ...erros.map((e) =>
        h(
          "div",
          { class: "cartao" },
          h(
            "div",
            { class: "linha-flex" },
            h("span", { class: "mono texto-sutil" }, e.codigo),
            h("b", { style: "flex:1;min-width:200px" }, e.sintoma),
            h(
              "span",
              { class: classeErro(e.status_erro) },
              ROTULOS_STATUS_ERRO[e.status_erro],
            ),
            h(
              "span",
              { class: "tag" },
              `${e.ocorrencias} ocorrência${e.ocorrencias === 1 ? "" : "s"}`,
            ),
            e.custo_estimado_mes
              ? h(
                  "span",
                  { class: "tag tag--alta" },
                  `${e.custo_estimado_mes.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}/mês`,
                )
              : null,
          ),
          h(
            "dl",
            { class: "definicoes", style: "margin-top:var(--s-3)" },
            def("Causa raiz", e.causa_raiz),
            def("Contorno aplicável agora", e.contorno),
            def(
              "Solução definitiva",
              e.solucao_definitiva ?? "ainda não existe — só contorno",
            ),
          ),
          e.status_erro !== "resolvido"
            ? h(
                "div",
                { class: "linha-flex", style: "margin-top:var(--s-3)" },
                h("span", { class: "empurra" }),
                h(
                  "button",
                  {
                    class: "btn btn--sm",
                    type: "button",
                    on: {
                      click: () => {
                        void perguntar({
                          titulo: `Resolver ${e.codigo}`,
                          texto: e.sintoma,
                          consequencia:
                            "O erro sai da lista de pendências e o custo mensal do contorno deixa de contar no painel.",
                          rotuloCampo: "Solução definitiva aplicada",
                          placeholder:
                            "O que eliminou a causa, não o que contornava o sintoma.",
                          multilinha: true,
                          minimo: 10,
                          rotuloConfirmar: "Marcar como resolvido",
                        }).then((solucao) => {
                          if (solucao === null) return;
                          void atualizarErro(e.id, {
                            solucao_definitiva: solucao,
                            status_erro: "resolvido",
                          })
                            .then(() => {
                              avisar("Erro marcado como resolvido.", "ok");
                              desenhar();
                            })
                            .catch((err: unknown) =>
                              avisar(
                                err instanceof Error ? err.message : "Falha.",
                                "erro",
                              ),
                            );
                        });
                      },
                    },
                  },
                  "Registrar solução definitiva",
                ),
              )
            : null,
        ),
      ),
    );
  };

  const formErro = (): HTMLElement => {
    const r: RascunhoErro = {
      sintoma: "",
      causa_raiz: "",
      contorno: "",
      solucao_definitiva: "",
      versao_afetada: "",
      custo_estimado_mes: "",
    };

    const area2 = (
      rotulo: string,
      chave: keyof RascunhoErro,
      placeholder: string,
      ajuda?: string,
    ): HTMLElement =>
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        h("textarea", {
          class: "area-texto",
          style: "min-height:80px",
          placeholder,
          on: {
            input: (ev: Event) => {
              r[chave] = (ev.target as HTMLTextAreaElement).value as never;
            },
          },
        }),
        ajuda ? h("div", { class: "campo__ajuda" }, ajuda) : null,
      );

    const botao = h(
      "button",
      { class: "btn btn--primario", type: "submit" },
      "Registrar erro conhecido",
    );

    return h(
      "form",
      {
        class: "cartao",
        on: {
          submit: (ev: Event) => {
            ev.preventDefault();
            if (
              r.sintoma.trim().length < 15 ||
              r.causa_raiz.trim().length < 15 ||
              r.contorno.trim().length < 15
            ) {
              return avisar(
                "Sintoma, causa raiz e contorno precisam de ao menos 15 caracteres cada.",
                "erro",
              );
            }
            botao.disabled = true;
            void criarErro(r, perfil)
              .then((novo) => {
                avisar(`${novo.codigo} registrado no KEDB.`, "ok");
                formAberto = false;
                desenhar();
              })
              .catch((e: unknown) => {
                avisar(e instanceof Error ? e.message : "Falha.", "erro");
                botao.disabled = false;
              });
          },
        },
      },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Novo erro conhecido"),
      ),
      area2(
        "Sintoma",
        "sintoma",
        "Ex.: ao emitir nota acima de R$ 50 mil, o ERP aplica o desconto da faixa anterior",
        "Escreva na linguagem em que o usuário relata — é a chave de busca da triagem.",
      ),
      area2("Causa raiz", "causa_raiz", "Diagnóstico técnico confirmado."),
      area2(
        "Contorno",
        "contorno",
        "Passo a passo que o N1 aplica agora, antes de existir correção.",
      ),
      area2(
        "Solução definitiva",
        "solucao_definitiva",
        "Deixe em branco enquanto não existir.",
      ),
      h(
        "div",
        { class: "grade-campos" },
        h(
          "div",
          { class: "campo" },
          h("label", { class: "campo__rotulo" }, "Versão afetada"),
          h("input", {
            class: "entrada",
            type: "text",
            on: {
              input: (ev: Event) => {
                r.versao_afetada = (ev.target as HTMLInputElement).value;
              },
            },
          }),
        ),
        h(
          "div",
          { class: "campo" },
          h(
            "label",
            { class: "campo__rotulo" },
            "Custo mensal do contorno (R$)",
          ),
          h("input", {
            class: "entrada",
            type: "number",
            placeholder: "horas gastas × custo/hora",
            on: {
              input: (ev: Event) => {
                r.custo_estimado_mes = (ev.target as HTMLInputElement).value;
              },
            },
          }),
          h(
            "div",
            { class: "campo__ajuda" },
            "É o argumento de orçamento para priorizar a correção definitiva.",
          ),
        ),
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

/* Auxiliares */

function seletor(
  opcoes: Array<[string, string]>,
  inicial: string,
  aoMudar: (v: string) => void,
): HTMLSelectElement {
  const s = h(
    "select",
    {
      class: "selecao",
      on: {
        change: (ev: Event) => aoMudar((ev.target as HTMLSelectElement).value),
      },
    },
    ...opcoes.map(([v, t]) => h("option", { value: v }, t)),
  ) as HTMLSelectElement;
  s.value = inicial;
  return s;
}

function def(rotulo: string, valor: string): HTMLElement {
  return h("div", {}, h("dt", {}, rotulo), h("dd", {}, valor));
}

function vazio(titulo: string, texto: string): HTMLElement {
  return h(
    "div",
    { class: "cartao" },
    h("div", { class: "vazio" }, h("h3", {}, titulo), h("p", {}, texto)),
  );
}

function classeArtigo(s: StatusArtigo): string {
  const mapa: Record<StatusArtigo, string> = {
    rascunho: "encerrado",
    em_revisao: "pausado",
    publicado: "resolvido",
    obsoleto: "encerrado",
  };
  return `selo selo--${mapa[s]}`;
}

function classeErro(s: StatusErro): string {
  const mapa: Record<StatusErro, string> = {
    identificado: "aberto",
    com_contorno: "pausado",
    em_correcao: "andamento",
    resolvido: "resolvido",
  };
  return `selo selo--${mapa[s]}`;
}
