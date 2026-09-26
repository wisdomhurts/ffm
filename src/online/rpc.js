// Tiny Supabase RPC client: POST ${url}/rest/v1/rpc/<fn> with the publishable key. No SDK.
// Errors become OnlineError with a stable `code`; network trouble puts background work on an exponential
// backoff so a flaky or offline device never hammers the server (or the console).
import { onlineConfig, onlineConfigured } from './config.js';

export class OnlineError extends Error {
  /** code: offline | not_configured | backoff | network | timeout | rate_limited | bad_secret | bad_code |
   *  bad_value | bad_board | bad_save | too_big | not_found | server | invalid */
  constructor(code, message, { status = 0, hint = '' } = {}) {
    super(message || code);
    this.name = 'OnlineError';
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
  /** worth trying again later (connection, timeout, server hiccup, too fast) */
  get retryable() {
    return ['offline', 'backoff', 'network', 'timeout', 'rate_limited', 'server'].includes(this.code);
  }
}

// ------------------------------------------------------------------ backoff

const BASE_MS = 5000;
const MAX_MS = 10 * 60 * 1000;
const backoff = { fails: 0, until: 0 };
let now = () => Date.now();
let rand = () => Math.random();

/** ms until background requests may try again (0 = go ahead) */
export function backoffLeft() {
  return Math.max(0, backoff.until - now());
}

function noteFailure() {
  backoff.fails = Math.min(backoff.fails + 1, 20);
  const ms = Math.min(MAX_MS, BASE_MS * 2 ** (backoff.fails - 1));
  backoff.until = now() + ms * (0.75 + rand() * 0.5);
}

function noteSuccess() {
  backoff.fails = 0;
  backoff.until = 0;
}

/** Forget any backoff (e.g. the browser says we're back online). */
export function resetBackoff() {
  noteSuccess();
}

/** Test hooks: fake clock / randomness, and the current backoff state. */
export const _test = {
  setClock(fn) {
    now = fn || (() => Date.now());
  },
  setRandom(fn) {
    rand = fn || Math.random;
  },
  get backoff() {
    return { ...backoff };
  },
};

export function isOffline() {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ calls

const KNOWN = new Set(['rate_limited', 'bad_secret', 'bad_code', 'bad_value', 'bad_board', 'bad_save', 'too_big', 'bad_base', 'bad_period']);

/**
 * Call an RPC. opts: {background: true} respects the backoff and never throws for "not now" cases
 * differently than foreground calls (the caller decides); {timeout} ms (default 12 s);
 * {keepalive} for page-hide pushes (bodies must stay under 64 KB).
 * Resolves with the parsed JSON (null for SQL null), rejects with OnlineError.
 */
export async function rpc(fn, args = {}, { background = false, timeout = 12000, keepalive = false } = {}) {
  if (!onlineConfigured()) throw new OnlineError('not_configured', 'Online features are not set up.');
  if (isOffline()) throw new OnlineError('offline', 'You are offline.');
  if (background && backoffLeft() > 0) throw new OnlineError('backoff', 'Waiting before trying again.');
  const { url, key } = onlineConfig();
  const body = JSON.stringify(args);
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : 0;
  let res;
  try {
    res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      keepalive: keepalive && body.length < 60000,
      signal: ctl?.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch (e) {
    clearTimeout(timer);
    noteFailure();
    const aborted = e?.name === 'AbortError';
    throw new OnlineError(aborted ? 'timeout' : 'network', aborted ? 'The server took too long.' : 'Could not reach the server.');
  }
  let text = '';
  try {
    text = await res.text();
  } catch {
    /* empty body */
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (res.ok) {
    noteSuccess();
    return data;
  }
  // PostgREST error: {code, message, hint, details}. Our functions raise short tokens as the message.
  const msg = String(data?.message || '');
  const status = res.status;
  let code;
  if (KNOWN.has(msg)) code = msg === 'bad_base' || msg === 'bad_period' ? 'invalid' : msg;
  else if (status === 429) code = 'rate_limited';
  else if (status === 404 || data?.code === 'PGRST202' || data?.code === '42883') code = 'not_found'; // RPC missing
  else if (status >= 500) code = 'server';
  else code = 'invalid';
  // Back off when the service is struggling (5xx) or a gateway throttles us (a 429 that isn't one of our
  // own per-player limits). Our own "rate_limited" only means this one write must wait a few seconds.
  if (code === 'server' || (status === 429 && msg !== 'rate_limited')) noteFailure();
  else noteSuccess(); // the server answered; our request was the problem
  throw new OnlineError(code, msg || `HTTP ${status}`, { status, hint: data?.hint || '' });
}
