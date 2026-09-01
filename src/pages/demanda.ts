/** Detalhe da demanda — cronograma, progresso, comentários e menções. */

import { aguardando } from "@/components/esqueleto";
import { corDaTag } from "@/lib/api";
import { avisar, h, icone, ICONES, montar } from "@/lib/dom";
import { navegar } from "@/lib/router";
import { dataCurta, dataHora } from "@/lib/formato";
import { listarDiretorioMencoes } from "@/lib/api";
import {
  adicionarItem,
  adicionarParametro,
  alternarItem,
  assumirDemanda,
  atualizarDemanda,
  comentar,
  listarItens,
  removerItem,
  removerParametro,
  diasRestantes,
  excluirDemanda,
  liberarDemanda,
  listarComentarios,
  listarParametros,
  listarParametrosSugeridos,
  obterDemanda,
  podeEditar,
  podeExcluir,
  restaurarDemanda,
  ROTULOS_PRIORIDADE,
  ROTULOS_STATUS_DEMANDA,
  ROTULOS_TIPO,
  ROTULOS_TIPO_PARAMETRO,
} from "@/lib/demandas";
import { criarCampoMencao } from "@/components/campo-mencao";
import { insigniaHierarquia, nomeComInsignia } from "@/components/insignia";
import { renderizarTexto } from "@/components/texto-mencao";
import { confirmar, perguntar } from "@/components/dialogo";
import {
  barraProgresso,
  classeStatusDemanda,
  seloPrazo,
} from "@/pages/demandas";
import type {
  ComentarioDemanda,
  DemandaEnriquecida,
  ItemDemandaEnriquecido,
  ParametroEnriquecido,
  ParametroSugerido,
  Perfil,
  PessoaMencao,
  PrioridadeDemanda,
  StatusDemanda,
  TipoDemanda,
} from "@/types/dominio";

const TRANSICOES: Array<[StatusDemanda, string]> = [
  ["refinamento", "Enviar para refinamento"],
  ["disponivel", "Publicar como disponível"],
  ["em_andamento", "Retomar trabalho"],
  ["revisao", "Enviar para revisão"],
  ["bloqueada", "Bloquear"],
  ["concluida", "Concluir"],
  ["cancelada", "Cancelar"],
];

export function renderizarDemanda(
  alvo: HTMLElement,
  perfil: Perfil,
  codigo: string,
): void {
  const area = h("div", {});
  montar(alvo, area);
  aguardando(area, "ficha");

  let diretorio: PessoaMencao[] = [];
  let editando = false;

  let itens: ItemDemandaEnriquecido[] = [];
  let parametros: ParametroEnriquecido[] = [];
  let sugestoesParam: ParametroSugerido[] = [];

  const recarregar = (): void => {
    void obterDemanda(codigo)
      .then(async (demanda) => {
        if (!demanda) return [null, []] as const;
        const [comentarios, pessoas, lista, params, sugestoes] =
          await Promise.all([
            listarComentarios(demanda.id),
            diretorio.length > 0
              ? Promise.resolve(diretorio)
              : listarDiretorioMencoes(),
            listarItens(demanda.id),
            listarParametros(demanda.id),
            sugestoesParam.length > 0
              ? Promise.resolve(sugestoesParam)
              : listarParametrosSugeridos(),
          ]);
        diretorio = pessoas;
        itens = lista;
        parametros = params;
        sugestoesParam = sugestoes;
        return [demanda, comentarios] as const;
      })
      .then(([demanda, comentarios]) => {
        if (!demanda) {
          montar(
            area,
            h(
              "div",
              { class: "cartao" },
              h(
                "div",
                { class: "vazio" },
                h("h3", {}, "Demanda não encontrada"),
                h("p", {}, `Nenhuma demanda com o código ${codigo}.`),
                h(
                  "button",
                  {
                    class: "btn",
                    type: "button",
                    on: { click: () => navegar("demandas") },
                  },
                  "Voltar ao quadro",
                ),
              ),
            ),
          );
          return;
        }
        desenhar(demanda, comentarios);
      })
      .catch((e: unknown) => {
        avisar(
          e instanceof Error ? e.message : "Falha ao carregar a demanda.",
          "erro",
        );
      });
  };

  const desenhar = (
    d: DemandaEnriquecida,
    comentarios: ComentarioDemanda[],
  ): void => {
    const minha = d.responsavel_id === perfil.id;
    const livre = d.status === "disponivel" && !d.responsavel_id;
    const encerrada = d.status === "concluida" || d.status === "cancelada";

    /* ---- Coluna principal ---- */

    const descricao = h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Descrição"),
        h(
          "span",
          { class: "texto-sutil empurra" },
          `Registrada por ${d.solicitante_nome}`,
        ),
      ),
      h("p", { style: "white-space:pre-wrap;line-height:1.6" }, d.descricao),
      d.tags.length > 0
        ? h(
            "div",
            { class: "tags__linha", style: "margin-top:var(--s-3)" },
            ...d.tags.map((tag) =>
              h(
                "span",
                {
                  class: "tags__marca",
                  dataset: { cor: corDaTag(tag) },
                },
                tag,
              ),
            ),
          )
        : null,
      d.criterios_aceite
        ? h(
            "div",
            { style: "margin-top:var(--s-4)" },
            h("h4", { style: "margin:0 0 6px" }, "Critérios de aceite"),
            h(
              "p",
              { style: "white-space:pre-wrap;line-height:1.6" },
              d.criterios_aceite,
            ),
          )
        : null,
    );

    const bloqueio =
      d.status === "bloqueada" && d.motivo_bloqueio
        ? h(
            "div",
            { class: "aviso aviso--alerta" },
            h("span", { class: "aviso__icone" }, "!"),
            h("span", {}, h("b", {}, "Bloqueada. "), d.motivo_bloqueio),
          )
        : null;

    const campoComentario = criarCampoMencao(diretorio, {
      placeholder:
        "Comente o andamento, peça ajuda ou combine a entrega. Use @ para chamar alguém.",
    });

    const botaoComentar = h(
      "button",
      { class: "btn btn--primario", type: "button" },
      "Publicar comentário",
    );

    botaoComentar.addEventListener("click", () => {
      const corpo = campoComentario.valor();
      if (corpo.length < 3) {
        avisar("Escreva o comentário antes de publicar.", "erro");
        return;
      }
      botaoComentar.disabled = true;
      void comentar(d.id, corpo, campoComentario.mencionados(), perfil)
        .then((novo) => {
          avisar(
            novo.mencionados.length > 0
              ? `Comentário publicado e ${novo.mencionados.length} pessoa${novo.mencionados.length > 1 ? "s notificadas" : " notificada"}.`
              : "Comentário publicado.",
            "ok",
          );
          campoComentario.limpar();
          recarregar();
        })
        .catch((e: unknown) => {
          avisar(e instanceof Error ? e.message : "Falha ao comentar.", "erro");
          botaoComentar.disabled = false;
        });
    });

    const discussao = h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Discussão"),
        h(
          "span",
          { class: "texto-sutil empurra" },
          `${comentarios.length} comentário${comentarios.length === 1 ? "" : "s"}`,
        ),
      ),
      comentarios.length === 0
        ? h(
            "p",
            { class: "texto-sutil" },
            "Nenhum comentário ainda. Combine aqui o que precisa ser feito — fica registrado junto da demanda.",
          )
        : h(
            "div",
            { class: "linha" },
            ...comentarios.map((c) =>
              h(
                "div",
                { class: "linha__item linha__item--publica" },
                h(
                  "div",
                  { class: "linha__cabecalho" },
                  h(
                    "span",
                    { class: "linha__autor" },
                    nomeComInsignia(c.autor_nome, c.autor_hierarquia),
                  ),
                  c.autor_hierarquia !== "colaborador"
                    ? insigniaHierarquia(c.autor_hierarquia, {
                        comRotulo: true,
                      })
                    : null,
                  c.mencionados.length > 0
                    ? h(
                        "span",
                        { class: "linha__marca" },
                        `${c.mencionados.length} menção${c.mencionados.length > 1 ? "ões" : ""}`,
                      )
                    : null,
                  h("span", { class: "linha__quando" }, dataHora(c.criado_em)),
                ),
                renderizarTexto(c.corpo, diretorio, {
                  aoAbrirRegistro: navegar,
                }),
              ),
            ),
          ),
      encerrada
        ? null
        : h(
            "div",
            { style: "margin-top:var(--s-4)" },
            campoComentario.elemento,
            h(
              "div",
              { class: "linha-flex", style: "margin-top:var(--s-2)" },
              h("span", { class: "empurra" }),
              botaoComentar,
            ),
          ),
    );

    /* ---- Coluna lateral ---- */

    const acoes = h("div", { class: "pilha" });

    if (livre) {
      acoes.append(
        h(
          "button",
          {
            class: "btn btn--primario btn--bloco",
            type: "button",
            on: {
              click: (ev: Event) => {
                const b = ev.currentTarget as HTMLButtonElement;
                b.disabled = true;
                void assumirDemanda(d.id, perfil)
                  .then(() => {
                    avisar(
                      `Demanda assumida. Entrega prevista para ${d.data_fim_prevista ? dataCurta(d.data_fim_prevista) : "data a definir"}.`,
                      "ok",
                    );
                    recarregar();
                  })
                  .catch((e: unknown) => {
                    avisar(
                      e instanceof Error ? e.message : "Falha ao assumir.",
                      "erro",
                    );
                    b.disabled = false;
                  });
              },
            },
          },
          "Pegar esta demanda",
        ),
      );
    }

    if (minha && !encerrada) {
      acoes.append(
        controleProgresso(d, itens.length, recarregar),
        h(
          "button",
          {
            class: "btn btn--bloco",
            type: "button",
            on: {
              click: () => {
                void liberarDemanda(d.id)
                  .then(() => {
                    avisar("Demanda devolvida ao quadro.", "ok");
                    recarregar();
                  })
                  .catch((e: unknown) => {
                    avisar(
                      e instanceof Error ? e.message : "Falha ao liberar.",
                      "erro",
                    );
                  });
              },
            },
          },
          "Devolver ao quadro",
        ),
      );
    }

    const transicoesDisponiveis = TRANSICOES.filter(([s]) => s !== d.status);
    if (!encerrada && (minha || perfil.papel !== "solicitante")) {
      acoes.append(seletorStatus(d, transicoesDisponiveis, recarregar));
    }

    if (podeEditar(d, perfil) && !d.excluida_em) {
      acoes.append(
        h(
          "button",
          {
            class: "btn btn--bloco",
            type: "button",
            on: {
              click: () => {
                editando = !editando;
                recarregar();
              },
            },
          },
          editando ? "Cancelar edição" : "Corrigir dados",
        ),
      );
    }

    const exclusao = podeExcluir(d, perfil);
    if (!d.excluida_em) {
      acoes.append(
        h(
          "button",
          {
            class: "btn btn--perigo btn--bloco",
            type: "button",
            disabled: !exclusao.pode,
            title: exclusao.motivo || "Remove das listas, mantendo o registro",
            on: { click: () => pedirExclusao(d) },
          },
          icone(ICONES.excluir),
          "Excluir demanda",
        ),
      );

      if (!exclusao.pode) {
        acoes.append(h("div", { class: "campo__ajuda" }, exclusao.motivo));
      }
    } else if (
      perfil.papel === "admin" ||
      perfil.hierarquia !== "colaborador"
    ) {
      acoes.append(
        h(
          "button",
          {
            class: "btn btn--primario btn--bloco",
            type: "button",
            on: {
              click: () => {
                void restaurarDemanda(d.id)
                  .then(() => {
                    avisar("Demanda restaurada ao quadro.", "ok");
                    recarregar();
                  })
                  .catch((e: unknown) =>
                    avisar(
                      e instanceof Error ? e.message : "Falha ao restaurar.",
                      "erro",
                    ),
                  );
              },
            },
          },
          "Restaurar ao quadro",
        ),
      );
    }

    const dias = diasRestantes(d.data_fim_prevista);

    const lateral = h(
      "div",
      { class: "pilha" },
      h(
        "div",
        { class: "cartao" },
        h(
          "div",
          { class: "cartao__cabecalho" },
          h("span", { class: "cartao__titulo" }, "Entrega"),
          h(
            "span",
            { class: `tag tag--${d.prioridade} empurra` },
            ROTULOS_PRIORIDADE[d.prioridade],
          ),
        ),
        barraProgresso(d.percentual),
        h("div", { style: "margin-top:var(--s-3)" }, seloPrazo(d)),
        dias !== null && dias >= 0 && d.percentual < 100
          ? h(
              "p",
              { class: "texto-sutil", style: "margin-top:var(--s-2)" },
              `Faltam ${dias} ${dias === 1 ? "dia" : "dias"} e ${100 - d.percentual}% de trabalho.`,
            )
          : null,
      ),
      acoes.childElementCount > 0
        ? h(
            "div",
            { class: "cartao" },
            h(
              "div",
              { class: "cartao__cabecalho" },
              h("span", { class: "cartao__titulo" }, "Ações"),
            ),
            acoes,
          )
        : null,
      h(
        "div",
        { class: "cartao" },
        h(
          "div",
          { class: "cartao__cabecalho" },
          h("span", { class: "cartao__titulo" }, "Ficha"),
        ),
        h(
          "dl",
          { class: "definicoes" },
          def(
            "Situação",
            h(
              "span",
              { class: classeStatusDemanda(d.status) },
              ROTULOS_STATUS_DEMANDA[d.status],
            ),
          ),
          def("Tipo", ROTULOS_TIPO[d.tipo]),
          def("Área", d.area ?? "—"),
          def("Setor solicitante", d.setor_nome ?? "não informado"),
          def(
            "Registrada por",
            nomeComInsignia(d.solicitante_nome, d.solicitante_hierarquia),
          ),
          def(
            "Responsável",
            d.responsavel_nome && d.responsavel_hierarquia
              ? nomeComInsignia(d.responsavel_nome, d.responsavel_hierarquia)
              : "livre para pegar",
          ),
          def("Início previsto", dataCurta(d.data_inicio_prevista)),
          def("Entrega prevista", dataCurta(d.data_fim_prevista)),
          d.data_inicio_real
            ? def("Início real", dataCurta(d.data_inicio_real))
            : null,
          d.data_fim_real
            ? def("Entrega real", dataCurta(d.data_fim_real))
            : null,
          d.esforco_horas !== null
            ? def("Esforço estimado", `${d.esforco_horas} h`)
            : null,
          d.depende_de_codigo ? def("Depende de", d.depende_de_codigo) : null,
          def("Registrada em", dataHora(d.criado_em)),
        ),
      ),
    );

    montar(
      area,
      h(
        "div",
        { class: "linha-flex", style: "margin-bottom:var(--s-4)" },
        h(
          "button",
          {
            class: "btn btn--sutil btn--sm",
            type: "button",
            on: { click: () => navegar("demandas") },
          },
          "← Voltar",
        ),
        h("span", { class: "mono texto-sutil" }, d.codigo),
        h("span", { class: "tag tag--verde" }, ROTULOS_TIPO[d.tipo]),
      ),
      h("h2", { style: "margin-bottom:var(--s-5)" }, d.titulo),
      d.excluida_em ? avisoExcluida(d) : null,
      bloqueio,
      h(
        "div",
        { class: "grade-2" },
        h(
          "div",
          { class: "pilha" },
          editando ? formCorrecao(d) : null,
          descricao,
          listaVerificacao(d),
          blocoParametros(d),
          discussao,
        ),
        lateral,
      ),
    );
  };

  /* ---------- Lista de verificação ---------- */

  /** O percentual é consequência desta lista, não um número arrastado à mão. */
  const listaVerificacao = (d: DemandaEnriquecida): HTMLElement => {
    const encerrada = d.status === "concluida" || d.status === "cancelada";
    const podeMexer =
      !encerrada &&
      !d.excluida_em &&
      (d.solicitante_id === perfil.id ||
        d.responsavel_id === perfil.id ||
        perfil.papel !== "solicitante");

    const feitos = itens.filter((i) => i.concluido).length;

    const descricaoNova = h("input", {
      class: "entrada",
      type: "text",
      placeholder: "O que precisa ser feito neste passo",
    }) as HTMLInputElement;

    const observacaoNova = h("input", {
      class: "entrada",
      type: "text",
      placeholder: "Observação (opcional)",
    }) as HTMLInputElement;

    const adicionar = (): void => {
      if (descricaoNova.value.trim().length < 3) {
        avisar("Descreva o item com ao menos 3 caracteres.", "erro");
        return;
      }
      void adicionarItem(
        d.id,
        descricaoNova.value,
        observacaoNova.value,
        perfil,
      )
        .then(() => {
          descricaoNova.value = "";
          observacaoNova.value = "";
          recarregar();
        })
        .catch((e: unknown) =>
          avisar(
            e instanceof Error ? e.message : "Falha ao adicionar.",
            "erro",
          ),
        );
    };

    descricaoNova.addEventListener("keydown", (ev) => {
      if ((ev as KeyboardEvent).key === "Enter") {
        ev.preventDefault();
        adicionar();
      }
    });

    return h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Lista de verificação"),
        itens.length > 0
          ? h(
              "span",
              { class: "texto-sutil" },
              `${feitos} de ${itens.length} · ${d.percentual}%`,
            )
          : null,
        h(
          "span",
          { class: "texto-sutil empurra" },
          itens.length > 0
            ? "O progresso vem daqui"
            : "Sem itens, o progresso é manual",
        ),
      ),

      itens.length === 0
        ? h(
            "p",
            { class: "texto-sutil" },
            "Nenhum item ainda. Ao adicionar o primeiro, o percentual passa a ser calculado automaticamente — marcar metade dos itens marca 50%.",
          )
        : h(
            "div",
            { class: "verificacao" },
            ...itens.map((i) => itemVerificacao(i, podeMexer)),
          ),

      podeMexer
        ? h(
            "div",
            { style: "margin-top:var(--s-3)" },
            h(
              "div",
              { class: "grade-campos" },
              h("div", { class: "campo" }, descricaoNova),
              h("div", { class: "campo" }, observacaoNova),
            ),
            h(
              "div",
              { class: "linha-flex" },
              h("span", { class: "texto-sutil" }, "Enter adiciona o item."),
              h("span", { class: "empurra" }),
              h(
                "button",
                {
                  class: "btn btn--sm",
                  type: "button",
                  on: { click: adicionar },
                },
                "Adicionar item",
              ),
            ),
          )
        : null,
    );
  };

  const itemVerificacao = (
    i: ItemDemandaEnriquecido,
    podeMexer: boolean,
  ): HTMLElement =>
    h(
      "div",
      {
        class: `verificacao__item${i.concluido ? " verificacao__item--feito" : ""}`,
      },
      h("input", {
        type: "checkbox",
        class: "verificacao__marca",
        checked: i.concluido,
        disabled: !podeMexer,
        aria: { label: i.descricao },
        on: {
          change: (ev: Event) => {
            const marcado = (ev.target as HTMLInputElement).checked;
            void alternarItem(i.id, marcado)
              .then(recarregar)
              .catch((e: unknown) => {
                avisar(e instanceof Error ? e.message : "Falha.", "erro");
                recarregar();
              });
          },
        },
      }),
      h(
        "div",
        { style: "min-width:0" },
        h("div", { class: "verificacao__texto" }, i.descricao),
        i.observacao
          ? h("div", { class: "verificacao__obs" }, i.observacao)
          : null,
        i.concluido && i.concluido_por_nome
          ? h(
              "div",
              { class: "verificacao__quem" },
              `concluído por ${i.concluido_por_nome} em ${dataCurta(i.concluido_em)}`,
            )
          : null,
      ),
      podeMexer
        ? h(
            "button",
            {
              class: "msg__excluir",
              type: "button",
              title: "Remover item",
              style: "opacity:.6",
              on: {
                click: () => {
                  void removerItem(i.id)
                    .then(recarregar)
                    .catch((e: unknown) =>
                      avisar(e instanceof Error ? e.message : "Falha.", "erro"),
                    );
                },
              },
            },
            icone(ICONES.fechar),
          )
        : null,
    );

  /* ---------- Parâmetros livres ---------- */

  /** Prioridade, tipo e datas são o esqueleto fixo da demanda. */
  const blocoParametros = (d: DemandaEnriquecida): HTMLElement => {
    const podeMexer = !d.excluida_em;

    const rotulo = h("input", {
      class: "entrada",
      type: "text",
      placeholder: "Nome do parâmetro",
      aria: { label: "Nome do parâmetro" },
    }) as HTMLInputElement;

    // Sugestões do vocabulário já usado, para o nome não derivar entre
    // demandas — mesma lição da normalização de tags.
    const sugestoes = h(
      "datalist",
      { id: "lista-parametros" },
      ...sugestoesParam.map((sp) =>
        h("option", { value: sp.rotulo }, sp.usos + " uso(s)"),
      ),
    );
    rotulo.setAttribute("list", "lista-parametros");

    const valor = h("input", {
      class: "entrada",
      type: "text",
      placeholder: "Valor",
      aria: { label: "Valor do parâmetro" },
    }) as HTMLInputElement;

    const tipo = h(
      "select",
      { class: "selecao", aria: { label: "Tipo do parâmetro" } },
      ...(
        Object.keys(ROTULOS_TIPO_PARAMETRO) as ParametroEnriquecido["tipo"][]
      ).map((t) => h("option", { value: t }, ROTULOS_TIPO_PARAMETRO[t])),
    ) as HTMLSelectElement;

    // O campo de valor acompanha o tipo: data abre calendário, número
    // recusa letra.
    const ajustarValor = (): void => {
      const t = tipo.value;
      valor.type = t === "data" ? "date" : t === "numero" ? "number" : "text";
      valor.placeholder =
        t === "booleano" ? "sim ou não" : t === "data" ? "" : "Valor";
    };
    tipo.addEventListener("change", ajustarValor);

    // Escolher um parâmetro conhecido já traz o tipo certo junto.
    rotulo.addEventListener("change", () => {
      const conhecido = sugestoesParam.find(
        (sp) => sp.rotulo.toLowerCase() === rotulo.value.trim().toLowerCase(),
      );
      if (conhecido) {
        tipo.value = conhecido.tipo;
        ajustarValor();
      }
    });

    const adicionar = (): void => {
      if (rotulo.value.trim().length < 2) {
        avisar("Dê um nome ao parâmetro.", "erro");
        return;
      }
      if (!valor.value.trim()) {
        avisar("Informe o valor do parâmetro.", "erro");
        return;
      }

      void adicionarParametro(
        d.id,
        {
          rotulo: rotulo.value,
          tipo: tipo.value as ParametroEnriquecido["tipo"],
          valor: valor.value,
        },
        perfil,
      )
        .then(() => {
          rotulo.value = "";
          valor.value = "";
          sugestoesParam = [];
          recarregar();
        })
        .catch((e: unknown) =>
          avisar(
            e instanceof Error ? e.message : "Falha ao adicionar.",
            "erro",
          ),
        );
    };

    valor.addEventListener("keydown", (ev) => {
      if ((ev as KeyboardEvent).key === "Enter") {
        ev.preventDefault();
        adicionar();
      }
    });

    return h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Parâmetros"),
        h(
          "span",
          { class: "texto-sutil empurra" },
          parametros.length > 0
            ? parametros.length +
                " definido" +
                (parametros.length === 1 ? "" : "s")
            : "Qualquer colaborador pode acrescentar",
        ),
      ),

      parametros.length === 0
        ? h(
            "p",
            { class: "texto-sutil" },
            "Nenhum parâmetro ainda. Use para o que não cabe nos campos fixos — ambiente, versão alvo, risco, custo estimado.",
          )
        : h(
            "dl",
            { class: "parametros" },
            ...parametros.map((pr) => itemParametro(pr, podeMexer)),
          ),

      podeMexer
        ? h(
            "div",
            { style: "margin-top:var(--s-3)" },
            sugestoes,
            h(
              "div",
              { class: "grade-campos" },
              h("div", { class: "campo" }, rotulo),
              h("div", { class: "campo" }, tipo),
              h("div", { class: "campo" }, valor),
            ),
            h(
              "div",
              { class: "linha-flex" },
              h(
                "span",
                { class: "texto-sutil" },
                "O nome é normalizado: Ambiente Alvo e ambiente alvo são o mesmo parâmetro.",
              ),
              h("span", { class: "empurra" }),
              h(
                "button",
                {
                  class: "btn btn--sm",
                  type: "button",
                  on: { click: adicionar },
                },
                "Adicionar parâmetro",
              ),
            ),
          )
        : null,
    );
  };

  const itemParametro = (
    pr: ParametroEnriquecido,
    podeMexer: boolean,
  ): HTMLElement => {
    const meu = pr.criado_por === perfil.id;
    const podeRemover =
      podeMexer &&
      (meu || perfil.papel === "admin" || perfil.hierarquia !== "colaborador");

    return h(
      "div",
      { class: "parametros__item" },
      h(
        "dt",
        {},
        pr.rotulo,
        h(
          "span",
          { class: "parametros__tipo" },
          ROTULOS_TIPO_PARAMETRO[pr.tipo],
        ),
      ),
      h(
        "dd",
        {},
        h("span", { class: "parametros__valor" }, pr.valor),
        pr.criado_por_nome
          ? h(
              "span",
              { class: "parametros__autor" },
              "por " + pr.criado_por_nome,
            )
          : null,
        podeRemover
          ? h(
              "button",
              {
                class: "msg__excluir",
                type: "button",
                style: "opacity:.6",
                title: "Remover parâmetro",
                on: {
                  click: () => {
                    void removerParametro(pr.id)
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
              icone(ICONES.fechar),
            )
          : null,
      ),
    );
  };

  /* ---------- Exclusão lógica ---------- */

  const pedirExclusao = (d: DemandaEnriquecida): void => {
    void perguntar({
      titulo: `Excluir ${d.codigo}?`,
      texto: d.titulo,
      consequencia:
        "O registro não sai do banco: ele some das listas e fica marcado com seu nome, a data e este motivo. Coordenação e gestão podem restaurá-lo pela aba Excluídas.",
      rotuloCampo: "Motivo da exclusão",
      placeholder: "Ex.: duplicata da DEM-2026-000004",
      multilinha: true,
      minimo: 5,
      rotuloConfirmar: "Excluir demanda",
      perigo: true,
    }).then((motivo) => {
      if (motivo === null) return;

      void excluirDemanda(d.id, motivo)
        .then(() => {
          avisar(`${d.codigo} excluída. O registro continua auditável.`, "ok");
          navegar("demandas");
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha ao excluir.", "erro"),
        );
    });
  };

  const avisoExcluida = (d: DemandaEnriquecida): HTMLElement =>
    h(
      "div",
      { class: "aviso aviso--critico" },
      h("span", { class: "aviso__icone" }, "!"),
      h(
        "span",
        {},
        h("b", {}, "Demanda excluída. "),
        `Removida por ${d.excluida_por_nome ?? "alguém"} em ${dataHora(d.excluida_em)}. `,
        d.motivo_exclusao ? `Motivo: ${d.motivo_exclusao}` : "",
      ),
    );

  /* ---------- Correção de dados ---------- */

  const formCorrecao = (d: DemandaEnriquecida): HTMLElement => {
    const campos = {
      titulo: d.titulo,
      descricao: d.descricao,
      area: d.area ?? "",
      data_inicio_prevista: d.data_inicio_prevista ?? "",
      data_fim_prevista: d.data_fim_prevista ?? "",
    };

    const entrada = (
      rotulo: string,
      chave: keyof typeof campos,
      tipoCampo = "text",
    ): HTMLElement =>
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        h("input", {
          class: "entrada",
          type: tipoCampo,
          value: campos[chave],
          on: {
            input: (ev: Event) => {
              campos[chave] = (ev.target as HTMLInputElement).value;
            },
          },
        }),
      );

    const descricaoCampo = h("textarea", {
      class: "area-texto",
      on: {
        input: (ev: Event) => {
          campos.descricao = (ev.target as HTMLTextAreaElement).value;
        },
      },
    }) as HTMLTextAreaElement;
    descricaoCampo.value = campos.descricao;

    const selTipo = seletorSimples(
      (Object.keys(ROTULOS_TIPO) as TipoDemanda[]).map((t) => [
        t,
        ROTULOS_TIPO[t],
      ]),
      d.tipo,
    );
    const selPri = seletorSimples(
      (Object.keys(ROTULOS_PRIORIDADE) as PrioridadeDemanda[]).map((p) => [
        p,
        ROTULOS_PRIORIDADE[p],
      ]),
      d.prioridade,
    );

    const salvar = h(
      "button",
      { class: "btn btn--primario", type: "submit" },
      "Salvar correção",
    );

    return h(
      "form",
      {
        class: "cartao",
        on: {
          submit: (ev: Event) => {
            ev.preventDefault();

            if (campos.titulo.trim().length < 6) {
              return avisar(
                "O título precisa de ao menos 6 caracteres.",
                "erro",
              );
            }
            if (campos.descricao.trim().length < 20) {
              return avisar(
                "A descrição precisa de ao menos 20 caracteres.",
                "erro",
              );
            }

            salvar.disabled = true;
            void atualizarDemanda(d.id, {
              titulo: campos.titulo.trim(),
              descricao: campos.descricao.trim(),
              area: campos.area.trim() || null,
              tipo: selTipo.value as TipoDemanda,
              prioridade: selPri.value as PrioridadeDemanda,
              data_inicio_prevista: campos.data_inicio_prevista || null,
              data_fim_prevista: campos.data_fim_prevista || null,
            })
              .then(() => {
                avisar("Dados corrigidos.", "ok");
                editando = false;
                recarregar();
              })
              .catch((e: unknown) => {
                avisar(e instanceof Error ? e.message : "Falha.", "erro");
                salvar.disabled = false;
              });
          },
        },
      },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Corrigir dados"),
        h(
          "span",
          { class: "texto-sutil empurra" },
          "A alteração fica registrada na auditoria",
        ),
      ),
      entrada("Título", "titulo"),
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, "Descrição"),
        descricaoCampo,
      ),
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
          h("label", { class: "campo__rotulo" }, "Prioridade"),
          selPri,
        ),
        entrada("Área", "area"),
      ),
      h(
        "div",
        { class: "grade-campos" },
        entrada("Início previsto", "data_inicio_prevista", "date"),
        entrada("Entrega prevista", "data_fim_prevista", "date"),
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
                editando = false;
                recarregar();
              },
            },
          },
          "Cancelar",
        ),
        h("span", { class: "empurra" }),
        salvar,
      ),
    );
  };

  recarregar();
}

/* Controles */

function controleProgresso(
  d: DemandaEnriquecida,
  totalItens: number,
  aoConcluir: () => void,
): HTMLElement {
  const valor = h("span", { class: "progresso__valor" }, `${d.percentual}%`);

  // Com lista de verificação, o percentual é derivado dela.
  if (totalItens > 0) {
    return h(
      "div",
      { class: "campo", style: "margin-bottom:0" },
      h("label", { class: "campo__rotulo" }, "Progresso", valor),
      h(
        "div",
        { class: "progresso__trilho" },
        h("div", {
          class: "progresso__barra",
          style: `width:${d.percentual}%`,
        }),
      ),
      h(
        "div",
        { class: "campo__ajuda" },
        `Calculado a partir dos ${totalItens} itens da lista de verificação. Marque itens para avançar.`,
      ),
    );
  }

  const faixa = h("input", {
    type: "range",
    min: "0",
    max: "100",
    step: "5",
    value: String(d.percentual),
    style: "width:100%;accent-color:var(--c-accent)",
    aria: { label: "Percentual concluído" },
    on: {
      input: (ev: Event) => {
        valor.textContent = `${(ev.target as HTMLInputElement).value}%`;
      },
      change: (ev: Event) => {
        const novo = Number((ev.target as HTMLInputElement).value);
        void atualizarDemanda(d.id, { percentual: novo })
          .then(() => {
            avisar(`Progresso atualizado para ${novo}%.`, "ok");
            aoConcluir();
          })
          .catch((e: unknown) => {
            avisar(
              e instanceof Error ? e.message : "Falha ao atualizar.",
              "erro",
            );
          });
      },
    },
  });

  return h(
    "div",
    { class: "campo", style: "margin-bottom:0" },
    h("label", { class: "campo__rotulo" }, "Progresso", valor),
    faixa,
  );
}

function seletorStatus(
  d: DemandaEnriquecida,
  transicoes: Array<[StatusDemanda, string]>,
  aoConcluir: () => void,
): HTMLElement {
  const select = h(
    "select",
    { class: "selecao" },
    h("option", { value: "" }, "Mudar situação…"),
    ...transicoes.map(([s, rotulo]) => h("option", { value: s }, rotulo)),
  ) as HTMLSelectElement;

  const aplicar = (novo: StatusDemanda, motivo?: string): void => {
    void atualizarDemanda(d.id, {
      status: novo,
      ...(motivo ? { motivo_bloqueio: motivo } : {}),
    })
      .then(() => {
        avisar(`Situação alterada para ${ROTULOS_STATUS_DEMANDA[novo]}.`, "ok");
        aoConcluir();
      })
      .catch((e: unknown) => {
        avisar(e instanceof Error ? e.message : "Falha ao alterar.", "erro");
        select.value = "";
      });
  };

  select.addEventListener("change", () => {
    const novo = select.value as StatusDemanda | "";
    if (!novo) return;

    if (novo === "bloqueada") {
      void perguntar({
        titulo: "Bloquear a demanda",
        consequencia:
          "Sem motivo registrado, o quadro enche de card parado sem ninguém saber por quê.",
        rotuloCampo: "O que está impedindo o andamento",
        placeholder: "Ex.: aguardando retorno do fornecedor sobre a proposta",
        multilinha: true,
        minimo: 10,
        rotuloConfirmar: "Bloquear",
      }).then((motivo) => {
        if (motivo === null) {
          select.value = "";
          return;
        }
        aplicar("bloqueada", motivo);
      });
      return;
    }

    if (novo === "concluida" && d.percentual < 100) {
      void confirmar({
        titulo: "Concluir com progresso incompleto?",
        texto: `O progresso está em ${d.percentual}%.`,
        consequencia:
          "Concluir marca a demanda como 100%, fecha todos os itens da lista de verificação e registra a entrega de hoje.",
        rotuloConfirmar: "Concluir mesmo assim",
      }).then((segue) => {
        if (!segue) {
          select.value = "";
          return;
        }
        aplicar("concluida");
      });
      return;
    }

    aplicar(novo);
  });

  return select;
}

/* Exibição */

function def(rotulo: string, valor: Node | string): HTMLElement {
  return h("div", {}, h("dt", {}, rotulo), h("dd", {}, valor));
}

function seletorSimples(
  opcoes: Array<[string, string]>,
  inicial: string,
): HTMLSelectElement {
  const s = h(
    "select",
    { class: "selecao" },
    ...opcoes.map(([v, t]) => h("option", { value: v }, t)),
  ) as HTMLSelectElement;
  s.value = inicial;
  return s;
}
