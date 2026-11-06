import { joinGM } from "./lib.mjs";
const { browser, page, logs } = await joinGM({});
const ev = (fn, a) => page.evaluate(fn, a);
await ev(() => { window._dbg = []; const ben = game.actors.getName("SMOKE D Ben");
  (async () => {
    const t = performance.now();
    window._dbg.push("start");
    await ben.update({ "system.condition.physical.value": 1 });
    window._dbg.push("update " + (performance.now() - t));
    const r = await ben.applyDamage({ hit: true, raw: 7, armorReduction: 0, afterArmor: 7, final: 7, track: "physical", stripped: [], source: "test" });
    window._dbg.push("applied " + (performance.now() - t));
  })().catch(e => window._dbg.push("err " + e.message + e.stack));
});
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(3000);
  const d = await Promise.race([ev(() => window._dbg), new Promise(r => setTimeout(() => r("BLOCKED"), 3000))]);
  console.log(i, JSON.stringify(d));
}
await browser.close();
