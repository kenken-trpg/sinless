import { test } from "node:test";
import assert from "node:assert/strict";
import { payLifestyle, buyLifestyle } from "../module/helpers/lifestyle.mjs";

test("a pre-purchased month is used first (p.46)", () => {
  assert.deepEqual(payLifestyle({ lifestyle: "middle", months: 3, zuzu: 100 }), { mode: "prepaid", cost: 0, months: 2, zuzu: 100 });
});

test("otherwise the monthly cost is paid in zuzus", () => {
  assert.deepEqual(payLifestyle({ lifestyle: "middle", months: 0, zuzu: 1000 }), { mode: "cash", cost: 800, months: 0, zuzu: 200 });
});

test("squatting is free; too little money leaves it unpaid", () => {
  assert.equal(payLifestyle({ lifestyle: "squatter" }).mode, "free");
  assert.deepEqual(payLifestyle({ lifestyle: "wealthy", zuzu: 4999 }), { mode: "unpaid", cost: 5000, months: 0, zuzu: 4999 });
});

test("buying months up front", () => {
  assert.deepEqual(buyLifestyle({ lifestyle: "low", months: 1, zuzu: 1000 }, 3), { ok: true, cost: 900, months: 4, zuzu: 100 });
  assert.equal(buyLifestyle({ lifestyle: "high", zuzu: 1000 }, 1).ok, false);
});
