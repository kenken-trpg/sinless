import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkI18n } from "../tools/check-i18n.mjs";

test("locales are complete and every used key exists", async () => {
  assert.deepEqual(await checkI18n(), []);
});

test("dialog buttons use Sinless labels, not Foundry's untranslated core ones", () => {
  const root = fileURLToPath(new URL("../module/", import.meta.url));
  const walk = dir => readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const files = walk(root).filter(f => f.endsWith(".mjs")).map(f => [f.slice(root.length), readFileSync(f, "utf8")]);
  const coreLabels = files.flatMap(([f, src]) => [...src.matchAll(/label: "(Cancel|Yes|No|Confirm|Close|Submit|COMMON\.\w+)"/g)].map(m => `${f}: ${m[1]}`));
  assert.deepEqual(coreLabels, []);
  // The options object of each DialogV2.confirm/prompt call: from the call up to its closing "});".
  const calls = kind => files.flatMap(([f, src]) => [...src.matchAll(new RegExp(`DialogV2\\.${kind}\\(`, "g"))]
    .map(m => [f, src.slice(m.index, src.indexOf("});", m.index))]));
  assert.ok(calls("confirm").length >= 2, "confirm dialogs found");
  for (const [f, call] of calls("confirm")) assert.match(call, /\.\.\.CONFIRM_BUTTONS/, `${f} sets its Yes/No labels`);
  for (const [f, call] of calls("prompt")) assert.match(call, /ok: \{ label: "SINLESS\./, `${f} sets its OK label`);
  const config = readFileSync(join(root, "config.mjs"), "utf8");
  assert.match(config, /yes: Object\.freeze\(\{ label: "SINLESS\.Dialog\.yes" \}\)/);
  assert.match(config, /no: Object\.freeze\(\{ label: "SINLESS\.Dialog\.no" \}\)/);
});
