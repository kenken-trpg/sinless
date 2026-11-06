import { test } from "node:test";
import assert from "node:assert/strict";
import {
  overloadTests, overloadDice, bleedOutRounds, killedOutright, permanentInjury, organDamageMax
} from "../module/helpers/condition.mjs";

const track = (p, pm, s, sm, overflow = 0) => ({ physical: { value: p, max: pm }, stun: { value: s, max: sm }, overflow });

test("no overload test while the tracks have room", () => {
  assert.deepEqual(overloadTests(track(5, 10, 9, 10)), []);
});

test("physical full: successes equal to the overflow box (p.97)", () => {
  assert.deepEqual(overloadTests(track(10, 10, 2, 10, 3)), [{ track: "physical", needed: 3 }]);
});

test("stun full: successes equal to the physical damage (p.97)", () => {
  assert.deepEqual(overloadTests(track(4, 10, 10, 10)), [{ track: "stun", needed: 4 }]);
});

test("both full: the physical test comes first", () => {
  assert.deepEqual(overloadTests(track(10, 10, 10, 10, 2)).map(t => t.track), ["physical", "stun"]);
});

test("overload dice: whole Brawn pool less the wound penalty", () => {
  assert.equal(overloadDice(14, 5), 9);
  assert.equal(overloadDice(3, 6), 0);
});

test("bleed out in Body − overflow rounds", () => {
  assert.equal(bleedOutRounds(8, 3), 5);
  assert.equal(bleedOutRounds(2, 5), 0);
});

test("killed outright by more damage than the physical track in one attack", () => {
  assert.ok(killedOutright(11, 10));
  assert.ok(!killedOutright(10, 10));
  assert.ok(!killedOutright(5, 0));
});

test("permanent injury by net successes (p.97)", () => {
  assert.equal(permanentInjury(2, 3), "organ");
  assert.equal(permanentInjury(3, 3), "limb");
  assert.equal(permanentInjury(4, 3), "limb");
  assert.equal(permanentInjury(5, 3), "none");
  assert.equal(organDamageMax(20), 19);
  assert.equal(organDamageMax(22), 21);
});
