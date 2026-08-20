/** Escuta as notificações do banco e leva ao aviso do navegador. */

import { avisarNavegador } from "@/lib/aviso-navegador";
import { somarNaoLido } from "@/lib/marcador-aba";
import { supabase } from "@/lib/supabase";
import type { Notificacao } from "@/types/dominio";

let assinatura: ReturnType<typeof supabase.channel> | null = null;

/**
 * Uma assinatura para toda a aplicação.
 *
 * Fica no nível do app, não da tela: menção só avisar quem já está no chat
 * atende justamente quem menos precisa do aviso.
 *
 * O filtro por destinatário é redundante com o RLS — a policy de
 * `notificacoes` já restringe ao próprio dono. Está aqui para o servidor não
 * gastar entrega que seria descartada.
 */
export function escutarNotificacoes(meuId: string): void {
  if (assinatura) return;

  assinatura = supabase
    .channel(`avisos:${meuId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notificacoes",
        filter: `destinatario_id=eq.${meuId}`,
      },
      (payload) => {
        const n = payload.new as Notificacao;
        // O selo na aba não depende de permissão: aparece mesmo para quem
        // recusou a notificação do navegador.
        somarNaoLido();
        avisarNavegador({
          titulo: n.titulo,
          corpo: n.corpo ?? "",
          ...(n.destino ? { destino: n.destino } : {}),
          chave: `notificacao:${n.tipo}`,
        });
      },
    )
    .subscribe();
}

export function pararNotificacoes(): void {
  if (!assinatura) return;
  void supabase.removeChannel(assinatura);
  assinatura = null;
}
