#!/usr/bin/env node
// Set the version in system.json and package.json: `npm run bump -- 0.9.0`.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const next = process.argv[2]?.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(next ?? "")) {
  console.error("Usage: npm run bump -- <major.minor.patch>");
  process.exit(1);
}

const cmp = (a, b) => {
  const [x, y] = [a, b].map(v => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

for (const file of ["system.json", "package.json"]) {
  const path = join(root, file);
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (cmp(next, data.version) <= 0) {
    console.error(`${file}: ${next} is not newer than ${data.version}`);
    process.exit(1);
  }
  data.version = next;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${file}: ${next}`);
}
console.log(`Next: write release-notes/v${next}.md, commit, then tag v${next} and push the tag.`);
