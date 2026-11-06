import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weaponArmorType, damageFormula, resolveDamage, applyConditionDamage
} from "../module/helpers/damage.mjs";

const armor = (ballistic = [0, 0], impact = [0, 0]) => ({
  ballistic: { total: ballistic[0], highest: ballistic[1] },
  impact: { total: impact[0], highest: impact[1] }
});

test("armor type follows the weapon category unless overridden (p.92)", () => {
  assert.equal(weaponArmorType("firearm"), "ballistic");
  assert.equal(weaponArmorType("energy"), "ballistic");
  assert.equal(weaponArmorType("melee"), "impact");
  assert.equal(weaponArmorType("thrown"), "impact");
  assert.equal(weaponArmorType("heavy", "impact"), "impact");
  assert.equal(weaponArmorType("melee", "ballistic"), "ballistic");
});

test("damage formulas substitute Strength (pp.93-94, 101)", () => {
  assert.deepEqual(damageFormula("6", 12), { formula: "6", note: "" });
  assert.deepEqual(damageFormula("½ Str +5", 12), { formula: "6 +5", note: "" });
  assert.deepEqual(damageFormula("½ Str−1", 9), { formula: "4-1", note: "" });
  assert.deepEqual(damageFormula("Str", 14), { formula: "14", note: "" });
  assert.deepEqual(damageFormula("½ Str +12+2d6", 10), { formula: "5 +12+2d6", note: "" });
  assert.deepEqual(damageFormula("10+fire", 10), { formula: "10", note: "fire" });
  assert.deepEqual(damageFormula("¼ Str", 1), { formula: "1", note: "" });
  assert.deepEqual(damageFormula("", 10), { formula: "0", note: "" });
});

test("Ben vs the guard: 4 hits, 2 dodged, battle armor 4, soak 1 → 3 physical (p.89)", () => {
  const r = resolveDamage({
    base: 6, hits: 4, dodge: 2, armorType: "ballistic", penetration: 4,
    armor: armor([4, 4]), soak: 1
  });
  assert.equal(r.hit, true);
  assert.equal(r.raw, 8);
  assert.equal(r.armorReduction, 4);
  assert.equal(r.afterArmor, 4);
  assert.equal(r.final, 3);
  assert.equal(r.track, "physical");
});

test("highest ballistic layer above penetration turns damage into stun (p.89)", () => {
  const r = resolveDamage({ base: 4, hits: 2, penetration: 2, armor: armor([5, 3]) });
  assert.equal(r.track, "stun");
  assert.equal(r.final, 1);
});

test("a dodge that cancels every success is a miss (p.92)", () => {
  const r = resolveDamage({ base: 10, hits: 3, dodge: 3, armor: armor() });
  assert.equal(r.hit, false);
  assert.equal(r.final, 0);
});

test("impact armor is reduced by armor piercing (p.94)", () => {
  const r = resolveDamage({ base: 8, hits: 2, armorType: "impact", penetration: 1, armor: armor([4, 4], [3, 3]) });
  assert.equal(r.armorReduction, 2);
  assert.equal(r.final, 8);
  assert.equal(r.track, "physical");
});

test("Kiri's grenade: 20 halved to 10, impact 3 → 7 (p.93)", () => {
  const r = resolveDamage({ base: 20, hits: 1, armorType: "impact", armor: armor([0, 0], [3, 3]), blast: true, halve: true });
  assert.equal(r.hit, true);
  assert.equal(r.raw, 10);
  assert.equal(r.afterArmor, 7);
});

test("stun-only weapons stay on the stun track", () => {
  const r = resolveDamage({ base: 6, hits: 1, armorType: "impact", armor: armor(), stun: true });
  assert.equal(r.track, "stun");
  assert.equal(r.final, 7);
});

test("energy weapons strip one point from each armor type (pp.89, 110)", () => {
  const one = resolveDamage({ base: 6, hits: 2, penetration: 0, energy: true, armor: armor([3, 3]) });
  assert.deepEqual(one.stripped, ["ballistic"]);
  assert.equal(one.armorReduction, 3);
  assert.equal(one.track, "stun");

  const both = resolveDamage({ base: 6, hits: 2, penetration: 0, energy: true, armor: armor([1, 1], [2, 2]) });
  assert.deepEqual(both.stripped, ["ballistic", "impact"]);
  assert.equal(both.armorReduction, 2);
  assert.equal(both.track, "physical");
  assert.equal(both.final, 6);
});

test("stun overflows to physical, physical overflows to the overflow box", () => {
  const max = { physical: 6, stun: 6 };
  assert.deepEqual(
    applyConditionDamage({ physical: 0, stun: 4, overflow: 0 }, max, 5, "stun"),
    { physical: 3, stun: 6, overflow: 0, physicalFull: false, stunFull: true }
  );
  assert.deepEqual(
    applyConditionDamage({ physical: 5, stun: 0, overflow: 1 }, max, 3, "physical"),
    { physical: 6, stun: 0, overflow: 3, physicalFull: true, stunFull: false }
  );
  assert.deepEqual(
    applyConditionDamage({ physical: 6, stun: 6, overflow: 0 }, max, 2, "stun"),
    { physical: 6, stun: 6, overflow: 2, physicalFull: true, stunFull: true }
  );
});

test("spells ignore armor and are reduced only by resistance and soak (p.167)", () => {
  const r = resolveDamage({ base: 4, hits: 4, dodge: 1, armor: armor([4, 4], [3, 3]), ignoreArmor: true, soak: 2 });
  assert.equal(r.armorReduction, 0);
  assert.equal(r.raw, 7);
  assert.equal(r.final, 5);
  assert.equal(r.track, "physical");
});
