import { joinGM } from "./lib.mjs";
const { browser, page, logs } = await joinGM({});
const r = await page.evaluate(async () => {
  const m = game.messages.contents.filter(m => m.flags?.sinless?.test?.extra?.summon).at(-1);
  const x = m.flags.sinless.test.extra.summon;
  const out = { x, scene: canvas.scene?.name, can: game.user.can("TOKEN_CREATE") };
  try { const { placeSpirit } = await import("/systems/sinless/module/apps/spell-effects.mjs"); out.res = String(await placeSpirit(m)); } catch (e) { out.err = e.message + " " + e.stack.split("\n").slice(0, 4).join(" | "); }
  out.tokens = canvas.scene.tokens.map(t => t.name);
  return out;
});
console.log(JSON.stringify(r, null, 1));
console.log(JSON.stringify(logs.filter(l => !/favicon|404|WebGL|hardware/.test(l))));
await browser.close();
