/** Mudanças controladas (GMUD), votos do CAB e implantação. */

import { supabase, traduzirErro } from "@/lib/supabase";
import type {
  DecisaoCab,
  EventoTrilha,
  Mudanca,
  MudancaEnriquecida,
  Perfil,
  RascunhoMudanca,
  ResultadoMudanca,
  RiscoMudanca,
  StatusMudanca,
  TipoMudanca,
  VotoCab,
} from "@/types/dominio";

export const ROTULOS_TIPO_MUDANCA: Record<TipoMudanca, string> = {
  padrao: "Padrão",
  normal: "Normal",
  emergencial: "Emergencial",
};

export const ROTULOS_RISCO: Record<RiscoMudanca, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
};

export const ROTULOS_STATUS_MUDANCA: Record<StatusMudanca, string> = {
  rascunho: "Rascunho",
  avaliacao: "Em avaliação",
  aguardando_cab: "Aguardando CAB",
  aprovada: "Aprovada",
  reprovada: "Reprovada pelo CAB",
  agendada: "Agendada",
  em_implantacao: "Em implantação",
  implantada: "Implantada",
  revertida: "Revertida",
  cancelada: "Cancelada",
};

export const ROTULOS_DECISAO: Record<DecisaoCab, string> = {
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  mais_informacoes: "Pediu mais informações",
};

export const ROTULOS_RESULTADO_MUDANCA: Record<ResultadoMudanca, string> = {
  sucesso: "Sucesso",
  sucesso_com_ressalva: "Sucesso com ressalva",
  revertida: "Revertida no rollback",
  falhou: "Falhou",
};

/**
 * Classe do selo por status, no mesmo vocabulário de `classeStatus` do chamado.
 *
 * `aguardando_cab` usa `pausado` — o mesmo âmbar de "pendente de terceiro" —
 * porque é literalmente o que é: a mudança parou esperando outra pessoa.
 * Reprovada e revertida usam `falhou`, que existe só para elas.
 */
const CLASSES_STATUS_MUDANCA: Record<StatusMudanca, string> = {
  rascunho: "encerrado",
  avaliacao: "aberto",
  aguardando_cab: "pausado",
  aprovada: "andamento",
  reprovada: "falhou",
  agendada: "andamento",
  em_implantacao: "andamento",
  implantada: "resolvido",
  revertida: "falhou",
  cancelada: "encerrado",
};

export function classeStatusMudanca(status: StatusMudanca): string {
  return `selo selo--${CLASSES_STATUS_MUDANCA[status]}`;
}

/**
 * Estados terminais. Depois deles a mudança não avança — o gatilho
 * `fn_mudanca_transicao` recusa reabrir implantada e revertida, e a tela não
 * deve oferecer botão que o banco vai negar.
 */
export const STATUS_ENCERRADOS_MUDANCA: StatusMudanca[] = [
  "implantada",
  "revertida",
  "cancelada",
];

export function mudancaEncerrada(m: Mudanca): boolean {
  return STATUS_ENCERRADOS_MUDANCA.includes(m.status);
}

/**
 * Reprodução no frontend de `mudanca_exige_cab()`.
 *
 * Mesmo papel do `calcularPrioridade`: dar retorno imediato enquanto a pessoa
 * escolhe tipo e risco no formulário. O valor que vale é o da coluna gerada —
 * se divergirem, o banco vence.
 */
export function exigeCab(tipo: TipoMudanca, risco: RiscoMudanca): boolean {
  return tipo !== "padrao" || risco === "alto";
}

/** Janela em curso agora. */
export function emJanela(m: Mudanca, agora = new Date()): boolean {
  if (!m.janela_inicio || !m.janela_fim) return false;
  const t = agora.getTime();
  return (
    t >= new Date(m.janela_inicio).getTime() &&
    t <= new Date(m.janela_fim).getTime()
  );
}

/** Agendada cuja janela já passou sem ninguém implantar. */
export function janelaPerdida(m: Mudanca, agora = new Date()): boolean {
  if (m.status !== "agendada" || !m.janela_fim) return false;
  return new Date(m.janela_fim).getTime() < agora.getTime();
}

/* Consulta */

const SELECAO_MUDANCA =
  "*, catalogo_servicos(nome), equipes(nome), chamados(numero), " +
  "solicitante:perfis!mudancas_solicitante_id_fkey(nome_completo), " +
  "responsavel:perfis!mudancas_responsavel_id_fkey(nome_completo), " +
  "mudanca_aprovacoes(decisao)";

function enriquecer(linha: unknown): MudancaEnriquecida {
  const l = linha as Mudanca & {
    catalogo_servicos: { nome: string } | null;
    equipes: { nome: string } | null;
    chamados: { numero: string } | null;
    solicitante: { nome_completo: string } | null;
    responsavel: { nome_completo: string } | null;
    mudanca_aprovacoes: Array<{ decisao: DecisaoCab }> | null;
  };
  const votos = l.mudanca_aprovacoes ?? [];
  return {
    ...l,
    servico_nome: l.catalogo_servicos?.nome ?? null,
    equipe_nome: l.equipes?.nome ?? null,
    chamado_numero: l.chamados?.numero ?? null,
    solicitante_nome: l.solicitante?.nome_completo ?? "—",
    responsavel_nome: l.responsavel?.nome_completo ?? null,
    aprovacoes: votos.filter((v) => v.decisao === "aprovado").length,
    reprovacoes: votos.filter((v) => v.decisao === "reprovado").length,
  };
}

export async function listarMudancas(
  opcoes: { abertas?: boolean } = {},
): Promise<MudancaEnriquecida[]> {
  let consulta = supabase
    .from("mudancas")
    .select(SELECAO_MUDANCA)
    .order("criado_em", { ascending: false })
    .limit(300);

  if (opcoes.abertas) {
    consulta = consulta.not(
      "status",
      "in",
      `(${STATUS_ENCERRADOS_MUDANCA.join(",")})`,
    );
  }

  const { data, error } = await consulta;
  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []).map(enriquecer);
}

export async function obterMudanca(
  codigo: string,
): Promise<MudancaEnriquecida | null> {
  const { data, error } = await supabase
    .from("mudancas")
    .select(SELECAO_MUDANCA)
    .eq("codigo", codigo)
    .maybeSingle();

  if (error) throw new Error(traduzirErro(error.message));
  return data ? enriquecer(data) : null;
}

/* Cadastro */

export async function criarMudanca(
  rascunho: RascunhoMudanca,
  autor: Perfil,
): Promise<MudancaEnriquecida> {
  const { data, error } = await supabase
    .from("mudancas")
    .insert({
      titulo: rascunho.titulo.trim(),
      descricao: rascunho.descricao.trim(),
      justificativa: rascunho.justificativa.trim(),
      tipo_mudanca: rascunho.tipo_mudanca,
      risco: rascunho.risco,
      servico_id: rascunho.servico_id || null,
      solicitante_id: autor.id,
      plano_implantacao: rascunho.plano_implantacao.trim() || null,
      plano_rollback: rascunho.plano_rollback.trim() || null,
      plano_teste: rascunho.plano_teste.trim() || null,
      janela_inicio: rascunho.janela_inicio || null,
      janela_fim: rascunho.janela_fim || null,
      indisponibilidade_prevista: rascunho.indisponibilidade_prevista,
      comunicado: rascunho.comunicado.trim() || null,
      chamado_id: rascunho.chamado_id || null,
    })
    .select(SELECAO_MUDANCA)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecer(data);
}

/** Edição do rascunho: os planos e a janela, antes de submeter. */
export async function salvarMudanca(
  id: string,
  campos: Partial<{
    titulo: string;
    descricao: string;
    justificativa: string;
    tipo_mudanca: TipoMudanca;
    risco: RiscoMudanca;
    servico_id: string | null;
    plano_implantacao: string | null;
    plano_rollback: string | null;
    plano_teste: string | null;
    janela_inicio: string | null;
    janela_fim: string | null;
    indisponibilidade_prevista: boolean;
    comunicado: string | null;
  }>,
): Promise<MudancaEnriquecida> {
  const { data, error } = await supabase
    .from("mudancas")
    .update(campos)
    .eq("id", id)
    .select(SELECAO_MUDANCA)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecer(data);
}

export async function atribuirMudanca(
  id: string,
  responsavelId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("mudancas")
    .update({ responsavel_id: responsavelId })
    .eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

export async function excluirRascunho(id: string): Promise<void> {
  const { error } = await supabase.from("mudancas").delete().eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

/* A esteira

   Uma função por passo, em vez de um `mudarStatus(x)` genérico: cada passo
   tem pré-condição própria no banco, e nomear o passo é o que deixa a
   mensagem de erro cair no botão certo. */

async function mudarStatus(
  id: string,
  status: StatusMudanca,
  extra: Record<string, unknown> = {},
): Promise<MudancaEnriquecida> {
  const { data, error } = await supabase
    .from("mudancas")
    .update({ status, ...extra })
    .eq("id", id)
    .select(SELECAO_MUDANCA)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecer(data);
}

/** Rascunho → avaliação. O banco cobra os planos aqui. */
export function submeterMudanca(id: string): Promise<MudancaEnriquecida> {
  return mudarStatus(id, "avaliacao");
}

/** Avaliação → CAB. Só faz sentido para quem precisa de voto. */
export function levarAoCab(m: Mudanca): Promise<MudancaEnriquecida> {
  if (!m.exige_cab) {
    return Promise.reject(
      new Error(
        `A mudança ${m.codigo} é padrão de risco ${m.risco} e dispensa CAB — use "Aprovar direto".`,
      ),
    );
  }
  return mudarStatus(m.id, "aguardando_cab");
}

/**
 * Avaliação → aprovada, sem CAB.
 *
 * O caminho da mudança pré-aprovada. A trava de verdade é a mesma função que
 * a coluna gerada usa, no banco: se `exige_cab` for true, o agendamento
 * adiante vai recusar mesmo que esta chamada passe.
 */
export function dispensarCab(m: Mudanca): Promise<MudancaEnriquecida> {
  if (m.exige_cab) {
    return Promise.reject(
      new Error(
        `A mudança ${m.codigo} exige CAB (tipo ${m.tipo_mudanca}, risco ${m.risco}) e não pode ser aprovada direto.`,
      ),
    );
  }
  return mudarStatus(m.id, "aprovada");
}

export function agendarMudanca(
  id: string,
  janela: { inicio: string; fim: string },
): Promise<MudancaEnriquecida> {
  return mudarStatus(id, "agendada", {
    janela_inicio: janela.inicio,
    janela_fim: janela.fim,
  });
}

export function iniciarImplantacao(id: string): Promise<MudancaEnriquecida> {
  return mudarStatus(id, "em_implantacao");
}

/**
 * Encerra a implantação.
 *
 * O status sai do resultado, não de uma escolha separada: rollback executado
 * é `revertida`, e qualquer outro desfecho é `implantada` com o resultado
 * registrado ao lado. Duas perguntas onde cabe uma produzem par incoerente
 * ("implantada" + "falhou") que ninguém sabe ler depois.
 */
export function encerrarMudanca(
  id: string,
  resultado: ResultadoMudanca,
  notas: string,
): Promise<MudancaEnriquecida> {
  return mudarStatus(
    id,
    resultado === "revertida" ? "revertida" : "implantada",
    { resultado, notas_encerramento: notas.trim() || null },
  );
}

export function cancelarMudanca(
  id: string,
  motivo: string,
): Promise<MudancaEnriquecida> {
  return mudarStatus(id, "cancelada", {
    notas_encerramento: motivo.trim() || null,
  });
}

/** Reprovada → rascunho, para reescrever o plano e voltar ao CAB. */
export function devolverParaRascunho(id: string): Promise<MudancaEnriquecida> {
  return mudarStatus(id, "rascunho");
}

/* CAB */

export async function listarVotos(mudancaId: string): Promise<VotoCab[]> {
  const { data, error } = await supabase
    .from("mudanca_aprovacoes")
    .select("*, perfis!mudanca_aprovacoes_aprovador_id_fkey(nome_completo)")
    .eq("mudanca_id", mudancaId)
    .order("decidido_em");

  if (error) throw new Error(traduzirErro(error.message));

  return (data ?? []).map((linha) => {
    const l = linha as unknown as VotoCab & {
      perfis: { nome_completo: string } | null;
    };
    return { ...l, aprovador_nome: l.perfis?.nome_completo ?? "—" };
  });
}

/**
 * Registra ou troca o voto.
 *
 * `upsert` pela chave (mudanca_id, aprovador_id) porque quem pediu mais
 * informações volta para decidir — e a decisão nova substitui a antiga em vez
 * de virar um segundo voto da mesma pessoa.
 */
export async function votarCab(
  mudancaId: string,
  aprovador: Perfil,
  decisao: DecisaoCab,
  comentario: string,
): Promise<void> {
  const { error } = await supabase.from("mudanca_aprovacoes").upsert(
    {
      mudanca_id: mudancaId,
      aprovador_id: aprovador.id,
      decisao,
      comentario: comentario.trim() || null,
      decidido_em: new Date().toISOString(),
    },
    { onConflict: "mudanca_id,aprovador_id" },
  );

  if (error) throw new Error(traduzirErro(error.message));
}

/**
 * Quem pode votar nesta mudança.
 *
 * Reproduz `fn_cab_voto_valido`: gestor ou admin, que não seja quem
 * solicitou. A trava vale no banco — isto só decide se o bloco de voto
 * aparece, para não oferecer um botão que vai levantar exceção.
 */
export function podeVotar(m: Mudanca, perfil: Perfil): boolean {
  const ehGestor = perfil.papel === "gestor" || perfil.papel === "admin";
  return ehGestor && perfil.id !== m.solicitante_id && m.status !== "rascunho";
}

/* Ativos afetados */

export async function listarAtivosDaMudanca(
  mudancaId: string,
): Promise<Array<{ ativo_id: string; nome: string; criticidade: string }>> {
  const { data, error } = await supabase
    .from("mudanca_ativos")
    .select("ativo_id, ativos(nome, criticidade)")
    .eq("mudanca_id", mudancaId);

  if (error) throw new Error(traduzirErro(error.message));

  return (data ?? []).map((linha) => {
    const l = linha as unknown as {
      ativo_id: string;
      ativos: { nome: string; criticidade: string } | null;
    };
    return {
      ativo_id: l.ativo_id,
      nome: l.ativos?.nome ?? "Ativo removido",
      criticidade: l.ativos?.criticidade ?? "baixo",
    };
  });
}

export async function vincularAtivo(
  mudancaId: string,
  ativoId: string,
): Promise<void> {
  const { error } = await supabase
    .from("mudanca_ativos")
    .upsert({ mudanca_id: mudancaId, ativo_id: ativoId });
  if (error) throw new Error(traduzirErro(error.message));
}

export async function desvincularAtivo(
  mudancaId: string,
  ativoId: string,
): Promise<void> {
  const { error } = await supabase
    .from("mudanca_ativos")
    .delete()
    .eq("mudanca_id", mudancaId)
    .eq("ativo_id", ativoId);
  if (error) throw new Error(traduzirErro(error.message));
}

/* Trilha de auditoria */

/**
 * Linha do tempo auditável da mudança.
 *
 * A RPC é `security invoker`: quem decide se vem alguma linha é a policy
 * `auditoria_leitura` (`sou_gestor()`), no banco. Para quem não é gestor a
 * chamada devolve lista vazia em vez de erro — por isso a tela pode pedir a
 * trilha sem antes checar papel, e simplesmente não desenha o bloco vazio.
 */
export async function listarTrilha(mudancaId: string): Promise<EventoTrilha[]> {
  const { data, error } = await supabase.rpc("trilha_da_mudanca", {
    p_mudanca: mudancaId,
  });

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as EventoTrilha[];
}

/** Colunas que não dizem nada ao leitor da trilha. */
const RUIDO_TRILHA = new Set([
  "id",
  "mudanca_id",
  "criado_em",
  "atualizado_em",
  "solicitante_id",
]);

/**
 * O que mudou de um evento para o outro, em pares legíveis.
 *
 * A auditoria guarda a linha inteira antes e depois, e mostrar as duas cruas
 * obriga quem lê a comparar trinta campos para achar o único que mexeu. Aqui
 * sai só a diferença.
 */
export function diferencasDoEvento(
  evento: EventoTrilha,
): Array<{ campo: string; antes: string; depois: string }> {
  const antes = evento.valores_antes ?? {};
  const depois = evento.valores_depois ?? {};
  const campos = new Set([...Object.keys(antes), ...Object.keys(depois)]);

  const texto = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "sim" : "não";
    return String(v);
  };

  const diferencas: Array<{ campo: string; antes: string; depois: string }> = [];
  for (const campo of campos) {
    if (RUIDO_TRILHA.has(campo)) continue;
    const a = texto(antes[campo]);
    const d = texto(depois[campo]);
    if (a !== d) diferencas.push({ campo, antes: a, depois: d });
  }
  return diferencas;
}

/** Rótulo do evento — o que aconteceu, em vez de `UPDATE em mudancas`. */
export function rotuloEventoTrilha(evento: EventoTrilha): string {
  const { tabela, operacao } = evento;

  if (tabela === "mudanca_aprovacoes") {
    const decisao = (evento.valores_depois?.["decisao"] ??
      evento.valores_antes?.["decisao"]) as DecisaoCab | undefined;
    const rotulo = decisao ? ROTULOS_DECISAO[decisao] : "voto";
    return operacao === "INSERT"
      ? `Voto do CAB: ${rotulo}`
      : operacao === "UPDATE"
        ? `Voto do CAB alterado para ${rotulo}`
        : "Voto do CAB removido";
  }

  if (tabela === "mudanca_ativos") {
    return operacao === "DELETE" ? "Ativo desvinculado" : "Ativo vinculado";
  }

  if (operacao === "INSERT") return "Mudança criada";
  if (operacao === "DELETE") return "Rascunho excluído";

  const status = evento.valores_depois?.["status"];
  const statusAntes = evento.valores_antes?.["status"];
  if (status && status !== statusAntes) {
    return `Situação: ${ROTULOS_STATUS_MUDANCA[status as StatusMudanca]}`;
  }
  return "Mudança editada";
}
