// localStorage persistence. Every access is guarded: storage can be missing or throw
// (private windows, sandboxed previews), and the game must run without it.
const PREFIX = 'steal-a-seed:v1:';

/** False when this browser/sandbox refuses localStorage (progress can't be saved). */
export const storageOK = (() => {
  try {
    const k = PREFIX + '__t';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
})();

export function load(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
