// Typed chat: the kid-safe filter, rate limits and who may type where. Pure JS (no DOM) so the host, every
// client and the Node tests run exactly the same checks. The panel lives in ui/chat.js.
//
// Rules (docs/ONLINE.md):
//  * on in solo games and private rooms; public rooms (Quick Play, the room list) stay on quick-chat phrases
//    unless a parent turns on settings.chatPublic on that device; settings.chatOn off = no typed chat at all;
//  * a message is cleaned (odd characters dropped, at most TEXT_CHAT.maxLen) and then either goes out as it
//    is or is REFUSED with a friendly note (never half-censored): bad words (the player-name word filter,
//    core/names.js, plus chat-only unkind words, slurs and threats), links (also spaced out or with the dot
//    written another way), other chat apps, emails / @names / app usernames, phone numbers and long digit
//    runs (also split up by words), a few rude emoji, and letters from look-alike alphabets the filter can't
//    read (fancy small capitals are read as plain letters);
//  * the filter refuses rather than guesses: tests/social/chat.test.mjs keeps a list of everyday kid
//    sentences that must always go through;
//  * the sender, the host and every receiver run the same check, and the host and receivers only take a
//    line the filter leaves exactly as it is (never trust a sender);
//  * rate limits on the sender (ui) and per player on the host: TEXT_CHAT.burst back to back, then one per gap.
import { TEXT_CHAT } from '../config.js';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import {
  isNameAllowed, nameWords, NAME_HOMO_FROM, NAME_HOMO_TO, NAME_STRONG, NAME_STRONG_END, NAME_MILD, NAME_MILD_END, NAME_ALLOW,
} from '../core/names.js';

/** Friendly notes for a refused message (keys are checkChat's `why`). */
export const CHAT_NOTES = {
  words: "Let's keep chat friendly! Try different words.",
  link: 'No links in chat, please!',
  email: 'No emails or @names in chat. Keep them secret!',
  number: 'No phone numbers or long numbers in chat!',
  slow: 'Whoa, slow down! Wait a moment.',
  off: 'Typing is off on this device. Quick chat still works!',
  public: 'Public room: quick chat only.',
};

// Unkind words and threats the name filter doesn't list (names rarely need them; chat does), plus a few
// short forms of its words. Whole words, any letter may repeat ("stuuupid"), with a simple ending.
const UNKIND = [
  'stupid', 'idiot', 'idiotic', 'dumb', 'dumbo', 'loser', 'moron', 'noob', 'ugly', 'uglier', 'ugliest', 'shutup', 'stfu', 'gtfo', 'wtf', 'omfg', 'kys',
  'murder', 'unalive', 'unalived', 'kil', 'fk', 'fking', 'fkin', 'fkn', 'sht', 'shyt',
];
// Slurs the name filter doesn't list: whole words, only a plural ending (so "spicy" is still a pepper).
const SLURS = ['chink', 'chinky', 'spic', 'spick', 'kike', 'wetback', 'tranny', 'trannie', 'gook', 'beaner', 'paki', 'dyke', 'raghead', 'towelhead'];
const plus = (w) => w.replace(/([a-z])/g, '$1+');
const alt = (list) => list.filter(Boolean).map(plus).join('|');
const RX_UNKIND = new RegExp(`^(${alt(UNKIND)})(s|es|er|ers|est|ed|y)?$`);
const RX_SLUR = new RegExp(`^(${alt(SLURS)})(s|es|z)?$`);
// a whole word the name filter lists (for words split in pieces, where "starts with" would catch "a bit cheaper")
const RX_LISTED = new RegExp(`^((${alt(NAME_STRONG)})(${alt(NAME_STRONG_END)})?|(${alt(NAME_MILD)})(${alt(NAME_MILD_END)})?)$`);
const listed = (w) => !NAME_ALLOW.includes(w) && (RX_LISTED.test(w) || RX_UNKIND.test(w) || RX_SLUR.test(w));

// what may be typed: letters and digits of any script, emoji, spaces and everyday punctuation
const STRIP = /[­ᅟᅠㅤﾠ⠀​-‏‪-‮⁠-⁯︀-️﻿\u{1F3FB}-\u{1F3FF}\u{E0000}-\u{E007F}]/gu;
const NOT_ALLOWED = /[^\p{L}\p{M}\p{Nd}\p{Extended_Pictographic} .,!?'"’‘“”:;()&+\-%$#*=~/…]/gu;

// Fancy and look-alike letters the name filter doesn't fold (chat only; the names' SQL mirror stays as it is):
// small capitals and IPA letters from "fancy text" sites, a few more Cyrillic / Greek / Armenian look-alikes,
// and the letter emoji. Read as plain a-z, so "ʜɪ ᴍᴏᴍ" goes through and "ꜱᴛᴜᴘɪᴅ" doesn't.
const CHAT_HOMO = new Map([
  ['ᴀ', 'a'], ['ʙ', 'b'], ['ᴄ', 'c'], ['ᴅ', 'd'], ['ᴇ', 'e'], ['ꜰ', 'f'], ['ɢ', 'g'], ['ʜ', 'h'], ['ɪ', 'i'], ['ᴊ', 'j'], ['ᴋ', 'k'], ['ʟ', 'l'], ['ᴍ', 'm'],
  ['ɴ', 'n'], ['ᴏ', 'o'], ['ᴘ', 'p'], ['ꞯ', 'q'], ['ʀ', 'r'], ['ꜱ', 's'], ['ᴛ', 't'], ['ᴜ', 'u'], ['ᴠ', 'v'], ['ᴡ', 'w'], ['ʏ', 'y'], ['ᴢ', 'z'],
  ['ɑ', 'a'], ['ɡ', 'g'], ['ɩ', 'i'], ['ɛ', 'e'], ['ə', 'e'], ['ɔ', 'o'], ['ɵ', 'o'], ['ɓ', 'b'], ['ɗ', 'd'], ['ɖ', 'd'], ['ɦ', 'h'], ['ɱ', 'm'], ['ɳ', 'n'], ['ɾ', 'r'],
  ['ɽ', 'r'], ['ʂ', 's'], ['ʈ', 't'], ['ʋ', 'v'], ['ʝ', 'j'], ['ɭ', 'l'], ['ꞙ', 'f'], ['Ꞙ', 'f'],
  ['һ', 'h'], ['Һ', 'h'], ['ӏ', 'l'], ['Ӏ', 'l'], ['ү', 'y'], ['Ү', 'y'], ['ѵ', 'v'], ['Ѵ', 'v'], ['ѡ', 'w'],
  ['ϲ', 'c'], ['Ϲ', 'c'], ['ϳ', 'j'], ['η', 'n'], ['ω', 'w'], ['γ', 'y'],
  ['ս', 'u'], ['Ս', 'u'], ['օ', 'o'], ['Օ', 'o'], ['հ', 'h'], ['ո', 'n'], ['ց', 'g'], ['ք', 'p'], ['զ', 'q'], ['ա', 'w'], ['Տ', 's'],
  ['\u{1F170}', 'a'], ['\u{1F171}', 'b'], ['\u{1F17E}', 'o'], ['\u{1F17F}', 'p'],
]);
const chatFold = (s) => {
  let out = '';
  for (const ch of s) out += CHAT_HOMO.get(ch) ?? ch;
  return out;
};
// Letters from look-alike alphabets left after that (phonetic letters, Latin extensions, Lisu, Cherokee,
// Canadian syllabics, runes, Tifinagh, Coptic, Old Italic, Deseret, Osage...): "ꓝꓴꓚꓗ" reads as a word the
// filter can't see, so a line with them is refused.
const RX_ODD_LETTERS = /[\u0250-\u02AF\u1D00-\u1DBF\u2C60-\u2C7F\uA720-\uA7FF\uAB30-\uAB6F\uA4D0-\uA4FF\u13A0-\u13FF\uAB70-\uABBF\u1400-\u167F\u18B0-\u18FF\u16A0-\u16FF\u2D30-\u2D7F\u2C80-\u2CFF\u{10300}-\u{1034F}\u{10400}-\u{1044F}\u{104B0}-\u{104FF}\u{10500}-\u{1056F}]/u;
// rude emoji (middle finger, eggplant, peach, gun, knife, dagger, 18+); skin tones are already dropped
const RX_RUDE_EMOJI = /[\u{1F595}\u{1F346}\u{1F351}\u{1F52B}\u{1F52A}\u{1F5E1}\u{1F51E}]/u;
// a word with stars hiding letters ("f**k", "sh#t"); "*hugs*" and 5*5 are fine
const RX_MASKED = /\p{L}[*#]+\p{L}/u;

const TLD = 'com|net|org|io|gg|co|uk|me|tv|app|xyz|ly|be|us|info|biz|ru|de|fr|ca|au|nz|link|site|online|club|fun|games?|edu|gov|live|shop|store|page|dev|ai|cc|ws|eu|tk|gift';
// endings that are never words, for "site. com" (a sentence can end in a dot and go on with "Me too!")
const TLD_NOT_WORDS = 'com|net|org|ly|io|xyz|ru|tk|biz';
// other chat apps (naming one is a way out of the game), and sites written any way at all ("roblox,com", "bit ly")
const APPS = 'discord|snapchat|whatsapp|telegram|kik|skype|wechat';
const SITES = 'roblox|youtube|tiktok|instagram|insta|facebook|twitter|reddit|twitch';
const RX_LINK = [
  /\bwww\b|\bhttps?\b|:\/\/|\b(dot|\(dot\)|\[dot\])\s*(com|net|org)\b/,
  new RegExp(`[a-z0-9]\\.(${TLD})\\b`),
  new RegExp(`[a-z0-9]\\s*(\\(dot\\)|\\[dot\\]|\\bdot\\b)\\s*(${TLD})\\b`),
  new RegExp(`[a-z0-9]\\s+\\.\\s*(${TLD})\\b`), // "site .com", "site . com": a space before a dot isn't how sentences end
  new RegExp(`[a-z0-9]\\.\\s+(${TLD_NOT_WORDS})\\b`),
  /[a-z0-9]\s*,\s*(com|net|org)\b/,
  new RegExp(`\\b(${APPS})\\b|\\bbit\\W*ly\\b|\\byoutu\\W+be\\b|\\btwitch\\W*tv\\b|\\b(${SITES})\\W*com\\b`),
];
const RX_EMAIL = [/\S@\S/, /(^|\s)@[a-z0-9_.]/, /[a-z0-9]\s*[[(]\s*at\s*[\])]\s*[a-z0-9]/];
// a username on an app or game ("insta: kid123", "my snap is kid_12", "my roblox name is sunnykid")
const HANDLE_APPS = 'insta|instagram|ig|snap|snapchat|discord|tiktok|whatsapp|telegram|kik|skype|twitter|facebook|fb|youtube|yt|twitch|roblox|rblx|xbox|psn|steam';
const HANDLE_WORD = '(user\\s*name|username|name|user|id|tag|handle|acc|account)';
const RX_HANDLE = [
  new RegExp(`\\b(${HANDLE_APPS})\\s*${HANDLE_WORD}?\\s*[:=]\\s*@?[a-z0-9_.]{3,}`),
  new RegExp(`\\b(${HANDLE_APPS})\\s*${HANDLE_WORD}\\s*(is\\b|-)\\s*@?[a-z0-9_.]{3,}`),
  new RegExp(`\\b(${HANDLE_APPS})\\s+(is\\s+|-\\s*)?@?(?=[a-z0-9_.]*[a-z])(?=[a-z0-9_.]*[0-9_])[a-z0-9_.]{3,}`),
];
const NUM_WORDS = { zero: 0, oh: 0, o: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
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
const fold = (s) => translate(chatFold(s).normalize('NFKD').replace(/[\u0300-\u036F]/g, ''), NAME_HOMO_FROM, NAME_HOMO_TO).toLowerCase();
// single letters spaced out joined up again ("w w w", "c o m", "d.i.s.c.o.r.d"), for the link checks only
const joinSingles = (s) => s.replace(/\b[a-z0-9](?:[\s.\-_*]+[a-z0-9]\b)+/g, (m) => m.replace(/[\s.\-_*]+/g, ''));

/** Links, emails / @names / usernames, phone numbers: 'link' | 'email' | 'number' | null. */
function privateInfo(s) {
  const f = fold(s);
  if (RX_EMAIL.some((rx) => rx.test(f)) || RX_HANDLE.some((rx) => rx.test(f))) return 'email';
  // also with the tricks undone: 0 for o ("g00gle.c0m"), "(.)" for a dot, letters spaced out
  const g = f.replace(/0/g, 'o').replace(/[([{]\s*\.\s*[)\]}]/g, '.');
  for (const t of [f, g, joinSingles(g)]) if (RX_LINK.some((rx) => rx.test(t))) return 'link';
  // numbers spelled out ("five five five", "555 o 12"), o between digits ("5o5")
  const spelled = f.replace(RX_NUM_WORD, (w) => String(NUM_WORDS[w])).replace(/(\p{Nd})o(?=\p{Nd})/gu, '$10');
  // one long run of digits ("555-123-4567") ...
  for (const m of spelled.match(RX_DIGIT_RUN) || []) {
    if (m.replace(/\P{Nd}/gu, '').length > TEXT_CHAT.maxDigits) return 'number';
  }
  // ... or a number split up by words ("555 123 then 4567"): all digits together, round numbers' zeros not counted
  let all = 0;
  for (const m of spelled.match(/\p{Nd}+/gu) || []) all += [...m.replace(/0+$/, '')].length;
  return all > TEXT_CHAT.maxDigitsAll ? 'number' : null;
}

const DIE_AFTER = new Set(['go', 'pls', 'plz', 'please', 'just', 'you', 'u', 'should', 'hope', 'die']);
const DIE_SKIP = new Set(['and', 'away', 'now', 'then', 'already', 'off', 'ahead']); // "go away and die"
const HATE_WHO = new Set(['you', 'u', 'ya', 'yu', 'yall']);
const dieAfter = (words, i) => {
  let j = i - 1;
  while (j >= 0 && DIE_SKIP.has(words[j])) j--;
  return j >= 0 && DIE_AFTER.has(words[j]);
};
// single letters spelled out joined up ("g o die" -> go die)
const joinLetters = (words) => words.reduce((out, w, i) => {
  if (w.length === 1 && i > 0 && words[i - 1].length === 1) out[out.length - 1] += w;
  else out.push(w);
  return out;
}, []);
const unkind = (words) => [words, joinLetters(words)].some((ws) => ws.some((w, i) => RX_UNKIND.test(w) || RX_SLUR.test(w) ||
  (w === 'shut' && ws[i + 1] === 'up') || (w === 'hate' && HATE_WHO.has(ws[i + 1])) || (w === 'die' && dieAfter(ws, i))));

// everyday words that are never the first or last piece of a split word ("my pen is red", "an all new zone",
// "use it as seed")
const EVERYDAY = new Set(['a', 'i', 'is', 'it', 'its', 'in', 'on', 'at', 'as', 'us', 'up', 'so', 'no', 'me', 'be', 'we', 'he', 'an', 'am', 'or', 'to', 'do', 'go', 'my', 'of', 'by', 'if', 'oh', 'ok']);
const piecesOf = (...ps) => !EVERYDAY.has(ps[0]) && !EVERYDAY.has(ps[ps.length - 1]) && listed(ps.join(''));
/** A bad word split into two or three pieces ("fuc k", "stu pid", "st upi d"): only a whole listed word counts. */
const splitWord = (ws) => ws.some((w, i) => w && ws[i + 1] && (piecesOf(w, ws[i + 1]) || (!!ws[i + 2] && piecesOf(w, ws[i + 1], ws[i + 2]))));

/** No bad or unkind words, also when symbols are hidden inside them ("f.u.c.k", "sh!t", "a$$", "f**k"). */
function wordsOk(raw) {
  const s = chatFold(raw);
  if (RX_ODD_LETTERS.test(s) || RX_RUDE_EMOJI.test(s) || RX_MASKED.test(s)) return false;
  // numbers on their own are just numbers (the name filter reads 455 as "ass"); in a word 9 and 6 read as g
  const chunks = s.split(/\s+/).filter((t) => t && !/^[\p{Nd}.,:%+\-/]+$/u.test(t)).map((t) => t.replace(/[69]/g, 'g'));
  const plain = chunks.join(' ');
  const squeezed = chunks.map((t) => nameWords(t).join(''));
  if (!isNameAllowed(plain) || !isNameAllowed(squeezed.join(' '))) return false;
  return !unkind(nameWords(plain)) && !unkind(squeezed.filter(Boolean)) && !splitWord(squeezed);
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

/**
 * The grown-up check before typed chat in public rooms is switched on (Settings > Chat, ui/chat.js askGrownUp):
 * a times table from 6 to 9 or a two-digit sum that carries, which young players don't do in their heads.
 * -> {text: '7 × 8', answer: 56}.
 */
export function grownUpQuestion(rand = Math.random) {
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  if (rand() < 0.5) {
    const a = int(6, 9);
    const b = int(6, 9);
    return { text: `${a} × ${b}`, answer: a * b };
  }
  const a = int(2, 7) * 10 + int(3, 9);
  const b = int(1, 8 - Math.floor(a / 10)) * 10 + int(11 - (a % 10), 9); // the ones carry, the sum stays under 100
  return { text: `${a} + ${b}`, answer: a + b };
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
