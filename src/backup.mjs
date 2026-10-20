import { mkdirSync, lstatSync, openSync, closeSync, fstatSync, readSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { zipSync } from 'fflate';
import { inflateRawSync } from 'node:zlib';
import { Store } from './store.mjs';
import { SkillLibrary, validateSkillManifest } from './skills.mjs';
import { AppError, hash, now } from './common.mjs';

// A deliberately bounded, single-project portable backup; no database or credential files.
export const BACKUP_LIMITS = Object.freeze({ bytes: 64 * 1024 * 1024, entryBytes: 20 * 1024 * 1024, files: 512, rows: 10_000 });
export const BACKUP_TABLES = Object.freeze({
  projects: ['id', 'name', 'created_at', 'archived'],
  knowledge: ['id', 'project_id', 'item_id', 'previous_id', 'payload'],
  runs: ['id', 'project_id', 'request_id', 'request_hash', 'status', 'payload'],
  concepts: ['id', 'project_id', 'run_id', 'parent_id', 'payload'],
  favorites: ['project_id', 'concept_id', 'active', 'updated_at', 'reason'],
  feedback: ['id', 'project_id', 'target_id', 'payload'],
  evidence: ['id', 'project_id', 'item_id', 'previous_id', 'payload'],
  insights: ['id', 'project_id', 'item_id', 'previous_id', 'payload'],
  insight_evidence: ['project_id', 'insight_id', 'evidence_id'],
  sets: ['id', 'project_id', 'payload'],
  briefs: ['id', 'project_id', 'set_id', 'previous_id', 'payload'],
  set_concepts: ['project_id', 'set_id', 'concept_id', 'created_at'],
  assets: ['id', 'project_id', 'parent_id', 'run_id', 'set_id', 'concept_id', 'brief_id', 'payload'],
  brief_assets: ['project_id', 'brief_id', 'asset_id'],
  knowledge_assets: ['project_id', 'knowledge_id', 'asset_id'],
  asset_links: ['project_id', 'asset_id', 'reference_id'],
  reviews: ['id', 'project_id', 'asset_id', 'payload'],
  selections: ['id', 'project_id', 'concept_id', 'asset_id', 'payload', 'set_id'],
  scoped_feedback: ['id', 'project_id', 'concept_id', 'asset_id', 'set_id', 'payload'],
  skill_packages: ['id', 'payload'],
  project_skills: ['project_id', 'skill_id', 'enabled'],
});
const tableNames = Object.keys(BACKUP_TABLES);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const fail = (code, message, status = 400) => { throw new AppError(code, message, status); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const activeStatuses = new Set(['running', 'archiving']);
const nullable = new Set(['previous_id', 'parent_id', 'run_id', 'set_id', 'concept_id', 'asset_id', 'brief_id']);
const integerColumns = new Set(['archived', 'active', 'enabled']);
const foreignKeys = {
  knowledge: { previous_id: 'knowledge' }, concepts: { run_id: 'runs', parent_id: 'concepts' },
  favorites: { concept_id: 'concepts' }, feedback: { target_id: 'concepts' },
  evidence: { previous_id: 'evidence' }, insights: { previous_id: 'insights' },
  insight_evidence: { insight_id: 'insights', evidence_id: 'evidence' },
  briefs: { set_id: 'sets', previous_id: 'briefs' }, set_concepts: { set_id: 'sets', concept_id: 'concepts' },
  assets: { parent_id: 'assets', run_id: 'runs', set_id: 'sets', concept_id: 'concepts', brief_id: 'briefs' },
  brief_assets: { brief_id: 'briefs', asset_id: 'assets' }, reviews: { asset_id: 'assets' },
  knowledge_assets: { knowledge_id: 'knowledge', asset_id: 'assets' }, asset_links: { asset_id: 'assets', reference_id: 'assets' },
  selections: { concept_id: 'concepts', asset_id: 'assets', set_id: 'sets' },
  scoped_feedback: { concept_id: 'concepts', asset_id: 'assets', set_id: 'sets' }, project_skills: { skill_id: 'skill_packages' },
};
const payloadReferences = {
  sourceConceptId: 'concepts', conceptId: 'concepts', conceptIds: 'concepts', selectedConceptIds: 'concepts',
  setId: 'sets', creativeSetId: 'sets', briefId: 'briefs', currentBriefId: 'briefs',
  assetId: 'assets', assetIds: 'assets', referenceAssetIds: 'assets', referenceAssetVersionIds: 'assets',
  evidenceId: 'evidence', evidenceIds: 'evidence', evidenceVersionIds: 'evidence',
  insightId: 'insights', insightIds: 'insights', insightVersionIds: 'insights',
  confirmedBrandVersionIds: 'knowledge',
  visualId: 'assets', logoId: 'assets', reviewId: 'reviews',
};
function archivePath(value) {
  if (typeof value !== 'string' || !value || value.length > 1024 || value.includes('\\') || value.startsWith('/') || /[\x00-\x1f<>:"|?*]/.test(value))
    fail('unsafe_backup_path', 'Backup paths must be relative forward-slash paths.');
  if (value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
    fail('unsafe_backup_path', 'Backup paths cannot traverse directories or use Windows aliases.');
  return value;
}
function noLinks(filename, allowMissing = false) {
  const absolute = path.resolve(filename); let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) fail('unsafe_backup_path', 'Backup paths cannot use symbolic links or junctions.'); }
    catch (error) { if (allowMissing && error.code === 'ENOENT') continue; throw error; }
  }
  return absolute;
}
function readFileBounded(filename) {
  noLinks(filename);
  const initial = lstatSync(filename);
  if (!initial.isFile() || initial.size > BACKUP_LIMITS.entryBytes) fail('backup_limit', 'A backup file is not a regular file or exceeds 20 MiB.');
  const fd = openSync(filename, 'r');
  try {
    const current = fstatSync(fd);
    if (!current.isFile() || current.size !== initial.size || current.ino !== initial.ino) fail('invalid_backup', 'A project file changed during backup.');
    const bytes = Buffer.alloc(current.size + 1); let count = 0, read;
    while (count < bytes.length && (read = readSync(fd, bytes, count, bytes.length - count, null)) > 0) count += read;
    if (count !== current.size) fail('invalid_backup', 'A project file changed during backup.');
    return bytes.subarray(0, count);
  } finally { closeSync(fd); }
}
function parseJson(bytes, name) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('invalid_backup', `${name} is not valid UTF-8 JSON.`); }
}
function assertSchema(store) {
  if (store.db.prepare('PRAGMA user_version').get().user_version !== 3) fail('unsupported_backup_schema', 'Only database schema 3 can be exported by this version.');
  const actual = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name);
  if (actual.some(name => !tableNames.includes(name) && name !== 'settings')) fail('unsupported_backup_schema', 'The database has tables this backup format does not preserve.');
  for (const [table, columns] of Object.entries(BACKUP_TABLES)) {
    const actualColumns = store.db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
    if (actualColumns.length !== columns.length || columns.some(column => !actualColumns.includes(column))) fail('unsupported_backup_schema', `The ${table} table does not match backup schema 3.`);
  }
}
function usedSkills(value, found = new Set(), depth = 0) {
  if (depth > 80) fail('invalid_backup', 'Backup records are nested too deeply.');
  if (Array.isArray(value)) { value.forEach(item => usedSkills(item, found, depth + 1)); return found; }
  if (!object(value)) return found;
  for (const [key, item] of Object.entries(value)) {
    if (['skillId', 'skillVersionId'].includes(key) && uuid(item)) found.add(item);
    if (['skill', 'skills', 'skillVersions', 'skillPackages', 'enabledSkills'].includes(key)) {
      for (const reference of Array.isArray(item) ? item : [item]) {
        const candidate = typeof reference === 'string' ? reference : reference?.id ?? reference?.skillId;
        if (uuid(candidate)) found.add(candidate);
      }
    }
    usedSkills(item, found, depth + 1);
  }
  return found;
}
function validatePayload(value, projectId, ids, depth = 0, location = '') {
  if (depth > 80) fail('invalid_backup', 'Backup records are nested too deeply.');
  if (Array.isArray(value)) { value.forEach(item => validatePayload(item, projectId, ids, depth + 1, location+'[]')); return; }
  if (!object(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (['projectId', 'project_id'].includes(key) && item !== projectId) fail('invalid_backup', 'A record refers to another project.');
    if (['apiKey', 'api_key', 'accessToken', 'access_token', 'refreshToken', 'refresh_token', 'authorization', 'cookie', 'credentials', 'password'].includes(key))
      fail('invalid_backup', 'Credential fields cannot be included in a project backup.');
    // Probe receipts and domain research records use different identities.
    // Restrict this distinction to the two runtime-owned receipt locations.
    const probeEvidence=key==='evidenceId'&&['runs.capabilitySnapshot.compatibility','runs.runtimeMetadata.compatibility'].includes(location);
    if(probeEvidence&&!digest(item))fail('invalid_backup','A runtime compatibility evidence hash is invalid.');
    if (payloadReferences[key] && item !== null && !probeEvidence) {
      for (const reference of Array.isArray(item) ? item : [item]) if (!ids[payloadReferences[key]].has(reference))
        fail('invalid_backup', `A ${key} reference is outside the backed-up project.`);
    }
    validatePayload(item, projectId, ids, depth + 1, location+'.'+key);
  }
}
function validateLineages(records) {
  // A same-table foreign key proves existence, not acyclicity. Apply the same
  // invariant to every persisted parent/previous-version chain before writing.
  for (const [table, references] of Object.entries(foreignKeys)) for (const [column, target] of Object.entries(references)) {
    if (target !== table) continue;
    const parents = new Map(records[table].map(row => [row.id, row[column]])), checked = new Set();
    for (const row of records[table]) {
      const visiting = new Set(); let current = row.id;
      while (current !== null && !checked.has(current)) {
        if (visiting.has(current)) fail('invalid_backup', `The ${table} version lineage contains a cycle.`);
        visiting.add(current); current = parents.get(current);
      }
      for (const recordId of visiting) checked.add(recordId);
    }
  }
}
function validateRecords(records, projectId) {
  if (!exactKeys(records, tableNames) || !uuid(projectId)) fail('invalid_backup', 'The backup record tables or project identity are invalid.');
  const ids = {}; let rowCount = 0;
  for (const [table, columns] of Object.entries(BACKUP_TABLES)) {
    if (!Array.isArray(records[table])) fail('invalid_backup', `The ${table} rows are invalid.`);
    rowCount += records[table].length;
    if (rowCount > BACKUP_LIMITS.rows) fail('backup_limit', 'A project backup may contain at most 10,000 rows.');
    ids[table] = new Set(); const unique = new Set();
    for (const row of records[table]) {
      if (!exactKeys(row, columns)) fail('invalid_backup', `The ${table} columns do not match backup schema 3.`);
      for (const column of columns) {
        const value = row[column];
        if (integerColumns.has(column)) { if (value !== 0 && value !== 1) fail('invalid_backup', `${table}.${column} must be 0 or 1.`); }
        else if (value === null) { if (!nullable.has(column)) fail('invalid_backup', `${table}.${column} cannot be null.`); }
        else if (typeof value !== 'string') fail('invalid_backup', `${table}.${column} must be text.`);
        if ((column === 'id' || column.endsWith('_id')) && value !== null && !uuid(value)) fail('invalid_backup', `${table}.${column} is not a valid ID.`);
      }
      if (row.project_id !== undefined && row.project_id !== projectId) fail('invalid_backup', 'Backup rows belong to more than one project.');
      if (row.id !== undefined) {
        if (ids[table].has(row.id)) fail('invalid_backup', `The ${table} table contains a duplicate ID.`);
        ids[table].add(row.id);
      }
      // These are the remaining schema UNIQUE / composite primary-key constraints.
      const key = table === 'runs' ? row.request_id : row.id === undefined ? JSON.stringify(columns.filter(column => column.endsWith('_id')).map(column => row[column])) : row.id;
      if (unique.has(key)) fail('invalid_backup', `The ${table} table contains a duplicate key.`);
      unique.add(key);
    }
  }
  if (records.projects.length !== 1 || records.projects[0].id !== projectId) fail('invalid_backup', 'A backup must contain exactly its declared project.');
  const requiredSkills = new Set(records.project_skills.map(row => row.skill_id));
  for (const [table, rows] of Object.entries(records)) for (const row of rows) {
    for (const [column, target] of Object.entries(foreignKeys[table] ?? {})) if (row[column] !== null && !ids[target].has(row[column]))
      fail('invalid_backup', `The ${table}.${column} reference is missing or belongs to another project.`);
    if (['selections', 'scoped_feedback'].includes(table) && (row.concept_id === null) === (row.asset_id === null)) fail('invalid_backup', `${table} must target exactly one concept or asset.`);
    if (table === 'selections' && row.set_id !== null && !records.set_concepts.some(link => link.set_id === row.set_id && link.concept_id === row.concept_id)) fail('invalid_backup', 'A set decision requires the matching concept membership.');
    if (table === 'runs' && activeStatuses.has(row.status)) fail('backup_busy', 'Wait for running tasks and pending archival to finish before exporting or restoring.', 409);
    if (row.payload !== undefined) {
      const payload = parseJson(Buffer.from(row.payload), `${table} payload`);
      if (!object(payload) || payload.id !== row.id) fail('invalid_backup', `${table} payload identity does not match its row.`);
      if(table==='selections'&&(payload.setId??null)!==row.set_id)fail('invalid_backup','The selection payload set scope conflicts with its row.');
      validatePayload(payload, projectId, ids, 0, table);
      for (const [column, key] of Object.entries({ item_id: 'itemId', previous_id: 'previousId', parent_id: 'parentId', run_id: 'runId', set_id: 'setId', brief_id: 'briefId', request_id: 'requestId', request_hash: 'requestHash', status: 'status' }))
        if (row[column] !== undefined && Object.hasOwn(payload, key) && payload[key] !== row[column]) fail('invalid_backup', `${table}.${key} conflicts with its row.`);
      for (const skillId of usedSkills(payload)) {
        if (!ids.skill_packages.has(skillId)) fail('invalid_backup', 'A historical skill version is missing from the backup.');
        requiredSkills.add(skillId);
      }
    }
  }
  if (records.skill_packages.some(row => !requiredSkills.has(row.id))) fail('invalid_backup', 'The backup includes a global skill version that this project does not use.');
  validateLineages(records);
  return ids;
}
function expectedFiles(records, projectId) {
  const files = new Map();
  const add = (relative, checksum, size = null) => {
    archivePath(relative);
    if (!digest(checksum) || (size !== null && (!Number.isSafeInteger(size) || size < 0 || size > BACKUP_LIMITS.entryBytes))) fail('invalid_backup', 'An artifact has invalid hash or size metadata.');
    const filename = 'data/' + relative;
    if (files.has(filename) && files.get(filename).hash !== checksum) fail('invalid_backup', 'Artifact paths have conflicting hashes.');
    files.set(filename, { path: filename, hash: checksum, bytes: size });
  };
  for (const table of ['concepts', 'assets']) for (const row of records[table]) {
    const payload = JSON.parse(row.payload);
    if (typeof payload.artifactPath !== 'string') fail('invalid_backup', 'A backed-up creative asset must have an archived file.');
    const relative = archivePath(payload.artifactPath.replaceAll('\\', '/'));
    const parts = relative.split('/');
    if (parts.length !== 5 || parts[0] !== 'projects' || parts[1] !== projectId || parts[2] !== 'assets' || parts[3] !== row.id || parts[4] !== (table === 'assets' ? 'image.png' : 'draft.md'))
      fail('unsafe_backup_path', 'An artifact file is outside its project and immutable asset directory.');
    add(relative, payload.artifactHash);
    if(table==='assets'&&payload.productionSource){
      const source=payload.productionSource,owner=records.assets.find(item=>item.id===source.assetId);
      if(!owner)fail('invalid_backup','A production source owner is missing.');
      const owned=JSON.parse(owner.payload).productionSource;
      const expected=`projects/${projectId}/assets/${owner.id}/source.png`;
      if(source.artifactPath?.replaceAll('\\','/')!==expected||owned?.assetId!==owner.id||owned?.artifactHash!==source.artifactHash)
        fail('invalid_backup','A production source does not match its immutable owner.');
      add(expected,source.artifactHash);
    }
  }
  for (const row of records.skill_packages) {
    const record = JSON.parse(row.payload);
    try { validateSkillManifest(record); } catch { fail('invalid_backup', 'A skill manifest failed its schema or integrity check.'); }
    for (const file of record.files) add(`skills/${row.id}/${archivePath(file.path)}`, file.hash, file.bytes);
  }
  return files;
}

export function exportProject(store, skillLibrary, projectId) {
  store.project(projectId);
  if (!(skillLibrary instanceof SkillLibrary) || skillLibrary.store !== store) fail('invalid_backup', 'The skill library must use this project store.');
  assertSchema(store);
  const entries = Object.create(null);
  let manifest;
  store.transaction(() => {
    const records = {};
    for (const [table, columns] of Object.entries(BACKUP_TABLES)) {
      if (table === 'skill_packages') { records[table] = []; continue; }
      records[table] = store.db.prepare(`SELECT ${columns.join(',')} FROM ${table} WHERE ${table === 'projects' ? 'id' : 'project_id'}=? ORDER BY rowid`).all(projectId).map(row => ({ ...row }));
    }
    const skillIds = new Set(records.project_skills.map(binding => binding.skill_id));
    for (const rows of Object.values(records)) for (const row of rows) if (row.payload !== undefined) usedSkills(JSON.parse(row.payload), skillIds);
    for (const skillId of skillIds) {
      skillLibrary.package(skillId, true);
      records.skill_packages.push({ ...store.db.prepare('SELECT id,payload FROM skill_packages WHERE id=?').get(skillId) });
    }
    validateRecords(records, projectId);
    const required = expectedFiles(records, projectId);
    if (required.size + 2 > BACKUP_LIMITS.files) fail('backup_limit', 'A backup may contain at most 512 ZIP entries.');
    let total = 0;
    const files = [];
    for (const file of required.values()) {
      const bytes = readFileBounded(store.safePath(path.join(...file.path.slice(5).split('/'))));
      if (hash(bytes) !== file.hash || (file.bytes !== null && file.bytes !== bytes.length)) fail('invalid_backup', 'A project or skill file failed its hash check.');
      total += bytes.length;
      if (total > BACKUP_LIMITS.bytes) fail('backup_limit', 'The project exceeds the 64 MiB backup limit.');
      entries[file.path] = bytes; files.push({ path: file.path, bytes: bytes.length, hash: file.hash });
    }
    const recordBytes = Buffer.from(JSON.stringify(records));
    if (recordBytes.length > BACKUP_LIMITS.entryBytes || total + recordBytes.length > BACKUP_LIMITS.bytes) fail('backup_limit', 'The project records exceed the backup size limit.');
    entries['records.json'] = recordBytes;
    manifest = { format: 'third-draft-private-project', archiveVersion: 1, schemaVersion: 3, projectId, createdAt: now(),
      counts: Object.fromEntries(tableNames.map(table => [table, records[table].length])),
      records: { path: 'records.json', bytes: recordBytes.length, hash: hash(recordBytes) }, files };
    entries['manifest.json'] = Buffer.from(JSON.stringify(manifest));
    if (total + recordBytes.length + entries['manifest.json'].length > BACKUP_LIMITS.bytes) fail('backup_limit', 'The project exceeds the 64 MiB backup limit.');
  });
  const archive = Buffer.from(zipSync(entries, { level: 6 }));
  if (archive.length > BACKUP_LIMITS.bytes) fail('backup_limit', 'The compressed backup exceeds 64 MiB.');
  return archive;
}

function inspectZip(buffer) {
  if (!(buffer instanceof Uint8Array) || buffer.length < 22 || buffer.length > BACKUP_LIMITS.bytes) fail('invalid_backup', 'Choose a ZIP backup of at most 64 MiB.');
  const bytes = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--)
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
  if (end < 0) fail('invalid_backup', 'The ZIP directory is missing.');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count || count < 2 || count > BACKUP_LIMITS.files || start + size !== end)
    fail('invalid_backup', 'Split, ZIP64, excessive or malformed ZIP directories are not supported.');
  let offset = start, total = 0;
  const names = new Set(), items = [], ranges = [];
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) fail('invalid_backup', 'A ZIP directory entry is malformed.');
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20), expanded = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32);
    const external = bytes.readUInt32LE(offset + 38), local = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || ![0, 8].includes(method) || bytes.readUInt16LE(offset + 34) !== 0 || expanded > BACKUP_LIMITS.entryBytes || compressed > BACKUP_LIMITS.bytes)
      fail('invalid_backup', 'An encrypted, unsupported or oversized ZIP entry was rejected.');
    let name;
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameLength)); }
    catch { fail('unsafe_backup_path', 'ZIP file names must be valid UTF-8.'); }
    archivePath(name);
    if (name !== 'manifest.json' && name !== 'records.json' && !name.startsWith('data/projects/') && !name.startsWith('data/skills/')) fail('unsafe_backup_path', 'The ZIP contains an unexpected file.');
    const fileType = (external >>> 16) & 0xf000;
    if (fileType && fileType !== 0x8000 || external & 0x10) fail('unsafe_backup_path', 'ZIP links, directories and special files are not supported.');
    const canonical = name.normalize('NFC').toLowerCase();
    if (names.has(canonical)) fail('unsafe_backup_path', 'ZIP paths collide, including case-insensitive Windows paths.');
    names.add(canonical); total += expanded;
    if (total > BACKUP_LIMITS.bytes) fail('backup_limit', 'The expanded ZIP exceeds 64 MiB.');
    if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method)
      fail('invalid_backup', 'ZIP local metadata does not match its directory.');
    const localName = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28);
    const dataStart = local + 30 + localName + localExtra;
    if (localName !== nameLength || dataStart + compressed > start || !bytes.subarray(local + 30, local + 30 + localName).equals(bytes.subarray(offset + 46, offset + 46 + nameLength)))
      fail('invalid_backup', 'ZIP local paths or lengths are invalid.');
    if (!(flags & 8) && (bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== expanded)) fail('invalid_backup', 'ZIP file sizes are inconsistent.');
    ranges.push([local, dataStart + compressed]); items.push({ name, expanded, method, dataStart, compressed }); offset = next;
  }
  if (offset !== end || !names.has('manifest.json') || !names.has('records.json')) fail('invalid_backup', 'The ZIP manifest or records are missing.');
  for (const name of names) { const parts = name.split('/'); for (let i = 1; i < parts.length; i++) if (names.has(parts.slice(0, i).join('/'))) fail('unsafe_backup_path', 'A ZIP file cannot also be the parent directory of another file.'); }
  ranges.sort((a, b) => a[0] - b[0]);
  if (ranges.some((range, index) => index > 0 && range[0] < ranges[index - 1][1])) fail('invalid_backup', 'ZIP entries overlap.');
  // Enforce the declared output bound inside the decompressor, even when a forged
  // central directory understates the true DEFLATE expansion size.
  const files = Object.create(null);
  for (const item of items) {
    const compressed = bytes.subarray(item.dataStart, item.dataStart + item.compressed);
    try { files[item.name] = item.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: Math.max(1, item.expanded) }); }
    catch { fail('invalid_backup', 'The ZIP data is corrupt or exceeds its declared expanded size.'); }
    if (files[item.name].length !== item.expanded) fail('invalid_backup', 'ZIP decoded sizes do not match its directory.');
  }
  return files;
}
function validateArchive(buffer) {
  const entries = inspectZip(buffer), manifest = parseJson(entries['manifest.json'], 'Manifest');
  if (!exactKeys(manifest, ['format', 'archiveVersion', 'schemaVersion', 'projectId', 'createdAt', 'counts', 'records', 'files']) || manifest.format !== 'third-draft-private-project' || manifest.archiveVersion !== 1 || ![2,3].includes(manifest.schemaVersion) || !Array.isArray(manifest.files))
    fail('unsupported_backup_schema', 'This backup format or schema is not supported.');
  const recordInfo = manifest.records;
  if (!exactKeys(recordInfo, ['path', 'bytes', 'hash']) || recordInfo.path !== 'records.json' || recordInfo.bytes !== entries['records.json'].length || recordInfo.hash !== hash(entries['records.json'])) fail('invalid_backup', 'The backup records failed their hash check.');
  const records = parseJson(entries['records.json'], 'Records');
  if(manifest.schemaVersion===2){
    if(!Array.isArray(records?.selections))fail('invalid_backup','The historical decision records are invalid.');
    for(const row of records.selections){if(!exactKeys(row,BACKUP_TABLES.selections.filter(key=>key!=='set_id')))fail('invalid_backup','The historical selection columns are invalid.');row.set_id=null;}
  }
  validateRecords(records, manifest.projectId);
  if (!exactKeys(manifest.counts, tableNames) || tableNames.some(table => manifest.counts[table] !== records[table].length)) fail('invalid_backup', 'Backup row counts do not match the manifest.');
  const required = expectedFiles(records, manifest.projectId), seen = new Set();
  if (manifest.files.length !== required.size || Object.keys(entries).length !== required.size + 2) fail('invalid_backup', 'The backup file inventory is incomplete or contains extra files.');
  for (const file of manifest.files) {
    if (!exactKeys(file, ['path', 'bytes', 'hash'])) fail('invalid_backup', 'The backup file inventory has invalid fields.');
    archivePath(file.path);
    const expected = required.get(file.path), bytes = entries[file.path];
    if (!expected || !bytes || seen.has(file.path) || file.bytes !== bytes.length || file.hash !== expected.hash || file.hash !== hash(bytes) || expected.bytes !== null && file.bytes !== expected.bytes)
      fail('invalid_backup', 'An archived project or skill file failed its manifest check.');
    seen.add(file.path);
  }
  for (const row of records.skill_packages) {
    let entry;
    try { entry = new TextDecoder('utf-8', { fatal: true }).decode(entries[`data/skills/${row.id}/SKILL.md`]); }
    catch { fail('invalid_backup', 'A backed-up SKILL.md is not valid UTF-8.'); }
    if (!entry.trim()) fail('invalid_backup', 'A backed-up SKILL.md is empty.');
  }
  return { entries, manifest, records };
}

export function restoreProject(buffer, destinationDir) {
  // Parse and validate every row, reference, path and file before touching the destination.
  const validated = validateArchive(buffer);
  if (typeof destinationDir !== 'string' || !path.isAbsolute(destinationDir)) fail('invalid_restore_target', 'Choose an absolute, new data directory.');
  const destination = noLinks(destinationDir, true);
  try { lstatSync(destination); fail('restore_target_exists', 'Restore requires a new directory. Existing data is never merged or overwritten.', 409); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  mkdirSync(path.dirname(destination), { recursive: true });
  noLinks(path.dirname(destination));
  try { mkdirSync(destination); } catch (error) { if (error.code === 'EEXIST') fail('restore_target_exists', 'The restore destination already exists.', 409); throw error; }
  let store;
  try {
    store = new Store(destination); const library = new SkillLibrary(store); assertSchema(store);
    store.transaction(() => {
      store.db.exec('PRAGMA defer_foreign_keys=ON');
      for (const [table, columns] of Object.entries(BACKUP_TABLES)) {
        const insert = store.db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
        for (const row of validated.records[table]) insert.run(...columns.map(column => row[column]));
      }
      if (store.db.prepare('PRAGMA foreign_key_check').all().length) fail('invalid_backup', 'Restored records failed their reference checks.');
      for (const file of validated.manifest.files) {
        const relative = path.join(...file.path.slice(5).split('/'));
        const target = noLinks(store.safePath(relative), true); mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(noLinks(store.safePath(relative), true), validated.entries[file.path], { flag: 'wx' });
        if (hash(readFileBounded(target)) !== file.hash) fail('restore_failed', 'A restored file failed its final hash check.');
      }
      for (const record of validated.records.skill_packages) library.package(record.id, true);
    });
    return { projectId: validated.manifest.projectId, name: validated.records.projects[0].name,
      archived: Boolean(validated.records.projects[0].archived), destinationDir: destination, schemaVersion: 3,
      counts: validated.manifest.counts, fileCount: validated.manifest.files.length };
  } catch (error) {
    if (error instanceof AppError) throw error;
    fail('restore_failed', 'Restore failed after creating the new directory. It was left in place for inspection; existing user data was not changed.', 500);
  } finally { store?.close(); }
}
