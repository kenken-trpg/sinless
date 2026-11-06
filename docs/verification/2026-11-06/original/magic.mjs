import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM();
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const setup = await page.evaluate(async () => {
  const ben = game.actors.getName("SMOKE D Ben");
  for (const i of ben.items.filter(i => i.type === "power")) await i.delete();
  await ben.update({ "system.skills.sorcery.rank": 5, "system.skills.channeling.rank": 3, "system.skills.conjuring.rank": 4,
    "system.condition.stun.value": 0, "system.condition.physical.value": 0, "system.talent": "archmage" });
  const z0 = ben.system.zoetic.raw;
  await ben.createEmbeddedDocuments("Item", [
    { name: "Powerbolt", type: "power", system: { category: "spell", school: "Incantor", force: 6, drain: "3 + (Force/2)", resistPool: "brawn", damage: "Force", focus: 2, fetish: 1 } },
    { name: "Manon Bolt", type: "power", system: { category: "spell", force: 4, drain: "3 + (Force/2)", resistPool: "resolve", damage: "1+Force", damageTrack: "stun" } },
    { name: "Old Spell", type: "power", system: { category: "spell", force: 3, drain: "Force", resistance: "Resolve pool (optional)" } },
    { name: "Fire Spirit", type: "power", system: { category: "spirit", force: 3, spiritBag: 1, focus: 1 } },
    { name: "Attribute Boost", type: "power", system: { category: "amplification", zoeticCost: 1 } }
  ]);
  const zArch = ben.system.zoetic.raw;
  await ben.update({ "system.talent": "amp" });
  const zAmp = ben.system.zoetic.raw;
  await ben.update({ "system.talent": "archmage" });
  const old = ben.items.getName("Old Spell").system;
  const guardTok = canvas.tokens.placeables.find(t => t.name === "SMOKE D Guard");
  guardTok?.setTarget(true, { releaseOthers: true });
  return { z0, zArch, zAmp, zoeticValue: ben.system.zoetic.value, oldResist: old.resistPool, oldOptional: old.resistOptional };
});
console.log("setup", JSON.stringify(setup));

// Cast Powerbolt at force 4
await page.evaluate(() => { const b = game.actors.getName("SMOKE D Ben"); b.usePower(b.items.getName("Powerbolt")); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
await page.fill(".sinless-test-dialog input[name=force]", "4");
await page.dispatchEvent(".sinless-test-dialog input[name=force]", "input");
await page.waitForTimeout(300);
console.log("cast dialog:", (await page.textContent(".sinless-test-preview")).trim());
await page.screenshot({ path: out + "/cast-dialog.png" });
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1800);
const card = await page.evaluate(() => { const m = game.messages.contents.at(-1); const el = document.querySelector(`[data-message-id="${m.id}"] .sinless-card`);
  return { text: el?.textContent.replace(/\s+/g, " ").trim(), spell: m.flags.sinless.test.extra.spell, dmg: m.flags.sinless.test.extra.damage, succ: m.flags.sinless.test.final.filter(d => d >= m.flags.sinless.test.target).length }; });
console.log("cast card", JSON.stringify(card));
await page.screenshot({ path: out + "/cast-card.png" });

// Defender resists (guard has fixed soak 4 -> used for Brawn resistance)
const hasDefend = await page.evaluate(() => { const m = game.messages.contents.at(-1); const b = document.querySelector(`[data-message-id="${m.id}"] [data-sinless-action=defend]`); b?.click(); return !!b; });
if (hasDefend) {
  await page.waitForSelector(".sinless-damage-dialog", { timeout: 10000 });
  await page.waitForTimeout(300);
  const dlg = await page.evaluate(() => ({ armorFieldset: [...document.querySelectorAll(".sinless-damage-dialog legend")].map(l => l.textContent), resistLabel: document.querySelector(".sinless-damage-dialog [data-sinless-roll=resist]")?.closest(".form-group")?.querySelector("label")?.textContent }));
  console.log("defend dialog", JSON.stringify(dlg));
  await page.click(".sinless-damage-dialog [data-sinless-roll=resist]");
  await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.click(".sinless-test-dialog button[data-action=roll]");
  await page.waitForTimeout(1500);
  await page.fill(".sinless-damage-dialog input[name=hits]", "4");
  await page.fill(".sinless-damage-dialog input[name=dodge]", "1");
  await page.fill(".sinless-damage-dialog input[name=soak]", "0");
  await page.dispatchEvent(".sinless-damage-dialog input[name=soak]", "input");
  await page.waitForTimeout(300);
  console.log("defend preview:", await page.textContent(".sinless-damage-preview"), "| last roll:", await page.evaluate(() => game.messages.contents.at(-1).flags.sinless.test.label + " dice=" + game.messages.contents.at(-1).flags.sinless.test.initial.length));
  await page.click(".sinless-damage-dialog button[data-action=cancel]");
  await page.waitForTimeout(500);
} else console.log("no defend button (0 successes)");

// Resist drain from the cast card
await page.evaluate(() => { const m = game.messages.contents.findLast(m => m.flags.sinless?.test?.extra?.spell); document.querySelector(`[data-message-id="${m.id}"] [data-sinless-action=resist-drain]`).click(); });
await page.waitForSelector(".sinless-damage-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
console.log("drain dialog:", await page.textContent(".sinless-drain-preview"), "| lethal:", await page.$eval(".sinless-damage-dialog input[name=lethal]", e => e.checked), "| soak disabled:", await page.$eval(".sinless-damage-dialog input[name=soak]", e => e.disabled));
await page.click(".sinless-damage-dialog [data-sinless-roll=channel]");
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
const chanPreview = await page.textContent(".sinless-test-preview");
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1500);
console.log("channel:", chanPreview, "| field:", await page.$eval(".sinless-damage-dialog input[name=channel]", e => e.value), "| preview:", await page.textContent(".sinless-drain-preview"));
await page.screenshot({ path: out + "/drain-dialog.png" });
await page.click(".sinless-damage-dialog button[data-action=apply]");
await page.waitForTimeout(1500);
console.log("after drain", JSON.stringify(await page.evaluate(() => { const b = game.actors.getName("SMOKE D Ben"); const m = game.messages.contents.findLast(m => m.flags.sinless?.test?.extra?.spell);
  return { phys: b.system.condition.physical.value, stun: b.system.condition.stun.value, applied: m.flags.sinless.test.extra.spell.applied, lastCard: game.messages.contents.at(-1).content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) }; })));

// Summon and invoke the spirit
await page.evaluate(() => { const b = game.actors.getName("SMOKE D Ben"); b.usePower(b.items.getName("Fire Spirit")); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1500);
console.log("summon:", await page.evaluate(() => { const m = game.messages.contents.at(-1); return document.querySelector(`[data-message-id="${m.id}"] .effect`)?.textContent + " (succ " + m.flags.sinless.test.final.filter(d => d >= m.flags.sinless.test.target).length + ")"; }));
await page.evaluate(() => { const b = game.actors.getName("SMOKE D Ben"); b.invokeSpirit(b.items.getName("Fire Spirit")); });
await page.waitForSelector(".sinless-damage-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
console.log("invoke drain:", await page.$eval(".sinless-damage-dialog input[name=drain]", e => e.value), "| lethal:", await page.$eval(".sinless-damage-dialog input[name=lethal]", e => e.checked), "|", await page.textContent(".sinless-drain-preview"));
await page.click(".sinless-damage-dialog button[data-action=cancel]");
await page.evaluate(async () => { const b = game.actors.getName("SMOKE D Ben"); await b.sheet.render(true); await new Promise(r => setTimeout(r, 800)); b.sheet.changeTab("magic", "primary"); });
await page.waitForTimeout(1000);
await page.screenshot({ path: out + "/magic-tab.png" });
await page.evaluate(async () => { const b = game.actors.getName("SMOKE D Ben"); await b.update({ "system.condition.stun.value": 0, "system.condition.physical.value": 0 }); });
console.log("LOGS\n" + logs.filter(l => !/completecompendium|eberron|dnd5e|WebGL|hardware acceleration/.test(l)).join("\n"));
await browser.close();
