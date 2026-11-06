import { test } from "node:test";
import assert from "node:assert/strict";
import {
  forceFormula, drainIsLethal, drainResult, summonResult, amplificationCost
} from "../module/helpers/magic.mjs";

test("drain codes from the spell lists (pp.169-170)", () => {
  assert.equal(forceFormula("3 + (Force/2)", 6), 6);
  assert.equal(forceFormula("3 + (Force/2)", 1), 4); // half force has a minimum of 1
  assert.equal(forceFormula("3 + Force", 5), 8);
  assert.equal(forceFormula("Force", 4), 4);
  assert.equal(forceFormula("1", 6), 1);
  assert.equal(forceFormula("(Force/2)", 5), 2);
  assert.equal(forceFormula("½ Force", 7), 3);
  assert.equal(forceFormula("4 + (Force /2)", 3), 5);
  assert.equal(forceFormula("2+Force.", 2), 4);
  assert.equal(forceFormula("", 3), null);
});

test("spell damage formulas use the same substitution", () => {
  assert.equal(forceFormula("1+Force", 4), 5);       // Manon Bolt base
  assert.equal(forceFormula("½ force", 6), 3);       // Powerball base
  assert.equal(forceFormula("2 Force", 3), 6);
});

test("drain is lethal above the Zoetic Potential (p.167)", () => {
  assert.equal(drainIsLethal(6, 6), false);
  assert.equal(drainIsLethal(7, 6), true);
});

test("drain after channeling and soak (pp.166-167)", () => {
  assert.deepEqual(drainResult({ drain: 6, channel: 2, soak: 1 }), { track: "stun", amount: 3 });
  assert.deepEqual(drainResult({ drain: 3, channel: 5 }), { track: "stun", amount: 1 });
  assert.deepEqual(drainResult({ drain: 8, lethal: true, channel: 3, soak: 4 }), { track: "physical", amount: 5 });
  assert.deepEqual(drainResult({ drain: 2, lethal: true, channel: 2 }), { track: "stun", amount: 1 });
});

test("summoning a spirit (p.183)", () => {
  assert.deepEqual(summonResult(6, 4), { outcome: "bound", services: 2, needed: 4 });
  assert.deepEqual(summonResult(4, 4), { outcome: "uncontrolled", services: 0, needed: 4 });
  assert.deepEqual(summonResult(3, 4), { outcome: "failed", services: 0, needed: 4 });
  assert.deepEqual(summonResult(3, 4, 2), { outcome: "bound", services: 1, needed: 2 });
});

test("amps pay half the Zoetic cost of amplifications (p.180)", () => {
  assert.equal(amplificationCost(4, false), 4);
  assert.equal(amplificationCost(4, true), 2);
});
