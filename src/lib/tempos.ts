/** Médias de atendimento e espera de fila. */

import { supabase, traduzirErro } from "@/lib/supabase";
import type { PainelTempos } from "@/types/dominio";

export async function carregarTempos(dias = 30): Promise<PainelTempos> {
  const { data, error } = await supabase.rpc("painel_tempos", {
    p_dias: dias,
  });
  if (error) throw new Error(traduzirErro(error.message));
  return data as unknown as PainelTempos;
}

/**
 * Duração legível a partir de minutos.
 *
 * Nunca em minutos puros acima de uma hora: "482 min" obriga a pessoa a
 * dividir de cabeça para saber se é bom ou ruim.
 */
export function duracao(min: number | null): string {
  if (min === null || !Number.isFinite(min)) return "—";
  if (min <= 0) return "0 min";
  if (min < 60) return `${Math.round(min)} min`;

  const horas = min / 60;
  if (horas < 24) {
    const h = Math.floor(horas);
    const m = Math.round(min - h * 60);
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
  }

  const dias = horas / 24;
  return dias < 10 ? `${dias.toFixed(1)}d` : `${Math.round(dias)}d`;
}

/** Só a parte numérica, para o número grande do indicador. */
export function duracaoPartes(min: number | null): [string, string] {
  const texto = duracao(min);
  const corte = texto.search(/[^\d.,]/);
  return corte <= 0 ? [texto, ""] : [texto.slice(0, corte), texto.slice(corte)];
}

/** Meta de espera por prioridade, em minutos. Vem da matriz de SLA. */
export const META_ESPERA: Record<string, number> = {
  P1: 15,
  P2: 60,
  P3: 240,
  P4: 480,
};
