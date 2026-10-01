// Pet nicknames: what a player calls a pet they own (profile.pets.owned[i].name). Same rules as player
// names (core/names.js: up to 14 characters, kid-safe word filter), since other players see them online.
// A pet without a nickname goes by its species name ("Dragon").
import { sanitizeName } from '../core/names.js';
import { PET } from './catalog.js';

export const PET_NAME_MAX = 14;

/** A clean nickname, or '' when nothing usable (or nothing allowed) is left. */
export const sanitizePetName = (raw) => (typeof raw === 'string' ? sanitizeName(raw, '') : '');

/** What to call an owned pet ({id, name?}): its nickname, else its species name. */
export const petLabel = (x) => x?.name || PET[x?.id]?.name || 'Pet';

const IDEAS = [
  'Biscuit', 'Noodle', 'Pickles', 'Sprinkles', 'Mochi', 'Waffles', 'Bubbles', 'Peanut', 'Pudding', 'Ziggy', 'Nugget', 'Jellybean',
  'Muffin', 'Tofu', 'Coco', 'Pip', 'Squish', 'Taco', 'Button', 'Marshmallow', 'Doodle', 'Pumpkin', 'Cupcake', 'Nibbles', 'Sir Fluff',
  'Captain Wiggle', 'Princess Pea', 'Snickers', 'Gizmo', 'Rocket', 'Pebble', 'Toffee', 'Dumpling', 'Zoom', 'Bean', 'Sparky',
  'Mr Whiskers', 'Lady Sprout', 'Beans', 'Fudge', 'Popcorn', 'Pickle', 'Sushi', 'Tiny', 'Big Bob', 'Wobbles',
];

/** A fun random nickname (not `avoid`), for the dice button. */
export function randomPetName(avoid = '', rand = Math.random) {
  const i = Math.floor(rand() * IDEAS.length) % IDEAS.length;
  return IDEAS[i] === avoid ? IDEAS[(i + 1) % IDEAS.length] : IDEAS[i];
}

/**
 * Check a typed nickname: {ok, name, text}. An empty box is fine (the pet keeps its species name);
 * a blocked word is not; anything the cleaner trimmed is shown back ("Will be called ...").
 */
export function checkPetName(raw) {
  const typed = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!typed) return { ok: true, name: '', text: '' };
  const name = sanitizePetName(typed);
  if (!name) return { ok: false, name: '', text: "Oops! That name isn't allowed. Try another one." };
  if (name !== typed) return { ok: true, name, text: `Will be called “${name}”.` };
  return { ok: true, name, text: '' };
}
