/**
 * Full condition tracks, bleeding out, death and permanent injury (pp.35, 97).
 * Pure functions, unit-tested without Foundry.
 */

/**
 * Overload tests a character must make at the start of their turn (p.97).
 * Physical track full: successes equal to the overflow box. Stun track full:
 * successes equal to the physical damage. Physical comes first.
 * @param {{physical: {value: number, max: number}, stun: {value: number, max: number}, overflow: number}} c
 * @returns {{track: "physical"|"stun", needed: number}[]}
 */
export function overloadTests(c) {
  const tests = [];
  const full = t => c[t].max > 0 && c[t].value >= c[t].max;
  if (full("physical")) tests.push({ track: "physical", needed: c.overflow ?? 0 });
  if (full("stun")) tests.push({ track: "stun", needed: c.physical.value });
  return tests;
}

/** The free overload test rolls the whole Brawn pool less the wound penalty (p.97). */
export function overloadDice(brawnMax, woundPenalty) {
  return Math.max(0, (brawnMax ?? 0) - (woundPenalty ?? 0));
}

/** A failed physical overload test bleeds out in Body − overflow combat rounds (p.97). */
export function bleedOutRounds(body, overflow) {
  return Math.max(0, (body ?? 0) - (overflow ?? 0));
}

/** More damage in a single attack than the whole physical track kills outright (p.97). */
export function killedOutright(damage, physicalMax) {
  return physicalMax > 0 && damage > physicalMax;
}

/**
 * Permanent damage after the run (p.97): an unmodified Brawn pool test needing
 * as many successes as the overflow damage taken.
 * @returns {"organ"|"limb"|"none"} organ damage (−1 to a random maximum), a lost
 *   eye or limb (0 or 1 net successes), or no lasting harm (2+ net successes).
 */
export function permanentInjury(successes, overflow) {
  const net = successes - overflow;
  if (net < 0) return "organ";
  if (net <= 1) return "limb";
  return "none";
}

/** Organ damage permanently lowers a statistic's maximum by 1 (p.97: 20 becomes 19). */
export function organDamageMax(currentMax) {
  return Math.max(0, currentMax - 1);
}
