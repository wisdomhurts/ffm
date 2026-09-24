// PLACEHOLDER audio (to be replaced by procedural WebAudio music + SFX).
// Contract: export const audio = { unlock(), attach(game), setMusicMode(mode), play(name, opts), update(dt, ctx) }
//   unlock(): call from a user gesture; creates the AudioContext.
//   attach(game): subscribe to gameplay events on `bus`; detach on 'game:dispose'.
//   setMusicMode('title'|'play'|'chase'|'event'|'victory'|'off')
export const audio = {
  unlock() {},
  attach() {},
  setMusicMode() {},
  play() {},
  update() {},
};
