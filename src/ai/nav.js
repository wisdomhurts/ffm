// Bot navigation: static occupancy grids built from the physics colliders (fences, planters, shop
// counters, the world's decorative props), A* with string-pulling, grid line-of-sight, and a router
// that stitches the home area (plaza + gardens) to the Seed Road through the road gate.
import { WORLD, ROAD_END_Z } from '../config.js';
import { LAYOUT, gardenContains } from '../gameplay/layout.js';

export const FREE = 0;
export const JUMP = 1; // low box (planter): passable by hopping
export const BLOCK = 2;

const R = WORLD.playerRadius;
const SOLID_PAD = R + 0.05; // inflate walls by the body radius
const LOW_PAD = R - 0.2; // inflate planters a bit less so the 3.2-stud aisles between them stay open
const LOW_MAX_Y = 1.6; // boxes up to this height can be hopped onto
const STEP_Y = 0.7; // physics step-up height: lower boxes are walkable
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class NavGrid {
  constructor(rect, cell, boxes, greed = 1.3) {
    this.cell = cell;
    this.greed = greed; // heuristic weight: > 1 trades a little optimality for far fewer expansions
    this.minX = rect.minX;
    this.minZ = rect.minZ;
    this.w = Math.ceil((rect.maxX - rect.minX) / cell);
    this.h = Math.ceil((rect.maxZ - rect.minZ) / cell);
    this.maxX = this.minX + this.w * cell;
    this.maxZ = this.minZ + this.h * cell;
    const n = this.w * this.h;
    this.cells = new Uint8Array(n);
    for (const b of boxes) this._stamp(b);
    this.gScore = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.openStamp = new Uint32Array(n);
    this.closedStamp = new Uint32Array(n);
    this.search = 0;
    this.heapI = [];
    this.heapF = [];
  }

  _stamp(b) {
    if (b.maxY <= STEP_Y || b.minY >= WORLD.playerHeight) return;
    const low = b.maxY <= LOW_MAX_Y;
    const pad = low ? LOW_PAD : SOLID_PAD;
    const v = low ? JUMP : BLOCK;
    const c = this.cell;
    const ix0 = Math.max(0, Math.floor((b.minX - pad - this.minX) / c));
    const ix1 = Math.min(this.w - 1, Math.floor((b.maxX + pad - this.minX) / c));
    const iz0 = Math.max(0, Math.floor((b.minZ - pad - this.minZ) / c));
    const iz1 = Math.min(this.h - 1, Math.floor((b.maxZ + pad - this.minZ) / c));
    for (let iz = iz0; iz <= iz1; iz++) {
      const cz = this.minZ + (iz + 0.5) * c;
      const dz = Math.max(b.minZ - cz, 0, cz - b.maxZ);
      for (let ix = ix0; ix <= ix1; ix++) {
        const cx = this.minX + (ix + 0.5) * c;
        const dx = Math.max(b.minX - cx, 0, cx - b.maxX);
        if (dx * dx + dz * dz >= pad * pad) continue;
        const k = iz * this.w + ix;
        if (this.cells[k] < v) this.cells[k] = v;
      }
    }
  }

  contains(x, z) {
    return x >= this.minX && x < this.maxX && z >= this.minZ && z < this.maxZ;
  }

  index(x, z) {
    const ix = Math.floor((x - this.minX) / this.cell);
    const iz = Math.floor((z - this.minZ) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return -1;
    return iz * this.w + ix;
  }

  at(x, z) {
    const k = this.index(x, z);
    return k < 0 ? BLOCK : this.cells[k];
  }

  cx(k) {
    return this.minX + ((k % this.w) + 0.5) * this.cell;
  }

  cz(k) {
    return this.minZ + (Math.floor(k / this.w) + 0.5) * this.cell;
  }

  /** True when the straight segment only crosses cells <= maxCell (FREE, or FREE|JUMP). */
  los(ax, az, bx, bz, maxCell = FREE) {
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz);
    const step = this.cell * 0.45;
    const n = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (this.at(ax + dx * t, az + dz * t) > maxCell) return false;
    }
    return true;
  }

  /** Nearest cell index with value <= maxCell within `radius` studs (ring search), or -1. */
  nearest(x, z, radius = 6, maxCell = FREE) {
    const k0 = this.index(clamp(x, this.minX + 0.01, this.maxX - 0.01), clamp(z, this.minZ + 0.01, this.maxZ - 0.01));
    if (k0 >= 0 && this.cells[k0] <= maxCell && this.contains(x, z)) return k0;
    const ix0 = Math.floor((x - this.minX) / this.cell);
    const iz0 = Math.floor((z - this.minZ) / this.cell);
    const rMax = Math.ceil(radius / this.cell);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= rMax; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const ix = ix0 + dx, iz = iz0 + dz;
          if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) continue;
          const k = iz * this.w + ix;
          if (this.cells[k] > maxCell) continue;
          const d = dx * dx + dz * dz;
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  _push(i, f) {
    const H = this.heapI, F = this.heapF;
    let n = H.length;
    H.push(i);
    F.push(f);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (F[p] <= f) break;
      H[n] = H[p];
      F[n] = F[p];
      n = p;
    }
    H[n] = i;
    F[n] = f;
  }

  _pop() {
    const H = this.heapI, F = this.heapF;
    const top = H[0];
    const li = H.pop(), lf = F.pop();
    const n = H.length;
    if (n > 0) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= n) break;
        if (c + 1 < n && F[c + 1] < F[c]) c++;
        if (F[c] >= lf) break;
        H[k] = H[c];
        F[k] = F[c];
        k = c;
      }
      H[k] = li;
      F[k] = lf;
    }
    return top;
  }

  /**
   * A* from a to b. Returns [{x,z}, ...] (smoothed, starting at a) or null.
   * Jump cells are allowed but expensive, so paths use the aisles between planters when they can.
   */
  findPath(ax, az, bx, bz, maxExpand = 45000) {
    if (this.at(ax, az) === FREE && this.at(bx, bz) === FREE && this.los(ax, az, bx, bz)) return [{ x: ax, z: az }, { x: bx, z: bz }];
    const s = this.nearest(ax, az, 5, JUMP);
    const t = this.nearest(bx, bz, 6, JUMP);
    if (s < 0 || t < 0) return null;
    const W = this.w, cells = this.cells;
    const tx = t % W, tz = Math.floor(t / W);
    const stamp = ++this.search;
    if (stamp > 4e9) {
      this.search = 1;
      this.openStamp.fill(0);
      this.closedStamp.fill(0);
    }
    const g = this.gScore, par = this.parent, open = this.openStamp, closed = this.closedStamp;
    this.heapI.length = 0;
    this.heapF.length = 0;
    const greed = this.greed;
    const h = (k) => {
      const dx = Math.abs((k % W) - tx), dz = Math.abs(Math.floor(k / W) - tz);
      // inflated octile distance: much faster, and paths get string-pulled afterwards anyway
      return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)) * greed;
    };
    g[s] = 0;
    par[s] = -1;
    open[s] = stamp;
    this._push(s, h(s));
    let found = false, expanded = 0;
    while (this.heapI.length) {
      const k = this._pop();
      if (closed[k] === stamp) continue;
      closed[k] = stamp;
      if (k === t) {
        found = true;
        break;
      }
      if (++expanded > maxExpand) break;
      const kx = k % W, kz = (k - kx) / W;
      for (let dz = -1; dz <= 1; dz++) {
        const nz = kz + dz;
        if (nz < 0 || nz >= this.h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = kx + dx;
          if (nx < 0 || nx >= W) continue;
          const n = nz * W + nx;
          const cv = cells[n];
          if (cv === BLOCK || closed[n] === stamp) continue;
          let cost = 1;
          if (dx && dz) {
            // no corner cutting past solid cells
            if (cells[kz * W + nx] === BLOCK || cells[nz * W + kx] === BLOCK) continue;
            cost = Math.SQRT2;
          }
          if (cv === JUMP) cost *= 7;
          const ng = g[k] + cost;
          if (open[n] === stamp && ng >= g[n]) continue;
          open[n] = stamp;
          g[n] = ng;
          par[n] = k;
          this._push(n, ng + h(n));
        }
      }
    }
    if (!found) return null;
    const raw = [];
    for (let k = t; k >= 0; k = par[k]) raw.push(k);
    raw.reverse();
    return this._smooth(raw, ax, az, bx, bz);
  }

  // Simplify the raw cell path: collapse straight runs to their turning points, then string-pull
  // over FREE cells. A run of jump cells (hopping over a planter) becomes an entry waypoint flagged
  // `jump` plus an exit waypoint, so the motor hops exactly once.
  _smooth(raw, ax, az, bx, bz) {
    const W = this.w, cells = this.cells;
    const pts = [];
    const n = raw.length;
    for (let i = 0; i < n; i++) {
      const k = raw[i];
      const low = cells[k] === JUMP;
      if (i > 0 && i < n - 1) {
        const a = raw[i - 1], b = raw[i + 1];
        const straight = k - a === b - k && Math.abs(k - a) < W + 2;
        const lowA = cells[a] === JUMP, lowB = cells[b] === JUMP;
        if (straight && low === lowA && low === lowB) continue;
        if (low && lowA && lowB) continue; // inside a hop
      }
      pts.push({ x: this.cx(k), z: this.cz(k), low, jump: low && (i === 0 || cells[raw[i - 1]] !== JUMP) });
    }
    pts[0] = { x: ax, z: az, low: false, jump: false };
    if (this.at(bx, bz) !== BLOCK) pts[pts.length - 1] = { x: bx, z: bz, low: this.at(bx, bz) === JUMP, jump: false };
    const out = [pts[0]];
    let anchor = pts[0];
    for (let i = 1; i < pts.length - 1; i++) {
      const nxt = pts[i + 1];
      if (pts[i].low || nxt.low || !this.los(anchor.x, anchor.z, nxt.x, nxt.z)) {
        out.push(pts[i]);
        anchor = pts[i];
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
}

const ROAD_JOIN_Z = 66; // routes between the plaza and the road meet here (just inside the road gate)

export class Nav {
  constructor(game) {
    const boxes = game.physics.boxes;
    this.home = new NavGrid({ minX: -74, maxX: 74, minZ: -68, maxZ: 74 }, 0.5, boxes, 1.6);
    this.road = new NavGrid({ minX: -WORLD.road.width / 2 - 1, maxX: WORLD.road.width / 2 + 1, minZ: 54, maxZ: ROAD_END_Z + 2 }, 1, boxes, 2.5);
  }

  onRoad(z) {
    return z >= ROAD_JOIN_Z;
  }

  gridAt(x, z) {
    return this.onRoad(z) ? this.road : this.home;
  }

  cellAt(x, z) {
    return this.gridAt(x, z).at(x, z);
  }

  los(ax, az, bx, bz, maxCell = FREE) {
    const ra = this.onRoad(az), rb = this.onRoad(bz);
    if (ra && rb) return this.road.los(ax, az, bx, bz, maxCell);
    if (!ra && !rb) return this.home.los(ax, az, bx, bz, maxCell);
    // crossing the join line: check both halves in their own grid
    const t = (ROAD_JOIN_Z - az) / (bz - az);
    const mx = ax + (bx - ax) * t;
    return Math.abs(mx) < WORLD.road.width / 2 - 2 && this.home.los(ra ? mx : ax, ra ? ROAD_JOIN_Z - 0.01 : az, ra ? bx : mx, ra ? bz : ROAD_JOIN_Z - 0.01, maxCell) &&
      this.road.los(ra ? ax : mx, ra ? az : ROAD_JOIN_Z, ra ? mx : bx, ra ? ROAD_JOIN_Z : bz, maxCell);
  }

  /**
   * Full route a -> b as a list of points. `laneX` picks where to cross the road gate.
   * Gardens have a single gate, so routes into/out of a garden are split there: a small search
   * inside the garden plus a (usually straight) run across the plaza.
   */
  route(ax, az, bx, bz, laneX = 0) {
    const ga = gardenAt(ax, az), gb = gardenAt(bx, bz);
    if (ga && ga !== gb) {
      const inner = this.home.findPath(ax, az, ga.inside.x, ga.inside.z) || [{ x: ax, z: az }, { x: ga.inside.x, z: ga.inside.z }];
      const rest = this.route(ga.outside.x, ga.outside.z, bx, bz, laneX);
      return inner.concat(rest);
    }
    if (gb && ga !== gb) {
      const rest = this.route(ax, az, gb.outside.x, gb.outside.z, laneX);
      const inner = this.home.findPath(gb.inside.x, gb.inside.z, bx, bz) || [{ x: gb.inside.x, z: gb.inside.z }, { x: bx, z: bz }];
      return rest.concat(inner);
    }
    const ra = this.onRoad(az), rb = this.onRoad(bz);
    if (ra === rb) return (ra ? this.road : this.home).findPath(ax, az, bx, bz) || [{ x: ax, z: az }, { x: bx, z: bz }];
    const jx = clamp(laneX, -12, 12);
    const first = ra ? this.road.findPath(ax, az, jx, ROAD_JOIN_Z + 1) : this.home.findPath(ax, az, jx, ROAD_JOIN_Z - 1);
    const second = ra ? this.home.findPath(jx, ROAD_JOIN_Z - 1, bx, bz) : this.road.findPath(jx, ROAD_JOIN_Z + 1, bx, bz);
    const a = first || [{ x: ax, z: az }, { x: jx, z: ROAD_JOIN_Z }];
    const b = second || [{ x: jx, z: ROAD_JOIN_Z }, { x: bx, z: bz }];
    return a.concat(b.slice(1));
  }

  /** Nearest walkable point to (x,z), or null. */
  nearestFree(x, z, radius = 6) {
    const g = this.gridAt(x, z);
    const k = g.nearest(x, z, radius, FREE);
    return k < 0 ? null : { x: g.cx(k), z: g.cz(k) };
  }
}

function gardenAt(x, z) {
  for (const g of LAYOUT.gardens) if (gardenContains(g, x, z, -0.5)) return g;
  return null;
}

const navs = new WeakMap();
/** One Nav per Game (built lazily from its physics colliders, including the world's decor). */
export function getNav(game) {
  let n = navs.get(game);
  if (!n || n.boxCount !== game.physics.boxes.length) {
    n = new Nav(game);
    n.boxCount = game.physics.boxes.length;
    navs.set(game, n);
  }
  return n;
}
