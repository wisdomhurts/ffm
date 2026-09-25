// Who sent this? Supabase broadcast (like BroadcastChannel) carries no sender identity, so rooms bring
// their own:
//   * every device makes a fresh ECDH P-256 key pair per page load (WebCrypto, private key never
//     leaves the device and can't be exported); its pid is a hash of the public key, so nobody can
//     claim someone else's pid without their private key
//   * any two devices in a room derive the same 256-bit pair key: HKDF(ECDH(mine, theirs), salt =
//     room code, info = both pids) — nobody else can compute it
//   * every message is sealed: {f: sender pid, d: JSON text [counter, payload], m: MAC} where MAC =
//     HMAC-SHA256(pairKey, SHA-256(event + '\n' + d)) truncated to 128 bits; a message for several
//     devices carries one MAC per recipient ({pid: mac}); receivers drop anything that doesn't verify
//     or whose counter isn't higher than the last one from that sender (no replays)
// SHA-256/HMAC/HKDF run synchronously in plain JS (tens of microseconds per message) so message
// handling stays in order; only the one-time ECDH steps are asynchronous.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const W = new Uint32Array(64);

/** SHA-256 of bytes -> 32 bytes. */
export function sha256(bytes) {
  const len = bytes.length;
  const blocks = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(blocks);
  buf.set(bytes);
  buf[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(blocks - 4, bits >>> 0);
  dv.setUint32(blocks - 8, Math.floor(bits / 0x100000000));
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let off = 0; off < blocks; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }
  const out = new Uint8Array(32);
  const o = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => o.setUint32(i * 4, v >>> 0));
  return out;
}

const ENC = new TextEncoder();
export const utf8 = (s) => ENC.encode(s);

function concat(...parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** HMAC-SHA256(key, msg) -> 32 bytes. */
export function hmac(key, msg) {
  let k = key.length > 64 ? sha256(key) : key;
  const kb = new Uint8Array(64);
  kb.set(k);
  const ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    ipad[i] = kb[i] ^ 0x36;
    opad[i] = kb[i] ^ 0x5c;
  }
  return sha256(concat(opad, sha256(concat(ipad, msg))));
}

/** HKDF-SHA256 (RFC 5869) for up to 32 bytes of output. */
export function hkdf(ikm, salt, info, len = 32) {
  const prk = hmac(salt, ikm);
  return hmac(prk, concat(info, new Uint8Array([1]))).slice(0, len);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64I = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64I[B64.charCodeAt(i)] = i;

export function b64(bytes) {
  let s = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8);
    s += B64[n >> 18] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) s += B64[(n >> 6) & 63];
  }
  return s;
}

/** base64url -> bytes (null when malformed). */
export function unb64(s) {
  if (typeof s !== 'string' || s.length > 400000) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? B64I[c] : -1;
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 255;
    }
  }
  return out.slice(0, o);
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** The pid that belongs to a public key (base64url of the 65-byte raw P-256 point), or null. */
export function pidOf(dk) {
  const raw = unb64(dk);
  if (!raw || raw.length !== 65 || raw[0] !== 4) return null;
  return 'k' + hex(sha256(raw)).slice(0, 15);
}

/** Constant-time string compare (MACs). */
export function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const subtle = () => (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) || null;
export const cryptoReady = () => !!subtle();

/** A new identity for this page: {pid, dk (public key), priv (non-exportable CryptoKey)}. */
export async function createIdentity() {
  const s = subtle();
  if (!s) throw Object.assign(new Error('WebCrypto unavailable'), { code: 'insecure' });
  const kp = await s.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const raw = new Uint8Array(await s.exportKey('raw', kp.publicKey));
  const dk = b64(raw);
  return { pid: pidOf(dk), dk, priv: kp.privateKey };
}

/** The pair key two devices share in one room (both sides get the same bytes). */
export async function pairKey(id, peerPid, peerDk, room) {
  const s = subtle();
  const raw = unb64(peerDk);
  if (!s || !raw || pidOf(peerDk) !== peerPid) return null;
  let pub;
  try {
    pub = await s.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  } catch {
    return null; // not a point on the curve
  }
  const secret = new Uint8Array(await s.deriveBits({ name: 'ECDH', public: pub }, id.priv, 256));
  const pair = [id.pid, peerPid].sort().join('|');
  return hkdf(secret, utf8('sas-room:' + room), utf8('sas-net/1 ' + pair));
}

/** The MAC of one message for one recipient. */
export function macOf(key, digest) {
  return b64(hmac(key, digest).slice(0, 16));
}

export const digestOf = (event, d) => sha256(utf8(event + '\n' + d));
