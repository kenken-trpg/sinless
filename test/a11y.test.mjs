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

test("states shown by color are also given as text or marks", () => {
  const read = f => readFileSync(join(root, f), "utf8");
  // Each successful or rerolled die on a test card carries screen reader text.
  const dice = [...read("templates/chat/test-card.hbs").matchAll(/<li class="die[^>]*>([\s\S]*?)<\/li>/g)].map(m => m[1]);
  assert.equal(dice.length, 3);
  assert.ok(dice.every(d => d.includes("SINLESS.Accessibility.dieSuccess")), "success text on every die list");
  assert.ok(dice[0].includes("SINLESS.Accessibility.dieRerolled"), "rerolled text on the initial dice");
  // A resource track is one named image rather than a row of empty boxes.
  assert.match(read("templates/actor/brand-resources.hbs"), /class="resource-track" role="img" aria-label="\{\{localize "SINLESS\.Accessibility\.resourceTrack"/);
  // An active alert response says so, not only by its warning icon.
  assert.match(read("templates/apps/operation.hbs"), /fa-triangle-exclamation"[^>]*aria-hidden="true"><\/i><span class="sinless-sr-only">\{\{localize "SINLESS\.Operation\.active"\}\}/);
  const css = read("styles/sinless.css");
  assert.match(css, /\.sinless-sr-only \{[^}]*clip-path/);
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  for (const sel of [".box.filled", ".die.success", ".rbox", "a.active"]) assert.ok(forced.includes(sel), `forced colors cover ${sel}`);
});

test("muted text keeps its contrast instead of being faded", () => {
  const css = readFileSync(join(root, "styles/sinless.css"), "utf8");
  // Muted text mixes Foundry's subtle color with the primary text color (measured >= 4.5:1 in both themes).
  assert.match(css, /--sl-muted: color-mix\(in srgb, var\(--color-text-subtle[^)]*\) 70%, var\(--color-text-primary/);
  assert.match(css, /\.sinless input::placeholder, \.sinless textarea::placeholder \{ color: var\(--sl-muted\); opacity: 1; \}/);
  // Hints, notes and dice were faded with opacity, which fell below 4.5:1; they use the muted color now.
  const faded = css.split("\n").filter(l => /\b(hint|empty|die|count|cost|time|effect-source|modifiers)\b[^{]*\{[^}]*opacity: 0\.[0-7]/.test(l));
  assert.deepEqual(faded, []);
});

test("windows reflow for enlarged text instead of squeezing it", () => {
  const css = readFileSync(join(root, "styles/sinless.css"), "utf8");
  // Every Sinless window measures its content area and scrolls vertically.
  assert.match(css, /\.sinless \.window-content \{ container: sinless-window \/ inline-size; overflow-y: auto; \}/);
  // Widths are measured in rem, so the same rules apply to larger text and to narrower windows.
  const queries = [...css.matchAll(/@container sinless-window \(max-width: ([\d.]+)(rem|px)\)/g)];
  assert.ok(queries.length >= 2, "sheet and dialog breakpoints");
  assert.deepEqual(queries.map(q => q[2]), queries.map(() => "rem"));
  // Containment needs an explicit window width; every Sinless application sets one.
  const read = f => readFileSync(join(root, f), "utf8");
  const apps = walk(join(root, "module")).filter(f => f.endsWith(".mjs")).map(f => [f, read(f.slice(root.length))])
    .filter(([, src]) => /classes: \["sinless"/.test(src));
  assert.ok(apps.length >= 10, `found ${apps.length} application files`);
  for (const [file, src] of apps) {
    const opened = (src.match(/classes: \["sinless"/g) ?? []).length;
    const widths = (src.match(/position: \{ width: [^,}]+/g) ?? []).length;
    assert.ok(widths >= opened, `${file.slice(root.length)}: every window sets a width`);
  }
});
