/** Filtro de período, compartilhado pelas telas de lista. */

import { h, montar } from "@/lib/dom";
import { diasAtras, hojeIso, type Periodo } from "@/lib/periodo";
import { gravar, ler } from "@/lib/armazenamento";

export interface FiltroData {
  elemento: HTMLElement;
  valor(): Periodo;
}

/** `null` em dias = sem limite; `custom` abre os dois campos de data. */
const OPCOES: Array<[string, string, number | null]> = [
  ["tudo", "Tudo", null],
  ["7", "7 dias", 7],
  ["30", "30 dias", 30],
  ["90", "90 dias", 90],
];

// Um `name` por instância: dois filtros na mesma página compartilhariam o
// grupo de rádio e um desmarcaria o outro.
let sequencia = 0;


/**
 * Guarda o que está **aberto** — o inverso do menu lateral.
 *
 * Lá o padrão é aberto, e guardar os fechados faz um grupo novo nascer
 * visível. Aqui o padrão é fechado, então guardar os abertos faz um filtro
 * novo nascer recolhido, que é o que se quer.
 */
function abertas(): Set<string> {
  return new Set(ler("filtro-aberto") ?? []);
}

function gavetaAberta(chave: string): boolean {
  return abertas().has(chave);
}

function gravarGaveta(chave: string, aberta: boolean): void {
  const conjunto = abertas();
  if (aberta) conjunto.add(chave);
  else conjunto.delete(chave);
  gravar("filtro-aberto", [...conjunto]);
}

export function criarFiltroData(
  aoMudar: () => void,
  opcoes: { rotulo?: string } = {},
): FiltroData {
  sequencia += 1;
  const grupo = `periodo-${sequencia}`;

  let atalho = "tudo";
  let de: string | null = null;
  let ate: string | null = null;

  // Nasce fechada: filtro é ferramenta de exceção, e aberto o tempo todo ele
  // empurra a lista — que é o conteúdo — para baixo da dobra.
  const chaveGaveta = opcoes.rotulo ?? "Data";
  let aberta = gavetaAberta(chaveGaveta);

  const caixa = h("fieldset", { class: "filtro-data" });
  const resumo = h("span", { class: "filtro-data__resumo" });
  const campos = h("span", { class: "filtro-data__intervalo" });

  // Criados uma vez e reaproveitados: recriá-los a cada redesenho arrancaria
  // o foco do campo em uso.
  const entradaDe = campoData();
  const entradaAte = campoData();

  function campoData(): HTMLInputElement {
    return h("input", {
      class: "entrada entrada--sm",
      type: "date",
      // `min` segura o ano digitado dígito a dígito: sem ele o navegador
      // aceita o ano 0002 como data completa.
      min: "2000-01-01",
      max: hojeIso(),
    }) as HTMLInputElement;
  }

  /**
   * Ano pela metade não é data.
   *
   * O Chrome dispara `change` a cada dígito do ano assim que os três campos
   * têm algum valor — digitar "2" já forma 0002-08-19, uma data completa.
   * Aplicar o filtro ali redesenha a tela e tira o foco antes de a pessoa
   * terminar de digitar 2026.
   */
  const utilizavel = (v: string): boolean =>
    v === "" ||
    (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 2000);

  /**
   * Intervalo invertido vira intervalo válido.
   *
   * Escolher "de" depois de "até" devolveria lista vazia sem dizer por quê — e
   * o erro é de digitação, não de intenção. A troca aparece nos campos, senão
   * a tela mostraria um intervalo e o filtro usaria outro.
   */
  const normalizar = (): void => {
    if (de && ate && de > ate) [de, ate] = [ate, de];
    if (entradaDe.value !== (de ?? "")) entradaDe.value = de ?? "";
    if (entradaAte.value !== (ate ?? "")) entradaAte.value = ate ?? "";
    resumo.textContent =
      de || ate ? `${de ?? "início"} → ${ate ?? "hoje"}` : "nenhum limite";
  };

  const aoDigitar = (): void => {
    if (!utilizavel(entradaDe.value) || !utilizavel(entradaAte.value)) return;

    de = entradaDe.value || null;
    ate = entradaAte.value || null;
    normalizar();
    notificar();
  };

  for (const campo of [entradaDe, entradaAte]) {
    campo.addEventListener("change", aoDigitar);
    // Rede de segurança: se o `change` foi descartado por ano incompleto, o
    // valor final entra ao sair do campo.
    campo.addEventListener("blur", aoDigitar);
  }

  /**
   * Devolve o foco depois que a página se redesenha.
   *
   * A tela reconstrói a barra de filtros a cada consulta, e `montar` desanexa
   * a caixa por um instante — o que apaga o foco. Sem isto, quem navega o
   * grupo pelas setas perde o lugar a cada escolha.
   */
  const preservarFoco = (): void => {
    const alvo = document.activeElement;
    if (!(alvo instanceof HTMLElement) || !caixa.contains(alvo)) return;

    let tentativas = 30;
    const tentar = (): void => {
      if (document.activeElement === alvo) return;
      if (alvo.isConnected) {
        alvo.focus({ preventScroll: true });
        return;
      }
      if (--tentativas > 0) requestAnimationFrame(tentar);
    };
    requestAnimationFrame(tentar);
  };

  const notificar = (): void => {
    aoMudar();
    preservarFoco();
  };

  const desenharCampos = (): void => {
    montar(
      campos,
      ...(atalho === "custom"
        ? [
            h(
              "label",
              { class: "filtro-data__campo" },
              h("span", {}, "de"),
              entradaDe,
            ),
            h(
              "label",
              { class: "filtro-data__campo" },
              h("span", {}, "até"),
              entradaAte,
            ),
            resumo,
          ]
        : []),
    );
    normalizar();
  };

  /**
   * Rádio de verdade, não botão com `aria-pressed`.
   *
   * O grupo é uma escolha entre alternativas exclusivas, e é isso que o rádio
   * diz. De brinde vem a navegação por setas e o leitor de tela anunciando
   * "3 de 5" — comportamento que teria de ser reimplementado à mão.
   */
  const opcao = (
    chave: string,
    texto: string,
    aoEscolher: () => void,
  ): HTMLElement => {
    const entrada = h("input", {
      class: "segmento__radio",
      type: "radio",
      name: grupo,
      value: chave,
      checked: atalho === chave,
      on: { change: aoEscolher },
    });

    return h("label", { class: "segmento" }, entrada, h("span", {}, texto));
  };

  /**
   * Rótulo do que está valendo, para o cabeçalho da gaveta fechada.
   *
   * Sem isto a gaveta esconderia um recorte ativo, e a lista pareceria
   * incompleta sem explicação.
   */
  const emVigor = (): string => {
    if (atalho === "custom") {
      return de || ate ? `${de ?? "início"} → ${ate ?? "hoje"}` : "sem limite";
    }
    return OPCOES.find(([c]) => c === atalho)?.[1] ?? "Tudo";
  };

  const seta = h("span", { class: "filtro-data__seta" }, "▸");
  const emUso = h("span", { class: "filtro-data__vigor" });

  const aplicarGaveta = (): void => {
    caixa.classList.toggle("filtro-data--fechada", !aberta);
    botaoGaveta.setAttribute("aria-expanded", String(aberta));
    emUso.textContent = emVigor();
    // Só destaca quando há recorte: "Tudo" é a ausência de filtro.
    emUso.classList.toggle("filtro-data__vigor--ativo", atalho !== "tudo");
  };

  const botaoGaveta = h(
    "button",
    {
      class: "filtro-data__botao",
      type: "button",
      on: {
        click: () => {
          aberta = !aberta;
          aplicarGaveta();
          gravarGaveta(chaveGaveta, aberta);
        },
      },
    },
    seta,
    h("span", {}, "Filtro"),
    emUso,
  );

  /**
   * `fieldset` com `legend` é o contêiner que o HTML tem para grupo de rádio.
   * O botão vive dentro da legenda, que é válido e mantém a amarração.
   */
  const desenhar = (): void => {
    montar(
      caixa,
      h("legend", { class: "filtro-data__legenda" }, botaoGaveta),
      h(
        "div",
        { class: "filtro-data__gaveta" },
        h(
          "div",
          { class: "filtro-data__linha" },
          h("span", { class: "filtro-data__rotulo" }, opcoes.rotulo ?? "Data"),
          h(
            "span",
            { class: "segmentos" },
            ...OPCOES.map(([chave, texto, dias]) =>
              opcao(chave, texto, () => {
                atalho = chave;
                de = dias === null ? null : diasAtras(dias);
                ate = null;
                desenharCampos();
                aplicarGaveta();
                notificar();
              }),
            ),
            opcao("custom", "Escolher", () => {
              atalho = "custom";
              desenharCampos();
              aplicarGaveta();
            }),
          ),
          // Segunda linha do mesmo bloco, recuada até o texto das opções: o
          // intervalo é detalhe de uma delas, não um filtro à parte.
          campos,
        ),
      ),
    );
    desenharCampos();
    aplicarGaveta();
  };

  desenhar();

  return {
    elemento: caixa,
    valor: () => ({ de, ate }),
  };
}
