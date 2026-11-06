import { joinGM } from "./lib.mjs";
import { chromium } from "/Users/mantanikenichi/mydevelop/voice-atlas/node_modules/playwright/index.mjs";
{
  const { browser, page } = await joinGM();
  await page.evaluate(() => game.shutDown()).catch(() => {});
  await page.waitForTimeout(4000);
  await browser.close();
}
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:30000/setup");
await page.waitForTimeout(2500);
console.log("types before launch:", await page.evaluate(() => JSON.stringify(game.systems.get("sinless")?.documentTypes?.Actor ? Object.keys(game.systems.get("sinless").documentTypes.Actor) : null)));
const res = await page.evaluate(async () => (await fetch("/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "launchWorld", world: "sinless-test" }) })).status);
console.log("launch", res);
await page.waitForTimeout(5000);
await browser.close();
const s = await joinGM();
console.log("actor types:", await s.page.evaluate(() => Object.keys(CONFIG.Actor.dataModels).join(",") + " | " + game.documentTypes.Actor.join(",") + " | items " + game.documentTypes.Item.join(",")));
await s.browser.close();
