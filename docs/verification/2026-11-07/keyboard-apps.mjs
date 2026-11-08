import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {joinGM} from '../lib.mjs';
const {browser,page,logs}=await joinGM({noCanvas:true});
const results={};let fixture;
const pass=(name,data)=>{results[name]=data;console.log('PASS',name,JSON.stringify(data));};
const settle=()=>page.waitForTimeout(600);
const focus=async selector=>assert.ok(await page.evaluate(selector=>{const e=document.querySelector(selector);e?.focus();return e===document.activeElement;},selector),`focus ${selector}`);
const stays=async selector=>assert.equal(await page.evaluate(selector=>document.activeElement===document.querySelector(selector),selector),true,`focus stays at ${selector}`);
const activate=async(selector,key='Enter')=>{await focus(selector);await page.keyboard.press(key);await settle();};
const setting=key=>page.evaluate(key=>game.settings.get('sinless',key),key);
const tabOrder=async id=>{
 const count=await page.evaluate(id=>{
  const controls=[...document.getElementById(id).querySelectorAll('a,button,input,select,textarea,summary,[tabindex]')].filter(e=>!e.disabled&&e.tabIndex>=0&&e.getClientRects().length);
  if(controls.some(e=>e.tabIndex>0))throw new Error('positive tabindex');
  controls.forEach((e,i)=>e.dataset.verifyFocus=String(i));controls[0].focus();return controls.length;
 },id);
 for(const [key,indices] of [['Tab',Array.from({length:count-1},(_,i)=>i+1)],['Shift+Tab',Array.from({length:count-1},(_,i)=>count-2-i)]]) for(const i of indices){
  await page.keyboard.press(key);assert.equal(await page.evaluate(()=>document.activeElement.dataset.verifyFocus),String(i),`${id} ${key} ${i}`);
 }
 await page.evaluate(()=>document.querySelectorAll('[data-verify-focus]').forEach(e=>e.removeAttribute('data-verify-focus')));
 pass(`tab order ${id}`,{controls:count});
};
try{
 fixture=await page.evaluate(async()=>{
  if(game.world.id!=='sinless-test')throw new Error('Use sinless-test');
  const settings=Object.fromEntries(['operation','alert','heat','difficulty','chase'].map(k=>[k,foundry.utils.deepClone(game.settings.get('sinless',k))]));
  const messages=game.messages.map(m=>m.id);
  const vehicle=await Actor.create({name:'VERIFY KA Vehicle',type:'vehicle'});
  const enemy=await Actor.create({name:'VERIFY KA Enemy',type:'vehicle'});
  const existing=game.journal.find(j=>j.getFlag('sinless','help')==='ja');
  const journal=existing??await JournalEntry.create({name:'VERIFY KA Help',flags:{sinless:{help:'ja'}},pages:[]});
  return {settings,messages,actors:[vehicle.id,enemy.id],vehicle:vehicle.uuid,enemy:enemy.uuid,journal:existing?null:journal.id};
 });
 await page.evaluate(async()=>{
  await game.settings.set('sinless','alert',0);await game.settings.set('sinless','heat',0);
  await game.settings.set('sinless','operation',{responses:[{label:'VERIFY KA Response',threshold:10}],lastAlert:0,lastHeat:0,htr:null});
  const {HelpApp}=await import('/systems/sinless/module/apps/help.mjs');await HelpApp.open();
 });
 await settle();await tabOrder('sinless-help');
 await activate('#sinless-help [data-action=page][data-page=chat-cards]');
 await stays('#sinless-help [data-action=page][data-page=chat-cards]');
 assert.equal(await page.locator('#sinless-help a.active').getAttribute('data-page'),'chat-cards');
 pass('help page Enter keeps focus',{page:'chat-cards'});
 await activate('#sinless-help [data-action=page][data-page=tests]','Space');await stays('#sinless-help [data-action=page][data-page=tests]');
 await focus('#sinless-help select[name=lang]');await page.selectOption('#sinless-help select[name=lang]','en');await settle();
 await stays('#sinless-help select[name=lang]');assert.equal(await page.locator('#sinless-help select').inputValue(),'en');
 await page.selectOption('#sinless-help select[name=lang]','ja');await settle();await stays('#sinless-help select[name=lang]');
 assert.equal(await page.locator('#sinless-help select').inputValue(),'ja');
 pass('help language selection keeps focus',{language:'ja'});
 const journalBefore=await page.evaluate(f=>game.journal.get(f.journal??game.journal.find(j=>j.getFlag('sinless','help')==='ja').id).toObject(),fixture);
 await activate('#sinless-help [data-action=importJournal]');
 assert.equal(await page.locator('dialog[open]').count(),1);await page.keyboard.press('Escape');await settle();await stays('#sinless-help [data-action=importJournal]');
 assert.deepEqual(await page.evaluate(id=>game.journal.get(id).toObject(),journalBefore._id),journalBefore);
 pass('help update cancellation returns focus',{unchanged:true});

 await page.evaluate(async()=>{const {OperationApp}=await import('/systems/sinless/module/apps/operation.mjs');await OperationApp.open();});
 await settle();await tabOrder('sinless-operation');
 await activate('#sinless-operation [data-action=heat][data-heat="1"]','Space');
 assert.equal(await setting('heat'),1);await stays('#sinless-operation [data-action=heat][data-heat="1"]');
 await activate('#sinless-operation [data-action=alert][data-delta="1"]');
 assert.equal(await setting('alert'),1);await stays('#sinless-operation [data-action=alert][data-delta="1"]');
 pass('operation heat and alert keep focus',{heat:1,alert:1});
 await activate('#sinless-operation [data-action=addResponse]','Space');await stays('#sinless-operation [data-action=addResponse]');
 assert.equal((await setting('operation')).responses.length,2);
 await focus('#sinless-operation [name="responses.1.label"]');await page.keyboard.type('Keyboard response');await page.keyboard.press('Tab');await settle();
 assert.equal((await setting('operation')).responses[1].label,'Keyboard response');
 await activate('#sinless-operation [data-action=removeResponse][data-index="1"]');
 assert.equal((await setting('operation')).responses.length,1);
 assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#sinless-operation')),true,'response deletion retains focus');
 pass('operation responses by keyboard',{remaining:1});
 const beforeEnd=await page.evaluate(()=>({op:game.settings.get('sinless','operation'),alert:game.settings.get('sinless','alert'),heat:game.settings.get('sinless','heat'),messages:game.messages.map(m=>m.id)}));
 await activate('#sinless-operation [data-action=endOperation]');await page.keyboard.press('Escape');await settle();await stays('#sinless-operation [data-action=endOperation]');
 assert.deepEqual(await page.evaluate(()=>({op:game.settings.get('sinless','operation'),alert:game.settings.get('sinless','alert'),heat:game.settings.get('sinless','heat'),messages:game.messages.map(m=>m.id)})),beforeEnd);
 pass('operation end cancellation',{unchanged:true});

 await page.evaluate(async f=>{
  await game.settings.set('sinless','chase',{active:false,vehicleUuid:f.vehicle,enemies:[{uuid:f.enemy,name:'VERIFY KA Enemy',range:'close',flying:false}],paths:[],discard:[],legs:3,legsDone:0,primary:0,turn:1,ended:null});
  const {ChaseApp}=await import('/systems/sinless/module/apps/chase.mjs');await ChaseApp.open();
 },fixture);await settle();await tabOrder('sinless-chase');
 const beforeStart=await setting('chase');await activate('#sinless-chase [data-action=start]');await page.keyboard.press('Escape');await settle();await stays('#sinless-chase [data-action=start]');assert.deepEqual(await setting('chase'),beforeStart);
 pass('chase start cancellation',{unchanged:true});
 await activate('#sinless-chase [data-action=start]');await focus('dialog[open] [data-action=start]');await page.keyboard.press('Enter');await settle();assert.equal((await setting('chase')).active,true);
 await tabOrder('sinless-chase');
 await activate('#sinless-chase [data-action=leg][data-delta="1"]','Space');assert.equal((await setting('chase')).legsDone,1);await stays('#sinless-chase [data-action=leg][data-delta="1"]');
 await activate('#sinless-chase [data-action=reveal][data-path="0"]');assert.equal((await setting('chase')).paths[0][0].revealed,true);await stays('#sinless-chase [data-action=reveal][data-path="0"]');
 await activate('#sinless-chase [data-action=moveEnemy][data-delta="1"]','Space');await stays('#sinless-chase [data-action=moveEnemy][data-delta="1"]');
 await focus('#sinless-chase input[type=checkbox]');await page.keyboard.press('Space');await settle();assert.equal((await setting('chase')).enemies[0].flying,true);await stays('#sinless-chase input[type=checkbox]');
 pass('chase legs, paths and pursuer controls',{focused:true});
 await activate(`#sinless-chase [data-action=openActor][data-uuid="${fixture.vehicle}"]`);assert.equal(await page.evaluate(id=>game.actors.get(id).sheet.element.contains(document.activeElement),fixture.actors[0]),true);
 await page.evaluate(id=>game.actors.get(id).sheet.element.querySelector('[data-action=close]').focus(),fixture.actors[0]);await page.keyboard.press('Enter');await settle();await stays(`#sinless-chase [data-action=openActor][data-uuid="${fixture.vehicle}"]`);
 pass('chase vehicle sheet returns focus',{restored:true});
 await activate('#sinless-chase [data-action=primary]');
 assert.equal((await setting('chase')).primary,1);
 assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#sinless-chase')),true,'primary control removal retains focus');
 const turn=(await setting('chase')).turn;
 await activate('#sinless-chase [data-action=flip]','Space');
 assert.equal((await setting('chase')).turn,turn+1);await stays('#sinless-chase [data-action=flip]');
 await activate('#sinless-chase [data-action=removeEnemy]');
 assert.equal((await setting('chase')).enemies.length,0);await stays('#sinless-chase [data-action=addEnemies]');
 pass('chase primary, turn and pursuer removal',{focused:true});

 assert.deepEqual(logs.filter(l=>l.startsWith('pageerror')),[]);pass('no page errors',{errors:0});
}finally{
 if(fixture)await page.evaluate(async f=>{
  for(const app of [...foundry.applications.instances.values()])if(['sinless-help','sinless-operation','sinless-chase'].includes(app.id)||f.actors.includes(app.document?.id)||app.element?.matches('dialog.sinless,dialog.application'))await app.close();
  for(const key of ['difficulty','alert','heat'])await game.settings.set('sinless',key,f.settings[key]);
  await new Promise(r=>setTimeout(r,600));
  for(const key of ['operation','chase'])await game.settings.set('sinless',key,f.settings[key]);
  for(const id of f.actors)await game.actors.get(id)?.delete();
  if(f.journal)await game.journal.get(f.journal)?.delete();
  for(const m of [...game.messages])if(!f.messages.includes(m.id)&&/sinless-(operation|chase)-card/.test(m.content))await m.delete();
 },fixture);
 if(fixture){
  const restored=await page.evaluate(()=>Object.fromEntries(['operation','alert','heat','difficulty','chase'].map(k=>[k,game.settings.get('sinless',k)])));
  assert.deepEqual(restored,fixture.settings,'restore original world settings');
  pass('world settings restored',{restored:true});
 }
 const dir=process.env.SINLESS_VERIFY_OUT??'/private/tmp/sinless-verification';mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/keyboard-apps.json`,JSON.stringify(results,null,2));await browser.close();
}
