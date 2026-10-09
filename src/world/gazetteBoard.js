// The Seed Gazette's billboard on the plaza (stories: social/gazette.js; the full front page: ui/gazette.js).
// A newsstand board east of the main path, between the two east gardens' walks, facing the path and the
// spawn: the masthead, today's lead story with its faces (coloured initials, never photos) and the next two
// headlines on a ticker. One CanvasTexture in the shared sign material, repainted only when the news changes
// and at most every REDRAW ms, never per frame.
// Contract: createGazetteBoard(ctx) -> { object3d, show(front) }   ctx = world.js homeCtx {root, mats, colliders, quality}
import * as THREE from 'three';
import { Merger, makeCanvas, canvasTexture, signMaterial, signFont, chunkyText, roundRect, onDisplayFont } from './kit.js';
import { paintFace, wrapLines } from '../ui/gazette.js';

const REDRAW = 5000;
const SPOT = { x: 22, z: 0 }; // the board's centre; it faces west (-x)
const BW = 12, BH = 6.75, BOTTOM = 2.6; // the paper (16:9) and its lower edge
const TEX = { w: 1024, h: 576 };
const INK = '#1b2440';
const PAPER = '#fdf7e7';
const BODY = "'Nunito', 'Nunito Sans', system-ui, sans-serif";

function paint(g, front) {
  const W = TEX.w, H = TEX.h;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  // masthead
  g.fillStyle = INK;
  g.fillRect(0, 0, W, 104);
  chunkyText(g, 'THE SEED GAZETTE', 34, 54, { size: 64, fill: '#ffd23f', stroke: '#0a0e28', strokeW: 10, align: 'left', maxW: 640 });
  g.fillStyle = '#ffffff';
  g.font = `900 24px ${BODY}`;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.fillText(String(front?.date || 'Family Edition').toUpperCase(), W - 30, 54);
  // the lead story
  const lead = front?.lead;
  roundRect(g, 34, 124, 236, 36, 18);
  g.fillStyle = '#ff5a73';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = `900 19px ${BODY}`;
  g.textAlign = 'center';
  g.fillText(lead ? "TODAY'S BIG NEWS" : 'EXTRA! EXTRA!', 152, 143);
  const who = lead?.who?.length ? lead.who.slice(0, 2) : [{ n: 'S', c: '#3fae3f' }];
  paintFace(g, 122, 280, 80, who[0]);
  if (who[1]) paintFace(g, 186, 366, 46, who[1]);
  const hx = 262, hw = W - 34 - hx;
  const head = (lead ? lead.head : 'The garden news starts when you play!').toUpperCase();
  let size = 58;
  let lines;
  for (;;) {
    g.font = signFont(size);
    lines = wrapLines(g, head, hw, 4);
    if (lines.length <= 3 || size <= 40) break;
    size -= 4;
  }
  lines = wrapLines(g, head, hw, 3); // a very long one ends in "…"
  const top = 180;
  lines.forEach((l, i) => chunkyText(g, l, hx, top + size * 0.55 + i * size * 1.06, { size, fill: INK, stroke: PAPER, strokeW: 3, shadow: false, align: 'left', maxW: hw }));
  g.fillStyle = '#3a3f5c';
  g.font = `italic 800 27px ${BODY}`;
  g.textAlign = 'left';
  const sy = top + size * 0.55 + lines.length * size * 1.06 + 14;
  wrapLines(g, lead ? lead.sub : 'Grab, steal and bonk your way into the paper!', hw, 2).forEach((l, i) => g.fillText(l, hx, sy + i * 34));
  // ticker: the next two headlines
  g.fillStyle = '#ffd23f';
  g.fillRect(0, 478, W, H - 478);
  g.fillStyle = INK;
  g.fillRect(0, 474, W, 6);
  roundRect(g, 22, 500, 150, 54, 14);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = `900 22px ${BODY}`;
  g.textAlign = 'center';
  g.fillText('MORE NEWS', 97, 528);
  const more = (front?.more || []).slice(0, 2).map((s) => s.head);
  g.fillStyle = INK;
  g.font = `900 26px ${BODY}`;
  g.textAlign = 'left';
  const ticker = more.length ? more.join('   •   ') : 'Find the Golden Gnomes hiding around the island!';
  g.fillText(wrapLines(g, ticker, W - 210, 1)[0] || '', 190, 528);
}

export function createGazetteBoard(ctx) {
  const { root, mats, colliders, quality } = ctx;
  const object3d = new THREE.Group();
  object3d.name = 'gazette-board';
  object3d.position.set(SPOT.x, 0, SPOT.z);
  object3d.rotation.y = -Math.PI / 2; // local +z (the paper's face) looks west, at the path
  root.add(object3d);

  // the stand: two wooden posts, a navy frame, a striped awning and a little sign plank
  const m = new Merger();
  const postX = BW / 2 + 0.38, topY = BOTTOM + BH;
  for (const s of [-1, 1]) {
    m.block(s * postX, 0, 0, 0.5, topY + 1.2, 0.5, '#8a5a34', { ao: 0.25 });
    m.block(s * postX, 0, 0, 0.9, 0.35, 0.9, '#6b4424', { ao: 0.2 });
  }
  m.box(0, BOTTOM + BH / 2, -0.02, BW + 0.5, BH + 0.5, 0.3, INK, { ao: 0 });
  m.box(0, BOTTOM - 0.2, 0.05, BW + 0.9, 0.22, 0.5, '#ffd23f', { ao: 0 });
  for (let i = 0; i < 8; i++) {
    const w = (BW + 1.6) / 8;
    m.box(-(BW + 1.6) / 2 + w * (i + 0.5), topY + 0.62, 0.35, w, 0.4, 1.5, i % 2 ? '#ffffff' : '#ff5a73', { rx: -0.18, ao: 0 });
  }
  m.box(0, topY + 0.88, -0.05, BW + 1.7, 0.16, 0.7, INK, { ao: 0 });
  const stand = m.build(mats.flat, { castShadow: !!quality?.shadows, name: 'gazette-stand' });
  if (stand) object3d.add(stand);

  const canvas = makeCanvas(TEX.w, TEX.h);
  const g = canvas.getContext('2d');
  const tex = canvasTexture(canvas, { clamp: true });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), signMaterial(tex, 0.32));
  paper.position.set(0, BOTTOM + BH / 2, 0.15);
  paper.name = 'gazette-paper';
  object3d.add(paper);

  // solid: nobody walks through the board (the camera keeps out of it too)
  colliders.push({ minX: SPOT.x - 0.5, maxX: SPOT.x + 0.5, minY: 0, maxY: topY + 1.3, minZ: SPOT.z - postX - 0.45, maxZ: SPOT.z + postX + 0.45, tag: 'deco' });

  let latest = null;
  let lastDraw = -Infinity;
  let timer = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function draw() {
    timer = 0;
    lastDraw = now();
    paint(g, latest);
    tex.needsUpdate = true;
  }
  /** New front page (social/gazette.js front()): repainted now, or REDRAW ms after the last repaint. */
  function show(front) {
    latest = front;
    if (timer) return;
    const wait = REDRAW - (now() - lastDraw);
    if (wait <= 0) draw();
    else timer = setTimeout(draw, wait);
  }
  draw();
  lastDraw = -Infinity; // the empty placeholder: the first real news goes up at once
  onDisplayFont(draw);
  return { object3d, show };
}
