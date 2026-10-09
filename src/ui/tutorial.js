// The guided tutorial (optional). Its rules live in ui/tutorialFlow.js; this draws them.
// A brand-new player is asked once, "Want a quick tutorial?": in a modal when they press Start on the mode screen
// (offerTutorial, from menus.js), or by a card in the game when their first game is online. Yes: one short card
// at a time (one sentence + the key / button for the keyboard, touch screen or gamepad in use), a bouncing
// beacon over the spot in the world (fx/guide.js), an arrow on the screen edge while that spot is off screen, and
// the old checklist's routed arrow + distance on the card. Skip is always there; the last step ends in confetti.
// Progress is saved in the profile (it resumes after a reload). Replay: Settings, or "Play the tutorial" on the
// mode screen. Players who say no thanks get the "Next goal" chip straight away (ui/goal.js reads `done`).
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { save } from '../core/save.js';
import { LOCK } from '../config.js';
import { h, esc, setText, setHTML, setStyle, toggle, screenAngle, uiSound } from './dom.js';
import { ICON } from './icons.js';
import { isTouch } from './device.js';
import { guidePoint } from './route.js';
import { createGuide } from '../fx/guide.js';
import { injectTutorialStyles } from './tutorialStyle.js';
import { onPress } from './hud.js';
import { socialUi } from '../social/uiState.js';
import {
  STEPS, createStepMachine, tutorialOf, tutorialRecord, wantsOffer, markOffered, answerOffer, replayTutorial, skipTutorial, finishStep,
} from './tutorialFlow.js';

const REVEAL_DELAY = 1.0; // seconds after the intro camera lands
const OFFER_DELAY = 0.6;

// ------------------------------------------------------------------ copy

// key / button glyphs for the device in use ('kb' | 'touch' | 'pad')
const K = (...keys) => keys.map((k) => `<kbd>${k}</kbd>`).join('');
const PAD = (b) => `<span class="tg tg-pad tg-${b.toLowerCase()}">${b}</span>`;
const TAP = (verb) => `<span class="tg tg-tap">${verb}</span>`;
const JOY = '<span class="tg tg-joy" aria-label="joystick"><i></i></span>';
const press = (d, verb) => (d === 'touch' ? `tap ${TAP(verb)}` : `press ${d === 'pad' ? PAD('B') : K('E')}`);
const hold = (d, verb) => `hold ${d === 'touch' ? TAP(verb) : d === 'pad' ? PAD('B') : K('E')}`;

// One short sentence per step (two lines at most on a phone). n = the step machine's note().
const COPY = {
  move: {
    title: "Let's go!",
    text: (d) => (d === 'touch' ? `Drag ${JOY} on the left to walk to the yellow arrow.` : `Walk to the yellow arrow with ${d === 'pad' ? PAD('L') : K('W', 'A', 'S', 'D')}.`),
  },
  grab: { title: 'Grab a seed', text: (d) => `Run up the Seed Road and ${press(d, 'Grab')} at a seed.` },
  plant: { title: 'Plant it', text: (d, n) => (n.kind === 'carry' ? 'Carry it home to your garden. It plants itself!' : 'Oops, no seed! Grab another one.') },
  grow: { title: 'Watch it grow', text: (d, n) => (n.kind === 'growing' ? `Your plant is growing! Ready in ${n.n}s.` : 'Plant a seed in your garden and watch it grow.') },
  collect: { title: 'Collect your cash', text: () => 'Step on the COLLECT pad to scoop up your cash.' },
  speed: {
    title: 'Get faster',
    text: (d, n) => (n.kind === 'need' ? `Collect $${n.n} more cash, then go to the Speed Shop.` : `At the Speed Shop, ${press(d, 'Train')} on the Speed treadmill.`),
  },
  lock: {
    title: 'Lock your garden',
    text: (d, n) => (n.kind === 'recharge' ? `Your lock is recharging. Ready in ${n.n}s.` : `Step on the LOCK pad. Nobody gets in for ${LOCK.duration}s!`),
  },
  steal: {
    title: (n) => (n.kind === 'home' ? 'Run home!' : 'Steal a plant!'),
    text: (d, n) => {
      if (n.kind === 'home') return 'Got it! Run it home before anyone bonks you!';
      if (n.kind === 'none') return 'Wait for a family plant to grow. Locked gardens are safe.';
      const who = esc(n.name);
      const tip = n.kind === 'away' ? ` ${who} is away!` : n.kind === 'home-owner' ? ` Watch out, ${who} is home!` : '';
      return `Sneak into ${who}'s garden and ${hold(d, 'Steal')} on a grown plant.${tip}`;
    },
  },
};

const deviceOf = (app) => {
  const d = app.input?.lastDevice;
  if (d === 'gamepad') return 'pad';
  if (d === 'touch') return 'touch';
  return d === 'keyboard' ? 'kb' : isTouch() ? 'touch' : 'kb';
};

// ------------------------------------------------------------------ the offer

/**
 * "Want a quick tutorial?" with big Yes / No thanks buttons. Keys: Y / N. Gamepad: A / B in the menu; in a game
 * (game: true) A and B jump and grab, so it takes D-pad up / left there, like a trade invite. blocked(): the
 * game's card is out of sight or something else has those keys (a menu, a trade window...): presses are ignored.
 */
function offerCard(app, onAnswer, { cls = '', game = false, blocked = null } = {}) {
  injectTutorialStyles();
  const d = deviceOf(app);
  let answered = false; // a key, a button and a click in the same moment answer once
  const answer = (yes) => {
    if (answered) return;
    answered = true;
    uiSound(app, 'click');
    onAnswer(yes);
  };
  // the buttons act on the pointer itself: a second finger gets no click while a thumb is on the joystick
  const yes = h('button', { class: 'btn btn-green btn-lg tof-yes', type: 'button', 'data-autofocus': '' },
    h('span', { class: 'bi', html: ICON.play }), h('span', { text: 'Yes, show me!' }));
  const no = h('button', { class: 'btn btn-grey tof-no', type: 'button', text: 'No thanks' });
  onPress(yes, () => answer(true), 'up');
  onPress(no, () => answer(false), 'up');
  const [YES, NO] = game ? [12, 14] : [0, 1];
  const padHint = game ? `${K('\u2191')} yes &nbsp; ${K('\u2190')} no` : `${PAD('A')} yes &nbsp; ${PAD('B')} no`;
  const hint = d === 'pad' ? padHint : d === 'kb' ? `${K('Y')} yes &nbsp; ${K('N')} no` : '';
  const el = h('div', { class: 'tof ' + cls, role: 'group', 'aria-label': 'Quick tutorial?' },
    h('div', { class: 'tof-ic', html: ICON.sprout }),
    h('h2', { class: 'tof-title', text: 'Want a quick tutorial?' }),
    h('p', { class: 'tof-sub', text: 'Learn to grab, grow and steal in a few easy steps.' }),
    h('div', { class: 'tof-btns' }, yes, no),
    hint ? h('p', { class: 'tof-hint', html: hint }) : null);
  // keyboard: Y / N (no game key uses them)
  const onKey = (e) => {
    const tg = e.target;
    if (e.repeat || tg?.tagName === 'INPUT' || tg?.tagName === 'TEXTAREA' || tg?.isContentEditable || blocked?.()) return;
    if (e.code === 'KeyY') answer(true);
    else if (e.code === 'KeyN') answer(false);
  };
  window.addEventListener('keydown', onKey);
  // gamepad: a fresh press only. A button already down when polling (re)starts (the B or A that closed the pause
  // menu, a held jump) is only recorded; resetPad() while the card is out of sight. No allocation per frame.
  let seen = false, wasY = false, wasN = false;
  const pollPad = () => {
    const gp = app.input?.gamepad?.();
    const y = !!gp?.buttons[YES]?.pressed, n = !!gp?.buttons[NO]?.pressed;
    const yesNow = seen && y && !wasY, noNow = seen && n && !wasN;
    seen = !!gp;
    wasY = y;
    wasN = n;
    if ((yesNow || noNow) && !blocked?.()) answer(yesNow);
  };
  const resetPad = () => (seen = false);
  return { el, pollPad, resetPad, dispose: () => window.removeEventListener('keydown', onKey) };
}

/**
 * Before a solo game starts (menus.js): a player who has never been asked gets the offer in a modal, and
 * `start()` runs once they answer. Returns false (and does nothing) when there is nothing to ask.
 */
export function offerTutorial(app, profileId, start) {
  const id = profileId || app.profileId;
  if (!app.menus?.openModal || !wantsOffer(id, app.hasSave?.(id))) return false;
  let m = null;
  let raf = 0;
  const card = offerCard(app, (yes) => {
    answerOffer(id, yes);
    m?.close(true);
    start();
  });
  const loop = () => {
    card.pollPad();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  m = app.menus.openModal(card.el, { cls: 'tut-offer', label: 'Quick tutorial?' });
  m.dispose = () => {
    cancelAnimationFrame(raf);
    card.dispose();
  };
  markOffered(id); // closed without an answer: asked again next time
  return true;
}

/** "Play the tutorial" (mode screen): turns it on for the active profile, then `start()` plays. */
export function tutorialButton(app, start) {
  injectTutorialStyles();
  return h('button', {
    class: 'link tut-replay', type: 'button', html: `<span class="bi">${ICON.help}</span><span>Play the tutorial</span>`,
    onclick: () => {
      uiSound(app, 'click');
      replayTutorial(app.profileId);
      start();
    },
  });
}

/** Settings: start the tutorial again for the active profile (in a game it begins as you go back to it). */
export function resetTutorial(app) {
  save('ui:hints-off', false);
  return replayTutorial(app.profileId);
}

// ------------------------------------------------------------------ in the game

export function createTutorial(app, parent) {
  injectTutorialStyles();
  const game = app.game;
  const me = app.human;
  const pid = app.profileId;
  const hud = parent.closest('.hud') || parent;
  const online = !!app.online?.room;
  const offs = [];

  const arrow = h('span', { class: 'tut-arrow', html: ICON.arrow });
  const nowTitle = h('b');
  const nowText = h('span', { class: 'tut-text' });
  const dist = h('span', { class: 'tut-dist' });
  const count = h('span', { class: 'tut-count' });
  const skip = h('button', { class: 'tut-skip', type: 'button', 'aria-label': 'Skip tutorial', html: '<span class="tsk-l">Skip tutorial</span><span class="tsk-s">Skip</span>' });
  const dots = STEPS.map(() => h('i'));
  const el = h('div', { class: 'tut tut-guided wait gone', role: 'region', 'aria-label': 'Tutorial' },
    h('div', { class: 'tut-head' }, h('span', { class: 'tut-kicker', html: ICON.sprout + 'Tutorial' }), count, skip),
    h('div', { class: 'tut-now' }, h('div', { class: 'tut-nav' }, arrow, dist), h('div', { class: 'tut-copy' }, nowTitle, nowText)),
    h('div', { class: 'tut-dots', 'aria-hidden': 'true' }, dots));
  parent.appendChild(el);
  const edge = h('div', { class: 'tut-edge', 'aria-hidden': 'true' }, h('span', { class: 'te-rot' }, h('span', { class: 'te-ic', html: ICON.arrow })));
  hud.appendChild(edge);
  const guide = createGuide(app.engine.scene);

  let machine = null;
  let finished = false; // the last step just ended: the card celebrates, then goes
  let gone = true;
  let offer = null; // the in-game offer card (online)
  let offerIn = -1;
  let revealIn = REVEAL_DELAY;
  let acc = 1;
  let leaveIn = 0; // the finished card's last seconds on screen

  const say = (title, text) => {
    setHTML(nowTitle, title);
    setHTML(nowText, text);
  };
  const visible = () => settings.tips !== false && !gone;
  function pop() {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  function paintStep() {
    const i = machine.step;
    setText(count, `${Math.min(i + 1, STEPS.length)}/${STEPS.length}`);
    dots.forEach((d, k) => {
      toggle(d, 'done', k < i);
      toggle(d, 'cur', k === i);
    });
    acc = 1; // refresh the line now
  }

  function start(step) {
    machine?.dispose();
    finished = false;
    gone = false;
    el.classList.remove('gone', 'complete');
    machine = createStepMachine(game, me, {
      step,
      onAdvance: (i, next) => {
        if (!next) finished = true; // before the save below: sync() must not stop the celebration
        finishStep(pid, i);
        if (!next) finish();
        else {
          paintStep();
          pop();
          uiSound(app, 'unlock');
          app.fx?.burst?.('sparkle', { x: me.pos.x, y: me.pos.y + 4, z: me.pos.z }, { color: '#ffd23f', count: 12 });
        }
      },
    });
    paintStep();
  }

  function stop() {
    machine?.dispose();
    machine = null;
    guide.set(null);
    toggle(edge, 'show', false);
    gone = true;
    el.classList.add('gone');
  }

  function finish() {
    finished = true;
    guide.set(null);
    toggle(edge, 'show', false);
    toggle(el, 'has-arrow', false);
    el.classList.add('complete');
    setText(count, `${STEPS.length}/${STEPS.length}`);
    dots.forEach((d) => toggle(d, 'done', true));
    say('You did it!', 'You know it all. Now grow the richest garden!');
    pop();
    uiSound(app, 'confetti');
    const at = { x: me.pos.x, y: me.pos.y + 4, z: me.pos.z };
    app.fx?.burst?.('confetti', at, { count: 60 });
    app.fx?.storm?.(me.pos, 2.4, { follow: me.pos, rate: 40, sparkle: true, radius: 10 });
    app.hud?.alerts?.announce?.({ title: 'Tutorial complete!', sub: 'You are ready to grow, steal and win!', cls: 'tut-ann', ms: 3600 });
    leaveIn = 4.2;
  }

  skip.addEventListener('mousedown', (e) => e.preventDefault());
  skip.addEventListener('click', () => {
    if (!machine || finished) return;
    uiSound(app, 'click');
    skipTutorial(pid);
    stop();
    app.hud?.alerts?.toast?.('Tutorial skipped. Replay it any time in Settings.', 'info');
  });

  // ---- the online offer: a card in the game (online games never pause, so it doesn't block play)
  function showOffer() {
    const st = tutorialRecord(pid).state;
    if (st !== 'new' && st !== 'offered') return; // answered meanwhile (another tab, Settings...)
    offer = offerCard(app, (yes) => {
      closeOffer();
      answerOffer(pid, yes); // profile:changed starts it (below)
      if (!yes) app.hud?.alerts?.toast?.('No problem! The tutorial is in Settings if you want it.', 'info');
    }, { cls: 'tof-game', game: true, blocked: offerBlocked });
    hud.appendChild(offer.el);
    markOffered(pid);
  }
  // the card hides under menus (tutorialStyle.js); a trade window, the emote wheel or the Trade / Gift chip and
  // invite (ui/trade.js: they own Y / N and the D-pad while up) have those keys first
  const offerBlocked = () => app.state !== 'playing' || socialUi.sheet || socialUi.wheel || !!app.menus?.isBlocking?.() || !!hud.querySelector('.soc-dock');
  function closeOffer() {
    if (!offer) return;
    offer.dispose();
    offer.el.remove();
    offer = null;
  }

  // the profile decides: replaying from Settings, skipping, a cloud restore...
  function sync() {
    const t = tutorialRecord(pid);
    if (t.state === 'active') {
      if (!machine || finished || machine.step !== t.step) start(t.step);
    } else if (machine && !finished) stop();
    if (offer && t.state !== 'new' && t.state !== 'offered') closeOffer();
  }
  offs.push(bus.on('profile:changed', ({ profile }) => {
    if (profile?.id === pid) sync();
  }));
  offs.push(bus.on('settings:changed', ({ key }) => {
    if (key === 'tips') el.classList.toggle('hidden', settings.tips === false);
  }));

  // first look (before this game's own progress counts): a player who already knows the game is never
  // asked; online, a new player is asked here
  const t0 = tutorialOf(pid, app.hasSave?.(pid));
  if (t0?.state === 'active') start(t0.step);
  else if (online && me && (t0?.state === 'new' || t0?.state === 'offered')) offerIn = OFFER_DELAY;
  el.classList.toggle('hidden', settings.tips === false);

  let under = 2; // phones: the card is a strip across the top, the beacon tries to show below it (NDC y)
  const box = { l: 0, t: 0, r: 0, b: 0 };
  const off = { show: false, x: 0, y: 0, angle: 0 };
  const shown = { x: -1, y: -1, a: 9 }; // where the edge arrow is now (no string building unless it moved)

  function placeEdge() {
    const w = window.innerWidth, ht = window.innerHeight;
    const touch = deviceOf(app) === 'touch' || isTouch();
    // stay clear of the corner columns up top and the thumb buttons (or hotbar) at the bottom
    box.l = 34;
    box.r = w - 34;
    box.t = Math.min(ht * 0.4, 96);
    box.b = ht - Math.min(ht * 0.4, touch ? 176 : 120);
    guide.offscreen(app.engine.camera, w, ht, box, off);
    const on = off.show && app.state === 'playing';
    toggle(edge, 'show', on);
    if (!on) return;
    const x = Math.round(off.x), y = Math.round(off.y);
    if (x !== shown.x || y !== shown.y) {
      shown.x = x;
      shown.y = y;
      setStyle(edge, 'transform', `translate(${x}px,${y}px)`);
    }
    if (Math.abs(off.angle - shown.a) > 0.02) {
      shown.a = off.angle;
      setStyle(edge.firstChild, 'transform', `rotate(${off.angle.toFixed(2)}rad)`);
    }
  }

  return {
    get done() {
      return gone || !machine || settings.tips === false;
    },
    update(dt) {
      const landed = (app.cam?.introT ?? 1) >= 1;
      if (offerIn >= 0 && landed) {
        offerIn -= dt;
        if (offerIn < 0) showOffer();
      }
      if (offer) {
        if (app.state === 'playing') offer.pollPad();
        else offer.resetPad(); // the press that closes the menu is no answer
      }
      if (!machine || gone) return;
      // stay out of the way while the intro camera swoops in, then slide in a beat after the HUD
      if (revealIn > 0) {
        if (landed) revealIn -= dt;
        if (revealIn > 0) return;
        el.classList.remove('wait');
        pop();
      }
      if (!visible()) {
        guide.set(null);
        toggle(edge, 'show', false);
        return;
      }
      if (!finished && app.state === 'playing') machine.tick();
      if (finished) {
        leaveIn -= dt;
        if (leaveIn <= 0) stop();
        return;
      }
      guide.update(dt, app.engine.camera, under);
      placeEdge();
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      const r = el.getBoundingClientRect();
      const ht = window.innerHeight;
      under = r.width > window.innerWidth * 0.6 && r.bottom > 0 ? 1 - (2 * (r.bottom + 36)) / ht : 2;
      const tgt = machine.target();
      guide.set(tgt);
      const id = machine.id;
      if (!id) return;
      const n = machine.note();
      const c = COPY[id];
      const d = deviceOf(app);
      say(typeof c.title === 'function' ? c.title(n) : c.title, c.text(d, n));
      // the routed arrow + walking distance (round fences and through the gates; ui/route.js)
      const g = tgt ? guidePoint(me.pos, tgt, game.physics?.boxes) : null;
      const show = !!g && g.dist > machine.arrive;
      toggle(el, 'has-arrow', show);
      if (show) {
        setStyle(arrow, 'transform', `rotate(${screenAngle(me.pos, g, app.cam.yaw).toFixed(2)}rad)`);
        setText(dist, `${Math.round(g.dist)} studs`);
      }
    },
    dispose() {
      offs.forEach((f) => f());
      machine?.dispose();
      closeOffer();
      guide.dispose();
      edge.remove();
      el.remove();
    },
  };
}
