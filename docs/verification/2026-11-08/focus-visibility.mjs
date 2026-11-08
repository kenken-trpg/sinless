// Sample keyboard focus rings against their rendered surroundings in both application themes.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {joinGM} from '../lib.mjs';
const {browser,page,logs}=await joinGM({noCanvas:true});
const outDir=process.env.SINLESS_VERIFY_OUT??'/private/tmp/sinless-verification';
mkdirSync(outDir,{recursive:true});
const results=[];let fixture;
try{
 fixture=await page.evaluate(async()=>{
  if(game.world.id!=='sinless-test')throw new Error('Use sinless-test');
  const ui=foundry.utils.deepClone(game.settings.get('core','uiConfig'));
  const a=await Actor.create({name:'VERIFY Focus Runner',type:'character',system:{creation:{active:false}}});
  await a.sheet.render({force:true});a.sheet.setPosition({left:30,top:30});
  return {id:a.id,ui};
 });
 // Focus transitions are suppressed only in this browser context so each sample measures the settled color.
 await page.addStyleTag({content:'.sinless *{transition:none!important}'});
 const root=`#${await page.evaluate(id=>game.actors.get(id).sheet.id,fixture.id)}`;
 for(const theme of ['dark','light']){
  await page.evaluate(async theme=>{const ui=foundry.utils.deepClone(game.settings.get('core','uiConfig'));ui.colorScheme.applications=theme;await game.settings.set('core','uiConfig',ui);},theme);
  await page.waitForTimeout(600);
  await page.keyboard.press('Tab');
  for(const selector of ['input.actor-name','select[name="system.heritage"]','a.lifestyle-action','.window-content button.icon','input[name="system.skills.firearms.rank"]']){
   const el=page.locator(`${root} ${selector}`).first();
   await el.evaluate((e,id)=>{const tab=e.closest('.tab');if(tab)game.actors.get(id).sheet.changeTab(tab.dataset.tab,'primary');e.scrollIntoView({block:'center'});},fixture.id);
   await el.focus();
   const data=await el.evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {focused:e===document.activeElement,visible:e.matches(':focus-visible'),style:s.outlineStyle,width:parseFloat(s.outlineWidth),x:Math.round(r.left+r.width/2),y:Math.round(r.top)};});
   assert.ok(data.focused&&data.visible,`${theme} ${selector}: keyboard focus`);
   assert.equal(data.style,'solid');assert.ok(data.width>=2);
   const shot=(await page.screenshot()).toString('base64');
   const contrast=await page.evaluate(async({shot,x,y})=>{
    const img=new Image();img.src='data:image/png;base64,'+shot;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
    const scale=img.width/innerWidth;
    const pixel=dy=>[...ctx.getImageData(Math.round(x*scale),Math.round((y+dy)*scale),1,1).data].slice(0,3);
    const ring=pixel(-2),background=pixel(-5);
    const lum=rgb=>rgb.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
    const [a,b]=[lum(ring),lum(background)].sort((a,b)=>b-a);
    return {ratio:Math.round((a+0.05)/(b+0.05)*100)/100,ring,background};
   },{shot,...data});
   results.push({theme,selector,...contrast});
   console.log('FOCUS',theme,selector,JSON.stringify(contrast));
   assert.ok(contrast.ratio>=3,`${theme} ${selector}: ring contrast ${contrast.ratio} >= 3`);
  }
 }
 assert.deepEqual(logs.filter(l=>l.startsWith('pageerror')),[]);
 console.log('PASS focus rings',results.length);
}finally{
 if(fixture){await page.evaluate(async f=>{await game.actors.get(f.id)?.delete();await game.settings.set('core','uiConfig',f.ui);},fixture);
  assert.equal(await page.evaluate(f=>!game.actors.has(f.id)&&JSON.stringify(game.settings.get('core','uiConfig'))===JSON.stringify(f.ui),fixture),true);
 }
 writeFileSync(`${outDir}/focus-visibility.json`,JSON.stringify(results,null,2));await browser.close();
}
