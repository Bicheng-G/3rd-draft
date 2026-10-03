import { mkdirSync, lstatSync, readdirSync, openSync, closeSync, fstatSync, readSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { AppError, hash, id, now } from './common.mjs';

export const SKILL_LIMITS = Object.freeze({ files: 128, bytes: 5 * 1024 * 1024, selectedTextBytes: 64 * 1024, pathLength: 240 });
export const SKILL_PERMISSIONS = Object.freeze(['method_text', 'read_selected_assets']);
const referenceExtensions = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.csv']);
const scriptExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.py', '.ps1', '.bat', '.cmd', '.sh', '.exe', '.com', '.dll', '.vbs', '.wasm']);
const fail = (code, message, status = 400) => { throw new AppError(code, message, status); };

function valueText(value, label, maximum = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail('invalid_skill', `${label} must be nonempty text of at most ${maximum} characters.`);
  return value.trim();
}
function identifiers(value = [], label) {
  if (!Array.isArray(value) || value.length > 32 || value.some(item => typeof item !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(item)))
    fail('invalid_skill', `${label} must contain at most 32 lowercase capability identifiers.`);
  return [...new Set(value)].sort();
}
function packagePath(value) {
  if (typeof value !== 'string' || !value || value.length > SKILL_LIMITS.pathLength || value.includes('\\') || value.startsWith('/') || /[\x00-\x1f<>:"|?*]/.test(value))
    fail('unsafe_skill_path', 'Skill file paths must be relative forward-slash paths without reserved characters.');
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
    fail('unsafe_skill_path', 'Skill file paths cannot traverse directories or use reserved Windows names.');
  return value;
}
function assertNoLinks(filename, allowMissing = false) {
  const absolute = path.resolve(filename);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let info;
    try { info = lstatSync(current); }
    catch (error) { if (allowMissing && error.code === 'ENOENT') continue; throw error; }
    if (info.isSymbolicLink()) fail('unsafe_skill_path', 'Skill imports and storage cannot use symbolic links or junctions.');
  }
  return absolute;
}
function readBounded(filename, maximum) {
  assertNoLinks(filename);
  const expected = lstatSync(filename);
  if (!expected.isFile()) fail('unsafe_skill_path', 'Skill packages can contain only regular files and directories.');
  if (expected.size > maximum) fail('skill_limit', `Skill packages are limited to ${SKILL_LIMITS.bytes} bytes in total.`);
  const fd = openSync(filename, 'r');
  try {
    const actual = fstatSync(fd);
    // Node's Windows lstat reports dev=0 while fstat reports the volume ID.
    if (!actual.isFile() || actual.size !== expected.size || actual.ino !== expected.ino || (process.platform !== 'win32' && actual.dev !== expected.dev))
      fail('invalid_skill', 'A skill file changed while it was being read. Please import it again.');
    const buffer = Buffer.alloc(actual.size + 1);
    let count = 0, read;
    while (count < buffer.length && (read = readSync(fd, buffer, count, buffer.length - count, null)) > 0) count += read;
    if (count !== actual.size) fail('invalid_skill', 'A skill file changed while it was being read. Please import it again.');
    return buffer.subarray(0, count);
  } finally { closeSync(fd); }
}
function decodeText(bytes, filename) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('invalid_skill', `${filename} must contain valid UTF-8 text.`); }
}
function gather(input) {
  const files = [];
  const seen = new Set();
  let total = 0;
  const add = (filename, bytes) => {
    filename = packagePath(filename);
    const canonical = filename.normalize('NFC').toLowerCase();
    if (seen.has(canonical)) fail('unsafe_skill_path', 'Skill file paths must be unique, including case-insensitive Windows names.');
    seen.add(canonical);
    if (files.length >= SKILL_LIMITS.files || total + bytes.length > SKILL_LIMITS.bytes) fail('skill_limit', 'A skill package may contain at most 128 files and 5 MiB.');
    total += bytes.length; files.push({ path: filename, bytes });
  };
  if (input.directory !== undefined && input.files !== undefined) fail('invalid_skill', 'Choose either a local directory or uploaded files, not both.');
  if (input.directory !== undefined) {
    if (typeof input.directory !== 'string' || !path.isAbsolute(input.directory)) fail('invalid_skill', 'Choose an absolute local skill directory.');
    const root = assertNoLinks(input.directory);
    if (!lstatSync(root).isDirectory()) fail('invalid_skill', 'The selected skill directory is not a directory.');
    let directories = 0;
    const walk = (directory, prefix = '') => {
      if (++directories > SKILL_LIMITS.files + 1) fail('skill_limit', 'The skill package contains too many directories.');
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const relative = packagePath(prefix + entry.name);
        const filename = assertNoLinks(path.join(directory, entry.name));
        const info = lstatSync(filename);
        if (info.isDirectory()) walk(filename, relative + '/');
        else if (info.isFile()) {
          if (files.length >= SKILL_LIMITS.files) fail('skill_limit', 'A skill package may contain at most 128 files.');
          add(relative, readBounded(filename, SKILL_LIMITS.bytes - total));
        } else fail('unsafe_skill_path', 'Skill packages can contain only regular files and directories.');
      }
    };
    walk(root);
  } else {
    if (!Array.isArray(input.files) || input.files.length === 0 || input.files.length > SKILL_LIMITS.files) fail('invalid_skill', 'Upload between 1 and 128 skill files.');
    for (const file of input.files) {
      if (!file || typeof file !== 'object') fail('invalid_skill', 'Each uploaded skill file needs a path and base64 content.');
      packagePath(file.path);
      if (typeof file.base64 !== 'string' || file.base64.length > Math.ceil(SKILL_LIMITS.bytes / 3) * 4 || file.base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(file.base64))
        fail('invalid_skill', 'Uploaded skill files must use valid, bounded base64 encoding.');
      const bytes = Buffer.from(file.base64, 'base64');
      if (bytes.toString('base64') !== file.base64) fail('invalid_skill', 'Uploaded skill file base64 encoding is not canonical.');
      add(file.path, bytes);
    }
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const paths = new Set(files.map(file => file.path.normalize('NFC').toLowerCase()));
  for (const file of files) {
    const parts = file.path.split('/');
    for (let index = 1; index < parts.length; index++) if (paths.has(parts.slice(0, index).join('/').normalize('NFC').toLowerCase()))
      fail('unsafe_skill_path', 'A skill file cannot also be the parent directory of another file.');
  }
  const entry = files.find(file => file.path === 'SKILL.md');
  if (!entry) fail('invalid_skill', 'The package must include SKILL.md at its root.');
  const content = decodeText(entry.bytes, 'SKILL.md');
  if (!content.trim()) fail('invalid_skill', 'SKILL.md cannot be empty.');
  if (entry.bytes.length > SKILL_LIMITS.selectedTextBytes) fail('skill_context_limit', 'SKILL.md exceeds the 64 KiB selected-text limit.');
  return { files, content, total };
}

// Shared by normal reads and portable restore, so a backup cannot install a
// structurally invalid package that only fails later when selecting its method.
export function validateSkillManifest(record) {
  const invalid = () => fail('skill_tampered', 'The stored skill manifest failed its integrity or schema check.', 409);
  if (!record || typeof record !== 'object' || Array.isArray(record)) invalid();
  const fields = ['id','schemaVersion','name','source','declaredVersion','license','requiresCapabilities','permissions','roles','files','totalBytes','contentHash','reviewStatus','scripts','inspection','importedAt','hash','manifestHash'];
  if (Object.keys(record).length !== fields.length || fields.some(field => !Object.hasOwn(record, field))) invalid();
  const { manifestHash, ...manifest } = record;
  if (typeof record.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.id) || record.schemaVersion !== 1 || manifestHash !== hash(manifest) || record.contentHash !== hash(record.files) || record.hash !== record.contentHash) invalid();
  if (typeof record.name !== 'string' || record.name.length > 120 || typeof record.importedAt !== 'string' || !Number.isFinite(Date.parse(record.importedAt)) || record.reviewStatus !== 'unreviewed') invalid();
  try {
    valueText(record.source, 'Source'); valueText(record.license, 'License', 200);
    if (record.declaredVersion !== null) valueText(record.declaredVersion, 'Declared version', 80);
    for (const key of ['requiresCapabilities','permissions','roles']) if (JSON.stringify(identifiers(record[key], key)) !== JSON.stringify(record[key])) invalid();
  } catch { invalid(); }
  if (!Array.isArray(record.files) || !record.files.length || record.files.length > SKILL_LIMITS.files) invalid();
  const seen = new Set(); let total = 0;
  for (const file of record.files) {
    if (!file || typeof file !== 'object' || Object.keys(file).length !== 3 || !Object.hasOwn(file, 'path') || !Object.hasOwn(file, 'bytes') || !Object.hasOwn(file, 'hash')) invalid();
    try { packagePath(file.path); } catch { invalid(); }
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || typeof file.hash !== 'string' || !/^[0-9a-f]{64}$/.test(file.hash)) invalid();
    total += file.bytes; const canonical = file.path.normalize('NFC').toLowerCase();
    if (seen.has(canonical)) invalid(); seen.add(canonical);
  }
  for (const name of seen) { const parts = name.split('/'); for (let i = 1; i < parts.length; i++) if (seen.has(parts.slice(0, i).join('/'))) invalid(); }
  const entry = record.files.find(file => file.path === 'SKILL.md');
  if (total !== record.totalBytes || total > SKILL_LIMITS.bytes || !entry || !entry.bytes || entry.bytes > SKILL_LIMITS.selectedTextBytes) invalid();
  const scripts = record.files.filter(file => file.path.startsWith('scripts/') || scriptExtensions.has(path.posix.extname(file.path).toLowerCase())).map(file => file.path);
  if (JSON.stringify(record.scripts) !== JSON.stringify(scripts) || !record.inspection || Object.keys(record.inspection).length !== 3 || record.inspection.scriptsExecuted !== false || JSON.stringify(record.inspection.unsupportedPermissions) !== JSON.stringify(record.permissions.filter(permission => !SKILL_PERMISSIONS.includes(permission))) || !Array.isArray(record.inspection.warnings) || record.inspection.warnings.some(warning => typeof warning !== 'string')) invalid();
  return record;
}

export class SkillLibrary {
  constructor(store) {
    this.store = store;
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_packages (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS project_skills (
        project_id TEXT NOT NULL REFERENCES projects(id),
        skill_id TEXT NOT NULL REFERENCES skill_packages(id),
        enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
        PRIMARY KEY(project_id,skill_id));`);
  }
  storedPath(relative) { return assertNoLinks(this.store.safePath(relative), true); }
  import(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_skill', 'A skill import request is required.');
    const source = valueText(input.source, 'Source');
    const requiresCapabilities = identifiers(input.requiresCapabilities, 'Required capabilities');
    const permissions = identifiers(input.permissions, 'Permissions');
    const roles = identifiers(input.roles, 'Roles');
    const declaredVersion = input.declaredVersion == null ? null : valueText(input.declaredVersion, 'Declared version', 80);
    const license = input.license == null ? 'unverified' : valueText(input.license, 'License', 200);
    const gathered = gather(input);
    const nameMatch = gathered.content.match(/^---\s*\r?\n[\s\S]*?^name:\s*(.+)$/m);
    const name = nameMatch ? nameMatch[1].trim().replace(/^(['"])(.*)\1$/, '$2').slice(0, 120) : 'Imported skill';
    const files = gathered.files.map(file => ({ path: file.path, bytes: file.bytes.length, hash: hash(file.bytes) }));
    const scripts = files.filter(file => file.path.startsWith('scripts/') || scriptExtensions.has(path.posix.extname(file.path).toLowerCase())).map(file => file.path);
    const record = { id: id(), schemaVersion: 1, name, source, declaredVersion, license,
      requiresCapabilities, permissions, roles, files, totalBytes: gathered.total,
      contentHash: hash(files), reviewStatus: 'unreviewed', scripts,
      inspection: { scriptsExecuted: false, unsupportedPermissions: permissions.filter(permission => !SKILL_PERMISSIONS.includes(permission)),
        warnings: scripts.length ? ['Scripts are stored for inspection only. Import and execution do not run them or include them as model instructions.'] : [] },
      importedAt: now() };
    record.hash = record.contentHash;
    record.manifestHash = hash(record);
    const libraryRoot = this.storedPath('skills');
    mkdirSync(libraryRoot, { recursive: true });
    const packageRoot = this.storedPath(path.join('skills', record.id));
    mkdirSync(packageRoot);
    try {
      for (const file of gathered.files) {
        const target = this.storedPath(path.join('skills', record.id, ...file.path.split('/')));
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(this.storedPath(path.join('skills', record.id, ...file.path.split('/'))), file.bytes, { flag: 'wx' });
      }
      this.store.db.prepare('INSERT INTO skill_packages(id,payload) VALUES (?,?)').run(record.id, JSON.stringify(record));
    } catch (error) {
      // This directory was created by this call from an internal UUID, never an input path.
      const resolved = path.resolve(packageRoot), boundary = path.resolve(libraryRoot) + path.sep;
      if (resolved.startsWith(boundary) && path.basename(resolved) === record.id) rmSync(resolved, { recursive: true, force: true });
      throw error;
    }
    return structuredClone(record);
  }
  package(skillId, verifyFiles = false) {
    if (typeof skillId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skillId)) fail('skill_not_found', 'The selected skill version was not found.', 404);
    const row = this.store.db.prepare('SELECT payload FROM skill_packages WHERE id=?').get(skillId);
    if (!row) fail('skill_not_found', 'The selected skill version was not found.', 404);
    let record;
    try { record = JSON.parse(row.payload); } catch { fail('skill_tampered', 'The stored skill manifest is invalid.', 409); }
    validateSkillManifest(record);
    if (record.id !== skillId) fail('skill_tampered', 'The stored skill identity failed its integrity check.', 409);
    if (verifyFiles) {
      let total = 0;
      for (const file of record.files) {
        const relative = packagePath(file.path);
        let bytes;
        try { bytes = readBounded(this.storedPath(path.join('skills', skillId, ...relative.split('/'))), SKILL_LIMITS.bytes - total); }
        catch (error) { if (error instanceof AppError) throw error; fail('skill_tampered', 'A stored skill file is missing or unreadable.', 409); }
        total += bytes.length;
        if (file.bytes !== bytes.length || file.hash !== hash(bytes)) fail('skill_tampered', `The stored skill file ${relative} failed its integrity check.`, 409);
      }
    }
    return record;
  }
  list() {
    return this.store.db.prepare('SELECT id FROM skill_packages ORDER BY rowid').all().map(row => this.package(row.id));
  }
  bind(projectId, input) {
    this.store.assertWritable(projectId);
    if (!input || typeof input.enabled !== 'boolean') fail('invalid_skill', 'Choose whether this skill version is enabled.');
    const record = this.package(input.skillId, input.enabled);
    if (input.enabled) this.checkPermissions(record);
    this.store.db.prepare('INSERT INTO project_skills(project_id,skill_id,enabled) VALUES (?,?,?) ON CONFLICT(project_id,skill_id) DO UPDATE SET enabled=excluded.enabled')
      .run(projectId, record.id, Number(input.enabled));
    return { projectId, skillId: record.id, enabled: input.enabled, contentHash: record.contentHash };
  }
  bindings(projectId) {
    this.store.project(projectId);
    return this.store.db.prepare('SELECT skill_id,enabled FROM project_skills WHERE project_id=? ORDER BY rowid').all(projectId)
      .map(row => ({ ...this.package(row.skill_id), enabled: Boolean(row.enabled) }));
  }
  checkPermissions(record) {
    const unsupported = record.permissions.filter(permission => !SKILL_PERMISSIONS.includes(permission));
    if (unsupported.length) fail('unsupported_skill_permission', `Skill "${record.name}" requests unsupported permissions: ${unsupported.join(', ')}. Only method_text and read_selected_assets are available.`, 409);
  }
  selected(projectId, capabilities) {
    this.store.project(projectId);
    if (capabilities instanceof Set) capabilities = [...capabilities];
    const available = new Set(identifiers(capabilities, 'Available capabilities'));
    const selected = [];
    let selectedBytes = 0;
    for (const binding of this.bindings(projectId).filter(binding => binding.enabled)) {
      const record = this.package(binding.id, true);
      this.checkPermissions(record);
      const missing = record.requiresCapabilities.filter(capability => !available.has(capability));
      if (missing.length) fail('incompatible_skill', `Skill "${record.name}" requires unavailable capabilities: ${missing.join(', ')}.`, 409);
      const readText = file => {
        const bytes = readBounded(this.storedPath(path.join('skills', record.id, ...file.path.split('/'))), SKILL_LIMITS.bytes);
        if (hash(bytes) !== file.hash) fail('skill_tampered', 'A skill file changed while preparing the task.', 409);
        selectedBytes += bytes.length;
        if (selectedBytes > SKILL_LIMITS.selectedTextBytes) fail('skill_context_limit', 'Enabled skill methods and text references exceed 64 KiB. Disable a skill or import a smaller package.', 409);
        return decodeText(bytes, file.path);
      };
      const entry = record.files.find(file => file.path === 'SKILL.md');
      const content = readText(entry);
      const references = record.files.filter(file => file.path.startsWith('references/') && referenceExtensions.has(path.posix.extname(file.path).toLowerCase()) && !record.scripts.includes(file.path))
        .map(file => ({ path: file.path, content: readText(file), hash: file.hash }));
      selected.push({ id: record.id, name: record.name, hash: record.contentHash, contentHash: record.contentHash, manifestHash: record.manifestHash,
        declaredVersion: record.declaredVersion, source: record.source, license: record.license, reviewStatus: record.reviewStatus,
        requiresCapabilities: [...record.requiresCapabilities], permissions: [...record.permissions], roles: [...record.roles], content, references });
    }
    return selected;
  }
}
