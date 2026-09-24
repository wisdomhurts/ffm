// PLACEHOLDER styles (the UI module owns the full stylesheet).
const css = `
html,body{height:100%;margin:0;overflow:hidden;background:#0d1b2a;font-family:system-ui,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none}
#app{position:fixed;inset:0}
#game-canvas{display:block;width:100%;height:100%}
.labels-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.lbl{position:absolute;left:0;top:0;white-space:nowrap;text-align:center;color:#fff;font-weight:800;text-shadow:0 2px 0 #000a;font-size:14px}
#ui{position:absolute;inset:0;pointer-events:none}
#ui .panel{pointer-events:auto}
`;
export function injectStyles() {
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}
