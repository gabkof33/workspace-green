/**
 * Fila de eventos de observabilidade: agrupa em lote e grava.
 *
 * Não importa `supabase.ts` — é o inverso: `supabase.ts` injeta aqui o
 * gravador (`configurarGravador`) depois de criar o cliente. Isso evita um
 * ciclo de módulos (o cliente Supabase precisa desta fila para instrumentar
 * o próprio `fetch`) e mantém esta fila reutilizável por qualquer gravador
 * que implemente a mesma forma.
 */

import {
  usuarioAtual,
  type EventoCapturado,
} from "@/lib/observabilidade-nucleo";
import type { Inserir } from "@/types/database";

const TAMANHO_LOTE = 20;
const INTERVALO_MS = 5000;

export interface GravadorEventos {
  gravar(
    linhas: Array<Inserir<"eventos_api">>,
  ): Promise<{ error: { message: string } | null }>;
}

export type OuvinteLocal = (evento: EventoCapturado) => void;

let gravador: GravadorEventos | null = null;
let lote: Array<Inserir<"eventos_api">> = [];
let temporizador: ReturnType<typeof setTimeout> | null = null;
const ouvintesLocais = new Set<OuvinteLocal>();

export function configurarGravador(g: GravadorEventos): void {
  gravador = g;
}

/**
 * Ouve cada evento no instante em que é capturado — antes de entrar na fila.
 *
 * É o que permite a tela de Fluxo animar a própria ação da pessoa
 * instantaneamente, sem esperar o lote ir ao banco e voltar pelo Realtime.
 */
export function aoRegistrarEventoLocal(ouvinte: OuvinteLocal): () => void {
  ouvintesLocais.add(ouvinte);
  return () => ouvintesLocais.delete(ouvinte);
}

function paraLinha(evento: EventoCapturado): Inserir<"eventos_api"> | null {
  const { id: usuarioId } = usuarioAtual();
  // Sem sessão a política de RLS recusaria de qualquer forma — descarta aqui
  // para não acumular lote que nunca vai ser aceito.
  if (!usuarioId) return null;

  return {
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
    usuario_id: usuarioId,
    erro_tipo: evento.erroTipo,
    erro_mensagem: evento.erroMensagem,
    // Explícito, não o default do banco: sem isto o timestamp seria o
    // instante em que o lote foi gravado — até `INTERVALO_MS` depois da
    // chamada real — e não o instante da chamada em si.
    criado_em: evento.criadoEm,
  };
}

export function enfileirar(evento: EventoCapturado): void {
  for (const ouvinte of ouvintesLocais) {
    try {
      ouvinte(evento);
    } catch (erro) {
      console.warn("[observabilidade] ouvinte local falhou", erro);
    }
  }

  const linha = paraLinha(evento);
  if (!linha) return;

  lote.push(linha);
  if (lote.length >= TAMANHO_LOTE) {
    void descarregar();
    return;
  }
  temporizador ??= setTimeout(() => void descarregar(), INTERVALO_MS);
}

async function descarregar(): Promise<void> {
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  if (lote.length === 0 || !gravador) return;

  const linhas = lote;
  lote = [];

  try {
    const { error } = await gravador.gravar(linhas);
    if (error) {
      console.warn("[observabilidade] falha ao gravar lote", error.message);
    }
  } catch (erro) {
    // Log é acessório: uma falha aqui nunca deve reaparecer como erro do app.
    console.warn("[observabilidade] falha ao gravar lote", erro);
  }
}

/**
 * Envio de melhor esforço no fechamento da aba.
 *
 * Contorna o cliente Supabase de propósito: `navigator.sendBeacon` não
 * permite definir o cabeçalho `Authorization`, e sem ele o RLS recusaria a
 * gravação. `fetch(..., { keepalive: true })` é o substituto que ainda
 * permite cabeçalhos — sem garantia de entrega, mas é só isso que dá para
 * prometer numa aba fechando.
 */
function descarregarNaSaida(): void {
  if (lote.length === 0) return;

  const { token } = usuarioAtual();
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const chave = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !url || !chave) return;

  const linhas = lote;
  lote = [];

  fetch(`${url}/rest/v1/eventos_api`, {
    method: "POST",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      apikey: chave,
      Authorization: `Bearer ${token}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(linhas),
  }).catch(() => {
    // Melhor esforço: a aba já está fechando, não há para onde avisar.
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") descarregarNaSaida();
});
window.addEventListener("pagehide", descarregarNaSaida);
