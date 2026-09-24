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
    body.pos.x += body.vel.x * dt;
    body.pos.z += body.vel.z * dt;
    body.pos._grounded = body.onGround;
    this.resolve(body.pos, r, extraBoxes);
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

  // Ray (origin o, unit dir d, length L) against boxes; returns hit distance or L.
  raycast(o, d, L) {
    let best = L;
    const minX = Math.min(o.x, o.x + d.x * L), maxX = Math.max(o.x, o.x + d.x * L);
    const minZ = Math.min(o.z, o.z + d.z * L), maxZ = Math.max(o.z, o.z + d.z * L);
    const list = this.query(minX, maxX, minZ, maxZ, this._tmp3 || (this._tmp3 = []));
    for (const b of list) {
      // the camera may pass through low/invisible blockers (fences' invisible upper part, boundary walls)
      if (b.tag === 'planter' || b.tag === 'fence' || b.tag === 'wall' || b.tag === 'laser') continue;
      let tmin = 0, tmax = best;
      for (const [oa, da, mn, mx] of [[o.x, d.x, b.minX, b.maxX], [o.y, d.y, b.minY, b.maxY], [o.z, d.z, b.minZ, b.maxZ]]) {
        if (Math.abs(da) < 1e-9) {
          if (oa < mn || oa > mx) { tmin = Infinity; break; }
        } else {
          let t1 = (mn - oa) / da, t2 = (mx - oa) / da;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { tmin = Infinity; break; }
        }
      }
      if (tmin < best) best = tmin;
    }
    return best;
  }
}
