// Shops along the south edge of the plaza: Gear Shop stall, Speed Shop treadmills, Rebirth Altar.
import * as THREE from 'three';
import { Merger, makeRand, drawTexture, chunkyText, roundRect, mergedGeometry, uTime, signMaterial } from './kit.js';

function signTexture(w, h, draw) {
  return drawTexture(w, h, draw, { clamp: true });
}

function boardBg(g, W, H, c1, c2, border = '#1b2440') {
  g.fillStyle = border;
  g.fillRect(0, 0, W, H);
  roundRect(g, 6, 6, W - 12, H - 12, 40);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = border;
  g.stroke();
  roundRect(g, 22, 22, W - 44, H - 44, 28);
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.stroke();
}

function bolt(g, x, y, s, fill) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(10, -40);
  g.lineTo(-18, 6);
  g.lineTo(0, 6);
  g.lineTo(-10, 40);
  g.lineTo(20, -8);
  g.lineTo(2, -8);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#1b2440';
  g.stroke();
  g.restore();
}

function signMesh(tex, w, h) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMaterial(tex, 0.3));
}

function beltTexture() {
  return drawTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#2a2e36';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a404c';
    for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 3);
    g.fillStyle = '#ffcf33';
    g.beginPath();
    g.moveTo(w / 2, 10);
    g.lineTo(w / 2 + 12, 26);
    g.lineTo(w / 2 - 12, 26);
    g.closePath();
    g.fill();
  });
}

// ---------------------------------------------------------------- gear items (each its own spinning mesh)

function itemGeometries() {
  const banana = mergedGeometry((m) => {
    const pts = [[-0.9, 0.9], [-0.55, 0.35], [0, 0.1], [0.55, 0.35], [0.9, 0.9]];
    for (let i = 0; i < pts.length - 1; i++) m.beam(pts[i][0], pts[i][1], 0, pts[i + 1][0], pts[i + 1][1], 0, 0.55 - Math.abs(i - 1.5) * 0.08, '#ffd93a', { prim: 'cyl:8', ao: 0.1 });
    m.beam(-0.9, 0.9, 0, -1.0, 1.15, 0, 0.18, '#6b4a2a', { prim: 'cyl:6' });
    m.prim('sphere:6', 0.92, 0.92, 0, 0.3, 0.3, 0.3, '#5a3a1a');
  });
  const balloon = mergedGeometry((m) => {
    m.prim('sphere:14', 0, 0.9, 0, 1.5, 1.7, 1.5, '#3fb6ff', { ao: 0.2 });
    m.prim('sphere:8', -0.35, 1.25, 0.55, 0.35, 0.45, 0.2, '#d8f3ff', { ao: 0 });
    m.prim('cone:6', 0, 0.02, 0, 0.36, 0.3, 0.36, '#1f7fd0', { rx: Math.PI });
  });
  const coil = mergedGeometry((m) => {
    for (let i = 0; i < 6; i++) m.add('torus:14', new THREE.Matrix4().compose(new THREE.Vector3(0, 0.3 + i * 0.28, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.12, 0, 0)), new THREE.Vector3(1.6, 1.6, 1.6)), i % 2 ? '#62e36b' : '#3fcf5a', { ao: 0 });
    m.cyl(0, 0, 0, 0.75, 0.2, '#2e3440', { seg: 12 });
    m.cyl(0, 1.95, 0, 0.75, 0.2, '#2e3440', { seg: 12 });
  });
  const cloak = mergedGeometry((m) => {
    m.prim('cone:10', 0, 1.0, 0, 1.9, 2.0, 1.9, '#7a3fe0', { ao: 0.25 });
    m.prim('sphere:10', 0, 2.05, 0, 1.0, 1.0, 1.0, '#8f55f0', { ao: 0.15 });
    m.prim('sphere:8', 0, 1.95, 0.32, 0.7, 0.75, 0.5, '#1b1030', { ao: 0 });
    m.prim('sphere:6', 0, 1.45, 0.52, 0.3, 0.3, 0.2, '#ffd23f', { ao: 0 });
  });
  const bucket = mergedGeometry((m) => {
    m.prim('frustum:12', 0, 0.75, 0, 1.6, 1.5, 1.6, '#8fb3d9', { rx: Math.PI, ao: 0.25 });
    m.cyl(0, 1.42, 0, 0.78, 0.1, '#3fb6ff', { seg: 12, ao: 0 });
    m.add('halftorus:10', new THREE.Matrix4().compose(new THREE.Vector3(0, 1.5, 0), new THREE.Quaternion(), new THREE.Vector3(2.0, 2.0, 1.2)), '#5a6878', { ao: 0 });
  });
  return [banana, balloon, coil, cloak, bucket];
}

export function buildShops(ctx) {
  const { root, layout, mats, quality } = ctx;
  const r = makeRand(31337);
  const group = new THREE.Group();
  group.name = 'shops';
  root.add(group);
  const m = new Merger({ uv: 'studs', uvScale: 0.125 });
  const glow = ctx.glow;
  const solid = (minX, maxX, minZ, maxZ, maxY, tag = 'shop') => ctx.colliders.push({ minX, maxX, minY: 0, maxY, minZ, maxZ, tag });
  const spinners = [];

  // ================================================================ GEAR SHOP
  {
    const S = layout.shops.gear;
    const x0 = S.x - 6, x1 = S.x + 6; // -36..-24
    const zf = -57, zb = -60;
    // counter
    m.block(S.x, 0, (zf + zb) / 2, 12, 3.6, 3, '#8a5a34', { ao: 0.35 });
    for (let i = 0; i < 10; i++) m.box(x0 + 0.6 + i * 1.2, 1.8, zf + 0.05, 1.05, 3.2, 0.12, i % 2 ? '#1ec8c8' : '#ffffff', { ao: 0.25 });
    m.block(S.x, 3.6, (zf + zb) / 2 + 0.15, 12.6, 0.4, 3.5, '#e8793a', { ao: 0 });
    // posts, back wall with shelves
    const zB = -64;
    for (const px of [x0 + 0.4, x1 - 0.4]) {
      m.block(px, 4, zf - 0.2, 0.6, 5.6, 0.6, '#6b4424');
      m.block(px, 0, zB, 0.7, 10.2, 0.7, '#6b4424');
    }
    m.block(S.x, 0, zB - 0.3, 12, 8.5, 0.6, '#c08a4a', { ao: 0.3 });
    for (const y of [2.6, 5.2]) m.block(S.x, y, zB + 0.4, 11.2, 0.25, 1.2, '#8a5a34', { ao: 0 });
    // shelf goods: balloons, bananas, coils in rows
    for (let i = 0; i < 9; i++) {
      const x = x0 + 1.4 + i * 1.15;
      const kind = i % 3;
      if (kind === 0) m.prim('sphere:8', x, 3.35, zB + 0.4, 0.8, 0.9, 0.8, r.pick(['#3fb6ff', '#ff5a8a', '#7ee36b']));
      else if (kind === 1) m.beam(x - 0.3, 3.0, zB + 0.4, x + 0.3, 3.5, zB + 0.4, 0.3, '#ffd93a', { prim: 'cyl:6' });
      else m.cyl(x, 2.75, zB + 0.4, 0.35, 0.8, '#3fcf5a', { seg: 8 });
      m.prim('frustum:8', x, 5.85, zB + 0.4, 0.8, 0.9, 0.8, '#8fb3d9', { rx: Math.PI });
    }
    solid(x0, x1, zB - 0.7, zB + 0.5, 10);
    // striped awning (sloped)
    const n = 10;
    for (let i = 0; i < n; i++) {
      const x = x0 - 0.5 + (i + 0.5) * (13 / n);
      m.box(x, 9.35, (zf + zB) / 2 + 1.2, 13 / n, 0.3, 11.4, i % 2 ? '#ffffff' : '#ff4f7a', { rx: -0.2, ao: 0 });
      // scalloped valance
      m.prim('sphere:8', x, 8.1, zf + 2.95, 13 / n, 1.0, 0.25, i % 2 ? '#ffffff' : '#ff4f7a', { ao: 0 });
    }
    m.box(S.x, 8.4, zf + 2.95, 13, 0.4, 0.3, '#ff4f7a', { ao: 0 });
    // item stands on the counter
    const geos = itemGeometries();
    const itemMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x181818 });
    geos.forEach((geo, i) => {
      const x = x0 + 1.6 + i * 2.2;
      m.cyl(x, 4.0, -58.4, 0.9, 0.25, '#ffffff', { seg: 14, ao: 0 });
      m.cyl(x, 4.0, -58.4, 0.95, 0.12, '#1ec8c8', { seg: 14, ao: 0 });
      const mesh = new THREE.Mesh(geo, itemMat);
      mesh.position.set(x, 4.3, -58.4);
      mesh.scale.setScalar(0.95);
      mesh.castShadow = quality.shadows;
      group.add(mesh);
      spinners.push({ mesh, y: 4.3, phase: i });
    });
    // sign
    const tex = signTexture(1024, 256, (g, W, H) => {
      boardBg(g, W, H, '#2fd0d0', '#1791b8');
      chunkyText(g, 'GEAR SHOP', W / 2, H / 2 + 6, { size: 140, fill: '#ffffff', stroke: '#1b2440', strokeW: 22, maxW: W - 120 });
    });
    const sign = signMesh(tex, 11, 2.75);
    sign.position.set(S.x, 11.6, zf + 1.7);
    sign.rotation.x = -0.08;
    const back = sign.clone();
    back.position.z -= 0.12;
    back.rotation.set(0.08, Math.PI, 0);
    m.box(S.x, 11.6, zf + 1.64, 11.2, 2.9, 0.08, '#1b2440', { ao: 0 });
    group.add(sign, back);
    m.block(S.x - 4, 9.4, zf + 1.4, 0.3, 1.4, 0.3, '#6b4424');
    m.block(S.x + 4, 9.4, zf + 1.4, 0.3, 1.4, 0.3, '#6b4424');
  }

  // ================================================================ SPEED SHOP
  const belts = [];
  {
    const S = layout.shops.speed;
    const zFront = -53.2, zBack = -60.2;
    // rubber gym mat
    m.box(S.x, 0.09, -57.2, 22.5, 0.1, 10.6, '#394150', { ao: 0 });
    for (let i = -1; i <= 1; i++) m.box(S.x + i * 7, 0.11, zFront + 1.6, 0.3, 0.1, 1.8, '#ffcf33', { ao: 0 });
    const belt = new Merger({ uv: 'box', uvScale: 0.25 });
    for (let i = -1; i <= 1; i++) {
      const x = S.x + i * 7;
      // deck
      m.block(x, 0, (zFront + zBack) / 2, 3.6, 0.55, zFront - zBack, '#2c3440', { ao: 0.2 });
      m.block(x - 1.62, 0.55, (zFront + zBack) / 2, 0.36, 0.14, zFront - zBack, '#e84a4a', { ao: 0 });
      m.block(x + 1.62, 0.55, (zFront + zBack) / 2, 0.36, 0.14, zFront - zBack, '#e84a4a', { ao: 0 });
      m.prim('cyl:10', x, 0.3, zFront, 0.68, 3.0, 0.68, '#5a6270', { rz: Math.PI / 2 });
      belt.box(x, 0.6, (zFront + zBack) / 2 + 0.2, 2.9, 0.06, zFront - zBack - 0.4, '#ffffff', { ao: 0 });
      // console + uprights + handrails
      for (const s of [-1, 1]) {
        m.beam(x + s * 1.55, 0.55, zBack + 0.6, x + s * 1.35, 4.2, zBack - 0.1, 0.35, '#c9ced6', { ao: 0.1 });
        m.beam(x + s * 1.45, 3.4, zBack + 0.2, x + s * 1.45, 3.4, zBack + 3.2, 0.26, '#c9ced6', { ao: 0 });
      }
      m.box(x, 4.35, zBack - 0.1, 3.2, 1.0, 0.6, '#2c3440', { rx: 0.5, ao: 0.1 });
      glow.box(x, 4.46, zBack + 0.15, 2.2, 0.5, 0.06, '#3ff0ff', { rx: 0.5, ao: 0 });
      solid(x - 1.8, x + 1.8, zBack, zFront, 0.55, 'deco');
      solid(x - 1.8, x + 1.8, zBack - 0.8, zBack + 0.5, 4.8);
    }
    const beltMat = new THREE.MeshLambertMaterial({ map: beltTexture(), vertexColors: true });
    const bm = belt.build(beltMat, { name: 'treadmill-belts' });
    group.add(bm);
    belts.push(beltMat.map);
    // back billboard
    for (const px of [-8.5, 8.5]) {
      m.block(S.x + px, 0, -63.5, 0.8, 11.5, 0.8, '#2c3440');
      solid(S.x + px - 0.5, S.x + px + 0.5, -64, -63, 11);
    }
    const tex = signTexture(1024, 400, (g, W, H) => {
      boardBg(g, W, H, '#ffcf33', '#ff8a1a');
      chunkyText(g, 'SPEED SHOP', W / 2, 150, { size: 150, fill: '#ffffff', stroke: '#1b2440', strokeW: 22, maxW: W - 260 });
      chunkyText(g, 'TRAIN YOUR SPEED!', W / 2, 300, { size: 76, fill: '#1b2440', stroke: '#ffffff', strokeW: 10, maxW: W - 200 });
      bolt(g, 90, 200, 2.3, '#ffffff');
      bolt(g, W - 90, 200, 2.3, '#ffffff');
    });
    const sign = signMesh(tex, 16, 6.25);
    sign.position.set(S.x, 8.4, -63.0);
    const back = sign.clone();
    back.position.z = -64.0;
    back.rotation.y = Math.PI;
    group.add(sign, back);
    m.block(S.x, 5.1, -63.5, 16.8, 6.8, 0.4, '#1b2440', { ao: 0 });
  }

  // ================================================================ REBIRTH ALTAR
  let crown, halo, beam, sparks;
  {
    const S = layout.shops.rebirth;
    const zf = -57, zb = -60, zc = (zf + zb) / 2;
    const marble = '#f4f0ff', gold = '#ffc93c', purple = '#7a3fe0';
    m.block(S.x, 0, zc, 12, 4, 3, marble, { ao: 0.3 });
    m.block(S.x, 0, zc, 12.4, 0.5, 3.4, gold, { ao: 0 });
    m.block(S.x, 3.6, zc, 12.4, 0.4, 3.4, gold, { ao: 0 });
    for (let i = -2; i <= 2; i++) {
      m.box(S.x + i * 2.3, 2.05, zf + 0.04, 1.6, 2.4, 0.1, purple, { ao: 0 });
      glow.prim('octa', S.x + i * 2.3, 2.05, zf + 0.12, 0.8, 1.3, 0.1, '#e0b8ff', { ao: 0 });
    }
    // pedestal + pillars on top
    m.cyl(S.x, 4, zc, 1.3, 0.6, gold, { seg: 14, ao: 0 });
    m.cyl(S.x, 4.6, zc, 0.9, 2.6, marble, { seg: 12 });
    m.cyl(S.x, 7.2, zc, 1.35, 0.45, gold, { seg: 14, ao: 0 });
    ctx.colliders.push({ minX: S.x - 1.4, maxX: S.x + 1.4, minY: 0, maxY: 7.7, minZ: zc - 1.4, maxZ: zc + 1.4, tag: 'shop' });
    for (const px of [S.x - 5.4, S.x + 5.4]) {
      m.cyl(px, 4, zc, 0.8, 7.2, marble, { seg: 10 });
      m.cyl(px, 4, zc, 1.0, 0.5, gold, { seg: 10, ao: 0 });
      m.cyl(px, 10.9, zc, 1.05, 0.5, gold, { seg: 10, ao: 0 });
      glow.prim('sphere:10', px, 11.9, zc, 1.3, 1.3, 1.3, '#d9a8ff', { ao: 0 });
      ctx.colliders.push({ minX: px - 0.9, maxX: px + 0.9, minY: 0, maxY: 11.5, minZ: zc - 0.9, maxZ: zc + 0.9, tag: 'shop' });
    }
    // floor star in front
    m.box(S.x, 0.1, -52.5, 9, 0.1, 6.5, '#e8dcff', { ao: 0 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      m.prim('octa', S.x + Math.cos(a) * 1.4, 0.16, -52.5 + Math.sin(a) * 1.4, 1.0, 0.06, 2.4, k % 2 ? gold : purple, { ry: -a + Math.PI / 2, ao: 0 });
    }
    // floating crown
    const crownGeo = mergedGeometry((c) => {
      c.cyl(0, 0, 0, 1.25, 0.9, gold, { seg: 16, ao: 0.1 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        c.prim('cone:6', Math.cos(a) * 1.1, 1.25, Math.sin(a) * 1.1, 0.7, 1.0, 0.7, gold, { ao: 0 });
        c.prim('sphere:6', Math.cos(a) * 1.1, 1.85, Math.sin(a) * 1.1, 0.35, 0.35, 0.35, '#ffffff', { ao: 0 });
        c.prim('octa', Math.cos(a + 0.52) * 1.26, 0.45, Math.sin(a + 0.52) * 1.26, 0.45, 0.55, 0.45, ['#ff3a5a', '#3a8bff', '#3fdc6a'][k % 3], { ao: 0 });
      }
      c.cyl(0, -0.05, 0, 1.32, 0.22, '#ffe08a', { seg: 16, ao: 0 });
    });
    crown = new THREE.Mesh(crownGeo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x5a3a00 }));
    crown.position.set(S.x, 9.2, zc);
    crown.castShadow = quality.shadows;
    group.add(crown);
    halo = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: 0xd8a8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.copy(crown.position);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
    beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.0, 14, 16, 1, true).translate(0, 7, 0), new THREE.ShaderMaterial({
      uniforms: { uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ float a = (1.0 - vUv.y) * (0.55 + 0.45 * sin(vUv.x * 37.7 + uTime * 3.0 + vUv.y * 8.0));
          gl_FragColor = vec4(vec3(0.8, 0.55, 1.0) * a * 0.55, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }));
    beam.position.set(S.x, 7.6, zc);
    group.add(beam);
    // orbiting sparkles
    const N = 40;
    const sp = new Float32Array(N * 3);
    const rr = makeRand(3);
    for (let i = 0; i < N; i++) sp.set([rr(), rr(), rr()], i * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sparks = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: { uTime },
      vertexShader: `uniform float uTime; varying float vA;
        void main(){ float a = position.x * 6.2831 + uTime * (0.6 + position.z); float h = fract(position.y + uTime * 0.18);
          vec3 p = vec3(cos(a) * (1.6 + position.z * 1.2), h * 9.0 - 1.0, sin(a) * (1.6 + position.z * 1.2));
          vA = sin(h * 3.14159);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(260.0 / -mv.z, 24.0); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(vec3(1.0, 0.85, 1.0) * a, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    sparks.position.set(S.x, 5, zc);
    sparks.frustumCulled = false;
    group.add(sparks);
    // REBIRTH sign arch between the pillars
    const tex = signTexture(1024, 256, (g, W, H) => {
      boardBg(g, W, H, '#a86bff', '#5a2ec0', '#1b0f3a');
      chunkyText(g, 'REBIRTH', W / 2, H / 2 + 6, { size: 150, gradient: ['#fff6c8', '#ffc93c'], stroke: '#2a1060', strokeW: 22 });
      for (const sx of [110, W - 110]) {
        g.fillStyle = '#ffe07a';
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr2 = k % 2 ? 22 : 50;
          g.lineTo(sx + Math.cos(a) * rr2, H / 2 + Math.sin(a) * rr2);
        }
        g.closePath();
        g.fill();
      }
    });
    const sign = signMesh(tex, 12, 3);
    sign.position.set(S.x, 14.4, zc + 0.6);
    const back = sign.clone();
    back.position.z = zc - 0.2;
    back.rotation.y = Math.PI;
    group.add(sign, back);
    m.block(S.x, 12.4, zc + 0.2, 12.6, 3.9, 0.5, '#2a1060', { ao: 0 });
  }

  group.add(m.build(mats.stud, { name: 'shops', castShadow: quality.shadows }));

  return {
    group,
    update(dt, t) {
      for (const s of spinners) {
        s.mesh.rotation.y = t * 0.9 + s.phase;
        s.mesh.position.y = s.y + Math.sin(t * 2 + s.phase) * 0.12;
      }
      for (const b of belts) b.offset.y = (b.offset.y - dt * 1.6 + 1) % 1;
      crown.rotation.y = t * 0.8;
      crown.position.y = 9.2 + Math.sin(t * 1.7) * 0.35;
      halo.position.y = crown.position.y + 0.4;
      halo.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
      halo.rotation.z = t * 0.5;
    },
  };
}
