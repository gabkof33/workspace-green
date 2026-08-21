/** Tipos de domínio da Central de TI. */

/* ---------- Enums do núcleo ---------- */

export type PapelUsuario =
  "solicitante" | "agente_n1" | "agente_n2" | "agente_n3" | "gestor" | "admin";

/** Cadeia de comando. */
export type Hierarquia = "coordenador" | "gestor" | "colaborador";

export type Senioridade =
  "estagiario" | "junior" | "pleno" | "senior" | "especialista" | "executivo";

export type TipoChamado = "incidente" | "requisicao";

export type Impacto = "alto" | "medio" | "baixo";
export type Urgencia = "alta" | "media" | "baixa";
export type Prioridade = "P1" | "P2" | "P3" | "P4";

export type StatusChamado =
  | "novo"
  | "triado"
  | "atribuido"
  | "em_atendimento"
  | "pendente_usuario"
  | "pendente_terceiro"
  | "pendente_mudanca"
  | "resolvido"
  | "fechado"
  | "cancelado";

export type CanalEntrada =
  "portal" | "email" | "telefone" | "chat" | "monitoramento";

export type CategoriaEncerramento =
  "resolvido" | "contornado" | "duplicado" | "improcedente" | "desistencia";

/* ---------- Identidade ---------- */

export interface Perfil {
  id: string;
  nome_completo: string;
  email: string;
  matricula: string | null;
  papel: PapelUsuario;
  hierarquia: Hierarquia;
  senioridade: Senioridade;
  gestor_direto_id: string | null;
  promovido_em: string | null;
  equipe_id: string | null;
  setor_id: string | null;
  departamento: string | null;
  unidade: string | null;
  cargo: string | null;
  telefone: string | null;
  ramal: string | null;
  avatar_url: string | null;
  vip: boolean;
  ativo: boolean;
  /** Abas visíveis, resolvidas a partir do setor. */
  abas: string[] | null;
  /**
   * Direito de ver chamados excluídos, resolvido no banco.
   *
   * Vem junto com o perfil e não é recalculado aqui: a mesma função
   * (`pode_ver_excluidos`) decide o botão e a política de leitura, então as
   * duas respostas não podem divergir.
   */
  pode_ver_excluidos: boolean;
}

/** Dados coletados no autocadastro. */
export interface DadosCadastro {
  nome_completo: string;
  email: string;
  senha: string;
  cargo: string;
  departamento: string;
  telefone: string;
  /** Escolhido no cadastro: é ele que decide as abas do menu. */
  setor_id: string;
}

/** Opção da lista de setores, antes de haver sessão. */
export interface SetorOpcao {
  id: string;
  caminho: string;
}

/** Colega mencionável — vem de `vw_diretorio`, sem dados sensíveis. */
export interface PessoaDiretorio {
  id: string;
  nome_completo: string;
  cargo: string | null;
  papel: PapelUsuario;
  hierarquia: Hierarquia;
  senioridade: Senioridade;
  departamento: string | null;
  unidade: string | null;
  gestor_direto_id: string | null;
  gestor_direto_nome: string | null;
  equipe_nome: string | null;
  ativo: boolean;
  criado_em: string;
}

/**
 * O mínimo para resolver @menção: casar um nome digitado com um id.
 *
 * Os campos extras são opcionais porque `PessoaDiretorio` — que tem todos —
 * continua servindo aqui. Quem vem de `diretorio_mencoes` não os traz, e o
 * componente de menção degrada a exibição em vez de quebrar: é a diferença
 * entre o que a equipe de TI vê e o que um solicitante vê.
 */
export interface PessoaMencao {
  id: string;
  nome_completo: string;
  cargo?: string | null;
  hierarquia?: Hierarquia;
  senioridade?: Senioridade;
  equipe_nome?: string | null;
}

/** Campos que coordenador e gestor podem alterar em outra pessoa. */
export interface AlteracaoPerfil {
  hierarquia?: Hierarquia;
  senioridade?: Senioridade;
  papel?: PapelUsuario;
  cargo?: string | null;
  equipe_id?: string | null;
  setor_id?: string | null;
  gestor_direto_id?: string | null;
  departamento?: string | null;
  unidade?: string | null;
  vip?: boolean;
  ativo?: boolean;
}

/** Setor da empresa, em árvore de áreas e subsetores. */
export interface Setor {
  id: string;
  nome: string;
  slug: string;
  setor_pai_id: string | null;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  /** Nulo herda do pai; nulo em toda a cadeia usa o padrão do sistema. */
  abas: string[] | null;
}

/** Aba configurável no menu, com o rótulo que a pessoa vê. */
export interface AbaConfiguravel {
  chave: string;
  rotulo: string;
  /** Exige papel de agente — configurar não concede o acesso. */
  somenteTi: boolean;
}

export interface SetorArvore extends Setor {
  /** Abas com a herança já resolvida pelo banco. */
  abas_efetivas: string[] | null;
  nivel: number;
  /** "Tecnologia › Desenvolvimento" */
  caminho: string;
  setor_pai_nome: string | null;
  subsetores: number;
  pessoas: number;
  criado_em: string;
}

export interface Equipe {
  id: string;
  nome: string;
  nivel: 1 | 2 | 3;
  gestor_id: string | null;
  email_grupo: string | null;
}

/* ---------- Catálogo e formulário dinâmico ---------- */

export type TipoCampoDinamico =
  | "texto"
  | "texto_longo"
  | "numero"
  | "data"
  | "selecao_unica"
  | "selecao_multipla"
  | "relacao"
  | "booleano";

export interface ValidacaoCampo {
  min_caracteres?: number;
  max_caracteres?: number;
  min_dias_uteis_futuro?: number;
  padrao?: string;
  erro?: string;
}

export interface CondicionalCampo {
  campo: string;
  igual_a?: string;
  diferente_de?: string;
}

export interface CampoDinamico {
  chave: string;
  rotulo: string;
  tipo: TipoCampoDinamico;
  obrigatorio: boolean;
  ajuda?: string;
  opcoes?: string[];
  tabela?: string;
  validacao?: ValidacaoCampo;
  condicional?: CondicionalCampo;
}

export interface SchemaFormulario {
  campos: CampoDinamico[];
  aprovacao?: {
    exigida: boolean;
    tipo: "gestor_direto" | "dono_servico" | "custo";
  };
}

export interface ServicoCatalogo {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  tipo: TipoChamado;
  categoria: string;
  subcategoria: string;
  equipe_padrao: string;
  sla_politica: Prioridade;
  impacto_padrao: Impacto;
  urgencia_padrao: Urgencia;
  exige_ativo: boolean;
  artigo_kb: string | null;
  visivel_portal: boolean;
  schema_formulario: SchemaFormulario;
}

/* ---------- SLA ---------- */

export interface PoliticaSla {
  prioridade: Prioridade;
  rotulo: string;
  minutos_resposta: number;
  minutos_solucao: number;
  cobertura: "24x7" | "8x5";
  pct_alerta: number;
  escalonamento: string;
}

export type EventoSla =
  "iniciado" | "pausado" | "retomado" | "cumprido" | "violado";

export interface RegistroSla {
  id: string;
  chamado_id: string;
  evento: EventoSla;
  motivo: string | null;
  ocorrido_em: string;
}

/* ---------- Chamado ---------- */

export interface Chamado {
  id: string;
  numero: string;
  tipo: TipoChamado;
  titulo: string;
  descricao: string;
  servico_id: string;
  solicitante_id: string;
  responsavel_id: string | null;
  equipe_id: string | null;
  impacto: Impacto;
  urgencia: Urgencia;
  /** Derivada de impacto × urgência. */
  prioridade: Prioridade;
  status: StatusChamado;
  canal: CanalEntrada;
  /** Classificação transversal, normalizada pelo banco. */
  tags: string[];
  campos_extras: Record<string, unknown>;
  aberto_em: string;
  primeira_resposta_em: string | null;
  resolvido_em: string | null;
  fechado_em: string | null;
  /** Nunca nulo: o gatilho de SLA calcula na abertura. */
  prazo_resposta: string;
  /** Nunca nulo. */
  prazo_solucao: string;
  minutos_pausados: number;
  /** Exclusão lógica: preenchido, o chamado some das listas e fica no banco. */
  excluido_em: string | null;
  excluido_por: string | null;
  motivo_exclusao: string | null;
  pausado_desde: string | null;
  causa_raiz: string | null;
  solucao_aplicada: string | null;
  categoria_encerramento: CategoriaEncerramento | null;
  reaberturas: number;
  csat_nota: number | null;
}

export interface Interacao {
  id: string;
  chamado_id: string;
  autor_id: string;
  autor_nome: string;
  autor_hierarquia: Hierarquia;
  tipo: "publica" | "interna" | "sistema" | "mudanca_status";
  corpo: string;
  mencionados: string[];
  minutos_trabalhados: number | null;
  criado_em: string;
}

/** Chamado com os campos de exibição já resolvidos, para listagem. */
export interface ChamadoEnriquecido extends Chamado {
  servico_nome: string;
  solicitante_nome: string;
  solicitante_hierarquia: Hierarquia;
  responsavel_nome: string | null;
  responsavel_hierarquia: Hierarquia | null;
  equipe_nome: string | null;
  excluido_por_nome: string | null;
}

/* ---------- Demandas (trabalho planejado) ---------- */

export type TipoDemanda =
  | "melhoria"
  | "bug"
  | "tarefa"
  | "documentacao"
  | "infraestrutura"
  | "automacao"
  | "pesquisa";

export type StatusDemanda =
  | "backlog"
  | "refinamento"
  | "disponivel"
  | "em_andamento"
  | "revisao"
  | "bloqueada"
  | "concluida"
  | "cancelada";

export type PrioridadeDemanda = "critica" | "alta" | "media" | "baixa";

export interface Demanda {
  id: string;
  codigo: string;
  titulo: string;
  descricao: string;
  tipo: TipoDemanda;
  area: string | null;
  solicitante_id: string;
  responsavel_id: string | null;
  equipe_id: string | null;
  status: StatusDemanda;
  prioridade: PrioridadeDemanda;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  data_inicio_real: string | null;
  data_fim_real: string | null;
  percentual: number;
  esforco_horas: number | null;
  depende_de_id: string | null;
  chamado_origem_id: string | null;
  /** Setor que pediu. */
  setor_id: string | null;
  criterios_aceite: string | null;
  motivo_bloqueio: string | null;
  /** Mesmo vocabulário de `chamados.tags`, normalizado pela mesma trigger. */
  tags: string[];
  /**
   * Exclusão lógica: preenchido, o registro some das listas mas fica no
   * banco.
   */
  excluida_em: string | null;
  excluida_por: string | null;
  motivo_exclusao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface DemandaEnriquecida extends Demanda {
  setor_nome: string | null;
  solicitante_nome: string;
  solicitante_hierarquia: Hierarquia;
  responsavel_nome: string | null;
  responsavel_hierarquia: Hierarquia | null;
  excluida_por_nome: string | null;
  equipe_nome: string | null;
  depende_de_codigo: string | null;
}

/** Item da lista de verificação. */
export interface ItemDemanda {
  id: string;
  demanda_id: string;
  ordem: number;
  descricao: string;
  observacao: string | null;
  concluido: boolean;
  concluido_em: string | null;
  concluido_por: string | null;
  criado_em: string;
}

export interface ItemDemandaEnriquecido extends ItemDemanda {
  concluido_por_nome: string | null;
}

/** Parâmetro livre da demanda. */
export type TipoParametro =
  "texto" | "numero" | "data" | "booleano" | "selecao";

export interface ParametroDemanda {
  id: string;
  demanda_id: string;
  /** Como foi digitado. */
  rotulo: string;
  /** Forma normalizada, usada para agrupar e impedir duplicata. */
  chave: string;
  tipo: TipoParametro;
  valor: string;
  criado_por: string | null;
  criado_em: string;
}

export interface ParametroEnriquecido extends ParametroDemanda {
  criado_por_nome: string | null;
}

export interface ParametroSugerido {
  chave: string;
  rotulo: string;
  tipo: TipoParametro;
  usos: number;
}

export interface ComentarioDemanda {
  id: string;
  demanda_id: string;
  autor_id: string;
  autor_nome: string;
  autor_hierarquia: Hierarquia;
  corpo: string;
  mencionados: string[];
  criado_em: string;
}

export interface RascunhoDemanda {
  setor_id: string;
  titulo: string;
  descricao: string;
  tipo: TipoDemanda;
  area: string;
  prioridade: PrioridadeDemanda;
  data_inicio_prevista: string;
  data_fim_prevista: string;
  esforco_horas: string;
  criterios_aceite: string;
  tags: string[];
}

/* ---------- CMDB ---------- */

export type TipoAtivo =
  | "servidor"
  | "workstation"
  | "notebook"
  | "rede"
  | "storage"
  | "impressora"
  | "mobile"
  | "licenca"
  | "servico_nuvem"
  | "aplicacao";

export type StatusAtivo =
  | "em_estoque"
  | "em_uso"
  | "em_manutencao"
  | "emprestado"
  | "descartado"
  | "extraviado";

export type Criticidade = "critico" | "alto" | "medio" | "baixo";
export type Ambiente = "producao" | "homologacao" | "desenvolvimento" | "dr";

export interface Ativo {
  id: string;
  tag_patrimonio: string | null;
  nome: string;
  tipo_ativo: TipoAtivo;
  status_ativo: StatusAtivo;
  criticidade: Criticidade;
  ambiente: Ambiente | null;
  dono_tecnico_id: string | null;
  dono_negocio_id: string | null;
  usuario_id: string | null;
  unidade: string | null;
  sala: string | null;
  rack: string | null;
  fabricante: string | null;
  modelo: string | null;
  numero_serie: string | null;
  data_aquisicao: string | null;
  valor_aquisicao: number | null;
  fim_garantia: string | null;
  fim_vida_util: string | null;
  ultima_verificacao: string | null;
  atributos: Record<string, unknown>;
  observacoes: string | null;
  criado_em: string;
}

export interface AtivoEnriquecido extends Ativo {
  dono_tecnico_nome: string | null;
  usuario_nome: string | null;
}

export interface RascunhoAtivo {
  nome: string;
  tag_patrimonio: string;
  tipo_ativo: TipoAtivo;
  status_ativo: StatusAtivo;
  criticidade: Criticidade;
  ambiente: Ambiente | "";
  unidade: string;
  sala: string;
  fabricante: string;
  modelo: string;
  numero_serie: string;
  fim_garantia: string;
  observacoes: string;
}

/* ---------- Rotinas preventivas ---------- */

export type Periodicidade =
  | "diaria"
  | "semanal"
  | "quinzenal"
  | "mensal"
  | "trimestral"
  | "semestral"
  | "anual";

export type StatusExecucao =
  | "agendada"
  | "em_execucao"
  | "verificacao"
  | "concluida_ok"
  | "concluida_com_falha"
  | "nao_executada";

export type ResultadoPasso = "ok" | "falha" | "nao_aplicavel";

export interface Rotina {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  criticidade: Criticidade;
  periodicidade: Periodicidade;
  janela_inicio: string;
  janela_fim: string;
  duracao_estimada_min: number | null;
  equipe_id: string | null;
  exige_evidencia: boolean;
  exige_dupla_checagem: boolean;
  gera_incidente_na_falha: boolean;
  ativa: boolean;
  criado_em: string;
}

export interface RotinaEnriquecida extends Rotina {
  equipe_nome: string | null;
  total_passos: number;
}

export interface PassoRunbook {
  id: string;
  rotina_id: string;
  ordem: number;
  instrucao: string;
  comando: string | null;
  saida_esperada: string | null;
  criterio_sucesso: string | null;
  acao_se_falhar: string | null;
}

export interface Execucao {
  id: string;
  rotina_id: string;
  prevista_para: string;
  iniciada_em: string | null;
  finalizada_em: string | null;
  executor_id: string | null;
  conferente_id: string | null;
  status_execucao: StatusExecucao;
  observacoes: string | null;
  evidencia_url: string | null;
  chamado_gerado_id: string | null;
}

export interface ExecucaoEnriquecida extends Execucao {
  rotina_nome: string;
  rotina_codigo: string;
  executor_nome: string | null;
}

export interface PassoExecutado {
  id: string;
  execucao_id: string;
  passo_id: string;
  resultado: ResultadoPasso | null;
  saida_obtida: string | null;
  anotacao: string | null;
  instrucao: string;
  ordem: number;
  criterio_sucesso: string | null;
  acao_se_falhar: string | null;
}

export interface RascunhoRotina {
  nome: string;
  descricao: string;
  criticidade: Criticidade;
  periodicidade: Periodicidade;
  janela_inicio: string;
  janela_fim: string;
  duracao_estimada_min: string;
  equipe_id: string;
  exige_evidencia: boolean;
  exige_dupla_checagem: boolean;
}

/* ---------- Base de conhecimento ---------- */

export type TipoArtigo =
  "sop" | "guia_usuario" | "solucao_conhecida" | "politica" | "post_mortem";

export type PublicoArtigo = "usuario_final" | "agente" | "restrito";

export type StatusArtigo = "rascunho" | "em_revisao" | "publicado" | "obsoleto";

export type StatusErro =
  "identificado" | "com_contorno" | "em_correcao" | "resolvido";

export interface Artigo {
  id: string;
  codigo: string;
  titulo: string;
  tipo_artigo: TipoArtigo;
  publico_alvo: PublicoArtigo;
  resumo: string;
  pre_requisitos: string | null;
  corpo: string;
  categoria: string | null;
  autor_id: string;
  revisor_id: string | null;
  status_artigo: StatusArtigo;
  publicado_em: string | null;
  valido_ate: string | null;
  visualizacoes: number;
  util_sim: number;
  util_nao: number;
  chamados_evitados: number;
  criado_em: string;
}

export interface ArtigoEnriquecido extends Artigo {
  autor_nome: string;
  revisor_nome: string | null;
}

export interface RascunhoArtigo {
  titulo: string;
  tipo_artigo: TipoArtigo;
  publico_alvo: PublicoArtigo;
  categoria: string;
  resumo: string;
  pre_requisitos: string;
  corpo: string;
}

export interface ErroConhecido {
  id: string;
  codigo: string;
  sintoma: string;
  causa_raiz: string;
  contorno: string;
  solucao_definitiva: string | null;
  versao_afetada: string | null;
  versao_corrigida: string | null;
  ocorrencias: number;
  custo_estimado_mes: number | null;
  status_erro: StatusErro;
  responsavel_id: string | null;
  criado_em: string;
}

export interface RascunhoErro {
  sintoma: string;
  causa_raiz: string;
  contorno: string;
  solucao_definitiva: string;
  versao_afetada: string;
  custo_estimado_mes: string;
}

/* ---------- Painel de governança ---------- */

export interface BlocoSla {
  prioridade: Prioridade;
  total: number;
  pct_resposta: number | null;
  pct_solucao: number | null;
}

export interface PainelGovernanca {
  periodo_dias: number;
  chamados: {
    abertos: number;
    criticos: number;
    no_periodo: number;
    resolvidos: number;
    reabertos: number;
    pausados: number;
    sem_responsavel: number;
  };
  sla: BlocoSla[];
  prazos: { violados: number; em_risco: number };
  demandas: {
    abertas: number;
    disponiveis: number;
    atrasadas: number;
    concluidas: number;
    progresso_medio: number;
  };
  rotinas: {
    ativas: number;
    previstas: number;
    ok: number;
    com_falha: number;
    nao_executadas: number;
    pendentes: number;
    aderencia: number | null;
  };
  ativos: {
    total: number;
    em_uso: number;
    criticos: number;
    sem_dono: number;
    desatualizados: number;
    garantia_vencendo: number;
  };
  conhecimento: {
    publicados: number;
    em_revisao: number;
    vencidos: number;
    chamados_evitados: number;
  };
  kedb: { abertos: number; sem_solucao: number; custo_mes: number };
  ranking_ativos: Array<{
    ativo_id: string;
    nome: string;
    criticidade: Criticidade;
    incidentes: number;
  }>;
  por_equipe: Array<{ equipe: string; abertos: number; violados: number }>;
  pessoas: {
    total: number;
    coordenadores: number;
    gestores: number;
    colaboradores: number;
  };
}

/* ---------- Conversas ---------- */

export type TipoCanal = "geral" | "equipe";

export interface Canal {
  id: string;
  nome: string;
  slug: string;
  tipo: TipoCanal;
  equipe_id: string | null;
  descricao: string | null;
  arquivado: boolean;
}

export interface CanalComContagem extends Canal {
  nao_lidas: number;
}

export interface Mensagem {
  id: string;
  canal_id: string;
  autor_id: string;
  corpo: string;
  mencionados: string[];
  respondendo_a: string | null;
  editado_em: string | null;
  criado_em: string;
}

export interface MensagemEnriquecida extends Mensagem {
  autor_nome: string;
  autor_hierarquia: Hierarquia;
  autor_cargo: string | null;
}

/* ---------- Notificações ---------- */

export interface Notificacao {
  id: string;
  destinatario_id: string;
  remetente_id: string | null;
  tipo: string;
  titulo: string;
  corpo: string | null;
  destino: string | null;
  lida: boolean;
  criado_em: string;
}

/* ---------- Rascunho do formulário de abertura ---------- */

export interface RascunhoChamado {
  servico_id: string | null;
  titulo: string;
  descricao: string;
  mensagem_erro: string;
  primeira_ocorrencia: string;
  frequencia: "sempre" | "intermitente" | "uma_vez" | "";
  ativo_id: string | null;
  local: string;
  quantos_afetados: "so_eu" | "minha_equipe" | "varios_setores" | "";
  consegue_trabalhar: "sim" | "com_dificuldade" | "nao" | "";
  contorno_aplicado: string;
  tags: string[];
  campos_extras: Record<string, unknown>;
}

/** Tag do vocabulário compartilhado, com quantas vezes já foi usada. */
export interface TagSugerida {
  tag: string;
  usos: number;
}

/** Cor de tag é nome, não hexadecimal. */
export type CorTag =
  "verde" | "ambar" | "vermelho" | "azul" | "roxo" | "ciano" | "rosa" | "cinza";

export interface TagCatalogo {
  tag: string;
  rotulo: string;
  cor: CorTag;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
}

/* ---------- Painel de tempos ---------- */

export interface TemposPorDia {
  dia: string;
  chamados: number;
  espera_min: number;
  solucao_min: number;
}

export interface TemposPorPrioridade {
  prioridade: string;
  chamados: number;
  espera_min: number;
  solucao_min: number;
}

export interface TemposPorEquipe {
  equipe: string;
  chamados: number;
  espera_min: number;
  solucao_min: number;
  aguardando: number;
}

export interface PainelTempos {
  periodo_dias: number;
  resumo: {
    chamados: number;
    espera_media_min: number;
    solucao_media_min: number;
    pausa_media_min: number;
    fila_agora: number;
    espera_atual_media_min: number;
    espera_atual_pior_min: number;
    /** `null` quando não há janela anterior para comparar. */
    variacao_espera_pct: number | null;
    /** Delta em minutos contra a janela anterior. */
    delta_espera_min: number | null;
    /** Delta em unidades contra o retrato de 24h atrás. */
    delta_fila: number;
    fila_ontem: number;
  };
  por_dia: TemposPorDia[];
  por_prioridade: TemposPorPrioridade[];
  por_equipe: TemposPorEquipe[];
}

/* ---------- Post-mortem ---------- */

/** Um momento do incidente. `quando` é `YYYY-MM-DDTHH:mm` na hora local. */
export interface EventoPostMortem {
  quando: string;
  o_que: string;
}

/** Responsável em texto livre: ação corretiva às vezes cai em time externo. */
export interface AcaoCorretiva {
  o_que: string;
  responsavel: string;
  prazo: string | null;
  feita: boolean;
}

/**
 * Post-mortem de incidente.
 *
 * Os campos `chamado_*` vêm da RPC, não da tabela: um post-mortem pode existir
 * sem chamado (`chamado_id` é nulo), daí serem todos anuláveis.
 */
export interface PostMortem {
  id: string;
  chamado_id: string | null;
  chamado_numero: string | null;
  chamado_titulo: string | null;
  chamado_prioridade: Prioridade | null;
  titulo: string;
  duracao_minutos: number | null;
  impacto: string;
  linha_do_tempo: EventoPostMortem[];
  causa_raiz: string | null;
  como_foi_detectado: string | null;
  detectado_por_monitoramento: boolean | null;
  o_que_funcionou: string | null;
  o_que_falhou: string | null;
  acoes_corretivas: AcaoCorretiva[];
  prevencao_reincidencia: string | null;
  responsavel_id: string;
  responsavel_nome: string;
  prazo: string;
  publicado: boolean;
  criado_em: string;
  atualizado_em: string;
}

/** O que o formulário consegue mudar. Fora daqui: `id`, datas e o chamado. */
export type EdicaoPostMortem = Partial<
  Pick<
    PostMortem,
    | "titulo"
    | "duracao_minutos"
    | "impacto"
    | "linha_do_tempo"
    | "causa_raiz"
    | "como_foi_detectado"
    | "detectado_por_monitoramento"
    | "o_que_funcionou"
    | "o_que_falhou"
    | "acoes_corretivas"
    | "prevencao_reincidencia"
    | "responsavel_id"
    | "prazo"
    | "publicado"
  >
>;

/* ---------- Observabilidade de APIs ---------- */

/**
 * Um evento de chamada real ao Supabase, capturado pelo núcleo de
 * instrumentação.
 *
 * Espelha `EventosApiRow` — sem campo de payload/headers/parâmetros de URL:
 * só o que a tela de observabilidade tem permissão de guardar.
 */
export interface EventoApi {
  id: number;
  request_id: string;
  trace_id: string;
  parent_span_id: string | null;
  nome_operacao: string | null;
  servico_destino: string;
  endpoint: string;
  metodo_http: string;
  status_code: number | null;
  latencia_ms: number;
  tempo_banco_ms: number | null;
  qtd_registros: number | null;
  usuario_id: string;
  erro_tipo: string | null;
  erro_mensagem: string | null;
  criado_em: string;
}

export interface NoServico {
  servico: string;
  requisicoes: number;
  erros: number;
  taxa_erro: number;
  p50_ms: number;
  p95_ms: number;
}

export interface ArestaServico {
  origem: string;
  destino: string;
  requisicoes: number;
  erros: number;
  taxa_erro: number;
  p95_ms: number;
}

/** Retorno de `grafo_servicos_observabilidade` — topologia em estrela: este
 * frontend é a única origem observável, sem agente do lado do servidor. */
export interface GrafoServicos {
  janela_minutos: number;
  nos: NoServico[];
  arestas: ArestaServico[];
}

export interface TracoResumo {
  trace_id: string;
  nome_operacao: string | null;
  iniciado_em: string;
  duracao_ms: number;
  spans: number;
  erros: number;
  servicos: string[];
}

export interface KpisObservabilidade {
  janela_minutos: number;
  total_requisicoes: number;
  total_erros: number;
  taxa_erro: number;
  p50_ms: number;
  p95_ms: number;
  usuarios_ativos: number;
}
