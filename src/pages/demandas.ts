/** Demandas — quadro de trabalho planejado. */

import { criarFiltroData } from "@/components/filtro-data";
import { aguardando } from "@/components/esqueleto";
import { corDaTag, listarTagsSugeridas } from "@/lib/api";
import { criarCampoTags, type CampoTags } from "@/components/campo-tags";
import { avisar, h, montar } from "@/lib/dom";
import { navegar } from "@/lib/router";
import { dataCurta } from "@/lib/formato";
import {
  assumirDemanda,
  criarDemanda,
  diasRestantes,
  estaAtrasada,
  listarDemandas,
  ROTULOS_PRIORIDADE,
  ROTULOS_STATUS_DEMANDA,
  ROTULOS_TIPO,
  STATUS_ABERTOS,
} from "@/lib/demandas";
import { listarSetores, setoresSolicitantes } from "@/lib/setores";
import type {
  DemandaEnriquecida,
  TagSugerida,
  SetorArvore,
  Perfil,
  PrioridadeDemanda,
  RascunhoDemanda,
  StatusDemanda,
  TipoDemanda,
} from "@/types/dominio";

type Aba = "todas" | "disponiveis" | "minhas" | "excluidas";

export function renderizarDemandas(alvo: HTMLElement, perfil: Perfil): void {
  let aba: Aba = "disponiveis";
  let texto = "";
  let tipo: TipoDemanda | null = null;
  let formAberto = false;
  let setores: SetorArvore[] = [];

  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  // Carregado uma vez: a árvore muda pouco e o formulário precisa dela
  // pronta.
  void listarSetores()
    .then((lista) => {
      setores = setoresSolicitantes(lista);
    })
    .catch(() => {
      // Sem a árvore, o campo de setor aparece vazio e a demanda segue sem
      // ele.
    });

  const periodo = criarFiltroData(() => desenhar());

  const desenhar = (): void => {
    aguardando(area, "tabela");
    void listarDemandas({
      texto,
      tipo,
      excluidas: aba === "excluidas",
      ...periodo.valor(),
    })
      .then((todas) => {
        const visiveis =
          aba === "disponiveis"
            ? todas.filter((d) => d.status === "disponivel")
            : aba === "minhas"
              ? todas.filter((d) => d.responsavel_id === perfil.id)
              : todas;

        montar(
          area,
          aba === "excluidas" ? null : metricas(todas, perfil),
          barraAcoes(),
          formAberto
            ? formNovaDemanda(perfil, setores, desenhar, fecharForm)
            : null,
          aba === "disponiveis"
            ? h(
                "div",
                { class: "aviso aviso--info" },
                h("span", { class: "aviso__icone" }, "i"),
                h(
                  "span",
                  {},
                  h("b", {}, "Escolha o que vai fazer. "),
                  "Ao pegar uma demanda você assume o prazo de entrega dela — e ela sai da lista dos outros.",
                ),
              )
            : null,
          aba === "excluidas"
            ? h(
                "div",
                { class: "aviso aviso--alerta" },
                h("span", { class: "aviso__icone" }, "!"),
                h(
                  "span",
                  {},
                  h("b", {}, "Nada foi apagado do banco. "),
                  "Estas demandas continuam registradas com quem excluiu, quando e por quê. Abra qualquer uma para ler o motivo ou restaurá-la ao quadro.",
                ),
              )
            : null,
          listaDemandas(visiveis, perfil, desenhar, aba),
        );
      })
      .catch((e: unknown) => {
        avisar(
          e instanceof Error ? e.message : "Falha ao carregar as demandas.",
          "erro",
        );
      });
  };

  const fecharForm = (): void => {
    formAberto = false;
    desenhar();
  };

  const barraAcoes = (): HTMLElement => {
    const botaoAba = (valor: Aba, rotulo: string): HTMLElement =>
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

    const busca = h("input", {
      class: "entrada",
      type: "search",
      value: texto,
      placeholder: "Buscar por título, código ou área…",
      style: "max-width:280px",
      on: {
        input: (ev: Event) => {
          texto = (ev.target as HTMLInputElement).value;
          desenhar();
        },
      },
    });

    const filtroTipo = h(
      "select",
      {
        class: "selecao",
        style: "max-width:180px",
        on: {
          change: (ev: Event) => {
            const v = (ev.target as HTMLSelectElement).value;
            tipo = v ? (v as TipoDemanda) : null;
            desenhar();
          },
        },
      },
      h("option", { value: "" }, "Todos os tipos"),
      ...(Object.keys(ROTULOS_TIPO) as TipoDemanda[]).map((t) =>
        h("option", { value: t }, ROTULOS_TIPO[t]),
      ),
    ) as HTMLSelectElement;
    filtroTipo.value = tipo ?? "";

    return h(
      "div",
      { class: "grade-filtros" },
      botaoAba("disponiveis", "Disponíveis"),
      botaoAba("minhas", "Minhas demandas"),
      botaoAba("todas", "Todas"),
      botaoAba("excluidas", "Excluídas"),
      busca,
      periodo.elemento,
      filtroTipo,
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
        formAberto ? "Cancelar" : "Nova demanda",
      ),
    );
  };

  desenhar();
}

/* Métricas */

function metricas(todas: DemandaEnriquecida[], perfil: Perfil): HTMLElement {
  const abertas = todas.filter((d) => STATUS_ABERTOS.includes(d.status));
  const disponiveis = todas.filter((d) => d.status === "disponivel").length;
  const minhas = todas.filter(
    (d) => d.responsavel_id === perfil.id && STATUS_ABERTOS.includes(d.status),
  );
  const atrasadas = abertas.filter((d) => estaAtrasada(d)).length;
  const vencendo = abertas.filter((d) => {
    const dias = diasRestantes(d.data_fim_prevista);
    return dias !== null && dias >= 0 && dias <= 3;
  }).length;

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
    cartao(
      "Disponíveis",
      disponiveis,
      "esperando alguém pegar",
      disponiveis > 0 ? "ok" : "",
    ),
    cartao("Comigo", minhas.length, "sob sua responsabilidade"),
    cartao("Em aberto", abertas.length, "no quadro todo"),
    cartao(
      "Vencem em 3 dias",
      vencendo,
      "prazo se aproximando",
      vencendo > 0 ? "alerta" : "",
    ),
    cartao(
      "Atrasadas",
      atrasadas,
      "passaram do prazo",
      atrasadas > 0 ? "critica" : "ok",
    ),
  );
}

/* Lista */

export function seloPrazo(d: DemandaEnriquecida): HTMLElement {
  if (d.status === "concluida") {
    return h(
      "span",
      { class: "prazo prazo--entregue" },
      `entregue ${dataCurta(d.data_fim_real)}`,
    );
  }
  if (d.status === "cancelada") {
    return h("span", { class: "texto-sutil" }, "cancelada");
  }

  const dias = diasRestantes(d.data_fim_prevista);
  if (dias === null) {
    return h("span", { class: "texto-sutil" }, "sem prazo");
  }
  if (dias < 0) {
    return h(
      "span",
      { class: "prazo prazo--atrasado" },
      `${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"} de atraso`,
    );
  }
  if (dias === 0) {
    return h("span", { class: "prazo prazo--perto" }, "vence hoje");
  }
  return h(
    "span",
    { class: dias <= 3 ? "prazo prazo--perto" : "prazo prazo--ok" },
    `${dias} ${dias === 1 ? "dia" : "dias"} · ${dataCurta(d.data_fim_prevista)}`,
  );
}

export function barraProgresso(percentual: number): HTMLElement {
  return h(
    "div",
    { class: "progresso" },
    h(
      "div",
      { class: "progresso__trilho" },
      h("div", { class: "progresso__barra", style: `width:${percentual}%` }),
    ),
    h("span", { class: "progresso__valor" }, `${percentual}%`),
  );
}

function listaDemandas(
  demandas: DemandaEnriquecida[],
  perfil: Perfil,
  aoMudar: () => void,
  aba: Aba,
): HTMLElement {
  if (demandas.length === 0) {
    const vazios: Record<Aba, [string, string]> = {
      disponiveis: [
        "Nenhuma demanda disponível",
        "Tudo que estava livre já foi assumido. Registre uma nova demanda ou veja o quadro completo.",
      ],
      minhas: [
        "Você não tem demandas",
        "Abra a aba Disponíveis e escolha uma para trabalhar — ao pegar, você assume o prazo de entrega.",
      ],
      todas: [
        "Nenhuma demanda encontrada",
        "Ajuste os filtros, ou registre a primeira demanda do quadro.",
      ],
      excluidas: [
        "Nenhuma demanda excluída",
        "Quando alguém excluir uma demanda por engano de digitação ou data trocada, ela aparece aqui — com o motivo e a opção de restaurar.",
      ],
    };
    const [titulo, texto] = vazios[aba];
    return h(
      "div",
      { class: "cartao" },
      h("div", { class: "vazio" }, h("h3", {}, titulo), h("p", {}, texto)),
    );
  }

  const linhas = demandas.map((d) => {
    const podePegar = d.status === "disponivel" && !d.responsavel_id;

    return h(
      "tr",
      { on: { click: () => navegar(`demanda/${d.codigo}`) } },
      h("td", { class: "tabela__num" }, d.codigo),
      h(
        "td",
        {},
        h("span", { class: "tabela__titulo", title: d.titulo }, d.titulo),
        h(
          "span",
          { class: "tabela__meta" },
          `${ROTULOS_TIPO[d.tipo]}${d.area ? ` · ${d.area}` : ""}`,
        ),
        d.tags.length > 0
          ? h(
              "span",
              { class: "tags__linha" },
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
      ),
      h(
        "td",
        {},
        h(
          "span",
          { class: `tag tag--${d.prioridade}` },
          ROTULOS_PRIORIDADE[d.prioridade],
        ),
      ),
      h(
        "td",
        {},
        h(
          "span",
          { class: classeStatusDemanda(d.status) },
          ROTULOS_STATUS_DEMANDA[d.status],
        ),
      ),
      h(
        "td",
        { class: d.responsavel_nome ? "" : "texto-sutil" },
        d.responsavel_nome ?? "livre",
      ),
      h("td", {}, barraProgresso(d.percentual)),
      h("td", {}, seloPrazo(d)),
      h(
        "td",
        {},
        podePegar
          ? h(
              "button",
              {
                class: "btn btn--primario btn--sm",
                type: "button",
                on: {
                  click: (ev: Event) => {
                    ev.stopPropagation();
                    const botao = ev.currentTarget as HTMLButtonElement;
                    botao.disabled = true;
                    void assumirDemanda(d.id, perfil)
                      .then(() => {
                        avisar(
                          `${d.codigo} é sua. Prazo de entrega: ${d.data_fim_prevista ? dataCurta(d.data_fim_prevista) : "a definir"}.`,
                          "ok",
                        );
                        aoMudar();
                      })
                      .catch((e: unknown) => {
                        avisar(
                          e instanceof Error ? e.message : "Falha ao assumir.",
                          "erro",
                        );
                        botao.disabled = false;
                      });
                  },
                },
              },
              "Pegar",
            )
          : h("span", { class: "texto-sutil" }, "—"),
      ),
    );
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
          h("th", {}, "Código"),
          h("th", {}, "Demanda"),
          h("th", {}, "Prioridade"),
          h("th", {}, "Situação"),
          h("th", {}, "Responsável"),
          h("th", {}, "Progresso"),
          h("th", {}, "Prazo"),
          h("th", {}, ""),
        ),
      ),
      h("tbody", {}, ...linhas),
    ),
  );
}

export function classeStatusDemanda(status: StatusDemanda): string {
  const mapa: Record<StatusDemanda, string> = {
    backlog: "encerrado",
    refinamento: "aberto",
    disponivel: "aberto",
    em_andamento: "andamento",
    revisao: "andamento",
    bloqueada: "pausado",
    concluida: "resolvido",
    cancelada: "encerrado",
  };
  return `selo selo--${mapa[status]}`;
}

/* Formulário de nova demanda */

function formNovaDemanda(
  perfil: Perfil,
  setores: SetorArvore[],
  aoCriar: () => void,
  aoCancelar: () => void,
): HTMLElement {
  const rascunho: RascunhoDemanda = {
    // Já vem preenchido com o setor da pessoa: na maioria das vezes é ela
    // pedindo para o próprio setor, e um campo pré-respondido certo é
    setor_id: perfil.setor_id ?? "",
    titulo: "",
    descricao: "",
    tipo: "melhoria",
    area: "",
    prioridade: "media",
    data_inicio_prevista: "",
    data_fim_prevista: "",
    esforco_horas: "",
    criterios_aceite: "",
    tags: [],
  };

  // O campo guarda o próprio estado: recriá-lo a cada redesenho do
  // formulário apagaria os chips já escolhidos.
  const caixaTags = h("div", { class: "campo" });
  let campoTags: CampoTags | null = null;

  void listarTagsSugeridas()
    .then((sugestoes: TagSugerida[]) => {
      campoTags = criarCampoTags(sugestoes, {
        placeholder: "Ou digite uma tag própria. Enter ou vírgula adiciona.",
      });
      montar(
        caixaTags,
        h("label", { class: "campo__rotulo" }, "Tags"),
        campoTags.elemento,
      );
    })
    .catch(() => {
      // Sem sugestão o formulário segue: tag é recorte, não requisito.
    });

  const entrada = (
    rotulo: string,
    chave: keyof RascunhoDemanda,
    opcoes: { tipo?: string; placeholder?: string; ajuda?: string } = {},
  ): HTMLElement =>
    h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo" }, rotulo),
      h("input", {
        class: "entrada",
        type: opcoes.tipo ?? "text",
        placeholder: opcoes.placeholder ?? "",
        on: {
          input: (ev: Event) => {
            rascunho[chave] = (ev.target as HTMLInputElement).value as never;
          },
        },
      }),
      opcoes.ajuda ? h("div", { class: "campo__ajuda" }, opcoes.ajuda) : null,
    );

  const descricao = h("textarea", {
    class: "area-texto",
    placeholder:
      "O que está ruim hoje, o que deveria acontecer, e por que isso importa. Descreva o problema — a solução vem no refinamento.",
    on: {
      input: (ev: Event) => {
        rascunho.descricao = (ev.target as HTMLTextAreaElement).value;
      },
    },
  });

  const criterios = h("textarea", {
    class: "area-texto",
    style: "min-height:80px",
    placeholder: "Como saberemos que ficou pronto? Uma condição por linha.",
    on: {
      input: (ev: Event) => {
        rascunho.criterios_aceite = (ev.target as HTMLTextAreaElement).value;
      },
    },
  });

  const selTipo = h(
    "select",
    {
      class: "selecao",
      on: {
        change: (ev: Event) => {
          rascunho.tipo = (ev.target as HTMLSelectElement).value as TipoDemanda;
        },
      },
    },
    ...(Object.keys(ROTULOS_TIPO) as TipoDemanda[]).map((t) =>
      h("option", { value: t }, ROTULOS_TIPO[t]),
    ),
  ) as HTMLSelectElement;
  selTipo.value = "melhoria";

  const selSetor = h(
    "select",
    {
      class: "selecao",
      on: {
        change: (ev: Event) => {
          rascunho.setor_id = (ev.target as HTMLSelectElement).value;
        },
      },
    },
    h("option", { value: "" }, "Não informar"),
    ...setores.map((s) => h("option", { value: s.id }, s.caminho)),
  ) as HTMLSelectElement;
  selSetor.value = rascunho.setor_id;

  const selPrioridade = h(
    "select",
    {
      class: "selecao",
      on: {
        change: (ev: Event) => {
          rascunho.prioridade = (ev.target as HTMLSelectElement)
            .value as PrioridadeDemanda;
        },
      },
    },
    ...(Object.keys(ROTULOS_PRIORIDADE) as PrioridadeDemanda[]).map((p) =>
      h("option", { value: p }, ROTULOS_PRIORIDADE[p]),
    ),
  ) as HTMLSelectElement;
  selPrioridade.value = "media";

  const botao = h(
    "button",
    { class: "btn btn--primario", type: "submit" },
    "Registrar demanda",
  );

  return h(
    "form",
    {
      class: "cartao",
      on: {
        submit: (ev: Event) => {
          ev.preventDefault();

          if (rascunho.titulo.trim().length < 6) {
            return avisar("O título precisa de ao menos 6 caracteres.", "erro");
          }
          if (rascunho.descricao.trim().length < 20) {
            return avisar(
              "Descreva a demanda com ao menos 20 caracteres.",
              "erro",
            );
          }
          if (
            rascunho.data_inicio_prevista &&
            rascunho.data_fim_prevista &&
            rascunho.data_fim_prevista < rascunho.data_inicio_prevista
          ) {
            return avisar(
              "A data de entrega não pode ser anterior à de início.",
              "erro",
            );
          }

          rascunho.tags = campoTags?.valor() ?? [];

          botao.disabled = true;
          void criarDemanda(rascunho, perfil)
            .then((nova) => {
              avisar(
                `${nova.codigo} registrada${nova.status === "disponivel" ? " e disponível para alguém pegar" : " no backlog"}.`,
                "ok",
              );
              aoCriar();
            })
            .catch((e: unknown) => {
              avisar(
                e instanceof Error ? e.message : "Falha ao registrar.",
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
      h("span", { class: "cartao__titulo" }, "Nova demanda"),
      h(
        "span",
        { class: "texto-sutil empurra" },
        "Com data de entrega, já nasce disponível para alguém pegar",
      ),
    ),
    entrada("Título", "titulo", {
      placeholder: "Melhorar o layout da tela de pedidos do CRM",
    }),
    h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo" }, "Descrição"),
      descricao,
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
        selPrioridade,
      ),
      entrada("Área ou sistema", "area", { placeholder: "CRM, ERP, Redes…" }),
    ),
    h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo" }, "Setor solicitante"),
      selSetor,
      h(
        "div",
        { class: "campo__ajuda" },
        "Quem está pedindo. É o que permite responder depois quanto do trabalho de TI vem de cada área.",
      ),
    ),
    h(
      "div",
      { class: "grade-campos" },
      entrada("Início previsto", "data_inicio_prevista", { tipo: "date" }),
      entrada("Entrega prevista", "data_fim_prevista", {
        tipo: "date",
        ajuda: "Define a barra no Gantt.",
      }),
      entrada("Esforço estimado (h)", "esforco_horas", { tipo: "number" }),
    ),
    h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo" }, "Critérios de aceite"),
      criterios,
    ),
    caixaTags,
    h(
      "div",
      { class: "linha-flex" },
      h(
        "button",
        { class: "btn", type: "button", on: { click: aoCancelar } },
        "Cancelar",
      ),
      h("span", { class: "empurra" }),
      botao,
    ),
  );
}
