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
 */
export function difficultyTuning(id) {
  const d = DIFFICULTY[id] || DIFFICULTY.normal;
  const T = {
    // riskPad: extra speed margin before trying a biome; eager: multiplier on purchase thresholds;
    // beat: pause between plans; breakChance: chance to hang around home after a trip
    chill: {
      humanStealMult: 0.7, humanStealGap: 170, humanGrace: 240, humanMinGrown: 2,
      humanMug: 0, humanChaseMult: 0.45, humanBalloon: 0.25, peelNotice: 0.3, aimError: 0.3,
      riskPad: 0.25, eager: 1.6, beat: 2.2, breakChance: 0.4,
    },
    normal: {
      humanStealMult: 1.5, humanStealGap: 60, humanGrace: 110, humanMinGrown: 1,
      humanMug: 0.4, humanChaseMult: 1, humanBalloon: 0.8, peelNotice: 0.6, aimError: 0.14,
      riskPad: 0.15, eager: 1.25, beat: 1.4, breakChance: 0.2,
    },
    chaos: {
      humanStealMult: 1.3, humanStealGap: 28, humanGrace: 50, humanMinGrown: 1,
      humanMug: 1, humanChaseMult: 1.3, humanBalloon: 1, peelNotice: 0.88, aimError: 0.06,
      riskPad: 0.05, eager: 1.0, beat: 0.8, breakChance: 0.08,
    },
  }[DIFFICULTY[id] ? id : 'normal'];
  return {
    id: DIFFICULTY[id] ? id : 'normal',
    stealRate: d.stealRate,
    reaction: d.reaction,
    bonkAccuracy: d.bonkAccuracy,
    // brain re-evaluates goals every ~decide seconds (jittered)
    decide: 0.35 + d.reaction * 0.95,
    ...T,
  };
}
