import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { unzipSync,strFromU8 } from 'fflate';
import { Store } from '../src/store.mjs';
import { AssetService,normalizeImage } from '../src/assets.mjs';
import { CreativeService } from '../src/service.mjs';
import { buildContext } from '../src/context.mjs';
import { id,hash } from '../src/common.mjs';
import { startServer } from '../src/server.mjs';

const root=path.resolve('.workbench/tests');mkdirSync(root,{recursive:true});
function fixture(t){const dir=mkdtempSync(path.join(root,'v1-')),store=new Store(dir),a=store.createProject({name:'Synthetic A'}),b=store.createProject({name:'Synthetic B'}),assets=new AssetService(store);t.after(()=>{store.close();assert.ok(dir.startsWith(root+path.sep));rmSync(dir,{recursive:true,force:true});});return {store,a,b,assets,dir};}
const idea={title:'A quiet minute',insight:'Reading may be a useful creative reference.',theme:'Reading',angle:'Reading ritual',body:'Bring a book on your commute.',visualDirection:'Book by a window',rationale:'A relatable commute ritual',assumptions:[]};
const brief={goal:'Commute caption',audience:'Readers',objective:'Introduce',offer:'',proof:'',cta:'Read along',theme:'Quiet',caption:'A book',language:'English',prohibitedClaims:'No time savings',style:'Editorial',assetIds:[]};
class Runtime {
  calls=[];
  async inspect(){return {available:true,billing:'subscription',route:'test',version:'fixture',capabilities:{vision_input:{available:true}}};}
  async generate(input){const context=JSON.parse(input.prompt.split('\n').at(-1));this.calls.push({...input,context});
    if(context.taskType==='extract_brand')return {output:{title:'Visible artwork',content:'A plain green rectangle. No price is visible.',unknowns:['Brand identity is not visible.']}};
    if(context.taskType==='review_asset')return {output:{summary:'Needs brand verification.',limitations:['Synthetic fixture'],issues:[{severity:'blocker',category:'brand',explanation:'The logo identity is not confirmed.',suggestedAction:'Verify the supplied logo.'}]}};
    if(context.taskType==='synthesize_insights')return {output:{title:'Reading ritual',audience:'Commuting readers',content:'Reading may provide a useful creative angle.',counterexamples:'Some riders prefer other activities.',hypothesis:true,evidenceIds:context.entries.filter(e=>e.kind==='evidence').map(e=>e.id)}};
    const concepts=Array.from({length:context.count??1},(_,n)=>({...idea,title:`Idea ${n+1}`,usedContextIds:context.entries.map(e=>e.id)}));return {output:concepts.length===1?concepts[0]:{concepts}};
  }
}
async function png(color='#246e45'){return sharp({create:{width:120,height:80,channels:4,background:color}}).png().toBuffer();}

test('six ideas persist independently, fixed favorites and cross-set references survive revisions',async t=>{
  const {store,a,b}=fixture(t),runtime=new Runtime(),service=new CreativeService(store,runtime);
  const run=await service.start(a.id,{requestId:id(),goal:'Commute reading ritual',language:'English',count:6});await service.idle();
  const completed=store.record('runs',a.id,run.id);assert.equal(completed.status,'succeeded');assert.equal(completed.conceptIds.length,6);assert.equal(runtime.calls.length,1);
  const concepts=store.snapshot(a.id).concepts;for(const c of concepts)assert.equal(hash(store.readArtifact(a.id,c.id)),c.artifactHash);
  store.favorite(a.id,concepts[1].id,true,'Save this angle for later');
  const paid=store.createSet(a.id,{name:'Launch',mode:'paid',brief,conceptIds:[concepts[1].id]}),organic=store.createSet(a.id,{name:'Weekly',mode:'organic',brief,conceptIds:[concepts[1].id]});
  const edited=store.addConcept(a.id,{...idea,parentId:concepts[1].id,body:'A revised caption.'});assert.equal(edited.ideaId,concepts[1].ideaId);assert.notEqual(edited.id,concepts[1].id);
  assert.deepEqual(store.setConcepts(a.id,paid.id),[concepts[1].id]);assert.deepEqual(store.setConcepts(a.id,organic.id),[concepts[1].id]);
  assert.equal(store.snapshot(a.id).concepts.find(c=>c.id===concepts[1].id).favoriteReason,'Save this angle for later');
  assert.throws(()=>store.addSetConcepts(b.id,paid.id,{conceptIds:[concepts[1].id]}),e=>e.code==='not_found');
  assert.throws(()=>store.db.prepare('INSERT INTO set_concepts VALUES (?,?,?,?)').run(b.id,paid.id,concepts[1].id,new Date().toISOString()),/FOREIGN KEY/);
  store.favorite(a.id,concepts[1].id,false);assert.equal(store.snapshot(a.id).concepts.length,7);
  store.archiveSet(a.id,paid.id,true);assert.equal(store.snapshot(a.id).concepts.length,7);assert.deepEqual(store.setConcepts(a.id,paid.id),[concepts[1].id]);assert.throws(()=>store.addSetConcepts(a.id,paid.id,{conceptIds:[edited.id]}),e=>e.code==='set_archived');
  store.select(a.id,{targetType:'concept',targetId:concepts[1].id,decision:'archived',reason:'Retain history, stop automatic reuse'});assert.ok(store.snapshot(a.id).concepts.filter(c=>c.ideaId===edited.ideaId).every(c=>c.archived));assert.ok(!buildContext(store,a.id,{goal:'Reading ritual',language:'English'}).entries.some(e=>e.id===edited.id));
});

test('continuing an old idea warns about changed confirmed facts without rewriting its original context',async t=>{
  const {store,a}=fixture(t),service=new CreativeService(store,new Runtime());
  const original=store.confirmKnowledge(a.id,store.addKnowledge(a.id,{kind:'brand',title:'Price',content:'Price is 20 units.',source:'Synthetic owner'}).id);
  const run=await service.start(a.id,{requestId:id(),goal:'Reading product',language:'English'});await service.idle();const saved=store.record('runs',a.id,run.id);
  const draft=store.addKnowledge(a.id,{kind:'brand',title:'Price revision',content:'Price is 30 units.',source:'Synthetic owner',previousId:original.id});
  assert.ok(!service.context(a.id,{goal:'Continue',language:'English',sourceConceptId:saved.conceptId}).warnings.length);
  const current=store.confirmKnowledge(a.id,draft.id),context=service.context(a.id,{goal:'Continue',language:'English',sourceConceptId:saved.conceptId});
  assert.ok(context.warnings.some(w=>w.code==='brand_context_changed'));assert.ok(context.entries.some(e=>e.id===current.id));assert.deepEqual(store.record('runs',a.id,run.id).context,saved.context);
});

test('manual evidence and insight revisions retain exact sources; expiry and scope bound retrieval',async t=>{
  const {store,a,b}=fixture(t),runtime=new Runtime(),service=new CreativeService(store,runtime);
  const evidence=store.addEvidence(a.id,{title:'Commuting readers',url:'https://example.org/source',observation:'Synthetic readers bring paperbacks.',inference:'A ritual angle may resonate.',tags:['commute']});
  const run=await service.start(a.id,{requestId:id(),taskType:'synthesize_insights',goal:'Reading rituals',language:'English',evidenceIds:[evidence.id]});await service.idle();
  assert.equal(runtime.calls.length,1);assert.deepEqual(runtime.calls[0].context.entries.map(e=>e.id),[evidence.id]);
  const original=store.record('insights',a.id,store.record('runs',a.id,run.id).insightId);
  const revised=store.addInsight(a.id,{...original,previousId:original.id,content:'A different interpretation.'});assert.equal(revised.itemId,original.itemId);assert.equal(store.record('insights',a.id,original.id).content,original.content);
  assert.throws(()=>store.addInsight(b.id,{...original}),e=>e.code==='not_found');
  const expired=store.addEvidence(a.id,{title:'Old commute poll',observation:'Synthetic older source',expiresAt:'2020-01-01T00:00:00Z'});
  const expiredInsight=store.addInsight(a.id,{title:'Old reading claim',audience:'Commuting readers',content:'Expired evidence',hypothesis:true,evidenceIds:[expired.id],tags:['commute']});
  const context=buildContext(store,a.id,{goal:'Commuting readers',language:'English'});assert.ok(context.entries.some(e=>e.id===revised.id));assert.ok(context.omitted.some(e=>e.id===expiredInsight.id));assert.ok(!context.entries.some(e=>e.id===original.id));
  assert.equal(runtime.calls.length,1,'retrieval must not research or synthesize implicitly');
});

test('corrupt idea ancestry fails explicitly before any runtime submission instead of looping or dropping parents',async t=>{
  const {store,a}=fixture(t),runtime=new Runtime(),service=new CreativeService(store,runtime);
  const first=store.addConcept(a.id,idea),second=store.addConcept(a.id,{...idea,parentId:first.id});
  const changeParent=parentId=>{const record={...first,parentId};store.db.prepare('UPDATE concepts SET parent_id=?,payload=? WHERE id=?').run(parentId,JSON.stringify(record),first.id);};
  for(const parentId of [first.id,second.id]){
    changeParent(parentId);assert.equal(store.db.prepare('PRAGMA foreign_key_check').all().length,0,'cycles are not rejected by foreign keys alone');
    await assert.rejects(service.start(a.id,{requestId:id(),sourceConceptId:first.id,goal:'Continue reading',language:'English'}),error=>error.code==='invalid_lineage');
  }
  // Also detect a damaged JSON payload that contradicts an otherwise valid SQL link.
  const incomplete={...first,parentId:id()};store.db.prepare('UPDATE concepts SET parent_id=NULL,payload=? WHERE id=?').run(JSON.stringify(incomplete),first.id);
  assert.throws(()=>buildContext(store,a.id,{sourceConceptId:first.id,goal:'Continue reading',language:'English'}),error=>error.code==='invalid_lineage');
  assert.equal(runtime.calls.length,0);assert.equal(store.rows('runs',a.id).length,0);
});

test('archived projects are readable but reject writes; pause is durable and cancel does not retry',async t=>{
  const {store,a}=fixture(t),runtime=new Runtime(),service=new CreativeService(store,runtime);
  service.pause(true);await assert.rejects(service.start(a.id,{requestId:id(),goal:'Book',language:'English'}),e=>e.code==='paused');assert.equal(runtime.calls.length,0);
  service.pause(false);store.archiveProject(a.id,true);assert.equal(store.snapshot(a.id).project.archived,true);assert.throws(()=>store.addConcept(a.id,idea),e=>e.code==='project_archived');
  store.archiveProject(a.id,false);
  runtime.generate=({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('unknown after submission'),{code:'result_unknown'}))));
  const run=await service.start(a.id,{requestId:id(),goal:'Book',language:'English'});service.cancel(a.id,run.id);await service.idle();assert.equal(store.record('runs',a.id,run.id).status,'result_unknown');assert.ok(store.record('runs',a.id,run.id).cancelRequestedAt);
  service.recover();assert.equal(store.snapshot(a.id).concepts.length,0);
});

test('duplicate insight citations cannot strand a valid synthesis in archiving',async t=>{
  const {store,a}=fixture(t),runtime=new Runtime(),service=new CreativeService(store,runtime),e=store.addEvidence(a.id,{title:'Synthetic source',observation:'Readers bring a book.'});
  runtime.generate=async()=>({output:{title:'Reading',audience:'Readers',content:'A ritual',counterexamples:'Not everyone reads',hypothesis:true,evidenceIds:[e.id,e.id]}});
  const run=await service.start(a.id,{requestId:id(),taskType:'synthesize_insights',goal:'Read',language:'English',evidenceIds:[e.id]});await service.idle();
  assert.equal(store.record('runs',a.id,run.id).status,'succeeded');assert.deepEqual(store.rows('insights',a.id)[0].evidenceIds,[e.id]);
});

test('image import fully decodes, rejects spoofed bytes and isolates references',async t=>{
  const {store,a,b,assets}=fixture(t);
  await assert.rejects(normalizeImage(Buffer.from('<svg><image href="file:///secret"/></svg>')),e=>e.code==='invalid_image');
  await assert.rejects(normalizeImage(Buffer.from([137,80,78,71,13,10,26,10])),e=>e.code==='invalid_image');
  const image=await assets.import(a.id,{name:'Reference',source:'Synthetic',base64:(await png()).toString('base64')});
  assert.equal(image.width,120);assert.equal(image.height,80);assert.equal(hash(assets.read(a.id,image.id)),image.artifactHash);
  assert.throws(()=>assets.read(b.id,image.id),e=>e.code==='not_found');
  const copy=await assets.caption(a.id,image.id,{caption:'An independent caption.'});assert.equal(copy.parentId,image.id);assert.equal(copy.artifactHash,image.artifactHash);assert.equal(store.record('assets',a.id,image.id).caption,'');
  writeFileSync(store.safePath(copy.artifactPath),'broken');assert.throws(()=>assets.read(a.id,copy.id),e=>e.code==='invalid_archive');
});

test('layered composition keeps text exact and logo uncropped; overflow/font checks reject bad output',async t=>{
  const {store,a,assets}=fixture(t),concept=store.addConcept(a.id,idea),set=store.createSet(a.id,{name:'Poster',mode:'organic',brief,conceptIds:[concept.id]});
  const visual=await assets.import(a.id,{name:'Visual',source:'Synthetic',base64:(await png()).toString('base64')}),logo=await assets.import(a.id,{name:'Logo',source:'Synthetic',role:'logo',base64:(await png('#ef643b')).toString('base64')});
  const input={setId:set.id,conceptId:concept.id,visualId:visual.id,logoId:logo.id,headline:'A quiet minute',cta:'Bring a book',ratio:'4:5',font:'Arial'};
  const composed=await assets.compose(a.id,input);assert.equal(composed.width,1080);assert.equal(composed.height,1350);assert.equal(composed.composition.headline,input.headline);assert.equal(composed.machineChecks.logoUncropped,true);
  const metadata=await sharp(assets.read(a.id,composed.id)).metadata();assert.equal(metadata.height,1350);
  await assert.rejects(assets.compose(a.id,{...input,headline:'Long headline '.repeat(20)}),e=>e.code==='text_overflow');
  await assert.rejects(assets.compose(a.id,{...input,font:'Not installed'}),e=>e.code==='missing_font');
  const draft=unzipSync(assets.export(a.id,set.id,{draft:true}));assert.ok(draft['manifest.json']);const manifest=JSON.parse(strFromU8(draft['manifest.json']));assert.equal(manifest.kind,'draft_delivery');assert.equal(manifest.assets.length,1);assert.ok(!JSON.stringify(manifest).includes('prohibitedClaims'));
});

test('vision extraction stays draft; model review cannot approve or clear blockers; changed brief invalidates delivery',async t=>{
  const {store,a,assets}=fixture(t),runtime=new Runtime(),service=new CreativeService(store,runtime,{assets}),concept=store.addConcept(a.id,idea),set=store.createSet(a.id,{name:'Set',mode:'paid',brief,conceptIds:[concept.id]});
  const asset=await assets.import(a.id,{name:'Work',source:'Synthetic',setId:set.id,conceptId:concept.id,caption:idea.body,base64:(await png()).toString('base64')});
  const extraction=await service.start(a.id,{requestId:id(),taskType:'extract_brand',assetId:asset.id,goal:'Read visible information',language:'English'});await service.idle();
  const knowledge=store.record('knowledge',a.id,store.record('runs',a.id,extraction.id).knowledgeId);assert.equal(knowledge.status,'draft');assert.equal(knowledge.createdBy,'runtime');assert.equal(runtime.calls[0].images.length,1);
  assert.throws(()=>assets.adopt(a.id,{targetType:'asset',targetId:asset.id,decision:'adopted'}),e=>e.code==='adoption_blocked');
  const reviewRun=await service.start(a.id,{requestId:id(),taskType:'review_asset',assetId:asset.id,goal:'Check the work',language:'English'});await service.idle();const review=store.record('reviews',a.id,store.record('runs',a.id,reviewRun.id).reviewId);
  assert.equal(store.rows('selections',a.id).length,0);assert.throws(()=>assets.adopt(a.id,{targetType:'asset',targetId:asset.id,decision:'adopted'}),e=>e.code==='adoption_blocked');
  assets.resolve(a.id,review.id,{issueId:review.issues[0].id,reason:'Verified against the source logo.'});assets.adopt(a.id,{targetType:'asset',targetId:asset.id,decision:'adopted',reason:'Ready'});
  assert.ok(assets.export(a.id,set.id).length>0);
  const oldBrief=store.record('briefs',a.id,set.currentBriefId),revised=store.reviseBrief(a.id,set.id,{...brief,goal:'New goal'});assert.ok(revised.affectedAssetIds.includes(asset.id));assert.deepEqual(store.record('briefs',a.id,oldBrief.id),oldBrief);
  assert.throws(()=>assets.export(a.id,set.id),e=>e.code==='stale_delivery');
});

test('review context cannot substitute another set and retains feedback on its selected image',async t=>{
  const {store,a,assets}=fixture(t),concept=store.addConcept(a.id,idea),set=store.createSet(a.id,{name:'Original',mode:'paid',brief,conceptIds:[concept.id]}),other=store.createSet(a.id,{name:'Other',mode:'organic',brief:{...brief,goal:'Unrelated goal'},conceptIds:[concept.id]});
  const asset=await assets.import(a.id,{name:'Selected image',source:'Synthetic',setId:set.id,conceptId:concept.id,base64:(await png()).toString('base64')});
  const input={taskType:'review_asset',assetId:asset.id,goal:'Check',language:'English'};
  assert.throws(()=>buildContext(store,a.id,{...input,setId:other.id}),e=>e.code==='invalid_input');
  const feedback=store.addFeedback(a.id,{targetType:'asset',targetId:asset.id,scope:'asset',content:'Keep the visual green.'});
  assert.ok(buildContext(store,a.id,input).entries.some(e=>e.id===feedback.id));
  assert.ok(!buildContext(store,a.id,{goal:'A fresh idea',language:'English'}).entries.some(e=>e.id===feedback.id));
});

test('schema v1 migrates without rewriting archived payloads or weakening project foreign keys',t=>{
  const dir=mkdtempSync(path.join(root,'migration-'));let store;t.after(()=>{store?.close();assert.ok(dir.startsWith(root+path.sep));rmSync(dir,{recursive:true,force:true});});
  const db=new DatabaseSync(path.join(dir,'workbench.sqlite')),p=id(),run=id(),concept=id(),payload=JSON.stringify({...idea,id:concept,legacy:true});
  db.exec('CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE runs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),request_id TEXT NOT NULL,request_hash TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(project_id,id),UNIQUE(project_id,request_id)); CREATE TABLE concepts(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),run_id TEXT NOT NULL UNIQUE,parent_id TEXT,payload TEXT NOT NULL,UNIQUE(project_id,id),FOREIGN KEY(project_id,run_id) REFERENCES runs(project_id,id),FOREIGN KEY(project_id,parent_id) REFERENCES concepts(project_id,id));PRAGMA user_version=1');
  db.prepare('INSERT INTO projects VALUES (?,?,?)').run(p,'Legacy','2026-01-01');db.prepare('INSERT INTO runs VALUES (?,?,?,?,?,?)').run(run,p,id(),'hash','succeeded',JSON.stringify({id:run,status:'succeeded'}));db.prepare('INSERT INTO concepts VALUES (?,?,?,?,?)').run(concept,p,run,null,payload);db.close();
  store=new Store(dir);assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,2);assert.equal(store.db.prepare('SELECT payload FROM concepts WHERE id=?').get(concept).payload,payload);assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(store.project(p).archived,false);
});

test('a rejected second service cannot migrate a database owned by a live process',async t=>{
  const dir=mkdtempSync(path.join(root,'locked-v1-'));t.after(()=>{assert.ok(dir.startsWith(root+path.sep));rmSync(dir,{recursive:true,force:true});});
  let db=new DatabaseSync(path.join(dir,'workbench.sqlite'));db.exec('PRAGMA user_version=1');db.close();writeFileSync(path.join(dir,'service.lock'),String(process.pid));
  await assert.rejects(startServer({dataDir:dir,port:0,runtime:new Runtime()}),/owns this data directory/);
  db=new DatabaseSync(path.join(dir,'workbench.sqlite'));try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,1);}finally{db.close();}
});
