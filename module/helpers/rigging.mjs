/**
 * Rigging rules (ch.8, pp.142-152). Pure: no Foundry globals.
 */

/** Penalty dice by control method (p.142). */
export const CONTROL_PENALTY = Object.freeze({ manual: 4, vcr: 2, hotseat: 0 });

/**
 * Control method actually available: VCR control needs a VCR, hot-seating also
 * needs a nerve rig (p.142).
 * @param {"manual"|"vcr"|"hotseat"} wanted
 * @param {{nerveRig: boolean}|null} vcr
 */
export function effectiveControl(wanted, vcr) {
  if (!vcr) return "manual";
  if (wanted === "hotseat" && !vcr.nerveRig) return "vcr";
  return wanted in CONTROL_PENALTY ? wanted : "vcr";
}

/** Overdrive (p.143): +2 m per success to every movement action this round. */
export function overdriveGain(successes) {
  return 2 * Math.max(0, successes || 0);
}

/**
 * Ramming (p.144).
 * Target: successes + Body of the ramming vehicle + 2 × inertia.
 * Ramming vehicle: Body of the target − successes − inertia (never below 0).
 * Battle Ram: double damage dealt, half damage taken (p.149).
 * @returns {{targetDamage: number, selfDamage: number|null}}
 */
export function ramResult({ successes = 0, body = 0, inertia = 0, targetBody = null, battleRam = false }) {
  let targetDamage = Math.max(0, successes) + body + 2 * Math.max(0, inertia);
  let selfDamage = targetBody === null || targetBody === undefined
    ? null
    : Math.max(0, targetBody - Math.max(0, successes) - Math.max(0, inertia));
  if (battleRam) {
    targetDamage *= 2;
    if (selfDamage !== null) selfDamage = Math.floor(selfDamage / 2);
  }
  return { targetDamage, selfDamage };
}

/** Vehicles soak with their whole current Body (p.144). */
export function vehicleSoakDice(body, damage) {
  return Math.max(0, (body || 0) - Math.max(0, damage || 0));
}

/** Damage to a hot-seated vehicle hits the rigger's stun track, less VCR hardening (p.142). */
export function hotseatFeedback(damage, vcrHardening = 0) {
  return Math.max(0, (damage || 0) - Math.max(0, vcrHardening || 0));
}
