import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM({});
page.setDefaultTimeout(40000);
const ev = (fn, a) => page.evaluate(fn, a);
await ev(async () => {
  const bee = await Actor.create({ name: "SMOKE BEE", type: "npc", system: { network: { entity: true, hardening: 3 }, conditionMax: { physical: 6, stun: 6 } } });
  await bee.update({ "system.condition.stun.value": 2 });
  bee.sheet.render(true);
});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/digital-bee-main.png` });
const r = await ev(async () => {
  const bee = game.actors.getName("SMOKE BEE");
  const ben = game.actors.getName("SMOKE D Ben");
  const n0 = game.messages.size;
  await bee.applyDamage({ hit: true, raw: 5, armorReduction: 3, afterArmor: 2, final: 2, track: "physical", stripped: [], source: "Sting", digital: true });
  await ben.applyDamage({ hit: true, raw: 4, armorReduction: 0, afterArmor: 4, final: 4, track: "physical", stripped: [], source: "Sting", digital: true });
  const out = { bee: bee.system.condition.stun.value, overflow: bee.system.condition.overflow, msgs: game.messages.contents.slice(n0).map(m => m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) };
  bee.sheet.close();
  await bee.delete();
  await ben.update({ "system.condition.physical.value": 0, "system.condition.stun.value": 0, "system.condition.overflow": 0 });
  return out;
});
console.log(JSON.stringify(r));
console.log("logs", JSON.stringify(logs.filter(l => !/favicon|404|WebGL|hardware/.test(l))));
await browser.close();
