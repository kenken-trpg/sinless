// Non-text contrast (WCAG 2.2 1.4.11, AA) in the dark and light application themes: the visual boundary of
// fields, checkboxes, condition monitor boxes, resource boxes and dice, and the icons of icon-only controls,
// reach 3:1 against what surrounds them.
// Boundaries are read from a plain screenshot (borders can be currentColor). A boundary passes when its fill or any side of its edge reaches 3:1 against the pixels just outside it
// (an underline alone identifies a field). A checkbox is measured over its ::before glyph box. Icons are measured like text: computed color with ancestor opacity,
// against the median pixel of the icon's box with icons made transparent. Disabled controls are exempt.
// Measured on the sample actors (every sheet tab, with filled boxes and damaged and influenced resources),
// the help, operation and chase windows, a test dialog and a chat card.
// SINLESS_NONTEXT_SHOTS=1 saves a screenshot of every window with a failure.
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

const BOUNDARY='input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea,input[type=checkbox],.box,.rbox,li.die';
const CONTROL='button,a,[data-action],[role=button]';

/** Components and icons inside the root that are visible and not covered. */
const collect=selector=>page.evaluate(({selector,BOUNDARY,CONTROL})=>{
 const parse=c=>{const m=c.match(/[\d.]+/g)?.map(Number)??[0,0,0];if(c.startsWith('color('))return [m[0]*255,m[1]*255,m[2]*255,m[3]??1];return [m[0],m[1],m[2],m[3]??1];};
 const opacity=e=>{let o=1;for(let n=e;n;n=n.parentElement)o*=Number(getComputedStyle(n).opacity);return o;};
 const name=e=>`${e.tagName.toLowerCase()}${e.type&&e.tagName==='INPUT'?`[type=${e.type}]`:''}${[...e.classList].slice(0,3).map(c=>'.'+c).join('')}`;
 const root=document.querySelector(selector);const out=[];
 const shown=(e,r)=>{
  if(!r.width||!r.height||r.top<0||r.left<0||r.bottom>innerHeight||r.right>innerWidth)return false;
  if(getComputedStyle(e).visibility==='hidden'||e.closest('.tab:not(.active),.sinless-sr-only'))return false;
  const hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
  return !!hit&&(hit===e||e.contains(hit)||hit.contains(e));
 };
 const box=r=>({x:r.left,y:r.top,w:r.width,h:r.height});
 for(const e of root.querySelectorAll(BOUNDARY)){
  if(e.disabled||e.closest('fieldset:disabled'))continue;
  let r=e.getBoundingClientRect();if(!shown(e,r))continue;
  // Foundry draws a checkbox as a glyph in ::before, which can be wider than the input (16px over 14px) or sit at
  // the start of a block input as wide as its form group. Search the glyph's area; the pixels locate it.
  let search=false;
  if(e.matches('[type=checkbox]')){const b=getComputedStyle(e,'::before');const w=parseFloat(b.width)||r.width,h=parseFloat(b.height)||r.height;
   r=DOMRect.fromRect({x:r.left-4,y:r.top+Math.min(0,(r.height-h)/2)-4,width:Math.max(w,Math.min(r.width,w))+8,height:Math.max(h,r.height)+8});search=true;}
  const what=e.matches('[type=checkbox]')?'checkbox':e.matches('.box')?'box':e.matches('.rbox')?'rbox':e.matches('.die')?'die':e.tagName.toLowerCase();
  out.push({kind:'boundary',what,search,sel:name(e),box:box(r)});
 }
 for(const i of root.querySelectorAll('i[class*="fa-"]')){
  const c=i.closest(CONTROL);if(!c||!root.contains(c)||c.disabled)continue;
  // Only controls named by the icon alone: visible text identifies the others.
  const text=[...c.querySelectorAll('*'),c].filter(n=>!n.closest('.sinless-sr-only')).flatMap(n=>[...n.childNodes].filter(t=>t.nodeType===3)).map(t=>t.textContent).join('').trim();
  if(text)continue;
  const r=i.getBoundingClientRect();if(!shown(i,r))continue;
  const fg=parse(getComputedStyle(i).color);fg[3]*=opacity(i);
  out.push({kind:'icon',what:'icon',sel:`${name(c)} ${name(i)}`,fg,box:box(r)});
 }
 return out;
},{selector,BOUNDARY,CONTROL});

/** Contrast of each component: boundaries from the plain screenshot, icons against a screenshot without text. */
async function measure(selector,theme,where){
 const items=await collect(selector);
 const plain=(await page.screenshot({type:'png'})).toString('base64');
 await page.addStyleTag({content:'*,*::before,*::after,*::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}'}).then(h=>h.evaluate(e=>e.dataset.verifyNontext='1'));
 await settle();
 const bare=(await page.screenshot({type:'png'})).toString('base64');
 await page.evaluate(()=>document.querySelectorAll('[data-verify-nontext]').forEach(e=>e.remove()));
 await settle();
 return page.evaluate(async({plain,bare,items,theme,where})=>{
  const load=async s=>{const img=new Image();img.src='data:image/png;base64,'+s;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);return {x,w:img.width,h:img.height};};
  const [A,B]=await Promise.all([load(plain),load(bare)]);
  const scale=A.w/innerWidth;
  const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
  const ratio=(p,q)=>{const [a,b]=[lum(p),lum(q)].sort((m,n)=>n-m);return (a+0.05)/(b+0.05);};
  const median=px=>{px=px.filter(Boolean).sort((a,b)=>lum(a)-lum(b));return px[Math.floor(px.length/2)];};
  const at=(S,x,y)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=S.w||y>=S.h)return null;const d=S.x.getImageData(x,y,1,1).data;return [d[0],d[1],d[2]];};
  // Pixels along the middle half of one side, `d` device pixels inside (negative: outside) the edge.
  const side=(S,b,s,d)=>{const px=[];const [L,T,R,Bm]=[b.x*scale,b.y*scale,(b.x+b.w)*scale-1,(b.y+b.h)*scale-1];
   const span=s<2?[L+(R-L)/4,L+3*(R-L)/4]:[T+(Bm-T)/4,T+3*(Bm-T)/4];
   for(let t=span[0];t<=span[1];t++)px.push(s===0?at(S,t,T+d):s===1?at(S,t,Bm-d):s===2?at(S,L+d,t):at(S,R-d,t));return px;};
  return items.map(it=>{
   const b=it.box;
   if(it.kind==='icon'){
    const px=[];for(let y=b.y*scale;y<(b.y+b.h)*scale;y++)for(let x=b.x*scale;x<(b.x+b.w)*scale;x++)px.push(at(B,x,y));
    const bg=median(px);const [r,g,bl,a]=it.fg;const fg=[r*a+bg[0]*(1-a),g*a+bg[1]*(1-a),bl*a+bg[2]*(1-a)];
    return {theme,where,kind:it.kind,what:it.what,sel:it.sel,ratio:Math.round(ratio(fg,bg)*100)/100,fg:fg.map(Math.round),bg};
   }
   const S=A;
   if(it.search){
    // The glyph: the bounding box of pixels unlike the median of the search area's border.
    const L=Math.round(b.x*scale),T=Math.round(b.y*scale),R=Math.round((b.x+b.w)*scale)-1,Bm=Math.round((b.y+b.h)*scale)-1;
    const ring=[];for(let x=L;x<=R;x++)ring.push(at(S,x,T),at(S,x,Bm));for(let y=T;y<=Bm;y++)ring.push(at(S,L,y),at(S,R,y));
    const base=median(ring);let x0=Infinity,y0=Infinity,x1=-1,y1=-1;
    for(let y=T+1;y<Bm;y++)for(let x=L+1;x<R;x++){const p=at(S,x,y);if(p&&ratio(p,base)>1.15){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}}
    if(x1<0)return {theme,where,kind:it.kind,what:it.what,sel:it.sel,ratio:1,edge:base,fill:base,outside:base};
    Object.assign(b,{x:x0/scale,y:y0/scale,w:(x1-x0+1)/scale,h:(y1-y0+1)/scale});
   }
   const outside=median([0,1,2,3].flatMap(s=>side(S,b,s,-Math.max(1,Math.round(scale)))));
   // The edge: the best of the first few pixel rows inside each side, so 1px borders between pixels are found.
   const depth=Math.max(2,Math.round(2*scale));
   let edge=0,edgePx=null;
   for(let s=0;s<4;s++)for(let d=0;d<depth;d++){const p=median(side(S,b,s,d));const q=ratio(p,outside);if(q>edge){edge=q;edgePx=p;}}
   const inner=[];for(let y=(b.y+b.h/4)*scale;y<(b.y+3*b.h/4)*scale;y+=2)for(let x=(b.x+b.w/4)*scale;x<(b.x+3*b.w/4)*scale;x+=2)inner.push(at(S,x,y));
   const fill=median(inner);const filled=ratio(fill,outside);
   return {theme,where,kind:it.kind,what:it.what,sel:it.sel,ratio:Math.round(Math.max(edge,filled)*100)/100,edge:edgePx,fill,outside};
  });
 },{plain,bare,items,theme,where});
}

try{
 fixture=await page.evaluate(async samples=>{
  if(game.world.id!=='sinless-test')throw new Error('Use sinless-test');
  const ui=foundry.utils.deepClone(game.settings.get('core','uiConfig'));
  const settings=Object.fromEntries(['operation','chase'].map(k=>[k,foundry.utils.deepClone(game.settings.get('sinless',k))]));
  const actors=[];
  for(const s of samples)actors.push(await Actor.create({...s,name:`VERIFY Nontext ${s.name}`}));
  const ch=actors.find(a=>a.type==='character');
  await ch.update({'system.condition.physical.value':2});
  const brand=actors.find(a=>a.type==='brand');
  if(brand)await brand.createEmbeddedDocuments('Item',[{name:'VERIFY Nontext Damaged',type:'resource',system:{class:'D',damage:1}},{name:'VERIFY Nontext Influenced',type:'resource',system:{class:'D',influence:1}}]);
  const vehicle=actors.find(a=>a.type==='vehicle');
  const {renderCard}=await import('/systems/sinless/module/dice/test-roll.mjs');
  const state={label:'VERIFY Nontext',pool:null,target:4,untrained:false,plan:{usesPool:false,total:5,poolDice:0,bonusDice:0,kismetDice:0},reroll:1,threshold:5,notes:[],extra:{},
   initial:[5,1,3,6,2],final:[5,4,3,6,2],rerolledIndices:[1],rerollCancelled:false,abf:false,kismetAdded:[2],autoSuccesses:0,mcpUsed:0,vcrUsed:0};
  const message=await ChatMessage.create({content:await renderCard(state),speaker:{alias:'VERIFY Nontext'}});
  return {ui,settings,message:message.id,actors:actors.map(a=>a.id),ch:ch.id,vehicle:vehicle?.uuid};
 },samples);
 await page.evaluate(async f=>{
  await game.settings.set('sinless','operation',{responses:[{label:'VERIFY Nontext Response',threshold:10}],lastAlert:0,lastHeat:0,htr:null});
  if(f.vehicle)await game.settings.set('sinless','chase',{active:true,vehicleUuid:f.vehicle,enemies:[{uuid:f.vehicle,name:'VERIFY Nontext Pursuer',range:'close',flying:false}],
   paths:[[{text:'VERIFY Nontext card',leg:false,revealed:true},{text:'VERIFY Nontext leg',leg:true,revealed:false}]],discard:[],legs:3,legsDone:1,primary:0,turn:1,ended:null});
 },fixture);
 const failures=[];const counts={boundary:0,icon:0};const kinds=new Set();
 const check=async(selector,theme,where)=>{
  const m=await measure(selector,theme,where);
  for(const r of m){counts[r.kind]++;kinds.add(r.what);}
  const low=m.filter(r=>r.ratio<3);failures.push(...low);
  if(low.length&&process.env.SINLESS_NONTEXT_SHOTS)await page.screenshot({path:`${outDir}/nontext-${theme}-${where.replace(/[^\w-]+/g,'_')}.png`});
 };
 for(const theme of ['dark','light']){
  await page.evaluate(async theme=>{const ui=foundry.utils.deepClone(game.settings.get('core','uiConfig'));ui.colorScheme.applications=theme;ui.colorScheme.interface=theme;await game.settings.set('core','uiConfig',ui);},theme);
  await settle();
  for(const id of fixture.actors){
   const {type,tabs,sel}=await page.evaluate(async id=>{const s=game.actors.get(id).sheet;await s.render({force:true});s.setPosition({left:20,top:20,width:900,height:1050});return {type:s.document.type,tabs:s.constructor.TABS.primary.tabs.map(t=>t.id),sel:`#${s.id} .window-content`};},id);
   await page.locator(sel).waitFor({state:'visible'});
   for(const tab of tabs){
    if(!await page.evaluate(({id,tab})=>{const s=game.actors.get(id).sheet;if(!s.element.querySelector(`.tab[data-tab="${tab}"]`))return false;s.changeTab(tab,'primary');return true;},{id,tab}))continue;
    await settle();
    await check(sel,theme,`${type} ${tab}`);
   }
   await page.evaluate(async id=>game.actors.get(id).sheet.close(),id);
  }
  for(const [name,selector] of [['help','#sinless-help'],['operation','#sinless-operation'],['chase','#sinless-chase'],['test dialog','dialog.sinless-test-dialog[open]']]){
   await page.evaluate(async({name,id})=>{
    const base='/systems/sinless/module/apps/';
    if(name==='help')(await import(`${base}help.mjs`)).HelpApp.open();
    else if(name==='operation')(await import(`${base}operation.mjs`)).OperationApp.open();
    else if(name==='chase')(await import(`${base}chase.mjs`)).ChaseApp.open();
    else{const defaults=game.actors.get(id)._testDefaults({label:'VERIFY Nontext Test',pool:'brawn',rank:3});defaults.combat={accuracy:0,recoil:{tokens:0,capacity:5}};defaults.showFiring=true;
     window.nontextDialog=(await import(`${base}test-dialog.mjs`)).testDialog(defaults);}
   },{name,id:fixture.ch});
   await page.locator(selector).first().waitFor({state:'visible'});
   await page.evaluate(selector=>{const app=[...foundry.applications.instances.values()].find(a=>a.element?.matches(selector));app?.setPosition?.({left:20,top:20});},selector);
   // Light two heat stars in the page: changing the heat setting would post chat messages.
   if(name==='operation')await page.evaluate(()=>document.querySelectorAll('#sinless-operation .star').forEach((a,i)=>{if(i<2){a.classList.add('on');a.querySelector('i').className='fa-solid fa-star';}}));
   await settle();
   await check(name==='test dialog'?selector:`${selector} .window-content`,theme,name);
   if(name==='test dialog'){await page.keyboard.press('Escape');await page.evaluate(()=>window.nontextDialog);}
   else await page.evaluate(async selector=>{for(const app of [...foundry.applications.instances.values()])if(app.element?.matches(selector))await app.close();},selector);
   await settle();
  }
  await page.evaluate(()=>{ui.sidebar.changeTab?.('chat','primary');ui.sidebar.expand?.();});
  await page.locator(`#chat [data-message-id="${fixture.message}"]`).first().scrollIntoViewIfNeeded();
  await settle();
  await check(`#chat [data-message-id="${fixture.message}"] .sinless-card`,theme,'chat card');
 }
 for(const k of ['input','select','checkbox','box','rbox','die','icon'])assert.ok(kinds.has(k),`${k} measured`);
 const grouped={};for(const f of failures){const k=`${f.theme} ${f.kind} ${f.sel}`;(grouped[k]??={...f,where:new Set(),count:0,min:f.ratio}).count++;grouped[k].where.add(f.where);grouped[k].min=Math.min(grouped[k].min,f.ratio);}
 results.failures=Object.values(grouped).map(f=>({...f,where:[...f.where]})).sort((a,b)=>a.min-b.min);
 for(const f of results.failures)console.log('LOW',f.theme,f.kind,f.sel,f.min,'< 3',f.kind==='icon'?`fg ${f.fg} bg ${f.bg}`:`edge ${f.edge} fill ${f.fill} outside ${f.outside}`,'x',f.count,'in',f.where.slice(0,4).join(', '));
 assert.deepEqual(results.failures.map(f=>`${f.theme} ${f.kind} ${f.sel} ${f.min}`),[],'non-text contrast');
 pass('fields, boxes, dice and icons reach 3:1 in both themes',counts);
 assert.deepEqual(logs.filter(l=>l.startsWith('pageerror')),[]);pass('no page errors',{errors:0});
}finally{
 if(fixture)await page.evaluate(async f=>{
  await game.settings.set('core','uiConfig',f.ui);
  for(const app of [...foundry.applications.instances.values()])if(['sinless-help','sinless-operation','sinless-chase'].includes(app.id)||f.actors.includes(app.document?.id))await app.close();
  for(const key of ['operation','chase'])await game.settings.set('sinless',key,f.settings[key]);
  await Actor.deleteDocuments(f.actors.filter(id=>game.actors.get(id)));
  if(game.messages.has(f.message))await ChatMessage.deleteDocuments([f.message]);
 },fixture).catch(e=>console.error('cleanup',e.message));
 if(fixture){
  const left=await page.evaluate(f=>({actors:f.actors.filter(id=>game.actors.has(id)).length,messages:Number(game.messages.has(f.message)),ui:JSON.stringify(game.settings.get('core','uiConfig'))===JSON.stringify(f.ui),
   settings:['operation','chase'].every(k=>JSON.stringify(game.settings.get('sinless',k))===JSON.stringify(f.settings[k]))}),fixture);
  assert.deepEqual(left,{actors:0,messages:0,ui:true,settings:true});
  pass('temporary data removed, theme and settings restored',left);
 }
 writeFileSync(`${outDir}/non-text-contrast.json`,JSON.stringify(results,null,2));await browser.close();
}
