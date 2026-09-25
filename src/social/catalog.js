// Emotes and quick-chat phrases. OWNER: social agent (see docs/ONLINE.md). Ids are sent over the
// network and stored, so never renumber or reuse an id; add new ones instead.
// Emote ids are also the avatar animation names (characters/avatar.js: wave, cheer, laugh, point,
// dance1, dance2, dance3, sit). `dur` = seconds the emote lasts (loops repeat until then or until you move).
// Quick chat is the only chat there is (kid-safe: no free typing). `tab` puts a phrase on a wheel page.
import { SOCIAL_ICONS as I } from './icons.js';

export const EMOTES = [
  { id: 'wave', name: 'Wave', dur: 2.2, icon: I.wave },
  { id: 'cheer', name: 'Cheer', dur: 2.0, icon: I.cheer },
  { id: 'laugh', name: 'Laugh', dur: 2.0, icon: I.laugh },
  { id: 'point', name: 'Point', dur: 1.6, icon: I.point },
  { id: 'dance1', name: 'Dance', dur: 6, loop: true, icon: I.dance1 },
  { id: 'dance2', name: 'Robot', dur: 6, loop: true, icon: I.dance2 },
  { id: 'dance3', name: 'Floss', dur: 6, loop: true, icon: I.dance3 },
  { id: 'sit', name: 'Sit', dur: 30, loop: true, icon: I.sit },
];
export const EMOTE = Object.fromEntries(EMOTES.map((e) => [e.id, e]));
export const DANCES = ['dance1', 'dance2', 'dance3'];

export const QUICK_CHAT = [
  // friendly
  { id: 'hi', text: 'Hi!', tab: 'chat', icon: I.hi },
  { id: 'gg', text: 'GG!', tab: 'chat', icon: I.gg },
  { id: 'thanks', text: 'Thanks!', tab: 'chat', icon: I.thanks },
  { id: 'nice', text: 'Nice one!', tab: 'chat', icon: I.nice },
  { id: 'wow', text: 'Wow!', tab: 'chat', icon: I.wow },
  { id: 'yes', text: 'Yes!', tab: 'chat', icon: I.yes },
  { id: 'no', text: 'No thanks!', tab: 'chat', icon: I.no },
  { id: 'bye', text: 'Bye!', tab: 'chat', icon: I.bye },
  // the game (a little teasing is part of the fun)
  { id: 'mine', text: 'My garden!', tab: 'game', icon: I.mine },
  { id: 'nicesteal', text: 'Nice steal!', tab: 'game', icon: I.nicesteal },
  { id: 'race', text: 'Race you!', tab: 'game', icon: I.race },
  { id: 'trade', text: 'Trade?', tab: 'game', icon: I.trade },
  { id: 'help', text: 'Help!', tab: 'game', icon: I.help },
  { id: 'oops', text: 'Oops!', tab: 'game', icon: I.oops },
  { id: 'watch', text: 'Watch out!', tab: 'game', icon: I.watch },
  { id: 'catch', text: 'Catch me!', tab: 'game', icon: I.catch },
];
export const PHRASE = Object.fromEntries(QUICK_CHAT.map((q) => [q.id, q]));

/** Pages of the emote / quick-chat wheel (8 slots each, keys 1-8 in this order, clockwise from the top). */
export const WHEEL_TABS = [
  { id: 'emotes', name: 'Emotes', key: 'G', kind: 'emote', items: EMOTES },
  { id: 'chat', name: 'Chat', key: 'T', kind: 'say', items: QUICK_CHAT.filter((q) => q.tab === 'chat') },
  { id: 'game', name: 'Game', key: 'T', kind: 'say', items: QUICK_CHAT.filter((q) => q.tab === 'game') },
];

/** Seconds between two quick-chat lines from one player (the game enforces the same limit). */
export const SAY_COOLDOWN = 1.2;
