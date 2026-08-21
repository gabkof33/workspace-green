/**
 * Fluxo de eventos de observabilidade em tempo real.
 *
 * Funde duas fontes: a captura local (instantânea, só da própria aba — via
 * `aoRegistrarEventoLocal`) e o Realtime do Postgres (chega de qualquer
 * sessão, com o atraso do lote — até `INTERVALO_MS` de `observabilidade-fila`).
 * O `request_id` decide a deduplicação: quem gerou o evento já viu a versão
 * local e ignora a que volta pelo Realtime.
 *
 * Escopo de página, como o canal de conversas: quem chama liga ao montar a
 * tela e desliga ao trocar de rota — não é uma assinatura de app inteiro,
 * porque só a aba de Fluxo anima por evento.
 */

import { aoRegistrarEventoLocal } from "@/lib/observabilidade-fila";
import { usuarioAtual, type EventoCapturado } from "@/lib/observabilidade-nucleo";
import { supabase } from "@/lib/supabase";
import type { EventoApi } from "@/types/dominio";

export type OuvinteEvento = (evento: EventoApi) => void;

const LIMITE_VISTOS = 500;

let assinatura: ReturnType<typeof supabase.channel> | null = null;
let pararLocal: (() => void) | null = null;
let vistos = new Set<string>();

function marcarVisto(requestId: string): boolean {
  if (vistos.has(requestId)) return true;

  vistos.add(requestId);
  if (vistos.size > LIMITE_VISTOS) {
    const primeiro = vistos.values().next().value;
    if (primeiro) vistos.delete(primeiro);
  }
  return false;
}

/** Evento local ainda não gravado: sem `id` de banco, por isso `0` — nunca
 * corresponde a uma linha real e não deve ser usado para navegação/detalhe. */
function deCapturado(evento: EventoCapturado): EventoApi {
  return {
    id: 0,
    request_id: evento.requestId,
    trace_id: evento.traceId,
    parent_span_id: evento.parentSpanId,
    nome_operacao: evento.nomeOperacao,
    servico_destino: evento.servicoDestino,
    endpoint: evento.endpoint,
    metodo_http: evento.metodoHttp,
    status_code: evento.statusCode,
    latencia_ms: evento.latenciaMs,
    tempo_banco_ms: evento.tempoBancoMs,
    qtd_registros: evento.qtdRegistros,
    usuario_id: usuarioAtual().id ?? "",
    erro_tipo: evento.erroTipo,
    erro_mensagem: evento.erroMensagem,
    criado_em: evento.criadoEm,
  };
}

export function iniciarFluxoTempoReal(ouvinte: OuvinteEvento): void {
  if (assinatura) return;

  pararLocal = aoRegistrarEventoLocal((capturado) => {
    if (marcarVisto(capturado.requestId)) return;
    ouvinte(deCapturado(capturado));
  });

  assinatura = supabase
    .channel("observabilidade:eventos-api")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "eventos_api" },
      (payload) => {
        const linha = payload.new as EventoApi;
        if (marcarVisto(linha.request_id)) return;
        ouvinte(linha);
      },
    )
    .subscribe();
}

export function pararFluxoTempoReal(): void {
  if (assinatura) {
    void supabase.removeChannel(assinatura);
    assinatura = null;
  }
  if (pararLocal) {
    pararLocal();
    pararLocal = null;
  }
  vistos = new Set();
}
