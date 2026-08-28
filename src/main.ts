/** Ponto de entrada da Central de TI. */

import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/layout.css";
import "@/styles/components.css";

// Base do iGreen DS em CSS puro (aditiva: só define `--ds-*`, não altera nada
// do que já existe) e o restyle da fila que a consome. Nesta ordem e DEPOIS do
// `components.css`: os tokens têm de existir antes de quem os lê, e o escopo
// `.fila-ds` sobrescreve as classes compartilhadas.
import "@/styles/ds-tokens.css";
import "@/styles/ds-componentes.css";
import "@/styles/fila-ds.css";
import "@/styles/abrir-ds.css";
import "@/styles/login-ds.css";
import "@/styles/conversas-ds.css";
import "@/styles/mapa-ds.css";

import { h, montar } from "@/lib/dom";
import { aoMudarRota, navegar, rotaAtual } from "@/lib/router";
import {
  abaVisivel,
  aoMudarSessao,
  carregarCatalogo,
  ehAgente,
  aoEntrarPorRecuperacao,
  obterSessao,
  sair,
} from "@/lib/api";
import { avisar } from "@/lib/dom";
import { aplicarTemaSalvo, renderizarShell } from "@/components/shell";
import { fecharDialogos } from "@/components/dialogo";
import { pararFundoPontilhado } from "@/components/fundo-pontilhado";
import { renderizarLogin, renderizarNovaSenha } from "@/pages/login";
import { entrarNaPresenca, sairDaPresenca } from "@/lib/presenca";
import {
  escutarNotificacoes,
  pararNotificacoes,
} from "@/lib/notificacoes-tempo-real";
import { iniciarMarcador, zerarNaoLidos } from "@/lib/marcador-aba";
import { iniciarSentinela } from "@/lib/sentinela";
import { renderizarAbrir } from "@/pages/abrir";
import { renderizarFila } from "@/pages/fila";
import { renderizarMeus } from "@/pages/meus";
import { renderizarChamado } from "@/pages/chamado";
import { renderizarDemandas } from "@/pages/demandas";
import { renderizarDemanda } from "@/pages/demanda";
import { renderizarGantt } from "@/pages/gantt";
import { renderizarPessoas } from "@/pages/pessoas";
import { renderizarSetores } from "@/pages/setores";
import { renderizarMapa } from "@/pages/mapa";
import { renderizarAtivos } from "@/pages/ativos";
import { renderizarRotinas } from "@/pages/rotinas";
import { renderizarConhecimento } from "@/pages/conhecimento";
import { renderizarPainel } from "@/pages/painel";
import { renderizarPostMortem } from "@/pages/postmortem";
import { renderizarPostMortems } from "@/pages/postmortems";
import { renderizarTempos } from "@/pages/tempos";
import { renderizarConversas } from "@/pages/conversas";
import { renderizarObservabilidade } from "@/pages/observabilidade";
import type { Perfil } from "@/types/dominio";

const raiz = document.getElementById("app");
if (!raiz) throw new Error("Elemento #app não encontrado no index.html.");

let perfilAtual: Perfil | null = null;

interface Pagina {
  titulo: string;
  subtitulo?: string;
  conteudo: HTMLElement;
}

/** Telas restritas à equipe de TI. */
const ROTAS_DE_TI = new Set([
  "setores",
  "ativos",
  "rotinas",
  "painel",
  // `pessoas` entrou aqui junto com o fecho da RPC `diretorio`: a tela mostra
  // papel, hierarquia e senioridade de todo mundo, e o banco agora só entrega
  // isso para a equipe. Sem o gate, solicitante com a aba liberada abriria um
  // organograma vazio e sem explicação.
  "pessoas",
  "tempos",
  "observabilidade",
]);

/** Rotas guardadas pela configuração de abas do setor. */
const ABAS = new Set([
  "abrir",
  "meus",
  "demandas",
  "gantt",
  "conversas",
  "pessoas",
  "mapa",
  "setores",
  "rotinas",
  "ativos",
  "conhecimento",
  "painel",
  "tempos",
  "postmortems",
  "observabilidade",
]);

// A fila fica fora da lista de propósito.

function resolverPagina(perfil: Perfil): Pagina {
  const { caminho, parametro } = rotaAtual();
  const conteudo = h("div", {});

  if (ROTAS_DE_TI.has(caminho) && !ehAgente(perfil)) {
    return semAcesso(conteudo, "papel");
  }

  // Telas de detalhe (`chamado`, `demanda`) não são abas e ficam de fora:
  // quem chega nelas veio de um link ou de uma notificação, e barrar aí
  if (ABAS.has(caminho) && !abaVisivel(perfil, caminho)) {
    return semAcesso(conteudo, "setor");
  }

  switch (caminho) {
    case "abrir":
      renderizarAbrir(conteudo, perfil);
      return {
        titulo: "Abrir chamado",
        subtitulo:
          "Escolha o serviço e descreva o que houve. A prioridade é calculada a partir das suas respostas.",
        conteudo,
      };

    case "meus":
      renderizarMeus(conteudo, perfil);
      return {
        titulo: "Meus chamados",
        subtitulo: "Tudo que você abriu, com o prazo de cada um.",
        conteudo,
      };

    case "chamado":
      if (!parametro) {
        navegar("fila");
        return { titulo: "Chamado", conteudo };
      }
      renderizarChamado(conteudo, perfil, parametro);
      return { titulo: "Detalhe do chamado", conteudo };

    case "demandas":
      renderizarDemandas(conteudo, perfil);
      return {
        titulo: "Quadro de demandas",
        subtitulo:
          "Registre uma melhoria ou escolha uma demanda disponível — ao pegar, você assume o prazo.",
        conteudo,
      };

    case "demanda":
      if (!parametro) {
        navegar("demandas");
        return { titulo: "Demanda", conteudo };
      }
      renderizarDemanda(conteudo, perfil, parametro);
      return { titulo: "Detalhe da demanda", conteudo };

    case "pessoas":
      renderizarPessoas(conteudo, perfil);
      return {
        titulo: "Pessoas",
        subtitulo:
          "Coordenação, gestão e colaboradores. Coordenador altera qualquer nível; gestor altera colaboradores.",
        conteudo,
      };

    case "conversas":
      renderizarConversas(conteudo, perfil);
      return {
        titulo: "Conversas",
        subtitulo:
          "Um canal por equipe, mais o geral. As mensagens chegam em tempo real enquanto esta tela estiver aberta.",
        conteudo,
      };

    case "mapa":
      renderizarMapa(conteudo);
      return {
        titulo: "Mapa da empresa",
        subtitulo:
          "O Cliente é o sol; cada área é um planeta na sua órbita, e as equipes dela são satélites. Arraste para girar, role para mudar de lado.",
        conteudo,
      };

    case "setores":
      renderizarSetores(conteudo, perfil);
      return {
        titulo: "Setores",
        subtitulo:
          "A estrutura da empresa. Setor é quem pede; equipe é a fila de TI que atende.",
        conteudo,
      };

    case "ativos":
      renderizarAtivos(conteudo, perfil);
      return {
        titulo: "Ativos (CMDB)",
        subtitulo:
          "A coluna “sem conferir” é a que decide se este inventário presta — registro que ninguém confere vira ficção.",
        conteudo,
      };

    case "rotinas":
      renderizarRotinas(conteudo, perfil);
      return {
        titulo: "Rotinas preventivas",
        subtitulo:
          "Passo com falha abre incidente ao encerrar a execução — a rotina não termina “com ressalva”.",
        conteudo,
      };

    case "conhecimento":
      renderizarConhecimento(conteudo, perfil);
      return {
        titulo: "Base de conhecimento",
        subtitulo:
          "Artigo ensina o que funciona; erro conhecido documenta o que está quebrado e ainda não tem correção.",
        conteudo,
      };

    // Fora de ROTAS_DE_TI de propósito: post-mortem publicado é documento de
    // aprendizado, e quem sofreu o incidente tem mais motivo que ninguém para
    // ler. O RLS já esconde rascunho de terceiro.
    case "postmortems":
      renderizarPostMortems(conteudo, perfil);
      return {
        titulo: "Post-mortems",
        subtitulo:
          "O que aconteceu, por que aconteceu e o que muda para não repetir.",
        conteudo,
      };

    case "postmortem":
      if (!parametro) {
        navegar("postmortems");
        return { titulo: "Post-mortem", conteudo };
      }
      renderizarPostMortem(conteudo, perfil, parametro);
      return { titulo: "Post-mortem", conteudo };

    case "tempos":
      renderizarTempos(conteudo, perfil);
      return {
        titulo: "Tempos de atendimento",
        subtitulo:
          "Quanto o chamado espera antes de alguém tocar nele, e quanto leva até fechar.",
        conteudo,
      };

    case "painel":
      renderizarPainel(conteudo);
      return {
        titulo: "Painel de governança",
        subtitulo:
          "Cada indicador aparece ao lado da meta que deveria atingir, e pintado pela distância até ela.",
        conteudo,
      };

    case "observabilidade":
      renderizarObservabilidade(conteudo, perfil);
      return {
        titulo: "Observabilidade de APIs",
        subtitulo:
          "Chamadas reais deste app ao Supabase. Topologia em estrela de propósito — sem agente do lado do servidor, esta é a origem observável.",
        conteudo,
      };

    case "gantt":
      renderizarGantt(conteudo, perfil);
      return {
        titulo: "Cronograma",
        subtitulo:
          "Quando a coluna de hoje passa à frente do preenchimento da barra, o trabalho está atrasado em relação ao prazo.",
        conteudo,
      };

    case "fila":
    default:
      // Duas razões levam ao portal: não ser da equipe, ou o setor não
      // incluir a fila no menu.
      if (!ehAgente(perfil) || !abaVisivel(perfil, "fila")) {
        renderizarMeus(conteudo, perfil);
        return {
          titulo: "Meus chamados",
          subtitulo: "Tudo que você abriu, com o prazo de cada um.",
          conteudo,
        };
      }
      renderizarFila(conteudo, perfil);
      return {
        titulo: "Fila de atendimento",
        subtitulo:
          "Ordenada por prioridade e prazo mais próximo — puxe o trabalho de cima para baixo.",
        conteudo,
      };
  }
}

/** Tela mostrada quando a rota existe mas não é para este perfil. */
function semAcesso(conteudo: HTMLElement, motivo: "papel" | "setor"): Pagina {
  montar(
    conteudo,
    h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "vazio" },
        h(
          "h3",
          {},
          motivo === "papel"
            ? "Esta área é da equipe de TI"
            : "Esta aba não faz parte do seu setor",
        ),
        h(
          "p",
          {},
          motivo === "papel"
            ? "Seu perfil não tem acesso a esta tela. Se você precisa dela para o seu trabalho, peça a um coordenador para ajustar seu papel na tela Pessoas."
            : "O menu do seu setor não inclui esta tela. Se ela for necessária para o seu trabalho, peça a um coordenador para acrescentá-la na configuração do setor.",
        ),
        h(
          "button",
          {
            class: "btn btn--primario",
            type: "button",
            on: { click: () => navegar("meus") },
          },
          "Ir para meus chamados",
        ),
      ),
    ),
  );

  return { titulo: "Acesso restrito", conteudo };
}

/**
 * Por que não há perfil.
 *
 * Preenchido, a tela mostra o motivo e um botão de tentar de novo. Sem isto,
 * uma falha de rede era indistinguível de "você não está logado" — e a pessoa
 * caía na tela de acesso já estando autenticada.
 */
let falhaSessao: string | null = null;

/**
 * Sessão aberta por link de recuperação.
 *
 * Ela autentica, mas só serve para trocar a senha — deixar entrar no sistema
 * com um token de recuperação pularia a senha inteira.
 */
let trocandoSenha = false;

function telaIndisponivel(motivo: string): HTMLElement {
  return h(
    "div",
    { class: "auth" },
    h(
      "div",
      { class: "vazio", style: "min-height:100vh;place-content:center" },
      h("h3", {}, "Não deu para carregar sua sessão"),
      h("p", {}, motivo),
      h(
        "div",
        { class: "linha-flex", style: "justify-content:center;gap:8px" },
        h(
          "button",
          {
            class: "btn btn--primario",
            type: "button",
            on: { click: () => location.reload() },
          },
          "Tentar de novo",
        ),
        h(
          "button",
          {
            class: "btn",
            type: "button",
            on: {
              click: () => {
                void sair().finally(() => location.reload());
              },
            },
          },
          "Entrar com outra conta",
        ),
      ),
    ),
  );
}

function desenharApp(): void {
  if (!raiz) return;

  // Diálogo aberto não deve sobreviver a uma troca de tela.
  fecharDialogos();

  if (trocandoSenha) {
    raiz.removeAttribute("aria-busy");
    pararFundoPontilhado();
    renderizarNovaSenha(raiz, () => {
      trocandoSenha = false;
      perfilAtual = null;
      // Limpa `?recuperacao=1` da barra: deixá-lo faria a tela de senha
      // reaparecer a cada recarregamento, já sem token para usar.
      history.replaceState(null, "", location.pathname);
      void sair().finally(desenharApp);
    });
    return;
  }

  // Falha de carga não é ausência de sessão: quem está logado não pode cair
  // na tela de acesso por causa de um segundo de rede ruim.
  if (!perfilAtual && falhaSessao) {
    raiz.removeAttribute("aria-busy");
    montar(raiz, telaIndisponivel(falhaSessao));
    return;
  }

  if (!perfilAtual) {
    raiz.removeAttribute("aria-busy");
    renderizarLogin(raiz, (perfil) => {
      perfilAtual = perfil;
      // O catálogo só é legível depois do login: a policy
      // `catalogo_leitura` exige sessão autenticada.
      void carregarCatalogo()
        .catch((e: unknown) => {
          avisar(
            e instanceof Error ? e.message : "Falha ao carregar o catálogo.",
            "erro",
          );
        })
        .finally(() => {
          if (!location.hash) navegar(ehAgente(perfil) ? "fila" : "meus");
          desenharApp();
        });
    });
    return;
  }

  // Autenticado: a malha da tela de acesso não precisa mais rodar.
  pararFundoPontilhado();

  const pagina = resolverPagina(perfilAtual);

  montar(
    raiz,
    renderizarShell({
      perfil: perfilAtual,
      titulo: pagina.titulo,
      ...(pagina.subtitulo ? { subtitulo: pagina.subtitulo } : {}),
      conteudo: pagina.conteudo,
      aoSair: () => {
        sairDaPresenca();
        pararNotificacoes();
        zerarNaoLidos();
        perfilAtual = null;
        location.hash = "";
        desenharApp();
      },
    }),
  );
  raiz.removeAttribute("aria-busy");
}

aplicarTemaSalvo();

// Sentinela antes de qualquer desenho: os detectores precisam estar de pé
// para ver a primeira mutação de DOM. Sem sessão os eventos são descartados
// na entrada da fila, então chamar aqui não vaza nada de visitante anônimo.
iniciarSentinela();

aoMudarRota(desenharApp);

// O link do e-mail abre uma sessão de recuperação; a tela vira a de senha
// nova, e o `hash` #/nova-senha cobre o caso de o evento chegar antes.
aoEntrarPorRecuperacao(() => {
  trocandoSenha = true;
  desenharApp();
});

// Deteta pelo parâmetro, não pelo evento: assim não depende de o
// `onAuthStateChange` chegar antes do primeiro desenho.
if (new URLSearchParams(location.search).has("recuperacao")) {
  trocandoSenha = true;
}

// Sessão encerrada em outra aba, ou token revogado: a tela acompanha.
aoMudarSessao((idNaSessao) => {
  if (idNaSessao === null) {
    sairDaPresenca();
    pararNotificacoes();
    zerarNaoLidos();
    perfilAtual = null;
    falhaSessao = null;
    location.hash = "";
    desenharApp();
    return;
  }

  // Sem perfil em mãos ainda: o arranque está em curso e vai resolver. Sem
  // esta guarda o evento inicial não casaria com nada e recarregaria a página
  // em laço — `onAuthStateChange` dispara antes de `obterSessao` responder.
  if (!perfilAtual) return;

  // Mesma pessoa: nada a fazer. Renovação de token cai aqui a cada hora.
  if (perfilAtual.id === idNaSessao) return;

  // Trocou de dono, com perfil anterior carregado. Recarregar é o único
  // caminho seguro: há estado de tela espalhado — canal aberto, listas,
  // presença — e remendar peça por peça deixaria resquício da conta anterior.
  location.reload();
});

void obterSessao()
  .then(async (estado) => {
    falhaSessao = null;

    switch (estado.tipo) {
      case "autenticado":
        perfilAtual = estado.perfil;
        // "Online" é ter a Central Green aberta, não estar na tela de
        // conversas: quem está num chamado também está disponível.
        entrarNaPresenca(estado.perfil.id);
        // Menção e atribuição avisam em qualquer tela, não só no chat.
        escutarNotificacoes(estado.perfil.id);
        iniciarMarcador();
        // Catálogo é conteúdo, não credencial: falhar aqui avisa, não desloga.
        await carregarCatalogo().catch((e: unknown) => {
          avisar(
            e instanceof Error ? e.message : "Falha ao carregar o catálogo.",
            "erro",
          );
        });
        break;

      case "sem_perfil":
        falhaSessao = `A conta ${estado.email} entrou, mas não tem perfil vinculado na Central Green. Fale com o coordenador.`;
        break;

      case "indisponivel":
        falhaSessao = estado.motivo;
        break;

      default:
        perfilAtual = null;
    }
  })
  .catch((e: unknown) => {
    perfilAtual = null;
    falhaSessao =
      e instanceof Error ? e.message : "Não foi possível falar com o servidor.";
  })
  .finally(desenharApp);
