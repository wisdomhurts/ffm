// Welcome-Back Garden: the "While you were away…" card (solo Endless). main.js applies the time away
// (Game.applyAway) and emits 'away:report' {seconds, credit, cash, grown, sizes, giants, bots, lines} right after
// game:start; this shows the card over the paused game (never while the tutorial runs), then "Run to COLLECT!"
// points at your pad: a beacon over it and an arrow pill until you collect (or a while passes).
//   awayLines(game, report, rand)  2-3 short family stories for the card (kind templates: nobody ever lost anything)
//   awayTime(seconds)              '3 hours' / '45 minutes' / '2 days'
//   attachAway(app)                wires the card (main.js, once)
import { bus } from '../core/events.js';
import { BASE, BIOMES, SIZES } from '../config.js';
import { LAYOUT } from '../gameplay/layout.js';
import { createGuide } from '../fx/guide.js';
import { h, esc, money, setHTML, setStyle, toggle, screenAngle, uiSound } from './dom.js';
import { ICON } from './icons.js';
import { guidePoint } from './route.js';
import { tutorialRecord } from './tutorialFlow.js';

const GUIDE_FOR = 45; // seconds the COLLECT arrow stays up

// What each family bot got up to ({name}; {biome} = somewhere up the Seed Road). Micah's line depends on your
// Guard Gnome (Base Lv 5), see awayLines.
const STORIES = {
  dorian: ['{name} counted his coins. Twice!', '{name} told a sunflower a dad joke. It wilted a little.', '{name} said "Business is booming!" about 40 times.'],
  esther: ['{name} watered her flowers and waved at your garden.', '{name} put sunscreen on everybody. Even the pets.', '{name} kept an eye on your gate. Nobody touches your garden!'],
  maddie: ['{name} raced to {biome} and back. Zoom zoom!', '{name} ran 100 laps round the plaza.', '{name} found a shiny seed and did a happy dance.'],
  micah: ['{name} peeked over your fence... then tiptoed away. Hehe.', '{name} practised his sneakiest sneak. Very sneaky!'],
};
const GNOME = 'Your Guard Gnome shooed {name} away from your fence!';

export function awayTime(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const hr = Math.round(sec / 3600);
  if (hr < 48) return `${hr} hour${hr === 1 ? '' : 's'}`;
  return `${Math.round(sec / 86400)} days`;
}

export function awayLines(game, report, rand = Math.random) {
  const me = game.human;
  const pick = (list) => list[Math.floor(rand() * list.length) % list.length];
  const lines = [];
  const bots = game.players.filter((p) => p.kind === 'bot' && p.present && STORIES[p.id]);
  for (const b of bots) {
    let line = b.id === 'micah' && me && me.baseLevel >= BASE.guardAt ? GNOME : pick(STORIES[b.id]);
    const grew = report?.bots?.find((x) => x.slot === b.slot)?.grown || 0;
    // now and then: their garden grew too (the family keeps pace)
    if (grew > 1 && rand() < 0.3) line = `{name}'s garden grew ${grew} plants too.`;
    lines.push({ b, text: line.replaceAll('{name}', b.name).replaceAll('{biome}', pick(BIOMES.slice(1, 6)).name) });
  }
  // Micah's line always makes the card (it's the funny one); two others join it
  lines.sort((x, y) => (y.b.id === 'micah') - (x.b.id === 'micah') || rand() - 0.5);
  return lines.slice(0, 3).map((x) => x.text);
}

export function attachAway(app) {
  let guide = null;
  bus.on('away:report', (r) => {
    const game = app.game;
    if (!game?.human || !r || (r.cash < 1 && !r.grown)) return;
    if (tutorialRecord(app.profileId).state === 'active') return; // the tutorial has the floor
    show(app, game, r);
  });
  bus.on('game:dispose', () => {
    guide?.dispose();
    guide = null;
  });

  function show(app, game, r) {
    injectAwayStyles();
    if (!app.menus?.openModal) return;
    game.paused = true; // the family waits while you read
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      uiSound(app, 'click');
      m?.close();
    };
    const giants = (r.giants || []).filter((x) => x.size !== 'big');
    const sizeNote = giants.length ? ` <b class="wb-big">${giants.length === 1 ? `1 grew ${SIZES[giants[0].size].name}!` : `${giants.length} grew GIANT!`}</b>` : '';
    const btn = h('button', { class: 'btn btn-gold btn-lg wb-go', type: 'button', 'data-autofocus': '', onclick: go },
      h('span', { class: 'bi', html: ICON.coin }), h('span', { text: 'Run to COLLECT!' }));
    const el = h('div', { class: 'wb', role: 'group', 'aria-label': 'While you were away' },
      h('div', { class: 'wb-ic', html: ICON.sun }),
      h('h2', { class: 'wb-title', text: 'While you were away…' }),
      h('p', { class: 'wb-sub', text: `You were gone ${awayTime(r.seconds)}. Your garden kept growing!` }),
      h('div', { class: 'wb-stats' },
        r.grown ? h('div', { class: 'wb-stat', html: `<i>${ICON.sprout}</i><span><b>${r.grown}</b> plant${r.grown === 1 ? '' : 's'} finished growing${sizeNote}</span>` }) : null,
        h('div', { class: 'wb-stat cash', html: `<i>${ICON.coin}</i><span><b>${esc(money(r.cash))}</b> is waiting on your COLLECT pad</span>` })),
      r.lines?.length ? h('div', { class: 'wb-news' }, h('div', { class: 'wb-news-h', html: `${ICON.family}<span>Family news</span>` }),
        h('ul', null, r.lines.map((t) => h('li', { text: t })))) : null,
      btn);
    const m = app.menus.openModal(el, {
      cls: 'away-card', label: 'While you were away', onClose: () => {
        if (app.game !== game) return;
        if (app.state === 'playing') game.paused = false;
        pointAtPad(app, game);
      },
    });
  }

  // the beacon over your COLLECT pad and an arrow pill, until you collect
  function pointAtPad(app, game) {
    const me = game.human;
    const pad = LAYOUT.gardens[me.slot].collectPad;
    guide?.dispose();
    guide = createGuide(app.engine.scene);
    guide.set({ x: pad.x, z: pad.z });
    const arrow = h('span', { class: 'cp-arrow', html: ICON.arrow });
    const l1 = h('span', { class: 'cp-l1' });
    const l2 = h('span', { class: 'cp-l2' });
    const pill = h('div', { class: 'carry away-go show' }, arrow, h('span', { class: 'cp-copy' }, l1, l2));
    (app.hud?.anchors?.bottom || app.root).prepend(pill);
    const t0 = game.time;
    let acc = 1;
    const myGuide = guide;
    const stop = () => {
      offTick();
      offCash();
      pill.remove();
      if (guide === myGuide) {
        guide.dispose();
        guide = null;
      }
    };
    const offCash = bus.on('cash:collected', ({ player }) => {
      if (player === me) stop();
    });
    const offTick = app.engine.add((dt) => {
      if (app.game !== game || game.time - t0 > GUIDE_FOR) return stop();
      myGuide.update(dt, app.engine.camera);
      acc += dt;
      if (acc < 0.066) return;
      acc = 0;
      toggle(pill, 'show', app.state === 'playing');
      const g = guidePoint(me.pos, pad, game.physics?.boxes);
      setStyle(arrow, 'transform', `rotate(${screenAngle(me.pos, g, app.cam?.yaw || 0).toFixed(2)}rad)`);
      setHTML(l1, `COLLECT <b>${esc(money(game.gardens[me.slot].cashPile))}</b>!`);
      setHTML(l2, `Run to your pad <em>${Math.round(g.dist)} studs</em>`);
    });
  }
}

let injected = false;
function injectAwayStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'sas-away';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const CSS = `
.modal-panel.away-card{width:min(460px,100%);text-align:center}
.wb{display:flex;flex-direction:column;align-items:center;gap:10px;color:#fff}
.wb-ic{width:66px;height:66px;padding:8px;box-sizing:border-box;border-radius:22px;display:grid;place-items:center;background:linear-gradient(180deg,#8fd8ff,#3d9bff);
  border:3px solid var(--ink);box-shadow:0 4px 0 rgba(10,14,40,.5);animation:wbSun 2.4s ease-in-out infinite}
.wb-ic svg{width:100%;height:100%}
@keyframes wbSun{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg) scale(1.06)}}
.wb-title{margin:2px 0 0;font:var(--fdw,400) 30px/1.05 var(--fd);letter-spacing:.02em;text-shadow:0 3px 0 var(--ink)}
.wb-sub{margin:0;font:800 15px/1.35 var(--fb);color:#dfe5ff}
.wb-stats{display:flex;flex-direction:column;gap:7px;width:100%}
.wb-stat{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:14px;background:rgba(10,14,40,.35);text-align:left;font:800 15px/1.25 var(--fb)}
.wb-stat i{flex:none;width:30px;height:30px;color:#7dff5a}
.wb-stat i svg{width:100%;height:100%}
.wb-stat b{font:var(--fdw,400) 19px/1 var(--fd);color:#fff}
.wb-stat.cash b{color:#ffe066}
.wb-big{display:inline-block;margin-left:4px;padding:1px 8px;border-radius:8px;background:linear-gradient(180deg,#fff2a8,#ff9f1a);color:#10163a !important;font-size:14px !important}
.wb-news{width:100%;text-align:left;padding:8px 12px 10px;border-radius:14px;background:rgba(255,255,255,.08);box-sizing:border-box}
.wb-news-h{display:flex;align-items:center;gap:6px;font:var(--fdw,400) 15px/1 var(--fd);color:#ffd23f;letter-spacing:.03em;text-transform:uppercase}
.wb-news-h svg{width:20px;height:20px}
.wb-news ul{margin:6px 0 0;padding:0 0 0 18px;font:700 14px/1.35 var(--fb);color:#eef1ff}
.wb-news li{margin:3px 0}
.wb-go{margin-top:4px;min-width:min(300px,100%)}
/* the arrow to your COLLECT pad (same pill as the "Bring it HOME" one, in gold) */
.carry.away-go{background:linear-gradient(180deg,rgba(150,104,8,.95),rgba(110,70,6,.95))}
.carry.away-go .cp-arrow{background:linear-gradient(180deg,#fff6b8,#ffd23f);color:var(--ink)}
.carry.away-go .cp-l1 b{color:#ffe066}
@media (max-width:640px),(max-height:560px){
  .wb-ic{display:none}
  .wb-title{font-size:24px;padding:0 34px}
  .wb-sub,.wb-stat{font-size:13.5px}
  .wb-sub{padding:0 18px}
  .wb-news ul{font-size:13px}
}
@media (prefers-reduced-motion:reduce){.wb-ic{animation:none}}
`;
