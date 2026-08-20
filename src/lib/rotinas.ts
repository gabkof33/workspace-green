/** Rotinas preventivas, runbooks e execuções. */

import { supabase, traduzirErro } from "@/lib/supabase";
import type {
  Criticidade,
  Execucao,
  ExecucaoEnriquecida,
  PassoExecutado,
  PassoRunbook,
  Perfil,
  Periodicidade,
  RascunhoRotina,
  ResultadoPasso,
  Rotina,
  RotinaEnriquecida,
  StatusExecucao,
} from "@/types/dominio";

export const ROTULOS_PERIODICIDADE: Record<Periodicidade, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

export const ROTULOS_STATUS_EXECUCAO: Record<StatusExecucao, string> = {
  agendada: "Agendada",
  em_execucao: "Em execução",
  verificacao: "Em verificação",
  concluida_ok: "Concluída sem falha",
  concluida_com_falha: "Concluída com falha",
  nao_executada: "Não executada",
};

export const ROTULOS_RESULTADO: Record<ResultadoPasso, string> = {
  ok: "OK",
  falha: "Falha",
  nao_aplicavel: "Não se aplica",
};

/** Dias entre execuções, por periodicidade. */
const INTERVALO_DIAS: Record<Periodicidade, number> = {
  diaria: 1,
  semanal: 7,
  quinzenal: 15,
  mensal: 30,
  trimestral: 90,
  semestral: 180,
  anual: 365,
};

export function proximaData(
  periodicidade: Periodicidade,
  base = new Date(),
): string {
  const d = new Date(base);
  d.setDate(d.getDate() + INTERVALO_DIAS[periodicidade]);
  return d.toISOString().slice(0, 10);
}

/* Rotinas */

const SELECAO_ROTINA = "*, equipes(nome), runbook_passos(id)";

function enriquecerRotina(linha: unknown): RotinaEnriquecida {
  const l = linha as Rotina & {
    equipes: { nome: string } | null;
    runbook_passos: Array<{ id: string }> | null;
  };
  return {
    ...l,
    equipe_nome: l.equipes?.nome ?? null,
    total_passos: l.runbook_passos?.length ?? 0,
  };
}

export async function listarRotinas(
  apenasAtivas = false,
): Promise<RotinaEnriquecida[]> {
  let consulta = supabase
    .from("rotinas")
    .select(SELECAO_ROTINA)
    .order("criticidade")
    .limit(300);

  if (apenasAtivas) consulta = consulta.eq("ativa", true);

  const { data, error } = await consulta;
  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []).map(enriquecerRotina);
}

export async function obterRotina(
  codigo: string,
): Promise<RotinaEnriquecida | null> {
  const { data, error } = await supabase
    .from("rotinas")
    .select(SELECAO_ROTINA)
    .eq("codigo", codigo)
    .maybeSingle();

  if (error) throw new Error(traduzirErro(error.message));
  return data ? enriquecerRotina(data) : null;
}

export async function criarRotina(
  rascunho: RascunhoRotina,
  autor: Perfil,
): Promise<RotinaEnriquecida> {
  const { data, error } = await supabase
    .from("rotinas")
    .insert({
      nome: rascunho.nome.trim(),
      descricao: rascunho.descricao.trim(),
      criticidade: rascunho.criticidade as Criticidade,
      periodicidade: rascunho.periodicidade,
      janela_inicio: rascunho.janela_inicio || "00:00",
      janela_fim: rascunho.janela_fim || "06:00",
      duracao_estimada_min: rascunho.duracao_estimada_min
        ? Number(rascunho.duracao_estimada_min)
        : null,
      equipe_id: rascunho.equipe_id || null,
      exige_evidencia: rascunho.exige_evidencia,
      exige_dupla_checagem: rascunho.exige_dupla_checagem,
      criado_por: autor.id,
    })
    .select(SELECAO_ROTINA)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecerRotina(data);
}

export async function alternarRotina(
  id: string,
  ativa: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("rotinas")
    .update({ ativa })
    .eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

export async function excluirRotina(id: string): Promise<void> {
  const { error } = await supabase.from("rotinas").delete().eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

/* Passos do runbook */

export async function listarPassos(rotinaId: string): Promise<PassoRunbook[]> {
  const { data, error } = await supabase
    .from("runbook_passos")
    .select("*")
    .eq("rotina_id", rotinaId)
    .order("ordem");

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as PassoRunbook[];
}

export async function adicionarPasso(
  rotinaId: string,
  passo: {
    instrucao: string;
    comando?: string;
    criterio_sucesso?: string;
    acao_se_falhar?: string;
  },
): Promise<PassoRunbook> {
  const existentes = await listarPassos(rotinaId);
  const proximaOrdem = (existentes.at(-1)?.ordem ?? 0) + 1;

  const { data, error } = await supabase
    .from("runbook_passos")
    .insert({
      rotina_id: rotinaId,
      ordem: proximaOrdem,
      instrucao: passo.instrucao.trim(),
      comando: passo.comando?.trim() || null,
      criterio_sucesso: passo.criterio_sucesso?.trim() || null,
      acao_se_falhar: passo.acao_se_falhar?.trim() || null,
    })
    .select()
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return data as PassoRunbook;
}

export async function removerPasso(id: string): Promise<void> {
  const { error } = await supabase.from("runbook_passos").delete().eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

/* Execuções */

const SELECAO_EXECUCAO =
  "*, rotinas(nome, codigo), executor:perfis!rotina_execucoes_executor_id_fkey(nome_completo)";

function enriquecerExecucao(linha: unknown): ExecucaoEnriquecida {
  const l = linha as Execucao & {
    rotinas: { nome: string; codigo: string } | null;
    executor: { nome_completo: string } | null;
  };
  return {
    ...l,
    rotina_nome: l.rotinas?.nome ?? "Rotina removida",
    rotina_codigo: l.rotinas?.codigo ?? "—",
    executor_nome: l.executor?.nome_completo ?? null,
  };
}

export async function listarExecucoes(
  opcoes: {
    rotinaId?: string;
    pendentes?: boolean;
  } = {},
): Promise<ExecucaoEnriquecida[]> {
  let consulta = supabase
    .from("rotina_execucoes")
    .select(SELECAO_EXECUCAO)
    .order("prevista_para", { ascending: false })
    .limit(300);

  if (opcoes.rotinaId) consulta = consulta.eq("rotina_id", opcoes.rotinaId);
  if (opcoes.pendentes) {
    consulta = consulta.in("status_execucao", [
      "agendada",
      "em_execucao",
      "verificacao",
    ]);
  }

  const { data, error } = await consulta;
  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []).map(enriquecerExecucao);
}

/** Agenda uma execução. */
export async function agendarExecucao(
  rotinaId: string,
  previstaPara: string,
): Promise<ExecucaoEnriquecida> {
  const { data, error } = await supabase
    .from("rotina_execucoes")
    .insert({ rotina_id: rotinaId, prevista_para: previstaPara })
    .select(SELECAO_EXECUCAO)
    .single();

  if (error) {
    if (error.message.includes("duplicate key")) {
      throw new Error(
        "Já existe execução agendada desta rotina para essa data.",
      );
    }
    throw new Error(traduzirErro(error.message));
  }
  return enriquecerExecucao(data);
}

export async function iniciarExecucao(
  execucaoId: string,
  executor: Perfil,
): Promise<ExecucaoEnriquecida> {
  const { data, error } = await supabase
    .from("rotina_execucoes")
    .update({
      status_execucao: "em_execucao",
      executor_id: executor.id,
      iniciada_em: new Date().toISOString(),
    })
    .eq("id", execucaoId)
    .select(SELECAO_EXECUCAO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecerExecucao(data);
}

/** Encerra a execução. */
export async function encerrarExecucao(
  execucaoId: string,
  opcoes: { observacoes?: string; evidencia_url?: string } = {},
): Promise<ExecucaoEnriquecida> {
  const passos = await listarPassosExecutados(execucaoId);
  const semResultado = passos.filter((p) => p.resultado === null);

  if (semResultado.length > 0) {
    throw new Error(
      `Faltam ${semResultado.length} passo(s) sem resultado marcado. Marque todos antes de encerrar.`,
    );
  }

  const houveFalha = passos.some((p) => p.resultado === "falha");

  const { data, error } = await supabase
    .from("rotina_execucoes")
    .update({
      status_execucao: houveFalha ? "concluida_com_falha" : "concluida_ok",
      finalizada_em: new Date().toISOString(),
      observacoes: opcoes.observacoes?.trim() || null,
      evidencia_url: opcoes.evidencia_url?.trim() || null,
    })
    .eq("id", execucaoId)
    .select(SELECAO_EXECUCAO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecerExecucao(data);
}

export async function marcarNaoExecutada(
  execucaoId: string,
  motivo: string,
): Promise<ExecucaoEnriquecida> {
  const { data, error } = await supabase
    .from("rotina_execucoes")
    .update({
      status_execucao: "nao_executada",
      finalizada_em: new Date().toISOString(),
      observacoes: motivo,
    })
    .eq("id", execucaoId)
    .select(SELECAO_EXECUCAO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecerExecucao(data);
}

/* Passos executados */

export async function listarPassosExecutados(
  execucaoId: string,
): Promise<PassoExecutado[]> {
  const { data, error } = await supabase
    .from("execucao_passos")
    .select(
      "*, runbook_passos(instrucao, ordem, criterio_sucesso, acao_se_falhar)",
    )
    .eq("execucao_id", execucaoId);

  if (error) throw new Error(traduzirErro(error.message));

  return (data ?? [])
    .map((linha) => {
      const l = linha as unknown as PassoExecutado & {
        runbook_passos: {
          instrucao: string;
          ordem: number;
          criterio_sucesso: string | null;
          acao_se_falhar: string | null;
        } | null;
      };
      return {
        ...l,
        instrucao: l.runbook_passos?.instrucao ?? "Passo removido",
        ordem: l.runbook_passos?.ordem ?? 0,
        criterio_sucesso: l.runbook_passos?.criterio_sucesso ?? null,
        acao_se_falhar: l.runbook_passos?.acao_se_falhar ?? null,
      };
    })
    .sort((a, b) => a.ordem - b.ordem);
}

export async function registrarResultadoPasso(
  passoExecutadoId: string,
  resultado: ResultadoPasso,
  detalhes: { saida_obtida?: string; anotacao?: string } = {},
): Promise<void> {
  const { error } = await supabase
    .from("execucao_passos")
    .update({
      resultado,
      saida_obtida: detalhes.saida_obtida?.trim() || null,
      anotacao: detalhes.anotacao?.trim() || null,
      registrado_em: new Date().toISOString(),
    })
    .eq("id", passoExecutadoId);

  if (error) throw new Error(traduzirErro(error.message));
}
