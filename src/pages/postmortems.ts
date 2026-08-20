/** Post-mortems de incidente — publicados para todos, rascunhos para o dono. */

import { aguardando } from "@/components/esqueleto";
import { perguntar } from "@/components/dialogo";
import { avisar, h, montar } from "@/lib/dom";
import { dataCurta } from "@/lib/formato";
import {
  criarPostMortem,
  duracaoIncidente,
  listarPostMortems,
  pendenciasParaPublicar,
} from "@/lib/postmortem";
import { navegar } from "@/lib/router";
import type { Perfil, PostMortem } from "@/types/dominio";

type Recorte = "todos" | "publicados" | "rascunhos";

const RECORTES: Array<[Recorte, string]> = [
  ["todos", "Todos"],
  ["publicados", "Publicados"],
  ["rascunhos", "Rascunhos"],
];

/** Prazo padrão do plano de ação: duas semanas. */
const DIAS_PADRAO = 14;

export function renderizarPostMortems(alvo: HTMLElement, perfil: Perfil): void {
  let recorte: Recorte = "todos";

  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  const desenhar = (): void => {
    aguardando(area, "tabela");

    void listarPostMortems()
      .then((lista) => {
        const visiveis = lista.filter((pm) =>
          recorte === "todos"
            ? true
            : recorte === "publicados"
              ? pm.publicado
              : !pm.publicado,
        );

        montar(
          area,
          filtros(lista),
          visiveis.length === 0
            ? vazio(lista.length)
            : h("div", { class: "pilha-fina" }, ...visiveis.map(cartao)),
        );
      })
      .catch((e: unknown) =>
        avisar(
          e instanceof Error ? e.message : "Falha ao listar post-mortems.",
          "erro",
        ),
      );
  };

  /* ---------- Filtros e criação ---------- */

  const filtros = (lista: PostMortem[]): HTMLElement =>
    h(
      "div",
      { class: "grade-filtros" },
      ...RECORTES.map(([valor, rotulo]) =>
        h(
          "button",
          {
            class: `btn btn--sm${recorte === valor ? " btn--primario" : ""}`,
            type: "button",
            on: {
              click: () => {
                recorte = valor;
                desenhar();
              },
            },
          },
          `${rotulo} (${contar(lista, valor)})`,
        ),
      ),
      h(
        "button",
        {
          class: "btn btn--sm empurra",
          type: "button",
          on: { click: criar },
        },
        "+ Novo post-mortem",
      ),
    );

  /**
   * Nasce só com o título.
   *
   * `impacto` fica vazio de propósito em vez de receber um "a descrever": o
   * banco aceita string vazia, e um texto de enfeite sobreviveria até a
   * publicação sem ninguém notar que não foi preenchido.
   */
  const criar = (): void => {
    void perguntar({
      titulo: "Novo post-mortem",
      texto:
        "O resto — impacto, linha do tempo, causa raiz e ações — você preenche na tela seguinte.",
      rotuloCampo: "O que aconteceu",
      placeholder: "Servidor de arquivos indisponível por 4h",
      minimo: 10,
      rotuloConfirmar: "Criar",
    }).then((titulo) => {
      if (!titulo) return;

      const prazo = new Date();
      prazo.setDate(prazo.getDate() + DIAS_PADRAO);

      void criarPostMortem({
        titulo,
        impacto: "",
        responsavel_id: perfil.id,
        // Data local em ISO: `toISOString()` devolveria o dia em UTC, que
        // depois das 21h no Brasil já é o dia seguinte.
        prazo: isoLocal(prazo),
      })
        .then((id) => navegar(`postmortem/${id}`))
        .catch((e: unknown) =>
          avisar(
            e instanceof Error ? e.message : "Falha ao criar o post-mortem.",
            "erro",
          ),
        );
    });
  };

  /* ---------- Cartão ---------- */

  const cartao = (pm: PostMortem): HTMLElement => {
    const faltas = pendenciasParaPublicar(pm);
    const feitas = pm.acoes_corretivas.filter((a) => a.feita).length;
    const total = pm.acoes_corretivas.length;

    return h(
      "button",
      {
        class: "cartao cartao--clicavel",
        type: "button",
        on: { click: () => navegar(`postmortem/${pm.id}`) },
      },
      h(
        "div",
        { class: "cartao__cabecalho" },
        h("span", { class: "cartao__titulo" }, pm.titulo),
        h(
          "span",
          {
            class: `selo ${pm.publicado ? "selo--publicado" : "selo--rascunho"}`,
          },
          pm.publicado ? "publicado" : "rascunho",
        ),
      ),
      h(
        "div",
        { class: "pm__meta" },
        pm.chamado_numero
          ? h("span", { class: "mono" }, pm.chamado_numero)
          : h("span", { class: "texto-sutil" }, "avulso"),
        h("span", {}, pm.responsavel_nome),
        h("span", {}, `duração ${duracaoIncidente(pm.duracao_minutos)}`),
        h(
          "span",
          {},
          total === 0
            ? "sem ações"
            : `${feitas}/${total} ${total === 1 ? "ação" : "ações"}`,
        ),
        h("span", { class: "texto-sutil" }, `prazo ${dataCurta(pm.prazo)}`),
      ),
      // A pendência só interessa em rascunho: no publicado ela já foi resolvida
      // pelo próprio banco, que recusaria a publicação sem isso.
      !pm.publicado && faltas.length > 0
        ? h(
            "div",
            { class: "texto-sutil" },
            `Falta para publicar: ${faltas.join(" e ")}.`,
          )
        : null,
    );
  };

  /* ---------- Vazio ---------- */

  const vazio = (totalGeral: number): HTMLElement =>
    h(
      "div",
      { class: "vazio" },
      h(
        "h3",
        {},
        totalGeral === 0 ? "Nenhum post-mortem" : "Nada neste recorte",
      ),
      h(
        "p",
        {},
        totalGeral === 0
          ? "O post-mortem é escrito depois de um incidente grave: o que aconteceu, por que aconteceu e o que muda para não repetir. Comece pelo chamado do incidente ou crie um avulso aqui."
          : "Há post-mortems, mas nenhum neste filtro.",
      ),
    );

  desenhar();
}

/** `YYYY-MM-DD` no fuso local. */
function isoLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function contar(lista: PostMortem[], recorte: Recorte): number {
  if (recorte === "todos") return lista.length;
  if (recorte === "publicados") return lista.filter((p) => p.publicado).length;
  return lista.filter((p) => !p.publicado).length;
}
