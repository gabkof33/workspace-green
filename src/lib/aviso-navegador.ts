/** Notificação do navegador. */

const CHAVE = "central-green:avisos";

export type EstadoAviso = "indisponivel" | "negado" | "desligado" | "ligado";

/**
 * Duas coisas diferentes: a permissão do navegador e a escolha da pessoa.
 *
 * Ter concedido permissão uma vez não significa querer receber para sempre, e
 * o navegador não oferece como revogar de dentro da página. O interruptor
 * próprio é o que permite desligar sem mexer nas configurações do Chrome.
 */
export function estado(): EstadoAviso {
  if (!("Notification" in window)) return "indisponivel";
  if (Notification.permission === "denied") return "negado";
  if (Notification.permission !== "granted") return "desligado";
  return localStorage.getItem(CHAVE) === "0" ? "desligado" : "ligado";
}

/**
 * Pede a permissão. Só chame a partir de um clique.
 *
 * Pedir no carregamento é o caminho mais rápido para o "Bloquear": o Chrome
 * penaliza quem pede sem gesto, e a recusa é definitiva — não há como pedir de
 * novo pela página.
 */
export async function ligar(): Promise<EstadoAviso> {
  if (!("Notification" in window)) return "indisponivel";

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission !== "granted") return estado();

  localStorage.setItem(CHAVE, "1");
  return "ligado";
}

export function desligar(): void {
  localStorage.setItem(CHAVE, "0");
}

export interface Aviso {
  titulo: string;
  corpo: string;
  /** Rota para abrir no clique, sem o `#/`. */
  destino?: string;
  /** Agrupa avisos do mesmo assunto: o novo substitui o anterior. */
  chave?: string;
}

/**
 * Mostra o aviso, mas só com a aba em segundo plano.
 *
 * Notificar quem está olhando a tela é ruído: a mensagem já apareceu ali. O
 * aviso existe para quem está em outra aba ou com o navegador minimizado.
 */
export function avisarNavegador(aviso: Aviso): void {
  if (estado() !== "ligado") return;
  if (document.visibilityState === "visible") return;

  try {
    const n = new Notification(aviso.titulo, {
      body: aviso.corpo,
      icon: "/igreen-g.png",
      badge: "/igreen-g.png",
      tag: aviso.chave ?? "central-green",
      // O navegador silencia sozinho quando há muitos seguidos; renotificar
      // garante que o segundo aviso não passe batido.
      renotify: Boolean(aviso.chave),
    } as NotificationOptions);

    n.onclick = () => {
      window.focus();
      if (aviso.destino) location.hash = `#/${aviso.destino}`;
      n.close();
    };
  } catch {
    // Navegador pode recusar por política de foco ou cota. Não é motivo para
    // interromper o que a pessoa está fazendo.
  }
}
