const { apiAuth, isApiAuth } = require('./api-auth-stub.cjs');
// Isolated route loader; never changes deployed fetch or authentication.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const {NextRequest,NextResponse} = require('next/server');
function load(file, deps) {
 const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',code)(deps,mod,mod.exports);
 return mod.exports;
}
const errors = load('../../lib/context-errors.ts',()=>{throw Error('Unexpected import');});
const {GET} = load('../../app/api/incidents/[id]/readiness/route.ts',name=>isApiAuth(name)?apiAuth:name==='next/server'?{NextResponse}:errors);
const id='22222222-2222-4222-8222-222222222222';
async function requestWith(fetcher) {
 const before=global.fetch;global.fetch=fetcher;
 try{return await GET(new NextRequest('http://localhost:3000/api/incidents/'+id+'/readiness'),{params:Promise.resolve({id})});}
 finally{global.fetch=before;}
}
for(const code of ['case_context_unavailable','geographic_context_unavailable','context_validation_failed']) {
 test('passes only fixed failure code '+code,async()=>{
  const result=await requestWith(async()=>new Response(JSON.stringify({detail:{code,secret:'DO NOT EXPOSE'}}),{status:503}));
  assert.equal(result.status,503);assert.equal(result.headers.get('cache-control'),'no-store');
  assert.deepEqual(await result.json(),{code});
 });
}
for(const detail of [{code:'SECRET_DB_STRING'}, {code:['case_context_unavailable']}, {code:'constructor'}, 'SECRET']) {
 test('unknown/malformed code is generic '+JSON.stringify(detail),async()=>{
  const result=await requestWith(async()=>new Response(JSON.stringify({detail}),{status:503}));
  assert.deepEqual(await result.json(),{code:'assessment_unavailable'});
  assert.equal(errors.contextErrorMessage(detail.code),'Exercise assessment is unavailable. Check the local service and retry.');
 });
}
test('network error is generic and retains service refusal',async()=>{
 const result=await requestWith(async()=>{throw Error('SECRET host token');});
 assert.equal(result.status,503);assert.deepEqual(await result.json(),{code:'assessment_unavailable'});
});
