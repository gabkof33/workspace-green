/** Pessoas — organograma e gestão de perfis. */

import { criarFiltroData } from "@/components/filtro-data";
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

  const periodo = criarFiltroData(() => desenhar(), { rotulo: "Cadastro" });

  const desenhar = (): void => {
    aguardando(area, "tabela");
    void Promise.all([
      listarDiretorio(),
      equipes.length > 0 ? Promise.resolve(equipes) : listarEquipes(),
    ])
      .then(([pessoas, listaEquipes]) => {
        equipes = listaEquipes;

        const noPeriodo = pessoas.filter((p) =>
          dentroDoPeriodo(p.criado_em, periodo.valor()),
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
      periodo.elemento,
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
      h(
        "div",
        { class: `pessoa__avatar pessoa__avatar--${p.hierarquia}` },
        iniciais(p.nome_completo),
      ),
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
      h(
        "div",
        { class: "aviso" },
        h("span", { class: "aviso__icone" }, "i"),
        h(
          "span",
          {},
          "A pessoa recebe uma notificação com o que mudou, e a alteração fica registrada na auditoria com seu nome.",
        ),
      ),
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

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.charAt(0) ?? "?";
  const ultima = partes.length > 1 ? (partes.at(-1)?.charAt(0) ?? "") : "";
  return (primeira + ultima).toUpperCase();
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
