import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM();
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const r = await page.evaluate(async () => {
  for (const a of game.actors.filter(a => a.name.startsWith("SMOKE"))) await a.delete();
  const member = await Actor.create({ name: "SMOKE Member", type: "character", system: { etiquettes: { street: { rank: 4 } } } });
  const brand = await Actor.create({ name: "SMOKE Black Adder", type: "brand", system: { base: { muscle: 2 }, sector: { name: "Docks", heat: 1 } } });
  await brand.update({ "system.traits": ["dangerous", "competence"] });
  await brand.createEmbeddedDocuments("Item", [
    { name: "Tattoo Parlor", type: "resource", system: { class: "D", market: 2, marketBonus: 1, upkeep: 1, tags: ["service", "business"] } },
    { name: "Condos", type: "resource", system: { class: "C", market: 5, upkeep: 3, tags: ["housing"], influence: 4 } },
    { name: "Gym", type: "resource", system: { class: "E", market: 1, upkeep: 1, tags: ["service"], damage: 1, brandBonus: { muscle: 2 } } },
    { name: "Street Fence", type: "asset", system: { etiquette: "street", upkeep: 2, free: false } }
  ]);
  await brand.addBrandMember(member);
  const s = brand.system;
  const res = {
    stats: s.stats, traits: [...s.traits], traitSlots: s.traitSlots, finance: s.finance,
    actions: `${s.actionsLeft}/${s.actionsAvailable}`, memberBrand: member.system.brand, members: s.members.length,
    gymFunctions: brand.items.getName("Gym").system.functions
  };
  await brand.sheet.render(true);
  await new Promise(r => setTimeout(r, 1500));
  res.sheet = !!brand.sheet.element?.querySelector(".brand-stats");
  const resItem = brand.items.getName("Condos");
  await resItem.sheet.render(true);
  await new Promise(r => setTimeout(r, 800));
  res.resourceSheet = !!resItem.sheet.element?.querySelector(".brand-bonus");
  res.tagCheckboxes = resItem.sheet.element?.querySelectorAll("[name='system.tags']").length + "";
  await resItem.sheet.close();
  return res;
});
console.log(JSON.stringify(r));
await page.screenshot({ path: out + "/brand.png" });

// Brand action roll (racketeering raises heat)
const before = await page.evaluate(() => game.messages.size);
await page.evaluate(() => { game.actors.getName("SMOKE Black Adder").rollBrandAction("racketeering"); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(400);
console.log("dialog preview:", await page.textContent(".sinless-test-preview"), "| pool select present:", await page.$(".sinless-test-dialog select[name=pool]") !== null);
await page.screenshot({ path: out + "/brand-dialog.png" });
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(2000);

// Asset test by member
await page.evaluate(() => { const b = game.actors.getName("SMOKE Black Adder"); b.rollAsset(b.items.getName("Street Fence")); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(400);
console.log("asset dialog title:", await page.textContent(".sinless-test-dialog .window-title"), "| rank:", await page.$eval(".sinless-test-dialog input[name=rank]", e => e.value));
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(2000);

// End sector turn via confirm dialog
await page.evaluate(() => game.actors.getName("SMOKE Black Adder").sheet.element.querySelector("[data-action=endSectorTurn]").click());
await page.waitForTimeout(1000);
await page.click("dialog button[data-action=yes]");
await page.waitForTimeout(2000);
const after = await page.evaluate(b => {
  const brand = game.actors.getName("SMOKE Black Adder");
  return {
    heat: brand.system.sector.heat, bank: brand.system.bank, actionsUsed: brand.system.actionsUsed, turn: brand.system.sectorTurn,
    cards: game.messages.contents.slice(b).map(m => m.flags.sinless?.test ? `${m.flags.sinless.test.label} auto=${m.flags.sinless.test.autoSuccesses} dice=${m.flags.sinless.test.initial.length}` : m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
  };
}, before);
console.log(JSON.stringify(after, null, 1));
await page.evaluate(() => game.actors.getName("SMOKE Black Adder").sheet.render(true));
await page.waitForTimeout(1000);
await page.screenshot({ path: out + "/brand-after.png" });
console.log("LOGS\n" + logs.filter(l => !/completecompendium|eberron|dnd5e|WebGL|hardware acceleration/.test(l)).join("\n"));
await browser.close();
