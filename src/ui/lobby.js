// Online lobby + in-game room chip. OWNER: net agent (docs/ONLINE.md "Multiplayer").
//   openLobby(app)                          Play Online modal: who you are, Quick Play, public rooms (live),
//                                           make a public/private room, join with a code, share-my-face switch
//   mountRoomPanel(app, hudRoot, anchors)   small chip under the leaderboard while in a room: code (+ copy),
//                                           who's here (mute, host-only remove), Leave; join/leave toasts
import { bus } from '../core/events.js';
import { listProfiles, updateProfile, profileColor } from '../core/profiles.js';
import { familyFaceData } from '../characters/faces.js';
import { h, setText, toggle, uiSound } from './dom.js';
import { avatarEl } from './avatars.js';
import { ICON } from './icons.js';
import { normalizeCode, CODE_LEN, NET_ERRORS } from '../net/session.js';

const CSS = `
.lobby{--lb-gap:14px}
.modal-panel.lobby-modal{width:min(720px,100%)}
.lobby .lb-sub{margin:-6px 0 14px;font:700 15px/1.3 var(--fb);color:var(--txt2)}
.lobby .lb-sec{margin:16px 0 8px;font:900 12px/1 var(--fb);letter-spacing:.14em;text-transform:uppercase;color:var(--txt3);display:flex;align-items:center;gap:8px}
.lobby .lb-sec .live{display:inline-flex;align-items:center;gap:5px;color:#8dffa4;letter-spacing:.08em}
.lobby .lb-sec .live i{width:8px;height:8px;border-radius:50%;background:#3fd65a;box-shadow:0 0 0 3px rgba(63,214,90,.25);animation:lbPulse 1.6s ease-in-out infinite}
@keyframes lbPulse{50%{box-shadow:0 0 0 6px rgba(63,214,90,0)}}
.lobby .lb-card{padding:10px 12px;border-radius:16px;background:rgba(10,15,40,.34);border:2px solid rgba(255,255,255,.06)}
.lobby .lb-who{display:flex;align-items:center;gap:12px}
.lobby .lb-who .ava{--s:48px}
.lobby .lb-who-t{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.lobby .lb-who-t small{font:800 12px/1 var(--fb);color:var(--txt3);letter-spacing:.06em;text-transform:uppercase}
.lobby .lb-who-t b{font:var(--fdw) 24px/1.05 var(--fd);letter-spacing:.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lobby .lb-who .lb-change{margin-right:auto}
.lobby .lb-who-t{flex:0 1 auto}
.lobby .lb-picks{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.lobby .lb-pick{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:5px 12px 5px 6px;border-radius:999px;border:3px solid var(--ink);background:rgba(52,64,138,.9);color:#fff;font:var(--fdw) 16px/1 var(--fd);cursor:pointer;pointer-events:auto}
.lobby .lb-pick .ava{--s:30px}
.lobby .lb-pick.on{background:linear-gradient(180deg,#63f27f,#1fb043)}
.lobby .lb-pick:focus-visible{outline:4px solid #fff;outline-offset:2px}
.lobby .lb-quick{width:100%;margin-top:14px;flex-direction:column;gap:4px}
.lobby .lb-quick .lbq{display:flex;align-items:center;gap:12px}
.lobby .lb-quick small{font:800 14px/1 var(--fb);opacity:.95}
.lobby .lb-rooms{display:flex;flex-direction:column;gap:6px;max-height:228px;overflow-y:auto;padding:2px}
.lobby .lb-room{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 10px;border-radius:14px;background:rgba(10,15,40,.4);border:2px solid rgba(255,255,255,.07);animation:lbIn .25s var(--spring) both}
@keyframes lbIn{from{opacity:0;transform:translateY(6px)}}
.lobby .lb-room .lr-dot{width:36px;height:36px;flex:none;border-radius:50%;display:grid;place-items:center;background:var(--c,#556);border:3px solid var(--ink);font:var(--fdw) 18px/1 var(--fd);text-shadow:0 2px 0 rgba(0,0,0,.35)}
.lobby .lb-room .lr-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.lobby .lb-room .lr-t b{font:var(--fdw) 19px/1.05 var(--fd);letter-spacing:.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lobby .lb-room .lr-n{display:flex;align-items:center;gap:4px;font:800 12px/1 var(--fb);color:var(--txt2)}
.lobby .lb-room .lr-n i{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.18);border:2px solid var(--ink)}
.lobby .lb-room .lr-n i.on{background:#63f27f}
.lobby .lb-room .btn{min-height:42px}
.lobby .lb-empty{padding:16px 12px;text-align:center;font:700 14px/1.35 var(--fb);color:var(--txt2)}
.lobby .lb-down{display:flex;flex-direction:column;align-items:center;gap:10px;color:#ffd9df}
.lobby .lb-sec .live.down{color:#ff9aab}
.lobby .lb-sec .live.down i{background:#ff5a73;box-shadow:none;animation:none}
.lobby .lb-make{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.lobby .lb-mk{flex-direction:column;align-items:flex-start;gap:6px;text-align:left;min-height:84px;padding:12px 14px 14px}
.lobby .lb-mk .lbm{display:flex;align-items:center;gap:9px;font-size:21px}
.lobby .lb-mk small{font:800 13px/1.25 var(--fb);letter-spacing:0;opacity:.95;white-space:normal}
.lobby .lb-join{display:flex;gap:10px;align-items:center}
#ui .lobby .lb-code{flex:1;min-width:0;height:56px;margin:0;padding:0 14px;border-radius:15px;border:3px solid var(--ink);background:#fff;color:var(--ink);
  font:var(--fdw) 30px/1 var(--fd);letter-spacing:.42em;text-transform:uppercase;text-align:center;pointer-events:auto;user-select:text;-webkit-user-select:text;box-shadow:inset 0 3px 0 rgba(0,0,0,.12)}
#ui .lobby .lb-code::placeholder{color:#b9c0dc;letter-spacing:.42em}
#ui .lobby .lb-code:focus{outline:4px solid #ffd23f;outline-offset:2px}
.lobby .lb-face{display:flex;align-items:center;gap:12px;margin-top:16px}
.lobby .lb-face .set-l{flex:1}
.lobby .lb-face .set-name{font:var(--fdw) 17px/1.1 var(--fd);letter-spacing:.02em}
.lobby .lb-face .set-note{font:700 12.5px/1.3 var(--fb);color:var(--txt3)}
.lobby .lb-face .switch{pointer-events:auto}
.lobby .lb-face.off{opacity:.6}
.lobby .lb-status{display:flex;align-items:center;gap:10px;min-height:0;margin-top:14px;padding:0 12px;border-radius:14px;font:800 15px/1.3 var(--fb);transition:padding .15s}
.lobby .lb-status:empty{display:none}
.lobby .lb-status.busy,.lobby .lb-status.err,.lobby .lb-status.ok{padding:10px 12px}
.lobby .lb-status.busy{background:rgba(61,155,255,.18);border:2px solid rgba(92,184,255,.55)}
.lobby .lb-status.err{background:rgba(255,59,92,.16);border:2px solid rgba(255,107,128,.6);color:#ffd9df}
.lobby .lb-status .sp{width:20px;height:20px;flex:none;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;animation:lbSpin .8s linear infinite}
.lobby .lb-status .st{flex:1}
.lobby .lb-status .btn{min-height:36px}
@keyframes lbSpin{to{transform:rotate(360deg)}}
.lobby.busy .lb-act{pointer-events:none;filter:grayscale(.6) brightness(.8)}
.lobby .lb-off{padding:18px 6px 4px;text-align:center}
.lobby .lb-off p{font:700 16px/1.4 var(--fb);color:var(--txt2);margin:8px 0 0}
.lobby .lb-off .big{font:var(--fdw) 24px/1.1 var(--fd);color:#fff}
@media (max-width:560px){
  .lobby .lb-make{grid-template-columns:1fr}
  .lobby .lb-mk{min-height:0}
  .lobby .lb-who .ava{--s:40px}
  #ui .lobby .lb-code{font-size:24px;height:50px;letter-spacing:.3em}
  .lobby .lb-rooms{max-height:180px}
}
@media (prefers-reduced-motion:reduce){.lobby .lb-room{animation:none}.lobby .lb-sec .live i{animation:none}}

/* in-game room chip (under the leaderboard) */
.room-chip{position:relative;z-index:6;align-self:stretch;min-width:0;pointer-events:auto;font-family:var(--fb);color:#fff}
.room-chip .rc-bar{display:flex;align-items:center;gap:6px;width:100%;min-height:40px;padding:5px 6px 5px 9px;border-radius:15px;border:3px solid var(--ink);background:var(--panel);box-shadow:var(--panel-sh);cursor:pointer;color:#fff;text-align:left}
.room-chip .rc-bar:focus-visible{outline:4px solid #fff;outline-offset:2px}
.room-chip .rc-ic{width:20px;height:20px;flex:none;color:#8fd3ff}
.room-chip .rc-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.room-chip .rc-t small{font:900 9.5px/1 var(--fb);letter-spacing:.12em;text-transform:uppercase;color:var(--txt3)}
.room-chip .rc-t b{font:var(--fdw) 17px/1 var(--fd);letter-spacing:.08em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.room-chip .rc-t b.pub{letter-spacing:.02em}
.room-chip .rc-n{display:flex;align-items:center;gap:3px;padding:3px 7px;border-radius:999px;background:rgba(10,15,40,.55);font:900 12px/1 var(--fb)}
.room-chip .rc-n i{width:8px;height:8px;border-radius:50%;background:#3fd65a}
.room-chip.warn .rc-n i{background:#ffd23f;animation:lbPulse 1s infinite}
.room-chip .rc-car{width:16px;height:16px;flex:none;transition:transform .2s;opacity:.8}
.room-chip.open .rc-car{transform:rotate(180deg)}
.room-chip .rc-code{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:0 0 6px;padding:6px 6px 7px 10px;border-radius:12px;background:rgba(10,15,40,.45)}
.room-chip .rc-code .rc-cl{flex:1 0 100%;font:800 10.5px/1.1 var(--fb);letter-spacing:.1em;text-transform:uppercase;color:var(--txt3)}
.room-chip .rc-code b{flex:1;min-width:0;font:var(--fdw) 24px/1 var(--fd);letter-spacing:.16em;user-select:text;-webkit-user-select:text}
.room-chip .rc-copy{min-height:34px;padding:5px 10px 7px;font-size:14px;border-radius:10px}
.room-chip .rc-pop{display:none;position:absolute;right:0;top:calc(100% + 6px);width:max(100%,236px);padding:8px;border-radius:15px;border:3px solid var(--ink);background:var(--panel);box-shadow:var(--panel-sh);animation:lbIn .2s var(--spring) both}
.room-chip.open .rc-pop{display:block}
.room-chip .rc-m{display:flex;align-items:center;gap:8px;padding:4px 2px;min-height:40px}
.room-chip .rc-m .ava{--s:30px}
.room-chip .rc-m .rn{flex:1;min-width:0;display:flex;align-items:center;gap:5px;font:var(--fdw) 16px/1 var(--fd);letter-spacing:.01em}
.room-chip .rc-m .rn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.room-chip .rc-m .rn .cr{width:16px;height:16px;flex:none;color:var(--gold)}
.room-chip .rc-m .rn em{font:800 10px/1 var(--fb);font-style:normal;letter-spacing:.08em;text-transform:uppercase;color:var(--txt3)}
.room-chip .rc-m .btn{width:34px;height:34px;min-height:0;padding:6px;border-radius:11px}
.room-chip .rc-m .btn.on{--b1:#ffd23f;--b2:#ff9f1c;color:#4a2600}
.room-chip .rc-m .btn.sure{width:auto;padding:6px 9px;font-size:13px}
.room-chip .rc-note{margin:4px 2px 8px;font:700 11.5px/1.3 var(--fb);color:var(--txt3)}
.room-chip .rc-leave{width:100%;margin-top:6px;min-height:40px;font-size:16px}
.room-toasts{position:absolute;left:50%;top:24%;transform:translateX(-50%);width:min(440px,calc(100% - 32px));display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;z-index:3}
.room-toast{display:flex;align-items:center;gap:8px;max-width:100%;padding:6px 16px 7px 7px;border-radius:22px;border:3px solid var(--ink);background:var(--panel);box-shadow:var(--panel-sh);
  font:var(--fdw) 16px/1.15 var(--fd);letter-spacing:.02em;text-align:left;animation:rtIn .35s var(--spring) both}
.room-toast .ava{--s:26px}
.room-toast .ti{width:22px;height:22px;flex:none;display:grid;place-items:center;color:#8fd3ff}
.room-toast .ava{flex:none}
.room-toast.out{animation:rtOut .3s ease-in forwards}
@keyframes rtIn{from{opacity:0;transform:translateY(-10px) scale(.9)}}
@keyframes rtOut{to{opacity:0;transform:translateY(-8px)}}
@media (max-width:640px),(max-height:500px){
  .room-chip .rc-bar{min-height:34px;padding:3px 4px 3px 7px;border-radius:13px}
  .room-chip .rc-t small{display:none}
  .room-chip .rc-t b{font-size:15px}
  .room-chip .rc-ic{width:16px;height:16px}
  .room-chip .rc-pop{width:max(100%,224px)}
  .room-toast{font-size:14px}
  .room-toasts{top:30%}
}
@media (max-height:500px){
  .room-chip .rc-pop{max-height:calc(100vh - 150px);overflow-y:auto}
  .room-chip .rc-note{display:none}
}
`;

function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('sas-lobby')) return;
  const s = document.createElement('style');
  s.id = 'sas-lobby';
  s.textContent = CSS;
  document.head.appendChild(s);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const hasFace = (id) => !!familyFaceData(id)?.face;
const COPY = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><rect x="8.5" y="8.5" width="12" height="12" rx="2.6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15.5 5.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2h.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

// ------------------------------------------------------------------ friendly notes after leaving a room

let noticeWired = false;
function wireNotices(app) {
  if (noticeWired) return;
  noticeWired = true;
  // kicked out / connection lost while playing: the app is back on the title, say why (once)
  bus.on('net:error', ({ code, message }) => {
    if (!['kicked', 'lost', 'closed'].includes(code)) return;
    setTimeout(() => {
      if (app.online?.room || document.querySelector('.lobby')) return;
      const body = h('div', { class: 'lobby' },
        h('div', { class: 'mh' }, h('span', { class: 'mh-ic', html: ICON.globe }), h('h2', { text: code === 'kicked' ? 'Left the room' : 'Room closed' })),
        h('p', { class: 'lb-sub', text: message }),
        h('div', { class: 'modal-done' }, app.menus.btn(app.menus.iconLabel(ICON.globe, 'Play Online'), 'btn-purple btn-lg', () => {
          m.close();
          openLobby(app);
        }), app.menus.btn('OK', 'btn-grey btn-lg', () => m.close())));
      const m = app.menus.openModal(body, { cls: 'lobby-modal', label: 'Online' });
    }, 400);
  });
}

// ------------------------------------------------------------------ the lobby

/** The Play Online modal. */
export function openLobby(app) {
  injectCss();
  wireNotices(app);
  const on = app.online;
  const menus = app.menus;
  const btn = menus.btn;
  const root = h('div', { class: 'lobby' });
  const head = h('div', { class: 'mh' }, h('span', { class: 'mh-ic', html: ICON.globe }), h('h2', { text: 'Play Online' }));

  if (!on?.available) {
    const why = on?.unavailable === 'insecure' ? NET_ERRORS.insecure : NET_ERRORS.unavailable;
    root.append(head, h('div', { class: 'lb-off' },
      h('div', { class: 'big', text: on?.unavailable === 'insecure' ? "Online play can't start here" : 'Online play is coming soon!' }),
      h('p', { text: why + ' You can still play with the family on this device.' })));
    const m = menus.openModal(root, { cls: 'lobby-modal', label: 'Play Online' });
    root.appendChild(menus.doneRow(() => m.close()));
    return m;
  }

  const offs = [];
  let stopRooms = null;
  let busy = false;
  let rooms = [];
  let m = null;

  // ---- who's playing
  const whoAva = h('span');
  const whoName = h('b');
  const picks = h('div', { class: 'lb-picks', hidden: true, role: 'radiogroup', 'aria-label': 'Choose who plays' });
  const changeBtn = btn('Change', 'btn-ghost btn-sm lb-act', () => {
    picks.hidden = !picks.hidden;
    changeBtn.setAttribute('aria-expanded', String(!picks.hidden));
    if (!picks.hidden) paintPicks();
  }, { 'aria-expanded': 'false' });
  const whoCard = h('div', { class: 'lb-card' },
    h('div', { class: 'lb-who' }, whoAva, h('div', { class: 'lb-who-t' }, h('small', { text: 'Playing as' }), whoName), changeBtn), picks);
  changeBtn.classList.add('lb-change');

  function paintWho() {
    const p = app.profile;
    whoAva.replaceChildren(avatarEl(p.id, ''));
    whoName.textContent = p.name;
    paintFace();
  }

  function paintPicks() {
    const cur = app.profile.id;
    picks.replaceChildren(...listProfiles().map((p) => h('button', {
      class: 'lb-pick' + (p.id === cur ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': String(p.id === cur), style: `--c:${profileColor(p)}`,
      onclick: () => {
        menus.click();
        app.setProfile?.(p.id);
        picks.hidden = true;
        changeBtn.setAttribute('aria-expanded', 'false');
        paintWho();
      },
    }, avatarEl(p.id, ''), h('span', { text: p.name }))));
  }

  // ---- quick play
  const quick = btn([h('span', { class: 'lbq' }, h('span', { class: 'bi', html: ICON.play }), h('span', { text: 'Quick Play' })), h('small', { text: 'Hop into a public garden' })],
    'btn-green btn-xl lb-quick lb-act', () => run(() => on.quickPlay()), { 'data-autofocus': '' });

  // ---- public rooms
  const liveTxt = h('span', { text: 'live' });
  const live = h('span', { class: 'live' }, h('i'), liveTxt);
  const list = h('div', { class: 'lb-rooms', role: 'list', 'aria-label': 'Public rooms', 'aria-live': 'polite' },
    h('div', { class: 'lb-empty', text: 'Looking for rooms…' }));
  function paintRooms(err) {
    toggle(live, 'down', !!err);
    setText(liveTxt, err === 'offline' ? 'offline' : err ? 'no connection' : 'live');
    if (err) {
      const msg = err === 'offline' ? NET_ERRORS.offline : err === 'connect' ? "Can't reach the game server right now." : NET_ERRORS[err] || NET_ERRORS.unavailable;
      list.replaceChildren(h('div', { class: 'lb-empty lb-down' }, h('span', { text: msg }),
        err === 'offline' || err === 'connect' ? btn('Try again', 'btn-blue btn-sm', () => {
          list.replaceChildren(h('div', { class: 'lb-empty', text: 'Looking for rooms…' }));
          stopRooms?.retry?.();
        }) : null));
      return;
    }
    if (!rooms.length) {
      list.replaceChildren(h('div', { class: 'lb-empty', text: 'No public rooms right now. Make one and friends can hop in!' }));
      return;
    }
    list.replaceChildren(...rooms.slice(0, 30).map((r) => {
      const dots = h('span', { class: 'lr-n', 'aria-label': `${r.n} of ${r.max} players` },
        ...Array.from({ length: r.max }, (_, i) => h('i', { class: i < r.n ? 'on' : '' })), h('span', { text: ` ${r.n}/${r.max}` }));
      const join = !r.ok
        ? btn('Update', 'btn-grey btn-sm', () => {}, { disabled: true, title: NET_ERRORS.version })
        : r.full ? btn('Full', 'btn-grey btn-sm', () => {}, { disabled: true })
          : btn('Join', 'btn-blue btn-sm lb-act', () => run(() => on.joinRoom(r.code)), { 'aria-label': `Join ${r.name}` });
      return h('div', { class: 'lb-room', role: 'listitem' },
        h('span', { class: 'lr-dot', style: `--c:${colorFor(r.host)}`, text: (r.host || '?')[0].toUpperCase(), 'aria-hidden': 'true' }),
        h('span', { class: 'lr-t' }, h('b', { text: r.name }), dots), join);
    }));
  }

  // ---- make a room
  const make = h('div', { class: 'lb-make' },
    btn([h('span', { class: 'lbm' }, h('span', { class: 'bi', html: ICON.globe }), h('span', { text: 'Public room' })), h('small', { text: 'Anyone playing online can join.' })],
      'btn-blue lb-mk lb-act', () => run(() => on.createRoom({ private: false }))),
    btn([h('span', { class: 'lbm' }, h('span', { class: 'bi', html: ICON.lock }), h('span', { text: 'Private room' })), h('small', { text: 'Only friends with your secret code.' })],
      'btn-purple lb-mk lb-act', () => run(() => on.createRoom({ private: true }))));

  // ---- join with a code
  const input = h('input', {
    class: 'lb-code', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    maxlength: String(CODE_LEN + 4), placeholder: '•'.repeat(CODE_LEN), 'aria-label': 'Room code (5 letters)',
  });
  const joinBtn = btn('Join', 'btn-green btn-lg lb-act', () => joinCode(), { disabled: true });
  input.addEventListener('input', () => {
    const c = normalizeCode(input.value);
    if (input.value !== c) input.value = c;
    joinBtn.disabled = c.length !== CODE_LEN;
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // typing must not move the (title screen) camera or open menus
    if (e.key === 'Enter' && !joinBtn.disabled) joinCode();
  });
  function joinCode() {
    const c = normalizeCode(input.value);
    if (c.length === CODE_LEN) run(() => on.joinRoom(c, { typed: true })); // typed codes are the only way faces get shared
  }

  // ---- share my face (private rooms only)
  const faceSw = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': 'Share my photo face in private rooms' }, h('i'));
  const faceNote = h('span', { class: 'set-note' });
  const faceRow = h('div', { class: 'lb-face lb-card' },
    h('span', { class: 'set-l' }, h('span', { class: 'set-name', text: 'Show my photo face in private rooms' }), faceNote), faceSw);
  function paintFace() {
    const p = app.profile;
    const can = hasFace(p.id);
    const onNow = !!p.shareFace && can;
    toggle(faceSw, 'on', onNow);
    faceSw.setAttribute('aria-checked', String(onNow));
    faceSw.disabled = !can;
    toggle(faceRow, 'off', !can);
    setText(faceNote, can
      ? 'Only friends in a private room you join by typing its code (or make yourself) see it. Public rooms always show cartoon faces.'
      : 'Take a photo in the Photo Booth first. Public rooms always show cartoon faces.');
  }
  faceSw.addEventListener('click', () => {
    const p = app.profile;
    if (!hasFace(p.id)) return;
    menus.click();
    updateProfile(p.id, { shareFace: !p.shareFace });
    paintFace();
  });

  // ---- status line
  const status = h('div', { class: 'lb-status', role: 'status', 'aria-live': 'polite' });
  function showStatus(kind, text) {
    status.className = 'lb-status ' + (kind || '');
    status.replaceChildren();
    if (!text) return;
    if (kind === 'busy') status.append(h('span', { class: 'sp', 'aria-hidden': 'true' }));
    status.append(h('span', { class: 'st', text }));
    if (kind === 'busy') status.append(btn('Cancel', 'btn-grey btn-sm', () => {
      on.cancel();
      setBusy(false);
      showStatus('', '');
    }));
  }
  function setBusy(b) {
    busy = b;
    toggle(root, 'busy', b);
    for (const el of root.querySelectorAll('.lb-act')) el.setAttribute('aria-disabled', String(b));
  }
  async function run(fn) {
    if (busy) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showStatus('err', NET_ERRORS.offline);
      uiSound(app, 'error');
      return;
    }
    setBusy(true);
    showStatus('busy', 'Connecting…');
    let ok = false;
    try {
      ok = await fn();
    } catch (e) {
      console.warn('[lobby]', e);
    }
    if (!root.isConnected) return;
    setBusy(false);
    if (!ok && !status.classList.contains('err')) showStatus('', '');
  }

  offs.push(bus.on('net:status', ({ status: s, text }) => {
    if (!root.isConnected) return;
    if (s === 'error') {
      showStatus('err', text);
      uiSound(app, 'error');
    } else if (busy && text) showStatus('busy', text);
  }));
  offs.push(bus.on('net:joined', () => m?.close(true)));
  offs.push(bus.on('profile:active', () => root.isConnected && paintWho()));

  root.append(head,
    h('p', { class: 'lb-sub', text: 'Play in one big garden with friends and family, on any device.' }),
    whoCard,
    quick,
    h('div', { class: 'lb-sec' }, h('span', { text: 'Public rooms' }), live),
    list,
    h('div', { class: 'lb-sec', text: 'Make a room' }),
    make,
    h('div', { class: 'lb-sec', text: "Join a friend's room" }),
    h('div', { class: 'lb-join' }, input, joinBtn),
    faceRow,
    status);
  paintWho();
  stopRooms = on.listRooms((r, err) => {
    rooms = r || [];
    paintRooms(err);
  });

  m = menus.openModal(root, {
    cls: 'lobby-modal', label: 'Play Online',
    onClose: () => {
      if (busy) on.cancel();
    },
  });
  m.dispose = () => {
    stopRooms?.();
    for (const f of offs) f();
  };
  return m;
}

const PALETTE = ['#2f80ed', '#ff4f9a', '#9b5cff', '#1ec8a5', '#ff9f1c', '#3fd65a', '#ff5a5a'];
function colorFor(name) {
  let n = 0;
  for (const ch of String(name || '')) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[n % PALETTE.length];
}

// ------------------------------------------------------------------ in-game room chip

/** Room chip under the leaderboard while playing online. Returns {update, dispose}. */
export function mountRoomPanel(app, hudRoot, anchors = {}) {
  const on = app.online;
  if (!on?.room) return { update() {}, dispose() {} };
  injectCss();
  wireNotices(app);
  const menus = app.menus;
  const btn = menus.btn;
  const room = on.room;
  const parent = anchors.room || anchors.tr || hudRoot;

  const chip = h('div', { class: 'room-chip' });
  const title = h('b', { class: room.private ? '' : 'pub', text: room.private ? room.code : 'Public room' });
  const small = h('small', { text: room.private ? 'Private room' : room.name });
  const count = h('span');
  const nBox = h('span', { class: 'rc-n' }, h('i'), count);
  const bar = h('button', { class: 'rc-bar', type: 'button', 'aria-expanded': 'false', 'aria-label': 'Room: who is here' },
    h('span', { class: 'rc-ic', html: room.private ? ICON.lock : ICON.globe }), h('span', { class: 'rc-t' }, small, title), nBox,
    h('span', { class: 'rc-car', html: '<svg viewBox="0 0 24 24" class="ico"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' }));
  const copyBtn = room.private ? btn([h('span', { class: 'bi', html: COPY }), h('span', { text: 'Copy' })], 'btn-blue rc-copy', async () => {
    const ok = await copyText(room.code);
    toast(ok ? `Code ${room.code} copied!` : `Room code: ${room.code}`, ICON.check);
  }, { 'aria-label': `Copy room code ${room.code}` }) : null;
  const codeRow = room.private ? h('div', { class: 'rc-code' }, h('span', { class: 'rc-cl', text: 'Room code' }), h('b', { text: room.code }), copyBtn) : null;
  const listEl = h('div', { role: 'list' });
  const note = h('div', { class: 'rc-note' });
  const leave = btn(menus.iconLabel(ICON.exit, 'Leave room'), 'btn-red btn-sm rc-leave', () => {
    if (!leave.classList.contains('sure')) {
      leave.classList.add('sure');
      leave.lastChild.textContent = 'Tap again to leave';
      setTimeout(() => {
        leave.classList.remove('sure');
        if (leave.lastChild) leave.lastChild.textContent = 'Leave room';
      }, 3000);
      return;
    }
    on.leave();
    app.quitToTitle();
  });
  const pop = h('div', { class: 'rc-pop' }, codeRow, listEl, note, leave);
  chip.append(bar, pop);
  parent.appendChild(chip);
  function setOpen(open) {
    chip.classList.toggle('open', open);
    bar.setAttribute('aria-expanded', String(open));
    if (open) paint();
  }
  bar.addEventListener('click', () => {
    menus.click();
    setOpen(!chip.classList.contains('open'));
  });
  // a tap anywhere else closes the list (phones have no hover)
  const outside = (e) => chip.classList.contains('open') && !chip.contains(e.target) && setOpen(false);
  document.addEventListener('pointerdown', outside, true);
  // keep keyboard/gamepad input for the game: clicks here must not leave focus on a button
  chip.addEventListener('mousedown', (e) => e.target.closest('button') && e.preventDefault());

  const toasts = h('div', { class: 'room-toasts', 'aria-live': 'polite' });
  hudRoot.appendChild(toasts);
  function toast(text, icon = ICON.globe, faceKey = null, ms = 2600) {
    const t = h('div', { class: 'room-toast' }, faceKey ? avatarEl(faceKey, '') : h('span', { class: 'ti', html: icon }), h('span', { text }));
    toasts.appendChild(t);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }
  // hello (after the camera swoops in)
  const hello = setTimeout(() => {
    if (!on.room) return;
    if (on.isHost && room.private) toast(`Room ${room.code} is ready! Share the code with friends.`, ICON.lock, null, 5200);
    else if (on.isHost) toast('Your public room is open! Friends can find it in Play Online.', ICON.globe, null, 4200);
    else toast(`Welcome to ${room.name}!`, ICON.globe, null, 3400);
  }, 1900);

  const kickArm = new Map();
  function paint() {
    const ms = on.members || [];
    setText(count, String(ms.length));
    nBox.setAttribute('aria-label', `${ms.length} ${ms.length === 1 ? 'person' : 'people'} here`);
    const rows = ms.map((mb) => {
      const name = h('span', { class: 'rn' }, h('span', { text: mb.name }),
        mb.isHost ? h('span', { class: 'cr', html: ICON.crown, title: 'Host' }) : null, mb.isMe ? h('em', { text: 'you' }) : null);
      const acts = [];
      if (!mb.isMe) {
        const mute = btn(h('span', { class: 'bi', html: mb.muted ? ICON.soundOff : ICON.chat }), 'btn-ghost' + (mb.muted ? ' on' : ''), () => {
          on.mute(mb.pid);
          toast(mb.muted ? `${mb.name}'s chat is back` : `Muted ${mb.name}'s chat`, mb.muted ? ICON.chat : ICON.soundOff);
          paint();
        }, { 'aria-label': mb.muted ? `Unmute ${mb.name}` : `Mute ${mb.name}'s chat`, title: mb.muted ? 'Unmute' : 'Mute chat' });
        acts.push(mute);
        if (on.isHost) {
          const armed = kickArm.get(mb.pid) > performance.now();
          const kick = btn(armed ? 'Remove?' : h('span', { class: 'bi', html: ICON.close }), 'btn-red' + (armed ? ' sure' : ''), () => {
            if (kickArm.get(mb.pid) > performance.now()) {
              kickArm.delete(mb.pid);
              on.kick(mb.pid);
              toast(`${mb.name} was removed`, ICON.close);
            } else {
              kickArm.set(mb.pid, performance.now() + 3000);
              setTimeout(() => chip.classList.contains('open') && paint(), 3050);
            }
            paint();
          }, { 'aria-label': `Remove ${mb.name} from the room`, title: 'Remove from room' });
          acts.push(kick);
        }
      }
      return h('div', { class: 'rc-m', role: 'listitem', style: `--c:${mb.color}` }, avatarEl(mb.faceKey, ''), name, ...acts);
    });
    listEl.replaceChildren(...rows);
    const free = 4 - ms.length;
    setText(note, `${room.private ? 'Share the code with friends. ' : ''}${free > 0 ? `${free} more can join. ` : ''}Computer players look after empty gardens.`);
  }
  paint();

  const offs = [
    bus.on('net:members', ({ members, joined = [], left = [], reason }) => {
      paint();
      for (const pid of joined) {
        const mb = members.find((x) => x.pid === pid);
        if (mb) toast(`${mb.name} joined!`, ICON.globe, mb.faceKey);
      }
      for (const pid of left) {
        const nm = lastNames.get(pid);
        if (nm && reason !== 'kicked') toast(`${nm} left`, ICON.exit);
      }
      remember();
    }),
    bus.on('net:host', ({ isHost, promoted }) => {
      if (!room.private) setText(small, on.room?.name || room.name); // the room is named after its (new) host
      paint();
      if (promoted && isHost) toast("You're the host now!", ICON.crown);
    }),
    bus.on('net:status', ({ status, text }) => {
      toggle(chip, 'warn', status === 'reconnecting');
      if (status === 'reconnecting' && text) toast(text, ICON.globe);
    }),
  ];
  // names of people who were here (for "X left" after they're gone from the list)
  const lastNames = new Map();
  function remember() {
    for (const mb of on.members || []) lastNames.set(mb.pid, mb.name);
  }
  remember();

  let acc = 0;
  return {
    update(dt) {
      acc += dt || 0;
      if (acc < 0.5) return;
      acc = 0;
      if (!on.room) chip.hidden = true;
    },
    dispose() {
      clearTimeout(hello);
      document.removeEventListener('pointerdown', outside, true);
      for (const f of offs) f();
      chip.remove();
      toasts.remove();
    },
  };
}
