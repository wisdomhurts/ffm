// Background cloud sync for the active profile. OWNER: backend agent (docs/ONLINE.md).
//
//   const sync = attachCloudSync(app)   // once, from main.js (after app.profile exists)
//
// While the active profile has a save code it uploads the profile + Endless garden a few seconds after
// it changes, about every 60 s while playing, and right away on quit / tab hide / page close. It also
// submits new personal bests to the global boards (if the player chose to be listed).
// Completely silent: no network when not configured, offline, not linked or unchanged; errors are
// swallowed and put the client on an exponential backoff (see rpc.js).
import { bus } from '../core/events.js';
import { onlineConfigured } from './config.js';
import { rpc, isOffline, backoffLeft, resetBackoff } from './rpc.js';
import { BOARDS, profileScores } from './boards.js';
import { cloudPush, submitScore, cloudMeta, setCloudMeta, isLinked } from './api.js';

export function attachCloudSync(app, opts = {}) {
  const o = { pushEvery: 60, debounce: 8, scoreDelay: 6, tick: 5, minScoreGap: 6, ...opts }; // seconds
  const offs = [];
  const timers = { push: null, scores: null };
  let tickTimer = 0;
  let lastPush = Date.now(); // the first periodic push comes a full interval after boot
  let pushing = null;
  let scoring = null;
  let disposed = false;

  const profile = () => {
    try {
      return app.profile || null;
    } catch {
      return null;
    }
  };
  const activeLinked = () => {
    const p = profile();
    return p && isLinked(p) && !p.cloud.moved ? p : null;
  };
  const canTry = () => !disposed && onlineConfigured() && !isOffline();

  // Run fn after `seconds`. sooner: keep an already scheduled run if it comes first (throttle);
  // otherwise the new time replaces the old one.
  function later(kind, seconds, fn, { sooner = false } = {}) {
    if (disposed) return;
    const due = Date.now() + Math.max(0, seconds * 1000);
    const cur = timers[kind];
    if (cur && sooner && cur.due <= due) return;
    if (cur) clearTimeout(cur.id);
    timers[kind] = {
      due,
      id: setTimeout(() => {
        timers[kind] = null;
        fn();
      }, due - Date.now()),
    };
  }
  const cancel = (kind) => {
    if (timers[kind]) clearTimeout(timers[kind].id);
    timers[kind] = null;
  };

  async function push({ keepalive = false } = {}) {
    const p = activeLinked();
    if (!p || !canTry()) return;
    if (pushing) return pushing;
    if (backoffLeft() > 0) return later('push', backoffLeft() / 1000 + 0.5, push);
    lastPush = Date.now();
    // (cleared in .finally, which always runs after this assignment even if the work ends synchronously)
    pushing = (async () => {
      try {
        await cloudPush(p, { app, background: true, keepalive });
      } catch (e) {
        if (e?.code === 'rate_limited') later('push', 6, push);
        else if (e?.retryable) later('push', Math.max(backoffLeft() / 1000, 5) + 0.5, push);
      }
    })().finally(() => {
      pushing = null;
    });
    return pushing;
  }

  async function scores() {
    const p = activeLinked();
    if (!p || !canTry()) return;
    if (scoring) return scoring;
    if (backoffLeft() > 0) return later('scores', backoffLeft() / 1000 + 0.5, scores);
    scoring = (async () => {
      try {
        const meta = cloudMeta(p.id);
        // a "show me on the board" change made while offline
        if (typeof meta.listedSync === 'boolean') {
          await rpc('sas_listed', { p_id: p.cloud.id, p_secret: p.cloud.secret, p_listed: meta.listedSync }, { background: true });
          setCloudMeta(p.id, { listedSync: undefined });
        }
        if (p.cloud.listed === false) return;
        const vals = profileScores(p, app);
        for (const b of BOARDS) {
          const v = vals[b.id];
          const m = cloudMeta(p.id);
          if (!(v > 0) || v <= (m.sent[b.id] || 0)) continue;
          const wait = o.minScoreGap * 1000 - (Date.now() - (m.sentAt[b.id] || 0));
          if (wait > 0) {
            later('scores', wait / 1000 + 0.2, scores);
            continue;
          }
          try {
            await submitScore(p, b.id, v, { background: true });
          } catch (e) {
            if (e?.code === 'rate_limited') later('scores', o.minScoreGap, scores);
            else if (e?.retryable) {
              later('scores', Math.max(backoffLeft() / 1000, 5) + 0.5, scores);
              break;
            } else if (e?.code === 'bad_value') {
              // never going to be accepted (over the server's cap): stop retrying it
              setCloudMeta(p.id, { sent: { ...cloudMeta(p.id).sent, [b.id]: v } });
            } else break; // moved / not listed / not linked
          }
        }
      } catch {
        /* silent */
      }
    })().finally(() => {
      scoring = null;
    });
    return scoring;
  }

  function flush({ keepalive = false } = {}) {
    cancel('push');
    cancel('scores');
    if (!activeLinked() || !canTry()) return Promise.resolve();
    return Promise.all([push({ keepalive }), scores()]).catch(() => {});
  }

  // Trailing throttle: the first change starts the clock and later changes ride along, so a profile
  // that changes all the time (counters during play) still gets uploaded.
  const soon = () => {
    if (!activeLinked()) return;
    later('push', o.debounce, push, { sooner: true });
    later('scores', o.scoreDelay, scores, { sooner: true });
  };

  // ---------------------------------------------------------------- triggers
  const on = (ev, fn) => offs.push(bus.on(ev, fn));
  on('profile:changed', ({ profile: p } = {}) => {
    if (p && p.id === profile()?.id) soon();
  });
  on('profile:active', soon);
  on('rebirth', ({ player } = {}) => {
    if (player && player === app.human) later('scores', o.scoreDelay, scores);
  });
  on('match:end', () => later('scores', 3, scores));
  on('app:state', ({ state } = {}) => {
    // back at the title (after Save & Quit, or at boot): upload anything the game saved
    if (state === 'title') flush();
  });

  const onHide = () => {
    if (document.visibilityState === 'hidden') flush({ keepalive: true });
  };
  const onPageHide = () => flush({ keepalive: true });
  const onOnline = () => {
    resetBackoff();
    later('push', 2, push);
    later('scores', 3, scores);
  };
  try {
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('online', onOnline);
  } catch {
    /* not in a browser (tests) */
  }

  // periodic upload while a game is running (the Endless save changes every few seconds)
  tickTimer = setInterval(() => {
    if (!activeLinked() || !canTry()) return;
    const st = app.state;
    const inGame = st === 'playing' || st === 'paused' || st === 'shop' || st === 'ended';
    if (inGame && Date.now() - lastPush >= o.pushEvery * 1000) push();
  }, o.tick * 1000);

  // catch up shortly after boot (scores reached while offline, a save that never made it up)
  later('scores', 4, scores);

  return {
    /** push + submit now (e.g. before the page goes away) */
    flush,
    push,
    scores,
    dispose() {
      disposed = true;
      clearInterval(tickTimer);
      cancel('push');
      cancel('scores');
      offs.forEach((f) => f());
      try {
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('online', onOnline);
      } catch {
        /* ignore */
      }
    },
  };
}
