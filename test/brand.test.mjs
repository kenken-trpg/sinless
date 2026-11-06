import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sectorActionCount, traitSlots, resourceBoxes, resourceFunctions, resourceMarket,
  brandStats, brandFinances, autoSuccesses, sectorHeatPenalty
} from "../module/helpers/brand.mjs";

test("sector actions by market cap (p.222)", () => {
  assert.equal(sectorActionCount(0), 3);
  assert.equal(sectorActionCount(9), 3);
  assert.equal(sectorActionCount(10), 4);
  assert.equal(sectorActionCount(100), 5);
  assert.equal(sectorActionCount(1000), 6);
  assert.equal(sectorActionCount(100000), 8);
});

test("trait slots (pp.47, 223)", () => {
  assert.equal(traitSlots(0), 2);
  assert.equal(traitSlots(10), 3);
  assert.equal(traitSlots(100), 4);
});

test("resource classes (p.224)", () => {
  assert.deepEqual(["A", "B", "C", "D", "E"].map(resourceBoxes), [36, 18, 9, 3, 1]);
});

test("damaged or uncontrolled resources do not function (p.219)", () => {
  assert.equal(resourceFunctions({ controlled: true, damage: 0 }), true);
  assert.equal(resourceFunctions({ controlled: true, damage: 1 }), false);
  assert.equal(resourceFunctions({ controlled: false, damage: 0 }), false);
});

test("brand stats: base + traits + resources", () => {
  const base = { muscle: 2, magic: 1, media: 1, espionage: 1, grid: 1 };
  const s = brandStats(base, ["dangerous", "analytical"], [{ muscle: 2 }]);
  assert.deepEqual(s, { muscle: 6, magic: 1, media: 1, espionage: 2, grid: 2 });
});

test("Black Adder Consortium example (pp.221-222)", () => {
  // Class D store: MC 2 / upkeep 1, +1 from the condos' bonus. Condos: MC 5 / upkeep 3.
  const resources = [
    { market: 2, marketBonus: 1, upkeep: 1, tags: ["service", "business"], controlled: true, damage: 0 },
    { market: 5, upkeep: 3, tags: ["housing"], controlled: true, damage: 0 }
  ];
  const f = brandFinances({ resources, heat: 1 });
  assert.equal(f.marketCap, 8);
  assert.equal(f.upkeep, 4);
  assert.equal(f.net, 4);
});

test("sector heat modifies resource market cap (p.220)", () => {
  const vice = { market: 20, tags: ["vice"] };
  const biz = { market: 5, tags: ["business"] };
  assert.equal(resourceMarket(vice, { heat: 0 }), 19);
  assert.equal(resourceMarket(biz, { heat: 0 }), 7);
  assert.equal(resourceMarket(vice, { heat: 1 }), 20);
  assert.equal(resourceMarket(vice, { heat: 2 }), 22);
  assert.equal(resourceMarket({ market: 3, tags: ["vice"] }, { heat: 2 }), 4);
  assert.equal(resourceMarket(vice, { heat: 3 }), 19);
  assert.equal(resourceMarket(biz, { heat: 4 }), 0);
  assert.equal(resourceMarket(vice, { heat: 4 }), 20);
});

test("trait market bonuses (p.223)", () => {
  assert.equal(resourceMarket({ market: 4, tags: ["housing"] }, { heat: 1, traits: ["luxury"] }), 5);
  assert.equal(resourceMarket({ market: 4, tags: ["production"] }, { heat: 1, traits: ["sophistication"] }), 6);
});

test("asset upkeep, free assets, Mercenary and Sincerity", () => {
  const assets = [{ upkeep: 3, free: false }, { upkeep: 2, free: false }, { upkeep: 5, free: true }];
  assert.equal(brandFinances({ assets }).assetUpkeep, 5);
  assert.equal(brandFinances({ assets, traits: ["mercenary"] }).assetUpkeep, 3);
  const res = [{ market: 10, upkeep: 4, controlled: true, damage: 0 }];
  assert.equal(brandFinances({ resources: res, assets, traits: ["sincerity"], heat: 1 }).upkeep, 7);
  assert.equal(brandFinances({ assets }).assetCapacityExceeded, true);
});

test("damaged resources still cost upkeep but give no market cap", () => {
  const f = brandFinances({ resources: [{ market: 5, upkeep: 2, controlled: true, damage: 1 }], heat: 1 });
  assert.equal(f.marketCap, 0);
  assert.equal(f.upkeep, 2);
});

test("Competence and heat penalties", () => {
  assert.equal(autoSuccesses(["competence", "arcane"]), 1);
  assert.equal(sectorHeatPenalty(2, "media"), 1);
  assert.equal(sectorHeatPenalty(2, "muscle"), 0);
  assert.equal(sectorHeatPenalty(1, "media"), 0);
});
