-- F8b — Gestão de mudanças (GMUD), CAB e implantação.
--
-- Fecha a lacuna que o enum `status_chamado` já anunciava: `pendente_mudanca`
-- existe desde a F4, mas não havia mudança nenhuma para apontar. Um chamado
-- parava "esperando mudança" e a mudança era um combinado verbal.
--
-- O modelo é o de sempre nesta base: o que decide se a mudança pode avançar
-- mora aqui, não na tela. Plano de rollback vazio, janela ausente e CAB não
-- votado são erro de banco — a interface só antecipa a mensagem.

/* ------------------------------------------------------------------
   1. Vocabulário
   ------------------------------------------------------------------
   Três tipos, porque só eles mudam a governança:

   `padrao`      pré-aprovada — troca de HD com peça igual, reset de senha em
                 lote. Não passa por CAB porque o CAB já aprovou a receita.
   `normal`      passa por CAB ANTES de ser agendada.
   `emergencial` implanta primeiro e passa por CAB depois. Não é atalho: é o
                 reconhecimento de que às 3h da manhã com o ERP fora não há
                 comitê, e o que resta é registrar o que foi feito.

   Risco é separado do tipo de propósito: uma mudança `padrao` de risco alto
   volta a exigir CAB (ver `mudanca_exige_cab`). O tipo diz a receita; o risco
   diz o quanto ela dói se der errado. */

create type tipo_mudanca      as enum ('padrao', 'normal', 'emergencial');
create type risco_mudanca     as enum ('baixo', 'medio', 'alto');
create type decisao_cab       as enum ('aprovado', 'reprovado', 'mais_informacoes');
create type resultado_mudanca as enum
  ('sucesso', 'sucesso_com_ressalva', 'revertida', 'falhou');

-- A esteira. `reprovada` e `cancelada` são terminais distintas de propósito:
-- reprovada é decisão do CAB, cancelada é desistência de quem pediu — e a
-- taxa de reprovação só diz algo se a desistência não estiver misturada nela.
create type status_mudanca as enum (
  'rascunho', 'avaliacao', 'aguardando_cab', 'aprovada', 'reprovada',
  'agendada', 'em_implantacao', 'implantada', 'revertida', 'cancelada'
);

/* ------------------------------------------------------------------
   2. Quem precisa de CAB
   ------------------------------------------------------------------
   Função à parte, e não expressão solta, porque a regra é lida em dois
   lugares — a coluna gerada e o gatilho de transição — e regra duplicada
   é regra que vai divergir. `immutable` é requisito da coluna gerada. */

create function mudanca_exige_cab(p_tipo tipo_mudanca, p_risco risco_mudanca)
returns boolean
language sql immutable set search_path = '' as $$
  select p_tipo <> 'padrao'::public.tipo_mudanca
      or p_risco = 'alto'::public.risco_mudanca
$$;

comment on function mudanca_exige_cab(tipo_mudanca, risco_mudanca) is
  'Mudança padrão de risco baixo ou médio dispensa CAB — o comitê já aprovou a receita. Qualquer outra combinação exige voto. Lida pela coluna gerada `mudancas.exige_cab` e pelo gatilho de transição: não reescreva a regra num terceiro lugar.';

/* ------------------------------------------------------------------
   3. A mudança
   ------------------------------------------------------------------ */

create sequence seq_mudanca;

create table mudancas (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,
  titulo         text not null,
  descricao      text not null,

  -- Por que mexer. Coluna obrigatória porque mudança sem justificativa
  -- escrita é a que ninguém consegue defender na revisão pós-incidente.
  justificativa  text not null,

  tipo_mudanca   tipo_mudanca   not null default 'normal',
  risco          risco_mudanca  not null default 'medio',
  status         status_mudanca not null default 'rascunho',

  servico_id     uuid references catalogo_servicos(id) on delete set null,
  equipe_id      uuid references equipes(id)           on delete set null,
  solicitante_id uuid not null references perfis(id),
  responsavel_id uuid references perfis(id),

  -- Os três planos. Nulos no rascunho e obrigatórios para sair dele: é o
  -- mesmo desenho de "rotina sem runbook não é agendada".
  plano_implantacao text,
  plano_rollback    text,
  plano_teste       text,

  janela_inicio timestamptz,
  janela_fim    timestamptz,

  indisponibilidade_prevista boolean not null default false,
  comunicado                 text,

  -- Origem. Uma mudança nasce de um incidente (a correção definitiva do que
  -- foi contornado) ou de uma demanda (trabalho planejado).
  chamado_id uuid references chamados(id) on delete set null,
  demanda_id uuid references demandas(id) on delete set null,

  -- Derivada, nunca digitada — o mesmo tratamento de `chamados.prioridade`.
  -- Se alguém pudesse marcar "não precisa de CAB", toda mudança apertada
  -- viraria uma dessas.
  exige_cab boolean not null
    generated always as (mudanca_exige_cab(tipo_mudanca, risco)) stored,

  aprovada_em   timestamptz,
  implantada_em timestamptz,

  resultado          resultado_mudanca,
  notas_encerramento text,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint mudanca_janela_coerente check (
    janela_inicio is null or janela_fim is null or janela_fim > janela_inicio
  ),

  -- Encerrada sem resultado é o registro que não ensina nada seis meses
  -- depois. A trava é a mesma ideia do fechamento de chamado sem causa raiz.
  constraint mudanca_encerrada_tem_resultado check (
    status not in ('implantada', 'revertida') or resultado is not null
  )
);

comment on table mudancas is
  'Mudanças controladas (GMUD). Sem exclusão depois do rascunho: use o status cancelada — a auditoria e o histórico de CAB dependem da linha permanecer.';
comment on column mudancas.exige_cab is
  'Coluna gerada por `mudanca_exige_cab()`. Não é editável de propósito: mudança apertada sempre acharia um motivo para dispensar o comitê.';

create index idx_mudanca_status  on mudancas (status);
create index idx_mudanca_janela  on mudancas (janela_inicio);
create index idx_mudanca_servico on mudancas (servico_id);
create index idx_mudanca_chamado on mudancas (chamado_id) where chamado_id is not null;

/* Ativos que a mudança encosta — o recorte de CMDB que o CAB precisa ver. */

create table mudanca_ativos (
  mudanca_id uuid not null references mudancas(id) on delete cascade,
  ativo_id   uuid not null references ativos(id)   on delete cascade,
  primary key (mudanca_id, ativo_id)
);

comment on table mudanca_ativos is
  'Itens de configuração afetados. É por aqui que o alcance de impacto do CMDB (`ativos_impactados`) passa a valer para uma mudança.';

/* ------------------------------------------------------------------
   4. O CAB
   ------------------------------------------------------------------
   Um voto por gestor, e o voto é uma linha — não uma coluna na mudança.
   Coluna guardaria só a última decisão; a linha guarda quem disse o quê e
   quando, que é exatamente o que se procura quando a mudança dá errado. */

create table mudanca_aprovacoes (
  id           uuid primary key default gen_random_uuid(),
  mudanca_id   uuid not null references mudancas(id) on delete cascade,
  aprovador_id uuid not null references perfis(id),
  decisao      decisao_cab not null,
  comentario   text,
  decidido_em  timestamptz not null default now(),
  unique (mudanca_id, aprovador_id)
);

comment on table mudanca_aprovacoes is
  'Votos do CAB, um por gestor. Alterável (quem pediu mais informações volta e decide), nunca apagável — voto retirado do histórico é o que falta justo na revisão do incidente.';

/* ------------------------------------------------------------------
   5. Numeração e herança do catálogo
   ------------------------------------------------------------------ */

create function fn_mudanca_inicializar()
returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if new.codigo is null then
    new.codigo := 'MUD-' || to_char(new.criado_em, 'YYYY')
                  || '-' || lpad(nextval('seq_mudanca')::text, 4, '0');
  end if;

  -- Mesma herança do chamado: a fila sai do catálogo, não do formulário.
  if new.equipe_id is null and new.servico_id is not null then
    select equipe_padrao_id into new.equipe_id
      from catalogo_servicos where id = new.servico_id;
  end if;

  return new;
end $$;

/* ------------------------------------------------------------------
   6. A esteira
   ------------------------------------------------------------------
   Cada trava aqui responde a uma forma conhecida de a mudança dar errado.
   Nenhuma delas é validação de formulário: são o que sobra quando alguém
   automatiza a criação de mudanças por script e pula a tela inteira. */

create function fn_mudanca_transicao()
returns trigger
language plpgsql set search_path to 'public' as $$
declare
  v_aprovacoes int;
  v_reprovacoes int;
begin
  if new.status = old.status then
    return new;
  end if;

  -- Implantada é ponto final. Reabrir apagaria `implantada_em` e o resultado,
  -- e com eles a única prova de que a janela foi usada.
  if old.status in ('implantada', 'revertida') then
    raise exception
      'Mudança % já foi encerrada como "%". Abra uma nova mudança em vez de reabrir esta.',
      old.codigo, old.status;
  end if;

  -- Sair do rascunho exige os planos escritos. O de rollback é o que mais
  -- importa: sem ele, "deu errado" não tem próximo passo às 3h da manhã.
  if old.status = 'rascunho' and new.status <> 'cancelada' then
    if coalesce(btrim(new.plano_implantacao), '') = '' then
      raise exception
        'Descreva o plano de implantação antes de submeter a mudança %.', new.codigo;
    end if;
    if coalesce(btrim(new.plano_rollback), '') = '' then
      raise exception
        'Descreva o plano de rollback antes de submeter a mudança %. Mudança sem caminho de volta não é controlada.', new.codigo;
    end if;
  end if;

  -- Agendar sem janela é o que produz a mudança que "entrou a qualquer hora".
  if new.status in ('agendada', 'em_implantacao')
     and (new.janela_inicio is null or new.janela_fim is null) then
    raise exception
      'Defina a janela de início e fim antes de agendar a mudança %.', new.codigo;
  end if;

  -- CAB antes de agendar. Emergencial escapa por desenho — ela vota depois —
  -- e é justamente por isso que o relatório separa as duas.
  if new.status in ('agendada', 'em_implantacao')
     and mudanca_exige_cab(new.tipo_mudanca, new.risco)
     and new.tipo_mudanca <> 'emergencial'
     and new.aprovada_em is null then
    raise exception
      'A mudança % exige aprovação do CAB antes de ser agendada.', new.codigo;
  end if;

  -- Uma reprovação veta. O comitê não é média ponderada: quem enxergou o
  -- problema que os outros não viram é quem tem a informação que falta.
  if new.status in ('agendada', 'em_implantacao') then
    select count(*) filter (where decisao = 'aprovado'),
           count(*) filter (where decisao = 'reprovado')
      into v_aprovacoes, v_reprovacoes
      from mudanca_aprovacoes where mudanca_id = new.id;

    if v_reprovacoes > 0 then
      raise exception
        'A mudança % tem % reprovação(ões) do CAB e não pode ser agendada.',
        new.codigo, v_reprovacoes;
    end if;
  end if;

  -- Carimbos. Ficam no banco porque data preenchida pela tela é data que
  -- depende do relógio de quem clicou.
  if new.status = 'implantada' and new.implantada_em is null then
    new.implantada_em := now();
  end if;
  if new.status = 'aprovada' and new.aprovada_em is null then
    new.aprovada_em := now();
  end if;

  return new;
end $$;

/* ------------------------------------------------------------------
   7. Exclusão
   ------------------------------------------------------------------ */

create function fn_mudanca_exclusao()
returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if old.status <> 'rascunho' then
    raise exception
      'A mudança % já saiu do rascunho e não é apagada. Use o status cancelada — a auditoria e os votos do CAB dependem da linha permanecer.',
      old.codigo;
  end if;
  return old;
end $$;

/* ------------------------------------------------------------------
   8. Voto do CAB
   ------------------------------------------------------------------ */

create function fn_cab_voto_valido()
returns trigger
language plpgsql set search_path to 'public' as $$
declare
  m record;
begin
  select * into m from mudancas where id = new.mudanca_id;
  if not found then
    raise exception 'Mudança % não existe.', new.mudanca_id;
  end if;

  -- Segregação de função. Quem propõe não aprova: é a trava que faz o CAB
  -- ser um comitê e não um carimbo do próprio autor.
  if new.aprovador_id = m.solicitante_id then
    raise exception
      'Quem solicitou a mudança % não pode votá-la. Aprovação precisa de um segundo gestor.',
      m.codigo;
  end if;

  if not sou_gestor() then
    raise exception 'Só gestor ou admin vota no CAB.';
  end if;

  -- Voto em rascunho não significa nada: o texto ainda muda depois dele.
  if m.status = 'rascunho' then
    raise exception
      'A mudança % ainda é rascunho. Submeta para avaliação antes de levar ao CAB.', m.codigo;
  end if;

  return new;
end $$;

/* Consolida os votos no status da mudança.

   O status é consequência dos votos, não um campo que alguém marca em
   seguida — assim o histórico do CAB e a esteira nunca contam versões
   diferentes da mesma decisão. */

create function fn_cab_consolidar()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_mudanca uuid := coalesce(new.mudanca_id, old.mudanca_id);
  v_aprovacoes int;
  v_reprovacoes int;
  m record;
begin
  select * into m from mudancas where id = v_mudanca;

  -- Emergencial vota depois de implantar: consolidar aqui sobrescreveria o
  -- desfecho real com "aprovada". O voto fica registrado e o status não muda.
  if m.status in ('implantada', 'revertida', 'cancelada') then
    return null;
  end if;

  select count(*) filter (where decisao = 'aprovado'),
         count(*) filter (where decisao = 'reprovado')
    into v_aprovacoes, v_reprovacoes
    from mudanca_aprovacoes where mudanca_id = v_mudanca;

  if v_reprovacoes > 0 then
    update mudancas set status = 'reprovada' where id = v_mudanca;
  elsif v_aprovacoes > 0 then
    update mudancas set status = 'aprovada', aprovada_em = coalesce(aprovada_em, now())
     where id = v_mudanca;
  end if;

  return null;
end $$;

/* ------------------------------------------------------------------
   9. O que a mudança devolve para o chamado
   ------------------------------------------------------------------
   Aqui o `pendente_mudanca` finalmente fecha o ciclo: o chamado que parou
   esperando a mudança recebe a nota quando ela entra, sem ninguém precisar
   lembrar de voltar lá. */

create function fn_mudanca_reflete_chamado()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  c record;
begin
  if new.chamado_id is null or new.status = old.status
     or new.status not in ('implantada', 'revertida') then
    return new;
  end if;

  select * into c from chamados where id = new.chamado_id;
  if not found then
    return new;
  end if;

  insert into chamado_interacoes (chamado_id, autor_id, tipo, corpo)
  values (
    new.chamado_id,
    coalesce(new.responsavel_id, new.solicitante_id),
    'sistema',
    format('Mudança %s encerrada como "%s". Resultado: %s.%s',
           new.codigo, new.status, new.resultado,
           coalesce(E'\n' || new.notas_encerramento, ''))
  );

  -- Só avisa quem está esperando. Chamado já resolvido não precisa de ping.
  if c.status = 'pendente_mudanca' then
    insert into notificacoes (destinatario_id, remetente_id, tipo, titulo, corpo, destino)
    values (
      c.solicitante_id,
      coalesce(new.responsavel_id, new.solicitante_id),
      'mudanca',
      format('A mudança que travava %s foi encerrada', c.numero),
      format('%s — %s', new.codigo, new.titulo),
      'chamado/' || c.id
    );
  end if;

  return new;
end $$;

/* Avisos da esteira: quem vai fazer, e o comitê que precisa votar. */

create function fn_mudanca_notificar()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_eu uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
begin
  if new.responsavel_id is not null
     and new.responsavel_id is distinct from old.responsavel_id
     and new.responsavel_id <> v_eu then
    insert into notificacoes (destinatario_id, remetente_id, tipo, titulo, corpo, destino)
    values (new.responsavel_id, auth.uid(), 'atribuicao',
            'Mudança atribuída a você: ' || new.codigo, new.titulo,
            'mudanca/' || new.codigo);
  end if;

  -- CAB que ninguém sabe que existe é mudança parada por uma semana.
  if new.status = 'aguardando_cab' and old.status <> 'aguardando_cab' then
    insert into notificacoes (destinatario_id, remetente_id, tipo, titulo, corpo, destino)
    select p.id, auth.uid(), 'cab',
           'CAB: ' || new.codigo || ' aguarda seu voto', new.titulo,
           'mudanca/' || new.codigo
      from perfis p
     where p.papel in ('gestor', 'admin')
       and p.ativo
       and p.id <> new.solicitante_id
       and p.id <> v_eu;
  end if;

  return new;
end $$;

/* ------------------------------------------------------------------
   10. Gatilhos
   ------------------------------------------------------------------ */

create trigger trg_mudanca_inicializar
  before insert on mudancas
  for each row execute function fn_mudanca_inicializar();

create trigger trg_mudanca_transicao
  before update on mudancas
  for each row execute function fn_mudanca_transicao();

create trigger trg_mudanca_atualizada
  before update on mudancas
  for each row execute function fn_marcar_atualizacao();

create trigger trg_mudanca_exclusao
  before delete on mudancas
  for each row execute function fn_mudanca_exclusao();

create trigger trg_mudanca_reflete_chamado
  after update of status on mudancas
  for each row execute function fn_mudanca_reflete_chamado();

create trigger trg_mudanca_notificar
  after update on mudancas
  for each row execute function fn_mudanca_notificar();

create trigger trg_mudancas_auditoria
  after insert or update or delete on mudancas
  for each row execute function fn_auditar();

create trigger trg_cab_voto_valido
  before insert or update on mudanca_aprovacoes
  for each row execute function fn_cab_voto_valido();

create trigger trg_cab_consolidar
  after insert or update on mudanca_aprovacoes
  for each row execute function fn_cab_consolidar();

create trigger trg_cab_auditoria
  after insert or update or delete on mudanca_aprovacoes
  for each row execute function fn_auditar();

/* ------------------------------------------------------------------
   11. Função de gatilho não é endpoint
   ------------------------------------------------------------------
   Toda função de gatilho desta base tem EXECUTE revogado de `anon` e
   `authenticated` — o `grant` que o Postgres dá por padrão (PUBLIC) as expõe
   em `/rest/v1/rpc/<nome>`. Chamar uma delas fora do gatilho falha ("can only
   be called as a trigger"), mas as três `security definer` daqui rodam como
   dono e não vale contar com a mensagem de erro como controle de acesso.

   O mesmo tratamento do `20260821130000_endurecimento_seguranca.sql`: quem
   decide quem escreve nas notificações é o gatilho, não uma rota REST. */

revoke all on function fn_mudanca_inicializar()      from public, anon, authenticated;
revoke all on function fn_mudanca_transicao()        from public, anon, authenticated;
revoke all on function fn_mudanca_exclusao()         from public, anon, authenticated;
revoke all on function fn_mudanca_reflete_chamado()  from public, anon, authenticated;
revoke all on function fn_mudanca_notificar()        from public, anon, authenticated;
revoke all on function fn_cab_voto_valido()          from public, anon, authenticated;
revoke all on function fn_cab_consolidar()           from public, anon, authenticated;

/* ------------------------------------------------------------------
   12. RLS
   ------------------------------------------------------------------
   Mudança é trabalho interno de TI: a leitura segue o corte de `rotinas`
   (`sou_agente()`). A exceção é quem solicitou — inclusive porque uma
   mudança pode nascer do chamado de um solicitante. */

alter table mudancas            enable row level security;
alter table mudanca_ativos      enable row level security;
alter table mudanca_aprovacoes  enable row level security;

create policy mudanca_leitura on mudancas
  for select to authenticated
  using (sou_agente() or solicitante_id = auth.uid());

create policy mudanca_abertura on mudancas
  for insert to authenticated
  with check (sou_agente() and solicitante_id = auth.uid());

create policy mudanca_update on mudancas
  for update to authenticated
  using (sou_agente()) with check (sou_agente());

-- Apagar só o próprio rascunho, e o gatilho ainda barra qualquer outro status.
create policy mudanca_exclusao on mudancas
  for delete to authenticated
  using (sou_gestor() or solicitante_id = auth.uid());

create policy mudanca_ativos_leitura on mudanca_ativos
  for select to authenticated using (sou_agente());

create policy mudanca_ativos_escrita on mudanca_ativos
  for all to authenticated using (sou_agente()) with check (sou_agente());

-- O voto é público para a equipe de propósito: CAB secreto não é auditável.
create policy cab_leitura on mudanca_aprovacoes
  for select to authenticated using (sou_agente());

create policy cab_voto on mudanca_aprovacoes
  for insert to authenticated
  with check (sou_gestor() and aprovador_id = auth.uid());

create policy cab_revisao on mudanca_aprovacoes
  for update to authenticated
  using (sou_gestor() and aprovador_id = auth.uid())
  with check (sou_gestor() and aprovador_id = auth.uid());

/* ------------------------------------------------------------------
   13. As duas abas novas
   ------------------------------------------------------------------
   `fn_validar_abas_setor` valida `setores.abas` contra esta lista, então uma
   aba fora dela não pode ser atribuída a setor nenhum — a tela existiria e
   seria impossível de liberar. */

create or replace function abas_conhecidas()
returns text[]
language sql immutable set search_path to 'public' as $$
  select array[
    'abrir', 'meus', 'fila',
    'demandas', 'gantt',
    'conversas', 'pessoas', 'setores',
    'rotinas', 'ativos', 'conhecimento', 'painel',
    'tempos', 'postmortems',
    'catalogo', 'mudancas'
  ]
$$;
