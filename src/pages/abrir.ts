/** Abertura de chamado — implementa o formulário da seção 05 do blueprint. */

import { avisar, h, montar } from "@/lib/dom";
import {
  agruparServicosPorCategoria,
  criarChamado,
  listarTagsSugeridas,
  obterServico,
} from "@/lib/api";
import { criarCampoTags, type CampoTags } from "@/components/campo-tags";
import {
  calcularPrioridade,
  deduzirImpacto,
  deduzirUrgencia,
  explicarPrioridade,
  POLITICAS_SLA,
} from "@/lib/prioridade";
import { navegar } from "@/lib/router";
import type {
  CampoDinamico,
  Perfil,
  RascunhoChamado,
  ServicoCatalogo,
  TagSugerida,
} from "@/types/dominio";

const TITULOS_GENERICOS = [
  "nao funciona",
  "não funciona",
  "urgente",
  "ajuda",
  "erro",
  "problema",
  "socorro",
  "duvida",
  "dúvida",
];

/** A trilha depende do tipo de chamado. */
const ETAPAS_INCIDENTE = ["Serviço", "Problema", "Contexto", "Detalhes"];
const ETAPAS_REQUISICAO = ["Serviço", "Descrição", "Dados do pedido"];

function etapasDe(servico: ServicoCatalogo | null): string[] {
  return servico && servico.tipo !== "incidente"
    ? ETAPAS_REQUISICAO
    : ETAPAS_INCIDENTE;
}

function rascunhoVazio(perfil: Perfil): RascunhoChamado {
  return {
    servico_id: null,
    titulo: "",
    descricao: "",
    mensagem_erro: "",
    primeira_ocorrencia: "",
    frequencia: "",
    ativo_id: null,
    local: perfil.unidade ?? "",
    quantos_afetados: "",
    consegue_trabalhar: "",
    contorno_aplicado: "",
    tags: [],
    campos_extras: {},
  };
}

export function renderizarAbrir(alvo: HTMLElement, perfil: Perfil): void {
  let etapa = 0;
  let rascunho = rascunhoVazio(perfil);
  const erros = new Map<string, string>();

  // O campo de tags guarda o próprio estado, então é criado uma vez só —
  // recriá-lo a cada redesenho apagaria os chips ao trocar de etapa.
  let sugestoesTags: TagSugerida[] = [];
  let campoTags: CampoTags | null = null;

  void listarTagsSugeridas()
    .then((lista) => {
      sugestoesTags = lista;
    })
    .catch(() => {
      // Sugestão é conforto: sem ela ainda dá para digitar a tag.
    });

  const desenhar = (): void => {
    const servico = rascunho.servico_id
      ? (obterServico(rascunho.servico_id) ?? null)
      : null;

    const etapas = etapasDe(servico);
    // Trocar de serviço pode encurtar a trilha sob os pés de quem já
    // avançou.
    if (etapa > etapas.length - 1) etapa = etapas.length - 1;

    const trilha = h(
      "div",
      { class: "etapas" },
      ...etapas.map((nome, i) =>
        h(
          "button",
          {
            class: `etapa${i < etapa ? " etapa--completa" : ""}`,
            type: "button",
            disabled: i > etapa,
            aria: i === etapa ? { current: "step" } : {},
            on: {
              click: () => {
                etapa = i;
                desenhar();
              },
            },
          },
          h("span", { class: "etapa__n" }, i < etapa ? "✓" : String(i + 1)),
          nome,
        ),
      ),
    );

    let corpo: HTMLElement;
    switch (etapa) {
      case 0:
        corpo = etapaServico();
        break;
      case 1:
        corpo = etapaProblema(servico);
        break;
      case 2:
        corpo =
          servico && servico.tipo !== "incidente"
            ? etapaPedido(servico)
            : etapaContexto(servico);
        break;
      default:
        corpo = etapaDetalhes(servico);
    }

    montar(alvo, trilha, corpo);
  };

  /* ---------- Etapa 1 — escolha do serviço ---------- */

  function etapaServico(): HTMLElement {
    const busca = h("input", {
      class: "entrada",
      type: "search",
      placeholder: "Descreva em poucas palavras o que você precisa…",
      aria: { label: "Buscar serviço" },
    });

    const lista = h("div", { class: "pilha" });

    const desenharLista = (termo: string): void => {
      const alvoTexto = termo.trim().toLowerCase();
      const grupos = agruparServicosPorCategoria();
      const blocos: HTMLElement[] = [];

      for (const [categoria, servicos] of grupos) {
        const filtrados = servicos.filter(
          (s) =>
            !alvoTexto ||
            s.nome.toLowerCase().includes(alvoTexto) ||
            s.descricao.toLowerCase().includes(alvoTexto) ||
            s.subcategoria.toLowerCase().includes(alvoTexto),
        );
        if (filtrados.length === 0) continue;

        blocos.push(
          h(
            "div",
            {},
            h(
              "div",
              {
                style:
                  "font-family:var(--f-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--c-muted);font-weight:700;margin-bottom:var(--s-2)",
              },
              categoria,
            ),
            h(
              "div",
              { class: "escolhas" },
              ...filtrados.map((s) => cartaoServico(s)),
            ),
          ),
        );
      }

      if (blocos.length === 0) {
        montar(
          lista,
          h(
            "div",
            { class: "vazio" },
            h("h3", {}, "Nenhum serviço encontrado"),
            h(
              "p",
              {},
              "Tente outras palavras, ou escolha “Erro em sistema corporativo” se não souber onde encaixar. A triagem redireciona.",
            ),
          ),
        );
      } else {
        montar(lista, ...blocos);
      }
    };

    const cartaoServico = (s: ServicoCatalogo): HTMLElement => {
      const politica = POLITICAS_SLA[s.sla_politica];
      return h(
        "label",
        { class: "escolha" },
        h("input", {
          type: "radio",
          name: "servico",
          value: s.id,
          checked: rascunho.servico_id === s.id,
          on: {
            change: () => {
              rascunho.servico_id = s.id;
              etapa = 1;
              desenhar();
            },
          },
        }),
        h(
          "span",
          {},
          h("span", { class: "escolha__titulo" }, s.nome),
          h("span", { class: "escolha__desc" }, s.descricao),
          h(
            "span",
            {
              class: "escolha__desc",
              style: "margin-top:4px;display:flex;gap:8px;align-items:center",
            },
            h("span", { class: `pri pri--${s.sla_politica}` }, s.sla_politica),
            h(
              "span",
              { class: "mono", style: "font-size:11px" },
              `${politica.rotulo} · fila ${s.equipe_padrao}`,
            ),
            s.artigo_kb
              ? h(
                  "span",
                  {
                    class: "mono",
                    style: "font-size:11px;color:var(--c-accent)",
                  },
                  `${s.artigo_kb} disponível`,
                )
              : null,
          ),
        ),
      );
    };

    busca.addEventListener("input", () => desenharLista(busca.value));
    desenharLista("");

    return h(
      "div",
      { class: "pilha" },
      h(
        "div",
        { class: "aviso aviso--info" },
        h("span", { class: "aviso__icone" }, "i"),
        h(
          "span",
          {},
          h("b", {}, "Escolha o serviço, não a prioridade. "),
          "A classificação é calculada a partir do que você responder nas próximas etapas.",
        ),
      ),
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, "O que você precisa?"),
        busca,
      ),
      lista,
    );
  }

  /* ---------- Etapa 2 — descrição ---------- */

  function etapaProblema(servico: ServicoCatalogo | null): HTMLElement {
    if (!servico) {
      etapa = 0;
      desenhar();
      return h("div");
    }

    const ehIncidente = servico.tipo === "incidente";

    const titulo = campoTexto({
      chave: "titulo",
      rotulo: "Resuma em uma linha",
      valor: rascunho.titulo,
      placeholder: "Ex.: ERP retorna erro de timeout ao emitir nota fiscal",
      ajuda: "Entre 10 e 120 caracteres. Evite “não funciona” ou “urgente”.",
      maxlength: 120,
      aoMudar: (v) => {
        rascunho.titulo = v;
      },
    });

    const descricao = campoArea({
      chave: "descricao",
      rotulo: "Descreva o que aconteceu",
      valor: rascunho.descricao,
      placeholder:
        "O que aconteceu:\nO que você esperava que acontecesse:\nO que já tentou:",
      ajuda:
        "Mínimo de 30 caracteres. Quanto mais preciso, menos idas e vindas.",
      aoMudar: (v) => {
        rascunho.descricao = v;
      },
    });

    const especificosIncidente = ehIncidente
      ? [
          campoArea({
            chave: "mensagem_erro",
            rotulo: "Mensagem de erro exibida",
            valor: rascunho.mensagem_erro,
            placeholder:
              "Copie o texto exato, ou escreva “não houve mensagem”.",
            ajuda:
              "A transcrição literal costuma identificar a causa de imediato.",
            aoMudar: (v) => {
              rascunho.mensagem_erro = v;
            },
          }),
          h(
            "div",
            { class: "campo" },
            h("label", { class: "campo__rotulo" }, "Quando começou"),
            h("input", {
              class: "entrada",
              type: "datetime-local",
              value: rascunho.primeira_ocorrencia,
              max: new Date().toISOString().slice(0, 16),
              on: {
                change: (ev: Event) => {
                  rascunho.primeira_ocorrencia = (
                    ev.target as HTMLInputElement
                  ).value;
                },
              },
            }),
            h(
              "div",
              { class: "campo__ajuda" },
              "Aproximado já ajuda. Serve para correlacionar com outros chamados do mesmo período.",
            ),
          ),
          campoEscolha({
            rotulo: "Com que frequência acontece",
            opcoes: [
              ["sempre", "Sempre", "Toda vez que tento, o erro aparece."],
              [
                "intermitente",
                "De vez em quando",
                "Às vezes funciona, às vezes não.",
              ],
              [
                "uma_vez",
                "Ocorreu uma única vez",
                "Aconteceu e não se repetiu.",
              ],
            ],
            valor: rascunho.frequencia,
            aoMudar: (v) => {
              rascunho.frequencia = v as RascunhoChamado["frequencia"];
            },
          }),
        ]
      : [];

    campoTags ??= criarCampoTags(sugestoesTags);

    return h(
      "div",
      { class: "pilha" },
      cabecalhoServico(servico),
      titulo,
      descricao,
      ...especificosIncidente,
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, "Tags"),
        campoTags.elemento,
      ),
      navegacao(),
    );
  }

  /* ---------- Etapa 3 — contexto e alcance ---------- */

  /** Contexto — só incidente chega aqui. */
  function etapaContexto(servico: ServicoCatalogo | null): HTMLElement {
    if (!servico) {
      etapa = 0;
      desenhar();
      return h("div");
    }

    const previa = h("div", { class: "previa" });

    const atualizarPrevia = (): void => {
      const impacto = deduzirImpacto(rascunho.quantos_afetados);
      const urgencia = deduzirUrgencia(rascunho.consegue_trabalhar);

      if (!impacto || !urgencia) {
        montar(
          previa,
          h(
            "div",
            { class: "previa__texto" },
            "Responda as duas perguntas acima para ver a classificação e o prazo que este chamado receberá.",
          ),
        );
        return;
      }

      const prioridade = calcularPrioridade(impacto, urgencia);
      montar(
        previa,
        h("span", { class: `pri pri--${prioridade}` }, prioridade),
        h(
          "div",
          { class: "previa__texto" },
          h("b", {}, `${POLITICAS_SLA[prioridade].rotulo}. `),
          explicarPrioridade(impacto, urgencia),
        ),
      );
    };

    const bloco = h(
      "div",
      { class: "pilha" },
      campoTexto({
        chave: "local",
        rotulo: "Onde você está",
        valor: rascunho.local,
        placeholder: "Ex.: Matriz — 4º andar, sala 402",
        ajuda: "Unidade, andar e sala. Necessário para atendimento presencial.",
        aoMudar: (v) => {
          rascunho.local = v;
        },
      }),
      campoEscolha({
        rotulo: "Quantas pessoas estão sendo afetadas",
        ajuda: "Esta resposta define o impacto na matriz de prioridade.",
        opcoes: [
          ["so_eu", "Só eu", "Ninguém mais relatou o mesmo problema."],
          [
            "minha_equipe",
            "Minha equipe ou setor",
            "Várias pessoas do mesmo time.",
          ],
          [
            "varios_setores",
            "Vários setores ou toda a unidade",
            "O problema atravessa áreas diferentes.",
          ],
        ],
        valor: rascunho.quantos_afetados,
        aoMudar: (v) => {
          rascunho.quantos_afetados = v as RascunhoChamado["quantos_afetados"];
          atualizarPrevia();
        },
      }),
      campoEscolha({
        rotulo: "Você consegue continuar trabalhando",
        ajuda: "Esta resposta define a urgência na matriz de prioridade.",
        opcoes: [
          ["sim", "Sim, normalmente", "Consigo tocar o trabalho sem prejuízo."],
          [
            "com_dificuldade",
            "Com dificuldade",
            "Existe uma saída, mas ela custa tempo.",
          ],
          [
            "nao",
            "Não, estou parado",
            "Não há alternativa, o trabalho travou.",
          ],
        ],
        valor: rascunho.consegue_trabalhar,
        aoMudar: (v) => {
          rascunho.consegue_trabalhar =
            v as RascunhoChamado["consegue_trabalhar"];
          atualizarPrevia();
        },
      }),
      previa,
      campoTexto({
        chave: "contorno_aplicado",
        rotulo: "O que você já tentou",
        valor: rascunho.contorno_aplicado,
        placeholder:
          "Ex.: reiniciei o computador e limpei o cache do navegador",
        ajuda: "Opcional, mas evita que a equipe repita o que você já fez.",
        aoMudar: (v) => {
          rascunho.contorno_aplicado = v;
        },
      }),
      navegacao(),
    );

    atualizarPrevia();
    return bloco;
  }

  /* ---------- Etapa 4 — campos dinâmicos do serviço ---------- */

  function etapaDetalhes(servico: ServicoCatalogo | null): HTMLElement {
    if (!servico) {
      etapa = 0;
      desenhar();
      return h("div");
    }

    return h(
      "div",
      { class: "pilha" },
      cabecalhoServico(servico),
      blocoCamposDinamicos(servico),
      avisoAprovacao(servico),
      navegacao(true),
    );
  }

  /* ---------- Etapa 3 de requisição — dados do pedido ---------- */

  /** Requisição junta contexto e formulário numa tela só. */
  function etapaPedido(servico: ServicoCatalogo): HTMLElement {
    const prioridade = calcularPrioridade(
      servico.impacto_padrao,
      servico.urgencia_padrao,
    );

    return h(
      "div",
      { class: "pilha" },
      cabecalhoServico(servico),
      campoTexto({
        chave: "local",
        rotulo: "Onde você está",
        valor: rascunho.local,
        placeholder: "Ex.: Matriz — 4º andar, sala 402",
        ajuda: "Unidade, andar e sala. Necessário para atendimento presencial.",
        aoMudar: (v) => {
          rascunho.local = v;
        },
      }),
      blocoCamposDinamicos(servico),
      h(
        "div",
        { class: "previa" },
        h("span", { class: `pri pri--${prioridade}` }, prioridade),
        h(
          "div",
          { class: "previa__texto" },
          h("b", {}, `${POLITICAS_SLA[prioridade].rotulo}. `),
          `Prazo definido pelo catálogo para “${servico.nome}”, atendido pela fila ${servico.equipe_padrao}.`,
        ),
      ),
      avisoAprovacao(servico),
      navegacao(true),
    );
  }

  /* ---------- Peças compartilhadas ---------- */

  function blocoCamposDinamicos(servico: ServicoCatalogo): HTMLElement {
    const container = h("div", { class: "pilha" });

    /** Assinatura do conjunto de campos visíveis. */
    const assinatura = (): string =>
      servico.schema_formulario.campos
        .filter((campo) => campoVisivel(campo, rascunho.campos_extras))
        .map((campo) => campo.chave)
        .join("|");

    let assinaturaDesenhada = "";

    const desenharCampos = (): void => {
      const visiveis = servico.schema_formulario.campos.filter((campo) =>
        campoVisivel(campo, rascunho.campos_extras),
      );
      assinaturaDesenhada = visiveis.map((c) => c.chave).join("|");

      montar(
        container,
        ...(visiveis.length === 0
          ? [
              h(
                "p",
                { class: "texto-sutil" },
                "Este serviço não pede informações adicionais.",
              ),
            ]
          : visiveis.map((campo) =>
              construirCampoDinamico(campo, rascunho.campos_extras, () => {
                // Digitar não muda quais campos aparecem; escolher numa
                // lista pode.
                if (assinatura() !== assinaturaDesenhada) desenharCampos();
              }),
            )),
      );
    };

    desenharCampos();
    return container;
  }

  function avisoAprovacao(servico: ServicoCatalogo): HTMLElement | null {
    const aprovacao = servico.schema_formulario.aprovacao;
    if (!aprovacao?.exigida) return null;

    return h(
      "div",
      { class: "aviso aviso--alerta" },
      h("span", { class: "aviso__icone" }, "!"),
      h(
        "span",
        {},
        h("b", {}, "Este pedido passa por aprovação. "),
        aprovacao.tipo === "gestor_direto"
          ? "Seu gestor direto receberá a solicitação antes de a equipe começar o atendimento."
          : aprovacao.tipo === "custo"
            ? "Há custo envolvido, então a aprovação orçamentária vem antes da execução."
            : "O dono do serviço avalia antes de a equipe começar o atendimento.",
      ),
    );
  }

  function cabecalhoServico(servico: ServicoCatalogo): HTMLElement {
    return h(
      "div",
      { class: "cartao cartao--compacto" },
      h(
        "div",
        { class: "linha-flex" },
        h(
          "span",
          { class: `pri pri--${servico.sla_politica}` },
          servico.sla_politica,
        ),
        h("b", {}, servico.nome),
        h(
          "span",
          { class: "texto-sutil empurra" },
          `${servico.categoria} · fila ${servico.equipe_padrao}`,
        ),
        h(
          "button",
          {
            class: "btn btn--sutil btn--sm",
            type: "button",
            on: {
              click: () => {
                etapa = 0;
                desenhar();
              },
            },
          },
          "Trocar",
        ),
      ),
    );
  }

  function navegacao(ultima = false): HTMLElement {
    return h(
      "div",
      { class: "linha-flex", style: "margin-top:var(--s-3)" },
      h(
        "button",
        {
          class: "btn",
          type: "button",
          on: {
            click: () => {
              etapa = Math.max(0, etapa - 1);
              desenhar();
            },
          },
        },
        "Voltar",
      ),
      h(
        "button",
        {
          class: "btn btn--primario empurra",
          type: "button",
          on: { click: () => (ultima ? enviar() : avancar()) },
        },
        ultima ? "Abrir chamado" : "Continuar",
      ),
    );
  }

  function avancar(): void {
    erros.clear();

    if (etapa === 1) {
      const t = rascunho.titulo.trim();
      if (t.length < 10) {
        erros.set("titulo", "O título precisa de ao menos 10 caracteres.");
      } else if (TITULOS_GENERICOS.includes(t.toLowerCase())) {
        erros.set(
          "titulo",
          "Este título não diz o que houve. Descreva o sintoma, ex.: “ERP retorna timeout ao emitir nota”.",
        );
      }
      if (rascunho.descricao.trim().length < 30) {
        erros.set(
          "descricao",
          "A descrição precisa de ao menos 30 caracteres. Diga o que aconteceu, o que esperava e o que já tentou.",
        );
      }
    }

    if (etapa === 2) {
      if (!rascunho.local.trim()) erros.set("local", "Informe onde você está.");

      // Requisição não exibe a matriz, então não pode cobrá-la.
      const servicoAtual = rascunho.servico_id
        ? obterServico(rascunho.servico_id)
        : null;
      if (servicoAtual?.tipo === "incidente") {
        if (!rascunho.quantos_afetados) {
          erros.set("quantos_afetados", "Escolha uma das opções.");
        }
        if (!rascunho.consegue_trabalhar) {
          erros.set("consegue_trabalhar", "Escolha uma das opções.");
        }
      }
    }

    if (erros.size > 0) {
      desenhar();
      avisar("Confira os campos destacados antes de continuar.", "erro");
      return;
    }

    const servicoAvanco = rascunho.servico_id
      ? (obterServico(rascunho.servico_id) ?? null)
      : null;
    etapa = Math.min(etapasDe(servicoAvanco).length - 1, etapa + 1);
    desenhar();
  }

  function enviar(): void {
    const servico = rascunho.servico_id
      ? obterServico(rascunho.servico_id)
      : null;
    if (!servico) return;

    // Na requisição o "onde você está" divide a tela com o formulário,
    // então é aqui que ele é cobrado — não existe etapa anterior que já o
    if (servico.tipo !== "incidente" && !rascunho.local.trim()) {
      erros.set("local", "Informe onde você está.");
      desenhar();
      avisar("Confira os campos destacados antes de continuar.", "erro");
      return;
    }

    const faltando = servico.schema_formulario.campos
      .filter((c) => c.obrigatorio && campoVisivel(c, rascunho.campos_extras))
      .filter((c) => {
        const v = rascunho.campos_extras[c.chave];
        return (
          v === undefined || v === "" || (Array.isArray(v) && v.length === 0)
        );
      });

    if (faltando.length > 0) {
      avisar(`Preencha: ${faltando.map((c) => c.rotulo).join(", ")}.`, "erro");
      return;
    }

    const ehIncidente = servico.tipo === "incidente";
    const impacto = ehIncidente
      ? deduzirImpacto(rascunho.quantos_afetados)
      : servico.impacto_padrao;
    const urgencia = ehIncidente
      ? deduzirUrgencia(rascunho.consegue_trabalhar)
      : servico.urgencia_padrao;

    if (!impacto || !urgencia) {
      etapa = 2;
      desenhar();
      return;
    }

    rascunho.tags = campoTags?.valor() ?? [];

    void criarChamado(rascunho, perfil, impacto, urgencia)
      .then((chamado) => {
        avisar(`Chamado ${chamado.numero} aberto.`, "ok");
        rascunho = rascunhoVazio(perfil);
        campoTags = null;
        etapa = 0;
        navegar(`chamado/${chamado.numero}`);
      })
      .catch((e: unknown) => {
        avisar(
          e instanceof Error ? e.message : "Não foi possível abrir o chamado.",
          "erro",
        );
      });
  }

  /* ---------- Construtores de campo ---------- */

  interface OpcoesTexto {
    chave: string;
    rotulo: string;
    valor: string;
    placeholder?: string;
    ajuda?: string;
    maxlength?: number;
    aoMudar: (v: string) => void;
  }

  function campoTexto(o: OpcoesTexto): HTMLElement {
    const erro = erros.get(o.chave);
    const input = h("input", {
      class: "entrada",
      type: "text",
      value: o.valor,
      placeholder: o.placeholder ?? "",
      maxlength: o.maxlength ?? 0,
      aria: erro ? { invalid: "true" } : {},
      on: {
        input: (ev: Event) => o.aoMudar((ev.target as HTMLInputElement).value),
      },
    });
    if (!o.maxlength) input.removeAttribute("maxlength");

    return h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo" }, o.rotulo),
      input,
      erro ? h("div", { class: "campo__erro" }, erro) : null,
      o.ajuda ? h("div", { class: "campo__ajuda" }, o.ajuda) : null,
    );
  }

  function campoArea(o: OpcoesTexto): HTMLElement {
    const erro = erros.get(o.chave);
    const contador = h("span", { class: "campo__contador" });

    const area = h("textarea", {
      class: "area-texto",
      placeholder: o.placeholder ?? "",
      aria: erro ? { invalid: "true" } : {},
      on: {
        input: (ev: Event) => {
          const v = (ev.target as HTMLTextAreaElement).value;
          o.aoMudar(v);
          contador.textContent = `${v.trim().length} caracteres`;
        },
      },
    }) as HTMLTextAreaElement;
    area.value = o.valor;
    contador.textContent = `${o.valor.trim().length} caracteres`;

    return h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo" }, o.rotulo, contador),
      area,
      erro ? h("div", { class: "campo__erro" }, erro) : null,
      o.ajuda ? h("div", { class: "campo__ajuda" }, o.ajuda) : null,
    );
  }

  interface OpcoesEscolha {
    rotulo: string;
    ajuda?: string;
    opcoes: Array<[string, string, string]>;
    valor: string;
    aoMudar: (v: string) => void;
  }

  function campoEscolha(o: OpcoesEscolha): HTMLElement {
    const chave = o.rotulo.toLowerCase().includes("afetadas")
      ? "quantos_afetados"
      : o.rotulo.toLowerCase().includes("trabalhando")
        ? "consegue_trabalhar"
        : "frequencia";
    const erro = erros.get(chave);

    return h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo" }, o.rotulo),
      o.ajuda ? h("div", { class: "campo__ajuda" }, o.ajuda) : null,
      h(
        "div",
        { class: "escolhas" },
        ...o.opcoes.map(([valor, titulo, desc]) =>
          h(
            "label",
            { class: "escolha" },
            h("input", {
              type: "radio",
              name: chave,
              value: valor,
              checked: o.valor === valor,
              on: { change: () => o.aoMudar(valor) },
            }),
            h(
              "span",
              {},
              h("span", { class: "escolha__titulo" }, titulo),
              h("span", { class: "escolha__desc" }, desc),
            ),
          ),
        ),
      ),
      erro ? h("div", { class: "campo__erro" }, erro) : null,
    );
  }

  desenhar();
}

/* Campos dinâmicos vindos de catalogo_servicos.schema_formulario */

function campoVisivel(
  campo: CampoDinamico,
  valores: Record<string, unknown>,
): boolean {
  const cond = campo.condicional;
  if (!cond) return true;
  const atual = valores[cond.campo];
  if (cond.igual_a !== undefined) return atual === cond.igual_a;
  if (cond.diferente_de !== undefined) {
    return atual !== undefined && atual !== cond.diferente_de;
  }
  return true;
}

function construirCampoDinamico(
  campo: CampoDinamico,
  valores: Record<string, unknown>,
  aoMudar: () => void,
): HTMLElement {
  const rotulo = h(
    "label",
    { class: "campo__rotulo" },
    campo.rotulo,
    campo.obrigatorio ? h("span", { class: "campo__obrigatorio" }, "*") : null,
  );

  const ajuda = campo.ajuda
    ? h("div", { class: "campo__ajuda" }, campo.ajuda)
    : null;

  const registrar = (valor: unknown): void => {
    valores[campo.chave] = valor;
    aoMudar();
  };

  let controle: HTMLElement;

  switch (campo.tipo) {
    case "texto_longo": {
      const area = h("textarea", {
        class: "area-texto",
        on: {
          input: (ev: Event) =>
            registrar((ev.target as HTMLTextAreaElement).value),
        },
      }) as HTMLTextAreaElement;
      area.value = String(valores[campo.chave] ?? "");
      controle = area;
      break;
    }

    case "selecao_unica": {
      const select = h(
        "select",
        {
          class: "selecao",
          on: {
            change: (ev: Event) =>
              registrar((ev.target as HTMLSelectElement).value),
          },
        },
        h("option", { value: "" }, "Selecione…"),
        ...(campo.opcoes ?? []).map((op) => h("option", { value: op }, op)),
      ) as HTMLSelectElement;
      select.value = String(valores[campo.chave] ?? "");
      controle = select;
      break;
    }

    case "selecao_multipla": {
      const marcados = new Set(
        Array.isArray(valores[campo.chave])
          ? (valores[campo.chave] as string[])
          : [],
      );
      controle = h(
        "div",
        { class: "escolhas" },
        ...(campo.opcoes ?? []).map((op) =>
          h(
            "label",
            { class: "escolha" },
            h("input", {
              type: "checkbox",
              value: op,
              checked: marcados.has(op),
              on: {
                change: (ev: Event) => {
                  if ((ev.target as HTMLInputElement).checked) marcados.add(op);
                  else marcados.delete(op);
                  registrar([...marcados]);
                },
              },
            }),
            h("span", {}, h("span", { class: "escolha__titulo" }, op)),
          ),
        ),
      );
      break;
    }

    case "booleano": {
      controle = h(
        "label",
        { class: "escolha" },
        h("input", {
          type: "checkbox",
          checked: valores[campo.chave] === true,
          on: {
            change: (ev: Event) =>
              registrar((ev.target as HTMLInputElement).checked),
          },
        }),
        h("span", {}, h("span", { class: "escolha__titulo" }, "Sim")),
      );
      break;
    }

    case "data":
    case "numero":
    case "texto":
    case "relacao":
    default: {
      const tipoHtml =
        campo.tipo === "data"
          ? "date"
          : campo.tipo === "numero"
            ? "number"
            : "text";
      const input = h("input", {
        class: "entrada",
        type: tipoHtml,
        value: String(valores[campo.chave] ?? ""),
        on: {
          input: (ev: Event) =>
            registrar((ev.target as HTMLInputElement).value),
        },
      });
      controle = input;
    }
  }

  return h("div", { class: "campo" }, rotulo, controle, ajuda);
}
