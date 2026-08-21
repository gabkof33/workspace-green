-- Endurecimento de segurança: fecha bypasses de RLS e cria a trilha de
-- eventos suspeitos.
--
-- O que motivou cada bloco está no SEGURANCA.md. O resumo é que a proteção
-- real desta aplicação mora aqui, não no navegador: a chave publishable e
-- todo o JavaScript já estão nas mãos de quem abre o F12, então o que decide
-- quem lê o quê é a policy, nunca a tela.

/* ------------------------------------------------------------------
   1. vw_diretorio furava a RLS de perfis
   ------------------------------------------------------------------
   A view era `security_invoker = off`, ou seja, rodava com a permissão de
   quem a criou, e tinha GRANT para `authenticated`. Resultado: a policy
   `perfis_leitura` (`id = auth.uid() OR sou_agente()`) dizia "solicitante vê
   só a própria linha" e a view entregava o diretório inteiro — nome, cargo,
   papel, hierarquia, senioridade, departamento, unidade e gestor de todo
   mundo — para qualquer sessão autenticada.

   Nada no código usa esta view (o app vai pela RPC `diretorio`), então
   ligar o invoker não muda comportamento nenhum de tela. */

alter view public.vw_diretorio set (security_invoker = on);

comment on view public.vw_diretorio is
  'Diretório de pessoas ativas. security_invoker=on de propósito: a view respeita a RLS de `perfis`, e não a substitui. Não desligue — foi exatamente isso que furou a policy antes.';

/* ------------------------------------------------------------------
   2. diretorio() tinha o mesmo furo, e esse o app usa
   ------------------------------------------------------------------
   `SECURITY DEFINER` sem checagem de papel: qualquer autenticado chamando
   /rest/v1/rpc/diretorio recebia o organograma completo. O corte agora é o
   mesmo de `perfis_leitura` — quem não é agente não passa.

   Devolve zero linhas em vez de levantar exceção: as telas já tratam lista
   vazia, e erro de permissão em RPC de leitura viraria toast de falha numa
   tela que simplesmente não é para aquela pessoa. */

create or replace function public.diretorio()
returns table(
  id uuid, nome_completo text, cargo text, papel papel_usuario,
  hierarquia hierarquia, senioridade senioridade, departamento text,
  unidade text, gestor_direto_id uuid, gestor_direto_nome text,
  equipe_nome text, ativo boolean, criado_em timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nome_completo, p.cargo, p.papel, p.hierarquia, p.senioridade,
         p.departamento, p.unidade, p.gestor_direto_id,
         g.nome_completo, e.nome, p.ativo, p.criado_em
  from public.perfis p
  left join public.equipes e on e.id = p.equipe_id
  left join public.perfis  g on g.id = p.gestor_direto_id
  where p.ativo
    and public.sou_agente()
  order by p.nome_completo
$$;

comment on function public.diretorio() is
  'Diretório completo, restrito à equipe de TI (mesmo corte de `perfis_leitura`). Solicitante recebe zero linhas — para menção use `diretorio_mencoes`.';

/* ------------------------------------------------------------------
   3. O mínimo que a menção precisa
   ------------------------------------------------------------------
   Fechar `diretorio()` quebraria @menção no chat e nos comentários de
   demanda, que são telas de solicitante. Elas precisam de uma coisa só:
   casar um nome digitado com um id.

   Continua `SECURITY DEFINER` porque a RLS de `perfis` esconderia as outras
   linhas — mas a superfície caiu de treze colunas para três. Cargo,
   hierarquia, senioridade, departamento, unidade e gestor não saem daqui. */

create or replace function public.diretorio_mencoes()
returns table(id uuid, nome_completo text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nome_completo, p.avatar_url
  from public.perfis p
  where p.ativo
  order by p.nome_completo
$$;

comment on function public.diretorio_mencoes() is
  'Só id, nome e avatar de quem está ativo — o suficiente para resolver @menção. Divulgação mínima e deliberada: qualquer autenticado lê. Não acrescente coluna aqui; se a tela precisa de mais, ela precisa de `diretorio`.';

revoke all on function public.diretorio_mencoes() from public, anon;
grant execute on function public.diretorio_mencoes() to authenticated;

/* ------------------------------------------------------------------
   4. search_path fixo nas funções de observabilidade
   ------------------------------------------------------------------
   Sem `search_path` fixo, quem consegue criar objeto num schema à frente do
   `public` na busca pode sequestrar um nome não qualificado dentro da
   função. As três já qualificam tudo com `public.`, então fixar em vazio é
   inócuo para o resultado e fecha o vetor. */

alter function public.grafo_servicos_observabilidade(integer) set search_path = '';
alter function public.tracos_recentes_observabilidade(integer, integer) set search_path = '';
alter function public.kpis_observabilidade(integer) set search_path = '';

/* ------------------------------------------------------------------
   5. Funções de trigger não são API
   ------------------------------------------------------------------
   `fn_restaurar_restrito` e `fn_validar_exclusao_chamado` retornam `trigger`
   e estavam com EXECUTE para `anon` e `authenticated`, aparecendo como
   /rest/v1/rpc/... no PostgREST. Chamá-las fora de um trigger falha de
   qualquer forma ("trigger functions can only be called as triggers"), então
   isto é higiene de superfície, não correção de furo: tira duas entradas do
   mapa que um scanner enumera. */

revoke all on function public.fn_restaurar_restrito() from public, anon, authenticated;
revoke all on function public.fn_validar_exclusao_chamado() from public, anon, authenticated;

/* ------------------------------------------------------------------
   6. Trilha de eventos suspeitos
   ------------------------------------------------------------------
   Espelha `eventos_api`: só INSERT do próprio usuário, sem UPDATE/DELETE, e
   leitura restrita a quem não é solicitante.

   O que entra aqui é sinal de auditoria, não prova. Todo campo é preenchido
   pelo cliente e um cliente hostil mente ou simplesmente não envia — vale
   para ver padrão no conjunto, nunca para acusar uma sessão.

   `detalhe` é jsonb de propósito curto: nunca corpo de requisição, token,
   conteúdo digitado ou chave de armazenamento com dado de pessoa. */

create table public.eventos_seguranca (
  id          bigint generated always as identity primary key,
  tipo        text not null check (tipo in (
                'devtools_suspeito',
                'dom_mutado',
                'integridade_divergente',
                'armazenamento_invalido',
                'csp_violada'
              )),
  severidade  text not null default 'aviso' check (severidade in ('info','aviso','alto')),
  rota        text null,
  detalhe     jsonb not null default '{}'::jsonb,
  usuario_id  uuid not null references public.perfis(id),
  criado_em   timestamptz not null default now()
);

comment on table public.eventos_seguranca is
  'Sinal de auditoria de eventos suspeitos observados no navegador. Preenchido pelo cliente, logo não confiável individualmente: serve para ver padrão no agregado. Sem UPDATE/DELETE por design — é trilha.';
comment on column public.eventos_seguranca.detalhe is
  'Metadado curto do evento. Nunca payload, token, texto digitado nem valor de armazenamento.';

create index idx_eventos_seguranca_criado_em on public.eventos_seguranca (criado_em desc);
create index idx_eventos_seguranca_tipo      on public.eventos_seguranca (tipo, criado_em desc);
create index idx_eventos_seguranca_usuario   on public.eventos_seguranca (usuario_id, criado_em desc);

alter table public.eventos_seguranca enable row level security;

create policy eventos_seguranca_insert_propria on public.eventos_seguranca
  for insert to authenticated
  with check (usuario_id = auth.uid());

create policy eventos_seguranca_select_equipe_ti on public.eventos_seguranca
  for select to authenticated
  using (exists (
    select 1 from public.perfis p
    where p.id = auth.uid() and p.papel <> 'solicitante'
  ));
