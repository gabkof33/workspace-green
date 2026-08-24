/** Conversas por equipe. */

import { supabase, traduzirErro } from "@/lib/supabase";
import type {
  CanalComContagem,
  Mensagem,
  MensagemEnriquecida,
  Perfil,
} from "@/types/dominio";
import type { RealtimeChannel } from "@supabase/supabase-js";

/* Canais */

export async function listarCanais(): Promise<CanalComContagem[]> {
  // Uma chamada em vez de duas, campo a campo em vez de `*`: o que a função
  // devolve é exatamente o que chega ao navegador.
  const { data, error } = await supabase.rpc("canais_visiveis");
  if (error) throw new Error(traduzirErro(error.message));

  return (
    (data ?? [])
      .map((c) => ({ ...c, arquivado: false, nao_lidas: Number(c.nao_lidas) }))
      // Geral primeiro, depois as equipes em ordem alfabética.
      .sort((a, b) => {
        if (a.tipo !== b.tipo) return a.tipo === "geral" ? -1 : 1;
        return a.nome.localeCompare(b.nome);
      })
  );
}

export async function marcarLido(canalId: string): Promise<void> {
  await supabase.rpc("marcar_canal_lido", { p_canal: canalId });
}

/* Mensagens */

// Colunas cruas da mensagem, sem o autor. Usado só no envio, onde o autor é
// quem está enviando e já está em mãos.
const SELECAO_CRUA =
  "id, canal_id, autor_id, corpo, mencionados, respondendo_a, editado_em, criado_em";

/** Últimas mensagens do canal, já em ordem cronológica de leitura. */
export async function listarMensagens(
  canalId: string,
  limite = 100,
): Promise<MensagemEnriquecida[]> {
  const { data, error } = await supabase.rpc("mensagens_do_canal", {
    p_canal: canalId,
    p_limite: limite,
  });

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as MensagemEnriquecida[];
}

export async function enviarMensagem(
  canalId: string,
  corpo: string,
  mencionados: string[],
  autor: Perfil,
): Promise<MensagemEnriquecida> {
  const texto = corpo.trim();
  if (!texto) throw new Error("Escreva algo antes de enviar.");
  if (texto.length > 4000) {
    throw new Error("A mensagem passou de 4000 caracteres.");
  }

  const { data, error } = await supabase
    .from("mensagens")
    .insert({
      canal_id: canalId,
      autor_id: autor.id,
      corpo: texto,
      mencionados,
    })
    .select(SELECAO_CRUA)
    .single();

  if (error) throw new Error(traduzirErro(error.message));

  // Nenhuma ida ao banco pelo nome: quem envia é quem está na sessão.
  return {
    ...(data as Mensagem),
    autor_nome: autor.nome_completo,
    autor_cargo: autor.cargo,
    autor_hierarquia: autor.hierarquia,
  };
}

export async function excluirMensagem(id: string): Promise<void> {
  const { error } = await supabase.from("mensagens").delete().eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

/* Tempo real */

/**
 * Assinatura do canal aberto, com reconexão.
 *
 * O `.subscribe()` sem callback de status — como estava aqui — falha em
 * silêncio: quando o websocket cai (notebook que dorme, rede que oscila,
 * servidor que reinicia) o canal vai para `CHANNEL_ERROR` ou `TIMED_OUT` e as
 * mensagens simplesmente param de chegar. A tela continua desenhada, sem
 * nenhum sinal, até alguém recarregar a página.
 *
 * Duas coisas são necessárias para consertar isso, e uma sem a outra não
 * resolve:
 *
 *  1. **Reassinar** depois da queda, com espera crescente para não martelar
 *     um servidor que já está em dificuldade.
 *  2. **Buscar o que passou** ao reconectar. O Realtime entrega o que acontece
 *     enquanto se está ouvindo; ele não tem histórico. Sem o recarregamento,
 *     a reconexão deixa um buraco silencioso — exatamente o mesmo sintoma que
 *     se estava tentando corrigir.
 */

// Uma assinatura por vez.
let assinaturaAtiva: RealtimeChannel | null = null;

/** Alvo e destinos atuais, lidos na reconexão para não ressuscitar closure
 *  de um canal que a pessoa já fechou. */
let canalAtivoId: string | null = null;
let aoChegarAtivo: ((m: MensagemEnriquecida) => void) | null = null;
let aoReconectarAtivo: (() => void) | null = null;

/**
 * Geração da assinatura. Incrementa a cada `assinarCanal` e a cada
 * `encerrarAssinatura`.
 *
 * Comparar por `canalId` não bastava: reabrir o **mesmo** canal casaria o id,
 * e o `CLOSED` da assinatura antiga chegaria depois da nova estar de pé,
 * agendando uma reconexão que derrubaria justamente a assinatura boa. O
 * contador não tem esse empate.
 */
let geracao = 0;

let tentativas = 0;
let temporizador: ReturnType<typeof setTimeout> | null = null;
let jaConectou = false;
let ouvindoVisibilidade = false;

const ESPERA_BASE_MS = 1_000;
const ESPERA_MAXIMA_MS = 30_000;

export function assinarCanal(
  canalId: string,
  aoChegar: (mensagem: MensagemEnriquecida) => void,
  /** Chamado a cada reconexão — não na primeira conexão. É onde a tela
   *  recarrega o que chegou durante a queda. */
  aoReconectar?: () => void,
): void {
  encerrarAssinatura();

  geracao += 1;
  canalAtivoId = canalId;
  aoChegarAtivo = aoChegar;
  aoReconectarAtivo = aoReconectar ?? null;
  tentativas = 0;
  jaConectou = false;

  observarVisibilidade();
  conectar(geracao);
}

function conectar(minhaGeracao: number): void {
  const canalId = canalAtivoId;
  if (canalId === null || minhaGeracao !== geracao) return;

  // Nome único por tentativa: reaproveitar o nome de um canal que o servidor
  // considera em erro faz a reassinatura ser recusada em silêncio.
  const canal = supabase
    .channel(`canal:${canalId}:${tentativas}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "mensagens",
        filter: `canal_id=eq.${canalId}`,
      },
      (payload) => {
        // Assinatura antiga que ainda respira depois de uma troca de canal
        // não pode empurrar mensagem para a tela atual.
        if (minhaGeracao !== geracao) return;

        // O payload do realtime traz só a linha crua, sem o nome do autor.
        const nova = payload.new as Mensagem;
        void supabase
          .rpc("mensagem_unica", { p_id: nova.id })
          .then(({ data }) => {
            const linha = (data ?? [])[0];
            if (linha && minhaGeracao === geracao) {
              aoChegarAtivo?.(linha as MensagemEnriquecida);
            }
          });
      },
    );

  assinaturaAtiva = canal;

  canal.subscribe((status) => {
    if (minhaGeracao !== geracao) return;

    if (status === "SUBSCRIBED") {
      tentativas = 0;
      // Só na volta, nunca na primeira: `abrirCanal` já carregou a lista.
      if (jaConectou) aoReconectarAtivo?.();
      jaConectou = true;
      return;
    }

    if (
      status === "CHANNEL_ERROR" ||
      status === "TIMED_OUT" ||
      status === "CLOSED"
    ) {
      agendarReconexao(minhaGeracao);
    }
  });
}

function agendarReconexao(minhaGeracao: number): void {
  if (canalAtivoId === null || temporizador !== null) return;
  if (minhaGeracao !== geracao) return;

  // Dobra a cada tentativa até o teto. O jitter evita que várias abas abertas
  // na mesma máquina voltem todas no mesmo instante.
  const espera = Math.min(
    ESPERA_BASE_MS * 2 ** tentativas,
    ESPERA_MAXIMA_MS,
  );
  const comJitter = espera * (0.75 + Math.random() * 0.5);
  tentativas += 1;

  temporizador = setTimeout(() => {
    temporizador = null;
    if (canalAtivoId === null || minhaGeracao !== geracao) return;

    if (assinaturaAtiva) {
      void supabase.removeChannel(assinaturaAtiva);
      assinaturaAtiva = null;
    }
    conectar(minhaGeracao);
  }, comJitter);
}

/**
 * Aba que volta a ficar visível força a conferência.
 *
 * É o caso mais comum de todos — a máquina dorme, o socket morre sem evento
 * de erro, e o navegador só descongela o timer quando a aba reaparece. Esperar
 * o `TIMED_OUT` aqui pode custar minutos de mensagem faltando.
 */
function observarVisibilidade(): void {
  if (ouvindoVisibilidade) return;
  ouvindoVisibilidade = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (canalAtivoId === null || assinaturaAtiva === null) return;
    if (assinaturaAtiva.state === "joined") return;

    // Volta já, sem esperar a espera crescente: a pessoa está olhando.
    tentativas = 0;
    if (temporizador !== null) {
      clearTimeout(temporizador);
      temporizador = null;
    }
    agendarReconexao(geracao);
  });
}

export function encerrarAssinatura(): void {
  // Invalida tudo que estava em voo: callback pendente, timer e subscribe.
  geracao += 1;
  canalAtivoId = null;
  aoChegarAtivo = null;
  aoReconectarAtivo = null;
  tentativas = 0;
  jaConectou = false;

  if (temporizador !== null) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  if (assinaturaAtiva) {
    void supabase.removeChannel(assinaturaAtiva);
    assinaturaAtiva = null;
  }
}

/* Exibição */

/** Agrupa mensagens seguidas do mesmo autor em poucos minutos. */
export function mesmoBloco(
  anterior: MensagemEnriquecida | undefined,
  atual: MensagemEnriquecida,
): boolean {
  if (!anterior) return false;
  if (anterior.autor_id !== atual.autor_id) return false;
  const diff =
    new Date(atual.criado_em).getTime() -
    new Date(anterior.criado_em).getTime();
  return diff < 5 * 60_000;
}

/** Rótulo do separador de dia: hoje, ontem ou a data. */
export function rotuloDia(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);

  const igual = (a: Date, b: Date): boolean =>
    a.toDateString() === b.toDateString();

  if (igual(data, hoje)) return "Hoje";
  if (igual(data, ontem)) return "Ontem";

  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: data.getFullYear() === hoje.getFullYear() ? undefined : "numeric",
  });
}
