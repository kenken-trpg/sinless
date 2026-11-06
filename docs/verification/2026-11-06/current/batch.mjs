import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {joinGM} from "/private/tmp/claude-501/-Users-mantanikenichi-mydevelop/169d1560-1874-49ac-a866-603a5aec9198/scratchpad/pw/lib.mjs";
const source="/private/tmp/claude-501/-Users-mantanikenichi-mydevelop/169d1560-1874-49ac-a866-603a5aec9198/scratchpad/pw",out="/private/tmp/sinless-verification";
const session=await joinGM();
globalThis.__sinlessVerificationSession={...session,browser:{close:async()=>{}}};
const shared=out+"/shared-lib.mjs";writeFileSync(shared,"export async function joinGM(){return globalThis.__sinlessVerificationSession;}\n");
const results=[];
try{
 for(const name of ["shoot","cond","adv","op","life","chase","digital","magic","magic9"]){
  await session.page.evaluate(async()=>{for(const app of Array.from(foundry.applications.instances.values()))if(app.element?.classList.contains("sinless"))await app.close();document.querySelectorAll(".tour,.tour-overlay,#notifications li").forEach(e=>e.remove());});
  session.logs.length=0;
  let code=readFileSync(source+"/"+name+".mjs","utf8").replace('"./lib.mjs"',JSON.stringify(shared));
  code=code.replaceAll('page.setDefaultTimeout(8000)', 'page.setDefaultTimeout(30000)');
  code=code.replaceAll('timeout: 10000', 'timeout: 30000');
  code=code.replace('await page.evaluate(() => game.actors.getName("SMOKE D Ben").rollSkill("firearms"));','await page.evaluate(() => { game.actors.getName("SMOKE D Ben").rollSkill("firearms"); });');
  code=code.replace('const ben = fn => page.evaluate(fn);','const ben = (fn, arg) => page.evaluate(fn, arg);');
  const path=out+"/"+name+"-batch.mjs";writeFileSync(path,code);process.argv=[process.argv[0],path,out];
  console.log("START",name);
  try {await import(pathToFileURL(path));const errors=session.logs.filter(l=>/^(error:|pageerror:)/.test(l)&&!/favicon|404|WebGL|hardware|GPU/.test(l));results.push({name,completed:true,errors});console.log("COMPLETED",name,"errors",errors.length);}
  catch(e){await session.page.screenshot({path:out+"/failed-"+name+".png"}).catch(()=>{});writeFileSync(out+"/failed-"+name+".html",await session.page.content());results.push({name,completed:false,error:e.stack});console.log("FAILED",name,e.stack);}
 }
}finally{await session.browser.close();writeFileSync(out+"/regression.json",JSON.stringify(results,null,2));}
if(results.some(r=>!r.completed||r.errors?.length))process.exitCode=1;
