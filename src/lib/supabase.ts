/** Cliente Supabase tipado pelo schema do banco. */

import { createClient } from "@supabase/supabase-js";
import {
  criarFetchInstrumentado,
  definirContextoAuth,
  sessaoEmMemoriaValida,
  usuarioAtual,
} from "@/lib/observabilidade-nucleo";
import {
  configurarGravador,
  descartarLote,
  enfileirar,
} from "@/lib/observabilidade-fila";
import { configurarGravadorSeguranca } from "@/lib/sentinela";
import type { Database } from "@/types/database";

const url = import.meta.env["VITE_SUPABASE_URL"];
const chave = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

if (!url || !chave) {
  throw new Error(
    "Credenciais do Supabase ausentes. Copie .env.example para .env.local e preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.",
  );
}

export const supabase = createClient<Database>(url, chave, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  // Observa toda chamada real do cliente para alimentar a observabilidade de
  // APIs — sem tocar em nenhum ponto de chamada do resto do app.
  global: {
    fetch: criarFetchInstrumentado(window.fetch.bind(window), enfileirar),
  },
});

configurarGravador({
  gravar: async (linhas) => {
    // Última barreira contra 42501: o lote é estampado quando a chamada
    // acontece, mas só sai daqui até 5 s depois. Se a sessão virou nesse
    // intervalo, mandar o lote inteiro seria recusa garantida — o RLS não
    // aceita linha com `usuario_id` diferente de `auth.uid()`, e a recusa
    // vale para todas as linhas do INSERT, não só a divergente.
    const { id } = usuarioAtual();
    if (!sessaoEmMemoriaValida()) return { error: null };

    const minhas = id ? linhas.filter((l) => l.usuario_id === id) : [];
    if (minhas.length === 0) return { error: null };

    const { error } = await supabase.from("eventos_api").insert(minhas);
    return { error: error ? { message: error.message } : null };
  },
});

// Trilha de eventos suspeitos. Mesma inversão da fila acima: quem sabe falar
// com o banco é este arquivo. O id sai do contexto em memória — sem chamada
// de rede para descobrir quem está logado.
configurarGravadorSeguranca({
  gravar: async (linhas) => {
    // `eventos_seguranca` tem a mesma política `usuario_id = auth.uid()` e o
    // mesmo lote atrasado — logo, a mesma guarda que o gravador acima.
    const { id } = usuarioAtual();
    if (!sessaoEmMemoriaValida()) return { error: null };

    const minhas = id ? linhas.filter((l) => l.usuario_id === id) : [];
    if (minhas.length === 0) return { error: null };

    const { error } = await supabase.from("eventos_seguranca").insert(minhas);
    return { error: error ? { message: error.message } : null };
  },
  usuarioId: () => usuarioAtual().id,
});

// Contexto de autenticação para a instrumentação: leitura em memória, sem
// chamada de rede, atualizada a cada troca de sessão ou renovação de token.
supabase.auth.onAuthStateChange((_evento, sessao) => {
  const idNovo = sessao?.user.id ?? null;
  const { id: idAnterior } = usuarioAtual();

  // Só quando a identidade muda de fato. `TOKEN_REFRESHED` mantém o mesmo id
  // e não descarta nada — é o caminho normal, que roda a cada hora.
  if (idAnterior !== null && idAnterior !== idNovo) descartarLote();

  definirContextoAuth(
    idNovo,
    sessao?.access_token ?? null,
    sessao?.expires_at ?? null,
  );
});

/** Traduz mensagens do Postgres para linguagem de usuário. */
export function traduzirErro(mensagem: string): string {
  const mapa: Array<[string, string]> = [
    [
      "fechamento_documentado",
      "Causa raiz e solução aplicada são obrigatórias, com ao menos 20 caracteres cada.",
    ],
    [
      "causa_obrigatoria_para_publicar",
      "Para publicar o post-mortem, a causa raiz precisa de ao menos 30 caracteres.",
    ],
    [
      "acoes_obrigatorias_para_publicar",
      "Para publicar o post-mortem, registre ao menos uma ação corretiva.",
    ],
    [
      "chamados_titulo_check",
      "O título do chamado precisa de ao menos 10 caracteres.",
    ],
    [
      "chamados_descricao_check",
      "A descrição do chamado precisa de ao menos 30 caracteres.",
    ],
    [
      "demandas_titulo_check",
      "O título da demanda precisa de ao menos 6 caracteres.",
    ],
    [
      "demandas_descricao_check",
      "A descrição da demanda precisa de ao menos 20 caracteres.",
    ],
    [
      "conclusao_consistente",
      "Para concluir é preciso data de entrega e percentual em 100%.",
    ],
    [
      "bloqueio_justificado",
      "Bloquear exige um motivo com ao menos 10 caracteres.",
    ],
    [
      "periodo_previsto_valido",
      "A data de entrega não pode ser anterior à de início.",
    ],
    ["sem_autodependencia", "Uma demanda não pode depender dela mesma."],
    [
      "P1 exige ao menos um ativo",
      "Chamado P1 exige um ativo do CMDB vinculado antes de avançar.",
    ],
    [
      "Nenhuma política de SLA",
      "Não há política de SLA cadastrada para esta prioridade.",
    ],
    [
      "não existe no catálogo",
      "O serviço escolhido não existe mais no catálogo.",
    ],
    ["row-level security", "Você não tem permissão para esta operação."],
    ["duplicate key", "Já existe um registro com esse identificador."],
    ["violates foreign key", "O registro referenciado não existe."],
  ];

  for (const [trecho, texto] of mapa) {
    if (mensagem.includes(trecho)) return texto;
  }

  // Exceções levantadas por trigger já vêm em português e acionáveis.
  return mensagem;
}
