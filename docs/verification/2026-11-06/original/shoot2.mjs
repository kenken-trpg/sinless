import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM({});
page.setDefaultTimeout(8000);
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const info = await page.evaluate(() => { const b = game.actors.getName("SMOKE D Ben"); const w = b.items.getName("Heavy Pistol");
  return { rank: b.system.skills.firearms.rank, acc: w.system.accuracy, effects: b.appliedEffects.map(e => e.name), gear: b.items.filter(i => i.type === "gear").map(i => [i.name, i.system.limitBonus]) }; });
console.log("info", JSON.stringify(info));
// Firearms skill test: spec unchecked -> rank 3
await page.evaluate(() => { game.actors.getName("SMOKE D Ben").rollSkill("firearms"); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
console.log("skill preview", (await page.textContent(".sinless-test-preview")).trim(), "spec checked:", await page.isChecked(".sinless-test-dialog input[name=specApplies]"));
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1200);
console.log("skill card", await page.evaluate(() => { const m = game.messages.contents.at(-1); return JSON.stringify({ notes: m.flags.sinless.test.notes, plan: m.flags.sinless.test.plan }); }));

// NPC with fixed attack dice: modifiers but no recoil
const npcInfo = await page.evaluate(async () => {
  const g = game.actors.getName("SMOKE D Guard");
  let w = g.items.find(i => i.type === "weapon" && ["firearm", "heavy"].includes(i.system.category));
  return { name: w?.name, attackDice: w?.system.attackDice };
});
console.log("npc weapon", JSON.stringify(npcInfo));
if (npcInfo.name) {
  await page.evaluate(n => { const g = game.actors.getName("SMOKE D Guard"); g.rollWeapon(g.items.getName(n)); }, npcInfo.name);
  await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.selectOption(".sinless-test-dialog select[name=light]", "dark");
  await page.dispatchEvent(".sinless-test-dialog select[name=light]", "change");
  await page.waitForTimeout(200);
  console.log("npc preview", (await page.textContent(".sinless-test-preview")).trim(), "recoil shown:", !!(await page.$(".sinless-test-dialog .combat-modifiers .recoil")));
  await page.screenshot({ path: `${out}/npc-shoot.png` });
  await page.click(".sinless-test-dialog button[data-action=cancel]");
}
console.log("logs", JSON.stringify(logs.filter(l => !/favicon|404/.test(l)), null, 1));
await browser.close();
