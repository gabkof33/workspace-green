/** Fundo pontilhado animado da tela de acesso. */

import { h } from "@/lib/dom";

const ESPACAMENTO = 26;
const RAIO_BASE = 1.15;
const RAIO_CURSOR = 150;
const FORCA_CURSOR = 26;
/**
 * Quanto do deslocamento sobra a cada quadro — quanto menor, mais rápido
 * volta.
 */
const AMORTECIMENTO = 0.86;

interface Ponto {
  x: number;
  y: number;
  /** Deslocamento atual em relação à posição de origem. */
  dx: number;
  dy: number;
  /** Defasagem da respiração, para os pontos não pulsarem em uníssono. */
  fase: number;
}

/**
 * Só uma malha viva por vez: a tela de acesso se redesenha ao trocar de aba.
 */
let pararAtual: (() => void) | null = null;

export function criarFundoPontilhado(): HTMLElement {
  pararAtual?.();

  const canvas = h("canvas", { class: "pontilhado" }) as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const reduzido = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  let pontos: Ponto[] = [];
  let largura = 0;
  let altura = 0;
  let quadro = 0;
  let inicio = performance.now();

  // Cursor fora da tela até que o mouse entre de fato.
  let mouseX = -9999;
  let mouseY = -9999;
  let influencia = 0;

  const corPonto = (): string => {
    const estilo = getComputedStyle(canvas);
    return estilo.getPropertyValue("--c-accent").trim() || "#35c77f";
  };
  let cor = corPonto();

  /* ---------- Dimensionamento ---------- */

  const redimensionar = (): void => {
    const caixa = canvas.parentElement?.getBoundingClientRect();
    if (!caixa || caixa.width === 0) return;

    // Densidade de pixel do monitor: sem isso o ponto sai borrado em tela
    // retina.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    largura = caixa.width;
    altura = caixa.height;

    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);
    canvas.style.width = `${largura}px`;
    canvas.style.height = `${altura}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    pontos = [];
    const colunas = Math.ceil(largura / ESPACAMENTO) + 1;
    const linhas = Math.ceil(altura / ESPACAMENTO) + 1;

    for (let c = 0; c < colunas; c += 1) {
      for (let l = 0; l < linhas; l += 1) {
        pontos.push({
          x: c * ESPACAMENTO,
          y: l * ESPACAMENTO,
          dx: 0,
          dy: 0,
          // A defasagem vem da posição, não de aleatório: o padrão fica com
          // ondas diagonais coerentes em vez de cintilação dispersa.
          fase: (c + l) * 0.35,
        });
      }
    }

    cor = corPonto();
  };

  /* ---------- Desenho ---------- */

  const desenhar = (agora: number): void => {
    const t = (agora - inicio) / 1000;
    ctx.clearRect(0, 0, largura, altura);

    for (const p of pontos) {
      // Respiração: onda lenta que percorre a malha na diagonal.
      const pulso = Math.sin(t * 0.9 + p.fase);

      if (!reduzido) {
        const vx = p.x + p.dx - mouseX;
        const vy = p.y + p.dy - mouseY;
        const dist = Math.hypot(vx, vy);

        if (dist < RAIO_CURSOR && dist > 0.01) {
          // Queda quadrática: perto empurra forte, longe quase não toca.
          const queda = (1 - dist / RAIO_CURSOR) ** 2;
          const empurrao = queda * FORCA_CURSOR * influencia;
          p.dx += (vx / dist) * empurrao * 0.12;
          p.dy += (vy / dist) * empurrao * 0.12;
        }

        // Volta amortecida à origem: sem isto os pontos ficariam onde o
        // cursor os deixou, e a malha se desfaria com o uso.
        p.dx *= AMORTECIMENTO;
        p.dy *= AMORTECIMENTO;
      }

      const x = p.x + p.dx;
      const y = p.y + p.dy;

      const distCursor = reduzido ? 9999 : Math.hypot(x - mouseX, y - mouseY);
      const proximidade =
        distCursor < RAIO_CURSOR ? 1 - distCursor / RAIO_CURSOR : 0;

      // Perto do cursor o ponto cresce e acende; longe, só respira.
      const raio = RAIO_BASE + pulso * 0.28 + proximidade * proximidade * 1.9;
      const alfa = 0.16 + pulso * 0.05 + proximidade * 0.55;

      ctx.globalAlpha = Math.max(alfa, 0.05);
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(raio, 0.4), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  };

  const laco = (agora: number): void => {
    // A influência do cursor sobe ao entrar e desce ao sair, para os pontos
    // não travarem de repente quando o mouse deixa a área.
    influencia += ((mouseX < -1000 ? 0 : 1) - influencia) * 0.06;
    desenhar(agora);
    quadro = window.requestAnimationFrame(laco);
  };

  /* ---------- Eventos ---------- */

  const aoMover = (ev: MouseEvent): void => {
    const caixa = canvas.getBoundingClientRect();
    mouseX = ev.clientX - caixa.left;
    mouseY = ev.clientY - caixa.top;
  };

  const aoSair = (): void => {
    mouseX = -9999;
    mouseY = -9999;
  };

  const aoVisibilidade = (): void => {
    // Aba escondida não precisa de quadro: economiza bateria e evita o
    // salto de tempo acumulado ao voltar.
    if (document.hidden) {
      window.cancelAnimationFrame(quadro);
    } else {
      inicio = performance.now() - 1;
      quadro = window.requestAnimationFrame(laco);
    }
  };

  const observador = new ResizeObserver(() => redimensionar());

  const parar = (): void => {
    window.cancelAnimationFrame(quadro);
    observador.disconnect();
    document.removeEventListener("visibilitychange", aoVisibilidade);
    const pai = canvas.parentElement;
    pai?.removeEventListener("mousemove", aoMover);
    pai?.removeEventListener("mouseleave", aoSair);
    pararAtual = null;
  };
  pararAtual = parar;

  // O elemento só ganha tamanho depois de entrar no documento.
  window.requestAnimationFrame(() => {
    const pai = canvas.parentElement;
    if (!pai) return;

    observador.observe(pai);
    redimensionar();

    if (reduzido) {
      // Sem movimento: uma passada só, malha estática.
      desenhar(performance.now());
      return;
    }

    pai.addEventListener("mousemove", aoMover);
    pai.addEventListener("mouseleave", aoSair);
    document.addEventListener("visibilitychange", aoVisibilidade);
    quadro = window.requestAnimationFrame(laco);
  });

  return canvas;
}

/** Encerra a malha ativa — chamado ao sair da tela de acesso. */
export function pararFundoPontilhado(): void {
  pararAtual?.();
}
