/** Camada de dados: sessão, pessoas, catálogo e chamados. */

import { descarregarAgora } from "@/lib/observabilidade-fila";
import { limiteFinal } from "@/lib/periodo";
import { supabase, traduzirErro } from "@/lib/supabase";
import type {
  AlteracaoPerfil,
  Chamado,
  ChamadoEnriquecido,
  DadosCadastro,
  Equipe,
  Interacao,
  Perfil,
  PessoaDiretorio,
  PessoaMencao,
  Prioridade,
  RascunhoChamado,
  SchemaFormulario,
  ServicoCatalogo,
  StatusChamado,
  TagCatalogo,
  TagSugerida,
  SetorOpcao,
} from "@/types/dominio";

/* Sessão */

/**
 * O que a sessão é agora.
 *
 * Antes tudo isto virava `null`, e `null` mandava para a tela de acesso:
 * falha de rede ao buscar o perfil derrubava quem estava logado, e conta sem
 * perfil sumia sem explicação. São situações diferentes e pedem telas
 * diferentes.
 */
export type EstadoSessao =
  | { tipo: "anonimo" }
  | { tipo: "autenticado"; perfil: Perfil }
  | { tipo: "sem_perfil"; email: string }
  | { tipo: "indisponivel"; motivo: string };

/**
 * `getSession` lê do armazenamento local; `getUser` bate na rede.
 *
 * No arranque quem responde é o local: um segundo de rede ruim não pode
 * significar "você não está logado". A validação do token continua
 * acontecendo — o cliente renova sozinho, e um token de fato inválido cai no
 * `onAuthStateChange`.
 */
export async function obterSessao(): Promise<EstadoSessao> {
  const { data: sessao, error: erroSessao } = await supabase.auth.getSession();

  if (erroSessao) {
    return {
      tipo: "indisponivel",
      motivo: traduzirErroAuth(erroSessao.message),
    };
  }
  const usuario = sessao.session?.user;
  if (!usuario) return { tipo: "anonimo" };

  // Uma chamada só, sem parâmetro e sem `select *`. O id sai do próprio
  // token, então não viaja na URL, e a resposta não carrega e-mail, telefone,
  // data de nascimento nem matrícula — nada disso é usado por nenhuma tela.
  const { data: linhas, error } = await supabase.rpc("meu_perfil");
  const perfil = (linhas ?? [])[0] ?? null;

  if (error) {
    return {
      tipo: "indisponivel",
      motivo: traduzirErro(error.message),
    };
  }
  if (!perfil) {
    // Perfil apagado à mão no painel do Supabase não apaga a conta em
    // `auth.users`: ela continua entrando e caía numa tela que não a
    // reconhecia. O banco refaz a linha a partir dos metadados do cadastro.
    const { data: refeito } = await supabase.rpc("garantir_perfil");
    if (refeito === true) return obterSessao();

    return { tipo: "sem_perfil", email: usuario.email ?? "" };
  }

  return { tipo: "autenticado", perfil: perfil as Perfil };
}

/** Avisa quando a sessão entra ou sai — inclusive por outra aba do navegador. */
/**
 * Avisa quando a sessão muda — inclusive de identidade.
 *
 * O Supabase guarda a sessão em `localStorage`, compartilhado entre as abas.
 * Entrar com outra conta numa aba troca o token de todas: a que ficou aberta
 * segue com o perfil antigo em memória e passa a assinar requisições com o id
 * de outra pessoa. A RLS recusa, e a tela dizia \"você não tem permissão\" sem
 * explicar que o dono da sessão havia mudado.
 *
 * Por isso o ouvinte recebe o id de quem está na sessão, e não apenas se há
 * sessão: cabe a quem escuta comparar com o perfil que tem em mãos.
 */
export function aoMudarSessao(
  ouvinte: (idNaSessao: string | null) => void,
): void {
  supabase.auth.onAuthStateChange((evento, sessao) => {
    if (evento === "SIGNED_OUT") return ouvinte(null);
    if (
      evento === "SIGNED_IN" ||
      evento === "TOKEN_REFRESHED" ||
      evento === "USER_UPDATED"
    ) {
      ouvinte(sessao?.user.id ?? null);
    }
  });
}

/** Compatibilidade: devolve o perfil e descarta o motivo da ausência. */
export async function sessaoAtual(): Promise<Perfil | null> {
  const estado = await obterSessao();
  return estado.tipo === "autenticado" ? estado.perfil : null;
}

/** A aba está visível para este perfil? Só responde por visibilidade. */
export function abaVisivel(perfil: Perfil, chave: string): boolean {
  if (perfil.papel === "admin") return true;
  if (perfil.abas === null) return true;
  return perfil.abas.includes(chave);
}

export async function entrar(email: string, senha: string): Promise<Perfil> {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) throw new Error(traduzirErroAuth(error.message));

  const perfil = await sessaoAtual();
  if (!perfil) {
    throw new Error(
      "Login aceito, mas não há perfil vinculado a esta conta. Fale com o coordenador da Central Green.",
    );
  }
  if (!perfil.ativo) {
    await supabase.auth.signOut();
    throw new Error("Esta conta está desativada. Fale com o coordenador.");
  }
  return perfil;
}

/** Autocadastro. */
export async function cadastrar(dados: DadosCadastro): Promise<{
  perfil: Perfil | null;
  precisaConfirmarEmail: boolean;
}> {
  const { data, error } = await supabase.auth.signUp({
    email: dados.email,
    password: dados.senha,
    options: {
      data: {
        nome_completo: dados.nome_completo,
        cargo: dados.cargo,
        departamento: dados.departamento,
        telefone: dados.telefone,
        // O gatilho valida e ignora id inexistente: setor errado não pode
        // derrubar o cadastro inteiro.
        setor_id: dados.setor_id,
      },
    },
  });

  if (error) throw new Error(traduzirErroAuth(error.message));

  if (!data.session) {
    return { perfil: null, precisaConfirmarEmail: true };
  }

  return { perfil: await sessaoAtual(), precisaConfirmarEmail: false };
}

export async function sair(): Promise<void> {
  // Antes de derrubar a sessão, não depois: o lote pendente só é aceito pelo
  // RLS enquanto o token de quem o gerou ainda vale. O evento do próprio
  // `logout` fica de fora — ele é capturado durante a chamada abaixo e o
  // descarte da troca de sessão o alcança primeiro.
  await descarregarAgora();
  await supabase.auth.signOut();
}

/** Reenvia o e-mail de confirmação. */
export async function reenviarConfirmacao(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) throw new Error(traduzirErroAuth(error.message));
}

/**
 * Pede o link de recuperação.
 *
 * A senha não é recuperável: o banco guarda um hash bcrypt, que não tem
 * volta. O que se recupera é o **acesso** — o Supabase manda um token de uso
 * único por e-mail, e quem prova ter a caixa postal define uma senha nova.
 */
export async function pedirRecuperacao(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    // Parâmetro de consulta, nunca fragmento. O Supabase acrescenta o token no
    // fragmento (`#access_token=...`); um `#` já no destino faria os dois
    // colidirem num só, e o cliente não encontraria o token para abrir a
    // sessão de recuperação.
    redirectTo: location.origin + "/?recuperacao=1",
  });
  if (error) throw new Error(traduzirErroAuth(error.message));
}

/** Define a senha nova, já dentro da sessão que o token abriu. */
export async function definirSenha(senha: string): Promise<void> {
  if (senha.length < 8) {
    throw new Error("A senha precisa de ao menos 8 caracteres.");
  }
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) throw new Error(traduzirErroAuth(error.message));
}

/**
 * A sessão veio de um link de recuperação?
 *
 * Enquanto for o caso, a pessoa está autenticada mas só deveria poder trocar
 * a senha — deixar entrar com um token de recuperação pularia a senha inteira.
 */
export function aoEntrarPorRecuperacao(ouvinte: () => void): void {
  supabase.auth.onAuthStateChange((evento) => {
    if (evento === "PASSWORD_RECOVERY") ouvinte();
  });
}

/**
 * O sistema ainda não tem nenhuma conta? A primeira pessoa a se cadastrar
 * vira coordenador e administrador — sem isso, ninguém teria poder de
 */
export async function sistemaVazio(): Promise<boolean> {
  const { data, error } = await supabase.rpc("sistema_vazio");
  if (error) return false;
  return data === true;
}

function traduzirErroAuth(mensagem: string): string {
  if (mensagem.includes("Invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (mensagem.includes("Email not confirmed")) {
    return "Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.";
  }
  if (mensagem.includes("User already registered")) {
    return "Já existe uma conta com este e-mail. Use “Entrar” ou recupere a senha.";
  }
  if (mensagem.includes("Password should be")) {
    return "A senha precisa de ao menos 6 caracteres.";
  }
  if (mensagem.includes("valid email")) {
    return "Informe um e-mail válido.";
  }
  // Dois limites diferentes, com esperas diferentes. Dizer "aguarde um
  // minuto" no de e-mail faz a pessoa tentar de novo e falhar igual — o teto
  // é por hora, e vale para o projeto todo, não para ela.
  if (mensagem.includes("email rate limit")) {
    return "O envio de e-mails atingiu o limite da hora — e o limite é do sistema, não seu. Peça a um coordenador para disparar a redefinição pelo painel, ou tente novamente na próxima hora.";
  }
  if (
    mensagem.includes("rate limit") ||
    mensagem.includes("For security purposes")
  ) {
    return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  }
  return mensagem;
}

export function ehAgente(perfil: Perfil): boolean {
  return perfil.papel !== "solicitante";
}

/** Coordenador e gestor gerem pessoas; admin também, por definição. */
export function podeGerirPessoas(perfil: Perfil): boolean {
  return (
    perfil.papel === "admin" ||
    perfil.hierarquia === "coordenador" ||
    perfil.hierarquia === "gestor"
  );
}

/* Pessoas */

/**
 * Diretório completo. Restrito à equipe de TI no banco: para solicitante a
 * RPC devolve zero linhas, e a tela cai no estado vazio em vez de errar.
 */
export async function listarDiretorio(): Promise<PessoaDiretorio[]> {
  const { data, error } = await supabase.rpc("diretorio");

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as PessoaDiretorio[];
}

/**
 * Id e nome de quem está ativo — só o que @menção precisa.
 *
 * É esta que as telas de solicitante usam (chat, comentário de demanda).
 * Não troque por `listarDiretorio` para "já ter os outros campos": era
 * exatamente assim que o organograma inteiro vazava para qualquer sessão
 * autenticada.
 */
export async function listarDiretorioMencoes(): Promise<PessoaMencao[]> {
  const { data, error } = await supabase.rpc("diretorio_mencoes");

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as PessoaMencao[];
}

/** Altera o perfil de outra pessoa. */
export async function alterarPerfil(
  perfilId: string,
  campos: AlteracaoPerfil,
): Promise<void> {
  const { error } = await supabase
    .from("perfis")
    .update(campos)
    .eq("id", perfilId);

  if (error) throw new Error(traduzirErro(error.message));
}

/**
 * Dados que a própria pessoa edita — nunca papel, hierarquia ou senioridade.
 */
export async function atualizarMeuPerfil(
  perfilId: string,
  campos: Partial<
    Pick<
      Perfil,
      | "nome_completo"
      | "cargo"
      | "telefone"
      | "ramal"
      | "departamento"
      | "unidade"
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("perfis")
    .update(campos)
    .eq("id", perfilId);

  if (error) throw new Error(traduzirErro(error.message));
}

export async function listarEquipes(): Promise<Equipe[]> {
  const { data, error } = await supabase
    .from("equipes")
    .select("id, nome, nivel, gestor_id, email_grupo")
    .eq("ativa", true)
    .order("nome");

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as Equipe[];
}

/* Catálogo de serviços */

// Cache de módulo: as páginas consultam de forma síncrona enquanto desenham
// o formulário.
let CATALOGO: ServicoCatalogo[] = [];

export async function carregarCatalogo(): Promise<void> {
  const { data, error } = await supabase
    .from("catalogo_servicos")
    .select("*, equipes:equipe_padrao_id(nome), sla_politicas(prioridade)")
    .eq("ativo", true)
    .order("categoria");

  if (error) throw new Error(`Falha ao carregar o catálogo: ${error.message}`);

  CATALOGO = (data ?? []).map((linha) => {
    const r = linha as unknown as {
      id: string;
      codigo: string;
      nome: string;
      descricao: string;
      tipo: ServicoCatalogo["tipo"];
      categoria: string;
      subcategoria: string;
      impacto_padrao: ServicoCatalogo["impacto_padrao"];
      urgencia_padrao: ServicoCatalogo["urgencia_padrao"];
      exige_ativo: boolean;
      artigo_kb_codigo: string | null;
      visivel_portal: boolean;
      schema_formulario: SchemaFormulario;
      equipes: { nome: string } | null;
      sla_politicas: { prioridade: Prioridade } | null;
    };

    return {
      id: r.id,
      codigo: r.codigo,
      nome: r.nome,
      descricao: r.descricao,
      tipo: r.tipo,
      categoria: r.categoria,
      subcategoria: r.subcategoria,
      equipe_padrao: r.equipes?.nome ?? "Service Desk",
      sla_politica: r.sla_politicas?.prioridade ?? "P4",
      impacto_padrao: r.impacto_padrao,
      urgencia_padrao: r.urgencia_padrao,
      exige_ativo: r.exige_ativo,
      artigo_kb: r.artigo_kb_codigo,
      visivel_portal: r.visivel_portal,
      schema_formulario: r.schema_formulario ?? { campos: [] },
    };
  });

  // As tags vêm na mesma carga: a cor é lida durante o desenho das listas.
  await carregarTagsCatalogo();
}

export function catalogoCarregado(): boolean {
  return CATALOGO.length > 0;
}

export function listarServicos(): ServicoCatalogo[] {
  return CATALOGO.filter((s) => s.visivel_portal);
}

export function obterServico(id: string): ServicoCatalogo | undefined {
  return CATALOGO.find((s) => s.id === id);
}

// Mesmo motivo do catálogo de serviços: a cor da tag é consultada durante o
// desenho de cada linha de lista, onde não cabe um await.
let TAGS_CATALOGO: TagCatalogo[] = [];

export async function carregarTagsCatalogo(): Promise<void> {
  const { data, error } = await supabase
    .from("tags_catalogo")
    .select("tag, rotulo, cor, descricao, ordem, ativo")
    .eq("ativo", true)
    .order("ordem");

  // Tag colorida é conforto, não requisito: falhar aqui não pode impedir a
  // abertura de chamado.
  if (error) return;
  TAGS_CATALOGO = (data ?? []) as TagCatalogo[];
}

export function listarTagsCatalogo(): TagCatalogo[] {
  return TAGS_CATALOGO;
}

const PALETA_TAG: TagCatalogo["cor"][] = [
  "verde",
  "ambar",
  "vermelho",
  "azul",
  "roxo",
  "ciano",
  "rosa",
  "cinza",
];

/** Cor de uma tag qualquer. */
export function corDaTag(tag: string): TagCatalogo["cor"] {
  const doCatalogo = TAGS_CATALOGO.find((t) => t.tag === tag)?.cor;
  if (doCatalogo) return doCatalogo;

  let h = 0x811c9dc5;
  for (let i = 0; i < tag.length; i += 1) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return PALETA_TAG[(h >>> 0) % PALETA_TAG.length] as TagCatalogo["cor"];
}

export function agruparServicosPorCategoria(): Map<string, ServicoCatalogo[]> {
  const mapa = new Map<string, ServicoCatalogo[]>();
  for (const servico of listarServicos()) {
    const lista = mapa.get(servico.categoria);
    if (lista) lista.push(servico);
    else mapa.set(servico.categoria, [servico]);
  }
  return mapa;
}

/* Chamados */

/**
 * Detalhe: a ficha usa quase tudo, então aqui `*` se justifica.
 */
const SELECAO_CHAMADO =
  "*, catalogo_servicos(nome), equipes(nome), " +
  "solicitante:perfis!chamados_solicitante_id_fkey(nome_completo, hierarquia), " +
  "responsavel:perfis!chamados_responsavel_id_fkey(nome_completo, hierarquia), " +
  "excluidor:perfis!chamados_excluido_por_fkey(nome_completo)";

/**
 * Lista: a tabela mostra número, título, prioridade, status e prazo. Descrição,
 * causa raiz, solução aplicada e `campos_extras` — que guardam o conteúdo do
 * formulário, às vezes com dado pessoal de terceiro — não aparecem em lista e
 * não precisam sair do banco para montá-la.
 */
const SELECAO_LISTA =
  "id, numero, tipo, titulo, servico_id, solicitante_id, responsavel_id, " +
  "equipe_id, impacto, urgencia, prioridade, status, canal, aberto_em, " +
  "primeira_resposta_em, resolvido_em, fechado_em, prazo_resposta, " +
  "prazo_solucao, minutos_pausados, pausado_desde, sla_resposta_ok, " +
  "sla_solucao_ok, reaberturas, tags, excluido_em, excluido_por, " +
  "motivo_exclusao, categoria_encerramento, csat_nota, atualizado_em, " +
  "setor_id, erro_conhecido_id, " +
  "catalogo_servicos(nome), equipes(nome), " +
  "solicitante:perfis!chamados_solicitante_id_fkey(nome_completo, hierarquia), " +
  "responsavel:perfis!chamados_responsavel_id_fkey(nome_completo, hierarquia), " +
  "excluidor:perfis!chamados_excluido_por_fkey(nome_completo)";

interface LinhaChamado extends Chamado {
  catalogo_servicos: { nome: string } | null;
  equipes: { nome: string } | null;
  solicitante: {
    nome_completo: string;
    hierarquia: Perfil["hierarquia"];
  } | null;
  responsavel: {
    nome_completo: string;
    hierarquia: Perfil["hierarquia"];
  } | null;
  excluidor: { nome_completo: string } | null;
}

function enriquecer(linha: unknown): ChamadoEnriquecido {
  const l = linha as LinhaChamado;
  return {
    ...l,
    servico_nome: l.catalogo_servicos?.nome ?? "Serviço não catalogado",
    solicitante_nome: l.solicitante?.nome_completo ?? "Desconhecido",
    solicitante_hierarquia: l.solicitante?.hierarquia ?? "colaborador",
    responsavel_nome: l.responsavel?.nome_completo ?? null,
    responsavel_hierarquia: l.responsavel?.hierarquia ?? null,
    equipe_nome: l.equipes?.nome ?? null,
    excluido_por_nome: l.excluidor?.nome_completo ?? null,
  };
}

export interface FiltroChamados {
  apenasAbertos?: boolean;
  prioridade?: Prioridade | null;
  texto?: string;
  doSolicitante?: string;
  tag?: string | null;
  /** Recorte por data de abertura, ISO `YYYY-MM-DD` inclusivo. */
  de?: string | null;
  ate?: string | null;
  /** Lixeira: mostra apenas os excluídos logicamente. */
  excluidos?: boolean;
}

/** Vocabulário de tags já em uso, com a contagem. */
export async function listarTagsSugeridas(): Promise<TagSugerida[]> {
  const { data, error } = await supabase.rpc("tags_sugeridas", {
    p_limite: 40,
  });
  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []) as TagSugerida[];
}

export async function listarChamados(
  filtro: FiltroChamados = {},
): Promise<ChamadoEnriquecido[]> {
  let consulta = supabase
    .from("chamados")
    .select(SELECAO_LISTA)
    .order("aberto_em", { ascending: false })
    .limit(500);

  // Por padrão o excluído não aparece — é essa a razão de ele existir.
  consulta = filtro.excluidos
    ? consulta.not("excluido_em", "is", null)
    : consulta.is("excluido_em", null);

  if (filtro.apenasAbertos) {
    consulta = consulta.not("status", "in", "(fechado,cancelado)");
  }
  // No banco, e não no cliente: a consulta tem teto de 500 linhas, e filtrar
  // depois faria o recorte mentir sobre o que ficou de fora.
  if (filtro.de) consulta = consulta.gte("aberto_em", filtro.de);
  if (filtro.ate) consulta = consulta.lte("aberto_em", limiteFinal(filtro.ate));
  if (filtro.prioridade) {
    consulta = consulta.eq("prioridade", filtro.prioridade);
  }
  if (filtro.doSolicitante) {
    consulta = consulta.eq("solicitante_id", filtro.doSolicitante);
  }
  // `contains` sobre o array usa o índice GIN de tags.
  if (filtro.tag) {
    consulta = consulta.contains("tags", [filtro.tag]);
  }

  const { data, error } = await consulta;
  if (error) throw new Error(traduzirErro(error.message));

  return (data ?? [])
    .map(enriquecer)
    .filter((c) => {
      if (!filtro.texto) return true;
      const alvo = filtro.texto.toLowerCase();
      return (
        c.titulo.toLowerCase().includes(alvo) ||
        (c.numero ?? "").toLowerCase().includes(alvo) ||
        c.solicitante_nome.toLowerCase().includes(alvo)
      );
    })
    .sort((a, b) => {
      const ordem: Prioridade[] = ["P1", "P2", "P3", "P4"];
      const dif = ordem.indexOf(a.prioridade) - ordem.indexOf(b.prioridade);
      if (dif !== 0) return dif;
      return (
        new Date(a.prazo_solucao ?? a.aberto_em).getTime() -
        new Date(b.prazo_solucao ?? b.aberto_em).getTime()
      );
    });
}

export async function obterChamado(
  numero: string,
): Promise<ChamadoEnriquecido | null> {
  const { data, error } = await supabase
    .from("chamados")
    .select(SELECAO_CHAMADO)
    .eq("numero", numero)
    .maybeSingle();

  if (error) throw new Error(traduzirErro(error.message));
  return data ? enriquecer(data) : null;
}

export async function criarChamado(
  rascunho: RascunhoChamado,
  autor: Perfil,
  impacto: Chamado["impacto"],
  urgencia: Chamado["urgencia"],
): Promise<ChamadoEnriquecido> {
  const servico = rascunho.servico_id
    ? obterServico(rascunho.servico_id)
    : null;
  if (!servico) throw new Error("Selecione um serviço do catálogo.");

  const camposExtras: Record<string, unknown> = {
    ...rascunho.campos_extras,
    ...(rascunho.mensagem_erro
      ? { mensagem_erro: rascunho.mensagem_erro }
      : {}),
    ...(rascunho.frequencia ? { frequencia: rascunho.frequencia } : {}),
    ...(rascunho.contorno_aplicado
      ? { contorno_aplicado: rascunho.contorno_aplicado }
      : {}),
    ...(rascunho.primeira_ocorrencia
      ? { primeira_ocorrencia: rascunho.primeira_ocorrencia }
      : {}),
    ...(rascunho.observacoes.trim()
      ? { observacoes: rascunho.observacoes.trim() }
      : {}),
    local: rascunho.local,
  };

  // Número, fila, prazos e prioridade são resolvidos pelos triggers da F4.
  const { data, error } = await supabase
    .from("chamados")
    .insert({
      titulo: rascunho.titulo.trim(),
      descricao: rascunho.descricao.trim(),
      servico_id: servico.id,
      solicitante_id: autor.id,
      impacto,
      urgencia,
      canal: "portal",
      tags: rascunho.tags,
      campos_extras: camposExtras as never,
    })
    .select(SELECAO_CHAMADO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecer(data);
}

/* Interações */

// Dica explícita mesmo com uma só chave para `perfis`: assim acrescentar
// uma segunda no futuro não quebra a consulta.
const SELECAO_INTERACAO =
  "*, autor:perfis!chamado_interacoes_autor_id_fkey(nome_completo, hierarquia)";

function enriquecerInteracao(linha: unknown): Interacao {
  const l = linha as Interacao & {
    autor: { nome_completo: string; hierarquia: Perfil["hierarquia"] } | null;
  };
  return {
    ...l,
    autor_nome: l.autor?.nome_completo ?? "Desconhecido",
    autor_hierarquia: l.autor?.hierarquia ?? "colaborador",
  };
}

export async function listarInteracoes(
  chamadoId: string,
): Promise<Interacao[]> {
  const { data, error } = await supabase
    .from("chamado_interacoes")
    .select(SELECAO_INTERACAO)
    .eq("chamado_id", chamadoId)
    .order("criado_em", { ascending: true });

  if (error) throw new Error(traduzirErro(error.message));
  return (data ?? []).map(enriquecerInteracao);
}

export async function registrarInteracao(
  chamadoId: string,
  entrada: Pick<Interacao, "tipo" | "corpo"> & { mencionados?: string[] },
  autor: Pick<Perfil, "id">,
): Promise<Interacao> {
  const { data, error } = await supabase
    .from("chamado_interacoes")
    .insert({
      chamado_id: chamadoId,
      autor_id: autor.id,
      tipo: entrada.tipo,
      corpo: entrada.corpo,
      mencionados: entrada.mencionados ?? [],
    })
    .select(SELECAO_INTERACAO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecerInteracao(data);
}

/* Transições de status do chamado */

export async function mudarStatus(
  chamadoId: string,
  novoStatus: StatusChamado,
  extras: { causa_raiz?: string; solucao_aplicada?: string } = {},
): Promise<ChamadoEnriquecido> {
  const encerrando = novoStatus === "resolvido" || novoStatus === "fechado";

  if (
    encerrando &&
    (!extras.causa_raiz ||
      extras.causa_raiz.trim().length < 20 ||
      !extras.solucao_aplicada ||
      extras.solucao_aplicada.trim().length < 20)
  ) {
    throw new Error(
      "Para resolver o chamado é obrigatório informar causa raiz e solução aplicada, com ao menos 20 caracteres cada.",
    );
  }

  const { data, error } = await supabase
    .from("chamados")
    .update({
      status: novoStatus,
      ...(encerrando
        ? {
            causa_raiz: extras.causa_raiz ?? null,
            solucao_aplicada: extras.solucao_aplicada ?? null,
            categoria_encerramento: "resolvido" as const,
          }
        : {}),
    })
    .eq("id", chamadoId)
    .select(SELECAO_CHAMADO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecer(data);
}

/** Corrige as tags de um chamado já aberto. */
export async function atualizarTags(
  chamadoId: string,
  tags: string[],
): Promise<void> {
  const { error } = await supabase
    .from("chamados")
    .update({ tags })
    .eq("id", chamadoId);
  if (error) throw new Error(traduzirErro(error.message));
}

/** Assume o chamado para si. */
export async function assumirChamado(
  chamadoId: string,
  perfil: Perfil,
): Promise<ChamadoEnriquecido> {
  const { data, error } = await supabase
    .from("chamados")
    .update({ responsavel_id: perfil.id, status: "atribuido" })
    .eq("id", chamadoId)
    .select(SELECAO_CHAMADO)
    .single();

  if (error) throw new Error(traduzirErro(error.message));
  return enriquecer(data);
}

/**
 * Exclusão lógica do chamado.
 *
 * O registro sai das listas e continua no banco: chamado carrega prazo de
 * SLA, eventos e interações, e apagar a linha reescreveria o indicador do mês
 * depois de ele já ter sido lido.
 */
export async function excluirChamado(
  chamadoId: string,
  motivo: string,
): Promise<void> {
  const texto = motivo.trim();
  if (texto.length < 5) {
    throw new Error(
      "Informe o motivo da exclusão — é o que explica o sumiço para quem procurar o chamado depois.",
    );
  }

  const { error, count } = await supabase
    .from("chamados")
    .update(
      { excluido_em: new Date().toISOString(), motivo_exclusao: texto },
      { count: "exact" },
    )
    .eq("id", chamadoId);

  if (error) throw new Error(traduzirErro(error.message));
  if (count === 0) {
    throw new Error(
      "Não foi possível excluir este chamado — ele já pode ter sido excluído ou fechado por outra pessoa.",
    );
  }
}

export async function restaurarChamado(chamadoId: string): Promise<void> {
  const { error, count } = await supabase
    .from("chamados")
    .update({ excluido_em: null }, { count: "exact" })
    .eq("id", chamadoId);

  if (error) throw new Error(traduzirErro(error.message));
  if (count === 0) {
    throw new Error(
      "Não foi possível restaurar. Restaurar exige estar na Tecnologia, ser executivo ou administrar o sistema.",
    );
  }
}

/**
 * Setores oferecidos no cadastro, antes de haver sessão.
 *
 * Só folhas ativas, com id e caminho — pedir "em nome de Tecnologia" quando
 * existem quatro subsetores esconde quem realmente precisa.
 */
export async function setoresParaCadastro(): Promise<SetorOpcao[]> {
  const { data, error } = await supabase.rpc("setores_para_cadastro");
  if (error) return [];
  return (data ?? []) as SetorOpcao[];
}
