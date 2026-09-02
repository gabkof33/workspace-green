/**
 * Árvore da estrutura da empresa — dendrograma horizontal com arrastar.
 *
 * Desenho: caixas ligadas por conectores em cotovelo, raiz à esquerda e filhos
 * crescendo para a direita. A referência que originou a tela tinha a raiz à
 * direita (convenção de árvore de objetivos, que caminha de meios para fins);
 * aqui é organograma, e a raiz à esquerda acompanha a direção de leitura — a
 * hierarquia desce no mesmo sentido em que os olhos andam.
 *
 * Os conectores são `::before`/`::after` em CSS, não SVG. Um traçado em SVG
 * precisaria medir cada caixa depois de renderizada e redesenhar a cada
 * mudança de largura, fonte ou zoom; o cotovelo em CSS acompanha o layout de
 * graça, em qualquer profundidade.
 *
 * ── Arrastar ────────────────────────────────────────────────────────────────
 * O DS não tem componente de árvore. O arrastar dele vive no `Kanban` e no
 * `List`, e usa `@hello-pangea/dnd` — React, que esta base não tem por decisão
 * documentada. Então o gesto é o de arrastar-e-soltar nativo do HTML, e o que
 * vem do DS é a LINGUAGEM VISUAL: elevação em quem está sendo arrastado
 * (`sh-lg`), indicador de inserção na cor da marca, e o alvo inválido
 * recusando o gesto em vez de aceitar e falhar.
 *
 * A intenção sai da posição do cursor DENTRO da caixa alvo:
 *
 *   terço de cima   → soltar ANTES do alvo (irmão)
 *   meio            → soltar DENTRO do alvo (vira filho)
 *   terço de baixo  → soltar DEPOIS do alvo (irmão)
 *
 * É a convenção de todo editor de árvore, e resolve num gesto só o que
 * precisaria de dois controles (mover e indentar).
 */

import { h, icone, ICONES } from "@/lib/dom";

export type TipoNo = "setor" | "equipe" | "pessoa";

export interface NoArvore {
  id: string;
  nome: string;
  tipo: TipoNo;
  paiId: string | null;
  /** Texto pequeno ao lado do nome — contagem, nível, situação. */
  nota?: string | undefined;
  ativo: boolean;
  filhos: NoArvore[];
}

/** Onde o nó arrastado foi solto, em relação ao alvo. */
export type Posicao = "antes" | "dentro" | "depois";

export interface Movimento {
  arrastado: NoArvore;
  alvo: NoArvore;
  posicao: Posicao;
}

export interface OpcoesArvore {
  raizes: NoArvore[];
  /** Sem isto a árvore é só leitura: nada fica arrastável. */
  aoMover?: ((mov: Movimento) => void) | undefined;
  /** Ações do nó (renomear, criar equipe…), reveladas no hover. */
  acoes?: ((no: NoArvore) => HTMLElement[]) | undefined;
  aoClicar?: ((no: NoArvore) => void) | undefined;
}

/** Todos os ids de uma subárvore, incluindo a raiz dela. */
function subarvore(no: NoArvore, acc = new Set<string>()): Set<string> {
  acc.add(no.id);
  for (const f of no.filhos) subarvore(f, acc);
  return acc;
}

/**
 * O movimento faz sentido?
 *
 * Três recusas, e nenhuma delas é capricho de interface:
 *
 * 1. Soltar em si mesmo ou num descendente criaria ciclo. `fn_validar_setor`
 *    recusa isso no banco — aqui o gesto é bloqueado antes, para o cursor
 *    dizer "não" em vez de o toast dizer depois.
 * 2. Equipe é folha: não recebe filho.
 * 3. Setor não entra dentro de equipe, pelo mesmo motivo.
 */
export function movimentoValido(
  arrastado: NoArvore,
  alvo: NoArvore,
  posicao: Posicao,
): boolean {
  // Ciclo, e vale para os três tipos: pessoa subordinada a alguém da própria
  // subordinação faz o mesmo estrago que setor dentro do próprio subsetor.
  if (subarvore(arrastado).has(alvo.id)) return false;

  // Pessoa entra DENTRO de equipe (lotação) ou DENTRO de pessoa (passa a
  // depender dela). Nas bordas não faz nada: ordem entre pessoas não é
  // gravável, porque `perfis` não tem coluna de posição — e oferecer um gesto
  // que não persiste é pior que não oferecer.
  if (arrastado.tipo === "pessoa") {
    return posicao === "dentro" && alvo.tipo !== "setor";
  }

  // Setor só entra em setor. Equipe e pessoa são folhas dessa cadeia.
  if (arrastado.tipo === "setor") return alvo.tipo === "setor";

  // Equipe entra em setor; ao lado de outra equipe apenas reordena o desenho.
  if (arrastado.tipo === "equipe") {
    return (
      alvo.tipo === "setor" || (posicao !== "dentro" && alvo.tipo === "equipe")
    );
  }

  return true;
}

/** Onde o cursor caiu dentro da caixa: terço de cima, meio ou de baixo. */
function posicaoDoCursor(caixa: HTMLElement, clientY: number): Posicao {
  const r = caixa.getBoundingClientRect();
  const relativo = (clientY - r.top) / r.height;
  if (relativo < 0.3) return "antes";
  if (relativo > 0.7) return "depois";
  return "dentro";
}

export function criarArvoreSetores(o: OpcoesArvore): HTMLElement {
  const podeMover = Boolean(o.aoMover);

  // O nó em trânsito. Fica no fecho e não no `dataTransfer` porque o
  // `dragover` precisa dele para decidir se aceita — e ali o `dataTransfer`
  // é ilegível por segurança do navegador, em todo lugar menos no `drop`.
  let emTransito: NoArvore | null = null;

  /**
   * `cor` é o índice da paleta, herdado da área.
   *
   * Índice e não cor, como em `conversas.ts`: a paleta mora no CSS e a árvore
   * manda só a posição. E é HERDADO de propósito — todo descendente carrega a
   * cor da área de origem, então a borda esquerda diz de que ramo aquela caixa
   * veio sem precisar seguir os cotovelos com o olho. Cor por profundidade
   * diria só "quão fundo", que o recuo já diz.
   */
  const desenharNo = (no: NoArvore, cor: string): HTMLElement => {
    const caixa = h(
      "div",
      {
        class: `arv__caixa arv__caixa--${no.tipo}${no.ativo ? "" : " arv__caixa--inativo"}`,
        dataset: { cor },
        role: o.aoClicar ? "button" : undefined,
        tabindex: o.aoClicar ? "0" : undefined,
      },
      h(
        "span",
        { class: "arv__marca" },
        icone(
          no.tipo === "pessoa"
            ? ICONES.pessoas
            : no.tipo === "equipe"
              ? ICONES.fila
              : ICONES.setores,
        ),
      ),
      h("span", { class: "arv__nome" }, no.nome),
      no.nota ? h("span", { class: "arv__nota" }, no.nota) : null,
      o.acoes ? h("span", { class: "arv__acoes" }, ...o.acoes(no)) : null,
    );

    if (o.aoClicar) {
      caixa.addEventListener("click", () => o.aoClicar?.(no));
    }

    /**
     * `draggable` pela PROPRIEDADE, não pelo atributo — e isto é a diferença
     * entre a árvore mover e não mover.
     *
     * `draggable` não é atributo booleano: é ENUMERADO, e só aceita as
     * palavras "true" e "false". O `h()` escreve booleano como `atributo=""`,
     * que é o certo para `disabled` e `hidden`, mas em `draggable=""` o
     * navegador não reconhece o valor e cai no padrão do elemento — que para
     * `<div>` é "auto", ou seja, NÃO arrastável. O arrasto morria silencioso.
     *
     * A propriedade IDL não tem essa ambiguidade: recebe boolean e escreve o
     * atributo com a palavra certa.
     */
    caixa.draggable = podeMover;

    if (podeMover) {
      caixa.addEventListener("dragstart", (ev) => {
        emTransito = no;
        caixa.classList.add("arv__caixa--arrastando");
        // Algum dado precisa ser escrito, senão o Firefox cancela o arrasto.
        ev.dataTransfer?.setData("text/plain", no.id);
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
      });

      caixa.addEventListener("dragend", () => {
        emTransito = null;
        caixa.classList.remove("arv__caixa--arrastando");
        limparIndicadores(raiz);
      });

      caixa.addEventListener("dragover", (ev) => {
        if (!emTransito || emTransito.id === no.id) return;
        const posicao = posicaoDoCursor(caixa, ev.clientY);
        if (!movimentoValido(emTransito, no, posicao)) {
          // Sem `preventDefault` o navegador mostra o cursor de "proibido" —
          // que é exatamente a resposta certa, e de graça.
          caixa.dataset["solta"] = "nao";
          return;
        }
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        caixa.dataset["solta"] = posicao;
      });

      caixa.addEventListener("dragleave", () => {
        delete caixa.dataset["solta"];
      });

      caixa.addEventListener("drop", (ev) => {
        ev.preventDefault();
        delete caixa.dataset["solta"];
        if (!emTransito) return;
        const posicao = posicaoDoCursor(caixa, ev.clientY);
        if (!movimentoValido(emTransito, no, posicao)) return;
        o.aoMover?.({ arrastado: emTransito, alvo: no, posicao });
      });
    }

    const item = h("li", { class: "arv__item" }, caixa);

    if (no.filhos.length > 0) {
      item.append(
        h(
          "ul",
          { class: "arv__ramo" },
          ...no.filhos.map((f) => desenharNo(f, cor)),
        ),
      );
    }

    return item;
  };

  /**
   * A cor de cada raiz.
   *
   * Setor de topo entra na paleta pela POSIÇÃO na lista — que já vem ordenada
   * por `ordem` —, porque posição garante cor distinta da vizinha; um hash do
   * nome não garante (cinco áreas em cinco baldes colidem com facilidade). O
   * preço é o mesmo da lista de canais: área nova desloca a cor de quem vem
   * depois dela.
   *
   * Equipe sem setor não entra na paleta: ela está FORA da árvore, e dar a ela
   * a cor de um ramo diria que pertence a um. `orfa` é cinza, e é o que a
   * distingue de todo o resto sem legenda.
   */
  let indiceArea = 0;
  const raiz = h(
    "ul",
    { class: "arv__ramo arv__ramo--raiz" },
    ...o.raizes.map((no) =>
      desenharNo(
        no,
        no.tipo === "equipe" ? "orfa" : String(indiceArea++ % 5),
      ),
    ),
  );

  return h("div", { class: "arv" }, raiz);
}

/** Apaga os indicadores de inserção que ficaram de arrastos anteriores. */
function limparIndicadores(raiz: HTMLElement): void {
  for (const el of Array.from(
    raiz.querySelectorAll<HTMLElement>("[data-solta]"),
  )) {
    delete el.dataset["solta"];
  }
}

/**
 * A nova lista de irmãos depois do movimento, na ordem final.
 *
 * Devolver ids em vez de gravar: quem chama sabe se está mexendo em setor ou
 * em equipe, e só o setor tem `ordem` para renumerar. Aqui mora só o cálculo
 * da ordem — que é a parte fácil de errar.
 */
export function irmaosDepoisDoMovimento(
  irmaosAtuais: NoArvore[],
  mov: Movimento,
): string[] {
  const original = irmaosAtuais.map((n) => n.id);

  // Soltar em si mesmo não é movimento. Sem esta saída o alvo desaparecia
  // junto com o arrastado no filtro abaixo, `indexOf` devolvia -1 e o nó ia
  // para o FIM da lista — reordenando a estrutura por um gesto que a pessoa
  // fez e desfez. A interface já barra isto em `movimentoValido`, mas a função
  // é exportada e não deve depender de quem a chama para estar correta.
  if (mov.alvo.id === mov.arrastado.id) return original;

  const ids = original.filter((id) => id !== mov.arrastado.id);

  if (mov.posicao === "dentro") return [...ids, mov.arrastado.id];

  const alvo = ids.indexOf(mov.alvo.id);
  // Alvo fora da lista de irmãos: não há posição relativa a respeitar, então
  // entra no fim. Acontece ao soltar num pai que ainda não tem este filho.
  if (alvo === -1) return [...ids, mov.arrastado.id];

  const destino = mov.posicao === "antes" ? alvo : alvo + 1;
  ids.splice(destino, 0, mov.arrastado.id);
  return ids;
}
