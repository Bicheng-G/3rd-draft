import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Store } from '../src/store.mjs';
import { AssetService, normalizeImage } from '../src/assets.mjs';
import { CreativeService } from '../src/service.mjs';
import { SkillLibrary } from '../src/skills.mjs';
import { exportProject, restoreProject } from '../src/backup.mjs';
import { hash, id } from '../src/common.mjs';

const root=path.resolve('.workbench/brand-logo-tests');mkdirSync(root,{recursive:true});
const visual=await sharp({create:{width:400,height:400,channels:4,background:'#123456'}}).png().toBuffer();
const logoBytes=await sharp({create:{width:100,height:30,channels:4,background:'#dd2200'}}).png().toBuffer();
async function fixture(t) {
  const directory=mkdtempSync(path.join(root,'case-')),store=new Store(directory),assets=new AssetService(store);
  const project=store.createProject({name:'Synthetic brand'}),other=store.createProject({name:'Other brand'});
  const concept=store.addConcept(project.id,{title:'Pause',angle:'Quiet',body:'Read a book.',visualDirection:'A desk',rationale:'A pause'});
  const set=store.createSet(project.id,{name:'Post',mode:'organic',brief:{goal:'Read'},conceptIds:[concept.id]});
  const runtime={calls:[],inspections:0,async inspect(){this.inspections++;return {available:true,route:'codex-native',billing:'subscription'};},async generate(input){this.calls.push(input);input.onDispatch({ordinal:1,actionId:input.actionId,endpoint:'images/generations',route:'codex-native',billing:'subscription'});return {image:visual,metadata:{nativeFileVerified:true,nativeArtifactHash:hash(visual)}};}};
  const service=new CreativeService(store,{}, {assets,imageRuntime:runtime});
  const input=extra=>({requestId:id(),setId:set.id,conceptId:concept.id,referenceAssetIds:[],...extra});
  const importLogo=(projectId=project.id,bytes=logoBytes)=>assets.import(projectId,{name:'Official logo',source:'Synthetic fixture',role:'logo',base64:bytes.toString('base64')});
  const produce=async extra=>{const run=await service.startProduction(project.id,input(extra));await service.idle();const saved=store.record('runs',project.id,run.id);assert.equal(saved.status,'succeeded',JSON.stringify(saved.error));return store.record('assets',project.id,saved.assetId);};
  t.after(async()=>{await service.idle();store.close();assert.ok(directory.startsWith(root+path.sep));rmSync(directory,{recursive:true,force:true});});
  return {directory,store,assets,project,other,concept,set,runtime,service,input,importLogo,produce};
}

test('missing or foreign official logo blocks before any native inspection; selection is explicit and project scoped',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.service.startProduction(f.project.id,f.input()),{code:'brand_logo_required'});
  const logo=await f.importLogo();
  await assert.rejects(f.service.startProduction(f.project.id,f.input()),{code:'brand_logo_required'});
  const foreign=await f.importLogo(f.other.id);
  assert.throws(()=>f.assets.designateLogo(f.project.id,foreign.id),{code:'not_found'});
  const visualAsset=f.assets.save(f.project.id,await normalizeImage(visual),{name:'Not a logo',method:'imported',role:'reference',parentId:null});
  assert.throws(()=>f.assets.designateLogo(f.project.id,visualAsset.id),{code:'invalid_logo'});
  assert.equal(f.runtime.inspections,0);assert.equal(f.runtime.calls.length,0);
  f.assets.designateLogo(f.project.id,logo.id);
  assert.equal(f.assets.brandLogo(f.project.id).id,logo.id);
  assert.equal(f.assets.brandLogo(f.other.id),null);
});

test('native output contains exact resized official pixels; edits use the unbranded source and current logo, retaining old bytes',async t=>{
  const f=await fixture(t),logo=await f.importLogo();f.assets.designateLogo(f.project.id,logo.id);
  const first=await f.produce(),original=f.assets.read(f.project.id,first.id);
  assert.equal(first.branding.logoId,logo.id);assert.equal(first.snapshot.logo.artifactHash,logo.artifactHash);
  assert.deepEqual(f.store.assetLineage(f.project.id,first).dependencyAssetIds,[logo.id]);
  const {left,top,width,height}=first.branding.placement;
  const actual=await sharp(original).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();
  const expected=await sharp(logoBytes).resize(width,height,{fit:'fill'}).flatten({background:'#ffffff'}).ensureAlpha().raw().toBuffer();
  assert.deepEqual(actual,expected);assert.deepEqual(f.assets.readProductionSource(f.project.id,first.id),visual);
  const nextBytes=await sharp({create:{width:60,height:60,channels:4,background:'#008800'}}).png().toBuffer();
  const nextLogo=await f.importLogo(f.project.id,nextBytes);f.assets.designateLogo(f.project.id,nextLogo.id);
  const second=await f.produce({parentAssetId:first.id,instruction:'Warmer light'});
  assert.deepEqual(f.runtime.calls[1].images,[visual]);assert.equal(second.branding.logoId,nextLogo.id);
  assert.equal(second.parentId,first.id);assert.deepEqual(f.assets.read(f.project.id,first.id),original);
  const caption=await f.assets.caption(f.project.id,second.id,{caption:'A new caption'});
  assert.deepEqual(f.assets.readProductionSource(f.project.id,caption.id),visual);
  assert.equal(caption.branding.logoId,nextLogo.id);
  await f.produce({parentAssetId:caption.id,instruction:'Cooler light'});
  assert.deepEqual(f.runtime.calls[2].images,[visual]);
});

test('official logo is frozen before async inspection and never submitted as a native reference',async t=>{
  const f=await fixture(t),logo=await f.importLogo();f.assets.designateLogo(f.project.id,logo.id);
  await assert.rejects(f.service.startProduction(f.project.id,f.input({referenceAssetIds:[logo.id]})),{code:'invalid_logo_reference'});
  let release;f.runtime.inspect=()=>new Promise(resolve=>{release=()=>resolve({available:true,route:'codex-native',billing:'subscription'});});
  const pending=f.service.startProduction(f.project.id,f.input());
  const next=await f.importLogo();f.assets.designateLogo(f.project.id,next.id);release();
  const run=await pending;await f.service.idle();
  const saved=f.store.record('assets',f.project.id,f.store.record('runs',f.project.id,run.id).assetId);
  assert.equal(saved.branding.logoId,logo.id);assert.equal(f.runtime.calls[0].images.length,0);
});

test('private backup and fresh restore retain official selection, source pixels, caption editability and lineage',async t=>{
  const f=await fixture(t),logo=await f.importLogo();f.assets.designateLogo(f.project.id,logo.id);
  const first=await f.produce(),caption=await f.assets.caption(f.project.id,first.id,{caption:'Keep reading'});
  const skills=new SkillLibrary(f.store),archive=exportProject(f.store,skills,f.project.id);
  const destination=path.join(f.directory,'restored');
  restoreProject(archive,destination);
  const restored=new Store(destination);try{
    const assets=new AssetService(restored);
    assert.equal(assets.brandLogo(f.project.id).id,logo.id);
    assert.deepEqual(assets.readProductionSource(f.project.id,caption.id),visual);
    assert.deepEqual(assets.read(f.project.id,first.id),f.assets.read(f.project.id,first.id));
    assert.deepEqual(restored.assetLineage(f.project.id,caption).dependencyAssetIds,[logo.id]);
  }finally{restored.close();}
});

test('missing source pixels block edits and backup without another provider call',async t=>{
  const f=await fixture(t),logo=await f.importLogo();f.assets.designateLogo(f.project.id,logo.id);
  const first=await f.produce();
  writeFileSync(f.store.safePath(first.productionSource.artifactPath),'corrupt source');
  await assert.rejects(f.service.startProduction(f.project.id,f.input({parentAssetId:first.id,instruction:'Warmer'})),{code:'invalid_archive'});
  assert.equal(f.runtime.calls.length,1);
  assert.throws(()=>exportProject(f.store,new SkillLibrary(f.store),f.project.id));
});

test('adoption requires human brand-mark check and a changed logo invalidates final delivery without rewriting history',async t=>{
  const f=await fixture(t),logo=await f.importLogo();f.assets.designateLogo(f.project.id,logo.id);
  const first=await f.produce(),original=f.assets.read(f.project.id,first.id);
  const review={id:id(),assetId:first.id,snapshot:f.assets.reviewContext(f.project.id,first.id),summary:'Synthetic review',issues:[]};
  f.store.db.prepare('INSERT INTO reviews VALUES (?,?,?,?)').run(review.id,f.project.id,first.id,JSON.stringify(review));
  const decision={targetType:'asset',targetId:first.id,decision:'adopted'};
  assert.throws(()=>f.assets.adopt(f.project.id,decision),{code:'adoption_blocked'});
  f.assets.adopt(f.project.id,{...decision,brandMarksChecked:true});
  assert.ok(f.assets.export(f.project.id,f.set.id).length);
  const next=await f.importLogo();f.assets.designateLogo(f.project.id,next.id);
  assert.equal(f.assets.adoptionIssues(f.project.id,first.id).some(item=>item.code==='logo_changed'),true);
  assert.throws(()=>f.assets.export(f.project.id,f.set.id),{code:'stale_delivery'});
  assert.deepEqual(f.assets.read(f.project.id,first.id),original);
});

test('review receives the actual official logo and branding provenance alongside the work image',async t=>{
  const f=await fixture(t),logo=await f.importLogo();f.assets.designateLogo(f.project.id,logo.id);
  const asset=await f.produce();
  const context=f.service.context(f.project.id,{taskType:'review_asset',assetId:asset.id,goal:'Review brand fidelity',language:'English'});
  assert.deepEqual(context.imageIds,[asset.id,logo.id]);
  const entry=context.entries.find(item=>item.kind==='asset');
  assert.equal(JSON.parse(entry.content).branding.logoHash,logo.artifactHash);
  assert.ok(context.entries.find(item=>item.id===logo.id).reason.includes('official logo'));
});
