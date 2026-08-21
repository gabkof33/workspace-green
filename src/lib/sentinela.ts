/**
 * Sentinela: observa sinais de manipulação do cliente e registra na trilha.
 *
 * Leia isto antes de confiar em qualquer coisa daqui.
 *
 * Este módulo roda na máquina de quem eventualmente está atacando o app.
 * Cada detector abaixo é uma heurística que um breakpoint desliga, um
 * `--disable-web-security` contorna e um proxy remove antes do JavaScript
 * chegar ao navegador. Por isso nenhum deles *reage*: não derrubam sessão,
 * não recarregam a página, não bloqueiam tela. Todos apenas registram.
 *
 * A escolha é deliberada. Reagir a heurística falível gera falso positivo em
 * gente legítima — extensão de navegador, leitor de tela, zoom, monitor
 * externo — e não segura ninguém que saiba o que está fazendo. Como sinal
 * agregado, porém, presta: cem eventos de `dom_mutado` numa conta em uma
 * tarde é uma pergunta que vale fazer.
 *
 * O que de fato protege dado nesta aplicação é a RLS no Postgres. Ver
 * SEGURANCA.md.
 */

import type { Inserir } from "@/types/database";

/* ---------- Gravador injetado ---------- */

/**
 * Mesma inversão de `observabilidade-fila`: quem sabe falar com o banco é
 * `supabase.ts`, e ele injeta o gravador aqui. Sem isso este módulo
 * importaria o cliente Supabase, que por sua vez instrumenta o próprio
 * `fetch` — e o ciclo de módulos voltaria.
 */
export interface GravadorSeguranca {
  gravar(
    linhas: Array<Inserir<"eventos_seguranca">>,
  ): Promise<{ error: { message: string } | null }>;
  /** Id de quem está na sessão, ou `null` fora dela. */
  usuarioId(): string | null;
}

let gravador: GravadorSeguranca | null = null;

export function configurarGravadorSeguranca(g: GravadorSeguranca): void {
  gravador = g;
}

/* ---------- Fila ---------- */

const TAMANHO_LOTE = 10;
const INTERVALO_MS = 15_000;

/**
 * Teto por carga de página. Detector em laço — um MutationObserver diante de
 * uma extensão que reescreve o DOM sem parar — geraria milhares de linhas
 * idênticas e transformaria a trilha em custo de banco sem informação nova.
 */
const TETO_POR_SESSAO = 50;

export type TipoEvento = Inserir<"eventos_seguranca">["tipo"];

export interface EventoSeguranca {
  tipo: TipoEvento;
  severidade?: "info" | "aviso" | "alto";
  detalhe?: Record<string, string | number | boolean>;
}

let lote: Array<Inserir<"eventos_seguranca">> = [];
let temporizador: ReturnType<typeof setTimeout> | null = null;
let registrados = 0;

/** Uma linha por tipo, por carga de página, para os detectores repetitivos. */
const jaRegistrado = new Set<TipoEvento>();

export function registrarEventoSeguranca(evento: EventoSeguranca): void {
  if (registrados >= TETO_POR_SESSAO) return;

  const usuarioId = gravador?.usuarioId() ?? null;
  // Sem sessão a policy de INSERT recusaria de qualquer forma. Descarta aqui
  // para não acumular lote que nunca vai ser aceito.
  if (!usuarioId) return;

  registrados += 1;
  lote.push({
    tipo: evento.tipo,
    severidade: evento.severidade ?? "aviso",
    rota: location.hash || null,
    detalhe: evento.detalhe ?? {},
    usuario_id: usuarioId,
  });

  if (lote.length >= TAMANHO_LOTE) {
    void descarregar();
    return;
  }
  if (temporizador === null) {
    temporizador = setTimeout(() => void descarregar(), INTERVALO_MS);
  }
}

/** Registra no máximo uma vez por carga de página. */
function registrarUmaVez(evento: EventoSeguranca): void {
  if (jaRegistrado.has(evento.tipo)) return;
  jaRegistrado.add(evento.tipo);
  registrarEventoSeguranca(evento);
}

async function descarregar(): Promise<void> {
  if (temporizador !== null) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  if (lote.length === 0 || !gravador) return;

  const enviando = lote;
  lote = [];

  try {
    const { error } = await gravador.gravar(enviando);
    // Falha aqui é descartada de propósito: reenfileirar faria a trilha
    // insistir para sempre contra um banco que está recusando, competindo
    // com o trabalho real da pessoa. Perder sinal de auditoria é aceitável;
    // travar a aplicação por causa dele não é.
    if (error) console.warn("[sentinela] trilha não gravada:", error.message);
  } catch (erro) {
    console.warn("[sentinela] trilha não gravada:", erro);
  }
}

/* ---------- Detector: DevTools ---------- */

/**
 * Heurística de janela: o painel acoplado rouba área da viewport, então a
 * diferença entre `outerWidth/Height` e `innerWidth/Height` cresce.
 *
 * Falha nos dois sentidos, e é bom saber em quais:
 *  - falso positivo — barra de ferramentas de extensão, zoom diferente de
 *    100%, barra de download aberta, janela em tela dividida;
 *  - falso negativo — DevTools em janela separada (`undocked`), que não
 *    altera a viewport em nada, ou o navegador aberto por CDP sem UI.
 *
 * Não existe API de navegador que responda "o inspetor está aberto". Se
 * existisse, seria a primeira coisa que um atacante interceptaria.
 */
const MARGEM_PX = 160;

function devtoolsProvavelmenteAberto(): boolean {
  const largura = window.outerWidth - window.innerWidth;
  const altura = window.outerHeight - window.innerHeight;
  return largura > MARGEM_PX || altura > MARGEM_PX;
}

function observarDevtools(): void {
  const conferir = (): void => {
    if (!devtoolsProvavelmenteAberto()) return;
    registrarUmaVez({
      tipo: "devtools_suspeito",
      severidade: "info",
      detalhe: {
        delta_largura: window.outerWidth - window.innerWidth,
        delta_altura: window.outerHeight - window.innerHeight,
        // Registrado junto porque é o desmentido mais comum da heurística:
        // zoom fora de 100% explica a maior parte dos falsos positivos.
        proporcao_pixel: window.devicePixelRatio,
      },
    });
  };

  window.addEventListener("resize", conferir, { passive: true });
  conferir();
}

/* ---------- Detector: mutação no DOM ---------- */

/**
 * Vigia a injeção de nós executáveis — `script`, `iframe`, `object`,
 * `embed` — fora do que o próprio app monta.
 *
 * É o detector mais útil dos três, porque o sinal que ele procura é o que
 * um XSS refletido ou uma extensão hostil precisa fazer para agir. Ainda
 * assim: o observer é um objeto JS na mesma página, e quem controla a página
 * o desconecta com uma linha. Quem impede o script de *executar* é a CSP no
 * cabeçalho, não este código.
 */
const TAGS_EXECUTAVEIS = new Set(["SCRIPT", "IFRAME", "OBJECT", "EMBED"]);

function observarDom(): void {
  const observer = new MutationObserver((registros) => {
    for (const r of registros) {
      for (const no of r.addedNodes) {
        if (no.nodeType !== Node.ELEMENT_NODE) continue;
        const el = no as Element;
        if (!TAGS_EXECUTAVEIS.has(el.tagName)) continue;

        registrarEventoSeguranca({
          tipo: "dom_mutado",
          severidade: "alto",
          detalhe: {
            tag: el.tagName,
            // Só a origem do recurso, nunca o conteúdo do nó: script inline
            // injetado carrega justamente o que não queremos replicar para
            // dentro do banco.
            origem: origemDe(el),
            no_head: el.parentElement?.tagName === "HEAD",
          },
        });
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function origemDe(el: Element): string {
  const bruto = el.getAttribute("src");
  if (!bruto) return "inline";
  try {
    return new URL(bruto, location.href).origin;
  } catch {
    return "ilegivel";
  }
}

/* ---------- Detector: integridade do JavaScript ---------- */

/**
 * Confere que os scripts em execução são os que o build publicou.
 *
 * O Vite emite um único módulo de entrada com hash no nome
 * (`/assets/index-XXXX.js`). Script de outra origem, ou entrada a mais,
 * significa que algo entrou depois da publicação.
 *
 * Limite importante: isto compara *referência*, não *conteúdo*. Um proxy
 * que altere o corpo do arquivo mantendo o nome passa batido, e um atacante
 * que já executa JavaScript na página reescreve esta função antes de ela
 * rodar. A verificação de conteúdo que o navegador realmente garante é SRI
 * (atributo `integrity`), aplicada antes da execução — ver SEGURANCA.md.
 */
function conferirIntegridade(): void {
  const scripts = Array.from(document.querySelectorAll("script[src]"));

  const forasteiros = scripts.filter((s) => {
    const src = s.getAttribute("src") ?? "";
    try {
      return new URL(src, location.href).origin !== location.origin;
    } catch {
      return true;
    }
  });

  if (forasteiros.length === 0) return;

  registrarUmaVez({
    tipo: "integridade_divergente",
    severidade: "alto",
    detalhe: {
      total_scripts: scripts.length,
      externos: forasteiros.length,
      origens: [...new Set(forasteiros.map(origemDe))].join(","),
    },
  });
}

/* ---------- Detector: violação de CSP ---------- */

/**
 * O navegador avisa o que a CSP barrou. Este é o único sinal da lista que
 * não vem de heurística nossa: quem gerou o evento foi o próprio navegador,
 * já tendo bloqueado a coisa.
 */
function observarCsp(): void {
  document.addEventListener("securitypolicyviolation", (ev) => {
    registrarEventoSeguranca({
      tipo: "csp_violada",
      severidade: "aviso",
      detalhe: {
        diretiva: ev.effectiveDirective,
        // `blockedURI` pode conter caminho; a origem basta para investigar e
        // não arrasta query string para a trilha.
        bloqueado: origemDeTexto(ev.blockedURI),
        linha: ev.lineNumber,
      },
    });
  });
}

function origemDeTexto(uri: string): string {
  if (!uri || uri === "inline" || uri === "eval") return uri || "vazio";
  try {
    return new URL(uri, location.href).origin;
  } catch {
    return uri.slice(0, 40);
  }
}

/* ---------- Arranque ---------- */

let ligada = false;

/**
 * Liga os detectores. Idempotente, e seguro de chamar antes do login: sem
 * sessão os eventos são descartados na entrada da fila.
 */
export function iniciarSentinela(): void {
  if (ligada) return;
  ligada = true;

  observarCsp();
  observarDom();
  observarDevtools();
  conferirIntegridade();

  // Descarrega o que estiver pendente quando a aba sai de cena.
  // `visibilitychange` em vez de `unload`: é o único que dispara de forma
  // confiável quando a aba é fechada ou congelada no celular.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void descarregar();
  });
}
