import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM();
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const before = await page.evaluate(() => game.messages.size);

// 1. Skill test via dialog (out of conflict -> rank mode)
await page.evaluate(() => { const a = game.actors.getName("SMOKE Martial Artist"); a.rollSkill("athletics"); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(500);
console.log("preview:", await page.textContent(".sinless-test-preview"));
await page.screenshot({ path: out + "/dialog.png" });
await page.fill(".sinless-test-dialog input[name=threshold]", "2");
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(2000);

// 2. Weapon test, untrained-or-default path (firearms 0, heavyWeapons 4 -> default)
await page.evaluate(() => { const a = game.actors.getName("SMOKE Martial Artist"); a.rollWeapon(a.items.find(i => i.type === "weapon")); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(500);
console.log("weapon mode:", await page.$eval(".sinless-test-dialog select[name=mode]", e => e.value), "rank:", await page.$eval(".sinless-test-dialog input[name=rank]", e => e.value));
await page.evaluate(() => { const s = document.querySelector(".sinless-test-dialog select[name=firingMode]"); s.value = "burst"; s.dispatchEvent(new Event("change", { bubbles: true })); });
await page.fill(".sinless-test-dialog select[name=reroll] ~ x", "").catch(() => {});
console.log("weapon preview:", await page.textContent(".sinless-test-preview"));
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(2000);

const msgs = await page.evaluate(b => game.messages.contents.slice(b).map(m => ({ flags: m.flags.sinless?.test && { label: m.flags.sinless.test.label, dice: m.flags.sinless.test.initial, final: m.flags.sinless.test.final, untrained: m.flags.sinless.test.untrained }, rolls: m.rolls.length })), before);
console.log(JSON.stringify(msgs));

// 3. Kismet button on last card
const kBefore = await page.evaluate(() => game.actors.getName("SMOKE Martial Artist").system.kismet.pool.value);
await page.evaluate(() => [...document.querySelectorAll("[data-sinless-action=kismet]")].at(-1).click());
await page.waitForTimeout(2000);
const after = await page.evaluate(() => { const m = game.messages.contents.at(-1); return { kismetAdded: m.flags.sinless.test.kismetAdded, rolls: m.rolls.length, pool: game.actors.getName("SMOKE Martial Artist").system.kismet.pool.value }; });
console.log("kismet before", kBefore, "after", JSON.stringify(after));
await page.screenshot({ path: out + "/chat.png" });

// 4. Combat: initiative and pool spend/refresh
const combat = await page.evaluate(async () => {
  const a = game.actors.getName("SMOKE Martial Artist");
  let scene = game.scenes.getName("SMOKE Scene") ?? await Scene.create({ name: "SMOKE Scene", active: true });
  await scene.activate();
  const [tok] = await scene.createEmbeddedDocuments("Token", [{ actorId: a.id, name: a.name, x: 100, y: 100 }]);
  const npc = await Actor.create({ name: "SMOKE Goon", type: "npc", system: { initiative: 12 } });
  const [tok2] = await scene.createEmbeddedDocuments("Token", [{ actorId: npc.id, name: npc.name, x: 300, y: 100 }]);
  const c = await Combat.create({ scene: scene.id, active: true });
  await c.createEmbeddedDocuments("Combatant", [{ tokenId: tok.id, sceneId: scene.id, actorId: a.id }, { tokenId: tok2.id, sceneId: scene.id, actorId: npc.id }]);
  await c.rollAll();
  await c.startCombat();
  const res = { inits: c.combatants.map(x => `${x.name}=${x.initiative}`), inConflict: a.inConflict };
  await a.update({ "system.pools.finesse.spent": 5 });
  res.finesseMid = a.system.pools.finesse.value;
  await c.nextRound();
  await new Promise(r => setTimeout(r, 1500));
  res.finesseAfterRound = a.system.pools.finesse.value;
  res.npcTN = game.actors.getName("SMOKE Goon").getRollData().tn;
  return res;
});
console.log("combat", JSON.stringify(combat));
console.log("LOGS\n" + logs.filter(l => !/completecompendium|eberron|dnd5e|WebGL|hardware acceleration/.test(l)).join("\n"));
await browser.close();
