/** Rotinas preventivas — catálogo, runbook e execução. */

import { criarFiltroData } from "@/components/filtro-data";
import { dentroDoPeriodo } from "@/lib/periodo";
import { aguardando } from "@/components/esqueleto";
import { avisar, h, montar } from "@/lib/dom";
import { perguntar } from "@/components/dialogo";
import { dataCurta, dataHora } from "@/lib/formato";
import { listarEquipes } from "@/lib/api";
import {
  adicionarPasso,
  agendarExecucao,
  alternarRotina,
  criarRotina,
  encerrarExecucao,
  iniciarExecucao,
  listarExecucoes,
  listarPassos,
  listarPassosExecutados,
  listarRotinas,
  marcarNaoExecutada,
  proximaData,
  registrarResultadoPasso,
  removerPasso,
  ROTULOS_PERIODICIDADE,
  ROTULOS_STATUS_EXECUCAO,
} from "@/lib/rotinas";
import { ROTULOS_CRITICIDADE } from "@/lib/cmdb";
import type {
  Criticidade,
  Equipe,
  ExecucaoEnriquecida,
  PassoExecutado,
  PassoRunbook,
  Perfil,
  Periodicidade,
  RascunhoRotina,
  ResultadoPasso,
  RotinaEnriquecida,
  StatusExecucao,
} from "@/types/dominio";

type Aba = "execucoes" | "catalogo";

export function renderizarRotinas(alvo: HTMLElement, perfil: Perfil): void {
  let aba: Aba = "execucoes";
  let formAberto = false;
  let rotinaAberta: string | null = null;
  let execucaoAberta: string | null = null;
  let equipes: Equipe[] = [];

  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  const periodo = criarFiltroData(() => desenhar(), { rotulo: "Execução" });

  const desenhar = (): void => {
    aguardando(area, "lista");
    void Promise.all([
      listarRotinas(),
      listarExecucoes(),
      equipes.length > 0 ? Promise.resolve(equipes) : listarEquipes(),
    ])
      .then(([rotinas, todasExecucoes, listaEquipes]) => {
        equipes = listaEquipes;
        // O recorte vale para a execução, não para o catálogo: rotina é
        // cadastro permanente, execução é o que acontece numa data.
        const execucoes = todasExecucoes.filter((e) =>
          dentroDoPeriodo(e.iniciada_em, periodo.valor()),
        );
        montar(
          area,
          metricas(rotinas, execucoes),
          abas(),
          formAberto ? formNovaRotina() : null,
          aba === "execucoes"
            ? painelExecucoes(execucoes, rotinas)
            : painelCatalogo(rotinas),
        );
      })
      .catch((e: unknown) =>
        avisar(e instanceof Error ? e.message : "Falha ao carregar.", "erro"),
      );
  };

  /* ---------- Cabeçalho ---------- */

  const metricas = (
    rotinas: RotinaEnriquecida[],
    execucoes: ExecucaoEnriquecida[],
  ): HTMLElement => {
    const hoje = new Date().toISOString().slice(0, 10);
    const pendentes = execucoes.filter((e) =>
      ["agendada", "em_execucao", "verificacao"].includes(e.status_execucao),
    );
    const atrasadas = pendentes.filter((e) => e.prevista_para < hoje).length;
    const noPeriodo = execucoes.filter((e) => e.status_execucao !== "agendada");
    const ok = noPeriodo.filter(
      (e) => e.status_execucao === "concluida_ok",
    ).length;
    const aderencia =
      noPeriodo.length === 0 ? null : Math.round((ok / noPeriodo.length) * 100);

    const cartao = (
      rotulo: string,
      valor: string,
      nota: string,
      variante = "",
    ): HTMLElement =>
      h(
        "div",
        { class: `metrica${variante ? ` metrica--${variante}` : ""}` },
        h("div", { class: "metrica__rotulo" }, rotulo),
        h("div", { class: "metrica__valor" }, valor),
        h("div", { class: "metrica__nota" }, nota),
      );

    return h(
      "div",
      { class: "grade-metricas" },
      cartao(
        "Rotinas ativas",
        String(rotinas.filter((r) => r.ativa).length),
        "no catálogo",
      ),
      cartao("Pendentes", String(pendentes.length), "aguardando execução"),
      cartao(
        "Em atraso",
        String(atrasadas),
        "passaram da data prevista",
        atrasadas > 0 ? "critica" : "ok",
      ),
      cartao(
        "Aderência",
        aderencia === null ? "—" : `${aderencia}%`,
        "meta de 97%",
        aderencia === null ? "" : aderencia >= 97 ? "ok" : "alerta",
      ),
    );
  };

  const abas = (): HTMLElement => {
    const botao = (valor: Aba, rotulo: string): HTMLElement =>
      h(
        "button",
        {
          class: `btn btn--sm${aba === valor ? " btn--primario" : ""}`,
          type: "button",
          on: {
            click: () => {
              aba = valor;
              desenhar();
            },
          },
        },
        rotulo,
      );

    return h(
      "div",
      { class: "grade-filtros" },
      periodo.elemento,
      botao("execucoes", "Execuções"),
      botao("catalogo", "Catálogo de rotinas"),
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
        formAberto ? "Cancelar" : "Nova rotina",
      ),
    );
  };

  /* ---------- Execuções ---------- */

  const painelExecucoes = (
    execucoes: ExecucaoEnriquecida[],
    rotinas: RotinaEnriquecida[],
  ): HTMLElement => {
    if (execucoes.length === 0) {
      return h(
        "div",
        { class: "cartao" },
        h(
          "div",
          { class: "vazio" },
          h("h3", {}, "Nenhuma execução agendada"),
          h(
            "p",
            {},
            rotinas.length === 0
              ? "Cadastre uma rotina no catálogo, escreva os passos do runbook e agende a primeira execução."
              : "Abra o catálogo e agende a próxima execução de uma das rotinas.",
          ),
        ),
      );
    }

    const hoje = new Date().toISOString().slice(0, 10);

    const linhas = execucoes.flatMap((e) => {
      const atrasada =
        e.prevista_para < hoje &&
        ["agendada", "em_execucao", "verificacao"].includes(e.status_execucao);

      const principal = h(
        "tr",
        {
          on: {
            click: () => {
              execucaoAberta = execucaoAberta === e.id ? null : e.id;
              desenhar();
            },
          },
        },
        h("td", { class: "tabela__num" }, e.rotina_codigo),
        h(
          "td",
          {},
          h("span", { class: "tabela__titulo" }, e.rotina_nome),
          h(
            "span",
            { class: "tabela__meta" },
            e.executor_nome ? `Executor: ${e.executor_nome}` : "sem executor",
          ),
        ),
        h(
          "td",
          {},
          h(
            "span",
            { class: `prazo ${atrasada ? "prazo--atrasado" : "prazo--ok"}` },
            dataCurta(e.prevista_para),
          ),
        ),
        h(
          "td",
          {},
          h(
            "span",
            { class: classeExecucao(e.status_execucao) },
            ROTULOS_STATUS_EXECUCAO[e.status_execucao],
          ),
        ),
        h(
          "td",
          {},
          e.chamado_gerado_id
            ? h("span", { class: "tag tag--critica" }, "incidente aberto")
            : h("span", { class: "texto-sutil" }, "—"),
        ),
      );

      if (execucaoAberta !== e.id) return [principal];
      return [principal, painelPassos(e)];
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
            h("th", {}, "Rotina"),
            h("th", {}, "Nome"),
            h("th", {}, "Prevista para"),
            h("th", {}, "Situação"),
            h("th", {}, "Consequência"),
          ),
        ),
        h("tbody", {}, ...linhas),
      ),
    );
  };

  /** Runbook em execução: um cartão por passo, com resultado marcável. */
  const painelPassos = (e: ExecucaoEnriquecida): HTMLElement => {
    const corpo = h("div", { class: "texto-sutil" }, "Carregando passos…");
    const encerrada = [
      "concluida_ok",
      "concluida_com_falha",
      "nao_executada",
    ].includes(e.status_execucao);

    void listarPassosExecutados(e.id)
      .then((passos) => montar(corpo, blocoPassos(e, passos, encerrada)))
      .catch(() =>
        montar(
          corpo,
          h("span", { class: "texto-sutil" }, "Falha ao carregar."),
        ),
      );

    return h(
      "tr",
      {},
      h("td", { colspan: 5, style: "background:var(--c-surface-2)" }, corpo),
    );
  };

  const blocoPassos = (
    e: ExecucaoEnriquecida,
    passos: PassoExecutado[],
    encerrada: boolean,
  ): HTMLElement => {
    if (passos.length === 0) {
      return h(
        "div",
        { class: "aviso aviso--alerta", style: "margin:0" },
        h("span", { class: "aviso__icone" }, "!"),
        h(
          "span",
          {},
          "Esta rotina não tinha passos de runbook quando a execução foi criada. Execução sem passo não é verificável — escreva o runbook e agende de novo.",
        ),
      );
    }

    const observacoes = h("textarea", {
      class: "area-texto",
      style: "min-height:70px",
      placeholder: "Observações da execução (opcional).",
    }) as HTMLTextAreaElement;
    observacoes.value = e.observacoes ?? "";

    const marcados = passos.filter((p) => p.resultado !== null).length;
    const comFalha = passos.filter((p) => p.resultado === "falha").length;

    return h(
      "div",
      { class: "pilha" },
      h(
        "div",
        { class: "linha-flex" },
        h("b", {}, `Runbook — ${marcados} de ${passos.length} passos marcados`),
        comFalha > 0
          ? h("span", { class: "tag tag--critica" }, `${comFalha} com falha`)
          : null,
        h("span", { class: "empurra" }),
        !encerrada && e.status_execucao === "agendada"
          ? h(
              "button",
              {
                class: "btn btn--primario btn--sm",
                type: "button",
                on: {
                  click: (ev: Event) => {
                    ev.stopPropagation();
                    void iniciarExecucao(e.id, perfil)
                      .then(() => {
                        avisar("Execução iniciada.", "ok");
                        desenhar();
                      })
                      .catch((err: unknown) =>
                        avisar(
                          err instanceof Error ? err.message : "Falha.",
                          "erro",
                        ),
                      );
                  },
                },
              },
              "Iniciar execução",
            )
          : null,
      ),

      ...passos.map((p) => cartaoPasso(p, encerrada)),

      encerrada
        ? h(
            "div",
            { class: "texto-sutil" },
            `Encerrada em ${dataHora(e.finalizada_em)}.` +
              (e.observacoes ? ` Observações: ${e.observacoes}` : ""),
          )
        : h(
            "div",
            { class: "pilha" },
            observacoes,
            h(
              "div",
              { class: "linha-flex" },
              h(
                "button",
                {
                  class: "btn btn--sm",
                  type: "button",
                  on: {
                    click: (ev: Event) => {
                      ev.stopPropagation();
                      void perguntar({
                        titulo: "Rotina não executada",
                        texto: `${e.rotina_codigo} — ${e.rotina_nome}`,
                        consequencia:
                          "Um incidente será aberto automaticamente, herdando a criticidade e os ativos da rotina.",
                        rotuloCampo: "Por que não foi executada",
                        placeholder:
                          "Ex.: janela de manutenção cancelada pelo fornecedor",
                        multilinha: true,
                        minimo: 5,
                        rotuloConfirmar: "Registrar e abrir incidente",
                        perigo: true,
                      }).then((motivo) => {
                        if (motivo === null) return;
                        void marcarNaoExecutada(e.id, motivo)
                          .then(() => {
                            avisar(
                              "Marcada como não executada. Incidente aberto.",
                              "ok",
                            );
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
                "Não foi executada",
              ),
              h("span", { class: "empurra" }),
              h(
                "button",
                {
                  class: "btn btn--primario",
                  type: "button",
                  on: {
                    click: (ev: Event) => {
                      ev.stopPropagation();
                      void encerrarExecucao(e.id, {
                        observacoes: observacoes.value,
                      })
                        .then((res) => {
                          avisar(
                            res.status_execucao === "concluida_com_falha"
                              ? "Encerrada com falha — um incidente foi aberto automaticamente."
                              : "Execução concluída sem falhas.",
                            res.status_execucao === "concluida_com_falha"
                              ? "erro"
                              : "ok",
                          );
                          desenhar();
                        })
                        .catch((err: unknown) =>
                          avisar(
                            err instanceof Error ? err.message : "Falha.",
                            "erro",
                          ),
                        );
                    },
                  },
                },
                "Encerrar execução",
              ),
            ),
          ),
    );
  };

  const cartaoPasso = (p: PassoExecutado, encerrada: boolean): HTMLElement => {
    const botaoResultado = (
      valor: ResultadoPasso,
      rotulo: string,
      classe: string,
    ): HTMLElement =>
      h(
        "button",
        {
          class: `btn btn--sm${p.resultado === valor ? ` ${classe}` : ""}`,
          type: "button",
          disabled: encerrada,
          on: {
            click: (ev: Event) => {
              ev.stopPropagation();
              void registrarResultadoPasso(p.id, valor)
                .then(desenhar)
                .catch((e: unknown) =>
                  avisar(e instanceof Error ? e.message : "Falha.", "erro"),
                );
            },
          },
        },
        rotulo,
      );

    return h(
      "div",
      { class: "cartao cartao--compacto" },
      h(
        "div",
        { class: "linha-flex" },
        h("span", { class: "mono texto-sutil" }, `${p.ordem}.`),
        h("span", { style: "flex:1;min-width:200px" }, p.instrucao),
        h("span", { class: "empurra" }),
        botaoResultado("ok", "OK", "btn--primario"),
        botaoResultado("falha", "Falha", "btn--perigo"),
        botaoResultado("nao_aplicavel", "N/A", ""),
      ),
      p.criterio_sucesso
        ? h(
            "div",
            { class: "campo__ajuda", style: "margin-top:4px" },
            `Critério: ${p.criterio_sucesso}`,
          )
        : null,
      p.resultado === "falha" && p.acao_se_falhar
        ? h(
            "div",
            { class: "aviso aviso--alerta", style: "margin:var(--s-2) 0 0" },
            h("span", { class: "aviso__icone" }, "!"),
            h("span", {}, h("b", {}, "Se falhar: "), p.acao_se_falhar),
          )
        : null,
    );
  };

  /* ---------- Catálogo ---------- */

  const painelCatalogo = (rotinas: RotinaEnriquecida[]): HTMLElement => {
    if (rotinas.length === 0) {
      return h(
        "div",
        { class: "cartao" },
        h(
          "div",
          { class: "vazio" },
          h("h3", {}, "Nenhuma rotina cadastrada"),
          h(
            "p",
            {},
            "Comece pelas conferências que hoje alguém faz de memória: backup, espaço em disco, certificados vencendo. Escrever o runbook é o que transforma conhecimento tácito em procedimento auditável.",
          ),
        ),
      );
    }

    return h(
      "div",
      { class: "pilha" },
      ...rotinas.map((r) =>
        h(
          "div",
          { class: "cartao" },
          h(
            "div",
            { class: "linha-flex" },
            h("span", { class: "mono texto-sutil" }, r.codigo),
            h("b", {}, r.nome),
            h(
              "span",
              { class: `tag tag--${classeCriticidade(r.criticidade)}` },
              ROTULOS_CRITICIDADE[r.criticidade],
            ),
            h("span", { class: "tag" }, ROTULOS_PERIODICIDADE[r.periodicidade]),
            r.exige_dupla_checagem
              ? h("span", { class: "tag tag--verde" }, "dupla checagem")
              : null,
            h("span", { class: "empurra" }),
            h(
              "span",
              { class: "texto-sutil" },
              `${r.total_passos} passo${r.total_passos === 1 ? "" : "s"}`,
            ),
            h(
              "button",
              {
                class: "btn btn--sm",
                type: "button",
                on: {
                  click: () => {
                    rotinaAberta = rotinaAberta === r.id ? null : r.id;
                    desenhar();
                  },
                },
              },
              rotinaAberta === r.id ? "Fechar" : "Runbook",
            ),
            h(
              "button",
              {
                class: "btn btn--primario btn--sm",
                type: "button",
                disabled: r.total_passos === 0,
                title:
                  r.total_passos === 0
                    ? "Escreva ao menos um passo antes de agendar"
                    : "Agenda a próxima execução",
                on: {
                  click: () => {
                    void agendarExecucao(r.id, proximaData(r.periodicidade))
                      .then((e) => {
                        avisar(
                          `Execução agendada para ${dataCurta(e.prevista_para)}.`,
                          "ok",
                        );
                        aba = "execucoes";
                        desenhar();
                      })
                      .catch((err: unknown) =>
                        avisar(
                          err instanceof Error ? err.message : "Falha.",
                          "erro",
                        ),
                      );
                  },
                },
              },
              "Agendar",
            ),
            h(
              "button",
              {
                class: "btn btn--sm",
                type: "button",
                on: {
                  click: () => {
                    void alternarRotina(r.id, !r.ativa)
                      .then(desenhar)
                      .catch((err: unknown) =>
                        avisar(
                          err instanceof Error ? err.message : "Falha.",
                          "erro",
                        ),
                      );
                  },
                },
              },
              r.ativa ? "Desativar" : "Reativar",
            ),
          ),
          h(
            "div",
            { class: "texto-sutil", style: "margin-top:var(--s-2)" },
            r.descricao,
          ),
          rotinaAberta === r.id ? editorRunbook(r) : null,
        ),
      ),
    );
  };

  const editorRunbook = (r: RotinaEnriquecida): HTMLElement => {
    const container = h(
      "div",
      { class: "pilha", style: "margin-top:var(--s-4)" },
      h("span", { class: "texto-sutil" }, "Carregando runbook…"),
    );

    const recarregar = (): void => {
      void listarPassos(r.id)
        .then((passos) =>
          montar(container, ...blocoRunbook(r, passos, recarregar)),
        )
        .catch(() =>
          montar(container, h("span", { class: "texto-sutil" }, "Falha.")),
        );
    };
    recarregar();

    return container;
  };

  const blocoRunbook = (
    r: RotinaEnriquecida,
    passos: PassoRunbook[],
    recarregar: () => void,
  ): HTMLElement[] => {
    const instrucao = h("input", {
      class: "entrada",
      type: "text",
      placeholder: "Ex.: Conferir se o job de backup do ERP terminou sem erro",
    }) as HTMLInputElement;
    const criterio = h("input", {
      class: "entrada",
      type: "text",
      placeholder: "Critério de sucesso — como saber que passou",
    }) as HTMLInputElement;
    const seFalhar = h("input", {
      class: "entrada",
      type: "text",
      placeholder: "O que fazer se falhar",
    }) as HTMLInputElement;

    return [
      h("h4", { style: "margin:0" }, `Runbook de ${r.codigo}`),
      ...(passos.length === 0
        ? [
            h(
              "p",
              { class: "texto-sutil" },
              "Nenhum passo ainda. Sem passos, a execução não é verificável e o agendamento fica bloqueado.",
            ),
          ]
        : passos.map((p) =>
            h(
              "div",
              { class: "cartao cartao--compacto" },
              h(
                "div",
                { class: "linha-flex" },
                h("span", { class: "mono texto-sutil" }, `${p.ordem}.`),
                h("span", { style: "flex:1;min-width:200px" }, p.instrucao),
                h(
                  "button",
                  {
                    class: "btn btn--sutil btn--sm",
                    type: "button",
                    on: {
                      click: () => {
                        void removerPasso(p.id)
                          .then(recarregar)
                          .catch((e: unknown) =>
                            avisar(
                              e instanceof Error ? e.message : "Falha.",
                              "erro",
                            ),
                          );
                      },
                    },
                  },
                  "Remover",
                ),
              ),
              p.criterio_sucesso
                ? h(
                    "div",
                    { class: "campo__ajuda" },
                    `Critério: ${p.criterio_sucesso}`,
                  )
                : null,
            ),
          )),
      h(
        "div",
        { class: "grade-campos" },
        h("div", { class: "campo" }, instrucao),
        h("div", { class: "campo" }, criterio),
        h("div", { class: "campo" }, seFalhar),
      ),
      h(
        "button",
        {
          class: "btn btn--sm",
          type: "button",
          on: {
            click: () => {
              if (instrucao.value.trim().length < 5) {
                return avisar(
                  "Descreva o passo com ao menos 5 caracteres.",
                  "erro",
                );
              }
              void adicionarPasso(r.id, {
                instrucao: instrucao.value,
                criterio_sucesso: criterio.value,
                acao_se_falhar: seFalhar.value,
              })
                .then(() => {
                  instrucao.value = "";
                  criterio.value = "";
                  seFalhar.value = "";
                  recarregar();
                  desenhar();
                })
                .catch((e: unknown) =>
                  avisar(e instanceof Error ? e.message : "Falha.", "erro"),
                );
            },
          },
        },
        "Adicionar passo",
      ),
    ];
  };

  /* ---------- Nova rotina ---------- */

  const formNovaRotina = (): HTMLElement => {
    const rascunho: RascunhoRotina = {
      nome: "",
      descricao: "",
      criticidade: "medio",
      periodicidade: "mensal",
      janela_inicio: "00:00",
      janela_fim: "06:00",
      duracao_estimada_min: "",
      equipe_id: "",
      exige_evidencia: false,
      exige_dupla_checagem: false,
    };

    const campoTexto = (
      rotulo: string,
      chave: keyof RascunhoRotina,
      tipoCampo = "text",
    ): HTMLElement =>
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        h("input", {
          class: "entrada",
          type: tipoCampo,
          value: String(rascunho[chave] ?? ""),
          on: {
            input: (ev: Event) => {
              rascunho[chave] = (ev.target as HTMLInputElement).value as never;
            },
          },
        }),
      );

    const marcar = (rotulo: string, chave: keyof RascunhoRotina): HTMLElement =>
      h(
        "label",
        { class: "escolha" },
        h("input", {
          type: "checkbox",
          on: {
            change: (ev: Event) => {
              rascunho[chave] = (ev.target as HTMLInputElement)
                .checked as never;
            },
          },
        }),
        h("span", {}, h("span", { class: "escolha__titulo" }, rotulo)),
      );

    const selPeriodo = h(
      "select",
      {
        class: "selecao",
        on: {
          change: (ev: Event) => {
            rascunho.periodicidade = (ev.target as HTMLSelectElement)
              .value as Periodicidade;
          },
        },
      },
      ...(Object.keys(ROTULOS_PERIODICIDADE) as Periodicidade[]).map((p) =>
        h("option", { value: p }, ROTULOS_PERIODICIDADE[p]),
      ),
    ) as HTMLSelectElement;
    selPeriodo.value = "mensal";

    const selCrit = h(
      "select",
      {
        class: "selecao",
        on: {
          change: (ev: Event) => {
            rascunho.criticidade = (ev.target as HTMLSelectElement)
              .value as Criticidade;
          },
        },
      },
      ...(Object.keys(ROTULOS_CRITICIDADE) as Criticidade[]).map((c) =>
        h("option", { value: c }, ROTULOS_CRITICIDADE[c]),
      ),
    ) as HTMLSelectElement;
    selCrit.value = "medio";

    const selEquipe = h(
      "select",
      {
        class: "selecao",
        on: {
          change: (ev: Event) => {
            rascunho.equipe_id = (ev.target as HTMLSelectElement).value;
          },
        },
      },
      h("option", { value: "" }, "Sem equipe"),
      ...equipes.map((e) => h("option", { value: e.id }, e.nome)),
    ) as HTMLSelectElement;

    const descricao = h("textarea", {
      class: "area-texto",
      placeholder:
        "O que esta rotina previne e por que ela existe. Se ninguém souber o porquê, ela vira ritual.",
      on: {
        input: (ev: Event) => {
          rascunho.descricao = (ev.target as HTMLTextAreaElement).value;
        },
      },
    });

    const botao = h(
      "button",
      { class: "btn btn--primario", type: "submit" },
      "Cadastrar rotina",
    );

    return h(
      "form",
      {
        class: "cartao",
        on: {
          submit: (ev: Event) => {
            ev.preventDefault();
            if (rascunho.nome.trim().length < 5) {
              return avisar("O nome precisa de ao menos 5 caracteres.", "erro");
            }
            if (rascunho.descricao.trim().length < 10) {
              return avisar("Descreva o que a rotina previne.", "erro");
            }
            botao.disabled = true;
            void criarRotina(rascunho, perfil)
              .then((nova) => {
                avisar(
                  `${nova.codigo} cadastrada. Agora escreva os passos do runbook.`,
                  "ok",
                );
                formAberto = false;
                aba = "catalogo";
                rotinaAberta = nova.id;
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
        h("span", { class: "cartao__titulo" }, "Nova rotina preventiva"),
      ),
      campoTexto("Nome", "nome"),
      h("div", { class: "campo" }, descricao),
      h(
        "div",
        { class: "grade-campos" },
        h(
          "div",
          { class: "campo" },
          h("label", { class: "campo__rotulo" }, "Periodicidade"),
          selPeriodo,
        ),
        h(
          "div",
          { class: "campo" },
          h("label", { class: "campo__rotulo" }, "Criticidade"),
          selCrit,
        ),
        h(
          "div",
          { class: "campo" },
          h("label", { class: "campo__rotulo" }, "Equipe"),
          selEquipe,
        ),
      ),
      h(
        "div",
        { class: "grade-campos" },
        campoTexto("Janela — início", "janela_inicio", "time"),
        campoTexto("Janela — fim", "janela_fim", "time"),
        campoTexto("Duração estimada (min)", "duracao_estimada_min", "number"),
      ),
      h(
        "div",
        { class: "escolhas" },
        marcar("Exige evidência anexada", "exige_evidencia"),
        marcar(
          "Exige dupla checagem — conferente diferente do executor",
          "exige_dupla_checagem",
        ),
      ),
      h(
        "div",
        { class: "linha-flex", style: "margin-top:var(--s-4)" },
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

function classeExecucao(s: StatusExecucao): string {
  const mapa: Record<StatusExecucao, string> = {
    agendada: "aberto",
    em_execucao: "andamento",
    verificacao: "andamento",
    concluida_ok: "resolvido",
    concluida_com_falha: "pausado",
    nao_executada: "pausado",
  };
  return `selo selo--${mapa[s]}`;
}

function classeCriticidade(c: Criticidade): string {
  return c === "critico"
    ? "critica"
    : c === "alto"
      ? "alta"
      : c === "medio"
        ? "media"
        : "baixa";
}
