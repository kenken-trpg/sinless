import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const walk = dir => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

/** Buttons and links whose only content is an icon, in templates and in HTML built by the code. */
function iconOnlyControls() {
  const files = [...walk(join(root, "templates")), ...walk(join(root, "module"))].filter(f => /\.(hbs|mjs)$/.test(f));
  return files.flatMap(file => {
    const src = readFileSync(file, "utf8");
    return [...src.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g)]
      .filter(m => /<i\b/.test(m[3]) && !m[3].replace(/<i\b[^>]*><\/i>/g, "").trim())
      .map(m => ({ where: `${file.slice(root.length)}:${src.slice(0, m.index).split("\n").length}`, attrs: m[2] }));
  });
}

test("icon-only buttons have an accessible name and a tooltip", () => {
  const controls = iconOnlyControls();
  assert.ok(controls.length > 40, `found ${controls.length} icon-only controls`);
  const missing = controls.filter(c => !/\baria-label="[^"]/.test(c.attrs) || !/\bdata-tooltip="[^"]/.test(c.attrs)).map(c => c.where);
  assert.deepEqual(missing, []);
});

/** Every <a data-action> in the templates with its attributes and inner markup. */
function actionLinks() {
  return walk(join(root, "templates")).filter(f => f.endsWith(".hbs")).flatMap(file => {
    const src = readFileSync(file, "utf8");
    return [...src.matchAll(/<a\b([^>]*\bdata-action="[^"]*"[^>]*)>([\s\S]*?)<\/a>/g)]
      .map(m => ({ where: `${file.slice(root.length)}:${src.slice(0, m.index).split("\n").length}`, attrs: m[1], inner: m[2] }));
  });
}

test("action links without visible text have an accessible name", () => {
  const links = actionLinks();
  assert.ok(links.length > 50, `found ${links.length} action links`);
  // Text left once icons, tags, Handlebars block helpers and the "-1" box marks are removed.
  const text = inner => inner.replace(/<i\b[^>]*><\/i>/g, "").replace(/\{\{#if mark\}\}<span>-1<\/span>\{\{\/if\}\}/g, "")
    .replace(/<[^>]+>/g, "").replace(/\{\{[#/^][^}]*\}\}|\{\{else\}\}/g, "").trim();
  const missing = links.filter(l => !text(l.inner) && !/\baria-label="[^"]/.test(l.attrs)).map(l => l.where);
  assert.deepEqual(missing, []);
});

test("toggles and track boxes state whether they are on", () => {
  const stateful = actionLinks().filter(l => /data-action="(itemToggle|effectToggle|setCondition|setCohesion)"/.test(l.attrs));
  assert.ok(stateful.length >= 9, `found ${stateful.length} toggles and boxes`);
  const missing = stateful.filter(l => !/\baria-pressed="/.test(l.attrs)).map(l => l.where);
  assert.deepEqual(missing, []);
});
