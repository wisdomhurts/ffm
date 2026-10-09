// Sound settings rules (no DOM, no WebAudio, so tests run them in node). Music and sound effects are two
// independent channels: an on/off switch each (settings.musicOn / sfxOn) and a volume (settings.music / sfx,
// 0..1) that is remembered while the switch is off. "Mute all" (settings.muted: hold the HUD speaker) is
// exactly both switches off; it remembers which were on, so un-muting brings back just those.
// UI: ui/soundControls.js. Audio: audio.js plays each channel at level(kind).
import { settings, setSetting } from '../core/settings.js';
import { load, save, remove } from '../core/save.js';

export const CHANNELS = ['music', 'sfx'];
const SWITCH = { music: 'musicOn', sfx: 'sfxOn' };
export const DEFAULT_VOLUME = { music: 0.6, sfx: 0.8 };
const AUDIBLE = 0.05; // switching a channel on at a lower volume brings it back to its default
const UNMUTE = 'ui:unmute'; // {musicOn, sfxOn} saved by "mute all"

export const SOUND_KEYS = new Set(['music', 'sfx', 'musicOn', 'sfxOn', 'muted']);

/** The volume (0..1) a channel plays at right now: 0 while it is switched off or everything is muted. */
export function level(kind, s = settings) {
  if (s.muted || !s[SWITCH[kind]]) return 0;
  const v = +s[kind];
  return v > 0 ? Math.min(1, v) : 0;
}

/** Is the channel's switch on? */
export const isOn = (kind, s = settings) => !s.muted && !!s[SWITCH[kind]];

/** Nothing can be heard (both channels off or at 0%): the HUD speaker shows its "off" face. */
export const isSilent = (s = settings) => level('music', s) <= 0 && level('sfx', s) <= 0;

// muted follows the two switches; a stale "what to bring back" note goes once anything is on again
function syncMuted(keepNote = false) {
  const m = !settings.musicOn && !settings.sfxOn;
  if (!m || !keepNote) remove(UNMUTE);
  if (m !== settings.muted) setSetting('muted', m);
}

function setSwitch(kind, on) {
  if (on && !(+settings[kind] >= AUDIBLE)) setSetting(kind, DEFAULT_VOLUME[kind]);
  if (settings[SWITCH[kind]] !== on) setSetting(SWITCH[kind], on);
}

/** Flip one channel on or off (its volume is kept). */
export function setChannelOn(kind, on) {
  if (!SWITCH[kind]) return;
  setSwitch(kind, !!on);
  syncMuted();
}

export const toggleChannel = (kind) => setChannelOn(kind, !isOn(kind));

/** Set a channel's volume (0..1). Turning a volume up switches that channel on. */
export function setVolume(kind, v) {
  if (!SWITCH[kind]) return;
  v = Math.max(0, Math.min(1, +v || 0));
  if (settings[kind] !== v) setSetting(kind, v);
  if (v > 0 && !isOn(kind)) setChannelOn(kind, true);
}

/** "Mute all" on: both switches off (the volumes stay). Off: the switches that were on come back. */
export function setAllMuted(muted) {
  muted = !!muted;
  if (muted === !!settings.muted) return;
  if (muted) {
    save(UNMUTE, { musicOn: !!settings.musicOn, sfxOn: !!settings.sfxOn });
    setSwitch('music', false);
    setSwitch('sfx', false);
    syncMuted(true);
    return;
  }
  const prev = load(UNMUTE, null);
  let music = prev?.musicOn ?? true;
  let sfx = prev?.sfxOn ?? true;
  if (!music && !sfx) music = sfx = true; // un-muting always makes some sound
  setSwitch('music', !!music);
  setSwitch('sfx', !!sfx);
  syncMuted();
}
