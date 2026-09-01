/** Setores da empresa. */

import { supabase, traduzirErro } from "@/lib/supabase";
import type { AbaConfiguravel, Setor, SetorArvore } from "@/types/dominio";

/** Abas configuráveis por setor. */
export const ABAS_CONFIGURAVEIS: AbaConfiguravel[] = [
  { chave: "meus", rotulo: "Meus chamados", somenteTi: false },
  { chave: "demandas", rotulo: "Quadro de demandas", somenteTi: false },
  { chave: "gantt", rotulo: "Cronograma", somenteTi: false },
  { chave: "conversas", rotulo: "Conversas", somenteTi: false },
  { chave: "conhecimento", rotulo: "Base de conhecimento", somenteTi: false },
  { chave: "pessoas", rotulo: "Pessoas", somenteTi: false },
  { chave: "mapa", rotulo: "Mapa da empresa", somenteTi: false },
  { chave: "fila", rotulo: "Fila de atendimento", somenteTi: true },
  { chave: "setores", rotulo: "Setores", somenteTi: true },
  { chave: "rotinas", rotulo: "Rotinas preventivas", somenteTi: true },
  { chave: "mudancas", rotulo: "Mudanças", somenteTi: true },
  { chave: "ativos", rotulo: "Ativos", somenteTi: true },
  { chave: "catalogo", rotulo: "Catálogo de serviços", somenteTi: true },
  { chave: "tempos", rotulo: "Tempos de atendimento", somenteTi: true },
  { chave: "painel", rotulo: "Painel de governança", somenteTi: true },
];

/** Conjunto que um setor fora da TI costuma precisar. */
export const ABAS_PADRAO_SETOR = [
  "meus",
  "demandas",
  "gantt",
  "conversas",
  "conhecimento",
  "mapa",
];

/** Árvore completa, já ordenada por área e depois por posição dentro dela. */
export async function listarSetores(
  incluirInativos = false,
): Promise<SetorArvore[]> {
  let consulta = supabase.from("vw_setores").select("*");
  if (!incluirInativos) consulta = consulta.eq("ativo", true);

  const { data, error } = await consulta;
  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as SetorArvore[];
}

/** Apenas as áreas de topo — usadas como pai ao criar um subsetor. */
export function apenasAreas(arvore: SetorArvore[]): SetorArvore[] {
  return arvore.filter((s) => s.setor_pai_id === null);
}

/** Setores que podem receber uma demanda. */
export function setoresSolicitantes(arvore: SetorArvore[]): SetorArvore[] {
  return arvore.filter((s) => s.subsetores === 0 && s.ativo);
}

export async function criarSetor(entrada: {
  nome: string;
  setor_pai_id: string | null;
  descricao: string;
}): Promise<Setor> {
  const nome = entrada.nome.trim();
  if (nome.length < 2) {
    throw new Error("O nome do setor precisa de ao menos 2 caracteres.");
  }

  const { data, error } = await supabase
    .from("setores")
    .insert({
      nome,
      setor_pai_id: entrada.setor_pai_id,
      descricao: entrada.descricao.trim() || null,
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes("duplicate key")) {
      throw new Error(
        entrada.setor_pai_id
          ? `Já existe um subsetor com esse nome nesta área.`
          : `Já existe uma área com esse nome.`,
      );
    }
    throw new Error(traduzirErro(error.message));
  }
  return data as Setor;
}

/** Grava as abas do setor. */
export async function definirAbas(
  id: string,
  abas: string[] | null,
): Promise<void> {
  const { error } = await supabase
    .from("setores")
    .update({ abas })
    .eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

export async function renomearSetor(id: string, nome: string): Promise<void> {
  const { error } = await supabase
    .from("setores")
    .update({ nome: nome.trim() })
    .eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

export async function alternarSetor(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase
    .from("setores")
    .update({ ativo })
    .eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

/** Exclui um setor. */
export async function excluirSetor(id: string): Promise<void> {
  const { error, count } = await supabase
    .from("setores")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    if (error.message.includes("violates foreign key")) {
      throw new Error(
        "Este setor ainda tem subsetores ou registros vinculados. Remova os subsetores primeiro, ou apenas desative-o.",
      );
    }
    throw new Error(traduzirErro(error.message));
  }
  if (count === 0) {
    throw new Error("Apenas a gestão pode excluir setores.");
  }
}
