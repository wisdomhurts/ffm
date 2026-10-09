// Styles for the chat panel (ui/chat.js) and typed speech bubbles, injected once as <style id="sas-chat">.
// Uses the game's tokens from ui/styles.js (--ink, --panel, --fd, --fb, .btn colours).

const css = `
/* ------------------------------------------------------------ HUD buttons */
.chat-hbtn{position:relative}
.chat-tbtn{position:absolute;z-index:3;display:none;place-items:center;width:52px;height:52px;padding:10px;border-radius:50%;border:3.5px solid var(--ink);color:#fff;
  background:radial-gradient(circle at 42% 30%,#8fd0ff,#2a6fe6);cursor:pointer;pointer-events:auto;touch-action:manipulation;-webkit-user-select:none;user-select:none;
  box-shadow:inset 0 3px 0 rgba(255,255,255,.4),inset 0 -5px 0 rgba(0,0,0,.18),0 5px 0 rgba(10,14,40,.75);transition:transform .08s,opacity .2s}
.chat-tbtn svg{width:100%;height:100%;filter:drop-shadow(0 2px 0 rgba(0,0,0,.25))}
.chat-tbtn:active{transform:translateY(3px) scale(.93)}
.hud.intro .chat-tbtn,.hud:not([data-state=playing]) .chat-tbtn,.hud.soc-wheel-open .chat-tbtn{opacity:0;visibility:hidden;pointer-events:none}
/* portrait phones: the Pause/Mute row belongs to the quest tracker, so the round button sits over the emote button
   (or in its place: the Simple HUD moves the emote button up into that row) */
@media (orientation:portrait) and (max-width:640px){
  .is-touch .chat-tbtn{display:grid;right:calc(var(--sr) + 104px);bottom:calc(var(--sb) + 250px)}
  html.hud-simple.is-touch .chat-tbtn{bottom:calc(var(--sb) + 186px)}
  .is-touch .chat-hbtn{display:none}
}
.chat-hbtn .cdot,.chat-tbtn .cdot{position:absolute;right:-7px;top:-7px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;display:none;place-items:center;
  font:900 11.5px/1 var(--fb);color:#fff;background:linear-gradient(180deg,#ff6b80,#dc2548);border:2.5px solid var(--ink);pointer-events:none}
.chat-hbtn.unread .cdot,.chat-tbtn.unread .cdot{display:grid;animation:chatDot .4s var(--spring) both}
.chat-hbtn.on{background:linear-gradient(180deg,#5cb8ff,#2a6fe6)}
.chat-tbtn.on{background:radial-gradient(circle at 42% 30%,#ffe98a,#ffb627);color:var(--ink)}

/* ------------------------------------------------------------ panel (desktop: bottom left, over the chat log) */
.hud.chat-open .chat{visibility:hidden}
.chat-panel{position:absolute;z-index:30;left:var(--sl);bottom:var(--sb);width:min(400px,calc(100vw - 20px));max-height:min(440px,calc(100% - 200px));min-height:220px;
  display:flex;flex-direction:column;gap:7px;padding:9px 10px 10px;border-radius:20px;background:var(--panel);border:3px solid var(--ink);
  box-shadow:0 6px 0 rgba(10,14,40,.7),0 10px 30px rgba(0,0,0,.35);pointer-events:auto;color:#fff;animation:chatIn2 .22s var(--spring) both}
.chat-panel.out{animation:chatOut2 .14s ease-in forwards}
.cp-head{display:flex;align-items:center;gap:8px;min-height:32px}
.cp-ic{width:24px;height:24px;flex:none;color:#9fd2ff}
.cp-ic svg{width:100%;height:100%}
.cp-title{font:var(--fdw) 20px/1 var(--fd);letter-spacing:.02em;text-shadow:0 2px 0 rgba(0,0,0,.3)}
.cp-where{display:inline-flex;align-items:center;gap:5px;font:900 11px/1 var(--fb);letter-spacing:.08em;text-transform:uppercase;color:var(--txt2);
  padding:5px 8px 5px 7px;border-radius:999px;background:rgba(10,15,40,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.cp-where svg{width:13px;height:13px;flex:none}
.cp-x{margin-left:auto;width:34px;height:34px;flex:none;border-radius:11px}
.cp-x svg{width:16px;height:16px}
.cp-log{flex:1 1 auto;min-height:60px;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:3px;padding:6px 7px;border-radius:13px;
  background:rgba(8,12,34,.5);scrollbar-width:thin}
.cp-l{font:700 14px/1.3 var(--fb);overflow-wrap:anywhere;animation:chatIn .2s var(--spring) both}
.cp-l b{font-weight:900;color:var(--c);color:color-mix(in srgb,var(--c) 62%,#fff)}
.cp-l.q span{color:#ffe98a}
.cp-l.me b::after{content:' (you)';font-weight:700;color:var(--txt3)}
.cp-empty{margin:auto;text-align:center;font:700 13px/1.3 var(--fb);color:var(--txt3);padding:8px}
.cp-people{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.cp-people > span{font:900 10.5px/1 var(--fb);letter-spacing:.1em;text-transform:uppercase;color:var(--txt3);margin-right:2px}
.cp-pm{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:3px 9px 4px 4px;border-radius:999px;border:2.5px solid var(--ink);cursor:pointer;
  background:rgba(10,15,40,.55);color:#fff;font:800 13px/1 var(--fb)}
.cp-pm .ava{--s:20px}
.cp-pm i{width:15px;height:15px;display:grid;place-items:center;color:var(--txt2)}
.cp-pm i svg{width:100%;height:100%}
.cp-pm.muted{background:rgba(220,37,72,.35);text-decoration:line-through}
.cp-pm.muted i{color:#ff8a9c}
.cp-form{display:flex;gap:7px;align-items:stretch;margin:0}
.cp-in{flex:1 1 auto;min-width:0;height:44px;padding:0 12px;border-radius:13px;border:3px solid var(--ink);background:#fff;color:#1b2452;
  font:800 16px/1 var(--fb);outline:none;box-shadow:inset 0 2px 0 rgba(16,22,58,.12)}
.cp-in:focus{box-shadow:0 0 0 3px #5cb8ff}
.cp-in.bad{box-shadow:0 0 0 3px #ff6b80;animation:chatNope .32s}
.cp-send{min-height:44px;padding:6px 14px 8px;font-size:17px;border-radius:13px;flex:none}
.cp-send .bi{width:20px;height:20px}
.cp-meta{display:flex;align-items:center;gap:8px;min-height:16px;margin:-2px 2px 0}
.cp-note{flex:1;font:800 12.5px/1.25 var(--fb);color:var(--txt3)}
.cp-note.warn{color:#ffd23f}
.cp-count{font:800 11px/1 var(--fb);color:var(--txt3)}
.cp-count.full{color:#ffd23f}
.cp-off{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:13px;background:rgba(10,15,40,.45);font:800 13px/1.3 var(--fb);color:var(--txt2)}
.cp-off svg{width:20px;height:20px;flex:none;color:#ffd23f}
.cp-quick{display:flex;gap:6px;overflow-x:auto;overscroll-behavior:contain;padding:2px 2px 5px;scrollbar-width:thin;flex:none}
.cp-q{display:inline-flex;align-items:center;gap:5px;flex:none;min-height:34px;padding:3px 11px 4px 5px;border-radius:999px;border:2.5px solid var(--ink);cursor:pointer;
  background:linear-gradient(180deg,#5d6bc0,#38438f);color:#fff;font:800 13.5px/1 var(--fb);box-shadow:0 3px 0 var(--ink);white-space:nowrap}
.cp-q .sico,.cp-q svg{width:22px;height:22px;flex:none}
.cp-q:active{transform:translateY(2px);box-shadow:0 1px 0 var(--ink)}
.cp-q.off{filter:grayscale(.6) brightness(.8)}
.cp-q:focus-visible,.cp-pm:focus-visible,.cp-in:focus-visible{outline:3px solid #fff;outline-offset:2px}

/* ------------------------------------------------------------ grown-up check (Settings > Chat > public rooms) */
.modal-panel.grown-up{width:min(400px,100%);text-align:center}
.gu-p{margin:4px 0 14px;font:700 15px/1.35 var(--fb);color:var(--txt2)}
.gu-form{display:flex;flex-direction:column;align-items:center;gap:14px;margin:0}
.gu-q{display:flex;align-items:center;justify-content:center;gap:12px;font:var(--fdw) 34px/1 var(--fd);letter-spacing:.02em;text-shadow:0 3px 0 rgba(0,0,0,.3)}
.gu-in{width:3.6em;height:54px;padding:0 10px;border-radius:14px;border:3px solid var(--ink);background:#fff;color:#1b2452;text-align:center;
  font:900 28px/1 var(--fb);outline:none;box-shadow:inset 0 2px 0 rgba(16,22,58,.12)}
.gu-in:focus{box-shadow:0 0 0 3px #5cb8ff}
.gu-btns{display:flex;gap:10px;justify-content:center}
.gu-btns .btn{min-width:110px}

/* typed speech bubbles hold more words */
.bb.bb-t{max-width:190px;text-align:left}

/* ------------------------------------------------------------ touch screens: top of the screen, input first (above the keyboard) */
.is-touch .chat-panel{left:50%;right:auto;bottom:auto;top:calc(var(--st) + var(--cp-top,0px));transform:translateX(-50%);width:min(560px,calc(100% - var(--sl) - var(--sr)));
  max-height:calc(var(--cp-vh,100vh) - var(--st) - 10px);min-height:0;animation-name:chatInTop}
.is-touch .chat-panel.out{animation-name:chatOutTop}
.is-touch .cp-head{order:1}
.is-touch .cp-form{order:2}
.is-touch .cp-meta,.is-touch .cp-off{order:3}
.is-touch .cp-quick{order:4}
.is-touch .cp-people{order:5}
.is-touch .cp-log{order:6;max-height:32vh}
.is-touch .cp-in{font-size:16px}
@media (max-height:420px){
  .is-touch .chat-panel{gap:5px;padding:6px 8px 7px;border-radius:16px}
  .is-touch .cp-head{min-height:26px}
  .is-touch .cp-title{font-size:17px}
  .is-touch .cp-x{width:30px;height:30px}
  .is-touch .cp-in,.is-touch .cp-send{height:38px;min-height:38px}
  .is-touch .cp-log{max-height:22vh;min-height:44px}
  .is-touch .cp-q{min-height:30px}
}
@media (max-width:420px){
  .cp-title{font-size:18px}
  .cp-send{padding:6px 11px 8px}
  .cp-send .cs-t{display:none}
}

@keyframes chatIn2{from{opacity:0;transform:translateY(16px) scale(.96)}}
@keyframes chatOut2{to{opacity:0;transform:translateY(12px) scale(.97)}}
@keyframes chatInTop{from{opacity:0;transform:translate(-50%,-14px) scale(.97)}}
@keyframes chatOutTop{to{opacity:0;transform:translate(-50%,-10px) scale(.97)}}
@keyframes chatDot{from{transform:scale(.3)}}
@keyframes chatNope{20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
@media (prefers-reduced-motion:reduce){.chat-panel,.chat-panel.out,.cp-l{animation:none}}
`;

export function injectChatStyles() {
  if (typeof document === 'undefined' || document.getElementById('sas-chat')) return;
  const el = document.createElement('style');
  el.id = 'sas-chat';
  el.textContent = css;
  document.head.appendChild(el);
}
