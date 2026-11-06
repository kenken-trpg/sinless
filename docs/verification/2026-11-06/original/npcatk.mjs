import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM();
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
await page.evaluate(async () => {
  const g = game.actors.getName("SMOKE D Guard");
  for (const i of g.items.filter(i => i.name.startsWith("SMOKE"))) await i.delete();
  await g.update({ "system.penalty": 1 });
  const [w] = await g.createEmbeddedDocuments("Item", [
    { name: "SMOKE Pistol", type: "weapon", system: { category: "firearm", skill: "firearms", damage: "2", penetration: 2, attackDice: 8 } },
    { name: "SMOKE Cudgel", type: "weapon", system: { category: "melee", skill: "meleeWeapons", damage: "8" } }
  ]);
  await w.sheet.render(true);
  await new Promise(r => setTimeout(r, 1000));
});
await page.screenshot({ path: out + "/npc-weapon.png" });
console.log("field:", await page.evaluate(() => document.querySelector("[name='system.attackDice']")?.value));
await page.evaluate(() => { const g = game.actors.getName("SMOKE D Guard"); g.rollWeapon(g.items.getName("SMOKE Pistol")); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
console.log("pistol dialog:", await page.textContent(".sinless-test-preview"), "| firing:", await page.$(".sinless-test-dialog select[name=firingMode]") !== null);
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1500);
console.log("pistol card", JSON.stringify(await page.evaluate(() => { const t = game.messages.contents.at(-1).flags.sinless.test; return { dice: t.initial.length, notes: t.notes, dmg: t.extra.damage, pen: t.extra.penetration, spent: game.actors.getName("SMOKE D Guard").system.pools.finesse.spent }; })));
await page.evaluate(() => { const g = game.actors.getName("SMOKE D Guard"); g.rollWeapon(g.items.getName("SMOKE Cudgel")); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
console.log("cudgel (pool rules) dialog: pool select:", await page.$(".sinless-test-dialog select[name=pool]") !== null, "|", await page.textContent(".sinless-test-preview"));
await page.click(".sinless-test-dialog button[data-action=cancel]");
await page.evaluate(async () => { const g = game.actors.getName("SMOKE D Guard"); await g.update({ "system.penalty": 0 }); });
console.log("LOGS\n" + logs.filter(l => !/completecompendium|eberron|dnd5e|WebGL|hardware acceleration/.test(l)).join("\n"));
await browser.close();
