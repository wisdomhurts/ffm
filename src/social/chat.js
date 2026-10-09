// Typed chat: the kid-safe filter, rate limits and who may type where. Pure JS (no DOM) so the host, every
// client and the Node tests run exactly the same checks. The panel lives in ui/chat.js.
//
// Rules (docs/ONLINE.md):
//  * on in solo games and private rooms; public rooms (Quick Play, the room list) stay on quick-chat phrases
//    unless a parent turns on settings.chatPublic on that device; settings.chatOn off = no typed chat at all;
//  * a message is cleaned (odd characters dropped, at most TEXT_CHAT.maxLen) and then either goes out as it
//    is or is REFUSED with a friendly note (never half-censored): bad words (the player-name word filter,
//    core/names.js, plus a few unkind words), links, emails / @names, phone numbers and long digit runs;
//  * the sender, the host and every receiver run the same check, and the host and receivers only take a
//    line the filter leaves exactly as it is (never trust a sender);
//  * rate limits on the sender (ui) and per player on the host: TEXT_CHAT.burst back to back, then one per gap.
import { TEXT_CHAT } from '../config.js';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { isNameAllowed, nameWords, NAME_HOMO_FROM, NAME_HOMO_TO } from '../core/names.js';

/** Friendly notes for a refused message (keys are checkChat's `why`). */
export const CHAT_NOTES = {
  words: "Let's keep chat friendly! Try different words.",
  link: 'No links in chat, please!',
  email: 'No emails or @names in chat. Keep them secret!',
  number: 'No phone numbers or long numbers in chat!',
  slow: 'Whoa, slow down! Wait a moment.',
  off: 'Typing is off on this device. Quick chat still works!',
  public: 'Public room: quick chat only. A grown-up can allow typing in Settings.',
};

// Unkind words the name filter doesn't list (names rarely need them; chat does). Whole words, any
// letter may repeat ("stuuupid"), with a simple ending.
const UNKIND = ['stupid', 'idiot', 'idiotic', 'dumb', 'dumbo', 'loser', 'moron', 'noob', 'ugly', 'uglier', 'ugliest', 'shutup', 'stfu', 'gtfo', 'wtf', 'omfg', 'kys'];
const plus = (w) => w.replace(/([a-z])/g, '$1+');
const RX_UNKIND = new RegExp(`^(${UNKIND.map(plus).join('|')})(s|es|er|ers|est|ed|y)?$`);

// what may be typed: letters and digits of any script, emoji, spaces and everyday punctuation
const STRIP = /[­ᅟᅠㅤﾠ⠀​-‏‪-‮⁠-⁯︀-️﻿\u{1F3FB}-\u{1F3FF}\u{E0000}-\u{E007F}]/gu;
const NOT_ALLOWED = /[^\p{L}\p{M}\p{Nd}\p{Extended_Pictographic} .,!?'"’‘“”:;()&+\-%$#*=~/…]/gu;

const TLD = 'com|net|org|io|gg|co|uk|me|tv|app|xyz|ly|be|us|info|biz|ru|de|fr|ca|au|nz|link|site|online|club|fun|games?|edu|gov|live|shop|store|page|dev|ai|cc|ws|eu|tk';
const RX_LINK = [
  /https?|www|:\/\/|\b(dot|\(dot\)|\[dot\])\s*(com|net|org)\b/,
  new RegExp(`[a-z0-9]\\.(${TLD})\\b`),
  new RegExp(`[a-z0-9]\\s*(\\(dot\\)|\\[dot\\]|\\bdot\\b)\\s*(${TLD})\\b`),
];
const RX_EMAIL = [/\S@\S/, /(^|\s)@[a-z0-9_.]/, /[a-z0-9]\s*[[(]\s*at\s*[\])]\s*[a-z0-9]/];
const NUM_WORDS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const RX_NUM_WORD = new RegExp(`\\b(${Object.keys(NUM_WORDS).join('|')})\\b`, 'g');
// digits, with the separators people put in phone numbers between them
const RX_DIGIT_RUN = /\p{Nd}(?:[\s.\-–()+/_*#]{0,3}\p{Nd})*/gu;

const translate = (s, from, to) => {
  let out = '';
  for (const ch of s) {
    const i = from.indexOf(ch);
    out += i >= 0 ? to[i] : ch;
  }
  return out;
};
// plain lower-case a-z where it can be (accents dropped, look-alike letters mapped), for the link checks
const fold = (s) => translate(s.normalize('NFKD').replace(/[̀-ͯ]/g, ''), NAME_HOMO_FROM, NAME_HOMO_TO).toLowerCase();

/** Links, emails / @names, phone numbers: 'link' | 'email' | 'number' | null. */
function privateInfo(s) {
  const f = fold(s);
  if (RX_EMAIL.some((rx) => rx.test(f))) return 'email';
  if (RX_LINK.some((rx) => rx.test(f))) return 'link';
  const spelled = f.replace(RX_NUM_WORD, (w) => String(NUM_WORDS[w]));
  for (const m of spelled.match(RX_DIGIT_RUN) || []) {
    if (m.replace(/\D/g, '').length > TEXT_CHAT.maxDigits) return 'number';
  }
  return null;
}

const DIE_AFTER = new Set(['go', 'pls', 'plz', 'please', 'just', 'you', 'u', 'should', 'hope']);
const unkind = (words) => words.some((w, i) => RX_UNKIND.test(w) || (w === 'shut' && words[i + 1] === 'up') || (w === 'die' && DIE_AFTER.has(words[i - 1])));

/** No bad or unkind words, also when symbols are hidden inside them ("f.u.c.k", "sh!t", "a$$"). */
function wordsOk(s) {
  // numbers on their own are just numbers (the name filter reads 455 as "ass")
  const chunks = s.split(/\s+/).filter((t) => t && !/^[\p{Nd}.,:%+\-/]+$/u.test(t));
  const plain = chunks.join(' ');
  const squeezed = chunks.map((t) => nameWords(t).join('')).join(' ');
  if (!isNameAllowed(plain) || !isNameAllowed(squeezed)) return false;
  return !unkind(nameWords(plain)) && !unkind(nameWords(squeezed));
}

/** Typed text -> what would be sent: odd characters dropped, spaces tidied, at most `maxLen` characters. */
export function cleanChat(raw, maxLen = TEXT_CHAT.maxLen) {
  const s = String(raw ?? '').slice(0, maxLen * 4).normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(STRIP, '')
    .replace(NOT_ALLOWED, '')
    .replace(/(^|[^\p{L}\p{M}])\p{M}+/gu, '$1') // marks only right after a letter...
    .replace(/(\p{M}{2})\p{M}+/gu, '$1') // ...and at most two of them
    .replace(/ {2,}/g, ' ')
    .trim();
  return [...s].slice(0, maxLen).join('').trim();
}

/**
 * The chat filter. -> {ok, text, why}: `text` is the cleaned message; when !ok, `why` is 'empty' or a
 * CHAT_NOTES key ('words' | 'link' | 'email' | 'number') and nothing may be sent.
 */
export function checkChat(raw) {
  const typed = String(raw ?? '').slice(0, TEXT_CHAT.maxLen * 4).normalize('NFKC');
  const text = cleanChat(typed);
  if (!text) return { ok: false, text, why: 'empty' };
  // what was typed and what is left of it (dropping a character can join a link back together)
  for (const s of [typed, text]) {
    const why = privateInfo(s);
    if (why) return { ok: false, text, why };
  }
  if (!wordsOk(typed) || !wordsOk(text)) return { ok: false, text, why: 'words' };
  return { ok: true, text, why: null };
}

/** A typed line from the network: allowed only exactly as the filter would send it (and not too long). */
export function isTypedLine(text) {
  if (typeof text !== 'string' || !text || text.length > TEXT_CHAT.maxLen * 2) return false;
  const r = checkChat(text);
  return r.ok && r.text === text;
}

/** Token bucket per key: `burst` messages back to back, then one every `gap` seconds. */
export class ChatLimiter {
  constructor(burst = TEXT_CHAT.burst, gap = TEXT_CHAT.gap) {
    this.burst = burst;
    this.gap = gap;
    this.m = new Map();
  }
  _fill(key, now) {
    let b = this.m.get(key);
    if (!b) this.m.set(key, (b = { t: this.burst, at: now }));
    b.t = Math.min(this.burst, b.t + Math.max(0, now - b.at) / this.gap);
    b.at = now;
    return b;
  }
  allow(key, now) {
    const b = this._fill(key, now);
    if (b.t < 1) return false;
    b.t -= 1;
    return true;
  }
  /** Seconds until `key` may send again (0 = now). */
  wait(key, now) {
    const b = this._fill(key, now);
    return b.t >= 1 ? 0 : (1 - b.t) * this.gap;
  }
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/**
 * A room this device knows is private: made here, or joined by typing a code that isn't in the public
 * list (session.js room.faceOk, the same rule as Photo Booth faces). Anything else counts as public.
 */
export const roomIsPrivate = (room) => !!room && room.private === true && room.faceOk === true;

/** Typed chat can be used, and is shown, on this device right now (`online` = app.online / the session). */
export function typedChatAllowed(online, s = settings) {
  if (!s.chatOn) return false;
  const room = online?.room;
  return !room || roomIsPrivate(room) || !!s.chatPublic;
}

/** Why typing is off here: null (it's on), 'off' (this device) or 'public' (a public room). */
export function typedChatBlock(online, s = settings) {
  if (!s.chatOn) return 'off';
  return typedChatAllowed(online, s) ? null : 'public';
}

const hostLimits = new WeakMap(); // game -> ChatLimiter (a bucket per person)

/**
 * A person's typed line enters the game (offline, or on the host for anyone in the room): filtered again,
 * rate limited per player, then an ordinary 'chat' event {player, text, typed: true} that the HUD, the
 * chat panel, the bots and (on the host) the room hear. Returns true when it was said.
 */
export function postTyped(game, player, text, now = clock()) {
  if (!game || !player?.isPlayer || game.players[player.slot] !== player || !isTypedLine(text)) return false;
  let lim = hostLimits.get(game);
  if (!lim) hostLimits.set(game, (lim = new ChatLimiter(TEXT_CHAT.burst + TEXT_CHAT.hostSlack)));
  if (!lim.allow(player.pid || 'slot' + player.slot, now)) return false;
  bus.emit('chat', { player, text, typed: true });
  return true;
}

const sendLimit = new ChatLimiter();

/**
 * Send what this device's player typed (the chat panel calls this): checks the settings, the filter and
 * the sender's own rate limit, then app.act('chat', text). -> {ok, why, wait?}.
 */
export function sendTyped(app, raw, now = clock()) {
  const block = typedChatBlock(app?.online);
  if (block) return { ok: false, why: block };
  const r = checkChat(raw);
  if (!r.ok) return r;
  if (!sendLimit.allow('me', now)) return { ok: false, text: r.text, why: 'slow', wait: sendLimit.wait('me', now) };
  app.act('chat', r.text);
  return r;
}

/** Seconds until this device may send another typed line (for the panel's Send button). */
export const sendWait = (now = clock()) => sendLimit.wait('me', now);
