/**
 * Mapa da empresa — o sistema orbital dos setores da iGreen Energy.
 *
 * A cena WebGL entra por `import()` dinâmico: o `three` tem uns 600 KB e só
 * esta tela o usa, então ele vira um pedaço à parte que o navegador só baixa
 * quando alguém abre o mapa. Estático, ele entraria no pacote que TODA sessão
 * carrega, inclusive quem nunca vem aqui.
 */

import { avisar, h, montar } from "@/lib/dom";
import {
  CORPOS,
  PLANETAS,
  SOL,
  cruzamentosDe,
  type Corpo,
  type EspecieCorpo,
} from "@/lib/mapa-empresa";
import type { MapaOrbital } from "@/components/mapa-orbital";

const ESPECIE: Record<EspecieCorpo, string> = {
  sol: "☉ Sol — centro da operação",
  planeta: "● Planeta — grande área",
  satelite: "○ Satélite — setor/equipe",
};

const RELACAO: Record<EspecieCorpo, string> = {
  sol: "Planetas em órbita",
  planeta: "Satélites e conexões",
  satelite: "Relacionado a",
};

export function renderizarMapa(alvo: HTMLElement): void {
  let cena: MapaOrbital | null = null;

  const palco = h("div", { class: "mapa__palco" });
  const painel = h("aside", { class: "mapa__painel" });

  const selo = h(
    "span",
    { class: "mapa__selo" },
    "webgl · sistema orbital",
  );

  const limpar = h(
    "button",
    {
      class: "mapa__limpar",
      type: "button",
      on: { click: () => selecionar(null) },
    },
    "✕ limpar seleção",
  );

  const dica = h(
    "span",
    { class: "mapa__dica" },
    "clique segue · duplo clique aproxima · com foco, arraste rodeia e a rolagem afasta sem soltar",
  );

  const enquadrar = h(
    "button",
    {
      class: "mapa__reenquadrar",
      type: "button",
      title: "Voltar ao enquadramento do modo atual",
      on: { click: () => cena?.reenquadrar() },
    },
    "Reenquadrar",
  );

  const velocidade = h(
    "div",
    { class: "mapa__velocidade" },
    h("span", {}, "velocidade"),
    h(
      "button",
      {
        type: "button",
        aria: { label: "Mais devagar" },
        on: { click: () => cena?.acelerar(1 / 1.6) },
      },
      "−",
    ),
    h(
      "button",
      {
        type: "button",
        aria: { label: "Mais rápido" },
        on: { click: () => cena?.acelerar(1.6) },
      },
      "+",
    ),
  );

  montar(alvo, h("div", { class: "mapa" }, palco, painel));
  palco.append(selo, limpar, dica, velocidade, enquadrar);

  /* ---------- Painel ---------- */

  function selecionar(id: string | null): void {
    cena?.focar(id);
    limpar.classList.toggle("mapa__limpar--visivel", id !== null);

    if (id === null) {
      montar(
        painel,
        h("p", { class: "mapa__rotulo" }, "Selecionado"),
        h("p", { class: "mapa__titulo" }, "Nenhum corpo selecionado"),
        h(
          "p",
          { class: "mapa__vazio" },
          "Toque no Sol (Cliente), em um planeta (área) ou em um satélite (setor/equipe) para ver a função e quem orbita ao redor.",
        ),
        legenda(),
      );
      return;
    }

    const corpo = CORPOS[id];
    if (!corpo) return;

    montar(
      painel,
      h("p", { class: "mapa__rotulo" }, "Selecionado"),
      h("p", { class: "mapa__titulo" }, corpo.rotulo),
      h("p", { class: "mapa__especie" }, ESPECIE[corpo.especie]),
      h("p", { class: "mapa__rotulo" }, "Função"),
      h("p", { class: "mapa__corpo" }, corpo.funcao),
      h("p", { class: "mapa__rotulo" }, RELACAO[corpo.especie]),
      h("div", { class: "mapa__fichas" }, ...fichas(corpo)),
      legenda(),
    );
  }

  /** Pai, filhos e ligações cruzadas — cada um leva à sua própria seleção. */
  function fichas(corpo: Corpo): HTMLElement[] {
    const lista: HTMLElement[] = [];

    const ficha = (id: string, prefixo: string, pai = false): HTMLElement =>
      h(
        "button",
        {
          class: `mapa__ficha${pai ? " mapa__ficha--pai" : ""}`,
          type: "button",
          on: { click: () => selecionar(id) },
        },
        `${prefixo}${CORPOS[id]?.rotulo ?? id}`,
      );

    if (corpo.paiId) lista.push(ficha(corpo.paiId, "↑ ", true));
    for (const filho of corpo.filhosIds) lista.push(ficha(filho, ""));
    for (const outro of cruzamentosDe(corpo.id)) lista.push(ficha(outro, "⇄ "));

    return lista;
  }

  function legenda(): HTMLElement {
    const item = (cor: number, texto: string): HTMLElement =>
      h(
        "span",
        { class: "mapa__legenda-item" },
        h("span", {
          class: "mapa__legenda-bolinha",
          style: `background:#${cor.toString(16).padStart(6, "0")}`,
        }),
        texto,
      );

    return h(
      "div",
      { class: "mapa__legenda" },
      item(SOL.cor, "Sol · Cliente"),
      ...PLANETAS.map((p) => item(p.cor, p.rotulo)),
    );
  }

  selecionar(null);

  /* ---------- Cena ---------- */

  void import("@/components/mapa-orbital")
    .then(({ criarMapaOrbital }) => {
      try {
        cena = criarMapaOrbital({ palco, aoSelecionar: selecionar });
      } catch {
        // `WebGLRenderer` lança quando não há contexto — placa antiga,
        // aceleração desligada, sessão remota.
        montar(
          palco,
          h(
            "div",
            { class: "mapa__sem-webgl" },
            h("h3", {}, "Sem WebGL neste navegador"),
            h(
              "p",
              {},
              "O mapa é desenhado pela placa de vídeo. Abra em um navegador atualizado, ou com a aceleração por hardware ligada, para vê-lo.",
            ),
          ),
        );
      }
    })
    .catch(() =>
      avisar("Falha ao carregar o mapa. Recarregue a página.", "erro"),
    );

  // A cena roda um laço de animação e escuta a janela: sair da tela sem
  // desmontar deixaria a GPU trabalhando numa página que ninguém está vendo.
  const aoSair = (): void => {
    cena?.destruir();
    cena = null;
    window.removeEventListener("hashchange", aoSair);
  };
  window.addEventListener("hashchange", aoSair);
}
