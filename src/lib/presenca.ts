/** Quem está online agora, via Presence do Realtime. */

import { supabase } from "@/lib/supabase";

const CANAL = "presenca:conversas";

let online = new Set<string>();
let assinatura: ReturnType<typeof supabase.channel> | null = null;
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

/**
 * Entra na sala de presença e passa a acompanhar quem está nela.
 *
 * O estado vive no Realtime, não numa coluna: "online" é o presente, e uma
 * coluna `ultimo_visto` daria a última vez que o navegador conseguiu escrever
 * — que é diferente, e mente quando a aba morre sem avisar.
 */
export function entrarNaPresenca(meuId: string): void {
  if (assinatura) return;

  const canal = supabase.channel(CANAL, {
    config: { presence: { key: meuId } },
  });
  assinatura = canal;

  const recolher = (): void => {
    const estado = canal.presenceState();
    online = new Set(Object.keys(estado));
    avisar();
  };

  canal
    .on("presence", { event: "sync" }, recolher)
    .on("presence", { event: "join" }, recolher)
    .on("presence", { event: "leave" }, recolher)
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      void canal.track({ em: new Date().toISOString() });
    });
}

export function sairDaPresenca(): void {
  if (!assinatura) return;
  void supabase.removeChannel(assinatura);
  assinatura = null;
  online = new Set();
  avisar();
}

export function estaOnline(id: string): boolean {
  return online.has(id);
}

export function quantosOnline(): number {
  return online.size;
}

/** Devolve a função que cancela a inscrição. */
export function aoMudarPresenca(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}
