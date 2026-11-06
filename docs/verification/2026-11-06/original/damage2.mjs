import { joinGM } from "./lib.mjs";
const { browser, page, logs } = await joinGM();
const r = await page.evaluate(async () => {
  const a = game.actors.getName("SMOKE D Ben");
  await a.update({ "system.condition.physical.value": 0, "system.condition.stun.value": 0, "system.condition.overflow": 0 });
  const [vest] = await a.createEmbeddedDocuments("Item", [{ name: "Vest", type: "armor", system: { ballistic: 3, impact: 2, equipped: true } }]);
  const max = a.system.condition;
  await a.applyDamage({ hit: true, final: max.stun.max + 2, track: "stun", raw: 0, armorReduction: 0, afterArmor: 0, stripped: ["ballistic", "impact"], source: "test" });
  const m = game.messages.contents.at(-1).content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const res = { max: [max.physical.max, max.stun.max], phys: a.system.condition.physical.value, stun: a.system.condition.stun.value, vest: [a.items.get(vest.id).system.ballistic, a.items.get(vest.id).system.impact], card: m };
  await a.items.get(vest.id).delete();
  return res;
});
console.log(JSON.stringify(r, null, 1));
console.log("LOGS\n" + logs.filter(l => !/completecompendium|eberron|dnd5e|WebGL|hardware acceleration/.test(l)).join("\n"));
await browser.close();
