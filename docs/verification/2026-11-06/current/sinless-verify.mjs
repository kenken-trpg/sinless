import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
import {joinGM} from "/private/tmp/claude-501/-Users-mantanikenichi-mydevelop/169d1560-1874-49ac-a866-603a5aec9198/scratchpad/pw/lib.mjs";
const source="/private/tmp/claude-501/-Users-mantanikenichi-mydevelop/169d1560-1874-49ac-a866-603a5aec9198/scratchpad/pw",out="/private/tmp/sinless-verification";
mkdirSync(out,{recursive:true});
const mode=process.argv[2]??"diagnose",arg=process.argv[3]??"ja";
const logfile=out+"/"+mode+"-"+arg+".log";writeFileSync(logfile,"");
const log=console.log.bind(console);
console.log=(...args)=>{const line=args.map(x=>typeof x==="string"?x:JSON.stringify(x)).join(" ");appendFileSync(logfile,line+"\n");log(line);};
if(mode==="batch"){ await import("file:///private/tmp/sinless-verification/batch.mjs"); } else if(mode==="extra"){ await import("file:///private/tmp/sinless-verification/extra.mjs"); } else if(mode==="sweep"){
 let code=readFileSync(source+"/sweep.mjs","utf8").replace('"./lib.mjs"',JSON.stringify(source+"/lib.mjs"));
 code=code.replace("await page.evaluate(async () => {\n  for (const a","const fixtures = await page.evaluate(async () => {\n  for (const a");
 code=code.replace(/  await Item.createDocuments[^\n]+\n\}\);/,'  const worlds = await Item.createDocuments(itemTypes.map(t => ({ name: "SWEEP W "+t, type: t })));\n  const actors = game.actors.filter(a => a.name.startsWith("SWEEP"));\n  return {characterUuid:ch.uuid,actorIds:actors.map(a=>a.id),itemIds:worlds.map(i=>i.id),targets:[...actors.map(a=>a.uuid),...ch.items.map(i=>i.uuid),...worlds.map(i=>i.uuid)]};\n});');
 const start=code.indexOf("const targets = await page.evaluate"),end=code.indexOf("const results = [];",start);
 assert.ok(start>0&&end>start);code=code.slice(0,start)+"const targets = fixtures.targets;\n"+code.slice(end);
 code=code.replace("for (const uuid of targets) {","try {\nfor (const uuid of targets) {");
 code=code.replace('await page.evaluate(async () => { const a = game.actors.getName("SWEEP Char"); await a.sheet.render(true); });','await page.evaluate(async uuid => { const a = await fromUuid(uuid); await a.sheet.render(true); },fixtures.characterUuid);');
 const cleanup=code.indexOf('await page.evaluate(async () => {\n  for (const a',code.indexOf('// screenshot')),cleanupEnd=code.indexOf('if (lang !== "ja")',cleanup);
 assert.ok(cleanup>0&&cleanupEnd>cleanup);
 code=code.slice(0,cleanup)+'} finally {\nawait page.evaluate(async f=>{for(const id of f.actorIds) await game.actors.get(id)?.delete();for(const id of f.itemIds) await game.items.get(id)?.delete();},fixtures);\n}\n'+code.slice(cleanupEnd);
 code=code.replace('await browser.close();','writeFileSync(out + "/report-"+lang+".json",JSON.stringify(results,null,2));\nawait browser.close();\nif(results.some(r=>r.crash||r.bad?.length||r.mismatch?.length||r.errors.length)) process.exitCode=1;');
 code='import {writeFileSync} from "node:fs";\n'+code;
 code=code.replaceAll("SWEEP","VERIFY-"+arg);
 code=code.replace('res.inputs++;', 'res.inputs++; if(res.inputs % 20 === 0) console.info("VERIFY-PROGRESS "+res.name+" "+res.inputs);');
 code=code.replace('page.setDefaultTimeout(60000);', 'page.setDefaultTimeout(60000); page.on("console",m=>{if(m.text().startsWith("VERIFY-PROGRESS"))console.log(m.text());});');
 const path=out+"/sweep-fixed-"+arg+".mjs";writeFileSync(path,code);process.argv=[process.argv[0],path,out,arg];await import(pathToFileURL(path));
} else if(mode==="legacy"){
 let code=readFileSync(source+"/"+arg+".mjs","utf8").replace('"./lib.mjs"',JSON.stringify(source+"/lib.mjs"));
 code=code.replace('await page.evaluate(() => game.actors.getName("SMOKE D Ben").rollSkill("firearms"));','await page.evaluate(() => { game.actors.getName("SMOKE D Ben").rollSkill("firearms"); });');
 code=code.replace('const ben = fn => page.evaluate(fn);','const ben = (fn, arg) => page.evaluate(fn, arg);');
 const path=out+"/"+arg+"-fixed.mjs";writeFileSync(path,code);process.argv=[process.argv[0],path,out];await import(pathToFileURL(path));console.log("COMPLETED",arg);
} else {
 const {browser,page,logs}=await joinGM();
 try {
  if(mode==="diagnose") console.log(await page.evaluate(async()=>{
   const i=await Item.create({name:"VERIFY Resource",type:"resource"});
   try {await i.sheet.render(true);await new Promise(r=>setTimeout(r,700));const el=i.sheet.element.querySelector('[name="system.class"]');
    return {version:game.version,world:game.world.id,options:[...el.options].map(o=>({value:o.value,label:o.label})),value:el.value,actors:game.actors.map(a=>({id:a.id,name:a.name})),users:game.users.map(u=>({id:u.id,name:u.name,role:u.role}))};
   }finally {await i.sheet.close();await i.delete();}
  }));
  else if(mode==="cleanup") console.log(await page.evaluate(async()=>{
   const ids=["7h9zTGZPAyjz0XNA","nJ7bklLCCujzmPZ7","eW6Ux6dJIEQCDS41","4dHbVg0H2Wztjzzh","uP0ZaYsnWUX2KBeV","bp8zMkToJey7erPA"];
   const removed=[];for(const id of ids){const a=game.actors.get(id);if(a&&/^SW\d\d$/.test(a.name)){removed.push(a.uuid);await a.delete();}}
   return {removed,worldOrphans:game.items.filter(i=>/^SW\d\d$/.test(i.name)).map(i=>({id:i.id,name:i.name}))};
  }));
  else throw new Error("unknown mode "+mode);
  console.log("console",logs.filter(l=>!/favicon|404|WebGL|hardware|GPU/.test(l)));
 }finally {await browser.close();}
}
