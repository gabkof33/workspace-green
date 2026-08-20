/** Cronograma em Gantt. */

import { aguardando } from "@/components/esqueleto";
import { h, montar, avisar } from "@/lib/dom";
import { escolherData } from "@/components/dialogo";
import { navegar } from "@/lib/router";
import {
  atualizarDemanda,
  diasRestantes,
  estaAtrasada,
  listarDemandas,
  ROTULOS_PRIORIDADE,
  ROTULOS_STATUS_DEMANDA,
  ROTULOS_TIPO,
  STATUS_ABERTOS,
} from "@/lib/demandas";
import { listarChamados } from "@/lib/api";
import { rotuloStatus } from "@/lib/formato";
import type {
  ChamadoEnriquecido,
  DemandaEnriquecida,
  Perfil,
  PrioridadeDemanda,
  StatusChamado,
  TipoDemanda,
} from "@/types/dominio";

const DIA_MS = 86_400_000;

type Escopo = "abertas" | "minhas" | "todas";

/** De onde vem a linha. */
type Origem = "tudo" | "demandas" | "chamados";

const ORIGENS: Array<[Origem, string, string]> = [
  ["tudo", "Tudo", "Demandas e chamados no mesmo gráfico"],
  ["demandas", "Demandas", "Só o trabalho planejado"],
  ["chamados", "Chamados", "Só a fila de atendimento"],
];

/*
 * Linha do cronograma Demanda e chamado não compartilham tabela nem
 * vocabulário — status, prioridade e percentual são conceitos diferentes dos
 */

interface ItemCronograma {
  origem: "demanda" | "chamado";
  id: string;
  codigo: string;
  titulo: string;
  rota: string;
  inicio: string | null;
  fim: string | null;
  /** Base de "dias restantes" — o previsto, não o realizado. */
  fimPrevisto: string | null;
  percentual: number;
  cor: CorBarra;
  atrasado: boolean;
  rotuloStatus: string;
  rotuloPrioridade: string;
  responsavel: string | null;
  extra: string | null;
  /** Id do antecessor. */
  dependeDeId: string | null;
  /** Só demanda aceita prazo definido na tela; chamado tem o do SLA. */
  demanda: DemandaEnriquecida | null;
}

/** As seis cores de barra. */
type CorBarra =
  "verde" | "amarelo" | "laranja" | "vermelho" | "azul" | "violeta";

const COR_POR_PRIORIDADE_CHAMADO: Record<string, CorBarra> = {
  P1: "vermelho",
  P2: "laranja",
  P3: "amarelo",
  P4: "azul",
};

const COR_POR_PRIORIDADE_DEMANDA: Record<PrioridadeDemanda, CorBarra> = {
  critica: "vermelho",
  alta: "laranja",
  media: "amarelo",
  baixa: "azul",
};

/** Data local em ISO. */
function diaLocal(ts: string): string {
  const d = new Date(ts);
  const dois = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** Percentual do chamado. */
const AVANCO_CHAMADO: Record<StatusChamado, number> = {
  novo: 5,
  triado: 15,
  atribuido: 25,
  em_atendimento: 55,
  pendente_usuario: 55,
  pendente_terceiro: 55,
  pendente_mudanca: 55,
  resolvido: 90,
  fechado: 100,
  cancelado: 100,
};

const ENCERRADOS: StatusChamado[] = ["resolvido", "fechado", "cancelado"];
const PAUSADOS: StatusChamado[] = [
  "pendente_usuario",
  "pendente_terceiro",
  "pendente_mudanca",
];

function deDemanda(d: DemandaEnriquecida): ItemCronograma {
  return {
    origem: "demanda",
    id: d.id,
    codigo: d.codigo,
    titulo: d.titulo,
    rota: `demanda/${d.codigo}`,
    inicio: d.data_inicio_real ?? d.data_inicio_prevista,
    fim: d.data_fim_real ?? d.data_fim_prevista,
    fimPrevisto: d.data_fim_prevista,
    percentual: d.percentual,
    cor:
      d.status === "concluida"
        ? "verde"
        : d.status === "bloqueada"
          ? "violeta"
          : COR_POR_PRIORIDADE_DEMANDA[d.prioridade],
    atrasado: estaAtrasada(d),
    rotuloStatus: ROTULOS_STATUS_DEMANDA[d.status],
    rotuloPrioridade: ROTULOS_PRIORIDADE[d.prioridade],
    responsavel: d.responsavel_nome,
    extra: d.depende_de_codigo ? `depois de ${d.depende_de_codigo}` : null,
    dependeDeId: d.depende_de_id,
    demanda: d,
  };
}

function deChamado(c: ChamadoEnriquecido): ItemCronograma {
  const encerrado = ENCERRADOS.includes(c.status);
  const fimReal = c.resolvido_em ?? c.fechado_em;
  const atrasado =
    !encerrado && new Date(c.prazo_solucao).getTime() < Date.now();

  return {
    origem: "chamado",
    id: c.id,
    codigo: c.numero,
    titulo: c.titulo,
    rota: `chamado/${c.numero}`,
    inicio: diaLocal(c.aberto_em),
    // Encerrado mostra quando de fato terminou; em aberto, até onde o SLA
    // permite ir.
    fim: diaLocal(encerrado && fimReal ? fimReal : c.prazo_solucao),
    fimPrevisto: diaLocal(c.prazo_solucao),
    percentual: AVANCO_CHAMADO[c.status],
    cor: encerrado
      ? "verde"
      : PAUSADOS.includes(c.status)
        ? "violeta"
        : (COR_POR_PRIORIDADE_CHAMADO[c.prioridade] ?? "azul"),
    atrasado,
    rotuloStatus: rotuloStatus(c.status),
    rotuloPrioridade: c.prioridade,
    responsavel: c.responsavel_nome,
    extra: c.equipe_nome,
    // Chamado não encadeia: ele é atendido, não sequenciado.
    dependeDeId: null,
    demanda: null,
  };
}

/** Recorte do tempo mostrado. */
type Periodo = "quinzena" | "mes" | "tudo";

const PERIODOS: Array<[Periodo, string, string]> = [
  ["quinzena", "±7 dias", "Uma semana para trás e uma para frente"],
  ["mes", "±30 dias", "Um mês para cada lado"],
  ["tudo", "Tudo", "Da demanda mais antiga à mais distante"],
];

/** Largura de cada coluna de dia. */
function larguraDoDia(dias: number): number {
  // 15 dias × 58px = 870px de trilha; somados à coluna de rótulos, cabem na
  // largura do conteúdo sem rolagem horizontal.
  if (dias <= 16) return 58;
  if (dias <= 32) return 38;
  if (dias <= 62) return 27;
  return 21;
}

export function renderizarGantt(alvo: HTMLElement, perfil: Perfil): void {
  let escopo: Escopo = "abertas";
  let origem: Origem = "tudo";
  let tipo: TipoDemanda | null = null;
  let periodo: Periodo = "quinzena";

  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  aoDefinirPrazo = (d): void => {
    const hoje = new Date().toISOString().slice(0, 10);

    // Seletor de data nativo em vez de texto livre: erro de formato deixa
    // de ser possível, e a pessoa vê o calendário.
    void escolherData({
      titulo: `Prazo de ${d.codigo}`,
      texto: d.titulo,
      ...(d.data_fim_prevista ? { valorInicial: d.data_fim_prevista } : {}),
    }).then((resposta) => {
      if (!resposta) return;

      void atualizarDemanda(d.id, {
        data_fim_prevista: resposta,
        data_inicio_prevista: d.data_inicio_prevista ?? hoje,
      })
        .then(() => {
          avisar(`Prazo de ${d.codigo} definido.`, "ok");
          desenhar();
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha ao gravar.", "erro"),
        );
    });
  };

  const desenhar = (): void => {
    aguardando(area, "tabela");
    // O filtro de tipo é vocabulário de demanda; com ele ligado, pedir
    // chamado seria pedir uma lista que será descartada inteira.
    const querChamados = origem !== "demandas" && tipo === null;

    void Promise.all([
      origem === "chamados"
        ? Promise.resolve([] as DemandaEnriquecida[])
        : listarDemandas({ tipo }),
      querChamados
        ? listarChamados({})
        : Promise.resolve([] as ChamadoEnriquecido[]),
    ])
      .then(([demandas, chamados]) => {
        const deman = demandas
          .filter((d) =>
            escopo === "minhas"
              ? d.responsavel_id === perfil.id
              : escopo === "abertas"
                ? STATUS_ABERTOS.includes(d.status)
                : true,
          )
          .map(deDemanda);

        const cham = chamados
          .filter((c) =>
            escopo === "minhas"
              ? // "Minhas" no chamado é o mesmo recorte de "Meus chamados":…
                c.responsavel_id === perfil.id || c.solicitante_id === perfil.id
              : escopo === "abertas"
                ? !ENCERRADOS.includes(c.status)
                : true,
          )
          .map(deChamado);

        // Ordem única para os dois: o que vence antes aparece antes.
        const itens = [...cham, ...deman].sort((a, b) =>
          (a.fimPrevisto ?? "9999").localeCompare(b.fimPrevisto ?? "9999"),
        );

        montar(area, filtros(), montarGantt(itens, periodo));
      })
      .catch((e: unknown) => {
        avisar(
          e instanceof Error ? e.message : "Falha ao montar o cronograma.",
          "erro",
        );
      });
  };

  const filtros = (): HTMLElement => {
    const botaoPeriodo = (
      valor: Periodo,
      rotulo: string,
      dica: string,
    ): HTMLElement =>
      h(
        "button",
        {
          class: `btn btn--sm${periodo === valor ? " btn--primario" : ""}`,
          type: "button",
          title: dica,
          on: {
            click: () => {
              periodo = valor;
              desenhar();
            },
          },
        },
        rotulo,
      );

    const botao = (valor: Escopo, rotulo: string): HTMLElement =>
      h(
        "button",
        {
          class: `btn btn--sm${escopo === valor ? " btn--primario" : ""}`,
          type: "button",
          on: {
            click: () => {
              escopo = valor;
              desenhar();
            },
          },
        },
        rotulo,
      );

    const selTipo = h(
      "select",
      {
        class: "selecao",
        style: "max-width:180px",
        on: {
          change: (ev: Event) => {
            const v = (ev.target as HTMLSelectElement).value;
            tipo = v ? (v as TipoDemanda) : null;
            desenhar();
          },
        },
      },
      h("option", { value: "" }, "Todos os tipos"),
      ...(Object.keys(ROTULOS_TIPO) as TipoDemanda[]).map((t) =>
        h("option", { value: t }, ROTULOS_TIPO[t]),
      ),
    ) as HTMLSelectElement;
    selTipo.value = tipo ?? "";
    selTipo.disabled = origem === "chamados";
    selTipo.title =
      origem === "chamados"
        ? "O tipo classifica demandas; chamados usam o catálogo de serviços."
        : "";

    const botaoOrigem = (
      valor: Origem,
      rotulo: string,
      dica: string,
    ): HTMLElement =>
      h(
        "button",
        {
          class: `btn btn--sm${origem === valor ? " btn--primario" : ""}`,
          type: "button",
          title: dica,
          on: {
            click: () => {
              origem = valor;
              // Tipo é filtro de demanda: mantê-lo ao pedir só chamados
              // devolveria um gráfico sempre vazio.
              if (valor === "chamados") tipo = null;
              desenhar();
            },
          },
        },
        rotulo,
      );

    return h(
      "div",
      { class: "grade-filtros" },
      ...PERIODOS.map(([v, rotulo, dica]) => botaoPeriodo(v, rotulo, dica)),
      h("span", { class: "grade-filtros__separador" }),
      ...ORIGENS.map(([v, rotulo, dica]) => botaoOrigem(v, rotulo, dica)),
      h("span", { class: "grade-filtros__separador" }),
      botao("abertas", "Em aberto"),
      botao("minhas", "Minhas"),
      botao("todas", "Todas"),
      selTipo,
      h(
        "button",
        {
          class: "btn btn--sm empurra",
          type: "button",
          on: { click: () => navegar("demandas") },
        },
        "Ver lista",
      ),
    );
  };

  desenhar();
}

/* Montagem do gráfico */

function soDia(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1);
}

function hojeSemHora(): Date {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

function diferencaEmDias(de: Date, ate: Date): number {
  return Math.round((ate.getTime() - de.getTime()) / DIA_MS);
}

interface Janela {
  inicio: Date;
  dias: number;
}

/** Janela centrada em hoje, com o mesmo número de dias para cada lado. */
function janelaCentrada(raio: number): Janela {
  const inicio = hojeSemHora();
  inicio.setDate(inicio.getDate() - raio);
  return { inicio, dias: raio * 2 + 1 };
}

/** Recorte de tempo do gráfico. */
function calcularJanela(itens: ItemCronograma[], periodo: Periodo): Janela {
  if (periodo === "quinzena") return janelaCentrada(7);
  if (periodo === "mes") return janelaCentrada(30);

  const hoje = hojeSemHora();
  const datas: Date[] = [hoje];

  for (const i of itens) {
    if (i.inicio) datas.push(soDia(i.inicio));
    if (i.fim) datas.push(soDia(i.fim));
  }

  const min = new Date(Math.min(...datas.map((d) => d.getTime())));
  const max = new Date(Math.max(...datas.map((d) => d.getTime())));

  const inicio = new Date(min);
  inicio.setDate(inicio.getDate() - 3);
  const fim = new Date(max);
  fim.setDate(fim.getDate() + 3);

  // Teto de 180 dias: além disso a barra fica fina demais para significar
  // algo.
  const dias = Math.min(diferencaEmDias(inicio, fim) + 1, 180);
  return { inicio, dias: Math.max(dias, 15) };
}

/** Altura de uma linha, incluindo a borda. */
const ALTURA_LINHA = 45;

interface Geometria {
  /** Coluna do primeiro dia visível da barra. */
  esquerda: number;
  /** Quantidade de colunas ocupadas depois do recorte pela janela. */
  colunas: number;
}

/** Posição da barra em colunas de dia, já recortada à janela. */
function geometria(item: ItemCronograma, janela: Janela): Geometria | null {
  if (!item.inicio || !item.fim) return null;

  const offset = diferencaEmDias(janela.inicio, soDia(item.inicio));
  const duracao = diferencaEmDias(soDia(item.inicio), soDia(item.fim)) + 1;

  const esquerda = Math.max(offset, 0);
  const fimIndice = Math.min(offset + duracao, janela.dias);
  if (fimIndice <= 0 || esquerda >= janela.dias) return null;

  return { esquerda, colunas: Math.max(fimIndice - esquerda, 1) };
}

/** Camada de setas entre antecessor e dependente. */
function camadaDependencias(
  itens: ItemCronograma[],
  janela: Janela,
  largura: number,
  dia: number,
): SVGElement | null {
  const linhaDe = new Map<string, number>();
  itens.forEach((item, i) => linhaDe.set(item.id, i));

  /** Caminho do cotovelo mais o ponto onde a ponta encaixa. */
  const ligacoes: Array<{ d: string; x: number; y: number }> = [];

  itens.forEach((item, i) => {
    if (!item.dependeDeId) return;
    const iAnterior = linhaDe.get(item.dependeDeId);
    if (iAnterior === undefined) return;

    const anterior = itens[iAnterior];
    if (!anterior) return;

    const gA = geometria(anterior, janela);
    const gB = geometria(item, janela);
    if (!gA || !gB) return;

    const x1 = (gA.esquerda + gA.colunas) * dia - 2;
    const y1 = iAnterior * ALTURA_LINHA + ALTURA_LINHA / 2;
    const x2 = gB.esquerda * dia + 2;
    const y2 = i * ALTURA_LINHA + ALTURA_LINHA / 2;

    // A ponta para antes da barra para não ficar por baixo dela.
    const xPonta = x2 - 7;

    ligacoes.push({
      d:
        xPonta >= x1 + 18
          ? // Espaço à frente: sai do fim do antecessor, desce e entra.
            `M ${x1} ${y1} H ${x1 + 9} V ${y2} H ${xPonta}`
          : // O dependente começa antes de o antecessor terminar.
            `M ${x1} ${y1} H ${x1 + 9} ` +
            `V ${y1 + (y2 > y1 ? 1 : -1) * (ALTURA_LINHA / 2)} ` +
            `H ${xPonta - 9} V ${y2} H ${xPonta}`,
      x: xPonta,
      y: y2,
    });
  });

  if (ligacoes.length === 0) return null;

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "gantt__dependencias");
  svg.setAttribute("width", String(largura));
  svg.setAttribute("height", String(itens.length * ALTURA_LINHA));
  svg.setAttribute("aria-hidden", "true");

  for (const lig of ligacoes) {
    const caminho = document.createElementNS(NS, "path");
    caminho.setAttribute("d", lig.d);
    caminho.setAttribute("class", "gantt__seta");
    svg.append(caminho);

    // Ponta como polígono próprio, e não `marker-end`: o marcador herda o
    // traço do caminho em parte dos navegadores e a seta sai listrada.
    const ponta = document.createElementNS(NS, "polygon");
    ponta.setAttribute(
      "points",
      `${lig.x},${lig.y - 4} ${lig.x + 6},${lig.y} ${lig.x},${lig.y + 4}`,
    );
    ponta.setAttribute("class", "gantt__seta-ponta");
    svg.append(ponta);
  }

  return svg;
}

/**
 * A grade fica montada mesmo sem nada dentro.
 *
 * Trocar o gráfico por um cartão de aviso apagava a régua de datas e a coluna
 * de hoje — justamente o que situa quem está olhando. Vazio, o cronograma
 * ainda responde "que semana é esta", e a mensagem fica na linha onde as
 * barras apareceriam.
 */
function montarGantt(itens: ItemCronograma[], periodo: Periodo): HTMLElement {
  const vazio = itens.length === 0;

  const janela = calcularJanela(itens, periodo);
  const hoje = hojeSemHora();
  const dia = larguraDoDia(janela.dias);
  const larguraTrilha = janela.dias * dia;

  const corpo = h(
    "div",
    { class: "gantt__corpo" },
    ...(vazio
      ? [linhaVazia(janela, hoje, larguraTrilha, dia)]
      : itens.map((i) => linha(i, janela, hoje, larguraTrilha, dia))),
    vazio ? null : camadaDependencias(itens, janela, larguraTrilha, dia),
  );

  return h(
    "div",
    // A largura da coluna vai como variável CSS porque as faixas de fim de
    // semana e a marca de hoje são desenhadas pelo estilo, não aqui.
    { class: "gantt", style: `--gantt-dia:${dia}px` },
    h(
      "div",
      { class: "gantt__rolagem" },
      h(
        "div",
        { class: "gantt__interno" },
        cabecalho(janela, hoje, larguraTrilha, dia),
        corpo,
      ),
    ),
    legenda(),
  );
}

/**
 * Fins de semana e a coluna de hoje.
 *
 * Cada dia de fim de semana é desenhado individualmente. Desenhar só no
 * sábado com largura dupla deixava sem sombra o domingo que abre a janela, e
 * transbordava quando a janela terminava num sábado.
 */
function fundoDaTrilha(
  trilha: HTMLElement,
  janela: Janela,
  hoje: Date,
  dia: number,
): void {
  for (let i = 0; i < janela.dias; i += 1) {
    const data = new Date(janela.inicio);
    data.setDate(data.getDate() + i);

    if (data.getDay() === 0 || data.getDay() === 6) {
      trilha.append(
        h("div", {
          class: "gantt__fds",
          style: `left:${i * dia}px;width:${dia}px`,
        }),
      );
    }
    if (data.getTime() === hoje.getTime()) {
      trilha.append(
        h("div", {
          class: "gantt__hoje",
          style: `left:${i * dia}px`,
        }),
      );
    }
  }
}

/** Uma linha só, com o fundo de sempre e o aviso no lugar das barras. */
function linhaVazia(
  janela: Janela,
  hoje: Date,
  largura: number,
  dia: number,
): HTMLElement {
  const trilha = h("div", {
    class: "gantt__trilha",
    style: `width:${largura}px`,
  });

  fundoDaTrilha(trilha, janela, hoje, dia);

  trilha.append(
    h(
      "span",
      { class: "gantt__sem-data gantt__vazio" },
      "Nada no recorte atual. Chamado sempre tem barra, porque o SLA lhe dá prazo na abertura; demanda sem data de entrega aparece sem barra — defina o prazo para ela entrar no gráfico.",
    ),
  );

  return h(
    "div",
    { class: "gantt__linha" },
    h(
      "div",
      { class: "gantt__rotulo" },
      h("span", { class: "texto-sutil" }, "—"),
    ),
    trilha,
  );
}

const NOMES_MES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
const INICIAIS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function cabecalho(
  janela: Janela,
  hoje: Date,
  largura: number,
  dia: number,
): HTMLElement {
  const trilha = h("div", {
    class: "gantt__trilha",
    style: `width:${largura}px;min-height:44px`,
  });

  // Faixa de mês: uma por bloco contíguo de dias do mesmo mês.
  let inicioBloco = 0;
  for (let i = 0; i <= janela.dias; i += 1) {
    const data = new Date(janela.inicio);
    data.setDate(data.getDate() + i);

    const anterior = new Date(janela.inicio);
    anterior.setDate(anterior.getDate() + inicioBloco);

    const mudouMes =
      i === janela.dias || data.getMonth() !== anterior.getMonth();
    if (mudouMes) {
      trilha.append(
        h(
          "div",
          {
            class: "gantt__mes",
            style: `left:${inicioBloco * dia}px;width:${(i - inicioBloco) * dia}px`,
          },
          `${NOMES_MES[anterior.getMonth()]} ${anterior.getFullYear()}`,
        ),
      );
      inicioBloco = i;
    }
  }

  for (let i = 0; i < janela.dias; i += 1) {
    const data = new Date(janela.inicio);
    data.setDate(data.getDate() + i);
    const fds = data.getDay() === 0 || data.getDay() === 6;
    const ehHoje = data.getTime() === hoje.getTime();

    trilha.append(
      h(
        "div",
        {
          class: `gantt__dia${fds ? " gantt__dia--fds" : ""}${ehHoje ? " gantt__dia--hoje" : ""}`,
          style: `left:${i * dia}px`,
          title: data.toLocaleDateString("pt-BR"),
        },
        h("b", {}, String(data.getDate())),
        h("span", {}, INICIAIS_SEMANA[data.getDay()] ?? ""),
      ),
    );
  }

  return h(
    "div",
    { class: "gantt__linha gantt__cabecalho" },
    h("div", { class: "gantt__rotulo" }, "Trabalho"),
    trilha,
  );
}

/** Pede o prazo e grava. */
let aoDefinirPrazo: (d: DemandaEnriquecida) => void = () => {};

function linha(
  item: ItemCronograma,
  janela: Janela,
  hoje: Date,
  largura: number,
  dia: number,
): HTMLElement {
  const trilha = h("div", {
    class: "gantt__trilha",
    style: `width:${largura}px`,
  });

  fundoDaTrilha(trilha, janela, hoje, dia);

  const geo = geometria(item, janela);

  if (geo) {
    const esquerda = geo.esquerda;
    const larguraDias = geo.colunas;
    const variante =
      ` gantt__barra--${item.cor}` +
      (item.atrasado ? " gantt__barra--atrasada" : "");

    const dias = diasRestantes(item.fimPrevisto);
    const titulo = [
      `${item.codigo} — ${item.titulo}`,
      `${item.rotuloStatus} · ${item.percentual}% concluído`,
      item.responsavel ? `Responsável: ${item.responsavel}` : "Sem responsável",
      dias === null
        ? "Sem prazo definido"
        : dias < 0
          ? `${Math.abs(dias)} dia(s) de atraso`
          : `${dias} dia(s) restantes`,
      item.atrasado ? "Prazo estourado" : null,
      item.origem === "chamado" ? "Prazo do SLA do serviço" : null,
    ]
      .filter(Boolean)
      .join("\n");

    trilha.append(
      h(
        "div",
        {
          class: `gantt__barra gantt__barra--${item.origem}${variante}`,
          style: `left:${esquerda * dia + 2}px;width:${larguraDias * dia - 4}px`,
          title: titulo,
          on: { click: () => navegar(item.rota) },
        },
        h("div", {
          class: "gantt__preenchimento",
          style: `width:${item.percentual}%`,
        }),
        h(
          "span",
          { class: "gantt__barra-texto" },
          larguraDias >= 4
            ? `${item.percentual}% · ${item.titulo}`
            : `${item.percentual}%`,
        ),
      ),
    );
  } else if (item.demanda) {
    // Sem prazo a demanda não tem barra — e sem barra ela some do
    // planejamento.
    const demanda = item.demanda;
    trilha.append(
      h(
        "span",
        { class: "gantt__sem-data" },
        "sem prazo — ",
        h(
          "button",
          {
            class: "btn btn--sutil btn--sm",
            type: "button",
            style: "padding:1px 6px;font-size:11px",
            on: {
              click: (ev: Event) => {
                ev.stopPropagation();
                aoDefinirPrazo(demanda);
              },
            },
          },
          "definir agora",
        ),
      ),
    );
  }

  return h(
    "div",
    { class: "gantt__linha gantt__linha--clicavel" },
    h(
      "div",
      {
        class: "gantt__rotulo",
        on: { click: () => navegar(item.rota) },
      },
      h(
        "span",
        { class: "gantt__rotulo-titulo", title: item.titulo },
        // A origem vai no rótulo, não só na cor: quem lê em tons de cinza,
        // ou imprime, precisa distinguir chamado de demanda.
        h(
          "span",
          { class: `gantt__origem gantt__origem--${item.origem}` },
          item.origem === "chamado" ? "CH" : "DE",
        ),
        item.titulo,
      ),
      h(
        "span",
        { class: "gantt__rotulo-meta" },
        [
          item.codigo,
          item.rotuloPrioridade,
          item.responsavel ?? "livre",
          item.extra,
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
    trilha,
  );
}

function legenda(): HTMLElement {
  const item = (classe: string, texto: string): HTMLElement =>
    h("span", {}, h("span", { class: `gantt__amostra ${classe}` }), texto);

  return h(
    "div",
    { class: "gantt__legenda" },
    item("gantt__amostra--vermelho", "P1 · crítica"),
    item("gantt__amostra--laranja", "P2 · alta"),
    item("gantt__amostra--amarelo", "P3 · média"),
    item("gantt__amostra--azul", "P4 · baixa"),
    item("gantt__amostra--violeta", "Pausado ou bloqueado"),
    item("gantt__amostra--verde", "Concluído"),
    item("gantt__amostra--atrasada", "Prazo estourado"),
    h(
      "span",
      {},
      h("span", { class: "gantt__origem gantt__origem--chamado" }, "CH"),
      " chamado · ",
      h("span", { class: "gantt__origem gantt__origem--demanda" }, "DE"),
      " demanda",
    ),
    h(
      "span",
      {},
      "O preenchimento sólido dentro da barra é o percentual concluído; a coluna verde é hoje. No chamado, o fim da barra é o prazo do SLA.",
    ),
  );
}
