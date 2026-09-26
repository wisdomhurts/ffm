// The small copy of your Photo Booth face that goes to the other players in a PRIVATE room when you
// switch on "Share my face". Public rooms never call this. Browser only (needs a canvas).
import { familyFaceData, loadImage } from '../characters/faces.js';

const SIZE = 160;
const cache = new Map(); // profileId -> {sig, url}

export async function shareableFace(profileId) {
  if (typeof document === 'undefined') return null;
  const d = familyFaceData(profileId);
  const src = d?.face || d?.avatar;
  if (!src) return null;
  const sig = src.length + ':' + src.slice(-32);
  const hit = cache.get(profileId);
  if (hit?.sig === sig) return hit.url;
  const img = await loadImage(src);
  if (!img) return null;
  let url = null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const x = c.getContext('2d');
    const s = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const sx = ((img.naturalWidth || img.width) - s) / 2;
    const sy = ((img.naturalHeight || img.height) - s) / 2;
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, sx, sy, s, s, 0, 0, SIZE, SIZE);
    url = c.toDataURL('image/jpeg', 0.72);
    if (url.length > 60000) url = c.toDataURL('image/jpeg', 0.5);
  } catch {
    url = null;
  }
  cache.set(profileId, { sig, url });
  return url;
}
