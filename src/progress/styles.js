// Styles for quests, badges, the HUD quest chip and the progress toasts. Injected once as <style id="sas-progress">.
// Matches ui/styles.js: Lilita One (--fd) + Nunito (--fb), chunky ink-outlined navy panels, bright buttons.
const css = `
/* ------------------------------------------------------------ glyphs + medals */
.pg-g{display:block;width:100%;height:100%}
.pg-g svg{display:block;width:100%;height:100%;overflow:visible}
.pg-medal{position:relative;display:block;width:64px;height:64px;flex:none}
.pg-medal-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 2px 0 rgba(10,14,40,.45))}
.pg-medal > .pg-g{position:absolute;left:29%;top:22.5%;width:42%;height:42%}
.pg-medal.m-locked > .pg-g{filter:brightness(0) invert(1);opacity:.16}

/* ------------------------------------------------------------ toasts */
.pg-toasts{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;pointer-events:none}
.pg-toasts:empty{display:none}
.pg-toasts.global{position:absolute;left:50%;top:calc(var(--st) + 6px);transform:translateX(-50%);width:min(440px,calc(100% - 24px));z-index:30}
.pg-toast{position:relative;display:flex;align-items:center;gap:10px;max-width:100%;padding:6px 18px 7px 7px;border-radius:20px;border:3px solid var(--ink);pointer-events:auto;cursor:pointer;color:#fff;
  background:linear-gradient(180deg,#6a52e8,#3a27a8);box-shadow:inset 0 2px 0 rgba(255,255,255,.3),inset 0 -3px 0 rgba(0,0,0,.2),0 5px 0 rgba(10,14,40,.6),0 0 24px rgba(255,210,63,.5);
  text-shadow:0 2px 0 rgba(0,0,0,.3);animation:pgToastIn .55s var(--spring) both;-webkit-tap-highlight-color:transparent}
.pg-toast.out{animation:pgToastOut .32s ease-in forwards}
.pg-toast::after{content:'';position:absolute;inset:0;border-radius:17px;pointer-events:none;
  background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.42) 48%,transparent 61%) no-repeat;background-size:260% 100%;background-position:130% 0;animation:pgShine 1.3s .35s ease-out both}
.pg-toast.quest{background:linear-gradient(180deg,#56de75,#1a9a3f);box-shadow:inset 0 2px 0 rgba(255,255,255,.3),inset 0 -3px 0 rgba(0,0,0,.2),0 5px 0 rgba(10,14,40,.6),0 0 22px rgba(93,255,126,.45)}
.pg-toast.cash{background:linear-gradient(180deg,#ffd84a,#f39500);color:#3a1d00;text-shadow:0 1px 0 rgba(255,255,255,.4);box-shadow:inset 0 2px 0 rgba(255,255,255,.4),0 5px 0 rgba(10,14,40,.6)}
.pg-t-ic{position:relative;width:50px;height:50px;flex:none;display:grid;place-items:center}
.pg-t-ic .pg-medal{width:50px;height:50px;animation:pgMedalIn .8s var(--spring) both}
.pg-t-disc{width:42px;height:42px;border-radius:50%;padding:7px;background:rgba(10,15,40,.3);border:2.5px solid rgba(10,15,40,.55)}
.pg-t-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
.pg-t-k{font:900 11px/1 var(--fb);letter-spacing:.14em;text-transform:uppercase;color:#ffe066}
.pg-toast.quest .pg-t-k{color:#eaffef}
.pg-toast.cash .pg-t-k{color:#7a3a00}
.pg-t-name{font:var(--fdw) 19px/1.08 var(--fd);letter-spacing:.02em;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pg-t-sub{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:800 12.5px/1.2 var(--fb)}
.pg-chipv{display:inline-flex;align-items:center;gap:3px;padding:1px 7px 2px 3px;border-radius:999px;background:rgba(10,15,40,.5);font:var(--fdw) 14px/1.2 var(--fd);color:var(--gold);text-shadow:none;white-space:nowrap}
.pg-chipv .pg-g{width:15px;height:15px}
.pg-chipv.cash{color:var(--cash);padding-left:7px}
.pg-sparks{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none}
.pg-sparks i{position:absolute;left:-5px;top:-5px;width:10px;height:10px;background:var(--c,#ffd23f);clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);opacity:0;animation:pgSpark .9s var(--d,0s) ease-out both}

/* ------------------------------------------------------------ HUD quest chip */
.pg-chip{position:relative;display:flex;align-items:stretch;max-width:272px;min-height:48px;border-radius:16px;border:3px solid var(--ink);background:var(--panel);box-shadow:var(--panel-sh);
  pointer-events:auto;overflow:hidden;color:#fff;transition:background .3s}
.pg-chip-ic.bump{animation:pgBump .45s var(--spring)}
.pg-chip-ic.pop{animation:pgPopBig .8s var(--spring)}
.pg-chip-main{display:flex;align-items:center;gap:8px;min-width:0;flex:1;padding:5px 10px 9px 6px;border:0;margin:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;touch-action:manipulation}
.pg-chip-main:focus-visible,.pg-chip-tg:focus-visible{outline:3px solid #fff;outline-offset:-3px}
.pg-chip-ic{position:relative;width:36px;height:36px;flex:none}
.pg-ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.pg-ring circle{fill:none;stroke-width:4}
.pg-ring .bg{stroke:rgba(10,15,40,.6)}
.pg-ring .fg{stroke:#ffd23f;stroke-linecap:round;transition:stroke-dashoffset .4s ease-out}
.pg-chip-ic .pg-g{position:absolute;inset:7px}
.pg-chip-dot{position:absolute;right:-3px;top:-3px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--red);border:2px solid var(--ink);font:900 10px/12px var(--fb);color:#fff;text-align:center;display:none}
.pg-chip.claim .pg-chip-dot,.pg-chip.chest .pg-chip-dot{display:block;background:var(--cash);color:var(--ink)}
.pg-chip-copy{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.pg-chip-k{font:900 10px/1 var(--fb);letter-spacing:.13em;text-transform:uppercase;color:#ffe066;white-space:nowrap}
.pg-chip-t{font:800 13px/1.15 var(--fb);color:#fff;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}
.pg-chip-n{flex:none;align-self:center;font:var(--fdw) 15px/1 var(--fd);letter-spacing:.02em;color:var(--cash);text-shadow:var(--o1);white-space:nowrap}
.pg-chip-bar{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(0,0,0,.35);pointer-events:none}
.pg-chip-bar i{display:block;height:100%;background:linear-gradient(90deg,#ffb627,#ffe066);transform-origin:0 50%;transform:scaleX(0);transition:transform .4s ease-out}
.pg-chip-tg{flex:none;width:24px;padding:0;border:0;border-left:2px solid rgba(10,15,40,.35);background:rgba(10,15,40,.22);color:var(--txt2);cursor:pointer;display:grid;place-items:center;touch-action:manipulation}
.pg-chip-tg svg{width:13px;height:13px;transition:transform .2s}
.pg-chip.collapsed .pg-chip-copy,.pg-chip.collapsed .pg-chip-n{display:none}
.pg-chip.collapsed .pg-chip-main{padding-right:6px}
.pg-chip.collapsed .pg-chip-tg svg{transform:rotate(180deg)}
.pg-chip.claim,.pg-chip.chest{background:linear-gradient(180deg,#ffd84a,#f39500);animation:pgGlow 1s ease-in-out infinite alternate}
.pg-chip.claim .pg-chip-k,.pg-chip.chest .pg-chip-k{color:#6a2f00}
.pg-chip.claim .pg-chip-t,.pg-chip.chest .pg-chip-t{color:#3a1d00;text-shadow:0 1px 0 rgba(255,255,255,.35)}
.pg-chip.claim .pg-chip-n,.pg-chip.chest .pg-chip-n{color:#fff}
.pg-chip.claim .pg-chip-tg,.pg-chip.chest .pg-chip-tg{color:#6a2f00;background:rgba(255,255,255,.18)}
.pg-chip.claim .pg-ring .fg,.pg-chip.chest .pg-ring .fg{stroke:#fff}
.pg-chip.alldone .pg-chip-k{color:#9ff0b0}
.pg-chip.alldone .pg-ring .fg{stroke:#b36bff}
.hud.intro .pg-chip{opacity:0;visibility:hidden}

/* ------------------------------------------------------------ Quests & Badges panel */
.modal-panel.pg-modal{width:min(780px,100%)}
.pg-head{display:flex;align-items:center;gap:12px;margin:0 0 12px;padding-right:52px}
.pg-hic{width:52px;height:52px;flex:none;padding:8px;border-radius:16px;background:linear-gradient(180deg,#8f78ff,#5a3fd8);border:3px solid var(--ink);box-shadow:inset 0 2px 0 rgba(255,255,255,.4)}
.pg-titles{display:flex;flex-direction:column;gap:3px;min-width:0}
.pg-titles h2{margin:0;font:var(--fdw) 30px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.pg-sub{font:800 13px/1.2 var(--fb);color:var(--txt2)}
.pg-stars{margin-left:auto;flex:none;display:flex;align-items:center;gap:6px;padding:5px 12px 6px 7px;border-radius:14px;background:rgba(10,15,40,.55);font:var(--fdw) 24px/1 var(--fd);color:var(--gold);text-shadow:var(--o1)}
.pg-stars .pg-g{width:26px;height:26px}
.pg-stars.bump{animation:pgBump .5s var(--spring)}
.pg-tabs{display:flex;width:100%;margin:0 0 14px}
.pg-tabs .seg-b{position:relative;flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.pg-tabs .seg-b .pg-g{width:20px;height:20px}
.pg-tabs .seg-b em{font:900 12px/1 var(--fb);font-style:normal;padding:3px 7px;border-radius:99px;background:rgba(10,15,40,.35)}
.pg-tabs .seg-b.on em{background:rgba(10,15,40,.2)}
.pg-dot{position:absolute;top:-8px;right:-4px;z-index:1;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--cash);border:2.5px solid var(--ink);font:900 11px/15px var(--fb);color:var(--ink);animation:pgBump .6s var(--spring) infinite alternate}
.pg-pane{animation:pgFade .25s both}
.pg-qtop{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap;margin:0 2px 16px}
.pg-qtop h3{margin:0;font:var(--fdw) 20px/1 var(--fd);letter-spacing:.02em}
.pg-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pg-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px 5px 6px;border-radius:999px;background:rgba(10,15,40,.5);font:800 12.5px/1 var(--fb);color:var(--txt2);white-space:nowrap}
.pg-pill .pg-g{width:16px;height:16px}
.pg-pill.hot{color:#ffcf6b}
.pg-qlist{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 12px}
.pg-q{--tc:#2fbf4a;position:relative;display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center;padding:18px 12px 12px;border-radius:18px;border:3px solid var(--ink);
  background:rgba(10,15,40,.34);box-shadow:inset 0 2px 0 rgba(255,255,255,.08),0 4px 0 rgba(10,14,40,.45)}
.pg-q.t-medium{--tc:#2a7fe6}
.pg-q.t-hard{--tc:#8a45e0}
.pg-q.done:not(.claimed){background:linear-gradient(180deg,rgba(86,222,117,.4),rgba(26,154,63,.34));box-shadow:inset 0 2px 0 rgba(255,255,255,.12),0 4px 0 rgba(10,14,40,.45),0 0 0 3px rgba(93,255,126,.35)}
.pg-q.claimed{background:rgba(10,15,40,.22)}
.pg-q.claimed .pg-qic,.pg-q.claimed .pg-qtext{opacity:.6}
.pg-tier{position:absolute;top:-12px;left:50%;transform:translateX(-50%);font:900 11px/1 var(--fb);letter-spacing:.12em;text-transform:uppercase;padding:4px 10px 5px;border-radius:999px;border:2.5px solid var(--ink);background:var(--tc);color:#fff;white-space:nowrap;text-shadow:0 1px 0 rgba(0,0,0,.3)}
.pg-qic{position:relative;width:58px;height:58px;flex:none;padding:11px;border-radius:50%;border:3px solid var(--ink);background:radial-gradient(circle at 38% 30%,rgba(255,255,255,.35),transparent 60%),var(--tc);box-shadow:inset 0 -3px 0 rgba(0,0,0,.2)}
.pg-qic .pg-ava{position:absolute;right:-8px;bottom:-6px;--s:28px;border-width:2px}
.pg-qmid{display:flex;flex-direction:column;align-items:stretch;gap:8px;width:100%;min-width:0}
.pg-qtext{font:var(--fdw) 18px/1.12 var(--fd);letter-spacing:.01em;min-height:2.24em;display:flex;align-items:center;justify-content:center}
.pg-bar{position:relative;display:grid;place-items:center;width:100%;height:20px;border-radius:11px;background:rgba(10,15,40,.72);border:2.5px solid var(--ink);overflow:hidden}
.pg-bar i{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:0 50%;background:linear-gradient(180deg,#8dff7e,#2fbf4a);box-shadow:inset 0 2px 0 rgba(255,255,255,.35)}
.pg-bar b{position:relative;font:900 12px/1 var(--fb);text-shadow:0 1px 0 rgba(0,0,0,.7),0 0 3px rgba(0,0,0,.5)}
.pg-rew{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap}
.pg-qact{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%}
.pg-qact .btn{width:100%}
.pg-claimed{display:inline-flex;align-items:center;gap:6px;min-height:40px;font:var(--fdw) 16px/1 var(--fd);color:#9ff0b0}
.pg-claimed .pg-g{width:20px;height:20px}
.pg-swap{border:0;background:none;padding:2px 6px;font:800 12px/1 var(--fb);color:var(--txt3);text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.pg-swap:hover{color:#fff}
.pg-swap:focus-visible{outline:3px solid #fff;outline-offset:2px;border-radius:6px}
.pg-q.claimed .pg-bar i{background:linear-gradient(180deg,#b0b8e0,#7c86b8)}
.pg-chest{display:flex;align-items:center;gap:12px;margin-top:16px;padding:10px 14px 10px 10px;border-radius:18px;border:3px solid var(--ink);
  background:linear-gradient(180deg,rgba(255,210,63,.2),rgba(255,140,0,.12));box-shadow:inset 0 2px 0 rgba(255,255,255,.1)}
.pg-chest.ready{background:linear-gradient(180deg,#ffd84a,#f39500);color:#3a1d00;animation:pgGlow 1s ease-in-out infinite alternate}
.pg-chest.opened{opacity:.7}
.pg-chest-ic{width:54px;height:54px;flex:none}
.pg-chest.ready .pg-chest-ic{animation:pgWiggle 1.2s ease-in-out infinite}
.pg-chest-copy{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.pg-chest-copy b{font:var(--fdw) 19px/1.05 var(--fd);letter-spacing:.02em}
.pg-chest-copy span{font:800 12.5px/1.25 var(--fb);color:var(--txt2)}
.pg-chest.ready .pg-chest-copy span{color:#5a2a00}
.pg-pips{display:flex;gap:5px}
.pg-pips i{width:14px;height:14px;border-radius:50%;background:rgba(10,15,40,.5);border:2px solid var(--ink)}
.pg-pips i.on{background:var(--gold);box-shadow:inset 0 2px 0 rgba(255,255,255,.5)}
.pg-note{margin:12px 2px 0;font:700 12.5px/1.35 var(--fb);color:var(--txt3);text-align:center}
.pg-note b{color:var(--cash)}
.pg-bests{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px;margin:0 0 14px}
.pg-best{display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 6px 8px;border-radius:14px;background:rgba(10,15,40,.4);min-width:0}
.pg-best b{font:var(--fdw) 20px/1 var(--fd);letter-spacing:.02em;color:var(--gold);text-shadow:var(--o1);white-space:nowrap}
.pg-best b.cash{color:var(--cash)}
.pg-best span{font:900 10.5px/1.1 var(--fb);letter-spacing:.08em;text-transform:uppercase;color:var(--txt2);text-align:center}
.pg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(164px,1fr));gap:10px}
.pg-b{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;padding:10px 9px 10px;border-radius:16px;border:3px solid var(--ink);
  background:rgba(10,15,40,.3);box-shadow:inset 0 2px 0 rgba(255,255,255,.06)}
.pg-b.earned{background:linear-gradient(180deg,rgba(106,82,232,.5),rgba(58,39,168,.42));box-shadow:inset 0 2px 0 rgba(255,255,255,.14)}
.pg-b.maxed{background:linear-gradient(180deg,rgba(106,82,232,.62),rgba(58,39,168,.5));box-shadow:inset 0 0 0 2px rgba(255,210,63,.85),inset 0 2px 0 rgba(255,255,255,.18),0 0 14px rgba(255,210,63,.25)}
.pg-b.maxed .pg-bhow{color:var(--gold);font-weight:900}
.pg-b.fresh{animation:pgPop .7s var(--spring)}
.pg-b .pg-medal{width:62px;height:62px}
.pg-blk{position:absolute;right:-6px;bottom:4px;width:22px;height:22px;padding:4px;border-radius:50%;background:#3a416b;border:2px solid var(--ink);color:#c9d3ff}
.pg-bname{font:var(--fdw) 16px/1.1 var(--fd);letter-spacing:.02em}
.pg-b.locked .pg-bname{color:var(--txt2)}
.pg-bhow{font:700 12px/1.25 var(--fb);color:var(--txt2);min-height:2.5em;display:flex;align-items:center}
.pg-b .pg-bar{height:16px;border-width:2px}
.pg-b .pg-bar b{font-size:10.5px}
.pg-bfoot{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;min-height:20px}
.pg-date{font:800 11.5px/1 var(--fb);color:#b9f5c6}
.pg-tpips{display:flex;gap:3px}
.pg-tpips i{width:9px;height:9px;border-radius:50%;background:rgba(10,15,40,.6);border:1.5px solid var(--ink)}
.pg-tpips i.on{background:var(--gold)}
.pg-fly{position:fixed;z-index:60;width:22px;height:22px;pointer-events:none;transition:transform .7s cubic-bezier(.5,-0.3,.7,1),opacity .7s;will-change:transform}

/* ------------------------------------------------------------ phones */
@media (max-width:640px){
  .pg-toast{gap:8px;padding:4px 12px 5px 5px;border-radius:16px}
  .pg-t-ic,.pg-t-ic .pg-medal{width:40px;height:40px}
  .pg-t-disc{width:36px;height:36px;padding:6px}
  .pg-t-k{font-size:10px}
  .pg-t-name{font-size:16px;max-width:210px}
  .pg-t-sub{font-size:11.5px}
  .pg-chipv{font-size:13px}
}
/* phones: ui/progress.js moves the chip and sets its layout class. lay-h = landscape phones, a compact pill in
   the Pause/Mute row; lay-t = portrait phones, the same pill in the top row beside Pause/Mute (absolutely
   placed, its left edge and width measured so it never runs under the family board) */
.pg-chip.lay-h,.pg-chip.lay-t{min-height:0;max-width:none;border-radius:12px}
.pg-chip.lay-h .pg-chip-copy,.pg-chip.lay-h .pg-chip-tg,.pg-chip.lay-t .pg-chip-copy,.pg-chip.lay-t .pg-chip-tg{display:none}
.pg-chip.lay-h .pg-chip-n,.pg-chip.lay-t .pg-chip-n{display:block;font-size:13px;letter-spacing:0}
.pg-chip.lay-h .pg-chip-main,.pg-chip.lay-t .pg-chip-main{gap:3px;padding:2px 7px 5px 2px}
.pg-chip.lay-h .pg-chip-ic,.pg-chip.lay-t .pg-chip-ic{width:28px;height:28px}
.pg-chip.lay-h .pg-chip-ic .pg-g,.pg-chip.lay-t .pg-chip-ic .pg-g{inset:6px}
.pg-chip.lay-h .pg-chip-bar,.pg-chip.lay-t .pg-chip-bar{height:3px}
.pg-chip.lay-h{height:38px}
.pg-chip.lay-t{position:absolute;left:var(--pg-left,96px);top:0;height:40px;max-width:var(--pg-max,120px)}
.pg-chip.icon-only .pg-chip-n{display:none}
.pg-chip.icon-only .pg-chip-main{padding-right:3px}
@media (max-width:560px){
  .pg-head{gap:10px}
  .pg-hic{width:44px;height:44px;padding:7px;border-radius:14px}
  .pg-titles h2{font-size:24px}
  .pg-sub{display:none}
  .pg-stars{font-size:20px;padding:4px 10px 5px 6px}
  .pg-stars .pg-g{width:22px;height:22px}
  .pg-qlist{grid-template-columns:1fr;gap:16px}
  .pg-q{flex-direction:row;align-items:center;text-align:left;gap:10px;padding:16px 10px 10px}
  .pg-tier{left:14px;transform:none}
  .pg-qic{width:48px;height:48px;padding:9px}
  .pg-qtext{font-size:16px;min-height:0;justify-content:flex-start}
  .pg-qmid{gap:6px}
  .pg-rew{justify-content:flex-start}
  .pg-qact{width:auto;flex:none;min-width:84px}
  .pg-qact .btn{width:auto;padding-left:12px;padding-right:12px}
  .pg-claimed{font-size:14px;min-height:0}
  .pg-bests{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pg-best:nth-child(n+5){display:none}
  .pg-best b{font-size:18px}
  .pg-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .pg-b{padding:8px 6px 9px}
  .pg-b .pg-medal{width:54px;height:54px}
  .pg-bname{font-size:15px}
  .pg-bhow{font-size:11.5px}
  .pg-chest-ic{width:46px;height:46px}
  .pg-chest-copy b{font-size:17px}
  .pg-chest .btn{padding-left:12px;padding-right:12px}
}
@media (max-width:420px){
  .pg-hic{display:none}
  .pg-titles h2{font-size:24px}
}
@media (max-width:370px){
  .pg-qact{min-width:74px}
  .pg-grid{gap:6px}
  .pg-bhow{font-size:11px}
}
/* landscape phones: short screens */
@media (max-height:500px) and (orientation:landscape){
  .pg-toast{gap:7px;padding:3px 10px 4px 4px;border-radius:15px}
  .pg-t-ic,.pg-t-ic .pg-medal{width:36px;height:36px}
  .pg-t-disc{width:32px;height:32px;padding:5px}
  .pg-t-k{font-size:9.5px}
  .pg-t-name{font-size:15px;max-width:200px}
  .pg-t-sub{font-size:11px}
  .pg-head{margin-bottom:8px}
  .pg-hic{width:40px;height:40px;padding:6px;border-radius:12px}
  .pg-titles h2{font-size:22px}
  .pg-sub{display:none}
  .pg-stars{font-size:19px}
  .pg-tabs{margin-bottom:12px}
  .pg-qtop{margin-bottom:12px}
  .pg-qtop h3{font-size:17px}
  .pg-qlist{gap:10px}
  .pg-tabs .seg-b{min-height:36px;padding:6px 12px 8px;font-size:16px}
  /* quest cards: icon beside the text so all three Claim buttons fit on a 375px-tall screen */
  .pg-q{display:grid;grid-template-columns:38px minmax(0,1fr);column-gap:8px;row-gap:6px;align-items:center;text-align:left;padding:15px 8px 8px}
  .pg-qic{grid-column:1;grid-row:1;width:38px;height:38px;padding:6px;border-width:2.5px}
  .pg-qic .pg-ava{--s:20px;right:-6px;bottom:-4px}
  .pg-qmid{display:contents}
  .pg-qtext{grid-column:2;grid-row:1;font-size:14.5px;min-height:0;justify-content:flex-start}
  .pg-q .pg-bar,.pg-q .pg-rew,.pg-qact{grid-column:1/-1}
  .pg-qact .btn{min-height:36px;padding-top:6px;padding-bottom:8px}
  .pg-claimed{min-height:36px}
  .pg-chest{margin-top:12px;padding:6px 10px 6px 8px}
  .pg-chest-ic{width:40px;height:40px}
  .pg-chest-copy b{font-size:16px}
  .pg-bests{grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-bottom:10px}
  .pg-best{padding:6px 3px}
  .pg-best b{font-size:16px}
  .pg-best span{font-size:9.5px;letter-spacing:.04em}
  .pg-grid{grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:8px}
}

/* ------------------------------------------------------------ Seed Almanac + collections: toasts */
.pg-toast.sticker{background:linear-gradient(180deg,#36c9a0,#13866a);box-shadow:inset 0 2px 0 rgba(255,255,255,.3),inset 0 -3px 0 rgba(0,0,0,.2),0 5px 0 rgba(10,14,40,.6),0 0 22px rgba(80,255,200,.4)}
.pg-toast.sticker .pg-t-k{color:#d9fff3}
.pg-toast.collection{background:linear-gradient(180deg,#9a62ff,#5a2fc0);box-shadow:inset 0 2px 0 rgba(255,255,255,.3),inset 0 -3px 0 rgba(0,0,0,.2),0 5px 0 rgba(10,14,40,.6),0 0 26px rgba(255,210,63,.6)}
.pg-t-disc.stk{padding:3px;background:radial-gradient(circle at 40% 35%,#fff,#e8f6ff 70%);border-color:var(--ink)}
.pg-t-ava{position:absolute;right:-6px;bottom:-4px;--s:24px;border-width:2px}
.pg-t-pips{display:inline-flex;gap:4px}
.pg-t-pips i{width:11px;height:11px;border-radius:50%;background:rgba(10,15,40,.5);border:2px solid var(--ink)}
.pg-t-pips i.on{background:var(--gold)}
.pg-chipv.hat{color:#fff;padding-left:4px}
.pg-chipv.hat .pg-g{width:18px;height:18px}
.pg-chipv.done{color:#9ff0b0;padding-left:4px}

/* ------------------------------------------------------------ collection card (Family Four) */
.pg-col{position:relative;margin:0 0 14px;padding:12px 14px 12px;border-radius:18px;border:3px solid var(--ink);
  background:linear-gradient(180deg,rgba(154,98,255,.45),rgba(70,36,160,.42));box-shadow:inset 0 2px 0 rgba(255,255,255,.14),0 4px 0 rgba(10,14,40,.45)}
.pg-col.done{background:linear-gradient(180deg,rgba(255,210,63,.42),rgba(154,98,255,.42));box-shadow:inset 0 0 0 2px rgba(255,210,63,.85),inset 0 2px 0 rgba(255,255,255,.18),0 0 18px rgba(255,210,63,.3)}
.pg-col-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.pg-col-ic{width:44px;height:44px;flex:none;padding:5px;border-radius:14px;background:rgba(10,15,40,.45);border:2.5px solid var(--ink)}
.pg-col-t{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.pg-col-t b{font:var(--fdw) 21px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.pg-col-t span{font:800 12.5px/1.25 var(--fb);color:var(--txt2)}
.pg-col-n4{flex:none;font:var(--fdw) 17px/1 var(--fd);color:var(--gold);padding:5px 12px 6px}
.pg-col-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.pg-col-slot{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 4px 7px;border-radius:16px;border:3px solid var(--ink);background:rgba(10,15,40,.5);min-width:0}
.pg-col-slot.has{background:radial-gradient(circle at 50% 38%,rgba(255,255,255,.3),transparent 62%),linear-gradient(180deg,var(--c),rgba(10,15,40,.5));animation:pgPop .6s var(--spring)}
.pg-col-pl{position:relative;display:block;width:min(74px,100%);aspect-ratio:1}
.pg-col-slot:not(.has) .pg-col-pl svg{filter:brightness(0);opacity:.55}
.pg-col-pl b{position:absolute;inset:0;display:grid;place-items:center;font:var(--fdw) 30px/1 var(--fd);color:#c9d3ff;text-shadow:0 2px 0 var(--ink)}
.pg-col-ava{position:absolute;right:6px;top:6px;--s:30px;border-width:2px}
.pg-col-slot:not(.has) .pg-col-ava{filter:grayscale(.85) brightness(.8)}
.pg-col-n{font:var(--fdw) 14px/1 var(--fd);letter-spacing:.02em;white-space:nowrap}
.pg-col-slot:not(.has) .pg-col-n{color:var(--txt3)}
.pg-col-rew{margin-top:10px}

/* ------------------------------------------------------------ Seed Almanac tab */
.pg-alm-tabs{position:relative;display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;margin:0 -2px 12px;padding:2px 2px 8px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;touch-action:pan-x;scrollbar-width:thin}
.pg-alm-tab{flex:none;display:inline-flex;align-items:center;gap:6px;padding:6px 10px 7px 8px;border-radius:14px;border:2.5px solid var(--ink);background:rgba(10,15,40,.45);color:var(--txt2);
  font:var(--fdw) 15px/1 var(--fd);letter-spacing:.02em;cursor:pointer;scroll-snap-align:start;white-space:nowrap;touch-action:pan-x}
.pg-alm-tab i{width:12px;height:12px;border-radius:50%;background:var(--rc);border:2px solid var(--ink);flex:none}
.pg-alm-tab em{font:900 11px/1 var(--fb);font-style:normal;padding:3px 6px;border-radius:99px;background:rgba(10,15,40,.4)}
.pg-alm-tab em .pg-g{width:13px;height:13px}
.pg-alm-tab.on{background:linear-gradient(180deg,#ffe066,#ffae1c);color:var(--ink);box-shadow:inset 0 2px 0 rgba(255,255,255,.55)}
.pg-alm-tab.full:not(.on){color:var(--gold)}
.pg-alm-tab:focus-visible{outline:3px solid #fff;outline-offset:2px}
.pg-alm-page{animation:pgFade .2s both}
.pg-alm-head{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:6px 14px;margin:0 0 12px;padding:10px 12px;border-radius:16px;border:2.5px solid var(--ink);
  background:rgba(10,15,40,.3);background:linear-gradient(90deg,color-mix(in srgb,var(--rc) 30%,transparent),rgba(10,15,40,.3))}
.pg-alm-ht{display:flex;flex-direction:column;gap:3px}
.pg-alm-ht b{font:var(--fdw) 21px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.pg-alm-ht span{font:800 12px/1.2 var(--fb);color:var(--txt2)}
.pg-alm-head .pg-bar{grid-column:2}
.pg-alm-rew{grid-column:1/-1;justify-content:flex-start;font:800 12px/1.2 var(--fb);color:var(--txt2)}
.pg-alm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}
.pg-pl{position:relative;display:flex;flex-direction:column;gap:8px;padding:10px 10px 10px;border-radius:16px;border:3px solid var(--ink);background:rgba(10,15,40,.34);box-shadow:inset 0 2px 0 rgba(255,255,255,.06)}
.pg-pl.mastered{background:linear-gradient(180deg,rgba(255,210,63,.28),rgba(255,160,0,.14));border-color:#d98a00;
  box-shadow:inset 0 0 0 2px #ffd23f,inset 0 0 0 4px rgba(16,22,58,.9),0 0 14px rgba(255,210,63,.35)}
.pg-pl-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.pg-pl-n{font:var(--fdw) 16px/1.1 var(--fd);letter-spacing:.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pg-pl.unknown .pg-pl-n{color:var(--txt3)}
.pg-pl-c{flex:none;font:900 12px/1 var(--fb);color:var(--txt2);padding:3px 8px;border-radius:99px;background:rgba(10,15,40,.45)}
.pg-pl-m{flex:none;display:inline-flex;align-items:center;gap:4px;font:var(--fdw) 13px/1 var(--fd);color:#3a1d00;padding:3px 9px 4px 4px;border-radius:99px;background:linear-gradient(180deg,#ffe066,#ffae1c);border:2px solid var(--ink)}
.pg-pl-m .pg-g{width:15px;height:15px}
.pg-stks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.pg-stk{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.pg-stk-art{position:relative;display:block;width:100%;max-width:70px;aspect-ratio:1;padding:4px;border-radius:14px;border:2.5px solid var(--ink);
  background:radial-gradient(circle at 45% 35%,#ffffff,#e4f0ff 72%);box-shadow:0 3px 0 rgba(10,14,40,.4);transform:rotate(-2deg)}
.pg-stk:nth-child(even) .pg-stk-art{transform:rotate(2deg)}
.pg-stk.f-gold .pg-stk-art{background:radial-gradient(circle at 45% 35%,#fffbe0,#ffe27a 75%)}
.pg-stk.f-diamond .pg-stk-art{background:radial-gradient(circle at 45% 35%,#ffffff,#bff4ff 75%)}
.pg-stk.f-rainbow .pg-stk-art{background:radial-gradient(circle at 45% 35%,#ffffff,#ffe1f4 60%,#d9ccff)}
.pg-stk.off .pg-stk-art{background:rgba(10,15,40,.55);border-style:dashed;border-color:rgba(201,211,255,.35);box-shadow:none;transform:none}
.pg-stk.off .pg-stk-art svg{filter:brightness(0);opacity:.45}
.pg-stk-art b{position:absolute;inset:0;display:grid;place-items:center;font:var(--fdw) 22px/1 var(--fd);color:#c9d3ff;text-shadow:0 2px 0 var(--ink)}
.pg-stk-l{font:900 10px/1 var(--fb);letter-spacing:.06em;text-transform:uppercase;color:var(--txt2)}
.pg-stk.f-gold .pg-stk-l{color:#ffd23f}
.pg-stk.f-diamond .pg-stk-l{color:#7ee8ff}
.pg-stk.f-rainbow .pg-stk-l{background:linear-gradient(90deg,#ff6b8a,#ffd23f,#5ce07a,#5cb8ff,#b36bff);-webkit-background-clip:text;background-clip:text;color:transparent}
.pg-stk.off .pg-stk-l{color:var(--txt3);background:none;-webkit-background-clip:border-box;background-clip:border-box}
.pg-pl-sz{display:flex;gap:5px;flex-wrap:wrap}
.pg-pl-sz span{font:900 10.5px/1 var(--fb);letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:99px;border:2px solid var(--ink);background:#2fb84f;color:#fff}
.pg-pl-sz .sz-giant{background:#ff8a1a}
.pg-pl-sz .sz-titan{background:linear-gradient(90deg,#b36bff,#ff4f9a);}
@media (max-width:560px){
  .pg-col{padding:10px 10px}
  .pg-col-list{gap:6px}
  .pg-col-slot{padding:6px 2px 6px;border-radius:14px}
  .pg-col-ava{--s:24px;right:3px;top:3px}
  .pg-col-n{font-size:12.5px}
  .pg-col-t b{font-size:18px}
  .pg-alm-grid{grid-template-columns:1fr}
  .pg-alm-head{grid-template-columns:1fr}
  .pg-alm-head .pg-bar{grid-column:1}
}
@media (max-width:420px){
  .pg-tabs .seg-b{gap:5px;padding-left:6px;padding-right:6px}
  .pg-tabs .seg-b .pg-g,.pg-tabs .seg-b em{display:none}
  .pg-col-ic{display:none}
  .pg-stk-l{font-size:9px;letter-spacing:.02em}
}
@media (max-height:500px) and (orientation:landscape){
  .pg-alm-grid{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
  .pg-stk-art{max-width:54px}
  .pg-col-pl{width:min(56px,100%)}
}

/* ------------------------------------------------------------ collection finale (celebrate.js) */
.pg-cel{position:absolute;inset:0;z-index:32;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:var(--st,10px) 16px var(--sb,10px);
  color:#fff;font-family:var(--fb);opacity:0;transition:opacity .25s;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;outline:none;--ring:min(62vmin,330px)}
.pg-cel.pgc-in{opacity:1}
.pg-celebrating .pg-toasts{visibility:hidden}
.pg-cel.pgc-out{opacity:0}
.pgc-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(110,70,210,.95),rgba(14,12,44,.97) 72%)}
.pgc-rays{position:absolute;left:50%;top:42%;width:150vmax;height:150vmax;margin:-75vmax 0 0 -75vmax;opacity:.25;transform:scale(.6);transition:opacity .6s,transform .9s var(--spring);pointer-events:none}
.pgc-rays::before{content:'';position:absolute;inset:0;border-radius:50%;
  background:repeating-conic-gradient(#ffd23f 0 6deg,transparent 6deg 15deg,#2f80ed 15deg 19deg,transparent 19deg 30deg,#ff4f9a 30deg 34deg,transparent 34deg 45deg,#9b5cff 45deg 49deg,transparent 49deg 60deg,#1ec8a5 60deg 64deg,transparent 64deg 72deg);
  -webkit-mask:radial-gradient(circle,#000 4%,transparent 42%);mask:radial-gradient(circle,#000 4%,transparent 42%);animation:pgSpin 18s linear infinite}
.pg-cel.pgc-reveal .pgc-rays{opacity:.8;transform:scale(1)}
.pgc-top{position:relative;z-index:2;flex:none}
.pgc-kicker{display:inline-block;font:var(--fdw) 20px/1 var(--fd);letter-spacing:.04em;padding:7px 16px 8px;border-radius:999px;background:rgba(10,15,40,.6);border:3px solid var(--ink);text-shadow:var(--o1);color:var(--gold)}
.pgc-center{position:relative;z-index:1;flex:none;width:var(--ring);height:var(--ring);margin:4px 0 26px}
.pgc-halo{position:absolute;left:50%;top:50%;width:60%;height:60%;margin:-30% 0 0 -30%;border-radius:50%;background:radial-gradient(circle,rgba(255,226,122,.85),rgba(255,210,63,0) 68%);opacity:0;transform:scale(.4);transition:opacity .5s,transform .8s var(--spring)}
.pg-cel.pgc-reveal .pgc-halo{opacity:1;transform:scale(1);animation:pgHalo 2.4s ease-in-out .8s infinite alternate}
.pgc-ring{position:absolute;inset:0;animation:pgSpinIn 2.2s cubic-bezier(.15,.65,.25,1) both,pgSpin 40s linear 2.2s infinite}
.pgc-slot{position:absolute;left:50%;top:50%;width:calc(var(--ring)*.3);height:calc(var(--ring)*.3);margin:calc(var(--ring)*-.15) 0 0 calc(var(--ring)*-.15);
  transform:rotate(var(--a)) translateY(calc(var(--ring)*-.35)) rotate(calc(var(--a)*-1))}
.pgc-up{position:relative;width:100%;height:100%;border-radius:50%;border:3px solid var(--ink);background:radial-gradient(circle at 45% 35%,rgba(255,255,255,.55),var(--c) 75%);
  box-shadow:0 0 0 3px rgba(255,255,255,.25),0 0 22px var(--c);animation:pgSpinOut 2.2s cubic-bezier(.15,.65,.25,1) both,pgSpinRev 40s linear 2.2s infinite,pgSlotIn .5s var(--spring) calc(var(--i)*.12s) both}
.pgc-plant{position:absolute;inset:10%;display:block}
.pgc-ava{position:absolute;right:-8%;bottom:-6%;--s:calc(var(--ring)*.13);border-width:2px}
.pgc-who{position:absolute;left:50%;top:100%;transform:translate(-50%,-45%);font:var(--fdw) 14px/1 var(--fd);letter-spacing:.03em;white-space:nowrap;padding:3px 8px 4px;border-radius:99px;background:rgba(10,15,40,.7);border:2px solid var(--ink)}
.pgc-crown{position:absolute;left:50%;top:50%;width:42%;margin:-15% 0 0 -21%;opacity:0;transform:scale(.1) rotate(-25deg);filter:drop-shadow(0 4px 0 rgba(10,14,40,.5)) drop-shadow(0 0 18px rgba(255,226,122,.85));
  transition:opacity .25s,transform .7s var(--spring)}
.pgc-crown svg{display:block;width:100%;height:auto}
.pg-cel.pgc-reveal .pgc-crown{opacity:1;transform:none;animation:pgFloat 2.6s ease-in-out .8s infinite alternate}
.pgc-card{position:relative;z-index:2;flex:none;display:flex;flex-direction:column;align-items:center;gap:7px;width:min(440px,100%);padding:14px 16px 16px;border-radius:22px;border:3px solid var(--ink);
  background:var(--panel);box-shadow:var(--panel-sh);text-align:center;opacity:0;transform:translateY(24px) scale(.9);transition:opacity .3s,transform .5s var(--spring);pointer-events:none}
.pg-cel.pgc-done .pgc-card{opacity:1;transform:none;pointer-events:auto}
.pgc-title{font:var(--fdw) 34px/1 var(--fd);letter-spacing:.03em;color:var(--gold);text-shadow:var(--o1)}
.pgc-sub{font:800 14.5px/1.3 var(--fb)}
.pgc-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:6px}
.pgc-chips .pg-chipv{font-size:17px;padding:3px 10px 4px 5px}
.pgc-chips .pg-chipv .pg-g{width:19px;height:19px}
.pgc-note{font:700 12.5px/1.3 var(--fb);color:var(--txt2)}
.pgc-btns{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:4px}
.pgc-btns .bi{width:26px;height:26px}
.pgc-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:3}
.pgc-confetti i{position:absolute;top:-24px;border-radius:2px;animation:pgConfetti 3s linear both;animation-iteration-count:2}
.pgc-hint{position:absolute;left:0;right:0;bottom:calc(var(--sb,10px) + 6px);text-align:center;font:800 13px/1 var(--fb);color:var(--txt2);opacity:.8;z-index:2}
.pg-cel.pgc-done .pgc-hint{display:none}
.pg-cel.pgc-still .pgc-ring,.pg-cel.pgc-still .pgc-up,.pg-cel.pgc-still .pgc-halo,.pg-cel.pgc-still .pgc-crown,.pg-cel.pgc-still .pgc-rays::before{animation:none}
@media (max-height:500px) and (orientation:landscape){
  .pg-cel{flex-direction:row;flex-wrap:wrap;align-content:center;--ring:min(60vh,280px);gap:6px 24px}
  .pgc-center{margin:24px 0 18px}
  .pgc-top{position:absolute;left:0;right:0;top:8px;text-align:center}
  .pgc-kicker{font-size:16px;padding:5px 12px 6px}
  .pgc-title{font-size:28px}
  .pgc-card{width:min(360px,48vw);padding:10px 12px 12px}
  .pgc-btns .btn-lg{font-size:19px;min-height:48px;padding:9px 18px 11px}
}
@media (max-width:420px){
  .pgc-title{font-size:28px}
  .pgc-who{font-size:12px}
  .pgc-btns .btn-lg{font-size:19px;min-height:50px;padding:10px 18px 12px}
}

@keyframes pgSpin{to{transform:rotate(360deg)}}
@keyframes pgSpinIn{from{transform:rotate(-720deg) scale(.4)}to{transform:none}}
@keyframes pgSpinOut{from{transform:rotate(720deg)}to{transform:none}}
@keyframes pgSpinRev{to{transform:rotate(-360deg)}}
@keyframes pgSlotIn{from{opacity:0}to{opacity:1}}
@keyframes pgHalo{from{transform:scale(.92);opacity:.75}to{transform:scale(1.08);opacity:1}}
@keyframes pgFloat{from{transform:translateY(0)}to{transform:translateY(-6px)}}
@keyframes pgConfetti{0%{transform:translate(0,0) rotate(0)}100%{transform:translate(var(--x),110vh) rotate(var(--r))}}
@keyframes pgToastIn{0%{opacity:0;transform:translateY(-16px) scale(.6)}100%{opacity:1;transform:none}}
@keyframes pgToastOut{to{opacity:0;transform:translateY(-12px) scale(.9)}}
@keyframes pgShine{from{background-position:130% 0}to{background-position:-30% 0}}
@keyframes pgMedalIn{0%{transform:scale(.2) rotate(-200deg)}100%{transform:none}}
@keyframes pgSpark{0%{opacity:1;transform:translate(0,0) scale(.4) rotate(0)}100%{opacity:0;transform:translate(var(--x),var(--y)) scale(1.1) rotate(160deg)}}
@keyframes pgPop{0%{transform:scale(1)}35%{transform:scale(1.07)}100%{transform:scale(1)}}
@keyframes pgBump{0%{transform:scale(1)}40%{transform:scale(1.2)}100%{transform:scale(1)}}
@keyframes pgPopBig{0%{transform:scale(1) rotate(0)}30%{transform:scale(1.45) rotate(-12deg)}60%{transform:scale(.92) rotate(6deg)}100%{transform:none}}
@keyframes pgGlow{from{box-shadow:var(--panel-sh),0 0 0 rgba(255,210,63,0)}to{box-shadow:var(--panel-sh),0 0 16px 3px rgba(255,210,63,.75)}}
@keyframes pgWiggle{0%,100%{transform:rotate(0)}20%{transform:rotate(-9deg)}40%{transform:rotate(8deg)}60%{transform:rotate(-4deg)}80%{transform:rotate(0)}}
@keyframes pgFade{from{opacity:0;transform:translateY(6px)}}
@media (prefers-reduced-motion:reduce){
  .pg-toast,.pg-toast::after,.pg-t-ic .pg-medal,.pg-sparks i,.pg-chip-ic,.pg-chip.claim,.pg-chip.chest,.pg-chest.ready,.pg-chest.ready .pg-chest-ic,.pg-dot,.pg-b.fresh,.pg-pane{animation:none!important}
  .pg-fly{transition:none}
  .pg-col-slot.has,.pg-alm-page,.pgc-ring,.pgc-up,.pgc-halo,.pgc-crown,.pgc-rays::before,.pgc-confetti{animation:none!important}
  .pg-cel,.pgc-rays,.pgc-halo,.pgc-crown,.pgc-card{transition:none}
}
`;

export function injectProgressStyles() {
  if (typeof document === 'undefined' || document.getElementById('sas-progress')) return;
  const el = document.createElement('style');
  el.id = 'sas-progress';
  el.textContent = css;
  document.head.appendChild(el);
}
