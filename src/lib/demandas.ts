/** Camada de dados das demandas, comentários e notificações. */

import { limiteFinal } from "@/lib/periodo";
import { supabase, traduzirErro } from "@/lib/supabase";
import type {
  ComentarioDemanda,
  Demanda,
  DemandaEnriquecida,
  Hierarquia,
  ItemDemanda,
  ItemDemandaEnriquecido,
  Notificacao,
  ParametroEnriquecido,
  ParametroSugerido,
  Perfil,
  PrioridadeDemanda,
  RascunhoDemanda,
  StatusDemanda,
  TipoDemanda,
} from "@/types/dominio";

/* Rótulos e ordenação */

export const ROTULOS_TIPO: Record<TipoDemanda, string> = {
  melhoria: "Melhoria",
  bug: "Correção",
  tarefa: "Tarefa",
  documentacao: "Documentação",
  infraestrutura: "Infraestrutura",
  automacao: "Automação",
  pesquisa: "Pesquisa",
};

export const ROTULOS_STATUS_DEMANDA: Record<StatusDemanda, string> = {
  backlog: "Backlog",
  refinamento: "Em refinamento",
  disponivel: "Disponível para pegar",
  em_andamento: "Em andamento",
  revisao: "Em revisão",
  bloqueada: "Bloqueada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const ROTULOS_PRIORIDADE: Record<PrioridadeDemanda, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const ORDEM_STATUS: StatusDemanda[] = [
  "backlog",
  "refinamento",
  "disponivel",
  "em_andamento",
  "revisao",
  "bloqueada",
  "concluida",
  "cancelada",
];

const PESO_PRIORIDADE: Record<PrioridadeDemanda, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baixa: 3,
};

export const STATUS_ABERTOS: StatusDemanda[] = [
  "backlog",
  "refinamento",
  "disponivel",
  "em_andamento",
  "revisao",
  "bloqueada",
];

/** Dias restantes até o prazo. */
export function diasRestantes(
  fimPrevisto: string | null,
  hoje = new Date(),
): number | null {
  if (!fimPrevisto) return null;
  const alvo = new Date(`${fimPrevisto}T12:00:00`);
  const base = new Date(
    hoje.getFullYear(),
    hoje.getMonth(),
    hoje.getDate(),
    12,
  );
  return Math.round((alvo.getTime() - base.getTime()) / 86_400_000);
}

export function estaAtrasada(d: Demanda, hoje = new Date()): boolean {
  if (d.status === "concluida" || d.status === "cancelada") return false;
  const dias = diasRestantes(d.data_fim_prevista, hoje);
  return dias !== null && dias < 0;
}

/* Consultas */

/**
 * Em auto-relacionamento (`demandas.depende_de_id` → `demandas.id`), o
 * PostgREST não resolve a dica pelo nome da constraint — só pelo nome da
 */
const SELECAO_DEMANDA =
  "*, setores(nome), " +
  "solicitante:perfis!demandas_solicitante_id_fkey(nome_completo, hierarquia), " +
  "responsavel:perfis!demandas_responsavel_id_fkey(nome_completo, hierarquia), " +
  "excluidor:perfis!demandas_excluida_por_fkey(nome_completo), " +
  "equipes(nome), depende_de:demandas!depende_de_id(codigo)";

function enriquecerDemanda(linha: unknown): DemandaEnriquecida {
  const l = linha as Demanda & {
    solicitante: { nome_completo: string; hierarquia: Hierarquia } | null;
    responsavel: { nome_completo: string; hierarquia: Hierarquia } | null;
    excluidor: { nome_completo: string } | null;
    equipes: { nome: string } | null;
    setores: { nome: string } | null;
    depende_de: { codigo: string } | null;
  };
  return {
    ...l,
    setor_nome: l.setores?.nome ?? null,
    solicitante_nome: l.solicitante?.nome_completo ?? "Desconhecido",
    solicitante_hierarquia: l.solicitante?.hierarquia ?? "colaborador",
    responsavel_nome: l.responsavel?.nome_completo ?? null,
    responsavel_hierarquia: l.responsavel?.hierarquia ?? null,
    excluida_por_nome: l.excluidor?.nome_completo ?? null,
    equipe_nome: l.equipes?.nome ?? null,
    depende_de_codigo: l.depende_de?.codigo ?? null,
  };
}

export interface FiltroDemandas {
  status?: StatusDemanda | null;
  tipo?: TipoDemanda | null;
  texto?: string;
  minhas?: string;
  apenasAbertas?: boolean;
  /** Lixeira: mostra apenas as excluídas logicamente. */
  excluidas?: boolean;
  /** Recorte por data de criação, ISO `YYYY-MM-DD` inclusivo. */
  de?: string | null;
  ate?: string | null;
}

export async function listarDemandas(
  filtro: FiltroDemandas = {},
): Promise<DemandaEnriquecida[]> {
  let consulta = supabase
    .from("demandas")
    .select(SELECAO_DEMANDA)
    .order("criado_em", { ascending: false })
    .limit(500);

  consulta = filtro.excluidas
    ? consulta.not("excluida_em", "is", null)
    : consulta.is("excluida_em", null);

  if (filtro.status) consulta = consulta.eq("status", filtro.status);
  if (filtro.tipo) consulta = consulta.eq("tipo", filtro.tipo);
  if (filtro.minhas) consulta = consulta.eq("responsavel_id", filtro.minhas);
  if (filtro.apenasAbertas) {
    consulta = consulta.not("status", "in", "(concluida,cancelada)");
  }
  if (filtro.de) consulta = consulta.gte("criado_em", filtro.de);
  if (filtro.ate) consulta = consulta.lte("criado_em", limiteFinal(filtro.ate));

  const { data, error } = await consulta;
  if (error) throw new Error(traduzirErro(error.message));

  return (data ?? [])
    .map(enriquecerDemanda)
    .filter((d) => {
      if (!filtro.texto) return true;
      const alvo = filtro.texto.toLowerCase();
      return (
        d.titulo.toLowerCase().includes(alvo) ||
        (d.codigo ?? "").toLowerCase().includes(alvo) ||
        (d.area ?? "").toLowerCase().includes(alvo)
      );
    })
    .sort((a, b) => {
      const st =
        ORDEM_STATUS.indexOf(a.status) - ORDEM_STATUS.indexOf(b.status);
      if (st !== 0) return st;
      const pr = PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade];
      if (pr !== 0) return pr;
      return (a.data_fim_prevista ?? "9999-12-31").localeCompare(
        b.data_fim_prevista ?? "9999-12-31",
      );
    });
}

export async function obterDemanda(
  codigo: string,
): Promise<DemandaEnriquecida | null> {
  const { data, error } = await supabase
    .from("demandas")
    .select(SELECAO_DEMANDA)
    .eq("codigo", codigo)
    .maybeSingle();

  if (error) throw new Error(traduzirErro(error.message));
  return data ? enriquecerDemanda(data) : null;
}

/* Escrita */

export async function criarDemanda(
  rascunho: RascunhoDemanda,
  autor: Perfil,
  /** Fila de destino. */
  equipeId: string | null = null,
): Promise<DemandaEnriquecida> {
  const { data, error } = await supabase
    .from("demandas")
    .insert({
      titulo: rascunho.titulo.trim(),
      descricao: rascunho.descricao.trim(),
      tipo: rascunho.tipo,
      area: rascunho.area.trim() || null,
      prioridade: rascunho.prioridade,
      solicitante_id: autor.id,
      equipe_id: equipeId,
      setor_id: rascunho.setor_id || null,
      data_inicio_prevista: rascunho.data_inicio_prevista || null,
      data_fim_prevista: rascunho.data_fim_prevista || null,
      esforco_horas: rascunho.esforco_horas
        ? Number(rascunho.esforco_horas)
        : null,
      criterios_aceite: rascunho.criterios_aceite.trim() || null,
      tags: rascunho.tags,
      // Com prazo definido já nasce disponível: alguém pode pegar sem
      // esperar refinamento.
      status: rascunho.data_fim_prevista ? "disponivel" : "backlog",
    })
    .select(SELECAO_DEMANDA)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecerDemanda(data);
}

export async function assumirDemanda(
  demandaId: string,
  perfil: Perfil,
): Promise<DemandaEnriquecida> {
  return atualizarDemanda(demandaId, {
    responsavel_id: perfil.id,
    status: "em_andamento",
  });
}

export async function liberarDemanda(
  demandaId: string,
): Promise<DemandaEnriquecida> {
  return atualizarDemanda(demandaId, {
    responsavel_id: null,
    status: "disponivel",
  });
}

/** Passa a demanda para outra pessoa. */
export async function atribuirDemanda(
  demandaId: string,
  responsavelId: string,
): Promise<DemandaEnriquecida> {
  return atualizarDemanda(demandaId, {
    responsavel_id: responsavelId,
    status: "em_andamento",
  });
}

export type CamposEditaveis = Partial<
  Pick<
    Demanda,
    | "titulo"
    | "descricao"
    | "tipo"
    | "area"
    | "status"
    | "responsavel_id"
    | "percentual"
    | "prioridade"
    | "data_inicio_prevista"
    | "data_fim_prevista"
    | "data_fim_real"
    | "esforco_horas"
    | "motivo_bloqueio"
    | "criterios_aceite"
    | "tags"
    | "equipe_id"
  >
>;

/** Quem pode apagar, e por quê. */
export function podeExcluir(
  d: Demanda,
  perfil: Perfil,
): { pode: boolean; motivo: string } {
  if (d.status === "concluida" && perfil.papel !== "admin") {
    return {
      pode: false,
      motivo:
        "Demanda concluída conta no histórico de entrega e nos indicadores. Use o status “cancelada” para tirá-la do quadro.",
    };
  }

  if (
    perfil.papel === "admin" ||
    perfil.hierarquia === "coordenador" ||
    perfil.hierarquia === "gestor"
  ) {
    return { pode: true, motivo: "" };
  }

  if (d.solicitante_id !== perfil.id) {
    return {
      pode: false,
      motivo: "Só quem registrou a demanda, ou a gestão, pode excluí-la.",
    };
  }

  if (d.responsavel_id) {
    return {
      pode: false,
      motivo:
        "Alguém já assumiu esta demanda. Fale com a pessoa e cancele em vez de apagar — o trabalho dela some junto.",
    };
  }

  if (!["backlog", "refinamento", "disponivel"].includes(d.status)) {
    return {
      pode: false,
      motivo: "A demanda já saiu do backlog. Cancele em vez de apagar.",
    };
  }

  return { pode: true, motivo: "" };
}

/** Quem pode corrigir o conteúdo — texto, datas, tipo e prioridade. */
export function podeEditar(d: Demanda, perfil: Perfil): boolean {
  if (d.status === "concluida" || d.status === "cancelada") {
    return perfil.papel === "admin" || perfil.hierarquia === "coordenador";
  }
  if (perfil.papel !== "solicitante") return true;
  return d.solicitante_id === perfil.id;
}

export async function atualizarDemanda(
  demandaId: string,
  campos: CamposEditaveis,
): Promise<DemandaEnriquecida> {
  if (campos.status === "bloqueada") {
    const motivo = campos.motivo_bloqueio?.trim() ?? "";
    if (motivo.length < 10) {
      throw new Error(
        "Bloquear exige um motivo com ao menos 10 caracteres — sem isso o quadro enche de card parado sem ninguém saber por quê.",
      );
    }
  }

  const { data, error } = await supabase
    .from("demandas")
    .update(campos)
    .eq("id", demandaId)
    .select(SELECAO_DEMANDA)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecerDemanda(data);
}

/**
 * Exclusão lógica: o registro continua no banco, marcado com quem excluiu,
 * quando e por quê, e some das listas.
 */
export async function excluirDemanda(
  demandaId: string,
  motivo: string,
): Promise<void> {
  const texto = motivo.trim();
  if (texto.length < 5) {
    throw new Error(
      "Informe o motivo da exclusão — é o que explica o sumiço para quem procurar a demanda depois.",
    );
  }

  const { error, count } = await supabase
    .from("demandas")
    .update(
      { excluida_em: new Date().toISOString(), motivo_exclusao: texto },
      { count: "exact" },
    )
    .eq("id", demandaId);

  if (error) throw new Error(traduzirErro(error.message));

  // O RLS recusa um UPDATE sem devolver erro — ele apenas não altera nada.
  if (count === 0) {
    throw new Error("Você não tem permissão para excluir esta demanda.");
  }
}

/** Devolve ao quadro uma demanda excluída. */
export async function restaurarDemanda(demandaId: string): Promise<void> {
  const { error, count } = await supabase
    .from("demandas")
    .update({ excluida_em: null }, { count: "exact" })
    .eq("id", demandaId);

  if (error) throw new Error(traduzirErro(error.message));
  if (count === 0) {
    throw new Error("Apenas coordenação ou gestão pode restaurar.");
  }
}

export async function excluirComentario(id: string): Promise<void> {
  const { error } = await supabase
    .from("demanda_comentarios")
    .update({
      excluido_em: new Date().toISOString(),
      corpo: "[comentário removido pelo autor]",
    })
    .eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

/* Lista de verificação — o que move o progresso */

const SELECAO_ITEM =
  "*, executor:perfis!demanda_itens_concluido_por_fkey(nome_completo)";

function enriquecerItem(linha: unknown): ItemDemandaEnriquecido {
  const l = linha as ItemDemanda & {
    executor: { nome_completo: string } | null;
  };
  return { ...l, concluido_por_nome: l.executor?.nome_completo ?? null };
}

export async function listarItens(
  demandaId: string,
): Promise<ItemDemandaEnriquecido[]> {
  const { data, error } = await supabase
    .from("demanda_itens")
    .select(SELECAO_ITEM)
    .eq("demanda_id", demandaId)
    .order("ordem");

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []).map(enriquecerItem);
}

export async function adicionarItem(
  demandaId: string,
  descricao: string,
  observacao: string,
  autor: Perfil,
): Promise<ItemDemandaEnriquecido> {
  const texto = descricao.trim();
  if (texto.length < 3) {
    throw new Error("Descreva o item com ao menos 3 caracteres.");
  }

  const existentes = await listarItens(demandaId);

  const { data, error } = await supabase
    .from("demanda_itens")
    .insert({
      demanda_id: demandaId,
      ordem: (existentes.at(-1)?.ordem ?? 0) + 1,
      descricao: texto,
      observacao: observacao.trim() || null,
      criado_por: autor.id,
    })
    .select(SELECAO_ITEM)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecerItem(data);
}

/** Marca ou desmarca. */
export async function alternarItem(
  itemId: string,
  concluido: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("demanda_itens")
    .update({ concluido })
    .eq("id", itemId);

  if (error) throw new Error(traduzirErro(error.message));
}

export async function atualizarItem(
  itemId: string,
  campos: Partial<Pick<ItemDemanda, "descricao" | "observacao">>,
): Promise<void> {
  const { error } = await supabase
    .from("demanda_itens")
    .update(campos)
    .eq("id", itemId);

  if (error) throw new Error(traduzirErro(error.message));
}

export async function removerItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from("demanda_itens")
    .delete()
    .eq("id", itemId);

  if (error) throw new Error(traduzirErro(error.message));
}

/* Parâmetros livres */

export const ROTULOS_TIPO_PARAMETRO: Record<
  ParametroEnriquecido["tipo"],
  string
> = {
  texto: "Texto",
  numero: "Número",
  data: "Data",
  booleano: "Sim ou não",
  selecao: "Opção",
};

const SELECAO_PARAMETRO =
  "*, autor:perfis!demanda_parametros_criado_por_fkey(nome_completo)";

function enriquecerParametro(linha: unknown): ParametroEnriquecido {
  const l = linha as ParametroEnriquecido & {
    autor: { nome_completo: string } | null;
  };
  return { ...l, criado_por_nome: l.autor?.nome_completo ?? null };
}

export async function listarParametros(
  demandaId: string,
): Promise<ParametroEnriquecido[]> {
  const { data, error } = await supabase
    .from("demanda_parametros")
    .select(SELECAO_PARAMETRO)
    .eq("demanda_id", demandaId)
    .order("rotulo");

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []).map(enriquecerParametro);
}

/** Vocabulário de parâmetros já usados em outras demandas. */
export async function listarParametrosSugeridos(): Promise<
  ParametroSugerido[]
> {
  const { data, error } = await supabase.rpc("parametros_sugeridos", {
    p_limite: 30,
  });
  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as ParametroSugerido[];
}

export async function adicionarParametro(
  demandaId: string,
  entrada: {
    rotulo: string;
    tipo: ParametroEnriquecido["tipo"];
    valor: string;
  },
  autor: Perfil,
): Promise<ParametroEnriquecido> {
  const { data, error } = await supabase
    .from("demanda_parametros")
    .insert({
      demanda_id: demandaId,
      rotulo: entrada.rotulo,
      tipo: entrada.tipo,
      valor: entrada.valor,
      criado_por: autor.id,
    })
    .select(SELECAO_PARAMETRO)
    .single();

  if (error) {
    if (error.message.includes("duplicate key")) {
      throw new Error(
        `Esta demanda já tem um parâmetro "${entrada.rotulo}". Edite o existente em vez de criar outro.`,
      );
    }
    throw new Error(traduzirErro(error.message));
  }
  return enriquecerParametro(data);
}

export async function atualizarParametro(
  id: string,
  valor: string,
): Promise<void> {
  const { error } = await supabase
    .from("demanda_parametros")
    .update({ valor })
    .eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

export async function removerParametro(id: string): Promise<void> {
  const { error, count } = await supabase
    .from("demanda_parametros")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) throw new Error(traduzirErro(error.message));
  if (count === 0) {
    throw new Error("Só quem criou o parâmetro, ou a gestão, pode removê-lo.");
  }
}

/* Comentários com menção */

/**
 * A dica pela constraint é obrigatória: desde que `excluido_por` foi
 * acrescentado, existem duas chaves de `demanda_comentarios` para `perfis`,
 */
const SELECAO_COMENTARIO =
  "*, autor:perfis!demanda_comentarios_autor_id_fkey(nome_completo, hierarquia)";

function enriquecerComentario(linha: unknown): ComentarioDemanda {
  const l = linha as ComentarioDemanda & {
    autor: { nome_completo: string; hierarquia: Hierarquia } | null;
  };
  return {
    ...l,
    autor_nome: l.autor?.nome_completo ?? "Desconhecido",
    autor_hierarquia: l.autor?.hierarquia ?? "colaborador",
  };
}

export async function listarComentarios(
  demandaId: string,
): Promise<ComentarioDemanda[]> {
  const { data, error } = await supabase
    .from("demanda_comentarios")
    .select(SELECAO_COMENTARIO)
    .eq("demanda_id", demandaId)
    .order("criado_em", { ascending: true });

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []).map(enriquecerComentario);
}

export async function comentar(
  demandaId: string,
  corpo: string,
  mencionados: string[],
  autor: Perfil,
): Promise<ComentarioDemanda> {
  const { data, error } = await supabase
    .from("demanda_comentarios")
    .insert({
      demanda_id: demandaId,
      autor_id: autor.id,
      corpo,
      mencionados,
    })
    .select(SELECAO_COMENTARIO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecerComentario(data);
}

/* Notificações */

export async function listarNotificacoes(
  perfilId: string,
): Promise<Notificacao[]> {
  const { data, error } = await supabase
    .from("notificacoes")
    .select("*")
    .eq("destinatario_id", perfilId)
    .order("criado_em", { ascending: false })
    .limit(50);

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as Notificacao[];
}

export async function marcarNotificacaoLida(id: string): Promise<void> {
  const { error } = await supabase
    .from("notificacoes")
    .update({ lida: true })
    .eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

export async function marcarTodasLidas(perfilId: string): Promise<void> {
  const { error } = await supabase
    .from("notificacoes")
    .update({ lida: true })
    .eq("destinatario_id", perfilId)
    .eq("lida", false);
  if (error) throw new Error(traduzirErro(error.message));
}
