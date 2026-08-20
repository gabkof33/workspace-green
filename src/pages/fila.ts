/** Fila de atendimento — visão do agente. */

import { criarFiltroData } from "@/components/filtro-data";
import { podeGerirPessoas } from "@/lib/api";
import { aguardando } from "@/components/esqueleto";
import { h, montar } from "@/lib/dom";
import { listarChamados } from "@/lib/api";
import { avaliarSla, STATUS_PAUSADOS } from "@/lib/formato";
import { POLITICAS_SLA } from "@/lib/prioridade";
import { tabelaChamados } from "@/components/tabela-chamados";
import type { ChamadoEnriquecido, Prioridade, Perfil } from "@/types/dominio";

export function renderizarFila(alvo: HTMLElement, perfil: Perfil): void {
  let filtroPrioridade: Prioridade | null = null;
  let filtroTexto = "";
  let filtroTag: string | null = null;
  let apenasAbertos = true;

  const area = h("div", { class: "pilha" });

  // Criado uma vez: recriá-lo a cada redesenho apagaria o período escolhido.
  const periodo = criarFiltroData(() => desenhar());

  // Lixeira: só aparece para quem pode restaurar.
  let verExcluidos = false;

  const desenhar = (): void => {
    aguardando(area, "tabela");
    void listarChamados({
      apenasAbertos,
      prioridade: filtroPrioridade,
      texto: filtroTexto,
      tag: filtroTag,
      excluidos: verExcluidos,
      ...periodo.valor(),
    }).then((chamados) => {
      montar(
        area,
        metricas(chamados),
        filtros(),
        filtroTag
          ? h(
              "div",
              { class: "aviso aviso--info" },
              h("span", { class: "aviso__icone" }, "#"),
              h(
                "span",
                {},
                "Filtrando pela tag ",
                h("b", {}, filtroTag),
                ". ",
                h(
                  "button",
                  {
                    class: "btn btn--sm",
                    type: "button",
                    style: "margin-left:var(--s-2)",
                    on: {
                      click: () => {
                        filtroTag = null;
                        desenhar();
                      },
                    },
                  },
                  "Limpar",
                ),
              ),
            )
          : null,
        tabelaChamados({
          chamados,
          mostrarSolicitante: true,
          mostrarResponsavel: true,
          aoClicarTag: (t) => {
            filtroTag = t;
            desenhar();
          },
          vazio: {
            titulo: "Fila limpa",
            texto:
              "Nenhum chamado corresponde aos filtros aplicados. Se isso não parece certo, remova o filtro de prioridade.",
          },
        }),
      );
    });
  };

  const metricas = (chamados: ChamadoEnriquecido[]): HTMLElement => {
    const criticos = chamados.filter((c) => c.prioridade === "P1").length;
    const emRisco = chamados.filter((c) => {
      const politica = POLITICAS_SLA[c.prioridade];
      const estado = avaliarSla(
        c.aberto_em,
        c.prazo_solucao,
        c.pausado_desde,
        politica.pct_alerta,
      );
      return (
        !estado.pausado && (estado.severidade === "atencao" || estado.violado)
      );
    }).length;
    const pausados = chamados.filter((c) =>
      STATUS_PAUSADOS.includes(c.status),
    ).length;
    const semDono = chamados.filter((c) => !c.responsavel_nome).length;

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
      cartao("Na fila", chamados.length, "chamados em aberto"),
      cartao(
        "Críticos",
        criticos,
        "P1 exigindo protocolo de guerra",
        criticos > 0 ? "critica" : "",
      ),
      cartao(
        "SLA em risco",
        emRisco,
        "passaram do limite de alerta",
        emRisco > 0 ? "alerta" : "ok",
      ),
      cartao("Relógio pausado", pausados, "aguardando terceiro ou usuário"),
      cartao(
        "Sem responsável",
        semDono,
        "ainda na fila coletiva",
        semDono > 0 ? "alerta" : "ok",
      ),
    );
  };

  const filtros = (): HTMLElement => {
    const busca = h("input", {
      class: "entrada",
      type: "search",
      value: filtroTexto,
      placeholder: "Buscar por número, assunto ou solicitante…",
      style: "max-width:320px",
      on: {
        input: (ev: Event) => {
          filtroTexto = (ev.target as HTMLInputElement).value;
          desenhar();
        },
      },
    });

    const botaoPri = (p: Prioridade | null, texto: string): HTMLElement =>
      h(
        "button",
        {
          class: `btn btn--sm${filtroPrioridade === p ? " btn--primario" : ""}`,
          type: "button",
          on: {
            click: () => {
              filtroPrioridade = p;
              desenhar();
            },
          },
        },
        texto,
      );

    return h(
      "div",
      { class: "grade-filtros" },
      busca,
      periodo.elemento,
      ...(podeGerirPessoas(perfil)
        ? [
            h(
              "button",
              {
                class: `btn btn--sm${verExcluidos ? " btn--primario" : ""}`,
                type: "button",
                title: "Chamados retirados das listas, que continuam no banco",
                on: {
                  click: () => {
                    verExcluidos = !verExcluidos;
                    desenhar();
                  },
                },
              },
              "Excluídos",
            ),
          ]
        : []),
      botaoPri(null, "Todas"),
      botaoPri("P1", "P1"),
      botaoPri("P2", "P2"),
      botaoPri("P3", "P3"),
      botaoPri("P4", "P4"),
      h(
        "label",
        {
          class: "linha-flex empurra",
          style: "gap:6px;font-size:var(--t-sm);cursor:pointer",
        },
        h("input", {
          type: "checkbox",
          checked: apenasAbertos,
          on: {
            change: (ev: Event) => {
              apenasAbertos = (ev.target as HTMLInputElement).checked;
              desenhar();
            },
          },
        }),
        "Ocultar encerrados",
      ),
    );
  };

  montar(alvo, area);
  desenhar();
}
