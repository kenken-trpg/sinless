import { writeFileSync } from "node:fs";
// Sweep: every actor / item sheet, every tab, every editable input, in one language.
// usage: node sweep-fixed.mjs <outdir> <lang>
// The English sweep also flags Japanese text left in the sheets.
// Sheets are spread over SINLESS_SWEEP_WORKERS sessions (default 3). Each change waits for
// the server and the sheet's re-render, so separate sessions run side by side.
// The sessions run without the game canvas, which the sheets do not need.
// An actor and its own items stay in one session, so their renders never overlap.
// Foundry allows one session per user, so the extra sessions join as temporary GM users.
import { joinGM } from "../../lib.mjs";
const out = process.argv[2];
const lang = process.argv[3] ?? "ja";
const workers = Math.max(1, Number(process.env.SINLESS_SWEEP_WORKERS) || 3);
const prefix = `SWEEP-${lang}`;

/** A GM session in the sweep language. */
async function session(browser, user) {
  const s = await joinGM({ browser, user, noCanvas: true });
  s.page.setDefaultTimeout(60000);
  s.page.on("console", m => { if (m.text().startsWith("VERIFY-PROGRESS")) console.log(m.text()); });
  if ((await s.page.evaluate(() => game.i18n.lang)) !== lang) {
    await s.page.evaluate(l => localStorage.setItem("core.language", JSON.stringify(l)), lang);
    await s.page.reload();
    await s.page.waitForFunction(() => window.game?.ready, null, { timeout: 90000 });
    await s.page.waitForTimeout(2000);
  }
  await s.page.evaluate(() => document.querySelectorAll(".tour, .tour-overlay, #notifications li").forEach(e => e.remove()));
  return s;
}

const main = await session();
const { browser, page } = main;
console.log("lang", await page.evaluate(() => game.i18n.lang), "workers", workers);

// ---- setup: groups of sheets that must not run at the same time
const fixtures = await page.evaluate(async prefix => {
  for (const a of game.actors.filter(a => a.name.startsWith(prefix))) await a.delete();
  for (const i of game.items.filter(i => i.name.startsWith(prefix))) await i.delete();
  for (const u of game.users.filter(u => u.name.startsWith(prefix))) await u.delete();
  const itemTypes = Object.keys(CONFIG.Item.dataModels);
  const items = itemTypes.map(t => ({ name: `${prefix} ${t}`, type: t }));
  const ch = await Actor.create({ name: `${prefix} Char`, type: "character" });
  await ch.createEmbeddedDocuments("Item", items);
  await ch.createEmbeddedDocuments("ActiveEffect", [{ name: `${prefix} FX`, system: {} }]);
  const npc = await Actor.create({ name: `${prefix} Npc`, type: "npc" });
  await npc.createEmbeddedDocuments("Item", items);
  const entity = await Actor.create({ name: `${prefix} Entity`, type: "npc", system: { network: { entity: true, hardening: 2 } } });
  const spirit = await Actor.create({ name: `${prefix} Spirit`, type: "npc", system: { spiritForce: 3 } });
  const vehicle = await Actor.create({ name: `${prefix} Vehicle`, type: "vehicle" });
  const brand = await Actor.create({ name: `${prefix} Brand`, type: "brand", system: { members: [ch.id] } });
  const worlds = await Item.createDocuments(itemTypes.map(t => ({ name: `${prefix} W ${t}`, type: t })));
  const actors = [ch, npc, entity, spirit, vehicle, brand];
  return {
    characterUuid: ch.uuid,
    actorIds: actors.map(a => a.id),
    itemIds: worlds.map(i => i.id),
    groups: [
      [ch.uuid, ...ch.items.map(i => i.uuid)],
      [npc.uuid, ...npc.items.map(i => i.uuid)],
      [entity.uuid], [spirit.uuid], [vehicle.uuid], [brand.uuid],
      ...worlds.map(i => [i.uuid])
    ]
  };
}, prefix);

// ---- in-page sweep of one document's sheet
const sweep = (page, uuid, checkJapanese) => page.evaluate(async ({ uuid, checkJapanese }) => {
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
    if (checkJapanese) {
      const cjk = t.match(/[぀-ヿ㐀-鿿！-｠]+/g);
      if (cjk) res.bad.push(`${where} ja-text: ${[...new Set(cjk)].slice(0, 10).join(", ")}`);
    }
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
    res.inputs++; if (res.inputs % 20 === 0) console.info("VERIFY-PROGRESS " + res.name + " " + res.inputs);
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
    for (let i = 0; i < 120; i++) {
      await sleep(25);
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
}, { uuid, checkJapanese });

const order = fixtures.groups.flat();
const results = [];
const extra = [];
const report = r => {
  const flag = (r.crash || r.bad?.length || r.mismatch?.length || r.errors.length) ? "!!" : "ok";
  console.log(flag, r.type, r.name, `inputs ${r.ok}/${r.inputs} skipped ${r.skipped}`, JSON.stringify(r.tabs ?? {}));
  for (const k of ["crash", "bad", "mismatch", "errors"]) if (r[k]?.length) console.log("   ", k, JSON.stringify(r[k], null, 1));
};
const started = Date.now();
try {
  const count = Math.min(workers, fixtures.groups.length) - 1;
  fixtures.userIds = await page.evaluate(async ({ prefix, count }) => {
    const users = await User.createDocuments(Array.from({ length: count }, (_, i) => ({ name: `${prefix} GM ${i + 2}`, role: CONST.USER_ROLES.GAMEMASTER })));
    return users.map(u => u.id);
  }, { prefix, count });
  for (let i = 0; i < count; i++) extra.push(await session(browser, `${prefix} GM ${i + 2}`));
  const sessions = [main, ...extra];
  // Biggest groups first, each session taking the next group when it is free.
  const queue = [...fixtures.groups];
  await Promise.all(sessions.map(async ({ page: p, logs: l }, w) => {
    for (let group; (group = queue.shift());) {
      for (const uuid of group) {
        const n0 = l.length;
        let r;
        // Bound each sheet so one hang does not stall the whole sweep.
        let timer;
        try { r = await Promise.race([sweep(p, uuid, lang === "en"), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("sheet timeout 300s")), 300000); })]); }
        catch (e) { r = { uuid, crash: e.message.slice(0, 300) }; await p.screenshot({ path: `${out}/crash-${order.indexOf(uuid)}.png` }).catch(() => {}); }
        finally { clearTimeout(timer); }
        r.errors = l.slice(n0).filter(x => !/favicon|404|WebGL|hardware|GPU/.test(x));
        r.worker = w;
        results[order.indexOf(uuid)] = r;
        report(r);
      }
    }
  }));
  console.log("sweep", Math.round((Date.now() - started) / 1000), "s with", sessions.length, "sessions");
  // screenshot of a re-opened, fuzzed character sheet
  await page.evaluate(async uuid => { const a = await fromUuid(uuid); await a.sheet.render(true); }, fixtures.characterUuid);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/sweep-${lang}.png` });
} finally {
  await page.evaluate(async f => {
    for (const id of f.actorIds) await game.actors.get(id)?.delete();
    for (const id of f.itemIds) await game.items.get(id)?.delete();
    for (const id of f.userIds ?? []) await game.users.get(id)?.delete();
  }, fixtures);
}
const problems = results.filter(r => r.crash || r.bad?.length || r.mismatch?.length || r.errors.length);
console.log("total", results.length, "problems", problems.length);
writeFileSync(`${out}/report-${lang}.json`, JSON.stringify(results, null, 2));
await browser.close();
if (problems.length || results.filter(Boolean).length !== order.length) process.exitCode = 1;
