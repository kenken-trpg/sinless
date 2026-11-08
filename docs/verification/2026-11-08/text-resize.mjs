// Text resized to 200% (WCAG 2.2 1.4.4): Foundry's font scale 10 doubles the root font size (16px to 32px).
// Every actor sheet tab, an item sheet, the help, operation and chase windows, a test dialog and a chat card are opened at their
// default size, and nothing may be lost:
// - content cut off horizontally (the windows only scroll vertically), or vertically without a scroll bar,
// - text clipped by an element or ancestor that hides overflow,
// - an input or select too narrow for its value,
// - text squeezed into a column narrower than three characters (a caption broken one character per line),
// - text taller than its box (a wrapped button label) spilling over what follows.
// The font scale is restored afterwards. SINLESS_TEXT_SCALE sets another scale (1-10) to compare.
// With the argument "spacing" (the text-spacing check), the text keeps its size and the WCAG 1.4.12 user style is applied
// instead: line height 1.5, paragraph spacing 2em, letter spacing 0.12em and word spacing 0.16em. The same losses are checked.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {joinGM} from '../lib.mjs';
const SPACING=process.argv.includes('spacing');
const REFLOW=process.argv.includes('reflow');
const SCALE=SPACING?null:Number(process.env.SINLESS_TEXT_SCALE??(REFLOW?5:10));
const MODE=REFLOW?'at 320px sheet width':SPACING?'with WCAG text spacing':`at font scale ${SCALE}`;
const SPACING_CSS='*{line-height:1.5!important;letter-spacing:0.12em!important;word-spacing:0.16em!important}p{margin-bottom:2em!important}';
// SINLESS_TEXT_WIDTH narrows the sheets instead (WCAG 1.4.10 reflow), e.g. 400 with SINLESS_TEXT_SCALE=5.
const WIDTH=process.env.SINLESS_TEXT_WIDTH?Number(process.env.SINLESS_TEXT_WIDTH):(REFLOW?320:null);
const {browser,page,logs}=await joinGM({noCanvas:true,viewport:{width:1600,height:1100}});
page.setDefaultTimeout(20000);
const outDir=process.env.SINLESS_VERIFY_OUT??'/private/tmp/sinless-verification';mkdirSync(outDir,{recursive:true});
if(process.env.SINLESS_VERIFY_LANGUAGE)assert.equal(await page.evaluate(()=>game.i18n.lang),process.env.SINLESS_VERIFY_LANGUAGE);
console.log('Language:',await page.evaluate(()=>game.i18n.lang),SPACING?'text spacing':`font scale: ${SCALE}`,'sheet width:',WIDTH??'default');
const results={};let fixture;
const createdMessages=[];
const pass=(name,data)=>{results[name]=data;console.log('PASS',name,JSON.stringify(data));};
const settle=()=>page.waitForTimeout(500);

/** Problems inside one window, measured in the page. */
const inspect=selector=>page.evaluate(selector=>{
 const root=document.querySelector(selector);
 const content=root.querySelector('.window-content')??root;
 const problems=[];
 const name=e=>`${e.tagName.toLowerCase()}${e.getAttribute('name')?`[name="${e.getAttribute('name')}"]`:''}${[...e.classList].slice(0,3).map(c=>'.'+c).join('')}`;
 const text=e=>[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('.tab:not(.active)')&&!e.closest('.sinless-sr-only');};
 if(content.scrollWidth>content.clientWidth+1)problems.push({kind:'cut off horizontally',el:name(content),detail:`${content.scrollWidth} > ${content.clientWidth}`});
 // Taller content must scroll: a window that hides vertical overflow loses what does not fit.
 if(content.scrollHeight>content.clientHeight+1&&!['auto','scroll'].includes(getComputedStyle(content).overflowY))problems.push({kind:'cut off vertically',el:name(content),detail:`${content.scrollHeight} > ${content.clientHeight}, overflow-y ${getComputedStyle(content).overflowY}`});
 const ctx=document.createElement('canvas').getContext('2d');
 for(const e of content.querySelectorAll('*')){
  if(!visible(e)||e.closest('i,svg'))continue;
  const cs=getComputedStyle(e);
  if(e.matches('input[type=text],input[type=number],input:not([type])')&&e.value){
   // An input scrolls its value; text wider than the box is hidden.
   if(e.scrollWidth>e.clientWidth+1)problems.push({kind:'value does not fit',el:name(e),text:e.value.slice(0,20),detail:`${e.scrollWidth} > ${e.clientWidth}`});
   continue;
  }
  if(e.matches('select')){
   const label=e.selectedOptions[0]?.textContent.trim()??'';
   ctx.font=`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
   ctx.letterSpacing=cs.letterSpacing;
   ctx.wordSpacing=cs.wordSpacing;
   const room=e.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
   if(label&&ctx.measureText(label).width>room+1)problems.push({kind:'value does not fit',el:name(e),text:label.slice(0,20),detail:`${Math.round(ctx.measureText(label).width)} > ${Math.round(room)}`});
   continue;
  }
  const t=text(e);if(!t||e.matches('input,textarea,select,option'))continue;
  const r=e.getBoundingClientRect();
  // Clipped by itself or by an ancestor (inside this window) that hides overflow.
  if(['hidden','clip'].includes(cs.overflowX)&&e.scrollWidth>e.clientWidth+1)problems.push({kind:'text clipped',el:name(e),text:t.slice(0,20),detail:`${e.scrollWidth} > ${e.clientWidth}`});
  // Text taller than a fixed-height box spills over the content below it.
  if(cs.display!=='inline'){
   // Measured on the element's own text, so icons or children that overflow on purpose do not count.
   const range=document.createRange();
   const lines=[...e.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).flatMap(n=>{range.selectNodeContents(n);return [...range.getClientRects()];});
   // A font taller than the line height overhangs each line by half the difference; that is normal, not spilling.
   const overhang=Math.max(0,...lines.map(l=>(l.height-(parseFloat(cs.lineHeight)||l.height))/2));
   const bottom=Math.max(...lines.map(l=>l.bottom)),inner=r.bottom-parseFloat(cs.borderBottomWidth);
   if(bottom>inner+overhang+1)problems.push({kind:'text spills out',el:name(e),text:t.slice(0,20),detail:`text ends ${Math.round(bottom-inner-overhang)}px below the box`});
  }
  if(['hidden','clip'].includes(cs.overflowY)&&e.scrollHeight>e.clientHeight+1)problems.push({kind:'text clipped',el:name(e),text:t.slice(0,20),detail:`height ${e.scrollHeight} > ${e.clientHeight}`});
  for(let a=e.parentElement;a&&a!==content.parentElement;a=a.parentElement){
   const ac=getComputedStyle(a);
   const ar=a.getBoundingClientRect();
   if(['hidden','clip'].includes(ac.overflowX)&&(r.right>ar.right+1||r.left<ar.left-1)){problems.push({kind:'text clipped',el:name(e),text:t.slice(0,20),detail:`by ${name(a)}`});break;}
   // The window content scrolls vertically, so only other ancestors can clip text above or below.
   if(a!==content&&['hidden','clip'].includes(ac.overflowY)&&(r.bottom>ar.bottom+1||r.top<ar.top-1)){problems.push({kind:'text clipped',el:name(e),text:t.slice(0,20),detail:`vertically by ${name(a)}`});break;}
  }
  // A caption squeezed to a column under three characters wide.
  const fs=parseFloat(cs.fontSize);
  ctx.font=`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.letterSpacing=cs.letterSpacing;
  ctx.wordSpacing=cs.wordSpacing;
  const natural=ctx.measureText(t).width;
  if(cs.display!=='inline'&&natural>e.clientWidth+1&&e.clientWidth>0&&e.clientWidth<3*fs)problems.push({kind:'squeezed',el:name(e),text:t.slice(0,20),detail:`${e.clientWidth}px < 3em (${Math.round(3*fs)}px)`});
 }
 return problems;
},selector);

try{
 fixture=await page.evaluate(async()=>{
  if(game.world.id!=='sinless-test')throw new Error('Use sinless-test');
  const ui=foundry.utils.deepClone(game.settings.get('core','uiConfig'));
  const ch=await Actor.create({name:'VERIFY Resize Runner',type:'character',system:{creation:{active:false},skills:{firearms:{rank:3}}}});
  const [weapon]=await ch.createEmbeddedDocuments('Item',[{name:'VERIFY Resize Pistol',type:'weapon'},{name:'VERIFY Resize Jacket',type:'armor'}]);
  const npc=await Actor.create({name:'VERIFY Resize NPC',type:'npc'});
  const vehicle=await Actor.create({name:'VERIFY Resize Van',type:'vehicle'});
  const brand=await Actor.create({name:'VERIFY Resize Brand',type:'brand'});
  await brand.createEmbeddedDocuments('Item',[{name:'VERIFY Resize Safehouse',type:'resource',system:{class:'D'}}]);
  return {ui,actors:[ch.id,npc.id,vehicle.id,brand.id],ch:ch.id,weapon:weapon.id};
 });
 if(SPACING){
  await page.addStyleTag({content:SPACING_CSS});
  const applied=await page.evaluate(()=>{const cs=getComputedStyle(document.body);return {letter:cs.letterSpacing,word:cs.wordSpacing,line:cs.lineHeight,size:cs.fontSize};});
  console.log('Text spacing:',JSON.stringify(applied));
  for(const [property,ratio] of [['letter',0.12],['word',0.16],['line',1.5]])
   assert.ok(Math.abs(parseFloat(applied[property])-parseFloat(applied.size)*ratio)<0.01,`${property} spacing applied`);
 }
 else await page.evaluate(async scale=>{const ui=foundry.utils.deepClone(game.settings.get('core','uiConfig'));ui.fontScale=scale;await game.settings.set('core','uiConfig',ui);},SCALE);
 await settle();
 const rootFont=await page.evaluate(()=>getComputedStyle(document.documentElement).fontSize);console.log('Root font size:',rootFont);
 if(SCALE===10)assert.equal(rootFont,'32px','font scale 10 doubles the 16px default');
 const problems=[];let windows=0;
 const check=async(label,selector)=>{
  const found=await inspect(selector);windows++;
  for(const p of found)problems.push({where:label,...p});
  if(found.length&&process.env.SINLESS_TEXT_SHOTS)await page.locator(selector).first().screenshot({path:`${outDir}/${label.replace(/[^\w-]+/g,'_')}.png`}).catch(()=>{});
 };
 for(const id of fixture.actors){
  const type=await page.evaluate(id=>game.actors.get(id).type,id);
  const tabs=await page.evaluate(id=>game.actors.get(id).sheet.constructor.TABS.primary.tabs.map(t=>t.id),id);
  await page.evaluate(async({id,width})=>{const s=game.actors.get(id).sheet;await s.render({force:true});if(width)s.setPosition({width});},{id,width:WIDTH});
  const sel=`#${await page.evaluate(id=>game.actors.get(id).sheet.id,id)}`;
  await page.locator(sel).waitFor({state:'visible'});
  for(const tab of tabs){
   if(!await page.evaluate(({id,tab})=>{const s=game.actors.get(id).sheet;if(!s.element.querySelector(`.tab[data-tab="${tab}"]`))return false;s.changeTab(tab,'primary');return true;},{id,tab}))continue;
   await settle();
   await check(`${type} ${tab}`,sel);
  }
  await page.evaluate(async id=>game.actors.get(id).sheet.close(),id);
 }
 await page.evaluate(async({f,width})=>{const s=game.actors.get(f.ch).items.get(f.weapon).sheet;await s.render({force:true});if(width)s.setPosition({width});},{f:fixture,width:WIDTH});
 const itemSel=`#${await page.evaluate(f=>game.actors.get(f.ch).items.get(f.weapon).sheet.id,fixture)}`;
 await page.locator(itemSel).waitFor({state:'visible'});await settle();
 await check('weapon item',itemSel);
 await page.evaluate(async f=>game.actors.get(f.ch).items.get(f.weapon).sheet.close(),fixture);
 for(const [name,selector] of [['help','#sinless-help'],['operation','#sinless-operation'],['chase','#sinless-chase'],['test dialog','dialog.sinless-test-dialog[open]']]){
  await page.evaluate(async({name,id})=>{
   const base='/systems/sinless/module/apps/';
   if(name==='help')(await import(`${base}help.mjs`)).HelpApp.open();
   else if(name==='operation')(await import(`${base}operation.mjs`)).OperationApp.open();
   else if(name==='chase')(await import(`${base}chase.mjs`)).ChaseApp.open();
   else{const defaults=game.actors.get(id)._testDefaults({label:'VERIFY Resize Test',pool:'brawn',rank:3});defaults.combat={accuracy:0,recoil:{tokens:0,capacity:5}};defaults.showFiring=true;
    window.resizeDialog=(await import(`${base}test-dialog.mjs`)).testDialog(defaults);}
  },{name,id:fixture.ch});
  await page.locator(selector).first().waitFor({state:'visible'});await settle();
  await check(name,selector);
  if(name==='test dialog'){await page.keyboard.press('Escape');await page.evaluate(()=>window.resizeDialog);}
  else await page.evaluate(async selector=>{for(const app of [...foundry.applications.instances.values()])if(app.element?.matches(selector))await app.close();},selector);
  await settle();
 }
 // A chat card with its Kismet button, in the chat sidebar.
 const message=await page.evaluate(async id=>{
  const {renderCard}=await import('/systems/sinless/module/dice/test-roll.mjs');
  const state={label:'VERIFY Resize Card',pool:null,target:4,untrained:false,plan:{usesPool:false,total:5,poolDice:0,bonusDice:0,kismetDice:0},reroll:1,threshold:5,notes:['VERIFY Resize note'],extra:{},
   initial:[5,1,3,6,2],final:[5,4,3,6,2],rerolledIndices:[1],rerollCancelled:false,abf:false,kismetAdded:[],autoSuccesses:0,mcpUsed:0,vcrUsed:0};
  const m=await ChatMessage.create({content:await renderCard(state),speaker:ChatMessage.getSpeaker({actor:game.actors.get(id)})});
  ui.sidebar.changeTab('chat','primary');return m.id;
 },fixture.ch);
 createdMessages.push(message);
 await page.locator(`#chat .message[data-message-id="${message}"]`).waitFor({state:'visible'});await settle();
 await check('chat card',`#chat .message[data-message-id="${message}"]`);
 const grouped={};for(const p of problems){const k=`${p.where} | ${p.kind} | ${p.el}`;(grouped[k]??={...p,count:0}).count++;}
 results.problems=Object.values(grouped);
 for(const p of results.problems)console.log('LOST',p.where,'|',p.kind,'|',p.el,JSON.stringify(p.text??''),p.detail,p.count>1?`x${p.count}`:'');
 assert.deepEqual(results.problems.map(p=>`${p.where}: ${p.kind} ${p.el}`),[],`nothing lost ${MODE}`);
 pass(`nothing lost ${MODE}`,{windows});
 assert.deepEqual(logs.filter(l=>l.startsWith('pageerror')),[]);pass('no page errors',{errors:0});
}finally{
 if(fixture)await page.evaluate(async ({f,createdMessages})=>{
  await game.settings.set('core','uiConfig',f.ui);
  for(const app of [...foundry.applications.instances.values()])if(f.actors.includes(app.document?.id)||f.actors.includes(app.document?.parent?.id))await app.close();
  await Actor.deleteDocuments(f.actors.filter(id=>game.actors.get(id)));
  await ChatMessage.deleteDocuments(createdMessages.filter(id=>game.messages.has(id)));
 },{f:fixture,createdMessages}).catch(e=>console.error('cleanup',e.message));
 if(fixture){
  const left=await page.evaluate(({f,createdMessages})=>({actors:game.actors.filter(a=>a.name.startsWith('VERIFY Resize')).length,messages:createdMessages.every(id=>!game.messages.has(id)),ui:JSON.stringify(game.settings.get('core','uiConfig'))===JSON.stringify(f.ui)}),{f:fixture,createdMessages});
  assert.deepEqual(left,{actors:0,messages:true,ui:true});
  pass('temporary data removed and font scale restored',left);
 }
 writeFileSync(`${outDir}/${REFLOW?'reflow':SPACING?'text-spacing':'text-resize'}.json`,JSON.stringify(results,null,2));await browser.close();
}
