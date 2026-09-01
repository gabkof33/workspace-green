/**
 * Administração do catálogo de serviços.
 *
 * Fica separado do bloco de catálogo do `api.ts` de propósito: lá mora o
 * cache de leitura que o formulário de abertura consulta de forma síncrona,
 * com só os serviços ativos e visíveis. Aqui é o cadastro — lê inativo, guarda
 * as chaves estrangeiras e escreve.
 *
 * Toda escrita chama `carregarCatalogo()` no fim. Sem isso, cadastrar um
 * serviço e ir direto para "Abrir chamado" mostraria a lista antiga, e a causa
 * seria invisível: o dado está no banco, o cache é que envelheceu.
 */

import { carregarCatalogo } from "@/lib/api";
import { supabase, traduzirErro } from "@/lib/supabase";
import type { Tabela } from "@/types/database";
import type {
  Prioridade,
  RascunhoServico,
  ServicoAdmin,
} from "@/types/dominio";

/**
 * A política como o banco a guarda.
 *
 * Não é o `PoliticaSla` do domínio: aquele é a matriz fixa de
 * `prioridade.ts`, com `rotulo` e `cobertura` para exibição. A tabela tem
 * `nome` e `calendario_id`, e é dela que sai o `sla_politica_id` gravado no
 * serviço.
 */
export type PoliticaSlaCadastrada = Tabela<"sla_politicas">;

const SELECAO_SERVICO =
  "*, equipes:equipe_padrao_id(nome), sla_politicas(prioridade), chamados(count)";

function enriquecer(linha: unknown): ServicoAdmin {
  const l = linha as Omit<
    ServicoAdmin,
    "equipe_nome" | "sla_prioridade" | "chamados"
  > & {
    equipes: { nome: string } | null;
    sla_politicas: { prioridade: Prioridade } | null;
    chamados: Array<{ count: number }> | null;
  };
  return {
    ...l,
    equipe_nome: l.equipes?.nome ?? null,
    sla_prioridade: l.sla_politicas?.prioridade ?? null,
    chamados: l.chamados?.[0]?.count ?? 0,
  };
}

/** O catálogo inteiro, inativos incluídos. */
export async function listarServicosAdmin(): Promise<ServicoAdmin[]> {
  const { data, error } = await supabase
    .from("catalogo_servicos")
    .select(SELECAO_SERVICO)
    .order("categoria")
    .order("nome");

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []).map(enriquecer);
}

/** As quatro políticas de SLA, para o seletor do cadastro. */
export async function listarPoliticasSla(): Promise<PoliticaSlaCadastrada[]> {
  const { data, error } = await supabase
    .from("sla_politicas")
    .select("*")
    .order("prioridade");

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as PoliticaSlaCadastrada[];
}

/**
 * Normaliza o código do serviço.
 *
 * Maiúscula e hífen, porque o código é lido por gente em relatório e usado
 * como chave em `fn_falha_rotina_abre_incidente` (que procura
 * `INF-SERVIDOR-INDISPONIVEL` pelo nome). Deixar o texto livre é o caminho
 * para dois serviços com o mesmo código em caixas diferentes.
 */
export function normalizarCodigo(bruto: string): string {
  return bruto
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function criarServico(
  rascunho: RascunhoServico,
): Promise<ServicoAdmin> {
  const { data, error } = await supabase
    .from("catalogo_servicos")
    .insert({
      codigo: normalizarCodigo(rascunho.codigo),
      nome: rascunho.nome.trim(),
      descricao: rascunho.descricao.trim(),
      tipo: rascunho.tipo,
      categoria: rascunho.categoria.trim(),
      subcategoria: rascunho.subcategoria.trim(),
      equipe_padrao_id: rascunho.equipe_padrao_id || null,
      sla_politica_id: rascunho.sla_politica_id,
      impacto_padrao: rascunho.impacto_padrao,
      urgencia_padrao: rascunho.urgencia_padrao,
      exige_ativo: rascunho.exige_ativo,
      exige_aprovacao: rascunho.exige_aprovacao,
      visivel_portal: rascunho.visivel_portal,
    })
    .select(SELECAO_SERVICO)
    .single();

  if (error) {
    if (error.message.includes("duplicate key")) {
      throw new Error(
        `Já existe serviço com o código ${normalizarCodigo(rascunho.codigo)}.`,
      );
    }
    throw new Error(traduzirErro(error.message));
  }

  await carregarCatalogo();
  return enriquecer(data);
}

export async function atualizarServico(
  id: string,
  campos: Partial<{
    nome: string;
    descricao: string;
    tipo: ServicoAdmin["tipo"];
    categoria: string;
    subcategoria: string;
    equipe_padrao_id: string | null;
    sla_politica_id: string;
    impacto_padrao: ServicoAdmin["impacto_padrao"];
    urgencia_padrao: ServicoAdmin["urgencia_padrao"];
    exige_ativo: boolean;
    exige_aprovacao: boolean;
    visivel_portal: boolean;
    ativo: boolean;
  }>,
): Promise<ServicoAdmin> {
  const { data, error } = await supabase
    .from("catalogo_servicos")
    .update(campos)
    .eq("id", id)
    .select(SELECAO_SERVICO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));

  await carregarCatalogo();
  return enriquecer(data);
}

/**
 * Liga e desliga o serviço.
 *
 * Desativar em vez de apagar não é preferência: `chamados.servico_id` aponta
 * para cá, e o histórico do chamado ficaria sem o serviço que o originou.
 * Serviço inativo sai do formulário de abertura e continua explicando os
 * chamados antigos.
 */
export function alternarServico(id: string, ativo: boolean): Promise<ServicoAdmin> {
  return atualizarServico(id, { ativo });
}
