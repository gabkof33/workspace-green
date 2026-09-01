/** Detalhe do chamado — linha do tempo, dados de classificação e ações. */

import { aguardando } from "@/components/esqueleto";
import { confirmar, perguntar } from "@/components/dialogo";
import { avisar, h, icone, ICONES, montar } from "@/lib/dom";
import { botaoCopiarLink } from "@/components/copiar-link";
import {
  corDaTag,
  ehAgente,
  excluirChamado,
  restaurarChamado,
  listarInteracoes,
  mudarStatus,
  obterChamado,
  obterServico,
  registrarInteracao,
} from "@/lib/api";
import {
  avaliarSla,
  classeStatus,
  dataHora,
  rotuloStatus,
  rotuloTipo,
  STATUS_ENCERRADOS,
} from "@/lib/formato";
import {
  criarPostMortem,
  listarPostMortems,
  pendenciasParaPublicar,
} from "@/lib/postmortem";
import { formatarDuracao, POLITICAS_SLA } from "@/lib/prioridade";
import { navegar } from "@/lib/router";
import { barraSla } from "@/components/tabela-chamados";
import type {
  ChamadoEnriquecido,
  Interacao,
  Perfil,
  PostMortem,
  StatusChamado,
} from "@/types/dominio";

export function renderizarChamado(
  alvo: HTMLElement,
  perfil: Perfil,
  numero: string,
): void {
  const area = h("div", {});
  montar(alvo, area);
  aguardando(area, "ficha");

  const recarregar = (): void => {
    void obterChamado(numero)
      .then(async (chamado) => {
        const interacoes = chamado ? await listarInteracoes(chamado.id) : [];
        return [chamado, interacoes] as const;
      })
      .then(([chamado, interacoes]) => {
        if (!chamado) {
          montar(
            area,
            h(
              "div",
              { class: "cartao" },
              h(
                "div",
                { class: "vazio" },
                h("h3", {}, "Chamado não encontrado"),
                h(
                  "p",
                  {},
                  `Nenhum chamado com o número ${numero}. Ele pode ter sido cancelado, ou o número está incorreto.`,
                ),
                h(
                  "button",
                  {
                    class: "btn",
                    type: "button",
                    on: { click: () => navegar("fila") },
                  },
                  "Voltar para a fila",
                ),
              ),
            ),
          );
          return;
        }
        desenhar(chamado, interacoes);
      })
      .catch((e: unknown) => {
        avisar(
          e instanceof Error ? e.message : "Falha ao carregar o chamado.",
          "erro",
        );
      });
  };

  const desenhar = (
    chamado: ChamadoEnriquecido,
    interacoes: Interacao[],
  ): void => {
    const politica = POLITICAS_SLA[chamado.prioridade];
    const servico = obterServico(chamado.servico_id);
    const agente = ehAgente(perfil);
    const encerrado = STATUS_ENCERRADOS.includes(chamado.status);

    /* ---- Coluna principal ---- */

    const descricao = h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Descrição do solicitante"),
        h(
          "span",
          { class: "texto-sutil empurra" },
          `${rotuloTipo(chamado.tipo)} · ${chamado.canal}`,
        ),
      ),
      h(
        "p",
        { style: "white-space:pre-wrap;line-height:1.6" },
        chamado.descricao,
      ),
    );

    const extras = Object.entries(chamado.campos_extras).filter(
      ([, v]) => v !== "" && v !== null && v !== undefined,
    );

    const blocoExtras =
      extras.length > 0
        ? h(
            "div",
            { class: "cartao" },
            h(
              "div",
              { class: "cartao__cabecalho" },
              h(
                "span",
                { class: "cartao__titulo" },
                "Informações do formulário",
              ),
            ),
            h(
              "dl",
              { class: "definicoes" },
              ...extras.map(([chave, valor]) =>
                h(
                  "div",
                  {},
                  h("dt", {}, rotularChave(chave, chamado)),
                  h("dd", {}, formatarValor(valor)),
                ),
              ),
            ),
          )
        : null;

    const linhaTempo = h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, "Linha do tempo"),
        h(
          "span",
          { class: "texto-sutil empurra" },
          `${interacoes.length} registro${interacoes.length === 1 ? "" : "s"}`,
        ),
      ),
      interacoes.length === 0
        ? h(
            "p",
            { class: "texto-sutil" },
            "Nenhuma interação ainda. A primeira resposta pública encerra o relógio de atendimento.",
          )
        : h(
            "div",
            { class: "linha" },
            ...interacoes.map((i) =>
              h(
                "div",
                { class: `linha__item linha__item--${i.tipo}` },
                h(
                  "div",
                  { class: "linha__cabecalho" },
                  h("span", { class: "linha__autor" }, i.autor_nome),
                  i.tipo === "interna"
                    ? h("span", { class: "linha__marca" }, "nota interna")
                    : null,
                  h("span", { class: "linha__quando" }, dataHora(i.criado_em)),
                ),
                h("div", { class: "linha__corpo" }, i.corpo),
              ),
            ),
          ),
    );

    const responder = encerrado
      ? null
      : blocoResposta(chamado, perfil, agente, recarregar);
    const resolver =
      agente && !encerrado ? blocoResolucao(chamado, perfil, recarregar) : null;

    const excluido = chamado.excluido_em !== null;

    /**
     * Some da lista, fica no banco.
     *
     * Chamado carrega prazo de SLA, eventos e interações: apagar a linha
     * reescreveria o indicador do mês depois de ele já ter sido lido.
     */
    const pedirExclusao = (): void => {
      void perguntar({
        titulo: `Excluir ${chamado.numero}?`,
        texto: chamado.titulo,
        consequencia:
          "O registro não sai do banco: ele some das listas e fica marcado com seu nome, a data e este motivo. Coordenação e gestão podem restaurá-lo pela aba Excluídos.",
        rotuloCampo: "Motivo da exclusão",
        placeholder: "Ex.: aberto por engano, duplicata do INC-2026-000012",
        multilinha: true,
        minimo: 5,
        rotuloConfirmar: "Excluir chamado",
        perigo: true,
      }).then((motivo) => {
        if (motivo === null) return;

        void excluirChamado(chamado.id, motivo)
          .then(() => {
            avisar(
              `${chamado.numero} excluído. O registro continua auditável.`,
              "ok",
            );
            navegar(agente ? "fila" : "meus");
          })
          .catch((e: unknown) =>
            avisar(
              e instanceof Error ? e.message : "Falha ao excluir.",
              "erro",
            ),
          );
      });
    };

    const pedirRestauracao = (): void => {
      void confirmar({
        titulo: `Restaurar ${chamado.numero}?`,
        texto: chamado.titulo,
        consequencia:
          "Ele volta às listas e ao cálculo de SLA do período em que foi aberto.",
        rotuloConfirmar: "Restaurar",
      }).then((ok) => {
        if (!ok) return;
        void restaurarChamado(chamado.id)
          .then(() => {
            avisar(`${chamado.numero} restaurado.`, "ok");
            recarregar();
          })
          .catch((e: unknown) =>
            avisar(
              e instanceof Error ? e.message : "Falha ao restaurar.",
              "erro",
            ),
          );
      });
    };

    const avisoExcluido = excluido
      ? h(
          "div",
          { class: "aviso aviso--critico" },
          h("span", { class: "aviso__icone" }, "!"),
          h(
            "span",
            {},
            h("b", {}, "Chamado excluído. "),
            `Removido por ${chamado.excluido_por_nome ?? "alguém"} em ${dataHora(chamado.excluido_em)}. `,
            chamado.motivo_exclusao ? `Motivo: ${chamado.motivo_exclusao}` : "",
          ),
          // Mesma regra de quem vê a lixeira: restaurar é o avesso de excluir
          // da página, não uma ação de atendimento.
          perfil.pode_ver_excluidos
            ? h(
                "button",
                {
                  class: "btn btn--sm empurra",
                  type: "button",
                  on: { click: pedirRestauracao },
                },
                "Restaurar",
              )
            : null,
        )
      : null;

    // Fica no fim da coluna, longe dos botões de atendimento: excluir não é
    // parte do fluxo, é conserto de engano.
    const blocoExclusao =
      excluido || (!agente && chamado.solicitante_id !== perfil.id)
        ? null
        : h(
            "div",
            { class: "cartao cartao--compacto" },
            h(
              "div",
              { class: "linha-flex" },
              h(
                "span",
                { class: "texto-sutil" },
                "Aberto por engano ou duplicado?",
              ),
              h(
                "button",
                {
                  class: "btn btn--sm btn--perigo empurra",
                  type: "button",
                  on: { click: pedirExclusao },
                },
                icone(ICONES.excluir),
                "Excluir chamado",
              ),
            ),
          );

    const principal = h(
      "div",
      { class: "pilha" },
      avisoExcluido,
      descricao,
      blocoExtras,
      linhaTempo,
      excluido ? null : responder,
      excluido ? null : resolver,
      blocoExclusao,
    );

    /* ---- Coluna lateral ---- */

    const estado = avaliarSla(
      chamado.aberto_em,
      chamado.prazo_solucao,
      chamado.pausado_desde,
      politica.pct_alerta,
    );

    const lateral = h(
      "div",
      { class: "pilha" },
      h(
        "div",
        { class: "cartao" },
        h(
          "div",
          { class: "cartao__cabecalho" },
          h("span", { class: "cartao__titulo" }, "Prazo de solução"),
          h(
            "span",
            { class: `pri pri--${chamado.prioridade} empurra` },
            chamado.prioridade,
          ),
        ),
        barraSla(chamado),
        h(
          "p",
          { class: "texto-sutil", style: "margin-top:var(--s-3)" },
          estado.pausado
            ? `Relógio pausado desde ${dataHora(chamado.pausado_desde)}. O tempo em pendência não conta contra o SLA.`
            : `Meta de ${formatarDuracao(politica.minutos_solucao)} em cobertura ${politica.cobertura}. Vence em ${dataHora(chamado.prazo_solucao)}.`,
        ),
        chamado.prioridade === "P1"
          ? h(
              "div",
              { class: "aviso aviso--critico", style: "margin:var(--s-3) 0 0" },
              h("span", { class: "aviso__icone" }, "!"),
              h(
                "span",
                {},
                h("b", {}, "Protocolo P1 ativo. "),
                "Atualização obrigatória a cada 30 minutos, com escalonamento automático ao gestor em caso de silêncio.",
              ),
            )
          : null,
      ),
      h(
        "div",
        { class: "cartao" },
        h(
          "div",
          { class: "cartao__cabecalho" },
          h("span", { class: "cartao__titulo" }, "Classificação"),
        ),
        h(
          "dl",
          { class: "definicoes" },
          def(
            "Status",
            h(
              "span",
              { class: classeStatus(chamado.status) },
              rotuloStatus(chamado.status),
            ),
          ),
          def("Serviço", chamado.servico_nome),
          chamado.tags.length > 0
            ? def(
                "Tags",
                h(
                  "span",
                  { class: "tags__linha" },
                  ...chamado.tags.map((t) =>
                    h(
                      "span",
                      {
                        class: "tags__marca",
                        dataset: { cor: corDaTag(t) },
                      },
                      t,
                    ),
                  ),
                ),
              )
            : null,
          def(
            "Categoria",
            servico ? `${servico.categoria} · ${servico.subcategoria}` : "—",
          ),
          def("Impacto", rotularNivel(chamado.impacto)),
          def("Urgência", rotularNivel(chamado.urgencia)),
          def(
            "Prioridade",
            `${chamado.prioridade} — ${politica.rotulo} (derivada de impacto × urgência)`,
          ),
          def("Fila", chamado.equipe_nome ?? "não atribuída"),
          def("Responsável", chamado.responsavel_nome ?? "não atribuído"),
          def("Solicitante", chamado.solicitante_nome),
          def("Aberto em", dataHora(chamado.aberto_em)),
          def(
            "Primeira resposta",
            chamado.primeira_resposta_em
              ? dataHora(chamado.primeira_resposta_em)
              : "ainda não respondido",
          ),
          chamado.minutos_pausados > 0
            ? def(
                "Tempo pausado",
                `${formatarDuracao(chamado.minutos_pausados)} devolvidos ao prazo`,
              )
            : null,
        ),
      ),
      chamado.causa_raiz
        ? h(
            "div",
            { class: "cartao" },
            h(
              "div",
              { class: "cartao__cabecalho" },
              h("span", { class: "cartao__titulo" }, "Encerramento"),
            ),
            h(
              "dl",
              { class: "definicoes" },
              def("Causa raiz", chamado.causa_raiz),
              def("Solução aplicada", chamado.solucao_aplicada ?? "—"),
              def("Resolvido em", dataHora(chamado.resolvido_em)),
            ),
          )
        : null,
      blocoPostMortem(chamado, perfil),
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
            on: { click: () => navegar(ehAgente(perfil) ? "fila" : "meus") },
          },
          "← Voltar",
        ),
        h("span", { class: "mono texto-sutil" }, chamado.numero),
        botaoCopiarLink({
          caminho: `chamado/${chamado.numero}`,
          rotulo: "Copiar link do chamado",
        }),
      ),
      h("h2", { style: "margin-bottom:var(--s-5)" }, chamado.titulo),
      h("div", { class: "grade-2" }, principal, lateral),
    );
  };

  recarregar();
}

/**
 * Post-mortem do incidente.
 *
 * Só para incidente e só para a equipe: requisição não gera post-mortem, e
 * quem abriu o chamado não é quem escreve a análise. O cartão se preenche
 * sozinho depois de montado — a coluna lateral é construída de forma síncrona
 * e esperar a consulta atrasaria a ficha inteira.
 */
function blocoPostMortem(
  chamado: ChamadoEnriquecido,
  perfil: Perfil,
): HTMLElement | null {
  if (chamado.tipo !== "incidente" || !ehAgente(perfil)) return null;

  const corpo = h("div", { class: "pilha-fina" });
  const cartao = h(
    "div",
    { class: "cartao" },
    h(
      "div",
      { class: "cartao__cabecalho" },
      h("span", { class: "cartao__titulo" }, "Post-mortem"),
    ),
    corpo,
  );

  const desenhar = (pm: PostMortem | null): void => {
    if (pm) {
      const faltas = pendenciasParaPublicar(pm);
      montar(
        corpo,
        h(
          "span",
          {
            class: `selo ${pm.publicado ? "selo--publicado" : "selo--rascunho"}`,
          },
          pm.publicado ? "publicado" : "rascunho",
        ),
        h(
          "button",
          {
            class: "btn btn--sm",
            type: "button",
            on: { click: () => navegar(`postmortem/${pm.id}`) },
          },
          "Abrir post-mortem",
        ),
        faltas.length > 0
          ? h(
              "span",
              { class: "texto-sutil" },
              `Falta para publicar: ${faltas.join(" e ")}.`,
            )
          : null,
      );
      return;
    }

    montar(
      corpo,
      h(
        "p",
        { class: "texto-sutil" },
        chamado.prioridade === "P1" || chamado.prioridade === "P2"
          ? "Incidente desta gravidade merece análise escrita: o que falhou, por que, e o que muda."
          : "Registre a análise se o incidente ensinou algo que vale guardar.",
      ),
      h(
        "button",
        {
          class: "btn btn--sm",
          type: "button",
          on: { click: criar },
        },
        "Criar post-mortem",
      ),
    );
  };

  const criar = (): void => {
    const prazo = new Date();
    prazo.setDate(prazo.getDate() + 14);
    const mes = String(prazo.getMonth() + 1).padStart(2, "0");
    const dia = String(prazo.getDate()).padStart(2, "0");

    void criarPostMortem({
      titulo: chamado.titulo,
      impacto: "",
      responsavel_id: perfil.id,
      chamado_id: chamado.id,
      duracao_minutos: duracaoDoIncidente(chamado),
      prazo: `${prazo.getFullYear()}-${mes}-${dia}`,
    })
      .then((id) => navegar(`postmortem/${id}`))
      .catch((e: unknown) =>
        avisar(
          e instanceof Error ? e.message : "Falha ao criar o post-mortem.",
          "erro",
        ),
      );
  };

  void listarPostMortems(chamado.id)
    .then((lista) => desenhar(lista[0] ?? null))
    .catch(() => {
      // Falhar aqui não pode esconder a ficha do chamado.
      montar(
        corpo,
        h("p", { class: "texto-sutil" }, "Não foi possível consultar agora."),
      );
    });

  return cartao;
}

/** Da abertura ao resolvido. Sem resolução ainda, deixa em branco. */
function duracaoDoIncidente(chamado: ChamadoEnriquecido): number | null {
  if (!chamado.resolvido_em) return null;
  const ms =
    new Date(chamado.resolvido_em).getTime() -
    new Date(chamado.aberto_em).getTime();
  return ms > 0 ? Math.round(ms / 60000) : null;
}

/* Blocos de ação */

function blocoResposta(
  chamado: ChamadoEnriquecido,
  perfil: Perfil,
  agente: boolean,
  aoConcluir: () => void,
): HTMLElement {
  const area = h("textarea", {
    class: "area-texto",
    placeholder: agente
      ? "Escreva a resposta ao solicitante…"
      : "Responda à equipe de atendimento…",
  }) as HTMLTextAreaElement;

  const interna = h("input", { type: "checkbox" }) as HTMLInputElement;

  const enviar = (): void => {
    const corpo = area.value.trim();
    if (corpo.length < 5) {
      avisar("Escreva a resposta antes de enviar.", "erro");
      return;
    }

    void registrarInteracao(
      chamado.id,
      { tipo: interna.checked ? "interna" : "publica", corpo },
      perfil,
    )
      .then(async () => {
        // Resposta do solicitante retoma o relógio (regra R-06).
        if (!agente && chamado.status === "pendente_usuario") {
          await mudarStatus(chamado.id, "em_atendimento");
          avisar("Resposta enviada. O prazo voltou a contar.", "ok");
        } else {
          area.value = "";
          avisar("Resposta registrada.", "ok");
        }
        aoConcluir();
      })
      .catch((e: unknown) => {
        avisar(
          e instanceof Error ? e.message : "Não foi possível enviar.",
          "erro",
        );
      });
  };

  return h(
    "div",
    { class: "cartao" },
    h(
      "div",
      { class: "cartao__cabecalho" },
      h("span", { class: "cartao__titulo" }, "Responder"),
    ),
    area,
    h(
      "div",
      { class: "linha-flex", style: "margin-top:var(--s-3)" },
      agente
        ? h(
            "label",
            {
              class: "linha-flex",
              style: "gap:6px;font-size:var(--t-sm);cursor:pointer",
            },
            interna,
            "Nota interna (não visível ao solicitante)",
          )
        : null,
      h(
        "button",
        {
          class: "btn btn--primario empurra",
          type: "button",
          on: { click: enviar },
        },
        "Enviar resposta",
      ),
    ),
  );
}

function blocoResolucao(
  chamado: ChamadoEnriquecido,
  perfil: Perfil,
  aoConcluir: () => void,
): HTMLElement {
  const causa = h("textarea", {
    class: "area-texto",
    placeholder:
      "Por que o problema aconteceu? Vá além do sintoma — o que na configuração, no processo ou no ambiente permitiu a falha.",
  }) as HTMLTextAreaElement;

  const solucao = h("textarea", {
    class: "area-texto",
    placeholder:
      "O que foi feito para resolver, em passos que outra pessoa conseguiria repetir.",
  }) as HTMLTextAreaElement;

  const contador = (el: HTMLTextAreaElement, saida: HTMLElement): void => {
    el.addEventListener("input", () => {
      const n = el.value.trim().length;
      saida.textContent = `${n} de 20 caracteres mínimos`;
      saida.style.color = n >= 20 ? "var(--c-ok)" : "var(--c-muted)";
    });
  };

  const contaCausa = h(
    "span",
    { class: "campo__contador" },
    "0 de 20 caracteres mínimos",
  );
  const contaSolucao = h(
    "span",
    { class: "campo__contador" },
    "0 de 20 caracteres mínimos",
  );
  contador(causa, contaCausa);
  contador(solucao, contaSolucao);

  const acaoStatus = (novo: StatusChamado, texto: string): HTMLElement =>
    h(
      "button",
      {
        class: "btn btn--sm",
        type: "button",
        on: {
          click: () => {
            void mudarStatus(chamado.id, novo)
              .then(() => {
                avisar(`Chamado movido para ${rotuloStatus(novo)}.`, "ok");
                aoConcluir();
              })
              .catch((e: unknown) => {
                avisar(
                  e instanceof Error ? e.message : "Falha ao mudar status.",
                  "erro",
                );
              });
          },
        },
      },
      texto,
    );

  return h(
    "div",
    { class: "cartao" },
    h(
      "div",
      { class: "cartao__cabecalho" },
      h("span", { class: "cartao__titulo" }, "Encerrar ou pausar"),
    ),
    h(
      "div",
      { class: "linha-flex", style: "margin-bottom:var(--s-4)" },
      acaoStatus("pendente_usuario", "Aguardar usuário"),
      acaoStatus("pendente_terceiro", "Aguardar terceiro"),
      acaoStatus("em_atendimento", "Retomar atendimento"),
    ),
    h(
      "div",
      { class: "aviso" },
      h("span", { class: "aviso__icone" }, "i"),
      h(
        "span",
        {},
        h("b", {}, "Causa raiz e solução são obrigatórias para resolver. "),
        "É o que alimenta a base de conhecimento e permite identificar erros recorrentes. Sem isso, o chamado não fecha.",
      ),
    ),
    h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo" }, "Causa raiz", contaCausa),
      causa,
    ),
    h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo" }, "Solução aplicada", contaSolucao),
      solucao,
    ),
    h(
      "button",
      {
        class: "btn btn--primario",
        type: "button",
        on: {
          click: () => {
            void mudarStatus(chamado.id, "resolvido", {
              causa_raiz: causa.value,
              solucao_aplicada: solucao.value,
            })
              .then(async () => {
                await registrarInteracao(
                  chamado.id,
                  {
                    tipo: "sistema",
                    corpo:
                      "Chamado resolvido. O solicitante tem 5 dias úteis para contestar; sem manifestação, o fechamento é automático.",
                  },
                  perfil,
                );
                avisar("Chamado resolvido.", "ok");
                aoConcluir();
              })
              .catch((e: unknown) => {
                avisar(
                  e instanceof Error ? e.message : "Não foi possível resolver.",
                  "erro",
                );
              });
          },
        },
      },
      "Marcar como resolvido",
    ),
  );
}

/* Auxiliares de exibição */

function def(rotulo: string, valor: Node | string): HTMLElement {
  return h("div", {}, h("dt", {}, rotulo), h("dd", {}, valor));
}

function rotularNivel(nivel: string): string {
  const mapa: Record<string, string> = {
    alto: "Alto",
    medio: "Médio",
    baixo: "Baixo",
    alta: "Alta",
    media: "Média",
    baixa: "Baixa",
  };
  return mapa[nivel] ?? nivel;
}

function rotularChave(chave: string, chamado: ChamadoEnriquecido): string {
  const servico = obterServico(chamado.servico_id);
  const campo = servico?.schema_formulario.campos.find(
    (c) => c.chave === chave,
  );
  if (campo) return campo.rotulo;

  const fixos: Record<string, string> = {
    mensagem_erro: "Mensagem de erro",
    frequencia: "Frequência",
    contorno_aplicado: "O que já foi tentado",
    observacoes: "Observações",
    local: "Local",
    telefone_contato: "Telefone de contato",
  };
  return fixos[chave] ?? chave.replace(/_/g, " ");
}

function formatarValor(valor: unknown): string {
  if (Array.isArray(valor)) return valor.join(", ");
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  return String(valor);
}
