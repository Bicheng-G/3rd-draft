// Read-only acceptance inspection. Run the two browser iterations in the guide first.
// This command never invokes a model or edits a project database.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { hash } from '../src/common.mjs';

const base=process.env.THIRD_DRAFT_URL||'http://127.0.0.1:4057';
const session=await fetch(base+'/api/session');
assert.equal(session.status,200);
const cookie=session.headers.get('set-cookie').split(';')[0];
const {csrfToken}=await session.json();
async function get(route) {const response=await fetch(base+route,{headers:{Cookie:cookie}});assert.equal(response.status,200,route);return response.json();}
async function post(route,value) {return fetch(base+route,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify(value)});}
const projects=await get('/api/projects');
const a=projects.find(p=>p.name==='Harbor Notes · 验收 A');
const b=projects.find(p=>p.name==='Ember Kite · 验收 B');
assert.ok(a&&b,'Create the two named synthetic projects via the browser first.');
const aPath='/api/projects/'+a.id;const bPath='/api/projects/'+b.id;
const state=await get(aPath);const foreign=await get(bPath);
const successful=state.runs.filter(r=>r.status==='succeeded');
assert.equal(successful.length,2,'Acceptance is exactly two successful creative iterations; failures are retained below.');
const [first,second]=successful;
assert.notEqual(first.serviceInstanceId,second.serviceInstanceId,'Restart the service between iterations.');
assert.notEqual(first.runtimeMetadata.threadId,second.runtimeMetadata.threadId,'Fresh runtime sessions are required.');
for(const run of successful){assert.equal(run.route,'codex-native');assert.equal(run.billing,'subscription');assert.deepEqual(run.runtimeMetadata.tools,[]);assert.equal(run.runtimeMetadata.ephemeral,true);assert.ok(run.runtimeMetadata.threadId);const {inputHash,...manifest}=run.context;assert.equal(inputHash,hash(manifest));assert.equal(run.context.skill.hash,hash(run.context.skill.content));}
const old=state.concepts.find(c=>c.id===first.conceptId);const current=state.concepts.find(c=>c.id===second.conceptId);
assert.equal(current.parentId,old.id);assert.equal(current.ideaId,old.ideaId);assert.equal(old.favorite,true);
assert.ok(second.context.entries.some(e=>e.id===old.id&&e.kind==='source_concept'));
const feedback=state.feedback.find(f=>f.targetId===old.id&&f.scope==='concept');assert.ok(feedback);
assert.ok(second.context.entries.some(e=>e.id===feedback.id));
assert.ok(!/pocket of quiet|book|reading ritual/i.test(second.context.goal),'The second goal must not repeat feedback.');
assert.match(current.body,/a pocket of quiet/i);assert.match(current.body,/book/i);assert.match(current.body,/\?\s*$/);
assert.ok(!/a pocket of quiet/i.test(old.body),'The concrete phrase must enter via later feedback.');
const irrelevant=state.knowledge.find(k=>k.title==='Orchid care — irrelevant fixture');assert.ok(irrelevant);
assert.ok(second.context.omitted.some(e=>e.id===irrelevant.id));assert.ok(!second.context.entries.some(e=>e.id===irrelevant.id));
assert.ok(!JSON.stringify(second.context).includes('EMBER_KITE_B_ONLY'));assert.ok(!JSON.stringify(current).includes('EMBER_KITE_B_ONLY'));
assert.ok(foreign.knowledge.some(k=>k.content.includes('EMBER_KITE_B_ONLY')));
const cross=await post(bPath+'/context',{goal:'continue',language:'English',sourceConceptId:old.id});assert.equal(cross.status,404);
assert.equal((await fetch(base+bPath+'/concepts/'+old.id+'/export',{headers:{Cookie:cookie}})).status,404);
const fresh=await post(aPath+'/context',{goal:'Another shared commute social caption',language:'English'});const freshContext=await fresh.json();assert.ok(!freshContext.entries.some(e=>e.id===feedback.id));
const artifacts=[];
for(const concept of [old,current]){const response=await fetch(base+aPath+'/concepts/'+concept.id+'/export',{headers:{Cookie:cookie}});assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(hash(bytes),concept.artifactHash);artifacts.push({id:concept.id,hash:concept.artifactHash,bytes:bytes.length});}
const report={result:'PASS',checkedAt:new Date().toISOString(),checks:['two_native_runs','service_and_session_restart','immutable_context_and_skill_hashes','version_lineage','scoped_feedback_retrieval','semantic_change_without_repeated_feedback','irrelevant_and_foreign_memory_excluded','cross_project_requests_rejected','fresh_task_scope','artifact_hashes'],projects:{a:a.id,b:b.id},allRuns:state.runs.map(r=>({id:r.id,status:r.status,error:r.error,createdAt:r.createdAt,completedAt:r.completedAt,inputHash:r.inputHash,route:r.route,billing:r.billing,runtimeVersion:r.runtimeVersion,usage:r.usage,runtimeMetadata:r.runtimeMetadata,serviceInstanceId:r.serviceInstanceId})),artifacts,firstBody:old.body,feedback:feedback.content,secondGoal:second.context.goal,secondBody:current.body,rationale:current.rationale,selectedIds:second.context.entries.map(e=>e.id),omitted:second.context.omitted,skillHash:second.context.skill.hash};
if(process.env.THIRD_DRAFT_EVIDENCE_PATH)writeFileSync(process.env.THIRD_DRAFT_EVIDENCE_PATH,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
