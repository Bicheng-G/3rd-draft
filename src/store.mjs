import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, lstatSync, existsSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import path from 'node:path';
import { AppError, id, now, hash, text, tags, requireId } from './common.mjs';

export function optionalText(value,name,max=2000) { if(value===undefined||value===null||value==='')return '';return text(value,name,max); }
function ids(value,name,max=30) {if(!Array.isArray(value)||value.length>max)throw new AppError('invalid_input',`${name} must be an array of at most ${max} IDs.`);return [...new Set(value.map(requireId))];}
function versionRecord(input,previous,fields) {const record={...fields,id:id(),itemId:previous?.itemId??id(),previousId:previous?.id??null,createdAt:now(),createdBy:input.createdBy==='runtime'?'runtime':'user',schemaVersion:2};return {...record,contentHash:hash(record)};}
export function safeDataPath(dataDir,relative='') {
  const root=path.resolve(dataDir),target=path.resolve(root,relative);
  if(target!==root&&!target.startsWith(root+path.sep))throw new AppError('unsafe_path','The file path is outside the data directory.');
  let current=path.parse(target).root;
  for(const part of target.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw new AppError('unsafe_path','Symbolic links and junctions are not allowed in the data directory.');}
  return target;
}

export class Store {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    this.safePath('');
    mkdirSync(this.dataDir, { recursive: true });
    const dbPath = this.safePath('workbench.sqlite');
    this.db = new DatabaseSync(dbPath);
    if(this.db.prepare('PRAGMA user_version').get().user_version>3){this.db.close();throw new Error('This data directory requires a newer Third Draft version.');}
    const version=this.db.prepare('PRAGMA user_version').get().user_version;
    this.db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS knowledge (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), item_id TEXT NOT NULL, previous_id TEXT, payload TEXT NOT NULL, UNIQUE(project_id,id), FOREIGN KEY(project_id,previous_id) REFERENCES knowledge(project_id,id));
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), request_id TEXT NOT NULL, request_hash TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(project_id,id), UNIQUE(project_id,request_id));
      CREATE TABLE IF NOT EXISTS concepts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), run_id TEXT NOT NULL UNIQUE, parent_id TEXT, payload TEXT NOT NULL, UNIQUE(project_id,id), FOREIGN KEY(project_id,run_id) REFERENCES runs(project_id,id), FOREIGN KEY(project_id,parent_id) REFERENCES concepts(project_id,id));
      CREATE TABLE IF NOT EXISTS favorites (project_id TEXT NOT NULL, concept_id TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)), updated_at TEXT NOT NULL, PRIMARY KEY(project_id,concept_id), FOREIGN KEY(project_id,concept_id) REFERENCES concepts(project_id,id));
      CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), target_id TEXT NOT NULL, payload TEXT NOT NULL, FOREIGN KEY(project_id,target_id) REFERENCES concepts(project_id,id));
      CREATE INDEX IF NOT EXISTS knowledge_project ON knowledge(project_id);
      CREATE INDEX IF NOT EXISTS concepts_project ON concepts(project_id);
      CREATE INDEX IF NOT EXISTS feedback_project ON feedback(project_id);
      CREATE INDEX IF NOT EXISTS runs_project ON runs(project_id);
      `);
    if(version<2) this.migrateV1();
    if(version<3) this.migrateV2();
  }
  migrateV2() {
    // Existing unscoped decisions retain their original payload. They are not
    // evidence that the user chose this version for any particular set.
    this.transaction(()=>this.db.exec(`
      CREATE TABLE selections_v3 (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), concept_id TEXT, asset_id TEXT, payload TEXT NOT NULL, set_id TEXT,
        CHECK((concept_id IS NULL)!=(asset_id IS NULL)), CHECK(set_id IS NULL OR concept_id IS NOT NULL),
        FOREIGN KEY(project_id,concept_id) REFERENCES concepts(project_id,id), FOREIGN KEY(project_id,asset_id) REFERENCES assets(project_id,id),
        FOREIGN KEY(project_id,set_id,concept_id) REFERENCES set_concepts(project_id,set_id,concept_id));
      INSERT INTO selections_v3 SELECT id,project_id,concept_id,asset_id,payload,NULL FROM selections;
      DROP TABLE selections;
      ALTER TABLE selections_v3 RENAME TO selections;
      PRAGMA user_version=3;
    `));
  }
  migrateV1() {
    // SQLite cannot drop a UNIQUE constraint in place. Copy without modifying payloads.
    this.db.exec('PRAGMA foreign_keys=OFF');
    try { this.transaction(()=>this.db.exec(`
      ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1));
      ALTER TABLE favorites ADD COLUMN reason TEXT NOT NULL DEFAULT '';
      CREATE TABLE concepts_v2 (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), run_id TEXT, parent_id TEXT, payload TEXT NOT NULL, UNIQUE(project_id,id), FOREIGN KEY(project_id,run_id) REFERENCES runs(project_id,id), FOREIGN KEY(project_id,parent_id) REFERENCES concepts_v2(project_id,id));
      INSERT INTO concepts_v2 SELECT * FROM concepts;
      DROP TABLE concepts;
      ALTER TABLE concepts_v2 RENAME TO concepts;
      CREATE INDEX concepts_project ON concepts(project_id);
      CREATE TABLE evidence (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), item_id TEXT NOT NULL, previous_id TEXT, payload TEXT NOT NULL, UNIQUE(project_id,id), FOREIGN KEY(project_id,previous_id) REFERENCES evidence(project_id,id));
      CREATE TABLE insights (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), item_id TEXT NOT NULL, previous_id TEXT, payload TEXT NOT NULL, UNIQUE(project_id,id), FOREIGN KEY(project_id,previous_id) REFERENCES insights(project_id,id));
      CREATE TABLE insight_evidence (project_id TEXT NOT NULL, insight_id TEXT NOT NULL, evidence_id TEXT NOT NULL, PRIMARY KEY(project_id,insight_id,evidence_id), FOREIGN KEY(project_id,insight_id) REFERENCES insights(project_id,id), FOREIGN KEY(project_id,evidence_id) REFERENCES evidence(project_id,id));
      CREATE TABLE sets (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), payload TEXT NOT NULL, UNIQUE(project_id,id));
      CREATE TABLE briefs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), set_id TEXT NOT NULL, previous_id TEXT, payload TEXT NOT NULL, UNIQUE(project_id,id), FOREIGN KEY(project_id,set_id) REFERENCES sets(project_id,id), FOREIGN KEY(project_id,previous_id) REFERENCES briefs(project_id,id));
      CREATE TABLE set_concepts (project_id TEXT NOT NULL, set_id TEXT NOT NULL, concept_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,set_id,concept_id), FOREIGN KEY(project_id,set_id) REFERENCES sets(project_id,id), FOREIGN KEY(project_id,concept_id) REFERENCES concepts(project_id,id));
      CREATE TABLE assets (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), parent_id TEXT, run_id TEXT, set_id TEXT, concept_id TEXT, brief_id TEXT, payload TEXT NOT NULL, UNIQUE(project_id,id), FOREIGN KEY(project_id,parent_id) REFERENCES assets(project_id,id), FOREIGN KEY(project_id,run_id) REFERENCES runs(project_id,id), FOREIGN KEY(project_id,set_id) REFERENCES sets(project_id,id), FOREIGN KEY(project_id,concept_id) REFERENCES concepts(project_id,id), FOREIGN KEY(project_id,brief_id) REFERENCES briefs(project_id,id));
      CREATE TABLE brief_assets (project_id TEXT NOT NULL, brief_id TEXT NOT NULL, asset_id TEXT NOT NULL, PRIMARY KEY(project_id,brief_id,asset_id), FOREIGN KEY(project_id,brief_id) REFERENCES briefs(project_id,id), FOREIGN KEY(project_id,asset_id) REFERENCES assets(project_id,id));
      CREATE TABLE knowledge_assets (project_id TEXT NOT NULL, knowledge_id TEXT NOT NULL, asset_id TEXT NOT NULL, PRIMARY KEY(project_id,knowledge_id,asset_id), FOREIGN KEY(project_id,knowledge_id) REFERENCES knowledge(project_id,id), FOREIGN KEY(project_id,asset_id) REFERENCES assets(project_id,id));
      CREATE TABLE asset_links (project_id TEXT NOT NULL, asset_id TEXT NOT NULL, reference_id TEXT NOT NULL, PRIMARY KEY(project_id,asset_id,reference_id), FOREIGN KEY(project_id,asset_id) REFERENCES assets(project_id,id), FOREIGN KEY(project_id,reference_id) REFERENCES assets(project_id,id));
      CREATE TABLE reviews (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), asset_id TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(project_id,id), FOREIGN KEY(project_id,asset_id) REFERENCES assets(project_id,id));
      CREATE TABLE selections (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), concept_id TEXT, asset_id TEXT, payload TEXT NOT NULL, CHECK((concept_id IS NULL)!=(asset_id IS NULL)), FOREIGN KEY(project_id,concept_id) REFERENCES concepts(project_id,id), FOREIGN KEY(project_id,asset_id) REFERENCES assets(project_id,id));
      CREATE TABLE scoped_feedback (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), concept_id TEXT, asset_id TEXT, set_id TEXT, payload TEXT NOT NULL, CHECK((concept_id IS NOT NULL)+(asset_id IS NOT NULL)=1), FOREIGN KEY(project_id,concept_id) REFERENCES concepts(project_id,id), FOREIGN KEY(project_id,asset_id) REFERENCES assets(project_id,id), FOREIGN KEY(project_id,set_id) REFERENCES sets(project_id,id));
      CREATE TABLE settings (name TEXT PRIMARY KEY, payload TEXT NOT NULL);
      PRAGMA user_version=2;
    `)); } finally {this.db.exec('PRAGMA foreign_keys=ON');}
    if(this.db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Database migration failed its reference checks.');
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  safePath(relative) {
    return safeDataPath(this.dataDir,relative);
  }
  project(projectId) {
    requireId(projectId);
    const row = this.db.prepare('SELECT id,name,created_at AS createdAt,archived FROM projects WHERE id=?').get(projectId);
    if (!row) throw new AppError('not_found', 'This project or record was not found.', 404);
    return { ...row,archived:Boolean(row.archived) };
  }
  projects() { return this.db.prepare('SELECT id,name,created_at AS createdAt,archived FROM projects ORDER BY created_at,id').all().map(p=>({...p,archived:Boolean(p.archived)})); }
  createProject(input) {
    const project = { id: id(), name: text(input.name, 'Project name', 80), createdAt: now() };
    this.db.prepare('INSERT INTO projects(id,name,created_at) VALUES (?,?,?)').run(project.id, project.name, project.createdAt);
    return {...project,archived:false};
  }
  assertWritable(projectId) { const project=this.project(projectId);if(project.archived)throw new AppError('project_archived','Unarchive this project before making changes.',409);return project; }
  archiveProject(projectId,archived) { this.project(projectId);if(typeof archived!=='boolean')throw new AppError('invalid_input','Archived must be true or false.');this.db.prepare('UPDATE projects SET archived=? WHERE id=?').run(Number(archived),projectId);return this.project(projectId); }
  rows(table, projectId) {
    if (!['knowledge','concepts','feedback','runs','evidence','insights','sets','briefs','assets','reviews','selections','scoped_feedback'].includes(table)) throw new Error('Invalid table');
    return this.db.prepare(`SELECT payload FROM ${table} WHERE project_id=? ORDER BY rowid`).all(projectId).map(row => JSON.parse(row.payload));
  }
  record(table, projectId, recordId) {
    this.project(projectId); requireId(recordId);
    if (!['knowledge','concepts','runs','evidence','insights','sets','briefs','assets','reviews'].includes(table)) throw new Error('Invalid table');
    const row = this.db.prepare(`SELECT payload FROM ${table} WHERE project_id=? AND id=?`).get(projectId, recordId);
    if (!row) throw new AppError('not_found', 'This project or record was not found.', 404);
    return JSON.parse(row.payload);
  }
  snapshot(projectId) {
    const project = this.project(projectId);
    const favorites = new Map(this.db.prepare('SELECT concept_id,reason FROM favorites WHERE project_id=? AND active=1').all(projectId).map(r => [r.concept_id,r.reason]));
    const briefs=this.rows('briefs',projectId);
    const selections=this.rows('selections',projectId),ideaState=new Map(selections.filter(s=>['archived','unarchived'].includes(s.decision)).map(s=>[s.ideaId,s.decision==='archived']));
    return { project, knowledge: this.rows('knowledge', projectId), concepts: this.rows('concepts', projectId).map(c => ({ ...c, favorite: favorites.has(c.id),favoriteReason:favorites.get(c.id)??null,archived:ideaState.get(c.ideaId)??false })), feedback: [...this.rows('feedback', projectId),...this.rows('scoped_feedback',projectId)], runs: this.rows('runs', projectId).map(({ pendingOutput, ...run }) => run), evidence:this.rows('evidence',projectId),insights:this.rows('insights',projectId),sets:this.rows('sets',projectId).map(s=>({...s,currentBriefId:briefs.filter(b=>b.setId===s.id).at(-1)?.id??null,conceptIds:this.setConcepts(projectId,s.id),conceptSelections:this.setConceptSelections(projectId,s.id,selections)})),briefs,assets:this.rows('assets',projectId).map(a=>({...a,lineage:this.assetLineage(projectId,a)})),reviews:this.rows('reviews',projectId),selections };
  }
  addKnowledge(projectId, input) {
    this.assertWritable(projectId);
    if (!['brand','reference'].includes(input.kind)) throw new AppError('invalid_input', 'Invalid knowledge type.');
    let previous = null;
    if (input.previousId) previous = this.record('knowledge', projectId, input.previousId);
    if (previous && previous.kind !== input.kind) throw new AppError('invalid_input', 'A revision must retain the same knowledge type.');
    const record = { id:id(), itemId:previous?.itemId ?? id(), previousId:previous?.id ?? null, kind:input.kind, status:'draft', title:text(input.title,'Title',120), content:text(input.content,'Content',2000), source:text(input.source,'Source',300), tags:tags(input.tags), createdAt:now(), createdBy:'user', schemaVersion:1 };
    record.contentHash = hash(record);
    this.db.prepare('INSERT INTO knowledge VALUES (?,?,?,?,?)').run(record.id, projectId, record.itemId, record.previousId, JSON.stringify(record));
    return record;
  }
  confirmKnowledge(projectId, recordId) {
    this.assertWritable(projectId);
    return this.transaction(() => {
      const source = this.record('knowledge', projectId, recordId);
      if (source.kind !== 'brand') throw new AppError('invalid_input','A reference cannot be confirmed as a brand fact.');
      if (source.status === 'confirmed') return source;
      const all = this.rows('knowledge', projectId);
      const existing = all.find(k => k.previousId === source.id && k.status === 'confirmed');
      if (existing) return existing;
      const latest = all.filter(k => k.itemId === source.itemId).at(-1);
      if (latest.id !== source.id) throw new AppError('stale_version', 'Confirm the latest draft; a newer version already exists.',409);
      const current = new Map(all.filter(k => k.status === 'confirmed').map(k => [k.itemId,k]));
      if (!current.has(source.itemId) && current.size >= 12) throw new AppError('context_limit','Keep at most 12 current brand constraints; combine related rules before adding more.');
      const record = { ...source, id:id(), previousId:source.id, status:'confirmed', createdAt:now() };
      delete record.contentHash; record.contentHash = hash(record);
      this.db.prepare('INSERT INTO knowledge VALUES (?,?,?,?,?)').run(record.id,projectId,record.itemId,record.previousId,JSON.stringify(record));
      if(record.assetId)this.db.prepare('INSERT INTO knowledge_assets VALUES (?,?,?)').run(projectId,record.id,record.assetId);
      return record;
    });
  }
  favorite(projectId, conceptId, active, reason='') {
    this.assertWritable(projectId);
    this.record('concepts', projectId, conceptId);
    if (typeof active !== 'boolean') throw new AppError('invalid_input','Favorite status must be true or false.');
    reason=optionalText(reason,'Favorite reason',1000);
    this.db.prepare('INSERT INTO favorites VALUES (?,?,?,?,?) ON CONFLICT(project_id,concept_id) DO UPDATE SET active=excluded.active, updated_at=excluded.updated_at,reason=excluded.reason').run(projectId,conceptId,Number(active),now(),reason);
    return { active,reason };
  }
  addFeedback(projectId, input) {
    this.assertWritable(projectId);
    const targetType=input.targetType??'concept';
    if(!['concept','asset'].includes(targetType)||!['concept','asset','set','style','brand','project'].includes(input.scope))throw new AppError('invalid_input','Choose the feedback target and scope.');
    const target=this.record(targetType==='concept'?'concepts':'assets',projectId,input.targetId);
    if(['concept','asset'].includes(input.scope)&&input.scope!==targetType)throw new AppError('invalid_input','The feedback scope must match its target.');
    if(input.scope==='set')this.record('sets',projectId,input.setId);
    const style=input.scope==='style'?text(input.style,'Style',200):null;
    const record = { id:id(), targetType,targetId:target.id, scope:input.scope,setId:input.scope==='set'?input.setId:null,style, content:text(input.content,'Feedback',1500), tags:tags(input.tags), createdAt:now(), createdBy:'user' };
    this.db.prepare('INSERT INTO scoped_feedback VALUES (?,?,?,?,?,?)').run(record.id,projectId,targetType==='concept'?target.id:null,targetType==='asset'?target.id:null,record.setId,JSON.stringify(record));
    return record;
  }
  addEvidence(projectId,input,{retrieved=false}={}) {
    this.assertWritable(projectId);
    const previous=input.previousId?this.record('evidence',projectId,input.previousId):null;
    let url=null;if(input.url){try{const u=new URL(input.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error();url=u.href;}catch{throw new AppError('invalid_input','Source URL must be a public HTTP or HTTPS address without credentials.');}}
    const retrievedAt=input.retrievedAt??now();if(!Number.isFinite(Date.parse(retrievedAt)))throw new AppError('invalid_input','Invalid source access date.');
    const expiresAt=input.expiresAt||null;if(expiresAt&&!Number.isFinite(Date.parse(expiresAt)))throw new AppError('invalid_input','Invalid evidence expiry date.');
    const record=versionRecord(input,previous,{title:text(input.title,'Source title',160),url,sourceType:url?'web':'manual',accessStatus:retrieved?'retrieved':'user_supplied',sourceResponseHash:retrieved?input.sourceResponseHash:null,excerptTruncated:retrieved?input.excerptTruncated===true:false,retrievedAt,expiresAt,observation:text(input.observation,'Observation / excerpt',12000),inference:optionalText(input.inference,'Inference',4000),tags:tags(input.tags)});
    this.db.prepare('INSERT INTO evidence VALUES (?,?,?,?,?)').run(record.id,projectId,record.itemId,record.previousId,JSON.stringify(record));return record;
  }
  addInsight(projectId,input) {
    this.assertWritable(projectId);
    const previous=input.previousId?this.record('insights',projectId,input.previousId):null;
    const evidenceIds=ids(input.evidenceIds??[],'Evidence references',12);evidenceIds.forEach(ref=>this.record('evidence',projectId,ref));
    if(typeof input.hypothesis!=='boolean')throw new AppError('invalid_input','Specify whether this insight is a hypothesis.');
    if(!evidenceIds.length&&!input.hypothesis)throw new AppError('invalid_input','An insight without evidence must remain a hypothesis.');
    const record=versionRecord(input,previous,{title:text(input.title,'Insight title',160),audience:text(input.audience,'Audience / scope',500),content:text(input.content,'Insight',4000),counterexamples:optionalText(input.counterexamples,'Counterexamples',2000),hypothesis:input.hypothesis,evidenceIds,tags:tags(input.tags)});
    this.transaction(()=>{this.db.prepare('INSERT INTO insights VALUES (?,?,?,?,?)').run(record.id,projectId,record.itemId,record.previousId,JSON.stringify(record));for(const ref of evidenceIds)this.db.prepare('INSERT INTO insight_evidence VALUES (?,?,?)').run(projectId,record.id,ref);});return record;
  }
  setConcepts(projectId,setId) {return this.db.prepare('SELECT concept_id FROM set_concepts WHERE project_id=? AND set_id=? ORDER BY rowid').all(projectId,setId).map(r=>r.concept_id);}
  setConceptSelections(projectId,setId,selections=this.rows('selections',projectId)) {
    return this.setConcepts(projectId,setId).map(conceptId=>{const selected=selections.filter(s=>s.targetType==='concept'&&s.targetId===conceptId&&s.setId===setId&&['adopted','rejected'].includes(s.decision)).at(-1);return {conceptId,decision:selected?.decision??null,reason:selected?.reason??null,selectionId:selected?.id??null};});
  }
  assetLineage(projectId,asset) {
    const dependencyAssetIds=this.db.prepare('SELECT reference_id FROM asset_links WHERE project_id=? AND asset_id=? ORDER BY reference_id').all(projectId,asset.id).map(r=>r.reference_id);
    const legacyCompositionDependency=asset.schemaVersion<3&&asset.method==='layered'&&asset.change!=='caption_only'&&asset.parentId===asset.composition?.visualId;
    return {parentAssetVersionId:legacyCompositionDependency?null:asset.parentId??null,dependencyAssetIds,...(legacyCompositionDependency?{legacyParentId:asset.parentId,legacyParentMeaning:'composition_dependency'}:{})};
  }
  writableSet(projectId,setId){const set=this.record('sets',projectId,setId);if(set.archived)throw new AppError('set_archived','Unarchive this creative set before making changes.',409);return set;}
  archiveSet(projectId,setId,archived){this.assertWritable(projectId);const set=this.record('sets',projectId,setId);if(typeof archived!=='boolean')throw new AppError('invalid_input','Archived must be true or false.');set.archived=archived;this.db.prepare('UPDATE sets SET payload=? WHERE project_id=? AND id=?').run(JSON.stringify(set),projectId,setId);return set;}
  addSetConcepts(projectId,setId,input) {
    this.assertWritable(projectId);this.writableSet(projectId,setId);const conceptIds=ids(input.conceptIds,'Concepts',100);conceptIds.forEach(ref=>this.record('concepts',projectId,ref));
    this.transaction(()=>{for(const ref of conceptIds)this.db.prepare('INSERT OR IGNORE INTO set_concepts VALUES (?,?,?,?)').run(projectId,setId,ref,now());});return {conceptIds:this.setConcepts(projectId,setId)};
  }
  validateBrief(projectId,input) {
    const fields={};for(const name of ['goal','audience','objective','offer','proof','cta','theme','caption','prohibitedClaims','style'])fields[name]=optionalText(input[name],name,2000);
    fields.goal=text(input.goal,'Brief goal',2000);fields.language=text(input.language??'English','Output language',40);
    fields.assetIds=ids(input.assetIds??[],'Reference images',8);fields.assetIds.forEach(ref=>this.record('assets',projectId,ref));return fields;
  }
  createSet(projectId,input) {
    this.assertWritable(projectId);if(!['paid','organic'].includes(input.mode))throw new AppError('invalid_input','Choose Paid or Organic.');
    const fields=this.validateBrief(projectId,input.brief??{}),conceptIds=ids(input.conceptIds??[],'Concepts',100);conceptIds.forEach(ref=>this.record('concepts',projectId,ref));
    const set={id:id(),name:text(input.name,'Set name',120),mode:input.mode,archived:false,createdAt:now(),schemaVersion:2};
    const brief={...fields,id:id(),setId:set.id,previousId:null,createdAt:now(),createdBy:'user',schemaVersion:2};brief.contentHash=hash(brief);
    this.transaction(()=>{this.db.prepare('INSERT INTO sets VALUES (?,?,?)').run(set.id,projectId,JSON.stringify(set));this.saveBrief(projectId,brief);for(const ref of conceptIds)this.db.prepare('INSERT INTO set_concepts VALUES (?,?,?,?)').run(projectId,set.id,ref,now());});
    return {...set,currentBriefId:brief.id,conceptIds};
  }
  saveBrief(projectId,brief) {this.db.prepare('INSERT INTO briefs VALUES (?,?,?,?,?)').run(brief.id,projectId,brief.setId,brief.previousId,JSON.stringify(brief));for(const assetId of brief.assetIds)this.db.prepare('INSERT INTO brief_assets VALUES (?,?,?)').run(projectId,brief.id,assetId);}
  reviseBrief(projectId,setId,input) {
    this.assertWritable(projectId);this.writableSet(projectId,setId);const fields=this.validateBrief(projectId,input),previous=this.rows('briefs',projectId).filter(b=>b.setId===setId).at(-1);
    const brief={...fields,id:id(),setId,previousId:previous.id,createdAt:now(),createdBy:'user',schemaVersion:2};brief.contentHash=hash(brief);this.transaction(()=>this.saveBrief(projectId,brief));return {...brief,affectedAssetIds:this.rows('assets',projectId).filter(a=>a.setId===setId&&a.briefId!==brief.id).map(a=>a.id)};
  }
  addConcept(projectId,input) {
    this.assertWritable(projectId);const parent=input.parentId?this.record('concepts',projectId,input.parentId):null;
    const fields={};for(const name of ['title','angle','body','visualDirection','rationale'])fields[name]=text(input[name],name,name==='title'?160:8000);
    if(!Array.isArray(input.assumptions??[])||(input.assumptions??[]).some(s=>typeof s!=='string'||s.length>2000)||(input.assumptions??[]).length>40)throw new AppError('invalid_input','Invalid creative assumptions.');
    const insightVersionIds=ids(input.insightVersionIds??[],'Insight versions',12),evidenceVersionIds=ids(input.evidenceVersionIds??[],'Evidence versions',12);
    insightVersionIds.forEach(ref=>this.record('insights',projectId,ref));evidenceVersionIds.forEach(ref=>this.record('evidence',projectId,ref));
    const createdAt=now(),confirmedBrandVersionIds=[...new Map(this.rows('knowledge',projectId).filter(k=>k.kind==='brand'&&k.status==='confirmed').map(k=>[k.itemId,k.id])).values()];
    const creationContext={capturedAt:createdAt,goal:optionalText(input.goal,'Creation goal',2000),confirmedBrandVersionIds,insightVersionIds,evidenceVersionIds,meaning:'Project fact baseline at save time; only listed insight/evidence versions were explicitly cited. This does not assert that all facts were used.'};
    const concept={...fields,theme:optionalText(input.theme,'Theme',200),insight:optionalText(input.insight,'Insight',2000),assumptions:input.assumptions??[],usedContextIds:[...insightVersionIds,...evidenceVersionIds],id:id(),ideaId:parent?.ideaId??id(),parentId:parent?.id??null,runId:null,createdAt,createdBy:'user',schemaVersion:3,provenance:{kind:parent?'manual_revision':'manual',sourceConceptId:parent?.id??null},creationContext};
    const archived=this.writeConcept(projectId,concept);this.db.prepare('INSERT INTO concepts VALUES (?,?,?,?,?)').run(archived.id,projectId,null,archived.parentId,JSON.stringify(archived));return archived;
  }
  select(projectId,input) {
    this.assertWritable(projectId);if(!['concept','asset'].includes(input.targetType)||!['adopted','rejected','published','unpublished','archived','unarchived'].includes(input.decision)||input.targetType==='asset'&&['archived','unarchived'].includes(input.decision))throw new AppError('invalid_input','Invalid selection.');
    const target=this.record(input.targetType==='concept'?'concepts':'assets',projectId,input.targetId);
    const scoped=input.targetType==='concept'&&['adopted','rejected'].includes(input.decision);
    if(scoped){if(!input.setId)throw new AppError('invalid_input','Choose the creative set for this idea decision.');this.writableSet(projectId,input.setId);if(!this.setConcepts(projectId,input.setId).includes(target.id))throw new AppError('invalid_input','Add this idea version to the set before recording a decision.');}
    else if(input.setId)throw new AppError('invalid_input','This decision does not accept a creative set scope.');
    const record={id:id(),targetId:input.targetId,targetType:input.targetType,decision:input.decision,reason:optionalText(input.reason,'Selection reason',1500),createdAt:now(),createdBy:'user',...(scoped?{setId:input.setId}:{}),...(['archived','unarchived'].includes(input.decision)?{ideaId:target.ideaId}:{})};
    this.db.prepare('INSERT INTO selections VALUES (?,?,?,?,?,?)').run(record.id,projectId,input.targetType==='concept'?input.targetId:null,input.targetType==='asset'?input.targetId:null,JSON.stringify(record),scoped?input.setId:null);return record;
  }
  setting(name,value) {if(value===undefined){const row=this.db.prepare('SELECT payload FROM settings WHERE name=?').get(name);return row?JSON.parse(row.payload):null;}this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload').run(name,JSON.stringify(value));return value;}
  insertRun(projectId, run) {
    this.db.prepare('INSERT INTO runs VALUES (?,?,?,?,?,?)').run(run.id,projectId,run.requestId,run.requestHash,run.status,JSON.stringify(run));
  }
  saveRun(projectId, run) {
    this.db.prepare('UPDATE runs SET status=?,payload=? WHERE project_id=? AND id=?').run(run.status,JSON.stringify(run),projectId,run.id);
  }
  existingRun(projectId, requestId) {
    const row = this.db.prepare('SELECT payload FROM runs WHERE project_id=? AND request_id=?').get(projectId,requestId);
    return row ? JSON.parse(row.payload) : null;
  }
  archive(projectId, run) {
    if (!run.pendingOutput) throw new Error('Missing validated output');
    if(['produce_image','edit_image'].includes(run.taskType)){
      const {record,imageBase64}=run.pendingOutput,{contentHash,...fields}=record;
      const expected=path.join('projects',projectId,'assets',requireId(record.id),'image.png');
      if(record.runId!==run.id||record.artifactPath!==expected||record.method!=='native'||contentHash!==hash(fields)||typeof imageBase64!=='string'||imageBase64.length>Math.ceil(20*1024*1024/3)*4)
        throw new AppError('invalid_archive','The pending production record failed validation.',500);
      const bytes=Buffer.from(imageBase64,'base64');
      if(bytes.toString('base64')!==imageBase64||bytes.length<33||bytes.length>20*1024*1024||hash(bytes)!==record.artifactHash||
        !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(16)!==record.width||bytes.readUInt32BE(20)!==record.height)
        throw new AppError('invalid_archive','The pending production image failed validation.',500);
      const filename=this.safePath(expected),temporary=this.safePath(expected+'.tmp');
      mkdirSync(path.dirname(filename),{recursive:true});
      const regular=filename=>{if(existsSync(filename)){const stat=lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new AppError('invalid_archive','Linked image archive files are not allowed.',500);}};
      regular(filename);regular(temporary);
      if(existsSync(filename)){
        if(hash(readFileSync(filename))!==record.artifactHash)throw new AppError('invalid_archive','An immutable image archive already contains different bytes.',500);
      }else{
        const descriptor=openSync(temporary,'w');try{writeFileSync(descriptor,bytes);fsyncSync(descriptor);}finally{closeSync(descriptor);}
        if(hash(readFileSync(temporary))!==record.artifactHash)throw new AppError('archive_failed','Image write verification failed.',500);
        renameSync(temporary,filename);
      }
      const completed={...run,status:'succeeded',assetId:record.id,completedAt:now(),error:null};delete completed.pendingOutput;
      this.transaction(()=>{
        const existing=this.db.prepare('SELECT payload FROM assets WHERE project_id=? AND id=?').get(projectId,record.id);
        if(existing){if(JSON.parse(existing.payload).contentHash!==record.contentHash)throw new AppError('invalid_archive','Asset identity already has different content.',500);}
        else{
          this.db.prepare('INSERT INTO assets VALUES (?,?,?,?,?,?,?,?)').run(record.id,projectId,record.parentId??null,run.id,record.setId,record.conceptId,record.briefId,JSON.stringify(record));
          for(const reference of record.snapshot.references)this.db.prepare('INSERT INTO asset_links VALUES (?,?,?)').run(projectId,record.id,reference.id);
        }
        this.saveRun(projectId,completed);
      });
      Object.assign(run,completed);delete run.pendingOutput;return record;
    }
    if(['extract_brand','review_asset'].includes(run.taskType)) {
      const record=run.pendingOutput,completed={...run,status:'succeeded',completedAt:now(),error:null,[run.taskType==='extract_brand'?'knowledgeId':'reviewId']:record.id};delete completed.pendingOutput;
      this.transaction(()=>{if(run.taskType==='extract_brand'){this.db.prepare('INSERT INTO knowledge VALUES (?,?,?,?,?)').run(record.id,projectId,record.itemId,record.previousId,JSON.stringify(record));this.db.prepare('INSERT INTO knowledge_assets VALUES (?,?,?)').run(projectId,record.id,record.assetId);}else this.db.prepare('INSERT INTO reviews VALUES (?,?,?,?)').run(record.id,projectId,record.assetId,JSON.stringify(record));this.saveRun(projectId,completed);});Object.assign(run,completed);delete run.pendingOutput;return record;
    }
    if(run.taskType==='synthesize_insights') {
      // IDs are assigned before archiving; a restart only retries this local transaction.
      const insight=run.pendingOutput,completed={...run,status:'succeeded',insightId:insight.id,completedAt:now(),error:null};delete completed.pendingOutput;
      this.transaction(()=>{this.db.prepare('INSERT INTO insights VALUES (?,?,?,?,?)').run(insight.id,projectId,insight.itemId,insight.previousId,JSON.stringify(insight));for(const ref of insight.evidenceIds)this.db.prepare('INSERT INTO insight_evidence VALUES (?,?,?)').run(projectId,insight.id,ref);this.saveRun(projectId,completed);});Object.assign(run,completed);delete run.pendingOutput;return insight;
    }
    const concepts=Array.isArray(run.pendingOutput)?run.pendingOutput:[run.pendingOutput];
    const archived=concepts.map(c=>this.writeConcept(projectId,c));
    const completed={...run,status:'succeeded',conceptId:archived[0].id,conceptIds:archived.map(c=>c.id),completedAt:now(),error:null};delete completed.pendingOutput;
    this.transaction(()=>{for(const concept of archived){this.db.prepare('INSERT INTO concepts VALUES (?,?,?,?,?)').run(concept.id,projectId,run.id,concept.parentId,JSON.stringify(concept));if(run.context.setId)this.db.prepare('INSERT INTO set_concepts VALUES (?,?,?,?)').run(projectId,run.context.setId,concept.id,now());}this.saveRun(projectId,completed);});
    Object.assign(run,completed);delete run.pendingOutput;return archived.length===1?archived[0]:archived;
  }
  writeConcept(projectId,concept) {
    const markdown = `# ${concept.title}\n\n${concept.body}\n\n## Creative angle\n\n${concept.angle}\n\n## Visual direction\n\n${concept.visualDirection}\n\n${concept.assumptions.length ? '## Assumptions\n\n' + concept.assumptions.map(a => '- ' + a).join('\n') + '\n' : ''}`;
    const relative = path.join('projects',projectId,'assets',concept.id,'draft.md');
    const file = this.safePath(relative);
    mkdirSync(path.dirname(file),{recursive:true});
    const temporary = this.safePath(relative + '.tmp');
    writeFileSync(temporary,markdown,{encoding:'utf8',flag:'w'});
    if (hash(readFileSync(temporary)) !== hash(markdown)) throw new Error('Archive verification failed');
    renameSync(temporary,file);
    return { ...concept, artifactPath:relative, artifactHash:hash(markdown), contentHash:hash(concept) };
  }
  readArtifact(projectId, conceptId) {
    const concept = this.record('concepts',projectId,conceptId);
    const expected = path.join('projects',projectId,'assets',concept.id,'draft.md');
    if (concept.artifactPath !== expected) throw new AppError('invalid_archive','The archive path failed validation.',500);
    let content;
    try { content=readFileSync(this.safePath(expected)); }
    catch(error) { if(error instanceof AppError) throw error; throw new AppError('invalid_archive','The archived file is missing or unreadable.',500); }
    if (hash(content) !== concept.artifactHash) throw new AppError('invalid_archive','The archived file hash does not match.',500);
    return content;
  }
}
