// Personality and difficulty tuning for the bot brains. Pure data + tiny helpers.
// Personalities come from CHARACTERS[].personality; difficulty numbers from config DIFFICULTY.
import { DIFFICULTY } from '../config.js';

/**
 * Weights are multipliers on utilities (1 = neutral). Speeds/ratios are unitless.
 *   farm/steal/defend  goal weights
 *   risk               minimum (carry speed / monster speed) the bot is comfortable with in a biome
 *   defendRange        how far away (studs) it still rushes home to stop a thief
 *   chaseTime          seconds it keeps chasing a thief before giving up
 *   homeBias           penalty on long trips (studs); guardians like to stay close to home
 *   lockChance         chance to lock the garden when leaving while rivals are around (guardian: always)
 *   speedEager         buys the next Speed level when cash >= price * speedEager
 *   items              desired item stock, bought when cash is comfortable
 *   itemReserve        buys an item only with cash >= price * itemReserve
 *   stealGap           minimum seconds between two steal attempts
 *   mug                appetite for bonking seed carriers to take their seed
 *   lane               preferred x offset on the Seed Road (spreads the bots out)
 */
export const PERSONALITIES = {
  tycoon: {
    farm: 1.0, steal: 0.6, defend: 0.9,
    risk: 1.04, defendRange: 90, chaseTime: 16, homeBias: 0,
    lockChance: 0.35, speedEager: 1.05, planterEager: 1.0,
    items: { bucket: 2, coil: 1, balloon: 1 }, itemReserve: 4,
    stealGap: 100, mug: 0.25, chatty: 1.0, lane: -3,
    wander: 0.6, patrol: false,
  },
  guardian: {
    farm: 0.85, steal: 0.3, defend: 1.4,
    risk: 1.1, defendRange: 400, chaseTime: 30, homeBias: 380,
    lockChance: 1.0, speedEager: 1.25, planterEager: 1.1,
    items: { balloon: 3, banana: 1 }, itemReserve: 3,
    stealGap: 160, mug: 0.1, chatty: 1.0, lane: 3,
    wander: 0.3, patrol: true,
  },
  speedster: {
    farm: 1.1, steal: 0.5, defend: 0.8,
    risk: 0.9, defendRange: 70, chaseTime: 14, homeBias: 0,
    lockChance: 0.2, speedEager: 1.0, planterEager: 1.35,
    items: { coil: 2 }, itemReserve: 3,
    stealGap: 120, mug: 0.3, chatty: 1.2, lane: 1,
    wander: 0.8, patrol: false,
  },
  thief: {
    farm: 0.8, steal: 1.7, defend: 0.7,
    risk: 1.0, defendRange: 55, chaseTime: 12, homeBias: 0,
    lockChance: 0.3, speedEager: 1.2, planterEager: 1.2,
    items: { banana: 3, balloon: 2, cloak: 1 }, itemReserve: 2.5,
    stealGap: 40, mug: 0.6, chatty: 1.2, lane: -1,
    wander: 0.7, patrol: false,
  },
};

/**
 * Difficulty-derived behaviour knobs. `human*` knobs only apply when the victim/target is the human,
 * which keeps Chill gentle for a kid while bots still play properly against each other.
 * The rubber band (see bot.js `_pace`) comes from config DIFFICULTY: `biomeLead`, `paceCap`,
 * `practiceSteal`; the `last*` knobs are the comeback help while the human is in last place.
 */
export function difficultyTuning(id) {
  const d = DIFFICULTY[id] || DIFFICULTY.normal;
  const T = {
    // riskPad: extra speed margin before trying a biome; eager: multiplier on purchase thresholds;
    // beat: pause between plans; breakChance: chance to hang around home after a trip;
    // lastStealMult/lastDecide: comeback help while the human is last; easeBeat/easeTempo: how much a
    // relaxed bot (well ahead of the human) slows down; endgame: Showdown seconds left when it stops spending;
    // shiny: how much it values lucky/mutated seeds over the biome's usual (0 = grabs what's handy);
    // humanDropGrace: seconds the bots leave a seed the human dropped for the human to pick back up
    chill: {
      humanStealMult: 0.7, humanStealGap: 170, humanGrace: 240, humanMinGrown: 2,
      humanMug: 0, humanChaseMult: 0.45, humanBalloon: 0.25, peelNotice: 0.3, aimError: 0.3,
      riskPad: 0.25, eager: 2.2, beat: 2.2, breakChance: 0.4,
      lastStealMult: 0.15, lastDecide: 1.4, easeBeat: 2.5, easeTempo: 0.3, endgame: 0, shiny: 0.1, humanDropGrace: 99, catchUp: 0.9,
    },
    normal: {
      humanStealMult: 1.5, humanStealGap: 60, humanGrace: 110, humanMinGrown: 1,
      humanMug: 0.4, humanChaseMult: 1, humanBalloon: 0.8, peelNotice: 0.6, aimError: 0.14,
      riskPad: 0.15, eager: 1.6, beat: 1.4, breakChance: 0.2,
      lastStealMult: 0.4, lastDecide: 1.2, easeBeat: 2, easeTempo: 0.25, endgame: 40, shiny: 0.6, humanDropGrace: 8, catchUp: 0.6,
    },
    chaos: {
      humanStealMult: 1.3, humanStealGap: 28, humanGrace: 50, humanMinGrown: 1,
      humanMug: 1, humanChaseMult: 1.3, humanBalloon: 1, peelNotice: 0.88, aimError: 0.06,
      riskPad: 0.05, eager: 1.0, beat: 0.8, breakChance: 0.08,
      lastStealMult: 1, lastDecide: 1, easeBeat: 0, easeTempo: 0, endgame: 75, shiny: 1, humanDropGrace: 0, catchUp: 0,
    },
  }[DIFFICULTY[id] ? id : 'normal'];
  return {
    id: DIFFICULTY[id] ? id : 'normal',
    stealRate: d.stealRate,
    reaction: d.reaction,
    bonkAccuracy: d.bonkAccuracy,
    // brain re-evaluates goals every ~decide seconds (jittered)
    decide: 0.35 + d.reaction * 0.95,
    // how many biomes past the human's deepest the bots may farm (no human: no cap)
    biomeLead: d.biomeLead ?? 99,
    // a bot richer than paceCap x the human's net worth eases off (0 = never)
    paceCap: d.paceCap ?? 0,
    practice: d.practiceSteal ?? null,
    ...T,
  };
}

/**
 * Lines for the Chill "practice steal" (a slow, telegraphed steal that teaches chase-and-bonk).
 * Used unless config CHAT gains `tease` / `caught` categories for the character.
 */
export const PRACTICE_LINES = {
  tease: {
    dorian: ['Hehe, try and catch me {victim}!', 'Come and get it, {victim}! Dad\'s not THAT fast!', 'Your {plant} is going on a little trip, {victim}!'],
    esther: ['Hehe, try and catch me {victim}!', 'Borrowing your {plant}! Catch me if you can, {victim}!', 'Run, {victim}, run! Bonk me to get it back!'],
    maddie: ['Hehe, try and catch me {victim}!', 'Slow-mo mode! Catch me, {victim}!', 'Your {plant} is MINE! Unless you bonk me, {victim}!'],
    micah: ['Hehe, try and catch me {victim}!', 'Sneaky sneaky... catch me, {victim}!', 'Bonk me if you can, {victim}!'],
  },
  caught: {
    dorian: ['Okay, okay, you got me!', 'Nice bonk! You\'re a natural.', 'Ha! Fair and square.'],
    esther: ['You got me! Good job, sweetie!', 'That\'s how you guard a garden!', 'Nice bonk!'],
    maddie: ['Nooo, you got me!', 'Okay, THAT was a good bonk!', 'No fair, you\'re quick!'],
    micah: ['Aww, you caught me!', 'Okay you win this time!', 'Nice noodle!'],
  },
};
