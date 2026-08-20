/** Área de texto com menção por `@`. */

import { h, montar } from "@/lib/dom";
import { insigniaHierarquia } from "@/components/insignia";
import type { PessoaDiretorio } from "@/types/dominio";

export interface CampoMencao {
  elemento: HTMLElement;
  valor(): string;
  mencionados(): string[];
  limpar(): void;
  focar(): void;
}

export function criarCampoMencao(
  diretorio: PessoaDiretorio[],
  opcoes: { placeholder?: string; rotulo?: string } = {},
): CampoMencao {
  const escolhidos = new Map<string, PessoaDiretorio>();
  let indiceAtivo = 0;
  let candidatos: PessoaDiretorio[] = [];

  const area = h("textarea", {
    class: "area-texto",
    placeholder:
      opcoes.placeholder ?? "Escreva aqui. Use @ para mencionar alguém.",
    aria: { autocomplete: "list", label: opcoes.rotulo ?? "Comentário" },
  }) as HTMLTextAreaElement;

  const sugestoes = h("div", {
    class: "mencao__lista",
    style: "display:none",
    aria: { label: "Sugestões de menção" },
  });

  const marcados = h("div", { class: "mencao__marcados" });

  const desenharMarcados = (): void => {
    if (escolhidos.size === 0) {
      montar(marcados);
      marcados.style.display = "none";
      return;
    }
    marcados.style.display = "flex";
    montar(
      marcados,
      h("span", { class: "mencao__rotulo" }, "Notificar:"),
      ...[...escolhidos.values()].map((p) =>
        h(
          "span",
          { class: "mencao__chip" },
          `@${p.nome_completo}`,
          h(
            "button",
            {
              type: "button",
              class: "mencao__remover",
              title: `Remover menção a ${p.nome_completo}`,
              on: {
                click: () => {
                  escolhidos.delete(p.id);
                  desenharMarcados();
                },
              },
            },
            "×",
          ),
        ),
      ),
    );
  };

  /** Termo digitado após o último `@` ainda não resolvido. */
  const termoAtual = (): { termo: string; inicio: number } | null => {
    const pos = area.selectionStart;
    const antes = area.value.slice(0, pos);
    const arroba = antes.lastIndexOf("@");
    if (arroba === -1) return null;

    // O `@` precisa começar palavra.
    const anterior = arroba > 0 ? antes.charAt(arroba - 1) : " ";
    if (arroba !== 0 && !/\s/.test(anterior)) return null;

    const termo = antes.slice(arroba + 1);
    if (termo.includes("\n")) return null;

    // Menção já resolvida: o texto após o `@` começa com o nome de alguém
    // que foi escolhido.
    for (const pessoa of escolhidos.values()) {
      if (termo.startsWith(pessoa.nome_completo)) return null;
    }

    // Busca por nome completo raramente passa de três palavras.
    if (termo.split(/\s+/).length > 3 || termo.length > 60) return null;

    return { termo, inicio: arroba };
  };

  const fecharSugestoes = (): void => {
    sugestoes.style.display = "none";
    candidatos = [];
    indiceAtivo = 0;
  };

  const desenharSugestoes = (): void => {
    const atual = termoAtual();
    if (!atual) return fecharSugestoes();

    const alvo = normalizar(atual.termo);
    candidatos = diretorio
      .filter((p) => !escolhidos.has(p.id))
      .filter((p) => !alvo || normalizar(p.nome_completo).includes(alvo))
      .slice(0, 6);

    if (candidatos.length === 0) return fecharSugestoes();

    indiceAtivo = Math.min(indiceAtivo, candidatos.length - 1);
    sugestoes.style.display = "block";

    montar(
      sugestoes,
      ...candidatos.map((p, i) =>
        h(
          "button",
          {
            type: "button",
            class: `mencao__opcao${i === indiceAtivo ? " mencao__opcao--ativa" : ""}`,
            on: {
              mousedown: (ev: Event) => {
                // mousedown em vez de click: o blur da textarea fecharia a
                // lista antes do clique completar.
                ev.preventDefault();
                selecionar(p);
              },
            },
          },
          h(
            "span",
            { class: "mencao__nome" },
            insigniaHierarquia(p.hierarquia, {
              nome: p.nome_completo,
              senioridade: p.senioridade,
            }),
            " ",
            p.nome_completo,
          ),
          h(
            "span",
            { class: "mencao__cargo" },
            [p.cargo, p.equipe_nome].filter(Boolean).join(" · ") || "—",
          ),
        ),
      ),
    );
  };

  const selecionar = (pessoa: PessoaDiretorio): void => {
    const atual = termoAtual();
    if (!atual) return;

    const antes = area.value.slice(0, atual.inicio);
    const depois = area.value.slice(area.selectionStart);
    const inserido = `@${pessoa.nome_completo} `;

    area.value = antes + inserido + depois;
    const cursor = antes.length + inserido.length;
    area.setSelectionRange(cursor, cursor);

    escolhidos.set(pessoa.id, pessoa);
    desenharMarcados();
    fecharSugestoes();
    area.focus();
  };

  area.addEventListener("input", desenharSugestoes);
  area.addEventListener("blur", () => window.setTimeout(fecharSugestoes, 120));

  area.addEventListener("keydown", (ev) => {
    if (sugestoes.style.display === "none" || candidatos.length === 0) return;

    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      indiceAtivo = (indiceAtivo + 1) % candidatos.length;
      desenharSugestoes();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      indiceAtivo = (indiceAtivo - 1 + candidatos.length) % candidatos.length;
      desenharSugestoes();
    } else if (ev.key === "Enter" || ev.key === "Tab") {
      const alvo = candidatos[indiceAtivo];
      if (alvo) {
        ev.preventDefault();
        selecionar(alvo);
      }
    } else if (ev.key === "Escape") {
      fecharSugestoes();
    }
  });

  desenharMarcados();

  const elemento = h(
    "div",
    { class: "mencao" },
    h("div", { class: "mencao__campo" }, area, sugestoes),
    marcados,
    h(
      "div",
      { class: "campo__ajuda" },
      "Digite @ para mencionar um colega — quem for mencionado recebe notificação.",
    ),
  );

  return {
    elemento,
    valor: () => area.value.trim(),
    mencionados: () => [...escolhidos.keys()],
    limpar: () => {
      area.value = "";
      escolhidos.clear();
      desenharMarcados();
      fecharSugestoes();
    },
    focar: () => area.focus(),
  };
}

/** Minúsculas e sem acento, para que "jose" encontre "José". */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
