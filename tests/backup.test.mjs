import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { zipSync, unzipSync } from 'fflate';
import { Store } from '../src/store.mjs';
import { SkillLibrary } from '../src/skills.mjs';
import { AssetService } from '../src/assets.mjs';
import { exportProject, restoreProject, BACKUP_LIMITS, BACKUP_TABLES } from '../src/backup.mjs';
import { hash, id, now } from '../src/common.mjs';

const testRoot = path.resolve('.workbench/tests');
mkdirSync(testRoot, { recursive: true });
const ownedDirs = [];
after(() => { for (const directory of ownedDirs) { assert.ok(path.resolve(directory).startsWith(testRoot + path.sep)); rmSync(directory, { recursive: true, force: true }); } });
const upload = (filename, content) => ({ path: filename, base64: Buffer.from(content).toString('base64') });
function skill(library, method) {
  return library.import({ source: 'Synthetic backup fixture', declaredVersion: method, license: 'Test-only', permissions: ['method_text'], requiresCapabilities: ['text_generate'],
    files: [upload('SKILL.md', `---\nname: Backup method\n---\n${method}`), upload('references/style.md', `Method reference ${method}`), upload('scripts/inspect.cjs', 'throw new Error("DO_NOT_EXECUTE");')] });
}
function fixture(t) {
  const directory = mkdtempSync(path.join(testRoot, 'backup-')); ownedDirs.push(directory);
  const store = new Store(path.join(directory, 'source')); t.after(() => store.close());
  const library = new SkillLibrary(store), assets = new AssetService(store);
  const a = store.createProject({ name: 'Synthetic portable A' }), b = store.createProject({ name: 'FOREIGN_PROJECT_CANARY' });
  const concept = store.addConcept(a.id, { title: 'A useful pause', angle: 'Reading ritual', body: 'A pocket of quiet.', visualDirection: 'Book by a window.', rationale: 'Reuse accumulated creative judgment.' });
  store.setting('runtime', { accessToken: 'GLOBAL_CREDENTIAL_CANARY' });
  writeFileSync(store.safePath('native-session.json'), 'RUNTIME_SESSION_CANARY');
  const pending = store.safePath(path.join('projects', a.id, 'pending')); mkdirSync(pending, { recursive: true }); writeFileSync(path.join(pending, 'temporary.json'), 'PENDING_FILE_CANARY');
  return { directory, store, library, assets, a, b, concept };
}
test('runtime compatibility evidence hashes roundtrip without becoming research evidence references',t=>{
  const {store,library,a,directory}=fixture(t);
  const run={id:id(),requestId:id(),requestHash:hash('probe'),status:'failed',
    capabilitySnapshot:{compatibility:{evidenceId:hash('capability probe')}},
    runtimeMetadata:{compatibility:{evidenceId:hash('runtime probe')}}};
  store.insertRun(a.id,run);
  const archive=exportProject(store,library,a.id),destination=path.join(directory,'restored');
  restoreProject(archive,destination);
  const restored=new Store(destination);try{assert.deepEqual(restored.record('runs',a.id,run.id),run);}finally{restored.close();}
  run.context={evidenceId:hash('not a research record')};store.saveRun(a.id,run);
  assert.throws(()=>exportProject(store,library,a.id),{code:'invalid_backup'});
});
async function richFixture(t) {
  const f = fixture(t), { store, library, assets, a, b, concept } = f;
  const brand = store.addKnowledge(a.id, { kind: 'brand', title: 'Voice', content: 'Precise and calm.', source: 'Synthetic brand guide' });
  const confirmed = store.confirmKnowledge(a.id, brand.id);
  const evidence = store.addEvidence(a.id, { title: 'Reader observation', url: 'https://example.com/reader', observation: 'Readers prefer a quiet pause.', inference: 'A reading ritual may fit.', tags: ['reading'] });
  const evidence2 = store.addEvidence(a.id, { previousId: evidence.id, title: 'Reader observation revised', observation: 'Readers describe a quiet pause.', inference: 'Test a reading ritual.', tags: ['reading'] });
  const insight = store.addInsight(a.id, { title: 'Quiet ritual', audience: 'Readers', content: 'Make space for a page.', hypothesis: false, evidenceIds: [evidence.id] });
  store.addInsight(a.id, { previousId: insight.id, title: 'Quiet ritual revised', audience: 'Readers', content: 'Keep the invitation simple.', hypothesis: false, evidenceIds: [evidence.id, evidence2.id] });
  const revised = store.addConcept(a.id, { parentId: concept.id, title: 'One more page', angle: 'Reading ritual', body: 'Which book is keeping you company?', visualDirection: 'A page in warm light.', rationale: 'Incorporates earlier feedback.' });
  store.favorite(a.id, revised.id, true, 'Specific book invitation builds on earlier judgment.');
  store.favorite(a.id, concept.id, false, 'Original retained, later version preferred.');
  const png = await sharp({ create: { width: 3, height: 3, channels: 4, background: '#abcabc' } }).png().toBuffer();
  const reference = await assets.import(a.id, { name: 'Reference', source: 'Synthetic pixels', base64: png.toString('base64') });
  const set = store.createSet(a.id, { name: 'Reading organic', mode: 'organic', brief: { goal: 'Invite a reading pause.', assetIds: [reference.id] }, conceptIds: [concept.id, revised.id] });
  store.createSet(a.id, { name: 'Reading paid', mode: 'paid', brief: { goal: 'Test the same idea for an ad.' }, conceptIds: [revised.id] });
  const newBrief = store.reviseBrief(a.id, set.id, { goal: 'Invite an unhurried page.', assetIds: [reference.id] });
  const image = await assets.import(a.id, { name: 'Creative', source: 'Synthetic pixels', base64: png.toString('base64'), setId: set.id, conceptId: revised.id, caption: 'What are you reading?' });
  const caption = await assets.caption(a.id, image.id, { caption: 'Which book is keeping you company?' });
  // This test exercises the same reference tables used by extraction and composition.
  store.db.prepare('INSERT INTO knowledge_assets VALUES (?,?,?)').run(a.id, confirmed.id, reference.id);
  store.db.prepare('INSERT INTO asset_links VALUES (?,?,?)').run(a.id, caption.id, reference.id);
  const review = { id: id(), assetId: caption.id, snapshot: { assetId: caption.id, briefId: newBrief.id }, issues: [{ id: id(), severity: 'unable_to_judge', explanation: 'Synthetic human review needed.' }], createdAt: now() };
  store.db.prepare('INSERT INTO reviews VALUES (?,?,?,?)').run(review.id, a.id, caption.id, JSON.stringify(review));
  assets.resolve(a.id, review.id, { issueId: review.issues[0].id, reason: 'Synthetic review confirmed the expected visual.' });
  store.select(a.id, { targetType: 'asset', targetId: caption.id, decision: 'adopted', reason: 'Reviewed synthetic output.' });
  store.select(a.id, { targetType: 'concept', targetId: revised.id, decision: 'published', reason: 'Historical publication decision.' });
  store.addFeedback(a.id, { targetType: 'asset', targetId: caption.id, scope: 'set', setId: set.id, content: 'Continue the reading ritual.', tags: ['reading'] });
  const legacy = { id: id(), targetId: concept.id, scope: 'project', content: 'Earlier v0.1 feedback.', createdAt: now() };
  store.db.prepare('INSERT INTO feedback VALUES (?,?,?,?)').run(legacy.id, a.id, concept.id, JSON.stringify(legacy));
  const historical = skill(library, 'Earlier immutable method'), current = skill(library, 'Current immutable method'), foreignSkill = skill(library, 'FOREIGN_SKILL_CANARY');
  library.bind(a.id, { skillId: current.id, enabled: true }); library.bind(b.id, { skillId: foreignSkill.id, enabled: true });
  // Historical versions must survive even when there is no current project binding.
  const run = { id: id(), requestId: id(), requestHash: hash('synthetic request'), status: 'succeeded', taskType: 'concept',
    context: { projectId: a.id, skills: [{ id: historical.id, contentHash: historical.contentHash }], insightIds: [insight.id], conceptIds: [concept.id], assetIds: [reference.id], setId: set.id, briefId: newBrief.id },
    conceptId: revised.id, conceptIds: [revised.id], completedAt: now(), native: { threadId: 'SYNTHETIC_HISTORICAL_LINEAGE' } };
  store.insertRun(a.id, run);
  store.addKnowledge(b.id, { kind: 'reference', title: 'Foreign private', content: 'FOREIGN_KNOWLEDGE_CANARY', source: 'Other project' });
  await assets.import(b.id, { name: 'FOREIGN_ASSET_CANARY', source: 'Other project', base64: png.toString('base64') });
  store.archiveProject(a.id, true);
  return { ...f, historical, current, foreignSkill, run, caption, reference };
}
function unpack(archive) { return Object.fromEntries(Object.entries(unzipSync(archive)).map(([name, bytes]) => [name, Buffer.from(bytes)])); }
function repack(archive, edit) { const entries = unpack(archive); edit(entries); return Buffer.from(zipSync(entries, { level: 6 })); }
function editRecords(archive, edit) {
  return repack(archive, entries => {
    const records = JSON.parse(entries['records.json']), manifest = JSON.parse(entries['manifest.json']);
    edit(records, manifest);
    entries['records.json'] = Buffer.from(JSON.stringify(records));
    manifest.records = { path: 'records.json', bytes: entries['records.json'].length, hash: hash(entries['records.json']) };
    manifest.counts = Object.fromEntries(Object.keys(BACKUP_TABLES).map(table => [table, records[table].length]));
    entries['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  });
}
function rejected(archive, directory, expected = ['invalid_backup', 'unsafe_backup_path', 'unsupported_backup_schema', 'backup_limit']) {
  const destination = path.join(directory, id());
  assert.throws(() => restoreProject(archive, destination), error => expected.includes(error.code), 'malformed archive must fail explicitly');
  assert.equal(existsSync(destination), false, 'validation must finish before creating a restore directory');
}
function centralOffsets(archive) {
  const end = archive.length - 22, count = archive.readUInt16LE(end + 10), offsets = [];
  let offset = archive.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) { offsets.push(offset); offset += 46 + archive.readUInt16LE(offset + 28) + archive.readUInt16LE(offset + 30) + archive.readUInt16LE(offset + 32); }
  return offsets;
}

test('private backup roundtrips every version, link, reason, archive and historical skill without another project or credentials', async t => {
  const { directory, store, library, a, b, historical, current, foreignSkill, caption } = await richFixture(t);
  const archive = exportProject(store, library, a.id), entries = unpack(archive), records = JSON.parse(entries['records.json']);
  const serialized = Object.values(entries).map(bytes => bytes.toString()).join('\n');
  for (const secret of [b.id, foreignSkill.id, 'FOREIGN_PROJECT_CANARY', 'FOREIGN_KNOWLEDGE_CANARY', 'FOREIGN_SKILL_CANARY', 'GLOBAL_CREDENTIAL_CANARY', 'RUNTIME_SESSION_CANARY', 'PENDING_FILE_CANARY']) assert.equal(serialized.includes(secret), false, secret);
  assert.deepEqual(new Set(records.skill_packages.map(row => row.id)), new Set([historical.id, current.id]));
  assert.equal(records.project_skills.length, 1); assert.equal(records.knowledge_assets.length, 1); assert.equal(records.asset_links.length, 1);
  const destination = path.join(directory, 'restored'), result = restoreProject(archive, destination);
  assert.equal(result.projectId, a.id); assert.equal(result.archived, true); assert.equal(result.schemaVersion, 3);
  const restored = new Store(destination); t.after(() => restored.close()); const restoredLibrary = new SkillLibrary(restored);
  assert.deepEqual(restored.projects(), [store.project(a.id)]);
  for (const [table, columns] of Object.entries(BACKUP_TABLES)) {
    const actual = restored.db.prepare(`SELECT ${columns.join(',')} FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));
    assert.deepEqual(actual, records[table], `${table} raw rows remain exact`);
  }
  assert.equal(restored.setting('runtime'), null); assert.equal(restored.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.deepEqual(restored.snapshot(a.id), store.snapshot(a.id));
  assert.equal(restoredLibrary.selected(a.id, ['text_generate'])[0].id, current.id);
  assert.deepEqual(restoredLibrary.package(historical.id, true), library.package(historical.id, true));
  for (const file of JSON.parse(entries['manifest.json']).files) {
    assert.equal(hash(readFileSync(path.join(destination, ...file.path.slice(5).split('/')))), file.hash);
  }
  assert.deepEqual(new AssetService(restored).read(a.id, caption.id), new AssetService(store).read(a.id, caption.id));
  assert.throws(() => restored.favorite(a.id, store.snapshot(a.id).concepts[0].id, true), error => error.code === 'project_archived');
});

test('running and pending-archival projects cannot export; unknown results remain portable without retrying providers', t => {
  const { directory, store, library, a } = fixture(t);
  const run = { id: id(), requestId: id(), requestHash: hash('pending'), status: 'running' }; store.insertRun(a.id, run);
  assert.throws(() => exportProject(store, library, a.id), error => error.code === 'backup_busy');
  run.status = 'archiving'; store.saveRun(a.id, run);
  assert.throws(() => exportProject(store, library, a.id), error => error.code === 'backup_busy');
  run.status = 'result_unknown'; store.saveRun(a.id, run);
  assert.equal(restoreProject(exportProject(store, library, a.id), path.join(directory, 'unknown-restored')).counts.runs, 1);
});

test('tampered artifacts, records, omitted files and extra private files are rejected before creating a destination', t => {
  const { directory, store, library, a } = fixture(t), archive = exportProject(store, library, a.id);
  rejected(repack(archive, entries => { const file = Object.keys(entries).find(name => name.startsWith('data/')); entries[file] = Buffer.from('tampered'); }), directory);
  rejected(repack(archive, entries => { entries['records.json'] = Buffer.from('{}'); }), directory);
  rejected(repack(archive, entries => { delete entries[Object.keys(entries).find(name => name.startsWith('data/'))]; }), directory);
  rejected(repack(archive, entries => { entries['data/projects/private/credential.json'] = Buffer.from('private'); }), directory);
  rejected(Buffer.from('not a zip'), directory);
  rejected(archive.subarray(0, archive.length - 1), directory);
});

test('foreign IDs, dangling references, duplicate composite keys and unknown columns fail before restore writes', t => {
  const { directory, store, library, a, b, concept } = fixture(t);
  store.favorite(a.id, concept.id, true, 'Keep this reasoning.');
  const archive = exportProject(store, library, a.id);
  rejected(editRecords(archive, records => { records.concepts[0].project_id = b.id; }), directory);
  rejected(editRecords(archive, records => { records.concepts[0].parent_id = id(); }), directory);
  rejected(editRecords(archive, records => { records.favorites.push({ ...records.favorites[0] }); }), directory);
  rejected(editRecords(archive, records => { records.concepts[0].surprise = 'Unknown column'; }), directory);
  rejected(editRecords(archive, records => { const payload = JSON.parse(records.concepts[0].payload); payload.assetIds = [id()]; records.concepts[0].payload = JSON.stringify(payload); }), directory);
  rejected(editRecords(archive, records => { const payload = JSON.parse(records.concepts[0].payload); payload.credentials = 'no'; records.concepts[0].payload = JSON.stringify(payload); }), directory);
  rejected(editRecords(archive, (records, manifest) => { manifest.schemaVersion = 99; }), directory);
});

test('ZIP traversal, absolute names, Windows aliases, case collisions and Unix symlinks are rejected', t => {
  const { directory, store, library, a } = fixture(t), archive = exportProject(store, library, a.id);
  for (const name of ['../outside', '/absolute', 'data/projects/a/../../outside', 'data/projects/a/name:stream', 'data/projects/a/CON', 'data/projects/a/name.', 'data\\projects\\a\\file'])
    rejected(repack(archive, entries => { entries[name] = Buffer.from('unsafe'); }), directory);
  rejected(repack(archive, entries => { entries['data/projects/a/File'] = Buffer.from('a'); entries['data/projects/a/file'] = Buffer.from('b'); }), directory);
  rejected(repack(archive, entries => { entries['data/projects/a/FILE'] = Buffer.from('a'); entries['data/projects/a/file/child'] = Buffer.from('b'); }), directory);
  const linked = Buffer.from(archive), first = centralOffsets(linked)[0];
  linked.writeUInt32LE((0xa000 << 16) >>> 0, first + 38);
  rejected(linked, directory);
});

test('ZIP expansion bounds are checked before allocation and inside DEFLATE, not trusted from the directory', t => {
  const { directory, store, library, a } = fixture(t), archive = exportProject(store, library, a.id);
  assert.equal(BACKUP_LIMITS.entryBytes, 20 * 1024 * 1024);
  const oversized = Buffer.from(archive), first = centralOffsets(oversized)[0];
  oversized.writeUInt32LE(BACKUP_LIMITS.entryBytes + 1, first + 24); rejected(oversized, directory);
  const bomb = repack(archive, entries => { entries['data/projects/a/bomb'] = Buffer.alloc(1024 * 1024); });
  const bombEntry = centralOffsets(bomb).find(offset => bomb.subarray(offset + 46, offset + 46 + bomb.readUInt16LE(offset + 28)).toString().endsWith('/bomb'));
  const local = bomb.readUInt32LE(bombEntry + 42);
  bomb.writeUInt32LE(1, bombEntry + 24); bomb.writeUInt32LE(1, local + 22);
  rejected(bomb, directory);
});

test('restore never merges or overwrites an existing directory and refuses a linked parent', t => {
  const { directory, store, library, a } = fixture(t), archive = exportProject(store, library, a.id);
  const target = path.join(directory, 'existing'); mkdirSync(target); const sentinel = path.join(target, 'keep.txt'); writeFileSync(sentinel, 'KEEP');
  assert.throws(() => restoreProject(archive, target), error => error.code === 'restore_target_exists');
  assert.equal(readFileSync(sentinel, 'utf8'), 'KEEP'); assert.equal(existsSync(path.join(target, 'workbench.sqlite')), false);
  const real = path.join(directory, 'real'), link = path.join(directory, 'linked'); mkdirSync(real); symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => restoreProject(archive, path.join(link, 'restore')), error => error.code === 'unsafe_backup_path');
  assert.equal(existsSync(path.join(real, 'restore')), false);
  assert.throws(() => restoreProject(archive, 'relative-directory'), error => error.code === 'invalid_restore_target');
});

test('export rejects changed files, missing historical skills and unexpected schema rather than silently losing data', t => {
  const { store, library, a, concept } = fixture(t), filename = store.safePath(concept.artifactPath), original = readFileSync(filename);
  writeFileSync(filename, 'changed'); assert.throws(() => exportProject(store, library, a.id), error => error.code === 'invalid_backup'); writeFileSync(filename, original);
  const run = { id: id(), requestId: id(), requestHash: hash('missing skill'), status: 'failed', context: { skills: [{ id: id() }] } }; store.insertRun(a.id, run);
  assert.throws(() => exportProject(store, library, a.id), error => error.code === 'skill_not_found');
  run.context = {}; store.saveRun(a.id, run);
  store.db.exec('CREATE TABLE future_project_data (id TEXT)');
  assert.throws(() => exportProject(store, library, a.id), error => error.code === 'unsupported_backup_schema');
});

test('export rejects linked source artifacts without following them outside project storage', t => {
  const { directory, store, library, a, concept } = fixture(t);
  const artifactDir = path.dirname(store.safePath(concept.artifactPath));
  assert.ok(path.resolve(artifactDir).startsWith(path.resolve(store.dataDir) + path.sep)); rmSync(artifactDir, { recursive: true });
  const outside = path.join(directory, 'other'); mkdirSync(outside); writeFileSync(path.join(outside, 'draft.md'), 'FOREIGN_CONTENT');
  symlinkSync(outside, artifactDir, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => exportProject(store, library, a.id), error => error.code === 'unsafe_path' || error.code === 'unsafe_backup_path');
});

test('rehashing a malformed skill package cannot install it through restore', t => {
  const { directory, store, library, a } = fixture(t);
  const imported = skill(library, 'Valid method'); library.bind(a.id, { skillId: imported.id, enabled: true });
  const archive = exportProject(store, library, a.id);
  const altered = change => editRecords(archive, records => {
    const record = JSON.parse(records.skill_packages[0].payload); change(record);
    delete record.manifestHash; record.manifestHash = hash(record);
    records.skill_packages[0].payload = JSON.stringify(record);
  });
  rejected(altered(record => { record.requiresCapabilities = null; }), directory);
  rejected(altered(record => { record.inspection.scriptsExecuted = true; }), directory);
  rejected(altered(record => { record.totalBytes += 1; }), directory);
  rejected(altered(record => { record.files[0].path = 'SKILL.md/child'; record.contentHash = hash(record.files); record.hash = record.contentHash; }), directory);
  rejected(editRecords(archive, records => { records.project_skills = []; }), directory);
});

test('restore rejects self and multi-record lineage cycles before creating a destination', async t => {
  const { directory, store, library, a } = await richFixture(t), archive = exportProject(store, library, a.id);
  for (const [table, column, key] of [
    ['concepts', 'parent_id', 'parentId'], ['assets', 'parent_id', 'parentId'],
    ['knowledge', 'previous_id', 'previousId'], ['evidence', 'previous_id', 'previousId'],
    ['insights', 'previous_id', 'previousId'], ['briefs', 'previous_id', 'previousId'],
  ]) await t.test(table, () => {
    const cycle = multiple => editRecords(archive, records => {
      const first = records[table][0], second = records[table][1];
      for (const [row, parent] of multiple ? [[first, second.id], [second, first.id]] : [[first, first.id]]) {
        row[column] = parent;
        const payload = JSON.parse(row.payload); payload[key] = parent; row.payload = JSON.stringify(payload);
      }
    });
    rejected(cycle(false), directory);
    rejected(cycle(true), directory);
  });
});
