import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexRuntime } from '../src/runtime.mjs';

test('application profile preparation isolates state from an occupied configured global home', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'third-draft-profile-test-'));
  try {
    const globalHome = join(directory, 'personal-codex');
    await mkdir(globalHome);
    const files = { 'AGENTS.md': 'PERSONAL_RULE_CANARY', 'AGENTS.override.md': 'PERSONAL_OVERRIDE_CANARY',
      'config.toml': 'PERSONAL_CONFIG_CANARY', 'auth.json': 'PERSONAL_SECRET_CANARY' };
    for (const [name, value] of Object.entries(files)) await writeFile(join(globalHome, name), value);
    const runtimeHome = join(directory, 'third-draft', 'runtime', 'codex');
    const runtime = new CodexRuntime({ runtimeHome,
      environment: { ...process.env, CODEX_HOME: globalHome, OPENAI_API_KEY: 'FORBIDDEN_API_KEY',
        CODEX_API_KEY: 'FORBIDDEN_API_KEY', HTTPS_PROXY: 'FORBIDDEN_PROXY' } });
    assert.equal(runtime.environment.CODEX_HOME, runtimeHome);
    assert.ok(runtime.environment.USERPROFILE.startsWith(join(directory, 'third-draft', 'runtime')));
    assert.equal(runtime.environment.HOME, runtime.environment.USERPROFILE);
    assert.equal(runtime.environment.OPENAI_API_KEY, undefined);
    assert.equal(runtime.environment.CODEX_API_KEY, undefined);
    assert.equal(runtime.environment.HTTPS_PROXY, undefined);
    await runtime.prepareProfile();
    for (const [name, value] of Object.entries(files)) assert.equal(await readFile(join(globalHome, name), 'utf8'), value);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('installed CLI passes hard offline checks while native Skill loading remains observational', { timeout: 100_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'third-draft-contract-test-'));
  try {
    const runtime = new CodexRuntime({ runtimeHome: join(directory, 'runtime', 'codex') });
    const result = await runtime.probeCompatibility();
    if (result.reason === 'runtime_unavailable') return t.skip(result.detail);
    assert.equal(result.status, 'passed', JSON.stringify(result));
    assert.match(result.version, /^\d+\.\d+/);
    assert.match(result.executableHash, /^[0-9a-f]{64}$/);
    assert.match(result.configHash, /^[0-9a-f]{64}$/);
    assert.equal(result.intendedLiveModelRequests, 0);
    assert.equal(result.checks.isolation, true);
    assert.equal(result.checks.toolFree, true);
    assert.equal(result.checks.noRetries, true);
    assert.equal(result.checks.structuredOutput, true);
    assert.equal(result.checks.visionInput, true);
    assert.equal(result.checks.nativeAuth, true);
    assert.equal(result.checks.apiAuthRejected, true);
    assert.equal(result.nativeSkills.isolation, 'best-effort');
    assert.equal(result.nativeSkills.mayBePresent, true);
    assert.equal(result.nativeSkills.observationScope, 'compatibility-probe');
    const second = await runtime.probeCompatibility();
    assert.equal(second.evidenceId, result.evidenceId);
    const status = await runtime.inspect();
    assert.deepEqual(status.nativeSkills, result.nativeSkills);
    assert.equal(status.reason, 'auth_required', 'The empty app profile must not reuse personal login.');
    assert.equal(status.authSetup.home, runtime.runtimeHome);
    assert.ok(status.authSetup.args.includes('cli_auth_credentials_store="file"'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('unrelated browser cache does not exhaust native profile integrity inspection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'third-draft-profile-cache-test-'));
  try {
    const runtime = new CodexRuntime({ runtimeHome: join(directory, 'runtime', 'codex') });
    await runtime.prepareProfile();
    const cache = join(runtime.environment.LOCALAPPDATA, 'unrelated-browser-cache');
    await mkdir(cache);
    for (let index = 0; index < 5001; index += 100) {
      await Promise.all(Array.from({ length: Math.min(100, 5001 - index) }, (_, offset) =>
        writeFile(join(cache, String(index + offset)), '')));
    }
    await runtime.prepareProfile();
    assert.equal((await readdir(cache)).length, 5001);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('concurrent inspection shares one probe and changed binary bytes invalidate compatibility', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'third-draft-compat-cache-test-'));
  try {
    const runtime = new CodexRuntime({ runtimeHome: join(directory, 'runtime', 'codex') });
    let hash = 'a'.repeat(64), probes = 0, commands = 0;
    runtime.executableIdentity = async () => ({ path: 'synthetic-codex', executableHash: hash });
    runtime.command = async args => {
      commands++;
      return { code: 0, stdout: args[0] === '--version' ? 'codex-cli 999.0.0' : JSON.stringify({ models: [{ slug: 'test' }] }) };
    };
    runtime.runCompatibilityProbe = async input => {
      probes++;
      await new Promise(accept => setTimeout(accept, 20));
      return { status: 'passed', version: input.version, configHash: input.configHash,
        executableHash: input.executableHash, evidenceId: input.executableHash };
    };
    const results = await Promise.all([runtime.probeCompatibility(), runtime.probeCompatibility(), runtime.probeCompatibility()]);
    assert.equal(probes, 1); assert.equal(commands, 2);
    assert.ok(results.every(result => result === results[0]));
    assert.equal((await runtime.probeCompatibility()).evidenceId, hash);
    assert.equal(probes, 1);
    hash = 'b'.repeat(64);
    assert.equal((await runtime.probeCompatibility()).evidenceId, hash);
    assert.equal(probes, 2); assert.equal(commands, 4);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('profile junctions are refused before writes can escape into a personal directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'third-draft-profile-link-test-'));
  try {
    const personal = join(directory, 'personal'); await mkdir(personal);
    const runtimeRoot = join(directory, 'runtime'); await mkdir(runtimeRoot);
    await symlink(personal, join(runtimeRoot, 'home'), 'junction');
    const runtime = new CodexRuntime({ runtimeHome: join(runtimeRoot, 'codex') });
    await assert.rejects(runtime.prepareProfile(), { code: 'unsupported_capability' });
    assert.deepEqual(await readdir(personal), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('linked credential/config files cannot bridge the separate runtime profile', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'third-draft-profile-auth-test-'));
  try {
    const runtime = new CodexRuntime({ runtimeHome: join(directory, 'runtime', 'codex') });
    await runtime.prepareProfile();
    // Directory junctions also exercise the non-regular credential-file guard
    // on Windows hosts where creating a file symlink requires extra privilege.
    const personal = join(directory, 'personal'); await mkdir(personal);
    for (const name of ['auth.json', 'config.toml']) {
      await symlink(personal, join(runtime.runtimeHome, name), 'junction');
      await assert.rejects(runtime.prepareProfile(), { code: 'unsupported_capability' });
      await rm(join(runtime.runtimeHome, name), { recursive: true });
    }
    assert.deepEqual(await readdir(personal), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('linked skill roots are refused before any native command can run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'third-draft-profile-skills-test-'));
  try {
    const runtime = new CodexRuntime({ runtimeHome: join(directory, 'runtime', 'codex') });
    await runtime.prepareProfile();
    const personal = join(directory, 'personal'); await mkdir(personal);
    for (const path of [join(runtime.runtimeHome, 'skills'), join(runtime.environment.HOME, '.agents'), join(runtime.environment.HOME, '.codex')]) {
      await symlink(personal, path, 'junction');
      await assert.rejects(runtime.prepareProfile(), { code: 'unsupported_capability' });
      await rm(path, { recursive: true });
    }
    assert.deepEqual(await readdir(personal), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
