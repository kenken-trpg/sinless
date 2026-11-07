import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL,fileURLToPath} from "node:url";
import {joinGM} from "../../lib.mjs";
import {createFixtures,removeFixtures} from "./fixtures.mjs";
import {checkOutput} from "./batch-checks.mjs";
import {format} from "node:util";
const source=fileURLToPath(new URL("../original",import.meta.url)),lib=fileURLToPath(new URL("../../lib.mjs",import.meta.url)),out=process.env.SINLESS_VERIFY_OUT??"/private/tmp/sinless-verification";
// The scripts in original/ wait fixed times, sized for the slow software canvas of the time.
// Scale those waits; SINLESS_BATCH_WAIT=1 restores them.
globalThis.__sinlessWaitScale=Number(process.env.SINLESS_BATCH_WAIT??0.2);
const session=await joinGM();
globalThis.__sinlessVerificationSession={...session,browser:{close:async()=>{}}};
const shared=out+"/shared-lib.mjs";writeFileSync(shared,"export async function joinGM(){return globalThis.__sinlessVerificationSession;}\n");
const results=[];
const fixtures=await createFixtures(session.page);
console.log("FIXTURES",JSON.stringify(fixtures.summary));
let cleanup;
try{
 for(const name of ["shoot","cond","adv","op","life","chase","digital","magic","magic9"]){
  await session.page.evaluate(async()=>{for(const app of Array.from(foundry.applications.instances.values()))if(app.element?.classList.contains("sinless"))await app.close();document.querySelectorAll(".tour,.tour-overlay,#notifications li").forEach(e=>e.remove());});
  session.logs.length=0;
  let code=readFileSync(source+"/"+name+".mjs","utf8").replace('"./lib.mjs"',JSON.stringify(shared));
  code=code.replaceAll('page.setDefaultTimeout(8000)', 'page.setDefaultTimeout(30000)');
  code=code.replaceAll('timeout: 10000', 'timeout: 30000');
  code=code.replaceAll('.waitForTimeout(', '.waitForTimeout(globalThis.__sinlessWaitScale*');
  // magic: the defend dialog is still closing when the drain dialog opens; wait until it leaves.
  code=code.replace('await page.click(".sinless-damage-dialog button[data-action=cancel]");\n','await page.click(".sinless-damage-dialog button[data-action=cancel]");await page.waitForSelector(".sinless-damage-dialog",{state:"detached"});\n');
  code=code.replace('await page.evaluate(() => game.actors.getName("SMOKE D Ben").rollSkill("firearms"));','await page.evaluate(() => { game.actors.getName("SMOKE D Ben").rollSkill("firearms"); });');
  code=code.replace('const ben = fn => page.evaluate(fn);','const ben = (fn, arg) => page.evaluate(fn, arg);');
  const path=out+"/"+name+"-batch.mjs";writeFileSync(path,code);process.argv=[process.argv[0],path,out];
  console.log("START",name);
  // Capture what the script prints so batch-checks.mjs can assert on it.
  const lines=[],print=console.log;console.log=(...a)=>{lines.push(format(...a));print(...a);};
  try {try{await import(pathToFileURL(path));}finally{console.log=print;}
   const errors=session.logs.filter(l=>/^(error:|pageerror:)/.test(l)&&!/favicon|404|WebGL|hardware|GPU/.test(l));
   const checks=checkOutput(name,lines);
   results.push({name,completed:true,errors,checks});
   console.log("COMPLETED",name,"errors",errors.length,"checks",checks.passed.length+"/"+(checks.passed.length+checks.failed.length));
   for(const f of checks.failed)console.log("  CHECK FAILED",JSON.stringify(f));}
  catch(e){await session.page.screenshot({path:out+"/failed-"+name+".png"}).catch(()=>{});writeFileSync(out+"/failed-"+name+".html",await session.page.content());results.push({name,completed:false,error:e.stack});console.log("FAILED",name,e.stack);}
 }
}finally{
 cleanup=await removeFixtures(session.page,fixtures.snapshot).catch(e=>({error:e.message}));
 console.log("CLEANUP",JSON.stringify(cleanup));
 await session.browser.close();
 writeFileSync(out+"/regression.json",JSON.stringify({system:fixtures.summary.system,fixtures:fixtures.summary,results,cleanup},null,2));
}
if(results.some(r=>!r.completed||r.errors?.length||r.checks?.failed.length))process.exitCode=1;
