import assert from 'node:assert/strict';

/** A long gear list exercises actual scroll containers, including the narrow-sheet layout. */
export async function verifyFocusScroll(page, pass) {
  let fixture;
  try {
    fixture = await page.evaluate(async () => {
      const ui = foundry.utils.deepClone(game.settings.get('core', 'uiConfig'));
      const actor = await Actor.create({name: 'VERIFY KB Scroll', type: 'character', system: {creation: {active: false}}});
      const items = await actor.createEmbeddedDocuments('Item', Array.from({length: 35}, (_, i) => ({name: `VERIFY Scroll Gear ${String(i).padStart(2, '0')}`, type: 'gear'})));
      return {id: actor.id, item: items.at(-1).id, ui};
    });
    for (const [label, width, scale] of [['default', 800, 5], ['narrow', 320, 5], ['large text', 800, 10]]) {
      await page.evaluate(async ({f, width, scale}) => {
        const ui = foundry.utils.deepClone(game.settings.get('core', 'uiConfig'));
        ui.fontScale = scale;
        await game.settings.set('core', 'uiConfig', ui);
        const sheet = game.actors.get(f.id).sheet;
        await sheet.render({force: true});
        sheet.setPosition({left: 20, top: 20, width, height: 500});
        sheet.changeTab('gear', 'primary');
      }, {f: fixture, width, scale});
      await page.waitForTimeout(600);
      const root = `#${await page.evaluate(id => game.actors.get(id).sheet.id, fixture.id)}`;
      const row = `${root} [data-item-id="${fixture.item}"]`;
      const toggle = page.locator(`${row} [data-action=itemToggle]`);
      // Enter keyboard mode before focusing the off-screen control. focus() scrolls it into view.
      await page.keyboard.press('Tab');
      await toggle.focus();
      const visibleFocus = async locator => {
        const result = await locator.evaluate(e => {
          const r = e.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          let scrolled = false;
          for (let a = e.parentElement; a; a = a.parentElement) if (a.scrollTop > 0) scrolled = true;
          return {focused: e === document.activeElement, visible: !!hit && (hit === e || e.contains(hit)), scrolled};
        });
        assert.deepEqual(result, {focused: true, visible: true, scrolled: true}, `${label}: visible focus in a scrolled list`);
      };
      await visibleFocus(toggle);
      for (const key of ['Space', 'Enter']) {
        const before = await toggle.getAttribute('aria-pressed');
        await page.keyboard.press(key);
        await page.waitForTimeout(700);
        assert.notEqual(await toggle.getAttribute('aria-pressed'), before, `${label}: ${key} changes carried state`);
        await visibleFocus(toggle);
      }
      const edit = page.locator(`${row} [data-action=itemEdit]`);
      await edit.focus();
      await page.keyboard.press('Enter');
      const childId = await page.evaluate(f => game.actors.get(f.id).items.get(f.item).sheet.id, fixture);
      const child = page.locator(`#${childId}`);
      await child.waitFor({state: 'visible'});
      assert.equal(await child.evaluate(e => e.contains(document.activeElement)), true, `${label}: focus enters item sheet`);
      await child.locator('[data-action=close]').focus();
      await page.keyboard.press('Enter');
      await child.waitFor({state: 'detached'});
      await page.waitForTimeout(700);
      await visibleFocus(edit);
      pass(`scrolled focus ${label}`, {width, scale, items: 35, toggleKeys: ['Space', 'Enter'], childReturn: true});
      await page.evaluate(async id => game.actors.get(id).sheet.close(), fixture.id);
    }
  } finally {
    if (fixture) {
      await page.evaluate(async f => {
        const actor = game.actors.get(f.id);
        for (const app of [...foundry.applications.instances.values()]) if (app.document === actor || app.document?.parent === actor) await app.close();
        await actor?.delete();
        await game.settings.set('core', 'uiConfig', f.ui);
      }, fixture);
      assert.equal(await page.evaluate(f => !game.actors.has(f.id) && JSON.stringify(game.settings.get('core', 'uiConfig')) === JSON.stringify(f.ui), fixture), true, 'scroll fixture removed and UI restored');
    }
  }
}
