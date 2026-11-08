// States that the sheets and cards show by color are also exposed as text, and remain visible in high contrast mode.
// Reads Chromium's accessibility tree for the dice of a test card and a brand resource track, then emulates
// forced colors and checks the computed styles of filled condition boxes, successful dice, resource marks and active toggles.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {joinGM} from '../lib.mjs';
const {browser,page,logs}=await joinGM({noCanvas:true});
page.setDefaultTimeout(20000);
if(process.env.SINLESS_VERIFY_LANGUAGE)assert.equal(await page.evaluate(()=>game.i18n.lang),process.env.SINLESS_VERIFY_LANGUAGE);
console.log('Accessibility language:',await page.evaluate(()=>game.i18n.lang));
const results={};let fixture;
const pass=(name,data)=>{results[name]=data;console.log('PASS',name,JSON.stringify(data));};

/** The text Chromium exposes under each element matching selector, with the element's role and name. */
async function exposed(selector){
 const session=await page.context().newCDPSession(page);
 try{
  const {root}=await session.send('DOM.getDocument',{depth:0});
  const {nodeIds}=await session.send('DOM.querySelectorAll',{nodeId:root.nodeId,selector});
  const backend=[];
  for(const nodeId of nodeIds)backend.push((await session.send('DOM.describeNode',{nodeId})).node.backendNodeId);
  const {nodes}=await session.send('Accessibility.getFullAXTree');
  const byId=new Map(nodes.map(n=>[n.nodeId,n]));
  const text=n=>n.ignored?(n.childIds??[]).map(id=>text(byId.get(id))).join(''):n.role?.value==='StaticText'?n.name?.value??'':(n.childIds??[]).map(id=>text(byId.get(id))).join('');
  return backend.map(id=>{
   const n=nodes.find(x=>x.backendDOMNodeId===id);
   return n?{role:n.role?.value,name:n.name?.value??'',ignored:n.ignored,text:text(n).replace(/\s+/g,' ').trim(),children:(n.childIds??[]).filter(c=>!byId.get(c)?.ignored).length}:null;
  });
 }finally{await session.detach();}
}

try{
 fixture=await page.evaluate(async()=>{
  if(game.world.id!=='sinless-test')throw new Error('Use sinless-test');
  const messages=game.messages.map(m=>m.id);
  const {renderCard}=await import('/systems/sinless/module/dice/test-roll.mjs');
  // Target 4: 5 and 6 succeed, the 1 and the 3 are rerolled into 4 and 2, and a Kismet 6 is added.
  const state={label:'VERIFY Color',pool:null,target:4,untrained:false,plan:{usesPool:false,total:4,poolDice:0,bonusDice:0,kismetDice:0},reroll:1,threshold:2,notes:[],extra:{},
   initial:[5,1,3,6],final:[5,4,2,6],rerolledIndices:[1,2],rerollCancelled:false,abf:false,kismetAdded:[6],autoSuccesses:0,mcpUsed:0,vcrUsed:0};
  const message=await ChatMessage.create({content:await renderCard(state),speaker:{alias:'VERIFY Color'}});
  const brand=await Actor.create({name:'VERIFY Color Brand',type:'brand'});
  const [resource]=await brand.createEmbeddedDocuments('Item',[{name:'VERIFY Color Resource',type:'resource',system:{class:'C',damage:3,influence:2,demolished:1,controlled:true}}]);
  const ch=await Actor.create({name:'VERIFY Color Runner',type:'character',system:{creation:{active:false}}});
  await ch.update({'system.condition.physical.value':2});
  return {messages,message:message.id,actors:[brand.id,ch.id],brand:brand.id,ch:ch.id,resource:resource.id};
 });
 await page.evaluate(()=>ui.sidebar.changeTab?.('chat','primary'));
 const card=`#chat [data-message-id="${fixture.message}"] .sinless-card`;
 await page.locator(card).first().waitFor({state:'attached'});

 const strings=await page.evaluate(()=>({success:game.i18n.localize('SINLESS.Accessibility.dieSuccess'),rerolled:game.i18n.localize('SINLESS.Accessibility.dieRerolled')}));
 const dice=await exposed(`${card} li.die`);
 assert.equal(dice.length,9,'initial, rerolled and Kismet dice');
 assert.ok(dice.every(Boolean),'every die is in the accessibility tree');
 const text=dice.map(d=>d.text);
 const s=`(${strings.success})`,r=`(${strings.rerolled})`;
 assert.deepEqual(text,[`5${s}`,`1${r}`,`3${r}`,`6${s}`,`5${s}`,`4${s}`,'2',`6${s}`,`6${s}`]);
 const hidden=await page.locator(`${card} .sinless-sr-only`).first().evaluate(e=>{const b=e.getBoundingClientRect();return {w:b.width,h:b.height};});
 assert.ok(hidden.w<=1&&hidden.h<=1,'screen reader text is not drawn');
 pass('dice states exposed as text',{dice:text});

 await page.evaluate(async id=>{const sheet=game.actors.get(id).sheet;await sheet.render({force:true});sheet.changeTab('resources','primary');},fixture.brand);
 const row=`.sinless.sheet [data-item-id="${fixture.resource}"]`;
 await page.locator(`${row} .resource-track`).waitFor({state:'visible'});
 const expected=await page.evaluate(()=>game.i18n.format('SINLESS.Accessibility.resourceTrack',{total:9,damaged:3,influenced:2,demolished:1}));
 const [track]=await exposed(`${row} .resource-track`);
 assert.equal(track.role,'image');
 assert.equal(track.name,expected);
 assert.equal(track.children,0,'boxes are not read one by one');
 const marks=await page.locator(`${row} .rbox`).evaluateAll(boxes=>boxes.map(b=>({cls:b.className.replace('rbox','').trim(),image:getComputedStyle(b).backgroundImage!=='none'})));
 assert.ok(marks.filter(m=>/damaged|influenced/.test(m.cls)&&!/demolished/.test(m.cls)).every(m=>m.image),'damage and influence are drawn as marks, not only colors');
 pass('resource track named and marked',{name:track.name,marks:marks.map(m=>m.cls||'-')});

 const toggle=`${row} [data-action=itemToggle][data-field=controlled]`;
 assert.notEqual(await page.locator(toggle).evaluate(e=>getComputedStyle(e).boxShadow),'none','active toggle is underlined');
 pass('active toggle underlined',{});

 await page.evaluate(async id=>{const sheet=game.actors.get(id).sheet;await sheet.render({force:true});sheet.changeTab('main','primary');},fixture.ch);
 const charSheet=`.sinless.sheet:has([data-action=setCondition])`;
 await page.locator(`${charSheet} .track-physical .box.filled`).first().waitFor({state:'visible'});

 await page.emulateMedia({forcedColors:'active'});
 const forced=await page.evaluate(({card,row,charSheet})=>{
  const style=sel=>{const e=document.querySelector(sel);const c=getComputedStyle(e);return {bg:c.backgroundColor,fg:c.color,image:c.backgroundImage,border:c.borderTopColor,adjust:c.forcedColorAdjust,shadow:c.boxShadow};};
  const canvas=(()=>{const e=document.createElement('div');e.style.background='Canvas';document.body.append(e);const v=getComputedStyle(e).backgroundColor;e.remove();return v;})();
  return {matches:matchMedia('(forced-colors: active)').matches,canvas,filled:style(`${charSheet} .track-physical .box.filled`),empty:style(`${charSheet} .track-physical .box:not(.filled)`),
   die:style(`${card} li.die.success`),damaged:style(`${row} .rbox.damaged:not(.demolished)`),influenced:style(`${row} .rbox.influenced:not(.damaged)`),demolished:style(`${row} .rbox.demolished`),toggle:style(`${row} [data-action=itemToggle].active`)};
 },{card,row,charSheet});
 await page.emulateMedia({forcedColors:'none'});
 assert.equal(forced.matches,true);
 assert.notEqual(forced.filled.bg,forced.empty.bg,'filled box differs from an empty one');
 assert.notEqual(forced.filled.bg,forced.canvas,'filled box is not the page background');
 assert.notEqual(forced.die.bg,forced.canvas,'successful die is filled');
 assert.notEqual(forced.damaged.image,'none','damage cross kept');
 assert.notEqual(forced.influenced.image,'none','influence slash kept');
 assert.notEqual(forced.demolished.bg,forced.canvas,'demolished box is filled');
 assert.notEqual(forced.toggle.shadow,'none','active toggle underline kept');
 pass('high contrast mode keeps the states visible',forced);

 assert.deepEqual(logs.filter(l=>l.startsWith('pageerror')),[]);pass('no page errors',{errors:0});
}finally{
 if(fixture)await page.evaluate(async f=>{
  for(const app of [...foundry.applications.instances.values()])if(f.actors.includes(app.document?.id))await app.close();
  await Actor.deleteDocuments(f.actors.filter(id=>game.actors.get(id)));
  const created=game.messages.filter(m=>!f.messages.includes(m.id)).map(m=>m.id);
  if(created.length)await ChatMessage.deleteDocuments(created);
 },fixture).catch(e=>console.error('cleanup',e.message));
 if(fixture){
  const left=await page.evaluate(f=>({actors:game.actors.filter(a=>a.name.startsWith('VERIFY Color')).length,messages:game.messages.filter(m=>!f.messages.includes(m.id)).length}),fixture);
  assert.deepEqual(left,{actors:0,messages:0});
  pass('temporary data removed',left);
 }
 const dir=process.env.SINLESS_VERIFY_OUT??'/private/tmp/sinless-verification';mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/color-independence.json`,JSON.stringify(results,null,2));await browser.close();
}
