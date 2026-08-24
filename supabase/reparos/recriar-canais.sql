
select 'canais existentes' as bloco,
       c.id, c.nome, c.slug, c.tipo, c.equipe_id, c.arquivado,
       (select count(*) from public.mensagens m where m.canal_id = c.id) as mensagens
from public.canais c
order by c.arquivado desc, c.tipo, c.nome;

-- 1.b Equipe sem canal nenhum — é aqui que aparece o que foi apagado de fato.
select 'equipe sem canal' as bloco, e.id, e.nome
from public.equipes e
where not exists (select 1 from public.canais c where c.equipe_id = e.id)
order by e.nome;

-- 1.c O canal geral existe?
select 'canal geral' as bloco, count(*) as quantos
from public.canais where tipo = 'geral';

-- 1.d Convenção exata de nome/slug que a trigger aplica. É o que garante que
--     a PARTE 2 recrie igual ao original, em vez de parecido.
select 'trigger de equipes' as bloco, p.proname, pg_get_functiondef(p.oid) as corpo
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_proc  p     on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'equipes' and not t.tgisinternal;

-- 1.e `mensagens` ainda está publicada no Realtime? Fora da publicação, a
--     conversa para de atualizar sozinha — sintoma que também se descreve
--     como "o canal da Supabase sumiu".
select 'realtime' as bloco, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;

-- 1.f `slug` tem restrição de unicidade? Decide se a PARTE 2 pode confiar
--     numa cláusula `on conflict` — por isso ela não usa nenhuma.
select 'unicidade de slug' as bloco, conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.canais'::regclass and contype in ('u','p');


/* ==================================================================
   PARTE 2 — Reparo. Rode só o item que a PARTE 1 apontar.
   ================================================================== */

-- 2.a Canal geral, se a 1.c devolveu zero.
insert into public.canais (nome, slug, tipo, equipe_id, descricao)
select 'Geral', 'geral', 'geral', null, 'Canal aberto a todos.'
where not exists (select 1 from public.canais where tipo = 'geral')
  and not exists (select 1 from public.canais where slug = 'geral');


with novos as (
  select e.id as equipe_id,
         e.nome,
         trim(both '-' from regexp_replace(
           translate(lower(e.nome),
                     'áàâãäéèêëíìîïóòôõöúùûüçñ',
                     'aaaaaeeeeiiiiooooouuuucn'),
           '[^a-z0-9]+', '-', 'g'
         )) as slug
  from public.equipes e
  where not exists (select 1 from public.canais c where c.equipe_id = e.id)
)
insert into public.canais (nome, slug, tipo, equipe_id, descricao)
select n.nome, n.slug, 'equipe', n.equipe_id,
       'Conversa da equipe ' || n.nome || '.'
from novos n
where n.slug <> ''
  and not exists (select 1 from public.canais c where c.slug = n.slug);



-- 2.e Confere.
select c.nome, c.slug, c.tipo, c.equipe_id, c.arquivado,
       (select count(*) from public.mensagens m where m.canal_id = c.id) as mensagens
from public.canais c
order by c.tipo, c.nome;
