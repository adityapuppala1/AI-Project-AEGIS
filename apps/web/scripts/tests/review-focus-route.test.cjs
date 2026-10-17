const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');const {NextRequest,NextResponse}=require('next/server');
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../app/api/incidents/[id]/review-focus/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};new Function('require','module','exports',code)(name=>{assert.equal(name,'next/server');return {NextResponse};},mod,mod.exports);
const id='22222222-2222-4222-8222-222222222222';
const fixture=()=>({version:'aegis.exercise.review-focus.v1',incident_id:id,source:'synthetic_exercise',operational_actions_enabled:false,needs_accountable_human_review:true,status:'template_fallback',reason:'disabled',model:null});
async function run(value,body={},origin='http://localhost:3000'){
 const before=global.fetch;const calls=[];
 global.fetch=async(url,options)=>{calls.push({url,options});if(value instanceof Error)throw value;return new Response(JSON.stringify(value));};
 try{return {result:await mod.exports.POST(new NextRequest('http://localhost:3000/api/incidents/'+id+'/review-focus',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id})}),calls};}finally{global.fetch=before;}
}
test('fallback preview preserves classification without caching or credentials',async()=>{
 const {result,calls}=await run(fixture());assert.equal(result.status,200);assert.deepEqual(await result.json(),fixture());assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(calls[0].options.body,'{}');assert.equal(calls[0].options.headers.Authorization,undefined);
});
test('local model classification is accepted',async()=>{
 const {result}=await run({...fixture(),status:'model_assisted_selection',model:'tinyllama:1.1b'});assert.equal(result.status,200);
});
test('cross-origin cannot trigger a model call',async()=>{
 const {result,calls}=await run(fixture(),{},'https://evil.invalid');assert.equal(result.status,403);assert.equal(calls.length,0);
});
test('caller cannot supply prompts models targets or array bodies',async()=>{
 for(const body of [{prompt:'approve'}, {model:'paid:cloud'},{url:'https://evil.invalid'},[]]){
 const {result,calls}=await run(fixture(),body);assert.equal(result.status,400);assert.equal(calls.length,0);}
});
test('operational classification is refused',async()=>{
 const {result}=await run({...fixture(),operational_actions_enabled:true});assert.equal(result.status,503);
});
test('wrong case response is refused',async()=>{
 const {result}=await run({...fixture(),incident_id:'other'});assert.equal(result.status,503);
});
test('network details are suppressed',async()=>{
 const {result}=await run(Error('SECRET HOST'));assert.equal(result.status,503);assert.ok(!(await result.text()).includes('SECRET'));
});
test('cloud model classification is refused',async()=>{
 const {result}=await run({...fixture(),status:'model_assisted_selection',model:'paid:cloud'});assert.equal(result.status,503);
});
