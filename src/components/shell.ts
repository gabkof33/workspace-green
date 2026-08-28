/** Shell da Central Green — navegação lateral, cabeçalho e notificações. */

import {
  avisar,
  h,
  icone,
  ICONES,
  montar,
  type MarcacaoEstatica,
} from "@/lib/dom";
import { navegar, rotaAtual } from "@/lib/router";
import { abaVisivel, ehAgente, podeGerirPessoas, sair } from "@/lib/api";
import {
  listarNotificacoes,
  marcarNotificacaoLida,
  marcarTodasLidas,
} from "@/lib/demandas";
import { tempoRelativo } from "@/lib/formato";
import { insigniaHierarquia, ROTULOS_SENIORIDADE } from "@/components/insignia";
import { gravar, ler, remover } from "@/lib/armazenamento";
import type { Notificacao, Perfil } from "@/types/dominio";

// Dois arquivos porque o menu muda de fundo com o tema: verde cheio no claro,
// escuro neutro no escuro. O CSS mostra um e esconde o outro.
const LOGOTIPO = "/igreen-g.png";
const LOGOTIPO_BRANCO = "/igreen-g-branco.png";

interface ItemNav {
  caminho: string;
  rotulo: string;
  icone: MarcacaoEstatica;
  somenteAgente?: boolean;
  somenteGestao?: boolean;
  emBreve?: boolean;
}

const NAV_ATENDIMENTO: ItemNav[] = [
  { caminho: "abrir", rotulo: "Abrir chamado", icone: ICONES.abrir },
  { caminho: "meus", rotulo: "Meus chamados", icone: ICONES.meus },
  {
    caminho: "fila",
    rotulo: "Fila de atendimento",
    icone: ICONES.fila,
    somenteAgente: true,
  },
];

const NAV_DEMANDAS: ItemNav[] = [
  { caminho: "demandas", rotulo: "Quadro de demandas", icone: ICONES.demandas },
  { caminho: "gantt", rotulo: "Cronograma", icone: ICONES.gantt },
];

const NAV_ORGANIZACAO: ItemNav[] = [
  { caminho: "conversas", rotulo: "Conversas", icone: ICONES.conversas },
  { caminho: "pessoas", rotulo: "Pessoas", icone: ICONES.pessoas },
  // A estrutura da empresa é ferramenta de TI e gestão, não do dia a dia de
  // quem só abre chamado.
  {
    caminho: "setores",
    rotulo: "Setores",
    icone: ICONES.setores,
    somenteAgente: true,
  },
  // Sem `somenteAgente`, ao contrário de Setores: o mapa não administra nada,
  // só explica quem faz o quê — e é justamente quem NÃO é da TI que precisa
  // disso para saber a quem endereçar um pedido.
  { caminho: "mapa", rotulo: "Mapa da empresa", icone: ICONES.mapa },
];

const NAV_OPERACAO: ItemNav[] = [
  {
    caminho: "rotinas",
    rotulo: "Rotinas preventivas",
    icone: ICONES.rotinas,
    somenteAgente: true,
  },
  {
    caminho: "ativos",
    rotulo: "Ativos (CMDB)",
    icone: ICONES.ativos,
    somenteAgente: true,
  },
  {
    caminho: "conhecimento",
    rotulo: "Base de conhecimento",
    icone: ICONES.conhecimento,
  },
  {
    caminho: "tempos",
    rotulo: "Tempos de atendimento",
    icone: ICONES.tempos,
    somenteAgente: true,
  },
  {
    caminho: "postmortems",
    rotulo: "Post-mortems",
    icone: ICONES.postmortem,
  },
  {
    caminho: "painel",
    rotulo: "Painel de governança",
    icone: ICONES.painel,
    somenteAgente: true,
  },
  {
    caminho: "observabilidade",
    rotulo: "Observabilidade de APIs",
    icone: ICONES.observabilidade,
    somenteAgente: true,
  },
];

function alternarTema(): void {
  const raiz = document.documentElement;
  const atual = raiz.getAttribute("data-tema");
  const escuroDoSistema = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  const proximo =
    atual === "escuro"
      ? "claro"
      : atual === "claro"
        ? "escuro"
        : escuroDoSistema
          ? "claro"
          : "escuro";

  raiz.setAttribute("data-tema", proximo);
  gravar("tema", proximo);
}

export function aplicarTemaSalvo(): void {
  const salvo = ler("tema");
  if (salvo) document.documentElement.setAttribute("data-tema", salvo);
}

function construirItem(item: ItemNav, ativo: boolean): HTMLElement {
  const botao = h(
    "button",
    {
      class: "rail__item",
      type: "button",
      disabled: item.emBreve,
      title: item.emBreve
        ? "Disponível nas próximas fases da implantação"
        : undefined,
      aria: ativo ? { current: "page" } : {},
      on: { click: () => navegar(item.caminho) },
    },
    icone(item.icone),
    item.rotulo,
  );

  if (item.emBreve) {
    botao.append(h("span", { class: "rail__contagem" }, "em breve"));
  }
  return botao;
}

/* Gavetas do menu */

/** Guarda só o que está **fechado**. */
function fechadas(): Set<string> {
  // Preferência corrompida não derruba o menu: `ler` valida e devolve null.
  return new Set(ler("menu-fechado") ?? []);
}

function gavetaAberta(rotulo: string): boolean {
  return !fechadas().has(rotulo);
}

function gravarGaveta(rotulo: string, aberto: boolean): void {
  const conjunto = fechadas();
  if (aberto) conjunto.delete(rotulo);
  else conjunto.add(rotulo);
  gravar("menu-fechado", [...conjunto]);
}

/* Gaveta do painel inteiro */

/** Guarda só o estado recolhido: ausente significa aberto, que é o padrão. */
function painelRecolhido(): boolean {
  return ler("menu-recolhido") === "1";
}

function gravarPainel(recolhido: boolean): void {
  if (recolhido) gravar("menu-recolhido", "1");
  else remover("menu-recolhido");
}

/* Sino de notificações */

/** `icone()` não define tamanho; sem classe o SVG nasce sem dimensão. */
function sinoIcone(): SVGSVGElement {
  const svg = icone(ICONES.sino);
  svg.classList.add("sino__icone");
  return svg;
}

function construirSino(perfil: Perfil): HTMLElement {
  const contador = h("span", {
    class: "sino__contador",
    style: "display:none",
  });
  const painel = h("div", { class: "painel-notif", style: "display:none" });

  const botao = h(
    "button",
    {
      class: "btn btn--sutil",
      type: "button",
      title: "Notificações",
      aria: { label: "Notificações" },
    },
    sinoIcone(),
    contador,
  );

  const container = h("div", { class: "sino" }, botao, painel);

  const desenharPainel = (lista: Notificacao[]): void => {
    if (lista.length === 0) {
      montar(
        painel,
        h(
          "div",
          { class: "vazio", style: "padding:var(--s-6) var(--s-4)" },
          h("h3", {}, "Sem notificações"),
          h(
            "p",
            {},
            "Você será avisado quando alguém mencionar você ou atribuir uma demanda ao seu nome.",
          ),
        ),
      );
      return;
    }

    const naoLidas = lista.filter((n) => !n.lida).length;

    montar(
      painel,
      naoLidas > 0
        ? h(
            "button",
            {
              class: "painel-notif__item",
              type: "button",
              style:
                "text-align:center;font-size:var(--t-sm);color:var(--c-accent)",
              on: {
                click: () => {
                  void marcarTodasLidas(perfil.id)
                    .then(atualizar)
                    .catch(() => avisar("Falha ao marcar como lidas.", "erro"));
                },
              },
            },
            `Marcar ${naoLidas} como lida${naoLidas > 1 ? "s" : ""}`,
          )
        : null,
      ...lista.map((n) =>
        h(
          "button",
          {
            class: `painel-notif__item${n.lida ? "" : " painel-notif__item--nova"}`,
            type: "button",
            on: {
              click: () => {
                void marcarNotificacaoLida(n.id).catch(() => {
                  // Falha ao marcar não deve impedir a navegação.
                });
                painel.style.display = "none";
                if (n.destino) navegar(n.destino);
              },
            },
          },
          h("span", { class: "painel-notif__titulo" }, n.titulo),
          h("span", { class: "painel-notif__corpo" }, n.corpo ?? ""),
          h("span", { class: "linha__quando" }, tempoRelativo(n.criado_em)),
        ),
      ),
    );
  };

  const atualizar = (): void => {
    void listarNotificacoes(perfil.id)
      .then((lista) => {
        const naoLidas = lista.filter((n) => !n.lida).length;
        contador.textContent = naoLidas > 9 ? "9+" : String(naoLidas);
        contador.style.display = naoLidas > 0 ? "grid" : "none";
        desenharPainel(lista);
      })
      .catch(() => {
        // Notificação é acessório: falha aqui não interrompe o app.
      });
  };

  botao.addEventListener("click", () => {
    const aberto = painel.style.display !== "none";
    painel.style.display = aberto ? "none" : "block";
    if (!aberto) atualizar();
  });

  document.addEventListener("click", (ev) => {
    if (!container.contains(ev.target as Node)) {
      painel.style.display = "none";
    }
  });

  atualizar();
  return container;
}

/* Shell */

export interface OpcoesShell {
  perfil: Perfil;
  titulo: string;
  subtitulo?: string;
  acoes?: HTMLElement[];
  conteudo: HTMLElement;
  aoSair: () => void;
}

export function renderizarShell(opcoes: OpcoesShell): HTMLElement {
  const { caminho } = rotaAtual();
  const agente = ehAgente(opcoes.perfil);

  const gestao = podeGerirPessoas(opcoes.perfil);

  const grupo = (rotulo: string, itens: ItemNav[]): HTMLElement | null => {
    const visiveis = itens
      // Primeiro o papel, que é permissão de verdade…
      .filter((i) => !i.somenteAgente || agente)
      .filter((i) => !i.somenteGestao || gestao)
      // …depois o setor, que só reduz o que já era permitido.
      .filter((i) => abaVisivel(opcoes.perfil, i.caminho));
    if (visiveis.length === 0) return null;

    const temAtivo = visiveis.some((i) => i.caminho === caminho);
    let aberto = gavetaAberta(rotulo);

    const gaveta = h(
      "div",
      { class: "rail__gaveta" },
      ...visiveis.map((i) => construirItem(i, i.caminho === caminho)),
    );

    // Ponto no cabeçalho quando a gaveta fechada contém a página atual.
    const marca = h("span", {
      class: "rail__grupo-marca",
      title: "A página atual está neste grupo",
    });

    const seta = icone(ICONES.seta);
    seta.classList.add("rail__grupo-seta");

    const cabecalho = h(
      "button",
      {
        class: "rail__rotulo",
        type: "button",
        aria: { expanded: String(aberto) },
        on: {
          click: () => {
            aberto = !aberto;
            aplicar();
            gravarGaveta(rotulo, aberto);
          },
        },
      },
      h("span", {}, rotulo),
      temAtivo ? marca : null,
      seta,
    );

    const bloco = h("div", { class: "rail__grupo" }, cabecalho, gaveta);

    const aplicar = (): void => {
      bloco.classList.toggle("rail__grupo--fechado", !aberto);
      cabecalho.setAttribute("aria-expanded", String(aberto));
    };
    aplicar();

    return bloco;
  };

  const rail = h(
    "aside",
    { class: "rail", id: "menu-lateral" },
    h(
      "div",
      { class: "rail__marca" },
      h("img", {
        class: "marca__g marca__g--claro",
        src: LOGOTIPO_BRANCO,
        alt: "",
        width: "21",
        height: "28",
      }),
      h("img", {
        class: "marca__g marca__g--escuro",
        src: LOGOTIPO,
        alt: "",
        width: "21",
        height: "28",
      }),
      h(
        "div",
        {},
        h("span", {}, "Central Green"),
        h("div", { class: "marca-auth__sub" }, "Operação de TI"),
      ),
    ),
    grupo("Atendimento", NAV_ATENDIMENTO),
    grupo("Demandas", NAV_DEMANDAS),
    grupo("Organização", NAV_ORGANIZACAO),
    grupo("Operação", NAV_OPERACAO),
    h(
      "div",
      { class: "rail__rodape" },
      h(
        "div",
        { class: "rail__usuario" },
        h(
          "div",
          { style: "min-width:0" },
          h(
            "div",
            { class: "rail__usuario-nome" },
            insigniaHierarquia(opcoes.perfil.hierarquia, {
              nome: opcoes.perfil.nome_completo,
              senioridade: opcoes.perfil.senioridade,
            }),
            " ",
            opcoes.perfil.nome_completo,
          ),
          h(
            "div",
            { class: "rail__usuario-papel" },
            opcoes.perfil.cargo ??
              ROTULOS_SENIORIDADE[opcoes.perfil.senioridade],
          ),
        ),
      ),
      h(
        "button",
        { class: "rail__item", type: "button", on: { click: alternarTema } },
        icone(ICONES.tema),
        "Alternar tema",
      ),
      h(
        "button",
        {
          class: "rail__item",
          type: "button",
          on: {
            click: () => {
              void sair()
                .then(opcoes.aoSair)
                .catch(() => avisar("Falha ao sair.", "erro"));
            },
          },
        },
        icone(ICONES.sair),
        "Sair",
      ),
    ),
  );

  // Vazia primeiro: o botão do topo precisa da casca para alternar a classe,
  // e a casca precisa do topo para existir.
  const casca = h("div", { class: "shell" });
  let recolhido = painelRecolhido();

  const botaoPainel = h("button", {
    class: "btn btn--sutil topo__gaveta",
    type: "button",
    aria: { label: "Menu lateral", controls: "menu-lateral" },
  });
  botaoPainel.append(icone(ICONES.lateral));

  const aplicarPainel = (): void => {
    casca.classList.toggle("shell--recolhido", recolhido);
    botaoPainel.setAttribute("aria-expanded", String(!recolhido));
    botaoPainel.title = recolhido ? "Mostrar menu" : "Recolher menu";
    // Recolhido, o menu sai do Tab e do leitor de tela: continuar navegável
    // enquanto invisível manda o foco para o nada.
    rail.toggleAttribute("inert", recolhido);
  };

  botaoPainel.addEventListener("click", () => {
    recolhido = !recolhido;
    aplicarPainel();
    gravarPainel(recolhido);
  });

  const topo = h(
    "header",
    { class: "topo" },
    botaoPainel,
    h(
      "div",
      { class: "topo__titulo" },
      h("h1", {}, opcoes.titulo),
      opcoes.subtitulo
        ? h("div", { class: "topo__sub" }, opcoes.subtitulo)
        : null,
    ),
    h(
      "div",
      { class: "topo__acoes" },
      ...(opcoes.acoes ?? []),
      construirSino(opcoes.perfil),
    ),
  );

  const principal = h(
    "div",
    { class: "principal" },
    topo,
    h("main", { class: "conteudo" }, opcoes.conteudo),
  );

  casca.append(rail, principal);
  aplicarPainel();
  revelarItemAtivo(rail);
  return casca;
}

/**
 * Traz o item da página atual para dentro da vista do menu.
 *
 * Mexe em `scrollTop` do painel e não em `scrollIntoView`: este último rola
 * também os ancestrais, e com o item abaixo da dobra ele arrastaria a página
 * inteira para baixo no carregamento.
 */
function revelarItemAtivo(rail: HTMLElement): void {
  // Depois de o painel entrar no documento: fora dele não há altura medida.
  requestAnimationFrame(() => {
    if (rail.scrollHeight <= rail.clientHeight) return;

    const ativo = rail.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ativo) return;

    const painel = rail.getBoundingClientRect();
    const item = ativo.getBoundingClientRect();
    const margem = Math.min(80, rail.clientHeight / 3);
    const acima = item.top < painel.top + margem;
    const abaixo = item.bottom > painel.bottom - margem;
    if (!acima && !abaixo) return;

    // Um terço da altura acima do item, não no topo: mostrar o rótulo do grupo
    // junto situa quem olha.
    rail.scrollBy({ top: item.top - painel.top - margem, behavior: "auto" });
  });
}
