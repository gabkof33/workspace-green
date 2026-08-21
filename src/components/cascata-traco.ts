/**
 * Cascata de um traço: cada span como uma barra, posicionada pelo instante em
 * que começou e dimensionada pela própria latência — a mesma leitura de um
 * waterfall de tracing distribuído, só que com um span por chamada real
 * (não há profundidade de árvore que o navegador possa observar por si só).
 */

import { h } from "@/lib/dom";
import { duracaoMs } from "@/lib/observabilidade";
import type { EventoApi } from "@/types/dominio";

export function desenharCascataDeTraco(spans: EventoApi[]): HTMLElement {
  const primeiro = spans[0];
  if (!primeiro) {
    return h(
      "p",
      { class: "texto-sutil" },
      "Traço sem spans na janela — pode já ter saído do recorte de tempo.",
    );
  }

  const inicioTraco = new Date(primeiro.criado_em).getTime();
  const linhas = spans.map((span) => ({
    span,
    inicioMs: Math.max(new Date(span.criado_em).getTime() - inicioTraco, 0),
  }));

  const fimTotal = Math.max(
    1,
    ...linhas.map((l) => l.inicioMs + l.span.latencia_ms),
  );

  return h(
    "div",
    { class: "cascata" },
    ...linhas.map((l) => {
      const comErro =
        (l.span.status_code !== null && l.span.status_code >= 400) ||
        l.span.erro_tipo !== null;
      const esquerda = (l.inicioMs / fimTotal) * 100;
      const largura = Math.max((l.span.latencia_ms / fimTotal) * 100, 0.6);

      return h(
        "div",
        {
          class: "cascata__linha",
          title: `${l.span.metodo_http} ${l.span.endpoint} · ${duracaoMs(l.span.latencia_ms)}${
            comErro ? ` · ${l.span.erro_tipo ?? "erro"}` : ""
          }`,
        },
        h(
          "div",
          { class: "cascata__rotulo" },
          h("span", { class: "cascata__metodo" }, l.span.metodo_http),
          h("span", { class: "cascata__endpoint" }, l.span.endpoint),
        ),
        h(
          "div",
          { class: "cascata__trilha" },
          h("span", {
            class: `cascata__barra${comErro ? " cascata__barra--erro" : ""}`,
            style: `left:${esquerda}%;width:${largura}%`,
          }),
        ),
        h(
          "span",
          { class: "cascata__duracao mono" },
          duracaoMs(l.span.latencia_ms),
        ),
      );
    }),
  );
}
