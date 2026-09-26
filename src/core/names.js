// Player names shown to others (public rooms, high scores): short, printable, and kid-safe.
//
// The word filter works on WORDS, not substrings, so real names like Killian, Grape, Peacock, Essex,
// Scunthorpe or "Ana Lopez" are fine:
//  * the name is folded to plain a-z (accents dropped, look-alike Cyrillic/Greek letters and leetspeak
//    mapped) and split into words at everything else;
//  * STRONG words (slurs, hard swearing) are blocked at the start or end of a word, also with an
//    ending ("fuckface", "bullshit", "motherfucker");
//  * MILD words (kill, sex, cock, nazi...) are blocked only as a whole word, optionally with a simple
//    ending (kills, killer, killing);
//  * any letter of a listed word may be repeated ("fuuuck", "shiiit"), but a doubled letter in a listed
//    word still needs two, so "boob" doesn't catch Bob and "nigg" doesn't catch Nigel;
//  * runs of 1-2 letter words are also checked glued together, which catches "f u c k" and "k.i.l.l";
//  * letters of other scripts can't be filtered reliably, so they are accepted as they are.
// MIRRORED IN SQL: public.sas_name_ok / public.sas_clean_name in supabase/migrations/0001_steal_a_seed.sql.
// tests/online/names.test.mjs fails if the lists or maps below and the SQL ever differ.

const MAX = 14;

export const NAME_STRONG = [
  'fuck', 'fck', 'fvck', 'phuck', 'shit', 'bitch', 'btch', 'biatch', 'biotch', 'beyotch', 'byatch', 'biyatch', 'cunt', 'nigg', 'faggot', 'retard', 'pussy', 'penis', 'vagin',
  'hitler', 'kkk', 'twat', 'dildo', 'jizz', 'asshole', 'cocksuck', 'suicide',
];
export const NAME_STRONG_END = ['', 's', 'es', 'er', 'ers', 'ing', 'in', 'ed', 'y', 'ey', 'face', 'head', 'hole'];
export const NAME_MILD = [
  'kill', 'kys', 'rape', 'rapist', 'rapey', 'cock', 'sex', 'sexy', 'nazi', 'anal', 'anus', 'cum', 'arse', 'arsehole', 'crap',
  'crappy', 'damn', 'tits', 'titty', 'titties', 'dick', 'dickhead', 'porn', 'porno', 'porny', 'boob', 'boobie', 'boobies',
  'slut', 'slutty', 'whore', 'bastard', 'ass', 'asshat', 'asswipe', 'assface', 'dumbass', 'jackass', 'smartass', 'fatass',
  'badass', 'fag', 'faggy', 'fuk', 'fcuk', 'wank', 'piss', 'milf', 'horny', 'nude', 'naked', 'bollock',
];
export const NAME_MILD_END = ['', 's', 'es', 'er', 'ers', 'ing', 'ed'];
// real names a rule above would catch
export const NAME_ALLOW = ['cocker', 'shital', 'shitara', 'ashit'];

// look-alike letters that don't fold under NFKD (Cyrillic, Greek, a few Latin), mapped to a-z
const HOMO = [
  ['а', 'a'], ['А', 'a'], ['в', 'b'], ['В', 'b'], ['с', 'c'], ['С', 'c'], ['е', 'e'], ['Е', 'e'], ['н', 'h'], ['Н', 'h'],
  ['і', 'i'], ['І', 'i'], ['ј', 'j'], ['Ј', 'j'], ['к', 'k'], ['К', 'k'], ['м', 'm'], ['М', 'm'], ['о', 'o'], ['О', 'o'],
  ['р', 'p'], ['Р', 'p'], ['ѕ', 's'], ['Ѕ', 's'], ['т', 't'], ['Т', 't'], ['у', 'y'], ['У', 'y'], ['х', 'x'], ['Х', 'x'],
  ['ԁ', 'd'], ['ԛ', 'q'], ['ԝ', 'w'],
  ['α', 'a'], ['Α', 'a'], ['β', 'b'], ['Β', 'b'], ['ε', 'e'], ['Ε', 'e'], ['ι', 'i'], ['Ι', 'i'], ['κ', 'k'], ['Κ', 'k'],
  ['Μ', 'm'], ['μ', 'u'], ['ν', 'v'], ['Ν', 'n'], ['ο', 'o'], ['Ο', 'o'], ['ρ', 'p'], ['Ρ', 'p'], ['τ', 't'], ['Τ', 't'],
  ['υ', 'u'], ['Υ', 'y'], ['χ', 'x'], ['Χ', 'x'], ['Ζ', 'z'],
  ['ı', 'i'], ['ł', 'l'], ['Ł', 'l'], ['ø', 'o'], ['Ø', 'o'], ['đ', 'd'], ['Đ', 'd'], ['ɑ', 'a'], ['ƒ', 'f'],
];
export const NAME_HOMO_FROM = HOMO.map((p) => p[0]).join('');
export const NAME_HOMO_TO = HOMO.map((p) => p[1]).join('');
export const NAME_LEET_FROM = '013457@$!|8';
export const NAME_LEET_TO = 'oieastasiib';

function translate(s, from, to) {
  let out = '';
  for (const ch of s) {
    const i = from.indexOf(ch);
    out += i >= 0 ? to[i] : ch;
  }
  return out;
}

/** The a-z words the filter looks at: "Zoë Fück-3r" -> ['zoe', 'fuck', 'er']. */
export function nameWords(name) {
  let s = String(name ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = translate(s, NAME_HOMO_FROM, NAME_HOMO_TO).toLowerCase();
  s = translate(s, NAME_LEET_FROM, NAME_LEET_TO);
  return s.split(/[^a-z]+/).filter(Boolean);
}

// Each listed word becomes a pattern in which every letter may repeat: fuck -> f+u+c+k+, boob -> b+o+o+b+.
// Built the same way in SQL (sas_name_word_bad), so both sides match exactly the same words.
const plus = (w) => w.replace(/([a-z])/g, '$1+');
const alt = (list) => list.filter(Boolean).map(plus).join('|');
const RX_STRONG_START = new RegExp(`^(${alt(NAME_STRONG)})`);
const RX_STRONG_END = new RegExp(`(${alt(NAME_STRONG)})(${alt(NAME_STRONG_END)})?$`);
const RX_MILD = new RegExp(`^(${alt(NAME_MILD)})(${alt(NAME_MILD_END)})?$`);

function badWord(t) {
  if (NAME_ALLOW.includes(t)) return false;
  return RX_STRONG_START.test(t) || RX_STRONG_END.test(t) || RX_MILD.test(t);
}

/** True when no word of the name is on the blocklists (see the top of this file). */
export function isNameAllowed(name) {
  let run = '';
  let runN = 0;
  const flush = () => {
    const bad = runN >= 2 && badWord(run);
    run = '';
    runN = 0;
    return bad;
  };
  for (const t of nameWords(name)) {
    if (t.length <= 2) {
      run += t;
      runN++;
    } else if (flush()) return false;
    if (badWord(t)) return false;
  }
  return !flush();
}

/**
 * Clean up a typed name: letters of any script, digits, spaces and _ . ' - (accents/marks only right
 * after a letter, at most two), at most 14 characters. Returns `fallback` ('' by default) when nothing
 * usable is left or the name isn't allowed.
 */
export function sanitizeName(raw, fallback = '') {
  const typed = String(raw ?? '').normalize('NFKC');
  let s = typed
    .replace(/[^\p{L}\p{M}\p{N} _.'-]/gu, '')
    // what the server refuses too: invisible fillers, symbol/punctuation blocks, variation selectors
    .replace(/[\u115F\u1160\u3164\u2000-\u2BFF\u2E00-\u2E7F\u3000-\u3004\u3006-\u303F\uFE00-\uFE6F\uFF00-\uFFFF]|[\u{E0000}-\u{10FFFF}]/gu, '')
    .replace(/(^|[^\p{L}\p{M}])\p{M}+/gu, '$1')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  s = [...s].slice(0, MAX).join('').trim();
  // check what was typed too, so symbols can't hide a word ("a$$" would otherwise become "a")
  if (!s || !isNameAllowed(s) || !isNameAllowed(typed)) s = fallback;
  return s;
}

const ADJ = ['Sunny', 'Speedy', 'Sneaky', 'Lucky', 'Happy', 'Zippy', 'Mighty', 'Bouncy', 'Jolly', 'Sparkly', 'Brave', 'Cosmic'];
const NOUN = ['Sprout', 'Seed', 'Tulip', 'Pepper', 'Melon', 'Daisy', 'Clover', 'Mango', 'Bean', 'Berry', 'Cactus', 'Lotus'];

/** A friendly random name like "Zippy Melon 42" (used for guests and as a suggestion). */
export function randomName(rand = Math.random) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  return `${pick(ADJ)} ${pick(NOUN)}`.slice(0, MAX);
}
