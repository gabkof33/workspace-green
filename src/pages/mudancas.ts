/**
 * Gestão de mudanças (GMUD) — esteira, CAB e janelas de implantação.
 *
 * O que esta tela cobre que as outras não cobriam: o intervalo entre "sabemos
 * o que fazer" e "está feito em produção". Antes dela, esse intervalo era um
 * combinado verbal — o chamado ficava em `pendente_mudanca` e ninguém sabia
 * apontar qual mudança, quem aprovou, ou o que aconteceria se desse errado.
 *
 * As travas da esteira moram no banco (`fn_mudanca_transicao`). Aqui elas
 * aparecem duas vezes de propósito: o botão que o banco vai recusar não é
 * desenhado, e a razão fica escrita ao lado. Botão desabilitado sem motivo
 * visível é o que faz a pessoa achar que o sistema travou.
 */

import { criarBarraFiltros } from "@/components/barra-filtros";
import { aguardando } from "@/components/esqueleto";
import { corpoOuVazio } from "@/components/tabela-vazia";
import { areaCarregando } from "@/components/spinner";
import {
  avisar,
  h,
  icone,
  ICONES,
  montar,
  type MarcacaoEstatica,
} from "@/lib/dom";
import { confirmar, perguntar } from "@/components/dialogo";
import { dataHora, tempoRelativo } from "@/lib/formato";
import { listarServicos } from "@/lib/api";
import {
  atribuirMudanca,
  cancelarMudanca,
  classeStatusMudanca,
  criarMudanca,
  devolverParaRascunho,
  dispensarCab,
  emJanela,
  encerrarMudanca,
  excluirRascunho,
  exigeCab,
  iniciarImplantacao,
  janelaPerdida,
  levarAoCab,
  listarMudancas,
  listarTrilha,
  listarVotos,
  podeVotar,
  rotuloEventoTrilha,
  diferencasDoEvento,
  ROTULOS_DECISAO,
  ROTULOS_RESULTADO_MUDANCA,
  ROTULOS_RISCO,
  ROTULOS_STATUS_MUDANCA,
  ROTULOS_TIPO_MUDANCA,
  salvarMudanca,
  submeterMudanca,
  votarCab,
  agendarMudanca,
  mudancaEncerrada,
} from "@/lib/mudancas";
import type {
  DecisaoCab,
  EventoTrilha,
  MudancaEnriquecida,
  Perfil,
  RascunhoMudanca,
  ResultadoMudanca,
  RiscoMudanca,
  TipoMudanca,
  VotoCab,
} from "@/types/dominio";

type Aba = "esteira" | "cab" | "janelas";

/** `datetime-local` quer `YYYY-MM-DDTHH:mm` — sem fuso e sem segundos. */
function paraCampoLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function renderizarMudancas(alvo: HTMLElement, perfil: Perfil): void {
  let aba: Aba = "esteira";
  let formAberto = false;
  let mudancaAberta: string | null = null;
  let rascunhoEmEdicao: string | null = null;
  let trilhaAberta: string | null = null;

  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  const barra = criarBarraFiltros({
    aoMudar: () => desenhar(),
    filtros: [
      {
        chave: "risco",
        rotulo: "Risco",
        tipo: "opcoes",
        opcoes: [
          { valor: "alto", texto: "Alto" },
          { valor: "medio", texto: "Médio" },
          { valor: "baixo", texto: "Baixo" },
        ],
      },
      { chave: "encerradas", rotulo: "Incluir encerradas", tipo: "liga" },
    ],
  });

  const desenhar = (): void => {
    aguardando(area, "lista");
    void listarMudancas()
      .then((todas) => {
        const risco = barra.opcao("risco");
        const visiveis = todas.filter(
          (m) =>
            (!risco || m.risco === risco) &&
            (barra.ligado("encerradas") || !mudancaEncerrada(m)),
        );

        montar(
          area,
          metricas(todas),
          abas(),
          formAberto ? formNovaMudanca() : null,
          aba === "esteira"
            ? painelEsteira(visiveis)
            : aba === "cab"
              ? painelCab(todas)
              : painelJanelas(todas),
        );
      })
      .catch((e: unknown) =>
        avisar(e instanceof Error ? e.message : "Falha ao carregar.", "erro"),
      );
  };

  /* ---------- Cabeçalho ---------- */

  const metricas = (todas: MudancaEnriquecida[]): HTMLElement => {
    const abertas = todas.filter((m) => !mudancaEncerrada(m));
    const noCab = abertas.filter((m) => m.status === "aguardando_cab").length;
    const perdidas = abertas.filter((m) => janelaPerdida(m)).length;

    // Taxa de sucesso sobre o que chegou ao fim. Revertida e falhou contam
    // como não-sucesso: o objetivo da GMUD é mudança que entra e fica.
    const encerradas = todas.filter(
      (m) => m.status === "implantada" || m.status === "revertida",
    );
    const bemSucedidas = encerradas.filter(
      (m) => m.resultado === "sucesso" || m.resultado === "sucesso_com_ressalva",
    ).length;
    const taxa =
      encerradas.length === 0
        ? null
        : Math.round((bemSucedidas / encerradas.length) * 100);

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
      cartao("Mudanças abertas", String(abertas.length), "na esteira"),
      cartao(
        "Aguardando CAB",
        String(noCab),
        "paradas esperando voto",
        noCab > 0 ? "alerta" : "ok",
      ),
      cartao(
        "Janela perdida",
        String(perdidas),
        "agendadas cuja janela passou",
        perdidas > 0 ? "critica" : "ok",
      ),
      cartao(
        "Taxa de sucesso",
        taxa === null ? "—" : `${taxa}%`,
        "das que chegaram ao fim",
        taxa === null ? "" : taxa >= 95 ? "ok" : "alerta",
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
      barra.elemento,
      botao("esteira", "Esteira"),
      botao("cab", "CAB"),
      botao("janelas", "Janelas"),
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
        formAberto ? "Cancelar" : "Nova mudança",
      ),
    );
  };

  /* ---------- Esteira ---------- */

  const painelEsteira = (mudancas: MudancaEnriquecida[]): HTMLElement => {
    const linhas = mudancas.flatMap((m) => {
      const principal = h(
        "tr",
        {
          on: {
            click: () => {
              mudancaAberta = mudancaAberta === m.id ? null : m.id;
              desenhar();
            },
          },
        },
        h("td", { class: "tabela__num" }, m.codigo),
        h(
          "td",
          {},
          h("span", { class: "tabela__titulo" }, m.titulo),
          h(
            "span",
            { class: "tabela__meta" },
            [
              m.servico_nome ?? "sem serviço",
              m.responsavel_nome ? `resp. ${m.responsavel_nome}` : "sem responsável",
            ].join(" · "),
          ),
        ),
        h(
          "td",
          {},
          h("span", { class: "tag" }, ROTULOS_TIPO_MUDANCA[m.tipo_mudanca]),
        ),
        h("td", {}, h("span", { class: classeRisco(m.risco) }, ROTULOS_RISCO[m.risco])),
        h(
          "td",
          {},
          h(
            "span",
            { class: classeStatusMudanca(m.status) },
            ROTULOS_STATUS_MUDANCA[m.status],
          ),
        ),
        h("td", {}, blocoJanela(m)),
        h(
          "td",
          {},
          m.exige_cab
            ? h(
                "span",
                { class: "mono texto-sutil" },
                `${m.aprovacoes}✓ ${m.reprovacoes}✗`,
              )
            : h("span", { class: "texto-sutil" }, "dispensa"),
        ),
      );

      if (mudancaAberta !== m.id) return [principal];
      return [principal, fichaLinha(m)];
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
            h("th", {}, "Mudança"),
            h("th", {}, "Tipo"),
            h("th", {}, "Risco"),
            h("th", {}, "Situação"),
            h("th", {}, "Janela"),
            h("th", {}, "CAB"),
          ),
        ),
        h(
          "tbody",
          {},
          ...corpoOuVazio(
            linhas,
            7,
            "Nenhuma mudança na esteira",
            "Mudança é o que fecha o ciclo de um chamado que virou correção definitiva, ou de uma demanda que precisa entrar em produção com janela e plano de volta.",
          ),
        ),
      ),
    );
  };

  const classeRisco = (risco: RiscoMudanca): string =>
    risco === "alto"
      ? "tag tag--critica"
      : risco === "medio"
        ? "tag tag--media"
        : "tag tag--baixa";

  const blocoJanela = (m: MudancaEnriquecida): HTMLElement => {
    if (!m.janela_inicio) return h("span", { class: "texto-sutil" }, "—");
    if (emJanela(m)) {
      return h("span", { class: "prazo prazo--atrasado" }, "em janela agora");
    }
    if (janelaPerdida(m)) {
      return h("span", { class: "prazo prazo--atrasado" }, "janela perdida");
    }
    return h(
      "span",
      { class: "prazo prazo--ok" },
      tempoRelativo(m.janela_inicio),
    );
  };

  /* ---------- Ficha ---------- */

  const fichaLinha = (m: MudancaEnriquecida): HTMLElement =>
    h(
      "tr",
      {},
      h(
        "td",
        { colspan: 7, style: "background:var(--c-surface-2)" },
        ficha(m),
      ),
    );

  const ficha = (m: MudancaEnriquecida): HTMLElement => {
    const corpo = h("div", { class: "pilha" }, areaCarregando("Carregando o CAB"));

    void listarVotos(m.id)
      .then((votos) => montar(corpo, ...blocoFicha(m, votos)))
      .catch(() =>
        montar(corpo, h("span", { class: "texto-sutil" }, "Falha ao carregar.")),
      );

    return corpo;
  };

  const blocoFicha = (
    m: MudancaEnriquecida,
    votos: VotoCab[],
  ): HTMLElement[] => {
    const plano = (rotulo: string, texto: string | null): HTMLElement =>
      h(
        "div",
        { class: "campo" },
        h("span", { class: "campo__rotulo" }, rotulo),
        texto
          ? h("span", {}, texto)
          : h("span", { class: "tag tag--critica" }, "não escrito"),
      );

    return [
      h(
        "div",
        { class: "grade-campos" },
        h(
          "div",
          { class: "campo" },
          h("span", { class: "campo__rotulo" }, "O que muda"),
          h("span", {}, m.descricao),
        ),
        h(
          "div",
          { class: "campo" },
          h("span", { class: "campo__rotulo" }, "Por que muda"),
          h("span", {}, m.justificativa),
        ),
      ),
      h(
        "div",
        { class: "grade-campos" },
        plano("Plano de implantação", m.plano_implantacao),
        plano("Plano de rollback", m.plano_rollback),
        plano("Plano de teste", m.plano_teste),
      ),
      h(
        "div",
        { class: "linha-flex" },
        h(
          "span",
          { class: "texto-sutil" },
          `Solicitada por ${m.solicitante_nome} · ${dataHora(m.criado_em)}`,
        ),
        m.chamado_numero
          ? h("span", { class: "tag" }, `origem: ${m.chamado_numero}`)
          : null,
        m.indisponibilidade_prevista
          ? h("span", { class: "tag tag--alta" }, "prevê indisponibilidade")
          : null,
      ),
      m.comunicado
        ? h(
            "div",
            { class: "aviso", style: "margin:0" },
            h("span", { class: "aviso__icone" }, "i"),
            h("span", {}, `Comunicado: ${m.comunicado}`),
          )
        : null,

      // O CAB
      m.exige_cab ? blocoVotos(m, votos) : null,
      m.exige_cab && podeVotar(m, perfil) ? formVoto(m, votos) : null,

      // A esteira
      blocoAcoes(m),

      rascunhoEmEdicao === m.id ? formEditarRascunho(m) : null,

      // A trilha
      blocoTrilha(m),
    ].filter((x): x is HTMLElement => x !== null);
  };

  const blocoVotos = (
    m: MudancaEnriquecida,
    votos: VotoCab[],
  ): HTMLElement => {
    if (votos.length === 0) {
      return h(
        "div",
        { class: "texto-sutil" },
        m.status === "aguardando_cab"
          ? "Nenhum voto ainda. Uma reprovação veta; uma aprovação libera o agendamento."
          : "Nenhum voto registrado.",
      );
    }

    return h(
      "div",
      { class: "pilha" },
      h("h4", { style: "margin:0" }, `CAB — ${votos.length} voto(s)`),
      ...votos.map((v) =>
        h(
          "div",
          { class: "cartao cartao--compacto" },
          h(
            "div",
            { class: "linha-flex" },
            h("b", {}, v.aprovador_nome),
            h(
              "span",
              {
                class:
                  v.decisao === "aprovado"
                    ? "tag tag--verde"
                    : v.decisao === "reprovado"
                      ? "tag tag--critica"
                      : "tag tag--alta",
              },
              ROTULOS_DECISAO[v.decisao],
            ),
            h("span", { class: "empurra" }),
            h("span", { class: "texto-sutil" }, dataHora(v.decidido_em)),
          ),
          v.comentario
            ? h("div", { class: "campo__ajuda" }, v.comentario)
            : null,
        ),
      ),
    );
  };

  /** Voto do gestor. O banco recusa voto de quem solicitou. */
  const formVoto = (m: MudancaEnriquecida, votos: VotoCab[]): HTMLElement => {
    const meuVoto = votos.find((v) => v.aprovador_id === perfil.id);

    const comentario = h("textarea", {
      class: "area-texto",
      style: "min-height:60px",
      placeholder:
        "O que sustenta o voto. Reprovação sem motivo escrito volta como discussão na semana seguinte.",
    }) as HTMLTextAreaElement;
    comentario.value = meuVoto?.comentario ?? "";

    const votar = (decisao: DecisaoCab): void => {
      if (decisao === "reprovado" && comentario.value.trim().length < 5) {
        return avisar("Escreva o motivo da reprovação.", "erro");
      }
      void votarCab(m.id, perfil, decisao, comentario.value)
        .then(() => {
          avisar(`Voto registrado: ${ROTULOS_DECISAO[decisao]}.`, "ok");
          desenhar();
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha.", "erro"),
        );
    };

    const botao = (
      decisao: DecisaoCab,
      rotulo: string,
      classe: string,
    ): HTMLElement =>
      h(
        "button",
        {
          class: `btn btn--sm ${classe}`,
          type: "button",
          on: {
            click: (ev: Event) => {
              ev.stopPropagation();
              votar(decisao);
            },
          },
        },
        rotulo,
      );

    return h(
      "div",
      { class: "cartao cartao--compacto" },
      h(
        "h4",
        { style: "margin:0" },
        meuVoto ? "Trocar seu voto" : "Seu voto no CAB",
      ),
      comentario,
      h(
        "div",
        { class: "linha-flex" },
        botao("aprovado", "Aprovar", "btn--primario"),
        botao("reprovado", "Reprovar", ""),
        botao("mais_informacoes", "Pedir mais informações", "btn--sutil"),
      ),
    );
  };

  /* ---------- Ações da esteira ---------- */

  const blocoAcoes = (m: MudancaEnriquecida): HTMLElement => {
    // Botões e painéis são listas separadas de propósito: os botões vão numa
    // linha flex, e um formulário (agendar, encerrar) dentro dessa linha
    // brigaria com a grade de campos dele.
    const acoes: HTMLElement[] = [];
    const paineis: HTMLElement[] = [];
    const notas: string[] = [];

    const executar = (
      promessa: Promise<unknown>,
      sucesso: string,
    ): void => {
      void promessa
        .then(() => {
          avisar(sucesso, "ok");
          desenhar();
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha.", "erro"),
        );
    };

    // Variante nomeada em vez de `primario: boolean`: com o destrutivo entrando
    // na fileira, o booleano não daria conta de um terceiro estilo.
    //
    // O ícone é parâmetro à parte, e não consequência da variante `perigo`:
    // "Excluir rascunho" e "Cancelar mudança" são as duas destrutivas desta
    // tela, e só a primeira apaga. Amarrar a lixeira à cor poria o desenho de
    // "destruir registro" num botão que só troca o status para `cancelada` —
    // o registro fica, com motivo e autor.
    const botao = (
      rotulo: string,
      aoClicar: () => void,
      variante: "" | "primario" | "perigo" = "",
      simbolo?: MarcacaoEstatica,
    ): HTMLElement =>
      h(
        "button",
        {
          class: `btn btn--sm${variante ? ` btn--${variante}` : ""}`,
          type: "button",
          on: {
            click: (ev: Event) => {
              ev.stopPropagation();
              aoClicar();
            },
          },
        },
        simbolo ? icone(simbolo) : null,
        rotulo,
      );

    const temPlanos = Boolean(m.plano_implantacao && m.plano_rollback);

    switch (m.status) {
      case "rascunho":
        acoes.push(
          botao(
            rascunhoEmEdicao === m.id ? "Fechar edição" : "Editar rascunho",
            () => {
              rascunhoEmEdicao = rascunhoEmEdicao === m.id ? null : m.id;
              desenhar();
            },
          ),
        );
        if (temPlanos) {
          acoes.push(
            botao(
              "Submeter para avaliação",
              () =>
                executar(
                  submeterMudanca(m.id),
                  "Mudança submetida para avaliação.",
                ),
              "primario",
            ),
          );
        } else {
          notas.push(
            "Escreva o plano de implantação e o de rollback para submeter — o banco recusa a transição sem os dois.",
          );
        }
        acoes.push(
          botao("Excluir rascunho", () => {
            void confirmar({
              titulo: "Excluir rascunho",
              texto: `${m.codigo} — ${m.titulo}`,
              consequencia:
                "Só rascunho é apagável. Depois de submetida, a mudança é cancelada, nunca removida.",
              rotuloConfirmar: "Excluir",
              perigo: true,
            }).then((ok) => {
              if (ok) {
                mudancaAberta = null;
                executar(excluirRascunho(m.id), "Rascunho excluído.");
              }
            });
          }, "perigo", ICONES.excluir),
        );
        break;

      case "avaliacao":
        if (m.exige_cab) {
          acoes.push(
            botao(
              "Levar ao CAB",
              () => executar(levarAoCab(m), "Mudança na pauta do CAB."),
              "primario",
            ),
          );
          notas.push(
            `Tipo ${ROTULOS_TIPO_MUDANCA[m.tipo_mudanca].toLowerCase()} com risco ${ROTULOS_RISCO[m.risco].toLowerCase()} exige voto do comitê.`,
          );
        } else {
          acoes.push(
            botao(
              "Aprovar direto",
              () =>
                executar(
                  dispensarCab(m),
                  "Mudança padrão aprovada sem CAB.",
                ),
              "primario",
            ),
          );
          notas.push(
            "Mudança padrão de risco baixo ou médio dispensa CAB — o comitê já aprovou a receita.",
          );
        }
        break;

      case "aprovada":
        paineis.push(formAgendar(m));
        break;

      case "aguardando_cab":
        notas.push(
          podeVotar(m, perfil)
            ? "Registre seu voto acima."
            : perfil.id === m.solicitante_id
              ? "Você solicitou esta mudança e por isso não pode votá-la — a aprovação precisa de um segundo gestor."
              : "Aguardando o voto do comitê.",
        );
        break;

      case "reprovada":
        acoes.push(
          botao(
            "Devolver para rascunho",
            () =>
              executar(
                devolverParaRascunho(m.id),
                "Mudança devolvida para reescrita.",
              ),
            "primario",
          ),
        );
        notas.push(
          "Reescreva o plano e leve ao CAB de novo. Os votos anteriores ficam no histórico.",
        );
        break;

      case "agendada":
        acoes.push(
          botao(
            "Iniciar implantação",
            () =>
              executar(
                iniciarImplantacao(m.id),
                "Implantação iniciada.",
              ),
            "primario",
          ),
        );
        if (janelaPerdida(m)) {
          notas.push(
            "A janela agendada já passou. Reagende antes de implantar — implantar fora da janela é o que a GMUD existe para evitar.",
          );
          paineis.push(formAgendar(m));
        }
        break;

      case "em_implantacao":
        paineis.push(formEncerrar(m));
        break;

      default:
        notas.push(
          `Encerrada em ${dataHora(m.implantada_em ?? m.atualizado_em)}` +
            (m.resultado
              ? ` como ${ROTULOS_RESULTADO_MUDANCA[m.resultado].toLowerCase()}.`
              : "."),
        );
        if (m.notas_encerramento) notas.push(m.notas_encerramento);
        break;
    }

    // Atribuir e cancelar valem em qualquer ponto antes do fim.
    if (!mudancaEncerrada(m)) {
      if (m.responsavel_id !== perfil.id) {
        acoes.push(
          botao("Assumir", () =>
            executar(
              atribuirMudanca(m.id, perfil.id),
              "Mudança atribuída a você.",
            ),
          ),
        );
      }
      acoes.push(
        botao("Cancelar mudança", () => {
          void perguntar({
            titulo: "Cancelar mudança",
            texto: `${m.codigo} — ${m.titulo}`,
            consequencia:
              "Cancelada é desistência de quem pediu, e é contada separado de reprovada pelo CAB.",
            rotuloCampo: "Por que está sendo cancelada",
            placeholder: "Ex.: fornecedor adiou a atualização",
            multilinha: true,
            minimo: 5,
            rotuloConfirmar: "Cancelar mudança",
          }).then((motivo) => {
            if (motivo !== null) {
              executar(cancelarMudanca(m.id, motivo), "Mudança cancelada.");
            }
          });
        }, "perigo"),
      );
    }

    return h(
      "div",
      { class: "pilha", style: "margin-top:var(--s-2)" },
      ...notas.map((n) => h("div", { class: "campo__ajuda" }, n)),
      acoes.length > 0 ? h("div", { class: "linha-flex" }, ...acoes) : null,
      ...paineis,
    );
  };

  /**
   * Trilha de auditoria da mudança.
   *
   * A trilha não é escrita por esta tela: `fn_auditar` grava a linha inteira
   * antes e depois em cada INSERT, UPDATE e DELETE de `mudancas`,
   * `mudanca_aprovacoes` e `mudanca_ativos`, com autor e horário. Aqui ela só
   * é lida — inclusive quando a ação veio de fora do app, por SQL ou por
   * script, que é justamente o caso em que rastrear importa.
   *
   * Carrega sob demanda, num botão, e não junto da ficha: a linha do tempo de
   * uma mudança implantada tem dezenas de eventos, e quem abre a ficha quase
   * sempre quer o estado atual, não o histórico.
   *
   * Sem checagem de papel na tela de propósito. A RPC é `security invoker` e a
   * policy `auditoria_leitura` (`sou_gestor()`) devolve zero linhas para quem
   * não é gestor — então o bloco simplesmente informa que não há trilha
   * visível, em vez de a tela decidir uma permissão que é do banco.
   */
  const blocoTrilha = (m: MudancaEnriquecida): HTMLElement => {
    if (trilhaAberta !== m.id) {
      return h(
        "div",
        {},
        h(
          "button",
          {
            class: "btn btn--sutil btn--sm",
            type: "button",
            on: {
              click: (ev: Event) => {
                ev.stopPropagation();
                trilhaAberta = m.id;
                desenhar();
              },
            },
          },
          "Ver trilha de auditoria",
        ),
      );
    }

    const corpo = h(
      "div",
      { class: "pilha" },
      areaCarregando("Carregando a trilha"),
    );

    void listarTrilha(m.id)
      .then((eventos) => montar(corpo, ...blocoEventos(eventos)))
      .catch((e: unknown) =>
        montar(
          corpo,
          h(
            "span",
            { class: "texto-sutil" },
            e instanceof Error ? e.message : "Falha ao carregar a trilha.",
          ),
        ),
      );

    return corpo;
  };

  const blocoEventos = (eventos: EventoTrilha[]): HTMLElement[] => {
    const cabecalho = h(
      "div",
      { class: "linha-flex" },
      h("h4", { style: "margin:0" }, "Trilha de auditoria"),
      h("span", { class: "empurra" }),
      h(
        "button",
        {
          class: "btn btn--sutil btn--sm",
          type: "button",
          on: {
            click: (ev: Event) => {
              ev.stopPropagation();
              trilhaAberta = null;
              desenhar();
            },
          },
        },
        "Fechar",
      ),
    );

    if (eventos.length === 0) {
      return [
        cabecalho,
        h(
          "div",
          { class: "campo__ajuda" },
          "Nenhum evento visível. A trilha é restrita a gestor pela policy `auditoria_leitura` — se você não é gestor, ela existe e não é sua para ler.",
        ),
      ];
    }

    return [
      cabecalho,
      ...eventos.map((e) => {
        const diferencas = diferencasDoEvento(e);
        return h(
          "div",
          { class: "cartao cartao--compacto" },
          h(
            "div",
            { class: "linha-flex" },
            h("b", {}, rotuloEventoTrilha(e)),
            h("span", { class: "empurra" }),
            h(
              "span",
              { class: "texto-sutil" },
              `${e.autor_nome ?? "sistema"} · ${dataHora(e.ocorrido_em)}`,
            ),
          ),
          ...diferencas.slice(0, 6).map((d) =>
            h(
              "div",
              { class: "campo__ajuda" },
              h("span", { class: "mono" }, d.campo),
              h("span", {}, `: ${d.antes} → ${d.depois}`),
            ),
          ),
          diferencas.length > 6
            ? h(
                "div",
                { class: "campo__ajuda" },
                `e mais ${diferencas.length - 6} campo(s).`,
              )
            : null,
        );
      }),
    ];
  };

  /**
   * Edição do rascunho.
   *
   * Existe porque a mudança nasce quase sempre incompleta: alguém abre o
   * registro na reunião com título e justificativa, e os planos são escritos
   * depois, por quem vai executar. Sem esta edição, a única saída para
   * preencher o rollback seria apagar o rascunho e digitar tudo de novo.
   *
   * Só rascunho é editável aqui de propósito. Depois de submetida, mudar o
   * plano por baixo de um voto de CAB já dado invalidaria o voto sem que o
   * comitê soubesse — para isso existe devolver para rascunho, que é visível.
   */
  const formEditarRascunho = (m: MudancaEnriquecida): HTMLElement => {
    const campos = {
      titulo: m.titulo,
      descricao: m.descricao,
      justificativa: m.justificativa,
      tipo_mudanca: m.tipo_mudanca,
      risco: m.risco,
      plano_implantacao: m.plano_implantacao ?? "",
      plano_rollback: m.plano_rollback ?? "",
      plano_teste: m.plano_teste ?? "",
      comunicado: m.comunicado ?? "",
    };

    const texto = (
      rotulo: string,
      chave: keyof typeof campos,
      ajuda: string,
    ): HTMLElement => {
      const entrada = h("textarea", {
        class: "area-texto",
        style: "min-height:70px",
        on: {
          input: (ev: Event) => {
            campos[chave] = (ev.target as HTMLTextAreaElement).value as never;
          },
        },
      }) as HTMLTextAreaElement;
      entrada.value = String(campos[chave]);
      return h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        entrada,
        h("span", { class: "campo__ajuda" }, ajuda),
      );
    };

    const selecao = <T extends string>(
      rotulo: string,
      atual: T,
      opcoes: Array<{ valor: T; texto: string }>,
      aoMudar: (v: T) => void,
    ): HTMLElement => {
      const sel = h(
        "select",
        {
          class: "selecao",
          on: {
            change: (ev: Event) =>
              aoMudar((ev.target as HTMLSelectElement).value as T),
          },
        },
        ...opcoes.map((o) => h("option", { value: o.valor }, o.texto)),
      ) as HTMLSelectElement;
      sel.value = atual;
      return h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        sel,
      );
    };

    return h(
      "div",
      { class: "cartao cartao--compacto" },
      h("h4", { style: "margin:0" }, `Editar ${m.codigo}`),
      h(
        "div",
        { class: "grade-campos" },
        selecao<TipoMudanca>(
          "Tipo",
          campos.tipo_mudanca,
          (Object.keys(ROTULOS_TIPO_MUDANCA) as TipoMudanca[]).map((t) => ({
            valor: t,
            texto: ROTULOS_TIPO_MUDANCA[t],
          })),
          (v) => {
            campos.tipo_mudanca = v;
          },
        ),
        selecao<RiscoMudanca>(
          "Risco",
          campos.risco,
          (Object.keys(ROTULOS_RISCO) as RiscoMudanca[]).map((r) => ({
            valor: r,
            texto: ROTULOS_RISCO[r],
          })),
          (v) => {
            campos.risco = v;
          },
        ),
      ),
      texto(
        "Plano de implantação",
        "plano_implantacao",
        "Obrigatório para submeter.",
      ),
      texto(
        "Plano de rollback",
        "plano_rollback",
        "Obrigatório para submeter — é o que o banco cobra na transição.",
      ),
      texto("Plano de teste", "plano_teste", "Como confirmar que deu certo."),
      texto("Comunicado", "comunicado", "Texto para quem usa o serviço."),
      h(
        "button",
        {
          class: "btn btn--primario btn--sm",
          type: "button",
          on: {
            click: (ev: Event) => {
              ev.stopPropagation();
              void salvarMudanca(m.id, {
                tipo_mudanca: campos.tipo_mudanca,
                risco: campos.risco,
                plano_implantacao: campos.plano_implantacao.trim() || null,
                plano_rollback: campos.plano_rollback.trim() || null,
                plano_teste: campos.plano_teste.trim() || null,
                comunicado: campos.comunicado.trim() || null,
              })
                .then(() => {
                  avisar("Rascunho salvo.", "ok");
                  rascunhoEmEdicao = null;
                  desenhar();
                })
                .catch((e: unknown) =>
                  avisar(e instanceof Error ? e.message : "Falha.", "erro"),
                );
            },
          },
        },
        "Salvar rascunho",
      ),
    );
  };

  /**
   * Agendamento com janela.
   *
   * Dois `datetime-local` em vez de um diálogo de data: a janela é um
   * intervalo, e o banco recusa fim menor que início (`mudanca_janela_coerente`)
   * — vale mostrar os dois campos lado a lado para o erro ficar óbvio antes.
   */
  const formAgendar = (m: MudancaEnriquecida): HTMLElement => {
    const inicio = h("input", {
      class: "entrada",
      type: "datetime-local",
      value: paraCampoLocal(m.janela_inicio),
    }) as HTMLInputElement;
    const fim = h("input", {
      class: "entrada",
      type: "datetime-local",
      value: paraCampoLocal(m.janela_fim),
    }) as HTMLInputElement;

    return h(
      "div",
      { class: "grade-campos" },
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, "Início da janela"),
        inicio,
      ),
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, "Fim da janela"),
        fim,
      ),
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, " "),
        h(
          "button",
          {
            class: "btn btn--primario btn--sm",
            type: "button",
            on: {
              click: (ev: Event) => {
                ev.stopPropagation();
                if (!inicio.value || !fim.value) {
                  return avisar("Preencha início e fim da janela.", "erro");
                }
                if (new Date(fim.value) <= new Date(inicio.value)) {
                  return avisar("O fim da janela tem de ser depois do início.", "erro");
                }
                void agendarMudanca(m.id, {
                  inicio: new Date(inicio.value).toISOString(),
                  fim: new Date(fim.value).toISOString(),
                })
                  .then(() => {
                    avisar("Mudança agendada.", "ok");
                    desenhar();
                  })
                  .catch((e: unknown) =>
                    avisar(e instanceof Error ? e.message : "Falha.", "erro"),
                  );
              },
            },
          },
          m.status === "agendada" ? "Reagendar" : "Agendar",
        ),
      ),
    );
  };

  /**
   * Encerramento.
   *
   * O resultado é a pergunta, e o status sai dele — `revertida` no rollback,
   * `implantada` no resto. O banco cobra o resultado por CHECK, então esta
   * tela não tem como encerrar sem responder.
   */
  const formEncerrar = (m: MudancaEnriquecida): HTMLElement => {
    let resultado: ResultadoMudanca = "sucesso";

    const sel = h(
      "select",
      {
        class: "selecao",
        on: {
          change: (ev: Event) => {
            resultado = (ev.target as HTMLSelectElement)
              .value as ResultadoMudanca;
          },
        },
      },
      ...(Object.keys(ROTULOS_RESULTADO_MUDANCA) as ResultadoMudanca[]).map(
        (r) => h("option", { value: r }, ROTULOS_RESULTADO_MUDANCA[r]),
      ),
    ) as HTMLSelectElement;
    sel.value = "sucesso";

    const notas = h("textarea", {
      class: "area-texto",
      style: "min-height:60px",
      placeholder:
        "O que aconteceu na janela. Se houve ressalva ou rollback, o que exatamente.",
    }) as HTMLTextAreaElement;

    return h(
      "div",
      { class: "pilha" },
      h(
        "div",
        { class: "grade-campos" },
        h(
          "div",
          { class: "campo" },
          h("label", { class: "campo__rotulo" }, "Resultado"),
          sel,
        ),
      ),
      notas,
      h(
        "button",
        {
          class: "btn btn--primario btn--sm",
          type: "button",
          on: {
            click: (ev: Event) => {
              ev.stopPropagation();
              void encerrarMudanca(m.id, resultado, notas.value)
                .then(() => {
                  avisar(
                    m.chamado_numero
                      ? `Mudança encerrada. O chamado ${m.chamado_numero} recebeu a nota.`
                      : "Mudança encerrada.",
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
        "Encerrar implantação",
      ),
    );
  };

  /* ---------- CAB ---------- */

  const painelCab = (todas: MudancaEnriquecida[]): HTMLElement => {
    const pauta = todas.filter((m) => m.status === "aguardando_cab");

    if (pauta.length === 0) {
      return h(
        "div",
        { class: "cartao" },
        h(
          "div",
          { class: "vazio" },
          h("h3", {}, "Pauta do CAB vazia"),
          h(
            "p",
            {},
            "Nada aguardando voto. Mudança normal, e qualquer uma de risco alto, aparece aqui quando sai da avaliação.",
          ),
        ),
      );
    }

    return h(
      "div",
      { class: "pilha" },
      ...pauta.map((m) =>
        h(
          "div",
          { class: "cartao" },
          h(
            "div",
            { class: "linha-flex" },
            h("span", { class: "mono texto-sutil" }, m.codigo),
            h("b", { style: "flex:1;min-width:200px" }, m.titulo),
            h("span", { class: classeRisco(m.risco) }, ROTULOS_RISCO[m.risco]),
            h("span", { class: "tag" }, ROTULOS_TIPO_MUDANCA[m.tipo_mudanca]),
            h(
              "span",
              { class: "texto-sutil" },
              `parada há ${tempoRelativo(m.atualizado_em)}`,
            ),
          ),
          ficha(m),
        ),
      ),
    );
  };

  /* ---------- Janelas ---------- */

  /**
   * O calendário de implantação, para frente.
   *
   * Ordenado por início de janela e não por data de criação: a pergunta que
   * esta aba responde é "o que entra em produção nos próximos dias, e o que
   * cai junto" — e para isso a ordem cronológica é a única útil.
   */
  const painelJanelas = (todas: MudancaEnriquecida[]): HTMLElement => {
    const agendadas = todas
      .filter(
        (m) =>
          m.janela_inicio !== null &&
          ["aprovada", "agendada", "em_implantacao"].includes(m.status),
      )
      .sort((a, b) => (a.janela_inicio ?? "").localeCompare(b.janela_inicio ?? ""));

    if (agendadas.length === 0) {
      return h(
        "div",
        { class: "cartao" },
        h(
          "div",
          { class: "vazio" },
          h("h3", {}, "Nenhuma janela marcada"),
          h(
            "p",
            {},
            "Mudança aprovada ganha janela no bloco de agendamento da ficha. Sem janela, o banco não deixa agendar.",
          ),
        ),
      );
    }

    return h(
      "div",
      { class: "pilha" },
      ...agendadas.map((m) =>
        h(
          "div",
          {
            class: `cartao cartao--clicavel${emJanela(m) ? " cartao--agora" : ""}`,
            on: {
              click: () => {
                aba = "esteira";
                mudancaAberta = m.id;
                desenhar();
              },
            },
          },
          h(
            "div",
            { class: "linha-flex" },
            h("span", { class: "mono texto-sutil" }, m.codigo),
            h("b", { style: "flex:1;min-width:200px" }, m.titulo),
            h(
              "span",
              { class: classeStatusMudanca(m.status) },
              ROTULOS_STATUS_MUDANCA[m.status],
            ),
            m.indisponibilidade_prevista
              ? h("span", { class: "tag tag--alta" }, "indisponibilidade")
              : null,
          ),
          h(
            "div",
            { class: "campo__ajuda" },
            `${dataHora(m.janela_inicio)} até ${dataHora(m.janela_fim)}` +
              (m.servico_nome ? ` · ${m.servico_nome}` : "") +
              (m.responsavel_nome ? ` · ${m.responsavel_nome}` : ""),
          ),
        ),
      ),
    );
  };

  /* ---------- Cadastro ---------- */

  const formNovaMudanca = (): HTMLElement => {
    const rascunho: RascunhoMudanca = {
      titulo: "",
      descricao: "",
      justificativa: "",
      tipo_mudanca: "normal",
      risco: "medio",
      servico_id: "",
      plano_implantacao: "",
      plano_rollback: "",
      plano_teste: "",
      janela_inicio: "",
      janela_fim: "",
      indisponibilidade_prevista: false,
      comunicado: "",
      chamado_id: "",
    };

    const aviso = h("div", { class: "campo__ajuda" });

    // O aviso de CAB muda enquanto a pessoa escolhe tipo e risco. É a mesma
    // ideia da prévia de prioridade na abertura de chamado: a consequência da
    // escolha aparece antes de salvar, não depois.
    const atualizarAviso = (): void => {
      const precisa = exigeCab(rascunho.tipo_mudanca, rascunho.risco);
      montar(
        aviso,
        h(
          "span",
          {},
          precisa
            ? rascunho.tipo_mudanca === "emergencial"
              ? "Emergencial: implanta primeiro e passa pelo CAB depois — o voto fica registrado como aprovação retroativa."
              : "Esta combinação exige voto do CAB antes do agendamento."
            : "Mudança padrão de risco baixo ou médio: dispensa CAB.",
        ),
      );
    };

    const campo = (
      rotulo: string,
      chave: "titulo" | "descricao" | "justificativa" | "plano_implantacao" | "plano_rollback" | "plano_teste" | "comunicado",
      placeholder: string,
      multilinha = false,
    ): HTMLElement =>
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        h(multilinha ? "textarea" : "input", {
          class: multilinha ? "area-texto" : "entrada",
          type: multilinha ? undefined : "text",
          placeholder,
          on: {
            input: (ev: Event) => {
              rascunho[chave] = (
                ev.target as HTMLInputElement | HTMLTextAreaElement
              ).value;
            },
          },
        }),
      );

    const selecao = <T extends string>(
      rotulo: string,
      padrao: T,
      opcoes: Array<{ valor: T; texto: string }>,
      aoMudar: (v: T) => void,
    ): HTMLElement => {
      const sel = h(
        "select",
        {
          class: "selecao",
          on: {
            change: (ev: Event) => {
              aoMudar((ev.target as HTMLSelectElement).value as T);
              atualizarAviso();
            },
          },
        },
        ...opcoes.map((o) => h("option", { value: o.valor }, o.texto)),
      ) as HTMLSelectElement;
      sel.value = padrao;
      return h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        sel,
      );
    };

    atualizarAviso();

    return h(
      "form",
      {
        class: "cartao",
        on: {
          submit: (ev: Event) => {
            ev.preventDefault();

            if (rascunho.titulo.trim().length < 5) {
              return avisar("Descreva a mudança no título.", "erro");
            }
            if (rascunho.descricao.trim().length < 10) {
              return avisar("Explique o que muda.", "erro");
            }
            if (rascunho.justificativa.trim().length < 10) {
              return avisar(
                "A justificativa é obrigatória — é o texto que sustenta a mudança na revisão depois.",
                "erro",
              );
            }

            void criarMudanca(rascunho, perfil)
              .then((m) => {
                avisar(
                  `Mudança ${m.codigo} criada como rascunho.`,
                  "ok",
                );
                formAberto = false;
                aba = "esteira";
                mudancaAberta = m.id;
                desenhar();
              })
              .catch((e: unknown) =>
                avisar(e instanceof Error ? e.message : "Falha.", "erro"),
              );
          },
        },
      },
      h("h3", { style: "margin-top:0" }, "Nova mudança"),
      h(
        "p",
        { class: "texto-sutil" },
        "Nasce como rascunho. Para submeter, o plano de implantação e o de rollback têm de estar escritos — pode ser agora ou depois.",
      ),
      h(
        "div",
        { class: "grade-campos" },
        campo("Título", "titulo", "Ex.: Atualizar o PostgreSQL do ERP para 15.6"),
        selecao<TipoMudanca>(
          "Tipo",
          "normal",
          (Object.keys(ROTULOS_TIPO_MUDANCA) as TipoMudanca[]).map((t) => ({
            valor: t,
            texto: ROTULOS_TIPO_MUDANCA[t],
          })),
          (v) => {
            rascunho.tipo_mudanca = v;
          },
        ),
        selecao<RiscoMudanca>(
          "Risco",
          "medio",
          (Object.keys(ROTULOS_RISCO) as RiscoMudanca[]).map((r) => ({
            valor: r,
            texto: ROTULOS_RISCO[r],
          })),
          (v) => {
            rascunho.risco = v;
          },
        ),
        selecao<string>(
          "Serviço afetado",
          "",
          [
            { valor: "", texto: "Sem serviço de catálogo" },
            ...listarServicos().map((s) => ({ valor: s.id, texto: s.nome })),
          ],
          (v) => {
            rascunho.servico_id = v;
          },
        ),
      ),
      aviso,
      campo(
        "O que muda",
        "descricao",
        "O que exatamente será alterado, em que ambiente.",
        true,
      ),
      campo(
        "Por que muda",
        "justificativa",
        "O problema que esta mudança resolve. É o que sustenta a decisão seis meses depois.",
        true,
      ),
      campo(
        "Plano de implantação",
        "plano_implantacao",
        "Os passos, na ordem. Quem for executar às 3h da manhã vai ler isto.",
        true,
      ),
      campo(
        "Plano de rollback",
        "plano_rollback",
        "Como voltar atrás. Mudança sem caminho de volta não é controlada — e o banco recusa submeter sem isto.",
        true,
      ),
      campo(
        "Plano de teste",
        "plano_teste",
        "Como saber que deu certo depois de aplicar.",
        true,
      ),
      h(
        "label",
        { class: "escolha" },
        h("input", {
          type: "checkbox",
          on: {
            change: (ev: Event) => {
              rascunho.indisponibilidade_prevista = (
                ev.target as HTMLInputElement
              ).checked;
            },
          },
        }),
        h(
          "span",
          {},
          h("span", { class: "escolha__titulo" }, "Prevê indisponibilidade"),
          h(
            "span",
            { class: "campo__ajuda" },
            "Marcado, a janela precisa de comunicado para quem usa o serviço.",
          ),
        ),
      ),
      campo(
        "Comunicado",
        "comunicado",
        "O texto que vai para quem usa o serviço, se houver parada.",
        true,
      ),
      h(
        "button",
        { class: "btn btn--primario", type: "submit" },
        "Criar rascunho",
      ),
    );
  };

  desenhar();
}
