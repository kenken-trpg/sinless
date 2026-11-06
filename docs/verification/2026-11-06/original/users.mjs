import { joinGM } from "./lib.mjs";
const { browser, page, logs } = await joinGM({});
console.log(JSON.stringify(await page.evaluate(() => ({
  users: game.users.map(u => ({ name: u.name, role: u.role, char: u.character?.name, active: u.active })),
  actors: game.actors.map(a => `${a.type}:${a.name}`),
  scenes: game.scenes.map(s => s.name), lang: game.i18n.lang, modules: game.modules.filter(m => m.active).map(m => m.id)
})), null, 1));
await browser.close();
