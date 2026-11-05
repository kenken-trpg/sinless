#!/usr/bin/env node
// Parse-check every ES module and validate JSON files (no Foundry runtime needed).
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".mjs") || p.endsWith(".json")) files.push(p);
  }
})(root);

let failed = false;
for (const file of files) {
  try {
    if (file.endsWith(".json")) JSON.parse(readFileSync(file, "utf8"));
    else execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    failed = true;
    console.error(`✖ ${file}\n${err.stderr?.toString() ?? err.message}`);
  }
}
if (failed) process.exit(1);
console.log(`syntax OK (${files.length} files)`);
