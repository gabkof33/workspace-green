/** Formatação de datas, prazos e rótulos de domínio. */

import type { StatusChamado, TipoChamado } from "@/types/dominio";

const FUSO = "America/Sao_Paulo";

export function dataHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
  });
}

/** "há 3 h", "em 25 min" — a unidade some quando não agrega. */
export function tempoRelativo(iso: string | null, agora = new Date()): string {
  if (!iso) return "—";
  const alvo = new Date(iso).getTime();
  const diffMin = Math.round((alvo - agora.getTime()) / 60000);
  const abs = Math.abs(diffMin);

  let valor: number;
  let unidade: Intl.RelativeTimeFormatUnit;

  if (abs < 60) {
    valor = diffMin;
    unidade = "minute";
  } else if (abs < 60 * 24) {
    valor = Math.round(diffMin / 60);
    unidade = "hour";
  } else {
    valor = Math.round(diffMin / (60 * 24));
    unidade = "day";
  }

  return new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" }).format(
    valor,
    unidade,
  );
}

export interface EstadoSla {
  /** 0 a 1 — fração do prazo já consumida. */
  fracao: number;
  restanteMin: number;
  violado: boolean;
  pausado: boolean;
  rotulo: string;
  severidade: "ok" | "atencao" | "critico" | "pausado";
}

export function avaliarSla(
  abertoEm: string,
  prazo: string | null,
  pausadoDesde: string | null,
  pctAlerta: number,
  agora = new Date(),
): EstadoSla {
  if (!prazo) {
    return {
      fracao: 0,
      restanteMin: 0,
      violado: false,
      pausado: false,
      rotulo: "sem prazo",
      severidade: "ok",
    };
  }

  const inicio = new Date(abertoEm).getTime();
  const fim = new Date(prazo).getTime();
  const referencia = pausadoDesde
    ? new Date(pausadoDesde).getTime()
    : agora.getTime();

  const total = Math.max(fim - inicio, 1);
  const decorrido = referencia - inicio;
  const fracao = Math.min(Math.max(decorrido / total, 0), 1.4);
  const restanteMin = Math.round((fim - referencia) / 60000);
  const violado = referencia > fim;

  if (pausadoDesde) {
    return {
      fracao,
      restanteMin,
      violado,
      pausado: true,
      rotulo: "pausado",
      severidade: "pausado",
    };
  }

  const pct = fracao * 100;
  const severidade: EstadoSla["severidade"] = violado
    ? "critico"
    : pct >= pctAlerta
      ? "atencao"
      : "ok";

  const rotulo = violado
    ? `violado ${tempoRelativo(prazo, agora)}`
    : `vence ${tempoRelativo(prazo, agora)}`;

  return { fracao, restanteMin, violado, pausado: false, rotulo, severidade };
}

const ROTULOS_STATUS: Record<StatusChamado, string> = {
  novo: "Novo",
  triado: "Triado",
  atribuido: "Atribuído",
  em_atendimento: "Em atendimento",
  pendente_usuario: "Aguardando você",
  pendente_terceiro: "Aguardando terceiro",
  pendente_mudanca: "Aguardando mudança",
  resolvido: "Resolvido",
  fechado: "Fechado",
  cancelado: "Cancelado",
};

export function rotuloStatus(status: StatusChamado): string {
  return ROTULOS_STATUS[status];
}

type ClasseSelo =
  "aberto" | "andamento" | "pausado" | "resolvido" | "encerrado";

const CLASSES_STATUS: Record<StatusChamado, ClasseSelo> = {
  novo: "aberto",
  triado: "aberto",
  atribuido: "aberto",
  em_atendimento: "andamento",
  pendente_usuario: "pausado",
  pendente_terceiro: "pausado",
  pendente_mudanca: "pausado",
  resolvido: "resolvido",
  fechado: "encerrado",
  cancelado: "encerrado",
};

export function classeStatus(status: StatusChamado): string {
  return `selo selo--${CLASSES_STATUS[status]}`;
}

export function rotuloTipo(tipo: TipoChamado): string {
  return tipo === "incidente" ? "Incidente" : "Requisição";
}

/** Status em que o relógio de solução está parado. */
export const STATUS_PAUSADOS: StatusChamado[] = [
  "pendente_usuario",
  "pendente_terceiro",
  "pendente_mudanca",
];

/** Status que já saíram da fila de trabalho. */
export const STATUS_ENCERRADOS: StatusChamado[] = [
  "resolvido",
  "fechado",
  "cancelado",
];
