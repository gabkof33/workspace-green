/** Conversas por equipe. */

import { supabase, traduzirErro } from "@/lib/supabase";
import type {
  Canal,
  CanalComContagem,
  Hierarquia,
  Mensagem,
  MensagemEnriquecida,
  Perfil,
} from "@/types/dominio";
import type { RealtimeChannel } from "@supabase/supabase-js";

/* Canais */

export async function listarCanais(): Promise<CanalComContagem[]> {
  const [canais, contagens] = await Promise.all([
    supabase
      .from("canais")
      .select("*")
      .eq("arquivado", false)
      .order("tipo")
      .order("nome"),
    supabase.rpc("nao_lidas_por_canal"),
  ]);

  if (canais.error) throw new Error(traduzirErro(canais.error.message));

  const mapa = new Map<string, number>();
  for (const linha of contagens.data ?? []) {
    mapa.set(linha.canal_id, Number(linha.nao_lidas));
  }

  return (
    ((canais.data ?? []) as Canal[])
      .map((c) => ({ ...c, nao_lidas: mapa.get(c.id) ?? 0 }))
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

// Dica explícita pela constraint mesmo havendo só uma chave para `perfis`
// hoje: acrescentar uma segunda (um `editado_por`, por exemplo) quebraria
const SELECAO =
  "*, autor:perfis!mensagens_autor_id_fkey(nome_completo, hierarquia, cargo)";

function enriquecer(linha: unknown): MensagemEnriquecida {
  const l = linha as Mensagem & {
    autor: {
      nome_completo: string;
      hierarquia: Hierarquia;
      cargo: string | null;
    } | null;
  };
  return {
    ...l,
    autor_nome: l.autor?.nome_completo ?? "Desconhecido",
    autor_hierarquia: l.autor?.hierarquia ?? "colaborador",
    autor_cargo: l.autor?.cargo ?? null,
  };
}

/** Últimas mensagens do canal, já em ordem cronológica de leitura. */
export async function listarMensagens(
  canalId: string,
  limite = 100,
): Promise<MensagemEnriquecida[]> {
  const { data, error } = await supabase
    .from("mensagens")
    .select(SELECAO)
    .eq("canal_id", canalId)
    .order("criado_em", { ascending: false })
    .limit(limite);

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []).map(enriquecer).reverse();
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
    .select(SELECAO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecer(data);
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
        // O payload do realtime traz só a linha crua, sem o join do autor.
        const nova = payload.new as Mensagem;
        void supabase
          .from("mensagens")
          .select(SELECAO)
          .eq("id", nova.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) aoChegar(enriquecer(data));
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
