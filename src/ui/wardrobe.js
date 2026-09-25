// Wardrobe: character customization (docs/ONLINE.md "Customization"). OWNER: looks agent.
//   openWardrobe(app)            modal (title screen / pause menu) for the active profile, with a profile switcher
//   buildWardrobe(app, close)    the in-game boutique stand's panel -> {el, title, dispose}
// A live 3D preview (drag to spin, emote button, runs in place to show trails), category tabs with item
// tiles (locked items show their star price or the badge that unlocks them), colour swatches, the star
// balance, Buy, Save, Randomize and Reset. Owned changes are also saved when the panel closes.
import { CHARACTER, CHARACTERS } from '../config.js';
import { bus } from '../core/events.js';
import { listProfiles, getProfile, updateProfile, isFamilyId } from '../core/profiles.js';
import { h, uiSound } from './dom.js';
import { ICON } from './icons.js';
import { EMOTES } from '../social/catalog.js';
import {
  COLORS, BUILDS, HAIR, SHIRTS, LEGS, HATS, ACCS, FACES, TRAILS, HAT_BY_ID, ACC_BY_ID,
  sanitizeLook, sameLook, isOwned, unownedParts, unlockKey, randomLook, baseLook, legsOf,
} from '../characters/cosmetics.js';
import { composeFaceCanvas, getFace, familyFaceData } from '../characters/faces.js';
import { drawShirtIcon, drawLegsIcon } from '../characters/outfits.js';
import { trailIcon } from '../characters/trails.js';
import { createPreview } from '../characters/preview.js';

// Friendly names for the badges that unlock items (progress module badge ids).
const BADGE_TEXT = {
  steals_100: 'Steal 100 plants',
  showdown_win: 'Win a Family Showdown',
  gift: 'Give someone a gift',
  secret_plant: 'Grow a Secret plant',
  chaos_win: 'Win a game on Chaos',
  rainbow_plant: 'Grow a Rainbow plant',
};

// ------------------------------------------------------------------ tab icons (sticker style)

const INK = '#10163a';
const S = (body) => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
const TAB_ICON = {
  body: S('<circle cx="16" cy="8" r="5" fill="#f2c4a8"/><path d="M8 29v-9a8 8 0 0 1 16 0v9z" fill="#5cb8ff"/>'),
  hair: S('<path d="M6 20c0-9 4-15 10-15s10 6 10 15c-2-3-4-6-4-9-2 3-8 4-12 3 0 3-2 5-4 6z" fill="#8a4b2a"/><path d="M9 21c0 5 3 8 7 8s7-3 7-8" fill="#f2c4a8"/>'),
  face: S('<circle cx="16" cy="16" r="12" fill="#ffd23f"/><circle cx="12" cy="13" r="1.6" fill="' + INK + '"/><circle cx="20" cy="13" r="1.6" fill="' + INK + '"/><path d="M10.5 18.5c2.5 4 8.5 4 11 0" fill="none"/>'),
  shirt: S('<path d="M11 5 4 9l3 7 3-1.5V28h12V14.5l3 1.5 3-7-7-4c-1 3-3 4-5 4s-4-1-5-4z" fill="#ff5fa2"/>'),
  legs: S('<path d="M8 4h16l1.5 24h-7L16 12l-2.5 16h-7z" fill="#3d6be0"/><path d="M8 8h16" fill="none"/>'),
  shoes: S('<path d="M4 23v-9h8c1 3 4 4 7 4l7 2c2 .6 3 2 3 3v1z" fill="#ff8a1a"/><path d="M3 23h27v3H3z" fill="#fff"/>'),
  hats: S('<path d="M9 21V8c0-2 14-2 14 0v13z" fill="#3a3a48"/><path d="M9 17h14v4H9z" fill="#e8323c"/><ellipse cx="16" cy="22.5" rx="13" ry="3.5" fill="#3a3a48"/>'),
  accs: S('<circle cx="9.5" cy="16" r="5.5" fill="#7fe8ff"/><circle cx="22.5" cy="16" r="5.5" fill="#7fe8ff"/><path d="M15 15.5c.7-1 1.3-1 2 0M4 14.5 2 12M28 14.5l2-2.5" fill="none"/>'),
  noodle: S('<rect x="4" y="12" width="24" height="8" rx="4" fill="#1ec8a5" transform="rotate(-30 16 16)"/><ellipse cx="25.5" cy="10.5" rx="2.2" ry="4" fill="#0f7f69" transform="rotate(-30 25.5 10.5)"/>'),
  trails: S('<path d="M22 4l1.8 4.6L28 10l-4.2 1.4L22 16l-1.8-4.6L16 10l4.2-1.4z" fill="#ffd23f"/><path d="M9 14l1.3 3.2L13 18l-2.7 1-1.3 3.2L7.7 19 5 18l2.7-.8z" fill="#ff9ee0"/><path d="M17 22l1 2.4 2.4.6-2.4.8-1 2.4-1-2.4-2.4-.8 2.4-.6z" fill="#7fe8ff"/>'),
};
const TABS = [
  { id: 'body', name: 'Body' },
  { id: 'hair', name: 'Hair' },
  { id: 'face', name: 'Face' },
  { id: 'shirt', name: 'Shirt' },
  { id: 'legs', name: 'Pants' },
  { id: 'shoes', name: 'Shoes' },
  { id: 'hats', name: 'Hats' },
  { id: 'accs', name: 'Extras' },
  { id: 'noodle', name: 'Noodle' },
  { id: 'trails', name: 'Trails' },
];

const STAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.3 1.3-6.6-4.9-4.6 6.7-.8z" fill="#ffd23f" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const LOCK = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4" fill="#c9d3ff" stroke="${INK}" stroke-width="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="${INK}" stroke-width="2.4"/></svg>`;
const NONE = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="none" stroke="#c9d3ff" stroke-width="3"/><path d="M8.5 23.5l15-15" stroke="#c9d3ff" stroke-width="3" stroke-linecap="round"/></svg>`;
const CAMERA_BIG = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 11a2.5 2.5 0 0 1 2.5-2.5h3l2-3h7l2 3h3A2.5 2.5 0 0 1 27 11v13a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 5 24z" fill="#5cb8ff" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="16" cy="17" r="5" fill="#fff" stroke="${INK}" stroke-width="2.2"/></svg>`;

// ------------------------------------------------------------------ styles

const CSS = `
.modal-panel.wardrobe,.modal-panel.shop-wardrobe{width:min(1060px,100%);height:min(760px,100%);display:flex;flex-direction:column;overflow:hidden;padding:14px 16px 14px}
.modal-panel.wardrobe>.modal-x,.modal-panel.shop-wardrobe>.modal-x{position:absolute;top:12px;right:14px;margin:0;float:none}
.wd{position:relative;display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;color:#fff}
.wd>.modal-done{display:none}
.wd-head{display:flex;align-items:center;gap:10px;padding-right:50px;min-height:46px;flex:none;min-width:0}
.wd-head .mh-ic{width:44px;height:44px;flex:none;border-radius:14px;padding:6px;display:grid;place-items:center;background:linear-gradient(180deg,#ff9bd0,#b56cff);border:3px solid var(--ink)}
.wd-head .mh-ic svg{width:100%;height:100%}
.wd-head h2{margin:0;font:var(--fdw) 29px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1);white-space:nowrap}
.wd-who{display:flex;align-items:center;gap:6px;min-width:0;padding:4px 6px 4px 4px;border-radius:14px;background:rgba(10,15,40,.45);border:2px solid rgba(255,255,255,.12)}
.wd-who .ava{--s:30px}
.wd-who select{appearance:none;-webkit-appearance:none;flex:0 1 auto;width:auto;min-width:60px;max-width:150px;border:0;background:transparent;color:#fff;font:900 15px/1.1 var(--fb);padding:4px 20px 4px 2px;cursor:pointer;pointer-events:auto;
  background-image:linear-gradient(45deg,transparent 50%,#fff 50%),linear-gradient(135deg,#fff 50%,transparent 50%);background-position:calc(100% - 9px) 55%,calc(100% - 4px) 55%;background-size:5px 5px;background-repeat:no-repeat}
.wd-who select option{color:#10163a}
.wd-who b{font:900 15px/1.1 var(--fb);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wd-stars{margin-left:auto;display:flex;align-items:center;gap:6px;padding:5px 12px 5px 7px;border-radius:14px;background:rgba(10,15,40,.55);font:var(--fdw) 23px/1 var(--fd);color:var(--gold);text-shadow:var(--o1);flex:none}
.wd-stars svg{width:24px;height:24px}
.wd-stars.bump{animation:cashBump .45s var(--spring)}
.wd-main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(230px,36%) 1fr;gap:12px}
.wd-stage{position:relative;min-height:0;min-width:0;border-radius:20px;border:3px solid var(--ink);overflow:hidden;
  background:radial-gradient(ellipse 80% 70% at 50% 38%,#7c96ff 0%,#3d52b8 55%,#1f2a66 100%);box-shadow:inset 0 3px 0 rgba(255,255,255,.18),inset 0 -30px 60px rgba(8,12,40,.35)}
.wd-stage::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 30%,rgba(255,255,255,.18),transparent 45%);pointer-events:none}
.wd-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;pointer-events:auto}
.wd-stage canvas:active{cursor:grabbing}
.wd-stage-ui{position:absolute;left:8px;right:8px;bottom:8px;display:flex;align-items:flex-end;justify-content:space-between;gap:6px;pointer-events:none}
.wd-stage-ui .btn{pointer-events:auto}
.wd-hint{position:absolute;top:8px;left:0;right:0;text-align:center;font:800 12px/1 var(--fb);color:rgba(255,255,255,.75);pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.5)}
.wd-nogl{position:absolute;inset:0;display:grid;place-items:center;padding:16px;text-align:center;font:800 14px/1.3 var(--fb);color:var(--txt2)}
.wd-side{display:flex;flex-direction:column;min-height:0;min-width:0;gap:8px}
.wd-tabs{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;flex:none;padding:2px 2px 6px;scrollbar-width:thin;pointer-events:auto;touch-action:pan-x;overscroll-behavior:contain}
.wd-tab{flex:1 0 auto;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:56px;padding:6px 6px 5px;border-radius:14px;border:3px solid var(--ink);background:rgba(10,15,40,.5);color:var(--txt2);
  font:900 12px/1 var(--fb);cursor:pointer;box-shadow:inset 0 2px 0 rgba(255,255,255,.1),0 3px 0 var(--ink);transition:transform .14s var(--spring)}
.wd-tab svg{width:27px;height:27px;display:block}
.wd-tab:hover{transform:translateY(-1px);color:#fff}
.wd-tab.on{background:linear-gradient(180deg,#ffe066,#ffae1c);color:var(--ink);box-shadow:inset 0 2px 0 rgba(255,255,255,.55),0 3px 0 var(--ink)}
.wd-tab:focus-visible,.wd-tile:focus-visible,.wd-sw:focus-visible{outline:3px solid #fff;outline-offset:2px}
.wd-panel{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:10px;border-radius:18px;background:rgba(10,15,40,.34);overscroll-behavior:contain;touch-action:pan-y;pointer-events:auto}
.wd-info{display:flex;align-items:center;gap:8px;min-height:40px;margin:0 0 10px;padding:6px 8px 6px 12px;border-radius:14px;background:rgba(255,255,255,.08)}
.wd-info .wi-name{font:var(--fdw) 18px/1.05 var(--fd);letter-spacing:.02em;text-shadow:var(--o1);min-width:0}
.wd-info .wi-st{font:800 12.5px/1.2 var(--fb);color:var(--txt2);display:flex;align-items:center;gap:4px}
.wd-info .wi-st svg{width:16px;height:16px;flex:none}
.wd-info .wi-copy{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.wd-info .btn{flex:none}
.wd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px}
.wd-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;padding:6px 5px 7px;border-radius:16px;border:3px solid var(--ink);cursor:pointer;
  background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.05));color:#fff;font:900 11.5px/1.1 var(--fb);text-align:center;box-shadow:0 3px 0 var(--ink);transition:transform .14s var(--spring)}
.wd-tile:hover{transform:translateY(-2px)}
.wd-tile:active{transform:translateY(2px);box-shadow:0 1px 0 var(--ink)}
.wd-tile .wt-vis{position:relative;width:100%;aspect-ratio:1;display:grid;place-items:center;border-radius:11px;background:radial-gradient(circle at 50% 40%,rgba(120,150,255,.45),rgba(10,15,40,.35) 70%);overflow:hidden}
.wd-tile .wt-vis>canvas,.wd-tile .wt-vis>img{width:92%;height:92%;object-fit:contain;display:block}
.wd-tile .wt-vis>svg,.wd-tile .wt-ico{width:62%;height:62%;display:grid;place-items:center}
.wd-tile .wt-ico svg{width:100%;height:100%}
.wd-tile .wt-vis.face>canvas,.wd-tile .wt-vis.face>img{width:100%;height:100%;border-radius:10px;object-fit:cover}
.wd-tile .wt-name{display:block;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wd-tile.on{border-color:#ffd23f;background:linear-gradient(180deg,rgba(255,224,102,.42),rgba(255,174,28,.18));box-shadow:0 0 0 2px var(--ink),0 3px 0 var(--ink)}
.wd-tile.on::after{content:'';position:absolute;left:5px;top:5px;width:20px;height:20px;border-radius:50%;background:#3fd65a url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5' fill='none' stroke='%23fff' stroke-width='3.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/80% no-repeat;border:2px solid var(--ink)}
.wd-tile .wt-tag{position:absolute;right:3px;top:3px;display:flex;align-items:center;gap:2px;padding:2px 5px 2px 3px;border-radius:9px;background:rgba(10,15,40,.85);font:900 11px/1 var(--fb);color:var(--gold)}
.wd-tile .wt-tag svg{width:13px;height:13px}
.wd-tile.locked .wt-vis>canvas,.wd-tile.locked .wt-vis>img{filter:saturate(.8)}
.wd-spin{width:26px;height:26px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;animation:wdspin .8s linear infinite}
@keyframes wdspin{to{transform:rotate(360deg)}}
.wd-sec{margin-top:14px}
.wd-sec:first-child{margin-top:0}
.wd-sec-l{display:flex;align-items:center;gap:8px;font:var(--fdw) 16px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1);margin-bottom:8px}
.wd-sec-l small{font:800 12px/1.2 var(--fb);color:var(--txt3);text-shadow:none;letter-spacing:0}
.wd-sws{display:flex;flex-wrap:wrap;gap:7px}
.wd-sw{--c:#fff;position:relative;width:34px;height:34px;flex:none;padding:0;border-radius:50%;border:3px solid var(--ink);background:var(--c);cursor:pointer;
  box-shadow:inset 0 -4px 0 rgba(0,0,0,.18),inset 0 3px 0 rgba(255,255,255,.35),0 2px 0 var(--ink);transition:transform .12s var(--spring)}
.wd-sw:hover{transform:scale(1.1)}
.wd-sw.on{transform:scale(1.12);box-shadow:0 0 0 3px #fff,0 0 0 6px var(--ink)}
.wd-sw.fam{background:conic-gradient(var(--c) 0 50%,#fff 50% 100%)}
.wd-num{display:flex;align-items:center;gap:10px}
.wd-num b{min-width:44px;text-align:center;font:var(--fdw) 26px/1 var(--fd);text-shadow:var(--o1)}
.wd-bar{display:flex;gap:8px;align-items:center;flex:none;flex-wrap:nowrap}
.wd-bar .wd-msg{flex:1;min-width:0;font:800 13px/1.2 var(--fb);color:var(--txt2);text-align:right;overflow:hidden;text-overflow:ellipsis}
.wd-bar .wd-msg.ok{color:#8dffa2}
.wd-bar .wd-msg.warn{color:#ffe066}
.wd-bar .btn{min-height:46px;font-size:18px;padding:9px 16px 11px}
.wd-bar .wd-save{min-width:150px;white-space:nowrap}
.wd-empty{padding:18px 8px;text-align:center;font:800 13px/1.35 var(--fb);color:var(--txt2)}
.wd-photo{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;font:800 12.5px/1.3 var(--fb);color:var(--txt2)}
@media (max-width:640px) and (min-aspect-ratio:1/100) and (max-aspect-ratio:9/10){
  .modal-panel.wardrobe,.modal-panel.shop-wardrobe{padding:10px 10px 10px;height:100%}
  .wd-main{grid-template-columns:1fr;grid-template-rows:minmax(150px,33%) 1fr;gap:8px}
  .wd-head{min-height:40px;gap:8px}
  .wd-head h2{font-size:23px}
  .wd-head .mh-ic{width:38px;height:38px}
  .wd-who select{max-width:110px}
  .wd-stars{font-size:19px;padding:4px 9px 4px 5px}
  .wd-grid{grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:7px}
  .wd-bar .btn{min-height:42px;font-size:16px;padding:7px 11px 9px}
  .wd-bar .wd-save{min-width:0}
  .wd-bar .wd-msg{display:none}
  .wd-tab{min-width:54px}
}
@media (max-width:440px) and (max-aspect-ratio:9/10){
  .wd-head h2{display:none}
  .wd-tile .wt-name{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.05;min-height:2.1em;font-size:10.5px}
}
@media (max-width:380px) and (max-aspect-ratio:9/10){
  .wd-bar .btn .bl{display:none}
}
@media (max-height:480px){
  .modal-panel.wardrobe,.modal-panel.shop-wardrobe{padding:8px 10px;height:100%}
  .modal-panel.wardrobe>.modal-x,.modal-panel.shop-wardrobe>.modal-x{top:6px;right:8px;width:36px;height:36px;padding:7px}
  .wd-head{padding-right:42px}
  .wd{gap:6px}
  .wd-head{min-height:34px;gap:8px}
  .wd-head h2{font-size:21px}
  .wd-head .mh-ic{width:32px;height:32px;padding:4px;border-radius:10px}
  .wd-who .ava{--s:24px}
  .wd-who select{font-size:13px;max-width:120px}
  .wd-stars{font-size:18px;padding:3px 8px 3px 5px}
  .wd-stars svg{width:19px;height:19px}
  .wd-main{grid-template-columns:minmax(170px,32%) 1fr;gap:8px}
  .wd-tabs{gap:5px;padding-bottom:4px}
  .wd-tab{min-width:0;padding:4px 7px 4px;border-radius:11px}
  .wd-tab span{display:none}
  .wd-tab svg{width:24px;height:24px}
  .wd-panel{padding:7px}
  .wd-info{min-height:34px;margin-bottom:7px;padding:4px 6px 4px 9px}
  .wd-info .wi-name{font-size:15px}
  .wd-grid{grid-template-columns:repeat(auto-fill,minmax(68px,1fr));gap:6px}
  .wd-tile{font-size:10.5px;padding:4px 4px 5px;border-radius:13px}
  .wd-sw{width:28px;height:28px}
  .wd-bar .btn{min-height:36px;font-size:14.5px;padding:5px 10px 7px;border-radius:12px}
  .wd-bar .wd-save{min-width:0}
  .wd-stage-ui .btn{min-height:34px;font-size:13px;padding:4px 9px 6px}
  .wd-hint{display:none}
}
`;

function injectCSS() {
  if (typeof document === 'undefined' || document.getElementById('sas-wardrobe')) return;
  const st = document.createElement('style');
  st.id = 'sas-wardrobe';
  st.textContent = CSS;
  document.head.appendChild(st);
}

// ------------------------------------------------------------------ helpers

const canvasOf = (w, hgt = w) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  return c;
};

const iconCache = new Map();
function cached(key, make) {
  if (!iconCache.has(key)) {
    if (iconCache.size > 160) iconCache.clear();
    iconCache.set(key, make());
  }
  return iconCache.get(key);
}
// a canvas can live in only one place in the DOM: hand out copies of cached drawings
function copyCanvas(src) {
  const c = canvasOf(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

function shoeIcon(color) {
  return cached('shoe:' + color, () => {
    const c = canvasOf(96);
    const g = c.getContext('2d');
    g.lineJoin = 'round';
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(12, 64);
    g.lineTo(12, 36);
    g.lineTo(38, 36);
    g.quadraticCurveTo(42, 48, 60, 50);
    g.lineTo(78, 54);
    g.quadraticCurveTo(88, 57, 88, 66);
    g.lineTo(88, 68);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.stroke();
    g.fillStyle = '#f4f4f4';
    g.fillRect(10, 66, 80, 10);
    g.strokeRect(10, 66, 80, 10);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(40 + i * 7, 42 + i * 2);
      g.lineTo(46 + i * 7, 50 + i * 1.5);
      g.stroke();
    }
    return c;
  });
}

function noodleIcon(color) {
  return cached('noodle:' + color, () => {
    const c = canvasOf(96);
    const g = c.getContext('2d');
    g.translate(48, 48);
    g.rotate(-0.55);
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.fillStyle = color;
    g.beginPath();
    g.roundRect ? g.roundRect(-40, -12, 80, 24, 12) : g.rect(-40, -12, 80, 24);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 5; i++) g.fillRect(-32 + i * 15, -10, 5, 20);
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(40, 0, 6, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.ellipse(40, 0, 2.5, 5, 0, 0, Math.PI * 2);
    g.fill();
    return c;
  });
}

function buildIcon(kid) {
  const c = canvasOf(96);
  const g = c.getContext('2d');
  const k = kid ? 0.8 : 1;
  const head = kid ? 1.14 : 1;
  g.translate(48, 92);
  g.lineWidth = 3.5;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  const box = (x, y, w, hh, fill) => {
    g.fillStyle = fill;
    g.fillRect(x, y, w, hh);
    g.strokeRect(x, y, w, hh);
  };
  const u = 11 * k;
  box(-u, -2 * u, u * 0.96, 2 * u, '#3b4b8a');
  box(0.04 * u, -2 * u, u * 0.96, 2 * u, '#3b4b8a');
  box(-u, -4 * u, 2 * u, 2 * u, '#ff5fa2');
  box(-2 * u, -4 * u, u, 2 * u, '#f2c4a8');
  box(u, -4 * u, u, 2 * u, '#f2c4a8');
  const hw = 1.1 * u * head;
  box(-hw, -4 * u - 2.1 * u * head, 2 * hw, 2.1 * u * head, '#f2c4a8');
  g.fillStyle = INK;
  g.fillRect(-hw * 0.45, -4 * u - 1.3 * u * head, 3, 5);
  g.fillRect(hw * 0.35, -4 * u - 1.3 * u * head, 3, 5);
  return c;
}

// ------------------------------------------------------------------ the panel

/**
 * The Wardrobe panel. opts: {profileId, switcher (show the profile picker), shop (in-game stand)}.
 * Returns {el, title, dispose}.
 */
function createWardrobe(app, close, opts = {}) {
  injectCSS();
  let pid = opts.profileId || app.profile?.id || CHARACTERS[0].id;
  let prof = getProfile(pid) || getProfile(CHARACTERS[0].id);
  pid = prof.id;
  let saved = sanitizeLook(prof.look, prof.base);
  let draft = { ...saved };
  let tab = 'hair';
  let lastPick = null; // {cat, item} shown in the info strip
  let emoteIdx = 0;
  let disposed = false;
  const unsub = [];

  const charOf = (p) => CHARACTER[p.base] || CHARACTERS[0];
  const defaultFor = (p) => (isFamilyId(p.id) ? baseLook(p.id) : { ...baseLook(p.base), face: 'smile' });

  // ---- header
  const starsEl = h('div', { class: 'wd-stars', 'aria-live': 'polite' });
  const paintStars = (bump) => {
    starsEl.innerHTML = `${STAR}<span>${prof.stars || 0}</span>`;
    starsEl.setAttribute('aria-label', `${prof.stars || 0} stars`);
    if (bump) {
      starsEl.classList.remove('bump');
      void starsEl.offsetWidth;
      starsEl.classList.add('bump');
    }
  };
  let who = null;
  if (opts.switcher) {
    const sel = h('select', { 'aria-label': 'Whose outfit' });
    const ava = avatarChip(prof);
    const paintWho = () => {
      sel.textContent = '';
      for (const p of listProfiles()) sel.appendChild(h('option', { value: p.id, text: p.name, selected: p.id === pid ? true : null }));
      sel.value = pid;
      const next = avatarChip(prof);
      who.ava.replaceWith(next);
      who.ava = next;
    };
    sel.addEventListener('change', () => {
      uiSound(app, 'click');
      switchProfile(sel.value);
    });
    who = { el: h('label', { class: 'wd-who' }, ava, sel), ava, paint: paintWho };
  } else {
    who = { el: h('div', { class: 'wd-who' }, avatarChip(prof), h('b', { text: prof.name })), paint() {} };
  }
  function avatarChip(p) {
    const d = familyFaceData(p.id);
    const url = d?.avatar || d?.face;
    const el = h('span', { class: 'ava', style: `--c:${charOf(p).color}` });
    if (url) el.appendChild(h('img', { src: url, alt: '' }));
    else el.appendChild(h('b', { text: (p.name || '?')[0] }));
    return el;
  }
  const head = h('div', { class: 'wd-head' },
    h('span', { class: 'mh-ic', html: TAB_ICON.shirt }),
    h('h2', { text: 'Wardrobe' }),
    who.el,
    starsEl);

  // ---- stage
  const canvas = h('canvas', { 'aria-label': 'Your avatar. Drag to spin it around.', role: 'img' });
  const emoteBtn = h('button', { class: 'btn btn-blue btn-sm', type: 'button' });
  const paintEmoteBtn = () => {
    const e = EMOTES[emoteIdx % EMOTES.length];
    emoteBtn.innerHTML = `<span class="bi">${ICON.play || ''}</span><span>${e.name}</span>`;
    emoteBtn.setAttribute('aria-label', 'Try the ' + e.name + ' emote');
  };
  emoteBtn.addEventListener('click', () => {
    uiSound(app, 'click');
    const e = EMOTES[emoteIdx % EMOTES.length];
    preview.play(e.id);
    emoteIdx++;
    paintEmoteBtn();
  });
  paintEmoteBtn();
  const stage = h('div', { class: 'wd-stage' }, canvas, h('div', { class: 'wd-hint', text: 'Drag to spin' }), h('div', { class: 'wd-stage-ui' }, h('span'), emoteBtn));

  // ---- side: tabs + panel
  const tabBtns = TABS.map((t) => h('button', {
    class: 'wd-tab', type: 'button', role: 'tab', 'data-tab': t.id, 'aria-label': t.name,
    onclick: () => {
      uiSound(app, 'click');
      setTab(t.id);
    },
  }, h('i', { html: TAB_ICON[t.id] }), h('span', { text: t.name })));
  const tabsEl = h('div', { class: 'wd-tabs', role: 'tablist', 'aria-label': 'Wardrobe sections' }, tabBtns);
  const panel = h('div', { class: 'wd-panel', role: 'tabpanel' });
  const side = h('div', { class: 'wd-side' }, tabsEl, panel);

  // ---- bottom bar
  const msg = h('div', { class: 'wd-msg', role: 'status' });
  const saveBtn = h('button', { class: 'btn btn-green wd-save', type: 'button', onclick: () => save() });
  const randBtn = h('button', { class: 'btn btn-blue', type: 'button', html: `<span class="bi">${ICON.dice || ''}</span><span class="bl">Random</span>`, 'aria-label': 'Random outfit', onclick: () => randomize() });
  const resetBtn = h('button', { class: 'btn btn-grey', type: 'button', html: `<span class="bi">${ICON.reset || ''}</span><span class="bl">Reset</span>`, 'aria-label': 'Reset to default', onclick: () => reset() });
  const bar = h('div', { class: 'wd-bar' }, randBtn, resetBtn, msg, saveBtn);

  const el = h('div', { class: 'wd' }, head, h('div', { class: 'wd-main' }, stage, side), bar);

  // ---- preview
  let preview = createPreview(canvas, { char: charOf(prof), look: draft });
  if (preview.failed) stage.appendChild(h('div', { class: 'wd-nogl', text: "3D preview isn't available on this device, but you can still pick your outfit!" }));
  const loadFace = () => {
    const id = pid;
    getFace(id).then((f) => {
      if (disposed || id !== pid) return;
      preview.setFace(f.face, f.skin);
      if (tab === 'face') renderTab();
    });
  };
  loadFace();
  unsub.push(bus.on('face:changed', ({ id } = {}) => {
    if (id === pid) loadFace();
  }));
  // stars / unlocks can change underneath (quests, badges, another tab)
  unsub.push(bus.on('profile:changed', ({ profile } = {}) => {
    if (!profile || profile.id !== pid || disposed) return;
    prof = profile;
    paintStars(false);
    renderTab();
    paintBar();
  }));

  // ------------------------------------------------------------------ state changes

  function setDraft(patch, pick) {
    draft = { ...draft, ...patch };
    if (draft.shirt === 'jersey' && !Number.isFinite(draft.num)) draft.num = 10;
    if (pick) lastPick = pick;
    preview.setLook(draft);
    renderTab();
    paintBar();
  }

  function flash(text, cls = '') {
    msg.textContent = text;
    msg.className = 'wd-msg ' + cls;
  }

  function paintBar() {
    const miss = unownedParts(prof, draft);
    const cost = miss.reduce((a, m) => a + (m.item.price || 0), 0);
    const badgeOnly = miss.filter((m) => !m.item.price);
    const changed = !sameLook(draft, saved);
    saveBtn.disabled = false;
    if (badgeOnly.length) {
      saveBtn.innerHTML = `<span class="bi">${LOCK}</span><span>Locked</span>`;
      saveBtn.disabled = true;
      flash(`${badgeOnly[0].item.name}: ${BADGE_TEXT[badgeOnly[0].item.unlock] || 'earn its badge'} to unlock it.`, 'warn');
    } else if (miss.length) {
      saveBtn.innerHTML = `<span class="bi">${STAR}</span><span>Buy ${cost} &amp; Save</span>`;
      saveBtn.disabled = cost > (prof.stars || 0);
      flash(cost > (prof.stars || 0) ? `You need ${cost - (prof.stars || 0)} more stars. Earn them with quests and badges!` : `Trying on: ${miss.map((m) => m.item.name).join(', ')}`, 'warn');
    } else {
      saveBtn.innerHTML = `<span class="bi">${ICON.check || ''}</span><span>${changed ? 'Save' : 'Saved'}</span>`;
      saveBtn.disabled = !changed;
      if (!changed && !msg.classList.contains('ok')) flash('');
      else if (changed) flash('');
    }
  }

  function commit(extra) {
    const look = { ...draft };
    updateProfile(pid, (p) => {
      if (extra) extra(p);
      p.look = look;
    });
    prof = getProfile(pid);
    saved = { ...look };
  }

  function save() {
    const miss = unownedParts(prof, draft);
    if (miss.some((m) => !m.item.price)) return;
    const cost = miss.reduce((a, m) => a + m.item.price, 0);
    if (cost > (prof.stars || 0)) return;
    uiSound(app, cost ? 'purchase' : 'click');
    commit((p) => {
      if (!cost) return;
      p.stars = Math.max(0, (p.stars || 0) - cost);
      for (const m of miss) {
        const k = unlockKey(m.cat, m.item.id);
        if (!p.unlocks.includes(k)) p.unlocks.push(k);
      }
    });
    paintStars(!!cost);
    flash(cost ? 'Bought and saved! Looking great!' : 'Saved! Looking great!', 'ok');
    renderTab();
    paintBar();
    if (!cost) preview.play(['cheer', 'dance1', 'wave'][Math.floor(Math.random() * 3)]);
    else preview.play('cheer');
  }

  function buy(cat, item) {
    if (isOwned(prof, cat, item.id) || !item.price || item.price > (prof.stars || 0)) return;
    uiSound(app, 'purchase');
    updateProfile(pid, (p) => {
      p.stars = Math.max(0, (p.stars || 0) - item.price);
      const k = unlockKey(cat, item.id);
      if (!p.unlocks.includes(k)) p.unlocks.push(k);
    });
    prof = getProfile(pid);
    paintStars(true);
    flash(`${item.name} is yours!`, 'ok');
    renderTab();
    paintBar();
    preview.play('cheer');
  }

  function randomize() {
    uiSound(app, 'click');
    const l = randomLook(prof, draft);
    lastPick = null;
    setDraft(l);
    flash('Shuffled!', '');
  }

  function reset() {
    uiSound(app, 'click');
    lastPick = null;
    draft = sanitizeLook(defaultFor(prof), prof.base);
    preview.setLook(draft);
    renderTab();
    paintBar();
    flash('Back to the original look.', '');
  }

  // save owned changes when leaving (closing the panel or switching profiles)
  function autosave() {
    if (sameLook(draft, saved)) return;
    const miss = unownedParts(prof, draft);
    if (miss.length) {
      // keep what they own, drop what they only tried on
      const keep = { ...draft };
      for (const m of miss) keep[m.field] = saved[m.field];
      if (sameLook(keep, saved)) return;
      draft = keep;
    }
    commit();
  }

  function switchProfile(id) {
    autosave();
    const p = getProfile(id);
    if (!p) return;
    pid = p.id;
    prof = p;
    saved = sanitizeLook(prof.look, prof.base);
    draft = { ...saved };
    lastPick = null;
    preview.reset?.(charOf(prof), draft, null, null);
    loadFace();
    who.paint();
    paintStars(false);
    renderTab();
    paintBar();
    flash(`Dressing ${prof.name}`, '');
  }

  function setTab(id) {
    tab = id;
    lastPick = null;
    for (const b of tabBtns) {
      const on = b.dataset.tab === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      if (on) b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
    preview.running(id === 'trails' && !!draft.trail);
    panel.scrollTop = 0;
    renderTab();
  }

  // ------------------------------------------------------------------ tiles

  // status of a catalog item: {owned, price, badge}
  const status = (cat, item) => ({ owned: isOwned(prof, cat, item.id), price: item.price || 0, badge: item.unlock || null });

  function tile({ name, vis, on, cat, item, onPick, visCls = '' }) {
    const st = item && cat ? status(cat, item) : { owned: true };
    const locked = !st.owned;
    let tag = null;
    if (locked) {
      tag = st.price ? h('span', { class: 'wt-tag', html: `${STAR}<span>${st.price}</span>` }) : h('span', { class: 'wt-tag', html: LOCK });
    }
    const label = `${name}${on ? ', wearing' : ''}${locked ? (st.price ? `, ${st.price} stars` : ', locked') : ''}`;
    const b = h('button', {
      class: 'wd-tile' + (on ? ' on' : '') + (locked ? ' locked' : ''), type: 'button', 'aria-pressed': String(!!on), 'aria-label': label, title: name,
      onclick: () => {
        uiSound(app, 'click');
        onPick();
      },
    }, h('span', { class: 'wt-vis ' + visCls }, vis), h('span', { class: 'wt-name', text: name }), tag);
    return b;
  }

  // a 3D thumbnail (async), with a spinner until it's ready
  function thumbVis(kind, id, look) {
    const holder = h('span', { class: 'wd-spin' });
    preview.thumb(kind, id, look).then((c) => {
      if (!holder.isConnected && disposed) return;
      holder.replaceWith(c ? copyCanvas(c) : h('span', { class: 'wt-ico', html: NONE }));
    });
    return holder;
  }

  function section(label, note, ...kids) {
    return h('div', { class: 'wd-sec' }, h('div', { class: 'wd-sec-l' }, h('span', { text: label }), note ? h('small', { text: note }) : null), ...kids);
  }

  function swatches(field, colors, { family = null, label } = {}) {
    const cur = draft[field];
    const list = [...colors];
    if (cur && !list.includes(cur)) list.unshift(cur);
    const sws = [];
    if (family) {
      sws.push(h('button', {
        class: 'wd-sw fam' + (cur == null ? ' on' : ''), type: 'button', style: `--c:${family}`, 'aria-label': 'Family colour', 'aria-pressed': String(cur == null), title: 'Family colour',
        onclick: () => {
          uiSound(app, 'click');
          setDraft({ [field]: null });
        },
      }));
    }
    for (const c of list) {
      sws.push(h('button', {
        class: 'wd-sw' + (cur === c ? ' on' : ''), type: 'button', style: `--c:${c}`, 'aria-label': (label || 'Colour') + ' ' + c, 'aria-pressed': String(cur === c), title: c,
        onclick: () => {
          uiSound(app, 'click');
          setDraft({ [field]: c });
        },
      }));
    }
    return h('div', { class: 'wd-sws' }, sws);
  }

  function info() {
    const p = lastPick;
    if (!p) return null;
    const st = status(p.cat, p.item);
    let right = null;
    let line;
    if (st.owned) line = h('span', { class: 'wi-st', html: p.item.price || p.item.unlock ? `${ICON.check || ''}<span>Yours!</span>` : '<span>Free</span>' });
    else if (st.price) {
      const can = st.price <= (prof.stars || 0);
      line = h('span', { class: 'wi-st', html: `${STAR}<span>${st.price} stars${st.badge ? ` · or ${BADGE_TEXT[st.badge] || 'earn its badge'}` : ''}${can ? '' : ` · you have ${prof.stars || 0}`}</span>` });
      right = h('button', { class: 'btn btn-gold btn-sm', type: 'button', disabled: can ? null : true, html: `<span class="bi">${STAR}</span><span>Buy ${st.price}</span>`, onclick: () => buy(p.cat, p.item) });
    } else line = h('span', { class: 'wi-st', html: `${LOCK}<span>${BADGE_TEXT[st.badge] || 'Earn its badge'} to unlock</span>` });
    return h('div', { class: 'wd-info' }, h('div', { class: 'wi-copy' }, h('span', { class: 'wi-name', text: p.item.name }), line), right);
  }

  const pick = (field, cat, item, extra = {}) => () => setDraft({ [field]: item ? item.id : null, ...extra }, item ? { cat, item } : null);

  function renderTab() {
    if (disposed) return;
    const out = [];
    const d = draft;
    switch (tab) {
      case 'body':
        out.push(section('Size', null, h('div', { class: 'wd-grid' }, BUILDS.map((b) => tile({ name: b.name, vis: buildIcon(b.id === 'kid'), on: d.build === b.id, onPick: pick('build', 'build', b) })))));
        out.push(section('Skin tone', draft.face === 'photo' && familyFaceData(pid)?.face ? 'Your photo sets the face colour' : null, swatches('skin', COLORS.skin, { label: 'Skin tone' })));
        break;
      case 'hair':
        out.push(info());
        out.push(h('div', { class: 'wd-grid' }, HAIR.map((it) => tile({ name: it.name, vis: thumbVis('hair', it.id, d), on: d.hair === it.id, cat: 'hair', item: it, onPick: pick('hair', 'hair', it) }))));
        out.push(section('Hair colour', null, swatches('hairColor', COLORS.hair, { label: 'Hair colour' })));
        break;
      case 'face': {
        out.push(info());
        const photo = familyFaceData(pid);
        const url = photo?.avatar || photo?.face;
        const faceTiles = FACES.map((f) => {
          if (f.id === 'photo') {
            const vis = url ? h('img', { src: url, alt: '' }) : h('span', { class: 'wt-ico', html: CAMERA_BIG });
            return tile({ name: url ? 'My Photo' : 'Add Photo', vis, visCls: 'face', on: d.face === 'photo', cat: 'face', item: f,
              onPick: () => {
                if (!url && app.menus?.openPhotoBooth) {
                  flash('Pick a photo in the Photo Booth, then come back!', '');
                  app.menus.openPhotoBooth();
                }
                setDraft({ face: 'photo' }, { cat: 'face', item: f });
              } });
          }
          const vis = copyCanvas(cached('face:' + f.id + d.skin, () => composeFaceCanvas(null, d.skin, 128, { layout: 'flat', expr: f.id })));
          return tile({ name: f.name, vis, visCls: 'face', on: d.face === f.id, cat: 'face', item: f, onPick: pick('face', 'face', f) });
        });
        out.push(h('div', { class: 'wd-grid' }, faceTiles));
        if (d.face === 'photo' && !url) out.push(h('p', { class: 'wd-empty', text: 'No photo yet: you get a smile until you add one in the Photo Booth.' }));
        break;
      }
      case 'shirt':
        out.push(info());
        out.push(h('div', { class: 'wd-grid' }, SHIRTS.map((it) => {
          const look = { ...d, shirt: it.id, skin: d.skin };
          const vis = copyCanvas(cached('shirt:' + JSON.stringify([it.id, d.shirtColor, d.shirtColor2, d.pants, d.skin, d.num]), () => drawShirtIcon(canvasOf(112), look)));
          return tile({ name: it.name, vis, on: d.shirt === it.id, cat: 'shirt', item: it, onPick: pick('shirt', 'shirt', it) });
        })));
        out.push(section('Main colour', d.shirt === 'floral' ? 'The top under the jacket' : null, swatches('shirtColor', COLORS.cloth, { label: 'Main colour' })));
        out.push(section('Accent colour', null, swatches('shirtColor2', COLORS.cloth, { label: 'Accent colour' })));
        if (d.shirt === 'jersey') {
          const num = Number.isFinite(d.num) ? d.num : 10;
          out.push(section('Jersey number', null, h('div', { class: 'wd-num' },
            h('button', { class: 'btn btn-blue btn-sm', type: 'button', text: '−', 'aria-label': 'Lower number', onclick: () => setDraft({ num: (num + 99) % 100 }) }),
            h('b', { text: String(num) }),
            h('button', { class: 'btn btn-blue btn-sm', type: 'button', text: '+', 'aria-label': 'Higher number', onclick: () => setDraft({ num: (num + 1) % 100 }) }))));
        }
        break;
      case 'legs': {
        const cur = legsOf(d);
        if (cur === 'dress') out.push(h('p', { class: 'wd-empty', text: 'The Party Dress comes with its own skirt. Pick a colour for it below, or pick another shirt to wear pants.' }));
        else {
          out.push(info());
          out.push(h('div', { class: 'wd-grid' }, LEGS.map((it) => {
            const vis = copyCanvas(cached('legs:' + it.id + d.pants, () => drawLegsIcon(canvasOf(112), d, it.id)));
            return tile({ name: it.name, vis, on: cur === it.id, cat: 'legs', item: it, onPick: pick('legs', 'legs', it) });
          })));
        }
        out.push(section(cur === 'dress' ? 'Skirt colour' : 'Colour', null, swatches('pants', ['#2b3a55', '#3b4b8a', '#c8b48a', ...COLORS.cloth], { label: 'Pants colour' })));
        break;
      }
      case 'shoes':
        out.push(h('div', { class: 'wd-grid' }, [...new Set([d.shoes, ...COLORS.shoes])].map((c) =>
          tile({ name: c === d.shoes ? 'Wearing' : 'Sneakers', vis: copyCanvas(shoeIcon(c)), on: d.shoes === c, onPick: () => setDraft({ shoes: c }) }))));
        break;
      case 'hats': {
        out.push(info());
        const none = tile({ name: 'No hat', vis: h('span', { class: 'wt-ico', html: NONE }), on: !d.hat, onPick: () => setDraft({ hat: null }) });
        out.push(h('div', { class: 'wd-grid' }, none, HATS.map((it) => tile({ name: it.name, vis: thumbVis('hat', it.id, { ...d, hatColor: d.hatColor || it.tint }), on: d.hat === it.id, cat: 'hat', item: it,
          onPick: pick('hat', 'hat', it, d.hatColor ? {} : { hatColor: it.tint }) }))));
        const def = d.hat ? HAT_BY_ID[d.hat] : null;
        if (def?.tint) out.push(section('Hat colour', null, swatches('hatColor', COLORS.cloth, { label: 'Hat colour' })));
        break;
      }
      case 'accs': {
        out.push(info());
        const none = tile({ name: 'Nothing', vis: h('span', { class: 'wt-ico', html: NONE }), on: !d.acc, onPick: () => setDraft({ acc: null }) });
        out.push(h('div', { class: 'wd-grid' }, none, ACCS.map((it) => tile({ name: it.name, vis: thumbVis('acc', it.id, { ...d, accColor: d.accColor || it.tint }), on: d.acc === it.id, cat: 'acc', item: it,
          onPick: pick('acc', 'acc', it, d.accColor ? {} : { accColor: it.tint }) }))));
        const def = d.acc ? ACC_BY_ID[d.acc] : null;
        if (def?.tint) out.push(section('Colour', null, swatches('accColor', COLORS.cloth, { label: 'Accessory colour' })));
        break;
      }
      case 'noodle': {
        const fam = charOf(prof).color;
        const tiles = [tile({ name: 'Family', vis: copyCanvas(noodleIcon(fam)), on: !d.noodle, onPick: () => setDraft({ noodle: null }) })];
        for (const c of COLORS.noodle) tiles.push(tile({ name: 'Noodle', vis: copyCanvas(noodleIcon(c)), on: d.noodle === c, onPick: () => setDraft({ noodle: c }) }));
        out.push(section('Pool noodle', 'Your bonking noodle', h('div', { class: 'wd-grid' }, tiles)));
        break;
      }
      case 'trails': {
        out.push(info());
        const none = tile({ name: 'No trail', vis: h('span', { class: 'wt-ico', html: NONE }), on: !d.trail, onPick: () => {
          setDraft({ trail: null });
          preview.running(false);
        } });
        out.push(h('div', { class: 'wd-grid' }, none, TRAILS.map((it) => tile({ name: it.name, vis: copyCanvas(cached('trail:' + it.id, () => trailIcon(it.id, 96))), on: d.trail === it.id, cat: 'trail', item: it,
          onPick: () => {
            setDraft({ trail: it.id }, { cat: 'trail', item: it });
            preview.running(true);
          } }))));
        out.push(h('p', { class: 'wd-empty', text: 'Trails show when you run fast.' }));
        break;
      }
      default:
        break;
    }
    const keep = panel.scrollTop;
    panel.textContent = '';
    panel.append(...out.filter(Boolean));
    panel.scrollTop = keep;
  }

  // ------------------------------------------------------------------ go

  who.paint?.();
  paintStars(false);
  setTab('hair');
  paintBar();
  const onResize = () => preview.resize();
  window.addEventListener('resize', onResize);

  return {
    el,
    title: 'Wardrobe',
    dispose() {
      if (disposed) return;
      autosave();
      disposed = true;
      window.removeEventListener('resize', onResize);
      unsub.forEach((f) => f?.());
      preview.dispose();
    },
  };
}

/** The Wardrobe as a modal (title screen, pause menu, new player): edits the active profile. */
export function openWardrobe(app) {
  const w = createWardrobe(app, null, { switcher: true });
  const m = app.menus.openModal(w.el, { cls: 'wardrobe', label: 'Wardrobe' });
  m.dispose = w.dispose;
  return m;
}

/** In-game boutique stand: the same panel inside a shop modal (the game keeps running underneath). */
export function buildWardrobe(app, close) {
  return createWardrobe(app, close, { shop: true, profileId: app.human?.profileId || app.profile?.id });
}
