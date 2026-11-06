import { chromium } from "/Users/mantanikenichi/mydevelop/voice-atlas/node_modules/playwright/index.mjs";
export async function joinGM({ locale } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const logs = [];
  page.on("console", m => { if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 400)}`); });
  page.on("pageerror", e => logs.push(`pageerror: ${e.message}`));
  await page.goto("http://localhost:30000/join");
  await page.waitForTimeout(2000);
  await page.selectOption("select[name=userid]", { label: "Gamemaster" }).catch(async () => {
    await page.evaluate(() => { const s = document.querySelector("select[name=userid]"); s.value = [...s.options].find(o => o.textContent === "Gamemaster").value; });
  });
  await page.click("button[name=join]");
  await page.waitForFunction(() => window.game?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  return { browser, page, logs };
}
