/** Painel de governança. */

import { aguardando } from "@/components/esqueleto";
import { h, montar } from "@/lib/dom";
import {
  avaliarInverso,
  avaliarMeta,
  carregarPainel,
  formatarMoeda,
  formatarPercentual,
  METAS,
  type Situacao,
} from "@/lib/painel";
import { ROTULOS_CRITICIDADE } from "@/lib/cmdb";
import { navegar } from "@/lib/router";
import type { PainelGovernanca } from "@/types/dominio";

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

    void carregarPainel(dias)
      .then((p) => {
        // Tudo em largura cheia, empilhado.
        montar(
          area,
          seletorPeriodo(),
          blocoAtendimento(p),
          blocoOperacao(p),
          blocoOrganizacao(p),
          blocoSla(p),
          // Os dois gráficos por último, lado a lado enquanto couber.
          h("div", { class: "grade-igual" }, blocoEquipes(p), blocoRanking(p)),
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

function indicador(
  rotulo: string,
  valor: string,
  nota: string,
  situacao: Situacao = "neutro",
): HTMLElement {
  const variante =
    situacao === "ok"
      ? " metrica--ok"
      : situacao === "alerta"
        ? " metrica--alerta"
        : situacao === "critico"
          ? " metrica--critica"
          : "";

  return h(
    "div",
    { class: `metrica${variante}` },
    h("div", { class: "metrica__rotulo" }, rotulo),
    h("div", { class: "metrica__valor" }, valor),
    h("div", { class: "metrica__nota" }, nota),
  );
}

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

function blocoAtendimento(p: PainelGovernanca): HTMLElement {
  const c = p.chamados;
  const taxaReabertura =
    c.resolvidos === 0 ? null : Math.round((c.reabertos / c.resolvidos) * 100);

  return h(
    "div",
    { class: "grade-metricas" },
    indicador(
      "Chamados abertos",
      String(c.abertos),
      `${c.no_periodo} entraram em ${p.periodo_dias} dias`,
    ),
    indicador(
      "P1 em aberto",
      String(c.criticos),
      "protocolo de guerra ativo",
      avaliarInverso(c.criticos, 0),
    ),
    indicador(
      "Prazo violado",
      String(p.prazos.violados),
      "passaram do SLA de solução",
      avaliarInverso(p.prazos.violados, 0),
    ),
    indicador(
      "Vencem em 4h",
      String(p.prazos.em_risco),
      "exigem atenção agora",
      avaliarInverso(p.prazos.em_risco, 2),
    ),
    indicador(
      "Sem responsável",
      String(c.sem_responsavel),
      "ainda na fila coletiva",
      avaliarInverso(c.sem_responsavel, 3),
    ),
    indicador(
      "Taxa de reabertura",
      taxaReabertura === null ? "—" : `${taxaReabertura}%`,
      `meta de até ${METAS.reabertura_max}%`,
      taxaReabertura === null
        ? "neutro"
        : avaliarInverso(taxaReabertura, METAS.reabertura_max),
    ),
  );
}

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

  const linhas = p.sla.map((s) => {
    const meta = s.prioridade === "P1" ? METAS.sla_p1 : METAS.sla_demais;
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

function blocoOperacao(p: PainelGovernanca): HTMLElement {
  return cartao(
    "Operação preventiva e demandas",
    h(
      "div",
      { class: "grade-metricas", style: "margin:0" },
      indicador(
        "Aderência a rotinas",
        p.rotinas.aderencia === null ? "—" : `${p.rotinas.aderencia}%`,
        `meta de ${METAS.aderencia_rotinas}% · ${p.rotinas.ativas} rotinas ativas`,
        avaliarMeta(p.rotinas.aderencia, METAS.aderencia_rotinas),
      ),
      indicador(
        "Rotinas com falha",
        String(p.rotinas.com_falha + p.rotinas.nao_executadas),
        "cada uma abriu um incidente",
        avaliarInverso(p.rotinas.com_falha + p.rotinas.nao_executadas, 1),
      ),
      indicador(
        "Demandas atrasadas",
        String(p.demandas.atrasadas),
        `de ${p.demandas.abertas} em aberto`,
        avaliarInverso(p.demandas.atrasadas, 2),
      ),
      indicador(
        "Disponíveis para pegar",
        String(p.demandas.disponiveis),
        `progresso médio de ${p.demandas.progresso_medio}%`,
      ),
      indicador(
        "Inventário sujo",
        String(p.ativos.desatualizados),
        `de ${p.ativos.total} ativos cadastrados`,
        avaliarInverso(p.ativos.desatualizados, 3),
      ),
      indicador(
        "Ativos sem dono",
        String(p.ativos.sem_dono),
        "ninguém responde tecnicamente",
        avaliarInverso(p.ativos.sem_dono, 0),
      ),
    ),
  );
}

function blocoOrganizacao(p: PainelGovernanca): HTMLElement {
  return cartao(
    "Conhecimento e organização",
    h(
      "div",
      { class: "grade-metricas", style: "margin:0" },
      indicador(
        "Artigos publicados",
        String(p.conhecimento.publicados),
        `${p.conhecimento.vencidos} fora da validade`,
        p.conhecimento.vencidos > 0 ? "alerta" : "ok",
      ),
      indicador(
        "Chamados evitados",
        String(p.conhecimento.chamados_evitados),
        "resolvidos por autoatendimento",
        "ok",
      ),
      indicador(
        "Erros sem correção",
        String(p.kedb.sem_solucao),
        p.kedb.custo_mes > 0
          ? `${formatarMoeda(p.kedb.custo_mes)}/mês em contorno`
          : "só com contorno",
        avaliarInverso(p.kedb.sem_solucao, 2),
      ),
      indicador(
        "Pessoas ativas",
        String(p.pessoas.total),
        `${p.pessoas.coordenadores} coord. · ${p.pessoas.gestores} gest. · ${p.pessoas.colaboradores} colab.`,
      ),
    ),
    p.kedb.custo_mes > 0
      ? h(
          "div",
          { class: "aviso aviso--alerta", style: "margin:var(--s-4) 0 0" },
          h("span", { class: "aviso__icone" }, "!"),
          h(
            "span",
            {},
            h("b", {}, `${formatarMoeda(p.kedb.custo_mes)} por mês `),
            "gastos em contorno de erros sem correção definitiva. É o argumento de orçamento para priorizar as correções.",
          ),
        )
      : null,
  );
}
