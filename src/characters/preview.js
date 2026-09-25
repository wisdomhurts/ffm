// A small 3D stage for the Wardrobe: one avatar on a studded turntable (drag to spin), emote previews,
// running in place to show off speed trails, plus 3D item thumbnails (hats, accessories, hair) drawn with
// the same renderer. Its own WebGLRenderer on the given canvas; dispose() frees everything.
// createPreview(canvas, {char, look, face, skin}) -> {
//   setLook(look), setFace(img, skin), play(emoteId), running(bool), resize(), dispose(),
//   thumb(kind, id, look) -> Promise<canvas|null>   (kind: 'hat'|'acc'|'hair'), failed (no WebGL) }
import * as THREE from 'three';
import { createAvatar, createHeadBust } from './avatar.js';
import { hatGeometry, accGeometry } from './gear.js';
import { EMOTE } from '../social/catalog.js';
import { HAIR_BY_ID } from './cosmetics.js';

const TAU = Math.PI * 2;

function pedestal() {
  const g = new THREE.Group();
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, ...o });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.5, 0.5, 40), mat('#2f3d86'));
  base.position.y = -0.25;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.05, 0.12, 40), mat('#4d5fc0'));
  top.position.y = 0.02;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.09, 6, 48), mat('#ffd23f', { emissive: '#6a4a00' }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.02;
  g.add(base, top, rim);
  // studs on the top, Roblox-style
  const stud = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10);
  const studs = new THREE.InstancedMesh(stud, mat('#5a6ccc'), 60);
  let n = 0;
  const m = new THREE.Matrix4();
  for (let x = -2.6; x <= 2.61 && n < 60; x += 0.85) {
    for (let z = -2.6; z <= 2.61 && n < 60; z += 0.85) {
      if (Math.hypot(x, z) > 2.75) continue;
      m.makeTranslation(x, 0.12, z);
      studs.setMatrixAt(n++, m);
    }
  }
  studs.count = n;
  g.add(studs);
  // soft contact shadow
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const cg = c.getContext('2d');
  const grd = cg.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,20,0.45)');
  grd.addColorStop(1, 'rgba(0,0,20,0)');
  cg.fillStyle = grd;
  cg.fillRect(0, 0, 64, 64);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.1;
  g.add(sh);
  return g;
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x8a8fb0, 1.35));
  const key = new THREE.DirectionalLight(0xfff1d6, 2.1);
  key.position.set(4, 9, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb8d8ff, 0.9);
  rim.position.set(-6, 5, -6);
  scene.add(rim);
}

function disposeTree(o) {
  o.traverse((x) => {
    if (x.geometry && !x.geometry.userData?.shared) x.geometry.dispose();
    const ms = Array.isArray(x.material) ? x.material : x.material ? [x.material] : [];
    for (const m of ms) {
      m.map?.dispose();
      m.dispose();
    }
  });
}

export function createPreview(canvas, { char, look, face = null, skin = null } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
  } catch (e) {
    console.warn('[wardrobe] no WebGL for the preview', e);
    return { failed: true, setLook() {}, setFace() {}, play() {}, running() {}, resize() {}, thumb: async () => null, dispose() {} };
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  lights(scene);
  const stand = pedestal();
  scene.add(stand);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 200);

  let avatar = createAvatar(char, face, skin, look);
  scene.add(avatar.object3d);

  // turntable: slow auto spin, drag to turn (with a little fling), back to auto after a pause
  let yaw = -0.35;
  let spinV = 0;
  let dragging = false;
  let lastX = 0;
  let idleFor = 9;
  const down = (e) => {
    dragging = true;
    lastX = e.clientX;
    spinV = 0;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    const k = (TAU / Math.max(200, canvas.clientWidth)) * 1.2;
    yaw += dx * k;
    spinV = dx * k * 60;
    idleFor = 0;
  };
  const up = () => {
    dragging = false;
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.style.touchAction = 'none';

  let emote = null; // {id, t, dur}
  let run = false; // running in place (to show off trails); paused while an emote plays
  let runW = 0;

  // ---- thumbnails: rendered into a corner of this canvas and copied out, before the frame's real render
  const thumbScene = new THREE.Scene();
  lights(thumbScene);
  const thumbCam = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  const queue = [];
  const cache = new Map();
  const cosMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  cosMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.2;');
  };
  cosMat.customProgramCacheKey = () => 'avatar-cosmetic';
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const TS = 112; // thumbnail size (CSS px of the canvas corner used)

  function thumbObject(kind, id, look) {
    const g = new THREE.Group();
    let dispose = () => {};
    let view = { yaw: -0.55, pitch: 0.28 };
    const addParts = (p, into) => {
      if (p.main) into.add(new THREE.Mesh(p.main, cosMat));
      if (p.glow) into.add(new THREE.Mesh(p.glow, glowMat));
      const groups = [];
      for (const a of p.anim || []) {
        const sub = new THREE.Group();
        sub.position.set(...a.pos);
        (a.parent != null ? groups[a.parent] : into).add(sub);
        sub.add(new THREE.Mesh(a.geo, a.glow ? glowMat : cosMat));
        groups.push(sub);
      }
    };
    if (kind === 'hat') addParts(hatGeometry(id, look.hatColor), g);
    else if (kind === 'acc') {
      const p = accGeometry(id, look.accColor, look.hairColor);
      addParts(p, g);
      if (p.at === 'back') view = { yaw: Math.PI - 0.7, pitch: 0.2 };
      else if (p.at === 'face') view = { yaw: -0.4, pitch: 0.1 };
      else view = { yaw: -0.3, pitch: 0.1 };
    } else if (kind === 'hair') {
      const bust = createHeadBust({ ...look, hair: id, hat: null }, char.id);
      g.add(bust.object3d);
      dispose = bust.dispose;
      view = { yaw: -0.62, pitch: 0.12 };
      if (HAIR_BY_ID[id]?.sling === 'long' || id === 'pigtails') view.yaw = -0.8;
    }
    return { g, view, dispose };
  }

  function renderThumbs() {
    if (!queue.length) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const S = Math.min(TS, w, h);
    if (S < 32) return;
    const dpr = renderer.getPixelRatio();
    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, S, S);
    renderer.setScissor(0, 0, S, S);
    const budget = performance.now() + 12;
    while (queue.length && performance.now() < budget) {
      const job = queue.shift();
      try {
        const { g, view, dispose } = thumbObject(job.kind, job.id, job.look);
        thumbScene.add(g);
        g.rotation.y = view.yaw;
        g.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(g);
        const size = box.getSize(new THREE.Vector3());
        const c = box.getCenter(new THREE.Vector3());
        const r = Math.max(size.x, size.y, size.z) * 0.62 + 0.05;
        const dist = r / Math.tan((thumbCam.fov * Math.PI) / 360);
        thumbCam.position.set(c.x, c.y + Math.sin(view.pitch) * dist, c.z + Math.cos(view.pitch) * dist);
        thumbCam.lookAt(c);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(thumbScene, thumbCam);
        const out = document.createElement('canvas');
        out.width = out.height = 128;
        const src = Math.round(S * dpr);
        out.getContext('2d').drawImage(canvas, 0, canvas.height - src, src, src, 0, 0, 128, 128);
        thumbScene.remove(g);
        dispose();
        cache.set(job.key, out);
        job.resolve(out);
      } catch (e) {
        console.warn('[wardrobe] thumbnail failed', job.key, e);
        job.resolve(null);
      }
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
  }

  function fit() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
    }
    camera.aspect = w / h;
    // frame the avatar (5.2 studs tall; kids a little less) with the pedestal; wider stages step back
    const tall = 7.4;
    const vFov = (camera.fov * Math.PI) / 180;
    const byH = tall / 2 / Math.tan(vFov / 2);
    const byW = 7.2 / 2 / Math.tan(vFov / 2) / camera.aspect;
    const d = Math.max(byH, byW) * 1.02;
    camera.position.set(0, 3.2 + d * 0.12, d);
    camera.lookAt(0, 2.55, 0);
    camera.updateProjectionMatrix();
  }

  let raf = 0;
  let last = performance.now();
  let disposed = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!canvas.isConnected || canvas.clientWidth < 2) return;
    fit();
    idleFor += dt;
    if (!dragging) {
      spinV *= Math.exp(-dt * 3);
      yaw += spinV * dt;
      if (idleFor > 2.5) yaw += dt * 0.45 * Math.min(1, (idleFor - 2.5) / 1.5);
    }
    avatar.object3d.rotation.y = yaw;
    stand.rotation.y = yaw;
    runW += ((run && !emote ? 1 : 0) - runW) * Math.min(1, dt * 6);
    let em = null;
    let et = 0;
    if (emote) {
      emote.t += dt;
      if (emote.t > emote.dur) emote = null;
      else {
        em = emote.id;
        et = emote.t;
      }
    }
    avatar.update(dt, { time: now / 1000, speed: em ? 0 : runW * 20, onGround: true, vy: 0, carrying: null, stunned: false, swing: -1, celebrating: false, invisible: 1, isLocal: true, coil: false, interacting: null, emote: em, emoteT: et, inPlace: true });
    renderThumbs();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    failed: false,
    setLook(l) {
      avatar.setLook(l);
    },
    setFace(img, sk) {
      avatar.setFace(img, sk);
    },
    /** Rebuild for another profile (different family base). */
    reset(c, l, img, sk) {
      scene.remove(avatar.object3d);
      avatar.dispose();
      char = c;
      avatar = createAvatar(c, img, sk, l);
      scene.add(avatar.object3d);
    },
    play(id) {
      const def = EMOTE[id];
      if (!def) return;
      emote = { id, t: 0, dur: def.loop ? 5 : def.dur };
    },
    running(on) {
      run = !!on;
    },
    get emoting() {
      return emote?.id || null;
    },
    resize: fit,
    thumb(kind, id, l) {
      const key = kind + ':' + id + ':' + (kind === 'hat' ? l.hatColor || '' : kind === 'acc' ? (l.accColor || '') + (id === 'mustache' ? l.hairColor : '') : l.hairColor + l.skin);
      if (cache.has(key)) return Promise.resolve(cache.get(key));
      const pending = queue.find((j) => j.key === key);
      if (pending) return pending.promise;
      let resolve;
      const promise = new Promise((r) => (resolve = r));
      queue.push({ key, kind, id, look: { ...l }, resolve, promise });
      return promise;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      for (const j of queue) j.resolve(null);
      queue.length = 0;
      scene.remove(avatar.object3d);
      avatar.dispose();
      disposeTree(stand);
      cosMat.dispose();
      glowMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
