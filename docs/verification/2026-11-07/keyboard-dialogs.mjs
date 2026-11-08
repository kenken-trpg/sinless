import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {joinGM} from '../lib.mjs';
const {browser,page,logs}=await joinGM({noCanvas:true});
const results={};
const pass=(name,data)=>{results[name]=data;console.log('PASS',name,JSON.stringify(data));};
let id;
const wait=()=>page.waitForTimeout(350);
const open=async kind=>{
  await page.evaluate(async ({id,kind})=>{
    const actor=game.actors.get(id);
    const base='/systems/sinless/module/apps/';
    const state={label:'VERIFY KD Attack',final:[6,6],kismetAdded:[],target:4,extra:kind.startsWith('digital')?{digital:kind.split(':')[1],damage:4,rating:3}:{weapon:true,damage:4,armorType:'ballistic',penetration:0}};
    const message={getFlag:()=>state};
    window.kdDone=false;window.kdResult=null;window.kdError=null;
    let promise;
    if(kind==='test') {
      const {testDialog}=await import(`${base}test-dialog.mjs`);
      const defaults=actor._testDefaults({label:'VERIFY KD Test',pool:'brawn',rank:3});
      defaults.combat={accuracy:0,recoil:{tokens:0,capacity:5}};
      defaults.showFiring=true;
      promise=testDialog(defaults);
    } else if(kind==='drain') promise=(await import(`${base}drain-dialog.mjs`)).drainDialog(actor,{label:'VERIFY KD Drain',drain:4,lethal:false,fetish:0});
    else if(kind==='damage') promise=(await import(`${base}damage-dialog.mjs`)).damageDialog(message,actor);
    else promise=(await import(`${base}digital-dialog.mjs`)).digitalDialog(message,actor);
    promise.then(r=>{window.kdResult=r?.toObject?r.toObject():r;window.kdDone=true;}).catch(e=>{window.kdError=e.message;window.kdDone=true;});
  },{id,kind});
  await page.waitForSelector('dialog.sinless[open]');
  await wait();
};
const focus=selector=>page.evaluate(selector=>{
  const el=document.querySelector('dialog.sinless[open]').querySelector(selector);
  if(!el)throw new Error(`missing ${selector}`);el.focus();
  return document.activeElement===el;
},selector);
const snapshot=()=>page.evaluate(id=>({system:game.actors.get(id).toObject().system,messages:game.messages.map(m=>m.id)}),id);
const finished=async()=>{
  await page.waitForFunction(()=>window.kdDone);
  assert.equal(await page.evaluate(()=>window.kdError),null);
};
try {
  id=await page.evaluate(async()=> (await Actor.create({name:'VERIFY KD Actor',type:'character'})).id);
  for(const kind of ['test','damage','drain','digital:weapon','digital:strike','digital:derez','digital:acid']) {
    const before=await snapshot();
    await open(kind);
    const count=await page.evaluate(()=>{
      const root=document.querySelector('dialog.sinless[open]');
      const els=[...root.querySelectorAll('button,input,select,[tabindex]')].filter(e=>!e.disabled&&e.tabIndex>=0&&e.getClientRects().length);
      els.forEach((e,i)=>e.dataset.kdTab=String(i));els[0].focus();return els.length;
    });
    for(const [key,indices] of [['Tab',Array.from({length:count-1},(_,i)=>i+1)],['Shift+Tab',Array.from({length:count-1},(_,i)=>count-2-i)]]) for(const i of indices){
      await page.keyboard.press(key);
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.kdTab),String(i),`${kind} ${key} ${i}`);
    }
    const checkbox=await page.evaluate(()=>document.querySelector('dialog.sinless[open] input[type=checkbox]')?.name??null);
    if(checkbox){
      await focus(`[name="${checkbox}"]`);
      const old=await page.evaluate(()=>document.activeElement.checked);
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(()=>document.activeElement.checked),!old);
      if(kind==='drain')assert.equal(await page.locator('dialog.sinless[open] [name=soak]').isDisabled(),true);
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(()=>document.activeElement.checked),old);
    }
    const numeric=await page.evaluate(()=>document.querySelector('dialog.sinless[open] input[type=number]')?.name);
    await focus(`[name="${numeric}"]`);
    await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('2');await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');await finished();
    assert.deepEqual(await snapshot(),before,`${kind}: Escape has no effects`);
    for(const key of ['Enter','Space']){
      await open(kind);await focus('[data-action=cancel]');await page.keyboard.press(key);await finished();
      assert.deepEqual(await snapshot(),before,`${kind}: cancel ${key} has no effects`);
    }
    pass(`${kind} navigation, editing, Space and cancellation`,{controls:count,checkbox});

    // An auxiliary defense roll opens a nested test, not the Apply action.
    if(['damage','drain','digital:weapon'].includes(kind)){
      await open(kind);assert.ok(await focus('[data-sinless-roll]'));
      await page.keyboard.press('Enter');await wait();
      assert.equal(await page.locator('dialog.sinless-test-dialog[open]').count(),1);
      await page.keyboard.press('Escape');await wait();
      assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-sinless-roll')),true,`${kind}: return to roll button`);
      await page.keyboard.press('Escape');await finished();
      assert.deepEqual(await snapshot(),before,`${kind}: nested cancellation has no effects`);
      pass(`${kind} nested roll cancellation`,{restored:true});
    }

    // Enter in an input submits the default action once and reads the typed value.
    if(!['digital:derez','digital:acid'].includes(kind)){
      await open(kind);
      const field=kind==='test'?'bonus':kind==='drain'?'drain':'base';
      await focus(`[name="${field}"]`);
      await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('3');await page.keyboard.press('Enter');await finished();
      if(kind==='test')assert.equal(await page.evaluate(()=>window.kdResult.bonusField),3);
      else {
        const after=await snapshot();
        assert.equal(after.messages.length-before.messages.length,1,`${kind}: one application message`);
        assert.ok(after.system.condition.physical.value>before.system.condition.physical.value||after.system.condition.stun.value>before.system.condition.stun.value,`${kind}: damage applied`);
      }
      pass(`${kind} Enter submits the edited input`,{field,value:3});
    }
  }
  assert.deepEqual(logs.filter(l=>l.startsWith('pageerror')),[]);
  pass('no page errors',{errors:0});
} finally {
  if(id)await page.evaluate(async id=>{
    for(const app of [...foundry.applications.instances.values()]) if(app.element?.matches('dialog.sinless'))await app.close();
    for(const m of [...game.messages])if(m.speaker.actor===id)await m.delete();
    await game.actors.get(id)?.delete();
  },id);
  const dir=process.env.SINLESS_VERIFY_OUT??'/private/tmp/sinless-verification';mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/keyboard-dialogs.json`,JSON.stringify(results,null,2));
  await browser.close();
}
