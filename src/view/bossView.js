// Binds Big Chomp (game.boss, gameplay/boss.js) to its caterpillar (characters/boss.js): the 3D boss, a name and
// hit point label over its head, coins flying into its mouth while it munches, the hit / burst / burp effects
// and the gold crown on the top bonker's head. GameView creates it next to the monsters; with no boss and no
// crown around it costs a couple of checks a frame.
// Contract: createBossBinding(gameView) -> {update(dt, time, camera), dispose()}
import { createBoss, createCrown } from '../characters/boss.js';
import { bossNearest } from '../gameplay/boss.js';
import { bus } from '../core/events.js';
import { injectBossStyles } from '../ui/bossBar.js';

const POP_COLORS = ['#ffd23f', '#7ee8ff', '#ff6fb1', '#9be65a', '#b36bff', '#ffffff'];

export function createBossBinding(gv) {
  const game = gv.game;
  const L = gv.labels;
  const fx = gv.fx;
  injectBossStyles();
  let view = null; // {cat, uid}
  // what the caterpillar is told every frame (kept after the boss is gone so it can pop / shrink in place)
  const S = { x: 0, z: 0, yaw: 0, state: 'crawl', hp01: 1, gone: false };
  const near = { x: 0, z: 0 };
  const tmp = { x: 0, y: 0, z: 0 };
  const at = (x, y, z) => {
    tmp.x = x;
    tmp.y = y;
    tmp.z = z;
    return tmp;
  };
  const crowns = []; // per slot: {crown, av} while that player wears it
  let labelHtml = '';
  let labelHp = -1;
  let coinAt = 0;
  const ours = (p) => !!p && game.players[p.slot] === p;
  const closeBy = (x, z, d) => {
    const c = gv.engine.camera.position;
    return (c.x - x) ** 2 + (c.z - z) ** 2 < d * d;
  };

  const offs = [
    bus.on('boss:hit', ({ by, n }) => {
      if (!view || !ours(by)) return;
      view.cat.hit(by === game.human);
      if (!fx || !closeBy(S.x, S.z, 160)) return;
      bossNearest(S, by.pos.x, by.pos.z, near);
      fx.burst('impact', at(near.x, 3.4, near.z), { scale: 1.25, color: '#e4ffb8' });
      fx.burst('stars', at(near.x, 5.2, near.z), { count: 4 });
      if (by === game.human) fx.floatText(n === 1 ? 'BONK!' : `x${n}`, at(near.x, 6.6, near.z), { style: 'comic', size: 's', duration: 0.8, rise: 1.4 });
    }),
    bus.on('boss:defeated', ({ x, z, top, shares }) => {
      if (top && !ours(top)) return;
      view?.cat.pop();
      if (!fx) return;
      fx.burst('confetti', at(x, 8, z), { count: 120 });
      fx.burst('sparkle', at(x, 4, z), { colors: POP_COLORS, count: 34, scale: 1.7 });
      fx.burst('poof', at(x, 2.5, z), { count: 12, scale: 2.1, color: '#c8ff8a' });
      fx.burst('ring', at(x, 0.4, z), { color: '#ffe36b', size: 15 });
      fx.burst('rarity', at(x, 0, z), { color: '#9be65a', rainbow: true, scale: 1.6 });
      fx.floatText('POP!', at(x, 10, z), { style: 'comic', size: 'xl', duration: 1.6, rise: 2.5 });
      // everyone's share flies to them
      game.players.forEach((p, i) => {
        if (shares?.[i] > 0 && p.present) fx.burst('coins', at(x, 3, z), { count: p === game.human ? 14 : 6, target: p.pos, targetY: 3.2 });
      });
      const me = game.human;
      if (me && (me.pos.x - x) ** 2 + (me.pos.z - z) ** 2 < 70 * 70) bus.emit('camera:shake', { amount: 0.7 });
    }),
    bus.on('boss:leave', ({ victim }) => {
      if (!view || (victim && !ours(victim))) return;
      view.cat.burp();
      const hd = view.cat.head.position;
      if (fx && closeBy(hd.x, hd.z, 160)) {
        fx.burst('poof', at(hd.x, hd.y + 1, hd.z), { count: 10, scale: 2.2, color: '#c8f07a' });
        fx.floatText('BUUURP!', at(hd.x, hd.y + 6, hd.z), { style: 'comic', size: 'l', duration: 1.5, rise: 2 });
      }
    }),
  ];

  function drop() {
    if (!view) return;
    gv.root.remove(view.cat.object3d);
    view.cat.dispose();
    view = null;
  }

  function updateCrowns(dt, time) {
    const now = game.time;
    for (let i = 0; i < game.players.length; i++) {
      const p = game.players[i];
      const av = gv.avatars[i];
      const want = p.present && now < p.crownUntil && !!av;
      let c = crowns[i];
      if (!want) {
        if (c) {
          c.av.headTop.remove(c.crown.object3d);
          c.crown.dispose();
          crowns[i] = null;
        }
        continue;
      }
      if (c && c.av !== av) {
        c.av.headTop.remove(c.crown.object3d); // the avatar was rebuilt (new look): move the crown over
        c.av = av;
        av.headTop.add(c.crown.object3d);
      }
      if (!c) {
        c = crowns[i] = { crown: createCrown(), av };
        av.headTop.add(c.crown.object3d);
      }
      // floats over the head (over a carried pot too) and turns slowly
      const o = c.crown.object3d;
      o.position.y = (p.carrying ? 3.6 : 0.55) + Math.sin(time * 2.4 + i) * 0.12;
      o.rotation.y += dt * 1.4;
    }
  }

  return {
    update(dt, time, camera) {
      const b = game.boss;
      if (b && (!view || view.uid !== b.uid)) {
        drop();
        view = { cat: createBoss(), uid: b.uid };
        gv.root.add(view.cat.object3d);
        labelHp = -1;
      }
      if (view) {
        const live = !!b && b.uid === view.uid;
        if (live) {
          S.x = b.x;
          S.z = b.z;
          S.yaw = b.yaw;
          S.state = b.state;
          S.hp01 = b.max > 0 ? b.hp / b.max : 1;
        }
        S.gone = !live;
        const far = (S.x - camera.position.x) ** 2 + (S.z - camera.position.z) ** 2 > 320 * 320;
        if (far && live) view.cat.object3d.visible = false;
        else view.cat.update(dt, S);
        if (view.cat.done) drop();
        else if (live && !far) {
          // its name and hit points over its head
          const hp = Math.ceil(b.hp);
          if (hp !== labelHp) {
            labelHp = hp;
            const f = Math.max(0, Math.min(1, b.hp / b.max));
            labelHtml = `<div class="bl-name">BIG CHOMP</div><div class="bl-hp${f < 0.25 ? ' low' : ''}"><i style="transform:scaleX(${f.toFixed(3)})"></i></div>`;
          }
          const hd = view.cat.head.position;
          L.set('boss', at(hd.x, hd.y + 6.8, hd.z), labelHtml, { cls: 'bosslbl', maxDist: 200, priority: 7 });
          // coins hop out of the cash pile into its mouth while it munches
          if (b.state === 'munch' && b.slurped > 0 && game.time >= coinAt && fx) {
            coinAt = game.time + 0.8;
            const pad = game.gardens[b.target].L.collectPad;
            if (closeBy(pad.x, pad.z, 120) && game.gardens[b.target].cashPile >= 1) fx.burst('coins', at(pad.x, 0.6, pad.z), { count: 3, target: hd, targetY: -0.6 });
          }
        }
      }
      updateCrowns(dt, time);
    },
    dispose() {
      offs.forEach((f) => f());
      drop();
      crowns.forEach((c, i) => {
        if (!c) return;
        c.av.headTop.remove(c.crown.object3d);
        c.crown.dispose();
        crowns[i] = null;
      });
    },
  };
}
