// Family face images. Real photos are injected at build time as window.__FAMILY_FACES__
// ({dorian:{face:dataURL, avatar:dataURL, skin:'#hex'}, ...}); players can override them in the
// Photo Booth (stored locally). Without photos we draw a classic cartoon face.
import * as THREE from 'three';
import { CHARACTER } from '../config.js';
import { load } from '../core/save.js';

const cache = new Map();

export function familyFaceData(id) {
  const custom = load('face:' + id, null);
  if (custom?.face) return { ...custom, custom: true };
  const inj = (typeof window !== 'undefined' && window.__FAMILY_FACES__) || {};
  return inj[id] || null;
}

export function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Resolves {face: HTMLImageElement|null, avatarUrl: string|null, skin: '#hex'} for a character. */
export async function getFace(id) {
  const data = familyFaceData(id);
  const key = id + ':' + (data?.face?.length || 0) + ':' + (data?.custom ? 'c' : 'b');
  if (cache.has(key)) return cache.get(key);
  const face = await loadImage(data?.face);
  const res = { face, avatarUrl: data?.avatar || data?.face || null, skin: data?.skin || CHARACTER[id].look.skin };
  cache.set(key, res);
  return res;
}

/** Draws the head's front texture: skin, then the photo inside a feathered oval (or a cartoon face). */
export function composeFaceCanvas(img, skin, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = skin;
  g.fillRect(0, 0, size, size);
  if (img) {
    const m = document.createElement('canvas');
    m.width = m.height = size;
    const mg = m.getContext('2d');
    mg.drawImage(img, 0, 0, size, size);
    mg.globalCompositeOperation = 'destination-in';
    const grd = mg.createRadialGradient(size / 2, size * 0.54, size * 0.3, size / 2, size * 0.54, size * 0.47);
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(0.75, 'rgba(0,0,0,1)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    mg.setTransform(0.82, 0, 0, 1, size * 0.09, 0);
    mg.fillStyle = grd;
    mg.fillRect(0, 0, size, size);
    g.drawImage(m, 0, 0);
  } else {
    // classic blocky-game smile
    g.fillStyle = '#1b1b1b';
    g.beginPath();
    g.ellipse(size * 0.37, size * 0.42, size * 0.045, size * 0.075, 0, 0, Math.PI * 2);
    g.ellipse(size * 0.63, size * 0.42, size * 0.045, size * 0.075, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = size * 0.035;
    g.lineCap = 'round';
    g.strokeStyle = '#1b1b1b';
    g.beginPath();
    g.arc(size / 2, size * 0.52, size * 0.2, 0.18 * Math.PI, 0.82 * Math.PI);
    g.stroke();
  }
  return c;
}

export function faceTexture(img, skin) {
  const t = new THREE.CanvasTexture(composeFaceCanvas(img, skin));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
