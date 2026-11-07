import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: Base => Base, DialogV2: {} } } };
const { HELP_LANGUAGES } = await import("../module/apps/help.mjs");

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const index = lang => JSON.parse(read(`help/${lang}/index.json`));

test("every help folder is a listed language, and English is one", () => {
  const folders = readdirSync(new URL("help/", root)).filter(n => !n.startsWith("."));
  assert.deepEqual(folders.sort(), [...HELP_LANGUAGES].sort());
  assert.ok(HELP_LANGUAGES.includes("en"));
});

test("each language has the same pages as English, with a name and a title", () => {
  const ids = index("en").pages.map(p => p.id);
  for (const lang of HELP_LANGUAGES) {
    const i = index(lang);
    assert.ok(i.language && i.title, `${lang}: language and title`);
    assert.deepEqual(i.pages.map(p => p.id), ids, `${lang}: page ids`);
    for (const p of i.pages) assert.ok(p.title, `${lang}/${p.id}: title`);
  }
});

test("each page file exists, opens with its title and carries no script", () => {
  for (const lang of HELP_LANGUAGES) {
    for (const p of index(lang).pages) {
      const path = `help/${lang}/${p.id}.html`;
      assert.ok(existsSync(new URL(path, root)), `${path} exists`);
      const html = read(path);
      assert.equal(html.match(/^<h2>(.*?)<\/h2>/)?.[1], p.title, `${path}: <h2> matches the index title`);
      assert.doesNotMatch(html, /<script|<iframe|\son\w+=|javascript:/i, `${path}: no script`);
    }
  }
});

test("the package includes the help folder", () => {
  assert.match(read("tools/build.mjs"), /const include = \[[^\]]*"help"/);
});
