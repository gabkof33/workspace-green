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

export interface MapaOrbital {
  /** Realça um corpo e apaga o resto. `null` limpa. */
  focar(id: string | null): void;
  /** Multiplica a velocidade das órbitas. */
  acelerar(fator: number): void;
  destruir(): void;
}

export interface OpcoesMapaOrbital {
  palco: HTMLElement;
  /** Clique num corpo, ou no vazio (`null`). */
  aoSelecionar: (id: string | null) => void;
}

/** 0 = disco plano, maior = funil mais fundo. */
const INCLINACAO_FUNIL = 0.3;
const ALTURA_FUNIL =
  Math.max(...PLANETAS.map((p) => p.raioOrbita)) * INCLINACAO_FUNIL;
const CENTRO_FUNIL = ALTURA_FUNIL / 2;

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
  cena.fog = new THREE.FogExp2(0x05070d, 0.014);

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
  const vortice: THREE.LineBasicMaterial[] = [];
  const grupoVortice = new THREE.Group();
  /** Tudo que precisa ser devolvido à GPU no `destruir`. */
  const descartaveis: Array<{ dispose(): void }> = [];

  let arrastando = false;
  let inicioArrasto = { x: 0, y: 0 };
  let rotacaoInicial = { x: 0, y: 0 };
  let rotacao = { x: 0.5, y: 0.4 };
  let giroAutomatico = true;
  let escalaTempo = 1;
  /** 0 = afastado (o funil vira vórtice), 1 = perto (uma face só). */
  let zoom = 0.45;
  let zoomAlvo = 0.45;
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

  function anelOrbita(
    raioAnel: number,
    cor: number,
    opacidade: number,
    y = 0,
  ): THREE.Line {
    const pontos: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pontos.push(
        new THREE.Vector3(raioAnel * Math.cos(a), y, raioAnel * Math.sin(a)),
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
      opacity: 0.85,
    });
    const halo = new THREE.Sprite(haloMaterial);
    const haloBase = tamanho * (sol ? 5.2 : 4.4);
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
      const r = 60 + Math.random() * 140;
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
    const corpo = criarCorpo(SOL.id, SOL.rotulo, SOL.cor, 1.15, true);
    raiz.add(corpo.grupo);
    corpos.set(SOL.id, corpo);
  }

  function montarPlanetas(): void {
    for (const p of PLANETAS) {
      const y = p.raioOrbita * INCLINACAO_FUNIL;
      raiz.add(anelOrbita(p.raioOrbita, p.cor, 0.16, y));

      const pivo = new THREE.Group();
      // Ângulo inicial sorteado: com todos partindo de zero, os planetas
      // ficariam alinhados numa fila só.
      pivo.rotation.y = Math.random() * Math.PI * 2;
      raiz.add(pivo);

      const corpo = criarCorpo(p.id, p.rotulo, p.cor, 0.55, false);
      corpo.grupo.position.set(p.raioOrbita, y, 0);
      corpo.pivo = pivo;
      corpo.velocidade = p.velocidadeOrbita;
      pivo.add(corpo.grupo);
      corpos.set(p.id, corpo);

      p.satelites.forEach((s, i) => {
        const raioSat = 1.5 + i * 0.85;
        corpo.grupo.add(anelOrbita(raioSat, p.cor, 0.22));

        const pivoSat = new THREE.Group();
        pivoSat.rotation.y = Math.random() * Math.PI * 2;
        corpo.grupo.add(pivoSat);

        const sat = criarCorpo(s.id, s.rotulo, p.cor, 0.24, false);
        sat.grupo.position.set(raioSat, 0, 0);
        sat.pivo = pivoSat;
        sat.velocidade = 0.55 - i * 0.07 + Math.random() * 0.05;
        pivoSat.add(sat.grupo);
        corpos.set(s.id, sat);
      });
    }
  }

  function montarVortice(): void {
    cena.add(grupoVortice);

    const fios = 9;
    const pontos = 140;
    const raioTopo = (ALTURA_FUNIL / INCLINACAO_FUNIL) * 1.35;
    const yTopo = ALTURA_FUNIL + 5;
    const yBase = -1.5;
    const torcao = Math.PI * 3.4;
    const cores = [0x7fa8ff, 0x9fb8ff, 0x6f8fe0];

    for (let f = 0; f < fios; f++) {
      const anguloBase = (f / fios) * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= pontos; i++) {
        const u = i / pontos; // 0 = topo largo, 1 = fundo, junto ao sol
        const r = raioTopo * Math.pow(1 - u, 1.25) + 0.25;
        const angulo = anguloBase + u * torcao;
        const y = yTopo + (yBase - yTopo) * u;
        pts.push(new THREE.Vector3(r * Math.cos(angulo), y, r * Math.sin(angulo)));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        // O índice sempre existe (módulo do tamanho), mas o compilador não
        // sabe disso com `noUncheckedIndexedAccess`.
        color: cores[f % cores.length] ?? cores[0]!,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      descartaveis.push(geo, mat);
      grupoVortice.add(new THREE.Line(geo, mat));
      vortice.push(mat);
    }
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
    if (id === null) {
      for (const c of corpos.values()) {
        c.haloMaterial.opacity = 0.85;
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

      c.haloMaterial.opacity = apagado ? 0.18 : selecionado ? 1 : 0.85;
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

  /* ---------- Eventos ---------- */

  const aoRedimensionar = (): void => {
    camera.aspect = o.palco.clientWidth / o.palco.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(o.palco.clientWidth, o.palco.clientHeight);
  };

  let moveu = false;

  const aoPressionar = (ev: PointerEvent): void => {
    arrastando = true;
    moveu = false;
    giroAutomatico = false;
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
      rotacao.y = rotacaoInicial.y + dx * 0.005;
      rotacao.x = Math.max(0.15, Math.min(1.3, rotacaoInicial.x - dy * 0.005));
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

  function clicar(ev: PointerEvent): void {
    const caixa = o.palco.getBoundingClientRect();
    ponteiro.x = ((ev.clientX - caixa.left) / caixa.width) * 2 - 1;
    ponteiro.y = -((ev.clientY - caixa.top) / caixa.height) * 2 + 1;
    raio.setFromCamera(ponteiro, camera);
    const atingidos = raio.intersectObjects(alvos, false);
    const id = atingidos[0]?.object.userData.id;
    o.aoSelecionar(typeof id === "string" ? id : null);
  }

  o.palco.addEventListener("pointerdown", aoPressionar);
  o.palco.addEventListener("wheel", aoRolar, { passive: false });
  window.addEventListener("pointermove", aoMover);
  window.addEventListener("pointerup", aoSoltar);
  window.addEventListener("resize", aoRedimensionar);

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

    // O zoom não só aproxima: ele gira a câmera em torno do funil, como quem
    // anda de uma face do cubo até a outra. Cada nível revela uma fatia.
    const giro = (zoom - 0.5) * 1.7;
    const inclina = (zoom - 0.5) * 0.55;
    raiz.rotation.y = rotacao.y + giro;

    const distancia = 46 - zoom * 30;
    const tilt = Math.max(0.1, Math.min(1.45, rotacao.x + inclina));
    camera.position.set(
      0,
      Math.sin(tilt) * distancia * 0.85 + CENTRO_FUNIL,
      Math.cos(tilt) * distancia,
    );
    camera.lookAt(0, CENTRO_FUNIL, 0);

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

    // O vórtice só aparece de longe: é o funil visto de fora.
    const opacidadeVortice = (1 - zoom) * 0.5;
    grupoVortice.rotation.y += 0.0006 * dt * 60;
    for (const m of vortice) m.opacity = opacidadeVortice;

    renderer.render(cena, camera);
  }

  montarEstrelas();
  montarSol();
  montarPlanetas();
  montarLigacoes();
  montarVortice();
  animar();

  return {
    focar,
    acelerar: (fator) => {
      escalaTempo = Math.max(0.1, Math.min(4, escalaTempo * fator));
    },
    destruir: () => {
      vivo = false;
      cancelAnimationFrame(quadro);
      o.palco.removeEventListener("pointerdown", aoPressionar);
      o.palco.removeEventListener("wheel", aoRolar);
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("resize", aoRedimensionar);
      // Geometria, material e textura vivem na GPU e não saem com o
      // recolhedor de lixo do JavaScript.
      for (const d of descartaveis) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
