// Run the Foundry browser verification scripts (docs/verification) against a running Foundry.
// usage: npm run verify -- <name...|all|list> [--out DIR] [--world ID] [--relaunch] [--no-launch]
// Needs Playwright: set SINLESS_PLAYWRIGHT to playwright/index.mjs (see docs/verification/README.md).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dir = "docs/verification/2026-11-06";

/** name → script and arguments; "{out}" is the run's output folder. */
const SCRIPTS = {
  "sweep-ja": { script: `${dir}/current/sweep-fixed.mjs`, args: ["{out}", "ja"], about: "every sheet, tab and editable field (Japanese)" },
  "sweep-en": { script: `${dir}/current/sweep-fixed.mjs`, args: ["{out}", "en"], about: "every sheet, tab and editable field (English, flags Japanese text)" },
  player: { script: `${dir}/current/extra.mjs`, args: [], about: "player view in a second browser, combat flow" },
  batch: { script: `${dir}/current/batch.mjs`, args: [], about: "the nine feature scripts in original/ with fixtures" },
  magic: { script: `${dir}/current/magic-review.mjs`, args: [], about: "sustained spells, wards, spirits, resource saving" },
  samples: { script: `${dir}/sample-actors/initial-workflow.mjs`, args: [], about: "import the sample actors (JSON and the compendium pack) and run the main tests" },
  permissions: { script: "docs/verification/2026-11-07/permissions.mjs", args: [], about: "a player acting on documents someone else owns" },
  "help-window": { script: "docs/verification/2026-11-07/help.mjs", args: [], about: "help window, languages, journal import and update" },
  "sheet-actions": { script: "docs/verification/2026-11-07/sheet-actions.mjs", args: [], about: "every kind of actor sheet button: rolls, boxes, item rows, confirmations" },
  "keyboard-apps": { script: "docs/verification/2026-11-07/keyboard-apps.mjs", args: [], about: "keyboard navigation and focus in help, operation and chase windows" },
  "keyboard-dialogs": { script: "docs/verification/2026-11-07/keyboard-dialogs.mjs", args: [], about: "keyboard navigation, submission and cancellation inside test and damage dialogs" },
  keyboard: { script: "docs/verification/2026-11-07/keyboard.mjs", args: [], about: "sheet controls by keyboard: focus, Enter / Space, focus kept after re-render" },
  "color-independence": { script: "docs/verification/2026-11-08/color-independence.mjs", args: [], about: "dice, resource tracks and toggles exposed as text and kept visible in high contrast mode" },
  contrast: { script: "docs/verification/2026-11-08/contrast.mjs", args: [], about: "text contrast on sheets, windows, a test dialog and a chat card, dark and light themes" },
  "text-resize": { script: "docs/verification/2026-11-08/text-resize.mjs", args: [], about: "sheets, windows, a test dialog and a chat card at 200% text: nothing cut off, clipped or squeezed" },
  "text-spacing": { script: "docs/verification/2026-11-08/text-resize.mjs", args: ["spacing"], about: "the same windows with WCAG 1.4.12 line, paragraph, letter and word spacing: nothing lost" },
  "target-size": { script: "docs/verification/2026-11-08/target-size.mjs", args: [], about: "pointer targets in sheets, windows, a test dialog and a chat card are 24px or spaced apart" }
};
/** Scripts that need an active scene: they place tokens or use the scene controls. */
const CANVAS = new Set(["magic", "player", "help-window"]);
const ALL = ["samples", "magic", "player", "permissions", "help-window", "sheet-actions", "keyboard", "keyboard-dialogs", "keyboard-apps", "color-independence", "contrast", "text-resize", "text-spacing", "target-size", "batch", "sweep-ja", "sweep-en"];

function parse(argv) {
  const opts = { names: [], out: null, world: "sinless-test", relaunch: false, launch: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") opts.out = argv[++i];
    else if (a === "--world") opts.world = argv[++i];
    else if (a === "--relaunch") opts.relaunch = true;
    else if (a === "--no-launch") opts.launch = false;
    else if (a.startsWith("--")) throw new Error(`Unknown option ${a}`);
    else opts.names.push(a);
  }
  if (opts.out === undefined || opts.world === undefined) throw new Error("--out and --world need a value");
  return opts;
}

function usage() {
  console.log("usage: npm run verify -- <name...|all|list> [--out DIR] [--world ID] [--relaunch] [--no-launch]\n");
  for (const [name, s] of Object.entries(SCRIPTS)) console.log(`  ${name.padEnd(13)} ${s.about}`);
  console.log(`  ${"all".padEnd(13)} ${ALL.join(", ")}`);
  console.log("\n  --out DIR    output folder (default: <tmp>/sinless-verify/<timestamp>); each script writes to DIR/<name>");
  console.log("  --world ID   world to launch when none is active (default sinless-test)");
  console.log("  --relaunch   restart the world first so Foundry rereads system.json");
  console.log("  --no-launch  do not launch a world; fail if none is active");
}

function run(name, out) {
  const { script, args } = SCRIPTS[name];
  mkdirSync(out, { recursive: true });
  const env = { ...process.env, SINLESS_VERIFY_OUT: out, SINLESS_REVIEW_OUT: out };
  const started = Date.now();
  return new Promise(res => {
    const child = spawn(process.execPath, [join(root, script), ...args.map(a => a.replace("{out}", out))], { cwd: root, env, stdio: "inherit" });
    child.on("exit", (code, signal) => res({ name, code: code ?? 1, signal, seconds: Math.round((Date.now() - started) / 1000), out }));
  });
}

async function main() {
  let opts;
  try { opts = parse(process.argv.slice(2)); } catch (e) { console.error(e.message); usage(); return 2; }
  if (!opts.names.length || opts.names.includes("list") || opts.names.includes("help")) { usage(); return opts.names.length ? 0 : 2; }
  const names = opts.names.flatMap(n => (n === "all" ? ALL : [n]));
  const unknown = names.filter(n => !SCRIPTS[n]);
  if (unknown.length) { console.error(`Unknown script: ${unknown.join(", ")}`); usage(); return 2; }

  const lib = await import(new URL("../docs/verification/lib.mjs", import.meta.url));
  const status = await fetch(`${lib.FOUNDRY_URL}/api/status`).then(r => r.json()).catch(() => null);
  if (!status) { console.error(`Foundry is not reachable at ${lib.FOUNDRY_URL}`); return 1; }
  if (opts.relaunch) console.log("Relaunched", await lib.relaunchWorld(opts.world));
  else if (!status.active) {
    if (!opts.launch) { console.error("No world is active (--no-launch)"); return 1; }
    console.log("Launched", await lib.launchWorld(opts.world));
  }
  const manifest = JSON.parse(readFileSync(join(root, "system.json"), "utf8")).version;
  const loaded = await lib.loadedVersions();
  console.log(`Foundry ${loaded.foundry}, world ${loaded.world}, system ${loaded.system} (system.json ${manifest})`);
  if (loaded.system !== manifest) console.warn(`WARNING: the world has system ${loaded.system} loaded, not ${manifest}. Use --relaunch to reload it.`);
  const needCanvas = names.filter(n => CANVAS.has(n));
  if (!loaded.activeScene && needCanvas.length) {
    console.error(`No scene is active in world ${loaded.world}, so the canvas is not ready for ${needCanvas.join(", ")}. Activate a scene first.`);
    return 1;
  }

  // A long sweep outlasts the idle-sleep timer; sleep drops the browser's socket and every sheet times out.
  if (process.platform === "darwin") spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" }).on("error", () => {}).unref();

  const base = resolve(opts.out ?? join(tmpdir(), "sinless-verify", new Date().toISOString().replace(/[:.]/g, "-")));
  const results = [];
  for (const name of names) {
    console.log(`\n=== ${name} → ${base}/${name}`);
    results.push(await run(name, join(base, name)));
  }
  console.log("\n=== summary");
  for (const r of results) console.log(`  ${r.code === 0 ? "PASS" : "FAIL"}  ${r.name.padEnd(13)} ${String(r.seconds).padStart(4)} s  ${r.out}`);
  return results.every(r => r.code === 0) ? 0 : 1;
}

process.exitCode = await main();
