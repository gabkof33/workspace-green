/** Fila de atendimento — visão do agente. */

import { criarBarraFiltros } from "@/components/barra-filtros";
import { aguardando } from "@/components/esqueleto";
import { h, montar } from "@/lib/dom";
import { listarChamados } from "@/lib/api";
import { avaliarSla, STATUS_PAUSADOS } from "@/lib/formato";
import { POLITICAS_SLA } from "@/lib/prioridade";
import { tabelaChamados } from "@/components/tabela-chamados";
import type { ChamadoEnriquecido, Prioridade, Perfil } from "@/types/dominio";

const PRIORIDADES: Prioridade[] = ["P1", "P2", "P3", "P4"];

export function renderizarFila(alvo: HTMLElement, perfil: Perfil): void {
  let filtroTag: string | null = null;

  // `fila-ds` é o que é só desta página (métricas, barra de filtros); tabela,
  // chips, campos/botões e avisos/estado vazio vêm dos layers compartilhados
  // (ds-componentes.css). O opt-in é por página, e é isso que mantém
  // `meus.ts` — que divide a `tabelaChamados` — intacta.
  const area = h("div", {
    class: "pilha fila-ds tabela-ds chips-ds formulario-ds feedback-ds",
  });

  /**
   * Criada uma vez: a barra é dona dos valores dos filtros, e recriá-la a cada
   * redesenho os zeraria. Prioridade, período e os dois liga/desliga moram
   * nela; busca fica de fora porque é campo aberto, não recorte de lista.
   *
   * "Excluídos" só entra pra quem pode restaurar — tecnologia, executivo ou
   * admin (antes era gestão, que incluía gestor de qualquer setor).
   */
  const barra = criarBarraFiltros({
    aoMudar: () => desenhar(),
    filtros: [
      { chave: "data", rotulo: "Período", tipo: "periodo" },
      {
        chave: "prioridade",
        rotulo: "Prioridade",
        tipo: "opcoes",
        opcoes: PRIORIDADES.map((p) => ({ valor: p, texto: p })),
      },
      // Nasce ligado, como o antigo "Ocultar encerrados" marcado: a fila é
      // ferramenta de plantão, e chamado fechado não é trabalho pendente.
      {
        chave: "encerrados",
        rotulo: "Ocultar encerrados",
        tipo: "liga",
        padrao: true,
      },
      ...(perfil.pode_ver_excluidos
        ? [{ chave: "excluidos", rotulo: "Excluídos", tipo: "liga" as const }]
        : []),
    ],
  });

  // Criada uma vez pelo mesmo motivo: recriada a cada consulta, a busca perdia
  // o foco a cada tecla digitada.
  const busca = h("input", {
    class: "entrada",
    type: "search",
    placeholder: "Buscar por número, assunto ou solicitante…",
    on: { input: () => desenhar() },
  }) as HTMLInputElement;

  const desenhar = (): void => {
    aguardando(area, "tabela");
    void listarChamados({
      apenasAbertos: barra.ligado("encerrados"),
      prioridade: barra.opcao("prioridade") as Prioridade | null,
      texto: busca.value,
      tag: filtroTag,
      excluidos: barra.ligado("excluidos"),
      ...barra.periodo("data"),
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
          vazio: vazioDaFila(),
        }),
      );
    });
  };

  /**
   * O mesmo zero sai de situações diferentes: não existe chamado, ou existem
   * e os filtros os escondem. Culpar um filtro que ninguém aplicou é o que
   * faz a tela parecer quebrada em vez de parecer vazia.
   */
  const vazioDaFila = (): { titulo: string; texto: string } => {
    if (barra.ligado("excluidos")) {
      return {
        titulo: "Lixeira vazia",
        texto: "Nenhum chamado foi retirado da página até agora.",
      };
    }

    const { de, ate } = barra.periodo("data");
    const estreitando = [
      barra.opcao("prioridade") ? "prioridade" : null,
      busca.value.trim() ? "busca" : null,
      filtroTag ? "tag" : null,
      de ?? ate ? "data" : null,
    ].filter((r): r is string => r !== null);

    if (estreitando.length > 0) {
      return {
        titulo: "Nada com esses filtros",
        texto: `Há filtro de ${estreitando.join(", ")} aplicado. Limpe para ver a fila inteira.`,
      };
    }

    return {
      titulo: "Fila limpa",
      texto: barra.ligado("encerrados")
        ? "Nenhum chamado em aberto. Quando alguém abrir um, ele aparece aqui."
        : "Nenhum chamado registrado até agora.",
    };
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

  /**
   * A barra é só a busca e os chips: prioridade, período e os liga/desliga
   * saíram de controles fixos para filtros que a pessoa ADICIONA (ver
   * `barra-filtros.ts`). Antes eram seis controles sempre na tela, e ler o
   * recorte em vigor exigia conferir cada um deles.
   */
  const filtros = (): HTMLElement =>
    h("div", { class: "grade-filtros" }, busca, barra.elemento);

  montar(alvo, area);
  desenhar();
}
