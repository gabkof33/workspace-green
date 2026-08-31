/** Área de texto com menção por `@`. */

import { h, montar } from "@/lib/dom";
import { insigniaHierarquia } from "@/components/insignia";
import type { PessoaMencao } from "@/types/dominio";

/** O mínimo para citar uma demanda: o código vira link sozinho no texto. */
export interface DemandaMencao {
  codigo: string;
  titulo: string;
}

/**
 * Uma linha da lista de sugestões. Pessoa entra por `@`, demanda por `/` —
 * os dois gatilhos dividem a mesma lista, a mesma navegação por seta e o
 * mesmo Enter, porque para quem digita é o mesmo gesto.
 */
type Sugestao =
  | { tipo: "pessoa"; pessoa: PessoaMencao }
  | { tipo: "demanda"; demanda: DemandaMencao };

export interface CampoMencao {
  elemento: HTMLElement;
  valor(): string;
  mencionados(): string[];
  limpar(): void;
  focar(): void;
}

export function criarCampoMencao(
  diretorio: PessoaMencao[],
  opcoes: {
    placeholder?: string;
    rotulo?: string;
    /**
     * Cresce com o texto até um teto, como a textarea do `MessageComposer` do
     * DS. Usar junto com `resize: none`: sem a alça de arrastar, é isto que
     * abre espaço para uma mensagem de três linhas.
     */
    autoCrescer?: boolean;
    /**
     * Demandas citáveis por `/`. Sem a lista, o gatilho não existe.
     *
     * O código inserido (`DEM-2026-000014`) já vira link sozinho na mensagem:
     * o `texto-mencao.ts` reconhece o padrão e navega para a demanda. Esta
     * lista existe só para não obrigar ninguém a decorar o número.
     */
    demandas?: DemandaMencao[];
  } = {},
): CampoMencao {
  const escolhidos = new Map<string, PessoaMencao>();
  let indiceAtivo = 0;
  let candidatos: Sugestao[] = [];

  const area = h("textarea", {
    class: "area-texto",
    placeholder:
      opcoes.placeholder ?? "Escreva aqui. Use @ para mencionar alguém.",
    aria: { autocomplete: "list", label: opcoes.rotulo ?? "Comentário" },
  }) as HTMLTextAreaElement;

  /** O `max-h-[200px]` da textarea do composer do DS. */
  const TETO_ALTURA = 200;

  const ajustarAltura = (): void => {
    if (!opcoes.autoCrescer) return;
    // `auto` primeiro: sem isso o `scrollHeight` só cresce, e o campo ficaria
    // alto para sempre depois de uma mensagem longa.
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, TETO_ALTURA)}px`;
  };

  if (opcoes.autoCrescer) area.addEventListener("input", ajustarAltura);

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

  /**
   * Texto digitado após o último gatilho (`@` ou `/`) ainda não resolvido.
   *
   * Mesma regra para os dois: o sinal precisa começar palavra, o termo não
   * atravessa linha e tem teto de tamanho — passou disso, quem digita está
   * escrevendo uma frase, não procurando.
   */
  const termoDe = (
    sinal: string,
    maxPalavras: number,
  ): { termo: string; inicio: number } | null => {
    const pos = area.selectionStart;
    const antes = area.value.slice(0, pos);
    const marca = antes.lastIndexOf(sinal);
    if (marca === -1) return null;

    const anterior = marca > 0 ? antes.charAt(marca - 1) : " ";
    if (marca !== 0 && !/\s/.test(anterior)) return null;

    const termo = antes.slice(marca + 1);
    if (termo.includes("\n")) return null;
    if (termo.split(/\s+/).length > maxPalavras || termo.length > 60) {
      return null;
    }

    return { termo, inicio: marca };
  };

  /** Termo após o último `@` — busca por nome. */
  const termoAtual = (): { termo: string; inicio: number } | null => {
    const atual = termoDe("@", 3);
    if (!atual) return null;

    // Menção já resolvida: o texto após o `@` começa com o nome de alguém que
    // foi escolhido.
    for (const pessoa of escolhidos.values()) {
      if (atual.termo.startsWith(pessoa.nome_completo)) return null;
    }
    return atual;
  };

  /** Termo após o último `/` — busca por demanda. */
  const termoDemanda = (): { termo: string; inicio: number } | null => {
    if (!opcoes.demandas?.length) return null;
    // Duas palavras bastam para achar um título; mais que isso é frase com
    // barra no meio ("entrada/saída"), não busca.
    return termoDe("/", 2);
  };

  const fecharSugestoes = (): void => {
    sugestoes.style.display = "none";
    candidatos = [];
    indiceAtivo = 0;
  };

  /** Linha da lista: rótulo em cima, apoio embaixo — igual nos dois modos. */
  const opcao = (
    sugestao: Sugestao,
    i: number,
    principal: Node | string,
    apoio: string,
  ): HTMLElement =>
    h(
      "button",
      {
        type: "button",
        class: `mencao__opcao${i === indiceAtivo ? " mencao__opcao--ativa" : ""}`,
        on: {
          mousedown: (ev: Event) => {
            // mousedown em vez de click: o blur da textarea fecharia a lista
            // antes do clique completar.
            ev.preventDefault();
            selecionar(sugestao);
          },
        },
      },
      h("span", { class: "mencao__nome" }, principal),
      h("span", { class: "mencao__cargo" }, apoio),
    );

  const desenharSugestoes = (): void => {
    // `/` primeiro: o `@` casa em qualquer texto anterior da mesma linha, e
    // uma barra digitada depois de uma menção resolvida cairia no modo pessoa.
    const daDemanda = termoDemanda();
    if (daDemanda) return desenharDemandas(daDemanda.termo);

    const atual = termoAtual();
    if (!atual) return fecharSugestoes();

    const alvo = normalizar(atual.termo);
    candidatos = diretorio
      .filter((p) => !escolhidos.has(p.id))
      .filter((p) => !alvo || normalizar(p.nome_completo).includes(alvo))
      .slice(0, 6)
      .map((pessoa) => ({ tipo: "pessoa" as const, pessoa }));

    if (candidatos.length === 0) return fecharSugestoes();

    indiceAtivo = Math.min(indiceAtivo, candidatos.length - 1);
    sugestoes.style.display = "block";

    montar(
      sugestoes,
      ...candidatos.map((s, i) => {
        const p = s.tipo === "pessoa" ? s.pessoa : null;
        if (!p) return h("span");
        // Insígnia e cargo só aparecem para quem recebeu o diretório completo
        // — a equipe de TI. Solicitante vem de `diretorio_mencoes`, que
        // entrega apenas id e nome: sem esses campos a linha mostra o nome e
        // nada mais, em vez de inventar hierarquia que a pessoa não tem
        // permissão de saber.
        return opcao(
          s,
          i,
          h(
            "span",
            {},
            p.hierarquia
              ? insigniaHierarquia(p.hierarquia, {
                  nome: p.nome_completo,
                  ...(p.senioridade ? { senioridade: p.senioridade } : {}),
                })
              : null,
            p.hierarquia ? " " : null,
            p.nome_completo,
          ),
          [p.cargo, p.equipe_nome].filter(Boolean).join(" · ") || "—",
        );
      }),
    );
  };

  const desenharDemandas = (termo: string): void => {
    const alvo = normalizar(termo);
    candidatos = (opcoes.demandas ?? [])
      // Casa por código E por título: quem lembra do número digita o número,
      // quem lembra do assunto digita o assunto.
      .filter(
        (d) =>
          !alvo ||
          normalizar(d.codigo).includes(alvo) ||
          normalizar(d.titulo).includes(alvo),
      )
      .slice(0, 6)
      .map((demanda) => ({ tipo: "demanda" as const, demanda }));

    if (candidatos.length === 0) return fecharSugestoes();

    indiceAtivo = Math.min(indiceAtivo, candidatos.length - 1);
    sugestoes.style.display = "block";

    montar(
      sugestoes,
      ...candidatos.map((s, i) =>
        s.tipo === "demanda"
          ? opcao(s, i, s.demanda.titulo, s.demanda.codigo)
          : h("span"),
      ),
    );
  };

  const selecionar = (sugestao: Sugestao): void => {
    const atual =
      sugestao.tipo === "pessoa" ? termoAtual() : termoDemanda();
    if (!atual) return;

    const antes = area.value.slice(0, atual.inicio);
    const depois = area.value.slice(area.selectionStart);
    // Na demanda o que entra é o CÓDIGO puro, sem a barra: o
    // `texto-mencao.ts` já reconhece `DEM-2026-000014` e o transforma em link
    // para a demanda. A barra é só o atalho de digitação.
    const inserido =
      sugestao.tipo === "pessoa"
        ? `@${sugestao.pessoa.nome_completo} `
        : `${sugestao.demanda.codigo} `;

    area.value = antes + inserido + depois;
    const cursor = antes.length + inserido.length;
    area.setSelectionRange(cursor, cursor);

    if (sugestao.tipo === "pessoa") {
      escolhidos.set(sugestao.pessoa.id, sugestao.pessoa);
      desenharMarcados();
    }

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
      opcoes.demandas?.length
        ? "@ menciona um colega, que recebe notificação · / cita uma demanda pelo número ou pelo título."
        : "Digite @ para mencionar um colega — quem for mencionado recebe notificação.",
    ),
  );

  return {
    elemento,
    valor: () => area.value.trim(),
    mencionados: () => [...escolhidos.keys()],
    limpar: () => {
      area.value = "";
      ajustarAltura();
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
