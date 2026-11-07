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
