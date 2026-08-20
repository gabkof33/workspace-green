/** Base de conhecimento e erros conhecidos (KEDB). */

import { supabase, traduzirErro } from "@/lib/supabase";
import type {
  Artigo,
  ArtigoEnriquecido,
  ErroConhecido,
  Perfil,
  PublicoArtigo,
  RascunhoArtigo,
  RascunhoErro,
  StatusArtigo,
  StatusErro,
  TipoArtigo,
} from "@/types/dominio";

export const ROTULOS_TIPO_ARTIGO: Record<TipoArtigo, string> = {
  sop: "Procedimento (SOP)",
  guia_usuario: "Guia do usuário",
  solucao_conhecida: "Solução conhecida",
  politica: "Política",
  post_mortem: "Post-mortem",
};

export const ROTULOS_PUBLICO: Record<PublicoArtigo, string> = {
  usuario_final: "Usuário final",
  agente: "Equipe de TI",
  restrito: "Restrito",
};

export const ROTULOS_STATUS_ARTIGO: Record<StatusArtigo, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  publicado: "Publicado",
  obsoleto: "Obsoleto",
};

export const ROTULOS_STATUS_ERRO: Record<StatusErro, string> = {
  identificado: "Identificado",
  com_contorno: "Com contorno",
  em_correcao: "Em correção",
  resolvido: "Resolvido",
};

/** Artigo publicado cuja validade expirou deixa de ser confiável. */
export function artigoVencido(
  a: Pick<Artigo, "status_artigo" | "valido_ate">,
): boolean {
  if (a.status_artigo !== "publicado" || !a.valido_ate) return false;
  return a.valido_ate < new Date().toISOString().slice(0, 10);
}

/** Proporção de "isto ajudou". */
export function razaoUtilidade(
  a: Pick<Artigo, "util_sim" | "util_nao">,
): number | null {
  const total = a.util_sim + a.util_nao;
  return total === 0 ? null : Math.round((a.util_sim / total) * 100);
}

/* Artigos */

const SELECAO_ARTIGO =
  "*, autor:perfis!artigos_kb_autor_id_fkey(nome_completo), " +
  "revisor:perfis!artigos_kb_revisor_id_fkey(nome_completo)";

function enriquecerArtigo(linha: unknown): ArtigoEnriquecido {
  const l = linha as Artigo & {
    autor: { nome_completo: string } | null;
    revisor: { nome_completo: string } | null;
  };
  return {
    ...l,
    autor_nome: l.autor?.nome_completo ?? "Desconhecido",
    revisor_nome: l.revisor?.nome_completo ?? null,
  };
}

export interface FiltroArtigos {
  status?: StatusArtigo | null;
  tipo?: TipoArtigo | null;
  texto?: string;
}

export async function listarArtigos(
  filtro: FiltroArtigos = {},
): Promise<ArtigoEnriquecido[]> {
  let consulta = supabase
    .from("artigos_kb")
    .select(SELECAO_ARTIGO)
    .order("atualizado_em", { ascending: false })
    .limit(300);

  if (filtro.status) consulta = consulta.eq("status_artigo", filtro.status);
  if (filtro.tipo) consulta = consulta.eq("tipo_artigo", filtro.tipo);

  const { data, error } = await consulta;
  if (error) throw new Error(traduzirErro(error.message));

  return (data ?? []).map(enriquecerArtigo).filter((a) => {
    if (!filtro.texto) return true;
    const alvo = filtro.texto.toLowerCase();
    return [a.titulo, a.resumo, a.corpo, a.codigo, a.categoria]
      .filter(Boolean)
      .some((campo) => String(campo).toLowerCase().includes(alvo));
  });
}

export async function obterArtigo(
  codigo: string,
): Promise<ArtigoEnriquecido | null> {
  const { data, error } = await supabase
    .from("artigos_kb")
    .select(SELECAO_ARTIGO)
    .eq("codigo", codigo)
    .maybeSingle();

  if (error) throw new Error(traduzirErro(error.message));
  return data ? enriquecerArtigo(data) : null;
}

export async function criarArtigo(
  rascunho: RascunhoArtigo,
  autor: Perfil,
): Promise<ArtigoEnriquecido> {
  const { data, error } = await supabase
    .from("artigos_kb")
    .insert({
      titulo: rascunho.titulo.trim(),
      tipo_artigo: rascunho.tipo_artigo,
      publico_alvo: rascunho.publico_alvo,
      categoria: rascunho.categoria.trim() || null,
      resumo: rascunho.resumo.trim(),
      pre_requisitos: rascunho.pre_requisitos.trim() || null,
      corpo: rascunho.corpo.trim(),
      autor_id: autor.id,
    })
    .select(SELECAO_ARTIGO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecerArtigo(data);
}

export async function atualizarArtigo(
  id: string,
  campos: Partial<
    Pick<
      Artigo,
      | "titulo"
      | "resumo"
      | "corpo"
      | "categoria"
      | "pre_requisitos"
      | "tipo_artigo"
      | "publico_alvo"
      | "status_artigo"
      | "revisor_id"
      | "valido_ate"
    >
  >,
): Promise<ArtigoEnriquecido> {
  const { data, error } = await supabase
    .from("artigos_kb")
    .update(campos)
    .eq("id", id)
    .select(SELECAO_ARTIGO)
    .single();

  if (error) {
    if (error.message.includes("revisao_por_outra_pessoa")) {
      throw new Error(
        "Publicar exige um revisor diferente do autor. Quem escreve não revisa o próprio texto.",
      );
    }
    throw new Error(traduzirErro(error.message));
  }
  return enriquecerArtigo(data);
}

/** Publica com revisor. */
export async function publicarArtigo(
  id: string,
  revisor: Perfil,
): Promise<ArtigoEnriquecido> {
  return atualizarArtigo(id, {
    status_artigo: "publicado",
    revisor_id: revisor.id,
  });
}

/** Registra o voto de utilidade e, quando positivo, o chamado evitado. */
export async function avaliarArtigo(
  artigo: Artigo,
  util: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("artigos_kb")
    .update(
      util
        ? {
            util_sim: artigo.util_sim + 1,
            chamados_evitados: artigo.chamados_evitados + 1,
          }
        : { util_nao: artigo.util_nao + 1 },
    )
    .eq("id", artigo.id);

  if (error) throw new Error(traduzirErro(error.message));
}

export async function registrarVisualizacao(artigo: Artigo): Promise<void> {
  await supabase
    .from("artigos_kb")
    .update({ visualizacoes: artigo.visualizacoes + 1 })
    .eq("id", artigo.id);
}

export async function excluirArtigo(id: string): Promise<void> {
  const { error } = await supabase.from("artigos_kb").delete().eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

/** Move para revisão todo artigo publicado cuja validade expirou. */
export async function revisarVencidos(): Promise<number> {
  const { data, error } = await supabase.rpc("revisar_artigos_vencidos");
  if (error) throw new Error(traduzirErro(error.message));
  return (data as number) ?? 0;
}

/* Erros conhecidos (KEDB) */

export async function listarErros(texto = ""): Promise<ErroConhecido[]> {
  const { data, error } = await supabase
    .from("erros_conhecidos")
    .select("*")
    .order("ocorrencias", { ascending: false })
    .limit(300);

  if (error) throw new Error(traduzirErro(error.message));

  return ((data ?? []) as ErroConhecido[]).filter((e) => {
    if (!texto) return true;
    const alvo = texto.toLowerCase();
    return [e.sintoma, e.causa_raiz, e.contorno, e.codigo]
      .filter(Boolean)
      .some((campo) => String(campo).toLowerCase().includes(alvo));
  });
}

export async function criarErro(
  rascunho: RascunhoErro,
  autor: Perfil,
): Promise<ErroConhecido> {
  const { data, error } = await supabase
    .from("erros_conhecidos")
    .insert({
      sintoma: rascunho.sintoma.trim(),
      causa_raiz: rascunho.causa_raiz.trim(),
      contorno: rascunho.contorno.trim(),
      solucao_definitiva: rascunho.solucao_definitiva.trim() || null,
      versao_afetada: rascunho.versao_afetada.trim() || null,
      custo_estimado_mes: rascunho.custo_estimado_mes
        ? Number(rascunho.custo_estimado_mes)
        : null,
      responsavel_id: autor.id,
      status_erro: rascunho.solucao_definitiva.trim()
        ? "em_correcao"
        : "com_contorno",
    })
    .select()
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return data as ErroConhecido;
}

export async function atualizarErro(
  id: string,
  campos: Partial<
    Pick<
      ErroConhecido,
      | "sintoma"
      | "causa_raiz"
      | "contorno"
      | "solucao_definitiva"
      | "status_erro"
      | "custo_estimado_mes"
      | "versao_corrigida"
    >
  >,
): Promise<ErroConhecido> {
  const { data, error } = await supabase
    .from("erros_conhecidos")
    .update(campos)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return data as ErroConhecido;
}

export async function excluirErro(id: string): Promise<void> {
  const { error } = await supabase
    .from("erros_conhecidos")
    .delete()
    .eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}
