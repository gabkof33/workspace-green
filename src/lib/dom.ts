/** Utilitários de DOM. */

/**
 * Marcação estática escrita no código, nunca vinda de dado.
 *
 * `h({ html })` e `icone()` atribuem `innerHTML`, que é o único caminho de XSS
 * que esta aplicação tem — todo o resto do texto entra por `createTextNode`,
 * que escapa por construção. O tipo ramificado fecha esse caminho no
 * compilador: `string` não é atribuível a `MarcacaoEstatica`, então passar uma
 * variável com conteúdo de banco, de URL ou de formulário não compila.
 *
 * A única forma de produzir o tipo é `estatico`, e por isso ela existe: quem
 * chamar precisa dizer explicitamente que aquilo é literal do código.
 */
export type MarcacaoEstatica = string & { readonly __estatica: unique symbol };

/**
 * Promove um literal a marcação estática. Use como tag de template.
 *
 * Só aceita template **sem interpolação**: a assinatura recebe um argumento,
 * então `estatico`\``<b>${x}</b>`\`` vira uma chamada de dois argumentos e o
 * compilador recusa. É o que impede o padrão que causa XSS — montar HTML
 * somando texto de origem externa.
 */
export function estatico(partes: TemplateStringsArray): MarcacaoEstatica {
  return partes[0] as MarcacaoEstatica;
}

type Filho = Node | string | number | null | undefined | false;

interface AtributosBase {
  class: string;
  id: string;
  style: string;
  type: string;
  for: string;
  step: string;
  multiple: boolean;
  href: string;
  src: string;
  alt: string;
  width: string;
  height: string;
  loading: string;
  role: string;
  tabindex: string;
  value: string;
  name: string;
  placeholder: string;
  title: string;
  disabled: boolean;
  checked: boolean;
  required: boolean;
  rows: number;
  min: string;
  max: string;
  maxlength: number;
  autocomplete: string;
  colspan: number;
  dataset: Record<string, string>;
  aria: Record<string, string>;
  on: Partial<{
    [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void;
  }>;
  /** Vira `innerHTML`. Por isso não é `string` — ver `MarcacaoEstatica`. */
  html: MarcacaoEstatica;
}

/**
 * Todo atributo é opcional e aceita `undefined` explícito — assim quem chama
 * pode passar `title: condicao ? texto : undefined` sem brigar com…
 */
type Atributos = { [K in keyof AtributosBase]?: AtributosBase[K] | undefined };

/** Cria um elemento com atributos e filhos. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Atributos = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  for (const [chave, valor] of Object.entries(attrs)) {
    if (valor === undefined || valor === null) continue;

    if (chave === "on") {
      for (const [evento, handler] of Object.entries(
        valor as Record<string, EventListener>,
      )) {
        el.addEventListener(evento, handler);
      }
    } else if (chave === "dataset") {
      for (const [k, v] of Object.entries(valor as Record<string, string>)) {
        el.dataset[k] = v;
      }
    } else if (chave === "aria") {
      for (const [k, v] of Object.entries(valor as Record<string, string>)) {
        el.setAttribute(`aria-${k}`, v);
      }
    } else if (chave === "class") {
      el.className = String(valor);
    } else if (chave === "html") {
      // Uso restrito a marcação estática definida no código (ícones SVG).
      el.innerHTML = String(valor);
    } else if (typeof valor === "boolean") {
      if (valor) el.setAttribute(chave, "");
    } else {
      el.setAttribute(chave, String(valor));
    }
  }

  for (const filho of filhos) {
    if (filho === null || filho === undefined || filho === false) continue;
    el.append(
      typeof filho === "string" || typeof filho === "number"
        ? document.createTextNode(String(filho))
        : filho,
    );
  }

  return el;
}

/** Substitui todo o conteúdo de um contêiner. */
export function montar(alvo: HTMLElement, ...filhos: Filho[]): void {
  alvo.replaceChildren();
  for (const filho of filhos) {
    if (filho === null || filho === undefined || filho === false) continue;
    alvo.append(
      typeof filho === "string" || typeof filho === "number"
        ? document.createTextNode(String(filho))
        : filho,
    );
  }
}

export function $<T extends HTMLElement = HTMLElement>(
  seletor: string,
  raiz: ParentNode = document,
): T | null {
  return raiz.querySelector<T>(seletor);
}

export function $$<T extends HTMLElement = HTMLElement>(
  seletor: string,
  raiz: ParentNode = document,
): T[] {
  return Array.from(raiz.querySelectorAll<T>(seletor));
}

/**
 * Ícone SVG inline a partir do traçado.
 *
 * `preenchido` é para os traçados vindos do DS: lá o ícone é uma silhueta com
 * `fill: currentColor` e `fill-rule: evenodd`, não um contorno. Desenhá-lo
 * como traço deixaria o símbolo sem o miolo.
 */
export function icone(
  caminho: MarcacaoEstatica,
  opcoes: { preenchido?: boolean } = {},
): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");

  if (opcoes.preenchido) {
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("fill-rule", "evenodd");
    svg.setAttribute("clip-rule", "evenodd");
  } else {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
  }

  svg.innerHTML = caminho;
  return svg;
}

const TRACADOS_ICONES = {
  seta: '<path d="M9 6l6 6-6 6"/>',
  seta_baixo: '<path d="M6 9l6 6 6-6"/>',
  seta_esquerda: '<path d="M15 6l-6 6 6 6"/>',
  calendario:
    '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M8 3v3M16 3v3M3.5 10h17"/>',
  confere: '<path d="M20 6 9 17l-5-5"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  // `ExternalLink` do lucide, que é o conjunto que o DS usa nos componentes
  // shadcn — o mesmo desenho do link da coluna `url` do DataTable.
  link_externo:
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  // Do próprio DS (`line-filter-add`), e por isso é silhueta e não contorno:
  // usar com `icone(..., { preenchido: true })`.
  filtro_adicionar:
    '<path d="M19.93,6.9c0,0 0.13,-0.41 0.16,-0.63c0.2,-1.57 0.4,-2.06 0.03,-2.27c-0.18,-0.38 -0.72,-0.26 -2.35,-0.26h-11.53c-1.63,0 -2.17,-0.12 -2.35,0.26c-0.37,0.21 -0.17,0.69 0.03,2.27c0.04,0.37 0.05,0.44 0.29,0.69c0.96,1.15 2.68,3.13 5.11,4.94c0.33,0.29 0.63,0.84 0.7,1.29c0.28,3.41 0.53,5.74 0.67,6.89c-0.03,0.13 -0.01,0.09 0.1,0.15c0.01,0 0.01,0.01 0.01,0.01c0,0 0,0 0,-0.01c1,-0.69 2.58,-1.19 2.58,-2.14c0.11,-0.57 0.26,-1.55 0.44,-3.19c0.04,-0.41 0.41,-0.71 0.83,-0.67c0.41,0.04 0.71,0.41 0.67,0.83c-0.18,1.68 -0.34,2.71 -0.45,3.3c-0.45,1.5 -2.34,2.47 -3.19,3.09c-0.25,0.15 -0.6,0.28 -0.85,0.28c-0.25,0 -0.59,-0.1 -0.79,-0.21c-0.38,-0.22 -0.73,-0.8 -0.83,-1.27c-0.14,-1.15 -0.39,-3.51 -0.68,-6.94c0.02,-0.16 0.02,-0.17 -0.1,-0.22c-2.55,-1.92 -4.38,-4.02 -5.35,-5.18c-0.36,-0.47 -0.55,-0.92 -0.63,-1.46c-0.2,-1.57 -0.21,-2.66 0.35,-3.47c0.74,-0.63 1.83,-0.75 3.46,-0.75h11.53c1.63,0 2.72,0.12 3.46,0.75c0.56,0.81 0.55,1.89 0.35,3.47c-0.04,0.29 -0.16,0.63 -0.16,0.63c-0.05,0.41 -0.43,0.7 -0.84,0.65c-0.41,-0.05 -0.7,-0.43 -0.65,-0.84c0,0 0.01,-0.04 0,0zM17.5,7.25c0.41,0 0.75,0.34 0.75,0.75v2.75h2.75c0.41,0 0.75,0.34 0.75,0.75c0,0.41 -0.34,0.75 -0.75,0.75h-2.75v2.75c0,0.41 -0.34,0.75 -0.75,0.75c-0.41,0 -0.75,-0.34 -0.75,-0.75v-2.75h-2.75c-0.41,0 -0.75,-0.34 -0.75,-0.75c0,-0.41 0.34,-0.75 0.75,-0.75h2.75v-2.75c0,-0.41 0.34,-0.75 0.75,-0.75z"/>',
  abrir: '<path d="M12 5v14M5 12h14"/>',
  fila: '<path d="M3 6h18M3 12h18M3 18h12"/>',
  meus: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  ativos:
    '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  conhecimento:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  rotinas: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tempos:
    '<path d="M3 17l5-6 4 3 5-7"/><path d="M3 21h18"/><path d="M3 21V4"/>',
  painel:
    '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  demandas:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8M8 13h5"/><path d="M3 8h18"/>',
  gantt:
    '<path d="M4 5h9M4 10h14M4 15h7M4 20h11"/><circle cx="3" cy="5" r="0.6" fill="currentColor"/>',
  sino: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  pessoas:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  setores:
    '<path d="M12 3v4M6 21v-4M18 21v-4M4 7h16v4H4z"/><path d="M8 11v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2"/><rect x="3" y="17" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/>',
  conversas:
    '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  tema: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  voltar: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  postmortem:
    '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  lateral:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  // Spinner do DS: trilho inteiro apagado + um quarto de volta por cima.
  spinner:
    '<circle class="ds-spinner__trilho" cx="12" cy="12" r="9"/><path d="M21 12a9 9 0 0 0-9-9"/>',
  // Órbita: um corpo central e um anel em volta — o mapa da empresa.
  mapa: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(60 12 12)"/>',
  observabilidade:
    '<circle cx="5" cy="12" r="2.2"/><circle cx="19" cy="6" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M7 12h4M13.2 9.6l3.8-2.5M13.2 14.4l3.8 2.5"/>',
} as const;

/**
 * A fronteira auditada: aqui, e só aqui, texto cru é promovido a marcação.
 *
 * São traçados SVG literais escritos neste arquivo — nada vem de banco, URL
 * ou formulário. Do lado de fora `ICONES.x` já é `MarcacaoEstatica`, então
 * `icone()` e `h({ html })` não aceitam mais nenhuma outra string.
 */
export const ICONES = TRACADOS_ICONES as {
  readonly [K in keyof typeof TRACADOS_ICONES]: MarcacaoEstatica;
};

/**
 * Copia texto para a área de transferência.
 *
 * Dois caminhos porque o primeiro não está sempre disponível: a Clipboard API
 * exige contexto seguro (https ou localhost) e pode ser negada por permissão.
 * Quando ela falha, sobra o caminho antigo — campo fora da tela, seleção e
 * `execCommand`. É obsoleto, mas é o que funciona onde o novo não existe, e
 * copiar um link não pode depender de como a página foi servida.
 *
 * Devolve `false` em vez de lançar: quem chama decide o que dizer.
 */
export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Cai no plano B abaixo.
  }

  const campo = document.createElement("textarea");
  campo.value = texto;
  // Fora da tela, mas ainda focável: `display:none` não é selecionável.
  campo.style.cssText = "position:fixed;top:-9999px;opacity:0";
  document.body.append(campo);
  campo.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    campo.remove();
  }
}

/** Notificação efêmera no canto da tela. */
export function avisar(
  mensagem: string,
  tipo: "info" | "ok" | "erro" = "info",
): void {
  const container = document.getElementById("toasts");
  if (!container) return;

  const toast = h("div", { class: `toast toast--${tipo}` }, mensagem);
  container.append(toast);

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity .2s ease";
    window.setTimeout(() => toast.remove(), 200);
  }, 4200);
}
