import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import {joinGM} from '../original/lib.mjs';
const out='/private/tmp/sinless-magic-review';mkdirSync(out,{recursive:true});
const checks=[];const pass=(name,data)=>{checks.push({name,data});console.log('PASS',name,JSON.stringify(data??{}));};
console.log('Joining Foundry');
const {browser,page,logs}=await joinGM();
page.setDefaultTimeout(20000);
let f,player;
try {
 console.log('Creating isolated fixtures');
 f=await page.evaluate(async()=>{
  const prefix='MAGIC REVIEW '+Date.now();
  window.magicReview={actorIds:[],itemIds:[],userIds:[],sceneIds:[],messageIds:game.messages.map(m=>m.id),activeScene:game.scenes.active?.id};
  const remember=(kind,d)=>{window.magicReview[kind].push(d.id);return d;};
  const user=remember('userIds',await User.create({name:prefix+' Player',role:1}));
  const caster=remember('actorIds',await Actor.create({name:prefix+' Caster',type:'character',system:{creation:{active:false}}}));
  const target=remember('actorIds',await Actor.create({name:prefix+' Target',type:'npc',ownership:{default:2,[user.id]:3},system:{defenses:{resist:4,dodge:3},leyLine:{kind:'void',force:2}}}));
  const spirit=remember('actorIds',await Actor.create({name:prefix+' Spirit',type:'npc',system:{defenses:{dodge:2},spiritForce:0}}));
  const [power]=await caster.createEmbeddedDocuments('Item',[{name:'Hold',type:'power',system:{category:'spell',force:3,duration:'3 rounds',resistPool:'resolve'}}]);
  const world=remember('itemIds',await Item.create({name:prefix+' Resource',type:'resource'}));
  const [embedded]=await caster.createEmbeddedDocuments('Item',[{name:'Embedded Resource',type:'resource'}]);
  const scene=remember('sceneIds',await Scene.create({name:prefix,width:1600,height:1000,grid:{size:100,type:1,distance:2,units:'m'},tokenVision:false}));
  const td=await caster.getTokenDocument({x:300,y:300});await scene.createEmbeddedDocuments('Token',[td.toObject()]);
  await scene.view();
  window.magicReview.caster=caster.id;window.magicReview.target=target.id;
  return {userId:user.id,caster:caster.id,target:target.id,spirit:spirit.id,scene:scene.id,power:power.uuid,world:world.uuid,embedded:embedded.uuid};
 });
 await page.waitForFunction(id=>canvas.scene?.id===id,f.scene);
 pass('isolated fixtures ready',f);
 // Verify actual form submissions for world and embedded resources across A-E.
 for(const uuid of [f.world,f.embedded]) {
  await page.evaluate(async uuid=>{const i=await fromUuid(uuid);await i.sheet.render(true);},uuid);
  for(const cls of ['A','B','C','D','E']) {
   const selector='.sinless.sheet.item select[name="system.class"]';
   await page.selectOption(selector,cls);
   await page.waitForFunction(async ({uuid,cls})=>(await fromUuid(uuid)).system.class===cls,{uuid,cls});
  }
  await page.fill('.sinless.sheet.item input[name="system.market"]','17');
  await page.locator('.sinless.sheet.item input[name="system.market"]').dispatchEvent('change');
  await page.waitForFunction(async uuid=>(await fromUuid(uuid)).system.market===17,uuid);
  await page.evaluate(async uuid=>{await (await fromUuid(uuid)).sheet.close();},uuid);
  pass('resource form saves classes A-E and market',uuid);
 }
 const defaults=await page.evaluate(async f=>{
  const a=game.actors.get(f.target);const run=a._runTest;a._runTest=async d=>d;
  try {return await a.rollResistance('resolve');}finally{a._runTest=run;}
 },f);
 assert.equal(defaults.rank,6);pass('fixed NPC void resistance includes force',defaults.rank);
 // Real spell configuration dialog and card creation.
 await page.evaluate(f=>{const a=game.actors.get(f.caster);a.castSpell(a.items.find(i=>i.type==='power'));},f);
 await page.waitForSelector('.sinless-test-dialog input[name=ward]');
 await page.fill('.sinless-test-dialog input[name=bonus]','20');
 await page.fill('.sinless-test-dialog input[name=ward]','1');
 await page.click('.sinless-test-dialog button[data-action=roll]');
 await page.waitForFunction(id=>game.messages.some(m=>m.flags.sinless?.actorUuid==='Actor.'+id&&m.flags.sinless?.test?.extra?.ward?.crossed===1),f.caster);
 pass('spell dialog casts through ward and renders card');
 // Deterministic GM casting card: owned defender must apply it from a separate player session.
 const cast=await page.evaluate(async f=>{
  const {renderCard}=await import('/systems/sinless/module/dice/test-roll.mjs');
  const state={label:'Review Hold',final:[6,6,6,6],initial:[6,6,6,6],rerolledIndices:[],kismetAdded:[],target:5,reroll:0,threshold:null,plan:{total:4,limit:4},notes:[],extra:{spell:{continuous:true,label:'Review Hold',force:3,drain:0,resistPool:'resolve',duration:'3 rounds',targets:[{uuid:'Actor.'+f.target,name:'Target'}]}}};
  const m=await ChatMessage.create({content:await renderCard(state),speaker:ChatMessage.getSpeaker({actor:game.actors.get(f.caster)}),flags:{sinless:{actorUuid:'Actor.'+f.caster,test:state}}});
  return m.id;
 },f);
 player=await browser.newPage({viewport:{width:1400,height:1000}});
 player.on('pageerror',e=>console.log('PLAYER ERROR',e.message));
 await player.goto('http://localhost:30000/join');
 await player.selectOption('select[name=userid]',f.userId);await player.click('button[name=join]');
 await player.waitForFunction(()=>window.game?.ready,null,{timeout:60000});
 console.log('Player joined');
 await player.evaluate(({id,target})=>{window.reviewApply=import('/systems/sinless/module/apps/spell-effects.mjs').then(m=>m.applySustained(game.messages.get(id),'Actor.'+target));}, {id:cast,target:f.target});
 await player.waitForSelector('.sinless-damage-dialog');
 await player.fill('.sinless-damage-dialog input[name=resist]','1');
 await player.click('.sinless-damage-dialog button[data-action=apply]');
 await player.evaluate(()=>window.reviewApply);
 const applied=await player.evaluate(({id,target})=>{const a=game.actors.get(target);return {owner:game.messages.get(id).isOwner,effects:a.effects.map(e=>e.flags.sinless?.sustained),receipts:game.messages.filter(m=>m.flags.sinless?.sustainedApplication?.message==='ChatMessage.'+id).length};},{id:cast,target:f.target});
 assert.equal(applied.owner,false);assert.equal(applied.effects.length,1);assert.equal(applied.effects[0].needed,3);assert.equal(applied.receipts,1);pass('player applies GM spell without message ownership',applied);
 await player.evaluate(async ({id,target})=>{const {applySustained}=await import('/systems/sinless/module/apps/spell-effects.mjs');await applySustained(game.messages.get(id),'Actor.'+target);},{id:cast,target:f.target});
 assert.equal(await player.locator('.sinless-damage-dialog').count(),0);pass('repeat application is ignored');
 const progress=await player.evaluate(async f=>{
  const a=game.actors.get(f.target),e=a.effects.find(e=>e.flags.sinless?.sustained);const roll=a.rollResistance;
  let hits=1;a.rollResistance=async()=>({getFlag:()=>({final:Array(hits).fill(6),kismetAdded:[],target:5})});
  try{await a.resistSustainedSpell(e);const accumulated=e.flags.sinless.sustained.accumulated;hits=2;await a.resistSustainedSpell(e);return {accumulated,left:a.effects.size};}finally{a.rollResistance=roll;}
 },f);
 assert.deepEqual(progress,{accumulated:1,left:0});pass('player accumulates resistance and removes effect',progress);
 await player.close();player=null;
 // Summon linked spirit and verify real unlinked token delta.
 const placed=await page.evaluate(async f=>{
  const {renderCard}=await import('/systems/sinless/module/dice/test-roll.mjs');
  const {placeSpirit}=await import('/systems/sinless/module/apps/spell-effects.mjs');
  const state={label:'Summon',final:[6,6,6,6],initial:[6,6,6,6],rerolledIndices:[],kismetAdded:[],target:5,reroll:0,threshold:null,plan:{total:4,limit:4},notes:[],extra:{summon:{force:3,bag:0,spiritActor:'Actor.'+f.spirit}}};
  const msg=await ChatMessage.create({content:await renderCard(state),speaker:ChatMessage.getSpeaker({actor:game.actors.get(f.caster)}),flags:{sinless:{actorUuid:'Actor.'+f.caster,test:state}}});
  await placeSpirit(msg);await placeSpirit(msg);
  const tokens=canvas.scene.tokens.filter(t=>t.actorId===f.spirit),t=tokens[0];
  return {count:tokens.length,force:t.actor.system.spiritForce,sourceForce:game.actors.get(f.spirit).system.spiritForce,disposition:t.disposition};
 },f);
 assert.equal(placed.count,1);assert.equal(placed.force,3);assert.equal(placed.sourceForce,0);assert.equal(placed.disposition,1);pass('spirit placement applies force to token only and prevents duplicates',placed);
 const errors=logs.filter(l=>/^(error:|pageerror:)/.test(l)&&!/favicon|404|WebGL|hardware|GPU/.test(l));
 assert.deepEqual(errors,[]);pass('no GM browser errors');
} finally {
 if(player)await player.close();
 const cleanup=await page.evaluate(async()=>{
  const f=window.magicReview;if(!f)return;
  for(const app of foundry.applications.instances.values())if(app.element?.classList.contains('sinless'))await app.close();
  if(f.activeScene)await game.scenes.get(f.activeScene)?.view();
  for(const id of f.sceneIds)await game.scenes.get(id)?.delete();
  for(const id of f.actorIds)await game.actors.get(id)?.delete();
  for(const id of f.itemIds)await game.items.get(id)?.delete();
  for(const id of f.userIds)await game.users.get(id)?.delete();
  for(const m of game.messages.filter(m=>!f.messageIds.includes(m.id)&&(f.actorIds.includes(m.speaker.actor)||f.actorIds.some(id=>m.flags.sinless?.actorUuid==='Actor.'+id))))await m.delete();
  return {actors:f.actorIds.filter(id=>game.actors.has(id)),items:f.itemIds.filter(id=>game.items.has(id)),users:f.userIds.filter(id=>game.users.has(id)),scenes:f.sceneIds.filter(id=>game.scenes.has(id))};
 });
 pass('fixture cleanup',cleanup);writeFileSync(out+'/results.json',JSON.stringify(checks,null,2));await browser.close();
}
