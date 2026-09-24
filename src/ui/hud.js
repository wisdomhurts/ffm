// PLACEHOLDER HUD. Contract: createHUD(app) -> { update(dt), dispose() }
// app = {engine, input, game, human, cam, labels, fx, audio, root (the #ui element), startGame, quitToTitle, pause, resume}
import { fmt } from '../gameplay/game.js';
export function createHUD(app) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:12px;top:12px;color:#fff;font:700 18px system-ui;text-shadow:0 2px 0 #000';
  app.root.appendChild(el);
  return {
    update() {
      const p = app.game.human;
      if (!p) return;
      const it = p.interact;
      el.textContent = `$${fmt(p.cash)}  speed L${p.speedLevel}  ${it.key ? '[E] ' + it.verb + ' ' + it.label : ''}`;
    },
    dispose() {
      el.remove();
    },
  };
}
