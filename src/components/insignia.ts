/** Insígnia de hierarquia. */

import { estatico, h, type MarcacaoEstatica } from "@/lib/dom";
import type { Hierarquia, Senioridade } from "@/types/dominio";

export const ROTULOS_HIERARQUIA: Record<Hierarquia, string> = {
  coordenador: "Coordenador",
  gestor: "Gestor",
  colaborador: "Colaborador",
};

export const ROTULOS_SENIORIDADE: Record<Senioridade, string> = {
  estagiario: "Estagiário",
  junior: "Júnior",
  pleno: "Pleno",
  senior: "Sênior",
  especialista: "Especialista",
  executivo: "Executivo",
};

/** Ordem de precedência — usada para ordenar listas de pessoas. */
export const ORDEM_HIERARQUIA: Hierarquia[] = [
  "coordenador",
  "gestor",
  "colaborador",
];

export const ORDEM_SENIORIDADE: Senioridade[] = [
  "estagiario",
  "junior",
  "pleno",
  "senior",
  "especialista",
  "executivo",
];

const TRACADOS: Record<Hierarquia, MarcacaoEstatica> = {
  // Losango preenchido — a forma mais destacada das três.
  coordenador: estatico`<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/>`,
  // Escudo.
  gestor:
    estatico`<path d="M12 2.5 20 6v6.2c0 4.6-3.3 7.8-8 9.3-4.7-1.5-8-4.7-8-9.3V6z"/>`,
  // Círculo.
  colaborador: estatico`<circle cx="12" cy="12" r="8.5"/>`,
};

export interface OpcoesInsignia {
  /** Mostra o rótulo ao lado do ícone. */
  comRotulo?: boolean;
  /** Acrescenta a senioridade ao texto do title. */
  senioridade?: Senioridade;
  /** Nome usado no texto acessível. */
  nome?: string;
  tamanho?: number;
}

export function insigniaHierarquia(
  hierarquia: Hierarquia,
  opcoes: OpcoesInsignia = {},
): HTMLElement {
  const tamanho = opcoes.tamanho ?? 14;
  const rotulo = ROTULOS_HIERARQUIA[hierarquia];

  const descricao = [
    opcoes.nome,
    rotulo,
    opcoes.senioridade ? ROTULOS_SENIORIDADE[opcoes.senioridade] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(tamanho));
  svg.setAttribute("height", String(tamanho));
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = TRACADOS[hierarquia];

  const elemento = h(
    "span",
    {
      class: `insignia insignia--${hierarquia}${opcoes.comRotulo ? " insignia--com-rotulo" : ""}`,
      title: descricao,
    },
    svg,
    opcoes.comRotulo ? h("span", {}, rotulo) : null,
    // Leitores de tela leem o texto; a forma sozinha não bastaria.
    opcoes.comRotulo ? null : h("span", { class: "sr" }, descricao),
  );

  return elemento;
}

/** Nome acompanhado da insígnia — o par usado em comentários e listas. */
export function nomeComInsignia(
  nome: string,
  hierarquia: Hierarquia,
  opcoes: { senioridade?: Senioridade; classe?: string } = {},
): HTMLElement {
  return h(
    "span",
    { class: `nome-insignia ${opcoes.classe ?? ""}`.trim() },
    insigniaHierarquia(hierarquia, {
      nome,
      ...(opcoes.senioridade ? { senioridade: opcoes.senioridade } : {}),
    }),
    h("span", {}, nome),
  );
}

/** Selo textual de senioridade, para a ficha da pessoa. */
export function seloSenioridade(senioridade: Senioridade): HTMLElement {
  return h(
    "span",
    { class: `tag tag--senioridade tag--${senioridade}` },
    ROTULOS_SENIORIDADE[senioridade],
  );
}
