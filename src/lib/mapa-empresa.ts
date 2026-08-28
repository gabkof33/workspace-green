/**
 * O mapa funcional da iGreen Energy — só os dados, sem nada de desenho.
 *
 * O modelo é um sistema orbital: o Cliente é o sol, cada grande área é um
 * planeta numa órbita cada vez mais alta e larga, e as equipes de cada área
 * são satélites do seu planeta. As ligações cruzadas são as relações que
 * atravessam áreas diferentes.
 *
 * Vive em `lib/` e não em `components/` porque é descrição da EMPRESA, não da
 * cena: quem quiser listar as áreas numa tabela, ou conferir se o organograma
 * de `setores` bate com este mapa, lê daqui sem carregar WebGL junto.
 */

export type EspecieCorpo = "sol" | "planeta" | "satelite";

export interface Satelite {
  id: string;
  rotulo: string;
  funcao: string;
}

export interface Planeta {
  id: string;
  rotulo: string;
  /** Cor da área, em hexadecimal — é o código de cor da legenda. */
  cor: number;
  velocidadeOrbita: number;
  funcao: string;
  satelites: Satelite[];
}

/**
 * O RAIO da órbita não está aqui, e é de propósito.
 *
 * Ele era um número por área, escrito à mão, com espaçamento fixo de 2.2 — e
 * nenhuma área cabia nisso: um planeta com quatro satélites precisa de 3.0 de
 * folga, então os satélites de uma área cruzavam a órbita da vizinha, e um
 * planeta chegava a aparecer fora do funil. Não dá para acertar isso à mão
 * sem refazer a conta a cada satélite que entra.
 *
 * Quem calcula é a cena, a partir de quantos satélites cada área tem (ver
 * `mapa-orbital.ts`). O que os dados guardam é a ORDEM — a única coisa que
 * eles sabiam dizer de verdade.
 */

export const SOL = {
  id: "cliente",
  rotulo: "Cliente",
  cor: 0xffd166,
  funcao:
    "Ponto de chegada e de partida de todo o processo: quem recebe o serviço e dá o feedback que realimenta a operação. Todo planeta desta órbita existe para servir o Cliente.",
} as const;

export const PLANETAS: Planeta[] = [
  {
    id: "diretoria",
    rotulo: "Diretoria",
    cor: 0xe5484d,
    velocidadeOrbita: 0.06,
    funcao:
      "Supervisiona estratégia, financeiro, operação e expansão da empresa.",
    satelites: [
      {
        id: "estrategia",
        rotulo: "Estratégia",
        funcao: "Define direção de crescimento e prioridades de negócio.",
      },
      {
        id: "expansao",
        rotulo: "Expansão",
        funcao: "Crescimento da rede: novos parceiros, licenciados e mercados.",
      },
      {
        id: "novoslic",
        rotulo: "Novos Licenciados",
        funcao:
          "Resultado do trabalho de expansão: novos parceiros entrando na rede.",
      },
    ],
  },
  {
    id: "comercial",
    rotulo: "Comercial",
    cor: 0xf2a93b,
    velocidadeOrbita: 0.05,
    funcao:
      "Porta de entrada da receita: prospecção, proposta, negociação e fechamento.",
    satelites: [
      {
        id: "marketing",
        rotulo: "Marketing",
        funcao:
          "Gera demanda para o Comercial: campanhas, mídia e geração de leads.",
      },
      {
        id: "contratos",
        rotulo: "Contratos",
        funcao:
          "Formaliza a venda: documentos, validação cadastral, assinatura e rescisões.",
      },
      {
        id: "onboarding",
        rotulo: "Onboarding",
        funcao:
          "Recebe o novo cliente/licenciado: cadastro, ativação e direcionamento inicial.",
      },
    ],
  },
  {
    id: "produtos",
    rotulo: "Produtos",
    cor: 0x3fb950,
    velocidadeOrbita: 0.042,
    funcao: "Portfólio de soluções energéticas entregues ao cliente final.",
    satelites: [
      {
        id: "green",
        rotulo: "Conexão Green",
        funcao:
          "Economia de energia sem instalação de placas: ativação, compensação de créditos.",
      },
      {
        id: "placas",
        rotulo: "Placas",
        funcao:
          "Geração própria de energia: orçamento, projeto, instalação e homologação.",
      },
      {
        id: "livre",
        rotulo: "Conexão Livre",
        funcao:
          "Atende consumidores de maior porte no mercado livre de energia.",
      },
      {
        id: "telecom",
        rotulo: "Telecom",
        funcao: "Operação de telefonia/conectividade do ecossistema iGreen.",
      },
    ],
  },
  {
    id: "suporte",
    rotulo: "Suporte",
    cor: 0x7c93a8,
    velocidadeOrbita: 0.036,
    funcao:
      "Hub central de resolução de problemas: chamados, dúvidas e direcionamento.",
    satelites: [
      {
        id: "ti",
        rotulo: "TI",
        funcao: "Infraestrutura tecnológica que conecta todas as equipes.",
      },
    ],
  },
  {
    id: "financeiro",
    rotulo: "Financeiro",
    cor: 0x2dd4bf,
    velocidadeOrbita: 0.03,
    funcao:
      "Controla o dinheiro da empresa: contas a receber/pagar, faturamento, fluxo de caixa.",
    satelites: [
      {
        id: "inadimplencia",
        rotulo: "Inadimplência",
        funcao:
          "Controle de pagamentos pendentes: cobrança, negociação, regularização.",
      },
      {
        id: "bank",
        rotulo: "Bank",
        funcao:
          "Frente financeira/ecossistêmica: produtos financeiros para clientes e licenciados.",
      },
    ],
  },
  {
    id: "cx",
    rotulo: "CX",
    cor: 0x4c9bff,
    velocidadeOrbita: 0.026,
    funcao: "Dono da jornada do cliente: satisfação, NPS, retenção.",
    satelites: [
      {
        id: "posvenda",
        rotulo: "Pós-venda",
        funcao:
          "Garante que o cliente continue tendo resultado após a venda.",
      },
    ],
  },
  {
    id: "apoio",
    rotulo: "Apoio",
    cor: 0xb18cf5,
    velocidadeOrbita: 0.022,
    funcao: "Áreas transversais que sustentam toda a operação.",
    satelites: [
      {
        id: "juridico",
        rotulo: "Jurídico",
        funcao:
          "Proteção jurídica da operação: contratos, LGPD, questões regulatórias.",
      },
      {
        id: "dados",
        rotulo: "Dados / BI",
        funcao:
          "Transforma dados da operação em informação para decisão — área horizontal.",
      },
    ],
  },
];

/**
 * Relações que cruzam órbitas — as que a hierarquia sozinha não conta.
 *
 * Duas escalas na mesma lista: planeta com planeta é o fluxo macro entre
 * áreas; satélite com satélite (ou com outro planeta) é a equipe específica
 * que trabalha junto de alguém fora da sua área.
 */
export const LIGACOES: Array<[string, string]> = [
  ["diretoria", "comercial"],
  ["diretoria", "financeiro"],
  ["diretoria", "apoio"],
  ["comercial", "produtos"],
  ["produtos", "suporte"],
  ["suporte", "financeiro"],
  ["suporte", "cx"],
  ["financeiro", "cx"],
  ["apoio", "comercial"],
  ["apoio", "financeiro"],
  ["apoio", "cx"],

  ["contratos", "juridico"],
  ["financeiro", "juridico"],
  ["comercial", "bank"],
  ["juridico", "bank"],
  ["livre", "juridico"],
  ["suporte", "juridico"],
  ["dados", "comercial"],
  ["dados", "financeiro"],
  ["dados", "cx"],
  ["dados", "diretoria"],
  ["ti", "dados"],
  ["expansao", "marketing"],
  ["expansao", "comercial"],
  ["inadimplencia", "contratos"],

  /*
   * Sete satélites orbitavam sem ligação nenhuma — estratégia, novos
   * licenciados, onboarding, os três produtos e o pós-venda. No desenho eles
   * ficavam soltos, o que dizia "esta equipe não se relaciona com ninguém",
   * que é falso de todas elas.
   *
   * ⚠️ As linhas abaixo foram DEDUZIDAS dos próprios textos de função desta
   * lista, não confirmadas com quem toca as áreas. Cada uma tem a frase que a
   * originou ao lado. Confira e corrija: é mais fácil apagar uma relação
   * errada do que descobrir uma que falta.
   */
  // "define direção e prioridades" + "informação para decisão"
  ["estrategia", "dados"],
  // "novos parceiros entrando na rede" + "recebe o novo licenciado"
  ["novoslic", "onboarding"],
  // "formaliza a venda, assinatura" → "cadastro, ativação"
  ["onboarding", "contratos"],
  // ativado o cliente, quem cuida do resultado dele é o pós-venda
  ["onboarding", "posvenda"],
  // "garante resultado após a venda" recorre ao hub de resolução
  ["posvenda", "suporte"],
  // "compensação de créditos" é conta a receber
  ["green", "financeiro"],
  // "homologação" é ato regulatório, e o jurídico cuida de regulatório
  ["placas", "juridico"],
  // "telefonia/conectividade" apoiada pela "infraestrutura tecnológica"
  ["telecom", "ti"],
];

export interface Corpo {
  id: string;
  especie: EspecieCorpo;
  rotulo: string;
  funcao: string;
  cor: number;
  paiId: string | null;
  filhosIds: string[];
}

/** Índice por id — a cena e o painel resolvem tudo por aqui. */
export const CORPOS: Record<string, Corpo> = (() => {
  const mapa: Record<string, Corpo> = {
    [SOL.id]: {
      id: SOL.id,
      especie: "sol",
      rotulo: SOL.rotulo,
      funcao: SOL.funcao,
      cor: SOL.cor,
      paiId: null,
      filhosIds: PLANETAS.map((p) => p.id),
    },
  };

  for (const p of PLANETAS) {
    mapa[p.id] = {
      id: p.id,
      especie: "planeta",
      rotulo: p.rotulo,
      funcao: p.funcao,
      cor: p.cor,
      paiId: SOL.id,
      filhosIds: p.satelites.map((s) => s.id),
    };

    for (const s of p.satelites) {
      mapa[s.id] = {
        id: s.id,
        especie: "satelite",
        rotulo: s.rotulo,
        funcao: s.funcao,
        // Satélite herda a cor da área: é o que faz reconhecer de que planeta
        // ele é sem ler o rótulo.
        cor: p.cor,
        paiId: p.id,
        filhosIds: [],
      };
    }
  }

  return mapa;
})();

/** Quem está ligado a este corpo: pai, filhos e as ligações cruzadas. */
export function ligadosA(id: string): string[] {
  const corpo = CORPOS[id];
  if (!corpo) return [];

  const ids = new Set(corpo.filhosIds);
  if (corpo.paiId) ids.add(corpo.paiId);
  for (const [a, b] of LIGACOES) {
    if (a === id) ids.add(b);
    if (b === id) ids.add(a);
  }
  return [...ids];
}

/** Só as ligações cruzadas, que é o que o painel lista à parte. */
export function cruzamentosDe(id: string): string[] {
  const ids: string[] = [];
  for (const [a, b] of LIGACOES) {
    if (a === id) ids.push(b);
    else if (b === id) ids.push(a);
  }
  return ids;
}
