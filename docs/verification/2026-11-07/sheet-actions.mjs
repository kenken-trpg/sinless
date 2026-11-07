// Every kind of button on the actor sheets: rolls open the test dialog, track boxes and
// refresh buttons change the actor, item rows open, toggle and delete items, and confirmations
// ask first. Dialogs are closed without rolling, so no chat message is created.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { joinGM } from "../lib.mjs";
const outDir = process.env.SINLESS_VERIFY_OUT ?? "/private/tmp/sinless-verification";
const { browser, page, logs } = await joinGM();
page.setDefaultTimeout(20000);
const out = {};
let f;

/** Click `selector` on a document's sheet (on `tab`), then report new windows and messages. */
const click = (uuid, selector, tab = null) => page.evaluate(async ({ uuid, selector, tab }) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const sheet = (await fromUuid(uuid)).sheet;
  if (!sheet.rendered) {
    await sheet.render(true);
    for (let i = 0; i < 40 && !sheet.rendered; i++) await sleep(50);
  }
  if (tab) sheet.changeTab(tab, "primary");
  await sleep(100);
  const el = sheet.element.querySelector(selector);
  if (!el) return { missing: selector };
  const before = new Set(foundry.applications.instances.keys());
  const messages = game.messages.size;
  el.click();
  await sleep(500);
  const opened = [...foundry.applications.instances.values()].filter(a => !before.has(a.id) && a.rendered);
  const result = {
    opened: opened.map(a => [...a.element.classList].find(c => /^sinless-.*dialog$/.test(c)) ?? (a.document ? `sheet:${a.document.type}` : "dialog")),
    messages: game.messages.size - messages
  };
  for (const a of opened) await a.close();
  await sleep(100);
  return result;
}, { uuid, selector, tab });
const get = (uuid, path) => page.evaluate(({ uuid, path }) => fromUuid(uuid).then(d => foundry.utils.getProperty(d, path)), { uuid, path });
const set = (uuid, data) => page.evaluate(({ uuid, data }) => fromUuid(uuid).then(d => d.update(data)), { uuid, data });
const pass = (name, data) => { out[name] = data; console.log("PASS", name, JSON.stringify(data)); };
const opens = async (name, uuid, selector, kind, tab) => {
  const r = await click(uuid, selector, tab);
  assert.deepEqual(r, { opened: [kind], messages: 0 }, name);
  pass(name, r);
};

try {
  f = await page.evaluate(async () => {
    const ch = await Actor.create({ name: "VERIFY SA Char", type: "character" });
    const items = await ch.createEmbeddedDocuments("Item", [
      { name: "VERIFY SA Gun", type: "weapon", system: { category: "firearm", skill: "firearms", damage: "4" } },
      { name: "VERIFY SA Spirit", type: "power", system: { category: "spirit", force: 3 } },
      { name: "VERIFY SA Deck", type: "deck", system: { mcp: 6, equipped: true } },
      { name: "VERIFY SA Gear", type: "gear" }
    ]);
    const vehicle = await Actor.create({ name: "VERIFY SA Van", type: "vehicle" });
    await vehicle.setVehicleController(ch);
    const brand = await Actor.create({ name: "VERIFY SA Brand", type: "brand" });
    const [resource] = await brand.createEmbeddedDocuments("Item", [{ name: "VERIFY SA Safehouse", type: "resource", system: { boxes: 3 } }]);
    const id = name => items.find(i => i.name === name).id;
    return {
      ch: ch.uuid, vehicle: vehicle.uuid, brand: brand.uuid, resource: resource.uuid,
      gun: id("VERIFY SA Gun"), spirit: id("VERIFY SA Spirit"), deck: items.find(i => i.type === "deck").uuid, gear: id("VERIFY SA Gear"),
      actorIds: [ch.id, vehicle.id, brand.id], messages: game.messages.size
    };
  });
  const row = id => `[data-item-id="${id}"]`;

  // Rolls through actor methods (actorCall) and the item row.
  await opens("skill", f.ch, "[data-action=rollSkill][data-skill=firearms]", "sinless-test-dialog");
  await opens("defense", f.ch, "[data-action=rollDefense]", "sinless-test-dialog");
  await opens("pool", f.ch, "[data-action=rollPool]", "sinless-test-dialog");
  await opens("etiquette", f.ch, "[data-action=rollEtiquette]", "sinless-test-dialog", "social");
  await opens("weapon row", f.ch, `${row(f.gun)} [data-action=rollItem]`, "sinless-test-dialog", "gear");
  await opens("invoke spirit", f.ch, `${row(f.spirit)} [data-action=invokeSpirit]`, "sinless-damage-dialog", "magic");
  await opens("vehicle test", f.vehicle, "[data-action=rollVehicleTest][data-kind=maneuver]", "sinless-test-dialog");
  await opens("vehicle soak", f.vehicle, "[data-action=rollDefense][data-defense=soak]", "sinless-test-dialog");
  await opens("brand stat", f.brand, "[data-action=rollBrandStat]", "sinless-test-dialog");
  await opens("brand action", f.brand, "[data-action=rollBrandAction]", "sinless-test-dialog");

  // Refresh and stabilize.
  await set(f.ch, { "system.pools.brawn.spent": 2, "system.kismet.spent": 1, "system.combat.recoil": 2 });
  await click(f.ch, "[data-action=refreshPools]");
  await click(f.ch, "[data-action=refreshKismet]");
  await click(f.ch, "[data-action=stabilize]");
  const refreshed = { pool: await get(f.ch, "system.pools.brawn.spent"), kismet: await get(f.ch, "system.kismet.spent"), recoil: await get(f.ch, "system.combat.recoil") };
  assert.deepEqual(refreshed, { pool: 0, kismet: 0, recoil: 0 });
  pass("refresh pools, kismet, stabilize", refreshed);

  // Track boxes: click fills up to the box, clicking the last filled box clears it.
  await click(f.ch, "[data-action=setCondition][data-track=physical][data-n='3']");
  const filled = await get(f.ch, "system.condition.physical.value");
  await click(f.ch, "[data-action=setCondition][data-track=physical][data-n='3']");
  const cleared = await get(f.ch, "system.condition.physical.value");
  await click(f.ch, "[data-action=setCohesion][data-n='2']", "grid");
  const cohesion = await get(f.deck, "system.cohesion");
  assert.deepEqual({ filled, cleared, cohesion }, { filled: 3, cleared: 2, cohesion: 2 });
  pass("condition and cohesion boxes", { filled, cleared, cohesion });

  // Item rows: edit opens the item sheet, toggle flips the field, delete asks first.
  await opens("item edit", f.ch, `${row(f.gun)} [data-action=itemEdit]`, "sheet:weapon", "gear");
  await opens("gear row opens its sheet", f.ch, `${row(f.gear)} [data-action=rollItem]`, "sheet:gear", "gear");
  const gearUuid = `${f.ch}.Item.${f.gear}`;
  const toggle = await page.evaluate(({ uuid, id }) => fromUuid(uuid).then(a => a.sheet.element.querySelector(`[data-item-id="${id}"] [data-action=itemToggle]`)?.dataset.field), { uuid: f.ch, id: f.gear });
  const before = await get(gearUuid, `system.${toggle}`);
  await click(f.ch, `${row(f.gear)} [data-action=itemToggle]`, "gear");
  assert.equal(await get(gearUuid, `system.${toggle}`), !before);
  pass("item toggle", { field: toggle, from: before });
  await opens("item delete asks", f.ch, `${row(f.gear)} [data-action=itemDelete]`, "dialog", "gear");
  assert.equal(await page.evaluate(uuid => !!fromUuidSync(uuid), gearUuid), true, "closing the dialog keeps the item");

  // Confirmations: closing them changes nothing.
  await opens("pay lifestyle asks", f.ch, "[data-action=payLifestyle]", "dialog");
  await opens("end sector turn asks", f.brand, "[data-action=endSectorTurn]", "dialog");

  // Brand resource +/- and toggle.
  const resRow = `[data-item-id="${f.resource.split(".").pop()}"]`;
  await click(f.brand, `${resRow} [data-action=adjustItem][data-field=damage][data-delta='1']`, "resources");
  const damage = await get(f.resource, "system.damage");
  const wasControlled = await get(f.resource, "system.controlled");
  await click(f.brand, `${resRow} [data-action=itemToggle][data-field=controlled]`, "resources");
  const controlled = await get(f.resource, "system.controlled");
  assert.deepEqual({ damage, controlled }, { damage: 1, controlled: !wasControlled });
  pass("brand resource", { damage, controlled });

  const messages = await page.evaluate(() => game.messages.size);
  assert.equal(messages, f.messages, "no chat message");
  const errors = logs.filter(l => l.startsWith("pageerror") || /sinless/i.test(l) && l.startsWith("error"));
  assert.deepEqual(errors, []);
  pass("no messages or page errors", { messages: messages - f.messages, errors: errors.length });
} finally {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/sheet-actions.json`, JSON.stringify(out, null, 1));
  if (f) await page.evaluate(async f => {
    for (const app of [...foundry.applications.instances.values()]) if (app.document?.name?.startsWith("VERIFY SA") || app.document?.parent?.name?.startsWith("VERIFY SA")) await app.close();
    for (const id of f.actorIds) await game.actors.get(id)?.delete();
  }, f).catch(e => console.error("cleanup", e.message));
  await browser.close();
}
