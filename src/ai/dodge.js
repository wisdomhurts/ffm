// Monster dodging for seed carriers on the Seed Road. Every ~0.1 s it tries a fan of headings,
// simulates ~1.4 s of the game's own pursuit rules (monsters steer straight at their target with
// velocity smoothing, clamped to their biome) and picks the heading that is not caught and makes
// the most progress home. Tested against lane-keeping heuristics: this cuts losses by ~5x.
import { PLAYER, WORLD } from '../config.js';
import { BLOCK, getNav } from './nav.js';

const HEADINGS = 13;
const SPREAD = 1.5; // radians either side of "forward"
const H = 1.4; // seconds simulated
const STEP = 1 / 30;
const CATCH = 3.9; // game catch radius is 3.4; keep a margin
const P_HALF = WORLD.road.width / 2 - WORLD.playerRadius;
const M_HALF = WORLD.road.width / 2 - 2.5;
const MAX_M = 8;

// scratch buffers (no per-tick allocation)
const mx = new Float32Array(MAX_M), mz = new Float32Array(MAX_M), mvx = new Float32Array(MAX_M), mvz = new Float32Array(MAX_M);
const mSpd = new Float32Array(MAX_M), mAggro = new Float32Array(MAX_M), mStun = new Float32Array(MAX_M), mMode = new Uint8Array(MAX_M);
const mMinZ = new Float32Array(MAX_M), mMaxZ = new Float32Array(MAX_M);
const sx = new Float32Array(MAX_M), sz = new Float32Array(MAX_M), svx = new Float32Array(MAX_M), svz = new Float32Array(MAX_M), sMode = new Uint8Array(MAX_M);

/**
 * Best heading for carrier p whose route points along (fx, fz). Writes a unit vector to `out` and
 * returns true, or returns false when no monster is close enough to matter.
 * `state` keeps the previous choice for hysteresis.
 */
export function planDodge(game, p, fx, fz, out, state) {
  const now = game.time;
  const px0 = p.pos.x, pz0 = p.pos.z;
  const ranges = game.layout.biomeRanges;
  let n = 0;
  for (const m of game.monsters) {
    if (n >= MAX_M) break;
    const d = Math.hypot(m.x - px0, m.z - pz0);
    if (d > 70) continue;
    const r = ranges[m.biome];
    mx[n] = m.x;
    mz[n] = m.z;
    mvx[n] = m.vx;
    mvz[n] = m.vz;
    mSpd[n] = m.def.speed;
    mAggro[n] = m.def.aggro;
    mStun[n] = Math.max(0, m.stunUntil - now);
    mMinZ[n] = r.minZ;
    mMaxZ[n] = r.maxZ;
    // 0 idle (may start chasing us), 1 chasing us, 2 busy with someone else, 3 ignoring us for a while
    mMode[n] = (m.ignore[p.slot] || 0) > now + H ? 3 : m.target === p.slot ? 1 : m.target != null ? 2 : 0;
    n++;
  }
  if (!n) {
    state.prev = null;
    return false;
  }
  const s = p.maxSpeed(now, game.difficulty.botSpeedMult);
  const acc = PLAYER.accel;
  const road = getNav(game).road;
  let best = 0, bestScore = -Infinity;
  for (let h = 0; h < HEADINGS; h++) {
    const a = -SPREAD + (2 * SPREAD * h) / (HEADINGS - 1);
    const ca = Math.cos(a), sa = Math.sin(a);
    // rotate forward by a
    const ux = fx * ca - fz * sa, uz = fx * sa + fz * ca;
    let px = px0, pz = pz0, vx = p.vel.x, vz = p.vel.z;
    for (let i = 0; i < n; i++) {
      sx[i] = mx[i];
      sz[i] = mz[i];
      svx[i] = mvx[i];
      svz[i] = mvz[i];
      sMode[i] = mMode[i];
    }
    let minD = Infinity, caughtAt = -1;
    for (let t = 0; t < H && caughtAt < 0; t += STEP) {
      const tx = ux * s - vx, tz = uz * s - vz;
      const dl = Math.hypot(tx, tz);
      if (dl > 0) {
        const k = Math.min(1, (acc * STEP) / dl);
        vx += tx * k;
        vz += tz * k;
      }
      const ox = px, oz = pz;
      px += vx * STEP;
      pz += vz * STEP;
      if (px > P_HALF) px = P_HALF;
      else if (px < -P_HALF) px = -P_HALF;
      if (road.at(px, pz) === BLOCK) {
        // a rock or other prop: this heading stalls against it
        px = ox;
        pz = oz;
        vx *= 0.3;
        vz *= 0.3;
      }
      for (let i = 0; i < n; i++) {
        if (t < mStun[i]) continue;
        const dx = px - sx[i], dz = pz - sz[i];
        const d = Math.hypot(dx, dz);
        const inRange = pz > mMinZ[i] - 6 && pz < mMaxZ[i] + 6;
        let mode = sMode[i];
        if (mode === 0 && inRange && d < mAggro[i]) mode = sMode[i] = 1;
        if (mode === 1 && (!inRange || d > mAggro[i] * 1.8)) mode = sMode[i] = 0;
        if (mode === 1) {
          const k = Math.min(1, STEP * 6);
          svx[i] += ((dx / (d || 1)) * mSpd[i] - svx[i]) * k;
          svz[i] += ((dz / (d || 1)) * mSpd[i] - svz[i]) * k;
          if (d < CATCH) {
            caughtAt = t;
            break;
          }
        } else if (mode === 0 || mode === 3) {
          svx[i] *= 0.9;
          svz[i] *= 0.9;
        }
        sx[i] += svx[i] * STEP;
        sz[i] += svz[i] * STEP;
        if (sx[i] > M_HALF) sx[i] = M_HALF;
        else if (sx[i] < -M_HALF) sx[i] = -M_HALF;
        if (sz[i] < mMinZ[i] + 3) sz[i] = mMinZ[i] + 3;
        else if (sz[i] > mMaxZ[i] - 3) sz[i] = mMaxZ[i] - 3;
        if (mode === 1 && d < minD) minD = d;
      }
    }
    const prog = (px - px0) * fx + (pz - pz0) * fz;
    let score = caughtAt >= 0 ? -1000 + caughtAt * 100 : prog + Math.min(minD, 7) * 2.5;
    if (state.prev === h) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = h;
      out.x = ux;
      out.z = uz;
    }
  }
  state.prev = best;
  return true;
}
