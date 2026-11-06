/**
 * Kismet awards, advancement costs and boons (pp.39, 214, 238).
 * Pure functions, unit-tested without Foundry.
 */

/** End-of-session Kismet awards (p.238). */
export const KISMET_AWARDS = Object.freeze({
  survived: 1,
  mission: 2,
  paydata: 1,
  optional: 1,
  personal: 5,
  learned: 1
});

export const NEW_SKILL_COST = 4;
/** Skills cannot be bought above 6; boons raise them to 7 and 8 (p.238). */
export const SKILL_PURCHASE_CAP = 6;

/**
 * Boons granted every time the Kismet pool grows (every 10 Kismet earned).
 * Every second boon (20, 40 …) may instead come from the major list (p.238).
 */
export const BOONS = Object.freeze({
  windfall: { tier: "minor" },
  asset: { tier: "minor" },
  mastery: { tier: "minor", skillFrom: 6 },
  item: { tier: "major" },
  guru: { tier: "major", skillFrom: 7 },
  resilience: { tier: "major" }
});

/** Financial windfall table, rolled on 1d6 (p.238). */
export const WINDFALLS = Object.freeze(["techtronics", "manastellite", "arcanatech", "influence", "marketCap", "cash"]);

/** Total of the selected end-of-session awards plus any extra Kismet. */
export function awardTotal(selected = [], extra = 0) {
  return selected.reduce((sum, key) => sum + (KISMET_AWARDS[key] ?? 0), 0) + Math.max(0, Math.trunc(extra));
}

/**
 * Cost to raise a skill by one (p.238): a new skill costs 4, otherwise the
 * current rank. Null when the skill is already at the purchase cap.
 */
export function skillRaiseCost(rank) {
  if (rank <= 0) return NEW_SKILL_COST;
  if (rank >= SKILL_PURCHASE_CAP) return null;
  return rank;
}

/**
 * Cost to raise an attribute by one (p.238): 3 per point up to 10, 4 from 11
 * to 15, 5 from 16. Null at the attribute's maximum.
 */
export function attributeRaiseCost(value, max = Infinity) {
  if (value >= max) return null;
  const next = value + 1;
  if (next <= 10) return 3;
  if (next <= 15) return 4;
  return 5;
}

/** Raising the Zoetic Potential by one costs twice its current value (p.214). */
export function zoeticRaiseCost(zoetic) {
  return 2 * Math.max(0, Math.floor(zoetic));
}

/**
 * Boons earned and still to choose. Boon `next` (1-based) may come from the
 * major list when it is even.
 */
export function boonStatus(earned, taken) {
  const total = Math.floor(Math.max(0, earned) / 10);
  const available = Math.max(0, total - taken);
  const next = taken + 1;
  return { total, available, next, major: next % 2 === 0 };
}

/** Boon keys selectable for boon number `index`. */
export function boonChoices(index) {
  const major = index % 2 === 0;
  return Object.keys(BOONS).filter(k => major || BOONS[k].tier === "minor");
}
