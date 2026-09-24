// PLACEHOLDER menus. Contract: createMenus(app) -> { showTitle(), showSelect(mode), showPause(), hidePause(), showEnd(ranking), openShop(shop), closeShop(), hideAll(), isBlocking() }
import { CHARACTERS } from '../config.js';
export function createMenus(app) {
  const el = document.createElement('div');
  el.className = 'panel';
  el.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:12px;background:#0006';
  app.root.appendChild(el);
  const api = {
    showTitle() {
      el.hidden = false;
      el.innerHTML = '';
      for (const c of CHARACTERS) {
        const b = document.createElement('button');
        b.textContent = 'Play as ' + c.name;
        b.dataset.char = c.id;
        b.onclick = () => app.startGame({ charId: c.id, mode: 'endless', difficulty: 'normal' });
        el.appendChild(b);
      }
    },
    showSelect() { api.showTitle(); },
    showPause() {},
    hidePause() {},
    showEnd() {},
    openShop() {},
    closeShop() {},
    hideAll() { el.hidden = true; },
    isBlocking() { return !el.hidden; },
  };
  return api;
}
