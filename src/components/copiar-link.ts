/**
 * Botão que copia o link de um registro para mandar a alguém.
 *
 * O ícone é o `ExternalLink` do lucide — o conjunto que os componentes shadcn
 * do DS usam, e o mesmo desenho que a coluna `url` do DataTable põe ao lado de
 * um endereço. Ele diz "isto é um endereço que abre fora daqui", que é o que a
 * pessoa vai colar no chat ou no e-mail.
 *
 * Duas formas, mesmo comportamento: com texto (ficha do chamado, onde há
 * espaço e o botão precisa se anunciar) e compacto (linha de tabela, onde a
 * coluna é estreita e o rótulo viria por `title`).
 */

import { avisar, copiar, h, icone, ICONES } from "@/lib/dom";
import { enderecoAbsoluto } from "@/lib/router";

export interface OpcoesCopiarLink {
  /** Rota interna, sem o `#/` — ex.: `chamado/REQ-2026-000020`. */
  caminho: string;
  /** O que aparece no `title` e para o leitor de tela. */
  rotulo: string;
  /** Só o ícone, para caber em célula de tabela. */
  compacto?: boolean;
}

export function botaoCopiarLink(o: OpcoesCopiarLink): HTMLElement {
  const endereco = enderecoAbsoluto(o.caminho);

  const botao = h(
    "button",
    {
      class: o.compacto ? "ds-copiar-link" : "btn btn--sm btn--sutil",
      type: "button",
      title: `${o.rotulo} — ${endereco}`,
      aria: { label: o.rotulo },
      on: {
        click: (ev: Event) => {
          // A linha da tabela navega no clique; sem isto, copiar abriria o
          // registro no lugar de copiar.
          ev.stopPropagation();

          void copiar(endereco).then((deu) =>
            avisar(
              deu
                ? "Link copiado. Cole onde precisar enviar."
                : "Não foi possível copiar. Use o endereço da barra do navegador.",
              deu ? "ok" : "erro",
            ),
          );
        },
      },
    },
    o.compacto ? null : "Copiar link",
  );

  // `.btn` já é flex com gap e `.btn svg` já dimensiona: o ícone entra antes
  // do texto e não precisa de classe própria.
  botao.prepend(icone(ICONES.link_externo));

  return botao;
}
