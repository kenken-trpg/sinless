import { test } from "node:test";
import assert from "node:assert/strict";
import {
  influencePenalty, nanHackResult, softwareAlert, splitDeckingDice, deckStatus, INTRUSION_PENALTY
} from "../module/helpers/grid.mjs";

test("intrusion difficulty penalties (p.129)", () => {
  assert.deepEqual(INTRUSION_PENALTY, { open: 0, secure: 1, red: 2, black: 4 });
});

test("extending influence beyond 40 m gets harder every 20 m (p.134)", () => {
  assert.equal(influencePenalty(0), 0);
  assert.equal(influencePenalty(39), 0);
  assert.equal(influencePenalty(40), 2);
  assert.equal(influencePenalty(59), 2);
  assert.equal(influencePenalty(60), 4);
  assert.equal(influencePenalty(80), 6);
});

test("Mars Claymore brute force: I/O 3 → 6 m + 2 m per success (p.134)", () => {
  assert.deepEqual(nanHackResult("brute", 3, 3), { gain: 12, alert: 6 });
  assert.deepEqual(nanHackResult("brute", 0, 3), { gain: 0, alert: 0 });
  assert.deepEqual(nanHackResult("stealth", 4, 3), { gain: 4, alert: 1 });
});

test("software alert with Shadow Protocols in the I/O (p.136)", () => {
  assert.equal(softwareAlert({ alert: 15 }, 3), 15);
  assert.equal(softwareAlert({ alertPerSuccess: 2 }, 3), 6);
  assert.equal(softwareAlert({ alert: 3 }, 0, 2), 1);
  assert.equal(softwareAlert({ alert: 1 }, 0, 4), 0);
});

test("MCP dice are spent before Focus dice (p.130)", () => {
  assert.deepEqual(splitDeckingDice(8, 5), { mcp: 5, focus: 3 });
  assert.deepEqual(splitDeckingDice(3, 5), { mcp: 3, focus: 0 });
  assert.deepEqual(splitDeckingDice(4, 0), { mcp: 0, focus: 4 });
});

test("deck loadout: threads, I/O and the base hacking program (pp.130-133)", () => {
  const deck = { mcp: 7, threads: 2, io: 1 };
  const sw = [
    { base: true, rating: 3, loaded: true, running: false },
    { rating: 2, loaded: true, running: true },
    { rating: 2, loaded: true, running: true },
    { rating: 1, loaded: true, running: false }
  ];
  const r = deckStatus(deck, sw);
  assert.equal(r.loaded, 3);
  assert.equal(r.running, 2);
  assert.deepEqual(r.issues.map(i => i.code), ["threads", "io", "baseRating"]);
  assert.equal(r.issues[2].data.min, 4);
  assert.deepEqual(deckStatus(deck, []).issues.map(i => i.code), ["noBase"]);
});
