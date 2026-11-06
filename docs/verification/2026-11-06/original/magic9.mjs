import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM({});
page.setDefaultTimeout(40000);
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const ev = (fn, a) => page.evaluate(fn, a);
const wait = ms => page.waitForTimeout(ms);
const lastText = () => ev(() => { const m = game.messages.contents.at(-1); return document.querySelector(`[data-message-id="${m.id}"]`)?.textContent.replace(/\s+/g, " ").trim(); });
const texts = n0 => ev(n => game.messages.contents.slice(n).map(m => m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()), n0);
const count = () => ev(() => game.messages.size);
const clickCard = sel => ev(s => { const m = game.messages.contents.at(-1); document.querySelector(`[data-message-id="${m.id}"] ${s}`)?.click(); }, sel);
const target = name => ev(n => { for (const t of [...game.user.targets]) t.setTarget(false, { releaseOthers: false }); canvas.tokens.placeables.find(t => t.name === n)?.setTarget(true, { releaseOthers: true }); }, name);
const rollDialog = async ({ bonus = 12, ward = null } = {}) => {
  await page.waitForSelector(".sinless-test-dialog"); await wait(400);
  if (ward !== null) { await page.fill(".sinless-test-dialog input[name=ward]", String(ward)); await page.dispatchEvent(".sinless-test-dialog input[name=ward]", "input"); }
  if (bonus) { await page.fill(".sinless-test-dialog input[name=bonus]", String(bonus)); await page.dispatchEvent(".sinless-test-dialog input[name=bonus]", "input"); }
  await wait(200);
  const preview = (await page.textContent(".sinless-test-dialog .sinless-test-preview")).replace(/\s+/g, " ").trim();
  await page.click(".sinless-test-dialog button[data-action=roll]"); await wait(2500);
  return preview;
};

const setup = await ev(async () => {
  for (const c of game.combats.contents) await c.delete();
  const ben = game.actors.getName("SMOKE D Ben");
  for (const i of ben.items.filter(i => i.name.startsWith("SMOKE M "))) await i.delete();
  for (const n of ["SMOKE Spark Spirit"]) await game.actors.getName(n)?.delete();
  const spirit = await Actor.create({ name: "SMOKE Spark Spirit", type: "npc", system: { defenses: { dodge: 2, soak: null, resist: null }, conditionMax: { physical: 6, stun: 6 } } });
  await ben.update({ "system.skills.sorcery.rank": 4, "system.skills.conjuring.rank": 4, "system.leyLine.kind": "on", "system.leyLine.force": 2,
    "system.pools.resolve.spent": 0, "system.condition.stun.value": 0, "system.condition.physical.value": 0 });
  await ben.createEmbeddedDocuments("Item", [
    { name: "SMOKE M Hold", type: "power", system: { category: "spell", force: 4, drain: "Force/2", resistPool: "resolve", duration: "1 round per point of force", effect: "Target cannot move." } },
    { name: "SMOKE M Shatter", type: "power", system: { category: "spell", force: 3, drain: "3 + Force", duration: "Instantaneous", shatterWard: true } },
    { name: "SMOKE M Spark", type: "power", system: { category: "spirit", force: 3, spiritBag: 0, spiritActor: spirit.uuid } }
  ]);
  const scene = game.scenes.getName("SMOKE Scene");
  await scene.view();
  for (const t of scene.tokens.filter(t => /SMOKE (D Ben|D Guard|Spark Spirit)/.test(t.name))) await t.delete();
  const place = async (a, x) => { const td = await a.getTokenDocument({ x, y: 300 }); return (await scene.createEmbeddedDocuments("Token", [td.toObject()]))[0]; };
  await place(ben, 300); await place(game.actors.getName("SMOKE D Guard"), 700);
  return { ley: ben.system.leyLine };
});
console.log("setup", JSON.stringify(setup));
await wait(1500);

// 1. Magic tab with the ley line bar
await ev(() => { const s = game.actors.getName("SMOKE D Ben").sheet; s.render(true); });
await wait(1500);
await ev(() => game.actors.getName("SMOKE D Ben").sheet.changeTab("magic", "primary")); await wait(600);
await page.screenshot({ path: `${out}/magic9-tab.png` });
await ev(() => game.actors.getName("SMOKE D Ben").sheet.close()); await wait(500);

// 2. Continuous spell on the guard
await target("SMOKE D Guard");
await ev(() => { const b = game.actors.getName("SMOKE D Ben"); b.castSpell(b.items.getName("SMOKE M Hold")); });
console.log("hold dialog:", await rollDialog({ bonus: 6 }));
console.log("hold card:", await lastText());
await page.screenshot({ path: `${out}/magic9-hold-card.png` });
let n0 = await count();
await clickCard("[data-sinless-action=apply-sustained]");
await page.waitForSelector(".sinless-damage-dialog"); await wait(400);
await page.fill(".sinless-damage-dialog input[name=resist]", "1"); await page.dispatchEvent(".sinless-damage-dialog input[name=resist]", "input"); await wait(200);
console.log("sustain preview:", await page.textContent(".sinless-damage-dialog .sinless-damage-preview"));
await page.screenshot({ path: `${out}/magic9-sustain-dialog.png` });
await page.click(".sinless-damage-dialog button[data-action=apply]"); await wait(4000);
const guardFx = () => ev(() => { const a = canvas.tokens.placeables.find(t => t.name === "SMOKE D Guard").actor; return a.effects.map(e => ({ name: e.name, s: e.flags.sinless?.sustained })); });
console.log("guard effects", JSON.stringify(await guardFx()), JSON.stringify(await texts(n0)));
// turn prompt + resist from it
n0 = await count();
await ev(async () => { const { promptOverload } = await import("/systems/sinless/module/documents/combat.mjs"); await promptOverload(canvas.tokens.placeables.find(t => t.name === "SMOKE D Guard").actor); });
await wait(1500);
console.log("prompt:", await lastText());
await clickCard("[data-sinless-action=resist-sustained]");
await page.waitForSelector(".sinless-test-dialog"); await wait(300);
console.log("resist dialog:", (await page.textContent(".sinless-test-dialog .sinless-test-preview")).replace(/\s+/g, " ").trim());
await page.click(".sinless-test-dialog button[data-action=roll]"); await wait(4000);
console.log("after resist", JSON.stringify(await guardFx()), JSON.stringify((await texts(n0)).slice(-1)));
// Guard sheet effects tab
await ev(() => { const a = canvas.tokens.placeables.find(t => t.name === "SMOKE D Guard").actor; a.sheet.render(true); }); await wait(1500);
await ev(() => canvas.tokens.placeables.find(t => t.name === "SMOKE D Guard").actor.sheet.changeTab("effects", "primary")); await wait(500);
await page.screenshot({ path: `${out}/magic9-effects.png` });
await ev(() => canvas.tokens.placeables.find(t => t.name === "SMOKE D Guard").actor.sheet.close());

// 3. Ward crossed
await ev(() => { const b = game.actors.getName("SMOKE D Ben"); b.castSpell(b.items.getName("SMOKE M Hold")); });
await rollDialog({ bonus: 0, ward: 2 });
console.log("ward card:", await lastText());

// 4. Shatter Ward vs a force 9 ward
await ev(() => { const b = game.actors.getName("SMOKE D Ben"); b.castSpell(b.items.getName("SMOKE M Shatter")); });
await rollDialog({ bonus: 0, ward: 9 });
console.log("shatter card:", await lastText());

// 5. Summon the spark spirit and place it
await ev(() => { const b = game.actors.getName("SMOKE D Ben"); b.usePower(b.items.getName("SMOKE M Spark")); });
console.log("summon dialog:", await rollDialog({ bonus: 8 }));
console.log("summon card:", await lastText());
n0 = await count();
await clickCard("[data-sinless-action=place-spirit]"); await wait(3000);
const sp = await ev(() => { const t = canvas.scene.tokens.find(t => t.name.startsWith("SMOKE Spark Spirit")); return t ? { name: t.name, x: t.x, y: t.y, force: t.actor.system.spiritForce, disp: t.disposition } : null; });
console.log("spirit token", JSON.stringify(sp), JSON.stringify(await texts(n0)));
await page.screenshot({ path: `${out}/magic9-spirit.png` });
await ev(() => { const t = canvas.tokens.placeables.find(t => t.name.startsWith("SMOKE Spark Spirit")); t.actor.rollDefense("dodge", { attack: "physical" }); });
await page.waitForSelector(".sinless-test-dialog"); await wait(300);
console.log("spirit dodge vs physical:", (await page.textContent(".sinless-test-dialog .sinless-test-preview")).replace(/\s+/g, " ").trim(), "|", (await page.textContent(".sinless-test-dialog .notes")).replace(/\s+/g, " "));
await page.click(".sinless-test-dialog button[data-action=cancel]"); await wait(400);

// cleanup
await ev(async () => {
  for (const t of [...game.user.targets]) t.setTarget(false, { releaseOthers: false });
  const scene = game.scenes.getName("SMOKE Scene");
  for (const t of scene.tokens.filter(t => /SMOKE Spark Spirit/.test(t.name))) await t.delete();
  const g = scene.tokens.find(t => t.name === "SMOKE D Guard")?.actor;
  for (const e of g?.effects.filter(e => e.flags.sinless?.sustained) ?? []) await e.delete();
  await game.actors.getName("SMOKE Spark Spirit")?.delete();
  const ben = game.actors.getName("SMOKE D Ben");
  for (const i of ben.items.filter(i => i.name.startsWith("SMOKE M "))) await i.delete();
  await ben.update({ "system.leyLine.kind": "none", "system.leyLine.force": 0, "system.pools.resolve.spent": 0, "system.condition.stun.value": 0, "system.condition.physical.value": 0 });
});
console.log("logs", JSON.stringify(logs.filter(l => !/favicon|404|WebGL|hardware/.test(l)), null, 1));
await browser.close();
