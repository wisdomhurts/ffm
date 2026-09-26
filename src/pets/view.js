// A pet that follows its owner around: a springy heel-follow, hops while moving, idles and looks around,
// flies/bobs for winged pets, and pops back to the owner's side if it falls far behind (respawns, teleports).
// Cheap: no allocations per frame, a handful of trig calls, 2-5 draw calls (see models.js).
//
// createPetView(petId) -> {
//   object3d,                       // add to the scene
//   update(dt, owner, time, mood?)  // owner: {pos:{x,y,z}, yaw, vel:{x,y,z}, onGround} (a Player works as-is)
//                                   // mood (optional): {celebrating, stunned}
//   place(owner),                   // snap next to the owner now (with a little pop)
//   petId, dispose()
// }
import { createPetModel } from './models.js';

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const easeOutBack = (t) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

let SEQ = 1;

export function createPetView(petId, opts = {}) {
  // a touch bigger than the models' base size so buddies read well behind a 5-stud avatar
  const M = createPetModel(petId, { ...opts, scale: opts.scale ?? 1.2 });
  const { root, lift, headPivot, tailPivot, wings } = M;
  const fly = M.fly;
  // tiny per-pet random stream (idle timings differ between pets)
  let seed = (SEQ++ * 9973) >>> 0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const side = opts.side ?? 1; // which side of the owner it trots on

  const s = {
    init: false,
    x: 0, z: 0, y: 0, // ground point
    vx: 0, vz: 0,
    sx: 0, sz: 0, // smoothed owner velocity (feed-forward)
    yaw: 0, yawRate: 0,
    ground: 0,
    hopT: 0, hopping: false, hopH: 0.6,
    pop: 1,
    headYaw: 0, headYawT: 0, headTilt: 0, headTiltT: 0, lookAt: 0,
    happyAt: 3 + rnd() * 5, happyT: -1, spin: 0,
    wanderX: 0, wanderZ: 0, wanderAt: 0,
    idle: 0,
    wasStunned: false,
    bank: 0, pitch: 0,
  };

  function target(owner, out) {
    const yaw = owner.yaw || 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // right of a character facing (fx, fz) is (-fz, fx)
    const back = fly ? 2.1 : 2.5;
    const lat = (fly ? 2.3 : 2.0) * side;
    out.x = owner.pos.x - fx * back - fz * lat + s.wanderX;
    out.z = owner.pos.z - fz * back + fx * lat + s.wanderZ;
    return out;
  }
  const T = { x: 0, z: 0 };

  function place(owner) {
    target(owner, T);
    s.x = T.x;
    s.z = T.z;
    s.vx = s.vz = 0;
    s.sx = s.sz = 0;
    s.ground = owner.pos.y || 0;
    s.yaw = owner.yaw || 0;
    s.pop = 0;
    s.init = true;
  }

  function update(dt, owner, time = 0, mood = null) {
    if (!owner?.pos) return;
    dt = Math.min(dt, 0.1);
    if (!s.init) place(owner);
    const op = owner.pos;
    const ovx = owner.vel?.x || 0, ovz = owner.vel?.z || 0;
    const ownerSpeed = Math.hypot(ovx, ovz);
    // ground level follows the owner's feet (only while they stand on something)
    if (owner.onGround !== false) s.ground += ((op.y || 0) - s.ground) * damp(10, dt);

    // idle wander: while the owner stands still, drift to a new spot near them now and then
    s.idle = ownerSpeed < 1 ? s.idle + dt : 0;
    if (s.idle > 1.5 && time > s.wanderAt) {
      const a = rnd() * TAU, r = 0.4 + rnd() * 1.2;
      s.wanderX = Math.cos(a) * r;
      s.wanderZ = Math.sin(a) * r;
      s.wanderAt = time + 3 + rnd() * 4;
    } else if (s.idle === 0) {
      s.wanderX *= 1 - damp(3, dt);
      s.wanderZ *= 1 - damp(3, dt);
    }

    // follow: owner velocity feed-forward (smoothed) + a spring towards the heel spot
    s.sx += (ovx - s.sx) * damp(7, dt);
    s.sz += (ovz - s.sz) * damp(7, dt);
    target(owner, T);
    let ex = T.x - s.x, ez = T.z - s.z;
    const err = Math.hypot(ex, ez);
    if (err > 34 || !Number.isFinite(err)) {
      // far behind (respawn, teleport, podium): pop back in next to the owner
      place(owner);
      ex = ez = 0;
    }
    const k = err > 10 ? 7 : 4.5;
    let vx = s.sx * 0.92 + ex * k;
    let vz = s.sz * 0.92 + ez * k;
    const vmax = 150;
    const v = Math.hypot(vx, vz);
    if (v > vmax) {
      vx *= vmax / v;
      vz *= vmax / v;
    }
    s.vx = vx;
    s.vz = vz;
    s.x += vx * dt;
    s.z += vz * dt;
    const speed = Math.hypot(vx, vz);
    const moving = speed > 1.4;

    // facing: along the movement; idle: mostly the owner's way, glancing at them now and then
    let want = s.yaw;
    if (moving) want = Math.atan2(vx, vz);
    else {
      const toOwner = Math.atan2(op.x - s.x, op.z - s.z);
      want = s.idle > 2.5 && Math.sin(time * 0.37 + seed) > 0.55 ? toOwner : owner.yaw || 0;
    }
    const dyaw = wrap(want - s.yaw);
    const turn = dyaw * damp(moving ? 12 : 5, dt);
    s.yaw += turn;
    s.yawRate += ((dt > 0 ? turn / dt : 0) - s.yawRate) * damp(8, dt);

    // happy moments: a hop + spin when idle a while, and all the time while the owner celebrates
    const celebrating = !!mood?.celebrating;
    const stunned = !!mood?.stunned;
    if (stunned && !s.wasStunned) s.happyT = 0; // startled jump when the owner gets bonked
    s.wasStunned = stunned;
    if (s.happyT < 0 && !moving && (celebrating || time > s.happyAt)) {
      s.happyT = 0;
      s.spin = celebrating || rnd() < 0.5 ? 1 : 0;
      s.happyAt = time + 7 + rnd() * 9;
    }
    let happyY = 0, spinYaw = 0;
    if (s.happyT >= 0) {
      s.happyT += dt / 0.7;
      const t = Math.min(1, s.happyT);
      happyY = 4 * t * (1 - t) * (fly ? 0.7 : 1.1);
      if (s.spin) spinYaw = easeInOut(t) * TAU;
      if (s.happyT >= 1) s.happyT = -1;
    }

    // body motion
    let y = 0, sqY = 1;
    if (fly) {
      y = fly + Math.sin(time * 2.3 + seed) * 0.28 + happyY;
      s.pitch += ((moving ? -Math.min(0.35, speed * 0.012) : 0) - s.pitch) * damp(5, dt);
      s.bank += (Math.max(-0.5, Math.min(0.5, -s.yawRate * 0.12)) - s.bank) * damp(6, dt);
      const flap = time * M.wingSpeed * (moving ? 1.35 : 1) + seed;
      for (const w of wings) w.rotation.z = (M.wingBase + Math.sin(flap) * M.wingAmp) * w.userData.side;
      sqY = 1 + Math.sin(time * 2.3 + seed + 1) * 0.02;
    } else {
      // hops: the cycle advances with speed; a hop in progress always lands
      if (moving || s.hopT > 0) {
        const f = Math.min(5.2, Math.max(2.4, 1.6 + speed * 0.1));
        if (moving) s.hopH = Math.min(1.0, 0.36 + speed * 0.014);
        s.hopT += dt * f;
        if (s.hopT >= 1) s.hopT = moving ? s.hopT - 1 : 0;
      }
      const t = s.hopT;
      y = 4 * t * (1 - t) * s.hopH + happyY;
      // squash on landing, stretch in the air
      const land = t < 0.12 ? 1 - t / 0.12 : t > 0.9 ? (t - 0.9) / 0.1 : 0;
      sqY = moving || s.hopT > 0 ? 1 + 0.1 * Math.sin(t * Math.PI) - 0.14 * land : 1 + Math.sin(time * 5 + seed) * 0.025;
      s.pitch += ((moving ? -0.12 * Math.cos(t * TAU) : 0) - s.pitch) * damp(10, dt);
      s.bank *= 1 - damp(6, dt);
    }

    // head: looks around while idle, tilts cutely, looks where it's going while moving
    if (headPivot) {
      if (moving) {
        s.headYawT = Math.max(-0.4, Math.min(0.4, s.yawRate * 0.12));
        s.headTiltT = 0;
      } else if (time > s.lookAt) {
        const r = rnd();
        s.headYawT = r < 0.25 ? 0 : (rnd() - 0.5) * 1.5;
        s.headTiltT = rnd() < 0.35 ? (rnd() - 0.5) * 0.6 : 0;
        s.lookAt = time + 1.2 + rnd() * 2.6;
      }
      s.headYaw += (s.headYawT - s.headYaw) * damp(6, dt);
      s.headTilt += (s.headTiltT - s.headTilt) * damp(5, dt);
      headPivot.rotation.set(Math.sin(time * 1.7 + seed) * 0.04 - (moving ? 0.06 : 0), s.headYaw, s.headTilt);
    }
    if (tailPivot) {
      const wag = Math.sin(time * (moving || celebrating ? 16 : 7) + seed) * (moving || celebrating ? 0.5 : 0.28);
      if (M.tailAxis === 'y') tailPivot.rotation.y = wag;
      else tailPivot.rotation.z = wag;
    }

    // pop-in scale
    if (s.pop < 1) s.pop = Math.min(1, s.pop + dt / 0.35);
    const pop = s.pop < 1 ? Math.max(0.01, easeOutBack(s.pop)) : 1;

    root.position.set(s.x, s.ground, s.z);
    root.rotation.y = s.yaw + spinYaw;
    lift.position.y = y;
    lift.rotation.set(s.pitch, 0, s.bank);
    const sq = Math.max(0.6, sqY);
    lift.scale.set(pop / Math.sqrt(sq), pop * sq, pop / Math.sqrt(sq));
    // the blob shadow shrinks as the pet rises (the material is shared, so size carries the height)
    if (M.shadow) M.shadow.scale.setScalar(M.shadowSize * pop * Math.max(0.45, 1 - y * 0.12));
  }

  return {
    object3d: root,
    petId,
    update,
    place,
    get position() {
      return root.position;
    },
    dispose() {
      M.dispose();
    },
  };
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
