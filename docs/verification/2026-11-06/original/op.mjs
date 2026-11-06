import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM({});
page.setDefaultTimeout(8000);
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const ev = (fn, a) => page.evaluate(fn, a);
const msgs = n0 => ev(n => game.messages.contents.slice(n).map(m => `${m.whisper.length ? "[GM] " : ""}${m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`), n0);
const count = () => ev(() => game.messages.size);
const wait = ms => page.waitForTimeout(ms);

const pre = await ev(async () => {
  await game.settings.set("sinless", "alert", 0); await game.settings.set("sinless", "heat", 0);
  await game.settings.set("sinless", "operation", { responses: [], lastAlert: 0, lastHeat: 0, htr: null });
  const brand = game.actors.find(a => a.type === "brand");
  return { tool: !!ui.controls.controls.tokens?.tools?.sinlessOperation, brand: brand?.name, brandHeat: brand?.system.sector.heat,
    chars: game.actors.filter(a => a.type === "character" && a.hasPlayerOwner).map(a => a.name) };
});
console.log("pre", JSON.stringify(pre));
await ev(() => ui.controls.controls.tokens.tools.sinlessOperation.onChange());
await page.waitForSelector("#sinless-operation");
await page.click("#sinless-operation [data-action=addResponse]"); await wait(500);
await page.click("#sinless-operation [data-action=addResponse]"); await wait(500);
// Type like a user: click, type, tab between fields.
await page.click("#sinless-operation input[name='responses.0.label']");
await page.keyboard.type("Routine patrol"); await page.keyboard.press("Tab"); await wait(400);
await page.click("#sinless-operation input[name='responses.1.label']");
await page.keyboard.type("Deploy dog drones"); await page.keyboard.press("Tab"); await wait(400);
await page.click("#sinless-operation input[name='responses.1.threshold']", { clickCount: 3 });
await page.keyboard.type("25"); await page.keyboard.press("Tab"); await wait(600);
console.log("focused after tab", await ev(() => document.activeElement?.name ?? document.activeElement?.tagName));
console.log("responses", JSON.stringify(await ev(() => game.settings.get("sinless", "operation").responses)));

let n0 = await count();
await page.fill("#sinless-operation input[name=alert]", "26");
await page.dispatchEvent("#sinless-operation input[name=alert]", "change"); await wait(1500);
console.log("alert 26 msgs", JSON.stringify(await msgs(n0)));
await page.screenshot({ path: `${out}/op-app.png` });

// Shadow test: card button raises alert
n0 = await count();
await ev(() => { game.actors.getName("SMOKE D Ben").rollSkill("shadow"); });
await page.waitForSelector(".sinless-test-dialog"); await wait(300);
await page.fill(".sinless-test-dialog input[name=rank]", "0");
await page.fill(".sinless-test-dialog input[name=bonus]", "1");
await page.dispatchEvent(".sinless-test-dialog input[name=bonus]", "input");
await page.click(".sinless-test-dialog button[data-action=roll]"); await wait(1500);
console.log("shadow card", JSON.stringify(await msgs(n0)));
const alertBefore = await ev(() => game.settings.get("sinless", "alert"));
await ev(() => { const m = game.messages.contents.at(-1); document.querySelector(`[data-message-id="${m.id}"] [data-sinless-action=apply-shadow-alert]`)?.click(); });
await wait(1500);
console.log("alert", alertBefore, "->", await ev(() => game.settings.get("sinless", "alert")), "| card:", (await msgs(n0)).at(-1));

// Over 50 -> two stars
n0 = await count();
await ev(() => game.settings.set("sinless", "alert", 51)); await wait(2000);
console.log("alert 51", JSON.stringify(await msgs(n0)), "heat", await ev(() => game.settings.get("sinless", "heat")));
// Four stars via star click
n0 = await count();
await page.click("#sinless-operation [data-action=heat][data-heat='4']"); await wait(2000);
console.log("heat 4", JSON.stringify(await msgs(n0)), "htr", await ev(() => game.settings.get("sinless", "operation").htr));
await page.screenshot({ path: `${out}/op-app4.png` });

// End operation
n0 = await count();
await page.click("#sinless-operation [data-action=endOperation]");
await page.waitForSelector(".sinless-fallout"); await wait(300);
const brandValue = await ev(() => document.querySelectorAll(".sinless-advance-dialog select[name=brand] option")[1]?.value ?? "");
if (brandValue) await page.selectOption(".sinless-advance-dialog select[name=brand]", brandValue);
for (const c of await page.locator(".sinless-fallout input[type=checkbox]").all()) await c.check({ force: true });
await page.fill(".sinless-advance-dialog input[name=caches]", "2");
await page.screenshot({ path: `${out}/op-fallout.png` });
await page.click(".sinless-advance-dialog button[data-action=end]"); await wait(2500);
console.log("fallout", JSON.stringify(await msgs(n0)));
console.log("after", JSON.stringify(await ev(() => ({ alert: game.settings.get("sinless", "alert"), heat: game.settings.get("sinless", "heat"), op: game.settings.get("sinless", "operation"), brandHeat: game.actors.find(a => a.type === "brand")?.system.sector.heat }))));
await page.screenshot({ path: `${out}/op-chat.png` });
// restore
await ev(async h => { const b = game.actors.find(a => a.type === "brand"); if (b) await b.update({ "system.sector.heat": h }); await game.settings.set("sinless", "operation", { responses: [], lastAlert: 0, lastHeat: 0, htr: null }); }, pre.brandHeat ?? 0);
console.log("logs", JSON.stringify(logs.filter(l => !/favicon|404|WebGL|hardware/.test(l)), null, 1));
await browser.close();
