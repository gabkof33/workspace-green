/** Renderização de texto com menções e referências. */

import { h } from "@/lib/dom";
import type { PessoaMencao } from "@/types/dominio";

const PADRAO_CODIGO = /^(DEM|INC|REQ)-\d{4}-\d{6}$/;

export interface OpcoesTexto {
  /** Classe do contêiner. */
  classe?: string;
  /** Torna códigos de demanda e chamado clicáveis. */
  aoAbrirRegistro?: (destino: string) => void;
}

export function renderizarTexto(
  corpo: string,
  diretorio: PessoaMencao[],
  opcoes: OpcoesTexto = {},
): HTMLElement {
  const bloco = h("div", { class: opcoes.classe ?? "linha__corpo" });

  for (const parte of particionar(corpo, diretorio, !!opcoes.aoAbrirRegistro)) {
    if (!parte) continue;

    if (parte.startsWith("@") && parte.length > 1) {
      bloco.append(h("span", { class: "mencao-inline" }, parte));
      continue;
    }

    const codigo = PADRAO_CODIGO.exec(parte);
    if (codigo && opcoes.aoAbrirRegistro) {
      const destino =
        codigo[1] === "DEM" ? `demanda/${parte}` : `chamado/${parte}`;
      bloco.append(
        h(
          "button",
          {
            class: "msg__referencia",
            type: "button",
            title: "Abrir registro",
            on: { click: () => opcoes.aoAbrirRegistro?.(destino) },
          },
          parte,
        ),
      );
      continue;
    }

    bloco.append(document.createTextNode(parte));
  }

  return bloco;
}

/** Quebra o texto em trechos comuns, menções e códigos. */
function particionar(
  corpo: string,
  diretorio: PessoaMencao[],
  comCodigos: boolean,
): string[] {
  const nomes = diretorio
    .map((p) => p.nome_completo)
    .filter(Boolean)
    // Do mais longo para o mais curto: "Ana Paula Souza" antes de "Ana
    // Paula".
    .sort((a, b) => b.length - a.length)
    .map(escaparRegex);

  const alternativas: string[] = [];

  if (nomes.length > 0) {
    alternativas.push(`@(?:${nomes.join("|")})`);
  }
  // Menção a quem saiu do diretório continua sendo destacada como token
  // único.
  alternativas.push("@[\\p{L}][\\p{L}\\d._-]*");

  if (comCodigos) {
    alternativas.push("(?:DEM|INC|REQ)-\\d{4}-\\d{6}");
  }

  return corpo.split(new RegExp(`(${alternativas.join("|")})`, "gu"));
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
