// Supabase project for cloud saves + high scores (docs/ONLINE.md "Online API"). OWNER: backend agent.
// The URL and the publishable ("anon") key are public by design: every table is locked (RLS on, no
// policies, no grants) and the game can only call the sas_* RPCs in supabase/migrations.
// With empty strings every online feature stays quietly off (the project is "steal-a-seed" in the
// WisdomHurts organization; supabase/README.md has the setup).
export const SUPABASE_URL = 'https://mdntplpjsvofzczpfcet.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_dmzOvMXJJGcICEc-sT57pw_6Fa-LcmH';

/**
 * The active settings. Tests (and dev pages) may point the game at a fake backend by defining
 * `window.__SAS_ONLINE__ = { url, key }` before the game loads.
 */
export function onlineConfig() {
  const o = typeof globalThis !== 'undefined' ? globalThis.__SAS_ONLINE__ : null;
  if (o && typeof o.url === 'string') return { url: o.url.replace(/\/+$/, ''), key: String(o.key || '') };
  return { url: SUPABASE_URL.replace(/\/+$/, ''), key: SUPABASE_KEY };
}

/** True when a backend is configured (says nothing about the network being up). */
export function onlineConfigured() {
  const c = onlineConfig();
  return !!(c.url && c.key && typeof fetch === 'function');
}
