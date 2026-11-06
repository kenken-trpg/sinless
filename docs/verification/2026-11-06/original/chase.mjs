import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM({});
page.setDefaultTimeout(8000);
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const ev = (fn, a) => page.evaluate(fn, a);
const wait = ms => page.waitForTimeout(ms);
const count = () => ev(() => game.messages.size);
const msgs = n0 => ev(n => game.messages.contents.slice(n).map(m => m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()), n0);
const state = () => ev(() => { const s = game.settings.get("sinless", "chase"); return { active: s.active, legsDone: s.legsDone, primary: s.primary, turn: s.turn, counts: s.paths.map(p => p.length), enemies: s.enemies.map(e => `${e.name}:${e.range}${e.flying ? "(fly)" : ""}`), ended: s.ended }; });

// Setup: players' van, a temporary pursuer vehicle, and the roto drone as a flying pursuer.
await ev(async () => {
  const van = game.actors.getName("SMOKE V Van");
  const enemy = await Actor.create({ name: "Chase Pursuer", type: "vehicle", system: { kind: "vehicle", body: 10, handling: 1, mobility: "ground" } });
  const roto = game.actors.getName("SMOKE V Roto");
  await game.settings.set("sinless", "chase", { active: false, vehicleUuid: van.uuid, legs: 3, legsDone: 0, paths: [], primary: 0, discard: [],
    enemies: [{ uuid: enemy.uuid, name: enemy.name, range: "close", flying: false }, { uuid: roto.uuid, name: roto.name, range: "close", flying: true }], turn: 1, ended: null });
});
await ev(() => ui.controls.controls.tokens.tools.sinlessChase.onChange());
await page.waitForSelector("#sinless-chase");
let n0 = await count();
await page.click("#sinless-chase [data-action=start]");
await page.waitForSelector(".sinless-chase-setup textarea");
await page.click(".sinless-advance-dialog button[data-action=start]"); await wait(1500);
console.log("started", JSON.stringify(await state()), JSON.stringify(await msgs(n0)));
await page.screenshot({ path: `${out}/chase-app.png` });

// Reveal (scout) path B, then flip primary twice
await page.click("#sinless-chase [data-action=reveal][data-path='1']"); await wait(600);
n0 = await count();
await page.click("#sinless-chase [data-action=flip]"); await wait(1200);
await page.click("#sinless-chase [data-action=flip]"); await wait(1200);
console.log("after 2 flips", JSON.stringify(await state()), JSON.stringify(await msgs(n0)));

// Vehicle sheet: chase action "switch" with forced success
await ev(() => game.actors.getName("SMOKE V Van").sheet.render(true)); await wait(1500);
const btns = await ev(() => [...document.querySelectorAll(".sinless.sheet .chase-actions button")].map(b => b.textContent.trim()));
console.log("chase buttons", JSON.stringify(btns));
await page.screenshot({ path: `${out}/chase-vehicle.png` });
await page.click(".sinless.sheet .chase-actions button[data-kind=switch]");
await page.waitForSelector(".sinless-test-dialog"); await wait(300);
console.log("switch threshold", await page.inputValue(".sinless-test-dialog input[name=threshold]"));
await page.fill(".sinless-test-dialog input[name=bonus]", "12");
await page.dispatchEvent(".sinless-test-dialog input[name=bonus]", "input");
await page.click(".sinless-test-dialog button[data-action=roll]"); await wait(1500);
n0 = await count();
console.log("switch card", (await msgs(n0 - 1))[0]);
await ev(() => { const m = game.messages.contents.at(-1); document.querySelector(`[data-message-id="${m.id}"] [data-sinless-action=apply-chase]`)?.click(); });
await wait(1500);
console.log("after switch", JSON.stringify(await state()), JSON.stringify(await msgs(n0)));
await ev(() => game.actors.getName("SMOKE V Van").sheet.close());

// Pursuers fall back: ground pursuer out after 3; flying stays close
for (let i = 0; i < 3; i++) { await page.click("#sinless-chase [data-action=moveEnemy][data-index='0'][data-delta='1']"); await wait(700); }
await page.click("#sinless-chase [data-action=moveEnemy][data-index='1'][data-delta='1']"); await wait(700);
console.log("after fall back", JSON.stringify(await state()));
// Wreck the roto: evaded
n0 = await count();
await ev(async () => { const r = game.actors.getName("SMOKE V Roto"); await r.update({ "system.condition.physical.value": r.system.condition.physical.max }); });
await wait(2000);
console.log("wreck roto", JSON.stringify(await state()), JSON.stringify(await msgs(n0)));
await page.screenshot({ path: `${out}/chase-end.png` });

// cleanup
await ev(async () => {
  await game.actors.getName("SMOKE V Roto").update({ "system.condition.physical.value": 0 });
  await game.actors.getName("Chase Pursuer")?.delete();
  await game.settings.set("sinless", "chase", { active: false, vehicleUuid: null, legs: 3, legsDone: 0, paths: [], primary: 0, discard: [], enemies: [], turn: 1, ended: null });
});
console.log("logs", JSON.stringify(logs.filter(l => !/favicon|404|WebGL|hardware/.test(l)), null, 1));
await browser.close();
