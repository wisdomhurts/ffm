// Photo Booth: put a local photo on any player's avatar: the family and friends' profiles on this device.
// Includes a crop editor (drag to pan, pinch / wheel / slider to zoom) with an oval face guide and an
// eye line. Photos never leave the device (except, opt-in, to a private room): they are stored with
// core/save.js as 'face:<profileId>'. Saving one also switches that profile's face to 'photo'.
import { CHARACTERS, CHARACTER } from '../config.js';
import { bus } from '../core/events.js';
import { save, remove } from '../core/save.js';
import { listProfiles, getProfile, updateProfile, isFamilyId } from '../core/profiles.js';
import { familyFaceData } from '../characters/faces.js';
import { h, uiSound } from './dom.js';
import { avatarEl } from './avatars.js';
import { ICON } from './icons.js';

// Face framing expected by characters/faces.js (fractions of the 512px face image):
// forehead ~0.08, eyes ~0.42, chin ~0.92.
const OVAL = { cx: 0.5, cy: 0.5, rx: 0.33, ry: 0.42 };
const EYE_LINE = 0.42;
const AVATAR_ZOOM_OUT = 1.28;

// Session-only fallback when storage is blocked (sandboxed pages): patch the injected faces in memory.
const originals = {};

// name / colour / skin for any profile id (family or friend)
function who(id) {
  const p = getProfile(id);
  const base = CHARACTER[p?.base] || CHARACTER[id] || CHARACTERS[0];
  return { id, name: p?.name || base.name, color: base.color, look: { ...base.look, ...(p?.look || {}) }, family: isFamilyId(id) };
}

export function buildPhotoBooth(app) {
  const el = h('div', { class: 'booth-body' });
  let editor = null;

  function showList(msg) {
    editor?.dispose();
    editor = null;
    el.textContent = '';
    const people = listProfiles().map((p) => who(p.id));
    const cards = people.map((c) => {
      const data = familyFaceData(c.id);
      const status = data?.custom || originals[c.id] ? 'Your photo' : data?.face ? 'Family photo' : 'Cartoon face';
      const input = h('input', { type: 'file', accept: 'image/*', class: 'vh', 'data-face-input': c.id, 'aria-label': `Upload a photo for ${c.name}` });
      input.addEventListener('change', () => {
        const f = input.files?.[0];
        input.value = '';
        if (f) openFile(c.id, f);
      });
      const upload = h('label', { class: 'btn btn-blue btn-sm pb-upload', tabindex: '0', role: 'button' }, h('span', { class: 'bi', html: ICON.upload }), h('span', { text: 'Upload photo' }), input);
      upload.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.click();
        }
      });
      const reset = (data?.custom || originals[c.id]) ? h('button', {
        class: 'btn btn-grey btn-sm', type: 'button', html: `<span class="bi">${ICON.reset}</span><span>${c.family ? 'Reset to original' : 'Remove photo'}</span>`,
        onclick: () => {
          uiSound(app, 'click');
          resetFace(c.id);
          showList(c.family ? `${c.name}'s original face is back.` : `${c.name} has a cartoon face again.`);
        },
      }) : null;
      return h('div', { class: 'pb-card', style: `--c:${c.color}` },
        avatarEl(c.id, 'pb-ava'),
        h('span', { class: 'pb-name', text: c.name }),
        h('span', { class: 'pb-status', text: status }),
        h('div', { class: 'pb-btns' }, upload, reset));
    });
    el.append(...[
      h('div', { class: 'mh' }, h('span', { class: 'mh-ic', html: ICON.camera }), h('h2', { text: 'Photo Booth' })),
      h('p', { class: 'pb-intro', html: 'Put a real face on any player! Pick a photo, line up the face, done. <b>Your photo stays on this device.</b> It is only shared if you switch on face sharing for a private room with friends.' }),
      msg ? h('div', { class: 'pb-msg', role: 'status', text: msg }) : null,
      h('div', { class: 'pb-grid' }, cards)].filter(Boolean));
  }

  function openFile(id, file) {
    if (!/^image\//.test(file.type || 'image/')) return showList('That file is not a picture. Try a JPG or PNG.');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => showEditor(id, img);
      img.onerror = () => showList("Couldn't open that picture. Try a JPG or PNG.");
      img.src = reader.result;
    };
    reader.onerror = () => showList("Couldn't read that file.");
    reader.readAsDataURL(file);
  }

  function showEditor(id, img) {
    el.textContent = '';
    editor = createEditor(app, id, img, {
      done: (msg) => showList(msg),
      cancel: () => showList(),
    });
    el.appendChild(editor.el);
  }

  showList();
  return { el, dispose: () => editor?.dispose() };
}

function resetFace(id) {
  remove('face:' + id);
  if (originals[id] !== undefined) {
    const inj = window.__FAMILY_FACES__ || (window.__FAMILY_FACES__ = {});
    if (originals[id]) inj[id] = originals[id];
    else delete inj[id];
    delete originals[id];
  }
  bus.emit('face:changed', { id });
}

function storeFace(id, data) {
  if (save('face:' + id, data)) {
    delete originals[id];
    return true;
  }
  // storage blocked or full: keep it for this session only
  const inj = window.__FAMILY_FACES__ || (window.__FAMILY_FACES__ = {});
  if (!(id in originals)) originals[id] = inj[id] || null;
  inj[id] = data;
  return false;
}

function createEditor(app, id, photo, { done, cancel }) {
  const c = who(id);
  const img = downscale(photo, 1600);
  const W = img.width;
  const H = img.height;
  // view state in stage units (stage = 1 x 1): image top-left (u, v), scale s (stage units per image px)
  const cover = Math.max(1 / W, 1 / H);
  const minS = cover * 0.5;
  const maxS = cover * 6;
  let s = cover;
  let u = (1 - W * s) / 2;
  let v = H * s > 1 ? Math.min(0, Math.max(1 - H * s, 0.45 - 0.32 * H * s)) : (1 - H * s) / 2;

  const canvas = h('canvas', { class: 'pb-canvas' });
  const guide = h('div', {
    class: 'pb-guide', 'aria-hidden': 'true',
    html: `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <path fill-rule="evenodd" fill="rgba(8,12,34,.62)" d="M0 0H100V100H0Z M${OVAL.cx * 100} ${(OVAL.cy - OVAL.ry) * 100} a${OVAL.rx * 100} ${OVAL.ry * 100} 0 1 0 0.01 0Z"/>
      <ellipse cx="${OVAL.cx * 100}" cy="${OVAL.cy * 100}" rx="${OVAL.rx * 100}" ry="${OVAL.ry * 100}" fill="none" stroke="#fff" stroke-width=".9" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>
      <line x1="${(OVAL.cx - OVAL.rx) * 100 - 4}" x2="${(OVAL.cx + OVAL.rx) * 100 + 4}" y1="${EYE_LINE * 100}" y2="${EYE_LINE * 100}" stroke="#ffd23f" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>
    </svg><span class="pb-eyes">eyes</span><span class="pb-chin">chin</span>`,
  });
  const stage = h('div', { class: 'pb-stage', tabindex: '0', 'aria-label': 'Photo. Drag to move, pinch or use the slider to zoom. Arrow keys move, plus and minus zoom.' }, canvas, guide);
  const preview = h('canvas', { class: 'pb-prev', width: 160, height: 160 });
  const zoom = h('input', { type: 'range', min: '0', max: '1000', value: '0', 'aria-label': 'Zoom' });
  const status = h('div', { class: 'pb-msg', role: 'status', hidden: true });
  const saveBtn = h('button', { class: 'btn btn-green btn-lg', type: 'button', html: `<span class="bi">${ICON.check}</span><span>Save face</span>` });
  const cancelBtn = h('button', { class: 'btn btn-grey', type: 'button', text: 'Cancel' });
  const el = h('div', { class: 'pb-editor', style: `--c:${c.color}` },
    h('div', { class: 'mh' },
      h('button', { class: 'btn btn-round btn-ghost', type: 'button', 'aria-label': 'Back', html: ICON.back, onclick: () => cancel() }),
      h('h2', { text: `Line up ${c.name}'s face` })),
    h('div', { class: 'pb-work' },
      stage,
      h('div', { class: 'pb-side' },
        h('div', { class: 'pb-prev-wrap' }, preview, h('span', { text: 'Preview' })),
        h('ul', { class: 'pb-tips' },
          h('li', { html: '<b>Drag</b> to move the photo' }),
          h('li', { html: '<b>Pinch</b> or use the slider to zoom' }),
          h('li', { html: 'Put the <b>eyes</b> on the yellow line' }),
          h('li', { html: 'Fill the <b>oval</b> from forehead to chin' })))),
    h('div', { class: 'pb-zoom' }, h('span', { class: 'bi', text: '−' }), zoom, h('span', { class: 'bi', text: '+' })),
    status,
    h('div', { class: 'pb-actions' }, cancelBtn, saveBtn));

  const zoomToSlider = () => {
    zoom.value = String(Math.round((Math.log(s / minS) / Math.log(maxS / minS)) * 1000));
  };
  const zoomAbout = (fx, fy, ns) => {
    ns = Math.max(minS, Math.min(maxS, ns));
    u = fx - (fx - u) * (ns / s);
    v = fy - (fy - v) * (ns / s);
    s = ns;
    draw();
    zoomToSlider();
  };

  let raf = 0;
  function draw() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = stage.getBoundingClientRect();
      const S = Math.max(1, Math.round(r.width));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.round(S * dpr);
      if (canvas.width !== px) canvas.width = canvas.height = px;
      const g = canvas.getContext('2d');
      g.fillStyle = '#26305f';
      g.fillRect(0, 0, px, px);
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, u * px, v * px, W * s * px, H * s * px);
      renderAvatar(preview, 160);
    });
  }

  function renderFace(size) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    g.fillStyle = c.look.skin;
    g.fillRect(0, 0, size, size);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, u * size, v * size, W * s * size, H * s * size);
    return cv;
  }

  function renderAvatar(cv, size) {
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const side = AVATAR_ZOOM_OUT;
    const ox = OVAL.cx - side / 2;
    const oy = OVAL.cy - 0.03 - side / 2;
    const k = size / side;
    g.fillStyle = c.color;
    g.fillRect(0, 0, size, size);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (u - ox) * k, (v - oy) * k, W * s * k, H * s * k);
    return cv;
  }

  // ---- pointer: drag to pan, two fingers to pinch
  const pts = new Map();
  let last = null;
  const rel = (e) => {
    const r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const pinchInfo = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, rel(e));
    last = pts.size === 2 ? pinchInfo() : null;
    stage.classList.add('drag');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    const p = rel(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1) {
      u += p.x - prev.x;
      v += p.y - prev.y;
      draw();
    } else if (pts.size === 2 && last) {
      const now = pinchInfo();
      u += now.mx - last.mx;
      v += now.my - last.my;
      if (last.d > 0.01) zoomAbout(now.mx, now.my, s * (now.d / last.d));
      else draw();
      last = now;
    }
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    last = pts.size === 2 ? pinchInfo() : null;
    if (!pts.size) stage.classList.remove('drag');
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = rel(e);
    zoomAbout(p.x, p.y, s * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  stage.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.05 : 0.015;
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (k) {
      u += k[0];
      v += k[1];
      draw();
      e.preventDefault();
    } else if (e.key === '+' || e.key === '=') zoomAbout(0.5, 0.5, s * 1.08);
    else if (e.key === '-' || e.key === '_') zoomAbout(0.5, 0.5, s / 1.08);
  });
  zoom.addEventListener('input', () => {
    const ns = minS * Math.pow(maxS / minS, +zoom.value / 1000);
    zoomAbout(0.5, 0.5, ns);
  });

  cancelBtn.addEventListener('click', () => cancel());
  saveBtn.addEventListener('click', () => {
    uiSound(app, 'click');
    try {
      const faceCv = renderFace(512);
      const skin = sampleSkin(faceCv) || c.look.skin;
      const face = faceCv.toDataURL('image/jpeg', 0.85);
      const avatar = renderAvatar(document.createElement('canvas'), 256).toDataURL('image/jpeg', 0.85);
      const persisted = storeFace(id, { face, avatar, skin });
      // a new photo means they want to wear it: switch a cartoon expression back to the photo
      if (getProfile(id) && getProfile(id).look?.face && getProfile(id).look.face !== 'photo') {
        updateProfile(id, (p) => {
          p.look = { ...p.look, face: 'photo' };
        });
      }
      bus.emit('face:changed', { id });
      done(persisted ? `${c.name}'s new face is saved on this device!` : `${c.name}'s new face is on! (This browser blocks saving, so it lasts until you reload.)`);
    } catch (err) {
      status.hidden = false;
      status.textContent = "Sorry, that picture couldn't be saved. Try another one.";
      console.warn('[photobooth]', err);
    }
  });

  const onResize = () => draw();
  window.addEventListener('resize', onResize);
  zoomToSlider();
  // draw once the stage is in the document and has a size
  setTimeout(draw, 0);
  setTimeout(() => stage.focus({ preventScroll: true }), 60);

  return {
    el,
    dispose() {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

/** Big phone photos are slow to redraw while dragging: work from a copy no larger than `max` px. */
function downscale(img, max) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const k = Math.min(1, max / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * k));
  cv.height = Math.max(1, Math.round(h * k));
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}

/** Average colour of both cheeks (skipping very dark / bright pixels), as '#rrggbb'. */
function sampleSkin(cv) {
  try {
    const g = cv.getContext('2d');
    const n = cv.width;
    const box = Math.round(n * 0.06);
    let r = 0, gg = 0, b = 0, count = 0;
    // one readback spanning both cheeks (a canvas read twice makes Chrome warn about slow readbacks)
    const xa = Math.round(n * 0.33 - box / 2), xb = Math.round(n * 0.67 - box / 2);
    const y0 = Math.round(n * 0.6 - box / 2);
    const W = xb + box - xa;
    const d = g.getImageData(xa, y0, W, box).data;
    for (const x0 of [0, xb - xa]) {
      for (let y = 0; y < box; y++) {
        for (let x = x0; x < x0 + box; x++) {
          const i = (y * W + x) * 4;
          const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
          if (l < 45 || l > 245) continue;
          r += d[i];
          gg += d[i + 1];
          b += d[i + 2];
          count++;
        }
      }
    }
    if (!count) return null;
    const hex = (x) => Math.round(x / count).toString(16).padStart(2, '0');
    return '#' + hex(r) + hex(gg) + hex(b);
  } catch {
    return null;
  }
}
