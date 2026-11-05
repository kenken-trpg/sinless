import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sinlessRound, computePools, conditionTrackSize, woundPenalty, attributeCost, kismetPoolSize,
  applyModifiers, playerTargetNumber, heatBonusDice, resolveTest, rerollCount, opposedResult, planTest
} from "../module/helpers/rules.mjs";

test("rounding: (0,1) rounds up to 1, otherwise down (p.31)", () => {
  assert.equal(sinlessRound(0), 0);
  assert.equal(sinlessRound(0.25), 1);
  assert.equal(sinlessRound(0.75), 1);
  assert.equal(sinlessRound(1.5), 1);
  assert.equal(sinlessRound(4.5), 4);
});

test("pools match the Martial Artist sample (p.53)", () => {
  const attrs = { str: 14, bod: 12, rea: 9, int: 7, wil: 8, cha: 8 };
  assert.deepEqual(computePools(attrs, "brawn"), { brawn: 24, finesse: 16, focus: 13, resolve: 15 });
});

test("pools match the Assassin sample (p.54)", () => {
  const attrs = { str: 18, bod: 19, rea: 13, int: 3, wil: 3, cha: 3 };
  assert.deepEqual(computePools(attrs, "resolve"), { brawn: 28, finesse: 23, focus: 10, resolve: 6 });
});

test("condition tracks and death spiral (pp.35-36)", () => {
  assert.equal(conditionTrackSize(6, 12), 12);
  assert.equal(conditionTrackSize(6, 1), 7);
  assert.equal(woundPenalty(1, 2), 0);
  assert.equal(woundPenalty(1, 3), 1);
  assert.equal(woundPenalty(4, 3), 2);
});

test("attribute point cost (p.45)", () => {
  assert.equal(attributeCost(1), 0);
  assert.equal(attributeCost(10), 9);
  assert.equal(attributeCost(15), 19);
  assert.equal(attributeCost(17), 25);
});

test("kismet pool (p.39)", () => {
  assert.equal(kismetPoolSize(0), 1);
  assert.equal(kismetPoolSize(19), 2);
  assert.equal(kismetPoolSize(20, 1), 4);
});

test("penalties remove bonus dice before lowering the limit (p.29)", () => {
  assert.deepEqual(applyModifiers(3, 3, 5), { limit: 1, bonus: 0 });
  assert.deepEqual(applyModifiers(8, 0, 6), { limit: 2, bonus: 0 });
  assert.deepEqual(applyModifiers(5, 20, 9), { limit: 5, bonus: 11 });
});

test("target number and heat (pp.28, 81)", () => {
  assert.equal(playerTargetNumber(4, 0), 4);
  assert.equal(playerTargetNumber(5, 2), 5);
  assert.equal(playerTargetNumber(6, 3), 5);
  assert.equal(playerTargetNumber(4, 4), 3);
  assert.equal(heatBonusDice(1), 0);
  assert.equal(heatBonusDice(2), 1);
});

test("rulebook example: 1,1,1,2,3,4,6 is two successes (p.28)", () => {
  const r = resolveTest({ dice: [1, 1, 1, 2, 3, 4, 6], target: 4 });
  assert.equal(r.successes, 2);
  assert.equal(r.abf, false);
});

test("target numbers 5 and 6", () => {
  assert.equal(resolveTest({ dice: [1, 2, 3, 4, 5, 6], target: 5 }).successes, 2);
  assert.equal(resolveTest({ dice: [1, 2, 3, 4, 5, 6], target: 6 }).successes, 1);
});

test("rerolls 1s once", () => {
  const r = resolveTest({ dice: [1, 3, 5, 1], target: 4, reroll: 1, rerollResults: [6, 1] });
  assert.deepEqual(r.final, [6, 3, 5, 1]);
  assert.deepEqual(r.rerolledIndices, [0, 3]);
  assert.equal(r.successes, 2);
});

test("rerolls 1s and 2s", () => {
  assert.equal(rerollCount([1, 2, 3, 6], 2), 2);
  const r = resolveTest({ dice: [1, 2, 3, 6], target: 4, reroll: 2, rerollResults: [4, 5] });
  assert.deepEqual(r.final, [4, 5, 3, 6]);
  assert.equal(r.successes, 3);
});

test("all ones cancel rerolls and cause ABF (p.28)", () => {
  assert.equal(rerollCount([1, 1, 1], 2), 0);
  const r = resolveTest({ dice: [1, 1, 1], target: 4, reroll: 2, rerollResults: [6, 6, 6] });
  assert.equal(r.rerollCancelled, true);
  assert.equal(r.abf, true);
  assert.equal(r.successes, 0);
});

test("rerolled dice that end all ones still ABF", () => {
  const r = resolveTest({ dice: [1, 2], target: 4, reroll: 2, rerollResults: [1, 1] });
  assert.equal(r.abf, true);
});

test("zero successes without all ones is not ABF", () => {
  const r = resolveTest({ dice: [1, 1, 2], target: 4 });
  assert.equal(r.abf, false);
  assert.equal(r.successes, 0);
});

test("untrained: four successes count as one (p.67)", () => {
  const r = resolveTest({ dice: [4, 5, 6, 6, 6, 4, 4, 1], target: 4, untrained: true });
  assert.equal(r.rawSuccesses, 7);
  assert.equal(r.successes, 1);
});

test("opposed tests (p.28)", () => {
  assert.deepEqual(opposedResult(5, 3), { winner: "a", net: 2 });
  assert.deepEqual(opposedResult(2, 4), { winner: "b", net: 2 });
  assert.deepEqual(opposedResult(3, 3), { winner: null, net: 0 });
});

test("planTest: Todd shoots twice from a Finesse pool of 14 (p.29)", () => {
  const first = planTest({ mode: "skill", rank: 6, gear: 2, bonus: 0, penalty: 0, poolAvailable: 14 });
  assert.equal(first.poolDice, 8);
  const second = planTest({ mode: "skill", rank: 6, gear: 2, bonus: 0, penalty: 0, poolAvailable: 6 });
  assert.equal(second.poolDice, 6);
});

test("planTest: Pip with burst fire and -5 penalty rolls 1 die (p.29)", () => {
  const p = planTest({ mode: "skill", rank: 1, gear: 2, bonus: 3, penalty: 5, poolAvailable: 10 });
  assert.equal(p.total, 1);
});

test("planTest: Marcy dual full-auto rolls 16 dice (p.30)", () => {
  const p = planTest({ mode: "skill", rank: 5, gear: 0, bonus: 20, penalty: 9, poolAvailable: 20 });
  assert.equal(p.poolDice, 5);
  assert.equal(p.bonusDice, 11);
  assert.equal(p.total, 16);
});

test("planTest: limit at or below zero is impossible", () => {
  const p = planTest({ mode: "skill", rank: 1, gear: 2, bonus: 0, penalty: 5, poolAvailable: 10, kismet: 2 });
  assert.equal(p.impossible, true);
  assert.equal(p.total, 0);
});

test("planTest: empty pool makes pool tests impossible", () => {
  assert.equal(planTest({ mode: "defense", rank: 0, bonus: 0, penalty: 0, poolAvailable: 0 }).impossible, true);
});

test("planTest: defaulting with a grouped skill is -2 (p.66)", () => {
  const p = planTest({ mode: "default", rank: 5, gear: 0, bonus: 0, penalty: 0, poolAvailable: 20 });
  assert.equal(p.limit, 3);
});

test("planTest: untrained draws the whole pool", () => {
  const p = planTest({ mode: "untrained", rank: 0, bonus: 0, penalty: 0, poolAvailable: 13 });
  assert.equal(p.poolDice, 13);
  assert.equal(p.untrained, true);
});

test("planTest: outside conflict rolls the rank and ignores the pool (p.67)", () => {
  const p = planTest({ mode: "rank", rank: 4, gear: 0, bonus: 1, penalty: 0, poolAvailable: 0 });
  assert.equal(p.usesPool, false);
  assert.equal(p.total, 5);
});

test("planTest: Kismet dice ignore limits", () => {
  const p = planTest({ mode: "skill", rank: 2, gear: 0, bonus: 0, penalty: 0, poolAvailable: 10, kismet: 3 });
  assert.equal(p.total, 5);
});
