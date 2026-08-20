/** Diálogos da aplicação. */

import { h } from "@/lib/dom";

interface Base {
  titulo: string;
  texto?: string;
  /** Explica a consequência — aparece destacado abaixo do texto. */
  consequencia?: string;
  rotuloConfirmar?: string;
  rotuloCancelar?: string;
  perigo?: boolean;
}

export interface OpcoesConfirmar extends Base {}

export interface OpcoesPerguntar extends Base {
  rotuloCampo: string;
  valorInicial?: string;
  placeholder?: string;
  multilinha?: boolean;
  /** Mínimo de caracteres. */
  minimo?: number;
  /** Validação extra; devolve a mensagem de erro ou null. */
  validar?: (valor: string) => string | null;
}

export function confirmar(opcoes: OpcoesConfirmar): Promise<boolean> {
  return new Promise((resolver) => {
    abrir(opcoes, null, (resultado) => resolver(resultado !== null));
  });
}

export function perguntar(opcoes: OpcoesPerguntar): Promise<string | null> {
  return new Promise((resolver) => {
    abrir(opcoes, opcoes, resolver);
  });
}

/* Montagem */

function abrir(
  base: Base,
  campo: OpcoesPerguntar | null,
  concluir: (valor: string | null) => void,
): void {
  const erro = h("div", { class: "campo__erro", style: "display:none" });

  const entrada = campo
    ? campo.multilinha
      ? (h("textarea", {
          class: "area-texto",
          placeholder: campo.placeholder ?? "",
        }) as HTMLTextAreaElement)
      : (h("input", {
          class: "entrada",
          type: "text",
          placeholder: campo.placeholder ?? "",
        }) as HTMLInputElement)
    : null;

  if (entrada && campo?.valorInicial) {
    entrada.value = campo.valorInicial;
  }

  const botaoOk = h(
    "button",
    {
      class: `btn ${base.perigo ? "btn--perigo" : "btn--primario"}`,
      type: "submit",
    },
    base.rotuloConfirmar ?? "Confirmar",
  );

  const fechar = (valor: string | null): void => {
    document.removeEventListener("keydown", aoTeclar);
    overlay.remove();
    concluir(valor);
  };

  const aoTeclar = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      fechar(null);
    }
    // Enter confirma em campo de uma linha; em textarea, só com Ctrl.
    if (ev.key === "Enter" && (!campo?.multilinha || ev.ctrlKey)) {
      if (overlay.contains(document.activeElement)) {
        ev.preventDefault();
        submeter();
      }
    }
  };

  const submeter = (): void => {
    if (!campo || !entrada) {
      fechar("");
      return;
    }

    const valor = entrada.value.trim();

    if (campo.minimo && valor.length < campo.minimo) {
      mostrarErro(
        `Escreva ao menos ${campo.minimo} caracteres — faltam ${campo.minimo - valor.length}.`,
      );
      return;
    }

    const problema = campo.validar?.(valor) ?? null;
    if (problema) {
      mostrarErro(problema);
      return;
    }

    fechar(valor);
  };

  const mostrarErro = (mensagem: string): void => {
    erro.textContent = mensagem;
    erro.style.display = "flex";
    entrada?.focus();
  };

  const caixa = h(
    "form",
    {
      class: "dialogo",
      on: {
        submit: (ev: Event) => {
          ev.preventDefault();
          submeter();
        },
        // Clique dentro não deve fechar pelo overlay.
        click: (ev: Event) => ev.stopPropagation(),
      },
    },
    h("h3", { class: "dialogo__titulo" }, base.titulo),
    base.texto ? h("p", { class: "dialogo__texto" }, base.texto) : null,
    base.consequencia
      ? h(
          "div",
          { class: "dialogo__consequencia" },
          h("span", { class: "aviso__icone" }, "i"),
          h("span", {}, base.consequencia),
        )
      : null,
    campo && entrada
      ? h(
          "div",
          { class: "campo", style: "margin-bottom:0" },
          h("label", { class: "campo__rotulo" }, campo.rotuloCampo),
          entrada,
        )
      : null,
    erro,
    h(
      "div",
      { class: "dialogo__acoes" },
      h(
        "button",
        {
          class: "btn",
          type: "button",
          on: { click: () => fechar(null) },
        },
        base.rotuloCancelar ?? "Cancelar",
      ),
      botaoOk,
    ),
  );

  const overlay = h(
    "div",
    {
      class: "dialogo__fundo",
      // Clicar fora desiste, como em qualquer modal.
      on: { click: () => fechar(null) },
    },
    caixa,
  );

  document.body.append(overlay);
  document.addEventListener("keydown", aoTeclar);

  window.requestAnimationFrame(() => {
    if (entrada) {
      entrada.focus();
      if (entrada instanceof HTMLInputElement) entrada.select();
    } else {
      botaoOk.focus();
    }
  });
}

/**
 * Diálogo de escolha entre opções — usado onde `prompt` seria ambíguo, como
 * escolher uma data.
 */
export function escolherData(opcoes: {
  titulo: string;
  texto?: string;
  valorInicial?: string;
}): Promise<string | null> {
  return new Promise((resolver) => {
    const entrada = h("input", {
      class: "entrada",
      type: "date",
      value: opcoes.valorInicial ?? new Date().toISOString().slice(0, 10),
    }) as HTMLInputElement;

    const erro = h("div", { class: "campo__erro", style: "display:none" });

    const fechar = (valor: string | null): void => {
      document.removeEventListener("keydown", aoTeclar);
      overlay.remove();
      resolver(valor);
    };

    const aoTeclar = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") fechar(null);
    };

    const caixa = h(
      "form",
      {
        class: "dialogo",
        on: {
          submit: (ev: Event) => {
            ev.preventDefault();
            if (!entrada.value) {
              erro.textContent = "Escolha uma data.";
              erro.style.display = "flex";
              return;
            }
            fechar(entrada.value);
          },
          click: (ev: Event) => ev.stopPropagation(),
        },
      },
      h("h3", { class: "dialogo__titulo" }, opcoes.titulo),
      opcoes.texto ? h("p", { class: "dialogo__texto" }, opcoes.texto) : null,
      h("div", { class: "campo", style: "margin-bottom:0" }, entrada),
      erro,
      h(
        "div",
        { class: "dialogo__acoes" },
        h(
          "button",
          { class: "btn", type: "button", on: { click: () => fechar(null) } },
          "Cancelar",
        ),
        h("button", { class: "btn btn--primario", type: "submit" }, "Salvar"),
      ),
    );

    const overlay = h(
      "div",
      { class: "dialogo__fundo", on: { click: () => fechar(null) } },
      caixa,
    );

    document.body.append(overlay);
    document.addEventListener("keydown", aoTeclar);
    window.requestAnimationFrame(() => entrada.focus());
  });
}

/** Fecha qualquer diálogo aberto — chamado ao trocar de rota. */
export function fecharDialogos(): void {
  for (const el of Array.from(document.querySelectorAll(".dialogo__fundo"))) {
    el.remove();
  }
}
