/**
 * Tipos do schema do Supabase — projeto jwyghgthezpsbpxbdidc, fases F1 a F4.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/* Enums */

export type AmbienteAtivo =
  "producao" | "homologacao" | "desenvolvimento" | "dr";
export type CanalEntradaDb =
  "portal" | "email" | "telefone" | "chat" | "monitoramento";
export type CategoriaEncerramentoDb =
  "resolvido" | "contornado" | "duplicado" | "improcedente" | "desistencia";
export type CoberturaSla = "24x7" | "8x5";
export type CriticidadeAtivo = "critico" | "alto" | "medio" | "baixo";
export type EventoSlaDb =
  "iniciado" | "pausado" | "retomado" | "cumprido" | "violado";
export type ImpactoDb = "alto" | "medio" | "baixo";
export type PapelUsuarioDb =
  "solicitante" | "agente_n1" | "agente_n2" | "agente_n3" | "gestor" | "admin";
export type PrioridadeDb = "P1" | "P2" | "P3" | "P4";
export type StatusAtivoDb =
  | "em_estoque"
  | "em_uso"
  | "em_manutencao"
  | "emprestado"
  | "descartado"
  | "extraviado";
export type StatusChamadoDb =
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
export type TipoAtivoDb =
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
export type TipoChamadoDb = "incidente" | "requisicao";
export type TipoInteracaoDb =
  "publica" | "interna" | "sistema" | "mudanca_status";
export type TipoRelacaoAtivo =
  | "depende_de"
  | "hospeda"
  | "conecta_a"
  | "faz_backup_de"
  | "replica_para"
  | "compoe";
export type UrgenciaDb = "alta" | "media" | "baixa";
export type TipoDemandaDb =
  | "melhoria"
  | "bug"
  | "tarefa"
  | "documentacao"
  | "infraestrutura"
  | "automacao"
  | "pesquisa";
export type StatusDemandaDb =
  | "backlog"
  | "refinamento"
  | "disponivel"
  | "em_andamento"
  | "revisao"
  | "bloqueada"
  | "concluida"
  | "cancelada";
export type PrioridadeDemandaDb = "critica" | "alta" | "media" | "baixa";
export type HierarquiaDb = "coordenador" | "gestor" | "colaborador";
export type SenioridadeDb =
  "estagiario" | "junior" | "pleno" | "senior" | "especialista" | "executivo";

/* Linhas e inserções por tabela */

type CalendariosRow = {
  id: string;
  nome: string;
  fuso: string;
  cobertura: CoberturaSla;
  hora_inicio: string;
  hora_fim: string;
  dias_semana: number[];
  criado_em: string;
};
type CalendariosInsert = {
  id?: string;
  nome: string;
  fuso?: string;
  cobertura: CoberturaSla;
  hora_inicio?: string;
  hora_fim?: string;
  dias_semana?: number[];
  criado_em?: string;
};

type FeriadosRow = {
  id: string;
  calendario_id: string;
  data: string;
  descricao: string;
};
type FeriadosInsert = {
  id?: string;
  calendario_id: string;
  data: string;
  descricao: string;
};

type SetoresRow = {
  id: string;
  nome: string;
  slug: string;
  setor_pai_id: string | null;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  abas: string[] | null;
  criado_em: string;
};
type SetoresInsert = {
  id?: string;
  nome: string;
  slug?: string;
  setor_pai_id?: string | null;
  descricao?: string | null;
  ordem?: number;
  ativo?: boolean;
  abas?: string[] | null;
};

type TagsCatalogoRow = {
  tag: string;
  rotulo: string;
  cor: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  criado_em: string;
  criado_por: string | null;
};
type TagsCatalogoInsert = {
  tag: string;
  rotulo?: string;
  cor?: string;
  descricao?: string | null;
  ordem?: number;
  ativo?: boolean;
  criado_por?: string | null;
};

type EquipesRow = {
  id: string;
  nome: string;
  nivel: number;
  gestor_id: string | null;
  calendario_id: string | null;
  email_grupo: string | null;
  ativa: boolean;
  criado_em: string;
};
type EquipesInsert = {
  id?: string;
  nome: string;
  nivel: number;
  gestor_id?: string | null;
  calendario_id?: string | null;
  email_grupo?: string | null;
  ativa?: boolean;
  criado_em?: string;
};

type PerfisRow = {
  id: string;
  nome_completo: string;
  email: string;
  matricula: string | null;
  papel: PapelUsuarioDb;
  equipe_id: string | null;
  departamento: string | null;
  unidade: string | null;
  telefone: string | null;
  cargo: string | null;
  data_nascimento: string | null;
  ramal: string | null;
  avatar_url: string | null;
  onboarding_feito: boolean;
  setor_id: string | null;
  hierarquia: HierarquiaDb;
  senioridade: SenioridadeDb;
  gestor_direto_id: string | null;
  promovido_em: string | null;
  vip: boolean;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};
type PerfisInsert = {
  id: string;
  nome_completo: string;
  email: string;
  matricula?: string | null;
  papel?: PapelUsuarioDb;
  equipe_id?: string | null;
  departamento?: string | null;
  unidade?: string | null;
  telefone?: string | null;
  cargo?: string | null;
  data_nascimento?: string | null;
  ramal?: string | null;
  avatar_url?: string | null;
  onboarding_feito?: boolean;
  setor_id?: string | null;
  hierarquia?: HierarquiaDb;
  senioridade?: SenioridadeDb;
  gestor_direto_id?: string | null;
  promovido_em?: string | null;
  vip?: boolean;
  ativo?: boolean;
  criado_em?: string;
  atualizado_em?: string;
};

type DemandasRow = {
  id: string;
  codigo: string | null;
  titulo: string;
  descricao: string;
  tipo: TipoDemandaDb;
  area: string | null;
  solicitante_id: string;
  responsavel_id: string | null;
  equipe_id: string | null;
  status: StatusDemandaDb;
  prioridade: PrioridadeDemandaDb;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  data_inicio_real: string | null;
  data_fim_real: string | null;
  percentual: number;
  esforco_horas: number | null;
  depende_de_id: string | null;
  chamado_origem_id: string | null;
  setor_id: string | null;
  criterios_aceite: string | null;
  tags: string[];
  motivo_bloqueio: string | null;
  excluida_em: string | null;
  excluida_por: string | null;
  motivo_exclusao: string | null;
  criado_em: string;
  atualizado_em: string;
};
type DemandasInsert = {
  id?: string;
  codigo?: string | null;
  titulo: string;
  descricao: string;
  tipo?: TipoDemandaDb;
  area?: string | null;
  solicitante_id: string;
  responsavel_id?: string | null;
  equipe_id?: string | null;
  status?: StatusDemandaDb;
  prioridade?: PrioridadeDemandaDb;
  data_inicio_prevista?: string | null;
  data_fim_prevista?: string | null;
  data_inicio_real?: string | null;
  data_fim_real?: string | null;
  percentual?: number;
  esforco_horas?: number | null;
  depende_de_id?: string | null;
  chamado_origem_id?: string | null;
  setor_id?: string | null;
  criterios_aceite?: string | null;
  tags?: string[];
  motivo_bloqueio?: string | null;
  excluida_em?: string | null;
  excluida_por?: string | null;
  motivo_exclusao?: string | null;
};

type DemandaComentariosRow = {
  id: string;
  demanda_id: string;
  autor_id: string;
  corpo: string;
  mencionados: string[];
  excluido_em: string | null;
  excluido_por: string | null;
  criado_em: string;
};
type DemandaComentariosInsert = {
  id?: string;
  demanda_id: string;
  autor_id: string;
  corpo: string;
  mencionados?: string[];
  excluido_em?: string | null;
  excluido_por?: string | null;
  criado_em?: string;
};

type DemandaItensRow = {
  id: string;
  demanda_id: string;
  ordem: number;
  descricao: string;
  observacao: string | null;
  concluido: boolean;
  concluido_em: string | null;
  concluido_por: string | null;
  criado_por: string | null;
  criado_em: string;
};
type DemandaItensInsert = {
  id?: string;
  demanda_id: string;
  ordem?: number;
  descricao: string;
  observacao?: string | null;
  concluido?: boolean;
  concluido_em?: string | null;
  concluido_por?: string | null;
  criado_por?: string | null;
};

export type TipoParametroDb =
  "texto" | "numero" | "data" | "booleano" | "selecao";

type DemandaParametrosRow = {
  id: string;
  demanda_id: string;
  rotulo: string;
  chave: string;
  tipo: TipoParametroDb;
  valor: string;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
};
type DemandaParametrosInsert = {
  id?: string;
  demanda_id: string;
  rotulo: string;
  chave?: string;
  tipo?: TipoParametroDb;
  valor: string;
  criado_por?: string | null;
};

type NotificacoesRow = {
  id: string;
  destinatario_id: string;
  remetente_id: string | null;
  tipo: string;
  titulo: string;
  corpo: string | null;
  destino: string | null;
  lida: boolean;
  criado_em: string;
};
type NotificacoesInsert = {
  id?: string;
  destinatario_id: string;
  remetente_id?: string | null;
  tipo: string;
  titulo: string;
  corpo?: string | null;
  destino?: string | null;
  lida?: boolean;
  criado_em?: string;
};

type AuditoriaRow = {
  id: number;
  tabela: string;
  registro_id: string;
  operacao: string;
  autor_id: string | null;
  valores_antes: Json | null;
  valores_depois: Json | null;
  ocorrido_em: string;
};
type AuditoriaInsert = {
  tabela: string;
  registro_id: string;
  operacao: string;
  autor_id?: string | null;
  valores_antes?: Json | null;
  valores_depois?: Json | null;
  ocorrido_em?: string;
};

type SlaPoliticasRow = {
  id: string;
  nome: string;
  prioridade: PrioridadeDb;
  minutos_resposta: number;
  minutos_solucao: number;
  calendario_id: string;
  pausa_em_pendencia: boolean;
  pct_alerta: number;
  escalonamento: string | null;
  criado_em: string;
};
type SlaPoliticasInsert = {
  id?: string;
  nome: string;
  prioridade: PrioridadeDb;
  minutos_resposta: number;
  minutos_solucao: number;
  calendario_id: string;
  pausa_em_pendencia?: boolean;
  pct_alerta?: number;
  escalonamento?: string | null;
  criado_em?: string;
};

type CatalogoServicosRow = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  tipo: TipoChamadoDb;
  categoria: string;
  subcategoria: string;
  equipe_padrao_id: string | null;
  sla_politica_id: string;
  impacto_padrao: ImpactoDb;
  urgencia_padrao: UrgenciaDb;
  exige_ativo: boolean;
  exige_aprovacao: boolean;
  aprovador_tipo: string | null;
  schema_formulario: Json;
  artigo_kb_codigo: string | null;
  visivel_portal: boolean;
  ativo: boolean;
  criado_em: string;
};
type CatalogoServicosInsert = {
  id?: string;
  codigo: string;
  nome: string;
  descricao: string;
  tipo: TipoChamadoDb;
  categoria: string;
  subcategoria: string;
  equipe_padrao_id?: string | null;
  sla_politica_id: string;
  impacto_padrao?: ImpactoDb;
  urgencia_padrao?: UrgenciaDb;
  exige_ativo?: boolean;
  exige_aprovacao?: boolean;
  aprovador_tipo?: string | null;
  schema_formulario?: Json;
  artigo_kb_codigo?: string | null;
  visivel_portal?: boolean;
  ativo?: boolean;
  criado_em?: string;
};

type ContratosRow = {
  id: string;
  numero: string;
  fornecedor: string;
  objeto: string;
  data_inicio: string;
  data_fim: string;
  valor_mensal: number | null;
  centro_custo: string | null;
  responsavel_id: string | null;
  sla_fornecedor: string | null;
  telefone_suporte: string | null;
  renovacao_automatica: boolean;
  criado_em: string;
};
type ContratosInsert = {
  id?: string;
  numero: string;
  fornecedor: string;
  objeto: string;
  data_inicio: string;
  data_fim: string;
  valor_mensal?: number | null;
  centro_custo?: string | null;
  responsavel_id?: string | null;
  sla_fornecedor?: string | null;
  telefone_suporte?: string | null;
  renovacao_automatica?: boolean;
  criado_em?: string;
};

type AtivosRow = {
  id: string;
  tag_patrimonio: string | null;
  nome: string;
  tipo_ativo: TipoAtivoDb;
  status_ativo: StatusAtivoDb;
  criticidade: CriticidadeAtivo;
  ambiente: AmbienteAtivo | null;
  dono_tecnico_id: string | null;
  dono_negocio_id: string | null;
  usuario_id: string | null;
  unidade: string | null;
  sala: string | null;
  rack: string | null;
  posicao_u: number | null;
  fabricante: string | null;
  modelo: string | null;
  numero_serie: string | null;
  data_aquisicao: string | null;
  valor_aquisicao: number | null;
  fim_garantia: string | null;
  fim_vida_util: string | null;
  contrato_id: string | null;
  ultima_verificacao: string | null;
  atributos: Json;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
};
type AtivosInsert = {
  id?: string;
  tag_patrimonio?: string | null;
  nome: string;
  tipo_ativo: TipoAtivoDb;
  status_ativo?: StatusAtivoDb;
  criticidade?: CriticidadeAtivo;
  ambiente?: AmbienteAtivo | null;
  dono_tecnico_id?: string | null;
  dono_negocio_id?: string | null;
  usuario_id?: string | null;
  unidade?: string | null;
  sala?: string | null;
  rack?: string | null;
  posicao_u?: number | null;
  fabricante?: string | null;
  modelo?: string | null;
  numero_serie?: string | null;
  data_aquisicao?: string | null;
  valor_aquisicao?: number | null;
  fim_garantia?: string | null;
  fim_vida_util?: string | null;
  contrato_id?: string | null;
  ultima_verificacao?: string | null;
  atributos?: Json;
  observacoes?: string | null;
  criado_em?: string;
  atualizado_em?: string;
};

type AtivoRelacionamentosRow = {
  id: string;
  ativo_origem_id: string;
  ativo_destino_id: string;
  tipo_relacao: TipoRelacaoAtivo;
  critico: boolean;
  observacao: string | null;
  criado_em: string;
};
type AtivoRelacionamentosInsert = {
  id?: string;
  ativo_origem_id: string;
  ativo_destino_id: string;
  tipo_relacao: TipoRelacaoAtivo;
  critico?: boolean;
  observacao?: string | null;
  criado_em?: string;
};

type ChamadoAtivosRow = {
  id: string;
  chamado_id: string;
  ativo_id: string;
  papel: string;
  criado_em: string;
};
type ChamadoAtivosInsert = {
  id?: string;
  chamado_id: string;
  ativo_id: string;
  papel?: string;
  criado_em?: string;
};

type ChamadosRow = {
  id: string;
  numero: string | null;
  tipo: TipoChamadoDb;
  titulo: string;
  descricao: string;
  servico_id: string;
  solicitante_id: string;
  responsavel_id: string | null;
  equipe_id: string | null;
  impacto: ImpactoDb;
  urgencia: UrgenciaDb;
  /** Coluna gerada pelo Postgres — nunca enviada em insert ou update. */
  prioridade: PrioridadeDb | null;
  status: StatusChamadoDb;
  canal: CanalEntradaDb;
  tags: string[];
  setor_id: string | null;
  campos_extras: Json;
  aberto_em: string;
  primeira_resposta_em: string | null;
  resolvido_em: string | null;
  fechado_em: string | null;
  prazo_resposta: string;
  prazo_solucao: string;
  excluido_em: string | null;
  excluido_por: string | null;
  motivo_exclusao: string | null;
  minutos_pausados: number;
  pausado_desde: string | null;
  sla_resposta_ok: boolean | null;
  sla_solucao_ok: boolean | null;
  causa_raiz: string | null;
  solucao_aplicada: string | null;
  categoria_encerramento: CategoriaEncerramentoDb | null;
  reaberturas: number;
  csat_nota: number | null;
  csat_comentario: string | null;
  erro_conhecido_id: string | null;
  atualizado_em: string;
};

/**
 * Numeração, fila, prazos e prioridade são resolvidos pelos triggers da F4 —
 * por isso não aparecem aqui como campos obrigatórios.
 */
type ChamadosInsert = {
  id?: string;
  numero?: string | null;
  tipo?: TipoChamadoDb;
  titulo: string;
  descricao: string;
  servico_id: string;
  solicitante_id: string;
  responsavel_id?: string | null;
  equipe_id?: string | null;
  impacto?: ImpactoDb;
  urgencia?: UrgenciaDb;
  status?: StatusChamadoDb;
  canal?: CanalEntradaDb;
  tags?: string[];
  setor_id?: string | null;
  campos_extras?: Json;
  aberto_em?: string;
  causa_raiz?: string | null;
  solucao_aplicada?: string | null;
  categoria_encerramento?: CategoriaEncerramentoDb | null;
  csat_nota?: number | null;
  csat_comentario?: string | null;
  erro_conhecido_id?: string | null;
};

type ChamadosUpdate = Partial<ChamadosInsert> & {
  primeira_resposta_em?: string | null;
  resolvido_em?: string | null;
  fechado_em?: string | null;
  prazo_resposta?: string | null;
  prazo_solucao?: string | null;
  excluido_em?: string | null;
  excluido_por?: string | null;
  motivo_exclusao?: string | null;
  minutos_pausados?: number;
  pausado_desde?: string | null;
  sla_resposta_ok?: boolean | null;
  sla_solucao_ok?: boolean | null;
  reaberturas?: number;
};

type ChamadoInteracoesRow = {
  id: string;
  chamado_id: string;
  autor_id: string;
  tipo: TipoInteracaoDb;
  corpo: string;
  mencionados: string[];
  minutos_trabalhados: number | null;
  criado_em: string;
};
type ChamadoInteracoesInsert = {
  id?: string;
  chamado_id: string;
  autor_id: string;
  tipo?: TipoInteracaoDb;
  corpo: string;
  mencionados?: string[];
  minutos_trabalhados?: number | null;
  criado_em?: string;
};

type SlaEventosRow = {
  id: string;
  chamado_id: string;
  evento: EventoSlaDb;
  motivo: string | null;
  ocorrido_em: string;
};
type SlaEventosInsert = {
  id?: string;
  chamado_id: string;
  evento: EventoSlaDb;
  motivo?: string | null;
  ocorrido_em?: string;
};

export type PeriodicidadeDb =
  | "diaria"
  | "semanal"
  | "quinzenal"
  | "mensal"
  | "trimestral"
  | "semestral"
  | "anual";
export type StatusExecucaoDb =
  | "agendada"
  | "em_execucao"
  | "verificacao"
  | "concluida_ok"
  | "concluida_com_falha"
  | "nao_executada";
export type ResultadoPassoDb = "ok" | "falha" | "nao_aplicavel";
export type TipoArtigoDb =
  "sop" | "guia_usuario" | "solucao_conhecida" | "politica" | "post_mortem";
export type PublicoArtigoDb = "usuario_final" | "agente" | "restrito";
export type StatusArtigoDb =
  "rascunho" | "em_revisao" | "publicado" | "obsoleto";
export type StatusErroDb =
  "identificado" | "com_contorno" | "em_correcao" | "resolvido";

type RotinasRow = {
  id: string;
  codigo: string | null;
  nome: string;
  descricao: string;
  criticidade: CriticidadeAtivo;
  periodicidade: PeriodicidadeDb;
  dia_referencia: number | null;
  janela_inicio: string;
  janela_fim: string;
  duracao_estimada_min: number | null;
  equipe_id: string | null;
  responsavel_padrao_id: string | null;
  exige_evidencia: boolean;
  exige_dupla_checagem: boolean;
  gera_incidente_na_falha: boolean;
  ativa: boolean;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
};
type RotinasInsert = {
  id?: string;
  codigo?: string | null;
  nome: string;
  descricao: string;
  criticidade?: CriticidadeAtivo;
  periodicidade?: PeriodicidadeDb;
  dia_referencia?: number | null;
  janela_inicio?: string;
  janela_fim?: string;
  duracao_estimada_min?: number | null;
  equipe_id?: string | null;
  responsavel_padrao_id?: string | null;
  exige_evidencia?: boolean;
  exige_dupla_checagem?: boolean;
  gera_incidente_na_falha?: boolean;
  ativa?: boolean;
  criado_por?: string | null;
};

type RunbookPassosRow = {
  id: string;
  rotina_id: string;
  ordem: number;
  instrucao: string;
  comando: string | null;
  saida_esperada: string | null;
  criterio_sucesso: string | null;
  acao_se_falhar: string | null;
};
type RunbookPassosInsert = {
  id?: string;
  rotina_id: string;
  ordem: number;
  instrucao: string;
  comando?: string | null;
  saida_esperada?: string | null;
  criterio_sucesso?: string | null;
  acao_se_falhar?: string | null;
};

type RotinaAtivosRow = {
  id: string;
  rotina_id: string;
  ativo_id: string;
};
type RotinaAtivosInsert = { id?: string; rotina_id: string; ativo_id: string };

type RotinaExecucoesRow = {
  id: string;
  rotina_id: string;
  prevista_para: string;
  iniciada_em: string | null;
  finalizada_em: string | null;
  executor_id: string | null;
  conferente_id: string | null;
  status_execucao: StatusExecucaoDb;
  observacoes: string | null;
  evidencia_url: string | null;
  chamado_gerado_id: string | null;
  criado_em: string;
};
type RotinaExecucoesInsert = {
  id?: string;
  rotina_id: string;
  prevista_para: string;
  iniciada_em?: string | null;
  finalizada_em?: string | null;
  executor_id?: string | null;
  conferente_id?: string | null;
  status_execucao?: StatusExecucaoDb;
  observacoes?: string | null;
  evidencia_url?: string | null;
  chamado_gerado_id?: string | null;
};

type ExecucaoPassosRow = {
  id: string;
  execucao_id: string;
  passo_id: string;
  resultado: ResultadoPassoDb | null;
  saida_obtida: string | null;
  anotacao: string | null;
  registrado_em: string | null;
};
type ExecucaoPassosInsert = {
  id?: string;
  execucao_id: string;
  passo_id: string;
  resultado?: ResultadoPassoDb | null;
  saida_obtida?: string | null;
  anotacao?: string | null;
  registrado_em?: string | null;
};

type PlantoesRow = {
  id: string;
  equipe_id: string;
  perfil_id: string;
  inicio: string;
  fim: string;
  tipo: string;
};
type PlantoesInsert = {
  id?: string;
  equipe_id: string;
  perfil_id: string;
  inicio: string;
  fim: string;
  tipo?: string;
};

type ArtigosKbRow = {
  id: string;
  codigo: string | null;
  titulo: string;
  tipo_artigo: TipoArtigoDb;
  publico_alvo: PublicoArtigoDb;
  resumo: string;
  pre_requisitos: string | null;
  corpo: string;
  categoria: string | null;
  servicos_relacionados: string[];
  ativos_relacionados: string[];
  autor_id: string;
  revisor_id: string | null;
  status_artigo: StatusArtigoDb;
  publicado_em: string | null;
  valido_ate: string | null;
  visualizacoes: number;
  util_sim: number;
  util_nao: number;
  chamados_evitados: number;
  criado_em: string;
  atualizado_em: string;
};
type ArtigosKbInsert = {
  id?: string;
  codigo?: string | null;
  titulo: string;
  tipo_artigo?: TipoArtigoDb;
  publico_alvo?: PublicoArtigoDb;
  resumo: string;
  pre_requisitos?: string | null;
  corpo: string;
  categoria?: string | null;
  servicos_relacionados?: string[];
  ativos_relacionados?: string[];
  autor_id: string;
  revisor_id?: string | null;
  status_artigo?: StatusArtigoDb;
  valido_ate?: string | null;
  visualizacoes?: number;
  util_sim?: number;
  util_nao?: number;
  chamados_evitados?: number;
};

type ErrosConhecidosRow = {
  id: string;
  codigo: string | null;
  sintoma: string;
  causa_raiz: string;
  contorno: string;
  solucao_definitiva: string | null;
  artigo_id: string | null;
  ativos_afetados: string[];
  versao_afetada: string | null;
  versao_corrigida: string | null;
  chamado_origem_id: string | null;
  ocorrencias: number;
  custo_estimado_mes: number | null;
  status_erro: StatusErroDb;
  responsavel_id: string | null;
  criado_em: string;
  atualizado_em: string;
};
type ErrosConhecidosInsert = {
  id?: string;
  codigo?: string | null;
  sintoma: string;
  causa_raiz: string;
  contorno: string;
  solucao_definitiva?: string | null;
  artigo_id?: string | null;
  ativos_afetados?: string[];
  versao_afetada?: string | null;
  versao_corrigida?: string | null;
  chamado_origem_id?: string | null;
  ocorrencias?: number;
  custo_estimado_mes?: number | null;
  status_erro?: StatusErroDb;
  responsavel_id?: string | null;
};

type PostMortemsRow = {
  id: string;
  chamado_id: string | null;
  titulo: string;
  duracao_minutos: number | null;
  impacto: string;
  linha_do_tempo: Json;
  causa_raiz: string | null;
  como_foi_detectado: string | null;
  detectado_por_monitoramento: boolean | null;
  o_que_funcionou: string | null;
  o_que_falhou: string | null;
  acoes_corretivas: Json;
  prevencao_reincidencia: string | null;
  responsavel_id: string;
  prazo: string;
  publicado: boolean;
  criado_em: string;
  atualizado_em: string;
};
type PostMortemsInsert = {
  id?: string;
  chamado_id?: string | null;
  titulo: string;
  duracao_minutos?: number | null;
  impacto: string;
  linha_do_tempo?: Json;
  causa_raiz?: string | null;
  como_foi_detectado?: string | null;
  detectado_por_monitoramento?: boolean | null;
  o_que_funcionou?: string | null;
  o_que_falhou?: string | null;
  acoes_corretivas?: Json;
  prevencao_reincidencia?: string | null;
  responsavel_id: string;
  prazo: string;
  publicado?: boolean;
};

export type TipoCanalDb = "geral" | "equipe";

type CanaisRow = {
  id: string;
  nome: string;
  slug: string;
  tipo: TipoCanalDb;
  equipe_id: string | null;
  descricao: string | null;
  arquivado: boolean;
  criado_em: string;
};
type CanaisInsert = {
  id?: string;
  nome: string;
  slug: string;
  tipo?: TipoCanalDb;
  equipe_id?: string | null;
  descricao?: string | null;
  arquivado?: boolean;
};

type MensagensRow = {
  id: string;
  canal_id: string;
  autor_id: string;
  corpo: string;
  mencionados: string[];
  respondendo_a: string | null;
  editado_em: string | null;
  criado_em: string;
};
type MensagensInsert = {
  id?: string;
  canal_id: string;
  autor_id: string;
  corpo: string;
  mencionados?: string[];
  respondendo_a?: string | null;
  editado_em?: string | null;
};

type CanalLeiturasRow = {
  canal_id: string;
  perfil_id: string;
  ultima_leitura_em: string;
};
type CanalLeiturasInsert = {
  canal_id: string;
  perfil_id: string;
  ultima_leitura_em?: string;
};

/* Schema */

export type Database = {
  public: {
    Tables: {
      ativo_relacionamentos: {
        Row: AtivoRelacionamentosRow;
        Insert: AtivoRelacionamentosInsert;
        Update: Partial<AtivoRelacionamentosInsert>;
        Relationships: [];
      };
      ativos: {
        Row: AtivosRow;
        Insert: AtivosInsert;
        Update: Partial<AtivosInsert>;
        Relationships: [];
      };
      auditoria: {
        Row: AuditoriaRow;
        Insert: AuditoriaInsert;
        Update: Partial<AuditoriaInsert>;
        Relationships: [];
      };
      calendarios: {
        Row: CalendariosRow;
        Insert: CalendariosInsert;
        Update: Partial<CalendariosInsert>;
        Relationships: [];
      };
      catalogo_servicos: {
        Row: CatalogoServicosRow;
        Insert: CatalogoServicosInsert;
        Update: Partial<CatalogoServicosInsert>;
        Relationships: [];
      };
      chamado_ativos: {
        Row: ChamadoAtivosRow;
        Insert: ChamadoAtivosInsert;
        Update: Partial<ChamadoAtivosInsert>;
        Relationships: [];
      };
      chamado_interacoes: {
        Row: ChamadoInteracoesRow;
        Insert: ChamadoInteracoesInsert;
        Update: Partial<ChamadoInteracoesInsert>;
        Relationships: [];
      };
      chamados: {
        Row: ChamadosRow;
        Insert: ChamadosInsert;
        Update: ChamadosUpdate;
        Relationships: [];
      };
      contratos: {
        Row: ContratosRow;
        Insert: ContratosInsert;
        Update: Partial<ContratosInsert>;
        Relationships: [];
      };
      demandas: {
        Row: DemandasRow;
        Insert: DemandasInsert;
        Update: Partial<DemandasInsert>;
        Relationships: [];
      };
      demanda_comentarios: {
        Row: DemandaComentariosRow;
        Insert: DemandaComentariosInsert;
        Update: Partial<DemandaComentariosInsert>;
        Relationships: [];
      };
      demanda_itens: {
        Row: DemandaItensRow;
        Insert: DemandaItensInsert;
        Update: Partial<DemandaItensInsert>;
        Relationships: [];
      };
      demanda_parametros: {
        Row: DemandaParametrosRow;
        Insert: DemandaParametrosInsert;
        Update: Partial<DemandaParametrosInsert>;
        Relationships: [];
      };
      notificacoes: {
        Row: NotificacoesRow;
        Insert: NotificacoesInsert;
        Update: Partial<NotificacoesInsert>;
        Relationships: [];
      };
      rotinas: {
        Row: RotinasRow;
        Insert: RotinasInsert;
        Update: Partial<RotinasInsert>;
        Relationships: [];
      };
      runbook_passos: {
        Row: RunbookPassosRow;
        Insert: RunbookPassosInsert;
        Update: Partial<RunbookPassosInsert>;
        Relationships: [];
      };
      rotina_ativos: {
        Row: RotinaAtivosRow;
        Insert: RotinaAtivosInsert;
        Update: Partial<RotinaAtivosInsert>;
        Relationships: [];
      };
      rotina_execucoes: {
        Row: RotinaExecucoesRow;
        Insert: RotinaExecucoesInsert;
        Update: Partial<RotinaExecucoesInsert>;
        Relationships: [];
      };
      execucao_passos: {
        Row: ExecucaoPassosRow;
        Insert: ExecucaoPassosInsert;
        Update: Partial<ExecucaoPassosInsert>;
        Relationships: [];
      };
      plantoes: {
        Row: PlantoesRow;
        Insert: PlantoesInsert;
        Update: Partial<PlantoesInsert>;
        Relationships: [];
      };
      artigos_kb: {
        Row: ArtigosKbRow;
        Insert: ArtigosKbInsert;
        Update: Partial<ArtigosKbInsert>;
        Relationships: [];
      };
      erros_conhecidos: {
        Row: ErrosConhecidosRow;
        Insert: ErrosConhecidosInsert;
        Update: Partial<ErrosConhecidosInsert>;
        Relationships: [];
      };
      post_mortems: {
        Row: PostMortemsRow;
        Insert: PostMortemsInsert;
        Update: Partial<PostMortemsInsert>;
        Relationships: [];
      };
      canais: {
        Row: CanaisRow;
        Insert: CanaisInsert;
        Update: Partial<CanaisInsert>;
        Relationships: [];
      };
      mensagens: {
        Row: MensagensRow;
        Insert: MensagensInsert;
        Update: Partial<MensagensInsert>;
        Relationships: [];
      };
      canal_leituras: {
        Row: CanalLeiturasRow;
        Insert: CanalLeiturasInsert;
        Update: Partial<CanalLeiturasInsert>;
        Relationships: [];
      };
      setores: {
        Row: SetoresRow;
        Insert: SetoresInsert;
        Update: Partial<SetoresInsert>;
        Relationships: [];
      };
      tags_catalogo: {
        Row: TagsCatalogoRow;
        Insert: TagsCatalogoInsert;
        Update: Partial<TagsCatalogoInsert>;
        Relationships: [];
      };
      equipes: {
        Row: EquipesRow;
        Insert: EquipesInsert;
        Update: Partial<EquipesInsert>;
        Relationships: [];
      };
      feriados: {
        Row: FeriadosRow;
        Insert: FeriadosInsert;
        Update: Partial<FeriadosInsert>;
        Relationships: [];
      };
      perfis: {
        Row: PerfisRow;
        Insert: PerfisInsert;
        Update: Partial<PerfisInsert>;
        Relationships: [];
      };
      sla_eventos: {
        Row: SlaEventosRow;
        Insert: SlaEventosInsert;
        Update: Partial<SlaEventosInsert>;
        Relationships: [];
      };
      sla_politicas: {
        Row: SlaPoliticasRow;
        Insert: SlaPoliticasInsert;
        Update: Partial<SlaPoliticasInsert>;
        Relationships: [];
      };
    };
    Views: {
      vw_diretorio: {
        Row: {
          id: string;
          nome_completo: string;
          cargo: string | null;
          papel: PapelUsuarioDb;
          hierarquia: HierarquiaDb;
          senioridade: SenioridadeDb;
          departamento: string | null;
          unidade: string | null;
          gestor_direto_id: string | null;
          gestor_direto_nome: string | null;
          equipe_nome: string | null;
          avatar_url: string | null;
          ativo: boolean;
        };
        Relationships: [];
      };
      vw_setores: {
        Row: {
          abas: string[] | null;
          abas_efetivas: string[] | null;
          id: string;
          nome: string;
          slug: string;
          setor_pai_id: string | null;
          descricao: string | null;
          ordem: number;
          ativo: boolean;
          nivel: number;
          caminho: string;
          setor_pai_nome: string | null;
          subsetores: number;
          pessoas: number;
        };
        Relationships: [];
      };
      vw_gantt: {
        Row: {
          id: string;
          codigo: string | null;
          titulo: string;
          tipo: TipoDemandaDb;
          status: StatusDemandaDb;
          prioridade: PrioridadeDemandaDb;
          percentual: number;
          depende_de_id: string | null;
          inicio: string | null;
          fim: string | null;
          data_inicio_prevista: string | null;
          data_fim_prevista: string | null;
          data_fim_real: string | null;
          responsavel_nome: string | null;
          equipe_nome: string | null;
          atrasada: boolean;
          dias_restantes: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      ativos_impactados: {
        Args: { p_ativo: string };
        Returns: Array<{
          ativo_id: string;
          nome: string;
          criticidade: CriticidadeAtivo;
          saltos: number;
        }>;
      };
      calcular_prioridade: {
        Args: { i: ImpactoDb; u: UrgenciaDb };
        Returns: PrioridadeDb;
      };
      meu_papel: { Args: Record<string, never>; Returns: PapelUsuarioDb };
      minha_equipe: { Args: Record<string, never>; Returns: string };
      minha_hierarquia: { Args: Record<string, never>; Returns: HierarquiaDb };
      pode_gerir_perfil: { Args: { p_alvo: string }; Returns: boolean };
      minutos_uteis: {
        Args: { p_inicio: string; p_fim: string; p_calendario: string };
        Returns: number;
      };
      somar_minutos_uteis: {
        Args: { p_base: string; p_minutos: number; p_calendario: string };
        Returns: string;
      };
      sou_agente: { Args: Record<string, never>; Returns: boolean };
      sou_gestor: { Args: Record<string, never>; Returns: boolean };
      sistema_vazio: { Args: Record<string, never>; Returns: boolean };
      minhas_abas: { Args: Record<string, never>; Returns: string[] | null };
      abas_conhecidas: { Args: Record<string, never>; Returns: string[] };
      abas_do_setor: { Args: { p_setor: string }; Returns: string[] | null };
      painel_governanca: { Args: { p_dias?: number }; Returns: Json };
      painel_tempos: { Args: { p_dias?: number }; Returns: Json };
      setores_para_cadastro: {
        Args: Record<string, never>;
        Returns: Array<{ id: string; caminho: string }>;
      };
      garantir_perfil: { Args: Record<string, never>; Returns: boolean };
      parametros_sugeridos: {
        Args: { p_limite?: number };
        Returns: Array<{
          chave: string;
          rotulo: string;
          tipo: TipoParametroDb;
          usos: number;
        }>;
      };
      tags_sugeridas: {
        Args: { p_limite?: number };
        Returns: Array<{ tag: string; usos: number }>;
      };
      posso_ver_canal: { Args: { p_canal: string }; Returns: boolean };
      marcar_canal_lido: { Args: { p_canal: string }; Returns: undefined };
      nao_lidas_por_canal: {
        Args: Record<string, never>;
        Returns: Array<{ canal_id: string; nao_lidas: number }>;
      };
      revisar_artigos_vencidos: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: {
      ambiente_ativo: AmbienteAtivo;
      canal_entrada: CanalEntradaDb;
      categoria_encerramento: CategoriaEncerramentoDb;
      cobertura_sla: CoberturaSla;
      criticidade_ativo: CriticidadeAtivo;
      evento_sla: EventoSlaDb;
      impacto: ImpactoDb;
      papel_usuario: PapelUsuarioDb;
      prioridade: PrioridadeDb;
      status_ativo: StatusAtivoDb;
      status_chamado: StatusChamadoDb;
      tipo_ativo: TipoAtivoDb;
      tipo_chamado: TipoChamadoDb;
      tipo_interacao: TipoInteracaoDb;
      tipo_relacao_ativo: TipoRelacaoAtivo;
      urgencia: UrgenciaDb;
      hierarquia: HierarquiaDb;
      senioridade: SenioridadeDb;
      periodicidade: PeriodicidadeDb;
      status_execucao: StatusExecucaoDb;
      resultado_passo: ResultadoPassoDb;
      tipo_artigo: TipoArtigoDb;
      publico_artigo: PublicoArtigoDb;
      status_artigo: StatusArtigoDb;
      status_erro: StatusErroDb;
      tipo_canal: TipoCanalDb;
      tipo_parametro: TipoParametroDb;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type EsquemaPublico = Database["public"];

export type Tabela<N extends keyof EsquemaPublico["Tables"]> =
  EsquemaPublico["Tables"][N]["Row"];

export type Inserir<N extends keyof EsquemaPublico["Tables"]> =
  EsquemaPublico["Tables"][N]["Insert"];

export type Atualizar<N extends keyof EsquemaPublico["Tables"]> =
  EsquemaPublico["Tables"][N]["Update"];

export type Enum<N extends keyof EsquemaPublico["Enums"]> =
  EsquemaPublico["Enums"][N];
