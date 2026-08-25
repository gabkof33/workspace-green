/**
 * Avatar — o `Avatar` do iGreen DS (`avatar-ig`) em DOM puro.
 *
 * O que o DS resolve aqui e é o motivo de existir este arquivo: `colorHex` com
 * **cor de texto automática**. A versão antiga do componente aplicava
 * `text-white` cego e quebrava em fundo claro — o amarelo #FAE128 com texto
 * branco dá 1.29:1, reprovado no WCAG AA. Desde a v0.7.1 ele calcula a
 * luminância do fundo e escolhe entre preto e branco o de MAIOR razão de
 * contraste. É essa conta que o `textoDeContraste` abaixo transpõe, do
 * `utils/color-contrast.ts` do DS.
 *
 * A cor é do PERFIL: sai do id da pessoa, então a mesma pessoa tem a mesma cor
 * no diretório, no chat e no quadro do setor. Sem coluna no banco e sem
 * ninguém escolhendo — se algum dia houver cor gravada no perfil, ela entra
 * por `cor` e nenhum ponto de chamada muda.
 *
 * A escala de tamanho é a do DS: xs 20 · sm 24 · md 28 · lg 32 · xl 40.
 */

import { h } from "@/lib/dom";

export type TamanhoAvatar = "xs" | "sm" | "md" | "lg" | "xl";

export interface OpcoesAvatar {
  nome: string;
  /**
   * Quem é a pessoa. É daqui que a cor vem — passar o id, e não o nome, mantém
   * a cor quando alguém corrige a grafia do próprio nome.
   */
  id?: string;
  /** Cor explícita, no formato do `colorHex` do DS. Ganha da derivada. */
  cor?: string;
  tamanho?: TamanhoAvatar;
  /**
   * Com rótulo vira `role="img"`; sem, é decorativo (`aria-hidden`) — a mesma
   * regra do DS. Ao lado do nome escrito, decorativo é o certo: o leitor de
   * tela não deve anunciar as iniciais e o nome em seguida.
   */
  rotulo?: string;
}

/**
 * Paleta de pessoa.
 *
 * São os `--c-conversa-*` do `tokens.css`, que já eram a paleta desenhada para
 * distinguir uma coisa da outra nesta base (a faixa de canal do chat). Aqui
 * eles são literais e não `var()` de propósito: a conta de contraste precisa
 * do valor resolvido, e `var()` só resolve na pintura — o texto sairia branco
 * sobre amarelo, que é exatamente o defeito que o DS corrigiu.
 */
const PALETA = [
  "#0e9384",
  "#6938ef",
  "#c11574",
  "#a15c07",
  "#0086c9",
  "#3f7e0e",
];

const LADO: Record<TamanhoAvatar, string> = {
  xs: "20px",
  sm: "24px",
  md: "28px",
  lg: "32px",
  xl: "40px",
};

/** Corpo do texto por tamanho, como o DS escala as iniciais. */
const FONTE: Record<TamanhoAvatar, string> = {
  xs: "0.6875rem",
  sm: "0.6875rem",
  md: "0.6875rem",
  lg: "0.8125rem",
  xl: "0.875rem",
};

/* ── Contraste (WCAG 2.x) ─────────────────────────────────────────────────── */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#RGB`, `#RRGGBB` ou `#RRGGBBAA` (alfa ignorado). `null` se não for hex. */
function hexParaRgb(hex: string): Rgb | null {
  let h6 = hex.trim().replace(/^#/, "");
  if (h6.length === 3) {
    h6 = h6
      .split("")
      .map((c) => c + c)
      .join("");
  } else if (h6.length === 8) {
    h6 = h6.slice(0, 6);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h6)) return null;

  return {
    r: Number.parseInt(h6.slice(0, 2), 16),
    g: Number.parseInt(h6.slice(2, 4), 16),
    b: Number.parseInt(h6.slice(4, 6), 16),
  };
}

/** Luminância relativa da fórmula oficial, com correção de gama. */
function luminancia({ r, g, b }: Rgb): number {
  const canal = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

const razao = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Preto ou branco — o que tiver MAIOR contraste sobre o fundo.
 *
 * Hex inválido cai em branco, que é o comportamento legado que o DS preservou.
 */
export function textoDeContraste(hex: string): "#000000" | "#ffffff" {
  const rgb = hexParaRgb(hex);
  if (!rgb) return "#ffffff";

  const fundo = luminancia(rgb);
  return razao(fundo, 0) > razao(fundo, 1) ? "#000000" : "#ffffff";
}

/* ── Cor e iniciais ───────────────────────────────────────────────────────── */

/**
 * Cor estável a partir de uma chave.
 *
 * FNV-1a de 32 bits: espalha bem para strings curtas e é a mesma conta em toda
 * sessão e em todo navegador — a cor de alguém não pode mudar entre telas nem
 * entre recarregamentos.
 */
export function corDoPerfil(chave: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < chave.length; i++) {
    hash ^= chave.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const indice = Math.abs(hash) % PALETA.length;
  return PALETA[indice] ?? PALETA[0]!;
}

/** Primeira e última inicial: "Ana Paula Souza" → "AS". */
export function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.charAt(0) ?? "?";
  const ultima = partes.length > 1 ? (partes.at(-1)?.charAt(0) ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/* ── Componente ───────────────────────────────────────────────────────────── */

export function criarAvatar(o: OpcoesAvatar): HTMLElement {
  const tamanho = o.tamanho ?? "md";
  const fundo = o.cor ?? corDoPerfil(o.id ?? o.nome);

  const avatar = h(
    "div",
    {
      class: "ds-avatar",
      // Fundo e texto vão inline porque a cor é DADO (de quem é o avatar), não
      // estado de componente — não há classe possível para uma cor por pessoa.
      style: `--ds-avatar-lado:${LADO[tamanho]};--ds-avatar-fonte:${FONTE[tamanho]};background:${fundo};color:${textoDeContraste(fundo)}`,
      ...(o.rotulo
        ? { role: "img", aria: { label: o.rotulo } }
        : { aria: { hidden: "true" } }),
    },
    iniciaisDoNome(o.nome),
  );

  return avatar;
}
