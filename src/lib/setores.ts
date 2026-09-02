/** Setores da empresa. */

import { supabase, traduzirErro } from "@/lib/supabase";
import type {
  AbaConfiguravel,
  Equipe,
  Setor,
  SetorArvore,
} from "@/types/dominio";

/** Abas configuráveis por setor. */
export const ABAS_CONFIGURAVEIS: AbaConfiguravel[] = [
  { chave: "abrir", rotulo: "Abrir chamado", somenteTi: false },
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
  "abrir",
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

/**
 * Move um setor: troca de pai e/ou de posição entre os irmãos.
 *
 * As duas coisas num UPDATE só porque arrastar faz as duas de uma vez — soltar
 * dentro de outro setor troca o pai E define onde entrou na lista dele.
 *
 * Ciclo não é validado aqui: `fn_validar_setor` sobe a cadeia de pais no banco
 * e recusa "subordinado a si mesmo, nem a um dos próprios subsetores". A tela
 * evita oferecer o alvo inválido, mas a regra que vale é a de lá — e a
 * mensagem que chega ao toast vem dela.
 */
export async function moverSetor(
  id: string,
  paiId: string | null,
  ordem: number,
): Promise<void> {
  const { error } = await supabase
    .from("setores")
    .update({ setor_pai_id: paiId, ordem })
    .eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

/**
 * Renumera os irmãos de um pai, de 0 em diante.
 *
 * `ordem` é `int2` e a lista precisa continuar densa: sem isto, arrastar
 * repetidamente para a mesma posição empilharia valores iguais e a ordem
 * passaria a depender do desempate do banco, que não é estável.
 *
 * Um UPDATE por irmão em vez de um `upsert` em lote: `upsert` exigiria mandar
 * a linha inteira de cada setor (nome, slug, abas), e um campo esquecido no
 * caminho apagaria configuração de aba. Aqui só a `ordem` viaja.
 */
export async function renumerarIrmaos(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id, indice) =>
      supabase.from("setores").update({ ordem: indice }).eq("id", id),
    ),
  );
}

/* Equipes dentro do setor */

/** Equipes com o setor a que pertencem. `setor_id` nulo = fora da árvore. */
export async function listarEquipesDaArvore(): Promise<Equipe[]> {
  const { data, error } = await supabase
    .from("equipes")
    .select("id, nome, nivel, gestor_id, email_grupo, setor_id")
    .eq("ativa", true)
    .order("nome");

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as Equipe[];
}

/**
 * Cria uma equipe dentro de um setor.
 *
 * `nivel` é o escalonamento de atendimento (1 a 3), não a profundidade na
 * árvore: uma equipe de nível 2 dentro da Tecnologia continua sendo N2 se
 * alguém a arrastar para outro setor. São eixos diferentes e é fácil confundir
 * — daí o padrão 1, que é onde a maior parte das filas começa.
 */
export async function criarEquipe(entrada: {
  nome: string;
  setor_id: string;
  nivel?: 1 | 2 | 3;
}): Promise<Equipe> {
  const nome = entrada.nome.trim();
  if (nome.length < 2) {
    throw new Error("O nome da equipe precisa de ao menos 2 caracteres.");
  }

  const { data, error } = await supabase
    .from("equipes")
    .insert({
      nome,
      setor_id: entrada.setor_id,
      nivel: entrada.nivel ?? 1,
    })
    .select("id, nome, nivel, gestor_id, email_grupo, setor_id")
    .single();

  if (error) {
    if (error.message.includes("duplicate key")) {
      throw new Error(`Já existe uma equipe chamada "${nome}".`);
    }
    throw new Error(traduzirErro(error.message));
  }
  return data as Equipe;
}

/**
 * Põe ou tira uma pessoa da equipe.
 *
 * NÃO existe "criar colaborador" aqui, e não é omissão: `perfis.id` referencia
 * `auth.users(id)`, então perfil não existe sem conta de autenticação. Criar
 * pessoa exigiria a Admin API do Supabase, que precisa da chave `service_role`
 * — e essa chave não pode viver no navegador, onde qualquer um a lê no F12.
 * O caminho para alguém novo entrar é o autocadastro da tela de acesso, ou uma
 * Edge Function de convite (que é trabalho de servidor, ainda não escrito).
 *
 * Quem pode fazer o quê é decidido por `pode_gerir_perfil` no banco, e o corte
 * dele é justamente o que esta tela precisa: coordenador mexe em qualquer
 * nível, gestor mexe SÓ em quem é `colaborador`, e ninguém mexe em si mesmo.
 */
export async function definirEquipeDaPessoa(
  perfilId: string,
  equipeId: string | null,
): Promise<void> {
  const { error, count } = await supabase
    .from("perfis")
    .update({ equipe_id: equipeId }, { count: "exact" })
    .eq("id", perfilId);

  if (error) throw new Error(traduzirErro(error.message));
  // A policy não levanta erro: ela simplesmente não deixa a linha ser vista
  // pelo UPDATE. Zero linhas afetadas é a resposta de "sem permissão".
  if (count === 0) {
    throw new Error(
      "Você não pode alterar esta pessoa. Gestor altera apenas colaboradores; ninguém altera a si mesmo.",
    );
  }
}

/** O mínimo para desenhar gente na árvore: quem é, de quem depende, onde está. */
export interface PessoaNaArvore {
  id: string;
  nome_completo: string;
  cargo: string | null;
  hierarquia: "coordenador" | "gestor" | "colaborador";
  gestor_direto_id: string | null;
  equipe_id: string | null;
}

/**
 * Pessoas para a árvore.
 *
 * Vem de `perfis` direto, e não da RPC `diretorio()`, porque aquela devolve
 * `equipe_nome` e não `equipe_id` — e é pelo id que a pessoa é encaixada
 * embaixo da equipe. As colunas pedidas são só as que a caixa mostra: cargo e
 * hierarquia para o rótulo, `gestor_direto_id` para o aninhamento.
 *
 * Quem aparece é decidido pela policy `perfis_leitura`, não por esta função —
 * então quando a regra de visibilidade por hierarquia entrar, a árvore estreita
 * sozinha, sem tocar aqui.
 */
export async function listarPessoasDaArvore(): Promise<PessoaNaArvore[]> {
  const { data, error } = await supabase
    .from("perfis")
    .select("id, nome_completo, cargo, hierarquia, gestor_direto_id, equipe_id")
    .eq("ativo", true)
    .order("nome_completo");

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as PessoaNaArvore[];
}

/**
 * Define de quem a pessoa depende.
 *
 * É o que o arrastar pessoa-sobre-pessoa grava. A trava é a mesma de
 * `definirEquipeDaPessoa`: `pode_gerir_perfil` no banco, que devolve zero
 * linhas em vez de erro quando não deixa.
 */
export async function definirGestorDireto(
  perfilId: string,
  gestorId: string | null,
): Promise<void> {
  const { error, count } = await supabase
    .from("perfis")
    .update({ gestor_direto_id: gestorId }, { count: "exact" })
    .eq("id", perfilId);

  if (error) throw new Error(traduzirErro(error.message));
  if (count === 0) {
    throw new Error(
      "Você não pode alterar esta pessoa. Gestor altera apenas colaboradores; ninguém altera a si mesmo.",
    );
  }
}

/** Pessoas lotadas numa equipe. */
export async function pessoasDaEquipe(
  equipeId: string,
): Promise<Array<{ id: string; nome_completo: string; cargo: string | null }>> {
  const { data, error } = await supabase
    .from("perfis")
    .select("id, nome_completo, cargo")
    .eq("equipe_id", equipeId)
    .eq("ativo", true)
    .order("nome_completo");

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as Array<{
    id: string;
    nome_completo: string;
    cargo: string | null;
  }>;
}

/** O que impede — ou não — apagar uma equipe. */
export interface VinculosDaEquipe {
  pessoas: number;
  chamados: number;
  demandas: number;
  servicos: number;
  rotinas: number;
  /** Mensagens no canal da equipe. Estas somem em cascata, sem volta. */
  mensagens: number;
  /** Nenhum vínculo que o banco bloqueie: dá para apagar. */
  podeApagar: boolean;
}

/**
 * Conta o que aponta para a equipe, antes de oferecer apagar.
 *
 * Existe para o diálogo poder dizer o que exatamente impede, em vez de deixar
 * o clique falhar com um erro de chave estrangeira que ninguém traduz. As
 * cinco primeiras contagens BLOQUEIAM (as FKs são `no action`); mensagens não
 * bloqueiam — elas somem em cascata, e é justo por isso que precisam ser
 * contadas e ditas.
 */
export async function contarVinculosDaEquipe(
  id: string,
): Promise<VinculosDaEquipe> {
  const contar = async (
    tabela: "perfis" | "chamados" | "demandas" | "catalogo_servicos" | "rotinas",
    coluna: string,
  ): Promise<number> => {
    const { count, error } = await supabase
      .from(tabela)
      .select("id", { count: "exact", head: true })
      .eq(coluna, id);
    if (error) throw new Error(traduzirErro(error.message));
    return count ?? 0;
  };

  const [pessoas, chamados, demandas, servicos, rotinas] = await Promise.all([
    contar("perfis", "equipe_id"),
    contar("chamados", "equipe_id"),
    contar("demandas", "equipe_id"),
    contar("catalogo_servicos", "equipe_padrao_id"),
    contar("rotinas", "equipe_id"),
  ]);

  // Mensagens do canal da equipe, por caminho indireto: `mensagens` não tem
  // `equipe_id`; ela pende de `canais`, que é quem pende da equipe.
  const { data: canais, error: erroCanais } = await supabase
    .from("canais")
    .select("id")
    .eq("equipe_id", id);
  if (erroCanais) throw new Error(traduzirErro(erroCanais.message));

  let mensagens = 0;
  if (canais && canais.length > 0) {
    const { count, error } = await supabase
      .from("mensagens")
      .select("id", { count: "exact", head: true })
      .in(
        "canal_id",
        canais.map((c) => (c as { id: string }).id),
      );
    if (error) throw new Error(traduzirErro(error.message));
    mensagens = count ?? 0;
  }

  return {
    pessoas,
    chamados,
    demandas,
    servicos,
    rotinas,
    mensagens,
    podeApagar:
      pessoas + chamados + demandas + servicos + rotinas === 0,
  };
}

/**
 * Apaga a equipe de verdade — e existe porque desativar não bastava.
 *
 * `equipes_nome_key` é `UNIQUE (nome)` GLOBAL: ignora `ativa`. Ou seja, equipe
 * desativada continua ocupando o nome, e criar outra com o mesmo nome falha
 * por chave duplicada. Só desativar transformava cada erro de digitação num
 * nome queimado para sempre.
 *
 * O que o banco protege sozinho: `perfis`, `chamados`, `demandas`,
 * `catalogo_servicos` e `rotinas` apontam com `no action` — equipe em uso não
 * é apagável, e nem deve ser.
 *
 * O que ele NÃO protege, e por isso `contarVinculosDaEquipe` conta antes:
 * `canais` apaga em cascata, e `mensagens` em cascata a partir dele. Apagar
 * equipe com conversa leva o histórico. Para essa, o caminho é desativar.
 */
export async function excluirEquipe(id: string): Promise<void> {
  const { error, count } = await supabase
    .from("equipes")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    if (error.message.includes("violates foreign key")) {
      throw new Error(
        "Esta equipe ainda tem pessoas, chamados, demandas, serviços de catálogo ou rotinas vinculados. Desative-a em vez de excluir.",
      );
    }
    throw new Error(traduzirErro(error.message));
  }
  if (count === 0) {
    throw new Error("Apenas a gestão pode excluir equipes.");
  }
}

/**
 * Liga e desliga a equipe — o caminho de quem está EM USO.
 *
 * Desativar tira a fila de operação (ela sai do formulário de abertura e dos
 * seletores) e preserva tudo: pessoas, chamados, serviços e o canal com as
 * mensagens. É o que fazer com equipe que tem história.
 *
 * O que NÃO fazer é usar isto como se fosse exclusão. Foi o erro da primeira
 * versão desta tela: como `equipes_nome_key` é `UNIQUE (nome)` global e ignora
 * `ativa`, cada desativada seguia ocupando o nome, e o nome não voltava nunca.
 * Equipe vazia criada por engano deve ser APAGADA (ver `excluirEquipe`), para
 * o nome ficar livre de novo.
 */
export async function alternarEquipe(
  id: string,
  ativa: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("equipes")
    .update({ ativa })
    .eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
}

/** Move a equipe para outro setor. `null` a devolve ao grupo "sem setor". */
export async function moverEquipe(
  id: string,
  setorId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("equipes")
    .update({ setor_id: setorId })
    .eq("id", id);
  if (error) throw new Error(traduzirErro(error.message));
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
