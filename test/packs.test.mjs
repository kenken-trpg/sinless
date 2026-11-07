import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleEntries, stableId, buildPacks } from "../tools/packs.mjs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("system.json", root), "utf8"));

test("system.json declares the samples Actor pack with a localized label", () => {
  const pack = manifest.packs?.find(p => p.name === "samples");
  assert.ok(pack, "samples pack");
  assert.equal(pack.type, "Actor");
  assert.equal(pack.path, "packs/samples");
  assert.equal(pack.system, manifest.id);
  for (const lang of ["en", "ja"]) {
    const strings = JSON.parse(readFileSync(new URL(`lang/${lang}.json`, root), "utf8"));
    assert.ok(strings.SINLESS.Pack.samples, `${lang}: ${pack.label}`);
  }
});

test("every sample actor gets a stable, unique id and LevelDB keys for itself and its items", () => {
  const entries = sampleEntries();
  assert.equal(entries.length, readdirSync(new URL("samples/actors/", root)).filter(f => f.endsWith(".json")).length);
  const ids = new Set();
  for (const { file, doc } of entries) {
    assert.match(doc._id, /^[A-Za-z0-9]{16}$/);
    assert.equal(doc._id, stableId(`samples/${file}`), `${file}: id stays the same across builds`);
    assert.equal(doc._key, `!actors!${doc._id}`);
    for (const item of doc.items) {
      assert.equal(item._key, `!actors.items!${doc._id}.${item._id}`);
      ids.add(item._id);
    }
    ids.add(doc._id);
  }
  const count = entries.reduce((n, e) => n + 1 + e.doc.items.length, 0);
  assert.equal(ids.size, count, "no id is used twice");
  assert.deepEqual(entries.map(e => e.doc.sort), entries.map((_, i) => (i + 1) * 100000), "file order");
});

test("the samples pack builds and holds every actor and item", async () => {
  const out = mkdtempSync(join(tmpdir(), "sinless-pack-test-"));
  try {
    const [dest] = await buildPacks(out);
    const { ClassicLevel } = await import("classic-level");
    const db = new ClassicLevel(dest, { keyEncoding: "utf8", valueEncoding: "json" });
    const keys = await db.keys().all();
    await db.close();
    const entries = sampleEntries();
    assert.equal(keys.filter(k => k.startsWith("!actors!")).length, entries.length);
    assert.equal(keys.filter(k => k.startsWith("!actors.items!")).length, entries.reduce((n, e) => n + e.doc.items.length, 0));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
