// User settings, persisted per device.
import { load, save } from './save.js';
import { bus } from './events.js';

const DEFAULTS = {
  music: 0.6,
  sfx: 0.8,
  quality: 'auto', // 'low' | 'medium' | 'high' | 'auto'
  difficulty: 'normal', // 'chill' | 'normal' | 'chaos'
  camSensitivity: 1,
  invertY: false,
  autoRotate: true,
  tips: true,
  muted: false,
};

export const settings = { ...DEFAULTS, ...(load('settings', {}) || {}) };

export function setSetting(key, value) {
  settings[key] = value;
  save('settings', settings);
  bus.emit('settings:changed', { key, value });
}
