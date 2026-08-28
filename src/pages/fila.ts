/** Fila de atendimento — visão do agente. */

import { areaTemporal, rosca } from "@/components/grafico";
import { criarBarraFiltros } from "@/components/barra-filtros";
import { isoDeData } from "@/lib/periodo";
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
        painel(chamados),
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

  /* ---------- Dashboard ---------- */

  /**
   * Duas leituras que a tabela não dá: a COMPOSIÇÃO da fila agora e o RITMO de
   * chegada nos últimos dias. Uma responde "do que a fila é feita", a outra
   * "está piorando ou aliviando" — nenhuma das duas se lê contando linhas.
   *
   * Os dois saem dos chamados já carregados: nenhuma consulta a mais.
   */
  const painel = (chamados: ChamadoEnriquecido[]): HTMLElement => {
    const porPrioridade = PRIORIDADES.map((p) => ({
      // O `rotulo` da política (Crítico, Alto…), não a cobertura: a legenda
      // responde "o que é P1", e 24x7 é outra pergunta.
      rotulo: `${p} · ${POLITICAS_SLA[p].rotulo}`,
      valor: chamados.filter((c) => c.prioridade === p).length,
      // Cor da prioridade, não a série do DS: P1 já é vermelho em toda a
      // tela, e trocar aqui faria a rosca contradizer a tabela ao lado.
      cor: `var(--c-${p.toLowerCase()})`,
    }));

    // Catorze dias: duas semanas mostram o fim de semana duas vezes, e é
    // contra ele que se compara uma segunda-feira cheia.
    const DIAS = 14;
    const hoje = new Date();
    const porDia = Array.from({ length: DIAS }, (_, i) => {
      const dia = new Date(hoje);
      dia.setDate(dia.getDate() - (DIAS - 1 - i));
      const iso = isoDeData(dia);
      return {
        rotulo: dia.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        }),
        valor: chamados.filter((c) => c.aberto_em.slice(0, 10) === iso).length,
      };
    });

    return h(
      "div",
      { class: "grade-graficos" },
      rosca({
        titulo: "Composição da fila",
        subtitulo: "por prioridade",
        fatias: porPrioridade,
        centro: { valor: String(chamados.length), rotulo: "na fila" },
        vazio: "Fila vazia — nada a distribuir.",
      }),
      areaTemporal({
        titulo: "Chegada de chamados",
        subtitulo: `últimos ${DIAS} dias`,
        pontos: porDia,
        // `chart-1` é o verde da série do DS — e no escuro ele é exatamente o
        // verde da marca. `chart-2` (o ciano) puxava a leitura para longe do
        // resto da tela.
        cor: "var(--ds-chart-1)",
        suave: true,
        formatar: (v) => String(Math.round(v)),
      }),
    );
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
