// High Scores panel. OWNER: backend agent (docs/ONLINE.md). openLeaderboard(app, {board, scope}).
// Four boards x (Everyone | Family on this device) x (All time | This week). Global rows come from
// src/online/api.js (Supabase); the family board is computed from the profiles on this device and works
// offline. Entries show a colour chip with an initial: never photos.
import { CHARACTER } from '../config.js';
import { load, save } from '../core/save.js';
import { bus } from '../core/events.js';
import { h, money, fmtNum, reducedMotion } from './dom.js';
import { ICON } from './icons.js';
import {
  BOARDS, BOARD, topScores, familyScores, cloudState, cloudLink, submitScore, profileScores, onlineConfigured, onlineReady, setListed,
} from '../online/api.js';
import { openCloudSave } from './cloudsave.js';

// ------------------------------------------------------------------ shared bits (also used by cloudsave.js)

const sv = (body, extra = '') =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;
export const SAS_ICON = {
  globe: sv('<circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4M12 2.8c2.6 2.6 3.8 5.7 3.8 9.2s-1.2 6.6-3.8 9.2c-2.6-2.6-3.8-5.7-3.8-9.2S9.4 5.4 12 2.8z"/>'),
  cloud: sv('<path d="M7 18.5h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.6 1.3A3.4 3.4 0 0 0 7 18.5z" fill="currentColor" stroke-width="2"/>'),
  cloudOff: sv('<path d="M7 18.5h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.6 1.3A3.4 3.4 0 0 0 7 18.5z"/><path d="M4 4l16 16"/>'),
  copy: sv('<rect x="8.5" y="8.5" width="11" height="11" rx="2.4"/><path d="M15.5 8.5V6.4a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>'),
  key: sv('<circle cx="8" cy="15" r="4.2"/><path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14.2 8.8l2 2"/>'),
  sleep: sv('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" fill="currentColor" stroke-width="2"/>'),
  paw: sv('<circle cx="7" cy="9" r="1.9" fill="currentColor"/><circle cx="11" cy="6.2" r="1.9" fill="currentColor"/><circle cx="15.3" cy="7" r="1.9" fill="currentColor"/><circle cx="18" cy="11" r="1.8" fill="currentColor"/><path d="M8.5 17.5c0-3 2-5.3 4.3-5.3s4.2 2.3 4.2 5.2c0 1.8-1.4 2.4-2.8 2-1-.3-1.9-.3-2.9 0-1.5.5-2.8-.1-2.8-1.9z" fill="currentColor"/>'),
  medal: sv('<path d="M8 3h8l-2.5 6h-3z" fill="currentColor"/><circle cx="12" cy="15" r="5.5"/><path d="M12 12.5v5"/>'),
};

const BOARD_ICON = { networth: ICON.coin, showdown: ICON.trophy, steals: ICON.eye, rebirths: ICON.reset };
const BOARD_COLOR = { networth: '#2fbf55', showdown: '#ffa600', steals: '#9b5cff', rebirths: '#ff4f9a' };

export const colorOf = (base) => (CHARACTER[base] || { color: '#6e78a8' }).color;
const initial = (name) => ([...String(name || '?').trim()][0] || '?').toUpperCase();

/** Colour disc with the player's initial (the high-score "avatar": never a photo). */
export function nameChip(name, base, cls = '') {
  return h('span', { class: 'sas-chip ' + cls, style: `--c:${colorOf(base)}`, 'aria-hidden': 'true' }, h('b', { text: initial(name) }));
}

export function fmtScore(board, v) {
  if (!(v > 0)) return '—';
  return BOARD[board]?.unit === 'money' ? money(v) : fmtNum(v);
}

/** Kid-friendly words for an OnlineError. */
export function friendlyError(e) {
  switch (e?.code) {
    case 'offline': return "You're offline. Check the internet and try again.";
    case 'not_configured': return "Online features aren't switched on yet.";
    case 'network':
    case 'timeout':
    case 'backoff': return "Couldn't reach the server. Try again in a moment.";
    case 'rate_limited': return 'Whoa, speedy! Wait a few seconds and try again.';
    case 'server': return 'The server is taking a nap. Try again soon.';
    case 'bad_code': return 'Save codes look like SEED-7K4Q-9XPM.';
    case 'not_found': return "We couldn't find that code. Check each letter!";
    case 'too_big': return 'This save is too big for the cloud.';
    case 'moved':
    case 'bad_secret': return 'This save code is being used on another device now.';
    default: return 'Oops, something went wrong. Try again.';
  }
}

const CSS = `
.sas-chip{--s:36px;position:relative;width:var(--s);height:var(--s);flex:none;border-radius:50%;display:grid;place-items:center;
  background:linear-gradient(160deg,rgba(255,255,255,.34),rgba(0,0,0,.2)),var(--c);border:3px solid var(--ink);box-shadow:inset 0 2px 0 rgba(255,255,255,.3),0 2px 0 rgba(10,14,40,.4)}
.sas-chip b{font:var(--fdw) calc(var(--s)*.5)/1 var(--fd);color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.35);margin-top:1px}
.sas-note{font:700 12.5px/1.35 var(--fb);color:var(--txt3)}
.sas-err{font:800 13.5px/1.3 var(--fb);color:#ffb3c0}
.sas-busy{position:relative;pointer-events:none}
.sas-busy::after{content:'';width:16px;height:16px;border-radius:50%;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;animation:spin .7s linear infinite;flex:none}
.mh-ic.sas-gold{background:linear-gradient(180deg,#ffe463,#ffa600);color:var(--ink);--ico-hole:#ffa600}
.mh-ic.sas-sky{background:linear-gradient(180deg,#7fd3ff,#2a8fe6);color:#fff}

/* ---------------------------------------------------------------- high scores */
.modal-panel.sas-lb{width:min(800px,100%)}
.sas-lb-body{display:grid;grid-template-columns:212px minmax(0,1fr);grid-template-rows:auto auto 1fr;grid-template-areas:"head head" "tabs main" "done main";column-gap:16px}
.sas-lb-body > .mh{grid-area:head;flex-wrap:wrap;row-gap:10px}
.sas-lb-body > .lb-tabs{grid-area:tabs}
.sas-lb-body > .lb-main{grid-area:main}
.sas-lb-body > .modal-done{grid-area:done;align-self:end;margin-top:14px}
.sas-lb-body > .modal-done .btn{min-width:0;width:100%}
.lb-scope{display:flex;gap:4px;padding:4px;margin-left:auto;border-radius:17px;background:rgba(10,15,40,.6);border:3px solid var(--ink)}
.lb-scope .seg-b{display:flex;align-items:center;gap:7px;padding-left:14px;padding-right:16px}
.lb-scope .seg-b .bi{width:21px;height:21px}
.lb-tabs{display:flex;flex-direction:column;gap:9px}
.lb-tab{--tc:#5cb8ff;display:flex;align-items:center;gap:10px;min-height:56px;padding:7px 12px 8px 7px;border-radius:17px;border:3px solid var(--ink);color:#fff;cursor:pointer;text-align:left;
  background:rgba(10,15,40,.5);font:var(--fdw) 17.5px/1.02 var(--fd);letter-spacing:.02em;text-shadow:0 2px 0 rgba(0,0,0,.35);box-shadow:0 4px 0 var(--ink);
  transition:transform .14s var(--spring),background .15s,box-shadow .15s}
.lb-tab:hover{transform:translateY(-2px);background:rgba(40,52,120,.7)}
.lb-tab:active{transform:translateY(3px);box-shadow:0 1px 0 var(--ink)}
.lb-tab:focus-visible{outline:4px solid #fff;outline-offset:2px}
.lt-ic{width:40px;height:40px;flex:none;display:grid;place-items:center;padding:7px;border-radius:13px;color:#fff;border:2.5px solid var(--ink);
  background:linear-gradient(180deg,rgba(255,255,255,.34),rgba(0,0,0,.14)),var(--tc);box-shadow:inset 0 2px 0 rgba(255,255,255,.25)}
.lb-tab.on{background:linear-gradient(180deg,#ffe066,#ffae1c);color:var(--ink);text-shadow:0 1px 0 rgba(255,255,255,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.6),0 4px 0 var(--ink),0 0 0 3px rgba(255,255,255,.55)}
.lb-main{display:flex;flex-direction:column;gap:10px;min-width:0}
.lb-sub{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap;min-height:44px}
.lb-title{display:flex;flex-direction:column;gap:3px;min-width:0}
.lb-title b{font:var(--fdw) 24px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.lb-title span{font:800 12.5px/1.2 var(--fb);color:var(--txt2)}
.lb-period .seg-b{min-height:38px;padding:7px 13px 9px;font-size:15.5px}
.lb-list{list-style:none;margin:0;padding:6px;display:flex;flex-direction:column;gap:6px;min-height:236px;max-height:max(236px,calc(100vh - 300px));max-height:max(236px,calc(100dvh - 300px));
  overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;touch-action:pan-y;border-radius:18px;background:rgba(10,15,40,.34);box-shadow:inset 0 3px 8px rgba(0,0,0,.25);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.3) transparent}
.lb-row{position:relative;display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 14px 6px 8px;border-radius:14px;background:rgba(10,15,40,.45);
  animation:lbIn .38s var(--d,0ms) var(--spring) both;flex:none}
.lb-row.gold{background:linear-gradient(90deg,rgba(255,210,63,.32),rgba(10,15,40,.45) 72%)}
.lb-row.silver{background:linear-gradient(90deg,rgba(214,226,240,.24),rgba(10,15,40,.45) 72%)}
.lb-row.bronze{background:linear-gradient(90deg,rgba(224,146,90,.28),rgba(10,15,40,.45) 72%)}
.lb-row.me{background:linear-gradient(90deg,rgba(255,255,255,.3),rgba(255,255,255,.1));box-shadow:inset 0 0 0 3px var(--gold),0 0 20px rgba(255,210,63,.35)}
.lb-row.zero{opacity:.62}
.lb-rank{width:36px;flex:none;display:grid;place-items:center;font:var(--fdw) 19px/1 var(--fd);color:var(--txt3);font-variant-numeric:tabular-nums}
.lb-rank.medal b{position:relative;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;border:3px solid var(--ink);font:var(--fdw) 18px/1 var(--fd);color:var(--ink);
  background:radial-gradient(circle at 34% 28%,#fffbe0 0 12%,#ffd23f 40%,#e39a00 100%);box-shadow:inset 0 -3px 0 rgba(0,0,0,.16),0 3px 0 rgba(10,14,40,.5)}
.lb-rank.medal b::before{content:'';position:absolute;inset:3px;border-radius:50%;border:1.5px solid rgba(255,255,255,.55)}
.silver .lb-rank.medal b{background:radial-gradient(circle at 34% 28%,#fff 0 12%,#dfe7f2 40%,#98a7bf 100%)}
.bronze .lb-rank.medal b{background:radial-gradient(circle at 34% 28%,#ffe9d6 0 12%,#eba06a 40%,#a95b26 100%)}
.lb-name{flex:1;min-width:0;display:flex;align-items:center;gap:8px}
.lb-nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:var(--fdw) 19px/1.15 var(--fd);letter-spacing:.01em;text-shadow:var(--o1)}
.lb-you{flex:none;font:900 10.5px/1 var(--fb);letter-spacing:.12em;text-transform:uppercase;padding:4px 7px 4px 8px;border-radius:8px;background:var(--gold);color:var(--ink);border:2px solid var(--ink);transform:rotate(-4deg)}
.lb-val{flex:none;font:var(--fdw) 20px/1 var(--fd);color:var(--cash);text-shadow:var(--o1);font-variant-numeric:tabular-nums;letter-spacing:.01em}
.lb-val.count{color:#ffe066}
.lb-gap{flex:none;text-align:center;color:var(--txt3);font:900 20px/.6 var(--fb);letter-spacing:.35em;padding:4px 0 6px}
.lb-row.sk{animation:none;background:rgba(10,15,40,.38)}
.lb-row.sk i{display:block;height:14px;border-radius:8px;background:linear-gradient(90deg,rgba(255,255,255,.07) 0,rgba(255,255,255,.2) 40%,rgba(255,255,255,.07) 80%) 0 0/200% 100%;animation:lbShim 1.2s linear infinite}
.lb-row.sk .i1{width:26px;height:26px;border-radius:50%;margin-left:5px}
.lb-row.sk .i2{width:36px;height:36px;border-radius:50%}
.lb-row.sk .i3{flex:1;max-width:46%}
.lb-row.sk .i4{width:64px;margin-left:auto}
.lb-msg{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:9px;padding:22px 14px}
.lm-ic{width:66px;height:66px;display:grid;place-items:center;padding:14px;border-radius:22px;border:3px solid var(--ink);color:#fff;background:linear-gradient(180deg,#8a95c9,#4f5889);
  box-shadow:inset 0 3px 0 rgba(255,255,255,.3),0 5px 0 var(--ink);animation:lbBob 2.6s ease-in-out infinite}
.lm-ic.sun{background:linear-gradient(180deg,#ffe463,#ffa600);color:var(--ink)}
.lm-ic.sky{background:linear-gradient(180deg,#7fd3ff,#2a8fe6)}
.lb-msg b{font:var(--fdw) 23px/1.1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.lb-msg p{margin:0;max-width:340px;font:700 14px/1.4 var(--fb);color:var(--txt2)}
.lb-msg .row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:4px}
.lb-join{display:flex;align-items:center;gap:12px;padding:10px 12px 10px 10px;border-radius:17px;border:2.5px dashed rgba(255,255,255,.4);background:linear-gradient(90deg,rgba(63,214,90,.26),rgba(63,214,90,.06));animation:lbIn .4s .15s var(--spring) both}
.lb-join.warn{background:linear-gradient(90deg,rgba(255,166,0,.28),rgba(255,166,0,.06))}
.lb-join .sas-chip{--s:42px}
.lj-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.lj-copy b{font:var(--fdw) 18px/1.1 var(--fd);letter-spacing:.01em;text-shadow:var(--o1)}
.lj-copy small{font:700 12px/1.3 var(--fb);color:var(--txt2)}
.lb-join .btn{flex:none}
.lb-foot{margin:0;text-align:center}
@keyframes lbIn{from{opacity:0;transform:translateY(10px) scale(.97)}}
@keyframes lbShim{to{background-position:-200% 0}}
@keyframes lbBob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-5px) rotate(3deg)}}

@media (max-width:640px){
  .sas-lb-body{grid-template-columns:minmax(0,1fr);grid-template-rows:none;grid-template-areas:"head" "tabs" "main" "done"}
  .sas-lb-body > .mh{padding-right:0;margin-bottom:12px}
  .sas-lb-body > .modal-done .btn{width:auto;min-width:min(260px,100%)}
  .lb-scope{width:100%;margin-left:0}
  .lb-scope .seg-b{flex:1;justify-content:center;padding-left:8px;padding-right:8px}
  .lb-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-bottom:10px}
  .lb-tab{flex-direction:column;justify-content:flex-start;gap:5px;min-height:0;padding:7px 3px 8px;border-radius:15px;text-align:center;font-size:13px;line-height:1.02;box-shadow:0 3px 0 var(--ink)}
  .lt-ic{width:36px;height:36px;padding:6px;border-radius:12px}
  .lb-sub{flex-wrap:nowrap;min-height:0}
  .lb-title b{display:none}
  .lb-title span{font-size:12.5px}
  .lb-period{flex:none}
  .lb-period .seg-b{min-height:34px;padding:6px 10px 8px;font-size:14px}
  .lb-list{max-height:max(200px,calc(100vh - 520px));max-height:max(200px,calc(100dvh - 520px));min-height:200px;padding:5px}
  .lb-row{min-height:48px;gap:8px;padding:5px 10px 5px 6px}
  .lb-nm{font-size:17px}
  .lb-val{font-size:17.5px}
  .lb-rank{width:32px}
  .lb-rank.medal b{width:32px;height:32px;font-size:16px}
  .sas-chip{--s:32px}
  .lb-join{flex-wrap:wrap;justify-content:center;text-align:left}
  .lb-join .lj-copy{flex:1 1 170px}
}
@media (max-height:500px) and (orientation:landscape){
  .sas-lb-body{grid-template-columns:176px minmax(0,1fr);column-gap:12px}
  .sas-lb-body > .mh{margin-bottom:8px}
  .lb-tabs{gap:6px}
  .lb-tab{min-height:44px;font-size:15px;padding:4px 10px 5px 5px}
  .lt-ic{width:32px;height:32px;padding:5px}
  .lb-list{max-height:max(150px,calc(100vh - 200px));min-height:150px}
  .lb-scope .seg-b{min-height:38px;padding-top:6px;padding-bottom:8px}
}
@media (prefers-reduced-motion:reduce){
  .lb-row,.lb-join,.lm-ic{animation:none}
  .lb-row.sk i{animation:none}
}

/* ---------------------------------------------------------------- cloud save */
.modal-panel.sas-cs{width:min(600px,100%)}
.cs-intro{margin:-4px 0 12px;font:700 14.5px/1.42 var(--fb);color:var(--txt2)}
.cs-who{display:inline-flex;align-items:center;gap:9px;padding:4px 14px 4px 4px;border-radius:999px;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.18);font:800 14px/1 var(--fb)}
.cs-who b{font:var(--fdw) 18px/1 var(--fd);color:var(--c);color:color-mix(in srgb,var(--c) 55%,#fff)}
.cs-who .ava{--s:34px}
.cs-card{position:relative;display:flex;flex-direction:column;gap:12px;margin-top:14px;padding:14px 16px 16px;border-radius:20px;background:rgba(10,15,40,.4);border:2.5px solid rgba(255,255,255,.1);animation:lbIn .4s var(--spring) both}
.cs-card.warn{background:linear-gradient(180deg,rgba(255,166,0,.2),rgba(10,15,40,.4));border-color:rgba(255,200,80,.5)}
.cs-h{display:flex;align-items:center;gap:9px;margin:0;font:var(--fdw) 21px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.cs-h .bi{width:30px;height:30px;padding:5px;border-radius:10px;border:2.5px solid var(--ink);background:linear-gradient(180deg,#7fd3ff,#2a8fe6)}
.cs-h.load .bi{background:linear-gradient(180deg,#63f27f,#1fb043)}
.cs-h.warn .bi{background:linear-gradient(180deg,#ffe463,#ffa600);color:var(--ink)}
.cs-p{margin:0;font:700 14px/1.4 var(--fb);color:var(--txt2)}
.cs-p b{color:#fff}
.cs-big{align-self:center;min-width:min(320px,100%)}
.cs-packet{position:relative;align-self:center;display:flex;flex-direction:column;align-items:center;min-width:min(340px,100%);padding:0 0 14px;border-radius:16px;overflow:hidden;
  background:#fff8dc;border:3px solid var(--ink);box-shadow:0 6px 0 var(--ink),0 12px 24px rgba(0,0,0,.3);transform:rotate(-1.2deg);animation:popIn .5s var(--spring) both}
.cs-packet::before,.cs-packet::after{content:'';position:absolute;top:50%;width:22px;height:22px;margin-top:4px;border-radius:50%;background:#26306a;border:3px solid var(--ink)}
.cs-packet::before{left:-14px}
.cs-packet::after{right:-14px}
.cs-pk-top{align-self:stretch;display:flex;align-items:center;justify-content:center;gap:6px;padding:6px 10px 7px;background:linear-gradient(180deg,#63f27f,#1fb043);border-bottom:3px solid var(--ink);
  font:900 11.5px/1 var(--fb);letter-spacing:.2em;text-transform:uppercase;color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.35)}
.cs-pk-top .bi{width:15px;height:15px}
.cs-code{margin:12px 30px 0;font:var(--fdw) clamp(24px,6.6vw,40px)/1 var(--fd);letter-spacing:.06em;color:var(--ink);white-space:nowrap;
  user-select:all;-webkit-user-select:all;cursor:text;pointer-events:auto}
.cs-code .dash{color:#1fb043}
.cs-row{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap}
.cs-status{display:flex;align-items:center;justify-content:center;gap:8px;font:800 13.5px/1.2 var(--fb);color:var(--txt2);text-align:center}
.cs-status i{width:11px;height:11px;flex:none;border-radius:50%;background:#8a95c9;border:2px solid var(--ink)}
.cs-status.ok i{background:var(--cash)}
.cs-status.busy i{background:var(--gold);animation:pulse .5s ease-in-out infinite alternate}
.cs-status.bad i{background:var(--red)}
.cs-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:14px;background:rgba(10,15,40,.4)}
.cs-toggle .tl{display:flex;flex-direction:column;gap:3px;min-width:0}
.cs-toggle .tl b{font:var(--fdw) 16.5px/1.1 var(--fd);letter-spacing:.01em}
.cs-toggle .tl small{font:700 12px/1.3 var(--fb);color:var(--txt3)}
.cs-links{display:flex;justify-content:center;gap:4px 14px;flex-wrap:wrap}
.cs-links .link{font-size:13.5px;padding:8px 6px}
.cs-links .link.danger{color:#ff9aad}
.cs-confirm{display:flex;flex-direction:column;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:rgba(255,59,92,.18);border:2px solid #ff6b80;text-align:center;font:800 14.5px/1.35 var(--fb);animation:popIn .3s var(--spring)}
.cs-confirm.soft{background:rgba(92,184,255,.16);border-color:#5cb8ff}
.cs-input-row{display:flex;gap:10px;align-items:stretch}
.cs-input{flex:1;min-width:0;height:56px;padding:0 14px;border-radius:15px;border:3px solid var(--ink);background:#fffdf3;color:var(--ink);
  font:var(--fdw) 25px/1 var(--fd);letter-spacing:.08em;text-transform:uppercase;box-shadow:inset 0 3px 0 rgba(0,0,0,.1);outline:none;
  user-select:text;-webkit-user-select:text;pointer-events:auto;touch-action:manipulation}
.cs-input::placeholder{color:#b5b9cc;letter-spacing:.06em}
.cs-input:focus{box-shadow:inset 0 3px 0 rgba(0,0,0,.1),0 0 0 4px rgba(255,255,255,.75)}
.cs-input.bad{border-color:#dc2548;box-shadow:inset 0 3px 0 rgba(0,0,0,.1),0 0 0 4px rgba(255,107,128,.55)}
.cs-input-row .btn{flex:none;min-height:56px}
.cs-prev{display:flex;flex-direction:column;gap:12px;padding:12px;border-radius:16px;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.14);animation:lbIn .35s var(--spring) both}
.cs-pv-head{display:flex;align-items:center;gap:12px}
.cs-pv-head .sas-chip{--s:50px}
.cs-pv-head b{display:block;font:var(--fdw) 24px/1.05 var(--fd);letter-spacing:.01em;text-shadow:var(--o1)}
.cs-pv-head small{display:block;margin-top:3px;font:800 12.5px/1.2 var(--fb);color:var(--txt2)}
.cs-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
.cs-stat{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px 9px;border-radius:13px;background:rgba(10,15,40,.5)}
.cs-stat .bi{width:20px;height:20px;color:var(--gold)}
.cs-stat b{font:var(--fdw) 18px/1 var(--fd);font-variant-numeric:tabular-nums}
.cs-stat b.cash{color:var(--cash)}
.cs-stat span{font:900 10px/1 var(--fb);letter-spacing:.1em;text-transform:uppercase;color:var(--txt3)}
.cs-vs{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}
.cs-vs .side{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 6px;border-radius:12px;background:rgba(10,15,40,.5);text-align:center}
.cs-vs .side small{font:900 10px/1 var(--fb);letter-spacing:.1em;text-transform:uppercase;color:var(--txt3)}
.cs-vs .side b{font:var(--fdw) 17px/1.1 var(--fd)}
.cs-vs .side em{font:800 12px/1.2 var(--fb);font-style:normal;color:var(--txt2)}
.cs-vs .side.new{box-shadow:inset 0 0 0 2.5px var(--cash)}
.cs-vs .arrow{font:var(--fdw) 22px/1 var(--fd);color:var(--gold)}
.cs-choices{display:flex;flex-direction:column;gap:9px}
.cs-choices .btn{width:100%}
.cs-done{display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 6px;text-align:center;animation:popIn .45s var(--spring) both}
.cs-done .sas-chip{--s:64px;box-shadow:0 0 0 6px rgba(93,255,126,.35),0 4px 0 rgba(10,14,40,.5)}
.cs-done b{font:var(--fdw) 26px/1.1 var(--fd);text-shadow:var(--o2)}
.cs-done p{margin:0;font:700 14px/1.4 var(--fb);color:var(--txt2)}
@media (max-width:640px){
  .cs-card{padding:12px 12px 14px}
  .cs-packet{min-width:0;width:calc(100% - 8px)}
  .cs-code{margin:12px 22px 0}
}
@media (max-width:480px){
  .cs-input-row{flex-direction:column;gap:9px}
  .cs-input{flex:none;width:100%;height:54px;font-size:24px;text-align:center}
  .cs-input-row .btn{min-height:50px}
}
.cs-card.cs-soon{align-items:center;text-align:center;gap:10px;padding:26px 18px 24px}
.cs-soon > b{font:var(--fdw) 25px/1.1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.cs-soon > p{margin:0;max-width:400px;font:700 14.5px/1.42 var(--fb);color:var(--txt2)}
.cs-soon > p.cs-soon-ok{display:flex;align-items:center;gap:8px;padding:8px 14px;text-align:left;border-radius:12px;background:rgba(63,214,90,.16);color:#dcffe3;font-size:13.5px}
.cs-soon-ok svg{width:18px;height:18px;flex:none;color:var(--cash)}
.cs-soon .sas-note b{color:#fff}
@media (prefers-reduced-motion:reduce){.cs-card,.cs-prev,.cs-packet,.cs-done{animation:none}}
`;

export function injectScoresCss() {
  if (typeof document === 'undefined' || document.getElementById('sas-scores')) return;
  const s = document.createElement('style');
  s.id = 'sas-scores';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ------------------------------------------------------------------ the panel

const PREF = 'ui:scores';

/**
 * Open the High Scores modal. opts: {board: 'networth'|'showdown'|'steals'|'rebirths',
 * scope: 'global'|'family'}. Returns the modal handle.
 */
export function openLeaderboard(app, opts = {}) {
  injectScoresCss();
  const menus = app.menus;
  const pref = load(PREF, null) || {};
  const st = {
    scope: opts.scope === 'family' || opts.scope === 'global' ? opts.scope : pref.scope === 'family' || !onlineConfigured() ? 'family' : 'global',
    board: BOARD[opts.board] ? opts.board : BOARD[pref.board] ? pref.board : 'networth',
    period: pref.period === 'week' ? 'week' : 'all',
  };
  let seq = 0;
  let disposed = false;
  const click = () => menus.click?.();
  const remember = () => save(PREF, { scope: st.scope, board: st.board, period: st.period });

  // scope toggle
  const scopeBtns = [
    ['global', SAS_ICON.globe, 'Everyone', 'Everyone, everywhere'],
    ['family', ICON.family, 'Family', 'Family on this device'],
  ].map(([id, ic, label, aria]) => h('button', {
    class: 'seg-b', type: 'button', role: 'radio', 'data-v': id, 'aria-label': aria,
    onclick: () => {
      if (st.scope === id) return;
      click();
      st.scope = id;
      remember();
      refresh();
    },
  }, h('span', { class: 'bi', html: ic }), h('span', { text: label })));

  // board tabs
  const tabs = BOARDS.map((b) => h('button', {
    class: 'lb-tab', type: 'button', role: 'tab', 'data-v': b.id, style: `--tc:${BOARD_COLOR[b.id]}`,
    onclick: () => {
      if (st.board === b.id) return;
      click();
      st.board = b.id;
      remember();
      refresh();
    },
  }, h('span', { class: 'lt-ic', html: BOARD_ICON[b.id] }), h('span', { class: 'lt-l', text: b.title })));

  const periodBtns = [['all', 'All time'], ['week', 'This week']].map(([id, label]) => h('button', {
    class: 'seg-b', type: 'button', role: 'radio', 'data-v': id, text: label,
    onclick: () => {
      if (st.period === id) return;
      click();
      st.period = id;
      remember();
      refresh();
    },
  }));
  const period = h('div', { class: 'seg lb-period', role: 'radiogroup', 'aria-label': 'Time period' }, periodBtns);
  const title = h('div', { class: 'lb-title' });
  const list = h('ol', { class: 'lb-list', 'aria-live': 'polite' });
  const joinSlot = h('div');
  const foot = h('p', { class: 'sas-note lb-foot' });

  const root = h('div', { class: 'sas-lb-body' },
    h('div', { class: 'mh' }, h('span', { class: 'mh-ic sas-gold', html: ICON.trophy }), h('h2', { text: 'High Scores' }),
      h('div', { class: 'lb-scope', role: 'radiogroup', 'aria-label': 'Whose scores' }, scopeBtns)),
    h('div', { class: 'lb-tabs', role: 'tablist', 'aria-label': 'Boards' }, tabs),
    h('div', { class: 'lb-main' }, h('div', { class: 'lb-sub' }, title, period), list, joinSlot, foot),
  );

  function paintControls() {
    scopeBtns.forEach((b) => {
      const on = b.dataset.v === st.scope;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    tabs.forEach((b) => {
      const on = b.dataset.v === st.board;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    periodBtns.forEach((b) => {
      const on = b.dataset.v === st.period;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    period.hidden = st.scope !== 'global';
    const b = BOARD[st.board];
    title.textContent = '';
    title.append(h('b', { text: b.title }), h('span', {
      text: st.scope === 'family' ? 'Everyone who plays on this device' : st.period === 'week' ? 'This week · resets every Monday' : b.blurb,
    }));
    foot.textContent = st.scope === 'family' ? 'The family board works even without internet.' : '';
    foot.hidden = !foot.textContent;
  }

  const unitCls = () => (BOARD[st.board].unit === 'money' ? '' : ' count');

  function rowEl(r, i) {
    const medal = r.rank <= 3 && r.value > 0 ? ['gold', 'silver', 'bronze'][r.rank - 1] : '';
    return h('li', {
      class: `lb-row ${medal}${r.me ? ' me' : ''}${r.value > 0 ? '' : ' zero'}`,
      style: i < 8 && !reducedMotion() ? `--d:${i * 24}ms` : null,
      'aria-label': `${r.rank}. ${r.name}${r.me ? ' (you)' : ''}: ${fmtScore(st.board, r.value)}`,
    },
    h('span', { class: 'lb-rank' + (medal ? ' medal' : '') }, medal ? h('b', { text: String(r.rank) }) : String(r.rank)),
    nameChip(r.name, r.base),
    h('span', { class: 'lb-name' }, h('span', { class: 'lb-nm', text: r.name }), r.me ? h('span', { class: 'lb-you', text: 'You' }) : null),
    h('span', { class: 'lb-val' + unitCls(), text: fmtScore(st.board, r.value) }));
  }

  function showRows(rows) {
    list.textContent = '';
    list.removeAttribute('aria-busy');
    rows.forEach((r, i) => {
      // your own row, appended from far down the board
      if (i > 0 && r.me && r.rank > rows[i - 1].rank + 1 && i === rows.length - 1) list.appendChild(h('li', { class: 'lb-gap', 'aria-hidden': 'true', text: '• • •' }));
      list.appendChild(rowEl(r, i));
    });
    const me = list.querySelector('.lb-row.me');
    if (me && list.scrollHeight > list.clientHeight) {
      requestAnimationFrame(() => {
        if (me.offsetTop + me.offsetHeight > list.clientHeight) list.scrollTop = me.offsetTop - list.clientHeight / 2;
      });
    }
  }

  function showLoading() {
    list.textContent = '';
    list.setAttribute('aria-busy', 'true');
    for (let i = 0; i < 6; i++) list.appendChild(h('li', { class: 'lb-row sk', 'aria-hidden': 'true' }, h('i', { class: 'i1' }), h('i', { class: 'i2' }), h('i', { class: 'i3' }), h('i', { class: 'i4' })));
  }

  function showMsg(kind, err) {
    list.textContent = '';
    list.removeAttribute('aria-busy');
    const toFamily = () => menus.btn(menus.iconLabel(ICON.family, 'Family board'), 'btn-blue btn-sm', () => {
      st.scope = 'family';
      remember();
      refresh();
    });
    const retry = () => menus.btn(menus.iconLabel(ICON.reset, 'Try again'), 'btn-green btn-sm', () => refresh(true));
    const M = {
      nap: [SAS_ICON.sleep, '', 'Global scores are napping', "They aren't switched on yet. Your family board works right now!", [toFamily()]],
      offline: [SAS_ICON.cloudOff, '', "You're offline", 'Connect to the internet to see players everywhere.', [retry(), toFamily()]],
      error: [SAS_ICON.cloudOff, '', "Couldn't load the scores", friendlyError(err), [retry(), toFamily()]],
      empty: [BOARD_ICON[st.board], 'sun', st.period === 'week' ? 'Nobody yet this week!' : 'No scores yet!',
        st.period === 'week' ? 'Play now and grab the top spot before Monday.' : 'Be the very first name on this board.', []],
    }[kind];
    list.appendChild(h('li', { class: 'lb-msg' },
      h('span', { class: 'lm-ic ' + M[1], html: M[0] }), h('b', { text: M[2] }), h('p', { text: M[3] }),
      M[4].length ? h('div', { class: 'row' }, M[4]) : null));
  }

  // the bar under the list that invites you onto the global board
  function paintJoin() {
    joinSlot.textContent = '';
    if (st.scope !== 'global' || !onlineConfigured()) return;
    const p = app.profile;
    if (!p) return;
    const state = cloudState(p);
    const bar = (cls, head, sub, button) => h('div', { class: 'lb-join ' + cls }, nameChip(p.name, p.base),
      h('div', { class: 'lj-copy' }, h('b', { text: head }), h('small', { text: sub })), button);
    let el = null;
    if (state === 'off') {
      const b = menus.btn(menus.iconLabel(ICON.check, 'Join'), 'btn-green btn-sm', () => join(b));
      el = bar('', `Put ${p.name} on the board!`, 'Only your name and best scores are shared, never photos. Joining also backs up your garden.', b);
    } else if (state === 'moved') {
      const b = menus.btn('Fix it', 'btn-gold btn-sm', () => openCloudSave(app));
      el = bar('warn', `${p.name}'s save code moved`, 'It was loaded on another device. Open Cloud Save to sort it out.', b);
    } else if (p.cloud.listed === false) {
      const b = menus.btn(menus.iconLabel(ICON.eye, 'Show me'), 'btn-green btn-sm', () => showMe(b));
      el = bar('', `${p.name} is hidden`, 'Your scores are private right now.', b);
    } else if (list.querySelector('.lb-row:not(.sk)') && !list.querySelector('.lb-row.me') && !(profileScores(p, app)[st.board] > 0)) {
      el = bar('', `${p.name} is on the board`, `Score some ${BOARD[st.board].noun || 'money'} to show up here!`, null);
    }
    if (el) joinSlot.appendChild(el);
  }

  async function submitAll(p) {
    const vals = profileScores(p, app);
    for (const b of BOARDS) {
      if (!(vals[b.id] > 0)) continue;
      try {
        await submitScore(p, b.id, vals[b.id]);
      } catch {
        /* the background sync retries */
      }
    }
  }

  async function busy(btn, fn) {
    btn.disabled = true;
    btn.classList.add('sas-busy');
    try {
      await fn();
    } catch (e) {
      if (!disposed) joinSlot.querySelector('.lj-copy small')?.replaceWith(h('small', { class: 'sas-err', text: friendlyError(e) }));
    } finally {
      btn.disabled = false;
      btn.classList.remove('sas-busy');
    }
  }

  const join = (btn) => busy(btn, async () => {
    const p = app.profile;
    await cloudLink(p, { listed: true, app });
    await submitAll(app.profile);
    if (!disposed) refresh(true);
  });
  const showMe = (btn) => busy(btn, async () => {
    await setListed(app.profile, true);
    await submitAll(app.profile);
    if (!disposed) refresh(true);
  });

  async function refresh(force = false) {
    const my = ++seq;
    paintControls();
    if (st.scope === 'family') {
      showRows(familyScores(st.board, app));
      paintJoin();
      return;
    }
    if (!onlineConfigured()) {
      showMsg('nap');
      paintJoin();
      return;
    }
    if (!onlineReady()) {
      showMsg('offline');
      paintJoin();
      return;
    }
    showLoading();
    joinSlot.textContent = '';
    try {
      const rows = await topScores(st.board, { period: st.period, me: app.profile, fresh: force });
      if (my !== seq || disposed) return;
      if (rows.length) showRows(rows);
      else showMsg('empty');
    } catch (e) {
      if (my !== seq || disposed) return;
      showMsg(e?.code === 'offline' ? 'offline' : 'error', e);
    }
    paintJoin();
  }

  const onNet = () => st.scope === 'global' && refresh(true);
  window.addEventListener('online', onNet);
  const offProfile = bus.on('profile:changed', () => {
    if (st.scope === 'family') refresh();
    else paintJoin();
  });

  const m = menus.openModal(root, { cls: 'sas-lb', label: 'High Scores' });
  root.appendChild(menus.doneRow(() => m.close()));
  m.dispose = () => {
    disposed = true;
    window.removeEventListener('online', onNet);
    offProfile();
  };
  refresh();
  return m;
}
