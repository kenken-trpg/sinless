import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM();
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const setup = await page.evaluate(async () => {
  const ben = game.actors.getName("SMOKE D Ben");
  for (const i of ben.items.filter(i => ["deck", "software"].includes(i.type))) await i.delete();
  await ben.update({ "system.skills.hacking.rank": 4, "system.skills.electronicWarfare.rank": 3, "system.grid.influence": 0, "system.grid.mcpSpent": 0, "system.pools.focus.spent": 0 });
  await ben.createEmbeddedDocuments("Item", [
    { name: "Mars Claymore", type: "deck", system: { mcp: 7, hardening: 4, threads: 7, core: 2, io: 3, mods: 1 } },
    { name: "Hacking", type: "software", system: { base: true, rating: 4, skill: "hacking" } },
    { name: "Electric Strike", type: "software", system: { rating: 3, skill: "hacking", requiresNan: true, attack: true, alert: 15 } },
    { name: "Shadow Protocols", type: "software", system: { rating: 2, skill: "hacking", io: "optional", reducesAlert: true, running: true } },
    { name: "Acid Burn", type: "software", system: { rating: 2, skill: "electronicWarfare", alert: 3, attack: true } }
  ]);
  await game.settings.set("sinless", "intrusion", "secure");
  await game.settings.set("sinless", "alert", 0);
  // Put Ben in an active combat so pools (and MCP dice) are spent.
  const scene = game.scenes.getName("SMOKE Scene");
  for (const t of scene.tokens.filter(t => t.name === "SMOKE D Ben")) await t.delete();
  const td = await ben.getTokenDocument({ x: 300, y: 300 });
  const [tok] = await scene.createEmbeddedDocuments("Token", [td.toObject()]);
  for (const c of game.combats.contents) await c.delete();
  const combat = await Combat.create({ scene: scene.id, active: true });
  await combat.createEmbeddedDocuments("Combatant", [{ tokenId: tok.id, sceneId: scene.id, actorId: ben.id }]);
  await combat.startCombat();
  return { deck: ben.system.grid.deckId ? ben.deck.name : null, mcp: ben.system.grid.mcp, focus: ben.system.pools.focus, conflict: ben.inConflict };
});
console.log("setup", JSON.stringify(setup));

await page.evaluate(() => { game.actors.getName("SMOKE D Ben").rollNanHack("brute"); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
console.log("brute dialog:", await page.textContent(".sinless-test-preview"), "| penalty:", await page.$eval(".sinless-test-dialog input[name=penalty]", e => e.value), "| notes:", await page.textContent(".sinless-test-dialog .notes"));
await page.fill(".sinless-test-dialog input[name=poolDice]", "9");
await page.waitForTimeout(200);
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1800);
const brute = await page.evaluate(() => {
  const m = game.messages.contents.at(-1); const t = m.flags.sinless.test; const ben = game.actors.getName("SMOKE D Ben");
  const el = document.querySelector(`[data-message-id="${m.id}"]`);
  return { dice: t.initial.length, mcpUsed: t.mcpUsed, mcpSpent: ben.system.grid.mcpSpent, focusSpent: ben.system.pools.focus.spent,
    text: el?.querySelector(".grid-result")?.textContent.replace(/\s+/g, " ").trim(), buttons: [...(el?.querySelectorAll(".grid-result button") ?? [])].length };
});
console.log("brute card", JSON.stringify(brute));
await page.screenshot({ path: out + "/grid-card.png" });
// Apply influence and alert from the card
for (const action of ["apply-influence", "apply-alert"]) {
  await page.evaluate(a => { const m = game.messages.contents.at(-1); document.querySelector(`[data-message-id="${m.id}"] [data-sinless-action=${a}]`)?.click(); }, action);
  await page.waitForTimeout(1200);
}
console.log("applied", JSON.stringify(await page.evaluate(() => {
  const m = game.messages.contents.at(-1); const ben = game.actors.getName("SMOKE D Ben");
  return { influence: ben.system.grid.influence, alert: game.settings.get("sinless", "alert"), x: m.flags.sinless.test.extra,
    text: document.querySelector(`[data-message-id="${m.id}"] .grid-result`)?.textContent.replace(/\s+/g, " ").trim() };
})));

// Electric Strike: alert 15 reduced by Shadow Protocols 2
await page.evaluate(() => { const b = game.actors.getName("SMOKE D Ben"); b.rollSoftware(b.items.getName("Electric Strike")); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
console.log("strike dialog:", await page.textContent(".sinless-test-preview"));
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1500);
console.log("strike card:", await page.evaluate(() => { const m = game.messages.contents.at(-1); return document.querySelector(`[data-message-id="${m.id}"] .grid-result`)?.textContent.replace(/\s+/g, " ").trim(); }));

// Grid tab
await page.evaluate(async () => { const b = game.actors.getName("SMOKE D Ben"); await b.sheet.render(true); await new Promise(r => setTimeout(r, 800)); b.sheet.changeTab("grid", "primary"); });
await page.waitForTimeout(1000);
console.log("tab:", await page.evaluate(() => { const el = game.actors.getName("SMOKE D Ben").sheet.element; return { status: el.querySelector(".grid-status")?.textContent.replace(/\s+/g, " ").trim(), deck: el.querySelector(".deck-stats")?.textContent.replace(/\s+/g, " ").trim(), issues: el.querySelector(".deck-panel .issues")?.textContent.trim() ?? null, boxes: el.querySelectorAll(".track-cohesion .box").length }; }));
await page.screenshot({ path: out + "/grid-tab.png" });

// Refresh pools resets MCP
await page.evaluate(async () => { await game.actors.getName("SMOKE D Ben").refreshPools(); });
console.log("after refresh mcpSpent:", await page.evaluate(() => game.actors.getName("SMOKE D Ben").system.grid.mcpSpent));
await page.evaluate(async () => { for (const c of game.combats.contents) await c.delete(); await game.settings.set("sinless", "intrusion", "open"); await game.settings.set("sinless", "alert", 0); });
console.log("LOGS\n" + logs.filter(l => !/completecompendium|eberron|dnd5e|WebGL|hardware acceleration/.test(l)).join("\n"));
await browser.close();
