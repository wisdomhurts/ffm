// Styles for the social HUD (emote / quick-chat wheel, Trade / Gift chip, invites, gift picker, trade
// window). Injected once as <style id="sas-social">; uses the game's tokens from ui/styles.js
// (--ink, --panel, --fd Lilita One, --fb Nunito, .btn colours) so it matches the rest of the UI.

const css = `
/* ------------------------------------------------------------ emote button */
.soc-emobtn{position:absolute;z-index:3;right:calc(var(--sr) + 110px);bottom:calc(var(--sb) + 188px);width:56px;height:56px;padding:8px;display:none;place-items:center;
  border-radius:50%;border:3.5px solid var(--ink);background:radial-gradient(circle at 42% 30%,#c59bff,#7b3fe0);cursor:pointer;pointer-events:auto;touch-action:none;
  box-shadow:inset 0 3px 0 rgba(255,255,255,.4),inset 0 -5px 0 rgba(0,0,0,.18),0 5px 0 rgba(10,14,40,.75);transition:transform .08s,box-shadow .08s,opacity .2s;-webkit-user-select:none;user-select:none}
.is-touch .soc-emobtn{display:grid}
.soc-emobtn.down{transform:translateY(3px) scale(.93);box-shadow:inset 0 3px 0 rgba(255,255,255,.4),0 2px 0 rgba(10,14,40,.75)}
.soc-emobtn.off,.hud.intro .soc-emobtn,.hud:not([data-state=playing]) .soc-emobtn{opacity:0;visibility:hidden;pointer-events:none}
.soc-emobtn .sico{filter:drop-shadow(0 2px 0 rgba(0,0,0,.25))}
.soc-emo-hbtn{padding:7px}
.soc-emo-hbtn .sico{width:28px;height:28px}
.is-touch .soc-emo-hbtn{display:none}
.soc-cool{position:absolute;inset:-5px;border-radius:50%;pointer-events:none;background:conic-gradient(rgba(16,22,58,.55) calc(var(--f,0)*360deg),transparent 0)}

/* ------------------------------------------------------------ the wheel */
.sw-layer{position:absolute;inset:0;z-index:40;display:grid;place-items:center;pointer-events:auto;touch-action:none;padding:var(--st) var(--sr) var(--sb) var(--sl)}
.sw-back{position:absolute;inset:0;background:radial-gradient(circle at 50% 52%,rgba(8,12,34,.18),rgba(8,12,34,.58));animation:socFade .18s both}
.sw-layer.out .sw-back{animation:socFadeOut .16s forwards}
.sw-box{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;animation:socPop .3s var(--spring) both}
.sw-layer.out .sw-box{animation:socPopOut .16s ease-in forwards}
.sw-tabs{display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(16,22,58,.94);border:3px solid var(--ink);box-shadow:0 4px 0 rgba(10,14,40,.6)}
.sw-tab{display:flex;align-items:center;gap:6px;min-height:36px;padding:6px 14px 7px;border:0;border-radius:999px;background:none;color:var(--txt2);cursor:pointer;
  font:var(--fdw) 17px/1 var(--fd);letter-spacing:.02em;transition:background .15s,color .15s}
.sw-tab:hover{color:#fff}
.sw-tab.on{color:#fff;background:linear-gradient(180deg,#5cb8ff,#2a6fe6);box-shadow:inset 0 2px 0 rgba(255,255,255,.3),0 0 0 2.5px var(--ink);text-shadow:0 2px 0 rgba(0,0,0,.3)}
.sw-tab kbd{font:900 11px/1 var(--fb);padding:3px 5px 4px;border-radius:6px;background:rgba(255,255,255,.16);color:#fff}
.is-touch .sw-tab kbd{display:none}
.sw-wheel{--R:170px;position:relative;width:calc(var(--R)*2);height:calc(var(--R)*2);flex:none}
.sw-ring{position:absolute;inset:0;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 6px 0 rgba(10,14,40,.55))}
.sw-ring path{fill:url(#swFill);stroke:var(--ink);stroke-width:2.4;stroke-linejoin:round;transition:fill .1s}
.sw-ring path.hot{fill:url(#swHot)}
.sw-ring path.off{fill:rgba(30,36,72,.92)}
.sw-item{position:absolute;left:50%;top:50%;width:92px;height:84px;margin:-42px 0 0 -46px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  transform:rotate(var(--a)) translateY(calc(var(--R) * -.655)) rotate(calc(var(--a) * -1));pointer-events:none;border:0;padding:0;background:none;color:#fff}
.sw-ic{width:42px;height:42px;flex:none;transition:transform .16s var(--spring);filter:drop-shadow(0 2px 0 rgba(0,0,0,.28))}
.sw-lb{max-width:88px;font:var(--fdw) 15px/1.05 var(--fd);letter-spacing:.02em;text-align:center;text-shadow:var(--o1)}
.sw-item.say .sw-ic{width:36px;height:36px}
.sw-item.say .sw-lb{font-size:14px}
.sw-item.hot .sw-ic{transform:scale(1.2) rotate(-6deg)}
.sw-item.hot .sw-lb{color:var(--ink);text-shadow:none}
.sw-item.off .sw-ic{filter:grayscale(1) brightness(.7);opacity:.6}
.sw-item.off .sw-lb{opacity:.55}
.sw-item.pick .sw-ic{animation:socPick .32s var(--spring)}
.sw-n{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px;border-radius:50%;display:grid;place-items:center;pointer-events:none;
  transform:rotate(var(--a)) translateY(calc(var(--R) * -.93)) rotate(calc(var(--a) * -1));font:var(--fdw) 13px/1 var(--fd);color:var(--ink);background:#fff;border:2px solid var(--ink);box-shadow:0 2px 0 rgba(10,14,40,.5)}
.is-touch .sw-n{display:none}
.sw-hub{position:absolute;left:50%;top:50%;width:calc(var(--R)*.7);height:calc(var(--R)*.7);transform:translate(-50%,-50%);border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  background:radial-gradient(circle at 50% 35%,#46559f,#1d2658);border:3px solid var(--ink);box-shadow:inset 0 3px 0 rgba(255,255,255,.16),0 0 0 3px rgba(255,255,255,.08);padding:8px;text-align:center;pointer-events:none}
.sw-hub-t{font:var(--fdw) 19px/1 var(--fd);letter-spacing:.02em;text-shadow:0 2px 0 rgba(0,0,0,.35);max-width:100%;overflow-wrap:anywhere}
.sw-hub-s{font:800 11px/1.2 var(--fb);color:var(--txt2);max-width:100%}
.sw-x{position:absolute;right:-6px;top:-6px;width:40px;height:40px;padding:9px;border-radius:50%;border:3px solid var(--ink);color:#fff;cursor:pointer;pointer-events:auto;
  background:linear-gradient(180deg,#ff6b80,#dc2548);box-shadow:inset 0 2px 0 rgba(255,255,255,.3),0 3px 0 var(--ink)}
.sw-x svg{width:100%;height:100%}
.sw-hint{font:800 12px/1.2 var(--fb);color:var(--txt2);text-shadow:0 1px 0 rgba(0,0,0,.6);text-align:center;padding:5px 12px 6px;border-radius:999px;
  background:rgba(16,22,58,.94);border:2px solid var(--ink);box-shadow:0 3px 0 rgba(10,14,40,.5)}
/* while the wheel is up, the bottom-centre pills step out from under it (they'd show through its hint) */
.hud.soc-wheel-open .prompt,.hud.soc-wheel-open .carry,.hud.soc-wheel-open .hud-slot-social{visibility:hidden;opacity:0;transition:none}
.sw-hint kbd{font:900 11px/1 var(--fb);padding:2px 5px 3px;border-radius:5px;background:rgba(255,255,255,.18);color:#fff;margin:0 1px}
.is-touch .sw-hint{display:none}
.sw-wheel.nope{animation:socNope .32s}

/* emote pop over a player's head (world label) */
.lbl.emolbl{text-shadow:none}
.emo-pop{width:40px;height:40px;padding:5px;border-radius:50%;background:#fff;border:2.5px solid var(--ink);box-shadow:0 3px 0 rgba(10,14,40,.45);margin-bottom:6px;animation:socEmoPop .45s var(--spring) both}
.emo-pop .sico{width:100%;height:100%}

/* a player's name as a coloured pill */
.soc-who{display:inline-block;padding:0 7px 1px;border-radius:8px;background:var(--c,#556);border:2px solid var(--ink);color:#fff;font:var(--fdw) 1em/1.2 var(--fd);letter-spacing:.02em;
  text-shadow:0 1px 0 rgba(0,0,0,.35);white-space:nowrap;vertical-align:baseline}

/* ------------------------------------------------------------ chip + invite (bottom dock) */
.hud:not([data-state=playing]) .soc-dock,.hud.intro .soc-dock{display:none}
/* an invite is wide: on narrow phones it draws over the road meter's edge rather than under it */
/* (4: above the meter's own marker (3); the centre reveal card (4, later in the HUD) still goes on top) */
.hud-bottom:has(.soc-invite){z-index:4}
/* phones: an invite needs an answer, a quest / badge toast is just news: the toast waits while it's up */
@media (max-width:640px),(max-height:500px){.hud:has(.soc-invite) .pg-toasts:not(.global){visibility:hidden}}
.soc-dock{display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;max-width:100%}
.soc-dock:empty{display:none}
.soc-chip{display:flex;align-items:center;gap:8px;max-width:100%;padding:5px 6px 5px 5px;border-radius:999px;pointer-events:auto;
  background:rgba(16,22,58,.93);border:3px solid var(--ink);box-shadow:0 4px 0 rgba(10,14,40,.6),inset 0 0 0 2px rgba(255,255,255,.07);animation:socUp .3s var(--spring) both}
.soc-chip.pulse{animation:socUp .3s var(--spring) both,socGlow 1s ease-in-out 3}
.sc-ava{--s:34px}
.sc-name{font:var(--fdw) 17px/1 var(--fd);letter-spacing:.02em;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 2px 0 rgba(0,0,0,.35)}
.sc-name small{display:block;font:800 10.5px/1.1 var(--fb);color:var(--txt2);letter-spacing:0;text-shadow:none}
.soc-chip .btn,.soc-invite .btn,.soc-sheet .btn{text-transform:none}
.sc-b{min-height:40px;padding:6px 12px 8px 8px;font-size:16px;border-radius:999px;gap:6px}
.sc-b .bi{width:24px;height:24px}
.sc-b kbd,.si-b kbd{font:900 11px/1 var(--fb);padding:3px 5px 4px;border-radius:6px;background:rgba(16,22,58,.35);margin-left:2px;text-shadow:none}
.is-touch .sc-b kbd,.is-touch .si-b kbd{display:none}
.sc-wait{font:800 13px/1.2 var(--fb);color:var(--txt2);padding:0 4px;white-space:nowrap}
.sc-wait b{color:#fff}
.soc-invite{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:6px 10px;width:min(360px,100%);padding:9px 10px 12px 9px;border-radius:20px;
  pointer-events:auto;background:var(--panel);border:3px solid var(--ink);box-shadow:var(--panel-sh);overflow:hidden;animation:socUp .35s var(--spring) both}
.si-ava{--s:46px}
.si-t{font:var(--fdw) 19px/1.05 var(--fd);letter-spacing:.02em;text-shadow:0 2px 0 rgba(0,0,0,.35)}
.si-t small{display:block;font:800 12px/1.2 var(--fb);color:var(--txt2);letter-spacing:0;text-shadow:none;margin-top:2px}
.si-btns{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.si-b{min-height:44px;font-size:18px;padding:8px 10px 10px}
.si-bar{position:absolute;left:0;right:0;bottom:0;height:5px;background:rgba(255,255,255,.12)}
.si-bar i{display:block;height:100%;background:var(--gold);transform-origin:0 50%;transform:scaleX(var(--f,1))}

/* ------------------------------------------------------------ sheets (gift picker, trade window) */
.soc-sheet{position:absolute;inset:0;z-index:45;display:grid;place-items:center;pointer-events:auto;padding:var(--st) var(--sr) var(--sb) var(--sl)}
.soc-sheet.out{pointer-events:none}
.ss-back{position:absolute;inset:0;background:rgba(8,12,34,.62);animation:socFade .2s both}
.soc-sheet.out .ss-back{animation:socFadeOut .18s forwards}
.ss-panel{position:relative;width:min(760px,100%);max-height:100%;overflow-y:auto;overflow-x:hidden;padding:14px 16px 16px;border-radius:24px;border:3px solid var(--ink);background:var(--panel);
  box-shadow:var(--panel-sh);animation:socPop .3s var(--spring) both;scrollbar-width:thin}
.soc-sheet.out .ss-panel{animation:socPopOut .18s ease-in forwards}
.ss-head{display:flex;align-items:center;gap:10px;margin:0 0 10px;padding-right:46px;min-height:40px}
.ss-ic{width:38px;height:38px;flex:none}
.ss-title{font:var(--fdw) 26px/1 var(--fd);letter-spacing:.03em;text-shadow:var(--o1),0 3px 0 var(--ink)}
.ss-with{display:flex;align-items:center;gap:7px;font:800 14px/1 var(--fb);color:var(--txt2);min-width:0}
.ss-with b{font:var(--fdw) 19px/1 var(--fd);color:#fff;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ss-with .ava{--s:30px}
.ss-x{position:absolute;right:12px;top:12px;width:42px;height:42px;padding:9px;border-radius:50%;border:3px solid var(--ink);color:#fff;cursor:pointer;z-index:2;
  background:linear-gradient(180deg,#ff6b80,#dc2548);box-shadow:inset 0 2px 0 rgba(255,255,255,.3),0 3px 0 var(--ink);transition:transform .15s var(--spring)}
.ss-x:hover{transform:rotate(90deg)}
.ss-x svg{width:100%;height:100%}
.ss-sub{font:800 13.5px/1.3 var(--fb);color:var(--txt2);margin:0 0 8px}
.ss-sub b{color:#fff}
.ss-empty{padding:18px 10px;border-radius:16px;background:rgba(10,14,40,.35);text-align:center;font:800 14px/1.35 var(--fb);color:var(--txt2)}
.ss-empty b{display:block;font:var(--fdw) 20px/1.1 var(--fd);color:#fff;margin-bottom:3px}

/* plant cards */
.spc{--rc:#b8c0cc;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:1px;min-width:0;padding:6px 4px 7px;border-radius:14px;
  border:3px solid var(--ink);color:#fff;text-align:center;cursor:pointer;font-family:var(--fb);
  background:linear-gradient(180deg,color-mix(in srgb,var(--rc) 42%,#2b387a),#1d2658 78%);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--rc) 70%,transparent),inset 0 3px 0 rgba(255,255,255,.14),0 4px 0 var(--ink);
  transition:transform .14s var(--spring),box-shadow .14s,filter .14s}
button.spc:hover{transform:translateY(-2px)}
button.spc:active{transform:translateY(2px)}
.spc.r-secret{background:linear-gradient(180deg,#26203a,#07060c 80%);box-shadow:inset 0 0 0 2px rgba(255,255,255,.35),0 4px 0 var(--ink)}
.spc.r-secret::before{content:'';position:absolute;inset:-3px;border-radius:14px;padding:3px;background:var(--rainbow);background-size:200% 100%;animation:rainbowPan 2s linear infinite;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.spc-ic{width:50px;height:50px;flex:none;filter:drop-shadow(0 2px 0 rgba(0,0,0,.25))}
.spc-mut{min-height:12px;font-size:10.5px}
.spc-name{font:var(--fdw) 13.5px/1.05 var(--fd);letter-spacing:.01em;text-shadow:0 2px 0 rgba(0,0,0,.4);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;min-height:2.1em;align-content:center}
.spc-inc{font:var(--fdw) 14px/1 var(--fd);color:var(--cash);text-shadow:0 2px 0 rgba(0,0,0,.4);margin-top:2px}
.spc-grow{font:900 10px/1 var(--fb);color:#ffe066;letter-spacing:.02em;margin-top:2px}
.spc-tick{position:absolute;right:-7px;top:-7px;width:26px;height:26px;padding:4px;border-radius:50%;background:var(--green);border:2.5px solid var(--ink);color:#fff;display:none;box-shadow:0 2px 0 var(--ink)}
.spc-tick svg{width:100%;height:100%}
.spc.sel{filter:brightness(.72) saturate(.8)}
.spc.sel .spc-tick{display:block}
.spc.busy{filter:grayscale(.8) brightness(.6);cursor:not-allowed}
.spc.busy::after{content:attr(data-busy);position:absolute;left:4px;right:4px;top:40%;padding:3px 2px;border-radius:7px;background:var(--red);border:2px solid var(--ink);font:900 10px/1 var(--fb);letter-spacing:.04em}
.spc.flash{animation:socFlash .5s ease-in-out 3}
.ss-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;padding:4px 2px 6px}

/* gift picker */
.sg-confirm{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:center;padding:6px 2px}
.sg-confirm .spc{width:128px;cursor:default;padding:10px 6px 12px}
.sg-confirm .spc-ic{width:78px;height:78px}
.sg-confirm .spc-name{font-size:17px}
.sg-q{font:var(--fdw) 22px/1.15 var(--fd);letter-spacing:.02em;text-shadow:0 2px 0 rgba(0,0,0,.35)}
.sg-q b{color:var(--gold)}
.sg-note{font:800 13px/1.35 var(--fb);color:var(--txt2);margin-top:6px}
.sg-note.bad{color:#ff9aab}
.ss-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:12px}
.ss-actions .btn{min-width:150px}

/* trade window */
.st-offers{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:10px;align-items:stretch}
.st-swap{align-self:center;width:40px;height:40px}
.st-side{position:relative;display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:18px;background:rgba(10,14,40,.38);border:3px solid rgba(10,14,40,.6);transition:box-shadow .2s,border-color .2s}
.st-side.ready{border-color:var(--green);box-shadow:0 0 0 2px var(--ink),0 0 16px rgba(63,214,90,.55)}
.st-side.changed{border-color:#ffd23f;box-shadow:0 0 0 2px var(--ink),0 0 18px rgba(255,210,63,.6)}
.st-side.flash{animation:socSideFlash .45s ease-in-out 4}
.st-slot .spc.new{box-shadow:0 0 0 3px #ffd23f,0 0 16px rgba(255,210,63,.75),0 4px 0 var(--ink)}
.st-h{display:flex;align-items:center;gap:6px;min-height:26px;font:var(--fdw) 17px/1 var(--fd);letter-spacing:.03em;text-transform:uppercase;text-shadow:0 2px 0 rgba(0,0,0,.35)}
.st-h .ava{--s:24px}
.st-h span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.st-changed{position:absolute;right:10px;top:-11px;z-index:1;flex:none;padding:3px 7px 4px;box-shadow:0 2px 0 var(--ink);border-radius:8px;background:#ffb627;color:var(--ink);border:2px solid var(--ink);font:900 10.5px/1 var(--fb);letter-spacing:.04em;text-transform:uppercase;animation:socNope .4s}
.st-slots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.st-slot{min-height:118px}
.st-slot.empty{display:grid;place-items:center;border-radius:14px;border:3px dashed rgba(201,211,255,.28);color:rgba(201,211,255,.4);font:var(--fdw) 28px/1 var(--fd)}
.st-slot.empty span{font:800 10.5px/1.2 var(--fb);display:block;letter-spacing:0;margin-top:2px}
.st-slot .spc{width:100%;height:100%}
.st-cash{display:flex;align-items:center;gap:6px;min-height:44px}
.st-coin{width:26px;height:26px;flex:none}
.st-cash input{-webkit-user-select:text;user-select:text;touch-action:manipulation;flex:1;min-width:0;width:100%;height:40px;padding:0 8px;border-radius:12px;border:3px solid var(--ink);background:#fff;color:var(--ink);font:var(--fdw) 19px/1 var(--fd);text-align:center;
  -moz-appearance:textfield;appearance:textfield}
.st-cash input::-webkit-outer-spin-button,.st-cash input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.st-cash input:focus{outline:3px solid var(--gold);outline-offset:1px}
.st-step{width:40px;height:40px;min-height:0;padding:0;border-radius:12px;font-size:24px;flex:none}
.st-cashv{font:var(--fdw) 22px/1 var(--fd);color:var(--cash);text-shadow:0 2px 0 rgba(0,0,0,.4)}
.st-ready{width:100%;min-height:48px;font-size:21px}
.st-ready.on{--b1:#63f27f;--b2:#1fb043}
.st-ready .bi{width:24px;height:24px}
.st-ready.locked{filter:grayscale(.6) brightness(.8)}
.st-ready.locked::after{content:'';position:absolute;left:10px;right:10px;bottom:5px;height:4px;border-radius:2px;background:rgba(255,255,255,.7);transform-origin:0 50%;animation:socLock var(--lock,1s) linear forwards}
.st-state{display:flex;align-items:center;justify-content:center;gap:7px;min-height:48px;border-radius:16px;border:3px dashed rgba(201,211,255,.3);font:var(--fdw) 19px/1 var(--fd);color:var(--txt2);letter-spacing:.02em}
.st-state.on{border:3px solid var(--ink);color:#fff;background:linear-gradient(180deg,#63f27f,#1fb043);text-shadow:0 2px 0 rgba(0,0,0,.3)}
.st-state .bi{width:22px;height:22px}
.st-bar{display:flex;align-items:center;gap:8px;min-height:40px;margin:10px 0 0;padding:8px 12px;border-radius:14px;background:rgba(10,14,40,.4);font:800 13px/1.3 var(--fb);color:var(--txt2)}
.st-bar b{color:#fff}
.st-bar.warn{background:linear-gradient(180deg,#ffb627,#ff8a00);color:var(--ink)}
.st-bar.warn b{color:var(--ink)}
.st-bar.bad{background:linear-gradient(180deg,#ff6b80,#dc2548);color:#fff}
.st-bar.count{justify-content:center;background:linear-gradient(180deg,#63f27f,#1fb043);color:#fff;font:var(--fdw) 22px/1 var(--fd);letter-spacing:.03em;text-shadow:0 2px 0 rgba(0,0,0,.3)}
.st-bar.count b{display:inline-grid;place-items:center;vertical-align:middle;margin-left:8px;width:40px;height:40px;border-radius:50%;background:#fff;color:var(--ink);border:3px solid var(--ink);font-size:26px;text-shadow:none;animation:socTick 1s ease-out infinite}
.st-bar .bi{width:22px;height:22px;flex:none}
.st-garden{margin-top:12px}
.st-gh{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0 0 6px;font:var(--fdw) 17px/1 var(--fd);letter-spacing:.03em;text-transform:uppercase}
.st-gh small{font:800 12px/1 var(--fb);color:var(--txt2);text-transform:none;letter-spacing:0}
.st-plants{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:9px;padding:4px 2px 6px}
.st-done{display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 4px 4px;text-align:center}
.st-done-t{font:var(--fdw) 34px/1 var(--fd);letter-spacing:.03em;color:var(--gold);text-shadow:var(--o2);animation:socPop .5s var(--spring) both}
.st-done-s{font:800 14px/1.3 var(--fb);color:var(--txt2)}
.st-done-got{display:flex;flex-wrap:wrap;gap:9px;justify-content:center}
.st-done-got .spc{width:104px;cursor:default}
.st-done-cash{font:var(--fdw) 26px/1 var(--fd);color:var(--cash);text-shadow:0 2px 0 rgba(0,0,0,.4)}

/* wide screens: four plants across per side */
@media (min-width:900px) and (min-height:560px){
  .soc-trade{width:min(940px,100%)}
  .soc-trade .st-slots{grid-template-columns:repeat(4,minmax(0,1fr))}
  .soc-trade .st-slot{min-height:122px}
}

/* ------------------------------------------------------------ phones */
@media (max-width:640px){
  .soc-emobtn{right:calc(var(--sr) + 104px);bottom:calc(var(--sb) + 186px);width:52px;height:52px;padding:7px}
  .sw-tab{font-size:16px;padding:6px 12px 7px}
  .sw-item{width:80px;margin-left:-40px}
  .sw-lb{font-size:13.5px;max-width:78px}
  .sw-item.say .sw-lb{font-size:12.5px}
  .sw-ic{width:38px;height:38px}
  .sw-item.say .sw-ic{width:32px;height:32px}
  .sw-hub-t{font-size:17px}
  .ss-panel{padding:12px 10px 12px;border-radius:20px;width:100%}
  .ss-title{font-size:22px}
  .ss-with{font-size:12px}
  .ss-with b{font-size:16px}
  .ss-head{gap:7px;padding-right:44px;margin-bottom:8px}
  .ss-ic{width:32px;height:32px}
  .st-offers{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
  .st-swap{display:none}
  .st-side{padding:7px;gap:6px;border-radius:15px}
  .st-h{font-size:14px;min-height:22px}
  .st-h .ava{--s:20px}
  .st-slots{gap:6px}
  .st-slot{min-height:104px}
  .st-slot .spc-ic{width:40px;height:40px}
  .spc-name{font-size:12px}
  .spc-inc{font-size:12.5px}
  .st-cash{gap:4px}
  .st-step{width:34px;height:36px;font-size:21px;border-radius:10px}
  .st-cash input{height:36px;font-size:16px;padding:0 4px}
  .st-coin{display:none}
  .st-ready{min-height:44px;font-size:18px;padding:8px 6px 10px}
  .st-state{min-height:44px;font-size:16px}
  .st-plants,.ss-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
  .st-plants .spc-ic,.ss-grid .spc-ic{width:42px;height:42px}
  /* compact chip: the friend's face (their name floats over their head anyway) and the two buttons */
  .soc-chip .sc-name{display:none}
  .soc-chip{gap:6px}
  /* the chat log sits where the Trade / Gift dock can be: lift it clear of the dock's real top (trade.js
     measures it; the dock rides higher while the carry pill shows) */
  .hud.soc-docked .chat{bottom:max(calc(var(--sb) + 340px),var(--soc-dock-clear,0px))}
  .hud.soc-docked .cl:nth-last-child(n+3){display:none}
  .sc-b{padding:6px 10px 8px 6px;font-size:15px}
  .sg-confirm{grid-template-columns:1fr;justify-items:center;text-align:center}
}
/* short landscape phones: everything in one screen, offers in a row */
@media (max-height:500px) and (orientation:landscape){
  .soc-emobtn{right:calc(var(--sr) + 92px);bottom:calc(var(--sb) + 96px);width:46px;height:46px;padding:6px}
  .sw-box{flex-direction:row;gap:12px}
  .sw-tabs{flex-direction:column;border-radius:22px}
  .sw-tab{min-height:40px}
  .sw-item{width:78px;height:72px;margin:-36px 0 0 -39px;gap:2px}
  .sw-ic{width:34px;height:34px}
  .sw-item.say .sw-ic{width:28px;height:28px}
  .sw-lb{font-size:12.5px;max-width:76px}
  .sw-item.say .sw-lb{font-size:12px}
  .sw-hub-t{font-size:15px}
  .sw-hub-s{font-size:9.5px;line-height:1.1}
  .ss-panel{width:min(720px,100%);padding:8px 10px 9px;border-radius:18px}
  .ss-head{margin-bottom:4px;min-height:30px}
  .ss-with .ava{--s:24px}
  .ss-with b{font-size:16px}
  .ss-title{font-size:20px}
  .ss-ic{width:28px;height:28px}
  .ss-x{width:36px;height:36px;padding:8px;right:8px;top:8px}
  .st-offers{gap:6px}
  .st-swap{width:28px;height:28px}
  .st-side{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"h h" "s s" "c r";padding:6px;gap:5px;border-radius:14px}
  .st-h{grid-area:h;font-size:13px;min-height:20px}
  .st-slots{grid-area:s;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
  .st-slot{min-height:70px}
  .st-slot .spc{padding:3px 2px 4px}
  .st-slot .spc-ic{width:32px;height:32px}
  .st-slot .spc-name{font-size:10.5px;min-height:0;-webkit-line-clamp:1;line-clamp:1}
  .st-slot .spc-mut{font-size:9px;min-height:10px}
  .st-slot .spc-inc{font-size:11px}
  .st-slot .spc-grow{display:none}
  .st-cash{grid-area:c;min-height:36px;gap:3px}
  .st-coin{display:none}
  .st-step{width:30px;height:34px;font-size:19px;border-radius:9px}
  .st-cash input{height:34px;font-size:15px;padding:0 2px}
  .st-cashv{font-size:18px}
  .st-ready,.st-state{grid-area:r;min-height:36px;font-size:15px;padding:5px 6px 7px;border-radius:12px}
  .st-ready .bi,.st-state .bi{width:18px;height:18px}
  .st-bar{margin-top:5px;padding:4px 10px;min-height:30px;font-size:12px}
  .st-bar.count{font-size:18px}
  .st-bar.count b{width:30px;height:30px;font-size:20px}
  .st-garden{margin-top:5px}
  .st-gh{font-size:13px;margin-bottom:2px}
  .st-gh small{display:none}
  .st-plants{display:flex;overflow-x:auto;overflow-y:hidden;gap:7px;padding:3px 2px 6px;scrollbar-width:thin}
  .st-plants .spc{flex:0 0 84px;padding:2px 3px 4px}
  .st-plants .spc-ic{width:30px;height:30px}
  .st-plants .spc-grow{display:none}
  .st-done{flex-direction:row;flex-wrap:wrap;justify-content:center;gap:6px 14px;padding:0 4px}
  .st-done-t{flex-basis:100%;font-size:26px}
  .st-done-s{flex-basis:100%;font-size:12.5px}
  .st-done-got .spc{width:92px}
  .st-done-got .spc-ic{width:40px;height:40px}
  .st-done .ss-actions{flex-basis:100%;margin-top:4px}
  .st-plants .spc-name{font-size:11px;min-height:0;-webkit-line-clamp:1;line-clamp:1}
  .ss-grid{grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:7px}
  .ss-grid .spc-ic{width:38px;height:38px}
  .sg-confirm .spc{width:108px}
  .sg-confirm .spc-ic{width:60px;height:60px}
  .sg-q{font-size:19px}
  .ss-actions{margin-top:8px}
  .ss-actions .btn{min-height:44px;font-size:18px;padding:8px 18px 10px}
  .soc-invite{width:min(330px,100%);padding:6px 8px 9px 6px;gap:4px 8px}
  .si-ava{--s:38px}
  .si-t{font-size:16px}
  .si-b{min-height:38px;font-size:16px;padding:6px 8px 8px}
  .sc-b{min-height:36px;font-size:15px;padding:5px 10px 7px 6px}
  .sc-b .bi{width:20px;height:20px}
  .soc-chip .sc-name{display:none}
  .soc-chip{gap:6px;padding:4px}
  .sc-ava{--s:30px}
}
@media (max-height:400px) and (orientation:landscape){
  .sw-item{width:72px;height:66px;margin:-33px 0 0 -36px}
  .sw-lb{font-size:12px;max-width:70px}
  .sw-item.say .sw-lb{font-size:11.5px}
}
@media (prefers-reduced-motion:reduce){
  .sw-box,.ss-panel,.soc-chip,.soc-invite,.emo-pop{animation:none!important}
}

@keyframes socFade{from{opacity:0}}
@keyframes socFadeOut{to{opacity:0}}
@keyframes socPop{from{opacity:0;transform:scale(.7)}}
@keyframes socPopOut{to{opacity:0;transform:scale(.85)}}
@keyframes socUp{from{opacity:0;transform:translateY(14px) scale(.9)}}
@keyframes socPick{50%{transform:scale(1.5) rotate(8deg)}}
@keyframes socNope{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
@keyframes socEmoPop{0%{opacity:0;transform:translateY(10px) scale(.3)}60%{opacity:1;transform:translateY(-4px) scale(1.15)}}
@keyframes socGlow{50%{box-shadow:0 4px 0 rgba(10,14,40,.6),0 0 0 3px #ffd23f,0 0 22px rgba(255,210,63,.8)}}
@keyframes socFlash{50%{box-shadow:0 0 0 3px #ffd23f,0 0 20px rgba(255,210,63,.9),0 4px 0 var(--ink);transform:scale(1.04)}}
@keyframes socSideFlash{50%{border-color:#ffd23f;box-shadow:0 0 0 2px var(--ink),0 0 22px rgba(255,210,63,.8)}}
@keyframes socLock{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@keyframes socTick{0%{transform:scale(1.35)}100%{transform:scale(1)}}
`;

export function injectSocialStyles() {
  if (typeof document === 'undefined' || document.getElementById('sas-social')) return;
  const el = document.createElement('style');
  el.id = 'sas-social';
  el.textContent = css;
  document.head.appendChild(el);
}
