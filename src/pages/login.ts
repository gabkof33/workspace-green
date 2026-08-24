/** Acesso à Central Green — entrar ou cadastrar. */

import { avisar, estatico, h, montar, icone } from "@/lib/dom";
import {
  cadastrar,
  setoresParaCadastro,
  definirSenha,
  entrar,
  pedirRecuperacao,
  reenviarConfirmacao,
  sistemaVazio,
} from "@/lib/api";
import { criarRaio } from "@/components/raio";
import { criarFundoPontilhado } from "@/components/fundo-pontilhado";
import type { DadosCadastro, Perfil } from "@/types/dominio";

const PILARES: Array<[string, string]> = [
  ["01", "Chamados e incidentes com SLA cronometrado"],
  ["02", "Demandas com cronograma e prazo de entrega"],
  ["03", "Rotinas preventivas com runbook e evidência"],
  ["04", "Inventário de ativos e base de conhecimento"],
];

const DEPARTAMENTOS = [
  "Tecnologia da Informação",
  "Comercial",
  "Financeiro",
  "Operações",
  "Recursos Humanos",
  "Jurídico",
  "Marketing",
  "Diretoria",
];

type Modo = "entrar" | "cadastrar" | "recuperar";

export function renderizarLogin(
  alvo: HTMLElement,
  aoEntrar: (perfil: Perfil) => void,
): void {
  let modo: Modo = "entrar";

  const irPara = (destino: Modo) => (): void => {
    modo = destino;
    desenhar();
  };

  const desenhar = (): void => {
    const abas = h(
      "div",
      { class: "abas", aria: { label: "Modo de acesso" } },
      h(
        "button",
        {
          class: "aba",
          type: "button",
          aria: { selected: String(modo === "entrar") },
          on: {
            click: () => {
              modo = "entrar";
              desenhar();
            },
          },
        },
        "Entrar",
      ),
      h(
        "button",
        {
          class: "aba",
          type: "button",
          aria: { selected: String(modo === "cadastrar") },
          on: {
            click: () => {
              modo = "cadastrar";
              desenhar();
            },
          },
        },
        "Criar conta",
      ),
    );

    const painel = h(
      "div",
      { class: "auth__form" },
      h(
        "div",
        { class: "marca-auth" },
        h("img", {
          class: "marca__g marca__g--grande",
          src: LOGOTIPO,
          alt: "",
          width: "30",
          height: "40",
        }),
        h(
          "div",
          {},
          h(
            "div",
            // O texto vai também no atributo: as duas cópias de canal são
            // pseudo-elementos, e `content: attr()` é o que as alimenta.
            { class: "marca-auth__nome", dataset: { texto: "Central Green" } },
            "Central Green",
          ),
          h("div", { class: "marca-auth__sub" }, "Operação de TI"),
        ),
      ),
      abas,
      modo === "entrar"
        ? formEntrar(aoEntrar, irPara("cadastrar"), irPara("recuperar"))
        : modo === "recuperar"
          ? formRecuperar(irPara("entrar"))
          : formCadastro(aoEntrar, irPara("entrar")),
    );

    montar(
      alvo,
      h(
        "div",
        { class: "auth" },
        aside(),
        // O raio mora atrás do formulário, no escuro à direita, onde a marca
        // "Central Green" já está.
        h("div", { class: "auth__lado" }, criarRaio(), painel),
      ),
    );

    const primeiro = painel.querySelector<HTMLInputElement>("input");
    primeiro?.focus();
  };

  desenhar();
}

/* Coluna de apresentação */

/** Mesmo arquivo do cabeçalho. */

const LOGOTIPO = "/igreen-g.png";

function aside(): HTMLElement {
  return h(
    "div",
    { class: "auth__aside" },
    // Malha de pontos ao fundo: anima sozinha e reage ao cursor.
    criarFundoPontilhado(),
    h(
      "div",
      { class: "auth__conteudo" },
      h("h2", {}, "A operação de TI em um só lugar"),
      h(
        "p",
        {},
        "Chamado, demanda, rotina e ativo no mesmo modelo — com prioridade calculada, prazo cronometrado e trilha de auditoria em tudo.",
      ),
      h(
        "div",
        { class: "auth__pilares" },
        ...PILARES.map(([n, texto]) =>
          h(
            "div",
            { class: "auth__pilar" },
            h("b", {}, n),
            h("span", {}, texto),
          ),
        ),
      ),
    ),
  );
}

/* Entrar */

function formEntrar(
  aoEntrar: (perfil: Perfil) => void,
  aoCadastrar: () => void,
  aoRecuperar: () => void,
): HTMLElement {
  const email = campo("email", "E-mail corporativo", "email", {
    placeholder: "voce@igreenenergy.com.br",
    autocomplete: "username",
  });
  const senha = campo("senha", "Senha", "password", {
    placeholder: "••••••••",
    autocomplete: "current-password",
  });

  const erro = h("div", { class: "campo__erro", style: "display:none" });

  // Só aparece quando o erro é de e-mail não confirmado.
  const reenvio = h(
    "button",
    {
      class: "btn btn--sm btn--bloco",
      type: "button",
      style: "display:none",
      on: {
        click: (ev: Event) => {
          const alvo = ev.currentTarget as HTMLButtonElement;
          alvo.disabled = true;
          alvo.textContent = "Enviando…";
          void reenviarConfirmacao(email.input.value.trim())
            .then(() => {
              avisar("E-mail de confirmação reenviado.", "ok");
              alvo.textContent = "Reenviado";
            })
            .catch((e: unknown) => {
              avisar(
                e instanceof Error ? e.message : "Falha ao reenviar.",
                "erro",
              );
              alvo.disabled = false;
              alvo.textContent = "Reenviar e-mail de confirmação";
            });
        },
      },
    },
    "Reenviar e-mail de confirmação",
  );

  const botao = h(
    "button",
    { class: "btn btn--primario btn--bloco", type: "submit" },
    "Entrar",
  );

  const form = h(
    "form",
    {
      class: "pilha",
      on: {
        submit: (ev: Event) => {
          ev.preventDefault();
          erro.style.display = "none";
          reenvio.style.display = "none";
          email.definirEstado("neutro");
          senha.definirEstado("neutro");
          botao.disabled = true;
          botao.textContent = "Entrando…";

          void entrar(email.input.value.trim(), senha.input.value)
            .then((perfil) => {
              avisar(`Bem-vindo, ${perfil.nome_completo}.`, "ok");
              aoEntrar(perfil);
            })
            .catch((e: unknown) => {
              const mensagem =
                e instanceof Error ? e.message : "Não foi possível entrar.";

              if (mensagem.includes("e-mail válido")) {
                email.definirEstado("erro", mensagem);
              } else if (mensagem.includes("Confirme seu e-mail")) {
                email.definirEstado("erro", mensagem);
                reenvio.style.display = "flex";
              } else if (mensagem.includes("incorretos")) {
                // O servidor não diz qual dos dois está errado, de propósito.
                // Marcar um só seria inventar a informação que ele recusou dar:
                // os dois ficam em erro e a mensagem mora sob a senha.
                email.definirEstado("erro");
                senha.definirEstado("erro", mensagem);
              } else {
                erro.textContent = mensagem;
                erro.style.display = "flex";
              }
              botao.disabled = false;
              botao.textContent = "Entrar";
            });
        },
      },
    },
    email.elemento,
    senha.elemento,
    h(
      "button",
      {
        class: "elo-discreto",
        type: "button",
        on: { click: aoRecuperar },
      },
      "Esqueci minha senha",
    ),
    erro,
    botao,
    reenvio,
    h("div", { class: "separador" }, "ainda não tem acesso?"),
    h(
      "button",
      {
        class: "btn btn--bloco",
        type: "button",
        on: { click: aoCadastrar },
      },
      "Cadastrar",
    ),
  );

  return form;
}

/* Recuperar acesso */

/**
 * A senha não é recuperável — o banco guarda um hash bcrypt, que não tem
 * volta. O que se recupera é o acesso, por um token de uso único no e-mail.
 */
function formRecuperar(aoVoltar: () => void): HTMLElement {
  const email = campo("email-recuperar", "E-mail corporativo", "email", {
    placeholder: "voce@igreenenergy.com.br",
    autocomplete: "username",
  });

  const erro = h("div", { class: "campo__erro", style: "display:none" });
  const botao = h(
    "button",
    { class: "btn btn--primario btn--bloco", type: "submit" },
    "Enviar link de recuperação",
  );

  const feito = h("div", { class: "aviso aviso--ok", style: "display:none" });

  return h(
    "form",
    {
      class: "pilha",
      on: {
        submit: (ev: Event) => {
          ev.preventDefault();
          erro.style.display = "none";
          botao.disabled = true;
          botao.textContent = "Enviando…";

          void pedirRecuperacao(email.input.value)
            .then(() => {
              // Mensagem igual para e-mail existente e inexistente: dizer
              // "esta conta não existe" entrega quem tem conta aqui a quem
              // estiver testando endereços.
              montar(
                feito,
                h("span", { class: "aviso__icone" }, "✓"),
                h(
                  "span",
                  {},
                  h(
                    "b",
                    {},
                    "Se houver conta com esse e-mail, o link já foi enviado. ",
                  ),
                  "Ele vale por uma hora e serve uma vez só.",
                ),
              );
              feito.style.display = "flex";
              botao.style.display = "none";
            })
            .catch((e: unknown) => {
              erro.textContent =
                e instanceof Error ? e.message : "Falha ao enviar.";
              erro.style.display = "flex";
              botao.disabled = false;
              botao.textContent = "Enviar link de recuperação";
            });
        },
      },
    },
    h(
      "div",
      { class: "aviso aviso--info" },
      h("span", { class: "aviso__icone" }, "i"),
      h(
        "span",
        {},
        h("b", {}, "Ninguém consegue ver sua senha. "),
        "O que fica guardado é um resumo criptográfico dela, que não tem volta — nem para você, nem para a TI. O link abaixo cria uma senha nova.",
      ),
    ),
    email.elemento,
    erro,
    feito,
    botao,
    h(
      "button",
      { class: "btn btn--bloco", type: "button", on: { click: aoVoltar } },
      "Voltar",
    ),
  );
}

/**
 * Tela de senha nova, aberta pelo link do e-mail.
 *
 * A sessão de recuperação já autentica, então a pessoa não digita a senha
 * antiga — ela não a tem, que é o motivo de estar aqui.
 */
export function renderizarNovaSenha(
  alvo: HTMLElement,
  aoConcluir: () => void,
): void {
  const senha = campo("senha-nova", "Nova senha", "password", {
    placeholder: "ao menos 8 caracteres",
    autocomplete: "new-password",
  });
  const repetir = campo("senha-repetir", "Repita a nova senha", "password", {
    placeholder: "••••••••",
    autocomplete: "new-password",
  });

  const erro = h("div", { class: "campo__erro", style: "display:none" });
  const botao = h(
    "button",
    { class: "btn btn--primario btn--bloco", type: "submit" },
    "Salvar nova senha",
  );

  const form = h(
    "form",
    {
      class: "pilha",
      on: {
        submit: (ev: Event) => {
          ev.preventDefault();
          erro.style.display = "none";

          if (senha.input.value !== repetir.input.value) {
            erro.textContent = "As duas senhas não são iguais.";
            erro.style.display = "flex";
            return;
          }

          botao.disabled = true;
          botao.textContent = "Salvando…";

          void definirSenha(senha.input.value)
            .then(() => {
              avisar("Senha alterada. Entre com ela agora.", "ok");
              aoConcluir();
            })
            .catch((e: unknown) => {
              erro.textContent =
                e instanceof Error ? e.message : "Falha ao salvar.";
              erro.style.display = "flex";
              botao.disabled = false;
              botao.textContent = "Salvar nova senha";
            });
        },
      },
    },
    h(
      "div",
      { class: "marca-auth" },
      h("img", {
        class: "marca__g marca__g--grande",
        src: LOGOTIPO,
        alt: "",
        width: "30",
        height: "40",
      }),
      h(
        "div",
        {},
        h("div", { class: "marca-auth__nome" }, "Nova senha"),
        h("div", { class: "marca-auth__sub" }, "Central Green"),
      ),
    ),
    senha.elemento,
    repetir.elemento,
    erro,
    botao,
  );

  montar(
    alvo,
    h(
      "div",
      { class: "auth" },
      aside(),
      h(
        "div",
        { class: "auth__lado" },
        criarRaio(),
        h("div", { class: "auth__form" }, form),
      ),
    ),
  );

  senha.input.focus();
}

/* Criar conta */

function formCadastro(
  aoEntrar: (perfil: Perfil) => void,
  aoVoltarParaEntrar: () => void,
): HTMLElement {
  const nome = campo("nome", "Nome completo", "text", {
    placeholder: "Maria Souza Andrade",
    autocomplete: "name",
  });
  const email = campo("email_cad", "E-mail corporativo", "email", {
    placeholder: "voce@igreenenergy.com.br",
    autocomplete: "username",
  });
  const senha = campo("senha_cad", "Senha", "password", {
    placeholder: "mínimo de 8 caracteres",
    autocomplete: "new-password",
  });
  const confirma = campo("senha_conf", "Confirmar senha", "password", {
    autocomplete: "new-password",
  });

  const cargo = campo("cargo", "Cargo", "text", {
    placeholder: "Analista Fiscal Pleno",
    autocomplete: "organization-title",
  });
  const departamento = campoSelecao("depto", "Departamento", DEPARTAMENTOS);

  /**
   * Setor escolhido aqui, não preenchido à mão depois.
   *
   * É ele que decide quais abas a pessoa vê — sem setor, `minhas_abas()`
   * devolve nulo e o menu inteiro aparece para todo mundo.
   */
  const setor = campoSelecao("setor", "Setor onde você trabalha", []);
  setor.input.disabled = true;
  montar(setor.input, h("option", { value: "" }, "Carregando setores…"));

  void setoresParaCadastro().then((lista) => {
    setor.input.disabled = false;
    montar(
      setor.input,
      h("option", { value: "" }, "Selecione…"),
      ...lista.map((s) => h("option", { value: s.id }, s.caminho)),
    );
    if (lista.length === 0) {
      montar(
        setor.input,
        h("option", { value: "" }, "Nenhum setor cadastrado ainda"),
      );
    }
  });
  const telefone = campo("telefone", "Telefone", "tel", {
    placeholder: "(11) 90000-0000",
    autocomplete: "tel",
  });

  const erro = h("div", { class: "campo__erro", style: "display:none" });
  const botao = h(
    "button",
    { class: "btn btn--primario btn--bloco", type: "submit" },
    "Criar minha conta",
  );

  // Enquanto não há nenhuma conta, a primeira vira coordenador.
  const avisoNivel = h(
    "div",
    { class: "aviso aviso--info" },
    h("span", { class: "aviso__icone" }, "i"),
    h(
      "span",
      {},
      "Sua conta começa como ",
      h("b", {}, "colaborador"),
      " — você abre chamados e demandas. Acesso à fila de atendimento e promoções de nível são concedidos por um coordenador ou gestor.",
    ),
  );

  void sistemaVazio().then((vazio) => {
    if (!vazio) return;
    avisoNivel.className = "aviso aviso--alerta";
    montar(
      avisoNivel,
      h("span", { class: "aviso__icone" }, "★"),
      h(
        "span",
        {},
        h("b", {}, "Esta é a primeira conta da Central Green. "),
        "Ela entra como ",
        h("b", {}, "coordenador e administrador"),
        ", com poder de promover todas as próximas. Da segunda conta em diante, todo mundo entra como colaborador.",
      ),
    );
  });

  const mostrarErro = (texto: string): void => {
    erro.textContent = texto;
    erro.style.display = "flex";
    erro.scrollIntoView({ block: "nearest" });
  };

  return h(
    "form",
    {
      class: "pilha",
      on: {
        submit: (ev: Event) => {
          ev.preventDefault();
          erro.style.display = "none";

          const dados: DadosCadastro = {
            nome_completo: nome.input.value.trim(),
            email: email.input.value.trim(),
            senha: senha.input.value,
            cargo: cargo.input.value.trim(),
            departamento: departamento.input.value,
            telefone: telefone.input.value.trim(),
            setor_id: setor.input.value,
          };

          const problema = validarCadastro(dados, confirma.input.value);
          if (problema) return mostrarErro(problema);

          botao.disabled = true;
          botao.textContent = "Criando…";

          void cadastrar(dados)
            .then((resultado) => {
              if (resultado.precisaConfirmarEmail) {
                avisar(
                  "Conta criada. Enviamos um link de confirmação para o seu e-mail — confirme e depois entre.",
                  "ok",
                );
                aoVoltarParaEntrar();
                return;
              }
              if (resultado.perfil) {
                avisar(
                  `Conta criada. Bem-vindo, ${dados.nome_completo}.`,
                  "ok",
                );
                aoEntrar(resultado.perfil);
              }
            })
            .catch((e: unknown) => {
              mostrarErro(
                e instanceof Error
                  ? e.message
                  : "Não foi possível criar a conta.",
              );
              botao.disabled = false;
              botao.textContent = "Criar minha conta";
            });
        },
      },
    },
    h("h4", { style: "margin:0 0 2px" }, "Dados de acesso"),
    nome.elemento,
    email.elemento,
    h("div", { class: "grade-campos" }, senha.elemento, confirma.elemento),

    h("h4", { style: "margin:var(--s-3) 0 2px" }, "Dados profissionais"),
    h("div", { class: "grade-campos" }, cargo.elemento, departamento.elemento),
    setor.elemento,
    h(
      "div",
      { class: "campo__ajuda" },
      "O cargo define sua senioridade automaticamente. Coordenação e gestão continuam sendo concedidas por um coordenador — nunca pelo que se digita aqui.",
    ),
    telefone.elemento,

    avisoNivel,

    erro,
    botao,
    h("div", { class: "separador" }, "já tem conta?"),
    h(
      "button",
      {
        class: "btn btn--bloco",
        type: "button",
        on: { click: aoVoltarParaEntrar },
      },
      "Entrar",
    ),
  );
}

function validarCadastro(
  dados: DadosCadastro,
  confirmacao: string,
): string | null {
  if (dados.nome_completo.split(/\s+/).filter(Boolean).length < 2) {
    return "Informe nome e sobrenome.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
    return "Informe um e-mail válido.";
  }
  if (dados.senha.length < 8) {
    return "A senha precisa de ao menos 8 caracteres.";
  }
  if (dados.senha !== confirmacao) {
    return "As duas senhas não coincidem.";
  }
  if (!dados.cargo) {
    return "Informe seu cargo — ele aparece no diretório e ajuda a direcionar as demandas.";
  }
  if (!dados.telefone) {
    return "Informe um telefone de contato. Ele é usado em acionamento de incidente crítico.";
  }
  return null;
}

/* Construtores de campo */

/**
 * Estados de um campo, espelhando o `FormFieldInput` do iGreen DS
 * (`default`/`error`/`warning`/`success`) no vocabulário deste arquivo.
 */
type EstadoCampo = "neutro" | "erro" | "alerta" | "sucesso";

const CLASSE_APOIO: Record<EstadoCampo, string> = {
  neutro: "campo__ajuda",
  erro: "campo__erro",
  alerta: "campo__alerta",
  sucesso: "campo__sucesso",
};

interface CampoMontado {
  elemento: HTMLElement;
  input: HTMLInputElement;
  /**
   * Troca o estado do campo e o texto abaixo dele.
   *
   * Sem `mensagem`, volta ao texto de ajuda — é o que limpa o campo depois de
   * uma tentativa corrigida sem repetir a ajuda em cada ponto de chamada.
   */
  definirEstado: (estado: EstadoCampo, mensagem?: string) => void;
}

function campo(
  id: string,
  rotulo: string,
  tipo: string,
  extras: {
    placeholder?: string;
    autocomplete?: string;
    ajuda?: string;
  } = {},
): CampoMontado {
  const input = h("input", {
    class: "entrada",
    type: tipo,
    id,
    name: id,
    placeholder: extras.placeholder ?? "",
    autocomplete: extras.autocomplete ?? "off",
  }) as HTMLInputElement;

  // Campo de senha ganha o olho: quem digita às cegas erra e não sabe onde,
  // e a alternativa é errar a senha três vezes até desconfiar do teclado.
  const controle =
    tipo === "password"
      ? h("div", { class: "campo__com-olho" }, input, olho(input))
      : input;

  // Uma linha só de apoio: é a ajuda em repouso e vira a mensagem do estado
  // quando há uma. Empilhar as duas faria o formulário mudar de altura a cada
  // validação, e altura que pula move o botão debaixo do cursor.
  const apoio = h("div", { id: `${id}-apoio`, aria: { live: "polite" } });

  const definirEstado = (estado: EstadoCampo, mensagem?: string): void => {
    const texto = mensagem ?? extras.ajuda ?? "";
    apoio.textContent = texto;
    apoio.className = CLASSE_APOIO[estado];
    apoio.style.display = texto ? "" : "none";

    input.classList.toggle("entrada--alerta", estado === "alerta");
    input.classList.toggle("entrada--sucesso", estado === "sucesso");
    // Erro reaproveita `aria-invalid`: a borda vermelha já está em
    // components.css e é o que o leitor de tela anuncia como campo inválido.
    if (estado === "erro") input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");

    if (texto) input.setAttribute("aria-describedby", apoio.id);
    else input.removeAttribute("aria-describedby");
  };

  definirEstado("neutro");

  return {
    input,
    definirEstado,
    elemento: h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo", for: id }, rotulo),
      controle,
      apoio,
    ),
  };
}

const OLHO_ABERTO = estatico`<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>`;
const OLHO_FECHADO = estatico`<path d="M2 12s3.6-7 10-7c2 0 3.8.7 5.2 1.6"/><path d="M21.4 9.2c.4.5.6 1 .6 1s-3.6 7-10 7c-1 0-2-.2-2.8-.5"/><path d="M3 3l18 18"/>`;

/**
 * Mostrar e esconder a senha.
 *
 * Volta a esconder ao sair do campo: senha revelada não pode ficar na tela
 * depois que a pessoa parou de digitar.
 */
function olho(input: HTMLInputElement): HTMLElement {
  let visivel = false;

  const marca = icone(OLHO_ABERTO);
  marca.classList.add("campo__olho-icone");

  const botao = h(
    "button",
    {
      class: "campo__olho",
      type: "button",
      title: "Mostrar senha",
      aria: { label: "Mostrar senha", pressed: "false" },
      // `tabindex="-1"` de propósito: no Tab, o caminho natural é senha →
      // Entrar, não senha → olho → Entrar.
      tabindex: "-1",
    },
    marca,
  );

  const aplicar = (): void => {
    input.type = visivel ? "text" : "password";
    marca.innerHTML = visivel ? OLHO_FECHADO : OLHO_ABERTO;
    const texto = visivel ? "Esconder senha" : "Mostrar senha";
    botao.title = texto;
    botao.setAttribute("aria-label", texto);
    botao.setAttribute("aria-pressed", String(visivel));
    botao.classList.toggle("campo__olho--ativo", visivel);
  };

  botao.addEventListener("click", () => {
    visivel = !visivel;
    aplicar();
    input.focus();
  });

  input.addEventListener("blur", () => {
    if (!visivel) return;
    visivel = false;
    aplicar();
  });

  return botao;
}

interface SelecaoMontada {
  elemento: HTMLElement;
  input: HTMLSelectElement;
}

function campoSelecao(
  id: string,
  rotulo: string,
  opcoes: string[],
): SelecaoMontada {
  const select = h(
    "select",
    { class: "selecao", id, name: id },
    h("option", { value: "" }, "Selecione…"),
    ...opcoes.map((o) => h("option", { value: o }, o)),
  ) as HTMLSelectElement;

  return {
    input: select,
    elemento: h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo", for: id }, rotulo),
      select,
    ),
  };
}
