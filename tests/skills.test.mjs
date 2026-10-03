import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { SkillLibrary, SKILL_LIMITS } from '../src/skills.mjs';
import { hash } from '../src/common.mjs';

const testRoot = path.resolve('.workbench/tests');
mkdirSync(testRoot, { recursive: true });
const ownedDirs = [];
after(() => { for (const directory of ownedDirs) { assert.ok(path.resolve(directory).startsWith(testRoot + path.sep)); rmSync(directory, { recursive: true, force: true }); } });
const upload = (filename, content) => ({ path: filename, base64: Buffer.from(content).toString('base64') });
const entry = (method = 'Use clear language.') => `---\nname: Clear writing\n---\n${method}\n`;
function fixture(t) {
  const directory = mkdtempSync(path.join(testRoot, 'skills-')); ownedDirs.push(directory);
  const store = new Store(path.join(directory, 'data')); t.after(() => store.close());
  const library = new SkillLibrary(store);
  const a = store.createProject({ name: 'Synthetic skills A' }), b = store.createProject({ name: 'Synthetic skills B' });
  return { directory, store, library, a, b };
}
function imported(library, files = [upload('SKILL.md', entry())], fields = {}) {
  return library.import({ source: 'Synthetic test fixture', files, requiresCapabilities: ['text_generation'], permissions: ['method_text'], roles: ['strategy'], ...fields });
}

test('skill package files and provenance are immutable; scripts import without execution or prompt inclusion', t => {
  const { directory, store, library, a } = fixture(t);
  const marker = path.join(directory, 'SHOULD_NOT_EXIST');
  const script = `require('node:fs').writeFileSync(${JSON.stringify(marker)},'executed');`;
  const record = imported(library, [upload('SKILL.md', entry()), upload('scripts/run.cjs', script), upload('references/writing.md', 'Prefer concrete verbs.'), upload('assets/sample.bin', Buffer.from([0, 1, 2]))]);
  assert.equal(existsSync(marker), false);
  assert.equal(record.reviewStatus, 'unreviewed');
  assert.deepEqual(record.scripts, ['scripts/run.cjs']);
  assert.equal(record.inspection.scriptsExecuted, false);
  assert.equal(record.contentHash, hash(record.files));
  assert.deepEqual(library.list(), [record]);
  library.bind(a.id, { skillId: record.id, enabled: true });
  const selected = library.selected(a.id, ['text_generation']);
  assert.equal(selected[0].content, entry());
  assert.deepEqual(selected[0].references, [{ path: 'references/writing.md', content: 'Prefer concrete verbs.', hash: hash('Prefer concrete verbs.') }]);
  assert.ok(!JSON.stringify(selected).includes(script));
  assert.equal(existsSync(marker), false);
  assert.equal(readFileSync(store.safePath(path.join('skills', record.id, 'scripts/run.cjs')), 'utf8'), script);
});

test('skill imports reject zip-style traversal, Windows aliases, case collisions and malformed encoding', t => {
  const { library } = fixture(t);
  for (const filename of ['../outside', '/absolute', 'C:/absolute', 'references\\outside', 'references/../outside', 'references//a.md', 'references/a.md:secret', 'NUL.txt', 'references/file.'])
    assert.throws(() => imported(library, [upload('SKILL.md', entry()), upload(filename, 'x')]), error => error.code === 'unsafe_skill_path');
  assert.throws(() => imported(library, [upload('SKILL.md', entry()), upload('skill.MD', 'collision')]), error => error.code === 'unsafe_skill_path');
  assert.throws(() => imported(library, [upload('SKILL.md', entry()), upload('references', 'file'), upload('references/note.md', 'nested')]), error => error.code === 'unsafe_skill_path');
  assert.throws(() => imported(library, [{ path: 'SKILL.md', base64: 'not base64!' }]), error => error.code === 'invalid_skill');
  assert.throws(() => imported(library, [upload('note.md', 'No entry')]), error => error.code === 'invalid_skill');
  assert.throws(() => imported(library, [upload('SKILL.md', Buffer.from([0xff]))]), error => error.code === 'invalid_skill');
  assert.equal(library.list().length, 0);
});

test('local directory import snapshots bytes and rejects linked roots, nested junctions and parent traversal', t => {
  const { directory, library, a } = fixture(t);
  const source = path.join(directory, 'source'); mkdirSync(source); writeFileSync(path.join(source, 'SKILL.md'), entry('Original method.'));
  const record = library.import({ directory: source, source: 'Explicit synthetic local directory', permissions: ['read_selected_assets'] });
  writeFileSync(path.join(source, 'SKILL.md'), entry('Changed source.'));
  library.bind(a.id, { skillId: record.id, enabled: true });
  assert.equal(library.selected(a.id, [])[0].content, entry('Original method.'));
  const linked = path.join(directory, 'linked');
  symlinkSync(source, linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => library.import({ directory: linked, source: 'Linked root' }), error => error.code === 'unsafe_skill_path');
  assert.throws(() => library.import({ directory: path.join(linked, 'child'), source: 'Linked ancestor' }), error => error.code === 'unsafe_skill_path');
  const outside = path.join(directory, 'outside'); mkdirSync(outside); writeFileSync(path.join(outside, 'private.md'), 'FOREIGN_FILE');
  symlinkSync(outside, path.join(source, 'references'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => library.import({ directory: source, source: 'Nested link' }), error => error.code === 'unsafe_skill_path');
});

test('skill permission and capability failures are explicit, and enabling is project scoped', t => {
  const { library, a, b, store } = fixture(t);
  const record = imported(library, undefined, { requiresCapabilities: ['text_generation', 'reference_images'] });
  assert.deepEqual(library.bindings(b.id), []);
  library.bind(a.id, { skillId: record.id, enabled: true });
  assert.throws(() => library.selected(a.id, ['text_generation']), error => error.code === 'incompatible_skill' && error.message.includes('reference_images'));
  assert.equal(library.selected(a.id, new Set(['text_generation', 'reference_images'])).length, 1);
  assert.deepEqual(library.selected(b.id, ['text_generation', 'reference_images']), []);
  const denied = imported(library, undefined, { permissions: ['method_text', 'execute_scripts', 'network'] });
  assert.deepEqual(denied.inspection.unsupportedPermissions, ['execute_scripts', 'network']);
  assert.throws(() => library.bind(a.id, { skillId: denied.id, enabled: true }), error => error.code === 'unsupported_skill_permission' && error.message.includes('execute_scripts'));
  library.bind(a.id, { skillId: record.id, enabled: false });
  assert.deepEqual(library.selected(a.id, []), []);
  store.archiveProject(a.id, true);
  assert.throws(() => library.bind(a.id, { skillId: record.id, enabled: true }), error => error.code === 'project_archived');
  assert.throws(() => library.bind('not-a-project', { skillId: record.id, enabled: true }), error => error.code === 'not_found');
});

test('new package versions never change project bindings or already selected snapshots', t => {
  const { library, a } = fixture(t);
  const first = imported(library, [upload('SKILL.md', entry('First method.'))], { declaredVersion: '1' });
  library.bind(a.id, { skillId: first.id, enabled: true });
  const snapshot = library.selected(a.id, ['text_generation']);
  const serialized = JSON.stringify(snapshot);
  const second = imported(library, [upload('SKILL.md', entry('Second method.'))], { declaredVersion: '2' });
  assert.notEqual(first.id, second.id); assert.notEqual(first.contentHash, second.contentHash);
  assert.equal(library.selected(a.id, ['text_generation'])[0].id, first.id);
  library.bind(a.id, { skillId: first.id, enabled: false }); library.bind(a.id, { skillId: second.id, enabled: true });
  assert.equal(library.selected(a.id, ['text_generation'])[0].id, second.id);
  assert.equal(JSON.stringify(snapshot), serialized);
  assert.equal(snapshot[0].content, entry('First method.'));
  assert.equal(library.list().length, 2);
});

test('stored file or manifest tampering prevents selection and linked package paths are rejected', t => {
  const { store, library, a, directory } = fixture(t);
  const record = imported(library); library.bind(a.id, { skillId: record.id, enabled: true });
  writeFileSync(store.safePath(path.join('skills', record.id, 'SKILL.md')), entry('Tampered method.'));
  assert.throws(() => library.selected(a.id, ['text_generation']), error => error.code === 'skill_tampered');
  library.bind(a.id, { skillId: record.id, enabled: false });
  const another = imported(library); library.bind(a.id, { skillId: another.id, enabled: true });
  const forged = { ...another, permissions: ['network'] };
  store.db.prepare('UPDATE skill_packages SET payload=? WHERE id=?').run(JSON.stringify(forged), another.id);
  assert.throws(() => library.selected(a.id, ['text_generation']), error => error.code === 'skill_tampered');
  store.db.prepare('UPDATE skill_packages SET payload=? WHERE id=?').run(JSON.stringify(another), another.id);
  const target = store.safePath(path.join('skills', another.id));
  assert.ok(path.resolve(target).startsWith(path.resolve(store.dataDir) + path.sep)); rmSync(target, { recursive: true, force: true });
  const foreign = path.join(directory, 'foreign'); mkdirSync(foreign); writeFileSync(path.join(foreign, 'SKILL.md'), entry());
  symlinkSync(foreign, target, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => library.selected(a.id, ['text_generation']), error => error.code === 'unsafe_path' || error.code === 'unsafe_skill_path');
});

test('package and selected-context bounds fail explicitly without truncating method instructions', t => {
  const { library, a } = fixture(t);
  assert.throws(() => imported(library, [upload('SKILL.md', entry()), ...Array.from({ length: 128 }, (_, i) => upload(`references/${i}.md`, 'x'))]), error => error.code === 'invalid_skill' || error.code === 'skill_limit');
  assert.throws(() => imported(library, [upload('SKILL.md', entry()), upload('assets/large.bin', Buffer.alloc(SKILL_LIMITS.bytes))]), error => error.code === 'skill_limit');
  assert.throws(() => imported(library, [upload('SKILL.md', 'x'.repeat(SKILL_LIMITS.selectedTextBytes + 1))]), error => error.code === 'skill_context_limit');
  const record = imported(library, [upload('SKILL.md', entry()), upload('references/large.md', 'x'.repeat(SKILL_LIMITS.selectedTextBytes))]);
  library.bind(a.id, { skillId: record.id, enabled: true });
  assert.throws(() => library.selected(a.id, ['text_generation']), error => error.code === 'skill_context_limit');
});

test('skills persist across store reopen without changing schema version or project isolation', t => {
  const { directory, store, library, a, b } = fixture(t);
  const record = imported(library); library.bind(a.id, { skillId: record.id, enabled: true });
  const version = store.db.prepare('PRAGMA user_version').get().user_version;
  const reopened = new Store(path.join(directory, 'data')); t.after(() => reopened.close());
  const other = new SkillLibrary(reopened);
  assert.equal(reopened.db.prepare('PRAGMA user_version').get().user_version, version);
  assert.deepEqual(other.list(), [record]);
  assert.equal(other.selected(a.id, ['text_generation'])[0].contentHash, record.contentHash);
  assert.deepEqual(other.bindings(b.id), []);
});
