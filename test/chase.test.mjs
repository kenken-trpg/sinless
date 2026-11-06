import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDeck, dealPaths, moveRange, inAttackRange, chaseNeeded, chaseOutcome, CHASE_LEGS, CHASE_PATHS
} from "../module/helpers/chase.mjs";

test("legs and paths by difficulty (pp.151, 230)", () => {
  assert.deepEqual([CHASE_LEGS.veteran, CHASE_LEGS.professional, CHASE_LEGS.prime], [3, 4, 5]);
  assert.deepEqual([CHASE_PATHS.veteran, CHASE_PATHS.prime], [2, 3]);
});

test("deck lines: '+' marks a leg completed card", () => {
  const deck = parseDeck("+ Highway on-ramp\nRoadblock\n\n[leg] Tunnel\nPolice drone joins");
  assert.deepEqual(deck, [
    { text: "Highway on-ramp", leg: true }, { text: "Roadblock", leg: false },
    { text: "Tunnel", leg: true }, { text: "Police drone joins", leg: false }
  ]);
});

test("the deck is shuffled and split between the paths", () => {
  const cards = parseDeck("a\nb\nc\nd\ne");
  const paths = dealPaths(cards, 2, () => 0.5);
  assert.equal(paths.length, 2);
  assert.equal(paths[0].length + paths[1].length, 5);
  assert.ok(paths.flat().every(c => c.revealed === false));
});

test("range categories: fall back, close in, out of the chase; flyers stay close (p.152)", () => {
  assert.equal(moveRange("close", 1), "fallingBack");
  assert.equal(moveRange("distant", 1), "out");
  assert.equal(moveRange("distant", -2), "close");
  assert.equal(moveRange("close", -5), "engaged");
  assert.equal(moveRange("distant", 1, { flying: true }), "close");
  assert.ok(inAttackRange("close"));
  assert.ok(!inAttackRange("fallingBack"));
});

test("successes needed for chase actions (pp.152, 231-232)", () => {
  assert.equal(chaseNeeded("maneuver", { handling: 2 }), 2);
  assert.equal(chaseNeeded("maneuver", { handling: -1 }), 1);
  assert.equal(chaseNeeded("maneuver", { handling: 2, rigger: true }), 3);
  assert.equal(chaseNeeded("trap"), 4);
  assert.equal(chaseNeeded("switch"), 2);
});

test("escape by legs or by losing every pursuer; wrecked ends the chase (p.232)", () => {
  assert.equal(chaseOutcome({ legs: 3, legsDone: 3, enemies: [{ range: "close" }] }), "legs");
  assert.equal(chaseOutcome({ legs: 3, legsDone: 1, enemies: [{ range: "out" }, { range: "close", wrecked: true }] }), "evaded");
  assert.equal(chaseOutcome({ legs: 3, legsDone: 1, enemies: [{ range: "close" }] }), null);
  assert.equal(chaseOutcome({ legs: 3, legsDone: 1, enemies: [], wrecked: true }), "wrecked");
});
