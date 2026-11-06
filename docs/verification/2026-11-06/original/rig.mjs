import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM();
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const setup = await page.evaluate(async () => {
  const ben = game.actors.getName("SMOKE D Ben");
  for (const a of game.actors.filter(a => a.name.startsWith("SMOKE V"))) await a.delete();
  for (const i of ben.items.filter(i => i.type === "vcr")) await i.delete();
  await ben.update({ "system.skills.drive.rank": 4, "system.skills.fly.rank": 3, "system.skills.gunnery.rank": 3,
    "system.condition.stun.value": 0, "system.condition.physical.value": 0, "system.rig.vcrSpent": 0, "system.pools.focus.spent": 0, "system.pools.finesse.spent": 0 });
  await ben.createEmbeddedDocuments("Item", [{ name: "Advanced VCR", type: "vcr", system: { bonusDice: 4, hardeningBonus: 1, links: 2, core: 2, mods: 2, zoeticCost: 0.5 } }]);
  const van = await Actor.create({ name: "SMOKE V Van", type: "vehicle", system: { kind: "vehicle", frame: "none", mobility: "ground", body: 12, handling: 2, movement: 20, inertia: 2, armorBonus: { ballistic: 4 } } });
  await van.setVehicleController(ben);
  await van.update({ "system.controlMode": "hotseat" });
  await van.createEmbeddedDocuments("Item", [{ name: "Minigun", type: "weapon", system: { category: "vehicle", skill: "gunnery", accuracy: 1, damage: "3", penetration: 3, weight: 3 } }]);
  const roto = await Actor.create({ name: "SMOKE V Roto", type: "vehicle", system: { kind: "drone", frame: "small", mobility: "air", body: 6, weaponWeight: 2, handling: 6, movement: 10 } });
  await roto.setVehicleController(ben);
  // Combat with Ben so pools are spent
  const scene = game.scenes.getName("SMOKE Scene");
  for (const c of game.combats.contents) await c.delete();
  const benTok = scene.tokens.find(t => t.name === "SMOKE D Ben");
  const combat = await Combat.create({ scene: scene.id, active: true });
  await combat.createEmbeddedDocuments("Combatant", [{ tokenId: benTok.id, sceneId: scene.id, actorId: ben.id }]);
  await combat.startCombat();
  // target the guard for ramming
  const guardTok = canvas.tokens.placeables.find(t => t.name === "SMOKE D Guard");
  guardTok?.setTarget(true, { releaseOthers: true });
  return { control: van.controlMode, rotoControl: roto.controlMode, vanPenalty: van.system.totalPenalty, soak: van.system.soakDice,
    vcrBonus: ben.system.rig.bonus, zoetic: ben.system.zoetic.raw, vehicles: ben.controlledVehicles.map(v => v.name), targets: game.user.targets.size };
});
console.log("setup", JSON.stringify(setup));

async function rollVia(expr, fill = {}) {
  await page.evaluate(expr);
  await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
  await page.waitForTimeout(300);
  const info = { preview: await page.textContent(".sinless-test-preview"), penalty: await page.$eval(".sinless-test-dialog input[name=penalty]", e => e.value), bonus: await page.$eval(".sinless-test-dialog input[name=bonus]", e => e.value), notes: (await page.textContent(".sinless-test-dialog .notes"))?.trim() };
  for (const [k, v] of Object.entries(fill)) await page.fill(`.sinless-test-dialog input[name=${k}]`, v);
  await page.click(".sinless-test-dialog button[data-action=roll]");
  await page.waitForTimeout(1500);
  info.card = await page.evaluate(() => { const m = game.messages.contents.at(-1); const el = document.querySelector(`[data-message-id="${m.id}"] .sinless-card`); return { text: el?.textContent.replace(/\s+/g, " ").trim().slice(0, 400), extra: m.flags.sinless?.test?.extra, vcrUsed: m.flags.sinless?.test?.vcrUsed }; });
  return info;
}
console.log("maneuver", JSON.stringify(await rollVia(() => { game.actors.getName("SMOKE V Van").rollVehicleTest("maneuver"); })));
console.log("after maneuver vcrSpent:", await page.evaluate(() => game.actors.getName("SMOKE D Ben").system.rig.vcrSpent));
console.log("ram", JSON.stringify(await rollVia(() => { game.actors.getName("SMOKE V Van").rollVehicleTest("ram"); })));
console.log("van inertia after ram:", await page.evaluate(() => game.actors.getName("SMOKE V Van").system.inertia));
console.log("drone overdrive", JSON.stringify(await rollVia(() => { game.actors.getName("SMOKE V Roto").rollVehicleTest("overdrive"); })));
console.log("minigun", JSON.stringify(await rollVia(() => { const v = game.actors.getName("SMOKE V Van"); v.rollWeapon(v.items.getName("Minigun")); })));

// Damage: immune vs pistol, then hot-seat feedback
const dmg = await page.evaluate(async () => {
  const { resolveDamage } = await import("/systems/sinless/module/helpers/damage.mjs");
  const van = game.actors.getName("SMOKE V Van");
  const pistol = resolveDamage({ base: 4, hits: 3, penetration: 2, armor: van.system.armor, vehicle: true });
  const before = game.actors.getName("SMOKE D Ben").system.condition.stun.value;
  await van.applyDamage({ hit: true, raw: 5, armorReduction: 0, afterArmor: 5, final: 5, track: "physical", stripped: [], source: "test" });
  const ben = game.actors.getName("SMOKE D Ben");
  return { pistolImmune: pistol.immune, vanPhys: van.system.condition.physical.value, vanSoak: van.system.soakDice, benStunBefore: before, benStunAfter: ben.system.condition.stun.value,
    lastCards: game.messages.contents.slice(-2).map(m => m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)) };
});
console.log("damage", JSON.stringify(dmg, null, 1));

await page.evaluate(async () => { const v = game.actors.getName("SMOKE V Van"); await v.sheet.render(true); });
await page.waitForTimeout(1500);
await page.screenshot({ path: out + "/vehicle-sheet.png" });
await page.evaluate(async () => { await game.actors.getName("SMOKE V Van").sheet.close(); const b = game.actors.getName("SMOKE D Ben"); await b.sheet.render(true); await new Promise(r => setTimeout(r, 800)); b.sheet.changeTab("grid", "primary"); });
await page.waitForTimeout(1200);
await page.screenshot({ path: out + "/rig-panel.png" });
await page.evaluate(async () => { for (const c of game.combats.contents) await c.delete(); const b = game.actors.getName("SMOKE D Ben"); await b.update({ "system.condition.stun.value": 0 }); });
console.log("LOGS\n" + logs.filter(l => !/completecompendium|eberron|dnd5e|WebGL|hardware acceleration/.test(l)).join("\n"));
await browser.close();
