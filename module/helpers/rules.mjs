/**
 * Pure rule helpers for Sinless. No Foundry globals are used here so the
 * module can be unit-tested with plain Node.
 */

/**
 * Sinless rounding (p.31): values between 0 and 1 round up to 1,
 * everything else rounds down.
 * @param {number} value
 * @returns {number}
 */
export function sinlessRound(value) {
  if (!Number.isFinite(value)) return 0;
  if (value > 0 && value < 1) return 1;
  return Math.floor(value);
}

/** Pool composition (pp.31-33, 67-69). Fractions are applied per attribute. */
export const POOL_FORMULAS = Object.freeze({
  brawn: { str: 1, bod: 1 / 2, wil: 1 / 4 },
  finesse: { rea: 1, bod: 1 / 2, int: 1 / 4 },
  focus: { int: 1, rea: 1 / 2, wil: 1 / 4 },
  resolve: { wil: 1, int: 1 / 2, cha: 1 / 2 }
});

/**
 * Compute the four dice pools from attribute values.
 * @param {Record<string, number>} attributes  e.g. {str: 14, bod: 12, ...}
 * @param {string|null} charismaPool           Pool that receives 1/4 Charisma.
 * @returns {{brawn: number, finesse: number, focus: number, resolve: number}}
 */
export function computePools(attributes, charismaPool = null) {
  const pools = {};
  for (const [pool, parts] of Object.entries(POOL_FORMULAS)) {
    let total = 0;
    for (const [attr, factor] of Object.entries(parts)) {
      const value = Number(attributes[attr]) || 0;
      total += factor === 1 ? value : sinlessRound(value * factor);
    }
    pools[pool] = total;
  }
  if (charismaPool && charismaPool in pools) {
    pools[charismaPool] += sinlessRound((Number(attributes.cha) || 0) / 4);
  }
  return pools;
}

/**
 * Condition track size: base + 1/2 attribute (p.35).
 * @param {number} base       Base boxes (default 6; 3/9/12 optional).
 * @param {number} attribute  Body (physical) or Willpower (stun).
 */
export function conditionTrackSize(base, attribute) {
  return base + sinlessRound((Number(attribute) || 0) / 2);
}

/**
 * Death spiral (p.35): -1 for every 3 boxes marked on either track,
 * counted per track and summed.
 */
export function woundPenalty(physical, stun) {
  return Math.floor(Math.max(0, physical) / 3) + Math.floor(Math.max(0, stun) / 3);
}

/** Attribute point cost to raise an attribute from 1 to `value` (p.45). */
export function attributeCost(value) {
  let cost = 0;
  for (let v = 2; v <= value; v++) cost += v <= 10 ? 1 : v <= 15 ? 2 : 3;
  return cost;
}

/** Kismet pool size (p.39): 1 + 1 per 10 Kismet earned. */
export function kismetPoolSize(kismetEarned, bonus = 0) {
  return 1 + Math.floor(Math.max(0, kismetEarned) / 10) + bonus;
}

/**
 * Apply bonus and penalty dice (pp.29-30): penalties remove bonus dice first,
 * the remainder lowers the limit.
 * @returns {{limit: number, bonus: number}}
 */
export function applyModifiers(limit, bonus, penalty) {
  const net = bonus - penalty;
  if (net >= 0) return { limit, bonus: net };
  return { limit: limit + net, bonus: 0 };
}

/**
 * Target number for player tests (pp.27-28, 81).
 * @param {number} base  Run difficulty TN (4/5/6).
 * @param {number} heat  Operational heat stars (0-4); 3+ lowers the TN by 1.
 */
export function playerTargetNumber(base, heat = 0) {
  return Math.max(2, base - (heat >= 3 ? 1 : 0));
}

/** Operational heat bonus dice for players (p.81): +1 at two stars or more. */
export function heatBonusDice(heat = 0) {
  return heat >= 2 ? 1 : 0;
}

/**
 * Resolve a test from already-rolled dice (pp.28, 67).
 *
 * @param {object} options
 * @param {number[]} options.dice             Initial results.
 * @param {number} options.target             Target number.
 * @param {number} [options.reroll=0]         Reroll results <= this value once (0, 1 or 2).
 * @param {number[]} [options.rerollResults]  Results used for rerolled dice, in order.
 * @param {boolean} [options.untrained=false] Every four successes count as one.
 * @returns {{
 *   initial: number[], final: number[], rerolledIndices: number[],
 *   rawSuccesses: number, successes: number, abf: boolean, rerollCancelled: boolean
 * }}
 */
export function resolveTest({ dice, target, reroll = 0, rerollResults = [], untrained = false }) {
  const initial = [...dice];
  const final = [...dice];
  const allOnes = initial.length > 0 && initial.every(d => d === 1);
  const rerolledIndices = [];
  let rerollCancelled = false;

  if (reroll > 0) {
    if (allOnes) rerollCancelled = true;
    else {
      final.forEach((d, i) => { if (d <= reroll) rerolledIndices.push(i); });
      rerolledIndices.forEach((index, n) => {
        if (rerollResults[n] !== undefined) final[index] = rerollResults[n];
      });
    }
  }

  const rawSuccesses = final.filter(d => d >= target).length;
  const successes = untrained ? Math.floor(rawSuccesses / 4) : rawSuccesses;
  const abf = final.length > 0 && final.every(d => d === 1);
  return { initial, final, rerolledIndices, rawSuccesses, successes, abf, rerollCancelled };
}

/** Number of dice that need rerolling (0 when the reroll is cancelled by all ones). */
export function rerollCount(dice, reroll) {
  if (!reroll || !dice.length || dice.every(d => d === 1)) return 0;
  return dice.filter(d => d <= reroll).length;
}

/**
 * Opposed test outcome (p.28).
 * @returns {{winner: "a"|"b"|null, net: number}}
 */
export function opposedResult(a, b) {
  if (a === b) return { winner: null, net: 0 };
  return a > b ? { winner: "a", net: a - b } : { winner: "b", net: b - a };
}

/**
 * Plan a test: decides how many dice come from the pool, as bonus dice, and from Kismet.
 *
 * @param {object} o
 * @param {"skill"|"default"|"untrained"|"defense"|"rank"} o.mode
 *   skill: limit = rank + gear; default: grouped skill at -2; untrained: whole pool, /4;
 *   defense: no limit (dodge/soak/resist); rank: out of conflict, roll the rank (p.67).
 * @param {number} o.rank          Skill rank (or grouped skill rank when defaulting).
 * @param {number} o.gear          Gear limit bonus (e.g. accuracy).
 * @param {number} o.bonus         Bonus dice.
 * @param {number} o.penalty       Penalty dice.
 * @param {number} o.poolAvailable Dice remaining in the pool.
 * @param {number} [o.poolDice]    Dice the player chooses to draw (defaults to the max allowed).
 * @param {number} [o.kismet=0]    Kismet dice (ignore limits and penalties).
 * @returns {{limit: number, poolDice: number, bonusDice: number, kismetDice: number,
 *            total: number, impossible: boolean, untrained: boolean, usesPool: boolean}}
 */
export function planTest(o) {
  const kismet = Math.max(0, o.kismet ?? 0);
  const gear = o.gear ?? 0;
  let limit;
  let usesPool = true;
  switch (o.mode) {
    case "default": limit = o.rank + gear - 2; break;
    case "untrained":
    case "defense": limit = o.poolAvailable; break;
    case "rank": limit = o.rank + gear; usesPool = false; break;
    default: limit = o.rank + gear;
  }
  const mod = applyModifiers(limit, o.bonus ?? 0, o.penalty ?? 0);
  const cap = usesPool ? Math.min(mod.limit, o.poolAvailable) : mod.limit;
  const allowed = Math.max(0, cap);
  const poolDice = Math.min(allowed, Math.max(0, o.poolDice ?? allowed));
  // p.29-30: no dice left after penalties, or an empty pool, makes the test impossible.
  const impossible = (mod.limit <= 0 && mod.bonus === 0) || (usesPool && o.poolAvailable <= 0);
  const total = impossible ? 0 : poolDice + mod.bonus + kismet;
  return {
    limit: mod.limit,
    poolDice: impossible ? 0 : poolDice,
    bonusDice: impossible ? 0 : mod.bonus,
    kismetDice: impossible ? 0 : kismet,
    total,
    impossible,
    untrained: o.mode === "untrained",
    usesPool
  };
}
