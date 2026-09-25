// Pet UI styles (egg shop, pet inventory, hatch overlay), injected once as <style id="sas-pets">.
// Matches ui/styles.js: Lilita One display type, Nunito body, chunky navy panels with ink outlines.
export const RARITY_COLOR = { common: '#c3cbd8', rare: '#3d9bff', epic: '#b36bff', legendary: '#ffb627', mythic: '#ff4d6d' };
const RARITY_NAME = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' };
export const rarityName = (r) => RARITY_NAME[r] || 'Common';

const svg = (body, vb = '0 0 24 24') => `<svg class="ico" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
export const BOOST_ICON = {
  income: svg('<circle cx="12" cy="12" r="9.5" fill="#ffd23f" stroke="#10163a" stroke-width="2"/><path d="M12 6.5v11M14.8 8.6c-.6-.9-1.6-1.3-2.8-1.3-1.6 0-2.8.8-2.8 2.1 0 3 5.8 1.6 5.8 4.8 0 1.3-1.3 2.2-3 2.2-1.3 0-2.4-.5-3-1.5" fill="none" stroke="#10163a" stroke-width="1.9" stroke-linecap="round"/>'),
  speed: svg('<path d="M13.5 2L4.5 13.5h6.5L9.5 22l10-12.5h-6.8z" fill="#5cd3ff" stroke="#10163a" stroke-width="1.8" stroke-linejoin="round"/>'),
  hold: svg('<path d="M7 12V6.2a1.6 1.6 0 0 1 3.2 0V11M10.2 10.2V4.6a1.6 1.6 0 0 1 3.2 0v5.6M13.4 10.4V5.8a1.6 1.6 0 0 1 3.2 0v6M16.6 11.6V9a1.6 1.6 0 0 1 3.2 0v5.2c0 4.2-3 7.3-7 7.3-3 0-4.6-1.3-6.2-3.8L4 14.4a1.6 1.6 0 0 1 2.7-1.7L8 14.6" fill="#ffd9b8" stroke="#10163a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'),
  bonkCd: svg('<g transform="rotate(-38 12 12)"><rect x="9.2" y="1.5" width="5.6" height="21" rx="2.8" fill="#ff5ab4" stroke="#10163a" stroke-width="1.8"/><path d="M9.6 7h4.8M9.6 12h4.8M9.6 17h4.8" stroke="#10163a" stroke-width="1.2" opacity=".45"/></g>'),
  magnet: svg('<path d="M5 3.5h4.2v8.3a2.8 2.8 0 0 0 5.6 0V3.5H19v8.5a7 7 0 0 1-14 0z" fill="#ff5a73" stroke="#10163a" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 3.5h4.2V7H5zM14.8 3.5H19V7h-4.2z" fill="#e8ecf5" stroke="#10163a" stroke-width="1.8" stroke-linejoin="round"/>'),
};
export const PAW_ICON = svg('<ellipse cx="12" cy="15.6" rx="5" ry="4.3" fill="currentColor"/><ellipse cx="5.6" cy="10.3" rx="2" ry="2.5" fill="currentColor"/><ellipse cx="9.3" cy="6.4" rx="2.1" ry="2.7" fill="currentColor"/><ellipse cx="14.7" cy="6.4" rx="2.1" ry="2.7" fill="currentColor"/><ellipse cx="18.4" cy="10.3" rx="2" ry="2.5" fill="currentColor"/>');
export const EGG_ICON = svg('<path d="M12 2.5c3.9 0 7.2 6 7.2 11a7.2 7.2 0 0 1-14.4 0c0-5 3.3-11 7.2-11z" fill="#fff6df" stroke="#10163a" stroke-width="1.9"/><circle cx="9.3" cy="11" r="1.8" fill="#7bd35a"/><circle cx="14.6" cy="14.6" r="2.3" fill="#7bd35a"/><circle cx="13.4" cy="7.6" r="1.3" fill="#7bd35a"/><circle cx="9" cy="17" r="1.2" fill="#7bd35a"/>');

const css = `
/* ---------------------------------------------------------------- shared bits */
.pr-tag{display:inline-block;font:900 10.5px/1 var(--fb);letter-spacing:.09em;text-transform:uppercase;color:var(--ink);padding:3px 7px 3px;border-radius:7px;background:var(--rc);border:2px solid var(--ink)}
.pr-tag.r-mythic{background:linear-gradient(90deg,#ff4d6d,#ffb627,#ff66d9);background-size:200% 100%;animation:petRainbow 2.4s linear infinite}
.pthumb{position:relative;display:grid;place-items:center;flex:none;overflow:visible}
.pthumb img{display:block;width:100%;height:100%;object-fit:contain;-webkit-user-drag:none;filter:drop-shadow(0 3px 0 rgba(10,14,40,.35))}
.boost-list{display:flex;flex-wrap:wrap;gap:5px}
.boost{display:inline-flex;align-items:center;gap:5px;padding:3px 9px 3px 4px;border-radius:999px;background:rgba(10,15,40,.55);border:2px solid rgba(255,255,255,.12);font:800 12.5px/1.1 var(--fb);color:#fff;white-space:nowrap}
.boost i{display:grid;width:18px;height:18px;flex:none}

/* ---------------------------------------------------------------- egg shop */
.modal-panel.shop-pets{width:min(900px,100%)}
.shop-pets .sh-ic{background:linear-gradient(180deg,#ffb3d9,#ff5ab4);padding:7px}
.ps-bar{display:flex;align-items:center;gap:10px;margin:-4px 0 14px;padding:8px 10px;border-radius:16px;background:rgba(10,15,40,.38);border:2px solid rgba(255,255,255,.08)}
.ps-bar .ps-eq{display:flex;align-items:center;gap:8px;min-width:0;flex:1}
.ps-bar .pthumb{width:44px;height:44px}
.ps-bar .ps-eq-t{display:flex;flex-direction:column;gap:3px;min-width:0}
.ps-bar .ps-eq-t b{font:var(--fdw) 17px/1 var(--fd);letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ps-bar .ps-eq-t small{font:800 12px/1.2 var(--fb);color:var(--txt2)}
.ps-bar .btn{flex:none}
.ps-eggs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.egg-card{position:relative;display:flex;flex-direction:column;gap:8px;padding:0 0 12px;border-radius:20px;background:rgba(10,15,40,.4);border:3px solid var(--ink);box-shadow:inset 0 2px 0 rgba(255,255,255,.08);overflow:hidden;animation:petCardIn .45s var(--spring) both;animation-delay:var(--d,0ms)}
.egg-card.bought{animation:petBought .5s var(--spring)}
.ec-art{position:relative;display:grid;place-items:center;height:128px;background:radial-gradient(circle at 50% 60%,rgba(255,255,255,.35),transparent 60%),linear-gradient(180deg,var(--e1),var(--e2));border-bottom:3px solid var(--ink)}
.ec-art::after{content:'';position:absolute;left:50%;bottom:10px;width:64px;height:14px;margin-left:-32px;border-radius:50%;background:rgba(10,14,40,.28)}
.ec-art .pthumb{width:104px;height:104px;z-index:1;animation:eggBob 2.4s ease-in-out infinite;animation-delay:var(--d,0ms)}
.egg-card:hover .ec-art .pthumb{animation:eggWobble .6s ease-in-out}
.ec-price{position:absolute;right:8px;top:8px;z-index:2;font:var(--fdw) 17px/1 var(--fd);color:var(--cash);padding:5px 9px 6px;border-radius:11px;background:rgba(10,15,40,.8);border:2px solid var(--ink);text-shadow:0 2px 0 rgba(0,0,0,.4)}
.ec-body{display:flex;flex-direction:column;gap:6px;padding:0 11px}
.ec-name{margin:0;font:var(--fdw) 21px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.ec-blurb{font:700 12px/1.25 var(--fb);color:var(--txt2);min-height:2.5em}
.ec-odds{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
.ec-odds li{display:flex;align-items:center;gap:6px;padding:2px 7px 2px 3px;border-radius:9px;background:rgba(10,15,40,.45);border-left:4px solid var(--rc);font:800 12.5px/1 var(--fb)}
.ec-odds li .pthumb{width:24px;height:24px}
.ec-odds li .n{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--rc);color:color-mix(in srgb,var(--rc) 70%,#fff)}
.ec-odds li b{font:900 12px/1 var(--fb);color:#fff;opacity:.92}
.ec-odds li.own .n::after{content:' \\2713';color:var(--cash)}
.ec-foot{display:flex;flex-direction:column;gap:6px;padding:0 11px;margin-top:auto}
.ec-buy{width:100%;min-height:52px;flex-direction:column;gap:3px;padding:7px 8px 9px}
.ec-buy small{font:900 13px/1 var(--fb)}
.ec-buy.poor{filter:saturate(.35) brightness(.85)}
.ec-buy.wait{opacity:.7;pointer-events:none}
.ec-need.nope{animation:petNope .35s}
.ec-need{display:flex;flex-direction:column;gap:4px;font:800 11.5px/1.2 var(--fb);color:#ffe066;text-align:center}
.ec-need .bar{height:8px;border-radius:99px;background:rgba(10,15,40,.8);border:2px solid var(--ink);overflow:hidden}
.ec-need .bar i{display:block;height:100%;width:100%;transform-origin:0 50%;background:linear-gradient(90deg,#ffd23f,#ff9f1c);border-radius:99px}
.ps-note{margin:12px 0 0;text-align:center;font:700 12.5px/1.3 var(--fb);color:var(--txt3)}
@keyframes petPopIn{from{opacity:0;transform:scale(.6) rotate(-3deg)}}
@keyframes petCardIn{from{opacity:0;transform:translateY(26px) scale(.9)}}
@keyframes petPulse{from{opacity:1}to{opacity:.55}}
@keyframes petRainbow{to{background-position:200% 0,0 0}}
@keyframes petSpin{to{transform:rotate(360deg)}}
@keyframes petNope{0%,100%{transform:none}20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
@keyframes petBought{0%{transform:scale(1)}35%{transform:scale(1.06);box-shadow:0 0 0 4px var(--cash)}100%{transform:scale(1)}}
@keyframes petConfetti{0%{transform:translate(0,0) rotate(0)}100%{transform:translate(var(--x),110vh) rotate(var(--r))}}
@keyframes eggBob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-6px) rotate(2deg)}}
@keyframes eggWobble{0%,100%{transform:rotate(0)}20%{transform:rotate(-12deg)}40%{transform:rotate(10deg)}60%{transform:rotate(-7deg)}80%{transform:rotate(4deg)}}

/* ---------------------------------------------------------------- inventory */
.modal-panel.pets-inv{width:min(860px,100%)}
.pi-head{display:flex;align-items:center;gap:12px;margin:0 0 12px;padding-right:52px}
.pi-head .mh-ic{background:linear-gradient(180deg,#ffb3d9,#ff5ab4);color:#fff;width:48px;height:48px;padding:8px;border-radius:14px;border:3px solid var(--ink);display:grid;place-items:center;flex:none}
.pi-head h2{margin:0;font:var(--fdw) 30px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.pi-count{margin-left:auto;font:var(--fdw) 18px/1 var(--fd);padding:6px 11px 7px;border-radius:12px;background:rgba(10,15,40,.55);white-space:nowrap}
.pi-count.full{color:#ffe066}
.pi-sel{display:grid;grid-template-columns:132px 1fr;gap:4px 16px;align-items:center;padding:12px 14px;border-radius:20px;background:radial-gradient(circle at 70px 50%,color-mix(in srgb,var(--rc) 45%,transparent),transparent 150px),rgba(10,15,40,.42);border:3px solid var(--ink);margin-bottom:12px;min-height:150px}
.pi-sel .pthumb{width:132px;height:132px;grid-row:span 2}
.pi-sel.eq .pthumb::after{content:'';position:absolute;inset:auto 10% 4% 10%;height:10px;border-radius:50%;background:radial-gradient(closest-side,rgba(99,242,127,.7),transparent)}
.pi-info{display:flex;flex-direction:column;gap:6px;min-width:0}
.pi-name{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pi-name b{font:var(--fdw) 26px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.pi-blurb{font:700 13px/1.3 var(--fb);color:var(--txt2)}
.pi-acts{display:flex;gap:9px;flex-wrap:wrap;align-items:center}
.pi-acts .btn{min-height:46px}
.pi-confirm{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:14px;background:rgba(255,59,92,.18);border:2px solid rgba(255,59,92,.5);font:800 13px/1.25 var(--fb)}
.pi-empty{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:22px 12px 8px}
.pi-empty .pthumb{width:120px;height:120px;animation:eggBob 2.4s ease-in-out infinite}
.pi-empty b{font:var(--fdw) 24px/1.1 var(--fd);text-shadow:var(--o1)}
.pi-empty span{font:700 14px/1.35 var(--fb);color:var(--txt2);max-width:420px}
.pi-tools{display:flex;align-items:center;gap:8px;margin:0 0 10px;flex-wrap:wrap}
.pi-tools .pi-hint{font:700 12.5px/1.2 var(--fb);color:var(--txt3);margin-right:auto}
.pi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(98px,1fr));gap:9px}
.pcard{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 4px 8px;border-radius:16px;border:3px solid var(--ink);cursor:pointer;pointer-events:auto;color:#fff;font-family:var(--fb);
  background:radial-gradient(circle at 50% 38%,color-mix(in srgb,var(--rc) 40%,transparent),transparent 62%),rgba(10,15,40,.42);box-shadow:inset 0 -4px 0 color-mix(in srgb,var(--rc) 70%,#000),0 3px 0 rgba(10,14,40,.5);transition:transform .14s var(--spring)}
.pcard:hover{transform:translateY(-2px)}
.pcard:active{transform:translateY(2px)}
.pcard.sel{outline:4px solid #fff;outline-offset:1px}
.pcard:focus-visible{outline:4px solid #fff;outline-offset:3px}
.pcard .pthumb{width:74px;height:74px}
.pcard .pc-n{max-width:100%;font:var(--fdw) 14px/1 var(--fd);letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 0 rgba(0,0,0,.4)}
.pcard .pc-r{font:900 9.5px/1 var(--fb);letter-spacing:.08em;text-transform:uppercase;color:var(--rc);color:color-mix(in srgb,var(--rc) 70%,#fff)}
.pcard .pc-eq{position:absolute;top:-7px;right:-7px;width:26px;height:26px;padding:4px;border-radius:50%;background:var(--green);border:3px solid var(--ink);color:var(--ink);display:grid;place-items:center}
.pcard.new::before{content:'NEW';position:absolute;top:-8px;left:-6px;font:900 10px/1 var(--fb);letter-spacing:.06em;color:var(--ink);background:var(--gold);padding:3px 5px;border-radius:7px;border:2px solid var(--ink);z-index:1}
.pcard.r-mythic,.pi-sel.r-mythic{box-shadow:inset 0 -4px 0 #d11c43,0 0 14px rgba(255,77,109,.45),0 3px 0 rgba(10,14,40,.5)}
.pcard.r-legendary{box-shadow:inset 0 -4px 0 #c07d00,0 0 12px rgba(255,182,39,.35),0 3px 0 rgba(10,14,40,.5)}

/* ---------------------------------------------------------------- hatch overlay */
.pet-hatch{position:absolute;inset:0;z-index:30;pointer-events:auto;display:flex;flex-direction:column;align-items:center;padding:var(--st,10px) 16px var(--sb,10px);
  color:#fff;font-family:var(--fb);opacity:0;transition:opacity .25s;touch-action:none;overflow:hidden;user-select:none;-webkit-user-select:none;outline:none}
.pet-hatch.in{opacity:1}
.pet-hatch.out{opacity:0;transition:opacity .2s}
.ph-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(64,78,170,.94),rgba(12,16,44,.97) 72%)}
.ph-rays{position:absolute;left:var(--cx,50%);top:var(--cy,42%);width:150vmax;height:150vmax;margin:-75vmax 0 0 -75vmax;opacity:0;transform:scale(.35);transition:opacity .6s,transform .9s var(--spring);pointer-events:none}
.ph-rays::before{content:'';position:absolute;inset:0;border-radius:50%;background:repeating-conic-gradient(from 0deg,var(--rc) 0 7deg,transparent 7deg 18deg);
  -webkit-mask:radial-gradient(circle,#000 4%,transparent 42%);mask:radial-gradient(circle,#000 4%,transparent 42%);animation:petSpin 16s linear infinite}
.pet-hatch.r-mythic .ph-rays::before{background:repeating-conic-gradient(#ff4d6d 0 6deg,transparent 6deg 12deg,#ffb627 12deg 18deg,transparent 18deg 24deg,#4cd964 24deg 30deg,transparent 30deg 36deg,#3d9bff 36deg 42deg,transparent 42deg 48deg,#b36bff 48deg 54deg,transparent 54deg 60deg)}
.pet-hatch.crack1 .ph-rays{opacity:.12;transform:scale(.5)}
.pet-hatch.crack3 .ph-rays{opacity:.28;transform:scale(.62)}
.pet-hatch.burst .ph-rays{opacity:.75;transform:scale(1)}
.ph-glow{position:absolute;left:var(--cx,50%);top:var(--cy,42%);width:70vmin;height:70vmin;margin:-35vmin 0 0 -35vmin;border-radius:50%;background:radial-gradient(circle,var(--rc),transparent 62%);opacity:0;transition:opacity .5s;pointer-events:none}
.pet-hatch.crack2 .ph-glow{opacity:.25}
.pet-hatch.burst .ph-glow{opacity:.7;animation:phPulse 1.6s ease-in-out infinite alternate}
.ph-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.pet-hatch.burst .ph-flash{animation:phFlash .7s ease-out}
.ph-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.ph-confetti i{position:absolute;top:-24px;border-radius:2px;animation:petConfetti 3s linear both;animation-iteration-count:2}
.pet-hatch.r-legendary .ph-confetti i,.pet-hatch.r-mythic .ph-confetti i{animation-iteration-count:infinite}
.ph-top{position:relative;flex:none;margin-top:6px;z-index:2}
.ph-kicker{display:inline-block;font:var(--fdw) 20px/1 var(--fd);letter-spacing:.03em;padding:7px 16px 8px;border-radius:999px;background:rgba(10,15,40,.6);border:3px solid var(--ink);text-shadow:var(--o1)}
.ph-kicker::before{content:'Hatching ';color:var(--txt2)}
.pet-hatch.burst .ph-kicker::before{content:'From the '}
.ph-stage{position:absolute;inset:0;z-index:1}
.ph-stage canvas{position:absolute;left:0;top:0;display:block}
.pet-hatch.lost .ph-stage canvas{visibility:hidden}
.pet-hatch:not(.lost) .ph-cssegg,.pet-hatch:not(.lost) .ph-csspet{display:none}
.ph-space{flex:1 1 0;min-height:120px;width:100%;pointer-events:none}
.ph-info{position:relative;z-index:2;flex:none;display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center;width:min(520px,100%);visibility:hidden;padding-bottom:4px}
.pet-hatch.info .ph-info{visibility:visible}
.ph-rarity{font:var(--fdw) 44px/1 var(--fd);letter-spacing:.04em;color:var(--rc);text-shadow:var(--o2);text-transform:uppercase}
.pet-hatch.r-mythic .ph-rarity{color:transparent;text-shadow:none;background:var(--rainbow);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;animation:petRainbow 1.6s linear infinite;
  filter:drop-shadow(3px 0 0 var(--ink)) drop-shadow(-3px 0 0 var(--ink)) drop-shadow(0 3px 0 var(--ink)) drop-shadow(0 -3px 0 var(--ink)) drop-shadow(0 5px 0 var(--ink))}
.pet-hatch.info .ph-rarity{animation:phSlam .5s var(--spring) both}
.pet-hatch.info.r-mythic .ph-rarity{animation:phSlam .5s var(--spring) both,petRainbow 1.6s linear infinite}
.ph-name{font:var(--fdw) 32px/1 var(--fd);letter-spacing:.02em;text-shadow:var(--o1)}
.pet-hatch.info .ph-name{animation:petPopIn .45s .12s var(--spring) both}
.ph-badges{display:flex;gap:8px;min-height:0}
.ph-badges:empty{display:none}
.ph-new,.ph-eq{font:900 12px/1 var(--fb);letter-spacing:.08em;padding:5px 9px;border-radius:9px;border:2.5px solid var(--ink);color:var(--ink)}
.ph-new{background:var(--gold)}
.ph-eq{background:var(--green)}
.ph-boosts{display:flex;flex-wrap:wrap;justify-content:center;gap:6px}
.ph-boost{display:inline-flex;align-items:center;gap:6px;padding:5px 12px 5px 5px;border-radius:999px;background:rgba(10,15,40,.72);border:2.5px solid var(--ink);font:900 15px/1 var(--fb)}
.ph-boost i{display:grid;width:22px;height:22px}
.pet-hatch.info .ph-boosts{animation:petPopIn .45s .22s var(--spring) both}
.ph-blurb{font:700 14px/1.3 var(--fb);color:var(--txt2)}
.ph-btns{display:flex;gap:10px;justify-content:center;margin-top:4px;visibility:hidden}
.pet-hatch.btns .ph-btns{visibility:visible;animation:petPopIn .4s var(--spring) both}
.ph-btns .btn{min-width:150px}
.ph-hint{position:absolute;left:0;right:0;bottom:calc(var(--sb,10px) + 18px);z-index:2;text-align:center;font:800 14px/1 var(--fb);color:var(--txt2);animation:petPulse .9s ease-in-out infinite alternate}
.ph-cssegg{position:absolute;left:var(--cx,50%);top:var(--cy,50%);width:min(30vmin,180px);aspect-ratio:.78;transform:translate(-50%,-50%);border-radius:50% 50% 46% 46%/60% 60% 40% 40%;border:4px solid var(--ink);
  background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.7),transparent 30%),linear-gradient(180deg,#fff6df,#7bd35a);animation:eggWobble .8s ease-in-out infinite}
.ph-cssegg.egg-jungle{background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.6),transparent 30%),linear-gradient(180deg,#5fd66a,#ffd23f 50%,#2a9443)}
.ph-cssegg.egg-volcano{background:radial-gradient(circle at 35% 30%,rgba(255,200,150,.5),transparent 30%),linear-gradient(180deg,#4a2620,#ff5a1a 55%,#1e0e0c)}
.ph-cssegg.egg-galaxy{background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.5),transparent 30%),linear-gradient(180deg,#3a2480,#ff66d9 55%,#110b2e)}
.ph-cssegg.pop{animation:phPop .4s ease-in forwards}
.ph-csspet{position:absolute;left:var(--cx,50%);top:var(--cy,50%);width:min(34vmin,200px);aspect-ratio:1;transform:translate(-50%,-50%);padding:5%;border-radius:50%;color:#fff;
  background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.5),transparent 45%),var(--rc);border:5px solid var(--ink);animation:petPopIn .5s var(--spring) both}
.pthumb.nothumb img{display:none}
.pthumb.nothumb::after{content:'';width:62%;aspect-ratio:1;border-radius:34%;background:linear-gradient(180deg,rgba(255,255,255,.35),rgba(0,0,0,.12)),var(--rc);border:3px solid var(--ink)}
@keyframes phFlash{0%{opacity:.95}100%{opacity:0}}
@keyframes phPulse{from{opacity:.5;transform:scale(.94)}to{opacity:.8;transform:scale(1.06)}}
@keyframes phSlam{0%{opacity:0;transform:scale(2.4) rotate(-6deg)}60%{opacity:1;transform:scale(.92) rotate(2deg)}100%{transform:none}}
@keyframes phPop{to{transform:translate(-50%,-50%) scale(1.6);opacity:0}}

/* ---------------------------------------------------------------- phones */
@media (max-width:760px){
  .ps-eggs{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
  .ec-art{height:104px}
  .ec-art .pthumb{width:86px;height:86px}
  .ec-name{font-size:18px}
  .ec-blurb{display:none}
  .ec-odds li{font-size:11.5px;padding:1px 6px 1px 2px}
  .ec-odds li .pthumb{width:21px;height:21px}
  .ps-bar{margin-top:-6px}
  .ps-bar .btn{padding:8px 12px 10px;font-size:15px;min-height:42px}
  .pi-sel{grid-template-columns:96px 1fr;padding:10px;gap:4px 12px;min-height:0}
  .pi-sel .pthumb{width:96px;height:96px;grid-row:auto}
  .pi-acts{grid-column:1/-1}
  .pi-name b{font-size:22px}
  .pi-head h2{font-size:25px}
  .pi-grid{grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:8px}
  .pcard .pthumb{width:64px;height:64px}
  .ph-rarity{font-size:36px}
  .ph-name{font-size:27px}
  .ph-btns .btn{min-width:0;flex:1}
  .ph-btns{width:100%}
}
@media (max-width:370px){
  .ec-odds li b{font-size:11px}
  .ec-buy{font-size:17px}
}
/* phones in landscape: the pet on the left, its card on the right */
@media (max-height:500px) and (orientation:landscape){
  .pet-hatch{flex-direction:row;justify-content:center;gap:10px;padding:8px max(16px,env(safe-area-inset-right)) 8px max(16px,env(safe-area-inset-left))}
  .ph-top{position:absolute;left:0;right:0;top:8px;text-align:center;margin:0}
  .ph-kicker{font-size:16px;padding:5px 12px 6px}
  .ph-space{flex:1 1 0;height:auto;min-height:0;align-self:stretch;margin-top:38px}
  .ph-info{width:auto;flex:0 1 50%;align-self:center;display:none;gap:6px}
  .pet-hatch.info .ph-info{display:flex}
  .ph-rarity{font-size:32px}
  .ph-name{font-size:24px}
  .ph-blurb{display:none}
  .ph-btns .btn-lg{min-height:46px;font-size:18px;padding:9px 16px 11px}
  .ps-eggs{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  .ec-art{height:90px}
  .ec-art .pthumb{width:74px;height:74px}
  .ec-blurb{display:none}
  .ec-body{padding:0 8px}
  .ec-foot{padding:0 8px}
  .ec-name{font-size:16px}
  .ec-odds li{font-size:11px}
  .ec-odds li .pthumb{width:18px;height:18px}
  .ec-buy{min-height:44px;font-size:16px}
  .pi-sel{grid-template-columns:90px 1fr;min-height:0;padding:8px 10px}
  .pi-sel .pthumb{width:90px;height:90px}
}
@media (prefers-reduced-motion:reduce){
  .ph-rays::before,.ph-confetti{display:none}
  .ec-art .pthumb,.pi-empty .pthumb{animation:none}
}
`;

export function injectPetStyles() {
  if (typeof document === 'undefined' || document.getElementById('sas-pets')) return;
  const s = document.createElement('style');
  s.id = 'sas-pets';
  s.textContent = css;
  document.head.appendChild(s);
}
