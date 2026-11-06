/**
 * Ranged combat modifiers, recoil and skill specializations (pp.41, 88-92).
 * Pure functions, unit-tested without Foundry.
 */

/** Light (p.90): bright +2, normal 0, dim −1, darkness −4. */
export const LIGHT_MODIFIERS = Object.freeze({ bright: 2, normal: 0, dim: -1, dark: -4 });

/** Cover (p.90): low −1, high −2, total −4 ("taking cover" is high cover). */
export const COVER_MODIFIERS = Object.freeze({ none: 0, low: -1, high: -2, total: -4 });

export const POINT_BLANK_BONUS = 4;
export const PRONE_PENALTY = 2;
export const DUAL_WIELD_PENALTY = 1;
export const MAX_AIM_ACTIONS = 2;

/** Weapon categories that use the ranged modifiers. */
export const RANGED_CATEGORIES = Object.freeze(["thrown", "projectile", "firearm", "energy", "heavy", "vehicle"]);

/** Ballistic weapons accumulate recoil (p.91); lasers, bows and thrown weapons do not. */
export const RECOIL_CATEGORIES = Object.freeze(["firearm", "heavy"]);

/**
 * Total the ranged combat modifiers of one attack (pp.88-92).
 * @param {object} o
 * @param {string} [o.light]        LIGHT_MODIFIERS key.
 * @param {string} [o.cover]        COVER_MODIFIERS key.
 * @param {boolean} [o.pointBlank]  Within 4 m, or the target is caught out: +4.
 * @param {boolean} [o.prone]       Non-adjacent target is prone: −2.
 * @param {number} [o.aim]          Simple actions spent aiming (max 2): +accuracy each.
 * @param {number} [o.accuracy]     The weapon's accuracy.
 * @param {number} [o.extraTargets] Different targets already attacked this turn: −1 each.
 * @param {boolean} [o.dualWield]   Two guns: −1, and accuracy cannot be used.
 * @param {number} [o.range]        Weapon range table modifier (+bonus / −penalty).
 * @returns {{bonus: number, penalty: number, accuracy: number, parts: {key: string, value: number}[]}}
 *   `accuracy` is what may still be added to the limit.
 */
export function combatModifiers(o = {}) {
  const parts = [];
  const add = (key, value) => { if (value) parts.push({ key, value }); };
  const accuracy = o.dualWield ? 0 : Math.max(0, o.accuracy ?? 0);
  add("light", LIGHT_MODIFIERS[o.light] ?? 0);
  add("cover", COVER_MODIFIERS[o.cover] ?? 0);
  if (o.pointBlank) add("pointBlank", POINT_BLANK_BONUS);
  if (o.prone) add("prone", -PRONE_PENALTY);
  const aim = Math.clamp(Math.floor(o.aim ?? 0), 0, MAX_AIM_ACTIONS);
  add("aim", aim * accuracy);
  add("targets", -Math.max(0, Math.floor(o.extraTargets ?? 0)));
  if (o.dualWield) add("dualWield", -DUAL_WIELD_PENALTY);
  add("range", Math.trunc(o.range ?? 0));
  const bonus = parts.filter(p => p.value > 0).reduce((s, p) => s + p.value, 0);
  const penalty = parts.filter(p => p.value < 0).reduce((s, p) => s - p.value, 0);
  return { bonus, penalty, accuracy, parts };
}

/**
 * Recoil capacity (pp.27, 91): base 1, +1 at Strength 12, +2 at Strength 24,
 * plus implants (Active Effects) and weapon mods (bipod, gyro-mount, gas vent).
 */
export function recoilCapacity({ strength = 0, bonus = 0, weapon = 0 } = {}) {
  const str = strength >= 24 ? 2 : strength >= 12 ? 1 : 0;
  return Math.max(0, 1 + str + bonus + weapon);
}

/** Full auto takes a complex action; every other firing mode a simple action (p.85). */
export function firingAction(mode) {
  return mode === "fullAuto" ? "complex" : "simple";
}

/**
 * Recoil after firing (p.91): two consecutive simple actions firing give one
 * token, a complex action gives two. `primed` remembers an odd simple shot.
 * @returns {{tokens: number, primed: boolean, gained: number}}
 */
export function recoilAfterShot({ tokens = 0, primed = false } = {}, action = "simple") {
  if (action === "complex") return { tokens: tokens + 2, primed: false, gained: 2 };
  if (primed) return { tokens: tokens + 1, primed: false, gained: 1 };
  return { tokens, primed: true, gained: 0 };
}

/** At recoil capacity the gun cannot be fired accurately: the attack misses (p.92). */
export function recoilJammed(tokens, capacity) {
  return tokens >= capacity;
}

/**
 * Specialization (p.41): +1 when it applies, −1 for every other use of the skill.
 * Only for skills the character actually has (not defaulting or untrained use).
 */
export function specializedRank(rank, spec, applies) {
  if (!spec || rank <= 0) return rank;
  return Math.max(0, rank + (applies ? 1 : -1));
}

/** Whether a specialization obviously names the item (e.g. "Pistols" for "Heavy Pistol"). */
export function specMatches(spec, ...names) {
  const words = String(spec ?? "").toLowerCase().split(/[\s,/、・]+/).filter(w => w.length >= 2);
  if (!words.length) return false;
  const stem = w => w.replace(/(es|s)$/u, "");
  const haystack = names.filter(Boolean).join(" ").toLowerCase();
  return words.some(w => haystack.includes(w) || (stem(w).length >= 3 && haystack.includes(stem(w))));
}
