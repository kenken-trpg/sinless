import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leyLineDice, voidResistBonus, wardedSuccesses, shatterWardResult, isContinuous,
  sustainedNeeded, resistSustained, spiritDefenseBonus
} from "../module/helpers/magic.mjs";

test("ley lines: double force on the line, force adjacent, void penalizes (p.167)", () => {
  assert.deepEqual(leyLineDice("on", 3), { bonus: 6, penalty: 0 });
  assert.deepEqual(leyLineDice("adjacent", 3), { bonus: 3, penalty: 0 });
  assert.deepEqual(leyLineDice("void", 2), { bonus: 0, penalty: 2 });
  assert.deepEqual(leyLineDice("none", 5), { bonus: 0, penalty: 0 });
  assert.equal(voidResistBonus("void", 2), 2);
  assert.equal(voidResistBonus("on", 2), 0);
});

test("wards remove one success per point of force; Shatter Ward (pp.168, 170)", () => {
  assert.equal(wardedSuccesses(5, 3), 2);
  assert.equal(wardedSuccesses(2, 3), 0);
  assert.deepEqual(shatterWardResult({ force: 3, successes: 2, ward: 5 }), { destroyed: true, ward: 0 });
  assert.deepEqual(shatterWardResult({ force: 2, successes: 1, ward: 5 }), { destroyed: false, ward: 4 });
});

test("continuous spells are resisted by accumulating successes (p.167)", () => {
  assert.ok(isContinuous("1 round per point of force"));
  assert.ok(!isContinuous("Instantaneous"));
  assert.ok(!isContinuous(""));
  assert.equal(sustainedNeeded(5, 2), 3);
  assert.equal(sustainedNeeded(2, 3), 0);
  assert.deepEqual(resistSustained({ needed: 3, accumulated: 1 }, 1), { accumulated: 2, ended: false });
  assert.deepEqual(resistSustained({ needed: 3, accumulated: 2 }, 2), { accumulated: 4, ended: true });
});

test("spirits add force to defense dice against physical attacks (p.199)", () => {
  assert.equal(spiritDefenseBonus(4, "physical"), 4);
  assert.equal(spiritDefenseBonus(4, "magic"), 0);
});
