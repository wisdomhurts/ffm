// All tunable game data lives here. Units are Roblox studs and seconds.
// Gameplay, AI, UI and art modules read from this file; never hardcode these numbers elsewhere.

export const WORLD = {
  gravity: 196.2,
  jumpVelocity: 52,
  plaza: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
  spawn: { x: 0, z: 0 },
  road: { startZ: 60, width: 40, biomeLength: 150 },
  garden: { w: 36, d: 44 }, // w along X, d along Z
  // Garden centres by player slot. Gates face the central aisle (x = 0).
  gardenCenters: [
    { x: -48, z: -24 },
    { x: 48, z: -24 },
    { x: -48, z: 24 },
    { x: 48, z: 24 },
  ],
  planterCount: 10,
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
  maxSpeedLevel: 25,
  carrySeedMult: 0.85,
  carryPlantMult: 0.7,
  accel: 90, // studs/s^2 on ground
  airAccel: 35,
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

// Planters: first 4 unlocked. Cost to unlock planter index i (0-based).
export const PLANTERS = { startUnlocked: 4, unlockCost: [0, 0, 0, 0, 250, 900, 3500, 14000, 60000, 250000] };

export const LOCK = { duration: 40, perRebirth: 10, recharge: 60 };

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
  { id: 'secret', name: 'Secret', color: '#111111', glow: 0xffffff, tier: 6 },
];
export const RARITY = Object.assign(Object.create(null), Object.fromEntries(RARITIES.map((r) => [r.id, r])));

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
  // Secret: the family
  { id: 'dorianfruit', name: "Dorian's Dragonfruit", rarity: 'secret', income: 7000, grow: 300, look: 'dragonfruit', colors: ['#ff3f8e', '#7ee36b'], family: 'dorian' },
  { id: 'estherlotus', name: "Esther's Eternal Lotus", rarity: 'secret', income: 7000, grow: 300, look: 'lotus', colors: ['#ff8fc8', '#ffe066'], family: 'esther' },
  { id: 'maddiemarigold', name: "Maddie's Magic Marigold", rarity: 'secret', income: 7000, grow: 300, look: 'marigold', colors: ['#ffae00', '#b36bff'], family: 'maddie' },
  { id: 'micahmelon', name: "Micah's Mega Melon", rarity: 'secret', income: 7000, grow: 300, look: 'melon', colors: ['#3ddc84', '#ff5d5d'], family: 'micah' },
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
  { id: 'starbloom', name: 'Starbloom', rarity: 'mythic', ground: '#2a2f6b', wall: '#15173d', sky: '#1b1446', fog: '#2a2360',
    monster: { id: 'lurker', name: 'Star Lurker', speed: 38, aggro: 30, count: 3 } },
];
export const ROAD_END_Z = WORLD.road.startZ + BIOMES.length * WORLD.road.biomeLength;
export const biomeIndexAtZ = (z) => {
  if (z < WORLD.road.startZ) return -1;
  return Math.min(BIOMES.length - 1, Math.floor((z - WORLD.road.startZ) / WORLD.road.biomeLength));
};

export const PODS = {
  perSide: 5, // per biome per wall
  respawnMin: 18,
  respawnMax: 32,
  luckyChance: 0.08, // chance of +1 rarity tier
  secretChance: 0.03, // in Starbloom only
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
  ],
};

export const MATCH = { showdownSeconds: 480 };

// Bot rubber band (read by ai/, tuned with the headless kid sim): biomeLead = how many biomes past the
// human's deepest seed grab a bot may farm (only while it trails the human; level or ahead it stays a
// biome shallower); paceCap = once a bot's net worth or income passes paceCap x the human's it eases
// off (jogs on errands, farms shallower, ignores shiny seeds; 0 = never; the bots' routing and seed
// picks out-earn a new player, hence the low values); practiceSteal = one slow, telegraphed steal that
// teaches a new player to chase and bonk (after: earliest match second; unrobbedOnly: only if nobody
// has robbed the human yet).
export const DIFFICULTY = {
  chill: { name: 'Chill', botSpeedMult: 0.85, stealRate: 0.35, reaction: 0.9, bonkAccuracy: 0.5, monsterSpeedMult: 0.85, monsterAggroMult: 0.8,
    biomeLead: 0, paceCap: 0.4, practiceSteal: { after: 75, unrobbedOnly: false } },
  normal: { name: 'Normal', botSpeedMult: 1.0, stealRate: 1.0, reaction: 0.5, bonkAccuracy: 0.75, monsterSpeedMult: 1, monsterAggroMult: 1,
    biomeLead: 1, paceCap: 0.33, practiceSteal: { after: 240, unrobbedOnly: true } },
  chaos: { name: 'Chaos', botSpeedMult: 1.1, stealRate: 1.8, reaction: 0.25, bonkAccuracy: 0.92, monsterSpeedMult: 1.05, monsterAggroMult: 1.1,
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
    id: 'maddie', name: 'Maddie', title: 'The Speedster', color: '#9b5cff', personality: 'speedster',
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
