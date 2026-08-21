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

export type Situacao = "ok" | "alerta" | "critico";

const LIMITE_TAXA_ERRO_ALERTA = 0.01;
const LIMITE_TAXA_ERRO_CRITICO = 0.05;

export function avaliarTaxaErro(taxa: number): Situacao {
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
  return "var(--c-ok)";
}

export function corWashDaSituacao(situacao: Situacao): string {
  if (situacao === "critico") return "var(--c-erro-wash)";
  if (situacao === "alerta") return "var(--c-alerta-wash)";
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
