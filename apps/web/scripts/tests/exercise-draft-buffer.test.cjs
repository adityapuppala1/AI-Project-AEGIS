const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const mod={exports:{}};
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../lib/exercise-draft-buffer.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('module','exports',code)(mod,mod.exports);
const {ExerciseDraftBuffer}=mod.exports;
const id=n=>'22222222-2222-4222-8222-'+String(n).padStart(12,'0');
const setup=()=>{const b=new ExerciseDraftBuffer();b.setScope('operator','agency');return b;};
test('unverified scope and malformed targets cannot retain notes',()=>{
 const b=new ExerciseDraftBuffer();b.write(id(1),'internal_triage','secret');assert.equal(b.read(id(1),'internal_triage'),'');
 b.setScope('operator','agency');b.write('../case','internal_triage','secret');b.write(id(1),'approve','secret');assert.equal(b.read(id(1),'approve'),'');
});
test('case and action changes preserve separate drafts',()=>{
 const b=setup();b.write(id(1),'internal_triage','case one');b.write(id(2),'internal_triage','case two');b.write(id(1),'prepare_warning','warning');
 assert.equal(b.read(id(1),'internal_triage'),'case one');assert.equal(b.read(id(2),'internal_triage'),'case two');assert.equal(b.read(id(1),'prepare_warning'),'warning');
});
test('same verified scope retains notes while subject change clears them',()=>{
 const b=setup();b.write(id(1),'internal_triage','private');assert.equal(b.setScope('operator','agency'),false);assert.equal(b.read(id(1),'internal_triage'),'private');
 assert.equal(b.setScope('other','agency'),true);assert.equal(b.read(id(1),'internal_triage'),'');
});
test('agency change and anonymous state clear notes',()=>{
 const b=setup();b.write(id(1),'internal_triage','private');b.setScope('operator','other');assert.equal(b.read(id(1),'internal_triage'),'');
 b.write(id(1),'internal_triage','private');b.setScope('','');assert.equal(b.read(id(1),'internal_triage'),'');
});
test('note lengths and retained draft count are bounded',()=>{
 const b=setup();b.write(id(1),'internal_triage','x'.repeat(3000));assert.equal(b.read(id(1),'internal_triage').length,2000);
 for(let n=2;n<=11;n++)b.write(id(n),'internal_triage','note');assert.equal(b.read(id(1),'internal_triage'),'');assert.equal(b.read(id(11),'internal_triage'),'note');
});
test('successful-save clearing leaves other drafts intact',()=>{
 const b=setup();b.write(id(1),'internal_triage','one');b.write(id(2),'internal_triage','two');b.write(id(1),'internal_triage','');
 assert.equal(b.read(id(1),'internal_triage'),'');assert.equal(b.read(id(2),'internal_triage'),'two');
});
