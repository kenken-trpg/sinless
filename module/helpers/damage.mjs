/**
 * Pure damage helpers (pp.88-94, 110, ch.5 "Exceeding the Maximum").
 * No Foundry globals: unit-tested with plain Node.
 */
import { sinlessRound } from "./rules.mjs";

/** Weapon categories stopped by impact armor; everything else is "targeted" (p.92). */
const IMPACT_CATEGORIES = new Set(["melee", "unarmed", "thrown"]);

/**
 * Which armor stops a weapon.
 * @param {string} category        Weapon category.
 * @param {"auto"|"ballistic"|"impact"} [override]
 * @returns {"ballistic"|"impact"}
 */
export function weaponArmorType(category, override = "auto") {
  if (override === "ballistic" || override === "impact") return override;
  return IMPACT_CATEGORIES.has(category) ? "impact" : "ballistic";
}

/**
 * Turn a printed damage value ("½ Str +5", "Str", "½ Str +12+2d6", "10+fire")
 * into a dice formula. Strength terms are replaced by numbers; trailing text
 * that is not part of the formula ("fire") is returned as a note.
 * @param {string} text
 * @param {number} strength
 * @returns {{formula: string, note: string}}
 */
export function damageFormula(text, strength = 0) {
  let s = String(text ?? "").trim().replace(/[−–—]/g, "-").replace(/×/g, "*");
  const str = Number(strength) || 0;
  const sub = (re, value) => { s = s.replace(re, `${value}`); };
  sub(/(?:½|1\/2)\s*str(?:ength)?\.?/gi, sinlessRound(str / 2));
  sub(/(?:¼|1\/4)\s*str(?:ength)?\.?/gi, sinlessRound(str / 4));
  s = s.replace(/(\d+)\s*[x*]\s*str(?:ength)?\.?/gi, (_m, n) => `${Number(n) * str}`);
  sub(/str(?:ength)?\.?/gi, str);

  const match = s.match(/^[\d\s+\-*/()d]*/i);
  let formula = (match?.[0] ?? "").trim();
  let note = s.slice(match?.[0]?.length ?? 0).trim();
  // Drop dangling operators left behind by text such as "10+fire".
  while (/[+\-*/(\s]$/.test(formula)) formula = formula.slice(0, -1).trimEnd();
  while (/^[+*/)\s]/.test(formula)) formula = formula.slice(1).trimStart();
  if (!/\d/.test(formula)) formula = "0";
  note = note.replace(/^[+\-\s]+/, "");
  return { formula, note };
}

/**
 * Resolve the damage of one hit against one target.
 *
 * Targeted weapons (ballistic): the highest ballistic layer is compared with
 * penetration; if it is higher the damage is stun, otherwise physical. The total
 * ballistic armor reduces the damage (p.89).
 * Melee, thrown and explosives (impact): impact armor reduces the damage, minus
 * the weapon's armor piercing (p.94).
 * Energy weapons strip one point from each armor type the target wears; each
 * stripped point also removes one point of damage (pp.89, 110).
 *
 * @param {object} o
 * @param {number} o.base            Weapon damage (already evaluated).
 * @param {number} o.hits            Attacker successes.
 * @param {number} [o.dodge=0]       Dodge successes.
 * @param {"ballistic"|"impact"} [o.armorType="ballistic"]
 * @param {number} [o.penetration=0] Penetration (ballistic) or armor piercing (impact).
 * @param {{ballistic: {total: number, highest: number}, impact: {total: number, highest: number}}} o.armor
 * @param {boolean} [o.energy=false]
 * @param {boolean} [o.stun=false]   The weapon only deals stun damage.
 * @param {number} [o.soak=0]        Soak successes.
 * @param {number} [o.modifier=0]    Situational change to the damage (half blast, mist ...).
 * @param {boolean} [o.halve=false]  Half damage (2"-4" from a grenade, p.93).
 * @param {boolean} [o.blast=false]  Explosive: successes only reduce scatter, so they
 *                                   neither add damage nor can be dodged away (p.93).
 * @returns {{hit: boolean, net: number, raw: number, stripped: string[], armorReduction: number,
 *            afterArmor: number, final: number, track: "physical"|"stun"}}
 */
export function resolveDamage(o) {
  const n = v => Math.max(0, Number(v) || 0);
  const armorType = o.armorType === "impact" ? "impact" : "ballistic";
  const net = o.blast ? 0 : n(o.hits) - n(o.dodge);
  const empty = { total: 0, highest: 0 };
  const armor = {
    ballistic: { ...empty, ...(o.armor?.ballistic ?? {}) },
    impact: { ...empty, ...(o.armor?.impact ?? {}) }
  };

  let track = o.stun ? "stun" : "physical";
  if (!o.blast && net <= 0) {
    return { hit: false, net: 0, raw: 0, stripped: [], armorReduction: 0, afterArmor: 0, final: 0, track };
  }

  let raw = n(o.base) + net;
  if (o.halve) raw = Math.floor(raw / 2);
  raw += Number(o.modifier) || 0;
  raw = Math.max(0, raw);

  const stripped = [];
  let stripReduction = 0;
  if (o.energy) {
    for (const kind of ["ballistic", "impact"]) {
      if (armor[kind].total <= 0) continue;
      stripped.push(kind);
      stripReduction += 1;
      armor[kind] = { total: armor[kind].total - 1, highest: Math.max(0, armor[kind].highest - 1) };
    }
  }

  const pen = n(o.penetration);
  let armorReduction;
  if (armorType === "ballistic") {
    if (!o.stun && armor.ballistic.highest > pen) track = "stun";
    armorReduction = armor.ballistic.total;
  } else {
    armorReduction = Math.max(0, armor.impact.total - pen);
  }
  armorReduction += stripReduction;

  const afterArmor = Math.max(0, raw - armorReduction);
  const final = Math.max(0, afterArmor - n(o.soak));
  return { hit: true, net, raw, stripped, armorReduction, afterArmor, final, track };
}

/**
 * Mark damage on the condition tracks. Stun damage beyond the track overflows
 * to the physical track; physical damage beyond it goes in the overflow box.
 * @param {{physical: number, stun: number, overflow: number}} current
 * @param {{physical: number, stun: number}} max
 * @param {number} amount
 * @param {"physical"|"stun"} track
 * @returns {{physical: number, stun: number, overflow: number,
 *            physicalFull: boolean, stunFull: boolean}}
 */
export function applyConditionDamage(current, max, amount, track) {
  let physical = current.physical ?? 0;
  let stun = current.stun ?? 0;
  let overflow = current.overflow ?? 0;
  let left = Math.max(0, Number(amount) || 0);

  if (track === "stun") {
    const room = Math.max(0, max.stun - stun);
    const taken = Math.min(room, left);
    stun += taken;
    left -= taken;
  }
  const room = Math.max(0, max.physical - physical);
  const taken = Math.min(room, left);
  physical += taken;
  overflow += left - taken;

  return {
    physical, stun, overflow,
    physicalFull: max.physical > 0 && physical >= max.physical,
    stunFull: max.stun > 0 && stun >= max.stun
  };
}
