/** Fluxo térmico: área empilhada por serviço, colorida pelo índice de calor. */

import { h, montar } from "@/lib/dom";
import { svgEl } from "@/lib/svg";
import { acumular, amostrar, densidade, travar } from "@/lib/suavizar";
import { apurarCalor, nivelDe, NIVEIS } from "@/lib/calor";
import type { CalorServico } from "@/lib/calor";
import type { EventoApi } from "@/types/dominio";
import type { NoGrafo } from "@/components/grafo-servicos";

/** Intervalos da timeline. Bastante para o fluxo ter forma, pouco para caber. */
const PONTOS = 36;

/** Amostras por intervalo na curva suavizada. */
const SUB = 5;

/** Raio do bulbo de densidade, em intervalos. É o que faz mancha em vez de agulha. */
const RAIO = 3;

interface Faixa {
  dados: CalorServico;
  rotulo: string;
  cor: string;
  nivel: string;
  /** Densidade, para a geometria. A contagem crua fica em `dados`. */
  suave: number[];
  visivel: boolean;
  no: NoGrafo | null;
}

export function desenharFluxoTermico(
  titulo: string,
  destinos: NoGrafo[],
  eventos: EventoApi[],
  minutos: number,
  aoSelecionar: (no: NoGrafo) => void,
): HTMLElement {
  const inicio = Date.now() - minutos * 60_000;
  const passoMs = (minutos * 60_000) / PONTOS;

  // Frio embaixo, quente em cima: a pilha vira estratificação térmica e a
  // proporção de tráfego quente se lê de relance, na coroa do fluxo.
  const faixas: Faixa[] = apurarCalor(eventos, inicio, minutos, PONTOS)
    .slice()
    .reverse()
    .map((d) => {
      const n = nivelDe(d.calor);
      return {
        dados: d,
        rotulo: curto(d.chave),
        cor: n.cor,
        nivel: n.rotulo,
        suave: densidade(d.contagens, RAIO),
        visivel: true,
        no: destinos.find((x) => x.chave === d.chave) ?? null,
      };
    });

  const plot = h("div", { class: "fluxo__plot" });
  const eixoY = h("div", { class: "grafico__eixo-y fluxo__eixo-y" });
  const eixoX = h("div", { class: "grafico__eixo-x fluxo__eixo-x" });
  const legenda = h("div", { class: "fluxo__legenda" });
  const escala = h("div", { class: "fluxo__escala" });
  const moldura = h("div", { class: "grafico__area-plot" }, eixoY, plot);

  const desenhar = (): void => {
    montar(legenda, ...faixas.map(chip));
    desenharPlot();
  };

  /* ---------- Legenda: serviço, calor e nível ---------- */

  const chip = (f: Faixa): HTMLElement =>
    h(
      "button",
      {
        class: `fluxo__chip${f.visivel ? "" : " fluxo__chip--fora"}`,
        type: "button",
        aria: { pressed: String(f.visivel) },
        title: `${f.rotulo} · calor ${f.dados.calor.toFixed(2)} (${f.nivel}) · ${Math.round(f.dados.latencia_ms)}ms média · p95 ${Math.round(f.dados.p95_ms)}ms · ${(f.dados.erro * 100).toFixed(1)}% erro`,
        on: {
          click: () => {
            f.visivel = !f.visivel;
            desenhar();
          },
        },
      },
      h("span", { class: "fluxo__chave", style: `background:${f.cor}` }),
      h("span", { class: "fluxo__chip-nome" }, f.rotulo),
      h("span", { class: "fluxo__chip-total" }, f.dados.calor.toFixed(2)),
    );

  /* ---------- Escala de calor, com os níveis nomeados ---------- */

  montar(
    escala,
    h("span", { class: "fluxo__escala-rotulo" }, "Calor"),
    ...NIVEIS.map((n) =>
      h(
        "span",
        { class: "fluxo__escala-degrau" },
        h("span", { class: "fluxo__chave", style: `background:${n.cor}` }),
        h("span", {}, n.rotulo),
      ),
    ),
    h(
      "span",
      { class: "fluxo__escala-nota" },
      "H = 0,4·latência + 0,3·frequência + 0,2·erro + 0,1·p95",
    ),
  );

  /* ---------- Plot ---------- */

  function desenharPlot(): void {
    const ativas = faixas.filter((f) => f.visivel);

    if (eventos.length === 0 || ativas.length === 0) {
      montar(
        plot,
        h(
          "p",
          { class: "fluxo__vazio" },
          eventos.length === 0
            ? "Nenhuma chamada registrada nesta janela."
            : "Todos os serviços estão ocultos — reative algum na legenda.",
        ),
      );
      montar(eixoY);
      montar(eixoX);
      return;
    }

    const cru = acumular(
      ativas.map((f) => f.dados.contagens),
      PONTOS,
    );
    const bruto = acumular(
      ativas.map((f) => f.suave),
      PONTOS,
    );

    // A densidade é reescalada para o pico dela bater com o pico real: sem isso
    // o eixo sairia da densidade e a dica da contagem, um contradizendo o
    // outro. Um fator único preserva a proporção entre as faixas.
    const picoCru = Math.max(1, ...(cru[cru.length - 1] ?? [0]));
    const picoSuave = Math.max(0.0001, ...(bruto[bruto.length - 1] ?? [0]));
    const fator = picoCru / picoSuave;
    const fronteiras = bruto.map((l) => l.map((v) => v * fator));
    const topo = tetoRedondo(picoCru);

    const svg = svgEl("svg", {
      class: "fluxo__svg",
      viewBox: "0 0 100 100",
      preserveAspectRatio: "none",
      // A tabela de chamadas abaixo do gráfico traz os mesmos dados em texto.
      "aria-hidden": "true",
    });

    const py = (v: number): number => 100 - (v / topo) * 100;

    for (let i = 0; i <= 4; i += 1) {
      const y = py((topo / 4) * i);
      svg.append(
        svgEl("line", {
          class: "grafico__grade",
          x1: "0",
          x2: "100",
          y1: String(y),
          y2: String(y),
        }),
      );
    }

    // Amostrada densamente e travada: a suavização monotônica limita o excesso
    // dentro de cada intervalo, mas não em relação a outra curva — duas
    // fronteiras podem se cruzar e a faixa entre elas sairia invertida.
    const curvas = fronteiras.map((f) => amostrar(f, SUB));
    travar(curvas);
    const amostras = curvas[0]?.length ?? 0;
    const px = (j: number): number => (j / Math.max(1, amostras - 1)) * 100;

    ativas.forEach((f, k) => {
      const alto = curvas[k];
      const baixo = k === 0 ? null : curvas[k - 1];
      if (!alto) return;

      const subindo = alto.map(
        (v, j) => `${px(j).toFixed(2)},${py(v).toFixed(2)}`,
      );
      const descendo = baixo
        ? baixo
            .map((v, j) => `${px(j).toFixed(2)},${py(v).toFixed(2)}`)
            .reverse()
        : ["100.00,100.00", "0.00,100.00"];

      const faixa = svgEl("path", {
        class: "fluxo__faixa",
        d: `M ${subindo.join(" L ")} L ${descendo.join(" L ")} Z`,
        fill: f.cor,
      });

      if (f.no) {
        const no = f.no;
        faixa.classList.add("fluxo__faixa--clicavel");
        faixa.addEventListener("click", () => aoSelecionar(no));
      }
      svg.append(faixa);
    });

    /* ---------- Pico ---------- */

    const totais = new Array<number>(PONTOS).fill(0);
    for (const f of ativas) {
      f.dados.contagens.forEach((v, i) => {
        totais[i] = (totais[i] ?? 0) + v;
      });
    }
    const iPico = totais.indexOf(Math.max(...totais));
    const xPico = (iPico / Math.max(1, PONTOS - 1)) * 100;
    if (totais[iPico]) {
      svg.append(
        svgEl("line", {
          class: "fluxo__pico-linha",
          x1: String(xPico),
          x2: String(xPico),
          y1: "0",
          y2: "100",
        }),
      );
    }

    /* ---------- Cursor e dica ---------- */

    const cursor = svgEl("line", {
      class: "grafico__cursor",
      y1: "0",
      y2: "100",
    });
    svg.append(cursor);

    const dica = h("div", { class: "grafico__dica fluxo__dica" });
    const marcaPico = totais[iPico]
      ? h(
          "span",
          {
            class: "fluxo__pico",
            style: `left:${Math.min(Math.max(xPico, 5), 95)}%`,
          },
          `pico ${totais[iPico]}`,
        )
      : null;

    montar(plot, svg, marcaPico, dica);

    const mostrar = (i: number): void => {
      const total = totais[i] ?? 0;
      moldura.classList.add("grafico__area-plot--ativo");
      const x = (i / Math.max(1, PONTOS - 1)) * 100;
      cursor.setAttribute("x1", String(x));
      cursor.setAttribute("x2", String(x));

      // Do mais quente para o mais frio: é a ordem que interessa a quem olha.
      const presentes = ativas
        .filter((f) => (f.dados.contagens[i] ?? 0) > 0)
        .sort((a, b) => b.dados.calor - a.dados.calor);

      montar(
        dica,
        h(
          "b",
          {},
          `${hora(new Date(inicio + i * passoMs))} · ${total} chamada${total === 1 ? "" : "s"}`,
        ),
        ...presentes.map((f) =>
          h(
            "span",
            { class: "fluxo__dica-linha" },
            h("span", {
              class: "fluxo__dica-chave",
              style: `background:${f.cor}`,
            }),
            h("b", {}, String(f.dados.contagens[i] ?? 0)),
            h("span", {}, f.rotulo),
            h(
              "span",
              { class: "fluxo__dica-vazio" },
              `H ${f.dados.calor.toFixed(2)}`,
            ),
          ),
        ),
        total === 0
          ? h("span", { class: "fluxo__dica-vazio" }, "sem chamadas")
          : null,
      );
      dica.style.left = `${Math.min(Math.max(x, 14), 86)}%`;
    };

    plot.addEventListener("pointermove", (ev) => {
      const caixa = plot.getBoundingClientRect();
      const rel = (ev.clientX - caixa.left) / caixa.width;
      mostrar(Math.min(Math.max(Math.round(rel * (PONTOS - 1)), 0), PONTOS - 1));
    });
    plot.addEventListener("pointerleave", () =>
      moldura.classList.remove("grafico__area-plot--ativo"),
    );

    /* ---------- Eixos ---------- */

    montar(
      eixoY,
      ...[4, 3, 2, 1, 0].map((i) =>
        h("span", {}, String(Math.round((topo / 4) * i))),
      ),
    );

    const marcos = 6;
    montar(
      eixoX,
      ...Array.from({ length: marcos + 1 }, (_, i) =>
        h("span", {}, hora(new Date(inicio + (i / marcos) * minutos * 60_000))),
      ),
    );
  }

  desenhar();

  return h(
    "div",
    { class: "cartao grafico fluxo" },
    h(
      "div",
      { class: "grafico__cabecalho" },
      h("h3", { class: "grafico__titulo" }, titulo),
      h(
        "span",
        { class: "grafico__subtitulo" },
        `${eventos.length} chamada${eventos.length === 1 ? "" : "s"} · altura é volume, cor é calor`,
      ),
    ),
    escala,
    legenda,
    moldura,
    eixoX,
  );
}

/* ==========================================================================
   Formato
   ========================================================================== */

/** Teto arredondado, para o rótulo do eixo não sair quebrado. */
function tetoRedondo(maximo: number): number {
  const passo = Math.pow(10, Math.floor(Math.log10(Math.max(1, maximo))));
  return Math.max(4, Math.ceil(maximo / passo) * passo);
}

/** `rpc:` e `tabela:` são ruído: todo serviço tem um. */
function curto(rotulo: string): string {
  return rotulo.replace(/^(rpc|tabela):/, "");
}

function hora(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
