import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const { browser, page, logs } = await joinGM();
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
const r = await page.evaluate(async () => {
  const a = game.actors.getName("SMOKE D Ben");
  for (const i of a.items.filter(i => i.name.startsWith("FX"))) await i.delete();
  for (const e of a.effects.contents) await e.delete();
  const before = { str: a.system.attributes.str.value, brawn: a.system.pools.brawn.max, finesse: a.system.pools.finesse.max, phys: a.system.condition.physical.max, fire: a.system.skills.firearms.rank };
  const [toner, smart] = await a.createEmbeddedDocuments("Item", [
    { name: "FX Muscle Toner", type: "implant", system: { zoeticCost: 0.5 } },
    { name: "FX Smartlink", type: "gear", system: { carried: true } }
  ]);
  await toner.createEmbeddedDocuments("ActiveEffect", [{ name: "Muscle Toner", system: { changes: [
    { key: "system.attributes.str.value", type: "add", value: 2 },
    { key: "system.pools.finesse.bonus", type: "add", value: 1 },
    { key: "system.condition.physical.bonus", type: "add", value: 2 }
  ] } }]);
  await smart.createEmbeddedDocuments("ActiveEffect", [{ name: "Smartlink", system: { changes: [
    { key: "system.skills.firearms.rank", type: "add", value: 1 }
  ] } }]);
  const after = { str: a.system.attributes.str.value, srcStr: a._source.system.attributes.str.value, brawn: a.system.pools.brawn.max, finesse: a.system.pools.finesse.max, phys: a.system.condition.physical.max, fire: a.system.skills.firearms.rank };
  await smart.update({ "system.carried": false });
  const uncarried = { fire: a.system.skills.firearms.rank, suppressed: smart.effects.contents[0].isSuppressed };
  await smart.update({ "system.carried": true });
  await a.sheet.render(true);
  await new Promise(r => setTimeout(r, 1200));
  const el = a.sheet.element;
  const sheet = {
    strInput: el.querySelector("input[name='system.attributes.str.value']").value,
    effective: el.querySelector(".attribute .effective")?.textContent.trim(),
    fireDisabled: el.querySelector("input[name='system.skills.firearms.rank']").disabled,
    fireValue: el.querySelector("input[name='system.skills.firearms.rank']").value,
    tabs: [...el.querySelectorAll("nav [data-tab]")].map(t => t.dataset.tab)
  };
  return { before, after, uncarried, sheet };
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: out + "/fx-main.png" });

// Editing base STR keeps the effect on top
const edited = await page.evaluate(async () => {
  const a = game.actors.getName("SMOKE D Ben");
  const input = a.sheet.element.querySelector("input[name='system.attributes.str.value']");
  input.value = "13"; input.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 1000));
  const res = { src: a._source.system.attributes.str.value, eff: a.system.attributes.str.value };
  input.value = "12"; input.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 800));
  return res;
});
console.log("edited", JSON.stringify(edited));

// Effects tab and actor-level effect via the create button
await page.evaluate(() => game.actors.getName("SMOKE D Ben").sheet.changeTab("effects", "primary"));
await page.waitForTimeout(500);
await page.evaluate(() => game.actors.getName("SMOKE D Ben").sheet.element.querySelector("[data-action=effectCreate]").click());
await page.waitForTimeout(1500);
const created = await page.evaluate(async () => {
  const a = game.actors.getName("SMOKE D Ben");
  const e = a.effects.contents[0];
  const cfg = Object.values(foundry.applications.instances ? Object.fromEntries(foundry.applications.instances) : {}).find(w => w.document === e);
  await cfg?.close();
  await e.update({ "system.changes": [{ key: "system.initiativeBonus", type: "add", value: 3 }] });
  const ib = a.system.initiativeBonus;
  a.sheet.element.querySelector(`[data-effect-uuid="${e.uuid}"] [data-action=effectToggle]`).click();
  await new Promise(r => setTimeout(r, 800));
  return { name: e.name, ib, disabledAfterToggle: e.disabled, ibAfter: a.system.initiativeBonus,
    rows: [...a.sheet.element.querySelectorAll(".effects-list .effect")].map(li => li.textContent.replace(/\s+/g, " ").trim()) };
});
console.log("created", JSON.stringify(created, null, 1));
await page.screenshot({ path: out + "/fx-tab.png" });

// Item sheet effects part
await page.evaluate(async () => { const a = game.actors.getName("SMOKE D Ben"); await a.sheet.close(); await a.items.getName("FX Muscle Toner").sheet.render(true); });
await page.waitForTimeout(1200);
await page.screenshot({ path: out + "/fx-item.png" });
console.log("LOGS\n" + logs.filter(l => !/completecompendium|eberron|dnd5e|WebGL|hardware acceleration/.test(l)).join("\n"));
await browser.close();
