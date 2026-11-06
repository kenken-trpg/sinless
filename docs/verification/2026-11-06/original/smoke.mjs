import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM();
const r = await page.evaluate(async () => {
  const res = {};
  res.lang = game.i18n.lang;
  res.system = game.system.id + " " + game.system.version;
  for (const a of game.actors.filter(a => a.name.startsWith("SMOKE"))) await a.delete();
  const actor = await Actor.create({ name: "SMOKE Martial Artist", type: "character", system: {
    attributes: { str: { value: 14 }, bod: { value: 12 }, rea: { value: 9 }, int: { value: 7 }, wil: { value: 8 }, cha: { value: 8 } },
    charismaPool: "brawn", skills: { unarmedCombat: { rank: 6 }, athletics: { rank: 6 }, shadow: { rank: 3 }, firearms: { rank: 0 }, heavyWeapons: { rank: 4 } },
    kismet: { earned: 12 }
  }});
  const s = actor.system;
  res.pools = Object.fromEntries(Object.entries(s.pools).map(([k, p]) => [k, `${p.value}/${p.max}`]));
  res.condition = `${s.condition.physical.max}/${s.condition.stun.max}`;
  res.kismetPool = s.kismet.pool;
  res.zoetic = s.zoetic.value;
  const types = ["weapon", "armor", "gear", "implant", "power", "ritual", "knowledge", "asset"];
  await actor.createEmbeddedDocuments("Item", types.map(t => ({ name: "SMOKE " + t, type: t })));
  await actor.items.find(i => i.type === "weapon").update({ "system.accuracy": 2, "system.damage": "5", "system.penetration": 3 });
  await actor.items.find(i => i.type === "implant").update({ "system.zoeticCost": 0.5 });
  await actor.items.find(i => i.type === "armor").update({ "system.ballistic": 4, "system.impact": 2 });
  res.zoeticAfter = `${actor.system.zoetic.value} raw ${actor.system.zoetic.raw} gear ${actor.system.zoetic.gearLoss}`;
  res.armor = actor.system.armor;
  await actor.sheet.render(true);
  await new Promise(r => setTimeout(r, 1500));
  res.sheetRendered = !!actor.sheet.element?.querySelector(".pools");
  res.sheetSkillCount = actor.sheet.element?.querySelectorAll(".skill").length;
  for (const item of actor.items) { await item.sheet.render(true); }
  await new Promise(r => setTimeout(r, 1500));
  res.itemSheets = actor.items.map(i => `${i.type}:${!!i.sheet.element?.querySelector(".item-details")}`).join(",");
  for (const item of actor.items) await item.sheet.close();
  return res;
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: out + "/sheet.png" });
console.log("LOGS\n" + logs.filter(l => !/completecompendium|eberron|dnd5e/.test(l)).join("\n"));
await browser.close();
