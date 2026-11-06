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

// Setup
const setup = await ev(async () => {
  for (const c of game.combats.contents) await c.delete();
  const ben = game.actors.getName("SMOKE D Ben");
  for (const i of ben.items.filter(i => ["deck", "software"].includes(i.type))) await i.delete();
  await ben.update({ "system.skills.hacking.rank": 4, "system.skills.electronicWarfare.rank": 4, "system.grid.influence": 10, "system.grid.mcpSpent": 0,
    "system.pools.focus.spent": 0, "system.condition.physical.value": 0, "system.condition.stun.value": 0 });
  await ben.createEmbeddedDocuments("Item", [
    { name: "Mars Claymore", type: "deck", system: { mcp: 7, hardening: 4, threads: 7, core: 2, io: 3, mods: 1, nerveRig: true } },
    { name: "Hacking", type: "software", system: { base: true, rating: 4, skill: "hacking" } },
    { name: "De-rez", type: "software", system: { rating: 4, skill: "electronicWarfare", io: "yes", alert: 5, attack: true, digitalAttack: "derez" } },
    { name: "Acid Burn", type: "software", system: { rating: 4, skill: "electronicWarfare", alert: 3, attack: true, digitalAttack: "acid" } },
    { name: "Electric Strike", type: "software", system: { rating: 3, skill: "hacking", requiresNan: true, attack: true, alert: 15, digitalAttack: "strike" } }
  ]);
  for (const n of ["SMOKE BEE", "SMOKE Sensor", "SMOKE RNID", "SMOKE NPC Decker"]) await game.actors.getName(n)?.delete();
  const mk = (name, network, stun, defenses, extra = {}) => Actor.create({ name, type: "npc", system: { network, conditionMax: { physical: 6, stun }, defenses, ...extra } });
  const bee = await mk("SMOKE BEE", { entity: true, hardening: 3 }, 6, { dodge: 8, soak: null, resist: null });
  await bee.createEmbeddedDocuments("Item", [{ name: "Sting", type: "weapon", system: { category: "melee", attackDice: 8, damage: "3", digital: true, ignoreHardening: 4 } }]);
  const sensor = await mk("SMOKE Sensor", { entity: true, hardening: 2, alertAura: 2 }, 3, { dodge: 2, soak: null, resist: null });
  const rnid = await mk("SMOKE RNID", { entity: true, hardening: 3, shrinkDice: 4, shrinkMeters: 2 }, 6, { dodge: 5, soak: null, resist: null });
  const decker = await Actor.create({ name: "SMOKE NPC Decker", type: "npc", system: { skills: { hacking: { rank: 4 } } } });
  await decker.createEmbeddedDocuments("Item", [
    { name: "Shingo Activa", type: "deck", system: { mcp: 5, hardening: 3, threads: 5, core: 1, io: 2 } },
    { name: "Hacking", type: "software", system: { base: true, rating: 3, skill: "hacking" } }
  ]);
  const scene = game.scenes.getName("SMOKE Scene");
  await scene.view();
  for (const t of scene.tokens.filter(t => /SMOKE (D Ben|BEE|Sensor|RNID)/.test(t.name))) await t.delete();
  const place = async (a, x) => { const td = await a.getTokenDocument({ x, y: 300 }); return (await scene.createEmbeddedDocuments("Token", [td.toObject()]))[0]; };
  await place(ben, 300); await place(bee, 500); await place(sensor, 700); await place(rnid, 900);
  await game.settings.set("sinless", "intrusion", "open");
  await game.settings.set("sinless", "alert", 0);
  return { benHardening: ben.hardening, hot: ben.hotseated, beeEntity: bee.isEntity, beeTrack: bee.system.condition.physical.max + "/" + bee.system.condition.stun.max, sensor: ben.sensorAlert };
});
console.log("setup", JSON.stringify(setup));
await wait(1500);
const target = name => ev(n => { for (const t of [...game.user.targets]) t.setTarget(false, { releaseOthers: false }); canvas.tokens.placeables.find(t => t.name === n)?.setTarget(true, { releaseOthers: true }); }, name);
const rollDialog = async (bonus = 12) => {
  await page.waitForSelector(".sinless-test-dialog"); await wait(300);
  if (bonus) { await page.fill(".sinless-test-dialog input[name=bonus]", String(bonus)); await page.dispatchEvent(".sinless-test-dialog input[name=bonus]", "input"); }
  await page.click(".sinless-test-dialog button[data-action=roll]"); await wait(1500);
};
const clickCard = sel => ev(s => { const m = game.messages.contents.at(-1); document.querySelector(`[data-message-id="${m.id}"] ${s}`)?.click(); }, sel);
const digital = async (fill = {}) => {
  await page.waitForSelector(".sinless-damage-dialog"); await wait(400);
  for (const [k, v] of Object.entries(fill)) { await page.fill(`.sinless-damage-dialog input[name=${k}]`, String(v)); await page.dispatchEvent(`.sinless-damage-dialog input[name=${k}]`, "input"); }
  await wait(200);
  const preview = await page.textContent(".sinless-damage-dialog .sinless-damage-preview");
  await page.screenshot({ path: `${out}/digital-dialog-${Object.keys(fill).join("") || "x"}.png` });
  await page.click(".sinless-damage-dialog button[data-action=apply]"); await wait(6000);
  return preview;
};
const bee = () => ev(() => { const b = canvas.tokens.placeables.find(t => t.name === "SMOKE BEE").actor; return { cohesion: `${b.system.condition.stun.value}/${b.system.condition.stun.max}`, hardening: b.hardening, defeated: b.statuses.has(CONFIG.specialStatusEffects.DEFEATED) }; });

// 1. BEE sheet
await ev(() => game.actors.getName("SMOKE BEE").sheet.render(true)); await wait(1200);
await page.screenshot({ path: `${out}/digital-bee-main.png` });
await ev(() => game.actors.getName("SMOKE BEE").sheet.changeTab("grid", "primary")); await wait(600);
await page.screenshot({ path: `${out}/digital-bee-grid.png` });
await ev(() => game.actors.getName("SMOKE BEE").sheet.close());

// 2. De-rez on the BEE, with the sensor daemon on the scene
await target("SMOKE BEE");
await ev(() => { const b = game.actors.getName("SMOKE D Ben"); b.rollSoftware(b.items.getName("De-rez")); });
await rollDialog();
console.log("derez card:", await lastText());
await page.screenshot({ path: `${out}/digital-derez-card.png` });
let n0 = await count();
await clickCard("[data-sinless-action=defend]");
console.log("derez preview:", await digital({ defense: 0 }));
console.log("derez result:", JSON.stringify(await texts(n0)), JSON.stringify(await bee()));

// 3. Acid Burn on the BEE
await ev(() => { const b = game.actors.getName("SMOKE D Ben"); b.rollSoftware(b.items.getName("Acid Burn")); });
await rollDialog();
await clickCard("[data-sinless-action=defend]");
console.log("acid preview:", await digital({ defense: 1 }));
console.log("after acid", JSON.stringify(await bee()));

// 4. BEE stings Ben (hot-seated: physical, hardening 4 ignored)
await target("SMOKE D Ben");
await ev(() => { const b = game.actors.getName("SMOKE BEE"); b.rollWeapon(b.items.getName("Sting")); });
await rollDialog(0);
console.log("sting card:", await lastText());
n0 = await count();
await clickCard("[data-sinless-action=defend]");
console.log("sting preview:", await digital({ defense: 0 }));
console.log("ben after sting", JSON.stringify(await ev(() => { const b = game.actors.getName("SMOKE D Ben"); return b.system.condition; })), JSON.stringify(await texts(n0)));

// 5. RNID shrinks Ben's influence
await ev(() => game.actors.getName("SMOKE RNID").sheet.render(true)); await wait(1000);
await ev(() => game.actors.getName("SMOKE RNID").sheet.changeTab("grid", "primary")); await wait(500);
await page.screenshot({ path: `${out}/digital-rnid-grid.png` });
await page.click(".sinless.sheet [data-action=rollShrink]");
await rollDialog(0);
console.log("shrink card:", await lastText());
await page.screenshot({ path: `${out}/digital-shrink-card.png` });
n0 = await count();
await clickCard("[data-sinless-action=apply-shrink]"); await wait(4000);
console.log("after shrink", await ev(() => game.actors.getName("SMOKE D Ben").system.grid.influence), JSON.stringify(await texts(n0)), "|", await lastText());
await ev(() => game.actors.getName("SMOKE RNID").sheet.close());

// 6. Electric Strike crashes the BEE (machine ×2)
await target("SMOKE BEE");
await ev(() => { const b = game.actors.getName("SMOKE D Ben"); b.rollSoftware(b.items.getName("Electric Strike")); });
await rollDialog();
console.log("strike card:", await lastText());
n0 = await count();
await clickCard("[data-sinless-action=defend]");
console.log("strike preview:", await digital({}));
console.log("after strike", JSON.stringify(await bee()), JSON.stringify(await texts(n0)));

// 7. A bullet vs the sensor daemon: hardening as armor, dodge doubled
await target("SMOKE Sensor");
await ev(() => { const g = game.actors.getName("SMOKE D Guard"); g.rollWeapon(g.items.getName("SMOKE Pistol")); });
await rollDialog(0);
await clickCard("[data-sinless-action=defend]");
await page.waitForSelector(".sinless-damage-dialog"); await wait(400);
const armorNote = await page.textContent(".sinless-damage-dialog fieldset:nth-of-type(2) .notes");
await page.click(".sinless-damage-dialog [data-sinless-roll=dodge]");
await page.waitForSelector(".sinless-test-dialog"); await wait(300);
const dodgeDice = await page.textContent(".sinless-test-dialog .sinless-test-preview");
await page.click(".sinless-test-dialog button[data-action=roll]"); await wait(1200);
console.log("bullet vs sensor: armor", armorNote.replace(/\s+/g, " ").trim(), "| dodge dialog", dodgeDice.replace(/\s+/g, " ").trim());
await page.click(".sinless-damage-dialog button[data-action=cancel]"); await wait(500);

// 8. NPC decker: grid tab and brute force hack
await ev(() => game.actors.getName("SMOKE NPC Decker").sheet.render(true)); await wait(1000);
await ev(() => game.actors.getName("SMOKE NPC Decker").sheet.changeTab("grid", "primary")); await wait(500);
await page.screenshot({ path: `${out}/digital-npc-decker.png` });
await page.click(".sinless.sheet [data-action=rollNanHack][data-mode=brute]");
await rollDialog(0);
console.log("npc hack card:", await lastText());
await ev(() => game.actors.getName("SMOKE NPC Decker").sheet.close());

// cleanup
await ev(async () => {
  for (const t of [...game.user.targets]) t.setTarget(false, { releaseOthers: false });
  const scene = game.scenes.getName("SMOKE Scene");
  for (const t of scene.tokens.filter(t => /SMOKE (BEE|Sensor|RNID)/.test(t.name))) await t.delete();
  for (const n of ["SMOKE BEE", "SMOKE Sensor", "SMOKE RNID", "SMOKE NPC Decker"]) await game.actors.getName(n)?.delete();
  const ben = game.actors.getName("SMOKE D Ben");
  await ben.update({ "system.condition.physical.value": 0, "system.condition.stun.value": 0, "system.condition.overflow": 0, "system.grid.influence": 0, "system.grid.mcpSpent": 0, "system.pools.focus.spent": 0 });
  await game.settings.set("sinless", "alert", 0);
});
console.log("logs", JSON.stringify(logs.filter(l => !/favicon|404|WebGL|hardware/.test(l)), null, 1));
await browser.close();
