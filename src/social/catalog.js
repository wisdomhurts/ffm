// Emotes and quick-chat phrases. OWNER: social agent (see docs/ONLINE.md). Ids are sent over the
// network and stored, so never renumber or reuse an id; add new ones instead.
export const EMOTES = [
  { id: 'wave', name: 'Wave', dur: 2.2 },
  { id: 'cheer', name: 'Cheer', dur: 2.0 },
  { id: 'laugh', name: 'Laugh', dur: 2.0 },
  { id: 'point', name: 'Point', dur: 1.6 },
  { id: 'dance1', name: 'Dance', dur: 6, loop: true },
  { id: 'dance2', name: 'Robot', dur: 6, loop: true },
  { id: 'dance3', name: 'Floss', dur: 6, loop: true },
  { id: 'sit', name: 'Sit', dur: 30, loop: true },
];
export const EMOTE = Object.fromEntries(EMOTES.map((e) => [e.id, e]));

export const QUICK_CHAT = [
  { id: 'hi', text: 'Hi!' },
  { id: 'gg', text: 'Good game!' },
  { id: 'nice', text: 'Nice!' },
  { id: 'mine', text: "Hey, that's mine!" },
  { id: 'race', text: 'Race you!' },
  { id: 'help', text: 'Help!' },
  { id: 'come', text: 'Come to my garden!' },
  { id: 'trade', text: 'Want to trade?' },
  { id: 'watch', text: 'Watch out!' },
  { id: 'thanks', text: 'Thank you!' },
  { id: 'lol', text: 'LOL' },
  { id: 'bye', text: 'Bye!' },
];
export const PHRASE = Object.fromEntries(QUICK_CHAT.map((q) => [q.id, q]));
