// The UI stylesheet: world labels (BillboardGui-style), HUD, menus, shops, touch controls.
// Roblox-inspired but premium: chunky outlined panels, bold display type, bouncy micro-animations.
// Contract: injectStyles()

import { FONT_FACES, fontsReady } from './fonts.js';

const css = `
:root{
  --ink:#10163a;--ink2:#0a0e28;
  --p1:#2b387a;--p2:#1b2452;--p3:#3a4790;
  --txt2:#c9d3ff;--txt3:#aab4e6;
  --cash:#5dff7e;--gold:#ffd23f;--red:#ff3b5c;--blue:#3d9bff;--green:#3fd65a;
  --fd:'Lilita One','Fredoka','Baloo 2','Arial Rounded MT Bold','Trebuchet MS','Segoe UI Black',system-ui,sans-serif;
  --fb:'Nunito','Nunito Sans','Segoe UI',system-ui,-apple-system,'Helvetica Neue',Roboto,Arial,sans-serif;
  --o1:0 0 2px var(--ink),1.5px 1.5px 0 var(--ink),-1.5px 1.5px 0 var(--ink),1.5px -1.5px 0 var(--ink),-1.5px -1.5px 0 var(--ink),0 2.5px 0 var(--ink);
  --o2:3px 0 0 var(--ink),-3px 0 0 var(--ink),0 3px 0 var(--ink),0 -3px 0 var(--ink),2.2px 2.2px 0 var(--ink),-2.2px 2.2px 0 var(--ink),2.2px -2.2px 0 var(--ink),-2.2px -2.2px 0 var(--ink),0 6px 0 var(--ink),0 9px 12px rgba(0,0,0,.35);
  --rainbow:linear-gradient(90deg,#ff4d6d,#ffb627,#fff04d,#4cd964,#3dd6ff,#6b7bff,#c86bff,#ff4d6d);
  --spring:cubic-bezier(.2,1.5,.4,1);
  --fdw:400;
  --panel:linear-gradient(180deg,rgba(47,60,130,.95),rgba(27,36,82,.95));
  --panel-sh:inset 0 2px 0 rgba(255,255,255,.16),inset 0 -3px 0 rgba(0,0,0,.22),0 5px 0 rgba(10,14,40,.6),0 10px 24px rgba(0,0,0,.22);
}
html.no-webfont{--fdw:800}
html,body{height:100%;margin:0;overflow:hidden;background:#1b2440;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;overscroll-behavior:none}
#app{position:fixed;inset:0;overflow:hidden}
#app > .labels-layer{z-index:1;isolation:isolate}
#app > #ui{z-index:2}
html.menu-screen .labels-layer{visibility:hidden}
#ui [tabindex="-1"]:focus{outline:none}
#game-canvas{display:block;width:100%;height:100%}
#ui{position:absolute;inset:0;pointer-events:none;font-family:var(--fb);color:#fff;-webkit-font-smoothing:antialiased;
  --st:max(10px,env(safe-area-inset-top));--sb:max(10px,env(safe-area-inset-bottom));--sl:max(10px,env(safe-area-inset-left));--sr:max(10px,env(safe-area-inset-right))}
#ui *,#ui *::before,#ui *::after{box-sizing:border-box}
#ui [hidden]{display:none!important}
#ui button{font-family:inherit;-webkit-tap-highlight-color:transparent}
.ico{display:block;width:100%;height:100%;overflow:visible}
.vh{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;opacity:0}

/* ------------------------------------------------------------ avatars */
.ava{--s:32px;position:relative;display:inline-grid;place-items:center;flex:none;width:var(--s);height:var(--s);border-radius:50%;overflow:hidden;
  background:linear-gradient(160deg,rgba(255,255,255,.28),rgba(0,0,0,.18)),var(--c);border:3px solid var(--c);box-shadow:0 0 0 2px var(--ink)}
.ava img{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%;-webkit-user-drag:none}
.ava b{font:var(--fdw) calc(var(--s)*.46)/1 var(--fd);color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.35)}

/* ------------------------------------------------------------ world labels (BillboardGui style) */
.labels-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:var(--fb)}
.lbl{position:absolute;left:0;top:0;transform-origin:50% 100%;white-space:nowrap;text-align:center;color:#fff;font:800 14px/1.1 var(--fb);
  text-shadow:var(--o1);display:flex;flex-direction:column;align-items:center;gap:1px;contain:layout style}
.lbl b{font-weight:900}
.nametag{gap:3px}
.nt-name{font:var(--fdw) 16px/1 var(--fd);letter-spacing:.02em;padding:3px 11px 4px;border-radius:999px;background:linear-gradient(180deg,rgba(255,255,255,.25),rgba(0,0,0,.08)),var(--c,#556);
  border:2.5px solid var(--ink);box-shadow:0 3px 0 rgba(10,14,40,.55);text-shadow:0 2px 0 rgba(0,0,0,.35)}
.nt-rb{color:var(--gold);font-size:13px;margin-left:2px}
.nt-carry{font:800 12px/1 var(--fb);padding:4px 9px 5px;border-radius:999px;background:rgba(16,22,58,.86);border:2px solid var(--ink);text-shadow:0 1px 0 rgba(0,0,0,.6);display:flex;gap:4px;align-items:center}
.nametag.thief .nt-carry{background:linear-gradient(180deg,#ff5a73,#d81f45);animation:thief .45s ease-in-out infinite alternate}
.nametag.thief .nt-carry b{color:#fff!important}
.plantlbl{gap:0}
.plantlbl.compact .pl-inc{font-size:13px;padding:1px 7px;border-radius:99px;background:rgba(16,22,58,.72);border:2px solid var(--rc,#1b2440);animation:none}
.plantlbl.compact .pl-bar{width:40px;height:7px}
.podlbl.compact{transform-origin:50% 100%;opacity:.9}
.pl-name,.pd-name{font:var(--fdw) 17px/1.05 var(--fd);letter-spacing:.01em}
.pd-name{font-size:15px}
.rar{font:900 11px/1 var(--fb);text-transform:uppercase;letter-spacing:.09em;margin-top:2px}
.rar-common{color:#e4e9f2}.rar-uncommon{color:#6dff8a}.rar-rare{color:#6cb8ff}.rar-epic{color:#cf94ff}.rar-legendary{color:#ffc24a}.rar-mythic{color:#ff7089}
.rar-secret{color:transparent;text-shadow:none;padding:3px 7px 3px;border-radius:6px;border:1.5px solid rgba(255,255,255,.35);
  background-image:var(--rainbow),linear-gradient(#050507,#050507);background-size:200% 100%,100% 100%;
  -webkit-background-clip:text,padding-box;background-clip:text,padding-box;animation:rainbowPan 2s linear infinite}
.mut{font:900 12px/1 var(--fb);text-transform:uppercase;letter-spacing:.07em}
.mut-gold{color:#ffd23f}
.mut-diamond{color:#9ff0ff}
.mut-rainbow{color:transparent;text-shadow:none;background-image:var(--rainbow);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;
  filter:drop-shadow(1px 0 0 var(--ink)) drop-shadow(-1px 0 0 var(--ink)) drop-shadow(0 1.5px 0 var(--ink)) drop-shadow(0 -1px 0 var(--ink));animation:rainbowPan 2s linear infinite}
.pl-inc{font:var(--fdw) 17px/1.1 var(--fd);color:var(--cash);margin-top:1px}
.plantlbl.grown .pl-inc{animation:incPulse 1.6s ease-in-out infinite}
.pl-bar{width:62px;height:9px;border-radius:99px;background:rgba(16,22,58,.8);border:2px solid var(--ink);overflow:hidden;margin-top:3px}
.pl-bar i{display:block;height:100%;background:linear-gradient(90deg,#3fd65a,#b4ff5e);border-radius:99px}
.pl-time{font:800 11px/1.2 var(--fb);color:var(--txt2)}
.pl-steal{margin-top:3px;font:900 11px/1 var(--fb);letter-spacing:.06em;padding:4px 8px;border-radius:99px;background:var(--red);border:2px solid var(--ink);text-shadow:none;animation:flash .3s steps(2) infinite}
.ic-lock{display:inline-block;width:.85em;height:1em;margin-right:4px;vertical-align:-.1em;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 24'%3E%3Cpath d='M5 11V7.5a5 5 0 0 1 10 0V11' fill='none' stroke='%2310163a' stroke-width='5'/%3E%3Cpath d='M5 11V7.5a5 5 0 0 1 10 0V11' fill='none' stroke='%23ffd23f' stroke-width='2.4'/%3E%3Crect x='1.5' y='10' width='17' height='12.5' rx='3' fill='%23ffd23f' stroke='%2310163a' stroke-width='2'/%3E%3C/svg%3E") center/contain no-repeat}
.pl-lock{font:800 13px/1 var(--fb);color:var(--gold);padding:5px 10px;border-radius:10px;background:rgba(16,22,58,.85);border:2px solid var(--ink)}
.padlbl{gap:3px}
.cp-amt{font:var(--fdw) 24px/1 var(--fd);color:var(--cash)}
.cp-lbl{font:900 11px/1 var(--fb);letter-spacing:.16em;padding:4px 8px 4px 10px;border-radius:7px;background:#1f9c46;border:2px solid var(--ink);text-shadow:0 1px 0 rgba(0,0,0,.35)}
.padlbl.collect:not(.mine) .cp-amt{font-size:17px;color:#b8f5c6}
.padlbl.collect:not(.mine) .cp-lbl{background:#4a5383}
.padlbl.collect.mine .cp-lbl{animation:bob 1.4s ease-in-out infinite}
.lk{font:var(--fdw) 15px/1 var(--fd);letter-spacing:.04em;padding:5px 11px 6px;border-radius:10px;background:#4a5383;border:2.5px solid var(--ink);text-shadow:0 2px 0 rgba(0,0,0,.35)}
.padlbl.lock.ready .lk{background:linear-gradient(180deg,#56b4ff,#2a73e8)}
.padlbl.lock.on .lk{background:linear-gradient(180deg,#ff5a73,#d81f45);box-shadow:0 0 14px rgba(255,59,92,.8)}
.podlbl{gap:0}
.monlbl{text-shadow:none}
.mo-alert{font:var(--fdw) 38px/1 var(--fd);color:#ff3b5c;-webkit-text-stroke:0;text-shadow:3px 0 0 #fff,-3px 0 0 #fff,0 3px 0 #fff,0 -3px 0 #fff,2px 2px 0 #fff,-2px 2px 0 #fff,2px -2px 0 #fff,-2px -2px 0 #fff,0 5px 0 var(--ink);animation:alertBounce .5s ease-in-out infinite alternate}
.lbl.bubble{text-shadow:none}
.bb{position:relative;max-width:150px;white-space:normal;background:#fff;color:#1b2452;font:800 12.5px/1.22 var(--fb);padding:6px 10px 7px;border-radius:14px;border:2.5px solid var(--ink);box-shadow:0 3px 0 rgba(10,14,40,.45);margin-bottom:9px;animation:bubbleIn .3s var(--spring) both;text-align:center}
.bb::after{content:'';position:absolute;left:50%;bottom:-8px;width:12px;height:12px;background:#fff;border-right:2.5px solid var(--ink);border-bottom:2.5px solid var(--ink);transform:translateX(-50%) rotate(45deg)}

/* ------------------------------------------------------------ buttons */
.btn{--b1:#6e78a8;--b2:#4a5383;position:relative;display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:48px;padding:11px 20px 13px;
  font:var(--fdw) 19px/1 var(--fd);letter-spacing:.02em;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.35);border:3px solid var(--ink);border-radius:16px;
  background:linear-gradient(180deg,var(--b1),var(--b2));box-shadow:inset 0 3px 0 rgba(255,255,255,.3),inset 0 -4px 0 rgba(0,0,0,.16),0 5px 0 var(--ink);
  cursor:pointer;pointer-events:auto;user-select:none;transition:transform .14s var(--spring),filter .14s,box-shadow .14s;text-decoration:none}
.btn:hover{transform:translateY(-2px);filter:brightness(1.08);box-shadow:inset 0 3px 0 rgba(255,255,255,.3),inset 0 -4px 0 rgba(0,0,0,.16),0 7px 0 var(--ink)}
.btn:active{transform:translateY(4px);box-shadow:inset 0 3px 0 rgba(255,255,255,.3),inset 0 -2px 0 rgba(0,0,0,.16),0 1px 0 var(--ink);transition-duration:.05s}
.btn:focus-visible,.cast-card:focus-visible,.pick:focus-visible,.mode-card:focus-visible,.slot:focus-visible,.hbtn:focus-visible,.switch:focus-visible,.link:focus-visible,.tut-skip:focus-visible,.modal-x:focus-visible,.pb-upload:focus-within{outline:4px solid #fff;outline-offset:3px}
.btn[disabled]{filter:grayscale(.75) brightness(.78);cursor:not-allowed;transform:none;box-shadow:inset 0 3px 0 rgba(255,255,255,.2),0 5px 0 var(--ink)}
.btn-green{--b1:#63f27f;--b2:#1fb043}
.btn-blue{--b1:#5cb8ff;--b2:#2a6fe6}
.btn-red{--b1:#ff6b80;--b2:#dc2548}
.btn-gold{--b1:#ffe463;--b2:#ffa600;color:#4a2600;text-shadow:0 1px 0 rgba(255,255,255,.45)}
.btn-grey{--b1:#7a84b6;--b2:#4f5889}
.btn-ghost{--b1:rgba(52,64,138,.9);--b2:rgba(26,34,82,.9);box-shadow:inset 0 2px 0 rgba(255,255,255,.18),0 4px 0 var(--ink)}
.btn-xl{font-size:32px;min-height:70px;padding:15px 44px 18px;border-radius:22px;box-shadow:inset 0 4px 0 rgba(255,255,255,.3),inset 0 -5px 0 rgba(0,0,0,.16),0 7px 0 var(--ink)}
.btn-lg{font-size:23px;min-height:58px;padding:13px 28px 15px;border-radius:19px}
.btn-sm{font-size:15px;min-height:40px;padding:8px 14px 10px;border-radius:13px;gap:6px}
.btn-round{width:48px;height:48px;min-height:0;padding:0;border-radius:50%}
.btn small{font:900 13px/1 var(--fb);opacity:.95;letter-spacing:0}
.btn .bi{width:1.05em;height:1.05em;display:grid;place-items:center}
.bi{display:inline-grid;place-items:center;width:1.1em;height:1.1em;flex:none}
.btn.nope{animation:nope .35s}

/* ------------------------------------------------------------ panels shared */
.panel,.stats,.board,.tut{background:var(--panel);border:3px solid var(--ink);border-radius:18px;box-shadow:var(--panel-sh)}

/* ------------------------------------------------------------ HUD layout */
.hud{position:absolute;inset:0;pointer-events:none;z-index:2;transition:opacity .3s}
.hud[data-state=ended]{opacity:0}
/* intro camera swoop: the HUD waits, then fades in as the camera lands */
.hud-tl,.hud-tr,.hud-bottom,.meter,.keyhints,.chat{transition:opacity .4s ease-out,visibility 0s}
.hud.intro .hud-tl,.hud.intro .hud-tr,.hud.intro .hud-bottom,.hud.intro .meter,.hud.intro .keyhints,.hud.intro .chat{opacity:0;visibility:hidden;transition:none}
.hud[data-state=paused] .prompt,.hud[data-state=shop] .prompt,.hud[data-state=paused] .carry,.hud[data-state=shop] .carry{display:none}
.hud-tl{position:absolute;left:var(--sl);top:var(--st);width:262px;display:flex;flex-direction:column;align-items:flex-start;gap:10px}
.hud-tr{position:absolute;right:var(--sr);top:var(--st)}
.hud-top{position:absolute;left:50%;top:var(--st);transform:translateX(-50%);width:min(500px,calc(100% - 600px));display:flex;flex-direction:column;align-items:center;gap:8px}
.hud-bottom{position:absolute;left:50%;bottom:var(--sb);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;width:min(560px,calc(100% - 20px))}
.vignette{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .35s;box-shadow:inset 0 0 90px 24px rgba(255,30,60,.6)}
.vignette.on{opacity:1;animation:vig .7s ease-in-out infinite alternate}

.hud-btns{display:flex;gap:8px}
.hbtn{width:46px;height:46px;padding:0;border-radius:14px;border:3px solid var(--ink);color:#fff;display:grid;place-items:center;cursor:pointer;pointer-events:auto;
  background:linear-gradient(180deg,#44529e,#26306a);box-shadow:inset 0 2px 0 rgba(255,255,255,.22),0 4px 0 var(--ink);transition:transform .12s var(--spring)}
.hbtn svg{width:22px;height:22px}
.hbtn:hover{transform:translateY(-2px)}
.hbtn:active{transform:translateY(3px);box-shadow:inset 0 2px 0 rgba(255,255,255,.22),0 1px 0 var(--ink)}
.hbtn.off{color:#ff8a9c}

/* stats */
.stats{position:relative;padding:8px 14px 9px 9px;min-width:200px;display:flex;flex-direction:column;gap:3px}
.st-cash{display:flex;align-items:center;gap:8px;position:relative}
.st-cash.bump .st-val{animation:cashBump .35s var(--spring)}
.st-coin{width:34px;height:34px;flex:none;filter:drop-shadow(0 2px 0 rgba(0,0,0,.35))}
.st-val{font:var(--fdw) 34px/1 var(--fd);color:var(--cash);text-shadow:var(--o1),0 4px 0 var(--ink);letter-spacing:.01em;font-variant-numeric:tabular-nums;display:inline-block;transform-origin:0 60%}
.st-sub{display:flex;flex-direction:column;gap:5px;padding-left:42px;margin-top:-2px}
.st-inc{font:900 13px/1 var(--fb);color:#b8ffc6}
.st-chips{display:flex;gap:5px;flex-wrap:wrap;margin-left:-42px}
.chip{display:inline-flex;align-items:center;gap:5px;font:900 12.5px/1 var(--fb);background:rgba(10,15,40,.5);border-radius:999px;padding:4px 9px 4px 5px;white-space:nowrap}
.chip svg{width:16px;height:16px;flex:none}
.chip em{font-style:normal;font-weight:700;color:var(--txt2)}
.ch-speed{color:#ffe066}
.ch-speed.boost{color:#fff;background:linear-gradient(90deg,#ff4d6d,#ff9f1c);animation:pulse .5s ease-in-out infinite alternate}
.ch-stars{color:var(--gold)}
.ch-fx{color:#e6dcff;background:rgba(138,92,255,.45)}
.st-pops{position:relative;width:0;height:0;align-self:center;pointer-events:none}
.st-pop{position:absolute;left:4px;top:-14px;white-space:nowrap;font:var(--fdw) 22px/1 var(--fd);color:var(--cash);text-shadow:var(--o1);animation:popUp 1.2s ease-out forwards}
.st-pop.down{color:#ff8a9c;animation-name:popDown}

/* leaderboard */
.board{width:244px;padding:6px 6px 7px;--rowh:37px}
.board-head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:1px 4px 6px 6px}
.bh-title{display:flex;align-items:center;gap:6px;font:var(--fdw) 15px/1 var(--fd);letter-spacing:.06em;text-transform:uppercase;color:var(--txt2)}
.bh-title svg{width:18px;height:18px}
.bh-timer{display:flex;align-items:center;gap:5px;font:var(--fdw) 21px/1 var(--fd);background:rgba(10,15,40,.55);padding:4px 9px 5px 7px;border-radius:10px;font-variant-numeric:tabular-nums}
.bh-timer svg{width:17px;height:17px}
.board.showdown .bh-timer{flex:none}
@media (max-width:640px),(max-height:500px){.board.showdown .bh-title span{display:none}}
.bh-timer.urgent{color:#ff8a9c;animation:pulse .5s ease-in-out infinite alternate}
.board-rows{position:relative;height:calc(var(--rowh)*4)}
.brow{position:absolute;left:0;right:0;top:calc(var(--i,0)*var(--rowh));height:calc(var(--rowh) - 4px);display:flex;align-items:center;gap:7px;padding:0 9px 0 5px;border-radius:12px;
  background:rgba(10,15,40,.38);transition:top .5s var(--spring)}
.brow.me{background:linear-gradient(90deg,rgba(255,255,255,.22),rgba(255,255,255,.08));box-shadow:inset 0 0 0 2.5px var(--c)}
.br-rank{width:16px;text-align:center;font:var(--fdw) 16px/1 var(--fd);color:var(--txt3)}
.brow.first .br-rank{color:var(--gold)}
.br-ava{--s:27px;border-width:2px}
.br-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:var(--fdw) 16px/1 var(--fd);color:var(--c);color:color-mix(in srgb,var(--c) 62%,#fff);text-shadow:var(--o1)}
.br-star{display:flex;align-items:center;gap:1px;font:900 11px/1 var(--fb);color:var(--gold)}
.br-star svg{width:13px;height:13px}
.br-flag{display:none;width:10px;height:10px;border-radius:50%;background:var(--red);border:2px solid var(--ink)}
.br-flag.on{display:block;animation:pulse .4s infinite alternate}
.br-val{font:900 14px/1 var(--fb);color:var(--cash);font-variant-numeric:tabular-nums;text-shadow:0 1px 0 rgba(0,0,0,.5)}

/* event chip */
.evchip{position:relative;display:flex;align-items:center;gap:10px;padding:6px 16px 11px 8px;border-radius:16px;border:3px solid var(--ink);overflow:hidden;
  background:linear-gradient(180deg,var(--e1),var(--e2));box-shadow:inset 0 2px 0 rgba(255,255,255,.3),0 4px 0 rgba(10,14,40,.6);animation:alertIn .5s var(--spring) both;max-width:100%}
.ev-golden{--e1:#ffcf4a;--e2:#f0851c}
.ev-diamond{--e1:#4057d6;--e2:#1b2270}
.ev-rainbow{--e1:#ff6fb1;--e2:#7a5cff}
.evchip.ev-rainbow::before,.ht-ev.ev-rainbow::before{content:'';position:absolute;inset:0;background:var(--rainbow);background-size:200% 100%;opacity:.35;animation:rainbowPan 3s linear infinite}
.ev-ic{position:relative;width:36px;height:36px;flex:none;animation:spinSlow 8s linear infinite}
.ev-copy{position:relative;display:flex;flex-direction:column;gap:2px;min-width:0}
.ev-name{font:var(--fdw) 20px/1 var(--fd);text-shadow:var(--o1);letter-spacing:.02em}
.ev-desc{font:900 12px/1.1 var(--fb);text-shadow:0 1px 0 rgba(0,0,0,.4)}
.ev-time{position:relative;margin-left:auto;padding-left:8px;font:var(--fdw) 23px/1 var(--fd);text-shadow:var(--o1);font-variant-numeric:tabular-nums}
.ev-bar{position:absolute;left:0;right:0;bottom:0;height:5px;background:rgba(0,0,0,.35)}
.ev-bar i{display:block;height:100%;background:#fff;transform-origin:0 50%}

/* alerts */
.alerts{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%}
.alert{--a1:#4d6bd6;--a2:#2c3f9c;display:flex;align-items:center;gap:10px;max-width:100%;padding:7px 16px 8px 7px;border-radius:18px;border:3px solid var(--ink);
  background:linear-gradient(180deg,var(--a1),var(--a2));box-shadow:inset 0 2px 0 rgba(255,255,255,.28),0 5px 0 rgba(10,14,40,.6);
  font:900 16px/1.2 var(--fb);text-shadow:0 2px 0 rgba(0,0,0,.3);animation:alertIn .45s var(--spring) both}
.alert.out{animation:alertOut .3s ease-in forwards}
.alert.bump{animation:alertBump .35s var(--spring)}
.a-danger{--a1:#ff5a73;--a2:#d01c42}
.a-warn{--a1:#ffb84d;--a2:#ec7414}
.a-good{--a1:#56de75;--a2:#1a9a3f}
.a-gold{--a1:#ffd84a;--a2:#f39500}
.alert.urgent{animation:alertIn .45s var(--spring) both,urgent .45s .45s ease-in-out infinite alternate}
.alert.shake{animation:alertIn .45s var(--spring) both,shake .4s .45s 2}
.a-body{min-width:0}
.a-body small{display:block;font:800 13px/1.25 var(--fb);opacity:.95;margin-top:2px}
.a-ava{--s:44px;border-width:3px}
.a-ic{width:40px;height:40px;flex:none;display:grid;place-items:center;border-radius:50%;background:rgba(10,15,40,.3)}
.a-ic svg{width:28px;height:28px}
.a-ic svg.item{width:36px;height:36px}
.alert .who{display:inline-block;padding:0 7px 1px;border-radius:8px;background:var(--c);border:2px solid var(--ink);color:#fff;font:var(--fdw) 16px/1.2 var(--fd);letter-spacing:.02em}
.alert .pn{display:inline-block;padding:0 6px 1px;border-radius:7px;background:rgba(10,15,40,.6);color:var(--rc,#fff);color:color-mix(in srgb,var(--rc,#fff) 75%,#fff);font:var(--fdw) 16px/1.2 var(--fd);letter-spacing:.01em}
.alert .cash,.alert b.cash{color:var(--cash);background:rgba(10,15,40,.55);padding:0 6px;border-radius:7px}
.alert.toast{padding:4px 14px 5px 5px;font-size:14px;border-radius:999px;background:rgba(16,22,58,.92);box-shadow:inset 0 0 0 2px var(--a2),0 3px 0 rgba(10,14,40,.6)}
.alert.toast .a-ic{width:30px;height:30px;background:var(--a2)}
.alert.toast .a-ic svg{width:20px;height:20px}
.alert.toast .a-ic svg.item{width:26px;height:26px}
.alert.toast .a-ava{--s:30px}
.alert.toast small{font-size:12px}
.alert.toast .who,.alert.toast .pn{font-size:14px}

/* centre-screen moments: rarity reveal + announcements */
.center-moment{position:absolute;left:50%;top:47%;width:0;height:0;display:grid;place-items:center;pointer-events:none;z-index:4}
.reveal,.announce{position:absolute;display:grid;place-items:center;text-align:center}
.reveal{width:min(460px,92vw);animation:revealIn .6s var(--spring) both}
.reveal.out,.announce.out{animation:momentOut .4s ease-in forwards}
.rv-rays{position:absolute;width:440px;height:440px;border-radius:50%;background:repeating-conic-gradient(from 0deg,var(--rc) 0 9deg,transparent 9deg 22deg);
  -webkit-mask:radial-gradient(circle,#000 18%,transparent 66%);mask:radial-gradient(circle,#000 18%,transparent 66%);opacity:.5;animation:spin 7s linear infinite}
.rv-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:min(270px,100%);max-width:100%;padding:14px 26px 16px;border-radius:24px;border:4px solid var(--ink);
  background:linear-gradient(180deg,var(--r1),var(--r2));box-shadow:inset 0 3px 0 rgba(255,255,255,.35),0 7px 0 var(--ink),0 0 50px var(--rc)}
.rv-kicker{font:var(--fdw) 38px/1 var(--fd);letter-spacing:.03em;text-shadow:var(--o2)}
.rv-name{font:var(--fdw) 23px/1.05 var(--fd);text-shadow:var(--o1)}
.rv-mut{font-size:15px;margin:2px 0}
.rv-sub{font:800 14px/1.3 var(--fb);margin-top:5px;text-shadow:0 1px 0 rgba(0,0,0,.5)}
.rv-sub .cash{color:var(--cash);background:rgba(10,15,40,.5);padding:0 5px;border-radius:6px}
.reveal{--rc:#3d9bff;--r1:#5cb0ff;--r2:#2266d6}
.r-common,.r-uncommon{--rc:#4cd964;--r1:#5ee07a;--r2:#1a9a3f}
.r-epic{--rc:#b36bff;--r1:#c890ff;--r2:#7433d4}
.r-legendary{--rc:#ffb627;--r1:#ffd45c;--r2:#ee8200}
.r-mythic{--rc:#ff4d6d;--r1:#ff7a90;--r2:#d11c43}
.r-secret{--rc:#fff;--r1:#1a1a22;--r2:#000}
.r-secret .rv-kicker{color:transparent;text-shadow:none;background:var(--rainbow);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;animation:rainbowPan 1.5s linear infinite;
  filter:drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff)}
.r-secret .rv-rays{background:repeating-conic-gradient(#ff4d6d 0 8deg,#ffb627 8deg 16deg,#4cd964 16deg 24deg,#3d9bff 24deg 32deg,#b36bff 32deg 40deg,transparent 40deg 52deg);opacity:.65}
.m-gold .rv-card{box-shadow:inset 0 3px 0 rgba(255,255,255,.35),0 7px 0 var(--ink),0 0 50px #ffd23f}
.m-diamond .rv-card{box-shadow:inset 0 3px 0 rgba(255,255,255,.35),0 7px 0 var(--ink),0 0 50px #7ee8ff}
.m-rainbow .rv-card{box-shadow:inset 0 3px 0 rgba(255,255,255,.35),0 7px 0 var(--ink),0 0 50px #ff6fb1,0 0 90px #6b7bff}
.announce{animation:annIn .7s var(--spring) both;gap:6px;width:92vw}
.an-ic{width:78px;height:78px;filter:drop-shadow(0 5px 0 rgba(10,14,40,.5))}
.an-ic svg{animation:spinSlow 6s linear infinite}
.an-title{font:var(--fdw) clamp(40px,9vw,72px)/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o2)}
.an-sub{display:inline-block;font:900 18px/1.2 var(--fb);background:rgba(16,22,58,.88);padding:7px 16px 8px;border-radius:999px;border:3px solid var(--ink)}
.an-ev.ev-golden .an-title,.an-rebirth .an-title{color:#ffd23f}
.an-ev.ev-diamond .an-title{color:#aef3ff}
.an-ev.ev-rainbow .an-title{color:transparent;text-shadow:none;background:var(--rainbow);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;animation:rainbowPan 2s linear infinite;
  filter:drop-shadow(3px 0 0 var(--ink)) drop-shadow(-3px 0 0 var(--ink)) drop-shadow(0 3px 0 var(--ink)) drop-shadow(0 -3px 0 var(--ink)) drop-shadow(0 5px 0 var(--ink))}
.an-rebirth .an-ic{color:#ffd23f}
.an-warn .an-title{color:#ff8a9c}
.an-warn .an-ic{color:#fff}
.an-count .an-title{font-size:clamp(90px,18vw,150px);color:#ff6b80}
.an-count{animation:countIn .9s ease-out both}

/* proximity prompt */
.prompt{display:flex;align-items:center;gap:10px;max-width:100%;padding:6px 18px 6px 6px;border-radius:999px;background:rgba(16,22,58,.9);border:3px solid var(--ink);
  box-shadow:0 4px 0 rgba(10,14,40,.6),inset 0 0 0 2px rgba(255,255,255,.07);opacity:0;visibility:hidden;transform:translateY(10px) scale(.9);transition:opacity .12s,transform .2s var(--spring),visibility 0s .15s}
.prompt.show{opacity:1;visibility:visible;transform:none;transition:opacity .12s,transform .2s var(--spring)}
.prompt.in{animation:promptIn .28s var(--spring)}
.pp-key{position:relative;width:52px;height:52px;flex:none;display:grid;place-items:center}
.pp-ring{position:absolute;inset:0}
.pp-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.pp-ring circle{fill:none;stroke-width:5}
.pp-ring .bg{stroke:rgba(255,255,255,.18)}
.pp-ring .fg{stroke:var(--rc);stroke-linecap:round}
.pp-k{width:36px;height:36px;border-radius:50%;background:#fff;color:var(--ink);font:var(--fdw) 21px/37px var(--fd);text-align:center;box-shadow:0 3px 0 rgba(0,0,0,.35)}
.pp-k:empty{display:none}
.prompt.tp .pp-k{display:none}
.prompt.tp .pp-key{width:40px;height:40px}
.pp-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
.pp-top{display:flex;align-items:center;gap:7px}
.pp-verb{font:var(--fdw) 23px/1 var(--fd);letter-spacing:.02em;text-shadow:0 2px 0 rgba(0,0,0,.4)}
.prompt.steal .pp-verb{color:#ff8a9c}
.prompt.steal{box-shadow:0 4px 0 rgba(10,14,40,.6),inset 0 0 0 2px rgba(255,59,92,.6)}
.pp-how{font:900 10px/1 var(--fb);letter-spacing:.14em;color:var(--txt2);background:rgba(255,255,255,.14);padding:3px 6px;border-radius:6px}
.pp-how:empty{display:none}
.prompt.holding .pp-how{background:var(--rc);color:var(--ink)}
.pp-label{font:900 14px/1.15 var(--fb);color:var(--rc);color:color-mix(in srgb,var(--rc) 80%,#fff);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prompt.secret .pp-label{color:transparent;background:var(--rainbow);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;animation:rainbowPan 2s linear infinite}

/* carry pill + thief tracker */
.carry{display:none;align-items:center;gap:10px;max-width:100%;padding:6px 18px 6px 6px;border-radius:999px;background:rgba(16,22,58,.92);border:3px solid var(--ink);box-shadow:0 4px 0 rgba(10,14,40,.6)}
.carry.show{display:flex;animation:promptIn .3s var(--spring)}
.cp-arrow{width:46px;height:46px;flex:none;border-radius:50%;display:grid;place-items:center;background:linear-gradient(180deg,#63f27f,#1fb043);border:3px solid var(--ink);color:#fff;box-shadow:inset 0 2px 0 rgba(255,255,255,.35)}
.cp-arrow svg{width:26px;height:26px}
.cp-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
.cp-l1{font:900 14px/1.15 var(--fb);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-l1 b{font:var(--fdw) 18px/1 var(--fd);color:var(--rc,#fff);color:color-mix(in srgb,var(--rc,#fff) 78%,#fff);letter-spacing:.01em}
.cp-l2{font:var(--fdw) 17px/1 var(--fd);color:#ffe066;letter-spacing:.03em;white-space:nowrap}
.cp-l2 em{font:900 12px/1 var(--fb);color:var(--txt2);font-style:normal;margin-left:5px;letter-spacing:0}
.carry.stolen{background:linear-gradient(180deg,rgba(150,20,52,.94),rgba(100,10,36,.94))}
.carry.full{padding-left:16px;background:linear-gradient(180deg,rgba(236,116,20,.95),rgba(170,70,8,.95))}
.carry.full .cp-arrow{display:none}
.carry.full .cp-l2{white-space:normal;color:#fff;font-size:16px;line-height:1.1}
.carry.stolen .cp-l1{color:#ffc2cc}
.carry.tracker{background:linear-gradient(180deg,rgba(220,37,72,.95),rgba(150,16,48,.95));animation:promptIn .3s var(--spring),urgent .45s .3s ease-in-out infinite alternate}
.carry.tracker .cp-arrow{background:linear-gradient(180deg,#fff,#ffd6dd);color:var(--red)}
.carry.tracker .cp-l1{font:var(--fdw) 18px/1 var(--fd);letter-spacing:.02em}
.carry.tracker .who{display:inline-block;padding:0 6px;border-radius:7px;background:var(--c);border:2px solid var(--ink)}
.carry.tracker .cp-l2{font:900 13px/1.15 var(--fb);color:#fff}

/* hotbar */
.hotbar{display:flex;gap:7px;padding:6px;border-radius:19px;background:rgba(16,22,58,.55);border:3px solid rgba(10,14,40,.55);pointer-events:auto}
.slot{--sz:60px;position:relative;width:var(--sz);height:var(--sz);padding:0;display:grid;place-items:center;border-radius:14px;border:3px solid var(--ink);cursor:pointer;
  background:linear-gradient(180deg,#3d4a94,#252f69);box-shadow:inset 0 2px 0 rgba(255,255,255,.2),0 4px 0 var(--ink);transition:transform .16s var(--spring),box-shadow .16s}
.slot:hover{transform:translateY(-3px)}
.slot.sel{background:linear-gradient(180deg,#5566c8,#2f3c8f);border-color:#fff;transform:translateY(-6px);box-shadow:0 0 0 3px var(--ink),0 0 18px rgba(255,210,63,.85),0 4px 0 var(--ink)}
.slot.press{animation:slotPress .28s var(--spring)}
.hb-ic{width:44px;height:44px;filter:drop-shadow(0 2px 0 rgba(0,0,0,.28));transition:opacity .2s,filter .2s}
.slot.empty .hb-ic{opacity:.38;filter:grayscale(1)}
.hb-k{position:absolute;left:5px;top:3px;font:var(--fdw) 13px/1 var(--fd);color:var(--txt2);text-shadow:0 1px 0 rgba(0,0,0,.5)}
.hb-n{position:absolute;right:-5px;bottom:-5px;min-width:22px;padding:3px 5px 4px;border-radius:9px;background:var(--ink);font:var(--fdw) 14px/1 var(--fd);text-align:center;box-shadow:0 0 0 2px rgba(255,255,255,.2)}
.slot.empty .hb-n{color:#ff9aab;background:#3a1022}
.hb-timer{position:absolute;left:6px;right:6px;bottom:4px;height:4px;border-radius:2px;background:var(--cash);transform-origin:0 50%;transform:scaleX(0)}
.slot.active{box-shadow:0 0 0 3px var(--ink),0 0 16px rgba(93,255,126,.9),0 4px 0 var(--ink)}
.hb-tip{max-width:100%;font:800 13px/1.25 var(--fb);color:var(--txt2);background:rgba(16,22,58,.9);padding:6px 12px;border-radius:12px;border:2px solid var(--ink);text-align:center;opacity:0;transform:translateY(6px);transition:opacity .2s,transform .2s;pointer-events:none}
.hb-tip b{color:#fff;font:var(--fdw) 15px/1 var(--fd);letter-spacing:.02em;margin-right:4px}
.hb-tip.show{opacity:1;transform:none}

/* road meter */
.meter{position:absolute;right:var(--sr);top:calc(var(--st) + 222px);bottom:calc(var(--sb) + 150px);max-height:340px;width:48px;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none}
.m-top,.m-home{width:28px;height:28px;flex:none;border-radius:50%;display:grid;place-items:center;background:rgba(16,22,58,.9);border:2.5px solid var(--ink);color:var(--gold);padding:5px}
.m-home{color:#7dffa0}
.m-lane{position:relative;flex:1;width:100%}
.m-track{position:absolute;left:50%;top:0;bottom:0;width:14px;transform:translateX(-50%);border-radius:9px;overflow:hidden;border:2.5px solid var(--ink);display:flex;flex-direction:column;box-shadow:0 3px 0 rgba(10,14,40,.5)}
.m-seg{position:relative;flex:1;background:var(--bg);box-shadow:inset 0 -1.5px 0 rgba(0,0,0,.4)}
.m-seg::after{content:'';position:absolute;right:0;top:0;bottom:0;width:4px;background:var(--rc)}
.m-seg.cur{filter:brightness(1.4) saturate(1.2)}
.m-mk{position:absolute;left:50%;bottom:calc(var(--f,0)*100%);transform:translate(calc(-50% + (var(--k,0) - 1.5)*4px),50%);z-index:1}
.m-mk.home{bottom:-18px}
.m-mk.hide{opacity:0}
.m-ava{--s:21px;border-width:2px}
.m-mk.me{z-index:3}
.m-mk.me .m-ava{--s:30px;border-width:3px;box-shadow:0 0 0 2px var(--ink),0 0 12px 3px rgba(255,255,255,.75)}
.m-where{position:absolute;right:calc(100% + 8px);top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:flex-end;white-space:nowrap;
  font:var(--fdw) 14px/1.05 var(--fd);text-shadow:var(--o1);letter-spacing:.02em}
.m-where em{font:900 10px/1.2 var(--fb);font-style:normal;text-transform:uppercase;letter-spacing:.08em}

/* chat */
.chat{position:absolute;left:var(--sl);bottom:var(--sb);width:min(360px,30vw);display:flex;flex-direction:column;align-items:flex-start;gap:3px;pointer-events:none}
.cl{max-width:100%;font:700 13.5px/1.25 var(--fb);background:rgba(10,15,40,.55);padding:4px 10px 5px;border-radius:10px;text-shadow:0 1px 0 rgba(0,0,0,.6);animation:chatIn .25s var(--spring) both,chatOut .8s 8s forwards}
.cl b{font-weight:900;color:var(--c);color:color-mix(in srgb,var(--c) 62%,#fff)}

/* key hints */
.keyhints{position:absolute;right:var(--sr);bottom:var(--sb);padding:9px 34px 9px 11px;border-radius:14px;background:rgba(10,15,40,.6);pointer-events:auto}
.kh-body{display:grid;grid-template-columns:auto auto;gap:5px 16px}
.kh-row{display:flex;align-items:center;gap:6px;font:800 12px/1 var(--fb);color:#dfe5ff;white-space:nowrap}
.kh-k{display:flex;gap:2px;align-items:center}
kbd{display:inline-block;font:900 11px/1 var(--fb);color:var(--ink);background:#fff;border-radius:6px;padding:3px 6px 4px;box-shadow:0 2px 0 #8f9acb;min-width:18px;text-align:center}
.kh-x{position:absolute;right:6px;top:6px;width:24px;height:24px;padding:4px;border-radius:8px;border:0;background:rgba(255,255,255,.12);color:#fff;cursor:pointer}
.kh-x:focus-visible{outline:3px solid #fff}
.is-touch .keyhints{display:none}

/* tutorial */
.tut{width:272px;padding:8px 10px 10px;pointer-events:none}
.tut.gone,.tut.hidden,.tut.wait{display:none}
.tut.pop{animation:tutPop .55s var(--spring)}
.tut.complete{background:linear-gradient(180deg,rgba(63,214,90,.96),rgba(26,154,63,.96))}
.tut-head{display:flex;align-items:center;gap:6px}
.tut-kicker{flex:1;display:flex;align-items:center;gap:4px;font:900 11px/1 var(--fb);letter-spacing:.1em;text-transform:uppercase;color:#9ff0b0}
.tut-kicker svg{width:15px;height:15px}
.tut-count{font:900 12px/1 var(--fb);color:var(--txt2)}
.tut-skip{pointer-events:auto;font:900 11px/1 var(--fb);color:var(--txt2);background:rgba(255,255,255,.12);border:0;border-radius:8px;padding:5px 8px;cursor:pointer}
.tut-skip:hover{background:rgba(255,255,255,.22);color:#fff}
.tut-now{display:flex;align-items:center;gap:9px;margin-top:7px;padding:8px 9px;border-radius:12px;background:rgba(255,255,255,.1)}
.tut-nav{display:none;flex-direction:column;align-items:center;gap:3px;flex:none}
.tut.has-arrow .tut-nav{display:flex}
.tut-arrow{display:grid;width:34px;height:34px;place-items:center;border-radius:50%;background:var(--gold);color:#fff;border:2.5px solid var(--ink);padding:5px}
.tut-copy{flex:1;min-width:0}
.tut-copy b{display:block;font:var(--fdw) 16px/1.1 var(--fd);letter-spacing:.02em}
.tut-text{display:block;font:700 12.5px/1.3 var(--fb);color:#e2e7ff;margin-top:2px}
.tut-dist{font:900 9.5px/1 var(--fb);color:#ffe066;white-space:nowrap}
.tut-list{list-style:none;margin:8px 0 0;padding:0 2px;display:grid;gap:4px}
.tut-step{display:flex;align-items:center;gap:7px;font:800 12.5px/1.1 var(--fb);color:var(--txt3)}
.tut-box{width:17px;height:17px;flex:none;border-radius:5px;border:2px solid #5a67a8;display:grid;place-items:center;padding:1px;color:#fff}
.tut-box svg{display:none!important}
.tut-step.done{color:#7dffa0}
.tut-step.done .tut-box{background:var(--green);border-color:var(--ink)}
.tut-step.done .tut-box svg{display:block!important}
.tut-step.cur{color:#fff}
.tut-step.cur .tut-box{border-color:var(--gold);box-shadow:0 0 0 2px rgba(255,210,63,.35)}
.tut-n{display:none}

/* next goal chip (after the tutorial) */
.nextgoal{position:relative;display:flex;align-items:center;gap:8px;max-width:272px;padding:7px 12px 10px 7px;border-radius:16px;border:3px solid var(--ink);overflow:hidden;
  background:var(--panel);box-shadow:var(--panel-sh);pointer-events:none}
.nextgoal.in{animation:tutPop .55s var(--spring)}
.ng-ic{width:30px;height:30px;flex:none;display:grid;place-items:center;border-radius:50%;background:rgba(255,210,63,.18);color:var(--gold);padding:5px}
.ng-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
.ng-k{font:900 10px/1 var(--fb);letter-spacing:.14em;text-transform:uppercase;color:#9ff0b0}
.ng-l1{display:flex;align-items:center;gap:5px;font:var(--fdw) 16px/1 var(--fd);letter-spacing:.02em;color:#ffe066;white-space:nowrap}
.ng-l1 svg{width:16px;height:16px;flex:none}
.ng-l1 b.cash{color:var(--cash);margin-left:3px}
.ng-l2{font:800 12px/1.25 var(--fb);color:#e2e7ff}
.ng-l2 b{font-weight:900;color:var(--rc,#fff);color:color-mix(in srgb,var(--rc,#fff) 72%,#fff)}
.ng-arrow{color:var(--gold);font-weight:900}
.ng-l2 b.x{color:var(--cash)}
.ng-short{display:none}
.ng-bar{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(0,0,0,.35)}
.ng-bar i{display:block;height:100%;background:linear-gradient(90deg,#3fd65a,#b4ff5e);transform-origin:0 50%;transform:scaleX(0);transition:transform .3s}
.nextgoal.ready{box-shadow:var(--panel-sh),0 0 0 2px rgba(93,255,126,.55)}
.nextgoal.ready .ng-k::after{content:' · ready!';color:var(--cash)}

/* ------------------------------------------------------------ menus */
.menus{position:absolute;inset:0;z-index:10;pointer-events:none}
.menus.on{pointer-events:auto}
.scr{position:absolute;inset:0;overflow-x:hidden;overflow-y:auto;display:flex;flex-direction:column;align-items:center;
  padding:var(--st) max(16px,env(safe-area-inset-right)) var(--sb) max(16px,env(safe-area-inset-left));animation:fadeIn .3s both;overscroll-behavior:contain;touch-action:pan-y}
.scr.out{animation:fadeOut .2s forwards;pointer-events:none}
.scr h1,.scr h2,.modal h2,.modal h3,.modal h4{font-weight:400}

.scr-title{justify-content:space-between;gap:14px;padding-top:max(22px,var(--st));padding-bottom:max(14px,var(--sb));
  background:radial-gradient(ellipse 70% 60% at 50% 48%,rgba(10,14,40,0) 0%,rgba(10,14,40,.28) 70%,rgba(10,14,40,.6) 100%),linear-gradient(180deg,rgba(10,14,40,.35),rgba(10,14,40,0) 32%,rgba(10,14,40,0) 55%,rgba(10,14,40,.72))}
.title-hero{display:flex;flex-direction:column;align-items:center}
.logo{position:relative;display:flex;flex-direction:column;align-items:center;transform:rotate(-3deg);animation:logoDrop 1s var(--spring) both;filter:drop-shadow(0 10px 18px rgba(0,0,0,.35))}
.logo-row{display:flex;align-items:flex-end;gap:.16em;font:var(--fdw) clamp(54px,8.4vw,104px)/.9 var(--fd);letter-spacing:.01em}
.logo-row.r2{margin-top:-.04em;margin-left:.7em}
.lw{--lg:linear-gradient(180deg,#fffbe0 0%,#ffe45c 30%,#ffb300 68%,#ff8a00 100%);position:relative;z-index:0;display:inline-block;padding:0 .03em}
.lw i{display:inline-block;font-style:normal;color:transparent;background:var(--lg);-webkit-background-clip:text;background-clip:text}
.lw::before{content:attr(data-t);position:absolute;left:0;top:0;z-index:-1;padding:0 .03em;color:var(--ink);-webkit-text-stroke:.16em var(--ink);
  text-shadow:0 .05em 0 var(--ink),0 .09em 0 var(--ink),0 .13em 0 var(--ink2)}
.lw-a{--lg:linear-gradient(180deg,#ffe1f0,#ff8cc0 45%,#ff4f9a);font-size:.62em;transform:rotate(9deg) translateY(-.18em)}
.r2 .lw{--lg:linear-gradient(180deg,#f0ffe0 0%,#9bff6e 32%,#37d24a 70%,#169a36 100%)}
.logo-bang{position:relative;display:inline-block}
.r2 .lw-bang{--lg:linear-gradient(180deg,#e8f6ff,#7cd0ff 40%,#2f80ed)}
.logo-sprout{position:absolute;left:50%;bottom:84%;width:.62em;transform:translateX(-38%) rotate(14deg);transform-origin:40% 100%;animation:sway 3.2s ease-in-out infinite}
.edition{position:relative;z-index:2;margin-top:4px;transform:rotate(-3deg);animation:popIn .6s .35s var(--spring) both}
.edition span{display:inline-block;font:var(--fdw) clamp(20px,3.2vw,34px)/1 var(--fd);letter-spacing:.06em;padding:8px 28px 11px;border-radius:14px;
  background:linear-gradient(180deg,#ff7cbc,#d63d8a);border:3.5px solid var(--ink);box-shadow:inset 0 3px 0 rgba(255,255,255,.35),0 6px 0 var(--ink);text-shadow:0 2px 0 rgba(0,0,0,.35)}
.cast{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.cast-card,.pick{--c:#556;position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;color:#fff;cursor:pointer;border:3px solid var(--ink);border-radius:22px;
  background:linear-gradient(180deg,var(--c) 0,var(--c) 44px,transparent 44px),var(--panel);box-shadow:inset 0 3px 0 rgba(255,255,255,.18),0 6px 0 var(--ink);
  animation:cardIn .55s var(--d,0ms) var(--spring) both;transition:transform .16s var(--spring),box-shadow .16s}
.cast-card{width:152px;padding:12px 10px 12px}
.cast-card:hover,.pick:hover{transform:translateY(-6px) rotate(-1.2deg);box-shadow:inset 0 3px 0 rgba(255,255,255,.18),0 10px 0 var(--ink)}
.cast-card:active,.pick:active{transform:translateY(3px);box-shadow:inset 0 3px 0 rgba(255,255,255,.18),0 2px 0 var(--ink)}
.cc-ava{--s:92px;border-width:4px;box-shadow:0 0 0 3px var(--ink),0 5px 0 rgba(10,14,40,.4)}
.cc-name{font:var(--fdw) 25px/1 var(--fd);margin-top:5px;text-shadow:var(--o1)}
.cc-title,.pk-title{font:900 10.5px/1 var(--fb);letter-spacing:.09em;text-transform:uppercase;padding:4px 9px;border-radius:999px;background:var(--c);border:2px solid var(--ink);text-shadow:0 1px 0 rgba(0,0,0,.35)}
.cc-tag,.pk-tag{font:700 12px/1.25 var(--fb);font-style:italic;color:var(--txt2);text-align:center;margin-top:2px}
.title-actions{display:flex;flex-direction:column;align-items:center;gap:14px}
.title-main{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;align-items:stretch}
.btn-cont{padding-left:18px;padding-right:26px;text-align:left}
.btn-cont .bl{display:flex;flex-direction:column;gap:2px}
.btn-cont .bl small{font:900 12px/1 var(--fb);letter-spacing:.06em;text-transform:uppercase;opacity:.9}
.btn-cont .bl span{font-size:26px;line-height:1}
.btn-cont .btn-ava{--s:40px;margin-left:0}
.title-small{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.btn-ava{--s:32px;border-width:2px;margin-left:-8px}
.title-foot{font:800 12px/1 var(--fb);color:rgba(255,255,255,.75);text-shadow:0 1px 0 rgba(0,0,0,.6)}

.scr-select,.scr-mode{background:linear-gradient(180deg,rgba(12,17,48,.78),rgba(12,17,48,.62))}
.flow{width:min(980px,100%);display:flex;flex-direction:column;align-items:center;gap:18px;margin:auto 0;padding:10px 0}
.scr-head{width:100%;display:flex;align-items:center;gap:12px}
.scr-head h2{flex:1;margin:0;text-align:center;font:var(--fdw) clamp(30px,4.5vw,46px)/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o2)}
.steps{display:flex;gap:6px;width:48px;justify-content:flex-end}
.steps i{width:13px;height:13px;border-radius:50%;background:rgba(255,255,255,.25);border:2px solid var(--ink)}
.steps i.on{background:var(--gold)}
.flow-hint{margin:0;font:800 14px/1.3 var(--fb);color:var(--txt2);text-align:center}
.pick-grid{width:100%;display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.pick{padding:16px 12px 16px}
.pick.last{box-shadow:inset 0 3px 0 rgba(255,255,255,.18),0 6px 0 var(--ink),0 0 0 3px rgba(255,255,255,.5)}
.pk-ava{--s:128px;border-width:5px;box-shadow:0 0 0 3px var(--ink),0 6px 0 rgba(10,14,40,.4)}
.pk-name{font:var(--fdw) 32px/1 var(--fd);margin-top:6px;text-shadow:var(--o1)}
.saved{position:absolute;top:8px;right:-8px;z-index:2;display:flex;align-items:center;gap:4px;font:900 11px/1 var(--fb);color:var(--ink);background:var(--gold);padding:5px 8px;border-radius:9px;border:2.5px solid var(--ink);transform:rotate(7deg);box-shadow:0 3px 0 rgba(10,14,40,.5)}
.saved svg{width:12px;height:12px}
.who-chip{display:flex;align-items:center;gap:10px;padding:5px 14px 5px 5px;border-radius:999px;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.18);font:800 15px/1 var(--fb)}
.who-chip b{font:var(--fdw) 18px/1 var(--fd);color:var(--c);color:color-mix(in srgb,var(--c) 55%,#fff)}
.wc-ava{--s:38px}
.link{background:none;border:0;color:#9fd0ff;font:900 14px/1 var(--fb);text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:6px}
.mode-grid{width:100%;max-width:780px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.mode-card{position:relative;display:grid;grid-template-columns:64px 1fr;grid-template-rows:auto 1fr;column-gap:14px;row-gap:4px;text-align:left;padding:16px 18px 16px 16px;border-radius:22px;border:3px solid var(--ink);
  background:var(--panel);color:#fff;cursor:pointer;box-shadow:inset 0 3px 0 rgba(255,255,255,.15),0 6px 0 var(--ink);transition:transform .16s var(--spring),box-shadow .16s,background .2s}
.mode-card:hover{transform:translateY(-3px)}
.mode-card.on{background:linear-gradient(180deg,#2fae50,#1b7d38);box-shadow:inset 0 3px 0 rgba(255,255,255,.25),0 6px 0 var(--ink),0 0 0 4px #fff;transform:translateY(-3px)}
.mode-card.on::after{content:'';position:absolute;top:-12px;right:-10px;width:34px;height:34px;border-radius:50%;background:var(--gold) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7' fill='none' stroke='%2310163a' stroke-width='3.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/70% no-repeat;border:3px solid var(--ink)}
.mc-ic{grid-row:span 2;width:64px;height:64px;border-radius:18px;display:grid;place-items:center;padding:12px;background:linear-gradient(180deg,#5cb8ff,#2a6fe6);border:3px solid var(--ink);box-shadow:inset 0 2px 0 rgba(255,255,255,.3)}
.mode-card[data-mode=showdown] .mc-ic{background:linear-gradient(180deg,#ffe463,#ffa600);color:var(--ink)}
.mc-name{font:var(--fdw) 25px/1 var(--fd);text-shadow:var(--o1)}
.mc-desc{font:700 13.5px/1.35 var(--fb);color:#dfe5ff}
.diff{display:flex;flex-direction:column;align-items:center;gap:8px}
.diff-label{font:var(--fdw) 20px/1 var(--fd);letter-spacing:.03em}
.seg{display:inline-flex;gap:4px;padding:4px;border-radius:17px;background:rgba(10,15,40,.6);border:3px solid var(--ink)}
.seg-b{min-height:44px;padding:9px 18px 11px;border:0;border-radius:12px;background:transparent;color:var(--txt2);font:var(--fdw) 18px/1 var(--fd);letter-spacing:.02em;cursor:pointer;transition:background .15s,color .15s}
.seg-b:hover{color:#fff;background:rgba(255,255,255,.08)}
.seg-b.on{background:linear-gradient(180deg,#ffe066,#ffae1c);color:var(--ink);box-shadow:inset 0 2px 0 rgba(255,255,255,.55),0 3px 0 rgba(10,14,40,.45)}
.seg-b:focus-visible{outline:3px solid #fff;outline-offset:2px}
.diff-desc{min-height:1.3em;font:800 14px/1.3 var(--fb);color:var(--txt2);text-align:center}
.start-row{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap}
.start-row .btn-lg{min-width:210px}
.confirm{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;max-width:560px;padding:10px 14px;border-radius:14px;background:rgba(255,59,92,.2);border:2px solid #ff6b80;font:800 15px/1.3 var(--fb);text-align:center;animation:popIn .3s var(--spring)}
.confirm .row{display:flex;gap:10px}

.scr-pause{background:rgba(12,17,48,.6)}
.pause-panel{width:min(390px,100%);margin:auto 0;padding:18px 20px 16px;display:flex;flex-direction:column;gap:14px;animation:panelIn .38s var(--spring) both}
.pp-title{margin:0;text-align:center;font:var(--fdw) 42px/1 var(--fd);letter-spacing:.03em;text-shadow:var(--o2)}
.pause-me{display:flex;align-items:center;gap:12px;padding:10px;border-radius:16px;background:rgba(10,15,40,.45)}
.pm-ava{--s:54px}
.pause-me b{display:block;font:var(--fdw) 22px/1 var(--fd);color:var(--c);color:color-mix(in srgb,var(--c) 55%,#fff)}
.pause-me .cash{font:var(--fdw) 20px/1.2 var(--fd);color:var(--cash)}
.pm-rank{display:block;font:800 12.5px/1.2 var(--fb);color:var(--txt2)}
.pause-btns{display:flex;flex-direction:column;gap:11px}
.pause-btns .btn{width:100%}
.pause-note{margin:0;text-align:center;font:700 12.5px/1.3 var(--fb);color:var(--txt3)}

/* modals */
.modal{position:absolute;inset:0;display:grid;place-items:center;padding:var(--st) 12px var(--sb);z-index:2;animation:fadeIn .2s both}
.modal.out{animation:fadeOut .18s forwards;pointer-events:none}
.modal-back{position:absolute;inset:0;background:rgba(8,12,34,.58)}
.modal-panel{position:relative;width:min(780px,100%);max-height:100%;overflow-y:auto;overflow-x:hidden;padding:18px 22px 22px;border-radius:24px;border:3px solid var(--ink);background:var(--panel);
  box-shadow:inset 0 3px 0 rgba(255,255,255,.15),0 7px 0 var(--ink),0 20px 50px rgba(0,0,0,.4);animation:panelIn .36s var(--spring) both;overscroll-behavior:contain;touch-action:pan-y}
.modal-panel.shop{width:min(820px,100%)}
.modal-panel.settings{width:min(620px,100%)}
.modal-panel.shop-speed,.modal-panel.shop-rebirth{width:min(640px,100%)}
/* the X sticks to the top of the scrolling panel, so it never scrolls out of reach */
.modal-x{position:sticky;top:0;float:right;margin:-6px -10px -44px 8px;z-index:3;width:44px;height:44px;padding:10px;border-radius:50%;border:3px solid var(--ink);color:#fff;cursor:pointer;
  background:linear-gradient(180deg,#ff6b80,#dc2548);box-shadow:inset 0 2px 0 rgba(255,255,255,.3),0 4px 0 var(--ink);transition:transform .14s var(--spring)}
.modal-x:hover{transform:rotate(90deg) scale(1.05)}
.mh{display:flex;align-items:center;gap:12px;margin:0 0 14px;padding-right:52px}
.modal-done{display:flex;justify-content:center;margin-top:16px}
.modal-done .btn{min-width:min(260px,100%)}
.mh h2{margin:0;font:var(--fdw) 30px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.mh-ic{width:46px;height:46px;flex:none;border-radius:14px;padding:9px;display:grid;place-items:center;background:linear-gradient(180deg,#5cb8ff,#2a6fe6);border:3px solid var(--ink);--ico-hole:#2a6fe6}

/* settings */
.set-rows{display:flex;flex-direction:column;gap:8px}
.set-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 14px;padding:10px 12px;border-radius:15px;background:rgba(10,15,40,.32)}
.set-l{display:flex;flex-direction:column;gap:3px}
.set-name{font:var(--fdw) 18px/1 var(--fd);letter-spacing:.02em}
.set-note{font:700 12px/1.2 var(--fb);color:var(--txt3)}
.set-note.warn{color:#ffe066}
.set-slider{display:flex;align-items:center;gap:10px;margin-left:auto}
.set-v{min-width:46px;text-align:right;font:900 14px/1 var(--fb)}
#ui input[type=range]{-webkit-appearance:none;appearance:none;width:210px;height:32px;margin:0;background:transparent;cursor:pointer;pointer-events:auto;touch-action:none;--f:50%}
#ui input[type=range]::-webkit-slider-runnable-track{height:14px;border-radius:9px;border:2.5px solid var(--ink);background:linear-gradient(90deg,#63f27f var(--f),rgba(10,15,40,.75) var(--f))}
#ui input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;margin-top:-9.5px;border-radius:50%;background:#fff;border:3px solid var(--ink);box-shadow:0 3px 0 rgba(0,0,0,.35)}
#ui input[type=range]::-moz-range-track{height:9px;border-radius:9px;border:2.5px solid var(--ink);background:rgba(10,15,40,.75)}
#ui input[type=range]::-moz-range-progress{height:9px;border-radius:9px;background:#63f27f}
#ui input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid var(--ink)}
#ui input[type=range]:focus-visible{outline:3px solid #fff;outline-offset:3px;border-radius:9px}
.switch{position:relative;width:64px;height:36px;flex:none;padding:0;border-radius:999px;border:3px solid var(--ink);background:#4a5383;cursor:pointer;transition:background .2s;box-shadow:inset 0 2px 4px rgba(0,0,0,.3)}
.switch i{position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 0 rgba(0,0,0,.3);transition:transform .22s var(--spring)}
.switch.on{background:var(--green)}
.switch.on i{transform:translateX(28px)}

/* shops */
.shop-head{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-right:52px;flex-wrap:wrap}
.sh-ic{width:54px;height:54px;flex:none;padding:10px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(180deg,#ffe463,#ffa600);border:3px solid var(--ink);color:var(--ink);box-shadow:inset 0 2px 0 rgba(255,255,255,.5)}
.shop-speed .sh-ic{color:#fff;background:linear-gradient(180deg,#5cb8ff,#2a6fe6)}
.shop-rebirth .sh-ic{background:linear-gradient(180deg,#c890ff,#7433d4);color:var(--gold)}
.sh-titles{display:flex;flex-direction:column;gap:3px;min-width:0}
.sh-titles h2{margin:0;font:var(--fdw) 31px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.sh-sub{font:800 13px/1.2 var(--fb);color:var(--txt2)}
.sh-cash{margin-left:auto;display:flex;align-items:center;gap:7px;padding:6px 12px 6px 7px;border-radius:14px;background:rgba(10,15,40,.55);font:var(--fdw) 24px/1 var(--fd);color:var(--cash);text-shadow:var(--o1)}
.sh-cash > span:first-child{width:26px;height:26px}
.gear-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:12px}
.gear-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:14px 12px 12px;border-radius:18px;background:rgba(10,15,40,.38);border:3px solid var(--ink);box-shadow:inset 0 2px 0 rgba(255,255,255,.08)}
.gear-card.bought{animation:bought .5s var(--spring)}
.gc-key{position:absolute;left:10px;top:9px;font:900 11px/1 var(--fb);color:var(--ink);background:#fff;border-radius:6px;padding:3px 6px 4px;box-shadow:0 2px 0 #8f9acb}
.gc-ic{width:66px;height:66px;filter:drop-shadow(0 3px 0 rgba(0,0,0,.3))}
.gear-card:hover .gc-ic{animation:wiggle .5s ease-in-out}
.gc-copy{display:flex;flex-direction:column;align-items:center;gap:4px}
.gc-name{font:var(--fdw) 20px/1 var(--fd);letter-spacing:.02em}
.gc-desc{font:700 12.5px/1.3 var(--fb);color:var(--txt2);min-height:2.6em}
.gc-own{font:900 12px/1 var(--fb);color:#ffe066}
.gc-buy{display:flex;gap:8px;width:100%;margin-top:2px}
.gc-buy .btn{flex:1;flex-direction:column;gap:2px;padding:6px 6px 8px;min-height:50px}
.speed-body{display:flex;flex-direction:column;align-items:center;gap:16px}
.sp-card{display:flex;align-items:center;gap:14px;padding:12px 22px 12px 14px;border-radius:20px;background:rgba(10,15,40,.4);border:3px solid var(--ink)}
.sp-bolt{width:62px;height:62px;color:#ffe066;filter:drop-shadow(0 3px 0 rgba(0,0,0,.35))}
.sp-copy{display:flex;flex-direction:column;gap:3px}
.sp-lvl{display:inline-block;font:var(--fdw) 31px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.sp-lvl.bump{animation:cashBump .4s var(--spring)}
.sp-now{font:900 15px/1.2 var(--fb);color:var(--cash)}
.sp-next{font:800 13px/1.2 var(--fb);color:var(--txt2)}
.sp-train{min-width:260px}
.sp-train small{font-size:15px}
.sr{width:100%;padding:12px 14px 12px;border-radius:18px;background:rgba(10,15,40,.32)}
.sr-title b{font:var(--fdw) 18px/1.1 var(--fd);letter-spacing:.02em}
.sr-title span{font:700 12.5px/1.3 var(--fb);color:var(--txt2)}
.sr-track{position:relative;height:16px;margin:22px 14px 16px;border-radius:9px;background:linear-gradient(90deg,#303c80,#5a67a8);border:2.5px solid var(--ink)}
.sr-tick{position:absolute;top:-8px;bottom:-8px;width:8px;margin-left:-4px;border-radius:4px;background:var(--c);border:2px solid var(--ink)}
.sr-you{position:absolute;top:50%;z-index:1;width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:var(--gold);border:3px solid var(--ink);transform:translate(-50%,-50%);transition:left .5s var(--spring);box-shadow:0 3px 0 rgba(0,0,0,.35)}
.sr-you span{font:900 9px/1 var(--fb);color:var(--ink);letter-spacing:.04em}
.sr-rows{display:grid;gap:5px}
.sr-row{display:grid;grid-template-columns:14px minmax(0,1fr) minmax(0,1fr) 34px 92px;align-items:center;gap:8px;padding:6px 9px;border-radius:11px;background:rgba(255,255,255,.05);font:800 13px/1.15 var(--fb)}
.sr-dot{width:14px;height:14px;border-radius:4px;background:var(--c);border:2px solid var(--ink)}
.sr-biome{color:var(--txt2)}
.sr-spd{font:var(--fdw) 16px/1 var(--fd);text-align:right}
.sr-st{justify-self:end;display:flex;align-items:center;gap:4px;font:900 12px/1 var(--fb);color:#ff9aab;white-space:nowrap}
.sr-st svg{width:14px;height:14px}
.sr-row.ok .sr-st{color:#7dffa0}
.rebirth-body{display:flex;flex-direction:column;align-items:center;gap:14px}
.rb-req{width:100%}
.rb-req-top{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px 12px;font:900 14px/1.2 var(--fb)}
.rb-have{color:var(--cash)}
.rb-bar{height:22px;margin-top:6px;border-radius:12px;overflow:hidden;background:rgba(10,15,40,.6);border:3px solid var(--ink)}
.rb-bar i{display:block;height:100%;background:linear-gradient(90deg,#ffe463,#ff9f1c);transform-origin:0 50%;transition:transform .4s}
.rb-cols{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.rb-col{padding:12px 14px;border-radius:16px;background:rgba(10,15,40,.38);border:3px solid var(--ink)}
.rb-col h4{margin:0 0 6px;font:var(--fdw) 19px/1 var(--fd);letter-spacing:.02em}
.rb-col.lose h4{color:#ff9aab}
.rb-col.win h4{color:#7dffa0}
.rb-list{margin:0;padding-left:18px;font:700 13.5px/1.55 var(--fb);color:#e2e7ff}
.rb-list b{color:#ffe066}
.rb-stars{display:flex;align-items:center;gap:4px;font:800 13px/1 var(--fb);color:var(--gold)}
.rb-stars svg{width:24px;height:24px}
.rb-stars:empty{display:none}

/* photo booth */
.pb-intro{margin:0 0 12px;font:700 14px/1.45 var(--fb);color:#e2e7ff}
.pb-intro b{color:#7dffa0}
.pb-msg{margin:0 0 12px;padding:9px 12px;border-radius:12px;background:rgba(63,214,90,.2);border:2px solid var(--green);font:800 14px/1.3 var(--fb)}
.pb-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.pb-card{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 10px 12px;border-radius:20px;border:3px solid var(--ink);background:linear-gradient(180deg,var(--c) 0,var(--c) 46px,rgba(10,15,40,.4) 46px)}
.pb-ava{--s:90px;border-width:4px;box-shadow:0 0 0 3px var(--ink)}
.pb-name{font:var(--fdw) 22px/1 var(--fd);margin-top:3px}
.pb-status{font:900 10.5px/1 var(--fb);letter-spacing:.09em;text-transform:uppercase;color:var(--txt2)}
.pb-btns{display:flex;flex-direction:column;gap:7px;width:100%;margin-top:2px}
.pb-btns .btn{width:100%;white-space:nowrap;font-size:14px;padding:8px 8px 10px}
.pb-work{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:18px;align-items:start}
.pb-stage{position:relative;width:100%;max-width:440px;aspect-ratio:1/1;justify-self:center;overflow:hidden;border-radius:20px;border:3px solid var(--ink);background:#26305f;cursor:grab;touch-action:none}
.pb-stage.drag{cursor:grabbing}
.pb-stage:focus-visible{outline:4px solid #fff;outline-offset:3px}
.pb-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.pb-guide{position:absolute;inset:0;pointer-events:none}
.pb-guide svg{width:100%;height:100%;display:block}
.pb-eyes,.pb-chin{position:absolute;font:900 10px/1 var(--fb);letter-spacing:.12em;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.9)}
.pb-eyes{right:6px;top:42%;transform:translateY(-140%);color:var(--gold)}
.pb-chin{left:50%;top:92%;transform:translate(-50%,-130%);color:#fff;opacity:.8}
.pb-side{display:flex;flex-direction:column;align-items:center;gap:14px}
.pb-prev-wrap{display:flex;flex-direction:column;align-items:center;gap:6px;font:900 11px/1 var(--fb);letter-spacing:.08em;text-transform:uppercase;color:var(--txt2)}
.pb-prev{width:124px;height:124px;border-radius:50%;border:4px solid var(--c);box-shadow:0 0 0 3px var(--ink)}
.pb-tips{margin:0;padding-left:18px;font:700 13px/1.55 var(--fb);color:#e2e7ff}
.pb-zoom{display:flex;align-items:center;justify-content:center;gap:12px;margin:14px 0}
.pb-zoom .bi{font:var(--fdw) 26px/1 var(--fd)}
#ui .pb-zoom input[type=range]{width:min(380px,70%)}
#ui .pb-zoom input[type=range]::-webkit-slider-runnable-track{background:rgba(10,15,40,.75)}
.pb-actions{display:flex;justify-content:flex-end;gap:12px}

/* how to play */
.ht-body{display:flex;flex-direction:column;gap:20px}
.ht-body .mh{margin-bottom:0}
.ht-sec h3{display:flex;align-items:center;gap:8px;margin:0 0 10px;font:var(--fdw) 22px/1 var(--fd);letter-spacing:.02em}
.ht-sec h3 .bi{width:24px;height:24px;color:#7dffa0}
.ht-p{margin:0 0 9px;font:700 13.5px/1.35 var(--fb);color:var(--txt2)}
.ht-loop{list-style:none;margin:0;padding:6px 0 0 6px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px 12px}
.ht-loop li{position:relative;display:flex;flex-direction:column;gap:5px;padding:12px;border-radius:16px;background:rgba(10,15,40,.38);border:3px solid var(--ink);animation:cardIn .45s var(--d) var(--spring) both}
.hl-n{position:absolute;left:-9px;top:-10px;width:28px;height:28px;border-radius:50%;background:var(--gold);color:var(--ink);border:3px solid var(--ink);font:var(--fdw) 16px/22px var(--fd);text-align:center}
.hl-ic{width:34px;height:34px;color:#7dffa0}
.ht-loop b{font:var(--fdw) 18px/1 var(--fd);letter-spacing:.02em}
.ht-loop li > span:last-child{font:700 13px/1.3 var(--fb);color:var(--txt2)}
.ht-controls{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.ht-ctl{padding:12px;border-radius:16px;background:rgba(10,15,40,.38);border:3px solid var(--ink)}
.ht-ctl h4{display:flex;align-items:center;gap:7px;margin:0 0 9px;font:var(--fdw) 17px/1 var(--fd);letter-spacing:.02em}
.ht-ctl h4 .bi{width:22px;height:22px}
.ht-ctl dl{display:grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:center;margin:0;font:700 12.5px/1.2 var(--fb)}
.ht-ctl dt{justify-self:start}
.ht-ctl dd{margin:0;color:#e2e7ff}
.ht-chips{display:flex;flex-wrap:wrap;gap:8px}
.ht-rar{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:96px;padding:9px 12px;border-radius:13px;background:rgba(10,15,40,.45)}
.ht-rar .rar,.ht-rar .mut{font-size:14px;text-shadow:var(--o1)}
.ht-rar .rar-secret,.ht-rar .mut-rainbow{text-shadow:none}
.ht-where{font:800 11.5px/1.2 var(--fb);color:var(--txt2);text-align:center}
.ht-weather{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.ht-ev{position:relative;overflow:hidden;display:flex;flex-direction:column;gap:5px;padding:12px;border-radius:16px;border:3px solid var(--ink);background:linear-gradient(180deg,var(--e1),var(--e2))}
.ht-ev > *{position:relative}
.ht-ev .bi{width:38px;height:38px}
.ht-ev b{font:var(--fdw) 19px/1 var(--fd);text-shadow:var(--o1)}
.ht-ev > span:last-child{font:800 13px/1.3 var(--fb);text-shadow:0 1px 0 rgba(0,0,0,.4)}
.ht-items{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.ht-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:13px;background:rgba(10,15,40,.35);font:700 13px/1.3 var(--fb);color:#e2e7ff}
.ht-item b{color:#fff}
.hi-ic{width:42px;height:42px;flex:none}
.ht-tips{margin:0;padding-left:20px;font:700 14px/1.55 var(--fb);color:#e2e7ff}

/* end screen */
.scr-end{justify-content:space-between;gap:10px;
  background:linear-gradient(180deg,rgba(12,17,48,.7) 0,rgba(12,17,48,.28) 20%,rgba(12,17,48,0) 32%,rgba(12,17,48,0) 52%,rgba(12,17,48,.45) 70%,rgba(12,17,48,.8) 100%)}
.end-top{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.end-kicker{display:flex;align-items:center;gap:6px;font:900 13px/1 var(--fb);letter-spacing:.16em;text-transform:uppercase;color:#ffe066;text-shadow:0 2px 0 rgba(0,0,0,.4)}
.end-kicker svg{width:17px;height:17px}
.end-title{margin:0;font:var(--fdw) clamp(42px,6.4vw,72px)/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o2);animation:logoDrop .9s var(--spring) both}
.end-top.win .end-title{color:var(--gold)}
.end-sub{display:flex;align-items:center;gap:8px;font:900 16px/1 var(--fb);background:rgba(16,22,58,.82);padding:4px 16px 4px 4px;border-radius:999px;border:2.5px solid var(--ink);animation:cardIn .5s .35s var(--spring) both}
.end-top.win .end-sub{padding:7px 16px}
.es-ava{--s:28px;border-width:2px}
.end-card{position:relative;z-index:1;width:min(940px,100%);display:flex;flex-direction:column;align-items:center;gap:9px;padding:11px 14px 13px;border-radius:24px;border:3px solid var(--ink);
  background:linear-gradient(180deg,rgba(47,60,130,.9),rgba(27,36,82,.94));box-shadow:var(--panel-sh);animation:cardIn .5s .15s var(--spring) both}
.end-chips{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;width:100%}
.end-chip{position:relative;display:flex;align-items:center;gap:8px;padding:5px 16px 5px 5px;border-radius:999px;background:rgba(10,15,40,.55);box-shadow:inset 0 0 0 2px rgba(255,255,255,.08);animation:cardIn .45s var(--d) var(--spring) both;min-width:0}
.end-chip.me{background:linear-gradient(90deg,rgba(255,255,255,.26),rgba(255,255,255,.08));box-shadow:inset 0 0 0 2.5px var(--c)}
.ec-rank{width:26px;height:26px;flex:none;display:grid;place-items:center;border-radius:50%;font:var(--fdw) 16px/1 var(--fd);color:var(--ink);background:#8f9acb;border:2px solid var(--ink)}
.end-chip.gold .ec-rank{background:linear-gradient(180deg,#ffe463,#ffa600)}
.end-chip.silver .ec-rank{background:linear-gradient(180deg,#f4f7fb,#a2adc2)}
.end-chip.bronze .ec-rank{background:linear-gradient(180deg,#ffc79e,#d56e33)}
.ec-ava{--s:38px}
.ec-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
.ec-name{font:var(--fdw) 17px/1 var(--fd);letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ec-val{font:var(--fdw) 15px/1 var(--fd);color:var(--cash)}
.end-chip.me .ec-name::after{content:' (you)';font-size:.8em;color:var(--txt2)}
.ec-crown{position:absolute;left:44px;top:-13px;width:24px;height:24px;color:var(--gold);transform:rotate(-14deg);filter:drop-shadow(0 2px 0 rgba(10,14,40,.5))}
.end-you{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 16px;font:800 14px/1.2 var(--fb);color:var(--txt2)}
.ey-k{font:900 11px/1 var(--fb);letter-spacing:.14em;text-transform:uppercase;color:#fff;background:var(--c);padding:5px 9px;border-radius:8px;border:2px solid var(--ink);text-shadow:0 1px 0 rgba(0,0,0,.35)}
.ey-v b{font:var(--fdw) 18px/1 var(--fd);color:#fff;letter-spacing:.01em}
.ey-v b.cash{color:var(--cash)}
.ey-best b{color:var(--rc,#fff);color:color-mix(in srgb,var(--rc,#fff) 70%,#fff)}
.ey-best em{font-style:normal;color:var(--cash);font-weight:900}
.awards{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;width:100%}
.award{display:flex;align-items:center;gap:9px;padding:5px 13px 5px 5px;border-radius:16px;border:2.5px solid var(--ink);background:rgba(10,15,40,.5);animation:cardIn .5s var(--d) var(--spring) both;min-width:0}
.aw-pic{position:relative;flex:none}
.aw-ava{--s:36px}
.aw-ic{position:absolute;right:-6px;bottom:-5px;width:21px;height:21px;padding:3px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(180deg,#ffe463,#ffa600);color:var(--ink);border:2px solid var(--ink)}
.aw-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
.aw-title{font:var(--fdw) 15px/1 var(--fd);color:#ffe066;letter-spacing:.02em;white-space:nowrap}
.aw-name{font:800 12px/1.1 var(--fb);white-space:nowrap}
.aw-name b{font-weight:900}
.aw-stat{color:var(--txt2)}
.end-actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.end-actions .btn-lg{min-height:52px;font-size:21px;padding:10px 26px 12px}
.confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.confetti i{position:absolute;top:-24px;border-radius:2px;animation:confetti 3s linear infinite}

/* ------------------------------------------------------------ touch controls */
.touch{position:absolute;inset:0;pointer-events:none;display:none}
.touch.on{display:block}
.tz{position:absolute;pointer-events:auto;touch-action:none}
.tz-cam{inset:0;z-index:1}
.tz-move{left:0;bottom:0;width:48%;height:68%;z-index:1}
.stick-idle{position:absolute;left:calc(var(--sl) + 78px);bottom:calc(var(--sb) + 150px);width:112px;height:112px;margin:0 0 -56px -56px;border-radius:50%;border:3px dashed rgba(255,255,255,.4);z-index:1;pointer-events:none;transition:opacity .2s;
  background:radial-gradient(circle,rgba(16,22,58,.12),rgba(16,22,58,.3))}
.stick-idle span{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px;border-radius:50%;background:rgba(255,255,255,.3)}
.stick-idle.away{opacity:0}
.stick{position:absolute;left:0;top:0;width:126px;height:126px;margin:-63px 0 0 -63px;border-radius:50%;z-index:3;pointer-events:none;opacity:0;transition:opacity .12s;
  background:radial-gradient(circle,rgba(16,22,58,.2),rgba(16,22,58,.55));border:3px solid rgba(255,255,255,.65);box-shadow:0 0 0 3px rgba(16,22,58,.45)}
.stick.show{opacity:1}
.knob{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px;border-radius:50%;background:radial-gradient(circle at 40% 32%,#fff,#cdd6ff);border:3px solid var(--ink);box-shadow:0 4px 0 rgba(0,0,0,.35)}
.tb{position:absolute;z-index:3;padding:0;display:grid;place-items:center;border-radius:50%;border:3.5px solid var(--ink);color:#fff;pointer-events:auto;touch-action:none;cursor:pointer;
  box-shadow:inset 0 3px 0 rgba(255,255,255,.4),inset 0 -5px 0 rgba(0,0,0,.18),0 5px 0 rgba(10,14,40,.75);transition:transform .08s,box-shadow .08s,opacity .15s,filter .2s;-webkit-user-select:none;user-select:none}
.tb.down{transform:translateY(3px) scale(.93);box-shadow:inset 0 3px 0 rgba(255,255,255,.4),0 2px 0 rgba(10,14,40,.75)}
.tb-jump{right:calc(var(--sr) + 4px);bottom:calc(var(--sb) + 90px);width:80px;height:80px;padding:18px;background:radial-gradient(circle at 42% 30%,#7fcbff,#2a6fe6)}
.tb-bonk{right:calc(var(--sr) + 98px);bottom:calc(var(--sb) + 96px);width:66px;height:66px;padding:8px;background:radial-gradient(circle at 42% 30%,#ff9cc9,#e0407f)}
.tb-bonk.dim{filter:grayscale(.85) brightness(.75)}
.tb-act{right:calc(var(--sr) + 8px);bottom:calc(var(--sb) + 190px);width:76px;height:76px;background:radial-gradient(circle at 42% 30%,#72f48f,#1a9a3f);opacity:0;transform:scale(.5);pointer-events:none;transition:opacity .15s,transform .22s var(--spring)}
.tb-act.show{opacity:1;transform:none;pointer-events:auto}
.tb-act.show.down{transform:scale(.92)}
.tb-act.pop{animation:actPop .35s var(--spring)}
.ta-verb{position:relative;z-index:1;font:var(--fdw) 17px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.ta-ring{position:absolute;inset:-10px;pointer-events:none}
.ta-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ta-ring circle{fill:none;stroke-width:7}
.ta-ring .bg{stroke:rgba(255,255,255,.22)}
.ta-ring .fg{stroke:var(--rc,#fff);stroke-linecap:round}
.is-touch .slot{--sz:58px}
.is-touch .hb-k{display:none}

/* ------------------------------------------------------------ responsive: phones (portrait) */
@media (max-width:760px){
  .pick-grid{grid-template-columns:repeat(2,1fr);gap:12px}
  .pk-ava{--s:92px}
  .pk-name{font-size:26px}
  .mode-grid{grid-template-columns:1fr}
  .pb-grid{grid-template-columns:repeat(2,1fr)}
  .pb-work{grid-template-columns:1fr}
  .pb-side{flex-direction:row;align-items:center;justify-content:center}
  .pb-prev{width:92px;height:92px}
  .pb-btns .btn .bi{display:none}
  .ht-loop{grid-template-columns:repeat(2,1fr)}
  .ht-controls,.ht-weather{grid-template-columns:1fr}
  .ht-items{grid-template-columns:1fr}
  .rb-cols{grid-template-columns:1fr}
}
@media (max-width:640px){
  .hud-tl{width:auto;max-width:calc(100% - 190px);gap:7px}
  .hbtn{width:40px;height:40px;border-radius:12px}
  .hbtn svg{width:19px;height:19px}
  .stats{min-width:0;padding:5px 10px 6px 6px;gap:2px}
  .st-coin{width:25px;height:25px}
  .st-val{font-size:25px;text-shadow:var(--o1),0 3px 0 var(--ink)}
  .st-sub{flex-direction:row;align-items:center;flex-wrap:wrap;gap:3px 6px;padding-left:0;margin-top:1px}
  .st-chips{margin-left:0}
  .st-inc{font-size:11.5px}
  .chip{font-size:11px;padding:3px 7px 3px 4px}
  .chip svg{width:13px;height:13px}
  .ch-speed em{display:none}
  .st-pop{font-size:18px}
  .board{width:160px;--rowh:29px;padding:4px 4px 5px;border-radius:15px}
  .board-head{padding:1px 3px 4px 4px}
  .bh-title{font-size:12px;gap:4px}
  .bh-title svg{width:14px;height:14px}
  .bh-timer{font-size:16px;padding:3px 6px 4px 5px}
  .bh-timer svg{width:13px;height:13px}
  .brow{gap:5px;padding:0 6px 0 3px;border-radius:9px}
  .br-rank{display:none}
  .br-ava{--s:21px}
  .br-name{font-size:13px}
  .br-val{font-size:11.5px}
  .br-star{display:none}
  .tut{position:fixed;left:var(--sl);right:var(--sr);top:calc(var(--st) + 150px);display:flex;align-items:center;gap:8px;width:auto;max-width:none;padding:5px 8px 5px 6px;border-radius:15px}
  /* the distance sits under the arrow and the count over Skip, so the instruction gets the width */
  .tut-head{order:2;flex-direction:column;align-items:flex-end;gap:5px}
  .tut-kicker,.tut-list{display:none}
  .tut-text{font-size:11.5px;line-height:1.25;margin-top:1px;white-space:normal;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}
  .tut-nav{gap:2px}
  .tut-now{flex:1;min-width:0;margin:0;padding:0;gap:7px;background:none}
  .tut-skip{padding:4px 6px;font-size:10px}
  .tut-num{display:none}
  .tut-copy b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tut-arrow{width:28px;height:28px;padding:4px}
  .tut-text{font-size:11.5px}
  .tut.yield{display:none}
  .hud-top{top:calc(var(--st) + 164px);width:calc(100% - 24px)}
  .hud:has(.tut:not(.gone):not(.hidden):not(.wait):not(.yield)) .hud-top{top:calc(var(--st) + 214px)}
  .alerts .alert:nth-child(n+3){display:none}
  .center-moment{top:54%}
  .is-touch .hud-bottom .hotbar{margin-top:186px}
  .alert{font-size:14px;padding:5px 12px 6px 5px;border-radius:15px;gap:8px}
  .alert small{font-size:12px}
  .a-ava{--s:36px}
  .a-ic{width:34px;height:34px}
  .alert .who,.alert .pn{font-size:14px}
  .evchip{padding:4px 12px 9px 6px;gap:8px}
  .ev-ic{width:30px;height:30px}
  .ev-name{font-size:17px}
  .ev-desc{font-size:11px}
  .ev-time{font-size:19px}
  .meter{top:calc(var(--st) + 300px);bottom:calc(var(--sb) + 330px);max-height:260px;width:40px}
  .m-where{display:none}
  .m-top,.m-home{width:24px;height:24px;padding:4px}
  .chat{bottom:calc(var(--sb) + 340px);width:62%}
  .cl{font-size:12px;padding:3px 8px 4px}
  .cl:nth-last-child(n+4){display:none}
  .hud-bottom{width:calc(100% - 16px);gap:8px}
  .prompt,.carry{padding-right:14px}
  .pp-verb{font-size:20px}
  .pp-label{font-size:13px;max-width:230px}
  .cp-l1 b{font-size:16px}
  .cp-l2{font-size:15px}
  .slot{--sz:54px;border-radius:13px}
  .hotbar{gap:5px;padding:5px;border-radius:17px}
  .hb-ic{width:38px;height:38px}
  .hb-tip{display:none}
  .an-sub{font-size:15px}
  .rv-kicker{font-size:30px}
  .rv-rays{width:340px;height:340px}
  .rv-card{padding:12px 18px 14px}
  .cast{gap:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%;max-width:400px}
  .cast-card{width:auto;padding:10px 8px 10px}
  .cc-ava{--s:70px}
  .cc-name{font-size:21px}
  .cc-tag{display:none}
  .btn-xl{font-size:28px;min-height:62px;padding:13px 34px 16px}
  .btn-cont .bl span{font-size:22px}
  .btn-cont .btn-ava{--s:34px}
  .title-small .btn{font-size:15px;min-height:42px;padding:8px 12px 10px}
  .end-title{font-size:46px}
  .end-sub{font-size:14px}
  .end-card{gap:8px;padding:10px 10px 12px;border-radius:20px}
  .end-chips{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .end-chip{padding-right:10px;gap:6px}
  .ec-ava{--s:32px}
  .ec-crown{left:38px}
  .ec-name{font-size:15px}
  .end-chip.me .ec-name::after{content:none}
  .ec-val{font-size:13px}
  .end-you{font-size:12.5px;gap:4px 10px}
  .ey-v b{font-size:16px}
  .awards{gap:6px}
  .award{gap:7px;padding:4px 10px 4px 4px}
  .aw-ava{--s:30px}
  .aw-title{font-size:13px}
  .aw-name{font-size:11px}
  .end-actions{gap:10px}
  .end-actions .btn-lg{font-size:19px;min-height:50px;padding:10px 20px 12px}
  .modal-panel{padding:14px 14px 18px;border-radius:20px}
  .mh h2,.sh-titles h2{font-size:25px}
  .sh-cash{margin-left:0;font-size:20px}
  .gear-grid{grid-template-columns:1fr;gap:10px}
  .gear-card{display:grid;grid-template-columns:58px 1fr;gap:4px 12px;text-align:left;align-items:center;padding:10px 12px 10px}
  .gc-ic{width:56px;height:56px;grid-row:span 1}
  .gc-copy{align-items:flex-start}
  .gc-desc{min-height:0}
  .gc-buy{grid-column:1/-1}
  .gc-key{display:none}
  .sr-row{grid-template-columns:12px minmax(0,1fr) 30px 82px;font-size:12px}
  .sr-biome{display:none}
  .sp-train{min-width:0;width:100%}
  .set-row{padding:9px 10px}
  #ui input[type=range]{width:160px}
  .pause-panel{padding:14px 14px 12px}
  .pp-title{font-size:34px}
  .tb-jump{width:78px;height:78px}
}
/* phones (landscape): short screens */
@media (max-height:500px) and (orientation:landscape){
  .hud-tl{flex-direction:row;flex-wrap:wrap;width:250px;gap:7px;align-items:flex-start}
  .hbtn{width:38px;height:38px;border-radius:11px}
  .hbtn svg{width:18px;height:18px}
  .stats{min-width:0;padding:4px 10px 5px 6px;gap:1px}
  .st-coin{width:24px;height:24px}
  .st-val{font-size:23px}
  .st-sub{flex-direction:row;align-items:center;gap:6px;padding-left:0;margin-top:1px}
  .st-chips{margin-left:0}
  .st-inc{font-size:11px}
  .chip{font-size:10.5px;padding:3px 7px 3px 4px}
  .chip svg{width:12px;height:12px}
  .ch-speed em{display:none}
  /* tutorial: a compact card with the arrow + distance on the left, the title and Skip on top and the
     instruction underneath across the full width (two lines, never cut) */
  .tut{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"nav title skip" "nav text text";align-items:center;column-gap:6px;row-gap:2px;
    width:236px;max-width:236px;padding:5px 6px 6px}
  .tut-head,.tut-now,.tut-copy{display:contents}
  .tut-kicker,.tut-list{display:none}
  .tut-nav{grid-area:nav;gap:2px}
  .tut-arrow{width:26px;height:26px;padding:4px}
  .tut-copy b{grid-area:title;align-self:end;font-size:14px}
  .tut-text{grid-area:text;align-self:start;margin:0;font-size:11px;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}
  .tut-skip{grid-area:skip;align-self:center}
  .board{width:168px;--rowh:26px;padding:4px}
  .board-head{padding:0 3px 3px 4px}
  .bh-title{font-size:11px}
  .bh-title svg{width:13px;height:13px}
  .bh-timer{font-size:15px;padding:2px 6px 3px}
  .br-rank{display:none}
  .br-ava{--s:19px;border-width:2px}
  .br-name{font-size:12.5px}
  .br-val{font-size:11px}
  .br-star{display:none}
  .hud-top{top:var(--st);width:calc(100% - 530px);min-width:300px;max-width:420px}
  .alert{font-size:13px;padding:4px 10px 5px 4px;border-radius:14px;gap:7px}
  .alert small{font-size:11px}
  .a-ava{--s:32px}
  .a-ic{width:30px;height:30px}
  .alert .who,.alert .pn{font-size:13px}
  .evchip{padding:3px 10px 8px 5px}
  .ev-ic{width:26px;height:26px}
  .ev-name{font-size:15px}
  .ev-desc{display:none}
  .ev-time{font-size:17px}
  .meter{left:var(--sl);right:auto;top:calc(var(--st) + 150px);bottom:calc(var(--sb) + 20px);width:36px}
  .m-where{display:none}
  .m-top,.m-home{width:22px;height:22px;padding:4px}
  .m-ava{--s:17px}
  .m-mk.me .m-ava{--s:24px}
  .chat{display:none}
  .hud-bottom{gap:6px;width:min(480px,calc(100% - 340px));min-width:300px}
  .slot{--sz:50px;border-radius:12px}
  .is-touch .slot{--sz:52px}
  .hotbar{gap:5px;padding:4px;border-radius:15px}
  .hb-ic{width:36px;height:36px}
  .hb-tip{display:none}
  .prompt,.carry{padding:4px 12px 4px 4px}
  .pp-key{width:44px;height:44px}
  .pp-k{width:30px;height:30px;font-size:18px;line-height:31px}
  .pp-verb{font-size:18px}
  .pp-label{font-size:12px;max-width:220px}
  .cp-arrow{width:38px;height:38px}
  .cp-l1{font-size:12px}
  .cp-l1 b{font-size:15px}
  .cp-l2{font-size:14px}
  .an-title{font-size:40px}
  .an-ic{width:56px;height:56px}
  .rv-kicker{font-size:28px}
  .rv-rays{width:300px;height:300px}
  .center-moment{top:58%}
  .an-ic{width:44px;height:44px}
  .alerts .alert:nth-child(n+3){display:none}
  .tz-move{height:72%}
  .stick-idle{left:calc(var(--sl) + 130px);bottom:calc(var(--sb) + 80px);width:96px;height:96px;margin:0 0 -48px -48px}
  .tb-jump{width:68px;height:68px;padding:15px;bottom:calc(var(--sb) + 14px)}
  .tb-bonk{width:58px;height:58px;right:calc(var(--sr) + 84px);bottom:calc(var(--sb) + 18px)}
  .tb-act{width:64px;height:64px;right:calc(var(--sr) + 6px);bottom:calc(var(--sb) + 100px)}
  .ta-verb{font-size:15px}
  .scr-title{gap:8px;padding-top:max(10px,var(--st))}
  .logo-row{font-size:clamp(40px,11vh,64px)}
  .edition span{font-size:18px;padding:6px 18px 8px}
  .cast{flex-wrap:nowrap;gap:8px}
  .cast-card{width:118px;padding:7px 6px 8px;background:linear-gradient(180deg,var(--c) 0,var(--c) 30px,transparent 30px),var(--panel)}
  .cc-ava{--s:54px;border-width:3px}
  .cc-name{font-size:18px;margin-top:2px}
  .cc-title{font-size:9px}
  .cc-tag{display:none}
  .title-actions{flex-direction:row;flex-wrap:wrap;justify-content:center;gap:10px}
  .btn-xl{font-size:24px;min-height:54px;padding:10px 30px 13px}
  .btn-lg{font-size:18px;min-height:48px;padding:9px 18px 11px}
  .title-small .btn{font-size:14px;min-height:40px;padding:7px 11px 9px}
  .title-foot{display:none}
  .pick-grid{grid-template-columns:repeat(4,1fr);gap:10px}
  .pick{padding:10px 8px}
  .pk-ava{--s:70px}
  .pk-name{font-size:22px}
  .pk-tag{display:none}
  .flow{gap:9px;padding:4px 0}
  .scr-head h2{font-size:30px}
  .scr-head .btn-round{width:40px;height:40px}
  .who-chip{font-size:13px;padding:3px 12px 3px 3px}
  .wc-ava{--s:30px}
  .seg-b{min-height:40px;padding:7px 14px 9px;font-size:16px}
  .diff{flex-direction:row;flex-wrap:wrap;justify-content:center;gap:4px 12px}
  .diff-desc{width:100%}
  .start-row .btn-lg{min-width:180px}
  .mode-grid{grid-template-columns:1fr 1fr}
  .mode-card{padding:10px 12px;grid-template-columns:44px 1fr}
  .mc-ic{width:44px;height:44px;padding:8px}
  .mc-name{font-size:20px}
  .mc-desc{font-size:12px}
  .scr-end{gap:6px}
  .end-top{gap:3px}
  .end-kicker{display:none}
  .end-title{font-size:34px}
  .end-sub{font-size:13px;padding:3px 12px 3px 3px}
  .end-top.win .end-sub{padding:4px 12px}
  .es-ava{--s:22px}
  .end-card{width:min(860px,100%);display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"chips chips" "you act" "aw aw";align-items:center;column-gap:12px;row-gap:5px;padding:6px 10px 7px;border-radius:18px}
  .end-chips{grid-area:chips}
  .end-you{grid-area:you;justify-content:flex-start}
  .awards{grid-area:aw}
  .end-actions{grid-area:act;flex-wrap:nowrap;gap:8px}
  .end-chip.me .ec-name::after{content:none}
  .aw-name{display:none}
  .end-chips{flex-wrap:nowrap;gap:6px}
  .end-chip{gap:6px;padding:3px 10px 3px 3px}
  .ec-rank{width:20px;height:20px;font-size:13px}
  .ec-ava{--s:28px;border-width:2px}
  .ec-crown{left:32px;top:-11px;width:19px;height:19px}
  .ec-name{font-size:14px}
  .ec-val{font-size:12px}
  .end-you{font-size:12px;gap:3px 12px}
  .ey-k{padding:3px 7px;font-size:10px}
  .ey-v b{font-size:15px}
  .awards{flex-wrap:nowrap;gap:6px}
  .award{gap:6px;padding:3px 9px 3px 3px;border-radius:13px}
  .aw-ava{--s:26px;border-width:2px}
  .aw-ic{width:16px;height:16px;padding:2px;right:-5px;bottom:-4px}
  .aw-title{font-size:12px}
  .aw-name{font-size:10.5px}
  .aw-stat{display:none}
  .end-actions .btn-lg{min-height:44px;font-size:16px;padding:7px 14px 9px;border-radius:14px}
  .pause-panel{width:min(560px,100%)}
  .pause-btns{display:grid;grid-template-columns:1fr 1fr}
  .pause-btns .btn-lg{grid-column:1/-1}
  .pause-me{display:none}
  .modal-panel{max-height:100%}
}

/* ------------------------------------------------------------ touch + small-screen polish */
/* tap targets: 44px minimum on touch screens (the Skip pill grows an invisible border instead) */
.is-touch .hbtn{width:44px;height:44px}
.is-touch .tut-skip{border:9px solid transparent;border-radius:17px;background-clip:padding-box;margin:-9px -8px;padding:6px 9px;font-size:12px;line-height:14px}
.is-touch .link{padding:15px 10px}
.is-touch .title-small .btn,.is-touch .pb-btns .btn,.is-touch .seg-b{min-height:44px}
.is-touch .btn-round,.is-touch .scr-head .btn-round{width:44px;height:44px}
.is-touch .gc-key{display:none}
/* readable minimums */
.tut-dist{font-size:11px}
.pp-how{font-size:11px}
.sr-you span{font-size:10.5px;letter-spacing:0}
/* touch tablets: keep the road meter clear of the Action button */
@media (min-width:761px) and (min-height:501px){.is-touch .meter{bottom:calc(var(--sb) + 284px)}}
@media (max-width:640px){
  .br-val{font-size:12px}
  /* leave the right-hand column to the road meter */
  .hud-top{width:calc(100% - 84px);left:calc(50% - 26px)}
  .set-row .seg{display:flex;width:100%}
  .set-row .seg-b{flex:1;padding-left:6px;padding-right:6px}
  /* the Showdown board is a row taller */
  .hud:has(.board.showdown) .tut{top:calc(var(--st) + 162px)}
  .hud:has(.board.showdown) .hud-top{top:calc(var(--st) + 176px)}
  .hud:has(.board.showdown):has(.tut:not(.gone):not(.hidden):not(.wait):not(.yield)) .hud-top{top:calc(var(--st) + 226px)}
  .hud:has(.carry.show) .alerts .alert:nth-child(n+2){display:none}
  .carry.full .cp-l2{font-size:14px}
  /* next goal: a compact two-line chip under the cash ("Lv 8 $6.21K" / "-> Tanglemire"), so long biome
     names never run under the family board; the banners below step down to make room */
  .nextgoal{max-width:100%;padding:4px 10px 6px 4px;gap:6px;border-radius:13px}
  .ng-ic{width:22px;height:22px;padding:3px}
  .ng-k,.ng-word,.ng-more{display:none}
  .ng-copy{gap:2px;white-space:nowrap}
  .ng-l1{font-size:14px;gap:3px}
  .ng-l1 svg{width:14px;height:14px}
  .ng-l2{font-size:12px;line-height:1.1}
  .hud:has(.nextgoal:not([hidden])) .hud-top{top:calc(var(--st) + 178px)}
}
/* short phones (portrait): one alert, no chat log, slimmer pills; the weather chip steps aside while a
   prompt or carry pill needs the middle of the screen */
@media (max-width:640px) and (max-height:740px){
  .chat{display:none}
  .alerts .alert:nth-child(n+2){display:none}
  .meter{top:calc(var(--st) + 232px);bottom:calc(var(--sb) + 322px)}
  .hud:has(.prompt.show) .evchip,.hud:has(.carry.show) .evchip{display:none}
  .prompt,.carry{padding-top:3px;padding-bottom:3px}
  .pp-key,.prompt.tp .pp-key{width:36px;height:36px}
  .pp-verb{font-size:18px}
  .cp-arrow{width:36px;height:36px}
  .cp-arrow svg{width:20px;height:20px}
  .cp-l1{font-size:13px}
  .cp-l1 b{font-size:15px}
  .cp-l2{font-size:14px}
  .carry.tracker .cp-l1{font-size:16px}
  .carry.tracker .cp-l2{font-size:12px}
  .alert{font-size:13px;padding:4px 10px 5px 4px;gap:7px}
  .alert small{font-size:11.5px}
  .a-ava{--s:30px}
  .a-ic{width:30px;height:30px}
}
@media (max-height:500px) and (orientation:landscape){
  .cc-title{font-size:11px}
  .tut-num,.tut-count{display:none}
  .tut-copy b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tut-dist{white-space:normal;text-align:center;max-width:40px;line-height:1.1}
  .is-touch .tut-skip{padding:4px 6px;font-size:11px}
  .nextgoal{max-width:236px;padding:5px 10px 8px 5px;gap:6px;border-radius:14px}
  .ng-ic{width:24px;height:24px;padding:4px}
  .ng-k,.ng-long{display:none}
  .ng-short{display:inline}
  .ng-l1{font-size:14px}
  .ng-l2{font-size:11px}
  .br-val{font-size:12px}
  .hud:has(.carry.show) .alerts .alert:nth-child(n+2){display:none}
  /* photo booth editor: stage sized to the screen, zoom + actions beside it */
  .pb-editor{display:grid;grid-template-columns:auto minmax(0,1fr);grid-auto-rows:auto;column-gap:16px;row-gap:8px;align-items:start}
  .pb-editor > .mh{grid-column:1/-1;margin:0}
  .pb-work{display:contents}
  .pb-stage{grid-column:1;grid-row:2/span 4;width:calc(100vh - 120px);max-width:none}
  .pb-side{grid-column:2;grid-row:2;flex-direction:row;align-items:center;justify-content:flex-start;gap:12px}
  .pb-prev{width:76px;height:76px}
  .pb-prev-wrap span{display:none}
  .pb-tips{font-size:12px;line-height:1.4}
  .pb-zoom{grid-column:2;grid-row:3;margin:0;justify-content:flex-start}
  #ui .pb-zoom input[type=range]{width:100%}
  .pb-editor > .pb-msg{grid-column:2;margin:0}
  .pb-actions{grid-column:2;justify-content:flex-start;flex-wrap:wrap}
}
/* very short landscape phones (e.g. 667x375) */
@media (max-height:400px) and (orientation:landscape){
  .alerts .alert:nth-child(n+2){display:none}
  .hud-tl{width:222px}
  .tut{width:212px;max-width:212px}
  .hud-top{left:calc(var(--sl) + 228px);right:calc(var(--sr) + 176px);width:auto;min-width:0;max-width:none;transform:none}
  .stick-idle{left:calc(var(--sl) + 104px)}
  .meter{top:calc(var(--st) + 200px)}
  /* title: slim side-by-side cast cards so a returning player's whole title screen fits */
  .scr-title{gap:8px}
  .cast{width:100%;max-width:660px}
  .cast-card{flex:1 1 0;min-width:0;width:auto;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto;column-gap:7px;row-gap:3px;align-items:center;justify-items:start;
    padding:6px 7px 6px 6px;text-align:left;border-radius:16px;background:linear-gradient(90deg,var(--c) 0,var(--c) 26px,transparent 26px),var(--panel)}
  .cc-ava{--s:40px;grid-row:1/3}
  .cc-name{align-self:end;margin-top:0;font-size:17px}
  .cc-title{align-self:start;font-size:9.5px;padding:3px 6px;letter-spacing:.03em;line-height:1.1}
  .cc-the{display:none}
}

/* short portrait phones (iPhone SE and friends): the title screen fits without scrolling, returning
   players included, and the Showdown results card stays a slim lower third below the 3D podium */
@media (max-width:640px) and (max-height:760px) and (orientation:portrait){
  .scr-title{gap:10px;padding-top:max(14px,var(--st))}
  .logo-row{font-size:clamp(44px,7.4vh,58px)}
  .edition span{font-size:18px;padding:6px 20px 8px}
  .cast{gap:8px}
  .cast-card{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto;column-gap:8px;row-gap:3px;align-items:center;justify-items:start;
    padding:7px 8px 7px 7px;text-align:left;border-radius:18px;background:linear-gradient(90deg,var(--c) 0,var(--c) 31px,transparent 31px),var(--panel)}
  .cc-ava{--s:48px;grid-row:1/3;border-width:3px}
  .cc-name{align-self:end;margin-top:0;font-size:19px}
  .cc-title{align-self:start;font-size:9.5px;padding:3px 6px;letter-spacing:.04em;line-height:1.1}
  .cc-the{display:none}
  .title-actions{gap:10px;width:100%}
  .title-main{flex-wrap:nowrap;gap:10px;width:100%;max-width:420px}
  .title-main .btn-xl{flex:1 1 0;min-width:0;font-size:24px;min-height:58px;padding:10px 12px 13px;border-radius:19px}
  .title-main .btn-xl:only-child{flex:0 1 260px}
  .btn-cont{padding-left:10px;padding-right:12px;gap:8px}
  .btn-cont .bl span{font-size:20px}
  .btn-cont .bl small{font-size:10.5px}
  .btn-cont .btn-ava{--s:32px}
  .title-foot{display:none}

  .scr-end{gap:6px}
  .end-top{gap:4px}
  .end-kicker{font-size:11px}
  .end-title{font-size:40px}
  .end-sub{font-size:13px;padding:3px 12px 3px 3px}
  .end-top.win .end-sub{padding:5px 12px}
  .es-ava{--s:24px}
  .end-card{gap:6px;padding:8px 8px 9px;border-radius:18px}
  .end-chips{gap:5px}
  .end-chip{gap:5px;padding:3px 8px 3px 3px}
  .ec-rank{width:20px;height:20px;font-size:13px}
  .ec-ava{--s:26px;border-width:2px}
  .ec-crown{left:29px;top:-11px;width:19px;height:19px}
  .ec-copy{gap:2px}
  .ec-name{font-size:14px}
  .ec-val{font-size:12px}
  .end-you{gap:3px 8px;font-size:12px}
  .ey-net,.ey-bl{display:none}
  .ey-k{padding:3px 7px;font-size:11px}
  .ey-v b{font-size:15px}
  /* awards: a one-line ticker (menus.js rotates .on); tap it to see the next one */
  .awards{display:grid;grid-template-areas:"aw";justify-items:center;align-items:center;cursor:pointer}
  .award{grid-area:aw;gap:6px;padding:3px 10px 3px 3px;border-radius:13px;animation:none;opacity:0;visibility:hidden;transform:translateY(8px) scale(.94);
    transition:opacity .3s,transform .35s var(--spring),visibility 0s .35s}
  .award.on{opacity:1;visibility:visible;transform:none;transition:opacity .3s,transform .35s var(--spring)}
  .aw-ava{--s:26px;border-width:2px}
  .aw-ic{width:16px;height:16px;padding:2px;right:-5px;bottom:-4px}
  .aw-copy{flex-direction:row;align-items:baseline;gap:6px}
  .aw-title{font-size:14px}
  .aw-name{font-size:12px}
  .end-actions{flex-wrap:nowrap;gap:8px;width:100%}
  .end-actions .btn{flex:1 1 0;min-width:0}
  .end-actions .btn-lg{min-height:46px;font-size:18px;padding:8px 10px 10px;border-radius:16px}
}
/* portrait phones: Settings / Photo Booth / How to Play as three equal tiles (always one row) */
@media (max-width:640px) and (orientation:portrait){
  .title-small{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%;max-width:420px}
  .title-small .btn{flex-direction:column;gap:3px;min-height:0;padding:6px 4px 7px;font-size:13.5px;border-radius:14px;white-space:nowrap}
  .title-small .btn .bi{width:19px;height:19px}
}

/* narrow landscape phones (568-640 wide) also match the portrait max-width:640px rules above: undo the
   ones that only make sense standing up (they pushed the weather chip, banners and prompts behind the
   hotbar or off the top of the screen) */
@media (max-width:640px) and (max-height:500px) and (orientation:landscape){
  #ui .hud-top{top:var(--st)}
  .tut{position:static}
  .is-touch .hud-bottom .hotbar{margin-top:0}
  .meter{top:calc(var(--st) + 150px);bottom:calc(var(--sb) + 20px)}
  .hud:has(.prompt.show) .evchip,.hud:has(.carry.show) .evchip{display:flex}
  .cast{display:flex}
  .end-chips{display:flex}
}
@media (max-width:640px) and (max-height:400px) and (orientation:landscape){
  .meter{top:calc(var(--st) + 200px)}
}

/* ------------------------------------------------------------ keyframes */
@keyframes fadeIn{from{opacity:0}}
@keyframes fadeOut{to{opacity:0}}
@keyframes popIn{from{opacity:0;transform:scale(.6) rotate(-3deg)}}
@keyframes panelIn{from{opacity:0;transform:translateY(24px) scale(.92)}}
@keyframes cardIn{from{opacity:0;transform:translateY(26px) scale(.9)}}
@keyframes logoDrop{0%{opacity:0;transform:translateY(-60px) rotate(-8deg) scale(.8)}100%{opacity:1}}
@keyframes sway{0%,100%{transform:translateX(-38%) rotate(8deg)}50%{transform:translateX(-38%) rotate(22deg)}}
@keyframes alertIn{0%{opacity:0;transform:translateY(-18px) scale(.85)}100%{opacity:1;transform:none}}
@keyframes alertOut{to{opacity:0;transform:translateY(-10px) scale(.92)}}
@keyframes alertBump{0%{transform:scale(1)}40%{transform:scale(1.07)}100%{transform:scale(1)}}
@keyframes urgent{from{box-shadow:inset 0 2px 0 rgba(255,255,255,.28),0 5px 0 rgba(10,14,40,.6),0 0 0 rgba(255,59,92,0)}to{box-shadow:inset 0 2px 0 rgba(255,255,255,.28),0 5px 0 rgba(10,14,40,.6),0 0 22px 4px rgba(255,59,92,.85)}}
@keyframes shake{0%,100%{transform:none}25%{transform:translateX(-6px) rotate(-1deg)}75%{transform:translateX(6px) rotate(1deg)}}
@keyframes revealIn{0%{opacity:0;transform:scale(.3) rotate(-8deg)}100%{opacity:1;transform:none}}
@keyframes annIn{0%{opacity:0;transform:scale(.4)}100%{opacity:1;transform:none}}
@keyframes countIn{0%{opacity:0;transform:scale(2)}30%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.9)}}
@keyframes momentOut{to{opacity:0;transform:translateY(-30px) scale(.9)}}
@keyframes promptIn{0%{transform:scale(.8)}100%{transform:none}}
@keyframes cashBump{0%{transform:scale(1)}40%{transform:scale(1.18)}100%{transform:scale(1)}}
@keyframes popUp{0%{opacity:0;transform:translate(0,6px) scale(.7)}15%{opacity:1;transform:translate(0,-4px) scale(1.1)}100%{opacity:0;transform:translate(0,-38px) scale(1)}}
@keyframes popDown{0%{opacity:0;transform:translateY(-4px)}15%{opacity:1}100%{opacity:0;transform:translateY(26px)}}
@keyframes pulse{from{opacity:1}to{opacity:.55}}
@keyframes vig{from{opacity:.55}to{opacity:1}}
@keyframes slotPress{0%{transform:translateY(-6px) scale(1)}40%{transform:translateY(-2px) scale(.88)}100%{transform:translateY(-6px) scale(1)}}
@keyframes chatIn{from{opacity:0;transform:translateX(-14px)}}
@keyframes chatOut{to{opacity:0}}
@keyframes tutPop{0%{transform:scale(1)}35%{transform:scale(1.06)}100%{transform:scale(1)}}
@keyframes bubbleIn{from{opacity:0;transform:translateY(8px) scale(.7)}}
@keyframes thief{from{transform:scale(1)}to{transform:scale(1.08)}}
@keyframes flash{50%{background:#fff;color:var(--red)}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes incPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes alertBounce{from{transform:translateY(0) scale(1)}to{transform:translateY(-6px) scale(1.12)}}
@keyframes rainbowPan{to{background-position:200% 0,0 0}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes spinSlow{0%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}100%{transform:rotate(-8deg)}}
@keyframes nope{0%,100%{transform:none}20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
@keyframes bought{0%{transform:scale(1)}35%{transform:scale(1.06);box-shadow:0 0 0 4px var(--cash)}100%{transform:scale(1)}}
@keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-10deg)}75%{transform:rotate(10deg)}}
@keyframes podIn{0%{opacity:0;transform:translateY(80px)}100%{opacity:1;transform:none}}
@keyframes crownBob{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-6px) rotate(6deg)}}
@keyframes confetti{0%{transform:translate(0,0) rotate(0)}100%{transform:translate(var(--x),110vh) rotate(var(--r))}}
@keyframes actPop{0%{transform:scale(.7)}100%{transform:none}}

@media (pointer:coarse){.scr,.modal-back{backdrop-filter:none}}
@media (prefers-reduced-motion:reduce){
  #ui *,#ui *::before,#ui *::after,.labels-layer *{animation-duration:.001s!important;animation-iteration-count:1!important;transition-duration:.001s!important}
  .confetti,.rv-rays,.vignette{display:none!important}
}
`;

function addFonts() {
  // Fonts are embedded (ui/fonts.js), so they work offline and in sandboxed pages. Until the display face
  // is ready, <html class="no-webfont"> makes the system fallback heavier so headings stay chunky.
  const root = document.documentElement;
  root.classList.add('no-webfont');
  try {
    if (document.getElementById('ui-fonts')) return;
    const st = document.createElement('style');
    st.id = 'ui-fonts';
    st.textContent = FONT_FACES;
    document.head.appendChild(st);
    fontsReady(4000).then(() => {
      try {
        if (document.fonts?.check?.('20px "Lilita One"')) root.classList.remove('no-webfont');
      } catch {
        /* FontFaceSet unsupported */
      }
    });
  } catch {
    /* fonts are a nice-to-have */
  }
}

export function injectStyles() {
  if (document.getElementById('ui-styles')) return;
  addFonts();
  const s = document.createElement('style');
  s.id = 'ui-styles';
  s.textContent = css;
  document.head.appendChild(s);
}
