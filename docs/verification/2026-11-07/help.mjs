// The help window and its journal import: pages and languages, the GM's import and update
// (keeping pages the GM added), and a player who reads the help and the journal entry.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { joinGM, FOUNDRY_URL } from "../lib.mjs";
const outDir = process.env.SINLESS_VERIFY_OUT ?? "/private/tmp/sinless-verification";
const { browser, page, logs } = await joinGM();
page.setDefaultTimeout(20000);
const out = {};
let f, ctx;
const pass = (name, data) => { out[name] = data; console.log("PASS", name, JSON.stringify(data)); };
const helpState = p => p.evaluate(() => {
  const el = document.getElementById("sinless-help");
  return el && {
    pages: [...el.querySelectorAll(".help-nav a[data-page]")].map(a => a.textContent.trim()),
    active: el.querySelector(".help-nav a.active")?.dataset.page,
    heading: el.querySelector(".help-content h2")?.textContent.trim(),
    lang: el.querySelector("select[name=lang]")?.value,
    importButton: el.querySelector("[data-action=importJournal]")?.textContent.trim() ?? null
  };
});
try {
  f = await page.evaluate(async () => {
    const before = game.journal.filter(j => j.getFlag("sinless", "help")).map(j => j.id);
    const u = await User.create({ name: "VERIFY Help Player " + Date.now(), role: 1 });
    return { userId: u.id, journalsBefore: before };
  });
  assert.deepEqual(f.journalsBefore, [], "no help journal before the test");

  // GM: the tool is in the token controls and opens the window in the client language.
  const tool = await page.evaluate(() => !!ui.controls.controls.tokens?.tools?.sinlessHelp);
  assert.equal(tool, true);
  await page.evaluate(() => game.sinless.help.open());
  await page.waitForSelector("#sinless-help .help-content h2");
  let s = await helpState(page);
  const clientLang = await page.evaluate(() => game.i18n.lang);
  assert.equal(s.pages.length, 4);
  assert.equal(s.active, "getting-started");
  assert.equal(s.lang, ["en", "ja"].includes(clientLang) ? clientLang : "en");
  pass("gm opens help", { clientLang, ...s });

  // Page links and the language switch.
  await page.click("#sinless-help .help-nav a[data-page=chat-cards]");
  await page.waitForFunction(() => document.querySelector("#sinless-help .help-nav a.active")?.dataset.page === "chat-cards");
  s = await helpState(page);
  assert.equal(s.heading, s.pages[2]);
  pass("page link", s);
  for (const lang of ["en", "ja"]) {
    await page.selectOption("#sinless-help select[name=lang]", lang);
    await page.waitForFunction(l => document.querySelector("#sinless-help select[name=lang]")?.value === l, lang);
    await page.waitForTimeout(300);
    s = await helpState(page);
    assert.equal(s.active, "chat-cards", "the page stays when switching language");
    assert.equal(s.heading, lang === "ja" ? "チャットカードのボタン" : "Chat card buttons");
    pass(`language ${lang}`, s);
  }

  // Import (ja is shown), then add a GM page and update.
  await page.click("#sinless-help [data-action=importJournal]");
  await page.waitForFunction(() => game.journal.some(j => j.getFlag("sinless", "help") === "ja"));
  const imported = await page.evaluate(() => {
    const j = game.journal.find(e => e.getFlag("sinless", "help") === "ja");
    return { id: j.id, name: j.name, pages: j.pages.contents.sort((a, b) => a.sort - b.sort).map(p => p.name), defaultOwnership: j.ownership.default, format: j.pages.contents[0].text.format };
  });
  assert.equal(imported.name, "Sinless ヘルプ");
  assert.deepEqual(imported.pages, ["はじめに", "判定の流れ", "チャットカードのボタン", "アゴナーク用のツール"]);
  assert.equal(imported.defaultOwnership, 2);
  f.journals = [imported.id];
  pass("import ja", imported);
  await page.waitForFunction(() => document.querySelector("#sinless-help [data-action=importJournal]")?.textContent.includes("更新"));

  await page.evaluate(async id => {
    const j = game.journal.get(id);
    await j.createEmbeddedDocuments("JournalEntryPage", [{ name: "VERIFY GM notes", type: "text", text: { content: "<p>mine</p>" } }]);
    const first = j.pages.find(p => p.getFlag("sinless", "helpPage") === "getting-started");
    await first.update({ "text.content": "<p>edited</p>" });
  }, imported.id);
  await page.click("#sinless-help [data-action=importJournal]");
  await page.waitForSelector(".application.dialog button[data-action=yes]");
  await page.click(".application.dialog button[data-action=yes]");
  await page.waitForFunction(id => {
    const p = game.journal.get(id)?.pages.find(x => x.getFlag("sinless", "helpPage") === "getting-started");
    return p && !p.text.content.includes("edited");
  }, imported.id);
  const updated = await page.evaluate(id => {
    const j = game.journal.get(id);
    return { pages: j.pages.contents.map(p => p.name).sort(), helpPages: j.pages.filter(p => p.getFlag("sinless", "helpPage")).length, count: game.journal.filter(e => e.getFlag("sinless", "help") === "ja").length };
  }, imported.id);
  assert.equal(updated.helpPages, 4);
  assert.ok(updated.pages.includes("VERIFY GM notes"), "the GM's page is kept");
  assert.equal(updated.pages.length, 5);
  assert.equal(updated.count, 1, "still one journal entry");
  pass("update keeps GM page", updated);

  // Player: the tool and the window, no import button, and the journal entry is readable.
  ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const p = await ctx.newPage();
  const playerErrors = [];
  p.on("pageerror", e => playerErrors.push(e.message));
  await p.goto(FOUNDRY_URL + "/join");
  await p.selectOption("select[name=userid]", f.userId);
  await p.click("button[name=join]");
  await p.waitForFunction(() => window.game?.ready, null, { timeout: 90000 });
  await p.waitForTimeout(1000);
  const ptool = await p.evaluate(() => !!ui.controls.controls.tokens?.tools?.sinlessHelp);
  await p.evaluate(() => game.sinless.help.open("tests"));
  await p.waitForSelector("#sinless-help .help-content h2");
  const ps = await helpState(p);
  const readable = await p.evaluate(id => { const j = game.journal.get(id); return { visible: !!j, canRead: j?.testUserPermission(game.user, "OBSERVER") ?? false, pages: j?.pages.size ?? 0 }; }, imported.id);
  assert.equal(ptool, true);
  assert.equal(ps.active, "tests");
  assert.equal(ps.importButton, null);
  assert.deepEqual(readable, { visible: true, canRead: true, pages: 5 });
  assert.deepEqual(playerErrors, []);
  pass("player reads help and journal", { tool: ptool, ...ps, journal: readable });

  const errors = logs.filter(l => l.startsWith("pageerror") || /sinless/i.test(l) && l.startsWith("error"));
  assert.deepEqual(errors, []);
  pass("no page errors", { gm: errors.length, player: playerErrors.length });
} finally {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/help.json`, JSON.stringify(out, null, 1));
  if (f) await page.evaluate(async f => {
    for (const id of f.journals ?? []) await game.journal.get(id)?.delete();
    await game.users.get(f.userId)?.delete();
    await foundry.applications.instances.get("sinless-help")?.close();
  }, f).catch(e => console.error("cleanup", e.message));
  await ctx?.close();
  await browser.close();
}
