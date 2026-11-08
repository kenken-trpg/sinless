// Run the real verification scripts while another GM session adds a message after their fixtures exist.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {joinGM} from '../lib.mjs';
const outDir=process.env.SINLESS_VERIFY_OUT??'/private/tmp/sinless-chat-cleanup';
mkdirSync(outDir,{recursive:true});
const results={};
const samples=process.argv.includes('samples');
const setup=await joinGM({noCanvas:true});
const browser=setup.browser;
const gmId=await setup.page.evaluate(()=>game.user.id);
let observer,userId;
const sentinels=[];
try{
 userId=await setup.page.evaluate(async()=>{
  if(game.world.id!=='sinless-test')throw new Error('Use sinless-test');
  const u=await User.create({name:`VERIFY Cleanup ${foundry.utils.randomID()}`,role:4});return u.id;
 });
 const user=await setup.page.evaluate(id=>game.users.get(id).name,userId);
 await setup.page.context().close();
 observer=await joinGM({browser,user,noCanvas:true});
 for(const [script,alias] of (samples?[['samples',null]]:[['color-independence','VERIFY Color'],['contrast','VERIFY Contrast'],['target-size','VERIFY Target']])){
  const before=await observer.page.evaluate(()=>game.messages.map(m=>m.id));
  const actors=await observer.page.evaluate(()=>game.actors.map(a=>a.id));
  const dir=join(outDir,script);mkdirSync(dir,{recursive:true});
  const child=spawn(process.execPath,[fileURLToPath(new URL(samples?'../2026-11-06/sample-actors/initial-workflow.mjs':`./${script}.mjs`,import.meta.url))],{env:{...process.env,SINLESS_VERIFY_OUT:dir,SINLESS_REVIEW_OUT:dir},stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',d=>{log+=d;});child.stderr.on('data',d=>{log+=d;});
  const done=new Promise(resolve=>{child.on('error',e=>resolve({code:1,error:e.message}));child.on('exit',(code,signal)=>resolve({code,signal}));});
  // Fail promptly if the child exits before it creates its card; do not leave the child running on a probe failure.
  try{
   await Promise.race([
    observer.page.waitForFunction(({before,alias,actors})=>game.messages.some(m=>!before.includes(m.id)&&(alias?(m.speaker.alias===alias||m.content.includes(alias)):!!m.speaker.actor&&!actors.includes(m.speaker.actor)&&game.actors.has(m.speaker.actor))),{before,alias,actors},{timeout:60000}),
    done.then(result=>{throw new Error(`${script} exited before the probe: ${JSON.stringify(result)}\n${log}`);})
   ]);
   const sentinel=await observer.page.evaluate(async script=>(await ChatMessage.create({content:`<p>VERIFY unrelated message during ${script}</p>`,speaker:{alias:'Cleanup observer'}})).id,script);
   sentinels.push(sentinel);
   // The old sample cleanup filtered by the running GM's author ID. Exercise that case as well.
   const sameAuthor=samples?await observer.page.evaluate(async gmId=>(await ChatMessage.create({author:gmId,content:'<p>VERIFY unrelated same-author message</p>',speaker:{alias:'Cleanup observer same author'}})).id,gmId):null;
   if(sameAuthor)sentinels.push(sameAuthor);
   const result=await done;
   writeFileSync(join(dir,'run.log'),log);
   assert.equal(result.code,0,`${script}: ${log}`);
   const state=await observer.page.evaluate(({before,sentinel,sameAuthor,gmId})=>({sentinel:game.messages.has(sentinel),existing:before.every(id=>game.messages.has(id)),
    ...(sameAuthor?{sameAuthor:game.messages.has(sameAuthor),authorMatches:game.messages.get(sameAuthor)?.author.id===gmId}:{})}),{before,sentinel,sameAuthor,gmId});
   assert.deepEqual(state,{sentinel:true,existing:true,...(sameAuthor?{sameAuthor:true,authorMatches:true}:{})},`${script}: unrelated and pre-existing messages preserved`);
   results[script]=state;console.log('PASS',script,JSON.stringify(state));
   await observer.page.evaluate(async ids=>ChatMessage.deleteDocuments(ids),[sentinel,...(sameAuthor?[sameAuthor]:[])]);
  }finally{
   if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await done;}
  }
 }
}finally{
 // The probe owns only its sentinel messages and observer user.
 const cleanup=await joinGM({browser,noCanvas:true});
 try{await cleanup.page.evaluate(async({userId,sentinels})=>{
  const ids=sentinels.filter(id=>game.messages.has(id));if(ids.length)await ChatMessage.deleteDocuments(ids);
  if(userId&&game.users.has(userId))await game.users.get(userId).delete();
 },{userId,sentinels});}finally{await browser.close();}
 writeFileSync(join(outDir,'chat-cleanup.json'),JSON.stringify(results,null,2));
}
