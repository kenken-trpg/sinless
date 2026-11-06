import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTROL_PENALTY, effectiveControl, overdriveGain, ramResult, vehicleSoakDice, hotseatFeedback
} from "../module/helpers/rigging.mjs";
import { resolveDamage } from "../module/helpers/damage.mjs";

test("control methods and their penalties (p.142)", () => {
  assert.deepEqual(CONTROL_PENALTY, { manual: 4, vcr: 2, hotseat: 0 });
  assert.equal(effectiveControl("hotseat", null), "manual");
  assert.equal(effectiveControl("hotseat", { nerveRig: false }), "vcr");
  assert.equal(effectiveControl("hotseat", { nerveRig: true }), "hotseat");
  assert.equal(effectiveControl("manual", { nerveRig: true }), "manual");
});

test("overdrive adds 2 m per success (p.143)", () => {
  assert.equal(overdriveGain(3), 6);
  assert.equal(overdriveGain(0), 0);
});

test("ramming damage both ways (p.144)", () => {
  assert.deepEqual(ramResult({ successes: 2, body: 10, inertia: 3, targetBody: 12 }), { targetDamage: 18, selfDamage: 7 });
  assert.deepEqual(ramResult({ successes: 5, body: 6, inertia: 0, targetBody: 4 }), { targetDamage: 11, selfDamage: 0 });
  assert.deepEqual(ramResult({ successes: 1, body: 6, inertia: 1 }), { targetDamage: 9, selfDamage: null });
  assert.deepEqual(ramResult({ successes: 2, body: 10, inertia: 3, targetBody: 12, battleRam: true }), { targetDamage: 36, selfDamage: 3 });
});

test("vehicles soak with current Body; hot-seat feedback less VCR hardening (pp.142, 144)", () => {
  assert.equal(vehicleSoakDice(15, 4), 11);
  assert.equal(vehicleSoakDice(3, 5), 0);
  assert.equal(hotseatFeedback(5, 1), 4);
  assert.equal(hotseatFeedback(1, 2), 0);
});

test("vehicles are immune to weapons that cannot penetrate their armor (pp.144, 152)", () => {
  const armor = { ballistic: { total: 4, highest: 4 }, impact: { total: 0, highest: 0 } };
  const pistol = resolveDamage({ base: 4, hits: 3, penetration: 2, armor, vehicle: true });
  assert.equal(pistol.immune, true);
  assert.equal(pistol.final, 0);
  const cannon = resolveDamage({ base: 9, hits: 2, penetration: 4, armor, vehicle: true });
  assert.equal(cannon.immune, undefined);
  assert.equal(cannon.track, "physical");
  assert.equal(cannon.final, 7);
});
