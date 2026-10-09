// Big Chomp's HUD bar (beside the weather chip): name, hit points, time left and what it's up to. Also the
// boss's icon and the styles for its banners and its world label (view/bossView.js), injected once.
// Contract: createBossBar(app, parent) -> {update(dt), dispose()}; injectBossStyles(); CHOMP_ICON (svg)
import { h, esc, setText, setHTML, setStyle, toggle, money, clock } from './dom.js';

const INK = '#10163a';
/** A little caterpillar with googly eyes and buck teeth. */
export const CHOMP_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
<circle cx="4.6" cy="16.4" r="3" fill="#86dc45" stroke="${INK}" stroke-width="1.4"/>
<circle cx="8.8" cy="15.2" r="3.5" fill="#9be65a" stroke="${INK}" stroke-width="1.4"/>
<path d="M13.4 3.2 14.2 7M19 3.4 18.1 7" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>
<circle cx="13.3" cy="2.8" r="1.25" fill="#ffe14d" stroke="${INK}" stroke-width="1"/><circle cx="19.2" cy="3" r="1.25" fill="#ffe14d" stroke="${INK}" stroke-width="1"/>
<circle cx="16" cy="12.4" r="6" fill="#86dc45" stroke="${INK}" stroke-width="1.5"/>
<circle cx="13.9" cy="10.4" r="2" fill="#fff" stroke="${INK}" stroke-width="1.1"/><circle cx="18.2" cy="10.4" r="2" fill="#fff" stroke="${INK}" stroke-width="1.1"/>
<circle cx="14.3" cy="11" r=".9" fill="${INK}"/><circle cx="17.7" cy="11.1" r=".9" fill="${INK}"/>
<path d="M13.2 14.2q2.8 2.6 5.6 0" fill="#5a0f2a" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
<path d="M15.2 14.9h1.6v1.3h-1.6z" fill="#fff" stroke="${INK}" stroke-width=".6"/>
</svg>`;

const css = `
.bossbar{position:relative;display:flex;align-items:center;gap:9px;width:min(440px,100%);padding:5px 12px 7px 6px;border-radius:16px;border:3px solid var(--ink);
  background:linear-gradient(180deg,#7fd34a,#2f8f3a);box-shadow:inset 0 2px 0 rgba(255,255,255,.35),0 4px 0 rgba(10,14,40,.6);animation:alertIn .5s var(--spring) both;max-width:100%}
.bossbar[hidden]{display:none}
.bossbar.mine{background:linear-gradient(180deg,#ff8a5c,#d8344a)}
.bossbar.bye{background:linear-gradient(180deg,#9aa4b8,#5d6680)}
.bb-ic{width:40px;height:40px;flex:none;animation:chompWiggle .55s ease-in-out infinite alternate}
.bb-ic svg{width:100%;height:100%;display:block}
.bb-main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.bb-top{display:flex;align-items:baseline;gap:8px}
.bb-name{font:var(--fdw) 19px/1 var(--fd);letter-spacing:.03em;color:#fff;text-shadow:var(--o1);white-space:nowrap}
.bb-time{margin-left:auto;font:var(--fdw) 18px/1 var(--fd);color:#fff;text-shadow:var(--o1);font-variant-numeric:tabular-nums}
.bb-hp{position:relative;height:15px;border-radius:9px;background:rgba(16,22,58,.75);border:2px solid var(--ink);overflow:hidden}
.bb-hp i{position:absolute;inset:0;display:block;background:linear-gradient(180deg,#ffe36b,#ff9f1a);transform-origin:0 50%;transition:transform .18s ease-out}
.bb-hp.low i{background:linear-gradient(180deg,#ff8f8f,#ff3b5c)}
.bb-hp b{position:relative;display:block;text-align:center;font:900 11px/11px var(--fb);color:#fff;text-shadow:0 1px 0 var(--ink),0 0 2px var(--ink)}
.bossbar.hit .bb-hp{animation:bbHit .22s ease-out}
.bb-sub{font:900 12px/1.15 var(--fb);color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bb-sub .cash{color:#ffe36b}
@keyframes chompWiggle{from{transform:rotate(-8deg) scale(1)}to{transform:rotate(8deg) scale(1.06)}}
@keyframes bbHit{0%{transform:scale(1.06,1.3)}100%{transform:none}}
/* the big banners */
.an-boss .an-title{color:#9be65a}
.an-boss .an-ic svg{animation:chompWiggle .4s ease-in-out infinite alternate}
/* the label over its head */
.bosslbl{text-shadow:none}
.bl-name{font:var(--fdw) 18px/1 var(--fd);letter-spacing:.03em;color:#c8ff8a;text-shadow:var(--o1);white-space:nowrap}
.bl-hp{width:120px;height:11px;margin:4px auto 0;border-radius:7px;border:2px solid var(--ink);background:rgba(16,22,58,.75);overflow:hidden}
.bl-hp i{display:block;height:100%;background:linear-gradient(180deg,#ffe36b,#ff9f1a);transform-origin:0 50%}
.bl-hp.low i{background:linear-gradient(180deg,#ff8f8f,#ff3b5c)}
/* small screens: one line of words at most */
@media (max-width:640px){
  .bossbar{padding:4px 10px 6px 5px;gap:7px}
  .bb-ic{width:32px;height:32px}
  .bb-name{font-size:16px}
  .bb-time{font-size:15px}
  .bb-sub{font-size:11px}
}
/* short portrait phones: the words step aside while a prompt or carry pill needs the middle of the screen */
@media (max-width:640px) and (max-height:740px){
  .hud:has(.prompt.show) .bb-sub,.hud:has(.carry.show) .bb-sub{display:none}
}
@media (max-height:500px){
  .bb-sub{display:none}
  .bb-ic{width:28px;height:28px}
  .bb-name{font-size:15px}
}
`;

let injected = false;
export function injectBossStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.id = 'sas-boss';
  el.textContent = css;
  document.head.appendChild(el);
}

export function createBossBar(app, parent) {
  injectBossStyles();
  const game = app.game;
  const me = app.human;
  const name = h('b', { class: 'bb-name', text: 'BIG CHOMP' });
  const time = h('span', { class: 'bb-time' });
  const fill = h('i');
  const num = h('b');
  const hp = h('div', { class: 'bb-hp' }, fill, num);
  const sub = h('div', { class: 'bb-sub' });
  const el = h('div', { class: 'bossbar', role: 'status' }, h('span', { class: 'bb-ic', html: CHOMP_ICON }),
    h('div', { class: 'bb-main' }, h('div', { class: 'bb-top' }, name, time), hp, sub));
  el.hidden = true;
  parent.appendChild(el);
  let uid = null;
  let lastHp = -1;
  let hitT = 0;
  let acc = 1;
  return {
    update(dt) {
      if (hitT > 0 && (hitT -= dt) <= 0) el.classList.remove('hit');
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      const b = game.boss;
      if (!b) {
        if (uid != null) {
          el.hidden = true;
          uid = null;
        }
        return;
      }
      if (b.uid !== uid) {
        uid = b.uid;
        el.hidden = false;
        lastHp = -1;
      }
      const v = game.players[b.target];
      const mine = !!me && v === me;
      toggle(el, 'mine', mine && b.state !== 'leave');
      toggle(el, 'bye', b.state === 'leave');
      if (b.hp !== lastHp) {
        if (lastHp >= 0 && b.hp < lastHp) {
          el.classList.remove('hit');
          void el.offsetWidth;
          el.classList.add('hit');
          hitT = 0.25;
        }
        lastHp = b.hp;
        setStyle(fill, 'transform', `scaleX(${Math.max(0, Math.min(1, b.hp / b.max)).toFixed(3)})`);
        setText(num, `${Math.ceil(b.hp)} / ${Math.round(b.max)}`);
        toggle(hp, 'low', b.hp < b.max * 0.25);
      }
      setText(time, b.state === 'leave' ? '' : clock(b.until - game.time));
      const who = mine ? 'YOUR' : `${esc(v?.name || 'a')}'s`;
      const slurp = b.slurped >= 1 ? ` <span class="cash">-${money(b.slurped)}</span>` : '';
      const chill = game.difficultyId === 'chill'; // it only sniffs about on Chill
      setHTML(sub, b.state === 'leave' ? 'BUUURP! It\'s crawling away...'
        : b.state === 'munch' ? (chill ? `It's sniffing ${who} garden! BONK it!` : `It's eating ${who} cash!${slurp} BONK it!`)
          : chill ? `It's heading for ${who} garden! BONK it!` : `It wants ${who} cash! BONK it!`);
    },
    dispose() {
      el.remove();
    },
  };
}
