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

// Uma assinatura por vez.
let assinaturaAtiva: RealtimeChannel | null = null;

export function assinarCanal(
  canalId: string,
  aoChegar: (mensagem: MensagemEnriquecida) => void,
): void {
  encerrarAssinatura();

  assinaturaAtiva = supabase
    .channel(`canal:${canalId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "mensagens",
        filter: `canal_id=eq.${canalId}`,
      },
      (payload) => {
        // O payload do realtime traz só a linha crua, sem o nome do autor.
        const nova = payload.new as Mensagem;
        void supabase
          .rpc("mensagem_unica", { p_id: nova.id })
          .then(({ data }) => {
            const linha = (data ?? [])[0];
            if (linha) aoChegar(linha as MensagemEnriquecida);
          });
      },
    )
    .subscribe();
}

export function encerrarAssinatura(): void {
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
