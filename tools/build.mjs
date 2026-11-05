#!/usr/bin/env node
// Package the system into dist/sinless.zip (plus a copy of system.json for the manifest URL).
import { mkdirSync, rmSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
const include = ["system.json", "sinless.mjs", "module", "templates", "styles", "lang", "LICENSE", "README.md", "README.ja.md"];
execFileSync("zip", ["-qr", join(dist, "sinless.zip"), ...include, "-x", "*.DS_Store"], { cwd: root, stdio: "inherit" });
copyFileSync(join(root, "system.json"), join(dist, "system.json"));
console.log("dist/sinless.zip");
