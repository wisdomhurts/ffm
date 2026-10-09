// Styles for the guided tutorial (ui/tutorial.js), injected once as <style id="sas-tutorial">. The card itself
// keeps the .tut layout from ui/styles.js (corner column on big screens, a full-width strip on phones); this adds
// the step dots, the key / button glyphs, the screen-edge arrow and the "Want a quick tutorial?" offer.
const css = `
/* ---------------------------------------------------------------- the step card */
.tut-dots{display:flex;gap:5px;margin:8px 2px 0}
.tut-dots i{flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.16)}
.tut-dots i.done{background:var(--green)}
.tut-dots i.cur{background:var(--gold);box-shadow:0 0 6px rgba(255,210,63,.7)}
.tut.complete .tut-dots i{background:#fff}
.tsk-s{display:none}
.tut-guided.complete .tut-skip{visibility:hidden}
.tut-text kbd{font-size:10.5px;padding:2px 5px 3px;min-width:15px;margin:0 1px;vertical-align:1px}
.tg{display:inline-grid;place-items:center;vertical-align:-3px;margin:0 1px;border:2px solid var(--ink);color:#fff;font:900 10.5px/1 var(--fb);box-sizing:border-box}
.tg-pad{width:18px;height:18px;border-radius:50%;text-shadow:0 1px 0 rgba(0,0,0,.35)}
.tg-a{background:#3fd65a}
.tg-b{background:#ff4f5e}
.tg-l{background:#5a67a8}
.tg-tap{height:18px;padding:0 7px;border-radius:999px;background:radial-gradient(circle at 42% 30%,#72f48f,#1a9a3f);text-transform:uppercase;letter-spacing:.03em}
.tg-joy{width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.22);border-color:#fff}
.tg-joy i{display:block;width:8px;height:8px;border-radius:50%;background:#fff}
@media (max-width:640px),(max-height:500px) and (orientation:landscape){
  .tut-dots{display:none}
  .tsk-l{display:none}
  .tsk-s{display:inline}
  .tut-text .tg{vertical-align:-4px}
}

/* ---------------------------------------------------------------- the arrow on the screen edge */
.tut-edge{position:absolute;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;z-index:3;pointer-events:none;display:none}
.tut-edge.show{display:block}
.hud:not([data-state=playing]) .tut-edge{display:none}
.te-rot{display:block;width:100%;height:100%}
.te-ic{display:grid;place-items:center;width:100%;height:100%;padding:7px;box-sizing:border-box;border-radius:50%;background:var(--gold);color:#fff;
  border:3px solid var(--ink);box-shadow:0 0 0 4px rgba(255,210,63,.35),0 4px 0 rgba(10,14,40,.5);animation:tutEdge .9s ease-in-out infinite}
.te-ic svg{width:100%;height:100%}
@keyframes tutEdge{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@media (prefers-reduced-motion:reduce){.te-ic{animation:none}}

/* ---------------------------------------------------------------- "Want a quick tutorial?" */
.modal-panel.tut-offer{width:min(440px,100%);text-align:center}
.tof{display:flex;flex-direction:column;align-items:center;gap:10px;color:#fff}
.tof-ic{width:64px;height:64px;padding:11px;box-sizing:border-box;border-radius:20px;display:grid;place-items:center;background:linear-gradient(180deg,#72f48f,#1a9a3f);
  border:3px solid var(--ink);box-shadow:0 4px 0 rgba(10,14,40,.5);animation:tutPop 1.2s var(--spring) infinite}
.tof-ic svg{width:100%;height:100%}
.tof-title{margin:2px 0 0;font:var(--fdw,400) 30px/1.05 var(--fd);letter-spacing:.02em;text-shadow:0 3px 0 var(--ink)}
.tof-sub{margin:0;font:800 15px/1.35 var(--fb);color:#dfe5ff;max-width:320px}
.tof-btns{display:flex;flex-direction:column;align-items:stretch;gap:10px;width:min(300px,100%);margin-top:6px}
.tof-hint{margin:2px 0 0;font:800 12px/1 var(--fb);color:var(--txt2,#b8c1ea)}
/* in a game (online): a card across the middle; the game keeps running around it (online never pauses) */
.tof-game{position:absolute;left:0;right:0;margin:0 auto;top:calc(var(--st) + 84px);width:min(360px,calc(100vw - 32px));box-sizing:border-box;padding:16px 18px 16px;
  border-radius:22px;border:3px solid var(--ink);background:var(--panel);box-shadow:var(--panel-sh);pointer-events:auto;z-index:7;animation:panelIn .45s var(--spring) both}
.hud:not([data-state=playing]) .tof-game{display:none}
.tof-game .tof-title{font-size:25px}
.tof-game .tof-sub{font-size:13.5px}
.tof-game .btn-lg{font-size:20px;min-height:52px;padding:10px 20px 12px}
/* phones: compact, below the top rows when upright (where the tutorial card goes), clear of the thumb buttons */
@media (max-width:640px),(max-height:560px){
  .tof-game{padding:10px 12px 12px;gap:7px}
  .tof-game .tof-ic,.tof-game .tof-hint{display:none}
  .tof-game .tof-title{font-size:21px}
  .tof-game .tof-sub{font-size:12.5px}
  .tof-game .tof-btns{margin-top:2px;gap:7px}
  .tof-game .tof-btns .btn{min-height:44px;font-size:17px;padding:8px 12px 10px}
}
@media (max-width:640px) and (orientation:portrait){.tof-game{top:calc(var(--st) + 150px)}}
/* short phones: no room between the top rows and the thumbs, so it sits over the top rows for a moment */
@media (max-width:640px) and (orientation:portrait) and (max-height:600px){.tof-game{top:calc(var(--st) + 44px)}.tof-game .tof-sub{display:none}}
@media (max-height:500px) and (orientation:landscape){.tof-game{top:calc(var(--st) + 6px);width:min(300px,calc(100vw - 32px))}}

/* ---------------------------------------------------------------- the mode screen's "Play the tutorial" */
.tut-replay{display:inline-flex;align-items:center;gap:6px;margin:10px auto 0}
.tut-replay .bi{width:18px;height:18px;display:grid}
.tut-replay .bi svg{width:100%;height:100%}
`;

export function injectTutorialStyles() {
  if (typeof document === 'undefined' || document.getElementById('sas-tutorial')) return;
  const s = document.createElement('style');
  s.id = 'sas-tutorial';
  s.textContent = css;
  document.head.appendChild(s);
}
