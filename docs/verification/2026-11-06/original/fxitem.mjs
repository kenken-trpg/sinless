import { joinGM } from "./lib.mjs";
const { browser, page, logs } = await joinGM();
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
await page.evaluate(async () => { await game.actors.getName("SMOKE D Ben").items.getName("FX Muscle Toner").sheet.render(true); });
await page.waitForTimeout(1200);
await page.screenshot({ path: process.argv[2] + "/fx-item.png" });
console.log(logs.filter(l => !/completecompendium|eberron|dnd5e|WebGL|hardware acceleration/.test(l)).join("\n"));
await browser.close();
