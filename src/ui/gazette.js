// The Seed Gazette's front page (stories: social/gazette.js; plaza billboard: world/gazetteBoard.js).
//   openGazette(app)           modal from the pause menu: today's front page, live, and "Save front page"
//   gazetteEndSlot(app)        the Showdown end screen's strip (the lead headline; opens the front page)
//   drawFrontPage(canvas, front)  paints the page (PAGE: 1080 x 1520); also the PNG the Save button makes
//   paintFace(g, x, y, r, who), wrapLines(g, text, maxW, maxLines)   shared with the billboard
// Faces are coloured initials, never photos, so a saved page is safe to share. Save uses canvas.toBlob and
// the share sheet (navigator.share with a file) where there is one, else a download.
import { h } from './dom.js';
import { signFont, roundRect, chunkyText, onDisplayFont, makeRand } from '../world/kit.js';

export const PAGE = { w: 1080, h: 1520 };
const INK = '#1b2440';
const PAPER = '#fdf7e7';
const BODY = "'Nunito', 'Nunito Sans', system-ui, sans-serif";
const BOX_COLOR = { heist: '#ff5a73', rescue: '#3d9bff', seed: '#b36bff', slip: '#ffb627', pet: '#1ec8a5', bonked: '#ff7a3d' };

export const GAZETTE_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g stroke="#10163a" stroke-width="1.6" stroke-linejoin="round">' +
  '<path d="M4.5 4.5h13v14.2a1.8 1.8 0 0 0 1.8 1.8H6.3a1.8 1.8 0 0 1-1.8-1.8z" fill="#fdf7e7"/><path d="M17.5 8.5h2.4v10.2a1.2 1.2 0 0 1-2.4 0z" fill="#e8dcc0"/>' +
  '<rect x="6.7" y="6.6" width="8.6" height="2.6" rx=".6" fill="#ff5a73"/></g>' +
  '<path d="M6.8 11.6h3.6M6.8 14h3.6M6.8 16.4h3.6" stroke="#10163a" stroke-width="1.3" stroke-linecap="round"/><rect x="11.6" y="11" width="3.8" height="5.8" rx=".6" fill="#3d9bff" stroke="#10163a" stroke-width="1.2"/></svg>';

// ------------------------------------------------------------------ canvas helpers (page and billboard)

const body = (size, w = 800) => `${w} ${size}px ${BODY}`;

/** Lines of `text` that fit maxW at the context's current font; the last one ends in "…" if cut. */
export function wrapLines(g, text, maxW, maxLines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (g.measureText(next).width <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1] + '…';
    while (last.length > 1 && g.measureText(last).width > maxW) last = last.slice(0, -2) + '…';
    lines[maxLines - 1] = last;
  }
  return lines;
}

/** A face as a coloured initial (never a photo): who = {n: name, c: colour}. */
export function paintFace(g, x, y, r, who) {
  g.save();
  g.beginPath();
  g.arc(x, y + r * 0.08, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(16,22,58,0.28)';
  g.fill();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  const gr = g.createLinearGradient(0, y - r, 0, y + r);
  gr.addColorStop(0, shadeHex(who?.c || '#556070', 0.25));
  gr.addColorStop(1, who?.c || '#556070');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = r * 0.14;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.lineWidth = r * 0.06;
  g.strokeStyle = INK;
  g.beginPath();
  g.arc(x, y, r * 1.07, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  const initial = [...String(who?.n || '?').trim()][0]?.toUpperCase() || '?';
  chunkyText(g, initial, x, y + r * 0.05, { size: Math.round(r * 1.15), fill: '#ffffff', stroke: INK, strokeW: r * 0.16, shadow: false });
}

function shadeHex(hex, k) {
  const n = parseInt(String(hex).slice(1), 16);
  if (!Number.isFinite(n)) return hex;
  const f = (c) => Math.round(c + (255 - c) * k);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// faint newsprint grain (seeded: the page looks the same every time)
function paper(g, w, h) {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, w, h);
  const r = makeRand(9);
  g.fillStyle = 'rgba(120,90,40,0.05)';
  for (let i = 0; i < 900; i++) g.fillRect(r() * w, r() * h, 2, 2);
}

function rule(g, x0, x1, y, w = 3) {
  g.fillStyle = INK;
  g.fillRect(x0, y, x1 - x0, w);
}

/** Paint the front page (social/gazette.js front()) on a PAGE-sized canvas (A4-ish, for the fridge). */
export function drawFrontPage(canvas, front) {
  const W = PAGE.w, H = PAGE.h, M = 44;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  paper(g, W, H);
  g.lineWidth = 6;
  g.strokeStyle = INK;
  g.strokeRect(14, 14, W - 28, H - 28);
  g.textBaseline = 'middle';
  const text = (s, x, y, font, color, align = 'left') => {
    g.font = font;
    g.fillStyle = color;
    g.textAlign = align;
    g.fillText(s, x, y);
  };

  // masthead
  text('FAMILY EDITION', M, 62, body(24, 900), '#8a5a34');
  text('PRICE: ONE SEED', W - M, 62, body(24, 900), '#8a5a34', 'right');
  chunkyText(g, 'THE SEED GAZETTE', W / 2, 142, { size: 118, fill: INK, stroke: PAPER, strokeW: 6, shadow: false, maxW: W - 2 * M });
  rule(g, M, W - M, 214, 6);
  rule(g, M, W - M, 224, 2);
  text(String(front?.date || '').toUpperCase(), M, 250, body(26, 900), INK);
  text('ALL THE NEWS FROM THE GARDEN', W - M, 250, body(26, 900), INK, 'right');
  rule(g, M, W - M, 272, 2);

  // the lead story: its faces, the headline (up to 3 lines) and the sub-line
  const lead = front?.lead;
  roundRect(g, M, 296, 300, 44, 22);
  g.fillStyle = '#ff5a73';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = INK;
  g.stroke();
  text(lead ? "TODAY'S BIG NEWS" : 'EXTRA! EXTRA!', M + 150, 319, body(24, 900), '#ffffff', 'center');
  const who = lead?.who?.length ? lead.who.slice(0, 2) : [{ n: 'S', c: '#3fae3f' }];
  const top = 362;
  paintFace(g, M + 96, top + 92, 88, who[0]);
  if (who[1]) paintFace(g, M + 176, top + 186, 50, who[1]);
  const hx = M + 262, hw = W - M - hx;
  const head = (lead ? lead.head : 'The garden news starts when you play!').toUpperCase();
  let size = 70;
  let lines;
  // shrink the headline until it fits in three lines (a very long one ends in "…")
  for (;;) {
    g.font = signFont(size);
    lines = wrapLines(g, head, hw, 4);
    if (lines.length <= 3 || size <= 50) break;
    size -= 4;
  }
  lines = wrapLines(g, head, hw, 3);
  lines.forEach((l, i) => chunkyText(g, l, hx, top + size * 0.5 + i * size * 1.06, { size, fill: INK, stroke: PAPER, strokeW: 4, shadow: false, align: 'left', maxW: hw }));
  let y = top + lines.length * size * 1.06 + 30;
  g.font = `italic ${body(36, 800)}`;
  const sub = wrapLines(g, lead ? lead.sub : 'Grab seeds, steal plants and bonk thieves to make the headlines.', hw, 2);
  sub.forEach((l, i) => text(l, hx, y + i * 44, `italic ${body(36, 800)}`, '#3a3f5c'));
  y = Math.max(top + 250, y + sub.length * 44 + 10);

  // more news: up to three more headlines
  rule(g, M, W - M, y, 3);
  chunkyText(g, 'MORE NEWS', M, y + 36, { size: 34, fill: '#e8793a', stroke: PAPER, strokeW: 3, shadow: false, align: 'left' });
  y += 76;
  const more = (front?.more || []).slice(0, 3);
  if (!more.length) text('Nothing else yet. Go make some news!', M, y + 4, body(30, 800), '#6a6f8c');
  more.forEach((s, i) => {
    paintFace(g, M + 24, y + i * 56, 21, s.who?.[0]);
    g.font = body(31, 900);
    text(wrapLines(g, s.head, W - 2 * M - 70, 1)[0] || '', M + 62, y + i * 56 + 2, body(31, 900), INK);
  });
  y += Math.max(1, more.length) * 56 + 4;

  // the six boxes: 2 x 3, sharing what is left above the footer
  rule(g, M, W - M, y, 3);
  y += 20;
  const gap = 16, bw = (W - 2 * M - 24) / 2;
  const bh = Math.min(176, (H - 78 - y - 2 * gap) / 3);
  (front?.boxes || []).slice(0, 6).forEach((b, i) => {
    const bx = M + (i % 2) * (bw + 24), by = y + Math.floor(i / 2) * (bh + gap);
    roundRect(g, bx, by, bw, bh, 22);
    g.fillStyle = '#ffffff';
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = BOX_COLOR[b.id] || '#3d9bff';
    g.fillRect(bx, by, bw, 44);
    g.restore();
    rule(g, bx, bx + bw, by + 44, 3);
    roundRect(g, bx, by, bw, bh, 22);
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.stroke();
    chunkyText(g, b.title.toUpperCase(), bx + 18, by + 23, { size: 27, fill: '#ffffff', stroke: INK, strokeW: 5, shadow: false, align: 'left', maxW: bw - 36 });
    const s = b.story;
    const cy = by + 44 + (bh - 44) / 2;
    if (!s) {
      g.font = `italic ${body(25, 800)}`;
      const el = wrapLines(g, b.empty, bw - 36, 2);
      el.forEach((l, k) => text(l, bx + 18, cy + (k - (el.length - 1) / 2) * 30, `italic ${body(25, 800)}`, '#7a7f9c'));
      return;
    }
    paintFace(g, bx + 48, cy, 30, s.who?.[0]);
    g.font = body(25, 900);
    const tl = wrapLines(g, s.head, bw - 108, 2);
    g.font = body(20, 700);
    const sl = s.sub ? wrapLines(g, s.sub, bw - 108, 1) : [];
    let ty = cy - (tl.length * 29 + sl.length * 26) / 2 + 14;
    for (const l of tl) {
      text(l, bx + 92, ty, body(25, 900), INK);
      ty += 29;
    }
    for (const l of sl) text(l, bx + 92, ty, body(20, 700), '#4a4f6c');
  });

  text('Printed in the garden by Steal A Seed! Family Edition', W / 2, H - 42, body(22, 900), '#8a5a34', 'center');
  return canvas;
}

// ------------------------------------------------------------------ styles (injected once)

const CSS = `
.modal-panel.gz-modal{width:min(640px,100%)}
.gz-modal .sh-ic{background:linear-gradient(180deg,#fff8e0,#f0dfb0);padding:8px}
.gz-paper{display:block;width:100%;height:auto;margin:12px auto 0;border-radius:10px;border:3px solid var(--ink);box-shadow:0 6px 0 rgba(10,14,40,.5),0 14px 30px rgba(0,0,0,.3);background:#fdf7e7}
.gz-acts{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:14px}
.gz-acts .btn{flex:1 1 200px;max-width:300px}
.gz-msg{min-height:18px;margin:8px 0 0;text-align:center;font:800 14px/1.2 var(--fb);color:var(--txt2)}
.gz-msg.ok{color:var(--cash)}
.gz-end{display:flex;align-items:center;gap:10px;width:100%;margin:2px 0 10px;padding:7px 12px 8px 8px;border-radius:14px;cursor:pointer;text-align:left;
  background:#fdf7e7;color:#1b2440;border:3px solid var(--ink);box-shadow:0 4px 0 rgba(10,14,40,.55);font:inherit;animation:fadeIn .5s 1s both}
.gz-end:hover{filter:brightness(1.04)}
.gz-end:active{transform:translateY(2px);box-shadow:0 2px 0 rgba(10,14,40,.55)}
.gz-end-ic{width:34px;height:34px;flex:none}
.gz-end-t{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.gz-end-k{font:900 11px/1 var(--fb);letter-spacing:.12em;color:#c0392b}
.gz-end-h{font:var(--fdw) 17px/1.1 var(--fd);letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gz-end-go{flex:none;font:900 13px/1 var(--fb);padding:7px 10px;border-radius:999px;background:#1b2440;color:#fff}
@media (max-height:520px) and (orientation:landscape){.gz-end{margin:0 0 6px;padding:4px 10px 5px 6px}.gz-end-ic{width:26px;height:26px}.gz-end-h{font-size:15px}}
`;
let styled = false;
function injectStyles() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  document.head.appendChild(h('style', { id: 'sas-gazette', text: CSS }));
}

// ------------------------------------------------------------------ the modal

const DOWNLOAD = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.5v11M7 10l5 5 5-5M4.5 19.5h15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const fileName = () => {
  const d = new Date();
  return `seed-gazette-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.png`;
};

/** A plain-text version of the page for screen readers. */
function pageText(front) {
  const parts = ['The Seed Gazette, ' + (front?.date || '')];
  if (front?.lead) parts.push(front.lead.head + ' ' + front.lead.sub);
  for (const s of front?.more || []) parts.push(s.head);
  for (const b of front?.boxes || []) parts.push(b.title + ': ' + (b.story ? b.story.head + ' ' + b.story.sub : b.empty));
  return parts.join('. ');
}

/** Share the PNG (phones: the share sheet) or download it. Resolves to 'shared' | 'saved' | 'cancel'. */
export async function savePage(blob) {
  if (!blob) return 'cancel';
  const name = fileName();
  try {
    const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
    if (file && navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: 'The Seed Gazette' });
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancel';
    // no share sheet after all: fall back to a download
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, style: 'display:none' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'saved';
}

export function openGazette(app) {
  const gz = app.gazette;
  if (!gz || !app.menus?.openModal) return null;
  injectStyles();
  const canvas = h('canvas', { class: 'gz-paper', role: 'img', width: PAGE.w, height: PAGE.h });
  const msg = h('p', { class: 'gz-msg', 'aria-live': 'polite' });
  let blob = null;
  let disposed = false;
  // the PNG is made as soon as the page is painted, so Save can open the share sheet straight from the tap
  const paint = () => {
    if (disposed) return;
    const f = gz.front();
    drawFrontPage(canvas, f);
    canvas.setAttribute('aria-label', pageText(f));
    blob = null;
    canvas.toBlob?.((b) => {
      blob = b;
    }, 'image/png');
  };
  const saveBtn = app.menus.btn(app.menus.iconLabel(DOWNLOAD, 'Save front page'), 'btn-gold', async () => {
    msg.className = 'gz-msg';
    msg.textContent = 'Printing...';
    const b = blob || (await new Promise((res) => canvas.toBlob ? canvas.toBlob(res, 'image/png') : res(null)));
    const r = await savePage(b);
    if (disposed) return;
    msg.className = 'gz-msg' + (r === 'cancel' ? '' : ' ok');
    msg.textContent = r === 'shared' ? 'Sent! Stick it on the fridge!' : r === 'saved' ? 'Saved! Print it for the fridge!' : b ? '' : "Sorry, this browser can't save pictures.";
  });
  const el = h('div', { class: 'gz-body' },
    h('div', { class: 'shop-head' },
      h('span', { class: 'sh-ic', html: GAZETTE_ICON }),
      h('div', { class: 'sh-titles' }, h('h2', { text: 'The Seed Gazette' }), h('span', { class: 'sh-sub', text: "Today's family newspaper. It writes itself as you play!" }))),
    canvas,
    h('div', { class: 'gz-acts' }, saveBtn),
    msg);
  let modal = null;
  el.appendChild(app.menus.doneRow(() => modal?.close()));
  modal = app.menus.openModal(el, { cls: 'gz-modal', label: 'The Seed Gazette' });
  paint();
  const off = gz.onChange(paint);
  onDisplayFont(paint); // the headline font may still be loading on the first open
  modal.dispose = () => {
    disposed = true;
    off();
  };
  return modal;
}

/** The Showdown end screen's strip: THE SEED GAZETTE + the lead headline; opens the front page. */
export function gazetteEndSlot(app) {
  const gz = app.gazette;
  if (!gz) return null;
  injectStyles();
  const head = h('span', { class: 'gz-end-h', text: 'Extra! Extra!' });
  const el = h('button', { class: 'gz-end', type: 'button', 'aria-label': 'Read The Seed Gazette' },
    h('span', { class: 'gz-end-ic', html: GAZETTE_ICON }),
    h('span', { class: 'gz-end-t' }, h('span', { class: 'gz-end-k', text: 'THE SEED GAZETTE' }), head),
    h('span', { class: 'gz-end-go', text: 'Read' }));
  el.addEventListener('click', () => {
    app.audio?.play?.('click');
    openGazette(app);
  });
  // the winner's story is written by the same match:end that shows this screen: fill in once it is there
  const fill = () => {
    const lead = gz.front().lead;
    if (lead) head.textContent = lead.head;
  };
  setTimeout(fill, 0);
  return el;
}

