/**
 * Operation phase: alert, operational heat and fallout (pp.80-81, 235-236).
 * Pure functions, unit-tested without Foundry.
 */

/** Alert above this triggers two stars of operational heat (p.236). */
export const ALERT_HEAT_THRESHOLD = 50;

/** Shadow test while sneaking (p.236): no success +2 alert, one success +1, two or more +0. */
export function shadowAlert(successes) {
  if (successes <= 0) return 2;
  if (successes === 1) return 1;
  return 0;
}

/**
 * Heat after the alert changes: over 50 alert sets two stars (p.236).
 * Heat never goes down by itself.
 */
export function heatAfterAlert(alert, heat) {
  return alert > ALERT_HEAT_THRESHOLD ? Math.max(heat, 2) : heat;
}

/** Being discovered (identified, suspicious activity seen) sets at least one star (pp.81, 236). */
export function heatWhenDiscovered(heat) {
  return Math.max(heat, 1);
}

/**
 * Alert responses whose threshold was crossed by going from `before` to `after`.
 * @param {{label: string, threshold: number}[]} responses
 */
export function crossedResponses(responses, before, after) {
  if (after <= before) return [];
  return responses
    .filter(r => Number.isFinite(r.threshold) && r.threshold > before && r.threshold <= after)
    .sort((a, b) => a.threshold - b.threshold);
}

/** Responses already active at an alert level. */
export function activeResponses(responses, alert) {
  return responses.filter(r => Number.isFinite(r.threshold) && r.threshold <= alert);
}

/**
 * Sector heat gained at the end of the operation (p.81): two stars rise by 1 on
 * 4-6 (needs the 1d6 roll), three stars +1, four stars +2.
 */
export function sectorHeatGain(heat, roll = null) {
  if (heat >= 4) return 2;
  if (heat === 3) return 1;
  if (heat === 2) return roll !== null && roll >= 4 ? 1 : 0;
  return 0;
}

/** Whether ending the operation needs a 1d6 for sector heat. */
export function sectorHeatNeedsRoll(heat) {
  return heat === 2;
}

/** Camera fallout table, 1d6 (p.236). */
export const CAMERA_FALLOUT = Object.freeze({
  1: { key: "assassination" },
  2: { key: "extraction" },
  3: { key: "investigation", ghost: "2d6" },
  4: { key: "investigation", ghost: "1d6" },
  5: { key: "investigation", ghost: "1" },
  6: { key: "mixup" }
});

/** Paydata sale multiplier by run difficulty; relics are worth ten times as much (p.236). */
export const PAYDATA_MULTIPLIER = Object.freeze({ veteran: 1000, professional: 10000, prime: 100000 });

/**
 * Value of one cache: paydata 3d6 × multiplier, a relic (on a 6) ten times that.
 * @param {number} kindRoll  1d6: a 6 makes it a relic.
 * @param {number} valueRoll 3d6 total.
 */
export function cacheValue(difficulty, kindRoll, valueRoll) {
  const relic = kindRoll === 6;
  const mult = PAYDATA_MULTIPLIER[difficulty] ?? PAYDATA_MULTIPLIER.veteran;
  return { relic, value: valueRoll * mult * (relic ? 10 : 1) };
}
