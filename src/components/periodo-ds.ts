/**
 * Período — o `DatePicker mode="range"` do iGreen DS em DOM puro.
 *
 * No DS é react-day-picker dentro de um Popover:
 *
 *   <Calendar mode="range" min={1} numberOfMonths={2}
 *             selected={range} onSelect={setRange} />
 *
 * Aqui a grade é montada à mão, mas o CONTRATO é o mesmo, e é dele que o CSS
 * vive: `data-range-start`, `data-range-end`, `data-range-middle`,
 * `data-selected-single` e `data-hoje` — os mesmos atributos que o
 * `CalendarDayButton` do DS escreve. Aparência no `.ds-calendario`
 * (`ds-componentes.css`).
 *
 * Dois meses, como o default do DS para `range`: intervalo que atravessa a
 * virada do mês é o caso comum num filtro, e com um mês só ele exigiria
 * navegar no meio da escolha.
 *
 * O `min={1}` do DS — não completar o intervalo no primeiro clique — aqui é a
 * própria máquina de estados de `escolherDia`.
 */

import { criarFlutuante } from "@/lib/flutuante";
import { h, icone, ICONES, montar } from "@/lib/dom";
import {
  dataDeIso,
  diasAtras,
  hojeIso,
  isoDeData,
  type Periodo,
} from "@/lib/periodo";

export interface SeletorPeriodoDs {
  /** O gatilho, no estilo campo do DS. */
  elemento: HTMLElement;
  /** Reflete no calendário um período escolhido por fora (os atalhos). */
  definir(p: Periodo): void;
}

export interface OpcoesSeletorPeriodoDs {
  /** Vira o `aria-label` do gatilho e do calendário. */
  rotulo: string;
  valor?: Periodo;
  /**
   * Limites do calendário, em ISO. **Sem limite** quando não vêm — dá pra
   * escolher dia futuro e andar pra qualquer ano.
   *
   * Antes o `maximo` caía em hoje por default, herdado do `max` que os dois
   * `<input type="date">` tinham. Mas filtro de lista não é só passado: a tela
   * de rotinas recorta execução AGENDADA, e a de demandas, prazo de entrega —
   * nas duas o dia que interessa ainda não chegou.
   */
  maximo?: string;
  minimo?: string;
  /**
   * `"campo"` (default) desenha o gatilho como input, que é o `DatePicker` do
   * DS. `"chip"` desenha como filtro da barra — mesmo painel, gatilho compacto.
   */
  aparencia?: "campo" | "chip";
  /**
   * Atalhos acima do calendário. `dias` positivo é janela pra trás (7 = dos
   * últimos sete dias até hoje), negativo é pra frente (-30 = de hoje aos
   * próximos trinta), e `null` é sem limite nenhum.
   */
  atalhos?: Array<{ texto: string; dias: number | null }>;
  /** Só dispara com o intervalo pronto — ver `escolherDia`. */
  aoMudar: (p: Periodo) => void;
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const NOMES_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** Seis linhas sempre: com cinco o painel mudava de altura ao trocar de mês. */
const LINHAS = 6;

const primeiroDoMes = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), 1);

const somarMeses = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth() + n, 1);

const somarDias = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const mesmoDia = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const curto = (d: Date): string =>
  d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const longo = (d: Date): string =>
  d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

const nomeDoMes = (d: Date): string =>
  d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

/** "jan", "fev"… — o Intl devolve com ponto ("jan."), que aqui não cabe. */
const MESES_CURTOS = Array.from({ length: 12 }, (_, m) =>
  new Date(2020, m, 1)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", ""),
);

export function criarSeletorPeriodoDs(
  o: OpcoesSeletorPeriodoDs,
): SeletorPeriodoDs {
  const hoje = dataDeIso(hojeIso());
  const maximo = o.maximo ? dataDeIso(o.maximo) : null;
  const minimo = o.minimo ? dataDeIso(o.minimo) : null;

  let de = o.valor?.de ? dataDeIso(o.valor.de) : null;
  let ate = o.valor?.ate ? dataDeIso(o.valor.ate) : null;
  /** Dia sob o ponteiro enquanto falta o fim: pinta o miolo antes do clique. */
  let previa: Date | null = null;
  /** Mês do painel da esquerda; o da direita é este + 1. */
  let base = primeiroDoMes(de ?? somarMeses(hoje, -1));
  /** Dia que responde ao teclado — o foco é varrido a cada redesenho. */
  let cursor = de ?? hoje;

  const chip = o.aparencia === "chip";

  // Modo campo: um texto só, que é o valor do input. Modo chip: nome + operador
  // + valor em pílula, que é como o `toolbarAppliedChip` do DS se divide — o
  // nome do filtro em semibold, o operador apagado, o valor destacado.
  const texto = h("span", { class: "ds-periodo__valor" });
  const nome = h("span", { class: "ds-filtro-chip__nome" }, o.rotulo);
  const operador = h("span", { class: "ds-filtro-chip__op" });
  const pilula = h("span", { class: "ds-filtro-chip__valor" });

  // A agenda fica nos dois modos: no chip ela é o que distingue "Cadastro" de
  // período de "Cadastro" de qualquer outra coisa, num relance.
  const agenda = icone(ICONES.calendario);
  agenda.setAttribute(
    "class",
    chip ? "ds-filtro-chip__icone" : "ds-periodo__icone",
  );

  const gatilho = h(
    "button",
    {
      class: chip ? "ds-filtro-chip__corpo" : "ds-periodo__gatilho",
      type: "button",
      dataset: { state: "closed" },
      aria: { haspopup: "dialog", expanded: "false", label: o.rotulo },
      on: {
        click: () => {
          if (flutuante.aberto()) {
            flutuante.fechar();
            return;
          }
          // Reabre no mês do que está valendo, não onde a navegação parou.
          base = primeiroDoMes(de ?? somarMeses(hoje, -1));
          flutuante.abrir();
        },
      },
    },
    agenda,
    ...(chip ? [nome, operador, pilula] : [texto]),
  );

  const navegador = (
    direcao: "anterior" | "proximo",
    aoClicar: () => void,
  ): HTMLElement => {
    const botao = h("button", {
      class: "ds-calendario__nav",
      type: "button",
      aria: { label: direcao === "anterior" ? "Mês anterior" : "Mês seguinte" },
      on: { click: aoClicar },
    });
    botao.append(
      icone(direcao === "anterior" ? ICONES.seta_esquerda : ICONES.seta),
    );
    return botao;
  };

  /**
   * Legenda que abre seletor de mês e ano.
   *
   * As setas do topo andam de mês em mês, e só: chegar a 2019 dava oitenta e
   * poucos cliques. Aqui o ano é um campo — digita-se 2019 — e o mês é uma
   * grade de doze. É o `captionLayout="dropdown"` do `Calendar` do DS, que lá
   * são dois `<select>`; nativo não serve porque a lista dele é do sistema (o
   * mesmo motivo do `selecao-ds.ts`), então o painel é nosso.
   *
   * `painel`: 0 é o mês da esquerda, 1 o da direita — escolher no da direita
   * põe a `base` um mês antes, senão a escolha pularia de pane.
   */
  function legenda(mes: Date, qual: 0 | 1): HTMLElement {
    let ano = mes.getFullYear();

    const gatilho = h(
      "button",
      {
        class: "ds-calendario__legenda",
        type: "button",
        dataset: { state: "closed" },
        aria: {
          haspopup: "dialog",
          expanded: "false",
          label: `Escolher mês e ano — ${nomeDoMes(mes)}`,
        },
      },
      h("span", {}, nomeDoMes(mes)),
    );
    const setaLegenda = icone(ICONES.seta_baixo);
    setaLegenda.setAttribute("class", "ds-calendario__legenda-seta");
    gatilho.append(setaLegenda);

    const irPara = (m: number): void => {
      const alvo = new Date(ano, m, 1);
      base = qual === 0 ? alvo : somarMeses(alvo, -1);
      seletor.fechar(true);
      pintarGrades();
    };

    const campoAno = h("input", {
      class: "ds-calendario__ano-campo",
      type: "number",
      value: String(ano),
      // Sem teto de calendário: os limites aqui são só pra caber um ano de
      // quatro dígitos, não pra restringir o período que se pode filtrar.
      min: "1",
      max: "9999",
      aria: { label: "Ano" },
      on: {
        input: (ev: Event) => {
          const digitado = Number((ev.target as HTMLInputElement).value);
          if (Number.isInteger(digitado) && digitado >= 1 && digitado <= 9999) {
            ano = digitado;
          }
        },
      },
    });

    const passoAno = (passo: number): HTMLElement => {
      const botao = h("button", {
        class: "ds-calendario__nav ds-calendario__nav--pequeno",
        type: "button",
        aria: { label: passo < 0 ? "Ano anterior" : "Ano seguinte" },
        on: {
          click: () => {
            ano += passo;
            campoAno.value = String(ano);
          },
        },
      });
      botao.append(icone(passo < 0 ? ICONES.seta_esquerda : ICONES.seta));
      return botao;
    };

    const painelSeletor = h(
      "div",
      {
        class: "ds-flutuante ds-calendario__seletor",
        role: "dialog",
        tabindex: "-1",
        aria: { label: "Mês e ano" },
        on: {
          keydown: (ev: KeyboardEvent) => {
            // Enter no campo do ano vai pro mesmo mês do outro ano, que é o
            // que quem digitou "2019" está pedindo.
            if (ev.key === "Enter") {
              ev.preventDefault();
              irPara(mes.getMonth());
              return;
            }
            if (ev.key === "Escape" || ev.key === "Tab") {
              if (ev.key === "Escape") ev.preventDefault();
              seletor.fechar(true);
            }
          },
        },
      },
      h(
        "div",
        { class: "ds-calendario__ano" },
        passoAno(-1),
        campoAno,
        passoAno(1),
      ),
      h(
        "div",
        { class: "ds-calendario__meses-lista" },
        ...MESES_CURTOS.map((curtoMes, m) =>
          h(
            "button",
            {
              class: "ds-calendario__opcao",
              type: "button",
              aria: { selected: String(m === mes.getMonth()) },
              on: { click: () => irPara(m) },
            },
            curtoMes,
          ),
        ),
      ),
    );

    const seletor = criarFlutuante({
      gatilho,
      painel: painelSeletor,
      folgaMinima: 220,
      aoAbrir: () => campoAno.focus(),
    });

    gatilho.addEventListener("click", () => {
      if (seletor.aberto()) {
        seletor.fechar();
        return;
      }
      // Reabre no ano que está à vista, não no último digitado.
      ano = mes.getFullYear();
      campoAno.value = String(ano);
      seletor.abrir();
    });

    return gatilho;
  }

  const pontas = h("div", { class: "ds-calendario__pontas" });
  const legendas = h("div", { class: "ds-calendario__legendas" });
  const grades = h("div", { class: "ds-calendario__meses" });

  const painel = h(
    "div",
    {
      class: "ds-flutuante ds-calendario",
      role: "dialog",
      tabindex: "-1",
      aria: { label: o.rotulo, modal: "false" },
      on: { keydown: (ev: KeyboardEvent) => naTecla(ev) },
    },
    pontas,
    (o.atalhos ?? []).length === 0
      ? null
      : h(
          "div",
          { class: "ds-calendario__atalhos" },
          ...(o.atalhos ?? []).map((a) =>
            h(
              "button",
              {
                class: "ds-calendario__atalho",
                type: "button",
                on: { click: () => escolherAtalho(a.dias) },
              },
              a.texto,
            ),
          ),
        ),
    h(
      "div",
      { class: "ds-calendario__topo" },
      navegador("anterior", () => navegar(-1)),
      legendas,
      navegador("proximo", () => navegar(1)),
    ),
    grades,
  );

  function navegar(passo: number): void {
    base = somarMeses(base, passo);
    pintarGrades();
  }

  const bloqueado = (d: Date): boolean =>
    (maximo !== null && d > maximo) || (minimo !== null && d < minimo);

  /** Onde o dia cai no intervalo — os mesmos estados do `CalendarDayButton`. */
  function papel(d: Date): {
    inicio: boolean;
    fim: boolean;
    miolo: boolean;
    unico: boolean;
  } {
    // Sem o fim escolhido, a prévia do ponteiro faz o papel dele.
    const limite = ate ?? (de && previa && previa > de ? previa : null);
    const inicio = de !== null && mesmoDia(d, de);
    const fim = limite !== null && mesmoDia(d, limite);
    const miolo =
      de !== null && limite !== null && d > de && d < limite && !inicio && !fim;
    return { inicio, fim, miolo, unico: inicio && limite === null };
  }

  function celula(dia: Date, mes: number): HTMLElement {
    const fora = dia.getMonth() !== mes;
    const p = papel(dia);
    const desabilitado = bloqueado(dia);

    const botao = h("button", {
      class: "ds-calendario__dia",
      type: "button",
      tabindex: !fora && mesmoDia(dia, cursor) ? "0" : "-1",
      disabled: desabilitado,
      aria: {
        label: longo(dia),
        selected: String(p.inicio || p.fim || p.miolo),
      },
      on: {
        click: () => escolherDia(dia),
        pointerenter: () => {
          if (!de || ate) return;
          previa = dia;
          pintarGrades();
        },
      },
    });

    // Os mesmos atributos do DS, e com a mesma precedência que o CSS lá dá:
    // ponta ganha do miolo, e o miolo ganha do "hoje".
    if (p.unico) botao.dataset.selectedSingle = "true";
    if (p.inicio && !p.unico) botao.dataset.rangeStart = "true";
    if (p.fim && !p.inicio) botao.dataset.rangeEnd = "true";
    if (p.miolo) botao.dataset.rangeMiddle = "true";
    if (mesmoDia(dia, hoje)) botao.dataset.hoje = "true";
    if (fora) botao.dataset.fora = "true";

    botao.textContent = String(dia.getDate());
    return h("td", { class: "ds-calendario__celula", role: "gridcell" }, botao);
  }

  function grade(mes: Date): HTMLElement {
    // A semana começa no domingo, como no calendário pt-BR.
    const inicio = somarDias(mes, -mes.getDay());

    const linhas: HTMLElement[] = [];
    for (let semana = 0; semana < LINHAS; semana++) {
      const dias: HTMLElement[] = [];
      for (let dia = 0; dia < 7; dia++) {
        dias.push(celula(somarDias(inicio, semana * 7 + dia), mes.getMonth()));
      }
      linhas.push(h("tr", { class: "ds-calendario__semana" }, ...dias));
    }

    return h(
      "table",
      {
        class: "ds-calendario__grade",
        role: "grid",
        aria: { label: nomeDoMes(mes) },
      },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          ...SEMANA.map((abrev, i) =>
            h(
              "th",
              {
                class: "ds-calendario__semana-rotulo",
                role: "columnheader",
                aria: { label: NOMES_SEMANA[i] ?? abrev },
              },
              abrev,
            ),
          ),
        ),
      ),
      h("tbody", {}, ...linhas),
    );
  }

  function pintarGrades(): void {
    const seguinte = somarMeses(base, 1);
    montar(legendas, legenda(base, 0), legenda(seguinte, 1));
    montar(grades, grade(base), grade(seguinte));
  }

  /**
   * Quatro estados, não dois: as duas pontas são independentes.
   *
   * "desde" e "até" existem porque intervalo aberto de um lado é recorte
   * legítimo — "tudo a partir de agosto" — e era o que os dois
   * `<input type="date">` do filtro antigo davam de graça, um preenchido e o
   * outro vazio.
   */
  function pintarGatilho(): void {
    const op =
      de && ate ? "entre" : de ? "desde" : ate ? "até" : null;
    const rotulo =
      de && ate
        ? `${curto(de)} – ${curto(ate)}`
        : de
          ? curto(de)
          : ate
            ? curto(ate)
            : null;

    if (chip) {
      operador.textContent = op ?? "";
      pilula.textContent = rotulo ?? "";
      // Chip vazio mostra só o nome — é o `showEmptyFilterChips` do DS: o
      // filtro está na barra, esperando valor.
      operador.hidden = rotulo === null;
      pilula.hidden = rotulo === null;
    } else {
      texto.textContent = rotulo
        ? `${op === "entre" ? "" : `${op} `}${rotulo}`
        : "Selecione o período";
    }

    gatilho.toggleAttribute("data-placeholder", rotulo === null);
  }

  /** Um lugar só pra avisar: quem chama não converte data pra ISO na mão. */
  function notificar(): void {
    o.aoMudar({
      de: de === null ? null : isoDeData(de),
      ate: ate === null ? null : isoDeData(ate),
    });
  }

  /**
   * As duas pontas do intervalo, com ✕ em cada uma.
   *
   * É o que permite o intervalo aberto: limpar o "fim" deixa "desde 01/08 em
   * diante". Sem isto, a única forma de mexer numa ponta era recomeçar a
   * seleção, e "sem fim" não existia.
   */
  function ponta(
    rotulo: string,
    valor: Date | null,
    qual: "de" | "ate",
  ): HTMLElement {
    const limpar = h("button", {
      class: "ds-calendario__ponta-x",
      type: "button",
      disabled: valor === null,
      aria: { label: `Sem ${rotulo.toLowerCase()}` },
      on: { click: () => limparPonta(qual) },
    });
    limpar.append(icone(ICONES.fechar));

    return h(
      "div",
      {
        class: "ds-calendario__ponta",
        dataset: { vazio: String(valor === null) },
      },
      h("span", { class: "ds-calendario__ponta-rotulo" }, rotulo),
      h(
        "span",
        { class: "ds-calendario__ponta-valor" },
        valor ? curto(valor) : "sem limite",
      ),
      limpar,
    );
  }

  function pintarPontas(): void {
    montar(pontas, ponta("Início", de, "de"), ponta("Fim", ate, "ate"));
  }

  function limparPonta(qual: "de" | "ate"): void {
    if (qual === "de") de = null;
    else ate = null;
    previa = null;
    pintar();
    notificar();
  }

  /** As três andam juntas: separá-las já deixou chip e grade em desacordo. */
  function pintar(): void {
    pintarGatilho();
    pintarPontas();
    pintarGrades();
  }

  /**
   * Atalho é intervalo pronto, não um modo à parte.
   *
   * Antes eles eram rádios fora do calendário e o intervalo à mão era uma
   * quinta opção; aqui os dois escrevem no mesmo par de datas, e o chip mostra
   * o resultado do mesmo jeito nos dois caminhos.
   */
  function escolherAtalho(dias: number | null): void {
    if (dias === null) {
      de = null;
      ate = null;
    } else if (dias >= 0) {
      // Janela pra trás. `ate` fechado em hoje, e não em aberto: é o que o
      // calendário consegue pintar como faixa, e o limite superior é o mesmo.
      de = dataDeIso(diasAtras(dias));
      ate = hoje;
    } else {
      // Pra frente: `diasAtras` de negativo anda pra frente.
      de = hoje;
      ate = dataDeIso(diasAtras(dias));
    }
    cursor = de ?? hoje;
    base = primeiroDoMes(de ?? somarMeses(hoje, -1));
    pintar();
    flutuante.fechar(true);
    notificar();
  }

  /**
   * Um clique nunca fecha o intervalo — é o `min={1}` do DS.
   *
   * Sem isso o primeiro clique produziria `{de, ate}` iguais, o painel
   * fecharia e escolher o fim seria impossível. Clicar antes do início troca
   * as pontas em vez de recomeçar: o erro aí é de ordem, não de intenção.
   */
  function escolherDia(dia: Date): void {
    if (bloqueado(dia)) return;

    if (de === null && ate !== null) {
      // Veio de um "sem início": o clique fecha o intervalo por baixo.
      if (dia <= ate) de = dia;
      else {
        de = ate;
        ate = dia;
      }
    } else if (!de || ate) {
      de = dia;
      ate = null;
    } else if (dia < de) {
      ate = de;
      de = dia;
    } else {
      ate = dia;
    }

    cursor = dia;
    previa = null;
    pintar();

    // Avisa só com o intervalo pronto: cada aviso é uma consulta e um
    // redesenho da tela inteira, e meia seleção não é recorte pedido — quem
    // quer intervalo aberto usa o ✕ da ponta, que avisa na hora.
    if (de && ate) {
      flutuante.fechar(true);
      notificar();
    }
  }

  function mover(dias: number): void {
    const alvo = somarDias(cursor, dias);
    if (bloqueado(alvo)) return;
    cursor = alvo;
    // Seta que sai dos dois meses vira o painel, em vez de perder o cursor.
    if (cursor < base) base = primeiroDoMes(cursor);
    else if (cursor >= somarMeses(base, 2)) base = somarMeses(cursor, -1);
    pintarGrades();
    focarCursor();
  }

  function focarCursor(): void {
    const alvo = grades.querySelector<HTMLElement>('[tabindex="0"]');
    (alvo ?? painel).focus();
  }

  function naTecla(ev: KeyboardEvent): void {
    const passos: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const passo = passos[ev.key];
    if (passo !== undefined) {
      ev.preventDefault();
      mover(passo);
      return;
    }
    if (ev.key === "PageUp" || ev.key === "PageDown") {
      ev.preventDefault();
      navegar(ev.key === "PageUp" ? -1 : 1);
      return;
    }
    if (ev.key === "Home" || ev.key === "End") {
      ev.preventDefault();
      mover(ev.key === "Home" ? -cursor.getDay() : 6 - cursor.getDay());
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      escolherDia(cursor);
      return;
    }
    // Tab sem `preventDefault`: o foco volta ao gatilho e o navegador segue
    // dali, como se o calendário nunca tivesse aberto.
    if (ev.key === "Escape" || ev.key === "Tab") {
      if (ev.key === "Escape") ev.preventDefault();
      flutuante.fechar(true);
    }
  }

  const flutuante = criarFlutuante({
    gatilho,
    painel,
    folgaMinima: 360,
    aoAbrir: () => {
      cursor = de ?? hoje;
      pintarPontas();
      pintarGrades();
      focarCursor();
    },
    aoFechar: () => {
      previa = null;
    },
  });

  pintarGatilho();

  return {
    elemento: gatilho,
    definir: (p: Periodo) => {
      de = p.de ? dataDeIso(p.de) : null;
      ate = p.ate ? dataDeIso(p.ate) : null;
      cursor = de ?? hoje;
      base = primeiroDoMes(de ?? somarMeses(hoje, -1));
      // Fechado, só o gatilho está na tela; aberto, o painel também precisa
      // acompanhar — e montar grade de dois meses à toa não é de graça.
      if (flutuante.aberto()) pintar();
      else pintarGatilho();
    },
  };
}
