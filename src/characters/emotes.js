// Emote + dance poses for the R6 avatar (ids from social/catalog.js EMOTES).
// Each pose(E, t, c) writes target joint angles into E (which starts as the avatar's current pose, so
// channels an emote leaves alone keep breathing/idling); the avatar blends E in and out smoothly.
//   t = seconds since the emote started. c = { up: extra outward angle an arm needs to go up past the
//   head and hair (bigger for kids' heads and wide hair), kid }.
// Pose channels (radians unless noted): rigY/rigX (body offset, rig studs), rigYaw, rigRX, rigRZ,
//   torsoX (+ = lean forward), torsoY (+ = turn to the character's left), torsoZ, headX (+ = nod down),
//   headY, headZ, armRx/armLx (- = raise forward/up, + = back), armRz (- = right arm out to the side),
//   armLz (+ = left arm out), legRx/legLx (- = forward), legRz/legLz (sideways), sit (0..1: sitting).
// Arm angles were checked for clipping (dev gallery view=clip): crossing arms always pass in front of
// the body and raised arms splay out past the head.
import { smooth, lerp, clamp01 } from './rig.js';

const PI = Math.PI;
const TAU = PI * 2;
const ease = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
// snappy move then hold: 0 -> 1 over the first `k` of the beat
const snap = (f, k = 0.3) => ease(f / k);

// arm angle (armRz magnitude) for an arm raised to `a` radians away from straight up
const upRz = (a) => PI - a;

// plant the feet while the hips slide sideways by dx (rig studs): both legs lean the other way
function plantFeet(E, dx) {
  E.rigX = dx;
  E.legRz = E.legLz = -dx / 2;
}

// keyframed pose per beat, with a quick ease into each new key
function beatKeys(keys, b, k = 0.3) {
  const n = keys.length;
  const i = Math.floor(b);
  const f = b - i;
  const a = keys[((i - 1) % n + n) % n];
  const z = keys[(i % n + n) % n];
  const e = snap(f, k);
  const out = {};
  for (const key of Object.keys(z)) out[key] = lerp(a[key] ?? z[key], z[key], e);
  return out;
}

export const EMOTE_ANIM = {
  wave: {
    pose(E, t, c) {
      const e = smooth(0, 0.28, t);
      const w = Math.sin((t - 0.25) * TAU * 2.2) * smooth(0.2, 0.4, t);
      const a = Math.max(0.8, c.up + 0.34);
      E.armRz = lerp(E.armRz, -upRz(a + 0.3 * w), e);
      E.armRx = lerp(E.armRx, -0.22, e);
      E.armLz = lerp(E.armLz, 0.12, e);
      E.headZ += 0.1 * e;
      E.headX -= 0.04 * e;
      E.torsoZ -= 0.05 * e;
      E.rigRZ += Math.sin(t * 4.4) * 0.02 * e;
      E.rigY += Math.abs(Math.sin(t * 4.4)) * 0.035 * e;
    },
  },
  cheer: {
    pose(E, t, c) {
      const hi = upRz(c.up + 0.28);
      if (t < 1.35) {
        // three big fist pumps with a hop on each
        const p = (t * 2.3) % 1;
        const v = 0.5 - 0.5 * Math.cos(TAU * p);
        const rz = lerp(-2.05, -hi, v);
        E.armRz = rz;
        E.armLz = -rz;
        E.armRx = E.armLx = -0.25 + 0.1 * v;
        E.rigY = 0.5 * v;
        E.legRx = -0.3 * v;
        E.legLx = 0.2 * v;
        E.headX = -0.22 * v;
      } else {
        // arms up in a V, shaking with joy
        const s = Math.sin(t * 26) * 0.07;
        E.armRz = -hi + s;
        E.armLz = hi + s;
        E.armRx = E.armLx = -0.2;
        E.rigY = Math.abs(Math.sin(t * 9)) * 0.08;
        E.headX = -0.2;
      }
      E.headZ = Math.sin(t * 5) * 0.1;
      E.torsoX = -0.06;
    },
  },
  laugh: {
    pose(E, t) {
      const fwd = smooth(0.85, 1.1, t);
      const shake = Math.sin(t * 34);
      E.rigY = 0.04 * shake + 0.02;
      E.torsoX = lerp(-0.2, 0.34, fwd);
      E.torsoZ = Math.sin(t * 17) * 0.035;
      E.headX = lerp(-0.34, 0.06, fwd) + shake * 0.03;
      E.headY = Math.sin(t * 9) * 0.1;
      // holding the belly, then slapping the knee
      E.armRx = lerp(-0.5 + shake * 0.05, -0.75 + Math.sin(t * 15) * 0.3, fwd);
      E.armRz = 0.04;
      E.armLx = -0.5 - shake * 0.05;
      E.armLz = -0.04;
      E.legRx = -0.12 * fwd;
    },
  },
  point: {
    pose(E, t) {
      const e = smooth(0, 0.2, t);
      const jab = Math.exp(-(((t - 0.42) / 0.09) ** 2)) + 0.6 * Math.exp(-(((t - 0.78) / 0.08) ** 2));
      E.armRx = lerp(E.armRx, -1.55 - 0.14 * jab, e);
      E.armRz = lerp(E.armRz, 0.05, e);
      // other hand on the hip
      E.armLz = lerp(E.armLz, 0.56, e);
      E.armLx = lerp(E.armLx, 0.26, e);
      E.torsoY += 0.14 * e;
      E.torsoX += 0.06 * jab;
      E.headX += 0.05 * jab - 0.03 * e;
      E.headY -= 0.1 * e;
      E.rigRZ += 0.025 * e;
      E.rigY += 0.03 * jab;
    },
  },
  // Dance: a bouncy step-touch with disco points, raise-the-roof pumps and a twirl (8 beats, 120 BPM)
  dance1: {
    loop: true,
    pose(E, t, c) {
      const b = t / 0.5;
      const bi = Math.floor(b) % 8;
      const f = b - Math.floor(b);
      const sway = Math.sin(PI * b);
      E.rigY = Math.abs(Math.sin(PI * b)) * 0.13;
      plantFeet(E, 0.24 * sway);
      E.torsoZ = -0.07 * sway;
      E.torsoY = 0.12 * Math.sin(PI * b + 0.6);
      E.headX = 0.08 * Math.sin(TAU * b);
      E.headZ = 0.12 * sway;
      const hi = upRz(c.up + 0.5);
      const keys = [
        { rRx: -0.3, rRz: -hi, lRx: 0.2, lRz: 0.55 },
        { rRx: -0.5, rRz: -0.3, lRx: 0.2, lRz: 0.55 },
        { rRx: -0.3, rRz: -hi, lRx: 0.2, lRz: 0.55 },
        { rRx: -0.5, rRz: -0.3, lRx: 0.2, lRz: 0.55 },
        { rRx: -0.2, rRz: -upRz(c.up + 0.35), lRx: -0.2, lRz: upRz(c.up + 0.35) },
        { rRx: -0.2, rRz: -upRz(c.up + 0.35), lRx: -0.2, lRz: upRz(c.up + 0.35) },
        { rRx: -1.3, rRz: -0.15, lRx: -1.3, lRz: 0.15 },
        { rRx: -0.1, rRz: -1.45, lRx: -0.1, lRz: 1.45 },
      ];
      const k = beatKeys(keys, b, 0.35);
      E.armRx = k.rRx;
      E.armRz = k.rRz;
      E.armLx = k.lRx;
      E.armLz = k.lRz;
      if (bi === 4 || bi === 5) {
        // raise the roof
        const pump = Math.abs(Math.sin(TAU * b)) * 0.28;
        E.armRz += pump;
        E.armLz -= pump;
      } else if (bi === 6) {
        const sw = Math.sin(TAU * f) * 0.35;
        E.armRz += sw;
        E.armLz += sw;
        E.torsoY += sw * 0.5;
      } else if (bi === 7) {
        // twirl!
        E.rigYaw = TAU * ease(f / 0.85);
        E.rigY += Math.sin(PI * f) * 0.25;
        E.rigX = 0;
        E.legRz = E.legLz = 0;
      }
    },
  },
  // Robot: stiff poses that snap into place each beat with a little servo jitter
  dance2: {
    loop: true,
    pose(E, t, c) {
      const b = t / 0.5;
      const f = b - Math.floor(b);
      const up = upRz(c.up + 0.12);
      const keys = [
        { rRx: -1.57, rRz: 0, lRx: -1.57, lRz: 0, hY: 0, hZ: 0, tY: 0, yaw: 0, lg: 0, hX: 0 },
        { rRx: -0.12, rRz: -up, lRx: -1.57, lRz: 0, hY: 0.42, hZ: 0, tY: 0.15, yaw: 0.2, lg: 0, hX: 0 },
        { rRx: 0, rRz: -1.57, lRx: 0, lRz: 1.57, hY: -0.42, hZ: 0, tY: 0, yaw: 0.2, lg: -0.3, hX: 0 },
        { rRx: -1.57, rRz: 0, lRx: -0.12, lRz: up, hY: 0, hZ: 0.22, tY: -0.2, yaw: -0.2, lg: 0, hX: 0 },
        { rRx: -0.12, rRz: -up, lRx: -0.12, lRz: up, hY: 0, hZ: 0, tY: 0, yaw: -0.2, lg: 0, hX: -0.1 },
        { rRx: -1.57, rRz: -0.05, lRx: -1.57, lRz: 0.05, hY: 0.3, hZ: -0.2, tY: 0.25, yaw: 0, lg: 0.3, hX: 0 },
        { rRx: 0, rRz: -1.57, lRx: -1.57, lRz: 0, hY: 0.35, hZ: 0, tY: -0.3, yaw: 0.35, lg: 0, hX: 0 },
        { rRx: 0.05, rRz: -0.06, lRx: 0.05, lRz: 0.06, hY: 0, hZ: 0.3, tY: 0, yaw: 0, lg: 0, hX: 0.32 },
      ];
      const k = beatKeys(keys, b, 0.16);
      const jit = Math.sin(t * 70) * 0.03 * Math.exp(-f * 9);
      E.armRx = k.rRx + jit;
      E.armRz = k.rRz;
      E.armLx = k.lRx - jit;
      E.armLz = k.lRz;
      E.headY = k.hY;
      E.headZ = k.hZ;
      E.headX = k.hX;
      E.torsoY = k.tY;
      E.torsoX = k.hX * 0.4;
      E.rigYaw = k.yaw;
      E.legRx = Math.min(0, k.lg);
      E.legLx = Math.min(0, -k.lg);
      E.rigY = 0.02 * Math.exp(-f * 8);
      E.rigRX = E.rigRZ = 0;
    },
  },
  // Floss: both arms swing side to side (the crossing arm in front, the outer arm behind), hips opposite
  dance3: {
    loop: true,
    pose(E, t) {
      const T = 0.74;
      const s0 = Math.sin((TAU * t) / T);
      const s = Math.sign(s0) * Math.abs(s0) ** 0.75;
      const toL = Math.max(0, s); // arms swing to the character's left (+X)
      const toR = Math.max(0, -s);
      // right arm: crosses in front when the arms go left, out and behind when they go right
      E.armRz = 0.4 * toL - 0.5 * toR;
      E.armRx = -1.05 * Math.sqrt(toL) + 0.42 * Math.sqrt(toR);
      E.armLz = -0.4 * toR + 0.5 * toL;
      E.armLx = -1.05 * Math.sqrt(toR) + 0.42 * Math.sqrt(toL);
      plantFeet(E, -0.3 * s);
      E.torsoZ = 0.06 * s;
      E.torsoY = 0.1 * s;
      E.headZ = -0.08 * s;
      E.headY = -0.08 * s;
      E.rigY = 0.03 * Math.abs(s0);
      E.rigRX = E.rigRZ = 0;
    },
  },
  // Sit down on the floor, legs out, hands on the knees; looks around while resting
  sit: {
    loop: true,
    pose(E, t) {
      const legs = smooth(0, 0.34, t);
      const down = smooth(0.06, 0.42, t);
      const land = Math.exp(-(((t - 0.46) / 0.07) ** 2)) * 0.06;
      E.sit = down;
      E.legRx = E.legLx = -1.5 * legs;
      E.legRz = -0.09 * legs;
      E.legLz = 0.09 * legs;
      E.rigY = -1.5 * down - land + Math.sin(t * 2.2) * 0.02 * down;
      E.rigX = 0;
      E.torsoX = 0.07 * down + Math.sin(t * 0.8) * 0.02;
      E.torsoZ = Math.sin(t * 0.9) * 0.035 * down;
      E.armRx = -0.95 * legs;
      E.armLx = -0.95 * legs;
      E.armRz = -0.05;
      E.armLz = 0.05;
      const look = smooth(1.2, 2.2, t);
      E.headY = Math.sin(t * 0.55) * 0.28 * look;
      E.headX = 0.04 * Math.sin(t * 1.3) - 0.04 * down;
      E.headZ = Math.sin(t * 0.7) * 0.05 * look;
      E.rigYaw = 0;
    },
  },
};

export const EMOTE_IDS = Object.keys(EMOTE_ANIM);
