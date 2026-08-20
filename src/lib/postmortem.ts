/** Post-mortem de incidente — leitura por RPC, escrita direto na tabela. */

import { supabase, traduzirErro } from "@/lib/supabase";
import type { Json } from "@/types/database";
import type {
  AcaoCorretiva,
  EdicaoPostMortem,
  EventoPostMortem,
  PostMortem,
} from "@/types/dominio";

/** Mínimo que o banco exige na causa raiz para deixar publicar. */
export const MINIMO_CAUSA = 30;

/**
 * A RPC resolve o nome do responsável e os dados do chamado.
 *
 * Um `select` com join devolveria o nome nulo para quem não lê `perfis`, e
 * post-mortem publicado é visível a todo mundo — inclusive a quem só abre
 * chamado. O filtro por chamado vai no argumento; o por id vai como filtro do
 * PostgREST, que trata função de conjunto como se fosse tabela.
 */
export async function listarPostMortems(
  chamadoId?: string,
): Promise<PostMortem[]> {
  const { data, error } = await supabase.rpc("post_mortems_visiveis", {
    p_chamado: chamadoId ?? null,
  });

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []).map(normalizar);
}

export async function obterPostMortem(id: string): Promise<PostMortem | null> {
  const { data, error } = await supabase
    .rpc("post_mortems_visiveis", { p_chamado: null })
    .eq("id", id);

  if (error) throw new Error(traduzirErro(error.message));
  const linha = (data ?? [])[0];
  return linha ? normalizar(linha) : null;
}

/**
 * O `jsonb` chega como `unknown`: nada no banco garante a forma.
 *
 * Uma linha antiga com outro formato não pode derrubar a tela inteira, então o
 * que não encaixa é descartado em silêncio em vez de virar exceção.
 */
function normalizar(linha: unknown): PostMortem {
  const l = linha as PostMortem & {
    linha_do_tempo: unknown;
    acoes_corretivas: unknown;
  };
  return {
    ...l,
    linha_do_tempo: comoEventos(l.linha_do_tempo),
    acoes_corretivas: comoAcoes(l.acoes_corretivas),
  };
}

function comoEventos(bruto: unknown): EventoPostMortem[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((e): e is Record<string, unknown> => typeof e === "object" && !!e)
    .map((e) => ({
      quando: String(e["quando"] ?? ""),
      o_que: String(e["o_que"] ?? ""),
    }))
    .filter((e) => e.o_que !== "");
}

function comoAcoes(bruto: unknown): AcaoCorretiva[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((a): a is Record<string, unknown> => typeof a === "object" && !!a)
    .map((a) => ({
      o_que: String(a["o_que"] ?? ""),
      responsavel: String(a["responsavel"] ?? ""),
      prazo: typeof a["prazo"] === "string" ? a["prazo"] : null,
      feita: a["feita"] === true,
    }))
    .filter((a) => a.o_que !== "");
}

/**
 * O que impede a publicação, em texto para a pessoa.
 *
 * As duas regras são constraints do banco (`causa_obrigatoria_para_publicar` e
 * `acoes_obrigatorias_para_publicar`). Repeti-las aqui não é duplicar validação
 * por acaso: sem isso a pessoa clica em publicar e recebe um erro de constraint
 * do Postgres, que não diz o que fazer. O banco continua sendo a autoridade.
 */
export function pendenciasParaPublicar(pm: PostMortem): string[] {
  const faltas: string[] = [];
  if ((pm.causa_raiz ?? "").trim().length < MINIMO_CAUSA) {
    faltas.push(`causa raiz com ao menos ${MINIMO_CAUSA} caracteres`);
  }
  if (pm.acoes_corretivas.length === 0) {
    faltas.push("ao menos uma ação corretiva");
  }
  return faltas;
}

/** Quem pode escrever: o mesmo que a política `postmortem_escrita` permite. */
export function podeEditar(pm: PostMortem, meuId: string, gestor: boolean) {
  return gestor || pm.responsavel_id === meuId;
}

export interface NovoPostMortem {
  titulo: string;
  impacto: string;
  responsavel_id: string;
  prazo: string;
  chamado_id?: string | null;
  duracao_minutos?: number | null;
}

export async function criarPostMortem(dados: NovoPostMortem): Promise<string> {
  const { data, error } = await supabase
    .from("post_mortems")
    .insert({
      titulo: dados.titulo,
      impacto: dados.impacto,
      responsavel_id: dados.responsavel_id,
      prazo: dados.prazo,
      chamado_id: dados.chamado_id ?? null,
      duracao_minutos: dados.duracao_minutos ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return (data as { id: string }).id;
}

export async function salvarPostMortem(
  id: string,
  campos: EdicaoPostMortem,
): Promise<void> {
  // Só os dois campos `jsonb` precisam de conversão: os tipos gerados os
  // declaram como `Json`, que exige assinatura de índice, e as nossas formas
  // fixas não a têm. O resto passa direto.
  const { linha_do_tempo, acoes_corretivas, ...resto } = campos;
  const { error } = await supabase
    .from("post_mortems")
    .update({
      ...resto,
      ...(linha_do_tempo
        ? { linha_do_tempo: linha_do_tempo as unknown as Json }
        : {}),
      ...(acoes_corretivas
        ? { acoes_corretivas: acoes_corretivas as unknown as Json }
        : {}),
    })
    .eq("id", id);

  if (error) throw new Error(traduzirErro(error.message));
}

/** Duração em texto curto. Minuto solto não interessa num incidente longo. */
export function duracaoIncidente(minutos: number | null): string {
  if (minutos === null) return "—";
  if (minutos < 60) return `${minutos}min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
