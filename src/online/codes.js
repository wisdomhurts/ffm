// Save codes like SEED-7K4Q-9XPM. The alphabet has no 0/O/1/I so codes are easy to read aloud and copy
// from a phone screen. Must match public.sas_norm_code in supabase/migrations/0001_steal_a_seed.sql.
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const BODY = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

/** Canonical 'SEED-XXXX-XXXX' for anything a person might type, or null if it can't be a code. */
export function normalizeCode(input) {
  let s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 12 && s.startsWith('SEED')) s = s.slice(4);
  if (!BODY.test(s)) return null;
  return `SEED-${s.slice(0, 4)}-${s.slice(4)}`;
}

/**
 * Pretty-print partial input while typing: "seed7k" -> "SEED-7K", "7k4q9x" -> "SEED-7K4Q-9X".
 * Letters that never appear in codes are kept (so the player sees what they typed) but flagged by
 * `codeProblem`.
 */
export function formatCodeInput(input) {
  let s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('SEED')) s = s.slice(4);
  else if ('SEED'.startsWith(s)) return s; // still typing the prefix
  s = s.slice(0, 8);
  return 'SEED-' + (s.length > 4 ? s.slice(0, 4) + '-' + s.slice(4) : s);
}

/** A short, kid-friendly hint about what's wrong with a typed code (null when it looks fine). */
export function codeProblem(input) {
  let s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('SEED') && s.length > 8) s = s.slice(4);
  const bad = [...new Set(s.replace(/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, ''))];
  if (bad.length) {
    const tip = bad.map((c) => ({ 0: '0 (zero)', O: 'O', 1: '1 (one)', I: 'I' })[c] || c).join(', ');
    return `Codes never use ${tip}. Check the letters again!`;
  }
  if (s.length < 8) return null;
  if (s.length > 8) return 'That code is too long.';
  return null;
}
