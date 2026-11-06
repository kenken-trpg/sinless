import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Exercise document workflows with the Foundry services replaced at their boundaries.
globalThis.Actor = class {};
let dialogResult = 3;
let dialogCalls = 0;
globalThis.foundry = {
  applications: { api: {
    ApplicationV2: class {}, HandlebarsApplicationMixin: Base => Base,
    DialogV2: { wait: async () => { dialogCalls++; return dialogResult; } }
  } },
  utils: { deepClone: structuredClone, escapeHTML: text => String(text).replaceAll("<", "&lt;").replaceAll(">", "&gt;") }
};
const { applySustained, placeSpirit } = await import("../module/apps/spell-effects.mjs");
const { SinlessActor } = await import("../module/documents/actor.mjs");
let target;
let effects;
let sourceUpdates;
let message;
beforeEach(() => {
  effects = [];
  sourceUpdates = 0;
  dialogCalls = 0;
  dialogResult = 3;
  globalThis.game = {
    user: { isGM: false }, messages: [],
    i18n: { localize: key => key, format: key => key }
  };
  globalThis.ui = { notifications: { warn() {} } };
  globalThis.ChatMessage = {
    getSpeaker: () => ({}),
    create: async data => { const m = { ...data, getFlag: (scope, key) => data.flags?.[scope]?.[key] }; game.messages.push(m); return m; }
  };
  target = { name: "Defender", uuid: "Actor.target", isOwner: true,
    createEmbeddedDocuments: async (type, data) => { effects.push(...data); return data; }
  };
  globalThis.fromUuidSync = uuid => uuid === target.uuid ? target : null;
  const state = { final: [6, 6, 6, 6], kismetAdded: [], target: 5,
    extra: { spell: { continuous: true, label: "Hold", duration: "<b>1 round</b>", resistPool: "resolve", targets: [{ uuid: target.uuid }] } }
  };
  message = { uuid: "ChatMessage.cast", isOwner: false,
    getFlag: (scope, key) => key === "test" ? state : null,
    update: async () => { sourceUpdates++; throw Error("Cannot update another user's message"); }
  };
});

test("a defender applies another user's spell without updating the casting card", async () => {
  await applySustained(message, target.uuid);
  assert.equal(sourceUpdates, 0);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].flags.sinless.sustained.needed, 3);
  assert.ok(!effects[0].description.includes("<b>"));
  await applySustained(message, target.uuid);
  assert.equal(effects.length, 1);
  assert.equal(dialogCalls, 1);
});

test("a fully resisted spell also records resolution to prevent repeated application", async () => {
  dialogResult = 0;
  await applySustained(message, target.uuid);
  assert.equal(effects.length, 0);
  await applySustained(message, target.uuid);
  assert.equal(dialogCalls, 1);
});

test("cancelled resistance does not consume the spell application", async () => {
  dialogResult = "cancel";
  await applySustained(message, target.uuid);
  assert.equal(effects.length, 0);
  assert.equal(game.messages.length, 0);
  dialogResult = 3;
  await applySustained(message, target.uuid);
  assert.equal(effects.length, 1);
});

test("unowned targets, untargeted actors and failed casts cannot receive the spell", async () => {
  target.isOwner = false;
  await applySustained(message, target.uuid);
  target.isOwner = true;
  await applySustained(message, "Actor.other");
  message.getFlag("sinless", "test").abf = true;
  await applySustained(message, target.uuid);
  assert.equal(dialogCalls, 0);
  assert.equal(effects.length, 0);
});

test("spirit placement rejects non-GMs and automatic bad failures before scene changes", async () => {
  const state = message.getFlag("sinless", "test");
  state.extra.summon = { spiritActor: "Actor.spirit", force: 3 };
  await placeSpirit(message);
  game.user.isGM = true;
  state.abf = true;
  await placeSpirit(message);
  assert.equal(sourceUpdates, 0);
});

function fixedNpc() {
  const actor = new SinlessActor();
  actor.system = { fixedDefense: () => 4, leyLine: { kind: "void", force: 3 }, spiritForce: 2 };
  actor._testDefaults = data => ({ ...data, notes: data.notes ?? [], bonus: data.bonus ?? 0, penalty: 0 });
  actor._runTest = async defaults => defaults;
  return actor;
}

test("fixed-dice NPC resistance receives the void-line bonus", async () => {
  const actor = fixedNpc();
  const result = await actor.rollResistance("resolve");
  assert.equal(result.rank, 7);
  assert.ok(result.notes.includes("SINLESS.LeyLine.note.voidResist"));
});

test("spirit defense dice and explanation apply only to physical attacks", async () => {
  const actor = fixedNpc();
  const physical = await actor.rollDefense("dodge", { attack: "physical" });
  const magic = await actor.rollDefense("dodge", { attack: "magic" });
  assert.equal(physical.rank, 6);
  assert.ok(physical.notes.includes("SINLESS.Spirit.defenseNote"));
  assert.equal(magic.rank, 4);
  assert.ok(!magic.notes.includes("SINLESS.Spirit.defenseNote"));
});

test("disabled effects are omitted from turn prompts and cannot be resisted", async () => {
  const actor = fixedNpc();
  const effect = { parent: actor, disabled: true, getFlag: () => ({ needed: 3 }) };
  actor.effects = [effect];
  assert.deepEqual(actor.sustainedSpells, []);
  assert.equal(await actor.resistSustainedSpell(effect), null);
});
