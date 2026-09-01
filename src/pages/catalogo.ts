/**
 * Catálogo de serviços — o cadastro que decide fila, prazo e formulário.
 *
 * Até aqui o catálogo era configuração que só existia no banco: doze serviços
 * inseridos por migration, editáveis por SQL. Isso funciona enquanto ninguém
 * precisa de um serviço novo — e para de funcionar no dia em que precisa,
 * porque `catalogo_servicos` é o que define a fila do chamado, o prazo de SLA
 * e a prioridade padrão. Serviço faltando é chamado que não pode ser aberto.
 *
 * A tela mostra de propósito duas colunas que um cadastro comum esconderia:
 * a prioridade que o serviço vai produzir (impacto × urgência já resolvidos) e
 * quantos chamados ele já gerou. A primeira porque ninguém consegue prever a
 * matriz de cabeça; a segunda porque serviço com zero uso depois de meses é
 * ou nome errado ou fila errada, e isso só aparece quando está na lista.
 */

import { criarBarraFiltros } from "@/components/barra-filtros";
import { criarTabelaDados } from "@/components/tabela-dados";
import { aguardando } from "@/components/esqueleto";
import { avisar, h, icone, ICONES, montar } from "@/lib/dom";
import { confirmar } from "@/components/dialogo";
import { dataCurta } from "@/lib/formato";
import { listarEquipes } from "@/lib/api";
import {
  alternarServico,
  atualizarServico,
  criarServico,
  listarPoliticasSla,
  listarServicosAdmin,
  normalizarCodigo,
  type PoliticaSlaCadastrada,
} from "@/lib/catalogo";
import { calcularPrioridade, formatarDuracao } from "@/lib/prioridade";
import type {
  Equipe,
  Impacto,
  Perfil,
  RascunhoServico,
  ServicoAdmin,
  TipoChamado,
  Urgencia,
} from "@/types/dominio";

const ROTULOS_IMPACTO: Record<Impacto, string> = {
  alto: "Alto — vários setores",
  medio: "Médio — uma equipe",
  baixo: "Baixo — uma pessoa",
};

const ROTULOS_URGENCIA: Record<Urgencia, string> = {
  alta: "Alta — trabalho parado",
  media: "Média — com dificuldade",
  baixa: "Baixa — segue normalmente",
};

const ROTULOS_TIPO: Record<TipoChamado, string> = {
  incidente: "Incidente",
  requisicao: "Requisição",
};

export function renderizarCatalogo(alvo: HTMLElement, perfil: Perfil): void {
  // A escrita mora na policy `catalogo_escrita` (`sou_gestor()`). A tela
  // apenas deixa de oferecer o que o banco vai recusar — quem não é gestor vê
  // o catálogo inteiro em leitura, que é informação útil para atender.
  const podeEditar = perfil.papel === "gestor" || perfil.papel === "admin";

  let formAberto = false;
  let servicoAberto: string | null = null;
  let equipes: Equipe[] = [];
  let politicas: PoliticaSlaCadastrada[] = [];

  const area = h("div", { class: "pilha" });
  montar(alvo, area);

  const barra = criarBarraFiltros({
    aoMudar: () => desenhar(),
    filtros: [
      {
        chave: "situacao",
        rotulo: "Situação",
        tipo: "opcoes",
        opcoes: [
          { valor: "ativos", texto: "Ativos" },
          { valor: "inativos", texto: "Inativos" },
          { valor: "ocultos", texto: "Fora do portal" },
          { valor: "sem_uso", texto: "Sem uso" },
        ],
        padrao: "ativos",
      },
    ],
  });

  const desenhar = (): void => {
    aguardando(area, "tabela");
    void Promise.all([
      listarServicosAdmin(),
      equipes.length > 0 ? Promise.resolve(equipes) : listarEquipes(),
      politicas.length > 0 ? Promise.resolve(politicas) : listarPoliticasSla(),
    ])
      .then(([servicos, listaEquipes, listaPoliticas]) => {
        equipes = listaEquipes;
        politicas = listaPoliticas;

        montar(
          area,
          metricas(servicos),
          controles(),
          formAberto ? formNovoServico() : null,
          tabela(recortar(servicos)),
          servicoAberto
            ? ficha(servicos.find((s) => s.id === servicoAberto))
            : null,
        );
      })
      .catch((e: unknown) =>
        avisar(e instanceof Error ? e.message : "Falha ao carregar.", "erro"),
      );
  };

  /** O recorte da barra. "Ativos" é o padrão porque é o catálogo em uso. */
  const recortar = (servicos: ServicoAdmin[]): ServicoAdmin[] => {
    switch (barra.opcao("situacao")) {
      case "inativos":
        return servicos.filter((s) => !s.ativo);
      case "ocultos":
        return servicos.filter((s) => s.ativo && !s.visivel_portal);
      case "sem_uso":
        return servicos.filter((s) => s.chamados === 0);
      case "ativos":
        return servicos.filter((s) => s.ativo);
      default:
        return servicos;
    }
  };

  /* ---------- Cabeçalho ---------- */

  const metricas = (servicos: ServicoAdmin[]): HTMLElement => {
    const ativos = servicos.filter((s) => s.ativo);
    const noPortal = ativos.filter((s) => s.visivel_portal).length;
    const semFila = ativos.filter((s) => s.equipe_padrao_id === null).length;
    const semUso = servicos.filter((s) => s.chamados === 0).length;

    const cartao = (
      rotulo: string,
      valor: string,
      nota: string,
      variante = "",
    ): HTMLElement =>
      h(
        "div",
        { class: `metrica${variante ? ` metrica--${variante}` : ""}` },
        h("div", { class: "metrica__rotulo" }, rotulo),
        h("div", { class: "metrica__valor" }, valor),
        h("div", { class: "metrica__nota" }, nota),
      );

    return h(
      "div",
      { class: "grade-metricas" },
      cartao("Serviços ativos", String(ativos.length), "no catálogo"),
      cartao(
        "Visíveis no portal",
        String(noPortal),
        "aparecem para o solicitante",
      ),
      // Serviço ativo sem fila cai no chamado sem equipe, que fica sem
      // ninguém. É a métrica que precisa ser zero.
      cartao(
        "Sem fila padrão",
        String(semFila),
        "chamado nasceria sem equipe",
        semFila > 0 ? "critica" : "ok",
      ),
      cartao("Sem uso", String(semUso), "nunca geraram chamado"),
    );
  };

  const controles = (): HTMLElement =>
    h(
      "div",
      { class: "grade-filtros" },
      barra.elemento,
      podeEditar
        ? h(
            "button",
            {
              class: "btn btn--primario empurra",
              type: "button",
              on: {
                click: () => {
                  formAberto = !formAberto;
                  desenhar();
                },
              },
            },
            formAberto ? "Cancelar" : "Novo serviço",
          )
        : h(
            "span",
            { class: "texto-sutil empurra" },
            "Somente gestor edita o catálogo.",
          ),
    );

  /* ---------- Lista ---------- */

  const tabela = (servicos: ServicoAdmin[]): HTMLElement => {
    const grade = criarTabelaDados<ServicoAdmin>({
      rotulo: "Serviços do catálogo",
      busca: "Buscar por nome, código ou categoria",
      porPagina: 25,
      densidade: "compacta",
      linhas: servicos,
      vazio: {
        titulo: "Nenhum serviço neste recorte",
        texto:
          "Troque a situação na barra de filtros ou cadastre um serviço novo.",
      },
      aoClicarLinha: (s) => {
        servicoAberto = servicoAberto === s.id ? null : s.id;
        desenhar();
      },
      colunas: [
        { chave: "codigo", titulo: "Código", valor: (s) => s.codigo, tecnica: true },
        {
          chave: "nome",
          titulo: "Serviço",
          valor: (s) => `${s.nome} ${s.categoria} ${s.subcategoria}`,
          celula: (s) =>
            h(
              "div",
              {},
              h("span", { class: "tabela__titulo" }, s.nome),
              h(
                "span",
                { class: "tabela__meta" },
                `${s.categoria} › ${s.subcategoria}`,
              ),
            ),
        },
        {
          chave: "tipo",
          titulo: "Tipo",
          valor: (s) => ROTULOS_TIPO[s.tipo],
        },
        {
          chave: "fila",
          titulo: "Fila padrão",
          valor: (s) => s.equipe_nome ?? "",
          celula: (s) =>
            s.equipe_nome
              ? h("span", {}, s.equipe_nome)
              : h("span", { class: "tag tag--critica" }, "sem fila"),
        },
        {
          // A prioridade não está no banco: é a matriz aplicada ao par padrão
          // do serviço. Mostrar aqui é o que deixa "impacto médio + urgência
          // alta" parar de ser abstração.
          chave: "prioridade",
          titulo: "Prioridade",
          valor: (s) => calcularPrioridade(s.impacto_padrao, s.urgencia_padrao),
          celula: (s) => {
            const p = calcularPrioridade(s.impacto_padrao, s.urgencia_padrao);
            return h("span", { class: `pri pri--${p}` }, p);
          },
        },
        {
          chave: "chamados",
          titulo: "Chamados",
          valor: (s) => s.chamados,
          alinhamento: "fim",
          celula: (s) =>
            s.chamados === 0
              ? h("span", { class: "texto-sutil" }, "—")
              : h("span", { class: "mono" }, String(s.chamados)),
        },
        {
          chave: "situacao",
          titulo: "Situação",
          valor: (s) => (s.ativo ? (s.visivel_portal ? "ativo" : "oculto") : "inativo"),
          celula: (s) =>
            h(
              "div",
              { class: "linha-flex" },
              s.ativo
                ? null
                : h("span", { class: "tag" }, "inativo"),
              s.ativo && !s.visivel_portal
                ? h("span", { class: "tag tag--alta" }, "fora do portal")
                : null,
              s.exige_aprovacao
                ? h("span", { class: "tag" }, "exige aprovação")
                : null,
              s.exige_ativo ? h("span", { class: "tag" }, "exige ativo") : null,
            ),
        },
      ],
    });

    return grade.elemento;
  };

  /* ---------- Ficha do serviço ---------- */

  const ficha = (s: ServicoAdmin | undefined): HTMLElement | null => {
    if (!s) return null;

    const politica = politicas.find((p) => p.id === s.sla_politica_id);
    const prioridade = calcularPrioridade(s.impacto_padrao, s.urgencia_padrao);

    const linha = (rotulo: string, valor: string): HTMLElement =>
      h(
        "div",
        { class: "campo" },
        h("span", { class: "campo__rotulo" }, rotulo),
        h("span", {}, valor),
      );

    return h(
      "div",
      { class: "cartao" },
      h(
        "div",
        { class: "linha-flex" },
        h("h3", { style: "margin:0" }, `${s.codigo} — ${s.nome}`),
        h("span", { class: `pri pri--${prioridade}` }, prioridade),
        h("span", { class: "empurra" }),
        // `size="icon-md" shape="pill"` do DS: o × dispensa rótulo, e no canto
        // de uma ficha o botão redondo é o desenho que o DS dá para "fechar".
        h(
          "button",
          {
            class: "btn btn--sutil btn--icone btn--pilula btn--sm",
            type: "button",
            aria: { label: "Fechar a ficha do serviço" },
            title: "Fechar",
            on: {
              click: () => {
                servicoAberto = null;
                desenhar();
              },
            },
          },
          icone(ICONES.fechar),
        ),
      ),
      h("p", { class: "texto-sutil" }, s.descricao),
      h(
        "div",
        { class: "grade-campos" },
        linha("Tipo", ROTULOS_TIPO[s.tipo]),
        linha("Categoria", `${s.categoria} › ${s.subcategoria}`),
        linha("Fila padrão", s.equipe_nome ?? "sem fila"),
        linha(
          "Política de SLA",
          politica
            ? `${politica.nome} — solução em ${formatarDuracao(politica.minutos_solucao)}`
            : "não encontrada",
        ),
        linha("Impacto padrão", ROTULOS_IMPACTO[s.impacto_padrao]),
        linha("Urgência padrão", ROTULOS_URGENCIA[s.urgencia_padrao]),
        linha("Chamados abertos", String(s.chamados)),
        linha("Cadastrado em", dataCurta(s.criado_em)),
      ),
      podeEditar ? editor(s) : null,
    );
  };

  /**
   * Edição do que muda a governança do serviço.
   *
   * Código fica de fora: ele é a chave lida por gente em relatório e, em pelo
   * menos um caso (`fn_falha_rotina_abre_incidente`), procurada pelo nome
   * dentro do banco. Renomear o código quebraria o vínculo em silêncio — para
   * trocar de código, cadastre outro serviço e desative este.
   */
  const editor = (s: ServicoAdmin): HTMLElement => {
    const selecao = <T extends string>(
      rotulo: string,
      valorAtual: T,
      opcoes: Array<{ valor: T; texto: string }>,
      aoMudar: (v: T) => void,
    ): HTMLElement => {
      const sel = h(
        "select",
        {
          class: "selecao",
          on: {
            change: (ev: Event) => aoMudar((ev.target as HTMLSelectElement).value as T),
          },
        },
        ...opcoes.map((o) => h("option", { value: o.valor }, o.texto)),
      ) as HTMLSelectElement;
      sel.value = valorAtual;
      return h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        sel,
      );
    };

    const pendente: Parameters<typeof atualizarServico>[1] = {};

    const salvar = (): void => {
      if (Object.keys(pendente).length === 0) {
        return avisar("Nada mudou.", "info");
      }
      void atualizarServico(s.id, pendente)
        .then(() => {
          avisar("Serviço atualizado. O formulário de abertura já reflete.", "ok");
          desenhar();
        })
        .catch((e: unknown) =>
          avisar(e instanceof Error ? e.message : "Falha.", "erro"),
        );
    };

    const marcar = (
      rotulo: string,
      ajuda: string,
      atual: boolean,
      aoMudar: (v: boolean) => void,
    ): HTMLElement =>
      h(
        "label",
        { class: "escolha" },
        h("input", {
          type: "checkbox",
          checked: atual,
          on: {
            change: (ev: Event) =>
              aoMudar((ev.target as HTMLInputElement).checked),
          },
        }),
        h(
          "span",
          {},
          h("span", { class: "escolha__titulo" }, rotulo),
          h("span", { class: "campo__ajuda" }, ajuda),
        ),
      );

    return h(
      "div",
      { class: "pilha", style: "margin-top:var(--s-4)" },
      h("h4", { style: "margin:0" }, "Editar governança do serviço"),
      h(
        "div",
        { class: "grade-campos" },
        selecao<TipoChamado>(
          "Tipo",
          s.tipo,
          (Object.keys(ROTULOS_TIPO) as TipoChamado[]).map((t) => ({
            valor: t,
            texto: ROTULOS_TIPO[t],
          })),
          (v) => {
            pendente.tipo = v;
          },
        ),
        selecao<string>(
          "Fila padrão",
          s.equipe_padrao_id ?? "",
          [
            { valor: "", texto: "Sem fila" },
            ...equipes.map((e) => ({ valor: e.id, texto: e.nome })),
          ],
          (v) => {
            pendente.equipe_padrao_id = v || null;
          },
        ),
        selecao<string>(
          "Política de SLA",
          s.sla_politica_id,
          politicas.map((p) => ({
            valor: p.id,
            texto: `${p.prioridade} — ${p.nome}`,
          })),
          (v) => {
            pendente.sla_politica_id = v;
          },
        ),
        selecao<Impacto>(
          "Impacto padrão",
          s.impacto_padrao,
          (Object.keys(ROTULOS_IMPACTO) as Impacto[]).map((i) => ({
            valor: i,
            texto: ROTULOS_IMPACTO[i],
          })),
          (v) => {
            pendente.impacto_padrao = v;
          },
        ),
        selecao<Urgencia>(
          "Urgência padrão",
          s.urgencia_padrao,
          (Object.keys(ROTULOS_URGENCIA) as Urgencia[]).map((u) => ({
            valor: u,
            texto: ROTULOS_URGENCIA[u],
          })),
          (v) => {
            pendente.urgencia_padrao = v;
          },
        ),
      ),
      marcar(
        "Visível no portal",
        "Desmarcado, o serviço só é usado por quem atende — some da tela de abertura.",
        s.visivel_portal,
        (v) => {
          pendente.visivel_portal = v;
        },
      ),
      marcar(
        "Exige ativo",
        "O chamado deste serviço tem de apontar um item do CMDB.",
        s.exige_ativo,
        (v) => {
          pendente.exige_ativo = v;
        },
      ),
      marcar(
        "Exige aprovação",
        "Requisição que passa por aprovação antes de virar trabalho.",
        s.exige_aprovacao,
        (v) => {
          pendente.exige_aprovacao = v;
        },
      ),
      h(
        "div",
        { class: "linha-flex" },
        h(
          "button",
          {
            class: "btn btn--primario btn--sm",
            type: "button",
            on: { click: salvar },
          },
          "Salvar alterações",
        ),
        h(
          "button",
          {
            class: "btn btn--sm",
            type: "button",
            on: {
              click: () => {
                void confirmar({
                  titulo: s.ativo ? "Desativar serviço" : "Reativar serviço",
                  texto: `${s.codigo} — ${s.nome}`,
                  consequencia: s.ativo
                    ? `Sai do formulário de abertura. Os ${s.chamados} chamado(s) já abertos continuam apontando para ele.`
                    : "Volta a aparecer no formulário de abertura.",
                  rotuloConfirmar: s.ativo ? "Desativar" : "Reativar",
                })
                  .then((ok) => {
                    if (!ok) return;
                    return alternarServico(s.id, !s.ativo).then(() => {
                      avisar(
                        s.ativo ? "Serviço desativado." : "Serviço reativado.",
                        "ok",
                      );
                      desenhar();
                    });
                  })
                  .catch((e: unknown) =>
                    avisar(e instanceof Error ? e.message : "Falha.", "erro"),
                  );
              },
            },
          },
          s.ativo ? "Desativar" : "Reativar",
        ),
      ),
    );
  };

  /* ---------- Cadastro ---------- */

  const formNovoServico = (): HTMLElement => {
    const rascunho: RascunhoServico = {
      codigo: "",
      nome: "",
      descricao: "",
      tipo: "requisicao",
      categoria: "",
      subcategoria: "",
      equipe_padrao_id: "",
      sla_politica_id: politicas.find((p) => p.prioridade === "P4")?.id ?? "",
      impacto_padrao: "baixo",
      urgencia_padrao: "baixa",
      exige_ativo: false,
      exige_aprovacao: false,
      visivel_portal: true,
    };

    // O código sai do nome enquanto ninguém o digita à mão, e para de seguir
    // no primeiro toque no campo: sugestão que sobrescreve o que a pessoa
    // escreveu é pior que nenhuma.
    let codigoTocado = false;
    const campoCodigo = h("input", {
      class: "entrada mono",
      type: "text",
      placeholder: "INF-SERVIDOR-INDISPONIVEL",
      on: {
        input: (ev: Event) => {
          codigoTocado = true;
          rascunho.codigo = (ev.target as HTMLInputElement).value;
        },
      },
    }) as HTMLInputElement;

    const previa = h("span", { class: "campo__ajuda" });

    const atualizarPrevia = (): void => {
      const p = calcularPrioridade(
        rascunho.impacto_padrao,
        rascunho.urgencia_padrao,
      );
      const politica = politicas.find((x) => x.id === rascunho.sla_politica_id);
      montar(
        previa,
        h(
          "span",
          {},
          `Chamado deste serviço nasce em ${p}`,
          politica
            ? ` com prazo de solução de ${formatarDuracao(politica.minutos_solucao)}.`
            : ".",
        ),
      );
    };

    const campoTexto = (
      rotulo: string,
      chave: "nome" | "categoria" | "subcategoria",
      placeholder: string,
    ): HTMLElement =>
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        h("input", {
          class: "entrada",
          type: "text",
          placeholder,
          on: {
            input: (ev: Event) => {
              rascunho[chave] = (ev.target as HTMLInputElement).value;
              if (chave === "nome" && !codigoTocado) {
                rascunho.codigo = rascunho.nome;
                campoCodigo.value = normalizarCodigo(rascunho.nome);
              }
            },
          },
        }),
      );

    const selecao = <T extends string>(
      rotulo: string,
      padrao: T,
      opcoes: Array<{ valor: T; texto: string }>,
      aoMudar: (v: T) => void,
    ): HTMLElement => {
      const sel = h(
        "select",
        {
          class: "selecao",
          on: {
            change: (ev: Event) => {
              aoMudar((ev.target as HTMLSelectElement).value as T);
              atualizarPrevia();
            },
          },
        },
        ...opcoes.map((o) => h("option", { value: o.valor }, o.texto)),
      ) as HTMLSelectElement;
      sel.value = padrao;
      return h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, rotulo),
        sel,
      );
    };

    const marcar = (
      rotulo: string,
      atual: boolean,
      aoMudar: (v: boolean) => void,
    ): HTMLElement =>
      h(
        "label",
        { class: "escolha" },
        h("input", {
          type: "checkbox",
          checked: atual,
          on: {
            change: (ev: Event) =>
              aoMudar((ev.target as HTMLInputElement).checked),
          },
        }),
        h("span", {}, h("span", { class: "escolha__titulo" }, rotulo)),
      );

    atualizarPrevia();

    return h(
      "form",
      {
        class: "cartao",
        on: {
          submit: (ev: Event) => {
            ev.preventDefault();

            if (rascunho.nome.trim().length < 3) {
              return avisar("Dê um nome ao serviço.", "erro");
            }
            if (!normalizarCodigo(campoCodigo.value || rascunho.codigo)) {
              return avisar("O código não pode ficar vazio.", "erro");
            }
            if (rascunho.descricao.trim().length < 10) {
              return avisar(
                "Descreva o serviço com ao menos 10 caracteres — é o texto que o solicitante lê para escolher.",
                "erro",
              );
            }
            if (!rascunho.categoria.trim() || !rascunho.subcategoria.trim()) {
              return avisar(
                "Categoria e subcategoria organizam o portal — preencha as duas.",
                "erro",
              );
            }
            if (!rascunho.sla_politica_id) {
              return avisar("Escolha a política de SLA.", "erro");
            }

            void criarServico({
              ...rascunho,
              codigo: campoCodigo.value || rascunho.codigo,
            })
              .then((s) => {
                avisar(`Serviço ${s.codigo} cadastrado.`, "ok");
                formAberto = false;
                servicoAberto = s.id;
                desenhar();
              })
              .catch((e: unknown) =>
                avisar(e instanceof Error ? e.message : "Falha.", "erro"),
              );
          },
        },
      },
      h("h3", { style: "margin-top:0" }, "Novo serviço de catálogo"),
      h(
        "p",
        { class: "texto-sutil" },
        "O serviço decide três coisas do chamado: em que fila ele cai, com que prazo, e com que prioridade nasce.",
      ),
      h(
        "div",
        { class: "grade-campos" },
        campoTexto("Nome", "nome", "Ex.: Servidor indisponível"),
        h(
          "div",
          { class: "campo" },
          h("label", { class: "campo__rotulo" }, "Código"),
          campoCodigo,
          h(
            "span",
            { class: "campo__ajuda" },
            "Maiúsculas e hífen. Não muda depois — é a chave lida em relatório.",
          ),
        ),
        campoTexto("Categoria", "categoria", "Ex.: Infraestrutura"),
        campoTexto("Subcategoria", "subcategoria", "Ex.: Servidores"),
        selecao<TipoChamado>(
          "Tipo",
          "requisicao",
          (Object.keys(ROTULOS_TIPO) as TipoChamado[]).map((t) => ({
            valor: t,
            texto: ROTULOS_TIPO[t],
          })),
          (v) => {
            rascunho.tipo = v;
          },
        ),
        selecao<string>(
          "Fila padrão",
          "",
          [
            { valor: "", texto: "Sem fila" },
            ...equipes.map((e) => ({ valor: e.id, texto: e.nome })),
          ],
          (v) => {
            rascunho.equipe_padrao_id = v;
          },
        ),
        selecao<string>(
          "Política de SLA",
          rascunho.sla_politica_id,
          politicas.map((p) => ({
            valor: p.id,
            texto: `${p.prioridade} — ${p.nome}`,
          })),
          (v) => {
            rascunho.sla_politica_id = v;
          },
        ),
        selecao<Impacto>(
          "Impacto padrão",
          "baixo",
          (Object.keys(ROTULOS_IMPACTO) as Impacto[]).map((i) => ({
            valor: i,
            texto: ROTULOS_IMPACTO[i],
          })),
          (v) => {
            rascunho.impacto_padrao = v;
          },
        ),
        selecao<Urgencia>(
          "Urgência padrão",
          "baixa",
          (Object.keys(ROTULOS_URGENCIA) as Urgencia[]).map((u) => ({
            valor: u,
            texto: ROTULOS_URGENCIA[u],
          })),
          (v) => {
            rascunho.urgencia_padrao = v;
          },
        ),
      ),
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo" }, "Descrição"),
        h("textarea", {
          class: "area-texto",
          placeholder:
            "O que este serviço cobre, na linguagem de quem vai pedir. É o texto que aparece no portal.",
          on: {
            input: (ev: Event) => {
              rascunho.descricao = (ev.target as HTMLTextAreaElement).value;
            },
          },
        }),
      ),
      previa,
      h(
        "div",
        { class: "linha-flex" },
        marcar("Visível no portal", true, (v) => {
          rascunho.visivel_portal = v;
        }),
        marcar("Exige ativo do CMDB", false, (v) => {
          rascunho.exige_ativo = v;
        }),
        marcar("Exige aprovação", false, (v) => {
          rascunho.exige_aprovacao = v;
        }),
      ),
      h(
        "button",
        { class: "btn btn--primario", type: "submit" },
        "Cadastrar serviço",
      ),
    );
  };

  desenhar();
}
