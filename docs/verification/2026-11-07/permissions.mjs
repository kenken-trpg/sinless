// A player acting on documents someone else owns: hot-seat feedback, ramming and brand members.
// Each case must finish without a permission error and leave what the player cannot change to the GM.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { joinGM, FOUNDRY_URL } from "../lib.mjs";
const outDir = process.env.SINLESS_VERIFY_OUT ?? "/private/tmp/sinless-verification";
const { browser, page } = await joinGM();
page.setDefaultTimeout(20000);
let f, ctx;
const out = {};
try {
  f = await page.evaluate(async () => {
    const u = await User.create({ name: "VERIFY Perm Player " + Date.now(), role: 1 });
    const attrs = Object.fromEntries(["str", "bod", "rea", "int", "wil", "cha"].map(k => [k, { value: 8 }]));
    const ch = (name, ownership) => Actor.create({ name, type: "character", ownership, system: { creation: { active: false }, attributes: attrs, skills: { drive: { rank: 3 } } } });
    // A: rigger owned by the GM only, vehicle owned by the player (player applies damage to the vehicle).
    const rigGM = await ch("VERIFY Rigger GM", { default: 0 });
    await rigGM.createEmbeddedDocuments("Item", [{ name: "VERIFY VCR", type: "vcr", system: { equipped: true, nerveRig: true, bonusDice: 2 } }]);
    const vehP = await Actor.create({ name: "VERIFY Van P", type: "vehicle", ownership: { default: 0, [u.id]: 3 }, system: { controller: rigGM.id, controlMode: "hotseat", skill: "drive", body: 8 } });
    // B: rigger owned by the player, vehicle owned by the GM with player observer (player rams).
    const rigP = await ch("VERIFY Rigger P", { default: 0, [u.id]: 3 });
    await rigP.createEmbeddedDocuments("Item", [{ name: "VERIFY VCR", type: "vcr", system: { equipped: true, nerveRig: true, bonusDice: 2 } }]);
    const vehGM = await Actor.create({ name: "VERIFY Van GM", type: "vehicle", ownership: { default: 0, [u.id]: 2 }, system: { controller: rigP.id, controlMode: "vcr", skill: "drive", body: 8, inertia: 3 } });
    // C: brand owned by the player, character owned by the GM only.
    const brand = await Actor.create({ name: "VERIFY Brand P", type: "brand", ownership: { default: 0, [u.id]: 3 } });
    const member = await ch("VERIFY Member GM", { default: 0, [u.id]: 2 });
    return { userId: u.id, ids: [rigGM.id, vehP.id, rigP.id, vehGM.id, brand.id, member.id], rigGM: rigGM.id, vehP: vehP.id, rigP: rigP.id, vehGM: vehGM.id, brand: brand.id, member: member.id, messages: game.messages.contents.map(m => m.id) };
  });
  ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", e => errors.push("pageerror: " + e.message));
  p.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  await p.goto(FOUNDRY_URL + "/join");
  await p.selectOption("select[name=userid]", f.userId);
  await p.click("button[name=join]");
  await p.waitForFunction(() => window.game?.ready, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  const notes = () => p.evaluate(() => [...document.querySelectorAll("#notifications li, .notification")].map(n => n.textContent.trim()).slice(-3));

  // A: hot-seat feedback.
  errors.length = 0;
  out.feedback = await p.evaluate(async f => {
    const v = game.actors.get(f.vehP);
    let threw = null;
    try {
      await v.applyDamage({ hit: true, raw: 4, armorReduction: 0, afterArmor: 4, final: 4, track: "physical", stripped: [], source: "VERIFY" });
    } catch (e) { threw = e.message; }
    const last = game.messages.contents.at(-1);
    return { threw, controlMode: v.controlMode, vehiclePhysical: v.system.condition.physical.value, riggerStun: game.actors.get(f.rigGM).system.condition.stun.value, card: last?.content?.includes("sinless-damage-card") ? last.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(-160) : null };
  }, f);
  await p.waitForTimeout(500);
  out.feedback.errors = [...errors];
  out.feedback.notes = await notes();

  // B: ramming from a vehicle the player only observes.
  errors.length = 0;
  await p.evaluate(id => { game.actors.get(id).rollVehicleTest("ram"); }, f.vehGM);
  await p.waitForSelector(".sinless-test-dialog");
  await p.click(".sinless-test-dialog button[data-action=roll]", { noWaitAfter: true });
  await p.waitForFunction(() => game.messages.contents.at(-1)?.flags?.sinless?.test?.extra?.ram, null, { timeout: 20000 });
  await p.waitForTimeout(1000);
  out.ram = await p.evaluate(id => ({ inertia: game.actors.get(id).system.inertia, cardId: game.messages.contents.at(-1).id }), f.vehGM);
  out.ram.errors = [...errors];
  out.ram.notes = await notes();
  // Give the card a known target body so the self-damage button appears, then see who gets it.
  await p.evaluate(async id => {
    const m = game.messages.get(id);
    const state = foundry.utils.deepClone(m.flags.sinless.test);
    state.final = [6, 6, 1, 1]; state.kismetAdded = []; state.abf = false;
    state.extra.ram.targetBody = 12;
    const { renderCard } = await import("/systems/sinless/module/dice/test-roll.mjs");
    await m.update({ content: await renderCard(state), "flags.sinless.test": state });
  }, out.ram.cardId);
  await p.waitForTimeout(1000);
  const button = id => `#chat-log [data-message-id="${id}"] [data-sinless-action='apply-ram-self'], .chat-log [data-message-id="${id}"] [data-sinless-action='apply-ram-self']`;
  out.ram.playerButton = await p.locator(button(out.ram.cardId)).count();
  out.ram.gmButton = await page.locator(button(out.ram.cardId)).count();

  // C: brand member the player does not own.
  errors.length = 0;
  out.brand = await p.evaluate(async f => {
    let threw = null;
    try { await game.actors.get(f.brand).addBrandMember(game.actors.get(f.member)); } catch (e) { threw = e.message; }
    return { threw, members: game.actors.get(f.brand).system.members.includes(f.member), memberBrand: game.actors.get(f.member).system.brand };
  }, f);
  await p.waitForTimeout(500);
  out.brand.errors = [...errors];
  console.log(JSON.stringify(out, null, 1));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/permissions.json`, JSON.stringify(out, null, 1));

  // Vehicle owned by the player, rigger owned by the GM: the vehicle is damaged and the card notes the feedback.
  assert.equal(out.feedback.threw, null);
  assert.deepEqual(out.feedback.errors, []);
  assert.equal(out.feedback.controlMode, "hotseat");
  assert.equal(out.feedback.vehiclePhysical, 4);
  assert.equal(out.feedback.riggerStun, 0);
  assert.ok(out.feedback.card, "damage card created");
  // Rigger owned by the player, vehicle only observed: the ram rolls, inertia is left to the GM, and so is the self damage.
  assert.deepEqual(out.ram.errors, []);
  assert.equal(out.ram.inertia, 3);
  assert.equal(out.ram.playerButton, 0);
  assert.ok(out.ram.gmButton > 0, "GM sees the ram self-damage button");
  // Brand owned by the player, member owned by the GM: membership is recorded, the member is left unchanged.
  assert.equal(out.brand.threw, null);
  assert.deepEqual(out.brand.errors, []);
  assert.equal(out.brand.members, true);
  assert.equal(out.brand.memberBrand, "");
  console.log("PASS permissions");
} finally {
  if (f) await page.evaluate(async f => {
    const msgs = game.messages.contents.filter(m => !f.messages.includes(m.id)).map(m => m.id);
    if (msgs.length) await ChatMessage.deleteDocuments(msgs);
    await Actor.deleteDocuments(f.ids.filter(id => game.actors.get(id)));
    await game.users.get(f.userId)?.delete();
  }, f).catch(e => console.error("cleanup", e.message));
  await ctx?.close();
  await browser.close();
}
