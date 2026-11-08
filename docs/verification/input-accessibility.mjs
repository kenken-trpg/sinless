import assert from 'node:assert/strict';

/** Read Chromium's computed accessibility names and states, not just ARIA attributes. */
export async function verifyInputAccessibility(page, selector) {
  const editors=page.locator(`${selector} prose-mirror:visible`);
  const opened=[];
  for(let i=0;i<await editors.count();i++){
    const id=await editors.nth(i).getAttribute('id');
    const editor=page.locator(`[id="${id}"]`);
    const button=editor.locator('button.toggle');
    assert.ok(await button.getAttribute('aria-label'),'rich text editor toggle has a name');
    if(await editor.locator('[contenteditable=true]').count())continue;
    await button.focus();
    assert.equal(await button.evaluate(e=>document.activeElement===e),true,'editor toggle takes focus');
    await page.keyboard.press('Enter');
    await editor.locator('[contenteditable=true]').waitFor({state:'visible'});
    opened.push(editor);
  }
  const fields=await page.locator(selector).evaluate(root=>[...root.querySelectorAll('input:not([type=hidden]),select,textarea,[contenteditable=true]')]
    .filter(e=>e.getClientRects().length).map(e=>({id:e.id,name:e.name??e.closest('prose-mirror')?.getAttribute('name'),type:e.type,rich:e.isContentEditable,disabled:e.disabled,expected:e.getAttribute('aria-label'),
      checked:e.type==='checkbox'?e.checked:null,selected:e.tagName==='SELECT'?e.selectedOptions[0]?.textContent.trim():null})));
  const session=await page.context().newCDPSession(page);
  try{
    const {root}=await session.send('DOM.getDocument',{depth:-1,pierce:true});
    const ids=new Map();
    const walk=node=>{
      const attrs=node.attributes??[];const i=attrs.indexOf('id');if(i>=0)ids.set(attrs[i+1],node.backendNodeId);
      for(const c of [...(node.children??[]),...(node.shadowRoots??[])])walk(c);
    };walk(root);
    const {nodes}=await session.send('Accessibility.getFullAXTree');
    const ax=new Map(nodes.filter(n=>!n.ignored).map(n=>[n.backendDOMNodeId,n]));
    for(const field of fields){
      assert.ok(field.id,`${selector} ${field.name}: field id`);
      const node=ax.get(ids.get(field.id));
      assert.ok(node,`${selector} ${field.name}: exposed to accessibility tree`);
      assert.ok(node.name?.value?.trim(),`${selector} ${field.name}: accessible name`);
      if(field.expected)assert.equal(node.name.value.trim(),field.expected.trim(),`${field.name}: contextual name`);
      assert.ok(!/SINLESS\.|TYPES\./.test(node.name.value),`${field.name}: localized name`);
      const role=field.rich?'textbox':({number:'spinbutton',checkbox:'checkbox',text:'textbox','select-one':'combobox',textarea:'textbox'})[field.type];
      if(role)assert.equal(node.role.value,role,`${field.name}: input role`);
      const properties=Object.fromEntries((node.properties??[]).map(p=>[p.name,p.value.value]));
      if(field.rich)assert.equal(properties.multiline,true,`${field.name}: multiline editor`);
      if(field.checked!==null)assert.equal(properties.checked,String(field.checked),`${field.name}: checked state`);
      if(field.disabled)assert.equal(properties.disabled,true,`${field.name}: disabled state`);
      if(field.selected!==null)assert.equal(node.value?.value,field.selected,`${field.name}: selected option`);
    }
    return fields.length;
  }finally{
    await session.detach();
    for(const editor of opened.reverse()){
      await editor.locator('[contenteditable=true]').focus();
      await page.keyboard.press('ControlOrMeta+s');
      await editor.locator('[contenteditable=true]').waitFor({state:'detached'});
      assert.equal(await editor.locator('button.toggle').evaluate(e=>e===document.activeElement),true,'saving returns focus to the editor button');
    }
  }
}
