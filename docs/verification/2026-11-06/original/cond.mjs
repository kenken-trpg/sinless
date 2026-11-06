import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM({});
page.setDefaultTimeout(8000);
const clean = () => page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
await clean();
const lastCard = () => page.evaluate(() => { const m = game.messages.contents.at(-1); const el = document.querySelector(`[data-message-id="${m.id}"] .sinless-card`); return el?.textContent.replace(/\s+/g, " ").trim(); });

// 1. Ben: physical full with overflow 5
const setup = await page.evaluate(async () => {
  for (const c of game.combats.contents) await c.delete();
  const ben = game.actors.getName("SMOKE D Ben");
  for (const id of ["unconscious", "bleeding", "dead"]) await ben.toggleStatusEffect(id, { active: false });
  const max = ben.system.condition.physical.max;
  await ben.update({ "system.condition.physical.value": max, "system.condition.stun.value": 3, "system.condition.overflow": 5, "system.condition.bleedOut": null });
  return { max, body: ben.system.attributes.bod.value, brawn: ben.system.pools.brawn.max, penalty: ben.system.condition.penalty, tests: ben.overloadTests };
});
console.log("setup", JSON.stringify(setup));
await page.evaluate(() => game.actors.getName("SMOKE D Ben").sheet.render(true));
await page.waitForTimeout(1500);
const st = await page.locator(".sinless.sheet .condition-status").boundingBox();
await page.screenshot({ path: `${out}/cond-sheet.png`, clip: { x: st.x - 400, y: st.y - 120, width: st.width + 420, height: st.height + 140 } });
await page.click(".sinless.sheet [data-action=rollOverload][data-track=physical]");
await page.waitForSelector(".sinless-test-dialog");
await page.waitForTimeout(300);
console.log("overload dialog", (await page.textContent(".sinless-test-preview")).trim(), "threshold", await page.inputValue(".sinless-test-dialog input[name=threshold]"), "rank", await page.inputValue(".sinless-test-dialog input[name=rank]"));
await page.fill(".sinless-test-dialog input[name=threshold]", "99");
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1500);
console.log("overload card", await lastCard());
await page.evaluate(() => { const m = game.messages.contents.at(-1); document.querySelector(`[data-message-id="${m.id}"] [data-sinless-action=apply-overload]`)?.click(); });
await page.waitForTimeout(1500);
console.log("after apply", await lastCard(), JSON.stringify(await page.evaluate(() => { const b = game.actors.getName("SMOKE D Ben"); return { statuses: [...b.statuses], bleedOut: b.system.condition.bleedOut }; })));
await page.waitForTimeout(500);
const st2 = await page.locator(".sinless.sheet .condition-status").boundingBox();
await page.screenshot({ path: `${out}/cond-sheet2.png`, clip: { x: st2.x - 400, y: st2.y - 120, width: st2.width + 420, height: st2.height + 140 } });
await page.evaluate(() => game.actors.getName("SMOKE D Ben").sheet.close());

// 2. Combat: bleed-out tick and the overload prompt for the guard (stun full)
const combat = await page.evaluate(async () => {
  const ben = game.actors.getName("SMOKE D Ben");
  const tokens = canvas.tokens.placeables.filter(t => ["SMOKE D Ben", "SMOKE D Guard"].includes(t.name));
  const guard = tokens.find(t => t.name === "SMOKE D Guard").actor;
  for (const id of ["unconscious", "bleeding", "dead"]) await guard.toggleStatusEffect(id, { active: false });
  await guard.update({ "system.condition.stun.value": guard.system.condition.stun.max, "system.condition.physical.value": 2, "system.condition.overflow": 0 });
  const c = await Combat.create({ scene: canvas.scene.id, active: true });
  await c.createEmbeddedDocuments("Combatant", tokens.map(t => ({ tokenId: t.id, sceneId: canvas.scene.id, actorId: t.actor.id })));
  await c.setInitiative(c.combatants.find(x => x.name === "SMOKE D Ben").id, 20);
  await c.setInitiative(c.combatants.find(x => x.name === "SMOKE D Guard").id, 10);
  const before = ben.system.condition.bleedOut;
  const n0 = game.messages.size;
  await c.startCombat();
  await new Promise(r => setTimeout(r, 800));
  await c.nextTurn();
  await new Promise(r => setTimeout(r, 1500));
  const promptMsg = game.messages.contents.slice(n0).find(m => m.getFlag("sinless", "overloadPrompt"));
  await c.nextRound();
  await new Promise(r => setTimeout(r, 1500));
  return { before, after: ben.system.condition.bleedOut, prompt: promptMsg ? promptMsg.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : null, whisper: promptMsg?.whisper?.length };
});
console.log("combat", JSON.stringify(combat));
await page.screenshot({ path: `${out}/cond-chat.png` });
// Roll from the prompt button
await page.evaluate(() => { const m = game.messages.contents.findLast(m => m.getFlag("sinless", "overloadPrompt")); document.querySelector(`[data-message-id="${m.id}"] [data-sinless-action=overload]`)?.click(); });
await page.waitForSelector(".sinless-test-dialog");
await page.waitForTimeout(300);
console.log("guard dialog title", await page.textContent(".sinless-test-dialog .window-title"), "threshold", await page.inputValue(".sinless-test-dialog input[name=threshold]"));
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1500);
console.log("guard card", await lastCard());

// 3. Bleed out to death
const death = await page.evaluate(async () => {
  const ben = game.actors.getName("SMOKE D Ben");
  await ben.update({ "system.condition.bleedOut": 1 });
  await game.combat.nextRound();
  await new Promise(r => setTimeout(r, 1500));
  const m = game.messages.contents.at(-1);
  return { statuses: [...ben.statuses], bleedOut: ben.system.condition.bleedOut, msg: m.content.replace(/<[^>]+>/g, "").trim(), defeated: game.combat.combatants.find(c => c.actor === ben)?.isDefeated };
});
console.log("death", JSON.stringify(death));

// 4. Killed outright
const killed = await page.evaluate(async () => {
  const guard = canvas.tokens.placeables.find(t => t.name === "SMOKE D Guard").actor;
  await guard.update({ "system.condition.stun.value": 0, "system.condition.physical.value": 0 });
  const max = guard.system.condition.physical.max;
  await guard.applyDamage({ hit: true, raw: max + 1, armorReduction: 0, afterArmor: max + 1, final: max + 1, track: "physical", stripped: [], source: "test" });
  await new Promise(r => setTimeout(r, 800));
  const m = game.messages.contents.at(-1);
  return { statuses: [...guard.statuses], text: m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
});
console.log("killed", JSON.stringify(killed));

// 5. Permanent injury
const ben0 = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(game.actors.getName("SMOKE D Ben").system.attributes).map(([k, a]) => [k, a.max]))));
await page.evaluate(() => { game.actors.getName("SMOKE D Ben").rollPermanentInjury(); });
await page.waitForSelector(".sinless-test-dialog");
await page.waitForTimeout(300);
console.log("injury dialog", (await page.textContent(".sinless-test-preview")).trim(), "threshold", await page.inputValue(".sinless-test-dialog input[name=threshold]"));
await page.fill(".sinless-test-dialog input[name=rank]", "0");
await page.fill(".sinless-test-dialog input[name=bonus]", "1");
await page.dispatchEvent(".sinless-test-dialog input[name=bonus]", "input");
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1500);
console.log("injury card", await lastCard());
await page.evaluate(() => { const m = game.messages.contents.at(-1); document.querySelector(`[data-message-id="${m.id}"] [data-sinless-action=apply-organ]`)?.click(); });
await page.waitForTimeout(1500);
const ben1 = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(game.actors.getName("SMOKE D Ben").system.attributes).map(([k, a]) => [k, a.max]))));
console.log("attr max before", ben0, "after", ben1, "card", await lastCard());
await page.screenshot({ path: `${out}/cond-injury.png` });

// cleanup
await page.evaluate(async (orig) => {
  for (const c of game.combats.contents) await c.delete();
  const ben = game.actors.getName("SMOKE D Ben");
  const o = JSON.parse(orig);
  const up = { "system.condition.physical.value": 0, "system.condition.stun.value": 0, "system.condition.overflow": 0, "system.condition.bleedOut": null };
  for (const [k, v] of Object.entries(o)) up[`system.attributes.${k}.max`] = v;
  await ben.update(up);
  const guard = canvas.tokens.placeables.find(t => t.name === "SMOKE D Guard").actor;
  await guard.update({ "system.condition.physical.value": 0, "system.condition.stun.value": 0, "system.condition.overflow": 0 });
  for (const a of [ben, guard]) for (const id of ["unconscious", "bleeding", "dead"]) await a.toggleStatusEffect(id, { active: false });
}, ben0);
console.log("logs", JSON.stringify(logs.filter(l => !/favicon|404|WebGL|hardware/.test(l)), null, 1));
await browser.close();
