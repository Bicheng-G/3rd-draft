import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Store } from '../src/store.mjs';
import { AssetService } from '../src/assets.mjs';
import { buildContext } from '../src/context.mjs';
import { SkillLibrary } from '../src/skills.mjs';
import { exportProject, restoreProject } from '../src/backup.mjs';
import { id, hash } from '../src/common.mjs';
import { zipSync, unzipSync } from 'fflate';

const root=path.resolve('.workbench/tests');mkdirSync(root,{recursive:true});
const idea={title:'Reading pause',angle:'Reading ritual',body:'One quiet page.',visualDirection:'Book by a window.',rationale:'An invitation to read.'};
function fixture(t){const dir=mkdtempSync(path.join(root,'domain-corrections-')),store=new Store(path.join(dir,'source')),project=store.createProject({name:'Synthetic domain corrections'}),other=store.createProject({name:'Other project'}),assets=new AssetService(store);t.after(()=>{store.close();assert.ok(dir.startsWith(root+path.sep));rmSync(dir,{recursive:true,force:true});});return {dir,store,project,other,assets};}
const createSet=(store,project,concept,name)=>store.createSet(project.id,{name,mode:'organic',brief:{goal:'Invite a reading pause'},conceptIds:[concept.id]});
const brand=(store,p,previous)=>store.confirmKnowledge(p,store.addKnowledge(p,{kind:'brand',title:'Price',content:previous?'Price is 30 units.':'Price is 20 units.',source:'Synthetic owner',...(previous?{previousId:previous.id}:{})}).id);

test('concept decisions belong to one set membership and a revised version starts undecided',t=>{
  const {store,project,other}=fixture(t),concept=store.addConcept(project.id,idea),a=createSet(store,project,concept,'A'),b=createSet(store,project,concept,'B');
  const selected=store.select(project.id,{targetType:'concept',targetId:concept.id,setId:a.id,decision:'adopted',reason:'Fits this brief.'});
  store.select(project.id,{targetType:'concept',targetId:concept.id,setId:b.id,decision:'rejected',reason:'Wrong angle for this set.'});
  assert.equal(selected.setId,a.id);
  const state=store.snapshot(project.id);
  assert.equal(state.sets.find(s=>s.id===a.id).conceptSelections[0].decision,'adopted');
  assert.equal(state.sets.find(s=>s.id===b.id).conceptSelections[0].decision,'rejected');
  const revised=store.addConcept(project.id,{...idea,parentId:concept.id,body:'A second page.'});store.addSetConcepts(project.id,a.id,{conceptIds:[revised.id]});
  assert.equal(store.snapshot(project.id).sets.find(s=>s.id===a.id).conceptSelections.find(c=>c.conceptId===revised.id).decision,null);
  assert.throws(()=>store.select(project.id,{targetType:'concept',targetId:concept.id,decision:'adopted'}),e=>e.code==='invalid_input');
  assert.throws(()=>store.select(project.id,{targetType:'concept',targetId:revised.id,setId:b.id,decision:'adopted'}),e=>e.code==='invalid_input');
  const foreign=store.createSet(other.id,{name:'Foreign',mode:'organic',brief:{goal:'Foreign'}});
  assert.throws(()=>store.select(project.id,{targetType:'concept',targetId:concept.id,setId:foreign.id,decision:'adopted'}),e=>e.code==='not_found');
  assert.throws(()=>store.db.prepare('INSERT INTO selections(id,project_id,concept_id,asset_id,payload,set_id) VALUES (?,?,?,?,?,?)').run(id(),project.id,revised.id,null,'{}',b.id),/FOREIGN KEY/);
});

test('manual ideas capture truthful creation provenance and revisions retain older fact context',t=>{
  const {store,project,other}=fixture(t),oldBrand=brand(store,project.id),manual=store.addConcept(project.id,idea);
  assert.equal(manual.runId,null);assert.equal(manual.createdBy,'user');assert.equal(manual.provenance.kind,'manual');
  assert.deepEqual(manual.creationContext.confirmedBrandVersionIds,[oldBrand.id]);assert.deepEqual(manual.usedContextIds,[]);
  const current=brand(store,project.id,oldBrand),revision=store.addConcept(project.id,{...idea,parentId:manual.id});
  assert.equal(revision.provenance.sourceConceptId,manual.id);assert.deepEqual(revision.creationContext.confirmedBrandVersionIds,[current.id]);
  const context=buildContext(store,project.id,{sourceConceptId:revision.id,goal:'Continue reading',language:'English'});
  assert.ok(context.warnings.some(w=>w.code==='brand_context_changed'&&w.oldBrandIds.includes(oldBrand.id)));
  assert.deepEqual(store.record('concepts',project.id,manual.id),manual);
  const foreignEvidence=store.addEvidence(other.id,{title:'Foreign',observation:'Private input.'});
  assert.throws(()=>store.addConcept(project.id,{...idea,evidenceVersionIds:[foreignEvidence.id]}),e=>e.code==='not_found');
});

test('manual edits preserve runtime ancestry context without pretending a model generated the edit',t=>{
  const {store,project}=fixture(t),oldBrand=brand(store,project.id),run={id:id(),requestId:id(),requestHash:hash('request'),status:'archiving',taskType:'ideate',context:{entries:[{id:oldBrand.id,kind:'confirmed_brand'}]}};
  run.pendingOutput={...idea,assumptions:[],usedContextIds:[oldBrand.id],id:id(),ideaId:id(),parentId:null,runId:run.id,createdAt:new Date().toISOString(),createdBy:'runtime',schemaVersion:2};store.insertRun(project.id,run);const original=store.archive(project.id,run);
  brand(store,project.id,oldBrand);const edit=store.addConcept(project.id,{...idea,parentId:original.id});
  assert.equal(edit.runId,null);assert.equal(edit.createdBy,'user');assert.equal(edit.provenance.sourceConceptId,original.id);
  assert.ok(buildContext(store,project.id,{sourceConceptId:edit.id,goal:'Continue reading',language:'English'}).warnings.some(w=>w.code==='brand_context_changed'));
});

test('manual citations reuse fixed insight and evidence versions without silently replacing them',t=>{
  const {store,project}=fixture(t),evidence=store.addEvidence(project.id,{title:'Reading source',observation:'Readers pause.',expiresAt:'2020-01-01T00:00:00Z'});
  const insight=store.addInsight(project.id,{title:'Reading pause',audience:'Readers',content:'A quiet page.',hypothesis:false,evidenceIds:[evidence.id]});
  const concept=store.addConcept(project.id,{...idea,goal:'A personal reading invitation',insightVersionIds:[insight.id],evidenceVersionIds:[evidence.id]});
  const revised=store.addInsight(project.id,{...insight,previousId:insight.id,content:'A newer interpretation.'});
  const context=buildContext(store,project.id,{sourceConceptId:concept.id,goal:'Continue',language:'English'});
  assert.equal(concept.creationContext.goal,'A personal reading invitation');assert.deepEqual(concept.usedContextIds,[insight.id,evidence.id]);
  assert.ok(context.entries.some(e=>e.id===insight.id));assert.ok(context.entries.some(e=>e.id===evidence.id));assert.ok(!context.entries.some(e=>e.id===revised.id));assert.ok(context.warnings.some(w=>w.id===evidence.id));
});

test('composition dependencies are distinct from previous image versions and backup preserves both',async t=>{
  const {store,dir,project,other,assets}=fixture(t),concept=store.addConcept(project.id,idea),set=createSet(store,project,concept,'Images');
  const bytes=await sharp({create:{width:30,height:20,channels:4,background:'#357'}}).png().toBuffer();
  const visual=await assets.import(project.id,{name:'Visual',source:'Synthetic',base64:bytes.toString('base64')}),logo=await assets.import(project.id,{name:'Logo',source:'Synthetic',base64:bytes.toString('base64'),role:'logo'});
  const composed=await assets.compose(project.id,{setId:set.id,conceptId:concept.id,visualId:visual.id,logoId:logo.id,headline:'Read a page',ratio:'1:1'});
  assert.equal(composed.parentId,null);
  const originalBytes=assets.read(project.id,composed.id),edit=await assets.caption(project.id,composed.id,{caption:'Another quiet page.'});
  assert.equal(edit.parentId,composed.id);assert.deepEqual(assets.read(project.id,composed.id),originalBytes);
  assert.deepEqual(store.db.prepare('SELECT reference_id FROM asset_links WHERE asset_id=? ORDER BY reference_id').all(edit.id).map(r=>r.reference_id),[visual.id,logo.id].sort());
  const revisionInput={setId:set.id,conceptId:concept.id,visualId:visual.id,logoId:logo.id,headline:'Read another page',ratio:'1:1',parentAssetId:composed.id};
  const recomposed=await assets.compose(project.id,revisionInput);
  assert.equal(recomposed.parentId,composed.id);assert.notEqual(recomposed.artifactHash,composed.artifactHash);assert.deepEqual(assets.read(project.id,composed.id),originalBytes);
  assert.deepEqual(store.assetLineage(project.id,recomposed),{parentAssetVersionId:composed.id,dependencyAssetIds:[visual.id,logo.id].sort()});
  const foreign=await assets.import(other.id,{name:'Foreign',source:'Synthetic',base64:bytes.toString('base64')}),differentSet=createSet(store,project,concept,'Different set'),differentConcept=store.addConcept(project.id,{...idea,title:'Different concept'});
  store.addSetConcepts(project.id,set.id,{conceptIds:[differentConcept.id]});
  await assert.rejects(assets.compose(project.id,{...revisionInput,parentAssetId:foreign.id}),e=>e.code==='not_found');
  await assert.rejects(assets.compose(project.id,{...revisionInput,setId:differentSet.id}),e=>e.code==='invalid_input');
  await assert.rejects(assets.compose(project.id,{...revisionInput,conceptId:differentConcept.id}),e=>e.code==='invalid_input');
  await assert.rejects(assets.compose(project.id,{...revisionInput,parentAssetId:visual.id}),e=>e.code==='invalid_input');
  store.select(project.id,{targetType:'concept',targetId:concept.id,setId:set.id,decision:'adopted',reason:'Use here.'});
  const archive=exportProject(store,new SkillLibrary(store),project.id),destination=path.join(dir,'restored');restoreProject(archive,destination);const restored=new Store(destination);
  try{assert.deepEqual(restored.snapshot(project.id),store.snapshot(project.id));assert.deepEqual(readFileSync(restored.safePath(composed.artifactPath)),originalBytes);}finally{restored.close();}
});

test('schema 3 backup rejects a scoped decision whose payload omits its set identity before creating a destination',t=>{
  const {store,dir,project}=fixture(t),concept=store.addConcept(project.id,idea),set=createSet(store,project,concept,'Scoped decisions');
  store.select(project.id,{targetType:'concept',targetId:concept.id,setId:set.id,decision:'adopted',reason:'This set only.'});
  const entries=unzipSync(exportProject(store,new SkillLibrary(store),project.id)),records=JSON.parse(Buffer.from(entries['records.json'])),manifest=JSON.parse(Buffer.from(entries['manifest.json']));
  const payload=JSON.parse(records.selections[0].payload);delete payload.setId;records.selections[0].payload=JSON.stringify(payload);
  entries['records.json']=Buffer.from(JSON.stringify(records));manifest.records.bytes=entries['records.json'].length;manifest.records.hash=hash(entries['records.json']);entries['manifest.json']=Buffer.from(JSON.stringify(manifest));
  const destination=path.join(dir,'invalid-scope');assert.throws(()=>restoreProject(Buffer.from(zipSync(entries)),destination),e=>e.code==='invalid_backup');assert.equal(existsSync(destination),false);
});

test('schema 2 migration preserves historical payloads without inventing set decisions or manual context',t=>{
  const dir=mkdtempSync(path.join(root,'domain-legacy-'));let store=new Store(dir);t.after(()=>{store?.close();assert.ok(dir.startsWith(root+path.sep));rmSync(dir,{recursive:true,force:true});});
  const p=store.createProject({name:'Legacy'}),manual=store.addConcept(p.id,idea),set=createSet(store,p,manual,'Historical set');
  const legacyConcept={...manual,schemaVersion:2};delete legacyConcept.creationContext;delete legacyConcept.provenance;
  const payload=JSON.stringify(legacyConcept);store.db.prepare('UPDATE concepts SET payload=? WHERE id=?').run(payload,manual.id);
  const decision={id:id(),targetId:manual.id,targetType:'concept',decision:'adopted',reason:'Historical global judgment.',createdBy:'user',createdAt:new Date().toISOString()};
  store.db.exec('ALTER TABLE selections RENAME TO selections_new; CREATE TABLE selections(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,concept_id TEXT,asset_id TEXT,payload TEXT NOT NULL); DROP TABLE selections_new; PRAGMA user_version=2');
  store.db.prepare('INSERT INTO selections VALUES (?,?,?,?,?)').run(decision.id,p.id,manual.id,null,JSON.stringify(decision));store.close();store=new Store(dir);
  assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,3);assert.equal(store.db.prepare('SELECT payload FROM concepts WHERE id=?').get(manual.id).payload,payload);
  assert.deepEqual(store.rows('selections',p.id),[decision]);assert.equal(store.setConceptSelections(p.id,set.id)[0].decision,null);
  assert.ok(buildContext(store,p.id,{sourceConceptId:manual.id,goal:'Continue reading',language:'English'}).warnings.some(w=>w.code==='source_context_unavailable'));
  const edit=store.addConcept(p.id,{...idea,parentId:manual.id});assert.ok(buildContext(store,p.id,{sourceConceptId:edit.id,goal:'Continue reading',language:'English'}).warnings.some(w=>w.code==='source_context_unavailable'));
  assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('historical composition lineage and schema 2 backup restore preserve raw evidence',async t=>{
  const {store,dir,project,assets}=fixture(t),concept=store.addConcept(project.id,idea),set=createSet(store,project,concept,'Historical');
  const bytes=await sharp({create:{width:3,height:3,channels:4,background:'#357'}}).png().toBuffer(),reference=await assets.import(project.id,{name:'Reference',source:'Synthetic',base64:bytes.toString('base64')});
  const historical=await assets.import(project.id,{name:'Old composition',source:'Synthetic',setId:set.id,conceptId:concept.id,base64:bytes.toString('base64')});
  const legacy={...historical,schemaVersion:2,method:'layered',parentId:reference.id,composition:{visualId:reference.id,logoId:reference.id}};
  const payload=JSON.stringify(legacy);store.db.prepare('UPDATE assets SET parent_id=?,payload=? WHERE id=?').run(reference.id,payload,legacy.id);store.db.prepare('INSERT INTO asset_links VALUES (?,?,?)').run(project.id,legacy.id,reference.id);
  const decision={id:id(),targetId:concept.id,targetType:'concept',decision:'adopted',reason:'Legacy judgment',createdBy:'user',createdAt:new Date().toISOString()};store.db.prepare('INSERT INTO selections VALUES (?,?,?,?,?,?)').run(decision.id,project.id,concept.id,null,JSON.stringify(decision),null);
  const lineage=store.snapshot(project.id).assets.find(a=>a.id===legacy.id).lineage;assert.equal(lineage.parentAssetVersionId,null);assert.equal(lineage.legacyParentId,reference.id);assert.deepEqual(lineage.dependencyAssetIds,[reference.id]);assert.equal(store.db.prepare('SELECT payload FROM assets WHERE id=?').get(legacy.id).payload,payload);
  const edited=await assets.caption(project.id,legacy.id,{caption:'Preserve the original'});assert.equal(edited.parentId,legacy.id);assert.equal(store.assetLineage(project.id,edited).parentAssetVersionId,legacy.id);
  const entries=unzipSync(exportProject(store,new SkillLibrary(store),project.id)),records=JSON.parse(Buffer.from(entries['records.json'])),manifest=JSON.parse(Buffer.from(entries['manifest.json']));
  records.selections.forEach(row=>delete row.set_id);entries['records.json']=Buffer.from(JSON.stringify(records));manifest.schemaVersion=2;manifest.records.bytes=entries['records.json'].length;manifest.records.hash=hash(entries['records.json']);entries['manifest.json']=Buffer.from(JSON.stringify(manifest));
  const destination=path.join(dir,'restored-v2');restoreProject(Buffer.from(zipSync(entries)),destination);const restored=new Store(destination);
  try{assert.equal(restored.db.prepare('SELECT payload FROM assets WHERE id=?').get(legacy.id).payload,payload);assert.deepEqual(restored.rows('selections',project.id),[decision]);assert.equal(restored.setConceptSelections(project.id,set.id)[0].decision,null);assert.deepEqual(restored.snapshot(project.id),store.snapshot(project.id));}finally{restored.close();}
});
