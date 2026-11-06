import { joinGM } from "./lib.mjs";
const { browser, page, logs } = await joinGM({});
page.setDefaultTimeout(8000);
const ev = (fn, a) => page.evaluate(fn, a);
const r = await ev(async () => {
  const m = game.messages.contents.filter(m => m.flags?.sinless?.test?.label === "Sting").at(-1);
  const x = m.flags.sinless.test.extra;
  const ben = game.actors.getName("SMOKE D Ben");
  const t0 = performance.now();
  const h = ben.hardening, hot = ben.hotseated;
  const { resolveDigital, digitalTrack } = await import("/systems/sinless/module/helpers/grid.mjs");
  const res = resolveDigital({ kind: "weapon", base: x.damage, hits: 4, defense: 0, hardening: h, ignore: x.ignoreHardening });
  return { x, h, hot, res, track: digitalTrack({ entity: ben.isEntity, hotseat: hot }), cond: ben.system.condition, ms: performance.now() - t0 };
});
console.log(JSON.stringify(r));
const p = page.evaluate(async () => {
  const ben = game.actors.getName("SMOKE D Ben");
  await ben.applyDamage({ hit: true, raw: 7, armorReduction: 0, afterArmor: 7, final: 7, track: "physical", stripped: [], source: "test" });
  return ben.system.condition;
});
const res = await Promise.race([p, new Promise(r => setTimeout(() => r("TIMEOUT"), 8000))]);
console.log("applyDamage:", JSON.stringify(res));
console.log(JSON.stringify(logs.slice(-10)));
await browser.close();
