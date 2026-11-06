import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shadowAlert, heatAfterAlert, heatWhenDiscovered, crossedResponses, activeResponses,
  sectorHeatGain, sectorHeatNeedsRoll, cacheValue, CAMERA_FALLOUT
} from "../module/helpers/operation.mjs";

test("shadow tests raise alert by 2, 1 or 0 (p.236)", () => {
  assert.equal(shadowAlert(0), 2);
  assert.equal(shadowAlert(1), 1);
  assert.equal(shadowAlert(4), 0);
});

test("alert over 50 sets two stars; discovery sets one (p.236)", () => {
  assert.equal(heatAfterAlert(50, 0), 0);
  assert.equal(heatAfterAlert(51, 0), 2);
  assert.equal(heatAfterAlert(60, 3), 3);
  assert.equal(heatWhenDiscovered(0), 1);
  assert.equal(heatWhenDiscovered(2), 2);
});

test("alert responses trigger when their threshold is crossed", () => {
  const responses = [{ label: "Patrol", threshold: 10 }, { label: "Drones", threshold: 25 }, { label: "Lockdown", threshold: 40 }];
  assert.deepEqual(crossedResponses(responses, 8, 26).map(r => r.label), ["Patrol", "Drones"]);
  assert.deepEqual(crossedResponses(responses, 26, 20), []);
  assert.deepEqual(activeResponses(responses, 25).map(r => r.label), ["Patrol", "Drones"]);
});

test("sector heat at the end of the operation (p.81)", () => {
  assert.equal(sectorHeatGain(1), 0);
  assert.ok(sectorHeatNeedsRoll(2));
  assert.equal(sectorHeatGain(2, 3), 0);
  assert.equal(sectorHeatGain(2, 4), 1);
  assert.equal(sectorHeatGain(3), 1);
  assert.equal(sectorHeatGain(4), 2);
});

test("paydata and relic caches (p.236)", () => {
  assert.deepEqual(cacheValue("veteran", 3, 10), { relic: false, value: 10000 });
  assert.deepEqual(cacheValue("professional", 6, 12), { relic: true, value: 1200000 });
  assert.equal(CAMERA_FALLOUT[3].ghost, "2d6");
});
