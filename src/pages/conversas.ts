/** Conversas — canal por equipe mais o canal geral. */

import { esqueleto } from "@/components/esqueleto";
import { avisar, h, montar } from "@/lib/dom";
import { listarDiretorioMencoes } from "@/lib/api";
import {
  assinarCanal,
  encerrarAssinatura,
  enviarMensagem,
  excluirMensagem,
  listarCanais,
  listarMensagens,
  marcarLido,
  mesmoBloco,
  rotuloDia,
} from "@/lib/chat";
import { criarAvatar } from "@/components/avatar";
import { criarCampoMencao, type CampoMencao } from "@/components/campo-mencao";
import { insigniaHierarquia } from "@/components/insignia";
import { bolinha, repintarBolinhas } from "@/components/presenca";
import { aoMudarPresenca, quantosOnline } from "@/lib/presenca";
import { somarNaoLido } from "@/lib/marcador-aba";
import {
  avisarNavegador,
  desligar as desligarAvisos,
  estado as estadoAvisos,
  ligar as ligarAvisos,
} from "@/lib/aviso-navegador";
import { renderizarTexto } from "@/components/texto-mencao";
import { confirmar } from "@/components/dialogo";
import { criarDemanda, ROTULOS_PRIORIDADE, ROTULOS_TIPO } from "@/lib/demandas";
import { navegar } from "@/lib/router";
import type {
  CanalComContagem,
  MensagemEnriquecida,
  Perfil,
  PessoaMencao,
  PrioridadeDemanda,
  RascunhoDemanda,
  TipoDemanda,
} from "@/types/dominio";

export function renderizarConversas(alvo: HTMLElement, perfil: Perfil): void {
  let canais: CanalComContagem[] = [];
  let diretorio: PessoaMencao[] = [];
  let canalAtivo: CanalComContagem | null = null;
  let mensagens: MensagemEnriquecida[] = [];
  let campo: CampoMencao | null = null;
  // Mensagem que está sendo convertida em demanda, se houver.
  let convertendo: string | null = null;

  const listaCanais = h("aside", { class: "conversa__canais" });
  const thread = h("div", { class: "conversa__thread" });
  const rolagem = h("div", { class: "conversa__rolagem" });
  const rodape = h("div", { class: "conversa__composer" });

  const contagemOnline = h("span", {
    class: "conversa__online",
    title: "Pessoas com a Central Green aberta agora",
  });

  /**
   * Interruptor dos avisos.
   *
   * A permissão é pedida daqui, num clique — pedir no carregamento é o
   * caminho mais curto para o "Bloquear", e a recusa do navegador é
   * definitiva: não há como pedir de novo pela página.
   */
  const botaoAvisos = h("button", {
    class: "btn btn--sm btn--sutil",
    type: "button",
  });

  const montarBotaoAvisos = (): void => {
    const st = estadoAvisos();
    const textos: Record<string, [string, string]> = {
      indisponivel: ["Avisos indisponíveis", "Este navegador não os suporta"],
      negado: [
        "Avisos bloqueados",
        "Libere nas permissões do site, no ícone à esquerda da barra de endereço",
      ],
      desligado: [
        "Ativar avisos",
        "Receber notificação quando chegar mensagem",
      ],
      ligado: ["Avisos ligados", "Clique para desligar"],
    };
    const [rotulo, dica] = textos[st] as [string, string];

    botaoAvisos.textContent = rotulo;
    botaoAvisos.title = dica;
    botaoAvisos.disabled = st === "indisponivel" || st === "negado";
    botaoAvisos.classList.toggle("btn--primario", st === "ligado");
  };

  botaoAvisos.addEventListener("click", () => {
    if (estadoAvisos() === "ligado") {
      desligarAvisos();
      montarBotaoAvisos();
      avisar("Avisos do navegador desligados.", "info");
      return;
    }
    void ligarAvisos().then((st) => {
      montarBotaoAvisos();
      if (st === "ligado") avisar("Avisos do navegador ligados.", "ok");
      else if (st === "negado") {
        avisar(
          "O navegador bloqueou os avisos. Libere nas permissões do site.",
          "erro",
        );
      }
    });
  });

  montarBotaoAvisos();

  const montarContagemOnline = (): void => {
    montar(
      contagemOnline,
      h("span", { class: "presenca presenca--online" }),
      `${quantosOnline()} online`,
    );
  };
  montarContagemOnline();

  // `conversas-ds` é o que é só desta tela (painéis, bolha, composer, lista de
  // canais); campo/entrada/botão vêm do `formulario-ds`, os selos do
  // `chips-ds` e o estado vazio do `feedback-ds`. Opt-in por página.
  montar(
    alvo,
    h(
      "div",
      {
        class:
          "conversa conversas-ds formulario-ds chips-ds feedback-ds tabela-ds",
      },
      listaCanais,
      thread,
    ),
  );

  // Alguém entrar ou sair repinta só as bolinhas. Redesenhar a conversa
  // saltaria o scroll e apagaria o texto que estivesse sendo digitado.
  const pararPresenca = aoMudarPresenca(() => {
    repintarBolinhas(thread);
    montarContagemOnline();
  });

  // Sair da tela derruba o websocket e a escuta de presença.
  const aoSair = (): void => {
    encerrarAssinatura();
    pararPresenca();
    window.removeEventListener("hashchange", aoSair);
  };
  window.addEventListener("hashchange", aoSair);

  /* ---------- Carga inicial ---------- */

  // `allSettled`, não `all`.
  //
  // Com `Promise.all`, uma falha no diretório derrubava a lista de canais
  // junto: o `.catch` mostrava um toast e a tela ficava sem canal nenhum —
  // indistinguível de "não existe canal". São coisas diferentes e o diretório
  // é a menos importante das duas: ele só enfeita a @menção, enquanto a lista
  // de canais é a tela inteira.
  void Promise.allSettled([listarCanais(), listarDiretorioMencoes()])
    .then(([resCanais, resDiretorio]) => {
      if (resCanais.status === "rejected") {
        const erro: unknown = resCanais.reason;
        avisar(
          erro instanceof Error ? erro.message : "Falha ao carregar canais.",
          "erro",
        );
        montar(
          alvo,
          h(
            "div",
            { class: "cartao" },
            h(
              "div",
              { class: "vazio" },
              h("h3", {}, "Não deu para carregar as conversas"),
              h(
                "p",
                {},
                erro instanceof Error
                  ? erro.message
                  : "Tente novamente em alguns instantes.",
              ),
            ),
          ),
        );
        return;
      }

      canais = resCanais.value;
      // Diretório que falhou degrada a menção, não a tela: `PessoaMencao` tem
      // os campos extras opcionais justamente para tolerar isto.
      diretorio =
        resDiretorio.status === "fulfilled" ? resDiretorio.value : [];

      if (canais.length === 0) {
        montar(
          alvo,
          h(
            "div",
            { class: "cartao" },
            h(
              "div",
              { class: "vazio" },
              h("h3", {}, "Nenhum canal disponível"),
              h(
                "p",
                {},
                "Canais são criados automaticamente para cada equipe. Se você não vê nenhum, peça a um coordenador para vincular você a uma equipe na tela Pessoas.",
              ),
            ),
          ),
        );
        return;
      }

      desenharCanais();
      // Abre o canal da própria equipe quando existir; senão, o Geral.
      const daMinhaEquipe = canais.find(
        (c) => perfil.equipe_id && c.equipe_id === perfil.equipe_id,
      );
      abrirCanal(daMinhaEquipe ?? canais[0]!);
    })
    .catch((e: unknown) =>
      avisar(e instanceof Error ? e.message : "Falha ao carregar.", "erro"),
    );

  /* ---------- Lista de canais ---------- */

  function desenharCanais(): void {
    const grupo = (
      titulo: string,
      itens: CanalComContagem[],
    ): HTMLElement | null =>
      itens.length === 0
        ? null
        : h(
            "div",
            { class: "conversa__grupo" },
            h("div", { class: "rail__rotulo" }, titulo),
            ...itens.map((c, i) =>
              h(
                "button",
                {
                  class: `conversa__canal${canalAtivo?.id === c.id ? " conversa__canal--ativo" : ""}`,
                  type: "button",
                  // Índice, não cor: a paleta mora em `components.css`.
                  //
                  // Geral fica com o verde da marca — ele não é uma equipe
                  // entre as outras, é o canal de todas. As equipes recebem a
                  // paleta pela posição na lista, que já vem ordenada por
                  // nome: posição garante cor distinta para a vizinha, o que
                  // um hash do slug não garantiria (seis canais em seis
                  // baldes colidem com facilidade). O preço é que uma equipe
                  // nova desloca a cor de quem vem depois dela no alfabeto.
                  dataset: {
                    cor: c.tipo === "geral" ? "geral" : String(i % 6),
                  },
                  on: { click: () => abrirCanal(c) },
                },
                h("span", { class: "conversa__hash" }, "#"),
                h("span", { class: "conversa__nome" }, c.nome),
                c.nao_lidas > 0
                  ? h(
                      "span",
                      { class: "conversa__badge" },
                      c.nao_lidas > 99 ? "99+" : String(c.nao_lidas),
                    )
                  : null,
              ),
            ),
          );

    montar(
      listaCanais,
      grupo(
        "Aberto a todos",
        canais.filter((c) => c.tipo === "geral"),
      ),
      grupo(
        "Equipes",
        canais.filter((c) => c.tipo === "equipe"),
      ),
    );
  }

  /* ---------- Abertura de canal ---------- */

  function abrirCanal(canal: CanalComContagem): void {
    canalAtivo = canal;
    mensagens = [];
    desenharCanais();
    montar(rolagem, esqueleto("lista"));
    montarThread();

    void listarMensagens(canal.id)
      .then((lista) => {
        mensagens = lista;
        desenharMensagens();
        rolarParaFim();
        return marcarLido(canal.id);
      })
      .then(() => {
        canal.nao_lidas = 0;
        desenharCanais();
      })
      .catch((e: unknown) =>
        avisar(e instanceof Error ? e.message : "Falha ao abrir.", "erro"),
      );

    assinarCanal(
      canal.id,
      (nova) => {
        if (mensagens.some((m) => m.id === nova.id)) return;
        mensagens.push(nova);
        desenharMensagens();
        rolarParaFim();
        void marcarLido(canal.id);

        // Nunca para a própria mensagem: quem escreveu já sabe. O módulo cala
        // sozinho quando a aba está à vista.
        if (nova.autor_id === perfil.id) return;
        somarNaoLido();
        avisarNavegador({
          titulo: `${nova.autor_nome} em #${canal.nome}`,
          corpo: nova.corpo.slice(0, 140),
          destino: "conversas",
          chave: `canal:${canal.id}`,
        });
      },
      // Reconectou. O Realtime não tem histórico: o que chegou enquanto o
      // socket estava caído não passa por aqui, então a lista é buscada de
      // novo em vez de continuar de onde parou.
      () => {
        void listarMensagens(canal.id)
          .then((lista) => {
            // A pessoa pode ter trocado de canal durante a queda.
            if (canalAtivo?.id !== canal.id) return;
            mensagens = lista;
            desenharMensagens();
            rolarParaFim();
            return marcarLido(canal.id);
          })
          .catch(() => {
            // Silencioso de propósito: a reconexão é automática e vai tentar
            // outra vez. Um toast por oscilação de rede seria pior que a
            // falha em si.
          });
      },
    );
  }

  function montarThread(): void {
    if (!canalAtivo) return;

    campo = criarCampoMencao(diretorio, {
      placeholder: `Mensagem para #${canalAtivo.nome}. Use @ para chamar alguém.`,
      rotulo: "Nova mensagem",
      // Sem alça de arrastar no composer (ver `conversas-ds.css`), então o
      // campo tem de abrir sozinho conforme a mensagem cresce.
      autoCrescer: true,
    });

    const enviar = h(
      "button",
      { class: "btn btn--primario", type: "button" },
      "Enviar",
    );

    const disparar = (): void => {
      if (!campo || !canalAtivo) return;
      const corpo = campo.valor();
      if (!corpo) return;

      enviar.disabled = true;
      void enviarMensagem(canalAtivo.id, corpo, campo.mencionados(), perfil)
        .then((nova) => {
          // O websocket também entrega esta mensagem; o guarda por id em
          // `abrirCanal` evita a duplicata.
          if (!mensagens.some((m) => m.id === nova.id)) {
            mensagens.push(nova);
            desenharMensagens();
            rolarParaFim();
          }
          campo?.limpar();
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha ao enviar.", "erro"),
        )
        .finally(() => {
          enviar.disabled = false;
          campo?.focar();
        });
    };

    enviar.addEventListener("click", disparar);

    // Enter envia, Shift+Enter quebra linha.
    campo.elemento.addEventListener("keydown", (ev) => {
      const evento = ev as KeyboardEvent;
      if (evento.key === "Enter" && !evento.shiftKey && !evento.isComposing) {
        const lista = campo?.elemento.querySelector(".mencao__lista");
        // Enter durante a lista de menção seleciona a pessoa, não envia.
        if (lista instanceof HTMLElement && lista.style.display !== "none") {
          return;
        }
        evento.preventDefault();
        disparar();
      }
    });

    montar(
      rodape,
      // Moldura única em volta do campo e das ações — é o `root` do
      // `MessageComposer` do DS, que acende no `focus-within` em vez de cada
      // pedaço ter borda própria.
      h(
        "div",
        { class: "conversa__moldura" },
        campo.elemento,
        h(
          "div",
          { class: "conversa__acoes linha-flex" },
          h(
            "span",
            { class: "texto-sutil" },
            "Enter envia · Shift+Enter quebra linha",
          ),
          h("span", { class: "empurra" }),
          enviar,
        ),
      ),
    );

    montar(
      thread,
      h(
        "header",
        { class: "conversa__cabecalho" },
        h("span", { class: "conversa__hash" }, "#"),
        h("b", {}, canalAtivo.nome),
        canalAtivo.descricao
          ? h("span", { class: "texto-sutil" }, canalAtivo.descricao)
          : null,
        h("span", { class: "empurra" }),
        botaoAvisos,
        contagemOnline,
        h(
          "span",
          { class: "tag tag--verde" },
          canalAtivo.tipo === "geral" ? "toda a empresa" : "equipe",
        ),
      ),
      rolagem,
      rodape,
    );

    campo.focar();
  }

  /* ---------- Mensagens ---------- */

  function desenharMensagens(): void {
    if (mensagens.length === 0) {
      montar(
        rolagem,
        h(
          "div",
          { class: "vazio" },
          h("h3", {}, "Conversa vazia"),
          h(
            "p",
            {},
            "Ninguém escreveu aqui ainda. Comece você — o histórico fica registrado para quem entrar na equipe depois.",
          ),
        ),
      );
      return;
    }

    const itens: HTMLElement[] = [];
    let diaAnterior = "";

    mensagens.forEach((m, i) => {
      const dia = rotuloDia(m.criado_em);
      if (dia !== diaAnterior) {
        itens.push(h("div", { class: "conversa__dia" }, h("span", {}, dia)));
        diaAnterior = dia;
      }

      const agrupada = mesmoBloco(mensagens[i - 1], m) && dia === diaAnterior;
      itens.push(cartaoMensagem(m, agrupada));
    });

    montar(rolagem, ...itens);
  }

  function cartaoMensagem(
    m: MensagemEnriquecida,
    agrupada: boolean,
  ): HTMLElement {
    const hora = new Date(m.criado_em).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const podeExcluir =
      m.autor_id === perfil.id ||
      perfil.papel === "admin" ||
      perfil.hierarquia === "coordenador";

    return h(
      "div",
      {
        class: `msg${agrupada ? " msg--agrupada" : ""}${m.autor_id === perfil.id ? " msg--minha" : ""}`,
      },
      // Agrupada não repete o avatar: fica o vão da coluna, que é o que
      // costura o bloco visualmente. A hora não some com ele porque agora vive
      // no rodapé da bolha, em toda mensagem.
      agrupada
        ? h("div", { class: "msg__avatar-vao" })
        : h(
            "div",
            { class: "msg__avatar-caixa" },
            // Cor do perfil, a mesma que o diretório e o quadro do setor
            // mostram para esta pessoa. A hierarquia continua dita pela
            // insígnia ao lado do nome, dentro da bolha.
            criarAvatar({
              nome: m.autor_nome,
              id: m.autor_id,
              tamanho: "lg",
            }),
            bolinha(m.autor_id, m.autor_nome),
          ),
      h(
        "div",
        { class: "msg__corpo" },
        agrupada
          ? null
          : h(
              "div",
              { class: "msg__cabecalho" },
              insigniaHierarquia(m.autor_hierarquia, {
                nome: m.autor_nome,
              }),
              h("b", {}, m.autor_nome),
              m.autor_cargo
                ? h("span", { class: "texto-sutil" }, m.autor_cargo)
                : null,

              h(
                "span",
                { class: "msg__acoes" },
                h(
                  "button",
                  {
                    class: "msg__acao",
                    type: "button",
                    title: "Transformar em demanda na fila desta equipe",
                    on: {
                      click: () => {
                        convertendo = convertendo === m.id ? null : m.id;
                        desenharMensagens();
                      },
                    },
                  },
                  "virar demanda",
                ),
                podeExcluir
                  ? h(
                      "button",
                      {
                        class: "msg__excluir",
                        type: "button",
                        title: "Excluir mensagem",
                        on: {
                          click: () => {
                            void confirmar({
                              titulo: "Excluir esta mensagem?",
                              texto:
                                m.corpo.length > 120
                                  ? `${m.corpo.slice(0, 120)}…`
                                  : m.corpo,
                              rotuloConfirmar: "Excluir",
                              perigo: true,
                            }).then((segue) => {
                              if (!segue) return;
                              void excluirMensagem(m.id)
                                .then(() => {
                                  mensagens = mensagens.filter(
                                    (x) => x.id !== m.id,
                                  );
                                  desenharMensagens();
                                })
                                .catch((e: unknown) =>
                                  avisar(
                                    e instanceof Error ? e.message : "Falha.",
                                    "erro",
                                  ),
                                );
                            });
                          },
                        },
                      },
                      "×",
                    )
                  : null,
              ),
            ),
        renderizarTexto(m.corpo, diretorio, {
          classe: "msg__texto",
          aoAbrirRegistro: navegar,
        }),
        // `meta` da `MessageBubble` do DS: hora no canto inferior. Sem o
        // `MessageAck` ao lado — aqui não há entrega nem leitura por
        // destinatário, e um glifo de status que não mede nada mente.
        h("div", { class: "msg__meta" }, hora),
        convertendo === m.id ? formDemanda(m) : null,
      ),
    );
  }

  /**
   * Converte a mensagem em demanda, já direcionada à fila da equipe dona do
   * canal.
   */
  function formDemanda(m: MensagemEnriquecida): HTMLElement {
    const primeiraLinha = m.corpo.split("\n")[0] ?? m.corpo;
    const rascunho: RascunhoDemanda = {
      setor_id: perfil.setor_id ?? "",
      titulo: primeiraLinha.slice(0, 110),
      descricao: m.corpo,
      tipo: "melhoria",
      area: canalAtivo?.tipo === "equipe" ? (canalAtivo.nome ?? "") : "",
      prioridade: "media",
      data_inicio_prevista: "",
      data_fim_prevista: "",
      esforco_horas: "",
      criterios_aceite: "",
      // A conversa vira demanda com um clique; a tag entra depois, na
      // ficha.
      tags: [],
    };

    const titulo = h("input", {
      class: "entrada",
      type: "text",
      value: rascunho.titulo,
      on: {
        input: (ev: Event) => {
          rascunho.titulo = (ev.target as HTMLInputElement).value;
        },
      },
    });

    const prazo = h("input", {
      class: "entrada",
      type: "date",
      on: {
        input: (ev: Event) => {
          rascunho.data_fim_prevista = (ev.target as HTMLInputElement).value;
        },
      },
    });

    const selTipo = seletor(
      (Object.keys(ROTULOS_TIPO) as TipoDemanda[]).map((t) => [
        t,
        ROTULOS_TIPO[t],
      ]),
      "melhoria",
      (v) => {
        rascunho.tipo = v as TipoDemanda;
      },
    );

    const selPri = seletor(
      (Object.keys(ROTULOS_PRIORIDADE) as PrioridadeDemanda[]).map((p) => [
        p,
        ROTULOS_PRIORIDADE[p],
      ]),
      "media",
      (v) => {
        rascunho.prioridade = v as PrioridadeDemanda;
      },
    );

    const criar = h(
      "button",
      { class: "btn btn--primario btn--sm", type: "button" },
      "Criar na fila",
    );

    criar.addEventListener("click", () => {
      if (rascunho.titulo.trim().length < 6) {
        return avisar("O título precisa de ao menos 6 caracteres.", "erro");
      }
      if (rascunho.descricao.trim().length < 20) {
        return avisar(
          "A mensagem é curta demais para virar demanda. Descreva melhor e converta a nova mensagem.",
          "erro",
        );
      }

      criar.disabled = true;
      void criarDemanda(rascunho, perfil, canalAtivo?.equipe_id ?? null)
        .then(async (nova) => {
          avisar(
            `${nova.codigo} criada na fila ${canalAtivo?.nome ?? "geral"}.`,
            "ok",
          );
          convertendo = null;
          // Deixa o rastro no canal: quem leu a conversa encontra a
          // demanda.
          if (canalAtivo) {
            await enviarMensagem(
              canalAtivo.id,
              `${nova.codigo} criada a partir da mensagem acima — ${nova.titulo}`,
              [],
              perfil,
            );
          }
          desenharMensagens();
        })
        .catch((e: unknown) => {
          avisar(e instanceof Error ? e.message : "Falha ao criar.", "erro");
          criar.disabled = false;
        });
    });

    return h(
      "div",
      { class: "msg__conversao" },
      h(
        "div",
        { class: "texto-sutil", style: "margin-bottom:var(--s-2)" },
        canalAtivo?.tipo === "equipe"
          ? `Vai para a fila da equipe ${canalAtivo.nome}.`
          : "O canal geral não tem fila — a demanda entra sem equipe e um gestor direciona depois.",
      ),
      h("div", { class: "campo" }, titulo),
      h(
        "div",
        { class: "grade-campos" },
        h("div", { class: "campo" }, selTipo),
        h("div", { class: "campo" }, selPri),
        h("div", { class: "campo" }, prazo),
      ),
      h(
        "div",
        { class: "linha-flex" },
        h(
          "span",
          { class: "texto-sutil" },
          "Com prazo, já nasce disponível para alguém pegar.",
        ),
        h("span", { class: "empurra" }),
        h(
          "button",
          {
            class: "btn btn--sm",
            type: "button",
            on: {
              click: () => {
                convertendo = null;
                desenharMensagens();
              },
            },
          },
          "Cancelar",
        ),
        criar,
      ),
    );
  }

  function rolarParaFim(): void {
    window.requestAnimationFrame(() => {
      rolagem.scrollTop = rolagem.scrollHeight;
    });
  }
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
