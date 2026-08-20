/** Matriz de prioridade — seção 02 do blueprint. */

import type {
  Impacto,
  Urgencia,
  Prioridade,
  PoliticaSla,
  RascunhoChamado,
} from "@/types/dominio";

export function calcularPrioridade(
  impacto: Impacto,
  urgencia: Urgencia,
): Prioridade {
  if (impacto === "alto" && urgencia === "alta") return "P1";
  if (impacto === "alto" && urgencia === "media") return "P2";
  if (impacto === "medio" && urgencia === "alta") return "P2";
  if (impacto === "alto" && urgencia === "baixa") return "P3";
  if (impacto === "medio" && urgencia === "media") return "P3";
  if (impacto === "baixo" && urgencia === "alta") return "P3";
  return "P4";
}

/** Traduz as duas perguntas factuais do formulário nas entradas da matriz. */
export function deduzirImpacto(
  quantos: RascunhoChamado["quantos_afetados"],
): Impacto | null {
  switch (quantos) {
    case "so_eu":
      return "baixo";
    case "minha_equipe":
      return "medio";
    case "varios_setores":
      return "alto";
    default:
      return null;
  }
}

export function deduzirUrgencia(
  consegue: RascunhoChamado["consegue_trabalhar"],
): Urgencia | null {
  switch (consegue) {
    case "sim":
      return "baixa";
    case "com_dificuldade":
      return "media";
    case "nao":
      return "alta";
    default:
      return null;
  }
}

export const POLITICAS_SLA: Record<Prioridade, PoliticaSla> = {
  P1: {
    prioridade: "P1",
    rotulo: "Crítico",
    minutos_resposta: 15,
    minutos_solucao: 240,
    cobertura: "24x7",
    pct_alerta: 50,
    escalonamento:
      "Imediato ao plantonista, gestor da equipe e CIO. Ponte de crise aberta.",
  },
  P2: {
    prioridade: "P2",
    rotulo: "Alto",
    minutos_resposta: 60,
    minutos_solucao: 480,
    cobertura: "24x7",
    pct_alerta: 60,
    escalonamento: "Gestor da equipe a 60% do prazo; coordenação ao violar.",
  },
  P3: {
    prioridade: "P3",
    rotulo: "Médio",
    minutos_resposta: 240,
    minutos_solucao: 1440,
    cobertura: "8x5",
    pct_alerta: 75,
    escalonamento: "Gestor da equipe ao violar.",
  },
  P4: {
    prioridade: "P4",
    rotulo: "Baixo",
    minutos_resposta: 480,
    minutos_solucao: 2400,
    cobertura: "8x5",
    pct_alerta: 90,
    escalonamento: "Relatório semanal de fila; sem escalonamento individual.",
  },
};

/** Explica ao usuário por que o chamado recebeu aquela classificação. */
export function explicarPrioridade(
  impacto: Impacto,
  urgencia: Urgencia,
): string {
  const p = calcularPrioridade(impacto, urgencia);
  const politica = POLITICAS_SLA[p];
  const alcance =
    impacto === "alto"
      ? "vários setores afetados"
      : impacto === "medio"
        ? "uma equipe afetada"
        : "apenas você afetado";
  const bloqueio =
    urgencia === "alta"
      ? "trabalho parado"
      : urgencia === "media"
        ? "trabalho com dificuldade"
        : "trabalho seguindo normalmente";

  return `${alcance} + ${bloqueio} → prazo de solução de ${formatarDuracao(politica.minutos_solucao)} em cobertura ${politica.cobertura}.`;
}

export function formatarDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = minutos / 60;
  if (horas < 24) {
    return Number.isInteger(horas) ? `${horas} h` : `${horas.toFixed(1)} h`;
  }
  const dias = horas / 8; // dias úteis de 8 h
  return `${Math.round(dias)} dias úteis`;
}
