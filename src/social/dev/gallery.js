// Dev gallery for the social icons: emote + quick-chat stickers, HUD icons and every plant sticker in
// every mutation. Build: node build.mjs --entry src/social/dev/gallery.js --out <dir>
import { PLANTS, MUTATIONS, RARITY } from '../../config.js';
import { EMOTES, QUICK_CHAT } from '../catalog.js';
import { SOCIAL_ICONS } from '../icons.js';
import { plantIcon } from '../plantIcon.js';

const app = document.getElementById('app') || document.body;
document.documentElement.style.cssText = 'height:auto;overflow:auto';
document.body.style.cssText = 'margin:0;overflow:auto;height:auto;background:#1b2452;font:700 11px/1.2 system-ui,sans-serif;color:#fff';
app.style.cssText = 'padding:10px;display:flex;flex-direction:column;gap:10px';
const row = (title, cells) => {
  const r = document.createElement('div');
  r.innerHTML = `<div style="font-size:14px;margin:0 0 4px">${title}</div><div style="display:flex;flex-wrap:wrap;gap:6px">${cells.join('')}</div>`;
  app.appendChild(r);
};
const cell = (svg, label, bg = '#2b387a') =>
  `<div style="width:74px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:5px 2px;border-radius:10px;background:${bg}"><div style="width:52px;height:52px">${svg}</div><span style="text-align:center">${label}</span></div>`;
const style = document.createElement('style');
style.textContent = '.ico{display:block;width:100%;height:100%;overflow:visible}';
document.head.appendChild(style);
row('Emotes', EMOTES.map((e) => cell(e.icon, e.name)));
row('Quick chat', QUICK_CHAT.map((q) => cell(q.icon, q.text)));
row('HUD', ['smile', 'bubble', 'gift', 'trade'].map((k) => cell(SOCIAL_ICONS[k], k)));
for (const m of Object.keys(MUTATIONS)) {
  row('Plants: ' + m, PLANTS.map((p) => cell(plantIcon(p.id, m), p.name, RARITY[p.rarity].id === 'secret' ? '#111' : '#2b387a')));
}
