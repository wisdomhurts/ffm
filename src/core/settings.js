// User settings, persisted per device.
import { load, save, remove } from './save.js';
import { bus } from './events.js';

const DEFAULTS = {
  music: 0.6, // volume 0..1 (kept when muted or switched off)
  sfx: 0.8,
  musicOn: true, // music on/off switch (the volume is remembered)
  sfxOn: true, // sound effects on/off switch
  quality: 'auto', // 'low' | 'medium' | 'high' | 'auto'
  difficulty: 'chill', // 'chill' | 'normal' | 'chaos' (Chill is kindest for a first game)
  camSensitivity: 1,
  invertY: false,
  autoRotate: true,
  tips: true,
  muted: false, // "mute all" (hold the HUD speaker): true exactly while both switches are off (audio/levels.js)
  autoFullscreen: true, // phones and tablets go full screen when a game starts (ui/fullscreen.js)
  hudLayout: 'auto', // 'auto' | 'simple' | 'full' (ui/hudLayout.js: auto = Simple on small screens)
  onlineBots: 3, // online rooms you host: how many empty gardens get a computer player (0-3)
  speedGear: 2, // GEARS index: 0 slow, 1 cruise, 2 full (X / tapping the speedometer cycles it)
  chatOn: true, // typed chat (private rooms and solo)
  chatPublic: false, // parents: also allow typed chat (filtered) in PUBLIC rooms
};

const ENUMS = { quality: ['low', 'medium', 'high', 'auto'], difficulty: ['chill', 'normal', 'chaos'], hudLayout: ['auto', 'simple', 'full'] };
const RANGES = { music: [0, 1], sfx: [0, 1], camSensitivity: [0.2, 3], onlineBots: [0, 3], speedGear: [0, 2] };

// Stored settings may come from an older/newer version or be hand-edited: keep only known keys with the
// right type (and value range), so a bad value can never stop the game from starting.
function clean(stored) {
  const out = { ...DEFAULTS };
  if (!stored || typeof stored !== 'object') return out;
  for (const [k, def] of Object.entries(DEFAULTS)) {
    const v = stored[k];
    if (typeof v !== typeof def) continue;
    if (ENUMS[k] && !ENUMS[k].includes(v)) continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) continue;
      const r = RANGES[k];
      out[k] = r ? Math.min(r[1], Math.max(r[0], v)) : v;
    } else out[k] = v;
  }
  return out;
}

// Sound before the on/off switches: Mute zeroed both volumes (the old levels waited under 'ui:unmute') and
// "music off" meant a volume of 0. Carried over once: the volumes come back, the switches take over, and no
// sound turns itself back on. Returns null when there is nothing to carry over, else {unmute}: what un-muting
// brings back (audio/levels.js). `out` is the cleaned settings (changed in place).
export function migrateSound(out, stored, unmute) {
  if (!stored || typeof stored !== 'object' || !('music' in stored || 'muted' in stored)) return null;
  const zeroed = out.muted && out.music === 0 && out.sfx === 0; // an old-style mute, whatever else is saved
  if (typeof stored.musicOn === 'boolean' && !zeroed) return null;
  const vol = (v, def) => (typeof v === 'number' && v > 0 && v <= 1 ? v : def);
  let back = null;
  if (out.muted) {
    // ?? not ||: a remembered level of 0 was that channel switched off, so it stays off after un-muting
    const m = unmute?.music ?? DEFAULTS.music;
    const s = unmute?.sfx ?? DEFAULTS.sfx;
    back = { musicOn: !(m <= 0), sfxOn: !(s <= 0) };
    out.music = vol(m, DEFAULTS.music);
    out.sfx = vol(s, DEFAULTS.sfx);
    out.musicOn = out.sfxOn = false;
  } else {
    out.musicOn = out.music > 0;
    out.sfxOn = out.sfx > 0;
    out.music = vol(out.music, DEFAULTS.music);
    out.sfx = vol(out.sfx, DEFAULTS.sfx);
  }
  out.muted = !out.musicOn && !out.sfxOn;
  return { unmute: back };
}

function loadSettings() {
  const stored = load('settings', {});
  const out = clean(stored);
  const moved = migrateSound(out, stored, load('ui:unmute', null));
  if (moved) {
    save('settings', out);
    if (moved.unmute) save('ui:unmute', moved.unmute);
    else remove('ui:unmute');
  }
  out.muted = !out.musicOn && !out.sfxOn; // "mute all" is exactly both switches off
  return out;
}

export const settings = loadSettings();

export function setSetting(key, value) {
  settings[key] = value;
  save('settings', settings);
  bus.emit('settings:changed', { key, value });
}
