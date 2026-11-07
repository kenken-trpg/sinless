#!/usr/bin/env node
// Package the system into dist/sinless.zip and dist/system.json.
// The packaged manifest points `download` at this exact version's release asset,
// while `manifest` keeps pointing at the latest release so updates are detected.
import { mkdirSync, rmSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const stage = join(dist, "sinless");
rmSync(dist, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

const manifest = JSON.parse(readFileSync(join(root, "system.json"), "utf8"));
manifest.download = `https://github.com/kenken-trpg/sinless/releases/download/v${manifest.version}/sinless.zip`;
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

const include = ["sinless.mjs", "module", "templates", "styles", "lang", "help", "samples", "LICENSE", "README.md", "README.ja.md"];
for (const path of include) cpSync(join(root, path), join(stage, path), { recursive: true });
writeFileSync(join(stage, "system.json"), manifestText);
writeFileSync(join(dist, "system.json"), manifestText);

execFileSync("zip", ["-qr", join(dist, "sinless.zip"), ".", "-x", "*.DS_Store"], { cwd: stage, stdio: "inherit" });
rmSync(stage, { recursive: true, force: true });
console.log(`dist/sinless.zip (v${manifest.version})`);
