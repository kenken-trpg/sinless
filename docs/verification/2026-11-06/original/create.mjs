import { chromium } from "/Users/mantanikenichi/mydevelop/voice-atlas/node_modules/playwright/index.mjs";
const out = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto("http://localhost:30000/setup");
await page.waitForTimeout(2500);
// dismiss tours
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /Create World|ワールドの作成|ワールド作成/ }).click();
await page.waitForTimeout(1500);
const form = await page.evaluate(() => [...document.querySelectorAll("form input, form select, form button")].map(e => `${e.tagName} name=${e.name} type=${e.type} ${e.tagName==="SELECT"?[...e.options].map(o=>o.value).join(","):""} ${e.textContent?.trim().slice(0,30)}`).join("\n"));
console.log(form);
await page.screenshot({ path: out + "/create.png" });
await browser.close();
