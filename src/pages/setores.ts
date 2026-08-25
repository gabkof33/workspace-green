/** Quadro de setores — a árvore da empresa. */

import { criarAvatar } from "@/components/avatar";
import { criarBarraFiltros } from "@/components/barra-filtros";
import { dentroDoPeriodo } from "@/lib/periodo";
import { aguardando } from "@/components/esqueleto";
import { avisar, h, montar } from "@/lib/dom";
import { confirmar, perguntar } from "@/components/dialogo";
import {
  criarTabelaDados,
  type TabelaDados,
} from "@/components/tabela-dados";
import { ROTULOS_HIERARQUIA, ROTULOS_SENIORIDADE } from "@/components/insignia";
import { perfisDoSetor, podeGerirPessoas } from "@/lib/api";
import {
  ABAS_CONFIGURAVEIS,
  ABAS_PADRAO_SETOR,
  alternarSetor,
  apenasAreas,
  criarSetor,
  definirAbas,
  excluirSetor,
  listarSetores,
  renomearSetor,
} from "@/lib/setores";
import type { Perfil, PerfilDoSetor, SetorArvore } from "@/types/dominio";

export function renderizarSetores(alvo: HTMLElement, perfil: Perfil): void {
  let arvore: SetorArvore[] = [];
  let novoEm: string | null | undefined; // undefined = fechado; null = nova área
  let configurando: string | null = null;
  /** Setor com o quadro de pessoas aberto. Um por vez: são tabelas largas. */
  let pessoasAbertas: string | null = null;

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
    void listarSetores(barraFiltros.ligado("inativos"))
      .then((lista) => {
        arvore = lista.filter((s) =>
          dentroDoPeriodo(s.criado_em, barraFiltros.periodo("data")),
        );
        montar(
          area,
          resumo(),
          barra(),
          novoEm !== undefined ? formNovo(novoEm) : null,
          arvore.length === 0 ? vazio() : quadro(),
        );
      })
      .catch((e: unknown) =>
        avisar(e instanceof Error ? e.message : "Falha ao carregar.", "erro"),
      );
  };

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

  const barra = (): HTMLElement =>
    h(
      "div",
      { class: "grade-filtros" },
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
