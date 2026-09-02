/** Quadro de setores — a árvore da empresa. */

import { criarAvatar } from "@/components/avatar";
import { criarBarraFiltros } from "@/components/barra-filtros";
import { dentroDoPeriodo } from "@/lib/periodo";
import { aguardando } from "@/components/esqueleto";
import { areaCarregando } from "@/components/spinner";
import { avisar, h, icone, ICONES, montar } from "@/lib/dom";
import { confirmar, perguntar } from "@/components/dialogo";
import {
  criarTabelaDados,
  type TabelaDados,
} from "@/components/tabela-dados";
import { ROTULOS_HIERARQUIA, ROTULOS_SENIORIDADE } from "@/components/insignia";
import { listarDiretorio, perfisDoSetor, podeGerirPessoas } from "@/lib/api";
import {
  ABAS_CONFIGURAVEIS,
  ABAS_PADRAO_SETOR,
  alternarEquipe,
  alternarSetor,
  apenasAreas,
  contarVinculosDaEquipe,
  criarEquipe,
  criarSetor,
  definirAbas,
  definirEquipeDaPessoa,
  definirGestorDireto,
  excluirEquipe,
  excluirSetor,
  listarEquipesDaArvore,
  listarPessoasDaArvore,
  listarSetores,
  type PessoaNaArvore,
  moverEquipe,
  moverSetor,
  pessoasDaEquipe,
  renomearSetor,
  renumerarIrmaos,
} from "@/lib/setores";
import {
  criarArvoreSetores,
  irmaosDepoisDoMovimento,
  type Movimento,
  type NoArvore,
} from "@/components/arvore-setores";
import type {
  Equipe,
  Perfil,
  PerfilDoSetor,
  SetorArvore,
} from "@/types/dominio";

export function renderizarSetores(alvo: HTMLElement, perfil: Perfil): void {
  let arvore: SetorArvore[] = [];
  let equipes: Equipe[] = [];
  let pessoas: PessoaNaArvore[] = [];
  /** Cartões (o que existia) ou dendrograma arrastável. */
  let vista: "quadro" | "arvore" = "arvore";
  let novoEm: string | null | undefined; // undefined = fechado; null = nova área
  let configurando: string | null = null;
  /** Setor com o quadro de pessoas aberto. Um por vez: são tabelas largas. */
  let pessoasAbertas: string | null = null;
  /** Equipe com o quadro de colaboradores aberto, na vista de árvore. */
  let equipeAberta: string | null = null;

  /**
   * Uma tabela por setor, criada na primeira abertura e guardada.
   *
   * A tela inteira se redesenha a cada mudança de estado, e recriar a tabela
   * junto jogaria fora busca, ordenação e página — além de refazer a consulta.
   * Guardando a instância, o `montar` só reencaixa o mesmo elemento.
   */
  const tabelas = new Map<string, TabelaDados<PerfilDoSetor>>();

  const podeGerir = podeGerirPessoas(perfil);
  // `tabela-ds` é o que veste a grade do `tabela-dados.ts`; `chips-ds` os
  // selos das células e `feedback-ds` o estado vazio dela.
  const area = h("div", {
    class: "pilha tabela-ds chips-ds formulario-ds feedback-ds",
  });
  montar(alvo, area);

  // `barraFiltros` e não `barra`: o nome já é da função que monta a linha.
  const barraFiltros = criarBarraFiltros({
    aoMudar: () => desenhar(),
    filtros: [
      { chave: "data", rotulo: "Criado", tipo: "periodo" },
      { chave: "inativos", rotulo: "Mostrar desativados", tipo: "liga" },
    ],
  });

  const desenhar = (): void => {
    aguardando(area, "lista");
    void Promise.all([
      listarSetores(barraFiltros.ligado("inativos")),
      listarEquipesDaArvore(),
      listarPessoasDaArvore(),
    ])
      .then(([lista, listaEquipes, listaPessoas]) => {
        arvore = lista.filter((s) =>
          dentroDoPeriodo(s.criado_em, barraFiltros.periodo("data")),
        );
        equipes = listaEquipes;
        pessoas = listaPessoas;
        montar(
          area,
          resumo(),
          barra(),
          novoEm !== undefined ? formNovo(novoEm) : null,
          arvore.length === 0
            ? vazio()
            : vista === "arvore"
              ? painelArvore()
              : quadro(),
        );
      })
      .catch((e: unknown) =>
        avisar(e instanceof Error ? e.message : "Falha ao carregar.", "erro"),
      );
  };

  /* ---------- Árvore ---------- */

  /**
   * Monta os nós a partir das duas listas.
   *
   * Equipe sem setor entra como RAIZ, ao lado das áreas, e não num grupo
   * inventado: ela é literalmente um nó sem pai, e um contêiner falso "sem
   * setor" precisaria de um id falso que o arrastar teria de tratar como
   * exceção em todo lugar. Como raiz, ela cai nas mesmas regras das demais.
   */
  const construirNos = (): NoArvore[] => {
    const filhosDe = new Map<string | null, SetorArvore[]>();
    for (const s of arvore) {
      const chave = s.setor_pai_id;
      const lista = filhosDe.get(chave) ?? [];
      lista.push(s);
      filhosDe.set(chave, lista);
    }

    const equipesDe = new Map<string, Equipe[]>();
    for (const e of equipes) {
      if (!e.setor_id) continue;
      const lista = equipesDe.get(e.setor_id) ?? [];
      lista.push(e);
      equipesDe.set(e.setor_id, lista);
    }

    /**
     * As pessoas de uma equipe, aninhadas por quem manda em quem.
     *
     * A raiz da gente dentro da equipe é quem NÃO tem gestor direto na mesma
     * equipe: o gestor da fila aparece no topo, e quem responde a ele desce
     * embaixo, recursivamente. Se o gestor de alguém está em outra equipe, essa
     * pessoa também sobe para a raiz — senão ela desapareceria da árvore por
     * não ter onde se pendurar.
     */
    const pessoasDeEquipe = (equipeId: string): NoArvore[] => {
      const daEquipe = pessoas.filter((p) => p.equipe_id === equipeId);
      const idsAqui = new Set(daEquipe.map((p) => p.id));

      const noPessoa = (p: PessoaNaArvore): NoArvore => ({
        id: p.id,
        nome: p.nome_completo,
        tipo: "pessoa",
        paiId: p.gestor_direto_id,
        nota: p.cargo ?? ROTULOS_HIERARQUIA[p.hierarquia],
        ativo: true,
        filhos: daEquipe
          .filter((f) => f.gestor_direto_id === p.id)
          .map(noPessoa),
      });

      return daEquipe
        .filter(
          (p) =>
            p.gestor_direto_id === null || !idsAqui.has(p.gestor_direto_id),
        )
        .map(noPessoa);
    };

    const noEquipe = (e: Equipe): NoArvore => ({
      id: e.id,
      nome: e.nome,
      tipo: "equipe",
      paiId: e.setor_id,
      nota: `N${e.nivel}`,
      ativo: true,
      filhos: pessoasDeEquipe(e.id),
    });

    const noSetor = (s: SetorArvore): NoArvore => ({
      id: s.id,
      nome: s.nome,
      tipo: "setor",
      paiId: s.setor_pai_id,
      nota: s.pessoas > 0 ? `${s.pessoas} pessoas` : undefined,
      ativo: s.ativo,
      filhos: [
        ...(filhosDe.get(s.id) ?? []).map(noSetor),
        ...(equipesDe.get(s.id) ?? []).map(noEquipe),
      ],
    });

    return [
      ...(filhosDe.get(null) ?? []).map(noSetor),
      ...equipes.filter((e) => !e.setor_id).map(noEquipe),
    ];
  };

  /**
   * Grava o movimento.
   *
   * Equipe e setor gravam coisas diferentes: equipe só troca de setor
   * (`setor_id`), porque ela não tem `ordem` — a lista de filas de um setor
   * não tem posição que importe. Setor troca de pai E renumera os irmãos, que
   * é o que mantém a `ordem` densa.
   */
  const aplicarMovimento = (mov: Movimento): void => {
    const nos = construirNos();
    const achar = (lista: NoArvore[], id: string): NoArvore | null => {
      for (const n of lista) {
        if (n.id === id) return n;
        const dentro = achar(n.filhos, id);
        if (dentro) return dentro;
      }
      return null;
    };

    // Pessoa: dentro de equipe = lotação; dentro de pessoa = passa a depender
    // dela. São duas colunas diferentes, e o alvo diz qual.
    if (mov.arrastado.tipo === "pessoa") {
      const acao =
        mov.alvo.tipo === "equipe"
          ? definirEquipeDaPessoa(mov.arrastado.id, mov.alvo.id)
          : definirGestorDireto(mov.arrastado.id, mov.alvo.id);

      void acao
        .then(() => {
          avisar(
            mov.alvo.tipo === "equipe"
              ? `${mov.arrastado.nome} lotado em ${mov.alvo.nome}.`
              : `${mov.arrastado.nome} agora responde a ${mov.alvo.nome}.`,
            "ok",
          );
          desenhar();
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha ao mover.", "erro"),
        );
      return;
    }

    if (mov.arrastado.tipo === "equipe") {
      // Solto dentro de um setor, vai para ele. Solto ao lado de uma raiz,
      // volta a ficar sem setor — que é como ela sai da árvore.
      const destino =
        mov.posicao === "dentro"
          ? mov.alvo.id
          : (achar(nos, mov.alvo.id)?.paiId ?? null);

      void moverEquipe(mov.arrastado.id, destino)
        .then(() => {
          avisar(
            destino
              ? `${mov.arrastado.nome} agora pertence a ${mov.alvo.nome}.`
              : `${mov.arrastado.nome} ficou sem setor.`,
            "ok",
          );
          desenhar();
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha ao mover.", "erro"),
        );
      return;
    }

    const novoPai =
      mov.posicao === "dentro"
        ? mov.alvo.id
        : (achar(nos, mov.alvo.id)?.paiId ?? null);

    // Os irmãos do destino, já sem o arrastado e com ele no lugar novo.
    const irmaos =
      mov.posicao === "dentro"
        ? (achar(nos, mov.alvo.id)?.filhos ?? [])
        : novoPai === null
          ? nos
          : (achar(nos, novoPai)?.filhos ?? []);

    const ordenados = irmaosDepoisDoMovimento(
      irmaos.filter((n) => n.tipo === "setor"),
      mov,
    );

    void moverSetor(
      mov.arrastado.id,
      novoPai,
      ordenados.indexOf(mov.arrastado.id),
    )
      .then(() => renumerarIrmaos(ordenados))
      .then(() => {
        avisar(`${mov.arrastado.nome} movido.`, "ok");
        desenhar();
      })
      .catch((e: unknown) =>
        avisar(e instanceof Error ? e.message : "Falha ao mover.", "erro"),
      );
  };

  const painelArvore = (): HTMLElement =>
    h(
      "div",
      { class: "cartao", style: "padding:0" },
      h(
        "div",
        { class: "aviso aviso--info", style: "margin:var(--s-3)" },
        h("span", { class: "aviso__icone" }, "i"),
        h(
          "span",
          {},
          podeGerir
            ? "Arraste uma caixa para reorganizar: solte no MEIO de outra para virar filho dela, ou na BORDA para reordenar entre irmãos."
            : "Somente a gestão reorganiza a estrutura. Aqui a árvore é só leitura.",
        ),
      ),
      criarArvoreSetores({
        raizes: construirNos(),
        aoMover: podeGerir ? aplicarMovimento : undefined,
        acoes: (no) => {
          if (!podeGerir) return [];
          return no.tipo === "setor"
            ? [botaoNovaEquipe(no), botaoExcluirSetor(no)]
            : [botaoPessoasDaEquipe(no), botaoDesativarEquipe(no)];
        },
      }),
      // Fora da árvore, não dentro da caixa: a lista de pessoas com busca e
      // seletor não cabe num nó de dendrograma sem esticar a linha inteira.
      equipeAberta ? painelPessoasEquipe(equipeAberta) : null,
    );

  /**
   * Botão só de ícone: a caixa da árvore é `nowrap`, e duas ações em texto
   * dobrariam a largura de cada nó. O `title` e o `aria-label` carregam o
   * rótulo que o ícone não diz.
   */
  const botaoAcao = (
    rotulo: string,
    simbolo: typeof ICONES.excluir,
    aoClicar: () => void,
    perigo = false,
  ): HTMLElement =>
    h(
      "button",
      {
        class: `btn btn--sm btn--icone btn--pilula${perigo ? " btn--perigo" : " btn--sutil"}`,
        type: "button",
        title: rotulo,
        aria: { label: rotulo },
        on: {
          click: (ev: Event) => {
            ev.stopPropagation();
            aoClicar();
          },
        },
      },
      icone(simbolo),
    );

  /**
   * Excluir setor.
   *
   * O aviso conta as duas consequências que a pessoa não vê na caixa: os
   * subsetores (que o banco recusa apagar junto, por chave estrangeira) e as
   * equipes, que NÃO bloqueiam — `equipes.setor_id` é `on delete set null`, e
   * elas voltam sozinhas para "sem setor". São desfechos diferentes e valem
   * ser ditos antes, não descobertos depois.
   */
  const botaoExcluirSetor = (no: NoArvore): HTMLElement => {
    const subsetores = no.filhos.filter((f) => f.tipo === "setor").length;
    const equipesDentro = no.filhos.filter((f) => f.tipo === "equipe").length;

    const consequencias = [
      subsetores > 0
        ? `Tem ${subsetores} subsetor(es): o banco vai recusar até que sejam removidos ou movidos.`
        : null,
      equipesDentro > 0
        ? `As ${equipesDentro} equipe(s) dentro dele NÃO são apagadas — voltam para "sem setor".`
        : null,
      "Setor com pessoas ou registros vinculados também é recusado. Nesse caso, desative em vez de excluir.",
    ]
      .filter(Boolean)
      .join(" ");

    return botaoAcao(
      `Excluir o setor ${no.nome}`,
      ICONES.excluir,
      () => {
        void confirmar({
          titulo: `Excluir ${no.nome}?`,
          texto: "A exclusão é definitiva.",
          consequencia: consequencias,
          rotuloConfirmar: "Excluir setor",
          perigo: true,
        }).then((ok) => {
          if (!ok) return;
          return excluirSetor(no.id)
            .then(() => {
              avisar(`${no.nome} excluído.`, "ok");
              desenhar();
            })
            .catch((e: unknown) =>
              avisar(
                e instanceof Error ? e.message : "Falha ao excluir.",
                "erro",
              ),
            );
        });
      },
      true,
    );
  };

  /**
   * Quadro de colaboradores da equipe.
   *
   * "Adicionar", não "criar", e a diferença é do modelo: `perfis.id` referencia
   * `auth.users(id)`, então pessoa sem conta de autenticação não existe. Criar
   * gente daqui pediria a chave `service_role` no navegador, o que não se faz.
   * Quem entra novo entra pelo autocadastro.
   *
   * O painel abre embaixo da árvore e não num diálogo: escolher entre dezenas
   * de pessoas é navegação, e diálogo com lista longa vira uma tela dentro de
   * outra, sem lugar para buscar.
   */
  const botaoPessoasDaEquipe = (no: NoArvore): HTMLElement =>
    botaoAcao(`Colaboradores de ${no.nome}`, ICONES.pessoas, () => {
      equipeAberta = equipeAberta === no.id ? null : no.id;
      desenhar();
    });

  const painelPessoasEquipe = (equipeId: string): HTMLElement => {
    const eq = equipes.find((e) => e.id === equipeId);
    const caixa = h(
      "div",
      { class: "cartao", style: "margin-top:var(--s-3)" },
      areaCarregando("Carregando a equipe"),
    );

    const recarregar = (): void => {
      void Promise.all([pessoasDaEquipe(equipeId), listarDiretorio()])
        .then(([dentro, diretorio]) => {
          const idsDentro = new Set(dentro.map((p) => p.id));
          const disponiveis = diretorio.filter((p) => !idsDentro.has(p.id));

          const mover = (id: string, para: string | null, nome: string) => {
            void definirEquipeDaPessoa(id, para)
              .then(() => {
                avisar(
                  para
                    ? `${nome} entrou em ${eq?.nome ?? "equipe"}.`
                    : `${nome} saiu de ${eq?.nome ?? "equipe"}.`,
                  "ok",
                );
                recarregar();
              })
              .catch((e: unknown) =>
                avisar(e instanceof Error ? e.message : "Falha.", "erro"),
              );
          };

          const seletor = h(
            "select",
            { class: "selecao" },
            h("option", { value: "" }, "Escolha quem entra…"),
            ...disponiveis.map((p) =>
              h(
                "option",
                { value: p.id },
                `${p.nome_completo}${p.cargo ? ` — ${p.cargo}` : ""}`,
              ),
            ),
          ) as HTMLSelectElement;

          montar(
            caixa,
            h(
              "div",
              { class: "linha-flex" },
              h("h4", { style: "margin:0" }, `Colaboradores de ${eq?.nome ?? ""}`),
              h("span", { class: "empurra" }),
              h(
                "button",
                {
                  class: "btn btn--sutil btn--sm",
                  type: "button",
                  on: {
                    click: () => {
                      equipeAberta = null;
                      desenhar();
                    },
                  },
                },
                "Fechar",
              ),
            ),
            h(
              "p",
              { class: "campo__ajuda" },
              "Pessoa nova entra pelo autocadastro da tela de acesso — aqui se atribui quem já tem conta. Gestor altera apenas colaboradores.",
            ),
            dentro.length === 0
              ? h(
                  "p",
                  { class: "texto-sutil" },
                  "Nenhuma pessoa nesta equipe ainda.",
                )
              : h(
                  "div",
                  { class: "pilha" },
                  ...dentro.map((p) =>
                    h(
                      "div",
                      { class: "cartao cartao--compacto" },
                      h(
                        "div",
                        { class: "linha-flex" },
                        h("b", {}, p.nome_completo),
                        p.cargo
                          ? h("span", { class: "texto-sutil" }, p.cargo)
                          : null,
                        h("span", { class: "empurra" }),
                        h(
                          "button",
                          {
                            class: "btn btn--perigo btn--sm",
                            type: "button",
                            on: {
                              click: () => mover(p.id, null, p.nome_completo),
                            },
                          },
                          icone(ICONES.excluir),
                          "Tirar da equipe",
                        ),
                      ),
                    ),
                  ),
                ),
            h(
              "div",
              { class: "grade-campos" },
              h("div", { class: "campo" }, seletor),
              h(
                "div",
                { class: "campo" },
                h(
                  "button",
                  {
                    class: "btn btn--primario btn--sm",
                    type: "button",
                    on: {
                      click: () => {
                        const id = seletor.value;
                        if (!id) return avisar("Escolha uma pessoa.", "erro");
                        const nome =
                          disponiveis.find((p) => p.id === id)
                            ?.nome_completo ?? "Pessoa";
                        mover(id, equipeId, nome);
                      },
                    },
                  },
                  "Adicionar à equipe",
                ),
              ),
            ),
          );
        })
        .catch((e: unknown) =>
          montar(
            caixa,
            h(
              "span",
              { class: "texto-sutil" },
              e instanceof Error ? e.message : "Falha ao carregar a equipe.",
            ),
          ),
        );
    };

    recarregar();
    return caixa;
  };

  /**
   * Desativar equipe — e não excluir.
   *
   * O porquê está em `alternarEquipe`: apagar equipe leva o canal de conversa
   * e as mensagens dela em cascata. O texto do diálogo diz isso, porque quem
   * clica em "remover" está esperando remover, e merece saber que o sistema
   * está fazendo algo diferente do que a palavra sugere.
   */
  const botaoDesativarEquipe = (no: NoArvore): HTMLElement =>
    botaoAcao(
      `Remover a equipe ${no.nome}`,
      ICONES.excluir,
      () => {
        // Pergunta ao banco ANTES de oferecer: o desfecho certo depende do que
        // aponta para a equipe, e não de uma regra fixa na tela.
        void contarVinculosDaEquipe(no.id)
          .then((v) => {
            if (v.podeApagar) {
              return confirmar({
                titulo: `Excluir ${no.nome}?`,
                texto:
                  "Nada aponta para esta equipe, então ela pode ser apagada de verdade — e o nome volta a ficar livre.",
                consequencia:
                  v.mensagens > 0
                    ? `Atenção: o canal de conversa dela tem ${v.mensagens} mensagem(ns), e elas serão apagadas em cascata, sem volta. Se quiser guardar o histórico, desative em vez de excluir.`
                    : "O canal de conversa dela é apagado junto, e está vazio.",
                rotuloConfirmar: "Excluir equipe",
                perigo: true,
              }).then((ok) => {
                if (!ok) return;
                return excluirEquipe(no.id).then(() => {
                  avisar(`${no.nome} excluída. O nome está livre.`, "ok");
                  desenhar();
                });
              });
            }

            // Em uso: o banco recusaria o delete, então nem ofereço.
            const presos = [
              v.pessoas > 0 ? `${v.pessoas} pessoa(s)` : null,
              v.chamados > 0 ? `${v.chamados} chamado(s)` : null,
              v.demandas > 0 ? `${v.demandas} demanda(s)` : null,
              v.servicos > 0 ? `${v.servicos} serviço(s) de catálogo` : null,
              v.rotinas > 0 ? `${v.rotinas} rotina(s)` : null,
            ]
              .filter(Boolean)
              .join(", ");

            return confirmar({
              titulo: `Desativar ${no.nome}?`,
              texto: `Esta equipe está em uso e não pode ser apagada: ${presos} apontam para ela.`,
              consequencia:
                "Desativar tira a fila de operação e preserva o histórico. O nome continua ocupado — só a exclusão o libera, e para isso os vínculos acima precisam sair primeiro.",
              rotuloConfirmar: "Desativar equipe",
              perigo: true,
            }).then((ok) => {
              if (!ok) return;
              return alternarEquipe(no.id, false).then(() => {
                avisar(`${no.nome} desativada.`, "ok");
                desenhar();
              });
            });
          })
          .catch((e: unknown) =>
            avisar(e instanceof Error ? e.message : "Falha.", "erro"),
          );
      },
      true,
    );

  /** Cria equipe dentro do setor, sem sair da árvore. */
  const botaoNovaEquipe = (no: NoArvore): HTMLElement =>
    h(
      "button",
      {
        class: "btn btn--sutil btn--sm",
        type: "button",
        title: `Criar uma equipe dentro de ${no.nome}`,
        on: {
          click: (ev: Event) => {
            ev.stopPropagation();
            void perguntar({
              titulo: `Nova equipe em ${no.nome}`,
              texto:
                "Equipe é a fila de TI que atende — o setor é quem pede. Ela nasce no nível 1 de escalonamento.",
              rotuloCampo: "Nome da equipe",
              placeholder: "Ex.: Service Desk",
              minimo: 2,
              rotuloConfirmar: "Criar equipe",
            }).then((nome) => {
              if (nome === null) return;
              return criarEquipe({ nome, setor_id: no.id })
                .then((e) => {
                  avisar(`Equipe ${e.nome} criada em ${no.nome}.`, "ok");
                  desenhar();
                })
                .catch((err: unknown) =>
                  avisar(
                    err instanceof Error ? err.message : "Falha ao criar.",
                    "erro",
                  ),
                );
            });
          },
        },
      },
      "+ equipe",
    );

  /* ---------- Cabeçalho ---------- */

  const resumo = (): HTMLElement => {
    const areas = apenasAreas(arvore);
    const sub = arvore.filter((s) => s.setor_pai_id !== null);
    const semPessoas = arvore.filter(
      (s) => s.subsetores === 0 && s.pessoas === 0,
    ).length;

    const cartao = (
      rotulo: string,
      valor: number,
      nota: string,
      variante = "",
    ): HTMLElement =>
      h(
        "div",
        { class: `metrica${variante ? ` metrica--${variante}` : ""}` },
        h("div", { class: "metrica__rotulo" }, rotulo),
        h("div", { class: "metrica__valor" }, String(valor)),
        h("div", { class: "metrica__nota" }, nota),
      );

    return h(
      "div",
      { class: "grade-metricas" },
      cartao("Áreas", areas.length, "no topo da estrutura"),
      cartao("Subsetores", sub.length, "podem solicitar demanda"),
      cartao(
        "Pessoas vinculadas",
        arvore.reduce((s, x) => s + x.pessoas, 0),
        "com setor definido",
      ),
      cartao(
        "Setores sem gente",
        semPessoas,
        "ninguém vinculado ainda",
        semPessoas > 0 ? "alerta" : "ok",
      ),
    );
  };

  /**
   * Alternador de vista.
   *
   * A árvore é o padrão porque é ela que mostra a HIERARQUIA — que é a coisa
   * que esta tela existe para explicar. Os cartões continuam porque só eles
   * cabem o que a árvore não cabe: configurar abas por setor e abrir a tabela
   * de pessoas, que numa caixa de dendrograma não teriam onde entrar.
   */
  const alternadorVista = (): HTMLElement => {
    const botao = (valor: typeof vista, rotulo: string): HTMLElement =>
      h(
        "button",
        {
          class: `btn btn--sm${vista === valor ? " btn--primario" : ""}`,
          type: "button",
          on: {
            click: () => {
              vista = valor;
              desenhar();
            },
          },
        },
        rotulo,
      );

    return h(
      "div",
      { class: "linha-flex" },
      botao("arvore", "Árvore"),
      botao("quadro", "Cartões"),
    );
  };

  const barra = (): HTMLElement =>
    h(
      "div",
      { class: "grade-filtros" },
      alternadorVista(),
      barraFiltros.elemento,
      podeGerir
        ? h(
            "button",
            {
              class: "btn btn--primario empurra",
              type: "button",
              on: {
                click: () => {
                  novoEm = novoEm === null ? undefined : null;
                  desenhar();
                },
              },
            },
            novoEm === null ? "Cancelar" : "Nova área",
          )
        : null,
    );

  /* ---------- Pessoas do setor ---------- */

  /**
   * O `DataTable` do DS com quem está lotado no setor.
   *
   * As colunas seguem o contrato do DS: `valor` é o que a busca varre e a
   * ordenação compara, `celula` é o que aparece. Situação tem os dois porque o
   * texto ordena e o selo é que se lê.
   */
  function tabelaPessoas(s: SetorArvore): HTMLElement {
    const existente = tabelas.get(s.id);
    if (existente) return existente.elemento;

    const tabela = criarTabelaDados<PerfilDoSetor>({
      rotulo: `Pessoas de ${s.nome}`,
      busca: "Buscar por nome ou cargo…",
      porPagina: 8,
      densidade: "compacta",
      vazio: {
        titulo: "Setor sem ninguém",
        texto:
          "Nenhum perfil aponta para este setor. Quem se cadastra escolhe o setor na criação da conta, e é ele que decide as abas que a pessoa vê.",
      },
      colunas: [
        {
          chave: "nome",
          titulo: "Nome",
          valor: (p) => p.nome_completo,
          // Avatar na cor do perfil, como no diretório e no chat: é o que
          // permite reconhecer alguém antes de ler a linha.
          celula: (p) =>
            h(
              "span",
              { class: "setores__pessoa" },
              criarAvatar({ nome: p.nome_completo, id: p.id, tamanho: "sm" }),
              h("span", {}, p.nome_completo),
            ),
        },
        {
          chave: "cargo",
          titulo: "Cargo",
          valor: (p) => p.cargo ?? "",
          celula: (p) =>
            p.cargo ?? h("span", { class: "texto-sutil" }, "sem cargo"),
        },
        {
          chave: "hierarquia",
          titulo: "Nível",
          valor: (p) => ROTULOS_HIERARQUIA[p.hierarquia],
          celula: (p) =>
            h(
              "span",
              // `selo`, não `pri`: `pri` é a pílula de PRIORIDADE, e reusá-la
              // aqui diria que coordenador é P1 de alguma coisa.
              {
                class: `selo selo--${
                  p.hierarquia === "colaborador" ? "encerrado" : "andamento"
                }`,
              },
              ROTULOS_HIERARQUIA[p.hierarquia],
            ),
        },
        {
          chave: "senioridade",
          titulo: "Senioridade",
          valor: (p) => ROTULOS_SENIORIDADE[p.senioridade],
        },
        {
          chave: "situacao",
          titulo: "Situação",
          alinhamento: "fim",
          valor: (p) => (p.ativo ? "Ativo" : "Desativado"),
          celula: (p) =>
            h(
              "span",
              // Variantes que já existem no `chips-ds`: verde para quem está
              // em atividade, neutro para quem saiu.
              { class: `selo selo--${p.ativo ? "resolvido" : "encerrado"}` },
              p.ativo ? "ativo" : "desativado",
            ),
        },
      ],
    });

    tabelas.set(s.id, tabela);
    tabela.carregando(true);

    void perfisDoSetor(s.id)
      .then((lista) => tabela.definirLinhas(lista))
      .catch((e: unknown) => {
        tabela.carregando(false);
        avisar(
          e instanceof Error ? e.message : "Falha ao carregar as pessoas.",
          "erro",
        );
      });

    return tabela.elemento;
  }

  /**
   * O contador de pessoas vira o gatilho do quadro.
   *
   * Sem pessoas não há o que abrir, e aí ele continua sendo só um rótulo — um
   * botão que abre uma tabela vazia é um clique cobrado à toa.
   */
  const gatilhoPessoas = (s: SetorArvore): HTMLElement => {
    if (s.pessoas === 0) {
      return h(
        "span",
        { class: "setores__pessoas setores__pessoas--zero" },
        "sem pessoas",
      );
    }

    return h(
      "button",
      {
        class: "setores__pessoas setores__pessoas--gatilho",
        type: "button",
        aria: { expanded: String(pessoasAbertas === s.id) },
        title: "Ver quem está neste setor",
        on: {
          click: () => {
            pessoasAbertas = pessoasAbertas === s.id ? null : s.id;
            desenhar();
          },
        },
      },
      `${s.pessoas} pessoa${s.pessoas === 1 ? "" : "s"}`,
    );
  };

  const quadroPessoas = (s: SetorArvore): HTMLElement =>
    h(
      "div",
      { class: "setores__quadro" },
      h(
        "div",
        { class: "setores__quadro-titulo" },
        h("b", {}, s.nome),
        h("span", { class: "texto-sutil" }, "quem está lotado aqui"),
      ),
      tabelaPessoas(s),
    );

  /* ---------- Árvore ---------- */

  const quadro = (): HTMLElement => {
    const areas = apenasAreas(arvore);

    return h(
      "div",
      { class: "setores" },
      ...areas.map((a) => {
        const filhos = arvore.filter((s) => s.setor_pai_id === a.id);

        return h(
          "div",
          { class: `setores__area${a.ativo ? "" : " setores__area--inativa"}` },
          h(
            "div",
            { class: "setores__cabecalho" },
            h("span", { class: "setores__nome" }, a.nome),
            h(
              "span",
              { class: "setores__contagem" },
              `${filhos.length} subsetor${filhos.length === 1 ? "" : "es"}`,
            ),
            // Área também recebe gente direta — "uma área sem subsetor pode
            // receber demanda diretamente", e quem responde por ela está aqui.
            gatilhoPessoas(a),
            !a.ativo ? h("span", { class: "tag" }, "desativada") : null,
            h("span", { class: "empurra" }),
            ...acoes(a, filhos.length),
          ),

          filhos.length === 0
            ? h(
                "div",
                { class: "setores__vazio" },
                "Nenhum subsetor. Uma área sem subsetor pode receber demanda diretamente.",
              )
            : h(
                "div",
                { class: "setores__filhos" },
                ...filhos.map((f) =>
                  h(
                    "div",
                    {
                      class: `setores__filho${f.ativo ? "" : " setores__filho--inativo"}`,
                    },
                    h("span", { class: "setores__ramo" }, "└"),
                    h("span", { class: "setores__filho-nome" }, f.nome),
                    gatilhoPessoas(f),
                    !f.ativo ? h("span", { class: "tag" }, "desativado") : null,
                    f.abas
                      ? h("span", { class: "tag tag--verde" }, "abas próprias")
                      : null,
                    h("span", { class: "empurra" }),
                    ...acoes(f, 0),
                  ),
                ),
              ),

          // Só um quadro aberto por vez, e ele entra no cartão do setor a que
          // pertence — seja a área, seja um subsetor dela.
          pessoasAbertas === a.id ? quadroPessoas(a) : null,
          ...filhos
            .filter((f) => pessoasAbertas === f.id)
            .map((f) => quadroPessoas(f)),

          podeGerir && novoEm === a.id ? formNovo(a.id) : null,
          podeGerir && configurando === a.id ? painelAbas(a) : null,
        );
      }),
    );
  };

  /** Configuração das abas do setor. */
  const painelAbas = (s: SetorArvore): HTMLElement => {
    const herdado = s.abas === null;
    const atuais = new Set(s.abas ?? ABAS_PADRAO_SETOR);

    const salvar = (abas: string[] | null): void => {
      void definirAbas(s.id, abas)
        .then(() => {
          avisar(
            abas === null
              ? `${s.nome} voltou a herdar as abas do nível acima.`
              : `Abas de ${s.nome} atualizadas.`,
            "ok",
          );
          configurando = null;
          desenhar();
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha ao salvar.", "erro"),
        );
    };

    const marcadores = ABAS_CONFIGURAVEIS.map((aba) =>
      h(
        "label",
        { class: "abas__item" },
        h("input", {
          type: "checkbox",
          checked: atuais.has(aba.chave),
          disabled: aba.chave === "meus",
          on: {
            change: (ev: Event) => {
              if ((ev.target as HTMLInputElement).checked)
                atuais.add(aba.chave);
              else atuais.delete(aba.chave);
            },
          },
        }),
        h("span", { class: "abas__rotulo" }, aba.rotulo),
        aba.chave === "meus"
          ? h("span", { class: "abas__nota" }, "sempre visível")
          : aba.somenteTi
            ? h(
                "span",
                { class: "abas__nota abas__nota--ti" },
                "exige papel de TI",
              )
            : null,
      ),
    );

    return h(
      "div",
      { class: "setores__form" },
      h(
        "div",
        { class: "linha-flex", style: "margin-bottom:var(--s-2)" },
        h("b", {}, `Abas visíveis em ${s.nome}`),
        herdado
          ? h("span", { class: "tag" }, "herdando do padrão")
          : h("span", { class: "tag tag--verde" }, "configurado"),
      ),
      h("div", { class: "abas" }, ...marcadores),
      h(
        "div",
        { class: "campo__ajuda", style: "margin-top:var(--s-2)" },
        "Vale para todos os subsetores que não tiverem configuração própria. Marcar uma aba de TI não concede o papel — ela só deixa de ser escondida para quem já tem.",
      ),
      h(
        "div",
        { class: "linha-flex", style: "margin-top:var(--s-3)" },
        h(
          "button",
          {
            class: "btn btn--sm",
            type: "button",
            on: {
              click: () => {
                configurando = null;
                desenhar();
              },
            },
          },
          "Cancelar",
        ),
        h(
          "button",
          {
            class: "btn btn--sutil btn--sm",
            type: "button",
            title: "Volta a usar a configuração do nível acima",
            on: { click: () => salvar(null) },
          },
          "Herdar do padrão",
        ),
        h("span", { class: "empurra" }),
        h(
          "button",
          {
            class: "btn btn--primario btn--sm",
            type: "button",
            on: { click: () => salvar([...atuais]) },
          },
          "Salvar abas",
        ),
      ),
    );
  };

  const acoes = (s: SetorArvore, filhos: number): HTMLElement[] => {
    if (!podeGerir) return [];

    const botoes: HTMLElement[] = [];

    if (s.setor_pai_id === null) {
      botoes.push(
        h(
          "button",
          {
            class: "btn btn--sm",
            type: "button",
            on: {
              click: () => {
                novoEm = novoEm === s.id ? undefined : s.id;
                desenhar();
              },
            },
          },
          novoEm === s.id ? "Fechar" : "Subsetor",
        ),
        h(
          "button",
          {
            class: `btn btn--sm${s.abas ? " btn--primario" : ""}`,
            type: "button",
            title: s.abas
              ? "Abas configuradas nesta área"
              : "Herdando o padrão do sistema",
            on: {
              click: () => {
                configurando = configurando === s.id ? null : s.id;
                desenhar();
              },
            },
          },
          "Abas",
        ),
      );
    }

    botoes.push(
      h(
        "button",
        {
          class: "btn btn--sutil btn--sm",
          type: "button",
          title: "Renomear",
          on: {
            click: () => {
              void perguntar({
                titulo: `Renomear ${s.nome}`,
                rotuloCampo: "Novo nome",
                valorInicial: s.nome,
                minimo: 2,
                rotuloConfirmar: "Renomear",
              }).then((nome) => {
                if (nome === null) return;
                void renomearSetor(s.id, nome)
                  .then(desenhar)
                  .catch((e: unknown) =>
                    avisar(e instanceof Error ? e.message : "Falha.", "erro"),
                  );
              });
            },
          },
        },
        "Renomear",
      ),
      h(
        "button",
        {
          class: "btn btn--sutil btn--sm",
          type: "button",
          on: {
            click: () => {
              void alternarSetor(s.id, !s.ativo)
                .then(desenhar)
                .catch((e: unknown) =>
                  avisar(e instanceof Error ? e.message : "Falha.", "erro"),
                );
            },
          },
        },
        s.ativo ? "Desativar" : "Reativar",
      ),
      h(
        "button",
        {
          class: "msg__excluir",
          type: "button",
          style: "opacity:.6",
          title:
            filhos > 0
              ? "Remova os subsetores antes de excluir"
              : "Excluir setor",
          on: {
            click: () => {
              void confirmar({
                titulo: `Excluir ${s.nome}?`,
                consequencia:
                  filhos > 0
                    ? "Esta área tem subsetores. O banco vai recusar — desative em vez de excluir."
                    : "Demandas e chamados que apontam para este setor perdem a referência. Se ele apenas deixou de existir, prefira desativar.",
                rotuloConfirmar: "Excluir",
                perigo: true,
              }).then((segue) => {
                if (!segue) return;
                void excluirSetor(s.id)
                  .then(() => {
                    avisar(`${s.nome} excluído.`, "ok");
                    desenhar();
                  })
                  .catch((e: unknown) =>
                    avisar(e instanceof Error ? e.message : "Falha.", "erro"),
                  );
              });
            },
          },
        },
        "×",
      ),
    );

    return botoes;
  };

  /* ---------- Formulário ---------- */

  const formNovo = (paiId: string | null): HTMLElement => {
    const pai = paiId ? arvore.find((s) => s.id === paiId) : null;

    const nome = h("input", {
      class: "entrada",
      type: "text",
      placeholder: pai ? `Novo subsetor de ${pai.nome}` : "Nome da nova área",
    }) as HTMLInputElement;

    const descricao = h("input", {
      class: "entrada",
      type: "text",
      placeholder: "Descrição (opcional)",
    }) as HTMLInputElement;

    const salvar = (): void => {
      void criarSetor({
        nome: nome.value,
        setor_pai_id: paiId,
        descricao: descricao.value,
      })
        .then((novo) => {
          avisar(`${novo.nome} criado.`, "ok");
          novoEm = undefined;
          desenhar();
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha ao criar.", "erro"),
        );
    };

    nome.addEventListener("keydown", (ev) => {
      if ((ev as KeyboardEvent).key === "Enter") {
        ev.preventDefault();
        salvar();
      }
    });

    return h(
      "div",
      { class: "setores__form" },
      h(
        "div",
        { class: "grade-campos" },
        h("div", { class: "campo" }, nome),
        h("div", { class: "campo" }, descricao),
      ),
      h(
        "div",
        { class: "linha-flex" },
        h(
          "span",
          { class: "texto-sutil" },
          pai
            ? `Entra dentro de ${pai.nome}. O nome só precisa ser único dentro da área.`
            : "Nova área de topo. Depois acrescente os subsetores nela.",
        ),
        h("span", { class: "empurra" }),
        h(
          "button",
          {
            class: "btn btn--sm",
            type: "button",
            on: {
              click: () => {
                novoEm = undefined;
                desenhar();
              },
            },
          },
          "Cancelar",
        ),
        h(
          "button",
          {
            class: "btn btn--primario btn--sm",
            type: "button",
            on: { click: salvar },
          },
          "Criar",
        ),
      ),
    );
  };

  const vazio = (): HTMLElement =>
    h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "vazio" },
        h("h3", {}, "Nenhum setor cadastrado"),
        h(
          "p",
          {},
          "Crie as áreas de topo e depois os subsetores dentro delas. É o setor que identifica a origem de cada demanda e chamado.",
        ),
      ),
    );

  desenhar();
}
