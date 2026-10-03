import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexImageRuntime } from '../src/runtime-image.mjs';
import { SUPPORTED_CODEX_VERSION } from '../src/runtime.mjs';

test('healthy native text authentication never implies accepted image capability', async () => {
  let inspections = 0;
  const runtime = new CodexImageRuntime({ nativeRuntime: {
    async inspect() { inspections++; return { available: true, version: SUPPORTED_CODEX_VERSION, reason: null }; },
    async generate() { assert.fail('Image status must not submit a native request.'); },
  } });
  const status = await runtime.inspect();
  assert.equal(inspections, 1);
  assert.equal(status.available, false);
  assert.equal(status.nativeAvailable, true);
  assert.equal(status.billing, 'subscription');
  assert.equal(status.reason, 'unsupported_capability');
  assert.deepEqual(Object.values(status.capabilities).map(mode => mode.probeStatus), ['blocked', 'blocked', 'blocked']);
  assert.equal(status.evidence.liveImageAttempts, 0);
  assert.equal(status.evidence.acceptedNativeImageProbes, 0);
  assert.equal(status.evidence.publicSourceMatchesBinary, 'not-established');
  assert.deepEqual(status.blockers.map(item => item.code), ['image_call_budget_unenforced', 'reference_read_isolation_unverified']);
});

test('generate, edit, and reference requests fail before touching the native runtime or files', async () => {
  const runtime = new CodexImageRuntime({ nativeRuntime: {
    async inspect() { assert.fail('Blocked image calls should not inspect the native runtime.'); },
    async generate() { assert.fail('Blocked image calls must never be submitted.'); },
  } });
  for (const request of [
    { prompt: 'Synthetic image', mode: 'generate' },
    { prompt: 'Synthetic edit', mode: 'edit', references: ['C:/must-not-read/image.png'] },
    { prompt: 'Synthetic reference', mode: 'reference', references: ['C:/must-not-read/reference.png'] },
  ]) {
    await assert.rejects(runtime.generate(request), error =>
      error.code === 'unsupported_capability' && /No request was submitted/.test(error.message));
  }
});

test('unavailable native connection remains separate from unresolved image controls', async () => {
  const runtime = new CodexImageRuntime({ nativeRuntime: {
    async inspect() { return { available: false, version: null, reason: 'auth_required' }; },
  } });
  const status = await runtime.inspect();
  assert.equal(status.nativeReason, 'auth_required');
  assert.equal(status.nativeAvailable, false);
  assert.equal(status.available, false);
  status.blockers[0].code = 'modified-consumer-copy';
  assert.equal((await runtime.inspect()).blockers[0].code, 'image_call_budget_unenforced');
});
