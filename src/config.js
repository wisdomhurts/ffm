// All tunable game data lives here. Units are Roblox studs and seconds.
// Gameplay, AI, UI and art modules read from this file; never hardcode these numbers elsewhere.

export const WORLD = {
  gravity: 196.2,
  jumpVelocity: 52,
  plaza: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
  spawn: { x: 0, z: 0 },
  road: { startZ: 60, width: 40, biomeLength: 150 },
  // w along X (gate side to the far fence), d along Z. The far 24 studs are the three buyable lots (LOTS).
  garden: { w: 60, d: 44 },
  // Garden centres by player slot. Gates face the central aisle (x = 0), at |x| = 30.
  gardenCenters: [
    { x: -60, z: -24 },
    { x: 60, z: -24 },
    { x: -60, z: 24 },
    { x: 60, z: 24 },
  ],
  // The home island (plaza, gardens, shops): walkable |x| < homeHalfW, z from homeMinZ up to the road gate.
  homeHalfW: 96,
  homeMinZ: -66,
  planterCount: 25, // 10 in the garden + LOTS.count lots of LOTS.planters
  shops: {
    gear: { x: -30, z: -50 },
    speed: { x: 0, z: -50 },
    rebirth: { x: 30, z: -50 },
    pets: { x: -54, z: -52 },
    wardrobe: { x: 54, z: -52 },
  },
  playerRadius: 1.4,
  playerHeight: 5.2,
};

export const PLAYER = {
  baseSpeed: 16,
  speedPerLevel: 2,
  // No top Speed level: every level costs more (speedCost) and keeps adding speed.
  carrySeedMult: 0.85,
  carryPlantMult: 0.7,
  accel: 90, // studs/s^2 on ground (up to accelRefSpeed: faster players get more grip, see accelFor)
  airAccel: 35,
  accelRefSpeed: 50,
  turnRate: 14, // rad/s visual turn smoothing
  startCash: 100,
  bonk: { range: 6, arcDeg: 110, cooldown: 0.8, stun: 1.0, knockback: 26, invuln: 1.6, monsterStun: 2.2 },
  stealHold: 1.5,
  sellHold: 1.0,
  grabHold: 0.25,
  interactRange: 5.5,
};

// Cost of buying speed level L (from L-1).
export const speedCost = (L) => (L === 1 ? 100 : Math.round(80 * Math.pow(1.55, L)));
export const speedAt = (level, rebirths = 0) => PLAYER.baseSpeed + level * PLAYER.speedPerLevel + rebirths * 2;
// Acceleration for a body whose top speed is `top`: constant up to accelRefSpeed, then it grows with the
// top speed so very fast players still turn and stop crisply (the same time to full speed, not ice skating).
export const accelFor = (top, onGround = true) => (onGround ? PLAYER.accel : PLAYER.airAccel) * Math.max(1, top / PLAYER.accelRefSpeed);
// The Speed Demon badge's levels (the shop has no top level any more).
export const SPEED_MILESTONES = [25, 35, 45];

// Planters: first 4 unlocked. Cost to unlock planter index i (0-based) of the 10 in the garden.
export const PLANTERS = { startUnlocked: 4, base: 10, unlockCost: [0, 0, 0, 0, 250, 900, 3500, 14000, 60000, 250000] };
// Garden lots: the far end of every garden is three FOR SALE lots of 5 crated planters each (planters
// 10-14, 15-19, 20-24). Buying a lot (in order) opens all 5 at once. Rebirth sells them back like the rest.
export const LOTS = { count: 3, planters: 5, cost: [500_000, 3_000_000, 15_000_000] };
/** Which lot planter index i belongs to (0..LOTS.count-1), or -1 for the garden's own 10. */
export const lotOf = (i) => (i >= PLANTERS.base ? Math.floor((i - PLANTERS.base) / LOTS.planters) : -1);
/** What opening planter i costs: its own unlock price, or the whole lot's price for a lot planter. */
export const planterCost = (i) => (i >= PLANTERS.base ? LOTS.cost[lotOf(i)] ?? Infinity : PLANTERS.unlockCost[i] ?? Infinity);

export const LOCK = { duration: 40, perRebirth: 10, recharge: 60 };

// ------------------------------------------------------------------ Speed Shop 2.0
// Boost: a burst of extra speed (Shift / the boost button / gamepad RT). Level 0 is free; the Boost Lab
// treadmill sells levels 1-10. Boost, treadmill tier and base level all survive a rebirth.
export const BOOST = {
  maxLevel: 10,
  power: (L) => 1.5 + 0.05 * L, // speed multiplier while boosting
  duration: (L) => 1.2 + 0.1 * L, // seconds
  cooldown: (L) => 12 - 0.6 * L, // seconds from one boost to the next
  cost: (L) => Math.round(1500 * Math.pow(2.8, L - 1)), // price of level L
};
// Treadmill tiers: run on a Warm-Up treadmill (the plaza's right one, or your home treadmill) for `warmup`
// seconds without falling off and you get Pumped: +bonus speed for `duration` seconds.
export const TREADMILL = {
  tiers: [
    { id: 'basic', name: 'Basic Treadmill', cost: 0, bonus: 0.1, duration: 45, warmup: 6, color: '#3ff0ff' },
    { id: 'turbo', name: 'Turbo Treadmill', cost: 25_000, bonus: 0.15, duration: 60, warmup: 5.5, color: '#4cd964' },
    { id: 'rocket', name: 'Rocket Treadmill', cost: 1_000_000, bonus: 0.2, duration: 90, warmup: 5, color: '#ff8a1a' },
    { id: 'hyper', name: 'Hyper Treadmill', cost: 50_000_000, bonus: 0.25, duration: 120, warmup: 4.5, color: '#ff4fd8' },
    { id: 'galaxy', name: 'Galaxy Treadmill', cost: 2_500_000_000, bonus: 0.3, duration: 180, warmup: 4, color: '#b36bff' },
  ],
  beltSpeed: 9, // studs/s a belt carries you towards its open end (run the other way to stay on)
  beltTop: 0.55, // deck height
};
// Speed gears: how much of your top speed you ask for (C, or tap the speedometer). Local control only.
export const GEARS = [
  { id: 'slow', name: 'Slow', mult: 0.35 },
  { id: 'cruise', name: 'Cruise', mult: 0.7 },
  { id: 'full', name: 'Full', mult: 1 },
];
/** Total price of the next n Speed levels after `level`. */
export const speedCostN = (level, n) => {
  let s = 0;
  for (let i = 1; i <= n; i++) s += speedCost(level + i);
  return s;
};

// ------------------------------------------------------------------ Base levels (your garden)
// Upgrade at the BASE console just inside your gate. Levels survive rebirth and unlock perks and the
// Base Studio (floors, fences, laser colours, decorations; see BASE_STYLES).
export const BASE = {
  maxLevel: 10,
  cost: [0, 0, 5_000, 50_000, 300_000, 1_500_000, 8_000_000, 40_000_000, 200_000_000, 1_000_000_000, 5_000_000_000], // price of reaching level L
  incomePerLevel: 0.02, // +2% income per level above 1
  studioAt: 2,
  petSlotsAt: [1, 4, 8], // base level that opens pet slot 1, 2, 3
  decorAt: [3, 3, 5, 5, 7, 7], // base level that opens decoration spot i (LAYOUT garden.decor[i])
  guardAt: 5,
  guard: { range: 13, cooldown: 6, stun: 1.2 },
  treadmillAt: 6,
  sprinklersAt: 7,
  sprinklerGrow: 1.25, // plants grow this much faster
  lockAt: 9,
  lockBonus: 20, // extra lock seconds (and that much faster recharge)
  goldenAt: 10,
};
export const baseIncomeMult = (L) => 1 + BASE.incomePerLevel * (Math.max(1, L || 1) - 1);
export const petSlotsFor = (L) => BASE.petSlotsAt.filter((x) => (L || 1) >= x).length;
export const decorSpotsFor = (L) => BASE.decorAt.filter((x) => (L || 1) >= x).length;

// Base Studio choices. min = base level that unlocks it. Floors, fences and lasers are drawn by
// world/gardens.js; decorations by world/basedecor.js. `solid` decorations block walking (a 4x4 box);
// a trampoline launches you up (vy = bounce).
export const BASE_STYLES = {
  floors: [
    { id: 'lawn', name: 'Classic Lawn', min: 1, colors: ['#86d863', '#6cc24a'] },
    { id: 'stripes', name: 'Mowed Stripes', min: 2, colors: ['#7fd35a', '#5fb83f'] },
    { id: 'checker', name: 'Checkerboard', min: 2, colors: ['#8ee06a', '#62bf45'] },
    { id: 'meadow', name: 'Flower Meadow', min: 3, colors: ['#9ee070', '#ff8cc6'] },
    { id: 'beach', name: 'Sandy Beach', min: 4, colors: ['#f4dc9c', '#e8c878'] },
    { id: 'stone', name: 'Stone Tiles', min: 5, colors: ['#c9ccd4', '#a9adb8'] },
    { id: 'candy', name: 'Candy Swirl', min: 6, colors: ['#ffc2e0', '#ffffff'] },
    { id: 'cloud', name: 'Cloud Puff', min: 7, colors: ['#eaf6ff', '#bfe3ff'] },
    { id: 'space', name: 'Starry Night', min: 8, colors: ['#2a2360', '#141038'] },
    { id: 'gold', name: 'Golden Tiles', min: 10, colors: ['#ffd23f', '#e8a91c'] },
  ],
  fences: [
    { id: 'bamboo', name: 'Bamboo', min: 1, color: '#e8e2b0' },
    { id: 'picket', name: 'White Picket', min: 2, color: '#ffffff' },
    { id: 'hedge', name: 'Hedge', min: 3, color: '#3f9e3a' },
    { id: 'castle', name: 'Castle Wall', min: 4, color: '#a9adb8' },
    { id: 'candy', name: 'Candy Cane', min: 6, color: '#ff4f6a' },
    { id: 'ice', name: 'Ice Crystal', min: 7, color: '#9fe8ff' },
    { id: 'neon', name: 'Neon Glow', min: 8, color: '#ff4fd8' },
    { id: 'gold', name: 'Solid Gold', min: 10, color: '#ffd23f' },
  ],
  lasers: [
    { id: 'red', name: 'Red', min: 1, color: '#ff1030' },
    { id: 'blue', name: 'Blue', min: 3, color: '#2f8bff' },
    { id: 'green', name: 'Green', min: 3, color: '#2fff6a' },
    { id: 'purple', name: 'Purple', min: 3, color: '#b24cff' },
    { id: 'pink', name: 'Pink', min: 5, color: '#ff4fd8' },
    { id: 'rainbow', name: 'Rainbow', min: 7, color: 'rainbow' },
    { id: 'gold', name: 'Gold', min: 10, color: '#ffd23f' },
  ],
  decor: [
    { id: 'flowerbed', name: 'Flower Bed', min: 3 },
    { id: 'oak', name: 'Big Oak Tree', min: 3, solid: true },
    { id: 'palm', name: 'Palm Tree', min: 3, solid: true },
    { id: 'lamp', name: 'Lamp Posts', min: 3 },
    { id: 'gnome', name: 'Garden Gnome', min: 3 },
    { id: 'fountain', name: 'Fountain', min: 3, solid: true },
    { id: 'trampoline', name: 'Trampoline', min: 4, bounce: 88 },
    { id: 'pethouse', name: 'Pet House', min: 4, solid: true },
    { id: 'hottub', name: 'Hot Tub', min: 5, solid: true },
    { id: 'windmill', name: 'Windmill', min: 5, solid: true },
    { id: 'campfire', name: 'Campfire', min: 5 },
    { id: 'snowman', name: 'Snowman', min: 6, solid: true },
    { id: 'candytree', name: 'Candy Tree', min: 6, solid: true },
    { id: 'rainbowarch', name: 'Rainbow Arch', min: 7 },
    { id: 'rocket', name: 'Toy Rocket', min: 8, solid: true },
    { id: 'statue', name: 'Golden Statue', min: 10, solid: true },
  ],
};
export const DEFAULT_BASE_STYLE = Object.freeze({ floor: 'lawn', fence: 'bamboo', laser: 'red', decor: Object.freeze([null, null, null, null, null, null]) });

// ------------------------------------------------------------------ egg drops
// Every couple of minutes a pet egg floats down on a balloon somewhere on the plaza or the Seed Road.
// First to touch it after it lands hatches it for free. Deeper on the road = rarer eggs. Rainbow Eggs
// only ever come from drops. The Egg Rain weather event drops a burst of them.
export const DROPS = {
  firstDelay: 50,
  gapMin: 100,
  gapMax: 170,
  fallFrom: 70, // studs above the ground
  fallSpeed: 9, // studs/s
  life: 75, // seconds on the ground before it floats away
  pickupR: 2.8,
  roadChance: 0.65,
  rainbowChance: 0.05,
  plaza: ['garden', 'farm', 'jungle'],
  byBiome: [['garden', 'farm'], ['farm', 'jungle'], ['jungle', 'ocean'], ['ocean', 'volcano'], ['volcano', 'galaxy'], ['galaxy', 'frost'], ['frost', 'candy'], ['candy', 'cloud'], ['cloud'],
    ['galaxy', 'cloud'], ['ocean', 'cloud'], ['cloud']],
  rain: { count: 10, every: 4.5, rainbowChance: 0.15 },
  max: 14, // never more than this many at once
};

export const REBIRTH = {
  // Net worth needed for rebirth N+1 given current rebirths N.
  threshold: (n) => 1_000_000 * Math.pow(5, n),
  incomeMult: (n) => 1 + 0.5 * n,
};

export const RARITIES = [
  { id: 'common', name: 'Common', color: '#b8c0cc', glow: 0x9aa4b2, tier: 0 },
  { id: 'uncommon', name: 'Uncommon', color: '#4cd964', glow: 0x4cd964, tier: 1 },
  { id: 'rare', name: 'Rare', color: '#3d9bff', glow: 0x3d9bff, tier: 2 },
  { id: 'epic', name: 'Epic', color: '#b36bff', glow: 0xb36bff, tier: 3 },
  { id: 'legendary', name: 'Legendary', color: '#ffb627', glow: 0xffb627, tier: 4 },
  { id: 'mythic', name: 'Mythic', color: '#ff4d6d', glow: 0xff4d6d, tier: 5 },
  { id: 'celestial', name: 'Celestial', color: '#6ff3ff', glow: 0x6ff3ff, tier: 6 },
  { id: 'cosmic', name: 'Cosmic', color: '#ff5ce1', glow: 0xff5ce1, tier: 7 },
  { id: 'divine', name: 'Divine', color: '#ffe75e', glow: 0xffe75e, tier: 8 },
  { id: 'prismatic', name: 'Prismatic', color: '#3dffb4', glow: 0x3dffb4, tier: 9 },
  { id: 'eternal', name: 'Eternal', color: '#ff7a59', glow: 0xff7a59, tier: 10 },
  { id: 'infinity', name: 'Infinity', color: '#8a7dff', glow: 0x8a7dff, tier: 11 },
  // Secret stays LAST: code indexes RARITIES by tier (RARITIES[tier + 1], rarityName)
  { id: 'secret', name: 'Secret', color: '#111111', glow: 0xffffff, tier: 12 },
];
export const RARITY = Object.assign(Object.create(null), Object.fromEntries(RARITIES.map((r) => [r.id, r])));
// The top rarity a road seed can have without being a Secret (a lucky seed goes up one tier, never past it).
export const TOP_TIER = RARITY.infinity.tier;

export const MUTATIONS = {
  normal: { id: 'normal', name: '', mult: 1, color: null },
  gold: { id: 'gold', name: 'Gold', mult: 2, color: '#ffd23f' },
  diamond: { id: 'diamond', name: 'Diamond', mult: 3, color: '#7ee8ff' },
  rainbow: { id: 'rainbow', name: 'Rainbow', mult: 5, color: 'rainbow' },
};
// Base chance of a mutation on any spawned seed (outside events).
export const BASE_MUTATION_CHANCE = { gold: 0.04, diamond: 0.015, rainbow: 0.005 };

// `look` tells plants/plantMeshes.js which procedural model to build.
// income = cash per second once grown. grow = seconds from seed to grown.
export const PLANTS = [
  // Common: Sunny Field
  { id: 'daisy', name: 'Daisy Doo', rarity: 'common', income: 2, grow: 15, look: 'daisy', colors: ['#ffffff', '#ffd23f'] },
  { id: 'pea', name: 'Pebble Pea', rarity: 'common', income: 3, grow: 18, look: 'pea', colors: ['#7ed957', '#4caf50'] },
  { id: 'tulip', name: 'Tickle Tulip', rarity: 'common', income: 4, grow: 20, look: 'tulip', colors: ['#ff6b9d', '#ff9ec4'] },
  { id: 'sunflower', name: 'Sunny Sunflower', rarity: 'common', income: 5, grow: 25, look: 'sunflower', colors: ['#ffc93c', '#7a4a1f'] },
  // Uncommon: Greenhollow
  { id: 'mushroom', name: 'Mossy Mushroom', rarity: 'uncommon', income: 10, grow: 30, look: 'mushroom', colors: ['#e84a3c', '#fff4e0'] },
  { id: 'fern', name: 'Fern Fiesta', rarity: 'uncommon', income: 12, grow: 34, look: 'fern', colors: ['#3fbf5a', '#1f8a3a'] },
  { id: 'bubble', name: 'Bubble Bloom', rarity: 'uncommon', income: 15, grow: 38, look: 'bubble', colors: ['#7fd8ff', '#c2f0ff'] },
  { id: 'clover', name: 'Clover King', rarity: 'uncommon', income: 18, grow: 42, look: 'clover', colors: ['#2ecc71', '#ffd700'] },
  // Rare: Dustbowl
  { id: 'cactus', name: 'Cactus Cutie', rarity: 'rare', income: 35, grow: 50, look: 'cactus', colors: ['#3fae5a', '#ff7eb6'] },
  { id: 'desertrose', name: 'Desert Rose', rarity: 'rare', income: 42, grow: 55, look: 'rose', colors: ['#e0564a', '#8a3b2f'] },
  { id: 'tater', name: 'Tumble Tater', rarity: 'rare', income: 50, grow: 60, look: 'tater', colors: ['#c9985c', '#6f8f3a'] },
  { id: 'aloe', name: 'Aloe Vera-Vroom', rarity: 'rare', income: 58, grow: 66, look: 'aloe', colors: ['#6fcf97', '#2f7d4f'] },
  // Epic: Tanglemire
  { id: 'flytrap', name: 'Snappy Flytrap', rarity: 'epic', income: 110, grow: 80, look: 'flytrap', colors: ['#6abf3a', '#d6334f'] },
  { id: 'bogberry', name: 'Bog Berry', rarity: 'epic', income: 130, grow: 88, look: 'berry', colors: ['#6b3fa0', '#3a7d44'] },
  { id: 'glowcap', name: 'Glowcap', rarity: 'epic', income: 160, grow: 96, look: 'glowcap', colors: ['#6cf2c2', '#2b1f4f'] },
  // Legendary: Emberroot
  { id: 'lavalily', name: 'Lava Lily', rarity: 'legendary', income: 400, grow: 120, look: 'lily', colors: ['#ff5a1f', '#ffd166'] },
  { id: 'emberpepper', name: 'Ember Pepper', rarity: 'legendary', income: 480, grow: 135, look: 'pepper', colors: ['#ff2e2e', '#2d6a2d'] },
  { id: 'phoenixfern', name: 'Phoenix Fern', rarity: 'legendary', income: 560, grow: 150, look: 'phoenix', colors: ['#ff8c1a', '#ffe14d'] },
  // Mythic: Starbloom
  { id: 'starlotus', name: 'Star Lotus', rarity: 'mythic', income: 1500, grow: 180, look: 'lotus', colors: ['#ffd6f5', '#b48cff'] },
  { id: 'moonmelon', name: 'Moon Melon', rarity: 'mythic', income: 1800, grow: 210, look: 'melon', colors: ['#cfd8ff', '#5b6cff'] },
  { id: 'galaxyorchid', name: 'Galaxy Orchid', rarity: 'mythic', income: 2200, grow: 240, look: 'orchid', colors: ['#2a1b5c', '#ff66d9'] },
  // Celestial: Frostfall
  { id: 'snowflake', name: 'Snowflake Star', rarity: 'celestial', income: 3000, grow: 260, look: 'snowflake', colors: ['#e8fbff', '#6fd3ff'] },
  { id: 'icerose', name: 'Ice Crystal Rose', rarity: 'celestial', income: 3400, grow: 280, look: 'icerose', colors: ['#bff4ff', '#3fa9e8'] },
  { id: 'frostbell', name: 'Frost Bell', rarity: 'celestial', income: 3800, grow: 300, look: 'frostbell', colors: ['#9fe3ff', '#ffffff'] },
  // Cosmic: Candy Canyon
  { id: 'lollibloom', name: 'Lollipop Bloom', rarity: 'cosmic', income: 4800, grow: 320, look: 'lollipop', colors: ['#ff5ca8', '#fff27a'] },
  { id: 'gumdrop', name: 'Gumdrop Bush', rarity: 'cosmic', income: 5400, grow: 340, look: 'gumdrop', colors: ['#7ee36b', '#ff7ab8'] },
  { id: 'candycane', name: 'Candy Cane Curl', rarity: 'cosmic', income: 6000, grow: 360, look: 'candycane', colors: ['#ff3b4f', '#ffffff'] },
  // Divine: Cloud Kingdom
  { id: 'cloudberry', name: 'Cloudberry Puff', rarity: 'divine', income: 7600, grow: 380, look: 'cloudpuff', colors: ['#ffffff', '#b07cff'] },
  { id: 'halolily', name: 'Halo Lily', rarity: 'divine', income: 8500, grow: 400, look: 'halolily', colors: ['#fffaf0', '#ffd23f'] },
  { id: 'thunderbloom', name: 'Thunder Bloom', rarity: 'divine', income: 9500, grow: 420, look: 'thunder', colors: ['#3d6bff', '#fff04d'] },
  // Prismatic: Crystal Caverns
  { id: 'prismpetal', name: 'Prism Petal', rarity: 'prismatic', income: 12000, grow: 440, look: 'prismpetal', colors: ['#3dffb4', '#b48cff'] },
  { id: 'geodegourd', name: 'Geode Gourd', rarity: 'prismatic', income: 13500, grow: 460, look: 'geodegourd', colors: ['#7a5cff', '#ff9ef0'] },
  { id: 'glimmergrapes', name: 'Glimmer Grapes', rarity: 'prismatic', income: 15000, grow: 480, look: 'glimmergrape', colors: ['#5ce1ff', '#2a8f6b'] },
  // Eternal: Bubble Reef
  { id: 'coralcrown', name: 'Coral Crown', rarity: 'eternal', income: 19000, grow: 500, look: 'coralcrown', colors: ['#ff7a59', '#ffd1a8'] },
  { id: 'pearlbloom', name: 'Pearl Clam Bloom', rarity: 'eternal', income: 21500, grow: 520, look: 'pearlclam', colors: ['#fff6ee', '#ff9ec4'] },
  { id: 'jellybell', name: 'Jelly Bell', rarity: 'eternal', income: 24000, grow: 540, look: 'jellybell', colors: ['#b28cff', '#7ee8ff'] },
  // Infinity: Rainbow's End
  { id: 'infinityrose', name: 'Infinity Rose', rarity: 'infinity', income: 30000, grow: 560, look: 'infinityrose', colors: ['#8a7dff', '#ff7ad9'] },
  { id: 'aurorafern', name: 'Aurora Fern', rarity: 'infinity', income: 34000, grow: 580, look: 'aurorafern', colors: ['#5cffb0', '#8a7dff'] },
  { id: 'starfruit', name: 'Starfruit Swirl', rarity: 'infinity', income: 38000, grow: 600, look: 'starfruit', colors: ['#ffe14d', '#ff7a59'] },
  // Secret: the family (always out-earn the top road rarity)
  { id: 'dorianfruit', name: "Dorian's Dragonfruit", rarity: 'secret', income: 50000, grow: 300, look: 'dragonfruit', colors: ['#ff3f8e', '#7ee36b'], family: 'dorian' },
  { id: 'estherlotus', name: "Esther's Eternal Lotus", rarity: 'secret', income: 50000, grow: 300, look: 'lotus', colors: ['#ff8fc8', '#ffe066'], family: 'esther' },
  { id: 'maddiemarigold', name: "Mati's Magic Marigold", rarity: 'secret', income: 50000, grow: 300, look: 'marigold', colors: ['#ffae00', '#b36bff'], family: 'maddie' },
  { id: 'micahmelon', name: "Micah's Mega Melon", rarity: 'secret', income: 50000, grow: 300, look: 'melon', colors: ['#3ddc84', '#ff5d5d'], family: 'micah' },
];
export const PLANT = Object.assign(Object.create(null), Object.fromEntries(PLANTS.map((p) => [p.id, p])));
export const NAMESAKE_BONUS = 2; // owning your own family secret plant doubles it

export const BIOMES = [
  { id: 'field', name: 'Sunny Field', rarity: 'common', ground: '#7bd35a', wall: '#5aa843', sky: '#8fd3ff', fog: '#bfe7ff',
    monster: null },
  { id: 'greenhollow', name: 'Greenhollow', rarity: 'uncommon', ground: '#3f9e4d', wall: '#2e6b35', sky: '#9fe0c0', fog: '#bfe8d0',
    monster: { id: 'stump', name: 'Grumpy Stump', speed: 14, aggro: 22, count: 2 } },
  { id: 'dustbowl', name: 'Dustbowl', rarity: 'rare', ground: '#e8c27a', wall: '#c9894a', sky: '#ffd9a0', fog: '#f5dcb0',
    monster: { id: 'crab', name: 'Cactus Crab', speed: 20, aggro: 24, count: 2 } },
  { id: 'tanglemire', name: 'Tanglemire', rarity: 'epic', ground: '#4b5d3a', wall: '#3a2f4f', sky: '#a58fc9', fog: '#8f86a8',
    monster: { id: 'snapper', name: 'Swamp Snapper', speed: 26, aggro: 26, count: 2 } },
  { id: 'emberroot', name: 'Emberroot', rarity: 'legendary', ground: '#5a2a22', wall: '#2b1210', sky: '#ff8a5c', fog: '#c2553a',
    monster: { id: 'lavasprout', name: 'Lava Sprout', speed: 32, aggro: 28, count: 3 } },
  { id: 'starbloom', name: 'Starbloom', rarity: 'mythic', ground: '#2a2f6b', wall: '#15173d', sky: '#1b1446', fog: '#2a2360', secret: 0.03,
    monster: { id: 'lurker', name: 'Star Lurker', speed: 38, aggro: 30, count: 3 } },
  { id: 'frostfall', name: 'Frostfall', rarity: 'celestial', ground: '#e6f4ff', wall: '#8fb8e0', sky: '#bfe6ff', fog: '#e2f2ff', secret: 0.035,
    monster: { id: 'yeti', name: 'Snowball Yeti', speed: 44, aggro: 32, count: 3 } },
  { id: 'candy', name: 'Candy Canyon', rarity: 'cosmic', ground: '#ffb8dc', wall: '#ff7eb8', sky: '#ffd1ea', fog: '#ffe3f2', secret: 0.04,
    monster: { id: 'gummy', name: 'Gummy Bear', speed: 50, aggro: 34, count: 3 } },
  { id: 'cloud', name: 'Cloud Kingdom', rarity: 'divine', ground: '#f4f8ff', wall: '#c8d8ff', sky: '#8fd0ff', fog: '#eaf4ff', secret: 0.05,
    monster: { id: 'storm', name: 'Storm Puff', speed: 56, aggro: 36, count: 3 } },
  { id: 'caverns', name: 'Crystal Caverns', rarity: 'prismatic', ground: '#5b3f8f', wall: '#2e1f52', sky: '#3b2a6b', fog: '#4a3a7a', secret: 0.055,
    monster: { id: 'golem', name: 'Gem Golem', speed: 62, aggro: 38, count: 3 } },
  { id: 'reef', name: 'Bubble Reef', rarity: 'eternal', ground: '#f2dcb0', wall: '#ff8a7a', sky: '#3fc6d9', fog: '#7fd8e0', secret: 0.06,
    monster: { id: 'puffer', name: 'Puffer Pop', speed: 68, aggro: 40, count: 3 } },
  { id: 'rainbowend', name: "Rainbow's End", rarity: 'infinity', ground: '#fff4fb', wall: '#b9a6ff', sky: '#ffb3e6', fog: '#ffe0f4', secret: 0.065,
    monster: { id: 'comet', name: 'Comet Dragon', speed: 74, aggro: 42, count: 3 } },
];
// `secret`: chance that a seed in that biome is a Secret family seed (the deepest biomes only).
export const ROAD_END_Z = WORLD.road.startZ + BIOMES.length * WORLD.road.biomeLength;
export const biomeIndexAtZ = (z) => {
  if (z < WORLD.road.startZ) return -1;
  return Math.min(BIOMES.length - 1, Math.floor((z - WORLD.road.startZ) / WORLD.road.biomeLength));
};

export const PODS = {
  perSide: 5, // per biome per wall
  respawnMin: 18,
  respawnMax: 32,
  luckyChance: 0.08, // chance of +1 rarity tier (up to TOP_TIER)
  groundSeedLifetime: 15, // dropped seeds return to their pod after this
};

export const ITEMS = [
  { id: 'banana', name: 'Banana Peel', price: 250, key: '1', desc: 'Drop it. Whoever slips drops their loot.', stun: 1.6, life: 60 },
  { id: 'balloon', name: 'Water Balloon', price: 600, key: '2', desc: 'Throw it! Splash stuns and drops loot.', stun: 1.3, radius: 4.5, speed: 55 },
  { id: 'coil', name: 'Speed Coil', price: 1500, key: '3', desc: '+50% speed for 15 seconds.', duration: 15, mult: 1.5 },
  { id: 'cloak', name: 'Invisibility Cloak', price: 5000, key: '4', desc: 'Invisible for 10 s. Monsters and family ignore you.', duration: 10 },
  { id: 'bucket', name: 'Water Bucket', price: 400, key: '5', desc: 'Halves the growing time left on a nearby plant.' },
];
export const ITEM = Object.assign(Object.create(null), Object.fromEntries(ITEMS.map((i) => [i.id, i])));

export const EVENTS = {
  firstDelay: 150, // seconds before the first weather event
  gapMin: 180,
  gapMax: 300,
  duration: 60,
  types: [
    { id: 'golden', name: 'Golden Hour', desc: 'Seeds are turning GOLD!', mutation: 'gold', chance: 0.45 },
    { id: 'diamond', name: 'Diamond Night', desc: 'Diamond seeds are sparkling!', mutation: 'diamond', chance: 0.35 },
    { id: 'rainbow', name: 'Rainbow Rain', desc: 'RAINBOW seeds are falling!', mutation: 'rainbow', chance: 0.25 },
    // no seed mutation: pet eggs rain down around the plaza and the start of the road (DROPS.rain)
    { id: 'eggrain', name: 'Egg Rain', desc: 'Pet eggs are falling from the sky!', mutation: null, chance: 0, drops: true },
  ],
};

export const MATCH = { showdownSeconds: 480 };

// ------------------------------------------------------------------ round 4 features

// Giant Harvests: a plant rolls a size the moment it finishes growing (host-rolled, travels in plant data).
export const SIZES = {
  normal: { id: 'normal', name: '', p: 0, mult: 1, scale: 1 },
  big: { id: 'big', name: 'Big', p: 0.12, mult: 1.5, scale: 1.25 },
  giant: { id: 'giant', name: 'GIANT', p: 0.03, mult: 3, scale: 1.5 },
  titan: { id: 'titan', name: 'TITAN', p: 0.003, mult: 6, scale: 1.8, beam: true },
};
export const SIZE_ODDS = { growPet: 1.25, watered: 1.5 }; // multipliers on the big/giant/titan chances

// Help! Family Hero: bonk a thief carrying SOMEONE ELSE's plant -> a tip from the game.
export const HERO = {
  tipSecs: 30, // tip = min(tipSecs x the plant's income, sellCapSecs x income)
  sellCapSecs: 90,
  pairGap: 90, // one tip per hero/thief pair per 90 s
  maxPer10Min: 5,
  sneakySteals: 3, // a thief with 3+ steals in the last 2 min is SNEAKY: the tip doubles
  sneakyWindow: 120,
  ribbon: 60, // seconds the gold HERO ribbon shows
  owes: 120, // seconds a rescued bot won't steal from its hero
};

// Welcome-Back Garden (solo Endless only): time away keeps your garden growing, at half speed, capped.
export const AWAY = {
  minGap: 300, // seconds; shorter breaks do nothing
  rate: 0.5,
  cap: (baseLevel) => (baseLevel >= 10 ? 8 : baseLevel >= 6 ? 4 : 2) * 3600,
  maxGap: 30 * 86400,
};

// Big Chomp the Garden Gobbler: a world boss everyone bonks.
export const BOSS = {
  firstAt: 300, // Endless: not before 5 min
  gapMin: 540,
  gapMax: 720,
  showdown: [150, 300], // Showdown: once, between 2:30 and 5:00 in (never in the last 90 s)
  hp: 40,
  hpPerPlayer: 20,
  speed: 6,
  life: 90,
  slurpRate: 0.02, // of the target garden's cash pile per second
  slurpCap: 0.25,
  seeds: [12, 20],
  seedMutations: { gold: 0.6, diamond: 0.3, rainbow: 0.1 },
  potSecs: 60,
  crown: 60,
  splashHits: 3,
  botHitChill: 0.5,
};

// Text chat (kid-safe). Private rooms and solo: on. Public rooms: only when a parent allows it in Settings.
export const TEXT_CHAT = {
  maxLen: 80,
  gap: 1.2, // seconds between two messages from one player
  burst: 3, // messages allowed back to back before the gap applies
  history: 40,
  bubble: 5, // seconds a chat bubble stays over the speaker
  maxDigits: 6, // a longer run of digits (spaces and dashes don't break it) looks like a phone number: refused
  hostSlack: 1, // the host allows this many extra back to back (network jitter bunches messages up)
};

// Pet tricks (click / tap a pet). Ids travel in 'pet:trick' events.
export const PET_TRICKS = {
  walk: ['backflip', 'spin', 'jump', 'dance', 'roll'],
  fly: ['loop', 'barrel', 'spinrise', 'dive'],
  cooldown: 1.0, // per pet
};

// Bot rubber band (read by ai/, tuned with the headless kid sim): biomeLead = how many biomes past the
// human's deepest seed grab a bot may farm (only while it trails the human; level or ahead it stays a
// biome shallower); paceCap = once a bot's net worth or income passes paceCap x the human's it eases
// off (jogs on errands, farms shallower, ignores shiny seeds; 0 = never; the bots' routing and seed
// picks out-earn a new player, hence the low values); practiceSteal = one slow, telegraphed steal that
// teaches a new player to chase and bonk (after: earliest match second; unrobbedOnly: only if nobody
// has robbed the human yet).
export const DIFFICULTY = {
  chill: { name: 'Chill', boostEager: 0.02, botSpeedMult: 0.85, stealRate: 0.35, reaction: 0.9, bonkAccuracy: 0.5, monsterSpeedMult: 0.85, monsterAggroMult: 0.8,
    biomeLead: 0, paceCap: 0.4, practiceSteal: { after: 75, unrobbedOnly: false } },
  normal: { name: 'Normal', boostEager: 0.08, botSpeedMult: 1.0, stealRate: 1.0, reaction: 0.5, bonkAccuracy: 0.75, monsterSpeedMult: 1, monsterAggroMult: 1,
    biomeLead: 1, paceCap: 0.33, practiceSteal: { after: 240, unrobbedOnly: true } },
  chaos: { name: 'Chaos', boostEager: 0.2, botSpeedMult: 1.1, stealRate: 1.8, reaction: 0.25, bonkAccuracy: 0.92, monsterSpeedMult: 1.05, monsterAggroMult: 1.1,
    biomeLead: 99, paceCap: 0, practiceSteal: null },
};

export const CHARACTERS = [
  {
    id: 'dorian', name: 'Dorian', title: 'The Tycoon', color: '#2f80ed', personality: 'tycoon',
    tagline: 'Business is booming.',
    look: { hair: 'short', hairColor: '#3a2a20', shirt: 'faceprint', shirtColor: '#f4f4f4', shirtColor2: '#111111',
      pants: '#2b3a55', shoes: '#1d1d1d', build: 'adult', skin: '#c98d78' },
  },
  {
    id: 'esther', name: 'Esther', title: 'The Guardian', color: '#ff4f9a', personality: 'guardian',
    tagline: 'Nobody touches my garden.',
    look: { hair: 'long', hairColor: '#17110f', shirt: 'dress', shirtColor: '#ff3d8b', shirtColor2: '#ff8cc0',
      pants: '#ff3d8b', shoes: '#f2d0b8', build: 'adult', skin: '#d19a82' },
  },
  {
    id: 'maddie', name: 'Mati', title: 'The Speedster', color: '#9b5cff', personality: 'speedster',
    tagline: 'Zoom zoom!',
    look: { hair: 'long', hairColor: '#5a3b28', shirt: 'floral', shirtColor: '#8a5cc8', shirtColor2: '#ff7eb6',
      pants: '#3b4b8a', shoes: '#ffffff', build: 'kid', skin: '#d6a08a' },
  },
  {
    id: 'micah', name: 'Micah', title: 'The Sneaky Thief', color: '#1ec8a5', personality: 'thief',
    tagline: 'Hehe. Mine now.',
    look: { hair: 'short-thick', hairColor: '#1c1512', shirt: 'hawaiian', shirtColor: '#8ff0d8', shirtColor2: '#2e9c7e',
      pants: '#c8b48a', shoes: '#2a2a2a', build: 'kid', skin: '#d3a08b' },
  },
];
export const CHARACTER = Object.assign(Object.create(null), Object.fromEntries(CHARACTERS.map((c) => [c.id, c])));

// Family banter. {plant} {victim} {thief} {name} are substituted.
export const CHAT = {
  dorian: {
    tease: ['Come and get it, {victim}! Dad\'s not THAT fast!', 'Your {plant} is going on a little trip, {victim}!', 'Hehe, try and catch me {victim}!'],
    caught: ['Okay, okay, you got me!', 'Nice bonk! You\'re a natural.', 'Ha! Fair and square.'],
    steal: ['Dad tax! Thanks for the {plant}.', 'I\'ll take that {plant}, {victim}.', 'Business opportunity spotted.', 'This {plant} is coming with me.', 'Consider it a loan, {victim}.'],
    robbed: ['Who took my {plant}?!', '{thief}! Bring that back!', 'Not the {plant}!', '{thief}, we talked about this!', 'That {plant} was my retirement plan!'],
    bonk: ['Dad strength!', 'Bonk!', 'Nice try, kiddo.', 'Rookie mistake.', 'The noodle never misses.'],
    rare: ['Look at this {plant}!', 'Jackpot!', 'Found {a_plant}! Daddy\'s rich!'],
    idle: ['Business is booming.', 'Who wants to race to Starbloom?', 'Anyone seen my Sunflower?', 'Remember Cabo? This is better.',
      'Speed is money, {human}.', 'I\'m not saying I\'m the best... but I\'m the best.', 'Who ate the last churro?', 'Dad joke incoming: this garden is un-BE-LEAF-able.'],
  },
  esther: {
    tease: ['Borrowing your {plant}! Catch me if you can, {victim}!', 'Run, {victim}, run! Bonk me to get it back!', 'Hehe, try and catch me {victim}!'],
    caught: ['You got me! Good job, sweetie!', 'That\'s how you guard a garden!', 'Nice bonk!'],
    steal: ['Mom privileges. {plant} is mine.', 'Sorry {victim}, this {plant} looked lonely.', 'Borrowing this forever.', 'Finders keepers, {victim}.', 'Mom always wins.'],
    robbed: ['{thief}. Put. It. Back.', 'You did NOT just take my {plant}.', 'Locking up next time!', '{thief}, you\'re grounded!', 'I saw that, {thief}!'],
    bonk: ['Nobody touches my garden!', 'Hands off!', 'Gotcha!', 'Don\'t make me count to three.', 'That\'s what you get!'],
    rare: ['Ooh, {a_plant}!', 'So pretty!', 'Now THAT is a good seed.'],
    idle: ['Nobody touches my garden.', 'Dinner\'s at 6, I\'m farming.', 'Who left a banana peel here?', 'Sunscreen, everybody!',
      'Has anyone seen the TV remote?', 'I miss the beach already.', 'Good luck, {human}!', 'Garden looking gorgeous today.'],
  },
  maddie: {
    tease: ['Slow-mo mode! Catch me, {victim}!', 'Your {plant} is MINE! Unless you bonk me, {victim}!', 'Hehe, try and catch me {victim}!'],
    caught: ['Nooo, you got me!', 'Okay, THAT was a good bonk!', 'No fair, you\'re quick!'],
    steal: ['Zoom! Got your {plant}!', 'Too fast for you, {victim}!', 'Yoink!', 'Speedy delivery!', 'Catch me if you can, {victim}!'],
    robbed: ['{thief}! GIVE IT BACK!', 'My {plant}!!', 'Not fair!', 'Hey {thief}! That\'s MY {plant}!', 'I\'m coming for you, {thief}!'],
    bonk: ['Hi-yah!', 'Too slow!', 'Bonk bonk!', 'Ninja noodle!', 'Boom!'],
    rare: ['I found {a_plant}!!', 'Starbloom here I come!', 'Best. Seed. EVER!'],
    idle: ['Zoom zoom!', 'Watch me find a Mythic!', 'Race you!', 'I\'m the fastest in the family.', 'Can we get ice cream after this?',
      'Bet you can\'t catch me, {human}!', 'Speed Level: awesome.', 'This is SO fun.'],
  },
  micah: {
    tease: ['Sneaky sneaky... catch me, {victim}!', 'Bonk me if you can, {victim}!', 'Hehe, try and catch me {victim}!'],
    caught: ['Aww, you caught me!', 'Okay you win this time!', 'Nice noodle!'],
    steal: ['Hehe. Your {plant} is mine now.', 'Can\'t catch me, {victim}!', 'Sneaky sneaky...', 'Thanks for the {plant}!', 'Ninja mode activated.'],
    robbed: ['Hey! That was MY {plant}!', '{thief} stole my stuff!', 'Not cool!', 'Okay {thief}, it\'s WAR.', 'I was gonna steal that back anyway.'],
    bonk: ['Noodle attack!', 'Ha! Got you!', 'BONK!', 'Critical hit!', 'You got noodled!'],
    rare: ['WHOA, {a_plant}!', 'This is so rare!', 'Is this a secret?!'],
    idle: ['Hehe.', 'Anyone want a banana?', 'I\'m not up to anything...', 'Nothing to see here.', 'I love this game.',
      'Watch your garden, {human}...', 'I have a plan. A sneaky plan.', 'Is it snack time yet?'],
  },
};

// Keyed tables are looked up with ids from saves and the network: no inherited keys ('constructor', 'toString'...).
for (const t of [MUTATIONS, DIFFICULTY, CHAT]) Object.setPrototypeOf(t, null);
