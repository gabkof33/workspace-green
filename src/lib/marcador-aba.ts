/** Contador de não lidos no título da aba e sobre o ícone. */

// Lido do documento, não repetido aqui: duas fontes para o mesmo texto
// divergem na primeira vez que alguém mexer no `index.html`.
const TITULO_BASE = document.title;
const BASE_ICONE = "/igreen-g.png";

let naoLidos = 0;
let icone: HTMLImageElement | null = null;

/**
 * O ícone é redesenhado num canvas, não trocado por arquivo pronto.
 *
 * Seriam dez arquivos para dez números, e ainda faltaria o décimo primeiro.
 * Desenhar resolve qualquer contagem e mantém o "G" da marca reconhecível na
 * aba, que é o que faz a pessoa achar a janela certa.
 */
function desenharIcone(): void {
  if (!icone?.complete || icone.naturalWidth === 0) return;

  const lado = 64;
  const tela = document.createElement("canvas");
  tela.width = lado;
  tela.height = lado;
  const ctx = tela.getContext("2d");
  if (!ctx) return;

  // Mesma moldura do favicon.svg: carvão da marca, cantos arredondados.
  ctx.fillStyle = "#0A1410";
  ctx.beginPath();
  // `roundRect` é recente; sem ela o canto fica reto, que é degradação
  // aceitável — jogar exceção aqui derrubaria o contador inteiro.
  if (typeof ctx.roundRect === "function") ctx.roundRect(0, 0, lado, lado, 14);
  else ctx.rect(0, 0, lado, lado);
  ctx.fill();

  // O "G" é retrato (812×1080); a proporção é mantida para não achatar.
  const altura = 44;
  const largura = Math.round((altura * 812) / 1080);
  ctx.drawImage(icone, (lado - largura) / 2, 10, largura, altura);

  if (naoLidos > 0) {
    const r = 20;
    const cx = lado - r + 2;
    const cy = lado - r + 2;

    // Anel na cor da moldura: separa o selo do "G" sob ele.
    ctx.fillStyle = "#0A1410";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d92d20";
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const texto = naoLidos > 9 ? "9+" : String(naoLidos);
    ctx.font = `bold ${texto.length > 1 ? 20 : 26}px system-ui, sans-serif`;
    ctx.fillText(texto, cx, cy + 1);
  }

  aplicarIcone(tela.toDataURL("image/png"));
}

function aplicarIcone(href: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.append(link);
  }
  // O tipo declarado era SVG; o canvas devolve PNG.
  link.type = "image/png";
  link.href = href;
}

function aplicarTitulo(): void {
  document.title = naoLidos > 0 ? `(${naoLidos}) ${TITULO_BASE}` : TITULO_BASE;
}

function repintar(): void {
  aplicarTitulo();
  desenharIcone();
}

/**
 * Liga o contador.
 *
 * Zera quando a aba volta a ficar visível: o contador serve para quem está
 * fora dela, e um número que sobra depois de a pessoa voltar deixa de
 * significar algo.
 */
export function iniciarMarcador(): void {
  if (icone) return;

  icone = new Image();
  icone.src = BASE_ICONE;
  icone.onload = repintar;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") zerarNaoLidos();
  });
}

export function somarNaoLido(): void {
  // Contar com a aba à vista inflaria o número por mensagens já lidas.
  if (document.visibilityState === "visible") return;
  naoLidos += 1;
  repintar();
}

export function zerarNaoLidos(): void {
  if (naoLidos === 0) return;
  naoLidos = 0;
  repintar();
}
