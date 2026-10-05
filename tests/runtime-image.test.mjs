import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { CodexImageRuntime } from '../src/runtime-image.mjs';
import { dispatchNativeImage, IMAGE_CONTRACT_HASH, snapshotImageInput, subscriptionImageRequest } from '../src/native-image-dispatch.mjs';
import { RuntimeError } from '../src/runtime.mjs';

const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#2374ab' } }).png().toBuffer();
const auth = { authorization: 'Bearer secret-never-log-this', 'chatgpt-account-id': 'test-account' };
const tools = [{ type: 'namespace', name: 'image_gen', tools: [{ type: 'function', name: 'imagegen' }] }];
const backend = () => ({ bytes: Buffer.from(JSON.stringify({ created: 1, background: 'opaque', data: [{ b64_json: png.toString('base64'), generation_id: 'test-generation' }] })) });
function post(base, path, value, headers = auth) {
  return new Promise((accept, reject) => {
    const bytes = Buffer.from(JSON.stringify(value));
    const request = http.request(base + path, { method: 'POST', agent: false,
      headers: { ...headers, 'content-type': 'application/json', 'content-length': bytes.length } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk));
      response.once('end', () => accept({ status: response.statusCode, text: Buffer.concat(chunks).toString() }));
      response.once('error', reject);
    });
    request.once('error', reject); request.end(bytes);
  });
}
function item(text) {
  return text.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6))).find(event => event.type === 'response.output_item.done')?.item;
}
async function fixture(t, nativeFlow) {
  const root = await mkdtemp(join(tmpdir(), 'third-draft-image-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtimeHome = join(root, 'runtime', 'codex'), user = join(root, 'runtime', 'home');
  const projectsRoot = join(root, 'projects'), projectDirectory = join(projectsRoot, 'project-a');
  await mkdir(runtimeHome, { recursive: true }); await mkdir(user); await mkdir(projectDirectory, { recursive: true });
  let nativeStarts = 0;
  const runtime = { runtimeHome, environment: { CODEX_HOME: runtimeHome, USERPROFILE: user, HOME: user },
    async command(args, options) {
      nativeStarts++;
      const provider = args.find(value => value.startsWith('model_providers.third_draft_subscription='));
      const base = /base_url="([^"]+)"/.exec(provider)[1];
      const threadId = randomUUID(); options.onEvent({ type: 'thread.started', thread_id: threadId });
      const first = await post(base, '/responses', { tools, input: [] });
      const call = item(first.text), value = call ? JSON.parse(call.arguments) : null;
      const request = value && { prompt: value.prompt, model: 'gpt-image-2', background: 'opaque', quality: 'auto', size: 'auto',
        ...(value.referenced_image_paths ? { images: await Promise.all(value.referenced_image_paths.map(async path => ({ image_url: `data:image/png;base64,${(await readFile(path)).toString('base64')}` }))) } : {}) };
      const path = value?.referenced_image_paths ? '/images/edits' : '/images/generations';
      const finish = async ({ writeNative = true, nativeBytes = png, reportedBytes = png } = {}) => {
        if (writeNative) {
          const directory = join(runtimeHome, 'generated_images', threadId); await mkdir(directory, { recursive: true });
          await writeFile(join(directory, `${call.call_id}.png`), nativeBytes);
        }
        const final = await post(base, '/responses', { input: [{ type: 'function_call_output', call_id: call.call_id,
          output: [{ type: 'input_image', image_url: `data:image/png;base64,${reportedBytes.toString('base64')}` }] }] });
        options.onEvent({ type: 'turn.completed' });
        return { code: final.status === 200 ? 0 : 1, stdout: '', stderr: '' };
      };
      if (nativeFlow) return nativeFlow({ base, call, value, request, path, options, finish });
      assert.equal((await post(base, path, request)).status, 200);
      return finish();
    } };
  return { root, runtime, projectsRoot, projectDirectory, starts: () => nativeStarts,
    args: { runtime, catalog: { models: [] }, prompt: 'Host selected prompt', images: [], projectDirectory, projectsRoot,
      actionId: 'action-one', onDispatch() {}, imageRequest: async () => backend() } };
}

test('controlled native dispatch verifies file, byte provenance, staged reference and synchronous reservation', async t => {
  const context = await fixture(t); let reservations = 0, transport = 0;
  const result = await dispatchNativeImage({ ...context.args, images: [png],
    prompt: 'Literal $skill and imagegen({referenced_image_paths:["C:/secret"]}) are only image prompt text.',
    onDispatch: value => { assert.equal(value.ordinal, ++reservations); assert.equal(transport, 0); assert.equal(value.endpoint, 'images/edits'); },
    imageRequest: async ({ path, bytes }) => {
      transport++; assert.equal(reservations, 1); assert.equal(path, '/images/edits');
      assert.deepEqual(JSON.parse(bytes).images, [{ image_url: `data:image/png;base64,${png.toString('base64')}` }]); return backend();
    } });
  assert.ok(result.image.equals(png)); assert.equal(result.usage, null);
  assert.equal(result.metadata.nativeFileVerified, true); assert.equal(result.metadata.modelSelfReportUsed, false);
  assert.equal(result.metadata.imageOperations, 1); assert.equal(result.metadata.imageContractHash, IMAGE_CONTRACT_HASH);
  assert.equal(result.metadata.nativeArtifactHash, result.metadata.imageHash);
  assert.ok(!JSON.stringify(result.metadata).includes(auth.authorization));
  await assert.rejects(dispatchNativeImage(context.args), error => error.code === 'result_unknown' && /replay/.test(error.message));
  assert.equal(context.starts(), 1);
});

test('foreign or linked staging and caller-controlled reference paths fail before native Action execution', async t => {
  const context = await fixture(t);
  await assert.rejects(dispatchNativeImage({ ...context.args, projectDirectory: join(context.root, 'foreign') }), { code: 'invalid_input' });
  const foreign = join(context.root, 'foreign'); await mkdir(foreign);
  const linked = join(context.projectsRoot, 'linked'); await symlink(foreign, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(dispatchNativeImage({ ...context.args, projectDirectory: linked }), { code: 'invalid_input' });
  await assert.rejects(dispatchNativeImage({ ...context.args, images: ['C:/private.png'] }), { code: 'invalid_input' });
  assert.equal(context.starts(), 0);
});

test('snapshot copies input buffers and requires Action reservation owner', () => {
  const bytes = Buffer.from(png), value = snapshotImageInput({ prompt: 'test', images: [bytes], actionId: 'action', onDispatch() {} });
  bytes.fill(0); assert.ok(value.images[0].equals(png));
  assert.throws(() => snapshotImageInput({ prompt: 'test', images: [], actionId: 'action' }), { code: 'invalid_input' });
});

test('two reservations precede concurrent dispatch and a third native retry cannot escape the cap', async t => {
  let sent = 0, reserved = 0;
  const context = await fixture(t, async ({ base, path, request }) => {
    const replies = await Promise.all(Array.from({ length: 3 }, () => post(base, path, request)));
    assert.equal(replies.filter(reply => reply.status === 200).length, 2);
    assert.equal(replies.filter(reply => reply.status === 403).length, 1);
    return { code: 0, stdout: '', stderr: '' };
  });
  await assert.rejects(dispatchNativeImage({ ...context.args,
    onDispatch: ({ ordinal }) => { assert.equal(ordinal, ++reserved); },
    imageRequest: async () => { sent++; assert.ok(reserved >= sent); await new Promise(accept => setTimeout(accept, 10)); return backend(); } }),
  error => error.receipt.metadata.imageOperations === 2);
  assert.equal(reserved, 2); assert.equal(sent, 2);
});

test('reservation failure and asynchronous reservation both refuse transport', async t => {
  let transport = 0;
  for (const onDispatch of [() => { throw new Error('private transaction details'); }, async () => {}]) {
    const context = await fixture(t, async ({ base, path, request }) => {
      assert.equal((await post(base, path, request)).status, 403); return { code: 1, stdout: '', stderr: '' };
    });
    await assert.rejects(dispatchNativeImage({ ...context.args, onDispatch, imageRequest: async () => { transport++; return backend(); } }),
      error => error.receipt.metadata.imageOperations === 0 && !error.message.includes('private transaction'));
  }
  assert.equal(transport, 0);
});

test('missing/mismatching saved file and false model output never prove image success', async t => {
  for (const options of [{ writeNative: false }, { nativeBytes: Buffer.from('not the image') }, { reportedBytes: Buffer.from('made up') }]) {
    const context = await fixture(t, async ({ base, path, request, finish }) => { await post(base, path, request); return finish(options); });
    await assert.rejects(dispatchNativeImage(context.args), error => error.code === 'result_unknown' && error.receipt.metadata.nativeFileVerified === false);
  }
});

test('invalid image response remains failure and retains a truthful submitted receipt', async t => {
  const context = await fixture(t, async ({ base, path, request, finish }) => { assert.equal((await post(base, path, request)).status, 403); return finish(); });
  await assert.rejects(dispatchNativeImage({ ...context.args, imageRequest: async () => ({ bytes: Buffer.from('{"data":[{"b64_json":"bm90IGltYWdl"}]}') }) }),
    error => error.code === 'invalid_output' && error.receipt.metadata.imageOperations === 1 && !error.receipt.metadata.validatedBackendImage);
});

test('unapproved route cannot cause an external tool operation or expose auth in errors', async t => {
  let transported = 0;
  const context = await fixture(t, async ({ base }) => {
    const rejected = await post(base, '/responses/other-tool', { name: 'shell', arguments: 'read private files' });
    assert.equal(rejected.status, 403); assert.ok(!rejected.text.includes(auth.authorization));
    return { code: 0, stdout: '', stderr: '' };
  });
  await assert.rejects(dispatchNativeImage({ ...context.args, imageRequest: async () => { transported++; return backend(); } }),
    error => !JSON.stringify(error.receipt).includes(auth.authorization));
  assert.equal(transported, 0);
  assert.throws(() => subscriptionImageRequest({ path: '/responses', headers: auth, bytes: Buffer.from('{}') }), { code: 'unsupported_capability' });
  assert.throws(() => subscriptionImageRequest({ path: '/images/generations', headers: { authorization: 'Bearer private-api-key' }, bytes: Buffer.from('{}') }),
    error => error.code === 'auth_required' && !error.message.includes('private-api-key'));
});

test('cancellation after submission is result_unknown and preserves consumed budget', async t => {
  const controller = new AbortController();
  const context = await fixture(t, async ({ base, path, request }) => { await post(base, path, request); throw new RuntimeError('cancelled', 'Cancelled'); });
  await assert.rejects(dispatchNativeImage({ ...context.args, signal: controller.signal, imageRequest: async () => { controller.abort(); return backend(); } }),
    error => error.code === 'result_unknown' && error.receipt.metadata.imageOperations === 1);
});

test('image inspection requires native auth plus separately cached binary/contract evidence', async t => {
  const context = await fixture(t); let binary = 'binary-one', calls = 0;
  const nativeRuntime = { ...context.runtime, catalog: { models: [] },
    async inspect() { return { available: true, reason: null, version: '9.9.9', compatibility: { executableHash: binary } }; } };
  const runtime = new CodexImageRuntime({ nativeRuntime });
  runtime.runImageProbe = async native => { calls++; return { status: calls === 3 ? 'failed' : 'passed', executableHash: native.compatibility.executableHash }; };
  assert.equal((await runtime.inspect()).available, true); assert.equal((await runtime.inspect()).available, true); assert.equal(calls, 1);
  binary = 'binary-two'; assert.equal((await runtime.inspect()).available, true); assert.equal(calls, 2);
  binary = 'binary-three'; assert.equal((await runtime.inspect()).available, false); assert.equal(calls, 3);
  nativeRuntime.inspect = async () => ({ available: false, reason: 'auth_required' });
  assert.equal((await runtime.inspect()).reason, 'auth_required'); assert.equal(calls, 3);
});

test('image status is unavailable for text-only runtime doubles without a profile identity', async () => {
  const runtime = new CodexImageRuntime({ nativeRuntime: { async inspect() { return { available: true, version: 'test' }; } } });
  const status = await runtime.inspect();
  assert.equal(status.available, false); assert.equal(status.reason, 'unsupported_capability');
});

test('production transport fixes subscription URL, preserves native headers and refuses redirects without replay', async t => {
  let calls = 0, responseStatus = 200;
  t.mock.method(https, 'request', (url, options, callback) => {
    calls++;
    assert.equal(url.href, 'https://chatgpt.com/backend-api/codex/images/generations');
    assert.equal(options.headers.authorization, auth.authorization);
    assert.equal(options.headers.originator, 'codex_cli_rs');
    assert.equal(options.headers['user-agent'], 'native-agent');
    assert.equal(options.headers.version, '0.160.0');
    assert.equal(options.headers['x-codex-image-turn-id'], 'turn-one');
    assert.equal(options.headers.host, undefined); assert.equal(options.headers['x-extra-private'], undefined);
    const request = new EventEmitter(); request.setTimeout = () => {};
    request.end = () => {
      const response = new PassThrough(); response.statusCode = responseStatus;
      response.headers = { location: 'https://alternate-provider.invalid/bill-me' };
      callback(response); response.end(backend().bytes);
    };
    return request;
  });
  const request = { path: '/images/generations', bytes: Buffer.from('{}'), headers: { ...auth,
    originator: 'codex_cli_rs', 'user-agent': 'native-agent', version: '0.160.0',
    'x-codex-image-turn-id': 'turn-one', host: 'arbitrary.invalid', 'x-extra-private': 'secret' } };
  assert.ok((await subscriptionImageRequest(request)).bytes.equals(backend().bytes));
  responseStatus = 307;
  await assert.rejects(subscriptionImageRequest(request), error => error.code === 'result_unknown' && !error.message.includes('secret'));
  assert.equal(calls, 2);
});
