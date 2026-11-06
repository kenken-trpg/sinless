import { joinGM } from "./lib.mjs";
const { browser, page } = await joinGM({});
console.log(await page.evaluate(() => JSON.stringify(game.actors.filter(a => a.type === "vehicle").map(a => ({ name: a.name, controller: a.system.controller, mode: a.system.controlMode, handling: a.system.handling, mobility: a.system.mobility, tokens: canvas.tokens.placeables.filter(t => t.actor?.id === a.id).length })))));
await browser.close();
