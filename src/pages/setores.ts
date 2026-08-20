/** Quadro de setores — a árvore da empresa. */

import { criarFiltroData } from "@/components/filtro-data";
import { dentroDoPeriodo } from "@/lib/periodo";
import { aguardando } from "@/components/esqueleto";
import { avisar, h, montar } from "@/lib/dom";
import { confirmar, perguntar } from "@/components/dialogo";
import { podeGerirPessoas } from "@/lib/api";
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
import type { Perfil, SetorArvore } from "@/types/dominio";

export function renderizarSetores(alvo: HTMLElement, perfil: Perfil): void {
  let arvore: SetorArvore[] = [];
  let mostrarInativos = false;
  let novoEm: string | null | undefined; // undefined = fechado; null = nova área
  let configurando: string | null = null;

  const podeGerir = podeGerirPessoas(perfil);
  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  const periodo = criarFiltroData(() => desenhar(), { rotulo: "Criado" });

  const desenhar = (): void => {
    aguardando(area, "lista");
    void listarSetores(mostrarInativos)
      .then((lista) => {
        arvore = lista.filter((s) =>
          dentroDoPeriodo(s.criado_em, periodo.valor()),
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
      periodo.elemento,
      h(
        "label",
        {
          class: "linha-flex",
          style: "gap:6px;font-size:var(--t-sm);cursor:pointer",
        },
        h("input", {
          type: "checkbox",
          checked: mostrarInativos,
          on: {
            change: (ev: Event) => {
              mostrarInativos = (ev.target as HTMLInputElement).checked;
              desenhar();
            },
          },
        }),
        "Mostrar desativados",
      ),
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
                    f.pessoas > 0
                      ? h(
                          "span",
                          { class: "setores__pessoas" },
                          `${f.pessoas} pessoa${f.pessoas === 1 ? "" : "s"}`,
                        )
                      : h(
                          "span",
                          { class: "setores__pessoas setores__pessoas--zero" },
                          "sem pessoas",
                        ),
                    !f.ativo ? h("span", { class: "tag" }, "desativado") : null,
                    f.abas
                      ? h("span", { class: "tag tag--verde" }, "abas próprias")
                      : null,
                    h("span", { class: "empurra" }),
                    ...acoes(f, 0),
                  ),
                ),
              ),

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
