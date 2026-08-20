/** Campo de tags com sugestão do vocabulário já usado. */

import { corDaTag, listarTagsCatalogo } from "@/lib/api";
import { h, montar } from "@/lib/dom";
import type { TagSugerida } from "@/types/dominio";

const MAXIMO = 8;

export interface CampoTags {
  elemento: HTMLElement;
  valor(): string[];
  limpar(): void;
}

/** Mesmas regras de `normalizar_tag` no banco: minúscula, sem acento, hífen. */
export function normalizarTag(bruta: string): string {
  return bruta
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function criarCampoTags(
  sugestoes: TagSugerida[],
  opcoes: { placeholder?: string } = {},
): CampoTags {
  const escolhidas: string[] = [];
  let indiceAtivo = 0;
  let candidatas: TagSugerida[] = [];

  const chips = h("div", { class: "tags__chips" });
  const lista = h("div", { class: "tags__lista", style: "display:none" });

  const entrada = h("input", {
    class: "entrada",
    type: "text",
    placeholder:
      opcoes.placeholder ??
      "Ex.: fechamento-mensal, auditoria. Enter ou vírgula adiciona.",
    aria: { label: "Tags do chamado", autocomplete: "list" },
  }) as HTMLInputElement;

  const desenharChips = (): void => {
    if (escolhidas.length === 0) {
      montar(chips);
      chips.style.display = "none";
      return;
    }
    chips.style.display = "flex";
    montar(
      chips,
      ...escolhidas.map((t) =>
        h(
          "span",
          // Tag livre não tem cor no catálogo; `dataset` ausente cai no
          // neutro definido no CSS.
          { class: "tags__chip", dataset: { cor: corDaTag(t) } },
          t,
          h(
            "button",
            {
              type: "button",
              class: "tags__remover",
              title: `Remover ${t}`,
              on: {
                click: () => {
                  escolhidas.splice(escolhidas.indexOf(t), 1);
                  desenharChips();
                  desenharAtalhos();
                  entrada.focus();
                },
              },
            },
            "×",
          ),
        ),
      ),
    );
  };

  const fechar = (): void => {
    lista.style.display = "none";
    candidatas = [];
    indiceAtivo = 0;
  };

  const adicionar = (bruta: string): void => {
    const tag = normalizarTag(bruta);

    if (tag.length < 2 || tag.length > 30) {
      entrada.value = "";
      fechar();
      return;
    }
    if (escolhidas.includes(tag)) {
      entrada.value = "";
      fechar();
      return;
    }
    if (escolhidas.length >= MAXIMO) {
      fechar();
      return;
    }

    escolhidas.push(tag);
    entrada.value = "";
    desenharChips();
    desenharAtalhos();
    fechar();
  };

  const desenharSugestoes = (): void => {
    const termo = normalizarTag(entrada.value);
    if (!termo) return fechar();

    candidatas = sugestoes
      .filter((s) => !escolhidas.includes(s.tag))
      .filter((s) => s.tag.includes(termo))
      .slice(0, 6);

    if (candidatas.length === 0) return fechar();

    indiceAtivo = Math.min(indiceAtivo, candidatas.length - 1);
    lista.style.display = "block";

    montar(
      lista,
      ...candidatas.map((s, i) =>
        h(
          "button",
          {
            type: "button",
            class: `tags__opcao${i === indiceAtivo ? " tags__opcao--ativa" : ""}`,
            on: {
              // mousedown: o blur do campo fecharia a lista antes do
              // clique.
              mousedown: (ev: Event) => {
                ev.preventDefault();
                adicionar(s.tag);
              },
            },
          },
          h("span", {}, s.tag),
          h(
            "span",
            { class: "tags__usos" },
            `${s.usos} uso${s.usos === 1 ? "" : "s"}`,
          ),
        ),
      ),
    );
  };

  entrada.addEventListener("input", () => {
    // Vírgula fecha a tag, como em qualquer campo de etiquetas.
    if (entrada.value.includes(",")) {
      for (const parte of entrada.value.split(",")) adicionar(parte);
      return;
    }
    desenharSugestoes();
  });

  entrada.addEventListener("blur", () => window.setTimeout(fechar, 120));

  entrada.addEventListener("keydown", (ev) => {
    const aberta = lista.style.display !== "none" && candidatas.length > 0;

    if (ev.key === "Enter") {
      ev.preventDefault();
      const alvo = aberta ? candidatas[indiceAtivo] : null;
      adicionar(alvo ? alvo.tag : entrada.value);
      return;
    }
    if (
      ev.key === "Backspace" &&
      entrada.value === "" &&
      escolhidas.length > 0
    ) {
      escolhidas.pop();
      desenharChips();
      return;
    }
    if (!aberta) return;

    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      indiceAtivo = (indiceAtivo + 1) % candidatas.length;
      desenharSugestoes();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      indiceAtivo = (indiceAtivo - 1 + candidatas.length) % candidatas.length;
      desenharSugestoes();
    } else if (ev.key === "Escape") {
      fechar();
    }
  });

  const alternar = (tag: string): void => {
    const i = escolhidas.indexOf(tag);
    if (i >= 0) escolhidas.splice(i, 1);
    else adicionar(tag);
    desenharChips();
    desenharAtalhos();
  };

  const atalhos = h("div", { class: "tags__frequentes" });

  /** Botões prontos. */
  const desenharAtalhos = (): void => {
    const catalogo = listarTagsCatalogo();
    const noCatalogo = new Set(catalogo.map((t) => t.tag));
    const extras = sugestoes
      .filter((s) => !noCatalogo.has(s.tag))
      .slice(0, 6)
      .map((s) => ({ tag: s.tag, rotulo: s.tag }));

    const botoes = [
      ...catalogo.map((t) => ({ tag: t.tag, rotulo: t.rotulo })),
      ...extras,
    ];

    if (botoes.length === 0) {
      montar(atalhos);
      atalhos.style.display = "none";
      return;
    }
    atalhos.style.display = "flex";

    montar(
      atalhos,
      h("span", { class: "tags__rotulo" }, "Marcar como:"),
      ...botoes.map((b) => {
        const ativo = escolhidas.includes(b.tag);
        // Cheio quando não há mais espaço, exceto para desmarcar o que já
        // está marcado — senão o oitavo clique trancaria a remoção.
        const cheio = !ativo && escolhidas.length >= MAXIMO;
        return h(
          "button",
          {
            type: "button",
            class: `tags__atalho${ativo ? " tags__atalho--ativo" : ""}`,
            disabled: cheio,
            title: b.rotulo === b.tag ? b.tag : `${b.rotulo} — ${b.tag}`,
            aria: { pressed: ativo ? "true" : "false" },
            dataset: { cor: corDaTag(b.tag) },
            on: { click: () => alternar(b.tag) },
          },
          b.rotulo,
        );
      }),
    );
  };

  desenharChips();
  // Sem esta chamada o contêiner nasce vazio e os botões só apareceriam
  // depois do primeiro clique — que não existe, porque não há botão.
  desenharAtalhos();

  const elemento = h(
    "div",
    { class: "tags" },
    chips,
    atalhos,
    h("div", { class: "tags__campo" }, entrada, lista),
    h(
      "div",
      { class: "campo__ajuda" },
      `Opcional. Agrupam chamados por assunto além do catálogo — "fechamento-mensal", "auditoria". Até ${MAXIMO}.`,
    ),
  );

  return {
    elemento,
    valor: () => [...escolhidas],
    limpar: () => {
      escolhidas.length = 0;
      entrada.value = "";
      desenharChips();
      desenharAtalhos();
      fechar();
    },
  };
}
