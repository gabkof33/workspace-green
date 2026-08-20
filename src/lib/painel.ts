/** Painel de governança. */

import { supabase, traduzirErro } from "@/lib/supabase";
import type { PainelGovernanca } from "@/types/dominio";

/** Metas da seção 02 do blueprint. */
export const METAS = {
  sla_p1: 98,
  sla_demais: 95,
  aderencia_rotinas: 97,
  reabertura_max: 5,
} as const;

export async function carregarPainel(dias = 30): Promise<PainelGovernanca> {
  const { data, error } = await supabase.rpc("painel_governanca", {
    p_dias: dias,
  });

  if (error) throw new Error(traduzirErro(error.message));
  return data as unknown as PainelGovernanca;
}

export type Situacao = "ok" | "alerta" | "critico" | "neutro";

/** Compara o indicador com a meta e devolve como ele deve ser pintado. */
export function avaliarMeta(
  valor: number | null,
  meta: number,
  toleranciaAlerta = 3,
): Situacao {
  if (valor === null) return "neutro";
  if (valor >= meta) return "ok";
  if (valor >= meta - toleranciaAlerta) return "alerta";
  return "critico";
}

/** Para indicadores em que menos é melhor — atrasos, violações, reaberturas. */
export function avaliarInverso(valor: number, limite: number): Situacao {
  if (valor === 0) return "ok";
  if (valor <= limite) return "alerta";
  return "critico";
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatarPercentual(valor: number | null): string {
  return valor === null ? "—" : `${valor.toFixed(1).replace(".0", "")}%`;
}
