import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { CodexRuntime, RUNTIME_CONFIG_HASH, runtimeEnvironment,
  toolFreeCatalog, validateOutput, VISION_INPUT_LIMITS } from '../src/runtime.mjs';

const schema = { type: 'object', additionalProperties: false, properties: {
  title: { type: 'string', minLength: 1 }, references: { type: 'array', items: { type: 'string' } },
}, required: ['title', 'references'] };
const catalog = { models: [{ slug: 'test-model', shell_type: 'unified_exec', apply_patch_tool_type: 'freeform' }] };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const unitHome = await mkdtemp(join(tmpdir(), 'third-draft-runtime-unit-'));
after(() => rm(unitHome, { recursive: true, force: true }));
let fixtureCount = 0;
function admitFixtureRuntime(runtime) {
  runtime.probeCompatibility = async () => {
    await runtime.prepareProfile();
    runtime.catalog = toolFreeCatalog(catalog);
    return { status: 'passed', version: '99.0.0-fixture', configHash: RUNTIME_CONFIG_HASH,
      executableHash: 'a'.repeat(64), evidenceId: 'b'.repeat(64), intendedLiveModelRequests: 0 };
  };
  return runtime;
}

function fakeProcess(reply) {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { child.killed = true; child.emit('close', null); };
  setImmediate(() => {
    if (reply.hang) return;
    if (reply.error) { child.emit('error', new Error(reply.error)); return; }
    if (reply.stdout) child.stdout.write(reply.stdout);
    if (reply.stderr) child.stderr.write(reply.stderr);
    child.emit('close', reply.code ?? 0);
  });
  return child;
}
function fakeRuntime(final, extra = {}) {
  const calls = [];
  const replies = [
    { stderr: 'Logged in using ChatGPT\n' },
    final,
  ];
  const runtime = admitFixtureRuntime(new CodexRuntime({ runtimeHome: join(unitHome, String(++fixtureCount), 'codex'),
    ...extra, spawnProcess(executable, args, options) {
    const reply = replies.shift(); assert.ok(reply, 'unexpected extra process / retry');
    calls.push({ executable, args, options }); return fakeProcess(reply);
  } }));
  return { runtime, calls };
}
const events = (...items) => items.map(item => JSON.stringify(item)).join('\n') + '\n';
const success = events(
  { type: 'thread.started', thread_id: 'fresh-thread' },
  { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ title: '保留记忆', references: ['m-1'] }) } },
  { type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 20 } },
);

test('environment replaces personal locations and removes API keys, proxies and inherited tools', () => {
  const result = runtimeEnvironment({ SYSTEMROOT: 'Windows', CODEX_HOME: 'native-auth',
    OPENAI_API_KEY: 'never-forward', CODEX_API_KEY: 'never-forward', HTTPS_PROXY: 'never-forward',
    OPENAI_BASE_URL: 'never-forward', CODEX_THREAD_ID: 'never-forward', GH_TOKEN: 'never-forward' }, join(unitHome, 'codex'));
  assert.equal(result.SYSTEMROOT, 'Windows');
  assert.equal(result.CODEX_HOME, join(unitHome, 'codex'));
  assert.equal(JSON.stringify(result).includes('never-forward'), false);
  assert.equal(result.HOME, result.USERPROFILE);
  assert.equal(result.TMP, result.TEMP);
});

test('catalog removes all local tool metadata without changing model identity', () => {
  const result = toolFreeCatalog(catalog);
  assert.equal(result.models[0].slug, 'test-model');
  assert.equal(result.models[0].shell_type, 'disabled');
  assert.equal(result.models[0].apply_patch_tool_type, null);
  assert.deepEqual(result.models[0].experimental_supported_tools, []);
  assert.equal(catalog.models[0].shell_type, 'unified_exec');
});

test('successful runtime uses fresh ephemeral stdin route, validates JSON and preserves measured usage', async () => {
  const { runtime, calls } = fakeRuntime({ stdout: success });
  const result = await runtime.generate({ prompt: 'SYNTHETIC context only', schema });
  assert.deepEqual(result.output, { title: '保留记忆', references: ['m-1'] });
  assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 20 });
  assert.equal(result.metadata.threadId, 'fresh-thread');
  assert.equal(result.metadata.billing, 'subscription');
  assert.equal(result.metadata.model, null);
  assert.equal(calls.length, 2);
  const last = calls.at(-1);
  for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--strict-config'])
    assert.ok(last.args.includes(flag));
  assert.ok(last.args.includes('forced_login_method="chatgpt"'));
  assert.ok(last.args.includes('model_provider="third_draft_subscription"'));
  const provider = last.args.find(arg => arg.startsWith('model_providers.third_draft_subscription='));
  assert.ok(provider.includes('base_url="https://chatgpt.com/backend-api/codex"'));
  assert.ok(provider.includes('requires_openai_auth=true'));
  assert.ok(provider.includes('request_max_retries=0'));
  assert.ok(provider.includes('stream_max_retries=0'));
  assert.equal(last.options.shell, false);
  assert.equal(last.options.windowsHide, true);
  assert.equal(last.args.includes('SYNTHETIC context only'), false);
});

test('API login and failed compatibility fail closed before production generation', async () => {
  let calls = 0;
  const runtime = admitFixtureRuntime(new CodexRuntime({ runtimeHome: join(unitHome, 'api-login', 'codex'), spawnProcess() {
    calls++;
    return fakeProcess({ stdout: 'Logged in using an API key' });
  } }));
  await assert.rejects(runtime.generate({ prompt: 'test', schema }), { code: 'auth_required' });
  assert.equal(calls, 1);
  const newer = new CodexRuntime({ spawnProcess() { assert.fail('An unverified runtime cannot inspect auth or submit.'); } });
  newer.probeCompatibility = async () => ({ status: 'failed', version: '99.0.0', reason: 'unsupported_capability', detail: 'Offline isolation failed.' });
  assert.equal((await newer.inspect()).reason, 'unsupported_capability');
});

test('vision accepts PNG buffers only and rejects count and byte limits before native submission', async () => {
  const runtime = new CodexRuntime({ spawnProcess() { assert.fail('Invalid images must fail before spawning.'); } });
  const large = Buffer.alloc(VISION_INPUT_LIMITS.maxImageBytes); png.copy(large);
  for (const images of [null, ['C:/must-not-read.png'], [new Uint8Array(png)], [Buffer.from('not PNG')],
    Array(9).fill(png), [Buffer.concat([large, Buffer.from([0])])], Array(5).fill(large)]) {
    await assert.rejects(runtime.generate({ prompt: 'Analyze synthetic image', schema, images }), { code: 'invalid_input' });
  }
});

test('vision snapshots images into its own temporary directory and removes them after completion', async () => {
  const { runtime, calls } = fakeRuntime({ stdout: success });
  const originalSpawn = runtime.spawnProcess;
  const callerBuffer = Buffer.from(png);
  let imagePaths;
  runtime.spawnProcess = (executable, args, options) => {
    if (args[0] === 'login') callerBuffer.fill(0);
    if (args[0] === 'exec') {
      imagePaths = args.flatMap((argument, index) => argument === '-i' ? [args[index + 1]] : []);
      assert.equal(imagePaths.length, 2);
      for (const path of imagePaths) {
        assert.ok(path.startsWith(options.cwd + sep));
        assert.deepEqual(readFileSync(path), png);
      }
    }
    return originalSpawn(executable, args, options);
  };
  const result = await runtime.generate({ prompt: 'Analyze synthetic input', schema, images: [callerBuffer, callerBuffer] });
  assert.deepEqual(result.metadata.visionInput, { count: 2, totalBytes: png.length * 2,
    format: 'image/png', transport: 'cli-local-image', validation: 'local-transport' });
  assert.equal(calls.length, 2);
  for (const path of imagePaths) await assert.rejects(access(path), { code: 'ENOENT' });
});

test('vision staging is removed when a submitted operation times out', async () => {
  const { runtime, calls } = fakeRuntime({ hang: true }, { timeoutMs: 20 });
  await assert.rejects(runtime.generate({ prompt: 'Synthetic input', schema, images: [png] }), { code: 'result_unknown' });
  const args = calls.at(-1).args;
  const imagePath = args[args.indexOf('-i') + 1];
  assert.ok(imagePath);
  await assert.rejects(access(imagePath), { code: 'ENOENT' });
});

test('schema rejects missing fields, extraneous output, invalid references and malformed JSON', async () => {
  assert.throws(() => validateOutput({ title: 'x' }, schema), { code: 'invalid_output' });
  assert.throws(() => validateOutput({ title: 'x', references: [7] }, schema), { code: 'invalid_output' });
  assert.throws(() => validateOutput({ title: 'x', references: [], factConfirmed: true }, schema), { code: 'invalid_output' });
  const { runtime } = fakeRuntime({ stdout: events(
    { type: 'item.completed', item: { type: 'agent_message', text: 'not json' } }, { type: 'turn.completed' }) });
  await assert.rejects(runtime.generate({ prompt: 'test', schema }), { code: 'invalid_output' });
});

test('completed invalid JSON or schema retains a structured usage and provenance receipt without accepting output', async () => {
  const measured = { input_tokens: 31, output_tokens: 17 };
  for (const finalText of ['PRIVATE_INVALID_JSON', JSON.stringify({ title: 'Invalid schema fixture', references: [7] })]) {
    const { runtime, calls } = fakeRuntime({ stdout: events(
      { type: 'thread.started', thread_id: 'synthetic-completed-thread' },
      { type: 'item.completed', item: { type: 'agent_message', text: finalText } },
      { type: 'turn.completed', usage: measured }) });
    await assert.rejects(runtime.generate({ prompt: 'SYNTHETIC input', schema, images: [png] }), error => {
      assert.equal(error.code, 'invalid_output');
      assert.deepEqual(error.receipt?.usage, measured);
      assert.deepEqual(Object.keys(error.receipt).sort(), ['metadata', 'usage']);
      assert.equal(error.receipt.metadata.threadId, 'synthetic-completed-thread');
      assert.equal(error.receipt.metadata.route, 'codex-native');
      assert.equal(error.receipt.metadata.billing, 'subscription');
      assert.equal(error.receipt.metadata.visionInput.count, 1);
      assert.equal(error.receipt.metadata.tools.length, 0);
      assert.match(error.receipt.metadata.configHash, /^[0-9a-f]{64}$/);
      assert.equal(JSON.stringify(error.receipt).includes(finalText), false, 'receipt must not retain rejected output');
      return true;
    });
    assert.equal(calls.length, 2, 'invalid output must not trigger another submission');
    await assert.rejects(access(calls.at(-1).options.cwd), { code: 'ENOENT' });
  }
});

test('failure receipts distinguish observed completion with unknown usage from an incomplete turn', async () => {
  const complete = fakeRuntime({ stdout: events(
    { type: 'thread.started', thread_id: 'completed-without-usage' },
    { type: 'item.completed', item: { type: 'agent_message', text: 'invalid' } },
    { type: 'turn.completed' }) });
  await assert.rejects(complete.runtime.generate({ prompt: 'Synthetic input', schema }), error => {
    assert.equal(error.code, 'invalid_output'); assert.equal(error.receipt.usage, null);
    assert.equal(error.receipt.metadata.threadId, 'completed-without-usage'); return true;
  });
  const incomplete = fakeRuntime({ code: 1, stderr: 'connection closed' });
  await assert.rejects(incomplete.runtime.generate({ prompt: 'Synthetic input', schema }), error => {
    assert.equal(error.code, 'result_unknown'); assert.equal(error.receipt, undefined); return true;
  });
  const exitFailure = fakeRuntime({ code: 1, stdout: success, stderr: 'process exited after completed event' });
  await assert.rejects(exitFailure.runtime.generate({ prompt: 'Synthetic input', schema }), error => {
    assert.equal(error.code, 'result_unknown'); assert.deepEqual(error.receipt.usage, { input_tokens: 10, output_tokens: 20 }); return true;
  });
  for (const fixture of [complete, incomplete, exitFailure]) assert.equal(fixture.calls.length, 2);
});

test('post-submission timeout, unexpected tools and failed transport are result_unknown with no retry', async () => {
  for (const final of [ { hang: true }, { code: 1, stderr: 'connection closed' },
    { stdout: events({ type: 'item.started', item: { type: 'command_execution' } }) } ]) {
    const { runtime, calls } = fakeRuntime(final, { timeoutMs: 25 });
    await assert.rejects(runtime.generate({ prompt: 'test', schema }), { code: 'result_unknown' });
    assert.equal(calls.length, 2);
  }
});

test('timeout releases owned pipes even when a native process never emits close', async () => {
  const { runtime } = fakeRuntime({ hang: true }, { timeoutMs: 20 });
  const originalSpawn = runtime.spawnProcess;
  let stalled;
  runtime.spawnProcess = (...args) => {
    const child = originalSpawn(...args);
    if (args[1][0] === 'exec') {
      stalled = child;
      child.kill = () => { child.killed = true; return true; };
      child.unref = () => { child.unreferenced = true; };
    }
    return child;
  };
  await assert.rejects(runtime.generate({ prompt: 'Synthetic timeout', schema }), { code: 'result_unknown' });
  assert.equal(stalled.killed, true);
  assert.equal(stalled.unreferenced, true);
  assert.ok(stalled.stdin.destroyed && stalled.stdout.destroyed && stalled.stderr.destroyed);
});

test('an explicit failed terminal event ends the process without waiting for native exit', async () => {
  const { runtime } = fakeRuntime({ hang: true }, { timeoutMs: 500 });
  const originalSpawn = runtime.spawnProcess;
  let stalled;
  runtime.spawnProcess = (...args) => {
    const child = originalSpawn(...args);
    if (args[1][0] === 'exec') {
      stalled = child;
      child.kill = () => { child.killed = true; return true; };
      child.unref = () => { child.unreferenced = true; };
      setImmediate(() => child.stdout.write(events({ type: 'turn.failed', error: { message: 'usage limit reached' } })));
    }
    return child;
  };
  await assert.rejects(runtime.generate({ prompt: 'Synthetic failed turn', schema }), { code: 'quota_exhausted' });
  assert.equal(stalled.killed, true);
  assert.equal(stalled.unreferenced, true);
  assert.ok(stalled.stdin.destroyed && stalled.stdout.destroyed && stalled.stderr.destroyed);
});

test('quota failure remains explicit; absent token usage remains unknown', async () => {
  const failed = fakeRuntime({ code: 1, stdout: events({ type: 'turn.failed', error: { message: 'usage limit reached' } }) });
  await assert.rejects(failed.runtime.generate({ prompt: 'test', schema }), { code: 'quota_exhausted' });
  const passed = fakeRuntime({ stdout: success.replace(',"usage":{"input_tokens":10,"output_tokens":20}', '') });
  assert.equal((await passed.runtime.generate({ prompt: 'test', schema })).usage, null);
});
