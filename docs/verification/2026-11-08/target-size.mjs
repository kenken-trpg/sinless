// Pointer target size (WCAG 2.2 2.5.8, AA): every control in Sinless windows is at least 24 by 24 CSS pixels,
// or is spaced so that a 24px circle on its center meets no other target and no other small target's circle.
// A checkbox or input also counts its label, which clicks it too. Links inside a sentence are exempt (inline).
// Measured on the sample actors (every sheet tab), an item sheet of every type, the help, operation and chase
// windows (with an alert response, an active chase and a pursuer), a test dialog and a chat card.
// SINLESS_TARGET_SHOTS=1 also saves a screenshot of each window.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {joinGM} from '../lib.mjs';
const {browser,page,logs}=await joinGM({noCanvas:true,viewport:{width:1600,height:1100}});
page.setDefaultTimeout(20000);
const outDir=process.env.SINLESS_VERIFY_OUT??'/private/tmp/sinless-verification';mkdirSync(outDir,{recursive:true});
if(process.env.SINLESS_VERIFY_LANGUAGE)assert.equal(await page.evaluate(()=>game.i18n.lang),process.env.SINLESS_VERIFY_LANGUAGE);
console.log('Language:',await page.evaluate(()=>game.i18n.lang));
const results={};let fixture;
const pass=(name,data)=>{results[name]=data;console.log('PASS',name,JSON.stringify(data));};
const settle=()=>page.waitForTimeout(500);
const sampleDir=new URL('../../../samples/actors/',import.meta.url);
const samples=readdirSync(sampleDir).filter(f=>f.endsWith('.json')).sort().map(f=>JSON.parse(readFileSync(new URL(f,sampleDir),'utf8')));

/** Undersized targets inside the root, after the spacing exception. */
const inspect=selector=>page.evaluate(selector=>{
 const root=document.querySelector(selector);
 const content=root.querySelector('.window-content')??root;
 const name=e=>`${e.tagName.toLowerCase()}${e.getAttribute('name')?`[name="${e.getAttribute('name')}"]`:''}${e.dataset.action?`[data-action="${e.dataset.action}"]`:''}${[...e.classList].slice(0,2).map(c=>'.'+c).join('')}`;
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('.tab:not(.active)')&&!e.closest('.sinless-sr-only');};
 const SEL='button,a[href],[data-action],[data-sinless-action],input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=checkbox],summary';
 // A control inside another target (an icon in a button) is part of that target.
 const all=[...content.querySelectorAll(SEL)].filter(e=>visible(e)&&!e.parentElement.closest(SEL));
 const union=(a,b)=>{const left=Math.min(a.left,b.left),top=Math.min(a.top,b.top),right=Math.max(a.right,b.right),bottom=Math.max(a.bottom,b.bottom);return {left,top,right,bottom,width:right-left,height:bottom-top};};
 const rect=e=>{
  const r=e.getBoundingClientRect();
  const label=e.matches('input,select,textarea')&&(e.closest('label')??(e.id&&content.querySelector(`label[for="${CSS.escape(e.id)}"]`)));
  return label?union(r,label.getBoundingClientRect()):r;
 };
 const inline=e=>e.matches('a')&&getComputedStyle(e).display==='inline'&&e.parentElement.textContent.trim().length>e.textContent.trim().length+10;
 const targets=all.filter(e=>!inline(e)).map(e=>({e,r:rect(e)}));
 const small=targets.filter(t=>t.r.width<23.5||t.r.height<23.5);
 const center=r=>[(r.left+r.right)/2,(r.top+r.bottom)/2];
 const distance=([x,y],r)=>Math.hypot(Math.max(r.left-x,0,x-r.right),Math.max(r.top-y,0,y-r.bottom));
 const problems=[];
 for(const t of small){
  const c=center(t.r);
  const hit=targets.find(o=>o!==t&&(distance(c,o.r)<12||(small.includes(o)&&Math.hypot(c[0]-center(o.r)[0],c[1]-center(o.r)[1])<24)));
  if(hit)problems.push({el:name(t.e),size:`${Math.round(t.r.width)}x${Math.round(t.r.height)}`,near:name(hit.e)});
 }
 return {targets:targets.length,problems};
},selector);

try{
 fixture=await page.evaluate(async samples=>{
  if(game.world.id!=='sinless-test')throw new Error('Use sinless-test');
  const settings=Object.fromEntries(['operation','chase'].map(k=>[k,foundry.utils.deepClone(game.settings.get('sinless',k))]));
  const messages=game.messages.map(m=>m.id);
  const actors=[];
  for(const s of samples)actors.push(await Actor.create({...s,name:`VERIFY Target ${s.name}`}));
  const ch=actors.find(a=>a.type==='character');
  // Item types the samples lack, an effect, and a filled condition box.
  await ch.createEmbeddedDocuments('Item',[{name:'VERIFY Target Gear',type:'gear'},{name:'VERIFY Target Implant',type:'implant'},{name:'VERIFY Target Knowledge',type:'knowledge'}]);
  await ch.createEmbeddedDocuments('ActiveEffect',[{name:'VERIFY Target Effect',img:'icons/svg/aura.svg'}]);
  await ch.update({'system.condition.physical.value':2});
  const items=Object.values(Object.fromEntries(actors.flatMap(a=>a.items.map(i=>[i.type,i.uuid]))));
  const vehicle=actors.find(a=>a.type==='vehicle');
  const {renderCard}=await import('/systems/sinless/module/dice/test-roll.mjs');
  const state={label:'VERIFY Target',pool:null,target:4,untrained:false,plan:{usesPool:false,total:5,poolDice:0,bonusDice:0,kismetDice:0},reroll:1,threshold:5,notes:[],extra:{},
   initial:[5,1,3,6,2],final:[5,4,3,6,2],rerolledIndices:[1],rerollCancelled:false,abf:false,kismetAdded:[],autoSuccesses:0,mcpUsed:0,vcrUsed:0};
  const message=await ChatMessage.create({content:await renderCard(state),speaker:ChatMessage.getSpeaker({actor:ch})});
  return {settings,messages,message:message.id,actors:actors.map(a=>a.id),ch:ch.id,vehicle:vehicle.uuid,items};
 },samples);
 await page.evaluate(async f=>{
  await game.settings.set('sinless','operation',{responses:[{label:'VERIFY Target Response',threshold:10}],lastAlert:0,lastHeat:0,htr:null});
  await game.settings.set('sinless','chase',{active:true,vehicleUuid:f.vehicle,enemies:[{uuid:f.vehicle,name:'VERIFY Target Pursuer',range:'close',flying:false}],
   paths:[[{text:'VERIFY Target card',leg:false,revealed:true},{text:'VERIFY Target leg',leg:true,revealed:false}],[{text:'VERIFY Target card 2',leg:false,revealed:false}]],discard:[],legs:3,legsDone:1,primary:0,turn:1,ended:null});
 },fixture);
 const problems=[];let windows=0,targets=0;
 const check=async(label,selector)=>{
  const found=await inspect(selector);windows++;targets+=found.targets;
  for(const p of found.problems)problems.push({where:label,...p});
  // SINLESS_TARGET_SHOTS=1 saves a screenshot of every window, to compare layouts.
  if(process.env.SINLESS_TARGET_SHOTS)await page.locator(selector).first().screenshot({path:`${outDir}/${label.replace(/[^\w-]+/g,'_')}.png`}).catch(()=>{});
 };
 for(const id of fixture.actors){
  const {type,name,tabs,sel}=await page.evaluate(async id=>{const s=game.actors.get(id).sheet;await s.render({force:true});return {type:s.document.type,name:s.document.name.replace('VERIFY Target ',''),tabs:s.constructor.TABS.primary.tabs.map(t=>t.id),sel:`#${s.id}`};},id);
  await page.locator(sel).waitFor({state:'visible'});
  for(const tab of tabs){
   if(!await page.evaluate(({id,tab})=>{const s=game.actors.get(id).sheet;if(!s.element.querySelector(`.tab[data-tab="${tab}"]`))return false;s.changeTab(tab,'primary');return true;},{id,tab}))continue;
   await settle();
   await check(`${type} ${tab} (${name})`,sel);
  }
  await page.evaluate(async id=>game.actors.get(id).sheet.close(),id);
 }
 for(const uuid of fixture.items){
  const {type,sel}=await page.evaluate(async uuid=>{const s=(await fromUuid(uuid)).sheet;await s.render({force:true});return {type:s.document.type,sel:`#${s.id}`};},uuid);
  await page.locator(sel).waitFor({state:'visible'});await settle();
  await check(`${type} item`,sel);
  await page.evaluate(async uuid=>(await fromUuid(uuid)).sheet.close(),uuid);
 }
 for(const [name,selector] of [['help','#sinless-help'],['operation','#sinless-operation'],['chase','#sinless-chase'],['test dialog','dialog.sinless-test-dialog[open]']]){
  await page.evaluate(async({name,id})=>{
   const base='/systems/sinless/module/apps/';
   if(name==='help')(await import(`${base}help.mjs`)).HelpApp.open();
   else if(name==='operation')(await import(`${base}operation.mjs`)).OperationApp.open();
   else if(name==='chase')(await import(`${base}chase.mjs`)).ChaseApp.open();
   else{const defaults=game.actors.get(id)._testDefaults({label:'VERIFY Target Test',pool:'brawn',rank:3});defaults.combat={accuracy:0,recoil:{tokens:0,capacity:5}};defaults.showFiring=true;
    window.targetDialog=(await import(`${base}test-dialog.mjs`)).testDialog(defaults);}
  },{name,id:fixture.ch});
  await page.locator(selector).first().waitFor({state:'visible'});await settle();
  await check(name,selector);
  if(name==='test dialog'){await page.keyboard.press('Escape');await page.evaluate(()=>window.targetDialog);}
  else await page.evaluate(async selector=>{for(const app of [...foundry.applications.instances.values()])if(app.element?.matches(selector))await app.close();},selector);
  await settle();
 }
 await page.evaluate(()=>ui.sidebar.changeTab('chat','primary'));await settle();
 await check('chat card',`#chat .message[data-message-id="${fixture.message}"]`);
 const grouped={};for(const p of problems){const k=`${p.where} | ${p.el} | ${p.size}`;(grouped[k]??={...p,count:0}).count++;}
 results.problems=Object.values(grouped);
 for(const p of results.problems)console.log('SMALL',p.where,'|',p.el,p.size,'near',p.near,p.count>1?`x${p.count}`:'');
 assert.deepEqual(results.problems.map(p=>`${p.where}: ${p.el} ${p.size}`),[],'every target is 24px or spaced');
 pass('targets are at least 24px or spaced',{windows,targets});
 assert.deepEqual(logs.filter(l=>l.startsWith('pageerror')),[]);pass('no page errors',{errors:0});
}finally{
 if(fixture)await page.evaluate(async f=>{
  for(const app of [...foundry.applications.instances.values()])if(['sinless-help','sinless-operation','sinless-chase'].includes(app.id)||f.actors.includes(app.document?.id)||f.actors.includes(app.document?.parent?.id))await app.close();
  for(const key of ['operation','chase'])await game.settings.set('sinless',key,f.settings[key]);
  await Actor.deleteDocuments(f.actors.filter(id=>game.actors.get(id)));
  await ChatMessage.deleteDocuments(game.messages.filter(m=>!f.messages.includes(m.id)).map(m=>m.id));
 },fixture).catch(e=>console.error('cleanup',e.message));
 if(fixture){
  const left=await page.evaluate(f=>({actors:game.actors.filter(a=>a.name.startsWith('VERIFY Target')).length,messages:game.messages.size===f.messages.length,
   settings:['operation','chase'].every(k=>JSON.stringify(game.settings.get('sinless',k))===JSON.stringify(f.settings[k]))}),fixture);
  assert.deepEqual(left,{actors:0,messages:true,settings:true});
  pass('temporary data removed and settings restored',left);
 }
 writeFileSync(`${outDir}/target-size.json`,JSON.stringify(results,null,2));await browser.close();
}
