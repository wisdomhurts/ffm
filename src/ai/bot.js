// PLACEHOLDER bot brain (to be replaced by the full personality AI).
// Contract: new BotController(personality) ; getIntent(game, player, dt) -> Intent
import { emptyIntent } from '../gameplay/player.js';

export class BotController {
  constructor(personality = 'tycoon') {
    this.personality = personality;
    this.goal = null;
  }

  getIntent(game, p) {
    const it = emptyIntent();
    const home = game.layout.gardens[p.slot];
    let tx, tz;
    if (p.carrying) {
      tx = home.inside.x;
      tz = home.inside.z;
      if (Math.abs(p.pos.x) < 22 && p.pos.z > 40) {
        tx = 0;
        tz = 30;
      }
    } else {
      const pod = game.pods.filter((q) => q.seed && q.biome === 0).sort((a, b) => Math.abs(a.z - p.pos.z) - Math.abs(b.z - p.pos.z))[0];
      if (!pod) return it;
      const inGarden = game.gardenAt(p.pos.x, p.pos.z);
      if (inGarden) {
        tx = home.outside.x;
        tz = home.outside.z;
      } else if (p.pos.z < 55 && Math.abs(p.pos.x) > 15) {
        tx = 0;
        tz = 58;
      } else {
        tx = pod.x;
        tz = pod.z;
        if ((p.pos.x - pod.x) ** 2 + (p.pos.z - pod.z) ** 2 < 16) it.interact = true;
      }
    }
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) {
      it.moveX = dx / d;
      it.moveZ = dz / d;
    }
    return it;
  }
}
