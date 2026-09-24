// Minimal character physics: circle (XZ) vs axis-aligned boxes, plus gravity and jumping.
// Boxes: {minX,maxX,minY,maxY,minZ,maxZ}. Ground plane is y = 0.
import { WORLD } from '../config.js';

const STEP = 0.7; // can walk up ledges this tall without jumping

export class PhysicsWorld {
  constructor(boxes = []) {
    this.boxes = boxes.slice();
    // spatial hash on XZ for speed
    this.cell = 24;
    this.grid = new Map();
    this.boxes.forEach((b, i) => this._insert(b, i));
  }

  addBoxes(list) {
    for (const b of list) {
      this.boxes.push(b);
      this._insert(b, this.boxes.length - 1);
    }
  }

  _key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }

  _insert(b, i) {
    const c = this.cell;
    for (let ix = Math.floor(b.minX / c); ix <= Math.floor(b.maxX / c); ix++) {
      for (let iz = Math.floor(b.minZ / c); iz <= Math.floor(b.maxZ / c); iz++) {
        const k = this._key(ix, iz);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(i);
      }
    }
  }

  query(minX, maxX, minZ, maxZ, out = []) {
    out.length = 0;
    const c = this.cell;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++) {
      for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
        const arr = this.grid.get(this._key(ix, iz));
        if (!arr) continue;
        for (const i of arr) {
          if (seen.has(i)) continue;
          seen.add(i);
          const b = this.boxes[i];
          if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  // Height of the highest walkable surface under a circle at (x,z) that is not above `maxY`.
  groundHeight(x, z, r, maxY) {
    let h = 0;
    const list = this.query(x - r, x + r, z - r, z + r, this._tmp || (this._tmp = []));
    for (const b of list) {
      if (b.maxY > maxY) continue;
      // circle overlaps box footprint (shrunk a bit so you don't stand on edges)
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < (r * 0.6) * (r * 0.6)) h = Math.max(h, b.maxY);
    }
    return h;
  }

  // Push a circle out of all boxes it overlaps (ignoring boxes it stands on / is above).
  resolve(pos, r, extraBoxes) {
    const feet = pos.y;
    const list = this.query(pos.x - r - 1, pos.x + r + 1, pos.z - r - 1, pos.z + r + 1, this._tmp2 || (this._tmp2 = []));
    if (extraBoxes) for (const b of extraBoxes) list.push(b);
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of list) {
        if (feet >= b.maxY - STEP * (pos._grounded ? 1 : 0.15)) continue; // above it (or can step up)
        if (feet + WORLD.playerHeight <= b.minY) continue; // below it
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // centre inside the box: push out along the shallowest axis
          const left = pos.x - b.minX, right = b.maxX - pos.x, back = pos.z - b.minZ, front = b.maxZ - pos.z;
          const m = Math.min(left, right, back, front);
          if (m === left) pos.x = b.minX - r;
          else if (m === right) pos.x = b.maxX + r;
          else if (m === back) pos.z = b.minZ - r;
          else pos.z = b.maxZ + r;
        }
      }
    }
    return hit;
  }

  // Integrate a character. body: {pos:{x,y,z}, vel:{x,y,z}, onGround}
  step(body, dt, extraBoxes) {
    const r = WORLD.playerRadius;
    body.vel.y -= WORLD.gravity * dt;
    body.pos._grounded = body.onGround;
    // never move more than r/2 between collision resolves, so fast players can't tunnel through thin fences
    const mx = body.vel.x * dt, mz = body.vel.z * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(mx, mz) / (r * 0.5)));
    for (let i = 0; i < n; i++) {
      body.pos.x += mx / n;
      body.pos.z += mz / n;
      this.resolve(body.pos, r, extraBoxes);
    }
    body.pos.y += body.vel.y * dt;
    const g = this.groundHeight(body.pos.x, body.pos.z, r, body.pos.y + STEP);
    if (body.pos.y <= g) {
      body.pos.y = g;
      if (body.vel.y < 0) body.vel.y = 0;
      body.onGround = true;
    } else {
      body.onGround = body.pos.y - g < 0.05;
    }
  }

  // Follow-camera ray from the target (the player's head) along unit dir d for length L; returns the distance
  // to pull the camera in to, or L. Per box, camera extents: camMinY/camMaxY (default minY/maxY; a box with
  // camMaxY below maxY is a fence or post whose collider is extended upwards so nobody can hop over it; a
  // camera-only box puts minY/maxY out of reach). Two rules, with boxes padded by a lens radius:
  //  - occlusion: the sight line passes through the box, so the player would be hidden behind it. Posts and
  //    small decor (thin, tag 'deco'/'canopy') don't count; a fence only counts below its visible top plus a
  //    margin, and not when it is too close to get the camera in front of it (then it looks over it instead).
  //  - clearance: the camera would end up inside the padded box, or (fences) just behind it, filling the view.
  // Boxes that pulled the camera in last frame hold on to it with wider margins (hysteresis), so a player
  // weaving next to a fence doesn't make the camera flip back and forth.
  raycast(o, d, L) {
    const pad = 1.1; // lens clearance around boxes
    const behind = 3; // a camera this close behind a fence is pulled in front of it
    const minCam = 3.5; // closer than this the camera cannot be placed in front of an obstacle
    let tExit = 0;
    // slab test: entry distance along the ray (tExit = exit), 0 when starting inside, Infinity on a miss
    const slab = (x0, x1, y0, y1, z0, z1) => {
      let tmin = 0, tmax = Infinity;
      for (let k = 0; k < 3; k++) {
        const oa = k === 0 ? o.x : k === 1 ? o.y : o.z;
        const da = k === 0 ? d.x : k === 1 ? d.y : d.z;
        const mn = k === 0 ? x0 : k === 1 ? y0 : z0;
        const mx = k === 0 ? x1 : k === 1 ? y1 : z1;
        if (Math.abs(da) < 1e-9) {
          if (oa < mn || oa > mx) return Infinity;
        } else {
          let t1 = (mn - oa) / da, t2 = (mx - oa) / da;
          if (t1 > t2) [t1, t2] = [t2, t1];
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) return Infinity;
        }
      }
      tExit = tmax;
      return tmin;
    };
    const held = this._camHeld || (this._camHeld = new Set());
    const hits = this._camHits || (this._camHits = new Set());
    const near = this._camNear || (this._camNear = []); // padded boxes the ray crosses: box, entry, exit
    hits.clear();
    near.length = 0;
    let best = L;
    const minX = Math.min(o.x, o.x + d.x * L) - pad, maxX = Math.max(o.x, o.x + d.x * L) + pad;
    const minZ = Math.min(o.z, o.z + d.z * L) - pad, maxZ = Math.max(o.z, o.z + d.z * L) + pad;
    const list = this.query(minX, maxX, minZ, maxZ, this._tmp3 || (this._tmp3 = []));
    for (const b of list) {
      // the camera passes through planters, the invisible boundary walls, lasers and low decor
      if (b.tag === 'planter' || b.tag === 'wall' || b.tag === 'laser') continue;
      if (b.tag === 'deco' && b.maxY < 6) continue;
      const y0 = b.camMinY ?? b.minY;
      const top = Math.min(b.maxY, b.camMaxY ?? b.maxY);
      const extended = top < b.maxY; // fence, gate post or camera-only box
      const fence = extended && b.tag === 'fence' && Math.max(b.maxX - b.minX, b.maxZ - b.minZ) > 3; // see-over wall
      const thin = !fence && (extended || b.tag === 'deco' || b.tag === 'canopy'); // posts, poles, canopies
      const tPad = slab(b.minX - pad, b.maxX + pad, y0 - pad, top + pad, b.minZ - pad, b.maxZ + pad);
      if (tPad === Infinity) continue;
      const hold = held.has(b);
      const tPadExit = tExit + (extended ? behind + (hold ? 1.5 : 0) : 0);
      // a post or pole closer than minCam can't be kept behind the camera: rather look past it than sit in it
      const clearable = tPad > 0 && (!thin || tPad >= minCam);
      if (clearable) near.push(b, tPad, tPadExit);
      if (tPad >= best) continue;
      let t = Infinity;
      if (!thin) {
        const m = fence ? 0.5 : 0;
        const tCore = slab(b.minX, b.maxX, y0, top + m, b.minZ, b.maxZ);
        // a held box keeps the camera until the sight line clears it by a wider margin
        const tReal = hold ? Math.min(tCore, slab(b.minX - 0.6, b.maxX + 0.6, y0, top + m + 0.7, b.minZ - 0.6, b.maxZ + 0.6)) : tCore;
        const tFace = tCore < Infinity ? tCore : tReal;
        if (tReal > 0 && tReal < L && (!fence || tFace >= minCam - (hold ? 0.8 : 0))) {
          // in front of a fence the lens only needs clearance along the ray, not the sideways padding
          t = fence ? Math.max(tPad, tFace - 0.5) : tPad > 0 ? tPad : tReal;
        }
      }
      if (t === Infinity && clearable && L >= tPad && L <= tPadExit) t = tPad;
      if (t === Infinity) continue;
      hits.add(b);
      if (t < best) best = t;
    }
    // once pulled in, the camera must not land in (or just behind) another padded box, e.g. a gate post
    // at the end of the fence it was pulled in front of
    for (let pass = 0; pass < 3 && best < L; pass++) {
      const cam = best - 0.8;
      let moved = false;
      for (let i = 0; i < near.length; i += 3) {
        if (near[i + 1] < best && cam >= near[i + 1] && cam <= near[i + 2]) {
          best = near[i + 1];
          hits.add(near[i]);
          moved = true;
        }
      }
      if (!moved) break;
    }
    this._camHits = held;
    this._camHeld = hits;
    return best;
  }
}
