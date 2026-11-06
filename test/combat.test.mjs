import { test } from "node:test";
import assert from "node:assert/strict";
import { applyModifiers } from "../module/helpers/rules.mjs";
import {
  combatModifiers, recoilCapacity, recoilAfterShot, recoilJammed, firingAction,
  specializedRank, specMatches
} from "../module/helpers/combat.mjs";

Math.clamp ??= (n, lo, hi) => Math.min(Math.max(n, lo), hi);

test("Marcy and the squirt gun: dim light and high cover (p.30)", () => {
  const m = combatModifiers({ light: "dim", cover: "high", accuracy: 1 });
  assert.equal(m.bonus, 0);
  assert.equal(m.penalty, 3);
  // Firearms 5 + accuracy 1 − 3 = 3 dice.
  assert.equal(applyModifiers(5 + m.accuracy, m.bonus, m.penalty).limit, 3);
});

test("Ben's burst: range +1, dim light and high cover leave one bonus die (p.89)", () => {
  const m = combatModifiers({ light: "dim", cover: "high", range: 1, accuracy: 2 });
  const mod = applyModifiers(6 + m.accuracy, m.bonus + 3, m.penalty);
  assert.deepEqual([mod.limit, mod.bonus], [8, 1]);
});

test("Marcy with two SMGs in the dark: no accuracy, −9 then −10 (p.30)", () => {
  const first = combatModifiers({ light: "dark", cover: "total", dualWield: true, accuracy: 2 });
  assert.equal(first.accuracy, 0);
  assert.equal(first.penalty, 9);
  const second = combatModifiers({ light: "dark", cover: "total", dualWield: true, accuracy: 2, extraTargets: 1 });
  assert.equal(second.penalty, 10);
  // Full auto +20: 5 dice from the pool and 10 bonus dice on the second attack.
  const mod = applyModifiers(5 + second.accuracy, 20, second.penalty);
  assert.deepEqual([mod.limit, mod.bonus], [5, 10]);
});

test("aiming adds accuracy per simple action, at most twice (p.91)", () => {
  assert.equal(combatModifiers({ aim: 1, accuracy: 3 }).bonus, 3);
  assert.equal(combatModifiers({ aim: 5, accuracy: 3 }).bonus, 6);
  assert.equal(combatModifiers({ aim: 2, accuracy: 3, dualWield: true }).bonus, 0);
});

test("point blank, prone target and labelled parts (p.90)", () => {
  const m = combatModifiers({ pointBlank: true, prone: true, light: "bright" });
  assert.equal(m.bonus, 6);
  assert.equal(m.penalty, 2);
  assert.deepEqual(m.parts.map(p => p.key), ["light", "pointBlank", "prone"]);
});

test("recoil capacity grows at Strength 12 and 24 and with mods (pp.27, 91)", () => {
  assert.equal(recoilCapacity({ strength: 8 }), 1);
  assert.equal(recoilCapacity({ strength: 12 }), 2);
  assert.equal(recoilCapacity({ strength: 24, bonus: 2, weapon: 1 }), 6);
});

test("recoil tokens: two simple shots give one, full auto gives two (p.91)", () => {
  let s = { tokens: 0, primed: false };
  s = recoilAfterShot(s, firingAction("burst"));
  assert.deepEqual(s, { tokens: 0, primed: true, gained: 0 });
  s = recoilAfterShot(s, firingAction("single"));
  assert.deepEqual(s, { tokens: 1, primed: false, gained: 1 });
  s = recoilAfterShot(s, firingAction("fullAuto"));
  assert.equal(s.tokens, 3);
  assert.ok(recoilJammed(1, 1));
  assert.ok(!recoilJammed(1, 2));
});

test("specialization: +1 when it applies, −1 otherwise (p.41)", () => {
  assert.equal(specializedRank(4, "Pistols", true), 5);
  assert.equal(specializedRank(4, "Pistols", false), 3);
  assert.equal(specializedRank(4, "", false), 4);
  assert.equal(specializedRank(0, "Pistols", true), 0);
  assert.ok(specMatches("Pistols", "Heavy Pistol"));
  assert.ok(specMatches("ピストル", "ヘビー・ピストル"));
  assert.ok(!specMatches("Rifles", "Heavy Pistol"));
  assert.ok(!specMatches("", "Heavy Pistol"));
});
