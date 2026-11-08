import assert from 'node:assert/strict';

/** Exercise every non-character document sheet using real keyboard events. */
export async function verifyOtherSheets(page, pass) {
  const created = [];
  try {
    const types = await page.evaluate(() => ({Actor:Object.keys(CONFIG.Actor.dataModels).filter(t=>t !== 'character'), Item:Object.keys(CONFIG.Item.dataModels)}));
    for (const [kind, names] of Object.entries(types)) for (const type of names) {
      const uuid = await page.evaluate(async ({kind,type}) => {
        const doc = await (kind === 'Actor' ? Actor : Item).create({name:`VERIFY KB ${type}`,type});
        return doc.uuid;
      }, {kind,type});
      created.push(uuid);
      const tabs = await page.evaluate(async uuid => {
        const doc = await fromUuid(uuid);
        if (doc.documentName === 'Actor') await doc.createEmbeddedDocuments('Item', [{name:'VERIFY KB Child',type:doc.type === 'brand' ? 'resource' : 'gear'}]);
        await doc.sheet.render(true);
        return [...doc.sheet.element.querySelectorAll('nav [data-tab]')].map(e=>e.dataset.tab);
      }, uuid);
      for (const tab of tabs.length ? tabs : [null]) {
        const count = await page.evaluate(async ({uuid,tab}) => {
          const sheet = (await fromUuid(uuid)).sheet;
          if (tab) sheet.changeTab(tab,'primary');
          const controls = [...sheet.element.querySelectorAll('a,button,input,select,textarea,summary,[contenteditable=true],[tabindex]')]
            .filter(e=>e.getClientRects().length && !e.disabled && e.tabIndex >= 0);
          if (controls.some(e=>e.tabIndex > 0)) throw new Error('positive tabindex');
          controls.forEach((e,i)=>e.dataset.verifyFocus=String(i));
          controls[0].focus();
          return controls.length;
        },{uuid,tab});
        assert.ok(count > 0);
        for (const [key,indices] of [['Tab',Array.from({length:count-1},(_,i)=>i+1)],['Shift+Tab',Array.from({length:count-1},(_,i)=>count-2-i)]]) {
          for (const i of indices) {
            await page.keyboard.press(key);
            assert.equal(await page.evaluate(()=>document.activeElement.dataset.verifyFocus ?? document.activeElement.outerHTML.slice(0,200)),String(i),`${type}/${tab}: ${key} ${i}`);
          }
        }
        await page.evaluate(()=>document.querySelectorAll('[data-verify-focus]').forEach(e=>e.removeAttribute('data-verify-focus')));
        pass(`tab order ${kind}/${type}/${tab ?? 'sheet'}`,{controls:count});
      }
      if (kind === 'Actor') {
        for (const action of ['itemEdit','itemDelete', ...(type === 'brand' ? ['endSectorTurn'] : ['rollDefense'])]) {
          const available = await page.evaluate(async ({uuid,action}) => {
            const sheet=(await fromUuid(uuid)).sheet;
            const el=[...sheet.element.querySelectorAll(`[data-action="${action}"]`)].find(e=>{
              const tab=e.closest('.tab[data-tab]')?.dataset.tab;
              return e.tabIndex >= 0 && (!tab || sheet.element.querySelector(`nav [data-tab="${tab}"]`));
            });
            if (!el) return false;
            const tab=el.closest('.tab[data-tab]')?.dataset.tab;
            if (tab) sheet.changeTab(tab,'primary');
            window.kbBefore=new Set(foundry.applications.instances.keys());
            el.focus();return {focused:document.activeElement===el, element:el.outerHTML, tab, active:document.activeElement.outerHTML.slice(0,200)};
          },{uuid,action});
          if (!available) continue;
          assert.equal(available.focused,true,JSON.stringify(available));
          await page.keyboard.press('Enter');
          await page.waitForTimeout(600);
          const opened=await page.evaluate(()=>{
            const apps=[...foundry.applications.instances.values()].filter(a=>!window.kbBefore.has(a.id)&&a.rendered);
            return apps.map(a=>({id:a.id,focused:a.element.contains(document.activeElement)}));
          });
          assert.equal(opened.length,1,`${type} ${action}: child window`);
          assert.equal(opened[0].focused,true,`${type} ${action}: focus enters child`);
          await page.evaluate(id=>foundry.applications.instances.get(id).element.querySelector('[data-action=close]').focus(),opened[0].id);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(600);
          assert.equal(await page.evaluate(async ({uuid,action})=>(await fromUuid(uuid)).sheet.element.contains(document.activeElement)&&document.activeElement.dataset.action===action,{uuid,action}),true,`${type} ${action}: focus returns`);
          pass(`child focus ${type}/${action}`,{restored:true});
        }
      }
      await page.evaluate(async uuid=>{await (await fromUuid(uuid)).sheet.close();},uuid);
    }
  } finally {
    for (const uuid of created.reverse()) await page.evaluate(async uuid=>{
      const doc=await fromUuid(uuid);if (!doc)return;
      for (const app of [...foundry.applications.instances.values()]) if(app.document===doc||app.document?.parent===doc)await app.close();
      await doc.delete();
    },uuid);
  }
}
