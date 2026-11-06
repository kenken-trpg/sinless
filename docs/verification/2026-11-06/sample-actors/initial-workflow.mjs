import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {joinGM} from '../original/lib.mjs';
const root=fileURLToPath(new URL('../../../../',import.meta.url)).replace(/\/$/,''),out=process.env.SINLESS_REVIEW_OUT??'/private/tmp/sinless-sample-review';mkdirSync(out,{recursive:true});
const results=[];const pass=(name,data)=>{results.push({name,data});console.log('PASS',name,JSON.stringify(data??{}));};
console.log('Joining test world');const {browser,page,logs}=await joinGM();page.setDefaultTimeout(20000);
try{
 const info=await page.evaluate(()=>{window.sampleReview={actors:[],scenes:[],combats:[],messages:[],before:game.messages.map(m=>m.id),scene:canvas.scene?.id};return {foundry:game.version,cachedSystem:game.system.version,world:game.world.id,currentAPI:typeof game.actors.contents[0]?.resistSustainedSpell};});pass('environment',info);
 for(const file of readdirSync(root+'/samples/actors').filter(f=>f.endsWith('.json'))){
  const json=readFileSync(root+'/samples/actors/'+file,'utf8');
  const result=await page.evaluate(async({json,file})=>{const source=JSON.parse(json);const a=await Actor.create({name:'SAMPLE REVIEW '+file,type:source.type});window.sampleReview.actors.push(a.id);await a.importFromJSON(json);await a.sheet.render(true);return {file,id:a.id,type:a.type,items:a.items.size,invalid:a.invalid,validation:a.validationFailures,system:a.system.toObject(),derived:{pools:a.system.pools,zoetic:a.system.zoetic,finance:a.system.finance}};},{json,file});
  assert.equal(result.invalid,false);assert.equal(result.items,JSON.parse(json).items.length);pass('import '+file,result);
  await page.waitForTimeout(300);await page.screenshot({path:out+'/'+file+'.png',fullPage:true});await page.evaluate(async id=>game.actors.get(id).sheet.close(),result.id);
 }
 const setup=await page.evaluate(async()=>{const f=window.sampleReview;const [pc,mage,decker,npc,vehicle,brand]=f.actors.map(id=>game.actors.get(id));await vehicle.setVehicleController(pc);for(const a of [pc,mage,decker])await brand.addBrandMember(a);
  const scene=await Scene.create({name:'SAMPLE REVIEW '+Date.now(),width:1600,height:1000,grid:{size:100,type:1,distance:2,units:'m'},tokenVision:false});f.scenes.push(scene.id);
  const tokens=[];for(const [i,a] of [pc,mage,decker,npc,vehicle].entries()){const t=await a.getTokenDocument({x:100+i*200,y:200});tokens.push(t.toObject());}await scene.createEmbeddedDocuments('Token',tokens);await scene.view();return {scene:scene.id,controller:vehicle.system.controller,members:brand.system.members,zoetic:mage.system.zoetic.value,mcp:decker.system.grid.mcp.max};});
 await page.waitForFunction(id=>canvas.scene?.id===id,setup.scene);assert.equal(setup.members.length,3);assert.ok(setup.zoetic>=3);assert.equal(setup.mcp,6);pass('actor links and derived data',setup);
 await page.evaluate(async()=>{const f=window.sampleReview;const scene=game.scenes.get(f.scenes[0]);const combat=await Combat.create({scene:scene.id});f.combats.push(combat.id);await combat.createEmbeddedDocuments('Combatant',scene.tokens.contents.slice(0,4).map((t,i)=>({tokenId:t.id,actorId:t.actorId,sceneId:scene.id,initiative:20-i})));await combat.startCombat();canvas.tokens.get(scene.tokens.contents[3].id).setTarget(true,{releaseOthers:true});});pass('combat started');
 async function roll(name,index,method,itemType,itemIndex=0){
  const before=await page.evaluate(()=>game.messages.size);
  await page.evaluate(({index,method,itemType,itemIndex})=>{const a=game.actors.get(window.sampleReview.actors[index]);const arg=itemType?a.items.filter(i=>i.type===itemType)[itemIndex]:method==='rollDefense'?'soak':method==='rollBrandAction'?'mediaCampaign':undefined;window.samplePending=a[method](arg);window.samplePending.catch(e=>console.error('SAMPLE ERROR '+e.stack));},{index,method,itemType,itemIndex});
  await page.waitForSelector('.sinless-test-dialog button[data-action=roll]');await page.click('.sinless-test-dialog button[data-action=roll]');
  await page.waitForFunction(n=>game.messages.size>n,before);await page.evaluate(()=>window.samplePending);pass(name,await page.evaluate(()=>{const m=game.messages.contents.at(-1);return {id:m.id,flags:m.flags.sinless};}));
 }
 await roll('combat weapon card',0,'rollWeapon','weapon');
 await roll('NPC fixed soak',3,'rollDefense');
 await page.evaluate(async()=>{const a=game.actors.get(window.sampleReview.actors[3]);await a.applyDamage({final:2,track:'physical'});if(a.system.condition.physical.value!==2)throw Error('damage not applied');});pass('NPC physical damage applied');
 await roll('attack spell and drain card',1,'castSpell','power');
 await roll('continuous spell card',1,'castSpell','power',1);
 await roll('summoning roll',1,'summonSpirit','power',2);
 await roll('ritual roll',1,'rollRitual','ritual');
 for(let i=0;i<3;i++)await roll('digital attack '+i,2,'rollSoftware','software',i);
 await roll('vehicle maneuver',4,'rollVehicleTest');await roll('mounted weapon',4,'rollVehicleWeapon','weapon');
 await roll('brand sector action',5,'rollBrandAction');
 const recovery=await page.evaluate(async()=>{const f=window.sampleReview;const pc=game.actors.get(f.actors[0]);await pc.update({'system.pools.finesse.spent':2});const c=game.combats.get(f.combats[0]);await c.nextRound();return {round:c.round,spent:pc.system.pools.finesse.spent};});assert.equal(recovery.spent,0);pass('round pool recovery',recovery);
}catch(e){pass('FAIL',{message:e.message,stack:e.stack});await page.screenshot({path:out+'/failure.png',fullPage:true});process.exitCode=1;}
finally{
 try{const cleanup=await page.evaluate(async()=>{const f=window.sampleReview;if(!f)return null;for(const id of f.combats)await game.combats.get(id)?.delete();if(f.scene&&game.scenes.has(f.scene))await game.scenes.get(f.scene).view();for(const id of f.scenes)await game.scenes.get(id)?.delete();for(const id of f.actors){const a=game.actors.get(id);await a?.sheet.close();await a?.delete();}const created=game.messages.filter(m=>!f.before.includes(m.id)&&m.author.id===game.user.id);for(const m of created)await m.delete();return {actorsRemaining:f.actors.filter(id=>game.actors.has(id)),scenesRemaining:f.scenes.filter(id=>game.scenes.has(id)),combatsRemaining:f.combats.filter(id=>game.combats.has(id))};});pass('cleanup',cleanup);}catch(e){pass('cleanup failed',e.message);process.exitCode=1;}
 writeFileSync(out+'/results.json',JSON.stringify({results,logs},null,2));await browser.close();
}
