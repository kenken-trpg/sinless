import { joinGM } from "./lib.mjs";
const { browser, page } = await joinGM({});
console.log(await page.evaluate(async () => { const b = game.actors.getName("SMOKE D Ben"); b.sheet.close();
  await b.update({ "system.kismet": { earned: 0, unspent: 0, spent: 0, boons: 0, history: [], resilience: { brawn: 0, finesse: 0, focus: 0, resolve: 0 } }, "system.skills.firearms.rank": 4 });
  return JSON.stringify(b.system.kismet.pool); }));
await browser.close();
