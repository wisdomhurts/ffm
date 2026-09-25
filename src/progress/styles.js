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
}
`;

export function injectProgressStyles() {
  if (typeof document === 'undefined' || document.getElementById('sas-progress')) return;
  const el = document.createElement('style');
  el.id = 'sas-progress';
  el.textContent = css;
  document.head.appendChild(el);
}
