import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM();
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const r = await page.evaluate(async () => {
  for (const a of game.actors.filter(a => a.name.startsWith("SMOKE C"))) await a.delete();
  const ben = game.actors.getName("SMOKE D Ben");
  const a = await Actor.create({ name: "SMOKE C Rookie", type: "character" });
  const res = { newActive: a.system.creation.active, benActive: ben.system.creation.active };
  await a.update({ system: {
    attributes: { str: { value: 10 }, bod: { value: 10 }, rea: { value: 12 }, int: { value: 7 }, wil: { value: 8 }, cha: { value: 4 } },
    skills: { firearms: { rank: 7 }, martialArts: { rank: 2 } },
    etiquettes: { street: { rank: 6 }, criminal: { rank: 3 } },
    heritage: "green", talent: "hedge", lifestyle: "middle", lifestyleMonths: 3,
    creation: { priorities: { heritage: "E", magic: "D", attributes: "A", skills: "B", resources: "C" } }
  } });
  await a.createEmbeddedDocuments("Item", [{ name: "Rifle", type: "weapon", system: { cost: 5000 } }, { name: "Street lore", type: "knowledge", system: { rank: 3 } }]);
  await a.sheet.render(true);
  await new Promise(r => setTimeout(r, 1500));
  const el = a.sheet.element;
  res.budgets = [...el.querySelectorAll(".creation-panel .budgets li")].map(li => li.textContent.replace(/\s+/g, " ").trim());
  res.issues = [...el.querySelectorAll(".creation-panel .issues li")].map(li => li.textContent.trim());
  await ben.sheet.render(true);
  await new Promise(r => setTimeout(r, 1000));
  res.benPanel = !!ben.sheet.element.querySelector(".creation-panel");
  await ben.sheet.close();
  return res;
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: out + "/creation.png" });

// Change a priority through the select, roll ghost, then finish
await page.evaluate(() => {
  const s = game.actors.getName("SMOKE C Rookie").sheet.element.querySelector("select[name='system.creation.priorities.heritage']");
  s.value = "C"; s.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1200);
await page.evaluate(() => game.actors.getName("SMOKE C Rookie").sheet.element.querySelector("[data-action=rollGhost]").click());
await page.waitForTimeout(1500);
const r2 = await page.evaluate(() => {
  const a = game.actors.getName("SMOKE C Rookie");
  return { heritagePriority: a.system.creation.priorities.heritage, ghost: a.system.ghost, last: game.messages.contents.at(-1).flavor,
    issues: [...a.sheet.element.querySelectorAll(".creation-panel .issues li")].map(li => li.textContent.trim()) };
});
console.log(JSON.stringify(r2, null, 1));
await page.evaluate(() => game.actors.getName("SMOKE C Rookie").sheet.element.querySelector("[data-action=finishCreation]").click());
await page.waitForTimeout(800);
await page.click("dialog button[data-action=yes]");
await page.waitForTimeout(1200);
console.log("finished:", await page.evaluate(() => { const a = game.actors.getName("SMOKE C Rookie"); return { active: a.system.creation.active, panel: !!a.sheet.element.querySelector(".creation-panel") }; }));
console.log("LOGS\n" + logs.filter(l => !/completecompendium|eberron|dnd5e|WebGL|hardware acceleration/.test(l)).join("\n"));
await browser.close();
