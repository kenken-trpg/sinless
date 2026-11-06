import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM({});
page.setDefaultTimeout(8000);
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const ev = (fn, a) => page.evaluate(fn, a);
const wait = ms => page.waitForTimeout(ms);
const last = () => ev(() => game.messages.contents.at(-1).content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const names = ["SMOKE D Ben", "SMOKE C Rookie", "SMOKE Member"];

const orig = await ev(async names => {
  const brand = game.actors.find(a => a.type === "brand");
  const o = { brand: { members: [...brand.system.members], bank: brand.system.bank, turn: brand.system.sectorTurn, used: brand.system.actionsUsed }, chars: {} };
  const set = { "SMOKE D Ben": ["middle", 1, 1000], "SMOKE C Rookie": ["middle", 0, 500], "SMOKE Member": ["squatter", 0, 0] };
  for (const n of names) {
    const a = game.actors.getName(n);
    o.chars[n] = { lifestyle: a.system.lifestyle, months: a.system.lifestyleMonths, zuzu: a.system.zuzu };
    const [l, m, z] = set[n];
    await a.update({ "system.lifestyle": l, "system.lifestyleMonths": m, "system.zuzu": z });
  }
  await brand.update({ "system.members": names.map(n => game.actors.getName(n).id) });
  return o;
}, names);

await ev(async () => { await game.actors.find(a => a.type === "brand").endSectorTurn(); });
await wait(1500);
console.log("sector turn card:", await last());
console.log("after turn", JSON.stringify(await ev(names => names.map(n => { const s = game.actors.getName(n).system; return [n, s.lifestyleMonths, s.zuzu]; }), names)));
await page.screenshot({ path: `${out}/life-card.png` });

// Ben pays again from the sheet: cash 800
await ev(() => game.actors.getName("SMOKE D Ben").sheet.render(true)); await wait(1500);
await page.click(".sinless.sheet [data-action=payLifestyle]");
await page.waitForSelector(".application.dialog button[data-action=yes]");
await page.click(".application.dialog button[data-action=yes]"); await wait(1200);
console.log("pay:", await last());
// Buy 2 months: not enough (200 zuzu), then give money and buy
await ev(() => game.actors.getName("SMOKE D Ben").update({ "system.zuzu": 2000 })); await wait(500);
await page.click(".sinless.sheet [data-action=buyLifestyle]");
await page.waitForSelector(".application.dialog input[name=months]");
await page.fill(".application.dialog input[name=months]", "2");
await page.screenshot({ path: `${out}/life-buy.png` });
await page.click(".application.dialog button[data-action=ok]"); await wait(1200);
console.log("buy:", await last(), JSON.stringify(await ev(() => { const s = game.actors.getName("SMOKE D Ben").system; return [s.lifestyleMonths, s.zuzu]; })));
const box = await page.locator(".sinless.sheet .header-grid").boundingBox();
await page.screenshot({ path: `${out}/life-header.png`, clip: { x: box.x - 5, y: box.y - 5, width: box.width + 10, height: box.height + 10 } });

await ev(async o => {
  for (const [n, c] of Object.entries(o.chars)) await game.actors.getName(n).update({ "system.lifestyle": c.lifestyle, "system.lifestyleMonths": c.months, "system.zuzu": c.zuzu });
  await game.actors.find(a => a.type === "brand").update({ "system.members": o.brand.members, "system.bank": o.brand.bank, "system.sectorTurn": o.brand.turn, "system.actionsUsed": o.brand.used });
  game.actors.getName("SMOKE D Ben").sheet.close();
}, orig);
console.log("logs", JSON.stringify(logs.filter(l => !/favicon|404|WebGL|hardware/.test(l)), null, 1));
await browser.close();
