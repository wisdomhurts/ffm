// Styles for Trading 2.0 in the trade window (ui/trade.js): pet cards, the seed card, the pets + seed row
// under each side's plants, the picker tabs, the bot's answers in the status bar, the "really give this pet
// away?" Ready, the gamepad focus ring and the "Trade done!" lists. Injected once as <style id="sas-trade">,
// next to social/styles.js (same tokens: --ink, --panel, --fd, --fb, .btn colours).

const css = `
/* pet cards (picker, offers, done screen) */
.ptc{--rc:#c3cbd8;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:1px;min-width:0;padding:5px 4px 7px;border-radius:14px;
  border:3px solid var(--ink);color:#fff;text-align:center;cursor:pointer;font-family:var(--fb);
  background:linear-gradient(180deg,color-mix(in srgb,var(--rc) 40%,#2b387a),#1d2658 80%);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--rc) 70%,transparent),inset 0 3px 0 rgba(255,255,255,.14),0 4px 0 var(--ink);
  transition:transform .14s var(--spring),filter .14s}
button.ptc:hover{transform:translateY(-2px)}
button.ptc:active{transform:translateY(2px)}
.ptc .ptc-th{width:52px;height:52px}
.ptc-n{max-width:100%;font:var(--fdw) 13.5px/1.05 var(--fd);letter-spacing:.01em;text-shadow:0 2px 0 rgba(0,0,0,.4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ptc-r{max-width:100%;font:800 10.5px/1.1 var(--fb);color:color-mix(in srgb,var(--rc) 65%,#fff);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ptc-team{position:absolute;left:-6px;top:-8px;padding:2px 6px 3px;border-radius:8px;background:var(--green);border:2px solid var(--ink);font:900 9.5px/1 var(--fb);letter-spacing:.04em;text-transform:uppercase;box-shadow:0 2px 0 var(--ink)}
.ptc.sel{filter:brightness(.72) saturate(.8)}
.ptc.sel .spc-tick{display:block}
.ptc.flash{animation:socFlash .5s ease-in-out 3}
.ptc.new{box-shadow:0 0 0 3px #ffd23f,0 0 16px rgba(255,210,63,.75),0 4px 0 var(--ink)}

/* the seed in your hands */
.spc-seed{margin-top:2px;padding:2px 6px 3px;border-radius:7px;background:#7bd35a;color:var(--ink);border:2px solid var(--ink);font:900 9.5px/1 var(--fb);letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.spc.seedc{background:linear-gradient(180deg,color-mix(in srgb,#7bd35a 30%,#2b387a),#1d2658 80%)}

/* the pets + seed row under each side's plants */
.stx-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:6px}
.stx{min-width:0;min-height:76px;display:grid}
.stx>.ptc,.stx>.spc{width:100%;height:100%}
.stx.empty{place-items:center;padding:12px;border-radius:14px;border:3px dashed rgba(201,211,255,.28);background:none;color:rgba(201,211,255,.32)}
button.stx.empty,button.st-slot.empty{-webkit-appearance:none;appearance:none;background:none;width:100%;cursor:pointer;transition:border-color .15s,color .15s}
button.st-slot.empty{padding:0}
button.stx.empty:hover,button.st-slot.empty:hover{border-color:rgba(201,211,255,.6);color:rgba(201,211,255,.75)}
.stx.empty svg{width:28px;height:28px}
.ptc.mini,.spc.mini{padding:3px 2px 5px;border-radius:12px}
.ptc.mini .ptc-th{width:34px;height:34px}
.ptc.mini .ptc-n{font-size:11px}
.ptc.mini .ptc-r{display:none}
.spc.mini .spc-ic{width:34px;height:34px}
.spc.mini .spc-mut,.spc.mini .spc-inc{display:none}
.spc.mini .spc-name{font-size:11px;min-height:0;-webkit-line-clamp:1;line-clamp:1}
.spc.mini .spc-seed{font-size:8.5px;padding:1px 4px 2px}
.ptc.mini .spc-tick,.spc.mini .spc-tick{display:none}

/* picker tabs */
.stt-tabs{display:flex;gap:4px;padding:4px;margin:0 0 8px;border-radius:999px;background:rgba(10,14,40,.45);border:2px solid rgba(10,14,40,.6);width:max-content;max-width:100%}
.stt-tab{display:flex;align-items:center;gap:6px;min-height:38px;min-width:0;padding:5px 14px 6px 10px;border:0;border-radius:999px;background:none;color:var(--txt2);cursor:pointer;
  font:var(--fdw) 16px/1 var(--fd);letter-spacing:.02em;transition:background .15s,color .15s}
.stt-tab:hover{color:#fff}
.stt-tab.on{color:#fff;background:linear-gradient(180deg,#5cb8ff,#2a6fe6);box-shadow:inset 0 2px 0 rgba(255,255,255,.3),0 0 0 2.5px var(--ink);text-shadow:0 2px 0 rgba(0,0,0,.3)}
.stt-ic{display:grid;width:22px;height:22px;flex:none}
.stt-ic svg{width:100%;height:100%}
.stt-l{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.st-plants .ptc{min-height:118px}

/* status bar: the bot's answer, as a speech bubble */
.st-bar.say{background:#fff;color:var(--ink);border:3px solid var(--ink)}
.st-bar.say b{color:var(--ink)}
.st-bar.say .st-bar-t{display:flex;align-items:center;gap:8px}
.st-bar .sb-ava{--s:28px;flex:none}

/* Ready: the "really give this pet away?" press, and its key */
.st-ready.ask{--b1:#ffb627;--b2:#ff8a00;color:var(--ink);text-shadow:none;animation:socNope .4s}
.st-ready kbd{font:900 11px/1 var(--fb);padding:3px 5px 4px;border-radius:6px;background:rgba(16,22,58,.35);margin-left:6px;text-shadow:none}
.is-touch .st-ready kbd{display:none}

/* gamepad focus */
.soc-sheet .pad-focus{outline:4px solid #ffd23f;outline-offset:2px;z-index:1}

/* trade done */
.st-done-got.gave .spc,.st-done-got.gave .ptc{width:78px}
.st-done-got .ptc{width:104px;cursor:default}
.st-done-got .spc.seedc{cursor:default}
.st-done-cash.mini{font-size:19px;align-self:center}
.st-done-bye{font:800 14px/1.3 var(--fb);color:#ffd9a0}
.st-done-bye b{color:#fff}

@media (max-width:640px){
  .stx{min-height:62px}
  .stx-row{gap:4px}
  .stx.empty{padding:8px}
  .stx.empty svg{width:22px;height:22px}
  .ptc.mini .ptc-th,.spc.mini .spc-ic{width:28px;height:28px}
  .ptc.mini .ptc-n,.spc.mini .spc-name{font-size:10px}
  .stt-tabs{width:100%}
  .stt-tab{flex:1 1 0;justify-content:center;font-size:14px;padding:5px 8px 6px 6px;gap:4px}
  .stt-ic{width:18px;height:18px}
  .st-plants .ptc{min-height:0}
  .st-plants .ptc .ptc-th{width:40px;height:40px}
  .ptc-n{font-size:12px}
  .st-done-got .ptc{width:92px}
  .st-done-got.gave .spc,.st-done-got.gave .ptc{width:70px}
}
@media (max-width:360px){
  .stt-tab .stt-ic{display:none}
  .stt-tab{font-size:13px;padding:5px 4px 6px}
  .ptc.mini .ptc-n,.spc.mini .spc-name,.spc.mini .spc-seed{display:none}
  .stx{min-height:44px}
}
/* short landscape phones: the row sits between the plants and the cash */
@media (max-height:500px) and (orientation:landscape){
  .st-side{grid-template-areas:"h h" "s s" "x x" "c r"}
  .stx-row{grid-area:x}
  .stx{min-height:40px}
  .stx.empty{padding:4px}
  .stx.empty svg{width:18px;height:18px}
  .ptc.mini,.spc.mini{flex-direction:row;gap:4px;padding:2px 4px}
  .ptc.mini .ptc-th,.spc.mini .spc-ic{width:26px;height:26px}
  .spc.mini .spc-seed{display:none}
  .stt-tabs{margin-bottom:4px}
  .stt-tab{min-height:32px;font-size:13px;padding:4px 10px 5px 8px}
  .st-plants .ptc{flex:0 0 84px;min-height:0;padding:2px 3px 4px}
  .st-plants .ptc .ptc-th{width:30px;height:30px}
  .st-plants .ptc .ptc-r{display:none}
  .st-done-got .ptc{width:84px}
  .st-done-got .ptc .ptc-th{width:36px;height:36px}
}
`;

export function injectTradeStyles() {
  if (typeof document === 'undefined' || document.getElementById('sas-trade')) return;
  const el = document.createElement('style');
  el.id = 'sas-trade';
  el.textContent = css;
  document.head.appendChild(el);
}
