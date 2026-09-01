-- F8b — Trilha de auditoria da mudança: fecha as lacunas de rastreabilidade.
--
-- A migration anterior já pendurou `fn_auditar` em `mudancas` e em
-- `mudanca_aprovacoes`, o que cobre a esteira e os votos do CAB: cada INSERT,
-- UPDATE e DELETE grava linha inteira antes e depois, mais autor e horário.
--
-- Faltavam duas coisas para "toda ação da implantação fica rastreável":
--
--   1. `mudanca_ativos` não tinha gatilho nenhum. Quais itens de configuração
--      a mudança encostou é exatamente o que se procura depois de um incidente
--      pós-implantação, e era a única tabela do módulo sem trilha.
--
--   2. Não havia como LER a trilha de uma mudança. O dado existia e só saía
--      por SQL — rastreabilidade que depende de acesso ao banco não é
--      rastreabilidade para quem responde pela mudança.

/* ------------------------------------------------------------------
   1. Trilha dos ativos afetados
   ------------------------------------------------------------------
   `fn_auditar` não serve aqui: ela deriva `registro_id` de
   `to_jsonb(new)->>'id'`, e `mudanca_ativos` tem chave composta
   (mudanca_id, ativo_id) — não existe coluna `id`. O genérico gravaria
   'desconhecido' em toda linha, e a trilha existiria sem dar para ligar a
   nada.

   Esta versão grava `registro_id = mudanca_id` de propósito: a pergunta que a
   trilha responde é "o que aconteceu com a mudança X", e é por ela que se
   consulta. O ativo vai no corpo, em `valores_antes`/`valores_depois`. */

create function fn_auditar_mudanca_ativos()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into auditoria (tabela, registro_id, operacao, autor_id,
                         valores_antes, valores_depois)
  values (
    tg_table_name,
    coalesce(old.mudanca_id, new.mudanca_id)::text,
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

comment on function fn_auditar_mudanca_ativos() is
  'Auditoria de `mudanca_ativos`. Existe em vez de `fn_auditar` porque a tabela tem chave composta e não tem coluna `id`: aqui `registro_id` é o `mudanca_id`, para a trilha ser consultável pela mudança.';

revoke all on function fn_auditar_mudanca_ativos() from public, anon, authenticated;

create trigger trg_mudanca_ativos_auditoria
  after insert or update or delete on mudanca_ativos
  for each row execute function fn_auditar_mudanca_ativos();

/* ------------------------------------------------------------------
   2. Ler a trilha de uma mudança
   ------------------------------------------------------------------
   SECURITY INVOKER (o padrão) de propósito, e é a decisão que importa aqui:
   assim a policy `auditoria_leitura` (`sou_gestor()`) continua valendo, e
   quem não é gestor recebe zero linhas em vez de a função virar um contorno
   da RLS. Foi exatamente o furo que o endurecimento da F4 fechou em
   `diretorio()` — não vale reabrir com nome novo.

   Zero linhas em vez de exceção pela mesma razão daquele arquivo: a tela já
   trata lista vazia, e erro de permissão em leitura viraria toast de falha
   numa aba que simplesmente não é para aquela pessoa.

   Junta as três tabelas do módulo numa linha do tempo só. O `registro_id` de
   `mudanca_aprovacoes` é o id do próprio voto, não o da mudança — por isso o
   vínculo dela sai de `mudanca_id` dentro do JSONB. */

create function trilha_da_mudanca(p_mudanca uuid)
returns table(
  id bigint,
  tabela text,
  operacao text,
  ocorrido_em timestamptz,
  autor_id uuid,
  autor_nome text,
  valores_antes jsonb,
  valores_depois jsonb
)
language sql stable set search_path to 'public' as $$
  select a.id, a.tabela, a.operacao, a.ocorrido_em, a.autor_id,
         p.nome_completo, a.valores_antes, a.valores_depois
    from auditoria a
    left join perfis p on p.id = a.autor_id
   where (a.tabela = 'mudancas' and a.registro_id = p_mudanca::text)
      or (a.tabela in ('mudanca_aprovacoes', 'mudanca_ativos')
          and coalesce(a.valores_depois->>'mudanca_id',
                       a.valores_antes->>'mudanca_id') = p_mudanca::text)
   order by a.ocorrido_em, a.id
$$;

comment on function trilha_da_mudanca(uuid) is
  'Linha do tempo auditável de uma mudança: esteira, votos do CAB e vínculo de ativos. SECURITY INVOKER de propósito — a policy `auditoria_leitura` (sou_gestor) é que decide quem lê, e não esta função. Não converta para DEFINER.';

revoke all on function trilha_da_mudanca(uuid) from public, anon;
grant execute on function trilha_da_mudanca(uuid) to authenticated;
