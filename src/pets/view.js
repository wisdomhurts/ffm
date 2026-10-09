// A pet that follows its owner around: a springy heel-follow, hops while moving, idles and looks around,
// flies/bobs for winged pets, and pops back to the owner's side if it falls far behind (respawns, teleports).
// Cheap: no allocations per frame, a handful of trig calls, 2-5 draw calls (see models.js).
//
// createPetView(petId) -> {
//   object3d,                       // add to the scene
//   update(dt, owner, time, mood?)  // owner: {pos:{x,y,z}, yaw, vel:{x,y,z}, onGround} (a Player works as-is)
//                                   // mood (optional): {celebrating, stunned}
//   place(owner),                   // snap next to the owner now (with a little pop)
//   trick(id),                      // a trick (PET_TRICKS: walkers backflip/spin/jump/dance/roll, flyers
//                                   // loop/barrel/spinrise/dive), ~1 s on top of the follow pose; false if unknown
//   center(out), radius,            // a sphere around the body (picking: GameView.pickPet)
//   petId, dispose()
// }
import { createPetModel } from './models.js';
import { reducedMotion } from '../core/camera.js';

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const easeOutBack = (t) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

let SEQ = 1;

// ------------------------------------------------------------------ tricks
// Each writes offsets for normalised time u (0..1) into o: lift position (tx, ty, tz; z = the pet's forward),
// flips (rx nose-up negative, rz roll; both turn around the body's middle), extra facing (yaw), squash (sq),
// head bob and wing flap speed. All start and end at rest, so the pet eases back into its follow pose.
const hop = (u) => 4 * u * (1 - u);
const seg = (u, a, b) => Math.min(1, Math.max(0, (u - a) / (b - a)));
// crouch, fly, land: squash before take-off and on landing, stretch in the air
const springy = (u, a, b, k = 1) => (u < a ? -0.22 * Math.sin((u / a) * Math.PI) : u < b ? 0.12 * Math.sin(seg(u, a, b) * Math.PI) : -0.18 * Math.sin(seg(u, b, 1) * Math.PI)) * k;
const TRICKS = {
  // walkers
  backflip: { dur: 1.0, fn(u, o) {
    const v = seg(u, 0.18, 0.86);
    o.ty = hop(v) * 2.1;
    o.rx = -TAU * easeInOut(v);
    o.sq = springy(u, 0.18, 0.86);
  } },
  spin: { dur: 0.9, fn(u, o) {
    o.yaw = TAU * 2 * easeInOut(u);
    o.ty = hop(u) * 0.8;
    o.sq = 0.06 * Math.sin(u * Math.PI);
  } },
  jump: { dur: 0.95, fn(u, o) {
    const v = seg(u, 0.2, 0.88);
    o.ty = hop(v) * 3.0;
    o.rx = -0.35 * Math.sin(v * Math.PI); // a happy tuck, chin up
    o.sq = springy(u, 0.2, 0.88, 1.25);
    o.bob = -0.3 * Math.sin(v * Math.PI);
  } },
  dance: { dur: 1.2, fn(u, o) {
    const e = Math.sin(u * Math.PI); // fades in and out
    o.yaw = Math.sin(u * TAU * 2) * 0.55 * e;
    o.rz = Math.sin(u * TAU * 3) * 0.3 * e;
    o.ty = Math.abs(Math.sin(u * TAU * 3)) * 0.45 * e;
    o.bob = Math.sin(u * TAU * 6) * 0.22 * e;
    o.sq = Math.sin(u * TAU * 6) * 0.05 * e;
  } },
  roll: { dur: 1.0, fn(u, o) {
    const v = seg(u, 0.08, 0.92);
    o.rz = TAU * easeInOut(v);
    o.ty = hop(v) * 1.0;
    o.tx = Math.sin(v * Math.PI) * 0.5;
  } },
  // flyers
  loop: { dur: 1.2, fn(u, o) {
    const a = TAU * easeInOut(u);
    o.tz = Math.sin(a) * 1.6;
    o.ty = (1 - Math.cos(a)) * 1.6;
    o.rx = -a;
    o.flap = 1.8;
  } },
  barrel: { dur: 0.95, fn(u, o) {
    const a = TAU * easeInOut(u);
    o.rz = a;
    o.tx = Math.sin(a) * 0.8;
    o.ty = (1 - Math.cos(a)) * 0.35;
    o.flap = 1.6;
  } },
  spinrise: { dur: 1.15, fn(u, o) {
    o.ty = Math.sin(u * Math.PI) * 2.2;
    o.yaw = TAU * 3 * easeInOut(u);
    o.sq = 0.08 * Math.sin(u * Math.PI);
    o.flap = 2.2;
  } },
  dive: { dur: 1.05, fn(u, o, fly) {
    const e = Math.sin(u * Math.PI);
    o.ty = -Math.min(2.2, fly * 0.7) * e;
    o.tz = 1.8 * e;
    o.rx = 0.85 * Math.sin(u * TAU); // nose down into the dive, up out of it
  } },
};
// reduced motion: every trick is a small happy hop
const GENTLE = { dur: 0.7, fn(u, o) {
  o.ty = hop(u) * 0.6;
  o.sq = 0.05 * Math.sin(u * Math.PI);
} };

export function createPetView(petId, opts = {}) {
  // a touch bigger than the models' base size so buddies read well behind a 5-stud avatar
  const M = createPetModel(petId, { ...opts, scale: opts.scale ?? 1.2 });
  const { root, lift, headPivot, tailPivot, wings } = M;
  const fly = M.fly;
  // tiny per-pet random stream (idle timings differ between pets)
  let seed = (SEQ++ * 9973) >>> 0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const side = opts.side ?? 1; // which side of the owner it trots on (0 = straight behind)
  const extraBack = opts.back ?? 0; // team pets: the third one trots a little further back

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
    trick: null, trickT: 0,
  };
  const tr = { tx: 0, ty: 0, tz: 0, rx: 0, rz: 0, yaw: 0, sq: 0, bob: 0, flap: 1 }; // this frame's trick offsets
  const cy = M.size.minY + M.size.h * 0.5; // flips turn around the body's middle

  function target(owner, out) {
    const yaw = owner.yaw || 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // right of a character facing (fx, fz) is (-fz, fx)
    const back = (fly ? 2.1 : 2.5) + extraBack;
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
    if (s.happyT < 0 && !moving && !s.trick && (celebrating || time > s.happyAt)) {
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

    // a trick (someone clicked this pet): offsets on top of everything else
    tr.tx = tr.ty = tr.tz = tr.rx = tr.rz = tr.yaw = tr.sq = tr.bob = 0;
    tr.flap = 1;
    if (s.trick) {
      s.trickT += dt / s.trick.dur;
      s.trick.fn(Math.min(1, s.trickT), tr, fly);
      if (s.trickT >= 1) s.trick = null;
    }

    // body motion
    let y = 0, sqY = 1;
    if (fly) {
      y = fly + Math.sin(time * 2.3 + seed) * 0.28 + happyY;
      s.pitch += ((moving ? -Math.min(0.35, speed * 0.012) : 0) - s.pitch) * damp(5, dt);
      s.bank += (Math.max(-0.5, Math.min(0.5, -s.yawRate * 0.12)) - s.bank) * damp(6, dt);
      const flap = time * M.wingSpeed * (moving ? 1.35 : 1) * tr.flap + seed;
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
      // walking pets with flippers or side arms (penguin, octopus) paddle them: faster while hopping
      if (wings.length) {
        const flap = time * (moving ? 9 : 2.2) + seed;
        const amp = (moving ? 0.45 : 0.12) * Math.max(0.3, M.wingAmp);
        for (const w of wings) w.rotation.z = (M.wingBase + Math.sin(flap) * amp) * w.userData.side;
      }
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
      headPivot.rotation.set(Math.sin(time * 1.7 + seed) * 0.04 - (moving ? 0.06 : 0) + tr.bob, s.headYaw, s.headTilt);
    }
    if (tailPivot) {
      const excited = moving || celebrating || !!s.trick;
      const wag = Math.sin(time * (excited ? 16 : 7) + seed) * (excited ? 0.5 : 0.28);
      if (M.tailAxis === 'y') tailPivot.rotation.y = wag;
      else tailPivot.rotation.z = wag;
    }

    // pop-in scale
    if (s.pop < 1) s.pop = Math.min(1, s.pop + dt / 0.35);
    const pop = s.pop < 1 ? Math.max(0.01, easeOutBack(s.pop)) : 1;

    root.position.set(s.x, s.ground, s.z);
    root.rotation.y = s.yaw + spinYaw + tr.yaw;
    // (a flip's rotation would swing the body around the feet: shift it so the middle stays put)
    lift.position.set(tr.tx + cy * Math.sin(tr.rz), y + tr.ty + cy * (2 - Math.cos(tr.rx) - Math.cos(tr.rz)), tr.tz - cy * Math.sin(tr.rx));
    lift.rotation.set(s.pitch + tr.rx, 0, s.bank + tr.rz);
    const sq = Math.max(0.6, sqY + tr.sq);
    s.midY = y + tr.ty + cy * sq;
    lift.scale.set(pop / Math.sqrt(sq), pop * sq, pop / Math.sqrt(sq));
    // the blob shadow shrinks as the pet rises (the material is shared, so size carries the height)
    if (M.shadow) M.shadow.scale.setScalar(M.shadowSize * pop * Math.max(0.45, 1 - (y + tr.ty) * 0.12));
  }

  function trick(id) {
    const def = TRICKS[id];
    if (!def) return false;
    s.trick = reducedMotion() ? GENTLE : def;
    s.trickT = 0;
    s.happyT = -1;
    return true;
  }

  return {
    object3d: root,
    petId,
    update,
    place,
    trick,
    /** World-space middle of the body (for picking). */
    center(out) {
      return out.set(root.position.x, root.position.y + (s.midY ?? cy), root.position.z);
    },
    radius: 0.6 * Math.max(M.size.h, M.size.w, M.size.d),
    get tricking() {
      return !!s.trick;
    },
    get position() {
      return root.position;
    },
    /** Height of the top of the pet above its ground point (for a name tag). */
    get top() {
      return lift.position.y + M.size.minY + M.size.h;
    },
    dispose() {
      M.dispose();
    },
  };
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
