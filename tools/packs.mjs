#!/usr/bin/env node
// Build the compendium packs from their JSON sources.
// The sample actors in samples/actors/ become the "samples" Actor pack (system.json "packs").
// usage: node tools/packs.mjs [outdir]   (default: packs/ in the repository, which is git-ignored)
// Foundry locks a pack while a world is running, so shut the world down before rebuilding here.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = join(root, "samples", "actors");

/** A stable 16-character document id derived from `seed`, so rebuilds keep the same ids. */
export function stableId(seed) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = createHash("sha256").update(`sinless:${seed}`).digest();
  return Array.from(bytes.subarray(0, 16), b => alphabet[b % alphabet.length]).join("");
}

/**
 * The sample actors as pack entries: ids and LevelDB keys for the actors and their items
 * and effects, sorted in file order.
 * @returns {{ file: string, doc: object }[]}
 */
export function sampleEntries() {
  const files = readdirSync(SAMPLES).filter(f => f.endsWith(".json")).sort();
  return files.map((file, n) => {
    const doc = JSON.parse(readFileSync(join(SAMPLES, file), "utf8"));
    const id = stableId(`samples/${file}`);
    doc._id = id;
    doc._key = `!actors!${id}`;
    doc.sort = (n + 1) * 100000;
    doc.folder = null;
    doc.ownership = { default: 0 };
    for (const [i, item] of (doc.items ?? []).entries()) {
      item._id = stableId(`samples/${file}/items/${i}`);
      item._key = `!actors.items!${id}.${item._id}`;
      for (const [j, effect] of (item.effects ?? []).entries()) {
        effect._id = stableId(`samples/${file}/items/${i}/effects/${j}`);
        effect._key = `!actors.items.effects!${id}.${item._id}.${effect._id}`;
      }
    }
    for (const [j, effect] of (doc.effects ?? []).entries()) {
      effect._id = stableId(`samples/${file}/effects/${j}`);
      effect._key = `!actors.effects!${id}.${effect._id}`;
    }
    return { file, doc };
  });
}

/** Write the packs under `outDir` (packs/samples). Needs the dev dependency @foundryvtt/foundryvtt-cli. */
export async function buildPacks(outDir) {
  const { compilePack } = await import("@foundryvtt/foundryvtt-cli");
  const src = mkdtempSync(join(tmpdir(), "sinless-packs-"));
  try {
    for (const { file, doc } of sampleEntries()) writeFileSync(join(src, file), JSON.stringify(doc));
    const dest = join(outDir, "samples");
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    await compilePack(src, dest);
    return [dest];
  } finally {
    rmSync(src, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = resolve(process.argv[2] ?? join(root, "packs"));
  for (const dest of await buildPacks(out)) console.log(`built ${dest}`);
}
