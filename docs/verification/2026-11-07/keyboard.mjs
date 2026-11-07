// Keyboard use of the sheet controls: action links are focusable buttons, Enter and Space
// click them, and focus stays on the control after the sheet re-renders.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { joinGM } from "../lib.mjs";
const outDir = process.env.SINLESS_VERIFY_OUT ?? "/private/tmp/sinless-verification";
const { browser, page, logs } = await joinGM({ noCanvas: true });
page.setDefaultTimeout(20000);
const out = {};
let f;

const pass = (name, data) => { out[name] = data; console.log("PASS", name, JSON.stringify(data)); };
const get = (uuid, path) => page.evaluate(({ uuid, path }) => fromUuid(uuid).then(d => foundry.utils.getProperty(d, path)), { uuid, path });
/** Focus `selector` on the character sheet (on `tab`). */
const focus = (selector, tab = null) => page.evaluate(async ({ uuid, selector, tab }) => {
  const sheet = (await fromUuid(uuid)).sheet;
  if (tab) sheet.changeTab(tab, "primary");
  const el = sheet.element.querySelector(selector);
  el?.focus();
  return document.activeElement === el;
}, { uuid: f.ch, selector, tab });
/** What has focus: its action and data attributes, and whether it is in the character sheet. */
const focused = () => page.evaluate(async uuid => {
  const sheet = (await fromUuid(uuid)).sheet;
  const el = document.activeElement;
  return { inSheet: sheet.element.contains(el), action: el?.dataset.action ?? null, n: el?.dataset.n ?? null, pressed: el?.getAttribute("aria-pressed") ?? null };
}, f.ch);
/** Wait until the sheet has re-rendered after a keypress. */
const settle = () => page.waitForTimeout(600);

try {
  f = await page.evaluate(async () => {
    const ch = await Actor.create({ name: "VERIFY KB Char", type: "character" });
    const [gear] = await ch.createEmbeddedDocuments("Item", [{ name: "VERIFY KB Gear", type: "gear" }]);
    await ch.sheet.render(true);
    for (let i = 0; i < 40 && !ch.sheet.rendered; i++) await new Promise(r => setTimeout(r, 50));
    return { ch: ch.uuid, id: ch.id, gear: gear.id, gearUuid: gear.uuid };
  });
  await page.waitForTimeout(300);

  // Every action link is a focusable button with a name.
  const links = await page.evaluate(async uuid => {
    const sheet = (await fromUuid(uuid)).sheet;
    const all = [...sheet.element.querySelectorAll("a[data-action]:not([href])")];
    return {
      count: all.length,
      notFocusable: all.filter(a => a.tabIndex !== 0 || a.getAttribute("role") !== "button").map(a => a.dataset.action),
      unnamed: all.filter(a => !a.textContent.trim() && !a.getAttribute("aria-label")).map(a => a.dataset.action)
    };
  }, f.ch);
  assert.ok(links.count > 10, `links: ${links.count}`);
  assert.deepEqual({ notFocusable: links.notFocusable, unnamed: links.unnamed }, { notFocusable: [], unnamed: [] });
  pass("action links are named, focusable buttons", { count: links.count });

  // Enter on a condition box fills the track to it; focus stays on that box.
  const box = n => `[data-action=setCondition][data-track=physical][data-n='${n}']`;
  assert.ok(await focus(box(2)), "box 2 takes focus");
  await page.keyboard.press("Enter");
  await settle();
  const afterEnter = { value: await get(f.ch, "system.condition.physical.value"), ...(await focused()) };
  assert.deepEqual(afterEnter, { value: 2, inSheet: true, action: "setCondition", n: "2", pressed: "true" });
  pass("Enter fills a box and keeps focus", afterEnter);

  // Tab moves to the next box; Space fills up to it.
  await page.keyboard.press("Tab");
  assert.deepEqual(await focused(), { inSheet: true, action: "setCondition", n: "3", pressed: "false" });
  await page.keyboard.press(" ");
  await settle();
  const afterSpace = { value: await get(f.ch, "system.condition.physical.value"), ...(await focused()) };
  assert.deepEqual(afterSpace, { value: 3, inSheet: true, action: "setCondition", n: "3", pressed: "true" });
  pass("Tab reaches the next box, Space fills it", afterSpace);

  // Space on an item toggle flips the field; focus returns to the toggle in the same row.
  const toggle = `[data-item-id="${f.gear}"] [data-action=itemToggle]`;
  assert.ok(await focus(toggle, "gear"), "toggle takes focus");
  const field = await page.evaluate(async ({ uuid, toggle }) => (await fromUuid(uuid)).sheet.element.querySelector(toggle).dataset.field, { uuid: f.ch, toggle });
  const before = await get(f.gearUuid, `system.${field}`);
  await page.keyboard.press(" ");
  await settle();
  const t = { field, from: before, to: await get(f.gearUuid, `system.${field}`), ...(await focused()) };
  assert.deepEqual(t, { field, from: before, to: !before, inSheet: true, action: "itemToggle", n: null, pressed: String(!before) });
  pass("Space toggles an item and keeps focus", t);

  // Enter on the edit link opens the item sheet, and focus is not pulled back to the actor sheet.
  assert.ok(await focus(`[data-item-id="${f.gear}"] [data-action=itemEdit]`, "gear"));
  await page.keyboard.press("Enter");
  await settle();
  const opened = await page.evaluate(id => [...foundry.applications.instances.values()].some(a => a.rendered && a.document?.id === id), f.gear);
  assert.equal(opened, true, "item sheet opened");
  pass("Enter on edit opens the item sheet", { opened });

  const errors = logs.filter(l => l.startsWith("pageerror") || /sinless/i.test(l) && l.startsWith("error"));
  assert.deepEqual(errors, []);
  pass("no page errors", { errors: 0 });
} finally {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/keyboard.json`, JSON.stringify(out, null, 1));
  if (f) await page.evaluate(async f => {
    for (const app of [...foundry.applications.instances.values()]) if (app.document?.name?.startsWith("VERIFY KB") || app.document?.parent?.name?.startsWith("VERIFY KB")) await app.close();
    await game.actors.get(f.id)?.delete();
  }, f).catch(e => console.error("cleanup", e.message));
  await browser.close();
}
