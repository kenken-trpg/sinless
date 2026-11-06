import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {joinGM} from "/private/tmp/claude-501/-Users-mantanikenichi-mydevelop/169d1560-1874-49ac-a866-603a5aec9198/scratchpad/pw/lib.mjs";
const out="/private/tmp/sinless-verification";
const {browser,page,logs}=await joinGM();
page.setDefaultTimeout(20000);
let fixture,player;
const results=[];
const pass=(name,data)=>{results.push({name,data});console.log("PASS",name,data);};
try{
 fixture=await page.evaluate(async()=>{
  const u=await User.create({name:"VERIFY Player "+Date.now(),role:1});
  const attrs=Object.fromEntries(["str","bod","rea","int","wil","cha"].map(k=>[k,{value:12}]));
  const pc=await Actor.create({name:"VERIFY Player Character",type:"character",ownership:{default:0,[u.id]:3},system:{creation:{active:false},attributes:attrs,skills:{firearms:{rank:6}},lifestyle:"low"}});
  const npc=await Actor.create({name:"VERIFY GM Enemy",type:"npc",ownership:{default:2},prototypeToken:{actorLink:true},system:{initiative:12,poolMax:{brawn:10,finesse:10,focus:10,resolve:10},grid:{influence:12}}});
  await pc.createEmbeddedDocuments("Item",[{name:"VERIFY Pistol",type:"weapon",system:{category:"firearm",skill:"firearms",accuracy:2,damage:"2",penetration:2}}]);
  await u.update({character:pc.id});
  const active=game.scenes.active?.id;
  const scene=await Scene.create({name:"VERIFY Scene",width:1600,height:1000,navigation:true,tokenVision:false,globalLight:true,grid:{size:100,type:1,distance:2,units:"m"}});
  const td1=await pc.getTokenDocument({x:300,y:300}),td2=await npc.getTokenDocument({x:700,y:300,actorLink:true});
  const tokens=await scene.createEmbeddedDocuments("Token",[td1.toObject(),td2.toObject()]);
  await scene.activate();
  return {userId:u.id,userName:u.name,pcId:pc.id,npcId:npc.id,sceneId:scene.id,tokenIds:tokens.map(t=>t.id),activeSceneId:active,messageIds:game.messages.contents.map(m=>m.id)};
 });
 console.log("fixtures",fixture);
 await page.waitForFunction(id=>canvas.scene?.id===id,fixture.sceneId);
 player=await browser.newPage({viewport:{width:1600,height:1100}});
 const playerLogs=[];player.on("pageerror",e=>playerLogs.push(e.message));
 await player.goto("http://localhost:30000/join");await player.selectOption("select[name=userid]",fixture.userId);await player.click("button[name=join]");
 await player.waitForFunction(()=>window.game?.ready,null,{timeout:90000});
 await player.waitForFunction(id=>canvas.scene?.id===id,fixture.sceneId);
 await player.evaluate(()=>document.querySelectorAll(".tour,.tour-overlay,#notifications li").forEach(e=>e.remove()));
 const owned=await player.evaluate(async f=>{const pc=game.actors.get(f.pcId);await pc.sheet.render(true);return {isOwner:pc.isOwner,isGM:game.user.isGM,editable:pc.sheet.isEditable};},fixture);
 assert.deepEqual(owned,{isOwner:true,isGM:false,editable:true});pass("player own sheet editable",owned);
 await player.evaluate(id=>{game.actors.get(id).rollSkill("firearms");},fixture.pcId);
 await player.waitForSelector(".sinless-test-dialog");await player.click(".sinless-test-dialog button[data-action=roll]");
 await player.waitForFunction(id=>game.messages.contents.some(m=>m.flags.sinless?.actorUuid==="Actor."+id),fixture.pcId);
 pass("player skill roll creates chat card",await player.evaluate(()=>game.messages.contents.at(-1).flags.sinless.test.plan));
 await player.evaluate(async f=>{
  await game.actors.get(f.pcId).sheet.close();
  canvas.tokens.get(f.tokenIds[1]).setTarget(true,{releaseOthers:true});
  const pc=game.actors.get(f.pcId);pc.rollWeapon(pc.items.getName("VERIFY Pistol"));
 },fixture);
 await player.waitForSelector(".sinless-test-dialog");
 await player.fill(".sinless-test-dialog input[name=bonus]","20");await player.dispatchEvent(".sinless-test-dialog input[name=bonus]","input");
 await player.click(".sinless-test-dialog button[data-action=roll]");
 await player.waitForFunction(f=>game.messages.contents.some(m=>m.flags.sinless?.test?.extra?.targets?.some(t=>t.uuid.includes(f.tokenIds[1]))),fixture);
 const attack=await player.evaluate(f=>{
  const m=game.messages.contents.filter(m=>m.flags.sinless?.test?.extra?.targets?.some(t=>t.uuid.includes(f.tokenIds[1]))).at(-1);
  const card=document.querySelector('[data-message-id="'+m.id+'"]');
  return {id:m.id,target:m.flags.sinless.test.extra.targets,defend:!!card.querySelector("[data-sinless-action=defend]"),content:m.content};
 },fixture);
 assert.equal(attack.defend,false);assert.ok(attack.target.length);pass("player attacks GM NPC and cannot apply its defense",{id:attack.id,targets:attack.target});
 await page.waitForFunction(id=>!!document.querySelector('[data-message-id="'+id+'"] [data-sinless-action=defend]'),attack.id);
 await page.click('[data-message-id="'+attack.id+'"] [data-sinless-action=defend]');
 await page.waitForSelector(".sinless-damage-dialog");
 await page.click(".sinless-damage-dialog button[data-action=apply]");
 await page.waitForFunction(id=>game.actors.get(id).system.condition.physical.value>0||game.actors.get(id).system.condition.stun.value>0,fixture.npcId);
 pass("GM resolves player attack",await page.evaluate(id=>game.actors.get(id).system.condition.toObject?.()??game.actors.get(id).system.condition,fixture.npcId));
 const perm=await player.evaluate(async f=>{
  const npc=game.actors.get(f.npcId);await npc.sheet.render(true);await new Promise(r=>setTimeout(r,400));
  const before=npc.system.grid.influence;
  const {applySustained}=await import("/systems/sinless/module/apps/spell-effects.mjs");
  const spell={continuous:true,resistPool:"resolve",label:"VERIFY Forbidden"};
  const msg={getFlag:()=>({extra:{spell}})};
  await applySustained(msg,npc.uuid);
  return {editable:npc.sheet.isEditable,before,after:npc.system.grid.influence,notification:document.querySelector("#notifications")?.innerText??""};
 },fixture);
 assert.equal(perm.editable,false);assert.equal(perm.before,perm.after);assert.ok(/権限|permission|control|操作/i.test(perm.notification));pass("unowned sheet read only and localized permission warning",perm);
 await player.screenshot({path:out+"/player-permission.png"});
 assert.deepEqual(playerLogs,[]);await player.close();player=null;
 await page.evaluate(async()=>{for(const a of foundry.applications.instances.values()){if(a.element?.classList.contains("sinless"))await a.close();}});
 // Combat uses the same two isolated actors.
 const combat=await page.evaluate(async f=>{
  const pc=game.actors.get(f.pcId),npc=game.actors.get(f.npcId);
  await npc.update({"system.condition.physical.value":0,"system.condition.stun.value":0});
  const c=await Combat.create({scene:f.sceneId,active:true});
  await c.createEmbeddedDocuments("Combatant",f.tokenIds.map((id,i)=>({tokenId:id,sceneId:f.sceneId,actorId:i?npc.id:pc.id})));
  await c.rollAll();
  return {id:c.id,pc:c.combatants.find(c=>c.actorId===pc.id).initiative,npc:c.combatants.find(c=>c.actorId===npc.id).initiative,npcExpected:npc.system.initiative,focus:pc.system.pools.focus.max,rea:pc.system.attributes.rea.value};
 },fixture);
 assert.equal(combat.npc,combat.npcExpected);assert.ok(Number.isFinite(combat.pc));assert.ok(combat.pc>=combat.rea&&combat.pc<=combat.rea+combat.focus+1);pass("initiative PC rolled and NPC static",combat);
 await page.evaluate(async ({f,cid})=>{
  const pc=game.actors.get(f.pcId);
  await pc.update({"system.condition.physical.value":pc.system.condition.physical.max,"system.condition.overflow":1});
  await pc.createEmbeddedDocuments("ActiveEffect",[{name:"VERIFY Sustained",flags:{sinless:{sustained:{needed:8,accumulated:2,pool:"resolve",force:3}}}}]);
  await game.combats.get(cid).startCombat();
 },{f:fixture,cid:combat.id});
 await page.evaluate(async ({f,cid})=>{
  const c=game.combats.get(cid);
  if(c.combatant.actorId!==f.pcId)await c.nextTurn();
 },{f:fixture,cid:combat.id});
 await page.waitForFunction(id=>game.messages.contents.some(m=>m.flags.sinless?.overloadPrompt&&m.flags.sinless.actorUuid==="Actor."+id),fixture.pcId);
 const prompt=await page.evaluate(id=>{const m=game.messages.contents.filter(m=>m.flags.sinless?.overloadPrompt&&m.flags.sinless.actorUuid==="Actor."+id).at(-1);return {content:m.content,whisper:m.whisper};},fixture.pcId);
 assert.ok(prompt.content.includes("data-track=\"physical\""));assert.ok(prompt.content.includes("VERIFY Sustained"));assert.ok(prompt.whisper.includes(fixture.userId));pass("turn prompts overload and sustained resistance to owners",prompt);
 await page.evaluate(async ({f,cid})=>{
  const pc=game.actors.get(f.pcId);await pc.update({"system.condition.physical.value":0,"system.condition.overflow":0,"system.pools.finesse.spent":3,"system.grid.mcpSpent":2});
  const c=game.combats.get(cid);await c.nextTurn();
 },{f:fixture,cid:combat.id});
 const turn=await page.evaluate(id=>game.actors.get(id).system.pools.finesse.spent,fixture.pcId);
 // Crossing the final turn starts a round; only assert no refresh for an in-round move.
 assert.equal(turn,3);pass("advancing a turn preserves spent pool dice",{spent:turn});
 await page.evaluate(async ({f,cid})=>{const pc=game.actors.get(f.pcId);await pc.update({"system.pools.finesse.spent":3,"system.grid.mcpSpent":2});await game.combats.get(cid).nextRound();},{f:fixture,cid:combat.id});
 await page.waitForFunction(id=>game.actors.get(id).system.pools.finesse.spent===0&&game.actors.get(id).system.grid.mcpSpent===0,fixture.pcId);
 pass("new round refreshes pools and MCP",await page.evaluate(id=>({finesse:game.actors.get(id).system.pools.finesse,mcp:game.actors.get(id).system.grid.mcpSpent}),fixture.pcId));
 await page.evaluate(async ({f,cid})=>{await game.actors.get(f.pcId).update({"system.combat.recoil":1,"system.combat.recoilPrimed":true});await game.combats.get(cid).delete();},{f:fixture,cid:combat.id});
 await page.waitForFunction(id=>game.actors.get(id).system.combat.recoil===0&&!game.actors.get(id).system.combat.recoilPrimed,fixture.pcId);pass("ending combat clears recoil",{});
 const errors=logs.filter(l=>/^(error:|pageerror:)/.test(l)&&!/favicon|404|WebGL|hardware|GPU/.test(l));assert.deepEqual(errors,[]);
 console.log("COMPLETED player and combat",results.length);
}finally{
 if(player)await player.close();
 if(fixture)await page.evaluate(async f=>{
  for(const c of game.combats.filter(c=>c.scene?.id===f.sceneId))await c.delete();
  if(f.activeSceneId)await game.scenes.get(f.activeSceneId)?.activate();
  await game.scenes.get(f.sceneId)?.delete();
  await game.actors.get(f.pcId)?.delete();await game.actors.get(f.npcId)?.delete();
  await game.users.get(f.userId)?.delete();
  for(const m of game.messages.filter(m=>!f.messageIds.includes(m.id)&&((m.flags.sinless?.actorUuid??"").includes(f.pcId)||(m.flags.sinless?.actorUuid??"").includes(f.npcId)||m.speaker.actor===f.pcId||m.speaker.actor===f.npcId)))await m.delete();
 },fixture);
 writeFileSync(out+"/player-combat.json",JSON.stringify(results,null,2));await browser.close();
}
