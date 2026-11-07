// Shared helper for the Foundry browser verification scripts.
// Playwright is not a project dependency. Set SINLESS_PLAYWRIGHT to its entry module
// (e.g. /path/to/node_modules/playwright/index.mjs) or make "playwright" resolvable.
// SINLESS_FOUNDRY_URL defaults to http://localhost:30000.
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

export const FOUNDRY_URL = (process.env.SINLESS_FOUNDRY_URL ?? "http://localhost:30000").replace(/\/$/, "");

export async function loadChromium() {
  const spec = process.env.SINLESS_PLAYWRIGHT;
  try {
    const mod = await import(spec ? (isAbsolute(spec) ? pathToFileURL(spec).href : spec) : "playwright");
    return mod.chromium ?? mod.default.chromium;
  } catch (e) {
    throw new Error(`Playwright not found (${spec ?? "playwright"}). Set SINLESS_PLAYWRIGHT to playwright/index.mjs.`, { cause: e });
  }
}

// Headless Chromium draws WebGL in software (SwiftShader). The game canvas then keeps the page
// busy, and every server reply waits about 300 ms for it. On macOS, draw with the GPU (Metal).
const GPU_ARGS = process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : [];

/** Launch headless Chromium, with the GPU where it is available. */
export async function launchBrowser() {
  return (await loadChromium()).launch({ args: GPU_ARGS });
}

/**
 * Join the running world as a user (default Gamemaster) and wait for game.ready.
 * Pass `browser` to add another session (its own context) to a browser already launched.
 * `noCanvas` turns off the game canvas for this session, for scripts that need no tokens.
 */
export async function joinGM({ user = "Gamemaster", viewport = { width: 1600, height: 1100 }, browser = null, noCanvas = false } = {}) {
  const owned = !browser;
  browser ??= await launchBrowser();
  // Foundry keys the session on a cookie, so each session needs its own context.
  const context = await browser.newContext({ viewport });
  // A client setting, kept in this context's own localStorage.
  if (noCanvas) await context.addInitScript(() => localStorage.setItem("core.noCanvas", "true"));
  const page = await context.newPage();
  const logs = [];
  page.on("console", m => { if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 400)}`); });
  page.on("pageerror", e => logs.push(`pageerror: ${e.message}`));
  await page.goto(`${FOUNDRY_URL}/join`);
  const select = await page.waitForSelector("select[name=userid]", { timeout: 15000 }).catch(() => null);
  if (!select) {
    await (owned ? browser.close() : page.context().close());
    throw new Error(`No world is active at ${FOUNDRY_URL}. Launch one first (launchWorld).`);
  }
  await page.selectOption("select[name=userid]", { label: user });
  await page.click("button[name=join]");
  await page.waitForFunction(() => window.game?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  return { browser, page, logs };
}

/** Launch a world from the setup screen if none is active. Returns the active world id. */
export async function launchWorld(world = "sinless-test") {
  const status = await fetch(`${FOUNDRY_URL}/api/status`).then(r => r.json());
  if (status.active) return status.world;
  const res = await fetch(`${FOUNDRY_URL}/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "launchWorld", world })
  });
  if (!res.ok) throw new Error(`launchWorld ${world}: HTTP ${res.status}`);
  for (let i = 0; i < 60; i++) {
    const s = await fetch(`${FOUNDRY_URL}/api/status`).then(r => r.json());
    if (s.active) return s.world;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`launchWorld ${world}: world did not become active`);
}

/** Shut down the active world and launch it again, so Foundry rereads the system manifest. */
export async function relaunchWorld(world = "sinless-test") {
  const status = await fetch(`${FOUNDRY_URL}/api/status`).then(r => r.json());
  if (status.active) {
    const { browser, page } = await joinGM();
    await page.evaluate(() => game.shutDown()).catch(() => {});
    await browser.close();
    for (let i = 0; i < 60; i++) {
      const s = await fetch(`${FOUNDRY_URL}/api/status`).then(r => r.json()).catch(() => ({}));
      if (s.active === false) break;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return launchWorld(world);
}

/** Versions as the browser sees them (the server's /api/status can report a stale system version). */
export async function loadedVersions() {
  const { browser, page } = await joinGM();
  try {
    return await page.evaluate(() => ({ foundry: game.version, system: game.system.version, world: game.world.id, lang: game.i18n.lang }));
  } finally {
    await browser.close();
  }
}
