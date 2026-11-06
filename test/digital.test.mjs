import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hardeningReduction, digitalNet, acidBurnResult, digitalTrack, entityDefenseDice, shrinkInfluence, softwareAlert, resolveDigital
} from "../module/helpers/grid.mjs";

test("hardening reduces digital damage like armor; BEEs ignore 4 (pp.130, 205)", () => {
  assert.equal(hardeningReduction(4), 4);
  assert.equal(hardeningReduction(4, 4), 0);
  assert.equal(hardeningReduction(3, 4), 0);
});

test("De-rez successes are reduced by defense and hardening (p.136)", () => {
  assert.equal(digitalNet({ hits: 7, defense: 2, hardening: 3 }), 2);
  assert.equal(digitalNet({ hits: 3, defense: 2, hardening: 3 }), 0);
});

test("Acid Burn lowers hardening by net + half rating (p.135)", () => {
  assert.deepEqual(acidBurnResult({ hits: 6, defense: 1, hardening: 3, rating: 5 }), { net: 2, reduction: 4, hardening: 0 });
  assert.deepEqual(acidBurnResult({ hits: 3, defense: 1, hardening: 3, rating: 5 }), { net: 0, reduction: 0, hardening: 3 });
  assert.equal(acidBurnResult({ hits: 6, defense: 0, hardening: 2, rating: 3 }).hardening, 0);
});

test("digital hits mark cohesion for entities, physical when hot-seated (pp.129, 133)", () => {
  assert.equal(digitalTrack({ entity: true, hotseat: true }), "stun");
  assert.equal(digitalTrack({ hotseat: true }), "physical");
  assert.equal(digitalTrack({}), "stun");
});

test("programs double defense dice against physical and magic attacks (p.205)", () => {
  assert.equal(entityDefenseDice(5, { entity: true }), 10);
  assert.equal(entityDefenseDice(5, { entity: true, digital: true }), 5);
  assert.equal(entityDefenseDice(5, {}), 5);
});

test("RNID shrinks influence 2 m per success, not below 0 (p.205)", () => {
  assert.deepEqual(shrinkInfluence(10, 3), { loss: 6, influence: 4 });
  assert.deepEqual(shrinkInfluence(4, 3), { loss: 4, influence: 0 });
});

test("sensor daemons add alert on top of the software alert (p.205)", () => {
  assert.equal(softwareAlert({ alert: 3 }, 2, 0, 2), 5);
  assert.equal(softwareAlert({ alert: 3 }, 2, 5, 2), 2);
});

test("resolveDigital: ICE sting, Electric Strike, De-rez, Acid Burn", () => {
  // BEE: attack 8 successes 4, damage 3, ignores 4 hardening vs a deck of hardening 4.
  const bee = resolveDigital({ kind: "weapon", base: 3, hits: 4, defense: 1, hardening: 4, ignore: 4 });
  assert.deepEqual([bee.hit, bee.raw, bee.reduction, bee.final], [true, 6, 0, 6]);
  const blocked = resolveDigital({ kind: "weapon", base: 3, hits: 2, defense: 1, hardening: 5 });
  assert.deepEqual([blocked.raw, blocked.final], [4, 0]);
  assert.equal(resolveDigital({ kind: "weapon", hits: 1, defense: 1 }).hit, false);
  assert.equal(resolveDigital({ kind: "strike", base: 4, hits: 3, soak: 2 }).final, 5);
  assert.equal(resolveDigital({ kind: "strike", base: 4, hits: 3, machine: true }).final, 14);
  assert.equal(resolveDigital({ kind: "derez", hits: 6, defense: 1, hardening: 3 }).dice, 2);
  assert.equal(resolveDigital({ kind: "acid", hits: 6, defense: 1, hardening: 3, rating: 4 }).hardening, 0);
});
