/**
 * Painel flutuante ancorado num gatilho — o que o Portal + Popper do Radix faz
 * pelos componentes do DS (Select, Popover, DatePicker, DropdownMenu).
 *
 * Por que sair do fluxo: dentro do campo o painel é cortado pelo primeiro
 * ancestral com `overflow`, e a barra de filtros e a tabela têm vários. Então
 * ele vive no `<body>` em `position: fixed`, e as coordenadas são recalculadas
 * a cada rolagem — é o preço de não ser cortado.
 *
 * Quem usa: `selecao-ds.ts` e `periodo-ds.ts`. A aparência é do
 * `.ds-flutuante` (`ds-componentes.css`); aqui só mora o comportamento.
 */

/**
 * Painéis abertos, do mais antigo ao mais novo.
 *
 * Existe por causa de painel DENTRO de painel — o seletor de mês/ano do
 * calendário. Como todo painel mora no `<body>`, o de dentro não é descendente
 * do de fora, e sem esta pilha um clique nele contava como "clique fora" e
 * fechava o calendário inteiro por baixo.
 */
const abertos: HTMLElement[] = [];

export interface Flutuante {
  aberto(): boolean;
  abrir(): void;
  fechar(devolverFoco?: boolean): void;
}

export interface OpcoesFlutuante {
  gatilho: HTMLElement;
  painel: HTMLElement;
  /** Painel com a largura do gatilho (lista de select) ou natural (calendário). */
  larguraDoGatilho?: boolean;
  /** Abaixo de tanto espaço embaixo, abre pra cima. */
  folgaMinima?: number;
  aoAbrir?: () => void;
  aoFechar?: () => void;
}

export function criarFlutuante(o: OpcoesFlutuante): Flutuante {
  const folgaMinima = o.folgaMinima ?? 180;
  let aberto = false;

  const posicionar = (): void => {
    // A página pode ter sido remontada com o painel aberto — as telas de lista
    // se redesenham a cada consulta. Sem gatilho não há onde ancorar.
    if (!o.gatilho.isConnected) {
      fechar();
      return;
    }

    const r = o.gatilho.getBoundingClientRect();
    const abaixo = window.innerHeight - r.bottom - 8;
    const acima = r.top - 8;
    const paraCima = abaixo < folgaMinima && acima > abaixo;

    if (o.larguraDoGatilho) o.painel.style.width = `${r.width}px`;

    // Encosta na borda em vez de vazar: um calendário de dois meses é mais
    // largo que o gatilho e cabe fora da tela se seguir o `left` dele.
    const largura = o.painel.offsetWidth;
    const limite = Math.max(8, window.innerWidth - largura - 8);
    o.painel.style.left = `${Math.max(8, Math.min(r.left, limite))}px`;

    o.painel.style.maxHeight = `${Math.max(160, paraCima ? acima : abaixo)}px`;
    o.painel.style.top = paraCima ? "" : `${r.bottom + 4}px`;
    o.painel.style.bottom = paraCima
      ? `${window.innerHeight - r.top + 4}px`
      : "";
  };

  const foraDoPainel = (ev: PointerEvent): void => {
    const alvo = ev.target as Node;
    // Clique no gatilho não fecha aqui: é o `click` dele que alterna, e fechar
    // antes faria o par fechar-abrir que deixa o painel sempre aberto.
    if (o.gatilho.contains(alvo)) return;
    // Dentro de QUALQUER painel aberto, não só do meu: ver `abertos`. Dois
    // painéis independentes não ficam abertos ao mesmo tempo — abrir o segundo
    // passa pelo gatilho dele, que é fora do primeiro e fecha o primeiro.
    if (abertos.some((p) => p.contains(alvo))) return;
    fechar();
  };

  function abrir(): void {
    if (aberto) return;
    aberto = true;
    abertos.push(o.painel);
    document.body.append(o.painel);
    posicionar();
    o.gatilho.dataset.state = "open";
    o.gatilho.setAttribute("aria-expanded", "true");
    o.aoAbrir?.();
    document.addEventListener("pointerdown", foraDoPainel, true);
    // `capture`: rolagem de contêiner interno não borbulha até a janela.
    window.addEventListener("scroll", posicionar, true);
    window.addEventListener("resize", posicionar);
  }

  function fechar(devolverFoco = false): void {
    if (!aberto) return;
    aberto = false;
    abertos.splice(abertos.indexOf(o.painel), 1);
    o.painel.remove();
    o.gatilho.dataset.state = "closed";
    o.gatilho.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", foraDoPainel, true);
    window.removeEventListener("scroll", posicionar, true);
    window.removeEventListener("resize", posicionar);
    o.aoFechar?.();
    if (devolverFoco && o.gatilho.isConnected) o.gatilho.focus();
  }

  return { aberto: () => aberto, abrir, fechar };
}
