/**
 * Acesso a `localStorage` e `sessionStorage` com validação na leitura.
 *
 * O que isto é: uma barreira de *integridade*. Todo valor lido é validado
 * antes de entrar no app, e valor inválido cai no padrão em vez de virar
 * exceção no meio de um `render`. Chave inesperada dentro do nosso namespace
 * é sinal registrado.
 *
 * O que isto não é: uma barreira de *confidencialidade*. Quem abre o F12
 * escreve o que quiser em qualquer chave, inclusive nas do Supabase — e o
 * próprio token de sessão vive ali. Nada em JavaScript muda isso. O que
 * impede alguém de ler dado alheio depois de mexer no armazenamento é a RLS
 * no Postgres, nunca este arquivo.
 */

import { registrarEventoSeguranca } from "@/lib/sentinela";

/** Prefixo de tudo que é nosso. Chave fora dele não é gerenciada aqui. */
const PREFIXO = "central-green:";

/**
 * Chaves que a aplicação reconhece, com o validador de cada uma.
 *
 * Registrar aqui é obrigatório: `ler` só aceita chave conhecida, então uma
 * chave nova exige uma linha nesta tabela e o validador vem junto — não dá
 * para esquecer de validar.
 */
const VALIDADORES = {
  tema: (v: unknown): v is "claro" | "escuro" => v === "claro" || v === "escuro",
  "menu-fechado": ehListaDeTexto,
  "menu-recolhido": (v: unknown): v is "1" => v === "1",
  "filtro-aberto": ehListaDeTexto,
  avisos: (v: unknown): v is "0" | "1" => v === "0" || v === "1",
} as const;

export type Chave = keyof typeof VALIDADORES;

function ehListaDeTexto(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((i) => typeof i === "string");
}

type Valor<C extends Chave> = (typeof VALIDADORES)[C] extends (
  v: unknown,
) => v is infer T
  ? T
  : never;

function chaveCompleta(chave: Chave): string {
  return `${PREFIXO}${chave}`;
}

/**
 * Lê e valida. Devolve `null` quando ausente, ilegível ou inválido.
 *
 * As três situações colapsam em `null` de propósito: para quem chama, o
 * efeito é o mesmo — usar o padrão. A diferença entre elas interessa à
 * trilha, e é lá que ela é registrada.
 */
export function ler<C extends Chave>(chave: C): Valor<C> | null {
  let bruto: string | null;

  try {
    bruto = localStorage.getItem(chaveCompleta(chave));
  } catch {
    // Modo privado, cota estourada ou armazenamento bloqueado por política.
    // Não é suspeito, é indisponível.
    return null;
  }

  if (bruto === null) return null;

  // Texto puro para os escalares, JSON para o resto: guardar `"claro"` com
  // aspas no armazenamento só serviria para confundir quem inspeciona.
  const interpretado = bruto.startsWith("[") ? tentarJson(bruto) : bruto;

  const valido = VALIDADORES[chave] as (v: unknown) => boolean;
  if (!valido(interpretado)) {
    registrarEventoSeguranca({
      tipo: "armazenamento_invalido",
      severidade: "info",
      // Só a chave e o tamanho. O conteúdo pode ter sido plantado com texto
      // arbitrário, e reenviá-lo ao banco transformaria a trilha em veículo
      // do que a gente está tentando conter.
      detalhe: { chave, tamanho: bruto.length },
    });
    remover(chave);
    return null;
  }

  return interpretado as Valor<C>;
}

function tentarJson(bruto: string): unknown {
  try {
    return JSON.parse(bruto);
  } catch {
    return undefined;
  }
}

export function gravar<C extends Chave>(chave: C, valor: Valor<C>): void {
  try {
    localStorage.setItem(
      chaveCompleta(chave),
      typeof valor === "string" ? valor : JSON.stringify(valor),
    );
  } catch {
    // Preferência que não persiste não pode derrubar a interação que a
    // causou. A tela segue com o valor em memória.
  }
}

export function remover(chave: Chave): void {
  try {
    localStorage.removeItem(chaveCompleta(chave));
  } catch {
    /* idem */
  }
}

/**
 * Chaves nossas que não estão no registro acima.
 *
 * Sobra de versão antiga do app ou algo plantado à mão. Em nenhum dos dois
 * casos a aplicação deveria estar lendo aquilo.
 */
export function chavesEstranhas(): string[] {
  try {
    return Object.keys(localStorage).filter(
      (k) =>
        k.startsWith(PREFIXO) &&
        !(k.slice(PREFIXO.length) in VALIDADORES),
    );
  } catch {
    return [];
  }
}
