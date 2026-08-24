/** Camada de leitura da observabilidade de APIs. */

import { supabase, traduzirErro } from "@/lib/supabase";
import type {
  EventoApi,
  GrafoServicos,
  KpisObservabilidade,
  TracoResumo,
} from "@/types/dominio";

export async function carregarGrafoServicos(
  minutos = 60,
): Promise<GrafoServicos> {
  const { data, error } = await supabase.rpc(
    "grafo_servicos_observabilidade",
    { p_minutos: minutos },
  );
  if (error) throw new Error(traduzirErro(error.message));
  return data as unknown as GrafoServicos;
}

export async function carregarTracosRecentes(
  minutos = 60,
  limite = 50,
): Promise<TracoResumo[]> {
  const { data, error } = await supabase.rpc(
    "tracos_recentes_observabilidade",
    { p_minutos: minutos, p_limite: limite },
  );
  if (error) throw new Error(traduzirErro(error.message));
  return (data as unknown as TracoResumo[] | null) ?? [];
}

export async function carregarKpisObservabilidade(
  minutos = 60,
): Promise<KpisObservabilidade> {
  const { data, error } = await supabase.rpc("kpis_observabilidade", {
    p_minutos: minutos,
  });
  if (error) throw new Error(traduzirErro(error.message));
  return data as unknown as KpisObservabilidade;
}

/**
 * Spans de um traço, para a cascata de tracing.
 *
 * Select direto, não RPC: é um recorte simples por `trace_id`, e a mesma
 * política de leitura de `eventos_api` já decide quem pode ver.
 */
export async function carregarSpansDoTraco(
  traceId: string,
): Promise<EventoApi[]> {
  const { data, error } = await supabase
    .from("eventos_api")
    .select(
      "id, request_id, trace_id, parent_span_id, nome_operacao, servico_destino, endpoint, metodo_http, status_code, latencia_ms, tempo_banco_ms, qtd_registros, usuario_id, erro_tipo, erro_mensagem, criado_em",
    )
    .eq("trace_id", traceId)
    .order("criado_em", { ascending: true });
  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as EventoApi[];
}

/**
 * Chamadas mais recentes na janela — a tabela crua por baixo de qualquer
 * uma das visualizações, não só do Fluxo (que é a versão ao vivo disto).
 */
export async function carregarEventosRecentes(
  minutos: number,
  limite = 40,
): Promise<EventoApi[]> {
  const desde = new Date(Date.now() - minutos * 60_000).toISOString();
  const { data, error } = await supabase
    .from("eventos_api")
    .select(
      "id, request_id, trace_id, parent_span_id, nome_operacao, servico_destino, endpoint, metodo_http, status_code, latencia_ms, tempo_banco_ms, qtd_registros, usuario_id, erro_tipo, erro_mensagem, criado_em",
    )
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as EventoApi[];
}

/* ---------- Limiares e formatação ---------- */

export type Situacao = "ok" | "alerta" | "critico" | "amostra-curta";

const LIMITE_TAXA_ERRO_ALERTA = 0.01;
const LIMITE_TAXA_ERRO_CRITICO = 0.05;

// Abaixo disso uma única falha já passa de 5% — a taxa não conclui nada.
const VOLUME_MINIMO_DA_JANELA = 20;

/** Volume insuficiente para a taxa de erro significar alguma coisa. */
export function amostraCurta(chamadas: number): boolean {
  return chamadas < VOLUME_MINIMO_DA_JANELA;
}

/**
 * Situação pela taxa de erro, com o volume que a produziu.
 *
 * `chamadas` é obrigatório de propósito: com 3 requisições a menor taxa
 * possível diferente de zero é 33%, sete vezes o limiar de crítico. Serviço
 * de baixo volume — `auth:login` é o caso típico — viveria vermelho.
 */
export function avaliarTaxaErro(taxa: number, chamadas: number): Situacao {
  if (amostraCurta(chamadas)) return "amostra-curta";
  if (taxa >= LIMITE_TAXA_ERRO_CRITICO) return "critico";
  if (taxa >= LIMITE_TAXA_ERRO_ALERTA) return "alerta";
  return "ok";
}

const LIMITE_P95_ALERTA_MS = 300;
const LIMITE_P95_CRITICO_MS = 1000;

export function avaliarLatencia(p95Ms: number): Situacao {
  if (p95Ms >= LIMITE_P95_CRITICO_MS) return "critico";
  if (p95Ms >= LIMITE_P95_ALERTA_MS) return "alerta";
  return "ok";
}

export function corDaSituacao(situacao: Situacao): string {
  if (situacao === "critico") return "var(--c-erro)";
  if (situacao === "alerta") return "var(--c-alerta)";
  if (situacao === "amostra-curta") return "var(--c-neutro)";
  return "var(--c-ok)";
}

export function corWashDaSituacao(situacao: Situacao): string {
  if (situacao === "critico") return "var(--c-erro-wash)";
  if (situacao === "alerta") return "var(--c-alerta-wash)";
  if (situacao === "amostra-curta") return "var(--c-neutro-wash)";
  return "var(--c-ok-wash)";
}

/** Duração legível a partir de milissegundos — mesma lógica de `duracao()`
 * em `tempos.ts`, mas na escala de milissegundos das chamadas de API. */
export function duracaoMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}

export function porcentagem(fracao: number): string {
  return `${(fracao * 100).toFixed(1)}%`;
}

/* ---------- Volume por faixa de tempo ---------- */

/**
 * Uma coluna do histograma: quantas chamadas caíram naquele intervalo, já
 * separadas por desfecho.
 *
 * Três séries, não quatro. Separar 4xx de 5xx era o desejável, mas as cores
 * de alerta e de erro deste sistema ficam a ΔE 6,1 uma da outra para visão
 * normal — no empilhamento seriam a mesma faixa. O recorte por código fica no
 * tooltip e na tabela, onde é número e não cor.
 */
export interface FaixaVolume {
  /** Início do intervalo, em ISO. */
  inicio: string;
  /** Respondeu com status abaixo de 400. */
  ok: number;
  /** Não houve resposta — falha de rede, requisição não chegou ao fim. */
  semResposta: number;
  /** Respondeu com 4xx ou 5xx. */
  erro: number;
}

/**
 * Distribui os eventos em faixas de tempo iguais dentro da janela.
 *
 * A janela é relativa a agora, não ao evento mais antigo recebido: faixa
 * vazia no fim é informação — significa que parou de chegar chamada — e
 * encolher o eixo até o último evento esconderia justamente isso.
 */
export function agruparVolume(
  eventos: EventoApi[],
  minutos: number,
  quantidade = 48,
): FaixaVolume[] {
  const baldes = Math.max(1, quantidade);
  const fim = Date.now();
  const inicio = fim - minutos * 60_000;
  const largura = (fim - inicio) / baldes;

  const faixas: FaixaVolume[] = Array.from({ length: baldes }, (_, i) => ({
    inicio: new Date(inicio + i * largura).toISOString(),
    ok: 0,
    semResposta: 0,
    erro: 0,
  }));

  for (const evento of eventos) {
    const t = new Date(evento.criado_em).getTime();
    if (!Number.isFinite(t)) continue;

    const indice = Math.floor((t - inicio) / largura);
    // Evento fora da janela é descartado, não empurrado para a borda:
    // acumulá-lo na primeira faixa inventaria um pico que não houve.
    if (indice < 0 || indice >= baldes) continue;

    const faixa = faixas[indice];
    if (!faixa) continue;

    if (evento.erro_tipo === "rede") faixa.semResposta += 1;
    else if (evento.status_code !== null && evento.status_code >= 400) {
      faixa.erro += 1;
    } else if (evento.erro_tipo !== null) faixa.erro += 1;
    else faixa.ok += 1;
  }

  return faixas;
}
