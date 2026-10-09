// Help! Family Hero on the HUD (a widget: ui/hud.js mounts it).
//   - While someone robs you, a pulsing HELP! button (or H) calls the family: quick chat "Help!" (app.act('say',
//     'help')), and the family bots that answer chase the thief (ai/family.js).
//   - Someone else in the family is being robbed close by (HERO.alertRange studs): "Esther needs help!" and an
//     arrow pill to the thief. Bonk them before they get home to be the HERO.
//   - You saved someone's plant: a big HERO! moment with your tip; someone saved yours: a thank-you toast.
// The rules (tips, caps, the HERO ribbon) are in gameplay/game.js (_rescue).
import { bus } from '../core/events.js';
import { HERO } from '../config.js';
import { h, esc, money, setHTML, setStyle, toggle, screenAngle, uiSound } from './dom.js';
import { who } from './alerts.js';
import { ICON } from './icons.js';
import { guidePoint } from './route.js';
import { isTouch, onTouchChange } from './device.js';
import { robberOf } from '../ai/family.js';

const CALLED_FOR = 6; // seconds the button rests after a call ("Help is coming!")

export function mountHero(app, hudRoot, anchors) {
  const me = app.human;
  const game = app.game;
  if (!me || !game) return null;
  injectHeroStyles();
  const bottom = anchors?.bottom || hudRoot;
  const help = h('button', { class: 'help-btn', type: 'button', 'aria-label': 'Call the family for help (H)' },
    h('span', { class: 'hp-ic', html: ICON.family }), h('span', { class: 'hp-t', text: 'HELP!' }), h('span', { class: 'hp-k', text: 'H' }));
  const arrow = h('span', { class: 'cp-arrow', html: ICON.arrow });
  const l1 = h('span', { class: 'cp-l1' });
  const l2 = h('span', { class: 'cp-l2' });
  const pill = h('div', { class: 'carry helpme' }, arrow, h('span', { class: 'cp-copy' }, l1, l2));
  // the button sits under the "STOP MICAH!" pill; on touch screens that stack is busy with thumb buttons, so it
  // hangs on the left edge instead (CSS .hud > .help-btn)
  const place = () => {
    const tracker = bottom.querySelector?.('.carry.tracker');
    const touch = isTouch();
    if (touch) hudRoot.appendChild(help);
    const items = touch ? [pill] : [help, pill];
    if (tracker) tracker.after(...items);
    else bottom.append(...items);
  };
  place();
  const offTouch = onTouchChange(place);

  let calledAt = -99;
  const callHelp = () => {
    if (app.state !== 'playing' || !help.classList.contains('show') || help.classList.contains('called')) return;
    uiSound(app, 'click');
    app.act('say', 'help');
    calledAt = game.time;
  };
  help.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    callHelp();
  });
  help.addEventListener('click', (e) => {
    if (e.detail === 0) callHelp(); // keyboard activation
  });
  const onKey = (e) => {
    const tg = e.target;
    if (e.code !== 'KeyH' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || tg?.tagName === 'INPUT' || tg?.tagName === 'TEXTAREA' || tg?.isContentEditable) return;
    callHelp();
  };
  window.addEventListener('keydown', onKey);

  // ---- events: who needs help, who saved whom
  const alerts = () => app.hud?.alerts;
  const plantName = (pt) => `<b class="pn">${esc(game.plantName(pt.speciesId, pt.mutation))}</b>`;
  const offs = [
    bus.on('steal:grabbed', ({ thief, victim, plant }) => {
      if (!victim || victim === me || thief === me || !near(thief)) return;
      alerts()?.show({
        key: 'needhelp' + victim.slot, kind: 'warn', face: victim.faceKey, duration: 5200,
        html: `${who(victim)} needs help!<small>Bonk ${who(thief)} to save the ${plantName(plant)} and be a HERO!</small>`,
      });
    }),
    bus.on('steal:rescued', ({ hero, victim, thief, plant, tip, sneaky }) => {
      const a = alerts();
      if (!a || game.players[hero?.slot] !== hero) return;
      a.remove('needhelp' + victim.slot);
      if (hero === me) {
        a.announce({
          title: 'HERO!', icon: ICON.medal, cls: 'an-hero', ms: 3200,
          sub: `You saved ${who(victim)}'s ${plantName(plant)}!${tip > 0 ? ` <b class="hero-tip">+${esc(money(tip))}</b>` : ''}${sneaky ? `<small>${who(thief)} was SNEAKY: double tip!</small>` : ''}`,
        });
      } else if (victim === me) {
        a.toast(`${who(hero)} saved your ${plantName(plant)}! What a HERO!`, 'gold', { face: hero.faceKey, duration: 3600 });
      }
    }),
    bus.on('steal:success', ({ victim }) => alerts()?.remove('needhelp' + victim?.slot)),
    bus.on('steal:foiled', ({ victim }) => alerts()?.remove('needhelp' + victim?.slot)),
  ];

  function near(q) {
    return Math.hypot(q.pos.x - me.pos.x, q.pos.z - me.pos.z) <= HERO.alertRange;
  }

  let acc = 1;
  return {
    update(dt) {
      acc += dt;
      if (acc < 0.066) return;
      acc = 0;
      const playing = app.state === 'playing';
      // the HELP button: while someone robs you
      const robbed = playing && !!robberOf(game, me);
      toggle(help, 'show', robbed);
      const called = game.time - calledAt < CALLED_FOR;
      toggle(help, 'called', called);
      help.querySelector('.hp-t').textContent = called ? 'Help is coming!' : 'HELP!';
      // someone else being robbed close by: an arrow to their thief (the nearest one)
      let thief = null, bd = HERO.alertRange;
      if (playing && !me.carrying) {
        for (const q of game.players) {
          const c = q.carrying;
          if (q === me || c?.kind !== 'plant' || c.fromSlot === me.slot || c.fromSlot === q.slot) continue;
          const d = Math.hypot(q.pos.x - me.pos.x, q.pos.z - me.pos.z);
          if (d < bd) {
            bd = d;
            thief = q;
          }
        }
      }
      toggle(pill, 'show', !!thief);
      if (!thief) return;
      const victim = game.players[thief.carrying.fromSlot];
      const g = guidePoint(me.pos, thief.pos, game.physics?.boxes);
      setStyle(arrow, 'transform', `rotate(${screenAngle(me.pos, g, app.cam?.yaw || 0).toFixed(2)}rad)`);
      setStyle(pill, '--c', victim.char.color);
      setHTML(l1, `HELP <b class="who" style="--c:${victim.char.color}">${esc(victim.name.toUpperCase())}</b>!`);
      setHTML(l2, `Bonk ${esc(thief.name)} to be a HERO <em>${Math.round(g.dist)} studs</em>`);
    },
    dispose() {
      offTouch();
      window.removeEventListener('keydown', onKey);
      offs.forEach((f) => f());
      help.remove();
      pill.remove();
    },
  };
}

let injected = false;
function injectHeroStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'sas-hero';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const CSS = `
/* HELP! while you're being robbed: a big pulsing button in the bottom stack (under "STOP MICAH!") */
.help-btn{display:none;align-items:center;gap:8px;padding:6px 16px 7px 7px;border-radius:999px;border:3px solid var(--ink);cursor:pointer;pointer-events:auto;
  background:linear-gradient(180deg,#ffe463,#ffa600);color:#4a2600;box-shadow:0 4px 0 rgba(10,14,40,.6);touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.help-btn.show{display:inline-flex;animation:promptIn .3s var(--spring),helpPulse .9s .3s ease-in-out infinite}
.help-btn.called{animation:none;background:linear-gradient(180deg,#d9f7ff,#8fd8ff);color:var(--ink)}
.help-btn .hp-ic{width:34px;height:34px;padding:5px;box-sizing:border-box;border-radius:50%;display:grid;place-items:center;background:#fff;border:2.5px solid var(--ink);color:#e0446a}
.help-btn .hp-ic svg{width:100%;height:100%}
.help-btn .hp-t{font:var(--fdw,400) 21px/1 var(--fd);letter-spacing:.04em;text-shadow:0 1px 0 rgba(255,255,255,.5)}
.help-btn .hp-k{font:900 11px/1 var(--fb);padding:3px 6px;border-radius:6px;background:rgba(16,22,58,.85);color:#fff}
.help-btn.called .hp-t{font-size:17px}
.help-btn.called .hp-k,.is-touch .help-btn .hp-k{display:none}
.help-btn:active{transform:scale(.95)}
@keyframes helpPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08);box-shadow:0 4px 0 rgba(10,14,40,.6),0 0 0 7px rgba(255,210,63,.35)}}
/* touch screens: on the left edge, above the stick */
.hud > .help-btn{position:absolute;left:var(--sl);top:40%;z-index:3}
@media (orientation:landscape) and (max-height:500px){
  .hud > .help-btn{top:auto;bottom:calc(var(--sb) + 132px);padding:4px 12px 5px 5px}
  .hud > .help-btn .hp-t{font-size:17px}
  .hud > .help-btn .hp-ic{width:28px;height:28px;padding:4px}
}
/* someone in the family is being robbed close by: an arrow to the thief */
.carry.helpme{background:linear-gradient(180deg,rgba(236,140,20,.95),rgba(170,86,8,.95));animation:promptIn .3s var(--spring),urgent .45s .3s ease-in-out infinite alternate}
.carry.helpme .cp-arrow{background:linear-gradient(180deg,#fff,#ffe9c2);color:#e07a00}
.carry.helpme .cp-l1{font:var(--fdw) 18px/1 var(--fd);letter-spacing:.02em}
.carry.helpme .who{display:inline-block;padding:0 6px;border-radius:7px;background:var(--c);border:2px solid var(--ink)}
.carry.helpme .cp-l2{font:900 13px/1.15 var(--fb);color:#fff}
.hud[data-state=paused] .help-btn,.hud[data-state=shop] .help-btn{display:none}
/* the HERO! moment */
.announce.an-hero .an-title{color:#ffd23f}
.hero-tip{display:inline-block;margin-left:4px;padding:0 8px;border-radius:8px;background:#7dff5a;color:#08451a}
@media (prefers-reduced-motion:reduce){.help-btn.show,.carry.helpme{animation:none}}
`;
