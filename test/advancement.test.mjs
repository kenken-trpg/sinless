import { test } from "node:test";
import assert from "node:assert/strict";
import {
  awardTotal, skillRaiseCost, attributeRaiseCost, zoeticRaiseCost, boonStatus, boonChoices
} from "../module/helpers/advancement.mjs";

test("session awards add up (p.238)", () => {
  assert.equal(awardTotal(["survived", "mission", "learned"]), 4);
  assert.equal(awardTotal(["survived", "mission", "paydata", "optional", "personal", "learned"]), 11);
  assert.equal(awardTotal([], 3), 3);
});

test("skills: new 4, then the current rank, not beyond 6 (p.238)", () => {
  assert.equal(skillRaiseCost(0), 4);
  assert.equal(skillRaiseCost(1), 1);
  assert.equal(skillRaiseCost(5), 5);
  assert.equal(skillRaiseCost(6), null);
});

test("attributes: 3 up to 10, 4 from 11 to 15, 5 from 16 (p.238)", () => {
  assert.equal(attributeRaiseCost(9), 3);
  assert.equal(attributeRaiseCost(10), 4);
  assert.equal(attributeRaiseCost(14), 4);
  assert.equal(attributeRaiseCost(15), 5);
  assert.equal(attributeRaiseCost(20, 20), null);
});

test("Zoetic Potential costs twice its current value (p.214)", () => {
  assert.equal(zoeticRaiseCost(6), 12);
  assert.equal(zoeticRaiseCost(4.5), 8);
});

test("a boon every 10 Kismet, major choices every second time (p.238)", () => {
  assert.deepEqual(boonStatus(9, 0), { total: 0, available: 0, next: 1, major: false });
  assert.deepEqual(boonStatus(23, 1), { total: 2, available: 1, next: 2, major: true });
  assert.deepEqual(boonChoices(1), ["windfall", "asset", "mastery"]);
  assert.deepEqual(boonChoices(2), ["windfall", "asset", "mastery", "item", "guru", "resilience"]);
});
