/**
 * Cena orbital do mapa da empresa — Three.js em TypeScript.
 *
 * O que muda em relação ao protótipo em HTML solto, e por quê:
 *
 *   · `three` é dependência do projeto, não `<script>` de CDN. Com os tipos
 *     instalados, o compilador cobre a cena inteira; e a tela não depende de
 *     rede de terceiro para desenhar.
 *   · A cena tem CICLO DE VIDA. O protótipo chamava `requestAnimationFrame`
 *     para sempre e escutava a janela sem nunca soltar: dentro de uma SPA que
 *     troca de página, isso continuaria rodando (e consumindo GPU) depois de
 *     sair da tela. `destruir()` para o laço, solta os ouvintes e devolve a
 *     memória da GPU.
 *   · Os rótulos usam a fonte do app (Geist), não Space Grotesk de CDN.
 *
 * O resto — funil, vórtice, satélites, arcos de ligação, foco por seleção — é
 * o mesmo desenho, com os mesmos números.
 */

import * as THREE from "three";
import { CORPOS, LIGACOES, PLANETAS, SOL, ligadosA } from "@/lib/mapa-empresa";

/**
 * As três leituras do sistema não são modos que se escolhem — são o que a
 * CÂMERA revela conforme o ângulo, sem nenhum botão no meio:
 *
 *   de cima   funil: órbitas em alturas crescentes, o cliente no fundo.
 *             Distância até o cliente lida como profundidade.
 *   meia      o sistema solar de sempre, órbitas em perspectiva.
 *   deitada   hélice: o funil se achata, o sistema tomba e cada área passa a
 *             arrastar um rastro em espiral. É o comportamento real — como o
 *             sol também se move, a órbita fechada é só o que se vê de
 *             dentro; de fora, nenhum ponto se repete.
 *
 * Deitar a câmera é o gesto que atravessa as três. Ver de outro lado e mudar
 * de leitura viram a mesma ação, e não há estado escondido para lembrar.
 */
export interface MapaOrbital {
  /** Realça um corpo e apaga o resto. `null` limpa. */
  focar(id: string | null): void;
  /** Multiplica a velocidade das órbitas. */
  acelerar(fator: number): void;
  /** Volta a câmera ao enquadramento inicial. */
  reenquadrar(): void;
  destruir(): void;
}

export interface OpcoesMapaOrbital {
  palco: HTMLElement;
  /** Clique num corpo, ou no vazio (`null`). */
  aoSelecionar: (id: string | null) => void;
}

/** 0 = disco plano, maior = funil mais fundo. */
const INCLINACAO_FUNIL = 0.3;

/** Órbita do satélite `i` dentro do sistema do seu planeta. */
const raioSatelite = (i: number): number => 1.2 + i * 0.6;

/**
 * Raio de cada órbita, calculado a partir do espaço que a área ocupa.
 *
 * Antes eram sete números escritos à mão, com 2.2 de distância entre órbitas
 * vizinhas — e o sistema de satélites de uma área sozinho chega a 3.0 de raio.
 * Resultado: satélite de uma área cruzando a órbita da outra, e planeta
 * aparecendo onde o funil já não estava.
 *
 * Aqui cada área reserva o seu sistema inteiro mais uma margem, e a seguinte
 * começa depois disso. A ORDEM continua sendo a declarada nos dados; o que
 * muda é a distância, que passa a ser consequência do conteúdo.
 */
const RAIOS: Map<string, number> = (() => {
  const folga = (p: (typeof PLANETAS)[number]): number =>
    raioSatelite(Math.max(0, p.satelites.length - 1)) + 0.9;

  const mapa = new Map<string, number>();
  let raio = 6;

  PLANETAS.forEach((p, i) => {
    const anterior = PLANETAS[i - 1];
    if (anterior) raio += folga(anterior) + folga(p);
    mapa.set(p.id, raio);
  });

  return mapa;
})();

const raioDe = (id: string): number => RAIOS.get(id) ?? 6;

const ALTURA_FUNIL = Math.max(...RAIOS.values()) * INCLINACAO_FUNIL;

interface CorpoCena {
  grupo: THREE.Group;
  malha: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  halo: THREE.Sprite;
  haloMaterial: THREE.SpriteMaterial;
  rotulo: THREE.Sprite;
  haloBase: number;
  pivo: THREE.Group | null;
  velocidade: number;
}

export function criarMapaOrbital(o: OpcoesMapaOrbital): MapaOrbital {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(o.palco.clientWidth, o.palco.clientHeight);
  o.palco.appendChild(renderer.domElement);

  const cena = new THREE.Scene();
  // 0.006 e não 0.014: a densidade é por unidade de distância, e o sistema
  // dobrou de tamanho — a névoa antiga apagava as órbitas externas inteiras.
  cena.fog = new THREE.FogExp2(0x05070d, 0.006);

  const camera = new THREE.PerspectiveCamera(
    46,
    o.palco.clientWidth / o.palco.clientHeight,
    0.1,
    400,
  );
  const relogio = new THREE.Clock();
  const raio = new THREE.Raycaster();
  const ponteiro = new THREE.Vector2(999, 999);

  const raiz = new THREE.Group();
  cena.add(raiz);

  const corpos = new Map<string, CorpoCena>();
  const alvos: THREE.Mesh[] = [];
  const arcos: Array<{
    linha: THREE.Line;
    // Guardado à parte porque `Line.material` é `Material | Material[]`, e o
    // tipo largo não tem `opacity` — a alternativa seria uma asserção por uso.
    material: THREE.LineBasicMaterial;
    faisca: THREE.Sprite;
  }> = [];
  /** Tudo que precisa ser devolvido à GPU no `destruir`. */
  const descartaveis: Array<{ dispose(): void }> = [];

  /** Planeta, anel e rastro — o que a câmera levanta, baixa e acende. */
  const orbitas: Array<{
    anel: THREE.Line;
    grupo: THREE.Group;
    raio: number;
    rastro: THREE.Line;
    rastroMaterial: THREE.LineBasicMaterial;
  }> = [];

  /**
   * Quanto a câmera está deitada, de 0 (de cima) a 1 (rente ao plano).
   * Derivado da inclinação a cada quadro; é ele que rege funil, tombamento e
   * rastro. Interpolado para o gesto não fazer o sistema pular.
   */
  let lado = 0;

  /** Deslocamento manual do alvo — o arrasto com o botão direito o move. */
  const alvoCamera = new THREE.Vector3(0, 0, 0);
  /** Onde a câmera olha AGORA; persegue o alvo em vez de saltar até ele. */
  const mira = new THREE.Vector3(0, 0, 0);
  const _foco = new THREE.Vector3();
  /** Corpo que a câmera está acompanhando, se houver. */
  let seguindo: string | null = null;
  /** Ligado enquanto a câmera volta ao enquadramento inicial. */
  let voltando = false;

  let arrastando = false;
  let deslocando = false;
  const deslocamentoInicial = new THREE.Vector3();
  let inicioArrasto = { x: 0, y: 0 };
  let rotacaoInicial = { x: 0, y: 0 };
  let rotacao = { x: 0.5, y: 0.4 };
  let giroAutomatico = true;
  let escalaTempo = 1;
  /** 0 = afastado (o funil vira vórtice), 1 = perto (uma face só). */
  let zoom = 0.45;
  let zoomAlvo = 0.45;
  /**
   * Distância corrente da câmera; persegue o alvo em vez de saltar. Começa no
   * valor do zoom inicial, senão a tela abriria com um avanço que ninguém
   * pediu.
   */
  let distancia = 95 - 0.45 * 62;
  /** Duplo clique: aproximação máxima no corpo focado. */
  let aproximado = false;
  let quadro = 0;
  let vivo = true;

  const toques = new Map<number, { x: number; y: number }>();
  let pincaInicial: number | null = null;
  let zoomNaPinca = 0.45;

  /* ---------- Texturas e corpos ---------- */

  function texturaBrilho(): THREE.CanvasTexture {
    const lado = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = lado;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(
        lado / 2, lado / 2, 0,
        lado / 2, lado / 2, lado / 2,
      );
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.5)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, lado, lado);
    }
    const tex = new THREE.CanvasTexture(canvas);
    descartaveis.push(tex);
    return tex;
  }

  function spriteDeTexto(texto: string, grande: boolean): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const tamanho = grande ? 44 : 30;
    // Geist, a fonte do app — o protótipo pedia Space Grotesk a um CDN.
    const fonte = `${grande ? 700 : 600} ${tamanho}px Geist, system-ui, sans-serif`;

    if (!ctx) return new THREE.Sprite();

    ctx.font = fonte;
    const respiro = 14;
    const largura = ctx.measureText(texto).width + respiro * 2;
    canvas.width = largura;
    canvas.height = tamanho + respiro * 2;

    // Medir redimensiona o canvas, e redimensionar zera o contexto: a fonte
    // tem de ser dita de novo depois.
    ctx.font = fonte;
    ctx.fillStyle = "rgba(238,241,248,0.95)";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 8;
    ctx.fillText(texto, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
    });
    descartaveis.push(tex, material);

    const sprite = new THREE.Sprite(material);
    const escala = 0.0065 * (grande ? 1.1 : 1);
    sprite.scale.set(canvas.width * escala, canvas.height * escala, 1);
    return sprite;
  }

  /**
   * Anel sempre em y=0; quem levanta é o `position.y` de quem chama. Assim
   * trocar de modo é mover o objeto, não reconstruir a geometria a cada
   * quadro da transição.
   */
  function anelOrbita(
    raioAnel: number,
    cor: number,
    opacidade: number,
  ): THREE.Line {
    const pontos: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pontos.push(
        new THREE.Vector3(raioAnel * Math.cos(a), 0, raioAnel * Math.sin(a)),
      );
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pontos);
    const mat = new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: opacidade });
    descartaveis.push(geo, mat);
    return new THREE.Line(geo, mat);
  }

  function criarCorpo(
    id: string,
    rotulo: string,
    cor: number,
    tamanho: number,
    sol: boolean,
  ): CorpoCena {
    const grupo = new THREE.Group();

    const geo = new THREE.SphereGeometry(tamanho, 24, 24);
    const material = new THREE.MeshBasicMaterial({ color: cor });
    const malha = new THREE.Mesh(geo, material);
    grupo.add(malha);
    descartaveis.push(geo, material);

    const haloMaterial = new THREE.SpriteMaterial({
      map: texturaBrilho(),
      color: cor,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.5,
    });
    const halo = new THREE.Sprite(haloMaterial);
    // Halo bem menor que o de antes (5.2/4.4): com os corpos maiores e as
    // órbitas mais largas, aquele borrão engolia o planeta e encostava no
    // vizinho. O brilho é para dizer "isto emite", não para virar a bola.
    const haloBase = tamanho * (sol ? 3.4 : 2.4);
    halo.scale.set(haloBase, haloBase, 1);
    grupo.add(halo);
    descartaveis.push(haloMaterial);

    // Alvo de clique maior que a esfera: acertar um satélite de 0.24 de raio
    // com o ponteiro seria trabalho de mira.
    const alvoGeo = new THREE.SphereGeometry(tamanho * 1.9, 8, 8);
    const alvoMat = new THREE.MeshBasicMaterial({ visible: false });
    const alvo = new THREE.Mesh(alvoGeo, alvoMat);
    alvo.userData.id = id;
    grupo.add(alvo);
    alvos.push(alvo);
    descartaveis.push(alvoGeo, alvoMat);

    const texto = spriteDeTexto(rotulo, sol);
    texto.position.y = tamanho + (sol ? 1.3 : 0.85);
    grupo.add(texto);

    return {
      grupo, malha, material, halo, haloMaterial, rotulo: texto,
      haloBase, pivo: null, velocidade: 0,
    };
  }

  /* ---------- Montagem ---------- */

  function montarEstrelas(): void {
    const quantas = 900;
    const posicoes = new Float32Array(quantas * 3);
    for (let i = 0; i < quantas; i++) {
      const r = 130 + Math.random() * 240;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      posicoes[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      posicoes[i * 3 + 1] = r * Math.cos(phi);
      posicoes[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posicoes, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x8b93ab, size: 0.6, transparent: true, opacity: 0.55, sizeAttenuation: true,
    });
    descartaveis.push(geo, mat);
    cena.add(new THREE.Points(geo, mat));
  }

  function montarSol(): void {
    const corpo = criarCorpo(SOL.id, SOL.rotulo, SOL.cor, 1.6, true);
    raiz.add(corpo.grupo);
    corpos.set(SOL.id, corpo);
  }

  function montarPlanetas(): void {
    for (const p of PLANETAS) {
      const raio = raioDe(p.id);
      const y = raio * INCLINACAO_FUNIL;

      const anel = anelOrbita(raio, p.cor, 0.16);
      anel.position.y = y;
      raiz.add(anel);

      const pivo = new THREE.Group();
      // Ângulo inicial sorteado: com todos partindo de zero, os planetas
      // ficariam alinhados numa fila só.
      pivo.rotation.y = Math.random() * Math.PI * 2;
      raiz.add(pivo);

      const corpo = criarCorpo(p.id, p.rotulo, p.cor, 0.85, false);
      corpo.grupo.position.set(raio, y, 0);
      corpo.pivo = pivo;
      corpo.velocidade = p.velocidadeOrbita;
      pivo.add(corpo.grupo);
      corpos.set(p.id, corpo);

      // O rastro nasce preso ao PIVÔ: girando junto, ele fica parado em
      // relação ao planeta, que é o que se vê num sistema em movimento
      // constante — a hélice é a forma, não a animação.
      const { linha: rastro, material: rastroMaterial } = heliceDoPlaneta(
        raio,
        p.cor,
      );
      rastroMaterial.opacity = 0;
      pivo.add(rastro);

      orbitas.push({
        anel,
        grupo: corpo.grupo,
        raio,
        rastro,
        rastroMaterial,
      });

      p.satelites.forEach((s, i) => {
        const raioSat = raioSatelite(i);
        corpo.grupo.add(anelOrbita(raioSat, p.cor, 0.22));

        const pivoSat = new THREE.Group();
        pivoSat.rotation.y = Math.random() * Math.PI * 2;
        corpo.grupo.add(pivoSat);

        const sat = criarCorpo(s.id, s.rotulo, p.cor, 0.34, false);
        sat.grupo.position.set(raioSat, 0, 0);
        sat.pivo = pivoSat;
        sat.velocidade = 0.55 - i * 0.07 + Math.random() * 0.05;
        pivoSat.add(sat.grupo);
        corpos.set(s.id, sat);
      });
    }
  }

  /**
   * O rastro que o planeta deixa quando o sistema inteiro avança.
   *
   * Parte da posição do planeta e recua enrolando: raio afunilando e altura
   * caindo, de modo que os rastros de todas as órbitas convergem para um
   * ponto atrás do sol. É o desenho do modelo helicoidal — a órbita fechada é
   * o que se vê de dentro; de fora, nenhum ponto se repete.
   */
  function heliceDoPlaneta(
    raioOrbita: number,
    cor: number,
  ): { linha: THREE.Line; material: THREE.LineBasicMaterial } {
    const voltas = 2.6;
    const passos = 220;
    const comprimento = 26 + raioOrbita * 1.2;
    const pontos: THREE.Vector3[] = [];

    for (let i = 0; i <= passos; i++) {
      const u = i / passos;
      const angulo = -u * voltas * Math.PI * 2;
      // Afunila até 22% do raio: é o que fecha o vórtice atrás do sol.
      const r = raioOrbita * (1 - 0.78 * u);
      pontos.push(
        new THREE.Vector3(r * Math.cos(angulo), -u * comprimento, r * Math.sin(angulo)),
      );
    }

    const geo = new THREE.BufferGeometry().setFromPoints(pontos);
    const mat = new THREE.LineBasicMaterial({
      color: cor,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    descartaveis.push(geo, mat);
    return { linha: new THREE.Line(geo, mat), material: mat };
  }

  function montarLigacoes(): void {
    for (const [a, b] of LIGACOES) {
      const macro =
        CORPOS[a]?.especie === "planeta" && CORPOS[b]?.especie === "planeta";
      const cor = macro ? 0x9db8ff : 0xcbb6f7;
      const opacidade = macro ? 0.3 : 0.16;

      const geo = new THREE.BufferGeometry().setFromPoints(
        new Array(25).fill(0).map(() => new THREE.Vector3()),
      );
      const mat = new THREE.LineBasicMaterial({
        color: cor,
        transparent: true,
        opacity: opacidade,
      });
      const linha = new THREE.Line(geo, mat);
      linha.userData = { a, b, opacidade };
      cena.add(linha);
      descartaveis.push(geo, mat);

      const faiscaMat = new THREE.SpriteMaterial({
        map: texturaBrilho(),
        color: cor,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: macro ? 0.9 : 0.6,
      });
      const faisca = new THREE.Sprite(faiscaMat);
      const tamanho = macro ? 0.45 : 0.3;
      faisca.scale.set(tamanho, tamanho, 1);
      faisca.userData = { velocidade: 0.1 + Math.random() * 0.05, defasagem: Math.random() };
      cena.add(faisca);
      descartaveis.push(faiscaMat);

      arcos.push({ linha, material: mat, faisca });
    }
  }

  /* ---------- Foco ---------- */

  function focar(id: string | null): void {
    /**
     * Selecionar já é o "duplo clique": a câmera passa a acompanhar o corpo e
     * chega mais perto. Limpar dá o replay — volta ao enquadramento inicial,
     * andando até lá em vez de cortar.
     *
     * O sol não é acompanhado: ele já é o centro, e seguir o centro só faria
     * a câmera aproximar sem nada acontecer.
     */
    const anterior = seguindo;
    seguindo = id !== null && id !== SOL.id ? id : null;
    // Aproximação máxima é do corpo em que se deu o duplo clique: mudar de
    // alvo volta à distância normal de acompanhamento.
    if (seguindo !== anterior) aproximado = false;
    voltando = seguindo === null;
    if (seguindo) {
      // 0.8 na faixa: chega perto o bastante para ler o corpo e ainda deixa
      // quatro quintos do curso de rolagem para AFASTAR — que é o lado que
      // interessa quando se quer seguir uma ligação até o outro extremo.
      zoomAlvo = 0.8;
      alvoCamera.set(0, 0, 0);
      // O giro de vitrine sai de cena: girando o sistema inteiro enquanto a
      // câmera persegue um corpo, ele varre a tela de um lado ao outro.
      giroAutomatico = false;
    } else if (id === null) {
      reenquadrar();
    }

    if (id === null) {
      for (const c of corpos.values()) {
        c.haloMaterial.opacity = 0.5;
        c.material.transparent = false;
        c.material.opacity = 1;
        c.rotulo.material.opacity = 1;
        c.halo.scale.set(c.haloBase, c.haloBase, 1);
      }
      for (const { linha, material, faisca } of arcos) {
        material.opacity = linha.userData.opacidade as number;
        faisca.material.opacity = 0.9;
      }
      return;
    }

    const vizinhos = new Set(ligadosA(id));
    for (const [cid, c] of corpos) {
      const selecionado = cid === id;
      const apagado = !selecionado && !vizinhos.has(cid);

      c.haloMaterial.opacity = apagado ? 0.12 : selecionado ? 0.75 : 0.5;
      c.material.transparent = apagado;
      c.material.opacity = apagado ? 0.28 : 1;
      c.rotulo.material.opacity = apagado ? 0.25 : 1;
      const escala = selecionado ? c.haloBase * 1.4 : c.haloBase;
      c.halo.scale.set(escala, escala, 1);
    }
    for (const { linha, material, faisca } of arcos) {
      const envolvido = linha.userData.a === id || linha.userData.b === id;
      material.opacity = envolvido ? 0.85 : 0.04;
      faisca.material.opacity = envolvido ? 1 : 0.04;
    }
  }

  /* ---------- Modos ---------- */

  function reenquadrar(): void {
    seguindo = null;
    voltando = true;
    rotacao = { x: 0.5, y: rotacao.y };
    alvoCamera.set(0, 0, 0);
    zoomAlvo = 0.45;
  }

  /* ---------- Eventos ---------- */

  const aoRedimensionar = (): void => {
    const largura = o.palco.clientWidth;
    const altura = o.palco.clientHeight;
    // Palco ainda sem medida (a página está montando): recalcular agora
    // gravaria uma proporção de zero, e a cena só voltaria ao normal no
    // próximo redimensionamento.
    if (largura === 0 || altura === 0) return;

    camera.aspect = largura / altura;
    camera.updateProjectionMatrix();
    renderer.setSize(largura, altura);
  };

  let moveu = false;

  const aoPressionar = (ev: PointerEvent): void => {
    arrastando = true;
    moveu = false;
    giroAutomatico = false;
    deslocando = ev.button === 2 || ev.button === 1 || ev.shiftKey;
    deslocamentoInicial.copy(alvoCamera);
    o.palco.classList.add("mapa__palco--arrastando");
    inicioArrasto = { x: ev.clientX, y: ev.clientY };
    rotacaoInicial = { x: rotacao.x, y: rotacao.y };

    if (ev.pointerType === "touch") {
      toques.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (toques.size === 2) {
        const [p1, p2] = [...toques.values()];
        pincaInicial = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y);
        zoomNaPinca = zoomAlvo;
      }
    }
  };

  const aoMover = (ev: PointerEvent): void => {
    const caixa = o.palco.getBoundingClientRect();
    ponteiro.x = ((ev.clientX - caixa.left) / caixa.width) * 2 - 1;
    ponteiro.y = -((ev.clientY - caixa.top) / caixa.height) * 2 + 1;

    if (arrastando) {
      const dx = ev.clientX - inicioArrasto.x;
      const dy = ev.clientY - inicioArrasto.y;
      // Três pixels de folga: sem isso, a mão trêmula transforma clique em
      // arrasto e a seleção nunca acontece.
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moveu = true;
      if (deslocando) {
        // Botão direito (ou Shift) desloca o alvo em vez de girar: é o que
        // permite tirar o sol do centro e olhar uma órbita de perto.
        const escala = 0.02 * (1.4 - zoom);
        alvoCamera.set(
          deslocamentoInicial.x - dx * escala,
          deslocamentoInicial.y + dy * escala,
          deslocamentoInicial.z,
        );
      } else {
        rotacao.y = rotacaoInicial.y + dx * 0.005;
        // Trava larga: de quase a pino (0.02) a rente ao plano (1.55). A
        // anterior parava em 1.3 e nunca deixava ver o sistema DEITADO, que é
        // o ângulo em que a hélice se lê.
        rotacao.x = Math.max(0.02, Math.min(1.55, rotacaoInicial.x - dy * 0.005));
      }
    }

    if (ev.pointerType === "touch" && toques.has(ev.pointerId)) {
      toques.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (toques.size === 2 && pincaInicial) {
        const [p1, p2] = [...toques.values()];
        const dist = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y);
        zoomAlvo = Math.max(0, Math.min(1, zoomNaPinca + (dist - pincaInicial) * 0.0025));
      }
    }
  };

  const aoSoltar = (ev: PointerEvent): void => {
    arrastando = false;
    o.palco.classList.remove("mapa__palco--arrastando");
    if (!moveu) clicar(ev);
    toques.delete(ev.pointerId);
    pincaInicial = null;
  };

  const aoRolar = (ev: WheelEvent): void => {
    ev.preventDefault();
    zoomAlvo = Math.max(0, Math.min(1, zoomAlvo - ev.deltaY * 0.0007));
  };

  /** Que corpo está sob o ponteiro, se houver. */
  function corpoSob(ev: MouseEvent): string | null {
    const caixa = o.palco.getBoundingClientRect();
    ponteiro.x = ((ev.clientX - caixa.left) / caixa.width) * 2 - 1;
    ponteiro.y = -((ev.clientY - caixa.top) / caixa.height) * 2 + 1;
    raio.setFromCamera(ponteiro, camera);
    const id = raio.intersectObjects(alvos, false)[0]?.object.userData.id;
    return typeof id === "string" ? id : null;
  }

  function clicar(ev: PointerEvent): void {
    o.aoSelecionar(corpoSob(ev));
  }

  /**
   * Duplo clique: chega perto de verdade.
   *
   * Dois níveis de propósito. O clique simples seleciona e acompanha de uma
   * distância em que ainda se vê a vizinhança — é a leitura. O duplo clique
   * fecha em cima do corpo, para ler o rótulo de um satélite pequeno. Sem os
   * dois, ou a seleção joga a câmera longe do contexto, ou nunca chega perto.
   */
  const aoDuploClique = (ev: MouseEvent): void => {
    const id = corpoSob(ev);
    if (!id) return;
    ev.preventDefault();
    aproximado = true;
    o.aoSelecionar(id);
  };

  // Sem o menu de contexto: o botão direito aqui é deslocamento.
  const semMenu = (ev: Event): void => ev.preventDefault();
  o.palco.addEventListener("contextmenu", semMenu);
  o.palco.addEventListener("dblclick", aoDuploClique);
  o.palco.addEventListener("pointerdown", aoPressionar);
  o.palco.addEventListener("wheel", aoRolar, { passive: false });
  window.addEventListener("pointermove", aoMover);
  window.addEventListener("pointerup", aoSoltar);
  window.addEventListener("resize", aoRedimensionar);

  /**
   * O canvas segue o PALCO, não a janela.
   *
   * O tamanho era medido uma vez, na criação, e só recalculado quando a janela
   * mudava. Só que o palco muda de tamanho sem a janela mudar: a fonte Geist
   * termina de carregar e o cabeçalho cresce, o menu lateral recolhe, a barra
   * de rolagem aparece. Em todos esses casos o desenho continuava no tamanho
   * antigo — esticado ou cortado, "comendo pedaços" da cena.
   */
  const observador = new ResizeObserver(aoRedimensionar);
  observador.observe(o.palco);

  /* ---------- Laço ---------- */

  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();

  function animar(): void {
    if (!vivo) return;
    quadro = requestAnimationFrame(animar);

    const dt = Math.min(relogio.getDelta(), 0.05) * escalaTempo;
    const t = relogio.getElapsedTime();

    if (giroAutomatico && !arrastando) rotacao.y += 0.0009;
    zoom += (zoomAlvo - zoom) * 0.08;

    // A rolagem só aproxima e afasta. Antes ela também girava a câmera e
    // mudava a inclinação — dois eixos num gesto só, então mexer no zoom
    // trocava o lado que se estava olhando sem ninguém pedir. Quem muda de
    // lado é o arrasto.
    //
    // E o arrasto gira a CÂMERA, não a cena. Girando a cena, acompanhar um
    // corpo era impossível: ele descrevia um círculo pela tela enquanto a
    // câmera corria atrás. Com o giro na câmera, o alvo fica parado no centro
    // e é o ponto de vista que anda em volta — que é o que permite rodear um
    // satélite para ver de onde vêm as ligações dele.

    /**
     * Distância da câmera.
     *
     * Solta, a curva enquadra o sistema inteiro (~40 de raio). Com um corpo
     * focado, ela passa a sair do TAMANHO dele: a curva global nunca chegava
     * perto o bastante de um satélite de 0.34 de raio — no fim dela a câmera
     * ainda estava a 33 unidades, com a bolinha do tamanho de um pixel.
     *
     * O zoom continua valendo como multiplicador, então a rolagem ainda
     * aproxima e afasta enquanto se acompanha alguém.
     */
    /**
     * Com foco, a rolagem varre de colado (0.5×) a bem afastado (6.5×) SEM
     * soltar o corpo. É o que permite ver as ligações: elas saem em direção a
     * corpos do outro lado do sistema, e de perto o arco deixa o quadro no
     * primeiro pixel. Antes a faixa ia só de 0.6× a 1.6× — nunca dava para
     * afastar o bastante, e a única saída era limpar a seleção.
     */
    const perto = seguindo
      ? (CORPOS[seguindo]?.especie === "satelite" ? 3.2 : 9) *
        (0.4 + (1 - zoom) * 6) *
        (aproximado ? 0.55 : 1)
      : 0;
    distancia += ((seguindo ? perto : 95 - zoom * 62) - distancia) * 0.07;
    const tilt = Math.max(0.02, Math.min(1.56, rotacao.x));

    /**
     * A leitura sai do ÂNGULO, não de um botão.
     *
     * `tilt` é 0 com a câmera rente ao plano e ~1.57 com ela a pino, então
     * `lado` é o quanto se está olhando de lado. Abaixo de 0.55 rad (~32° acima
     * do plano) começa a virada, e ela se completa quando a câmera chega ao
     * plano: o funil se achata, o sistema tomba e os rastros acendem.
     *
     * Interpolado porque o gesto é contínuo mas o quadro é discreto — sem
     * isso, um arrasto rápido faria o sistema saltar entre leituras.
     */
    const alvoLado = 1 - Math.min(1, Math.max(0, tilt / 0.55));
    lado += (alvoLado - lado) * 0.08;

    // Funil só existe de cima: deitado, a altura das órbitas viraria uma
    // escada tapando o que está atrás.
    const inclinacao = INCLINACAO_FUNIL * (1 - lado);
    for (const orb of orbitas) {
      const y = orb.raio * inclinacao;
      orb.anel.position.y = y;
      orb.grupo.position.y = y;
      // O rastro entra no fim da virada, não junto: aparecendo cedo, ele
      // cruza as órbitas ainda levantadas e vira risco solto.
      orb.rastroMaterial.opacity = 0.62 * Math.max(0, lado * 1.6 - 0.6);
    }
    // 1.15 rad ≈ 66°: tomba o bastante para o rastro ir embora no fundo sem
    // que o plano das órbitas vire uma linha.
    raiz.rotation.x = 1.15 * lado;

    /**
     * Para onde a câmera olha.
     *
     * Sem foco, o centro do funil (que desce junto com ele). Com um corpo
     * focado, a posição DELE no mundo — e como ele orbita, o alvo o
     * acompanha, mantendo-o no meio da tela enquanto se move. A interpolação
     * é lenta de propósito: seguir um corpo em movimento com o alvo colado
     * embrulha o estômago.
     */
    const centro = (ALTURA_FUNIL / 2) * (1 - lado);
    const focado = seguindo ? corpos.get(seguindo) : undefined;

    if (focado) {
      // O alvo É a posição do corpo. Antes ela era SOMADA ao centro do funil,
      // que hoje vale 6 — a câmera mirava seis unidades acima do planeta, e
      // ele saía pela borda de baixo. Era isso que "comia pedaços" da tela.
      focado.grupo.getWorldPosition(_foco);
      _foco.add(alvoCamera);
    } else {
      _foco.set(alvoCamera.x, centro + alvoCamera.y, alvoCamera.z);
    }

    // Perseguição mais firme quando há alvo: com 0.06 o corpo ainda estava
    // andando na órbita enquanto a câmera chegava, e nunca centralizava.
    mira.lerp(_foco, focado ? 0.14 : voltando ? 0.06 : 0.25);
    // Chegou: solta a interpolação lenta e volta a responder direto ao gesto.
    if (voltando && mira.distanceToSquared(_foco) < 0.01) voltando = false;

    const horizontal = Math.cos(tilt) * distancia;
    camera.position.set(
      mira.x + Math.sin(rotacao.y) * horizontal,
      mira.y + Math.sin(tilt) * distancia * 0.85,
      mira.z + Math.cos(rotacao.y) * horizontal,
    );
    camera.lookAt(mira);

    for (const c of corpos.values()) {
      if (c.pivo) c.pivo.rotation.y += c.velocidade * dt;
    }

    const pulso = 1 + Math.sin(t * 1.1) * 0.05;
    corpos.get(SOL.id)?.malha.scale.set(pulso, pulso, pulso);

    for (const { linha, faisca } of arcos) {
      const origem = corpos.get(linha.userData.a as string);
      const destino = corpos.get(linha.userData.b as string);
      if (!origem || !destino) continue;

      origem.grupo.getWorldPosition(_a);
      destino.grupo.getWorldPosition(_b);

      const meio = _a.clone().add(_b).multiplyScalar(0.5);
      meio.y += 1.1 + _a.distanceTo(_b) * 0.05;
      const curva = new THREE.QuadraticBezierCurve3(_a.clone(), meio, _b.clone());

      const posicoes = linha.geometry.attributes.position as THREE.BufferAttribute;
      curva.getPoints(24).forEach((p, i) => posicoes.setXYZ(i, p.x, p.y, p.z));
      posicoes.needsUpdate = true;

      const dados = faisca.userData as { velocidade: number; defasagem: number };
      faisca.position.copy(curva.getPointAt((t * dados.velocidade + dados.defasagem) % 1));
    }

    renderer.render(cena, camera);
  }

  montarEstrelas();
  montarSol();
  montarPlanetas();
  montarLigacoes();
  animar();

  return {
    focar,
    reenquadrar,
    acelerar: (fator) => {
      escalaTempo = Math.max(0.1, Math.min(4, escalaTempo * fator));
    },
    destruir: () => {
      vivo = false;
      cancelAnimationFrame(quadro);
      o.palco.removeEventListener("contextmenu", semMenu);
      o.palco.removeEventListener("dblclick", aoDuploClique);
      o.palco.removeEventListener("pointerdown", aoPressionar);
      o.palco.removeEventListener("wheel", aoRolar);
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("resize", aoRedimensionar);
      observador.disconnect();
      // Geometria, material e textura vivem na GPU e não saem com o
      // recolhedor de lixo do JavaScript.
      for (const d of descartaveis) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
