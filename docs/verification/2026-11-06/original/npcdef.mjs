import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM();
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const guardExpr = `game.scenes.getName("SMOKE Scene").tokens.find(t => t.name === "SMOKE D Guard").actor`;
const s0 = await page.evaluate(async () => {
  const base = game.actors.getName("SMOKE D Guard");
  const before = base.system.defenses;
  await base.update({ "system.defenses.dodge": 4, "system.defenses.soak": 4, "system.defenses.resist": 1, "system.pools.finesse.spent": 0 });
  const tokActor = game.scenes.getName("SMOKE Scene").tokens.find(t => t.name === "SMOKE D Guard").actor;
  await tokActor.update({ "system.defenses.dodge": 4, "system.defenses.soak": 4, "system.pools.finesse.spent": 0 });
  await base.sheet.render(true);
  await new Promise(r => setTimeout(r, 1200));
  const inputs = [...base.sheet.element.querySelectorAll(".fixed-defense")].map(i => `${i.name}=${i.value}|${i.placeholder}`);
  return { before, inputs };
});
console.log("sheet", JSON.stringify(s0));
await page.screenshot({ path: out + "/npc-sheet.png" });

// Fixed-dice dodge through the sheet path
await page.evaluate(() => { game.actors.getName("SMOKE D Guard").rollDefense("dodge"); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
console.log("dialog:", await page.textContent(".sinless-test-preview"), "| rank:", await page.$eval(".sinless-test-dialog input[name=rank]", e => e.value), "| pool select:", await page.$(".sinless-test-dialog select[name=pool]") !== null);
await page.screenshot({ path: out + "/npc-dialog.png" });
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1500);
console.log("card", JSON.stringify(await page.evaluate(() => {
  const m = game.messages.contents.at(-1).flags.sinless.test;
  const g = game.actors.getName("SMOKE D Guard");
  return { label: m.label, dice: m.initial.length, notes: m.notes, finesseSpent: g.system.pools.finesse.spent };
})));

// From the damage dialog of the last attack card (token actor)
await page.evaluate(() => {
  const m = game.messages.contents.findLast(m => m.flags.sinless?.test?.extra?.weapon);
  m.flags.sinless.test.extra.targets.length; 
  const el = document.querySelector(`[data-message-id="${m.id}"] [data-sinless-action=defend]`);
  el.click();
});
await page.waitForSelector(".sinless-damage-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
await page.click(".sinless-damage-dialog [data-sinless-roll=soak]");
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1500);
console.log("soak", JSON.stringify(await page.evaluate(g => {
  const m = game.messages.contents.at(-1).flags.sinless.test;
  const a = eval(g);
  return { field: document.querySelector(".sinless-damage-dialog input[name=soak]")?.value, dice: m.initial.length, final: m.final, brawnSpent: a.system.pools.brawn.spent };
}, guardExpr)));
await page.click(".sinless-damage-dialog button[data-action=cancel]");

// Clearing the field returns to pool rules
const cleared = await page.evaluate(async () => {
  const g = game.actors.getName("SMOKE D Guard");
  const input = g.sheet.element.querySelector("input[name='system.defenses.resist']");
  input.value = ""; input.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 1000));
  return { resist: g.system.defenses.resist, fixed: g.system.fixedDefense("resist") };
});
console.log("cleared", JSON.stringify(cleared));
await page.evaluate(() => { game.actors.getName("SMOKE D Guard").rollDefense("resist"); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
console.log("pool resist: pool select:", await page.$(".sinless-test-dialog select[name=pool]") !== null, "|", await page.textContent(".sinless-test-preview"));
await page.click(".sinless-test-dialog button[data-action=cancel]");
console.log("LOGS\n" + logs.filter(l => !/completecompendium|eberron|dnd5e|WebGL|hardware acceleration/.test(l)).join("\n"));
await browser.close();
