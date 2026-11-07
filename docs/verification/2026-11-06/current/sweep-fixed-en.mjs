import {writeFileSync} from "node:fs";
// Sweep: every actor / item sheet, every tab, every editable input, in one language.
// usage: node sweep.mjs <outdir> <lang>
import { joinGM } from "../../lib.mjs";
const out = process.argv[2];
const lang = process.argv[3] ?? "ja";
const { browser, page, logs } = await joinGM({});
page.setDefaultTimeout(60000); page.on("console",m=>{if(m.text().startsWith("VERIFY-PROGRESS"))console.log(m.text());});
if ((await page.evaluate(() => game.i18n.lang)) !== lang) {
  await page.evaluate(l => localStorage.setItem("core.language", JSON.stringify(l)), lang);
  await page.reload();
  await page.waitForFunction(() => window.game?.ready, null, { timeout: 90000 });
  await page.waitForTimeout(2000);
}
await page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
console.log("lang", await page.evaluate(() => game.i18n.lang));

// ---- setup
const fixtures = await page.evaluate(async () => {
  for (const a of game.actors.filter(a => a.name.startsWith("VERIFY-en"))) await a.delete();
  for (const i of game.items.filter(i => i.name.startsWith("VERIFY-en"))) await i.delete();
  const itemTypes = Object.keys(CONFIG.Item.dataModels);
  const items = itemTypes.map(t => ({ name: `VERIFY-en ${t}`, type: t }));
  const ch = await Actor.create({ name: "VERIFY-en Char", type: "character" });
  await ch.createEmbeddedDocuments("Item", items);
  await ch.createEmbeddedDocuments("ActiveEffect", [{ name: "VERIFY-en FX", system: {} }]);
  const npc = await Actor.create({ name: "VERIFY-en Npc", type: "npc" });
  await npc.createEmbeddedDocuments("Item", items);
  await Actor.create({ name: "VERIFY-en Entity", type: "npc", system: { network: { entity: true, hardening: 2 } } });
  await Actor.create({ name: "VERIFY-en Spirit", type: "npc", system: { spiritForce: 3 } });
  await Actor.create({ name: "VERIFY-en Vehicle", type: "vehicle" });
  await Actor.create({ name: "VERIFY-en Brand", type: "brand", system: { members: [ch.id] } });
  const worlds = await Item.createDocuments(itemTypes.map(t => ({ name: "VERIFY-en W "+t, type: t })));
  const actors = game.actors.filter(a => a.name.startsWith("VERIFY-en"));
  return {characterUuid:ch.uuid,actorIds:actors.map(a=>a.id),itemIds:worlds.map(i=>i.id),targets:[...actors.map(a=>a.uuid),...ch.items.map(i=>i.uuid),...worlds.map(i=>i.uuid)]};
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
    // English UI: Japanese text leaking from the ja locale or hard-coded strings.
    const cjk = t.match(/[\u3040-\u30ff\u3400-\u9fff\uff01-\uff60]+/g);
    if (cjk) res.bad.push(`${where} ja-text: ${[...new Set(cjk)].slice(0, 10).join(", ")}`);
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
    res.inputs++; if(res.inputs % 20 === 0) console.info("VERIFY-PROGRESS "+res.name+" "+res.inputs);
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

const targets = fixtures.targets;
const results = [];
try {
for (const uuid of targets) {
  const n0 = logs.length;
  let r;
  // Bound each sheet so one hang does not stall the whole sweep.
  try { r = await Promise.race([sweep(uuid), new Promise((_, reject) => setTimeout(() => reject(new Error("sheet timeout 180s")), 180000))]); }
  catch (e) { r = { uuid, crash: e.message.slice(0, 300) }; await page.screenshot({ path: `${out}/crash-${results.length}.png` }).catch(() => {}); }
  r.errors = logs.slice(n0).filter(l => !/favicon|404|WebGL|hardware|GPU/.test(l));
  results.push(r);
  const flag = (r.crash || r.bad?.length || r.mismatch?.length || r.errors.length) ? "!!" : "ok";
  console.log(flag, r.type, r.name, `inputs ${r.ok}/${r.inputs} skipped ${r.skipped}`, JSON.stringify(r.tabs ?? {}));
  for (const k of ["crash", "bad", "mismatch", "errors"]) if (r[k]?.length) console.log("   ", k, JSON.stringify(r[k], null, 1));
}
// screenshot of a re-opened, fuzzed character sheet
await page.evaluate(async uuid => { const a = await fromUuid(uuid); await a.sheet.render(true); },fixtures.characterUuid);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/sweep-${lang}.png` });
} finally {
await page.evaluate(async f=>{for(const id of f.actorIds) await game.actors.get(id)?.delete();for(const id of f.itemIds) await game.items.get(id)?.delete();},fixtures);
}
if (lang !== "ja") await page.evaluate(() => localStorage.setItem("core.language", JSON.stringify("ja")));
console.log("total", results.length, "problems", results.filter(r => r.crash || r.bad?.length || r.mismatch?.length || r.errors.length).length);
writeFileSync(out + "/report-"+lang+".json",JSON.stringify(results,null,2));
await browser.close();
if(results.some(r=>r.crash||r.bad?.length||r.mismatch?.length||r.errors.length)) process.exitCode=1;
