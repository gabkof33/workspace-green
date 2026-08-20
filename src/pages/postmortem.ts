/** Post-mortem de um incidente — leitura para todos, edição para o dono. */

import { aguardando } from "@/components/esqueleto";
import { confirmar } from "@/components/dialogo";
import { listarDiretorio, podeGerirPessoas } from "@/lib/api";
import { avisar, h, montar } from "@/lib/dom";
import { dataCurta, dataHora } from "@/lib/formato";
import {
  duracaoIncidente,
  MINIMO_CAUSA,
  obterPostMortem,
  pendenciasParaPublicar,
  podeEditar,
  salvarPostMortem,
} from "@/lib/postmortem";
import { navegar } from "@/lib/router";
import type {
  AcaoCorretiva,
  EventoPostMortem,
  PessoaDiretorio,
  Perfil,
  PostMortem,
} from "@/types/dominio";

export function renderizarPostMortem(
  alvo: HTMLElement,
  perfil: Perfil,
  id: string,
): void {
  const area = h("div", { class: "pilha" });
  montar(alvo, area);
  aguardando(area, "painel");

  // Só gestor pode trocar o responsável: a política de escrita exige que o
  // resto mantenha o próprio id, então o select não teria o que oferecer.
  const gestor = podeGerirPessoas(perfil);

  void Promise.all([
    obterPostMortem(id),
    gestor ? listarDiretorio() : Promise.resolve([]),
  ])
    .then(([pm, pessoas]) => {
      if (!pm) {
        montar(
          area,
          h(
            "div",
            { class: "vazio" },
            h("h3", {}, "Post-mortem não encontrado"),
            h(
              "p",
              {},
              "Ou ele não existe, ou é um rascunho de outra pessoa — rascunho só aparece para quem escreve.",
            ),
            h(
              "button",
              {
                class: "btn",
                type: "button",
                on: { click: () => navegar("postmortems") },
              },
              "Voltar à lista",
            ),
          ),
        );
        return;
      }
      desenhar(area, pm, perfil, gestor, pessoas);
    })
    .catch((e: unknown) =>
      avisar(
        e instanceof Error ? e.message : "Falha ao abrir o post-mortem.",
        "erro",
      ),
    );
}

function desenhar(
  area: HTMLElement,
  original: PostMortem,
  perfil: Perfil,
  gestor: boolean,
  pessoas: PessoaDiretorio[],
): void {
  const editavel = podeEditar(original, perfil.id, gestor);

  // Rascunho local: as listas são editadas na memória e vão ao banco num
  // salvamento só. Gravar a cada tecla brigaria com o foco, como já brigou no
  // formulário de abertura.
  let pm: PostMortem = { ...original };
  let sujo = false;

  const redesenhar = (): void => {
    montar(
      area,
      cabecalho(),
      resumo(),
      linhaDoTempo(),
      analise(),
      aprendizado(),
      acoes(),
      rodape(),
    );
  };

  const mexeu = (): void => {
    sujo = true;
    redesenhar();
  };

  /* ---------- Cabeçalho ---------- */

  const cabecalho = (): HTMLElement =>
    h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h(
          "span",
          { class: "cartao__titulo" },
          pm.publicado ? "Post-mortem publicado" : "Rascunho",
        ),
        h(
          "span",
          {
            class: `selo ${pm.publicado ? "selo--publicado" : "selo--rascunho"}`,
          },
          pm.publicado ? "publicado" : "rascunho",
        ),
      ),
      editavel
        ? campo(
            "Título",
            entradaTexto(pm.titulo, (v) => {
              pm.titulo = v;
              sujo = true;
            }),
            "Uma frase que identifique o incidente para quem não o viveu.",
          )
        : h("h2", { class: "pm__titulo" }, pm.titulo),
      pm.chamado_id
        ? h(
            "button",
            {
              class: "btn btn--sm",
              type: "button",
              on: {
                click: () => navegar(`chamado/${pm.chamado_id ?? ""}`),
              },
            },
            `Chamado ${pm.chamado_numero ?? ""} — ${pm.chamado_titulo ?? ""}`,
          )
        : h(
            "span",
            { class: "texto-sutil" },
            "Sem chamado vinculado — post-mortem avulso.",
          ),
    );

  /* ---------- Resumo ---------- */

  const resumo = (): HTMLElement =>
    h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Resumo do incidente"),
      ),
      editavel
        ? h(
            "div",
            { class: "grade-2" },
            campo(
              "Duração em minutos",
              entradaNumero(pm.duracao_minutos, (v) => {
                pm.duracao_minutos = v;
                sujo = true;
              }),
              "Do início do impacto até o restabelecimento.",
            ),
            campo(
              "Prazo das ações",
              entradaData(pm.prazo, (v) => {
                pm.prazo = v;
                sujo = true;
              }),
              "Quando as ações corretivas devem estar concluídas.",
            ),
          )
        : h(
            "div",
            { class: "grade-2" },
            def("Duração", duracaoIncidente(pm.duracao_minutos)),
            def("Prazo das ações", dataCurta(pm.prazo)),
          ),
      editavel
        ? campo(
            "Impacto",
            areaTexto(
              pm.impacto,
              "Quem foi afetado e como. Número de pessoas, setores, serviços parados.",
              (v) => {
                pm.impacto = v;
                sujo = true;
              },
            ),
          )
        : bloco("Impacto", pm.impacto),
      h(
        "div",
        { class: "grade-2", style: "margin-top:var(--s-3)" },
        def("Responsável", pm.responsavel_nome),
        def("Atualizado", dataHora(pm.atualizado_em)),
      ),
      gestor && pessoas.length > 0
        ? campo(
            "Trocar responsável",
            selecao(
              pessoas
                .filter((p) => p.ativo)
                .map((p) => [p.id, p.nome_completo] as [string, string]),
              pm.responsavel_id,
              (v) => {
                pm.responsavel_id = v;
                sujo = true;
              },
            ),
            "Só gestor pode reatribuir — para os outros, a política de escrita exige manter o próprio nome.",
          )
        : null,
    );

  /* ---------- Linha do tempo ---------- */

  const linhaDoTempo = (): HTMLElement => {
    // Ordenada na exibição, não no armazenamento: reordenar enquanto a pessoa
    // digita a hora faria a linha saltar sob o cursor.
    const eventos = [...pm.linha_do_tempo];

    return h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Linha do tempo"),
        h(
          "span",
          { class: "grafico__subtitulo" },
          `${eventos.length} momento${eventos.length === 1 ? "" : "s"}`,
        ),
      ),
      eventos.length === 0
        ? h(
            "p",
            { class: "texto-sutil" },
            "Nada registrado. A linha do tempo é o que permite ver onde a detecção demorou.",
          )
        : h(
            "ol",
            { class: "pm__linha" },
            ...eventos.map((ev, n) =>
              h(
                "li",
                { class: "pm__momento" },
                editavel
                  ? h(
                      "div",
                      { class: "pm__momento-campos" },
                      entradaMomento(ev.quando, (v) => {
                        ev.quando = v;
                        sujo = true;
                      }),
                      entradaTexto(ev.o_que, (v) => {
                        ev.o_que = v;
                        sujo = true;
                      }),
                      botaoRemover(() => {
                        pm.linha_do_tempo.splice(n, 1);
                        mexeu();
                      }),
                    )
                  : h(
                      "div",
                      {},
                      h("span", { class: "pm__quando" }, momentoLegivel(ev)),
                      h("span", {}, ev.o_que),
                    ),
              ),
            ),
          ),
      editavel
        ? h(
            "button",
            {
              class: "btn btn--sm",
              type: "button",
              on: {
                click: () => {
                  pm.linha_do_tempo.push({ quando: "", o_que: "" });
                  mexeu();
                },
              },
            },
            "+ Momento",
          )
        : null,
    );
  };

  /* ---------- Análise ---------- */

  const analise = (): HTMLElement => {
    // Declaração de função, não seta: hoisted, então pode ser chamada aqui em
    // cima e o contador já nasce com o número certo.
    atualizarContador();

    return h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Análise"),
      ),
      editavel
        ? campo(
            "Causa raiz",
            areaTexto(
              pm.causa_raiz ?? "",
              "O que permitiu a falha — configuração, processo, ausência de alerta. Não o sintoma.",
              (v) => {
                pm.causa_raiz = v;
                sujo = true;
                atualizarContador();
              },
            ),
            undefined,
            contador,
          )
        : bloco("Causa raiz", pm.causa_raiz),
      editavel
        ? campo(
            "Como foi detectado",
            areaTexto(
              pm.como_foi_detectado ?? "",
              "Alerta automático, chamado de usuário, alguém percebeu por acaso.",
              (v) => {
                pm.como_foi_detectado = v;
                sujo = true;
              },
            ),
          )
        : bloco("Como foi detectado", pm.como_foi_detectado),
      editavel
        ? marcador(
            "Detectado pelo monitoramento",
            pm.detectado_por_monitoramento === true,
            (v) => {
              pm.detectado_por_monitoramento = v;
              sujo = true;
            },
            "Desmarcado significa que descobrimos pelo usuário — o que já é um achado.",
          )
        : def(
            "Detectado pelo monitoramento",
            pm.detectado_por_monitoramento === true ? "Sim" : "Não",
          ),
    );

    function atualizarContador(): void {
      const n = MINIMO_CAUSA - (pm.causa_raiz ?? "").trim().length;
      contador.textContent =
        n > 0
          ? `Faltam ${n} caracteres para poder publicar`
          : "Suficiente para publicar";
      contador.style.color = n > 0 ? "var(--c-muted)" : "var(--c-ok)";
    }
  };

  const contador = h("span", { class: "campo__contador" });

  /* ---------- Aprendizado ---------- */

  const aprendizado = (): HTMLElement =>
    h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Aprendizado"),
        h(
          "span",
          { class: "grafico__subtitulo" },
          "Sobre o sistema e o processo, não sobre pessoas",
        ),
      ),
      editavel
        ? campo(
            "O que funcionou",
            areaTexto(
              pm.o_que_funcionou ?? "",
              "O que ajudou a encurtar o incidente e vale repetir.",
              (v) => {
                pm.o_que_funcionou = v;
                sujo = true;
              },
            ),
          )
        : bloco("O que funcionou", pm.o_que_funcionou),
      editavel
        ? campo(
            "O que falhou",
            areaTexto(
              pm.o_que_falhou ?? "",
              "O que atrasou a detecção ou a solução.",
              (v) => {
                pm.o_que_falhou = v;
                sujo = true;
              },
            ),
          )
        : bloco("O que falhou", pm.o_que_falhou),
      editavel
        ? campo(
            "Prevenção de reincidência",
            areaTexto(
              pm.prevencao_reincidencia ?? "",
              "O que muda para este incidente não voltar.",
              (v) => {
                pm.prevencao_reincidencia = v;
                sujo = true;
              },
            ),
          )
        : bloco("Prevenção de reincidência", pm.prevencao_reincidencia),
    );

  /* ---------- Ações corretivas ---------- */

  const acoes = (): HTMLElement => {
    const feitas = pm.acoes_corretivas.filter((a) => a.feita).length;

    return h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Ações corretivas"),
        h(
          "span",
          { class: "grafico__subtitulo" },
          pm.acoes_corretivas.length === 0
            ? "Obrigatório ao menos uma para publicar"
            : `${feitas} de ${pm.acoes_corretivas.length} concluída${feitas === 1 ? "" : "s"}`,
        ),
      ),
      pm.acoes_corretivas.length === 0
        ? h(
            "p",
            { class: "texto-sutil" },
            "Post-mortem sem ação corretiva é relatório, não correção. O banco recusa a publicação.",
          )
        : h(
            "div",
            { class: "pilha-fina" },
            ...pm.acoes_corretivas.map((acao, n) =>
              editavel ? acaoEditavel(acao, n) : acaoLida(acao),
            ),
          ),
      editavel
        ? h(
            "button",
            {
              class: "btn btn--sm",
              type: "button",
              on: {
                click: () => {
                  pm.acoes_corretivas.push({
                    o_que: "",
                    responsavel: "",
                    prazo: null,
                    feita: false,
                  });
                  mexeu();
                },
              },
            },
            "+ Ação corretiva",
          )
        : null,
    );
  };

  const acaoEditavel = (acao: AcaoCorretiva, n: number): HTMLElement =>
    h(
      "div",
      { class: "pm__acao" },
      marcadorSimples(acao.feita, (v) => {
        acao.feita = v;
        sujo = true;
      }),
      h(
        "div",
        { class: "pm__acao-campos" },
        entradaTexto(acao.o_que, (v) => {
          acao.o_que = v;
          sujo = true;
        }),
        entradaTexto(
          acao.responsavel,
          (v) => {
            acao.responsavel = v;
            sujo = true;
          },
          "Quem faz",
        ),
        entradaData(acao.prazo ?? "", (v) => {
          acao.prazo = v === "" ? null : v;
          sujo = true;
        }),
      ),
      botaoRemover(() => {
        pm.acoes_corretivas.splice(n, 1);
        mexeu();
      }),
    );

  const acaoLida = (acao: AcaoCorretiva): HTMLElement =>
    h(
      "div",
      { class: "pm__acao" },
      h("span", { class: "pm__marca" }, acao.feita ? "✓" : "○"),
      h(
        "div",
        {},
        h("div", { class: acao.feita ? "pm__feita" : "" }, acao.o_que),
        h(
          "div",
          { class: "texto-sutil" },
          acao.responsavel || "sem responsável",
          acao.prazo ? ` · até ${dataCurta(acao.prazo)}` : "",
        ),
      ),
    );

  /* ---------- Rodapé: salvar e publicar ---------- */

  const rodape = (): HTMLElement | null => {
    if (!editavel) return null;
    const faltas = pendenciasParaPublicar(pm);

    const salvar = (depois?: () => void): void => {
      void salvarPostMortem(pm.id, {
        titulo: pm.titulo,
        duracao_minutos: pm.duracao_minutos,
        impacto: pm.impacto,
        linha_do_tempo: pm.linha_do_tempo,
        causa_raiz: pm.causa_raiz,
        como_foi_detectado: pm.como_foi_detectado,
        detectado_por_monitoramento: pm.detectado_por_monitoramento,
        o_que_funcionou: pm.o_que_funcionou,
        o_que_falhou: pm.o_que_falhou,
        acoes_corretivas: pm.acoes_corretivas,
        prevencao_reincidencia: pm.prevencao_reincidencia,
        responsavel_id: pm.responsavel_id,
        prazo: pm.prazo,
      })
        .then(() => {
          sujo = false;
          avisar("Post-mortem salvo.", "ok");
          if (depois) depois();
          else redesenhar();
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha ao salvar.", "erro"),
        );
    };

    const publicar = (): void => {
      // Salva antes de publicar: publicar o que está no banco enquanto a tela
      // mostra outra coisa é a pior surpresa possível aqui.
      salvar(() => {
        void salvarPostMortem(pm.id, { publicado: true })
          .then(() => {
            pm.publicado = true;
            avisar("Post-mortem publicado para a equipe.", "ok");
            redesenhar();
          })
          .catch((e: unknown) =>
            avisar(
              e instanceof Error ? e.message : "Falha ao publicar.",
              "erro",
            ),
          );
      });
    };

    return h(
      "div",
      { class: "cartao" },
      faltas.length > 0
        ? h(
            "div",
            { class: "aviso" },
            h("span", { class: "aviso__icone" }, "i"),
            h(
              "span",
              {},
              h("b", {}, "Falta para publicar: "),
              faltas.join(" e "),
              ". São regras do banco, não da tela — a publicação seria recusada.",
            ),
          )
        : null,
      h(
        "div",
        { class: "linha-flex" },
        h(
          "button",
          {
            class: `btn${sujo ? " btn--primario" : ""}`,
            type: "button",
            disabled: !sujo,
            on: { click: () => salvar() },
          },
          sujo ? "Salvar alterações" : "Nada a salvar",
        ),
        pm.publicado
          ? h(
              "button",
              {
                class: "btn btn--sm",
                type: "button",
                on: {
                  click: () => {
                    void confirmar({
                      titulo: "Voltar a rascunho?",
                      texto:
                        "O post-mortem sai da vista da equipe e volta a aparecer só para você e para a gestão.",
                    }).then((ok) => {
                      if (!ok) return;
                      void salvarPostMortem(pm.id, { publicado: false })
                        .then(() => {
                          pm.publicado = false;
                          avisar("Voltou a rascunho.", "ok");
                          redesenhar();
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
              "Voltar a rascunho",
            )
          : h(
              "button",
              {
                class: "btn",
                type: "button",
                disabled: faltas.length > 0,
                title:
                  faltas.length > 0 ? `Falta ${faltas.join(" e ")}` : undefined,
                on: { click: publicar },
              },
              "Publicar para a equipe",
            ),
        h(
          "span",
          { class: "texto-sutil empurra" },
          sujo ? "Há alterações não salvas." : "Tudo salvo.",
        ),
      ),
    );
  };

  redesenhar();
}

/* ---------- Peças de formulário ---------- */

function campo(
  rotulo: string,
  controle: HTMLElement,
  ajuda?: string,
  extra?: HTMLElement,
): HTMLElement {
  return h(
    "label",
    { class: "campo" },
    h("span", { class: "campo__rotulo" }, rotulo),
    controle,
    ajuda ? h("span", { class: "campo__ajuda" }, ajuda) : null,
    extra ?? null,
  );
}

function entradaTexto(
  valor: string,
  aoMudar: (v: string) => void,
  dica?: string,
): HTMLInputElement {
  const el = h("input", {
    class: "entrada",
    type: "text",
    value: valor,
    ...(dica ? { placeholder: dica } : {}),
  }) as HTMLInputElement;
  el.addEventListener("input", () => aoMudar(el.value));
  return el;
}

function entradaNumero(
  valor: number | null,
  aoMudar: (v: number | null) => void,
): HTMLInputElement {
  const el = h("input", {
    class: "entrada",
    type: "number",
    min: "0",
    value: valor === null ? "" : String(valor),
  }) as HTMLInputElement;
  el.addEventListener("input", () => {
    const n = Number(el.value);
    aoMudar(el.value === "" || Number.isNaN(n) ? null : Math.max(0, n));
  });
  return el;
}

function entradaData(
  valor: string,
  aoMudar: (v: string) => void,
): HTMLInputElement {
  const el = h("input", {
    class: "entrada",
    type: "date",
    value: valor,
  }) as HTMLInputElement;
  // `change`, não `input`: o Chrome dispara `input` a cada dígito do ano.
  el.addEventListener("change", () => aoMudar(el.value));
  return el;
}

function entradaMomento(
  valor: string,
  aoMudar: (v: string) => void,
): HTMLInputElement {
  const el = h("input", {
    class: "entrada entrada--sm",
    type: "datetime-local",
    value: valor,
  }) as HTMLInputElement;
  el.addEventListener("change", () => aoMudar(el.value));
  return el;
}

function areaTexto(
  valor: string,
  dica: string,
  aoMudar: (v: string) => void,
): HTMLTextAreaElement {
  const el = h("textarea", {
    class: "area-texto",
    placeholder: dica,
  }) as HTMLTextAreaElement;
  el.value = valor;
  el.addEventListener("input", () => aoMudar(el.value));
  return el;
}

function selecao(
  opcoes: Array<[string, string]>,
  atual: string,
  aoMudar: (v: string) => void,
): HTMLSelectElement {
  const el = h(
    "select",
    { class: "selecao" },
    ...opcoes.map(([v, r]) => h("option", { value: v }, r)),
  ) as HTMLSelectElement;
  el.value = atual;
  el.addEventListener("change", () => aoMudar(el.value));
  return el;
}

function marcador(
  rotulo: string,
  marcado: boolean,
  aoMudar: (v: boolean) => void,
  ajuda?: string,
): HTMLElement {
  return h(
    "label",
    { class: "campo" },
    h(
      "span",
      { class: "linha-flex" },
      marcadorSimples(marcado, aoMudar),
      h("span", {}, rotulo),
    ),
    ajuda ? h("span", { class: "campo__ajuda" }, ajuda) : null,
  );
}

function marcadorSimples(
  marcado: boolean,
  aoMudar: (v: boolean) => void,
): HTMLInputElement {
  const el = h("input", {
    type: "checkbox",
    checked: marcado,
  }) as HTMLInputElement;
  el.addEventListener("change", () => aoMudar(el.checked));
  return el;
}

function botaoRemover(aoClicar: () => void): HTMLElement {
  return h(
    "button",
    {
      class: "btn btn--sm",
      type: "button",
      title: "Remover",
      aria: { label: "Remover" },
      on: { click: aoClicar },
    },
    "×",
  );
}

/* ---------- Peças de leitura ---------- */

function def(rotulo: string, valor: string): HTMLElement {
  return h(
    "div",
    {},
    h("div", { class: "campo__rotulo" }, rotulo),
    h("div", {}, valor),
  );
}

function bloco(rotulo: string, texto: string | null): HTMLElement {
  return h(
    "div",
    { style: "margin-top:var(--s-3)" },
    h("div", { class: "campo__rotulo" }, rotulo),
    h(
      "p",
      { class: texto ? "pm__texto" : "texto-sutil" },
      texto ?? "Não preenchido.",
    ),
  );
}

/** Sem hora preenchida a linha continua legível — só perde a ordenação. */
function momentoLegivel(ev: EventoPostMortem): string {
  if (!ev.quando) return "—";
  const [dia, hora] = ev.quando.split("T");
  if (!dia) return "—";
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}${hora ? ` ${hora.slice(0, 5)}` : ""}`;
}
