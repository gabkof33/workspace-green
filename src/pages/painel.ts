/** Painel de governança. */

import { aguardando } from "@/components/esqueleto";
import { areaTemporal, rosca, type PontoSerie } from "@/components/grafico";
import { h, montar } from "@/lib/dom";
import { isoDeData } from "@/lib/periodo";
import { listarChamados } from "@/lib/api";
import {
  avaliarMeta,
  carregarPainel,
  formatarMoeda,
  formatarPercentual,
  METAS,
  type Situacao,
} from "@/lib/painel";
import { ROTULOS_CRITICIDADE } from "@/lib/cmdb";
import { navegar } from "@/lib/router";
import type {
  ChamadoEnriquecido,
  PainelGovernanca,
  Prioridade,
} from "@/types/dominio";

/** Fixa: a tabela de SLA precisa mostrar as quatro, inclusive as vazias. */
const PRIORIDADES: Prioridade[] = ["P1", "P2", "P3", "P4"];

const PERIODOS: Array<[number, string]> = [
  [7, "7 dias"],
  [30, "30 dias"],
  [90, "90 dias"],
];

export function renderizarPainel(alvo: HTMLElement): void {
  let dias = 30;

  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  const desenhar = (): void => {
    // Só na primeira apuração: trocar o painel inteiro por esqueleto a cada
    // mudança de período piscaria os números que a pessoa está comparando.
    aguardando(area, "painel");

    const desde = new Date();
    desde.setDate(desde.getDate() - (dias - 1));

    void Promise.all([
      carregarPainel(dias),
      // O RPC do painel devolve totais, não a curva: a tendência exige a
      // lista. Falhar aqui não derruba o painel — o gráfico fica sem linha,
      // e todo o resto continua apurado.
      listarChamados({ de: isoDeData(desde) }).catch(
        (): ChamadoEnriquecido[] => [],
      ),
    ])
      .then(([p, chamados]) => {
        // Ordem de leitura: o que exige ação, a forma do período, o detalhe
        // por prioridade, a distribuição do trabalho e, no fim, o que ainda
        // falta cadastrar.
        montar(
          area,
          seletorPeriodo(),
          faixaAcao(p),
          graficos(p, serieDeChegada(chamados, dias)),
          blocoSla(p),
          h("div", { class: "grade-igual" }, blocoEquipes(p), blocoRanking(p)),
          secundarios(p),
          implantacao(p),
        );
      })
      .catch((e: unknown) => {
        montar(
          area,
          h(
            "div",
            { class: "cartao" },
            h(
              "div",
              { class: "vazio" },
              h("h3", {}, "Não foi possível apurar"),
              h(
                "p",
                {},
                e instanceof Error ? e.message : "Falha ao carregar o painel.",
              ),
            ),
          ),
        );
      });
  };

  const seletorPeriodo = (): HTMLElement =>
    h(
      "div",
      { class: "grade-filtros" },
      h("span", { class: "texto-sutil" }, "Janela de apuração:"),
      ...PERIODOS.map(([valor, rotulo]) =>
        h(
          "button",
          {
            class: `btn btn--sm${dias === valor ? " btn--primario" : ""}`,
            type: "button",
            on: {
              click: () => {
                dias = valor;
                desenhar();
              },
            },
          },
          rotulo,
        ),
      ),
      h(
        "button",
        {
          class: "btn btn--sm empurra",
          type: "button",
          on: { click: desenhar },
        },
        "Atualizar",
      ),
    );

  desenhar();
}

/* Blocos */

function cartao(titulo: string, ...conteudo: Array<Node | null>): HTMLElement {
  return h(
    "div",
    { class: "cartao" },
    h(
      "div",
      { class: "cartao__cabecalho" },
      h("span", { class: "cartao__titulo" }, titulo),
    ),
    ...conteudo,
  );
}

/**
 * Cumprimento de SLA — as QUATRO prioridades, sempre.
 *
 * Antes a tabela era `p.sla.map(...)`: prioridade sem nenhum chamado no
 * período simplesmente não tinha linha. Quem lia via P2 e P4 e concluía que
 * P1 e P3 não existem no sistema — quando o que houve foi o contrário, e é a
 * melhor notícia possível: nenhum crítico no período.
 */
function blocoSla(p: PainelGovernanca): HTMLElement {
  if (p.sla.length === 0) {
    return cartao(
      "Cumprimento de SLA",
      h(
        "p",
        { class: "texto-sutil" },
        `Nenhum chamado nos últimos ${p.periodo_dias} dias. O indicador aparece assim que houver movimento.`,
      ),
    );
  }

  const linhas = PRIORIDADES.map((prioridade) => {
    const meta = prioridade === "P1" ? METAS.sla_p1 : METAS.sla_demais;
    const s = p.sla.find((x) => x.prioridade === prioridade);

    if (!s) {
      return h(
        "tr",
        { class: "painel-sla__vazia" },
        h("td", {}, h("span", { class: `pri pri--${prioridade}` }, prioridade)),
        h(
          "td",
          { class: "texto-sutil", colspan: 3 },
          "nenhum chamado no período",
        ),
        h("td", { class: "tabela__num texto-sutil" }, `${meta}%`),
      );
    }

    const sitResposta = avaliarMeta(s.pct_resposta, meta);
    const sitSolucao = avaliarMeta(s.pct_solucao, meta);

    const celula = (valor: number | null, sit: Situacao): HTMLElement =>
      h(
        "td",
        {},
        h(
          "span",
          {
            class: `prazo prazo--${sit === "ok" ? "entregue" : sit === "alerta" ? "perto" : sit === "critico" ? "atrasado" : "ok"}`,
          },
          formatarPercentual(valor),
        ),
      );

    return h(
      "tr",
      {},
      h(
        "td",
        {},
        h("span", { class: `pri pri--${s.prioridade}` }, s.prioridade),
      ),
      h("td", { class: "tabela__num" }, String(s.total)),
      celula(s.pct_resposta, sitResposta),
      celula(s.pct_solucao, sitSolucao),
      h("td", { class: "tabela__num" }, `${meta}%`),
    );
  });

  return cartao(
    "Cumprimento de SLA por prioridade",
    h(
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
            h("th", {}, "Prioridade"),
            h("th", {}, "Chamados"),
            h("th", {}, "Resposta"),
            h("th", {}, "Solução"),
            h("th", {}, "Meta"),
          ),
        ),
        h("tbody", {}, ...linhas),
      ),
    ),
    h(
      "p",
      { class: "texto-sutil", style: "margin-top:var(--s-3)" },
      "P1 tem meta mais alta porque é o único cuja violação exige post-mortem obrigatório.",
    ),
  );
}

function blocoEquipes(p: PainelGovernanca): HTMLElement {
  if (p.por_equipe.length === 0) {
    return cartao(
      "Carga por equipe",
      h("p", { class: "texto-sutil" }, "Sem equipes cadastradas."),
    );
  }

  const maior = Math.max(...p.por_equipe.map((e) => e.abertos), 1);

  return cartao(
    "Carga por equipe",
    h(
      "div",
      { class: "pilha" },
      ...p.por_equipe.map((e) =>
        h(
          "div",
          {},
          h(
            "div",
            { class: "linha-flex", style: "margin-bottom:4px" },
            h("span", {}, e.equipe),
            h("span", { class: "empurra" }),
            e.violados > 0
              ? h(
                  "span",
                  { class: "tag tag--critica" },
                  `${e.violados} violado(s)`,
                )
              : null,
            h("span", { class: "mono texto-sutil" }, String(e.abertos)),
          ),
          h(
            "div",
            { class: "progresso__trilho" },
            h("div", {
              class: "progresso__barra",
              style: `width:${(e.abertos / maior) * 100}%${e.violados > 0 ? ";background:var(--c-erro)" : ""}`,
            }),
          ),
        ),
      ),
    ),
  );
}

function blocoRanking(p: PainelGovernanca): HTMLElement {
  if (p.ranking_ativos.length === 0) {
    return cartao(
      "Ativos que mais causam incidente",
      h(
        "p",
        { class: "texto-sutil" },
        "Nenhum incidente vinculado a ativo no período. Este ranking só funciona se os chamados forem vinculados ao CMDB — é o que transforma reclamação em evidência para trocar equipamento.",
      ),
    );
  }

  return cartao(
    "Ativos que mais causam incidente",
    h(
      "div",
      { class: "pilha" },
      ...p.ranking_ativos.map((a) =>
        h(
          "div",
          { class: "linha-flex" },
          h(
            "span",
            {
              class: `tag tag--${a.criticidade === "critico" ? "critica" : a.criticidade === "alto" ? "alta" : "media"}`,
            },
            ROTULOS_CRITICIDADE[a.criticidade],
          ),
          h("span", { style: "flex:1;min-width:120px" }, a.nome),
          h("span", { class: "mono" }, `${a.incidentes}`),
        ),
      ),
      h(
        "button",
        {
          class: "btn btn--sm",
          type: "button",
          style: "margin-top:var(--s-2)",
          on: { click: () => navegar("ativos") },
        },
        "Abrir CMDB",
      ),
    ),
  );
}

/* ==========================================================================
   Modelo novo: hierarquia em vez de parede
   ==========================================================================
   O painel antigo eram dezesseis indicadores do mesmo tamanho, em quatro
   grades — e num sistema em implantação doze deles marcavam zero. Grade
   uniforme não tem hierarquia: quem lê não sabe onde olhar, e o que exige
   ação hoje fica com o mesmo peso do que ainda não existe.

   O que muda aqui:

     · três indicadores GRANDES no topo, só o que pede ação agora;
     · gráficos onde a pergunta é composição ou tendência — número sozinho não
       responde "de que a fila é feita" nem "está piorando";
     · o que ainda não foi cadastrado sai da grade e vira lista de implantação,
       porque aderência sem rotina não é métrica ruim, é etapa pendente;
     · o resto continua visível, mas denso e quieto. */

/** Zero pendente é notícia boa e fica quieto; acima de zero, chama. */
function acao(
  rotulo: string,
  valor: number,
  quandoZero: string,
  quandoTem: string,
  destino: string,
): HTMLElement {
  const tem = valor > 0;

  return h(
    "button",
    {
      class: `painel-acao${tem ? " painel-acao--pendente" : ""}`,
      type: "button",
      title: tem ? `Abrir ${destino}` : "Nada pendente aqui",
      on: { click: () => navegar(destino) },
    },
    h("span", { class: "painel-acao__rotulo" }, rotulo),
    h("span", { class: "painel-acao__valor" }, String(valor)),
    h("span", { class: "painel-acao__nota" }, tem ? quandoTem : quandoZero),
  );
}

/**
 * Curva de chegada no período, em no máximo vinte pontos.
 *
 * Noventa colunas de um dia cada não respondem nada que a semana não
 * responda melhor — e transformam o eixo numa mancha. Acima do teto, cada
 * ponto passa a somar um bloco de dias, e o rótulo marca o começo do bloco.
 */
function serieDeChegada(
  chamados: ChamadoEnriquecido[],
  dias: number,
): PontoSerie[] {
  const MAX_PONTOS = 20;
  const passo = Math.max(1, Math.ceil(dias / MAX_PONTOS));
  const hoje = new Date();
  const pontos: PontoSerie[] = [];

  for (let i = 0; i < dias; i += passo) {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - (dias - 1 - i));
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + passo - 1);

    // Comparação de ISO como texto: `2026-08-31` ordena igual à data, e
    // evita criar um Date por chamado a cada balde.
    const de = isoDeData(inicio);
    const ate = isoDeData(fim > hoje ? hoje : fim);

    pontos.push({
      rotulo: inicio.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      valor: chamados.filter((c) => {
        const dia = c.aberto_em.slice(0, 10);
        return dia >= de && dia <= ate;
      }).length,
    });
  }

  return pontos;
}

function faixaAcao(p: PainelGovernanca): HTMLElement {
  return h(
    "div",
    { class: "painel-acao__faixa" },
    acao(
      "Prazo violado",
      p.prazos.violados,
      "nenhum SLA estourado",
      "passaram do SLA de solução",
      "fila",
    ),
    acao(
      "Vencem em 4h",
      p.prazos.em_risco,
      "nada vencendo agora",
      "exigem atenção antes do fim do dia",
      "fila",
    ),
    acao(
      "Sem responsável",
      p.chamados.sem_responsavel,
      "todos com dono",
      "ainda na fila coletiva",
      "fila",
    ),
  );
}

/**
 * Rosca de composição por prioridade e onda de chegada.
 *
 * A rosca responde "de que o período foi feito"; a onda, "está piorando ou
 * aliviando". Nenhuma das duas se lê num indicador de número único, e é por
 * isso que elas entram — não por enfeite.
 */
function graficos(p: PainelGovernanca, serie: PontoSerie[]): HTMLElement {
  const fatias = p.sla.map((s) => ({
    rotulo: `${s.prioridade} · ${s.total} chamado${s.total === 1 ? "" : "s"}`,
    valor: s.total,
    // Mesma cor da prioridade na fila e na tabela abaixo: um código de cor só
    // em toda a aplicação.
    cor: `var(--c-${s.prioridade.toLowerCase()})`,
  }));

  const total = fatias.reduce((soma, f) => soma + f.valor, 0);

  return h(
    "div",
    { class: "grade-graficos" },
    rosca({
      titulo: "Chamados por prioridade",
      subtitulo: `no período de ${p.periodo_dias} dias`,
      fatias,
      centro: { valor: String(total), rotulo: "no período" },
      vazio: "Nenhum chamado no período — nada a distribuir.",
    }),
    areaTemporal({
      titulo: "Chegada de chamados",
      subtitulo: `últimos ${p.periodo_dias} dias`,
      pontos: serie,
      cor: "var(--ds-chart-1)",
      suave: true,
      formatar: (v) => String(Math.round(v)),
    }),
  );
}

/**
 * O que ainda não existe sai da grade de números.
 *
 * Aderência a rotinas sem rotina cadastrada não é indicador em zero: é etapa
 * de implantação. Mostrado como métrica, ele ensina a ignorar o painel; como
 * pendência, ele diz o próximo passo e leva até a tela.
 */
function implantacao(p: PainelGovernanca): HTMLElement | null {
  const faltando = [
    p.rotinas.ativas === 0
      ? {
          texto: "Nenhuma rotina preventiva cadastrada",
          porque: "sem elas não há aderência a medir",
          destino: "rotinas",
        }
      : null,
    p.ativos.total === 0
      ? {
          texto: "Inventário vazio",
          porque: "o ranking de ativos que causam incidente depende dele",
          destino: "ativos",
        }
      : null,
    p.conhecimento.publicados === 0
      ? {
          texto: "Nenhum artigo publicado",
          porque: "é o que mede chamado evitado por autoatendimento",
          destino: "conhecimento",
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  if (faltando.length === 0) return null;

  return cartao(
    "Para o painel ficar completo",
    h(
      "div",
      { class: "painel-implantacao" },
      ...faltando.map((f) =>
        h(
          "button",
          {
            class: "painel-implantacao__item",
            type: "button",
            on: { click: () => navegar(f.destino) },
          },
          h("span", { class: "painel-implantacao__texto" }, f.texto),
          h("span", { class: "painel-implantacao__porque" }, f.porque),
        ),
      ),
    ),
  );
}

/**
 * O resto, denso e quieto.
 *
 * Continua tudo acessível — governança precisa do número exato quando alguém
 * pergunta —, mas numa faixa que não disputa atenção com a de ação. Sai da
 * lista o que virou pendência de implantação lá em cima.
 */
function secundarios(p: PainelGovernanca): HTMLElement {
  const c = p.chamados;
  // Percentual sobre denominador pequeno mente: com 7 resolvidos, um reaberto
  // vira 14% e estoura uma meta de 5%. Abaixo de 20 casos, mostra a fração.
  const MINIMO_PARA_PERCENTUAL = 20;
  const reabertura =
    c.resolvidos === 0
      ? "—"
      : c.resolvidos < MINIMO_PARA_PERCENTUAL
        ? `${c.reabertos} de ${c.resolvidos}`
        : `${Math.round((c.reabertos / c.resolvidos) * 100)}%`;

  const linha = (rotulo: string, valor: string, nota: string): HTMLElement =>
    h(
      "div",
      { class: "painel-secundario__item" },
      h("span", { class: "painel-secundario__rotulo" }, rotulo),
      h("b", { class: "painel-secundario__valor" }, valor),
      h("span", { class: "painel-secundario__nota" }, nota),
    );

  return cartao(
    "Demais números do período",
    h(
      "div",
      { class: "painel-secundario" },
      linha("Chamados abertos", String(c.abertos), `${c.no_periodo} entraram`),
      linha("P1 em aberto", String(c.criticos), "protocolo de guerra"),
      linha("Reabertura", reabertura, `meta de até ${METAS.reabertura_max}%`),
      linha(
        "Demandas atrasadas",
        String(p.demandas.atrasadas),
        `de ${p.demandas.abertas} em aberto`,
      ),
      linha(
        "Disponíveis para pegar",
        String(p.demandas.disponiveis),
        `progresso médio de ${p.demandas.progresso_medio}%`,
      ),
      p.rotinas.ativas > 0
        ? linha(
            "Rotinas com falha",
            String(p.rotinas.com_falha),
            "cada uma abriu um incidente",
          )
        : null,
      p.ativos.total > 0
        ? linha(
            "Ativos sem dono",
            String(p.ativos.sem_dono),
            `de ${p.ativos.total} cadastrados`,
          )
        : null,
      p.kedb.sem_solucao > 0
        ? linha(
            "Erros sem correção",
            String(p.kedb.sem_solucao),
            "vivem de contorno",
          )
        : null,
      linha(
        "Pessoas ativas",
        String(p.pessoas.total),
        `${p.pessoas.coordenadores} coord. · ${p.pessoas.gestores} gest.`,
      ),
    ),
    // Único aviso que sobrou da parede antiga, e por um motivo: é o
    // argumento de orçamento. Dinheiro gasto em contorno é o que
    // justifica priorizar a correção definitiva.
    p.kedb.custo_mes > 0
      ? h(
          "div",
          { class: "aviso aviso--alerta", style: "margin:var(--s-4) 0 0" },
          h("span", { class: "aviso__icone" }, "!"),
          h(
            "span",
            {},
            h("b", {}, `${formatarMoeda(p.kedb.custo_mes)} por mês `),
            "gastos em contorno de erro sem correção definitiva.",
          ),
        )
      : null,
  );
}
