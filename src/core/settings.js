// User settings, persisted per device.
import { load, save } from './save.js';
import { bus } from './events.js';

const DEFAULTS = {
  music: 0.6,
  sfx: 0.8,
  quality: 'auto', // 'low' | 'medium' | 'high' | 'auto'
  difficulty: 'chill', // 'chill' | 'normal' | 'chaos' (Chill is kindest for a first game)
  camSensitivity: 1,
  invertY: false,
  autoRotate: true,
  tips: true,
  muted: false,
};

const ENUMS = { quality: ['low', 'medium', 'high', 'auto'], difficulty: ['chill', 'normal', 'chaos'] };
const RANGES = { music: [0, 1], sfx: [0, 1], camSensitivity: [0.2, 3] };

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

export const settings = clean(load('settings', {}));

export function setSetting(key, value) {
  settings[key] = value;
  save('settings', settings);
  bus.emit('settings:changed', { key, value });
}
