import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM({});
page.setDefaultTimeout(8000);
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const ben = fn => page.evaluate(fn);
const state = () => ben(() => { const b = game.actors.getName("SMOKE D Ben"); const k = b.system.kismet;
  return { earned: k.earned, unspent: k.unspent, boons: k.boons, spent: k.spent, res: k.resilience, firearms: b._source.system.skills.firearms.rank, hist: k.history.length, pool: k.pool }; });
const orig = await ben(async () => { const b = game.actors.getName("SMOKE D Ben"); const o = { kismet: foundry.utils.deepClone(b._source.system.kismet), firearms: b._source.system.skills.firearms.rank };
  await b.update({ "system.kismet": { earned: 8, unspent: 0, spent: 0, boons: 0, history: [], resilience: { brawn: 0, finesse: 0, focus: 0, resolve: 0 } }, "system.skills.firearms.rank": 4 });
  b.sheet.render(true); return o; });
await page.waitForTimeout(1500);
await page.click(".sinless.sheet nav [data-tab=social]");
await page.waitForTimeout(500);

// Award
await page.click(".sinless.sheet [data-action=awardKismet]");
await page.waitForSelector(".sinless-advance-dialog");
for (const k of ["survived", "mission", "learned"]) await page.check(`.sinless-advance-dialog input[name=${k}]`);
await page.fill(".sinless-advance-dialog input[name=extra]", "10");
await page.screenshot({ path: `${out}/adv-award.png` });
await page.click(".sinless-advance-dialog button[data-action=award]");
await page.waitForTimeout(1200);
console.log("after award", JSON.stringify(await state()), "|", await ben(() => game.messages.contents.at(-1).content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));

// Spend: firearms 4 -> 5 (4 Kismet)
await page.click(".sinless.sheet [data-action=spendKismet]");
await page.waitForSelector(".sinless-advance-dialog select[name=choice]");
const opts = await page.evaluate(() => [...document.querySelectorAll(".sinless-advance-dialog select[name=choice] option")].filter(o => /firearms|zoetic|str/.test(o.value)).map(o => `${o.value}=${o.textContent.trim()}${o.disabled ? " (disabled)" : ""}`));
console.log("options", JSON.stringify(opts));
await page.selectOption(".sinless-advance-dialog select[name=choice]", "skill:firearms");
await page.screenshot({ path: `${out}/adv-spend.png` });
await page.click(".sinless-advance-dialog button[data-action=buy]");
await page.waitForTimeout(1200);
console.log("after buy", JSON.stringify(await state()), "|", await ben(() => game.messages.contents.at(-1).content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));

// Zoetic without talisman -> refused
await page.click(".sinless.sheet [data-action=spendKismet]");
await page.waitForSelector(".sinless-advance-dialog select[name=choice]");
const zDisabled = await page.evaluate(() => document.querySelector(".sinless-advance-dialog option[value='zoetic:zoetic']")?.disabled);
console.log("zoetic option disabled (unaffordable?)", zDisabled);
await page.click(".sinless-advance-dialog button[data-action=cancel]");

// Boon 1 (minor): windfall
await page.click(".sinless.sheet [data-action=chooseBoon]");
await page.waitForSelector(".sinless-advance-dialog input[name=boon]", { state: "attached" });
console.log("boon1 choices", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".sinless-advance-dialog input[name=boon]")].map(i => i.value + (i.disabled ? "(disabled)" : "")))));
await page.check(".sinless-advance-dialog input[name=boon][value=windfall]", { force: true });
await page.click(".sinless-advance-dialog button[data-action=take]");
await page.waitForTimeout(1200);
console.log("after boon1", JSON.stringify(await state()), "|", await ben(() => game.messages.contents.at(-1).content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));

// Boon 2 (major): pool resilience on finesse
await page.click(".sinless.sheet [data-action=chooseBoon]");
await page.waitForSelector(".sinless-advance-dialog input[name=boon]", { state: "attached" });
console.log("boon2 choices", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".sinless-advance-dialog input[name=boon]")].map(i => i.value + (i.disabled ? "(disabled)" : "")))));
await page.screenshot({ path: `${out}/adv-boon.png` });
await page.check(".sinless-advance-dialog input[name=boon][value=resilience]", { force: true });
await page.selectOption(".sinless-advance-dialog select[name=pool]", "finesse");
await page.click(".sinless-advance-dialog button[data-action=take]");
await page.waitForTimeout(1200);
console.log("after boon2", JSON.stringify(await state()));
await page.screenshot({ path: `${out}/adv-sheet.png` });

// Weapon test: free Kismet die from resilience
await ben(() => { const b = game.actors.getName("SMOKE D Ben"); b.rollWeapon(b.items.getName("Heavy Pistol")); });
await page.waitForSelector(".sinless-test-dialog");
await page.waitForTimeout(300);
console.log("test preview", (await page.textContent(".sinless-test-preview")).trim());
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1500);
console.log("after test", JSON.stringify(await state()), "plan", await ben(() => JSON.stringify(game.messages.contents.at(-1).flags.sinless.test.plan)));
await ben(() => game.actors.getName("SMOKE D Ben").stabilize());

// Undo last (resilience)
await page.click(".sinless.sheet .advance-log summary");
await page.click(".sinless.sheet [data-action=undoAdvance]");
await page.waitForSelector(".application.dialog button[data-action=yes]");
await page.click(".application.dialog button[data-action=yes]");
await page.waitForTimeout(1200);
console.log("after undo", JSON.stringify(await state()));
await page.click(".sinless.sheet .advance-log summary").catch(() => {});
await page.waitForTimeout(300);
const box = await page.locator(".sinless.sheet .kismet-block").boundingBox();
await page.screenshot({ path: `${out}/adv-block.png`, clip: { x: box.x - 5, y: box.y - 5, width: box.width + 10, height: box.height + 10 } });

await ben(async o => { const b = game.actors.getName("SMOKE D Ben"); b.sheet.close(); await b.update({ "system.kismet": o.kismet, "system.skills.firearms.rank": o.firearms }); }, orig);
console.log("logs", JSON.stringify(logs.filter(l => !/favicon|404|WebGL|hardware/.test(l)), null, 1));
await browser.close();
