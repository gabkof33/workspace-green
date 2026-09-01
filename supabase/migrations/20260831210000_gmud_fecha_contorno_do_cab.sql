-- F8b — correções de segurança da GMUD.
--
-- Três achados da revisão do próprio módulo, o primeiro deles bloqueante.
-- Todos existiam desde `20260831120000_gmud_mudancas_cab.sql`.

/* ------------------------------------------------------------------
   1. O contorno do CAB  (ALTA — reproduzido)
   ------------------------------------------------------------------
   A trava de agendamento perguntava `new.aprovada_em is null`. Só que entrar
   em `aprovada` não exigia voto nenhum — a transição apenas CARIMBAVA
   `aprovada_em := now()`. Somado à policy `mudanca_update` (`sou_agente()`),
   qualquer agente, inclusive `agente_n1`, fazia:

     PATCH /mudancas?id=eq.X  {"status":"aprovada"}     -- carimba aprovada_em
     PATCH /mudancas?id=eq.X  {"status":"agendada", ...} -- portão passa

   e uma mudança de risco alto entrava em produção com ZERO votos. Reproduzido
   no banco antes desta correção: status final `agendada`, 0 votos.

   O erro de fundo foi guardar a decisão do comitê num campo DERIVADO e
   escrevível, e depois usar esse campo como prova. `aprovada_em` é carimbo de
   conveniência para a tela; a prova de que o CAB decidiu são as LINHAS de
   `mudanca_aprovacoes`. Agora as duas transições contam voto, e nenhuma delas
   confia em `aprovada_em`.

   `emergencial` continua de fora por desenho: ela implanta primeiro e vota
   depois — é a razão de o tipo existir, e o relatório separa as duas.

   2. A troca de solicitante  (MÉDIA)
   ------------------------------------------------------------------
   `fn_cab_voto_valido` compara `aprovador_id = m.solicitante_id` para impedir
   que quem propõe aprove. Mas `solicitante_id` era coluna comum, e
   `mudanca_update` deixava alterá-la: o gestor criava a mudança, trocava o
   solicitante para outra pessoa e votava na própria proposta. Ficava na
   auditoria, e o controle preventivo morria.

   A coluna passa a ser imutável. A checagem fica ANTES da saída rápida por
   status igual, senão um UPDATE que só troca o solicitante escaparia dela. */

create or replace function fn_mudanca_transicao()
returns trigger
language plpgsql set search_path to 'public' as $$
declare
  v_aprovacoes  int;
  v_reprovacoes int;
begin
  -- (2) Antes de tudo, e fora do `if` de status: é a coluna que sustenta a
  -- segregação de função do CAB.
  if new.solicitante_id <> old.solicitante_id then
    raise exception
      'O solicitante da mudança % não muda. É por ele que o CAB sabe quem não pode votar — trocá-lo desmonta a segregação de função.',
      old.codigo;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status in ('implantada', 'revertida') then
    raise exception
      'Mudança % já foi encerrada como "%". Abra uma nova mudança em vez de reabrir esta.',
      old.codigo, old.status;
  end if;

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

  if new.status in ('agendada', 'em_implantacao')
     and (new.janela_inicio is null or new.janela_fim is null) then
    raise exception
      'Defina a janela de início e fim antes de agendar a mudança %.', new.codigo;
  end if;

  /* (1) O CAB, contado na fonte.

     Vale para `aprovada` E para `agendada`/`em_implantacao`: fechar só o
     agendamento deixaria a mudança parada em "aprovada" sem voto, mentindo
     na lista e no relatório de conformidade. */
  if new.status in ('aprovada', 'agendada', 'em_implantacao')
     and mudanca_exige_cab(new.tipo_mudanca, new.risco)
     and new.tipo_mudanca <> 'emergencial' then

    select count(*) filter (where decisao = 'aprovado'),
           count(*) filter (where decisao = 'reprovado')
      into v_aprovacoes, v_reprovacoes
      from mudanca_aprovacoes
     where mudanca_id = new.id;

    if v_reprovacoes > 0 then
      raise exception
        'A mudança % tem % reprovação(ões) do CAB. Uma reprovação veta.',
        new.codigo, v_reprovacoes;
    end if;

    if v_aprovacoes = 0 then
      raise exception
        'A mudança % exige aprovação do CAB e não tem nenhum voto de aprovação registrado. O carimbo de `aprovada_em` não substitui o voto.',
        new.codigo;
    end if;
  end if;

  if new.status = 'implantada' and new.implantada_em is null then
    new.implantada_em := now();
  end if;
  if new.status = 'aprovada' and new.aprovada_em is null then
    new.aprovada_em := now();
  end if;

  return new;
end $$;

comment on function fn_mudanca_transicao() is
  'Travas da esteira da mudança. O CAB é contado em `mudanca_aprovacoes`, nunca lido de `aprovada_em`: aquele campo é derivado e escrivível por qualquer agente, e usá-lo como prova foi o contorno que esta versão fechou.';

/* ------------------------------------------------------------------
   3. Notas internas vazando para o solicitante  (MÉDIA)
   ------------------------------------------------------------------
   A função publicava `notas_encerramento` dentro de uma interação
   `tipo = 'sistema'`. E a policy `interacao_leitura` é:

     sou_agente() OR (tipo IN ('publica','sistema','mudanca_status')
                      AND chamado.solicitante_id = auth.uid())

   ou seja, `sistema` é visível ao solicitante — que pode ser gente de fora da
   TI. A nota de encerramento é escrita para a operação ("rollback parcial,
   credenciais rotadas, réplica com lag") e não para quem abriu o chamado.

   Agora são duas interações: o fato vai em `sistema`, que o solicitante lê; a
   nota vai em `interna`, que a policy restringe a `sou_agente()`. */

create or replace function fn_mudanca_reflete_chamado()
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

  -- O fato, para quem espera: código, desfecho e resultado. Nada de nota.
  insert into chamado_interacoes (chamado_id, autor_id, tipo, corpo)
  values (
    new.chamado_id,
    coalesce(new.responsavel_id, new.solicitante_id),
    'sistema',
    format('Mudança %s encerrada como "%s". Resultado: %s.',
           new.codigo, new.status, new.resultado)
  );

  -- O detalhe operacional, só para quem atende.
  if coalesce(btrim(new.notas_encerramento), '') <> '' then
    insert into chamado_interacoes (chamado_id, autor_id, tipo, corpo)
    values (
      new.chamado_id,
      coalesce(new.responsavel_id, new.solicitante_id),
      'interna',
      format('Notas de encerramento da mudança %s: %s',
             new.codigo, new.notas_encerramento)
    );
  end if;

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

comment on function fn_mudanca_reflete_chamado() is
  'Devolve ao chamado de origem o desfecho da mudança. O fato vai em interação `sistema` (que o solicitante lê) e as notas de encerramento em `interna` (restrita a `sou_agente()`): a nota é escrita para a operação, não para quem abriu o chamado.';

revoke all on function fn_mudanca_transicao()       from public, anon, authenticated;
revoke all on function fn_mudanca_reflete_chamado() from public, anon, authenticated;
