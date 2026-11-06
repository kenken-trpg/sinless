#!/usr/bin/env node
/**
 * i18n consistency check.
 *  1. Every locale has exactly the same keys as en.json.
 *  2. Placeholders ({name}) match between en and each locale.
 *  3. Every literal SINLESS.* / TYPES.* key used in code and templates exists in en.json.
 * Exit code 1 on any problem.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const langDir = join(root, "lang");

export function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");

function walk(dir, exts, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, files);
    else if (exts.some(e => p.endsWith(e))) files.push(p);
  }
  return files;
}

export async function checkI18n() {
  const problems = [];
  const locales = Object.fromEntries(readdirSync(langDir).filter(f => f.endsWith(".json"))
    .map(f => [f.replace(".json", ""), flatten(JSON.parse(readFileSync(join(langDir, f), "utf8")))]));
  const en = locales.en;

  for (const [lang, strings] of Object.entries(locales)) {
    if (lang === "en") continue;
    for (const key of Object.keys(en)) {
      if (!(key in strings)) problems.push(`[${lang}] missing key: ${key}`);
      else if (placeholders(en[key]) !== placeholders(strings[key])) {
        problems.push(`[${lang}] placeholder mismatch: ${key}`);
      }
    }
    for (const key of Object.keys(strings)) {
      if (!(key in en)) problems.push(`[${lang}] extra key not in en: ${key}`);
    }
  }

  const used = new Set();
  for (const file of walk(root, [".mjs", ".hbs"])) {
    if (file.includes(`${join(root, "tools")}`) || file.includes(join(root, "test"))) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/["'`]((?:SINLESS|TYPES)\.[A-Za-z0-9_.]+)["'`]/g)) {
      if (!m[1].endsWith(".")) used.add([m[1], relative(root, file)]);
    }
    for (const m of text.matchAll(/\bL\("([A-Za-z0-9_.]+)"\)/g)) used.add([`SINLESS.${m[1]}`, relative(root, file)]);
  }
  const enKeys = Object.keys(en);
  const isPrefix = key => enKeys.some(k => k.startsWith(`${key}.`));
  for (const [key, file] of used) {
    if (!(key in en) && !isPrefix(key)) problems.push(`[en] key used in ${file} is missing: ${key}`);
  }

  // Keys generated dynamically from config.
  const { SKILLS, BRAND_TRAITS, BRAND_ACTIONS, SECTOR_HEAT } = await import("../module/config.mjs");
  const dynamic = [
    ...Object.keys(SKILLS).map(k => `SINLESS.Skill.${k}`),
    ...Object.keys(BRAND_TRAITS).flatMap(k => [`SINLESS.BrandTrait.${k}.label`, `SINLESS.BrandTrait.${k}.hint`]),
    ...Object.keys(BRAND_ACTIONS).flatMap(k => [`SINLESS.BrandAction.${k}.label`, `SINLESS.BrandAction.${k}.effect`]),
    ...Object.keys(SECTOR_HEAT).map(k => `SINLESS.SectorHeatEffect.${k}`)
  ];
  // Tab labels come from the TABS config (labelPrefix SINLESS.Tab).
  for (const file of walk(join(root, "module", "sheets"), [".mjs"])) {
    for (const m of readFileSync(file, "utf8").matchAll(/\{ id: "(\w+)" \}/g)) dynamic.push(`SINLESS.Tab.${m[1]}`);
  }
  for (const key of dynamic) {
    if (!(key in en)) problems.push(`[en] missing generated key: ${key}`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = await checkI18n();
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("i18n OK");
}
