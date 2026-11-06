import { joinGM } from "./lib.mjs";
const { browser, page } = await joinGM();
await page.evaluate(() => { game.actors.getName("SMOKE Black Adder").rollBrandAction("racketeering"); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(400);
console.log(await page.evaluate(() => {
  const form = document.querySelector(".sinless-test-dialog form");
  return JSON.stringify(new foundry.applications.ux.FormDataExtended(form).object);
}));
await browser.close();
