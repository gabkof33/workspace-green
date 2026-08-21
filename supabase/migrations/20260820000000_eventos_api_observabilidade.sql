-- Observabilidade de APIs: log de chamadas do frontend ao Supabase.
--
-- Escopo deliberado: só os campos abaixo são gravados — nunca payload de
-- requisição/resposta, headers ou parâmetros de filtro da URL. O acesso de
-- leitura fica restrito a esta única tabela (via RLS) e a três funções de
-- agregação que só leem dela — nada aqui concede acesso mais amplo ao banco.
-- Identificação de quem fez a chamada é só o id interno (`usuario_id`),
-- nunca nome ou e-mail.
--
-- trace_id/parent_span_id/nome_operacao existem só como amarração para a
-- visão de Distributed Tracing pedida — não são "dado extra" registrado por
-- conta própria, são a chave que liga várias chamadas de uma mesma ação.

create table public.eventos_api (
  id              bigint generated always as identity primary key,
  request_id      uuid not null,
  trace_id        uuid not null,
  parent_span_id  uuid null,
  nome_operacao   text null,
  servico_destino text not null,
  endpoint        text not null,
  metodo_http     text not null check (metodo_http in ('GET','POST','PATCH','PUT','DELETE','HEAD')),
  status_code     integer null,
  latencia_ms     integer not null,
  tempo_banco_ms  integer null,
  qtd_registros   integer null,
  usuario_id      uuid not null references public.perfis(id),
  erro_tipo       text null,
  erro_mensagem   text null,
  criado_em       timestamptz not null default now()
);

comment on table public.eventos_api is
  'Log de observabilidade das chamadas do frontend ao Supabase. Só INSERT pelo próprio usuário; sem UPDATE/DELETE por design — é trilha, não cadastro.';
comment on column public.eventos_api.usuario_id is
  'Id interno de quem fez a chamada. Nunca nome/e-mail: se precisar exibir, resolva no cliente com quem já tem permissão para ver perfis.';
comment on column public.eventos_api.tempo_banco_ms is
  'Melhor esforço: extraído do cabeçalho Server-Timing da resposta, quando exposto por CORS. Frequentemente null — não é garantido pela API hospedada.';
comment on column public.eventos_api.qtd_registros is
  'Melhor esforço: extraído do cabeçalho Content-Range da resposta. Null quando a chamada não expõe contagem (ex.: a maioria dos RPCs).';

create index idx_eventos_api_criado_em on public.eventos_api (criado_em desc);
create index idx_eventos_api_trace_id  on public.eventos_api (trace_id, criado_em);
create index idx_eventos_api_destino   on public.eventos_api (servico_destino, criado_em desc);
create index idx_eventos_api_usuario   on public.eventos_api (usuario_id, criado_em desc);
create index idx_eventos_api_erros     on public.eventos_api (criado_em desc)
  where status_code >= 400 or erro_tipo is not null;

alter table public.eventos_api enable row level security;

-- Cada um só grava o próprio evento — nunca em nome de outra pessoa.
create policy eventos_api_insert_propria on public.eventos_api
  for insert to authenticated
  with check (usuario_id = auth.uid());

-- Leitura só para quem já não é solicitante — mesmo corte de `ehAgente()`
-- no frontend. Time inteiro vê o próprio tráfego, não o de terceiros isolado.
create policy eventos_api_select_equipe_ti on public.eventos_api
  for select to authenticated
  using (exists (
    select 1 from public.perfis p where p.id = auth.uid() and p.papel <> 'solicitante'
  ));

-- Necessário para o INSERT chegar ao canal Realtime que a tela assina.
alter publication supabase_realtime add table public.eventos_api;

-- As três funções abaixo são `language sql stable` (SECURITY INVOKER, o
-- padrão do Postgres): rodam com o papel de quem chama e só leem
-- `eventos_api` — não abrem acesso a nenhuma outra tabela.

create or replace function public.grafo_servicos_observabilidade(p_minutos integer default 60)
returns jsonb language sql stable as $$
  with janela as (
    select * from public.eventos_api where criado_em >= now() - (p_minutos || ' minutes')::interval
  ),
  por_destino as (
    select servico_destino,
      count(*) as requisicoes,
      count(*) filter (where status_code >= 400 or erro_tipo is not null) as erros,
      percentile_cont(0.5) within group (order by latencia_ms) as p50_ms,
      percentile_cont(0.95) within group (order by latencia_ms) as p95_ms
    from janela group by servico_destino
  )
  select jsonb_build_object(
    'janela_minutos', p_minutos,
    'nos', coalesce((select jsonb_agg(jsonb_build_object(
        'servico', servico_destino, 'requisicoes', requisicoes, 'erros', erros,
        'taxa_erro', case when requisicoes = 0 then 0 else round(erros::numeric/requisicoes, 4) end,
        'p50_ms', round(coalesce(p50_ms, 0)::numeric, 1), 'p95_ms', round(coalesce(p95_ms, 0)::numeric, 1)
      )) from por_destino), '[]'::jsonb),
    'arestas', coalesce((select jsonb_agg(jsonb_build_object(
        'origem', 'central-ti-web', 'destino', servico_destino, 'requisicoes', requisicoes, 'erros', erros,
        'taxa_erro', case when requisicoes = 0 then 0 else round(erros::numeric/requisicoes, 4) end,
        'p95_ms', round(coalesce(p95_ms, 0)::numeric, 1)
      )) from por_destino), '[]'::jsonb)
  );
$$;
grant execute on function public.grafo_servicos_observabilidade(integer) to authenticated;

create or replace function public.tracos_recentes_observabilidade(p_minutos integer default 60, p_limite integer default 50)
returns jsonb language sql stable as $$
  with base as (
    select * from public.eventos_api where criado_em >= now() - (p_minutos || ' minutes')::interval
  ),
  por_traco as (
    select trace_id, min(nome_operacao) as nome_operacao, min(criado_em) as iniciado_em, max(criado_em) as finalizado_em,
      count(*) as spans, count(*) filter (where status_code >= 400 or erro_tipo is not null) as erros,
      array_agg(distinct servico_destino) as servicos
    from base group by trace_id
  ),
  recortado as (select * from por_traco order by iniciado_em desc limit p_limite)
  select coalesce(jsonb_agg(jsonb_build_object(
    'trace_id', trace_id, 'nome_operacao', nome_operacao, 'iniciado_em', iniciado_em,
    'duracao_ms', round(extract(epoch from (finalizado_em - iniciado_em)) * 1000),
    'spans', spans, 'erros', erros, 'servicos', servicos
  ) order by iniciado_em desc), '[]'::jsonb)
  from recortado;
$$;
grant execute on function public.tracos_recentes_observabilidade(integer, integer) to authenticated;

create or replace function public.kpis_observabilidade(p_minutos integer default 60)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'janela_minutos', p_minutos,
    'total_requisicoes', count(*),
    'total_erros', count(*) filter (where status_code >= 400 or erro_tipo is not null),
    'taxa_erro', case when count(*) = 0 then 0 else
      round(count(*) filter (where status_code >= 400 or erro_tipo is not null)::numeric / count(*), 4) end,
    'p50_ms', round(coalesce(percentile_cont(0.5) within group (order by latencia_ms), 0)::numeric, 1),
    'p95_ms', round(coalesce(percentile_cont(0.95) within group (order by latencia_ms), 0)::numeric, 1),
    'usuarios_ativos', count(distinct usuario_id)
  )
  from public.eventos_api where criado_em >= now() - (p_minutos || ' minutes')::interval;
$$;
grant execute on function public.kpis_observabilidade(integer) to authenticated;

-- Retenção (opcional, desligada por padrão — habilite se o volume exigir):
-- create extension if not exists pg_cron;
-- select cron.schedule('observabilidade_retencao', '0 3 * * *',
--   $$delete from public.eventos_api where criado_em < now() - interval '30 days'$$);
