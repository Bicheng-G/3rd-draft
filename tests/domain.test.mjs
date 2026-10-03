import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { CreativeService } from '../src/service.mjs';
import { buildContext, skill } from '../src/context.mjs';
import { hash, id } from '../src/common.mjs';

const testRoot=path.resolve('.workbench/tests');mkdirSync(testRoot,{recursive:true});
const ownedDirs=[];
after(()=>{for(const dir of ownedDirs){assert.ok(dir.startsWith(testRoot+path.sep));rmSync(dir,{recursive:true,force:true});}});
function directory(t) {const dir=mkdtempSync(path.join(testRoot,'domain-'));ownedDirs.push(dir);return dir;}
function fixture(t) {const dir=directory(t);const store=new Store(dir);t.after(()=>store.close());const a=store.createProject({name:'Synthetic A'});const b=store.createProject({name:'Synthetic B'});return {store,a,b,dir};}
function note(store,p,content,kind='brand',extra={}) {return store.addKnowledge(p,{kind,title:content.slice(0,50),content,source:'synthetic test fixture',tags:['commute'],...extra});}
function output(context,body='Take a calm commute.') {return {title:'A calmer commute',insight:'A quiet start may matter.',theme:'Departure rituals',angle:'Everyday ritual',body,visualDirection:'A person at a bus stop',rationale:'Based on selected context.',usedContextIds:context.entries.map(e=>e.id),assumptions:[]};}
class FakeRuntime {
  calls=0;
  async inspect(){return {available:true,billing:'subscription',route:'test-double',version:'fixture',usage:null};}
  async generate({prompt}) {this.calls++;const context=JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1));return {output:output(context),usage:null,metadata:{testDouble:true}};}
}

test('confirmed versions remain immutable; unconfirmed and superseded values are excluded',t=>{
  const {store,a}=fixture(t);
  const draft=note(store,a.id,'Never promise a guaranteed arrival.');
  const unconfirmed=buildContext(store,a.id,{goal:'Write a commute post',language:'en'});
  assert.equal(unconfirmed.entries.length,0);
  const first=store.confirmKnowledge(a.id,draft.id);
  const revised=note(store,a.id,'Never promise a guaranteed arrival or a discount.','brand',{previousId:first.id});
  assert.deepEqual(buildContext(store,a.id,{goal:'commute',language:'en'}).entries.map(e=>e.id),[first.id]);
  const second=store.confirmKnowledge(a.id,revised.id);
  const context=buildContext(store,a.id,{goal:'commute',language:'en'});
  assert.deepEqual(context.entries.map(e=>e.id),[second.id]);
  assert.equal(store.record('knowledge',a.id,first.id).content,'Never promise a guaranteed arrival.');
  assert.equal(store.record('knowledge',a.id,draft.id).status,'draft');
  assert.equal(store.confirmKnowledge(a.id,revised.id).id,second.id);
  assert.throws(()=>store.confirmKnowledge(a.id,note(store,a.id,'Observation','reference').id),e=>e.code==='invalid_input');
});

test('context uses relevant records and excludes foreign IDs and unrelated feedback',async t=>{
  const {store,a,b}=fixture(t);const runtime=new FakeRuntime();const service=new CreativeService(store,runtime);
  const fact=store.confirmKnowledge(a.id,note(store,a.id,'This service supports shared commutes.').id);
  const unrelated=note(store,a.id,'An orchid flowers annually.','reference',{title:'Orchid care',tags:['orchid']});
  const relevant=note(store,a.id,'Commuters enjoy quiet departure rituals.','reference');
  const foreign=store.confirmKnowledge(b.id,note(store,b.id,'PROJECT_B_CANARY_REDACTED').id);
  const run=await service.start(a.id,{goal:'Draft a shared commute caption',language:'en',requestId:id()});await service.idle();
  const source=store.record('runs',a.id,run.id).conceptId;
  const feedback=store.addFeedback(a.id,{targetId:source,scope:'concept',content:'Focus on packing a book, avoid speed.',tags:[]});
  const continued=service.context(a.id,{goal:'Develop this into another post',language:'en',sourceConceptId:source});
  assert.ok(continued.entries.some(e=>e.id===feedback.id));
  assert.ok(continued.entries.some(e=>e.id===source));
  assert.ok(continued.entries.some(e=>e.id===fact.id));
  assert.ok(continued.entries.some(e=>e.id===relevant.id));
  assert.ok(continued.omitted.some(e=>e.id===unrelated.id));
  assert.ok(!JSON.stringify(continued).includes(foreign.id));
  assert.ok(!JSON.stringify(continued).includes('PROJECT_B_CANARY'));
  const fresh=service.context(a.id,{goal:'A new commute angle',language:'en'});
  assert.ok(!fresh.entries.some(e=>e.id===feedback.id));
  assert.throws(()=>service.context(b.id,{goal:'continue',language:'en',sourceConceptId:source}),e=>e.code==='not_found');
  assert.throws(()=>store.favorite(b.id,source,true),e=>e.code==='not_found');
  assert.throws(()=>store.addFeedback(b.id,{targetId:source,scope:'project',content:'x'}),e=>e.code==='not_found');
  assert.throws(()=>store.readArtifact(b.id,source),e=>e.code==='not_found');
  assert.equal(store.snapshot(a.id).knowledge.filter(k=>k.status==='confirmed').length,1);
  assert.equal(continued.skill.hash,hash(skill.content));
});

test('archive, favorite, scoped feedback and context survive a process-equivalent store reopen',async t=>{
  const dir=directory(t);let store=new Store(dir);const runtime=new FakeRuntime();let service=new CreativeService(store,runtime);
  const p=store.createProject({name:'Restart fixture'});
  const first=await service.start(p.id,{goal:'A commute caption',language:'en',requestId:id()});await service.idle();
  const source=store.record('runs',p.id,first.id).conceptId;
  const original=store.record('concepts',p.id,source);const originalFile=store.readArtifact(p.id,source);
  store.favorite(p.id,source,true);const feedback=store.addFeedback(p.id,{targetId:source,scope:'concept',content:'Use a book ritual.',tags:[]});
  store.close();store=new Store(dir);t.after(()=>store.close());service=new CreativeService(store,runtime);service.recover();
  assert.equal(store.snapshot(p.id).concepts[0].favorite,true);
  const second=await service.start(p.id,{goal:'Develop another version',language:'en',sourceConceptId:source,requestId:id()});await service.idle();
  const saved=store.record('runs',p.id,second.id);const concept=store.record('concepts',p.id,saved.conceptId);
  assert.equal(saved.status,'succeeded');assert.equal(concept.parentId,source);assert.equal(concept.ideaId,original.ideaId);
  assert.ok(saved.context.entries.some(e=>e.id===feedback.id));
  assert.deepEqual(store.record('concepts',p.id,source),original);
  assert.deepEqual(store.readArtifact(p.id,source),originalFile);
  assert.equal(runtime.calls,2);assert.equal(hash(store.readArtifact(p.id,concept.id)),concept.artifactHash);
  store.favorite(p.id,source,false);assert.equal(store.snapshot(p.id).concepts.length,2);
});

test('common instruction words alone do not retrieve unrelated sources',t=>{
  const {store,a}=fixture(t);
  const relevant=store.addEvidence(a.id,{title:'Reading ritual',observation:'A book waits beside the chair.',tags:['reading']});
  const unrelated=store.addEvidence(a.id,{title:'Documentation domain',observation:'This domain is for use in documentation examples. It is not a service.'});
  const context=buildContext(store,a.id,{goal:'Develop a reading ritual. Use a book as the cue.',language:'English'});
  assert.ok(context.entries.some(entry=>entry.id===relevant.id));
  assert.ok(!context.entries.some(entry=>entry.id===unrelated.id),'The generic word use is not evidence of topic relevance.');
});

test('request id prevents duplicate dispatch and conflicts are explicit',async t=>{
  const {store,a}=fixture(t);const runtime=new FakeRuntime();const service=new CreativeService(store,runtime);
  const input={goal:'commute',language:'en',requestId:id()};const one=await service.start(a.id,input);await service.idle();
  const two=await service.start(a.id,input);assert.equal(one.id,two.id);assert.equal(runtime.calls,1);
  await assert.rejects(service.start(a.id,{...input,goal:'different'}),e=>e.code==='request_conflict');
});

test('concurrent dispatch is bounded before asynchronous connection inspection',async t=>{
  const {store,a}=fixture(t);const runtime=new FakeRuntime();let release;
  runtime.inspect=()=>new Promise(resolve=>{release=()=>resolve({available:true,billing:'subscription',route:'test',version:'test'});});
  const service=new CreativeService(store,runtime);const first=service.start(a.id,{goal:'commute',language:'en',requestId:id()});
  await assert.rejects(service.start(a.id,{goal:'commute',language:'en',requestId:id()}),e=>e.code==='busy');release();await first;await service.idle();assert.equal(runtime.calls,1);
});

test('invalid provider references never become an archived success',async t=>{
  const {store,a}=fixture(t);const runtime=new FakeRuntime();const usage={input_tokens:123,output_tokens:45};runtime.generate=async()=>({output:{...output({entries:[]}),usedContextIds:[id()]},usage,metadata:{route:'test-double',receipt:'received-before-rejection'}});
  const service=new CreativeService(store,runtime);const run=await service.start(a.id,{goal:'commute',language:'en',requestId:id()});await service.idle();
  assert.equal(store.record('runs',a.id,run.id).error.code,'invalid_output');assert.equal(store.snapshot(a.id).concepts.length,0);
  assert.deepEqual(store.record('runs',a.id,run.id).usage,usage,'A rejected work product still consumed the reported usage.');
  assert.equal(store.record('runs',a.id,run.id).runtimeMetadata.receipt,'received-before-rejection');
});

test('failed native validation retains its completed-turn receipt without archiving rejected content',async t=>{
  const {store,a}=fixture(t),runtime=new FakeRuntime(),usage={input_tokens:201,output_tokens:37};
  runtime.generate=async()=>{throw Object.assign(new Error('Runtime did not return valid JSON.'),{code:'invalid_output',receipt:{usage,metadata:{route:'test-double',threadId:'completed-invalid-json'}}});};
  const service=new CreativeService(store,runtime),run=await service.start(a.id,{goal:'Reading',language:'English',requestId:id()});await service.idle();
  const saved=store.record('runs',a.id,run.id);assert.equal(saved.status,'failed');assert.equal(saved.error.code,'invalid_output');assert.deepEqual(saved.usage,usage);assert.equal(saved.runtimeMetadata.threadId,'completed-invalid-json');assert.equal(store.snapshot(a.id).concepts.length,0);
});

test('interrupted calls become result_unknown without retry; API route is rejected',async t=>{
  const {store,a}=fixture(t);const runtime=new FakeRuntime();const service=new CreativeService(store,runtime);
  const run={id:id(),requestId:id(),requestHash:'fixture',status:'running'};store.insertRun(a.id,run);service.recover();
  assert.equal(store.record('runs',a.id,run.id).status,'result_unknown');assert.equal(runtime.calls,0);
  runtime.inspect=async()=>({available:true,billing:'api',route:'wrong'});
  await assert.rejects(service.start(a.id,{goal:'commute',language:'en',requestId:id()}),e=>e.code==='runtime_unavailable');assert.equal(runtime.calls,0);
});

test('failed archive recovers from saved output, with no additional generation',async t=>{
  const {store,a}=fixture(t);const runtime=new FakeRuntime();const service=new CreativeService(store,runtime);const archive=store.archive.bind(store);
  store.archive=()=>{throw new Error('simulated disk failure');};
  const run=await service.start(a.id,{goal:'commute',language:'en',requestId:id()});await service.idle();
  assert.equal(store.record('runs',a.id,run.id).status,'archiving');assert.equal(store.snapshot(a.id).concepts.length,0);
  store.archive=archive;service.recover();assert.equal(store.record('runs',a.id,run.id).status,'succeeded');assert.equal(runtime.calls,1);
});

test('tampered archive and traversal are rejected',async t=>{
  const {store,a}=fixture(t);const service=new CreativeService(store,new FakeRuntime());
  const run=await service.start(a.id,{goal:'commute',language:'en',requestId:id()});await service.idle();
  const concept=store.record('concepts',a.id,store.record('runs',a.id,run.id).conceptId);
  writeFileSync(store.safePath(concept.artifactPath),'tampered');
  assert.throws(()=>store.readArtifact(a.id,concept.id),e=>e.code==='invalid_archive');
  assert.throws(()=>store.safePath('../outside'),e=>e.code==='unsafe_path');
  assert.throws(()=>store.readArtifact(a.id,'../../outside'),e=>e.code==='not_found');
});

test('database rollback during archival retains recoverable output across restart',async t=>{
  const dir=directory(t);let store=new Store(dir);t.after(()=>store.close());const p=store.createProject({name:'Rollback fixture'});
  const runtime=new FakeRuntime();let service=new CreativeService(store,runtime);const save=store.saveRun.bind(store);let fail=true;
  store.saveRun=(projectId,run)=>{if(run.status==='succeeded'&&fail){fail=false;throw new Error('simulated commit write failure');}return save(projectId,run);};
  const run=await service.start(p.id,{goal:'commute',language:'en',requestId:id()});await service.idle();
  assert.equal(store.record('runs',p.id,run.id).status,'archiving');
  assert.ok(store.record('runs',p.id,run.id).pendingOutput,'validated output must survive a rolled-back archive transaction');
  store.close();store=new Store(dir);service=new CreativeService(store,runtime);service.recover();
  assert.equal(store.record('runs',p.id,run.id).status,'succeeded');assert.equal(store.snapshot(p.id).concepts.length,1);assert.equal(runtime.calls,1);
});
