/** CMDB — inventário de ativos e o grafo de dependências. */

import { limiteFinal } from "@/lib/periodo";
import { supabase, traduzirErro } from "@/lib/supabase";
import type {
  Ativo,
  AtivoEnriquecido,
  Criticidade,
  RascunhoAtivo,
  StatusAtivo,
  TipoAtivo,
} from "@/types/dominio";

export const ROTULOS_TIPO_ATIVO: Record<TipoAtivo, string> = {
  servidor: "Servidor",
  workstation: "Workstation",
  notebook: "Notebook",
  rede: "Equipamento de rede",
  storage: "Storage",
  impressora: "Impressora",
  mobile: "Dispositivo móvel",
  licenca: "Licença",
  servico_nuvem: "Serviço em nuvem",
  aplicacao: "Aplicação",
};

export const ROTULOS_STATUS_ATIVO: Record<StatusAtivo, string> = {
  em_estoque: "Em estoque",
  em_uso: "Em uso",
  em_manutencao: "Em manutenção",
  emprestado: "Emprestado",
  descartado: "Descartado",
  extraviado: "Extraviado",
};

export const ROTULOS_CRITICIDADE: Record<Criticidade, string> = {
  critico: "Crítico",
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo",
};

const PESO_CRITICIDADE: Record<Criticidade, number> = {
  critico: 0,
  alto: 1,
  medio: 2,
  baixo: 3,
};

/** Dias desde a última conferência física. */
export function diasSemVerificar(
  ativo: Pick<Ativo, "ultima_verificacao">,
): number | null {
  if (!ativo.ultima_verificacao) return null;
  const alvo = new Date(`${ativo.ultima_verificacao}T12:00:00`);
  return Math.round((Date.now() - alvo.getTime()) / 86_400_000);
}

/** Acima de 180 dias sem conferência, o registro deixa de ser confiável. */
export function inventarioSujo(
  ativo: Pick<Ativo, "ultima_verificacao">,
): boolean {
  const dias = diasSemVerificar(ativo);
  return dias === null || dias > 180;
}

const SELECAO =
  "*, dono:perfis!ativos_dono_tecnico_id_fkey(nome_completo), " +
  "usuario:perfis!ativos_usuario_id_fkey(nome_completo)";

function enriquecer(linha: unknown): AtivoEnriquecido {
  const l = linha as Ativo & {
    dono: { nome_completo: string } | null;
    usuario: { nome_completo: string } | null;
  };
  return {
    ...l,
    dono_tecnico_nome: l.dono?.nome_completo ?? null,
    usuario_nome: l.usuario?.nome_completo ?? null,
  };
}

export interface FiltroAtivos {
  tipo?: TipoAtivo | null;
  status?: StatusAtivo | null;
  criticidade?: Criticidade | null;
  texto?: string;
  apenasSujos?: boolean;
  /** Recorte por data de cadastro, ISO `YYYY-MM-DD` inclusivo. */
  de?: string | null;
  ate?: string | null;
}

export async function listarAtivos(
  filtro: FiltroAtivos = {},
): Promise<AtivoEnriquecido[]> {
  let consulta = supabase.from("ativos").select(SELECAO).limit(1000);

  if (filtro.tipo) consulta = consulta.eq("tipo_ativo", filtro.tipo);
  if (filtro.status) consulta = consulta.eq("status_ativo", filtro.status);
  if (filtro.criticidade)
    consulta = consulta.eq("criticidade", filtro.criticidade);
  if (filtro.de) consulta = consulta.gte("criado_em", filtro.de);
  if (filtro.ate) consulta = consulta.lte("criado_em", limiteFinal(filtro.ate));

  const { data, error } = await consulta;
  if (error) throw new Error(traduzirErro(error.message));

  return (data ?? [])
    .map(enriquecer)
    .filter((a) => (filtro.apenasSujos ? inventarioSujo(a) : true))
    .filter((a) => {
      if (!filtro.texto) return true;
      const alvo = filtro.texto.toLowerCase();
      return [a.nome, a.tag_patrimonio, a.numero_serie, a.modelo, a.fabricante]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(alvo));
    })
    .sort((a, b) => {
      const c =
        PESO_CRITICIDADE[a.criticidade] - PESO_CRITICIDADE[b.criticidade];
      return c !== 0 ? c : a.nome.localeCompare(b.nome);
    });
}

export async function obterAtivo(id: string): Promise<AtivoEnriquecido | null> {
  const { data, error } = await supabase
    .from("ativos")
    .select(SELECAO)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(traduzirErro(error.message));
  return data ? enriquecer(data) : null;
}

export async function criarAtivo(
  rascunho: RascunhoAtivo,
): Promise<AtivoEnriquecido> {
  const { data, error } = await supabase
    .from("ativos")
    .insert({
      nome: rascunho.nome.trim(),
      tag_patrimonio: rascunho.tag_patrimonio.trim() || null,
      tipo_ativo: rascunho.tipo_ativo,
      status_ativo: rascunho.status_ativo,
      criticidade: rascunho.criticidade,
      ambiente: rascunho.ambiente || null,
      unidade: rascunho.unidade.trim() || null,
      sala: rascunho.sala.trim() || null,
      fabricante: rascunho.fabricante.trim() || null,
      modelo: rascunho.modelo.trim() || null,
      numero_serie: rascunho.numero_serie.trim() || null,
      fim_garantia: rascunho.fim_garantia || null,
      observacoes: rascunho.observacoes.trim() || null,
      // Cadastrar é conferir: o registro nasce verificado hoje.
      ultima_verificacao: new Date().toISOString().slice(0, 10),
    })
    .select(SELECAO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecer(data);
}

export async function atualizarAtivo(
  id: string,
  campos: Partial<
    Pick<
      Ativo,
      | "nome"
      | "status_ativo"
      | "criticidade"
      | "ambiente"
      | "unidade"
      | "sala"
      | "dono_tecnico_id"
      | "usuario_id"
      | "fim_garantia"
      | "observacoes"
      | "ultima_verificacao"
    >
  >,
): Promise<AtivoEnriquecido> {
  const { data, error } = await supabase
    .from("ativos")
    .update(campos)
    .eq("id", id)
    .select(SELECAO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecer(data);
}

/** Registra a conferência física de hoje. */
export async function confirmarVerificacao(
  id: string,
): Promise<AtivoEnriquecido> {
  return atualizarAtivo(id, {
    ultima_verificacao: new Date().toISOString().slice(0, 10),
  });
}

export async function excluirAtivo(id: string): Promise<void> {
  const { error } = await supabase.from("ativos").delete().eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

/** O que para junto se este ativo cair. */
export async function ativosImpactados(ativoId: string): Promise<
  Array<{
    ativo_id: string;
    nome: string;
    criticidade: Criticidade;
    saltos: number;
  }>
> {
  const { data, error } = await supabase.rpc("ativos_impactados", {
    p_ativo: ativoId,
  });
  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as Array<{
    ativo_id: string;
    nome: string;
    criticidade: Criticidade;
    saltos: number;
  }>;
}
