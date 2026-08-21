/**
 * Núcleo de instrumentação da observabilidade de APIs.
 *
 * Transforma toda chamada real feita pelo cliente Supabase num evento
 * capturável — sem depender da fila que grava, da tela que exibe, nem de
 * qualquer módulo de domínio. Quem liga as pontas é `supabase.ts`.
 *
 * Só captura metadado: método, caminho, status, duração, cabeçalhos de
 * contagem. Nunca lê corpo de requisição/resposta, cabeçalhos de
 * autenticação, nem parâmetros de filtro da URL — isso pode conter texto
 * digitado pela pessoa ou dado sensível, e não é isso que a observabilidade
 * precisa para responder "essa API está lenta/falhando".
 */

const CAMINHO_EVENTOS_API = "/rest/v1/eventos_api";

/* ---------- Contexto de autenticação ---------- */

export interface ContextoAuth {
  id: string | null;
  token: string | null;
}

let usuarioAtualId: string | null = null;
let tokenAtual: string | null = null;

/** Chamado por `supabase.ts` a cada mudança de sessão — nunca lido daqui. */
export function definirContextoAuth(id: string | null, token: string | null): void {
  usuarioAtualId = id;
  tokenAtual = token;
}

export function usuarioAtual(): ContextoAuth {
  return { id: usuarioAtualId, token: tokenAtual };
}

/* ---------- Escopo de traço ---------- */

interface EscopoTraco {
  traceId: string;
  spanRaiz: string;
  nome: string;
}

const pilhaDeTracos: EscopoTraco[] = [];

/**
 * Agrupa as chamadas feitas dentro de `fn` sob um único traço.
 *
 * Não aninha: uma ação disparada dentro de outra reaproveita o traço de fora.
 * O navegador não vê causalidade real entre chamadas — só que aconteceram
 * juntas sob a mesma ação da pessoa — e fingir uma árvore mais profunda do
 * que isso seria inventar dado que a instrumentação não tem.
 *
 * Fora de qualquer escopo, cada chamada é o próprio traço (`traceId = requestId`).
 */
export async function comEscopoDeTraco<T>(
  nome: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (pilhaDeTracos.length > 0) return fn();

  pilhaDeTracos.push({
    traceId: crypto.randomUUID(),
    spanRaiz: crypto.randomUUID(),
    nome,
  });
  try {
    return await fn();
  } finally {
    pilhaDeTracos.pop();
  }
}

function escopoAtivo(): EscopoTraco | null {
  return pilhaDeTracos.at(-1) ?? null;
}

/* ---------- Interpretação da URL ---------- */

const PADRAO_RPC = /^\/rest\/v1\/rpc\/([^/?]+)/;
const PADRAO_TABELA = /^\/rest\/v1\/([^/?]+)/;

/** Nome do "serviço" chamado — o rótulo que aparece nos nós do grafo. */
function servicoDestinoDoCaminho(pathname: string): string {
  const rpc = PADRAO_RPC.exec(pathname);
  if (rpc?.[1]) return `rpc:${rpc[1]}`;

  const tabela = PADRAO_TABELA.exec(pathname);
  if (tabela?.[1]) return `tabela:${tabela[1]}`;

  if (pathname.startsWith("/auth/v1/")) return "auth";
  if (pathname.startsWith("/storage/v1/")) return "storage";
  return "desconhecido";
}

function extrairMetodoEUrl(
  entrada: RequestInfo | URL,
  init: RequestInit | undefined,
): { metodo: string; url: URL } | null {
  try {
    if (entrada instanceof Request) {
      return {
        metodo: (init?.method ?? entrada.method).toUpperCase(),
        url: new URL(entrada.url),
      };
    }
    return {
      metodo: (init?.method ?? "GET").toUpperCase(),
      url: new URL(String(entrada)),
    };
  } catch {
    return null;
  }
}

/* ---------- Melhor esforço: cabeçalhos de timing/contagem ---------- */

/**
 * Extraído de `Server-Timing`, quando o Supabase expõe esse cabeçalho via
 * CORS — o que não é garantido na API hospedada. `null` é o caso comum, não
 * uma falha.
 */
function tempoBancoMs(resposta: Response): number | null {
  const cabecalho = resposta.headers.get("Server-Timing");
  if (!cabecalho) return null;

  for (const metrica of cabecalho.split(",")) {
    if (!/db|query|plan/i.test(metrica)) continue;
    const duracao = /dur=([\d.]+)/.exec(metrica);
    if (duracao?.[1]) return Math.round(Number(duracao[1]));
  }
  return null;
}

/** Extraído de `Content-Range` (ex.: "0-24/135"). `null` quando a chamada não pede contagem. */
function qtdRegistros(resposta: Response): number | null {
  const cabecalho = resposta.headers.get("Content-Range");
  if (!cabecalho) return null;

  const total = cabecalho.split("/")[1];
  if (!total || total === "*") return null;

  const n = Number(total);
  return Number.isFinite(n) ? n : null;
}

interface ClassificacaoErro {
  tipo: string;
  mensagem: string;
}

/** Nunca lê o corpo da resposta — só a categoria e o status, que já bastam
 * para apontar "essa API está falhando". */
function classificarErro(
  status: number | null,
  excecaoRede: unknown,
): ClassificacaoErro | null {
  if (excecaoRede) {
    return {
      tipo: "rede",
      mensagem: excecaoRede instanceof Error ? excecaoRede.message : "Falha de rede.",
    };
  }
  if (status !== null && status >= 400) {
    return { tipo: status >= 500 ? "servidor" : "cliente", mensagem: `HTTP ${status}` };
  }
  return null;
}

/* ---------- Evento capturado ---------- */

/** Formato entregue a quem grava — hoje a fila em `observabilidade-fila.ts`. */
export interface EventoCapturado {
  requestId: string;
  traceId: string;
  parentSpanId: string | null;
  nomeOperacao: string | null;
  servicoDestino: string;
  endpoint: string;
  metodoHttp: string;
  statusCode: number | null;
  latenciaMs: number;
  /** ISO do início da chamada — não de quando o lote foi gravado no banco. */
  criadoEm: string;
  tempoBancoMs: number | null;
  qtdRegistros: number | null;
  erroTipo: string | null;
  erroMensagem: string | null;
}

export type CapturarEvento = (evento: EventoCapturado) => void;

/**
 * Envolve um `fetch` real com captura de evento, sem alterar comportamento.
 *
 * Fica só como observador: a resposta (ou a exceção) que chega de
 * `fetchReal` é sempre devolvida/relançada sem modificação — a instrumentação
 * nunca pode ser a razão de uma chamada real falhar.
 */
export function criarFetchInstrumentado(
  fetchReal: typeof fetch,
  aoCapturar: CapturarEvento,
): typeof fetch {
  return async (entrada, init) => {
    const info = extrairMetodoEUrl(entrada, init);

    // Sem info (URL não interpretável) ou é a própria gravação do log:
    // segue sem instrumentar. Instrumentar o próprio INSERT do log
    // realimentaria a fila para sempre.
    if (!info || info.url.pathname === CAMINHO_EVENTOS_API) {
      return fetchReal(entrada, init);
    }

    const requestId = crypto.randomUUID();
    const escopo = escopoAtivo();
    const inicio = performance.now();
    const inicioIso = new Date().toISOString();

    const capturar = (parcial: {
      statusCode: number | null;
      tempoBancoMs: number | null;
      qtdRegistros: number | null;
      erro: ClassificacaoErro | null;
    }): void => {
      try {
        aoCapturar({
          requestId,
          traceId: escopo?.traceId ?? requestId,
          parentSpanId: escopo?.spanRaiz ?? null,
          nomeOperacao: escopo?.nome ?? null,
          servicoDestino: servicoDestinoDoCaminho(info.url.pathname),
          endpoint: info.url.pathname,
          metodoHttp: info.metodo,
          statusCode: parcial.statusCode,
          latenciaMs: Math.round(performance.now() - inicio),
          criadoEm: inicioIso,
          tempoBancoMs: parcial.tempoBancoMs,
          qtdRegistros: parcial.qtdRegistros,
          erroTipo: parcial.erro?.tipo ?? null,
          erroMensagem: parcial.erro?.mensagem ?? null,
        });
      } catch (erroDeCaptura) {
        console.warn("[observabilidade] falha ao capturar evento", erroDeCaptura);
      }
    };

    try {
      const resposta = await fetchReal(entrada, init);
      capturar({
        statusCode: resposta.status,
        tempoBancoMs: tempoBancoMs(resposta),
        qtdRegistros: qtdRegistros(resposta),
        erro: classificarErro(resposta.status, null),
      });
      return resposta;
    } catch (excecaoRede) {
      capturar({
        statusCode: null,
        tempoBancoMs: null,
        qtdRegistros: null,
        erro: classificarErro(null, excecaoRede),
      });
      throw excecaoRede;
    }
  };
}
