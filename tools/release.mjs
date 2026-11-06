#!/usr/bin/env node
// Publish a GitHub release for a version tag (used by .github/workflows/release.yml).
//   node tools/release.mjs v0.9.0            create the release (needs GH_TOKEN and dist/ from `npm run build`)
//   DRY_RUN=1 node tools/release.mjs v0.9.0  only check and print what would happen
// Checks that the tag matches system.json and package.json and that the built
// manifest points at this tag. Notes come from release-notes/<tag>.md; its first
// "## Title / タイトル" line gives the release title.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = msg => { console.error(`release: ${msg}`); process.exit(1); };
const read = file => JSON.parse(readFileSync(join(root, file), "utf8"));

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) fail(`not a version tag: ${tag}`);
const version = tag.slice(1);

for (const file of ["system.json", "package.json"]) {
  const v = read(file).version;
  if (v !== version) fail(`${file} has version ${v}, tag is ${tag}`);
}

const dist = join(root, "dist");
for (const file of ["sinless.zip", "system.json"]) {
  if (!existsSync(join(dist, file))) fail(`dist/${file} is missing; run npm run build first`);
}
const built = JSON.parse(readFileSync(join(dist, "system.json"), "utf8"));
const expected = `https://github.com/kenken-trpg/sinless/releases/download/${tag}/sinless.zip`;
if (built.version !== version || built.download !== expected) {
  fail(`dist/system.json does not match ${tag} (version ${built.version}, download ${built.download})`);
}

const notesFile = join(root, "release-notes", `${tag}.md`);
const args = ["release", "create", tag, join(dist, "sinless.zip"), join(dist, "system.json")];
let title = tag;
if (existsSync(notesFile)) {
  const heading = readFileSync(notesFile, "utf8").split("\n").find(l => l.startsWith("## "));
  if (heading) title = `${tag} — ${heading.slice(3).split(" / ")[0].trim()}`;
  args.push("--notes-file", notesFile);
} else {
  console.warn(`release: ${notesFile} not found, using generated notes`);
  args.push("--generate-notes");
}
args.push("--title", title, "--verify-tag");

if (process.env.DRY_RUN) {
  console.log(`[dry run] gh ${args.map(a => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`);
} else {
  execFileSync("gh", args, { stdio: "inherit" });
}
