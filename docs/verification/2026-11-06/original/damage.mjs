import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM();
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const setup = await page.evaluate(async () => {
  for (const a of game.actors.filter(a => a.name.startsWith("SMOKE D"))) await a.delete();
  const atk = await Actor.create({ name: "SMOKE D Ben", type: "character", system: {
    attributes: { str: { value: 12 }, bod: { value: 8 }, rea: { value: 12 }, int: { value: 6 }, wil: { value: 6 }, cha: { value: 4 } },
    skills: { firearms: { rank: 6 }, meleeWeapons: { rank: 4 } } } });
  await atk.createEmbeddedDocuments("Item", [
    { name: "Assault Rifle", type: "weapon", system: { category: "firearm", skill: "firearms", accuracy: 2, damage: "6", penetration: 4 } },
    { name: "Axe", type: "weapon", system: { category: "melee", skill: "meleeWeapons", damage: "½ Str +5", penetration: 0 } }
  ]);
  const guard = await Actor.create({ name: "SMOKE D Guard", type: "npc", system: { armorBonus: { ballistic: 4, impact: 1 }, conditionMax: { physical: 6, stun: 6 } } });
  let scene = game.scenes.getName("SMOKE Scene");
  if (!scene.active) await scene.activate();
  await new Promise(r => setTimeout(r, 3000));
  for (const t of scene.tokens.filter(t => t.name.startsWith("SMOKE D"))) await t.delete();
  const td = await guard.getTokenDocument({ x: 500, y: 500 });
  const [tok] = await scene.createEmbeddedDocuments("Token", [td.toObject()]);
  await new Promise(r => setTimeout(r, 1500));
  const placeable = canvas.tokens?.get(tok.id);
  placeable?.setTarget(true, { releaseOthers: true });
  return { canvas: !!canvas.ready, targets: game.user.targets.size, skills: Object.keys(atk.system.skills).filter(k => /melee|fire/i.test(k)) };
});
console.log("setup", JSON.stringify(setup));

const before = await page.evaluate(() => game.messages.size);
await page.evaluate(() => { const a = game.actors.getName("SMOKE D Ben"); a.rollWeapon(a.items.getName("Assault Rifle")); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(2000);
const card = await page.evaluate(b => {
  const m = game.messages.contents.at(-1);
  return { new: game.messages.size - b, extra: m.flags.sinless?.test?.extra, buttons: [...document.querySelectorAll("#chat [data-sinless-action^=defend]")].map(e => e.textContent.trim()).slice(-2) };
}, before);
console.log("card", JSON.stringify(card));
await page.screenshot({ path: out + "/attack-card.png" });

// Open the damage dialog from the card and resolve Ben's example: 4 hits, dodge 2, soak 1.
await page.evaluate(() => {
  const m = game.messages.contents.at(-1);
  const el = document.querySelector(`#chat [data-message-id="${m.id}"] [data-sinless-action=defend]`) ?? document.querySelector(`[data-message-id="${m.id}"] [data-sinless-action=defend]`);
  el.click();
});
await page.waitForSelector(".sinless-damage-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
await page.fill(".sinless-damage-dialog input[name=hits]", "4");
await page.fill(".sinless-damage-dialog input[name=dodge]", "2");
await page.fill(".sinless-damage-dialog input[name=soak]", "1");
await page.waitForTimeout(300);
console.log("preview:", await page.textContent(".sinless-damage-preview"));
await page.screenshot({ path: out + "/damage-dialog.png" });
await page.click(".sinless-damage-dialog button[data-action=apply]");
await page.waitForTimeout(1500);
const applied = await page.evaluate(() => {
  const g = game.scenes.getName("SMOKE Scene").tokens.find(t => t.name === "SMOKE D Guard").actor;
  const m = game.messages.contents.at(-1);
  return { physical: g.system.condition.physical.value, stun: g.system.condition.stun.value, card: m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
});
console.log("applied", JSON.stringify(applied));

// Roll dodge from inside the dialog (NPC rolls its Finesse pool).
await page.evaluate(() => {
  const m = game.messages.contents.findLast(m => m.flags.sinless?.test?.extra?.weapon);
  document.querySelector(`[data-message-id="${m.id}"] [data-sinless-action=defend]`).click();
});
await page.waitForSelector(".sinless-damage-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
await page.click(".sinless-damage-dialog [data-sinless-roll=dodge]");
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1500);
const dodge = await page.evaluate(() => ({
  field: document.querySelector(".sinless-damage-dialog input[name=dodge]")?.value,
  last: (() => { const m = game.messages.contents.at(-1); return `${m.flags.sinless?.test?.label} ${m.flags.sinless?.test?.final}`; })()
}));
console.log("dodge", JSON.stringify(dodge));
await page.click(".sinless-damage-dialog button[data-action=cancel]");
await page.waitForTimeout(500);

// Melee: ½ Str + 5 with Str 12 → 11, impact armor.
await page.evaluate(() => { const a = game.actors.getName("SMOKE D Ben"); a.rollWeapon(a.items.getName("Axe")); });
await page.waitForSelector(".sinless-test-dialog", { timeout: 10000 });
await page.waitForTimeout(300);
await page.click(".sinless-test-dialog button[data-action=roll]");
await page.waitForTimeout(1500);
console.log("melee", JSON.stringify(await page.evaluate(() => game.messages.contents.at(-1).flags.sinless.test.extra)));
await page.screenshot({ path: out + "/melee-card.png" });
console.log("LOGS\n" + logs.filter(l => !/completecompendium|eberron|dnd5e|WebGL|hardware acceleration/.test(l)).join("\n"));
await browser.close();
