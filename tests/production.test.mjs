import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Store } from '../src/store.mjs';
import { AssetService } from '../src/assets.mjs';
import { CreativeService } from '../src/service.mjs';
import { id, hash } from '../src/common.mjs';
import { startServer } from '../src/server.mjs';

const root=path.resolve('.workbench/production-tests');mkdirSync(root,{recursive:true});
const idea={title:'A reading pause',angle:'A quiet minute',body:'Bring your book.',visualDirection:'A book on a table',rationale:'A clear invitation'};
const image=await sharp({create:{width:24,height:24,channels:4,background:'#ed7733'}}).png().toBuffer();
class ImageRuntimeDouble {
  calls=[];
  async inspect(){return {available:true,route:'codex-native',billing:'subscription',version:'synthetic-image-runtime'};}
  async generate(input){this.calls.push(input);input.onDispatch({ordinal:1,actionId:input.actionId,endpoint:input.images.length?'images/edits':'images/generations',route:'codex-native',billing:'subscription'});return {image,usage:null,metadata:{nativeFileVerified:true,nativeArtifactHash:hash(image)}};}
}
async function fixture(t,runtime=new ImageRuntimeDouble()){
  const directory=mkdtempSync(path.join(root,'case-')),store=new Store(directory),assets=new AssetService(store);
  const project=store.createProject({name:'Synthetic creative project'}),other=store.createProject({name:'Other private project'});
  const concept=store.addConcept(project.id,idea),set=store.createSet(project.id,{name:'Social post',mode:'organic',brief:{goal:'Invite readers',language:'English'},conceptIds:[concept.id]});
  const logo=await assets.import(project.id,{name:'Official logo',source:'Synthetic test',role:'logo',base64:image.toString('base64')});assets.designateLogo(project.id,logo.id);
  const service=new CreativeService(store,{inspect:async()=>({available:false})},{assets,imageRuntime:runtime});
  t.after(async()=>{await service.idle();store.close();assert.ok(directory.startsWith(root+path.sep));rmSync(directory,{recursive:true,force:true});});
  const input=overrides=>({requestId:id(),setId:set.id,conceptId:concept.id,referenceAssetIds:[],...overrides});
  return {directory,store,assets,project,other,concept,set,service,runtime,input,logo};
}

test('explicit generation then edit archives immutable assets, separate reference dependencies and Project Memory',async t=>{
  const f=await fixture(t),reference=await f.assets.import(f.project.id,{name:'Selected',source:'Synthetic reference',base64:image.toString('base64')});
  const generated=await f.service.startProduction(f.project.id,f.input({referenceAssetIds:[reference.id]}));await f.service.idle();
  const firstRun=f.store.record('runs',f.project.id,generated.id),first=f.store.record('assets',f.project.id,firstRun.assetId),original=f.assets.read(f.project.id,first.id);
  assert.equal(firstRun.status,'succeeded');assert.equal(first.method,'native');assert.equal(first.parentId,null);
  assert.deepEqual(f.store.assetLineage(f.project.id,first).dependencyAssetIds,[reference.id,f.logo.id].sort());
  const edited=await f.service.startProduction(f.project.id,f.input({parentAssetId:first.id,instruction:'Make the light warmer.'}));await f.service.idle();
  const editRun=f.store.record('runs',f.project.id,edited.id),second=f.store.record('assets',f.project.id,editRun.assetId);
  assert.equal(editRun.status,'succeeded');assert.equal(second.parentId,first.id);assert.equal(second.change,'instruction_edit');
  assert.deepEqual(f.store.assetLineage(f.project.id,second).dependencyAssetIds,[f.logo.id]);
  assert.deepEqual(f.assets.read(f.project.id,first.id),original);assert.notEqual(first.id,second.id);
  assert.equal(firstRun.pendingOutput,undefined);assert.equal(editRun.pendingOutput,undefined);
  assert.equal(f.store.snapshot(f.project.id).assets.length,4);assert.deepEqual(f.store.rows('selections',f.project.id).filter(s=>s.decision!=='brand_logo'),[]);
  assert.equal(f.runtime.calls[1].images.length,1);assert.equal(hash(f.runtime.calls[1].images[0]),first.productionSource.artifactHash);
  assert.equal(firstRun.dispatchReservations.length,1);assert.equal(firstRun.context.productionSnapshot.references[0].artifactHash,reference.artifactHash);
});

test('cross-project references and forged edit parents fail before runtime inspection or submission',async t=>{
  const f=await fixture(t);let inspected=0;f.runtime.inspect=async()=>{inspected++;throw Error('must not inspect');};
  const foreign=await f.assets.import(f.other.id,{name:'Private',source:'Synthetic foreign',base64:image.toString('base64')}),imported=await f.assets.import(f.project.id,{name:'Imported',source:'Synthetic',base64:image.toString('base64')});
  await assert.rejects(f.service.startProduction(f.project.id,f.input({referenceAssetIds:[foreign.id]})),{code:'not_found'});
  await assert.rejects(f.service.startProduction(f.project.id,f.input({parentAssetId:imported.id,instruction:'Edit'})),{code:'invalid_input'});
  await assert.rejects(f.service.startProduction(f.project.id,f.input({parentAssetId:foreign.id,instruction:'Edit'})),{code:'not_found'});
  assert.equal(inspected,0);assert.equal(f.runtime.calls.length,0);assert.equal(f.store.rows('runs',f.project.id).length,0);
});

test('only explicitly selected references reach runtime and the frozen snapshot survives brief changes',async t=>{
  const f=await fixture(t),selected=await f.assets.import(f.project.id,{name:'Selected',source:'Synthetic',base64:image.toString('base64')}),unselected=await f.assets.import(f.project.id,{name:'Unselected',source:'Synthetic',base64:image.toString('base64')});
  f.store.reviseBrief(f.project.id,f.set.id,{goal:'Original goal',assetIds:[unselected.id]});
  let release;f.runtime.inspect=()=>new Promise(resolve=>{release=()=>resolve({available:true,route:'codex-native',billing:'subscription'});});
  const pending=f.service.startProduction(f.project.id,f.input({referenceAssetIds:[selected.id]}));
  f.store.reviseBrief(f.project.id,f.set.id,{goal:'Later goal',assetIds:[]});release();const run=await pending;await f.service.idle();
  assert.equal(f.runtime.calls[0].images.length,1);assert.equal(hash(f.runtime.calls[0].images[0]),selected.artifactHash);
  assert.equal(f.runtime.calls[0].projectDirectory,path.join(f.directory,'projects',f.project.id));
  assert.equal(run.context.productionSnapshot.brief.goal,'Original goal');
  assert.deepEqual(run.context.productionSnapshot.references.map(ref=>ref.id),[selected.id]);
  assert.equal(f.runtime.calls[0].prompt.includes('Later goal'),false);
});

test('request replay never submits again and dispatch reservations are durable and capped at two',async t=>{
  const f=await fixture(t);let forwarded=0;
  f.runtime.generate=async input=>{f.runtime.calls.push(input);for(let ordinal=1;ordinal<=3;ordinal++){
    input.onDispatch({ordinal,actionId:input.actionId,endpoint:'images/generations',route:'codex-native',billing:'subscription'});
    assert.equal(f.store.record('runs',f.project.id,input.actionId).dispatchReservations.length,ordinal);forwarded++;
  }return {image};};
  const command=f.input(),run=await f.service.startProduction(f.project.id,command);await f.service.idle();
  assert.equal(forwarded,2);assert.equal(f.store.record('runs',f.project.id,run.id).status,'result_unknown');
  const replay=await f.service.startProduction(f.project.id,command);assert.equal(replay.id,run.id);assert.equal(f.runtime.calls.length,1);
  await assert.rejects(f.service.startProduction(f.project.id,{...command,instruction:'Different'}),{code:'request_conflict'});
  assert.equal(f.store.rows('assets',f.project.id).filter(a=>a.role!=='logo').length,0);
});

test('pause, shared task ownership and cancellation prevent additional dispatch',async t=>{
  const f=await fixture(t);f.service.pause(true);await assert.rejects(f.service.startProduction(f.project.id,f.input()),{code:'paused'});f.service.pause(false);
  let finish;f.runtime.generate=async input=>{f.runtime.calls.push(input);return new Promise((resolve,reject)=>{finish=()=>{try{input.onDispatch({ordinal:1,actionId:input.actionId,endpoint:'images/generations',route:'codex-native',billing:'subscription'});resolve({image});}catch(error){reject(error);}};});};
  const run=await f.service.startProduction(f.project.id,f.input());
  await assert.rejects(f.service.start(f.project.id,{requestId:id(),goal:'Read',language:'English'}),{code:'busy'});
  f.service.cancel(f.project.id,run.id);finish();await f.service.idle();
  assert.equal(f.store.record('runs',f.project.id,run.id).status,'cancelled');assert.equal(f.store.record('runs',f.project.id,run.id).dispatchReservations.length,0);
});

test('archive recovery retries local persistence only and preserves fixed image identity',async t=>{
  const f=await fixture(t),archive=f.store.archive.bind(f.store);let fail=true;
  f.store.archive=(...args)=>{if(fail)throw Error('Synthetic disk failure');return archive(...args);};
  const run=await f.service.startProduction(f.project.id,f.input());await f.service.idle();
  const pending=f.store.record('runs',f.project.id,run.id);assert.equal(pending.status,'archiving');assert.ok(pending.pendingOutput.record.id);
  fail=false;f.service.recover();const completed=f.store.record('runs',f.project.id,run.id);
  assert.equal(completed.status,'succeeded');assert.equal(completed.assetId,pending.pendingOutput.record.id);assert.equal(completed.pendingOutput,undefined);assert.equal(f.runtime.calls.length,1);
  assert.equal(hash(readFileSync(f.store.safePath(f.store.record('assets',f.project.id,completed.assetId).artifactPath))),f.store.record('assets',f.project.id,completed.assetId).artifactHash);
  f.service.recover();assert.equal(f.store.rows('assets',f.project.id).filter(a=>a.role!=='logo').length,1);
});

test('invalid returned image bytes cannot create an asset or report success',async t=>{
  const f=await fixture(t),invalid=Buffer.from('not an image');f.runtime.generate=async input=>{input.onDispatch({ordinal:1,actionId:input.actionId,endpoint:'images/generations',route:'codex-native',billing:'subscription'});return {image:invalid,metadata:{nativeFileVerified:true,nativeArtifactHash:hash(invalid)}};};
  const run=await f.service.startProduction(f.project.id,f.input());await f.service.idle();
  assert.equal(f.store.record('runs',f.project.id,run.id).status,'failed');assert.equal(f.store.rows('assets',f.project.id).filter(a=>a.role!=='logo').length,0);
});

test('valid provider bytes without verified native file evidence cannot become a successful native asset',async t=>{
  const f=await fixture(t);f.runtime.generate=async input=>{input.onDispatch({ordinal:1,actionId:input.actionId,endpoint:'images/generations',route:'codex-native',billing:'subscription'});return {image,metadata:{nativeFileVerified:false}};};
  const run=await f.service.startProduction(f.project.id,f.input());await f.service.idle();
  const saved=f.store.record('runs',f.project.id,run.id);assert.equal(saved.status,'failed');assert.equal(saved.error.code,'invalid_output');
  assert.equal(f.store.rows('assets',f.project.id).filter(a=>a.role!=='logo').length,0);
});

test('native prompt byte limits reject oversized selected methods before run creation or capability inspection',async t=>{
  const f=await fixture(t);let inspections=0;f.runtime.inspect=async()=>{inspections++;return {available:true,route:'codex-native',billing:'subscription'};};
  f.service.skills={selected:()=>[{name:'Synthetic long method',content:'x'.repeat(64*1024),references:[]}]};
  await assert.rejects(f.service.startProduction(f.project.id,f.input()),{code:'context_limit'});
  assert.equal(inspections,0);assert.equal(f.store.rows('runs',f.project.id).length,0);assert.equal(f.runtime.calls.length,0);
});

test('a failed archive transaction recovers the exact already-written file without a second provider call',async t=>{
  const f=await fixture(t),save=f.store.saveRun.bind(f.store);let fail=true;
  f.store.saveRun=(projectId,run)=>{if(run.status==='succeeded'&&fail){fail=false;throw Error('Synthetic transaction failure');}return save(projectId,run);};
  const started=await f.service.startProduction(f.project.id,f.input());await f.service.idle();
  const pending=f.store.record('runs',f.project.id,started.id),filename=f.store.safePath(pending.pendingOutput.record.artifactPath),bytes=readFileSync(filename);
  assert.equal(pending.status,'archiving');assert.equal(f.store.rows('assets',f.project.id).filter(a=>a.role!=='logo').length,0);
  f.service.recover();const completed=f.store.record('runs',f.project.id,started.id);
  assert.equal(completed.status,'succeeded');assert.deepEqual(readFileSync(filename),bytes);assert.equal(f.runtime.calls.length,1);
});

test('native caption revisions retain dependencies and remain valid instruction-edit sources',async t=>{
  const f=await fixture(t),reference=await f.assets.import(f.project.id,{name:'Selected',source:'Synthetic',base64:image.toString('base64')});
  const started=await f.service.startProduction(f.project.id,f.input({referenceAssetIds:[reference.id]}));await f.service.idle();
  const generated=f.store.record('runs',f.project.id,started.id),caption=await f.assets.caption(f.project.id,generated.assetId,{caption:'Updated caption'});
  assert.deepEqual(f.store.assetLineage(f.project.id,caption).dependencyAssetIds,[reference.id,f.logo.id].sort());
  const edited=await f.service.startProduction(f.project.id,f.input({parentAssetId:caption.id,instruction:'Warm light'}));await f.service.idle();
  assert.equal(f.store.record('assets',f.project.id,f.store.record('runs',f.project.id,edited.id).assetId).parentId,caption.id);
});

test('a native edit source cannot be reassigned to a different set or idea version',async t=>{
  const f=await fixture(t),started=await f.service.startProduction(f.project.id,f.input());await f.service.idle();
  const parentAssetId=f.store.record('runs',f.project.id,started.id).assetId;
  const otherSet=f.store.createSet(f.project.id,{name:'Different set',mode:'paid',brief:{goal:'Another goal'},conceptIds:[f.concept.id]});
  await assert.rejects(f.service.startProduction(f.project.id,f.input({parentAssetId,instruction:'Warm light',setId:otherSet.id})),{code:'invalid_input'});
  const otherConcept=f.store.addConcept(f.project.id,{...idea,title:'A different idea'});f.store.addSetConcepts(f.project.id,f.set.id,{conceptIds:[otherConcept.id]});
  await assert.rejects(f.service.startProduction(f.project.id,f.input({parentAssetId,instruction:'Warm light',conceptId:otherConcept.id})),{code:'invalid_input'});
  assert.equal(f.runtime.calls.length,1);assert.equal(f.store.rows('runs',f.project.id).length,1);
});

test('late validated cancellation result is archived without adoption and post-dispatch interruption stays unknown',async t=>{
  const f=await fixture(t);let finish;
  f.runtime.generate=async input=>{input.onDispatch({ordinal:1,actionId:input.actionId,endpoint:'images/generations',route:'codex-native',billing:'subscription'});return new Promise(resolve=>{finish=()=>resolve({image,metadata:{nativeFileVerified:true,nativeArtifactHash:hash(image)}});});};
  const started=await f.service.startProduction(f.project.id,f.input());f.service.cancel(f.project.id,started.id);finish();await f.service.idle();
  const late=f.store.record('runs',f.project.id,started.id);assert.equal(late.status,'succeeded');assert.ok(late.cancelRequestedAt);assert.equal(f.store.rows('selections',f.project.id).filter(s=>s.decision!=='brand_logo').length,0);
  f.runtime.generate=async input=>{input.onDispatch({ordinal:1,actionId:input.actionId,endpoint:'images/generations',route:'codex-native',billing:'subscription'});throw Object.assign(Error('Transport lost after dispatch'),{code:'result_unknown'});};
  const unknown=await f.service.startProduction(f.project.id,f.input());await f.service.idle();
  assert.equal(f.store.record('runs',f.project.id,unknown.id).status,'result_unknown');assert.equal(f.store.rows('assets',f.project.id).filter(a=>a.role!=='logo').length,1);
});

test('production HTTP action enforces session authorization and exposes an archived asset through Project Memory',async t=>{
  const directory=mkdtempSync(path.join(root,'http-')),runtime=new ImageRuntimeDouble();
  const app=await startServer({dataDir:directory,port:0,runtime:{inspect:async()=>({available:false})},imageRuntime:runtime});
  t.after(async()=>{await app.close();assert.ok(directory.startsWith(root+path.sep));rmSync(directory,{recursive:true,force:true});});
  const project=app.store.createProject({name:'Synthetic HTTP project'}),concept=app.store.addConcept(project.id,idea),set=app.store.createSet(project.id,{name:'Set',mode:'organic',brief:{goal:'Read'},conceptIds:[concept.id]});
  const assets=new AssetService(app.store),logo=await assets.import(project.id,{name:'Logo',source:'Synthetic test',role:'logo',base64:image.toString('base64')});assets.designateLogo(project.id,logo.id);
  const input={requestId:id(),setId:set.id,conceptId:concept.id,referenceAssetIds:[]},url=`${app.url}/api/projects/${project.id}/production`;
  assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)})).status,401);
  const session=await fetch(app.url+'/api/session'),cookie=session.headers.get('set-cookie').split(';')[0],{csrfToken}=await session.json();
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',cookie,'x-csrf-token':csrfToken},body:JSON.stringify(input)});
  assert.equal(response.status,202);const started=await response.json();await app.service.idle();
  const run=await (await fetch(`${app.url}/api/projects/${project.id}/runs/${started.id}`,{headers:{cookie}})).json();
  assert.equal(run.status,'succeeded');assert.equal(run.pendingOutput,undefined);assert.equal(runtime.calls.length,1);
  const memory=await (await fetch(`${app.url}/api/projects/${project.id}`,{headers:{cookie}})).json();
  assert.equal(memory.assets.find(a=>a.role!=='logo').id,run.assetId);assert.deepEqual(memory.selections.filter(s=>s.decision!=='brand_logo'),[]);
  const layoutUrl=`${app.url}/api/projects/${project.id}/assets/${run.assetId}/logo-layout`;
  const body=JSON.stringify({logoId:logo.id,logoLayout:{mode:'overlay',position:'top-left',widthPercent:20}});
  assert.equal((await fetch(layoutUrl+'/preview',{method:'POST',headers:{'content-type':'application/json'},body})).status,401);
  const headers={cookie,'content-type':'application/json','x-csrf-token':csrfToken};
  const preview=await fetch(layoutUrl+'/preview',{method:'POST',headers,body});assert.equal(preview.status,200);
  const previewData=await preview.json();assert.equal(app.store.rows('assets',project.id).length,2);
  const laidOut=await fetch(layoutUrl,{method:'POST',headers,body});assert.equal(laidOut.status,201);
  const version=await laidOut.json();assert.equal(version.parentId,run.assetId);assert.equal(version.change,'logo_layout');
  assert.equal(version.artifactHash,hash(Buffer.from(previewData.imageBase64,'base64')));assert.equal(runtime.calls.length,1);
});
