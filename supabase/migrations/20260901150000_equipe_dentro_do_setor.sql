-- Equipe passa a morar dentro de um setor.
--
-- Até aqui `equipes` era uma lista plana e `setores` uma árvore, e as duas não
-- se conheciam. O subtítulo da tela de Setores já dizia a relação — "setor é
-- quem pede; equipe é a fila de TI que atende" — mas ela não existia em coluna
-- nenhuma: não havia como responder "quais filas pertencem à Tecnologia?".
--
-- A árvore de setores passa a mostrar as equipes como folhas, e é por
-- arrastar que elas mudam de setor.

/* Anulável de propósito, e é a decisão que importa aqui.
   As cinco equipes que já existem (Service Desk, Infraestrutura, Redes,
   Sistemas, Segurança) nasceram sem setor, e escolher um para elas agora
   seria adivinhar — Service Desk sozinha já responde por 6 chamados e 6
   serviços de catálogo. `null` é um estado honesto: "ainda não foi dito".
   A tela mostra essas equipes num grupo "sem setor", que é de onde se arrasta
   para dentro da árvore.

   `on delete set null` e não `cascade`: apagar um setor não pode levar a fila
   embora junto. `chamados.equipe_id` e `catalogo_servicos.equipe_padrao_id`
   apontam para cá, e a equipe tem de sobreviver ao setor. */

alter table equipes
  add column setor_id uuid references setores(id) on delete set null;

comment on column equipes.setor_id is
  'Setor a que a equipe pertence. Anulável: equipe sem setor aparece no grupo "sem setor" da árvore, e não é erro — é o estado das que existiam antes desta coluna. `on delete set null` porque apagar o setor não pode levar a fila embora: chamados e catálogo apontam para a equipe.';

create index idx_equipe_setor on equipes (setor_id) where setor_id is not null;
