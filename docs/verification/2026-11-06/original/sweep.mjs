// Sweep: every actor / item sheet, every tab, every editable input, in one language.
// usage: node sweep.mjs <outdir> <lang>
import { joinGM } from "./lib.mjs";
const out = process.argv[2];
const lang = process.argv[3] ?? "ja";
const { browser, page, logs } = await joinGM({});
page.setDefaultTimeout(60000);
if ((await page.evaluate(() => game.i18n.lang)) !== lang) {
  await page.evaluate(l => localStorage.setItem("core.language", JSON.stringify(l)), lang);
  await page.reload();
  await page.waitForFunction(() => window.game?.ready, null, { timeout: 90000 });
  await page.waitForTimeout(2000);
}
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
console.log("lang", await page.evaluate(() => game.i18n.lang));

// ---- setup
await page.evaluate(async () => {
  for (const a of game.actors.filter(a => a.name.startsWith("SWEEP"))) await a.delete();
  for (const i of game.items.filter(i => i.name.startsWith("SWEEP"))) await i.delete();
  const itemTypes = Object.keys(CONFIG.Item.dataModels);
  const items = itemTypes.map(t => ({ name: `SWEEP ${t}`, type: t }));
  const ch = await Actor.create({ name: "SWEEP Char", type: "character" });
  await ch.createEmbeddedDocuments("Item", items);
  await ch.createEmbeddedDocuments("ActiveEffect", [{ name: "SWEEP FX", system: {} }]);
  const npc = await Actor.create({ name: "SWEEP Npc", type: "npc" });
  await npc.createEmbeddedDocuments("Item", items);
  await Actor.create({ name: "SWEEP Entity", type: "npc", system: { network: { entity: true, hardening: 2 } } });
  await Actor.create({ name: "SWEEP Spirit", type: "npc", system: { spiritForce: 3 } });
  await Actor.create({ name: "SWEEP Vehicle", type: "vehicle" });
  await Actor.create({ name: "SWEEP Brand", type: "brand", system: { members: [ch.id] } });
  await Item.createDocuments(itemTypes.map(t => ({ name: `SWEEP W ${t}`, type: t })));
});

// ---- in-page sweep of one document's sheet
const sweep = (uuid) => page.evaluate(async uuid => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const doc = await fromUuid(uuid);
  const sheet = doc.sheet;
  const res = { name: doc.name, type: doc.type, tabs: {}, bad: [], inputs: 0, ok: 0, mismatch: [], skipped: 0 };
  await sheet.render(true);
  for (let i = 0; i < 40 && !sheet.rendered; i++) await sleep(100);
  await sleep(500);
  const scan = where => {
    const t = sheet.element.innerText;
    const m = t.match(/SINLESS\.[\w.]+|\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b|Infinity/g);
    if (m) res.bad.push(`${where}: ${[...new Set(m)].join(", ")}`);
    // unlocalized attributes (placeholders, titles, tooltips)
    for (const el of sheet.element.querySelectorAll("[placeholder],[title],[data-tooltip]")) {
      for (const a of ["placeholder", "title", "data-tooltip"]) {
        const v = el.getAttribute(a);
        if (v && /^SINLESS\.|undefined|\[object/.test(v)) res.bad.push(`${where} @${a}: ${v}`);
      }
    }
  };
  const tabs = sheet.constructor.TABS?.primary?.tabs?.map(t => t.id) ?? [null];
  for (const tab of tabs) {
    if (tab) { sheet.changeTab(tab, "primary"); await sleep(250); }
    res.tabs[tab ?? "-"] = sheet.element.querySelector(`.tab[data-tab="${tab}"]`)?.innerText.trim().length ?? sheet.element.innerText.length;
    scan(tab ?? "sheet");
  }
  // Inputs: change each editable field and check the document follows.
  const names = [...new Set([...sheet.element.querySelectorAll("input[name], select[name], textarea[name]")]
    .filter(e => !e.disabled && !e.readOnly && e.type !== "hidden" && e.type !== "file")
    .map(e => e.name))];
  for (const name of names) {
    const el = sheet.element.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!el || el.disabled || el.readOnly) { res.skipped++; continue; }
    const before = foundry.utils.getProperty(doc, name);
    if (before === undefined && !foundry.utils.hasProperty(doc._source, name)) { res.skipped++; continue; }
    res.inputs++;
    let want;
    if (el.type === "checkbox") { el.checked = !el.checked; want = el.checked; }
    else if (el.tagName === "SELECT") {
      const opts = [...el.options].map(o => o.value).filter(v => v !== el.value);
      if (!opts.length) { res.skipped++; res.inputs--; continue; }
      want = opts.at(-1); el.value = want;
      if (el.dataset.dtype === "Number" || typeof before === "number") want = Number(want);
    } else if (el.type === "number" || el.type === "range") {
      const cur = Number(el.value) || 0;
      const max = el.max !== "" ? Number(el.max) : Infinity, min = el.min !== "" ? Number(el.min) : -Infinity;
      const step = el.step && el.step !== "any" ? Number(el.step) : 1;
      want = cur + step <= max ? cur + step : cur - step;
      if (want < min) { res.skipped++; res.inputs--; continue; }
      el.value = String(want);
    } else {
      want = typeof before === "number" ? (Number(el.value) || 0) + 1 : `SW${Math.floor(Math.random() * 90 + 10)}`;
      el.value = String(want);
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    let after;
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      after = foundry.utils.getProperty(doc, name);
      if (after === want || (typeof want === "number" && Number(after) === want) || (Array.isArray(after) && after.includes?.(want))) break;
    }
    const same = after === want || (typeof want === "number" && Number(after) === want) || String(after) === String(want);
    if (same) res.ok++;
    else res.mismatch.push(`${name}: ${JSON.stringify(before)} → want ${JSON.stringify(want)} got ${JSON.stringify(after)}`);
  }
  // re-scan every tab after the edits
  for (const tab of tabs) { if (tab) { sheet.changeTab(tab, "primary"); await sleep(150); } scan(`after:${tab}`); }
  res.bad = [...new Set(res.bad)];
  await sheet.close();
  return res;
}, uuid);

const targets = await page.evaluate(() => [
  ...game.actors.filter(a => a.name.startsWith("SWEEP")).map(a => a.uuid),
  ...game.actors.getName("SWEEP Char").items.map(i => i.uuid),
  ...game.items.filter(i => i.name.startsWith("SWEEP W ")).map(i => i.uuid)
]);
const results = [];
for (const uuid of targets) {
  const n0 = logs.length;
  let r;
  try { r = await sweep(uuid); } catch (e) { r = { uuid, crash: e.message.slice(0, 300) }; }
  r.errors = logs.slice(n0).filter(l => !/favicon|404|WebGL|hardware|GPU/.test(l));
  results.push(r);
  const flag = (r.crash || r.bad?.length || r.mismatch?.length || r.errors.length) ? "!!" : "ok";
  console.log(flag, r.type, r.name, `inputs ${r.ok}/${r.inputs} skipped ${r.skipped}`, JSON.stringify(r.tabs ?? {}));
  for (const k of ["crash", "bad", "mismatch", "errors"]) if (r[k]?.length) console.log("   ", k, JSON.stringify(r[k], null, 1));
}
// screenshot of a re-opened, fuzzed character sheet
await page.evaluate(async () => { const a = game.actors.getName("SWEEP Char"); await a.sheet.render(true); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/sweep-${lang}.png` });
await page.evaluate(async () => {
  for (const a of game.actors.filter(a => a.name.startsWith("SWEEP"))) await a.delete();
  for (const i of game.items.filter(i => i.name.startsWith("SWEEP"))) await i.delete();
});
if (lang !== "ja") await page.evaluate(() => localStorage.setItem("core.language", JSON.stringify("ja")));
console.log("total", results.length, "problems", results.filter(r => r.crash || r.bad?.length || r.mismatch?.length || r.errors.length).length);
await browser.close();
