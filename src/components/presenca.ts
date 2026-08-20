/** Bolinha de online e offline. */

import { h } from "@/lib/dom";
import { estaOnline } from "@/lib/presenca";

/**
 * Cor mais texto, nunca cor sozinha.
 *
 * O `title` e o texto para leitor de tela carregam o estado — quem não
 * distingue verde de vermelho vê duas bolinhas iguais, e é comum.
 */
export function bolinha(id: string, nome?: string): HTMLElement {
  const ligado = estaOnline(id);
  const rotulo = ligado ? "online agora" : "offline";

  return h(
    "span",
    {
      class: `presenca presenca--${ligado ? "online" : "offline"}`,
      title: nome ? `${nome} está ${rotulo}` : rotulo,
      dataset: { id },
    },
    h("span", { class: "sr" }, rotulo),
  );
}

/**
 * Repinta as bolinhas já na tela, sem redesenhar a conversa.
 *
 * Alguém entrar ou sair não pode reconstruir a lista de mensagens: o scroll
 * saltaria e um texto sendo digitado se perderia.
 */
export function repintarBolinhas(raiz: ParentNode): void {
  for (const el of raiz.querySelectorAll<HTMLElement>(".presenca[data-id]")) {
    const id = el.dataset["id"];
    if (!id) continue;

    const ligado = estaOnline(id);
    el.classList.toggle("presenca--online", ligado);
    el.classList.toggle("presenca--offline", !ligado);

    const rotulo = ligado ? "online agora" : "offline";
    const antes = el.title.replace(/ está .*$/, "");
    el.title = antes && antes !== el.title ? `${antes} está ${rotulo}` : rotulo;

    const leitor = el.querySelector(".sr");
    if (leitor) leitor.textContent = rotulo;
  }
}
