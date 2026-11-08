// Text contrast on Sinless sheets and chat cards, in the dark and light application themes (WCAG 2.2 1.4.3).
// Backgrounds can be images (the chat card parchment), so they are read from a screenshot taken with the
// text made transparent; the text color is the computed color, with the opacity of its ancestors applied.
// Disabled controls are exempt (WCAG "inactive user interface components"), as are icons.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {joinGM} from '../lib.mjs';
const {browser,page,logs}=await joinGM({noCanvas:true,viewport:{width:1600,height:1100}});
page.setDefaultTimeout(20000);
const results={};let fixture;
const pass=(name,data)=>{results[name]=data;console.log('PASS',name,JSON.stringify(data));};
const settle=()=>page.waitForTimeout(500);

/** Text elements inside the roots, with their computed text color, size and box. */
const collect=roots=>page.evaluate(roots=>{
 // Computed colors are rgb()/rgba(), or color(srgb r g b / a) with 0-1 channels (color-mix).
 const parse=c=>{const m=c.match(/[\d.]+/g)?.map(Number)??[0,0,0];if(c.startsWith('color('))return [m[0]*255,m[1]*255,m[2]*255,m[3]??1];return [m[0],m[1],m[2],m[3]??1];};
 const opacity=e=>{let o=1;for(let n=e;n;n=n.parentElement)o*=Number(getComputedStyle(n).opacity);return o;};
 const out=[];
 for(const sel of roots)for(const root of document.querySelectorAll(sel))for(const e of root.querySelectorAll('*')){
  if(e.closest('i,svg,.sinless-sr-only')||e.disabled)continue;
  const field=e.matches('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select,textarea');
  const placeholder=field&&e.matches(':placeholder-shown');
  const text=field?(placeholder?e.placeholder:e.value??''):[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
  if(!text)continue;
  // A label that wraps its field is measured over its own text only, not the field's background.
  const own=field?null:[...e.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
  const r=own?(()=>{const range=document.createRange();range.selectNodeContents(own);return range.getBoundingClientRect();})():e.getBoundingClientRect();
  if(!r.width||!r.height||r.bottom<0||r.right<0||r.top>innerHeight||r.left>innerWidth)continue;
  const cs=getComputedStyle(e);if(cs.visibility==='hidden')continue;
  // Skip text scrolled out of its container or covered by another element.
  const hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
  if(!hit||!(hit===e||e.contains(hit)||hit.contains(e)&&hit.closest(sel)))continue;
  const fg=parse(placeholder?getComputedStyle(e,'::placeholder').color:cs.color);fg[3]*=opacity(e);
  out.push({root:sel,sel:`${e.tagName.toLowerCase()}${[...e.classList].map(c=>'.'+c).join('')}`,text:text.slice(0,24),fg,size:parseFloat(cs.fontSize),weight:Number(cs.fontWeight),
   box:{x:Math.max(0,Math.round(r.left)),y:Math.max(0,Math.round(r.top)),w:Math.round(Math.min(r.right,innerWidth)-Math.max(0,r.left)),h:Math.round(Math.min(r.bottom,innerHeight)-Math.max(0,r.top))}});
 }
 return out;
},roots);

/** Contrast of each collected element against the median background pixel of its box. */
async function measure(roots,label){
 const items=await collect(roots);
 await page.addStyleTag({content:'*,*::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}',}).then(h=>h.evaluate(e=>e.dataset.verifyContrast='1'));
 await settle();
 const shot=(await page.screenshot({type:'png'})).toString('base64');
 await page.evaluate(()=>document.querySelectorAll('[data-verify-contrast]').forEach(e=>e.remove()));
 await settle();
 return page.evaluate(async({shot,items,label})=>{
  const img=new Image();img.src='data:image/png;base64,'+shot;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);
  const scale=img.width/innerWidth;
  const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
  return items.map(it=>{
   const {x:bx,y:by,w,h}=it.box;
   const d=x.getImageData(Math.round(bx*scale),Math.round(by*scale),Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale))).data;
   const px=[];for(let i=0;i<d.length;i+=4)px.push([d[i],d[i+1],d[i+2]]);
   px.sort((a,b)=>lum(a)-lum(b));const bg=px[Math.floor(px.length/2)];
   const [r,g,b,a]=it.fg;const fg=[r*a+bg[0]*(1-a),g*a+bg[1]*(1-a),b*a+bg[2]*(1-a)];
   const [L1,L2]=[lum(fg),lum(bg)].sort((p,q)=>q-p);
   const ratio=Math.round((L1+0.05)/(L2+0.05)*100)/100;
   const large=it.size>=24||(it.weight>=700&&it.size>=18.66);
   return {theme:label,root:it.root,sel:it.sel,text:it.text,ratio,need:large?3:4.5,fg:fg.map(Math.round),bg};
  });
 },{shot,items,label});
}

try{
 fixture=await page.evaluate(async()=>{
  if(game.world.id!=='sinless-test')throw new Error('Use sinless-test');
  const ui=foundry.utils.deepClone(game.settings.get('core','uiConfig'));
  const {renderCard}=await import('/systems/sinless/module/dice/test-roll.mjs');
  // A failed test with every kind of die: success, one, rerolled, plain and Kismet.
  const state={label:'VERIFY Contrast',pool:null,target:4,untrained:false,plan:{usesPool:false,total:5,poolDice:0,bonusDice:0,kismetDice:0},reroll:1,threshold:5,notes:['VERIFY note'],extra:{},
   initial:[5,1,3,6,2],final:[5,4,3,6,2],rerolledIndices:[1],rerollCancelled:false,abf:false,kismetAdded:[2],autoSuccesses:0,mcpUsed:0,vcrUsed:0};
  const message=await ChatMessage.create({content:await renderCard(state),speaker:{alias:'VERIFY Contrast'}});
  const ch=await Actor.create({name:'VERIFY Contrast Runner',type:'character',system:{creation:{active:false},skills:{firearms:{rank:3}}}});
  await ch.update({'system.condition.physical.value':2});
  await ch.createEmbeddedDocuments('Item',[{name:'VERIFY Pistol',type:'weapon'},{name:'VERIFY Jacket',type:'armor'}]);
  const brand=await Actor.create({name:'VERIFY Contrast Brand',type:'brand'});
  await brand.createEmbeddedDocuments('Item',[{name:'VERIFY Safehouse',type:'resource',system:{class:'D',damage:1}}]);
  const npc=await Actor.create({name:'VERIFY Contrast NPC',type:'npc'});
  const vehicle=await Actor.create({name:'VERIFY Contrast Van',type:'vehicle'});
  return {message:message.id,actors:[ch.id,npc.id,vehicle.id,brand.id],ui};
 });
 const failures=[];let measured=0;
 for(const theme of ['dark','light']){
  await page.evaluate(async theme=>{const ui=foundry.utils.deepClone(game.settings.get('core','uiConfig'));ui.colorScheme.applications=theme;ui.colorScheme.interface=theme;await game.settings.set('core','uiConfig',ui);},theme);
  await settle();
  for(const id of fixture.actors){
   const tabList=await page.evaluate(id=>game.actors.get(id).sheet.constructor.TABS.primary.tabs.map(t=>t.id),id);
   for(const tab of tabList){
    const ok=await page.evaluate(async({id,tab})=>{const s=game.actors.get(id).sheet;await s.render({force:true});s.setPosition({left:20,top:20,width:900,height:1050});
     if(!s.element.querySelector(`.tab[data-tab="${tab}"]`))return false;s.changeTab(tab,'primary');return true;},{id,tab});
    if(!ok)continue;
    await settle();
    const m=await measure([`#${await page.evaluate(id=>game.actors.get(id).sheet.id,id)} .window-content`],`${theme}`);
    measured+=m.length;failures.push(...m.filter(r=>r.ratio<r.need).map(r=>({...r,tab})));
    await page.evaluate(async id=>game.actors.get(id).sheet.close(),id);
   }
  }
  // Help, operation and chase windows, and a combat test dialog. Opening them changes no settings.
  for(const [name,selector] of [['help','#sinless-help'],['operation','#sinless-operation'],['chase','#sinless-chase'],['test','dialog.sinless-test-dialog[open]']]){
   await page.evaluate(async({name,id})=>{
    const base='/systems/sinless/module/apps/';
    if(name==='help')(await import(`${base}help.mjs`)).HelpApp.open();
    else if(name==='operation')(await import(`${base}operation.mjs`)).OperationApp.open();
    else if(name==='chase')(await import(`${base}chase.mjs`)).ChaseApp.open();
    else{const defaults=game.actors.get(id)._testDefaults({label:'VERIFY Contrast Test',pool:'brawn',rank:3});defaults.combat={accuracy:0,recoil:{tokens:0,capacity:5}};defaults.showFiring=true;
     window.contrastDialog=(await import(`${base}test-dialog.mjs`)).testDialog(defaults);}
   },{name,id:fixture.actors[0]});
   await page.locator(selector).first().waitFor({state:'visible'});
   await page.evaluate(selector=>{const app=[...foundry.applications.instances.values()].find(a=>a.element?.matches(selector));app?.setPosition?.({left:20,top:20});},selector);
   await settle();
   const m=await measure([`${selector} .window-content`],theme);
   assert.ok(m.length>0,`${name}: text measured`);
   measured+=m.length;failures.push(...m.filter(r=>r.ratio<r.need).map(r=>({...r,tab:name})));
   if(name==='test'){await page.keyboard.press('Escape');await page.evaluate(()=>window.contrastDialog);}
   else await page.evaluate(async selector=>{for(const app of [...foundry.applications.instances.values()])if(app.element?.matches(selector))await app.close();},selector);
   await settle();
  }
  await page.evaluate(()=>{ui.sidebar.changeTab?.('chat','primary');ui.sidebar.expand?.();});
  await page.locator(`#chat [data-message-id="${fixture.message}"]`).first().scrollIntoViewIfNeeded();
  await settle();
  const m=await measure([`#chat [data-message-id="${fixture.message}"] .sinless-card`],theme);
  assert.ok(m.some(r=>r.sel.startsWith('li.die')),'dice measured');
  measured+=m.length;failures.push(...m.filter(r=>r.ratio<r.need));
 }
 const grouped={};for(const f of failures){const k=`${f.theme} ${f.root.includes('chat')?'card':'sheet'} ${f.sel}`;(grouped[k]??={...f,count:0}).count++;}
 results.failures=Object.values(grouped).sort((a,b)=>a.ratio-b.ratio);
 for(const f of results.failures)console.log('LOW',f.theme,f.sel,JSON.stringify(f.text),f.ratio,'<',f.need,'fg',f.fg.join(','),'bg',f.bg.join(','),'x',f.count);
 assert.deepEqual(results.failures.map(f=>`${f.theme} ${f.sel} ${f.ratio}`),[],'text contrast');
 pass('text contrast meets WCAG AA in both themes',{measured});
 assert.deepEqual(logs.filter(l=>l.startsWith('pageerror')),[]);pass('no page errors',{errors:0});
}finally{
 if(fixture)await page.evaluate(async f=>{
  await game.settings.set('core','uiConfig',f.ui);
  for(const app of [...foundry.applications.instances.values()])if(f.actors.includes(app.document?.id))await app.close();
  await Actor.deleteDocuments(f.actors.filter(id=>game.actors.get(id)));
  const created=[f.message].filter(id=>game.messages.has(id));
  if(created.length)await ChatMessage.deleteDocuments(created);
 },fixture).catch(e=>console.error('cleanup',e.message));
 if(fixture){
  const left=await page.evaluate(f=>({actors:f.actors.filter(id=>game.actors.has(id)).length,messages:Number(game.messages.has(f.message)),ui:JSON.stringify(game.settings.get('core','uiConfig'))===JSON.stringify(f.ui)}),fixture);
  assert.deepEqual(left,{actors:0,messages:0,ui:true});
  pass('temporary data removed and theme restored',left);
 }
 const dir=process.env.SINLESS_VERIFY_OUT??'/private/tmp/sinless-verification';mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/contrast.json`,JSON.stringify(results,null,2));await browser.close();
}
