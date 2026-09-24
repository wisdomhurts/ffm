// PLACEHOLDER effects (to be replaced by pooled particle systems + juicy floating text).
// Contract: createEffects(engine, labelsContainer) -> {
//   burst(kind, pos, opts)   kind: 'coins'|'sparkle'|'poof'|'splash'|'stars'|'confetti'|'dust'|'leaves'|'rarity'; opts: {color, count, scale}
//   floatText(text, pos, opts)  opts: {color, size:'s'|'m'|'l', duration}
//   update(dt, time)
// }
// It also subscribes to gameplay events on `bus` itself to trigger the right effects.
export function createEffects(engine, container) {
  return {
    burst() {},
    floatText() {},
    update() {},
    attach() {},
  };
}
