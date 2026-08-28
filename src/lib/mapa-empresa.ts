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
  /** Distância até o sol. Cresce com a distância da área ao cliente. */
  raioOrbita: number;
  velocidadeOrbita: number;
  funcao: string;
  satelites: Satelite[];
}

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
    raioOrbita: 6.5,
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
    raioOrbita: 8.6,
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
    raioOrbita: 10.8,
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
    raioOrbita: 13.0,
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
    raioOrbita: 15.2,
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
    raioOrbita: 17.4,
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
    raioOrbita: 19.6,
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
