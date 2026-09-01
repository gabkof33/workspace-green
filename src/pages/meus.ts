/** Meus chamados — visão do solicitante. */

import { criarBarraFiltros } from "@/components/barra-filtros";
import { aguardando } from "@/components/esqueleto";
import { h, montar } from "@/lib/dom";
import { listarChamados } from "@/lib/api";
import { navegar } from "@/lib/router";
import { tabelaChamados } from "@/components/tabela-chamados";
import type { Perfil } from "@/types/dominio";

export function renderizarMeus(alvo: HTMLElement, perfil: Perfil): void {
  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  const barra = criarBarraFiltros({
    aoMudar: () => desenhar(),
    filtros: [{ chave: "data", rotulo: "Período", tipo: "periodo" }],
  });

  const desenhar = (): void => {
    aguardando(area, "tabela");

    void listarChamados({
      doSolicitante: perfil.id,
      ...barra.periodo("data"),
    }).then(
      (chamados) => {
        const aguardandoVoce = chamados.filter(
          (c) => c.status === "pendente_usuario",
        );

        montar(
          area,
          h("div", { class: "grade-filtros" }, barra.elemento),
          aguardandoVoce.length > 0
            ? h(
                "div",
                { class: "aviso aviso--alerta" },
                h("span", { class: "aviso__icone" }, "!"),
                h(
                  "span",
                  {},
                  h(
                    "b",
                    {},
                    `${aguardandoVoce.length} chamado${aguardandoVoce.length > 1 ? "s aguardam" : " aguarda"} sua resposta. `,
                  ),
                  "O prazo fica parado enquanto a equipe espera por você — responder destrava o atendimento.",
                ),
              )
            : null,
          tabelaChamados({
            chamados,
            mostrarResponsavel: true,
            vazio: {
              titulo: "Você ainda não abriu chamados",
              texto:
                "Quando precisar de algo da TI, abra um chamado pelo catálogo — é por ele que o pedido entra na fila com prazo definido.",
            },
          }),
          h(
            "div",
            { style: "margin-top:var(--s-4)" },
            h(
              "button",
              {
                class: "btn btn--primario",
                type: "button",
                on: { click: () => navegar("demandas") },
              },
              "Registrar novo",
            ),
          ),
        );
      },
    );
  };

  desenhar();
}
