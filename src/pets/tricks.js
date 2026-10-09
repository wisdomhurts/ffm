// Pet tricks: click (or tap) any pet you can see, yours or anyone else's, and it does a trick everyone in the
// room sees. attachPetTricks(app), once at startup:
//   * a quick left click / tap that lands on a pet asks for a trick (app.act('petTrick', ownerSlot, k)) instead of
//     bonking (F always bonks, and a click that misses the pets still bonks); the game picks the trick and
//     emits 'pet:trick' {player, owner, k, trick, pet} (GameView plays it)
//   * desktop: the pointer turns into a hand over a pet
//   * a cheerful boing (walkers) or chirp (flyers) when a trick starts
import { bus } from '../core/events.js';
import { PET } from './catalog.js';

export function attachPetTricks(app) {
  const input = app.input;
  const canvas = input.canvas;
  input.onTap = (x, y, touch) => {
    if (app.state !== 'playing' || !app.view || !app.human) return false;
    const hit = app.view.pickPet(x, y, touch);
    if (!hit) return false;
    app.act('petTrick', hit.slot, hit.k);
    return true; // on a pet (even one still finishing its last trick): no bonk
  };

  // hover: a hand over pets (a few checks a second, never while dragging the camera)
  let at = 0;
  let over = false;
  const set = (on) => {
    if (on === over) return;
    over = on;
    canvas.style.cursor = on ? 'pointer' : '';
  };
  canvas.addEventListener('mousemove', (e) => {
    const now = performance.now();
    if (now - at < 110) return;
    at = now;
    const m = input.mouse;
    set(app.state === 'playing' && !m.left && !m.right && input.lastDevice === 'keyboard' && !!app.view?.pickPet(e.clientX, e.clientY, false));
  });
  canvas.addEventListener('mouseleave', () => set(false));
  bus.on('app:state', ({ state }) => state !== 'playing' && set(false));

  bus.on('pet:trick', ({ player, owner, trick, pet }) => {
    const g = app.game;
    const o = g?.players[owner];
    if (!o || app.state === 'title' || !app.audio) return;
    const fly = !!PET[pet]?.flies;
    // yours (or you clicked it): right here; anyone else's: from where it is
    if (player === app.human || o === app.human) app.audio.play('petTrick', { fly, trick, important: true });
    else app.audio.play('petTrick', { fly, trick, x: o.pos.x, z: o.pos.z, vol: 0.7 });
  });
}
