/** Pessoas — organograma e gestão de perfis. */

import { criarAvatar } from "@/components/avatar";
import { criarInterruptor } from "@/components/interruptor";
import { criarBarraFiltros } from "@/components/barra-filtros";
import { dentroDoPeriodo } from "@/lib/periodo";
import { aguardando } from "@/components/esqueleto";
import { avisar, h, montar } from "@/lib/dom";
import { alterarPerfil, listarDiretorio, listarEquipes } from "@/lib/api";
import {
  insigniaHierarquia,
  ORDEM_HIERARQUIA,
  ORDEM_SENIORIDADE,
  ROTULOS_HIERARQUIA,
  ROTULOS_SENIORIDADE,
  seloSenioridade,
} from "@/components/insignia";
import type {
  AlteracaoPerfil,
  Equipe,
  Hierarquia,
  PapelUsuario,
  Perfil,
  PessoaDiretorio,
  Senioridade,
} from "@/types/dominio";

const PLURAL_HIERARQUIA: Record<Hierarquia, string> = {
  coordenador: "Coordenação",
  gestor: "Gestão",
  colaborador: "Colaboradores",
};

const ROTULOS_PAPEL: Record<PapelUsuario, string> = {
  solicitante: "Solicitante — só o portal",
  agente_n1: "Agente N1 — fila de atendimento",
  agente_n2: "Agente N2 — fila de atendimento",
  agente_n3: "Agente N3 — fila de atendimento",
  gestor: "Gestor — vê tudo",
  admin: "Administrador — controle total",
};

export function renderizarPessoas(alvo: HTMLElement, perfil: Perfil): void {
  let busca = "";
  let equipes: Equipe[] = [];
  let editando: string | null = null;

  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  const barra = criarBarraFiltros({
    aoMudar: () => desenhar(),
    filtros: [{ chave: "data", rotulo: "Cadastro", tipo: "periodo" }],
  });

  const desenhar = (): void => {
    aguardando(area, "tabela");
    void Promise.all([
      listarDiretorio(),
      equipes.length > 0 ? Promise.resolve(equipes) : listarEquipes(),
    ])
      .then(([pessoas, listaEquipes]) => {
        equipes = listaEquipes;

        const noPeriodo = pessoas.filter((p) =>
          dentroDoPeriodo(p.criado_em, barra.periodo("data")),
        );

        const filtradas = busca
          ? noPeriodo.filter((p) =>
              [p.nome_completo, p.cargo, p.departamento, p.equipe_nome]
                .filter(Boolean)
                .some((campo) =>
                  normalizar(String(campo)).includes(normalizar(busca)),
                ),
            )
          : noPeriodo;

        montar(
          area,
          resumo(noPeriodo),
          filtros(),
          ...ORDEM_HIERARQUIA.map((nivel) =>
            grupoHierarquia(
              nivel,
              filtradas.filter((p) => p.hierarquia === nivel),
            ),
          ),
          filtradas.length === 0 ? vazio() : null,
        );
      })
      .catch((e: unknown) => {
        avisar(
          e instanceof Error ? e.message : "Falha ao carregar as pessoas.",
          "erro",
        );
      });
  };

  const filtros = (): HTMLElement =>
    h(
      "div",
      { class: "grade-filtros" },
      barra.elemento,
      h("input", {
        class: "entrada",
        type: "search",
        value: busca,
        placeholder: "Buscar por nome, cargo, departamento ou equipe…",
        style: "max-width:340px",
        on: {
          input: (ev: Event) => {
            busca = (ev.target as HTMLInputElement).value;
            desenhar();
          },
        },
      }),
    );

  const resumo = (pessoas: PessoaDiretorio[]): HTMLElement => {
    const contar = (n: Hierarquia): number =>
      pessoas.filter((p) => p.hierarquia === n).length;

    const cartao = (rotulo: string, valor: number, nota: string): HTMLElement =>
      h(
        "div",
        { class: "metrica" },
        h("div", { class: "metrica__rotulo" }, rotulo),
        h("div", { class: "metrica__valor" }, String(valor)),
        h("div", { class: "metrica__nota" }, nota),
      );

    return h(
      "div",
      { class: "grade-metricas" },
      cartao("Coordenadores", contar("coordenador"), "promovem qualquer nível"),
      cartao("Gestores", contar("gestor"), "promovem colaboradores"),
      cartao("Colaboradores", contar("colaborador"), "equipe de execução"),
      cartao("Total ativo", pessoas.length, "com acesso ao sistema"),
    );
  };

  const grupoHierarquia = (
    nivel: Hierarquia,
    pessoas: PessoaDiretorio[],
  ): HTMLElement | null => {
    if (pessoas.length === 0) return null;

    return h(
      "div",
      { class: "organograma__nivel" },
      h(
        "div",
        { class: "organograma__titulo" },
        insigniaHierarquia(nivel),
        PLURAL_HIERARQUIA[nivel],
        h(
          "span",
          { class: "organograma__contagem" },
          `${pessoas.length} pessoa${pessoas.length === 1 ? "" : "s"}`,
        ),
      ),
      ...pessoas.map((p) =>
        editando === p.id ? formEdicao(p) : linhaPessoa(p),
      ),
    );
  };

  const linhaPessoa = (p: PessoaDiretorio): HTMLElement => {
    const souEu = p.id === perfil.id;
    const posso = podeGerir(perfil, p) && !souEu;

    return h(
      "div",
      { class: `pessoa${p.ativo ? "" : " pessoa--inativa"}` },
      // Cor do PERFIL, não da hierarquia: o nível já está dito na insígnia e
      // no selo ao lado, e a cor por pessoa é o que faz reconhecer alguém de
      // relance — a mesma no chat e no quadro do setor.
      criarAvatar({ nome: p.nome_completo, id: p.id, tamanho: "lg" }),
      h(
        "div",
        { style: "min-width:0" },
        h(
          "div",
          { class: "pessoa__nome" },
          insigniaHierarquia(p.hierarquia, {
            nome: p.nome_completo,
            senioridade: p.senioridade,
          }),
          h("span", {}, p.nome_completo),
          souEu ? h("span", { class: "tag" }, "você") : null,
        ),
        h(
          "div",
          { class: "pessoa__meta" },
          [
            p.cargo,
            ROTULOS_SENIORIDADE[p.senioridade],
            p.equipe_nome,
            p.departamento,
          ]
            .filter(Boolean)
            .join(" · ") || "sem cargo definido",
        ),
      ),
      h(
        "div",
        { class: "pessoa__acoes" },
        seloSenioridade(p.senioridade),
        posso
          ? h(
              "button",
              {
                class: "btn btn--sm",
                type: "button",
                on: {
                  click: () => {
                    editando = p.id;
                    desenhar();
                  },
                },
              },
              "Alterar",
            )
          : null,
      ),
    );
  };

  const formEdicao = (p: PessoaDiretorio): HTMLElement => {
    const souCoordenador =
      perfil.hierarquia === "coordenador" || perfil.papel === "admin";

    // Gestor não promove ninguém a coordenador nem concede papel
    // administrativo — a trigger recusaria, então nem oferecemos.
    const hierarquiasPermitidas = souCoordenador
      ? ORDEM_HIERARQUIA
      : ORDEM_HIERARQUIA.filter((x) => x !== "coordenador");

    const papeisPermitidos = (
      Object.keys(ROTULOS_PAPEL) as PapelUsuario[]
    ).filter((x) => souCoordenador || !["gestor", "admin"].includes(x));

    const selHierarquia = selecao(
      "Hierarquia",
      hierarquiasPermitidas.map((x) => [x, ROTULOS_HIERARQUIA[x]]),
      p.hierarquia,
    );
    const selSenioridade = selecao(
      "Senioridade",
      ORDEM_SENIORIDADE.map((x) => [x, ROTULOS_SENIORIDADE[x]]),
      p.senioridade,
    );
    const selPapel = selecao(
      "Papel de acesso",
      papeisPermitidos.map((x) => [x, ROTULOS_PAPEL[x]]),
      p.papel,
    );
    const selEquipe = selecao(
      "Equipe",
      [
        ["", "sem equipe"],
        ...equipes.map((e) => [e.id, e.nome] as [string, string]),
      ],
      "",
    );
    const campoCargo = h("input", {
      class: "entrada",
      type: "text",
      value: p.cargo ?? "",
      placeholder: "Analista Fiscal Sênior",
    }) as HTMLInputElement;

    /**
     * Acesso é o único campo do formulário que não é escolha entre opções —
     * os outros quatro são `select`. Por ser liga/desliga puro, é
     * interruptor: mostra o estado sem que ninguém precise abrir uma lista
     * para descobrir em qual dos dois a pessoa está.
     *
     * E era um estado sem controle: a lista já pintava quem está desativado
     * (`pessoa--inativa`), mas não havia por onde ativar ou desativar.
     */
    const acesso = criarInterruptor({
      id: `acesso-${p.id}`,
      rotulo: "Acesso ativo",
      ligado: p.ativo,
      aoMudar: () => desenharAviso(),
    });

    const aviso = h("div", { class: "aviso" });

    /**
     * O aviso muda de assunto quando o acesso é desligado — o rodapé sobre
     * notificação e auditoria continua valendo, mas deixa de ser a coisa mais
     * importante da tela quando alguém está prestes a barrar um login.
     */
    const desenharAviso = (): void => {
      const cortando = p.ativo && !acesso.ligado();
      aviso.className = cortando ? "aviso aviso--alerta" : "aviso";

      montar(
        aviso,
        h("span", { class: "aviso__icone" }, cortando ? "!" : "i"),
        cortando
          ? h(
              "span",
              {},
              h("b", {}, `${p.nome_completo} não conseguirá mais entrar. `),
              // Só no login: uma sessão já aberta continua válida até
              // expirar. Prometer corte imediato seria mentira, e é o tipo
              // de mentira que só aparece no pior momento.
              "A conta é recusada na próxima tentativa de login, e ela some das",
              " menções. Chamados, demandas e histórico ficam onde estão, e",
              " reativar devolve tudo.",
            )
          : h(
              "span",
              {},
              "A pessoa recebe uma notificação com o que mudou, e a alteração",
              " fica registrada na auditoria com seu nome.",
            ),
      );
    };

    desenharAviso();

    const salvar = h(
      "button",
      { class: "btn btn--primario", type: "submit" },
      "Salvar alterações",
    );

    return h(
      "form",
      {
        class: "cartao",
        style: "margin:var(--s-3) var(--s-4);",
        on: {
          submit: (ev: Event) => {
            ev.preventDefault();

            const campos: AlteracaoPerfil = {
              hierarquia: selHierarquia.value as Hierarquia,
              senioridade: selSenioridade.value as Senioridade,
              papel: selPapel.value as PapelUsuario,
              cargo: campoCargo.value.trim() || null,
              ativo: acesso.ligado(),
            };
            if (selEquipe.value) campos.equipe_id = selEquipe.value;

            salvar.disabled = true;
            void alterarPerfil(p.id, campos)
              .then(() => {
                avisar(`Perfil de ${p.nome_completo} atualizado.`, "ok");
                editando = null;
                desenhar();
              })
              .catch((e: unknown) => {
                avisar(
                  e instanceof Error ? e.message : "Falha ao alterar.",
                  "erro",
                );
                salvar.disabled = false;
              });
          },
        },
      },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, `Alterar ${p.nome_completo}`),
        h(
          "span",
          { class: "texto-sutil empurra" },
          souCoordenador
            ? "Como coordenador, você altera qualquer nível"
            : "Como gestor, você altera colaboradores",
        ),
      ),
      h(
        "div",
        { class: "grade-campos" },
        campo("Hierarquia", selHierarquia),
        campo("Senioridade", selSenioridade),
      ),
      h(
        "div",
        { class: "grade-campos" },
        campo("Papel de acesso", selPapel),
        campo("Equipe", selEquipe),
      ),
      campo("Cargo", campoCargo),
      h("div", { class: "campo-interruptor" }, acesso.elemento),
      aviso,
      h(
        "div",
        { class: "linha-flex" },
        h(
          "button",
          {
            class: "btn",
            type: "button",
            on: {
              click: () => {
                editando = null;
                desenhar();
              },
            },
          },
          "Cancelar",
        ),
        h("span", { class: "empurra" }),
        salvar,
      ),
    );
  };

  desenhar();
}

/* Auxiliares */

function podeGerir(eu: Perfil, alvo: PessoaDiretorio): boolean {
  if (eu.papel === "admin") return true;
  if (eu.hierarquia === "coordenador") return true;
  if (eu.hierarquia === "gestor") return alvo.hierarquia === "colaborador";
  return false;
}

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function selecao(
  rotulo: string,
  opcoes: Array<[string, string]>,
  valor: string,
): HTMLSelectElement {
  const select = h(
    "select",
    { class: "selecao", aria: { label: rotulo } },
    ...opcoes.map(([v, t]) => h("option", { value: v }, t)),
  ) as HTMLSelectElement;
  select.value = valor;
  return select;
}

function campo(rotulo: string, controle: HTMLElement): HTMLElement {
  return h(
    "div",
    { class: "campo" },
    h("label", { class: "campo__rotulo" }, rotulo),
    controle,
  );
}

function vazio(): HTMLElement {
  return h(
    "div",
    { class: "cartao" },
    h(
      "div",
      { class: "vazio" },
      h("h3", {}, "Ninguém encontrado"),
      h(
        "p",
        {},
        "Ajuste a busca. Pessoas aparecem aqui assim que criam conta pela tela de cadastro.",
      ),
    ),
  );
}
