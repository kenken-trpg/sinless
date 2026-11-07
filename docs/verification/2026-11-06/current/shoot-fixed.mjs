import { joinGM } from "../../lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM({});
page.setDefaultTimeout(8000);
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const setup = await page.evaluate(async () => {
  const ben = game.actors.getName("SMOKE D Ben");
  for (const i of ben.items.filter(i => i.name === "Heavy Pistol")) await i.delete();
  await ben.update({ "system.skills.firearms.rank": 4, "system.skills.firearms.spec": "Pistols", "system.combat.recoil": 0, "system.combat.recoilPrimed": false,
    "system.condition.stun.value": 0, "system.condition.physical.value": 0, "system.penalty": 0 });
  await ben.createEmbeddedDocuments("Item", [{ name: "Heavy Pistol", type: "weapon", system: { category: "firearm", skill: "firearms", accuracy: 2, damage: "5", penetration: 3, rangeClose: "20 m", rangeMax: "60 m" } }]);
  return { str: ben.system.attributes.str.value, cap: ben.system.combat.recoilCapacity, penalty: ben.system.totalPenalty };
});
console.log("setup", JSON.stringify(setup));

async function fire({ mode, configure, shot }) {
  await page.evaluate(() => { const b = game.actors.getName("SMOKE D Ben"); b.rollWeapon(b.items.getName("Heavy Pistol")); });
  await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
  await page.waitForTimeout(300);
  if (configure) await configure();
  await page.selectOption(".sinless-test-dialog select[name=firingMode]", mode);
  await page.dispatchEvent(".sinless-test-dialog select[name=firingMode]", "change");
  await page.waitForTimeout(200);
  const preview = (await page.textContent(".sinless-test-preview")).trim();
  const spec = await page.isChecked(".sinless-test-dialog input[name=specApplies]");
  if (shot) await page.screenshot({ path: `${out}/${shot}` });
  await page.click(".sinless-test-dialog button[data-action=roll]");
  await page.waitForTimeout(1500);
  const card = await page.evaluate(() => { const m = game.messages.contents.at(-1); const el = document.querySelector(`[data-message-id="${m.id}"] .sinless-card`);
    const t = m.flags.sinless.test;
    return { text: el?.textContent.replace(/\s+/g, " ").trim(), plan: t.plan, recoil: t.extra.recoil, defend: !!el?.querySelector("[data-sinless-action=defend-selected]") }; });
  const state = await page.evaluate(() => { const c = game.actors.getName("SMOKE D Ben").system.combat; return { recoil: c.recoil, primed: c.recoilPrimed }; });
  return { preview, spec, card, state };
}

const r1 = await fire({ mode: "burst", shot: "shoot-dialog.png", configure: async () => {
  await page.selectOption(".sinless-test-dialog select[name=light]", "dim");
  await page.selectOption(".sinless-test-dialog select[name=cover]", "high");
  await page.fill(".sinless-test-dialog input[name=aim]", "1");
  await page.fill(".sinless-test-dialog input[name=range]", "1");
  await page.dispatchEvent(".sinless-test-dialog input[name=range]", "input");
}});
console.log("shot1", JSON.stringify(r1));
await page.screenshot({ path: `${out}/shoot-card.png` });
const r2 = await fire({ mode: "single", configure: async () => {
  await page.check(".sinless-test-dialog input[name=dualWield]");
  await page.fill(".sinless-test-dialog input[name=extraTargets]", "1");
  await page.dispatchEvent(".sinless-test-dialog input[name=extraTargets]", "input");
}});
console.log("shot2", JSON.stringify(r2));
const r3 = await fire({ mode: "single", shot: "shoot-jammed.png" });
console.log("shot3", JSON.stringify(r3));
await page.screenshot({ path: `${out}/shoot-jammed-card.png` });

// Sheet with recoil, then stabilize
await page.evaluate(() => game.actors.getName("SMOKE D Ben").sheet.render(true));
await page.waitForTimeout(1500);
const sheetRecoil = await page.evaluate(() => document.querySelector(".sinless.sheet .defenses .recoil")?.textContent.replace(/\s+/g, " ").trim());
console.log("sheet recoil", sheetRecoil);
await page.screenshot({ path: `${out}/shoot-sheet.png` });
await page.click(".sinless.sheet .defenses .recoil .stabilize");
await page.waitForTimeout(800);
console.log("after stabilize", JSON.stringify(await page.evaluate(() => game.actors.getName("SMOKE D Ben").system.combat)));
await page.evaluate(() => game.actors.getName("SMOKE D Ben").sheet.close());

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
