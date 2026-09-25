// Player names shown to others (public rooms, high scores): short, printable, and kid-safe.
// The filter is a simple blocklist on a normalized form (leetspeak and separators folded), which is
// what most kids' games do on the client; the server repeats the length/character rules.

const MAX = 14;
// normalized substrings that are never allowed (kept short and generic on purpose)
const BLOCK = [
  'fuck', 'fuk', 'fck', 'shit', 'sh1t', 'bitch', 'btch', 'cunt', 'dick', 'cock', 'pussy', 'penis', 'vagin',
  'porn', 'sex', 'boob', 'tits', 'nigg', 'nigga', 'fag', 'retard', 'rape', 'nazi', 'hitler', 'kkk', 'slut',
  'whore', 'bastard', 'asshole', 'arse', 'wank', 'jizz', 'cum', 'anal', 'kill', 'suicide', 'damn', 'crap',
];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i' };

function normalize(s) {
  return s.toLowerCase().replace(/[013457@$!|8]/g, (c) => LEET[c] || c).replace(/[^a-z]/g, '');
}

export function isNameAllowed(name) {
  const n = normalize(name);
  if (!n.length) return false;
  // 'ass' only as a whole word part (lots of real names contain it: Cassie, Jasper...)
  if (/(^|[^a-z])ass($|[^a-z])/i.test(name.toLowerCase())) return false;
  return !BLOCK.some((w) => n.includes(w));
}

/** Clean up a typed name. Returns '' when nothing usable is left (callers fall back to a default). */
export function sanitizeName(raw, fallback = '') {
  let s = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _.'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX)
    .trim();
  if (!s || !isNameAllowed(s)) s = fallback;
  return s;
}

const ADJ = ['Sunny', 'Speedy', 'Sneaky', 'Lucky', 'Happy', 'Zippy', 'Mighty', 'Bouncy', 'Jolly', 'Sparkly', 'Brave', 'Cosmic'];
const NOUN = ['Sprout', 'Seed', 'Tulip', 'Pepper', 'Melon', 'Daisy', 'Clover', 'Mango', 'Bean', 'Berry', 'Cactus', 'Lotus'];

/** A friendly random name like "Zippy Melon 42" (used for guests and as a suggestion). */
export function randomName(rand = Math.random) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  return `${pick(ADJ)} ${pick(NOUN)}`.slice(0, MAX);
}
