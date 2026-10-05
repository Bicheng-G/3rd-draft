import http from 'node:http';
import https from 'node:https';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { RuntimeError, runtimeArguments, disabledNativeSkills, SUBSCRIPTION_PROVIDER, RUNTIME_CONFIG_HASH } from './runtime.mjs';

export const IMAGE_LIMITS = Object.freeze({ maxImages: 5, maxImageBytes: 10 * 1024 * 1024,
  maxTotalBytes: 40 * 1024 * 1024, maxOutputBytes: 20 * 1024 * 1024, maxPixels: 25_000_000,
  maxImageOperations: 2, maxPromptBytes: 64 * 1024 });
export const IMAGE_CONTRACT_HASH = createHash('sha256').update(JSON.stringify({ contract: 1,
  base: RUNTIME_CONFIG_HASH, limits: IMAGE_LIMITS, orchestrator: 'host-authored-single-imagegen',
  references: 'staged-PNG-buffers-only', output: 'native-file-and-backend-byte-equality',
  subscriptionBase: SUBSCRIPTION_PROVIDER.base_url, durableBudget: 'synchronous-caller-reservation-before-dispatch' })).digest('hex');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (condition, code, message) => { if (!condition) throw new RuntimeError(code, message); };
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SAFE_ID = /^[a-zA-Z0-9_-]{1,100}$/;
const SCHEMA = { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false };

export async function validatedPng(bytes, maxBytes = IMAGE_LIMITS.maxOutputBytes) {
  fail(Buffer.isBuffer(bytes) && bytes.length >= 33 && bytes.length <= maxBytes && bytes.subarray(0, 8).equals(PNG),
    'invalid_output', 'Native images must be bounded PNG files.');
  try {
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: IMAGE_LIMITS.maxPixels });
    const metadata = await image.metadata();
    fail(metadata.format === 'png' && (metadata.pages ?? 1) === 1, 'invalid_output', 'Only single-frame PNG images are supported.');
    await image.raw().toBuffer();
    return { width: metadata.width, height: metadata.height, hash: hash(bytes) };
  } catch { throw new RuntimeError('invalid_output', 'The native image did not decode within the image limits.'); }
}

export function snapshotImageInput({ prompt, images = [], actionId, onDispatch } = {}) {
  fail(typeof prompt === 'string' && prompt.trim() && Buffer.byteLength(prompt) <= IMAGE_LIMITS.maxPromptBytes,
    'invalid_input', 'A bounded image production prompt is required.');
  fail(typeof actionId === 'string' && SAFE_ID.test(actionId), 'invalid_input', 'A valid Production Action identity is required.');
  fail(typeof onDispatch === 'function', 'invalid_input', 'A durable image-operation reservation is required.');
  fail(Array.isArray(images) && images.length <= IMAGE_LIMITS.maxImages && images.every(Buffer.isBuffer),
    'invalid_input', 'Image references must be application-owned PNG buffers, never paths.');
  fail(images.every(bytes => bytes.length <= IMAGE_LIMITS.maxImageBytes) && images.reduce((sum, bytes) => sum + bytes.length, 0) <= IMAGE_LIMITS.maxTotalBytes,
    'invalid_input', 'Image references exceed the production byte limits.');
  return { prompt, actionId, onDispatch, images: images.map(bytes => Buffer.from(bytes)) };
}

async function safeDirectory(path, create = false) {
  const target = resolve(path); let current = parse(target).root;
  for (const part of target.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    let info;
    try { info = await lstat(current); }
    catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error;
      try { await mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      info = await lstat(current);
    }
    fail(info.isDirectory() && !info.isSymbolicLink(), 'invalid_input', 'Linked image staging directories are not supported.');
  }
  return realpath(target);
}

export async function validateProjectDirectory(projectDirectory, projectsRoot) {
  fail(typeof projectDirectory === 'string' && isAbsolute(projectDirectory), 'invalid_input', 'An application-owned project directory is required.');
  const root = resolve(projectsRoot), target = resolve(projectDirectory), projectId = relative(root, target);
  fail(SAFE_ID.test(projectId) && projectId !== '.' && projectId !== '..', 'invalid_input', 'Image staging must belong to the requested project root.');
  await safeDirectory(root, true);
  return safeDirectory(target, true);
}

async function readBounded(stream, maximum) {
  const chunks = []; let count = 0;
  for await (const chunk of stream) {
    count += chunk.length;
    fail(count <= maximum, 'result_unknown', 'Native image transport exceeded its byte limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function nativeAuth(headers) {
  const authorization = headers.authorization, account = headers['chatgpt-account-id'];
  fail(typeof authorization === 'string' && /^Bearer [^\r\n\s]+$/.test(authorization) && authorization.length <= 16_384 &&
    typeof account === 'string' && /^[a-zA-Z0-9_.:@-]{1,256}$/.test(account),
  'auth_required', 'The native image request is missing ChatGPT subscription authentication.');
  return { authorization, 'chatgpt-account-id': account };
}

// No configurable production endpoint or API-key source. Probes replace this
// function inside the dispatcher, never through application input.
export function subscriptionImageRequest({ path, bytes, headers, signal }) {
  fail(['/images/generations', '/images/edits'].includes(path), 'unsupported_capability', 'Unsupported native image endpoint.');
  const auth = nativeAuth(headers);
  return new Promise((accept, reject) => {
    const forwarded = { ...auth, 'content-type': 'application/json', 'content-length': bytes.length };
    for (const name of ['originator', 'user-agent', 'version', 'x-codex-image-turn-id'])
      if (typeof headers[name] === 'string' && headers[name].length <= 1024 && !/[\r\n]/.test(headers[name])) forwarded[name] = headers[name];
    const request = https.request(new URL(SUBSCRIPTION_PROVIDER.base_url + path),
      { method: 'POST', agent: false, headers: forwarded, signal }, async response => {
        try {
          // https.request does not follow redirects. No provider-supplied URL is used.
          if (response.statusCode !== 200) {
            response.resume();
            const code = response.statusCode === 401 || response.statusCode === 403 ? 'auth_required' :
              response.statusCode === 429 ? 'rate_limited' : 'result_unknown';
            throw new RuntimeError(code, 'The native subscription image endpoint did not return an image.');
          }
          const bytes = await readBounded(response, 28 * 1024 * 1024);
          const id = response.headers['x-codex-imagegen-request-id'];
          accept({ bytes, requestId: typeof id === 'string' && /^[\w:.-]{1,160}$/.test(id) ? id : null });
        } catch (error) { response.destroy(); reject(error); }
      });
    request.setTimeout(180_000, () => request.destroy());
    request.once('error', () => reject(new RuntimeError('result_unknown', 'The native image transport ended without a verified result.')));
    request.end(bytes);
  });
}

function localJson(response, status) {
  if (response.destroyed) return;
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end('{"error":{"message":"The application rejected or could not verify this image operation."}}');
}
function responseItem(response, item, id) {
  const event = (type, value) => `event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`;
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.end(event('response.created', { response: { id, status: 'in_progress', output: [] } }) +
    event('response.output_item.done', { output_index: 0, item }) +
    event('response.completed', { response: { id, status: 'completed', output: [item],
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } } }));
}

// The only Responses producer is this application. Model text, Skills and image
// provider responses cannot choose tools, paths, other projects or new Actions.
export async function dispatchNativeImage({ runtime, catalog, prompt, images, projectDirectory, projectsRoot,
  actionId, onDispatch, signal, imageRequest = subscriptionImageRequest, timeoutMs = 180_000 }) {
  const input = snapshotImageInput({ prompt, images, actionId, onDispatch });
  const project = await validateProjectDirectory(projectDirectory, projectsRoot);
  for (const image of input.images) await validatedPng(image, IMAGE_LIMITS.maxImageBytes);
  if (signal?.aborted) throw new RuntimeError('cancelled', 'Image production was cancelled before submission.');
  const stages = join(project, 'native-image-actions'); await safeDirectory(stages, true);
  const stage = join(stages, actionId);
  try { await mkdir(stage); }
  catch (error) { if (error.code === 'EEXIST') throw new RuntimeError('result_unknown', 'This Production Action already owns a staging area; automatic replay is prohibited.'); throw error; }
  // Exclusive directory ownership survives crashes. Re-entry never resets the
  // same Action's budget, even before a native request has completed.
  await writeFile(join(stage, 'action.json'), JSON.stringify({ actionId, state: 'pending', imageContractHash: IMAGE_CONTRACT_HASH }), { flag: 'wx' });
  const paths = [];
  for (const [index, bytes] of input.images.entries()) { const path = join(stage, `reference-${index + 1}.png`); await writeFile(path, bytes, { flag: 'wx' }); paths.push(path); }
  await writeFile(join(stage, 'models.json'), JSON.stringify(catalog), { flag: 'wx' });
  await writeFile(join(stage, 'schema.json'), JSON.stringify(SCHEMA), { flag: 'wx' });
  const callId = `image-${randomUUID()}`, capability = `/action/${randomUUID()}`;
  const argumentsValue = { prompt: input.prompt, transparent_background: false,
    ...(paths.length ? { referenced_image_paths: paths } : {}) };
  const expectedPath = paths.length ? '/images/edits' : '/images/generations';
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  let responses = 0, reservations = 0, dispatched = 0, requests = 0, threadId = null, completed = false;
  let backendImage = null, details = null, outputSeen = false, failure = null, generationId = null, requestId = null, nativeFileVerified = false;
  const receipt = () => ({ usage: null, metadata: { actionId, route: 'codex-native', billing: 'subscription',
    imageContractHash: IMAGE_CONTRACT_HASH, hostAuthored: true, threadId, callId, model: 'gpt-image-2',
    imageOperations: dispatched, reservations, requestId, generationId,
    imageHash: details?.hash ?? null, width: details?.width ?? null, height: details?.height ?? null,
    validatedBackendImage: !!details, nativeFileVerified, nativeArtifactHash: nativeFileVerified ? details.hash : null,
    modelSelfReportUsed: false } });
  const server = http.createServer(async (request, response) => {
    try {
      fail(!failure && !controller.signal.aborted && ++requests <= 6 && request.method === 'POST' && request.url.startsWith(capability + '/'),
        'unsupported_capability', 'Unapproved native Action request.');
      nativeAuth(request.headers);
      const path = request.url.slice(capability.length), bytes = await readBounded(request, 64 * 1024 * 1024);
      const value = JSON.parse(bytes);
      fail(!controller.signal.aborted, 'result_unknown', 'The Production Action has ended.');
      if (path === '/responses') {
        fail(++responses <= 2, 'unsupported_capability', 'Unexpected native model orchestration request.');
        if (responses === 1) {
          const tools = [...(value.tools || []), ...(value.input || []).filter(item => item.type === 'additional_tools').flatMap(item => item.tools || [])];
          const names = tools.flatMap(tool => tool.type === 'namespace' ? tool.tools.map(nested => `${tool.name}.${nested.name}`) : [tool.name || tool.type]);
          fail(names.length === 1 && names[0] === 'image_gen.imagegen', 'unsupported_capability', 'The native image tool envelope changed.');
          return responseItem(response, { type: 'function_call', id: `fc-${callId}`, call_id: callId,
            namespace: 'image_gen', name: 'imagegen', arguments: JSON.stringify(argumentsValue) }, `dispatch-${callId}`);
        }
        const output = value.input?.find(item => item.type === 'function_call_output' && item.call_id === callId);
        outputSeen = !!backendImage && output?.output?.some(item => item.type === 'input_image' && item.image_url === `data:image/png;base64,${backendImage.toString('base64')}`) === true;
        fail(outputSeen, 'result_unknown', 'The native tool did not return the verified image bytes.');
        return responseItem(response, { type: 'message', id: `done-${callId}`, role: 'assistant', content: [{ type: 'output_text', text: '{"message":"Image operation returned."}' }] }, `done-${callId}`);
      }
      fail(path === expectedPath && responses === 1, 'unsupported_capability', 'An unapproved native image route was requested.');
      fail(reservations < IMAGE_LIMITS.maxImageOperations, 'unsupported_capability', 'The Production Action image budget is exhausted.');
      fail(value.prompt === input.prompt && value.model === 'gpt-image-2' && value.background === 'opaque' &&
        Object.keys(value).every(key => ['prompt', 'model', 'background', 'images', 'quality', 'size'].includes(key)),
      'unsupported_capability', 'The native image request changed the host-authored operation.');
      fail(paths.length ? Array.isArray(value.images) && value.images.length === input.images.length &&
        value.images.every((item, index) => item.image_url === `data:image/png;base64,${input.images[index].toString('base64')}`) : value.images === undefined,
      'unsupported_capability', 'The native image request changed its staged references.');
      // This callback is the SQLite write-ahead reservation boundary. Never
      // await it or dispatch if its synchronous transaction did not succeed.
      const ordinal = ++reservations;
      const reserved = onDispatch({ ordinal, actionId, route: 'codex-native', billing: 'subscription', endpoint: path.slice(1) });
      if (reserved && typeof reserved.catch === 'function') reserved.catch(() => {});
      fail(!reserved || typeof reserved.then !== 'function', 'invalid_input', 'Image reservations must finish synchronously before dispatch.');
      dispatched++;
      const result = await imageRequest({ path, bytes, headers: request.headers, signal: controller.signal });
      fail(Buffer.isBuffer(result.bytes) && result.bytes.length <= 28 * 1024 * 1024, 'invalid_output', 'The image response exceeds its byte limit.');
      const decoded = JSON.parse(result.bytes);
      fail(Array.isArray(decoded.data) && decoded.data.length === 1 && typeof decoded.data[0].b64_json === 'string', 'invalid_output', 'Native image response did not contain one image.');
      const encoded = decoded.data[0].b64_json;
      fail(encoded.length <= Math.ceil(IMAGE_LIMITS.maxOutputBytes / 3) * 4, 'invalid_output', 'The image exceeds its byte limit.');
      const candidate = Buffer.from(encoded, 'base64');
      fail(candidate.toString('base64') === encoded, 'invalid_output', 'The native image encoding is invalid.');
      details = await validatedPng(candidate);
      backendImage = candidate;
      requestId = result.requestId ?? null;
      generationId = typeof decoded.data[0].generation_id === 'string' && /^[\w:.-]{1,160}$/.test(decoded.data[0].generation_id) ? decoded.data[0].generation_id : null;
      await writeFile(join(stage, `returned-${ordinal}.png`), candidate, { flag: 'wx' });
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(result.bytes);
    } catch (error) {
      failure ??= error instanceof RuntimeError ? error : new RuntimeError(dispatched ? 'result_unknown' : 'unsupported_capability', 'The native image protocol could not be verified.');
      localJson(response, 403);
    }
  });
  try {
    await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
    const args = runtimeArguments(stage, { 'skills.config': await disabledNativeSkills(runtime.environment), 'features.image_generation': true,
      'model_providers.third_draft_subscription': { ...SUBSCRIPTION_PROVIDER, base_url: `http://127.0.0.1:${server.address().port}${capability}` } });
    const result = await runtime.command(args, { input: 'Execute the explicit application-controlled image Production Action.', cwd: stage,
      signal: controller.signal, timeoutMs: Math.min(timeoutMs, 180_000), maxOutputBytes: 2 * 1024 * 1024,
      onEvent: event => {
        if (event.type === 'thread.started') threadId = event.thread_id;
        if (event.type === 'turn.completed') completed = true;
        if (event.type === 'item.started' || event.type === 'item.completed')
          fail(['agent_message', 'reasoning', 'error'].includes(event.item?.type), 'result_unknown', 'Unexpected native image tool activity.');
      } });
    if (failure) throw failure;
    fail(result.code === 0 && completed && outputSeen && !!backendImage && SAFE_ID.test(threadId || ''), 'result_unknown', 'Native image production did not complete a verified result.');
    const artifactDirectory = join(runtime.runtimeHome, 'generated_images', threadId);
    await safeDirectory(artifactDirectory);
    const artifactPath = join(artifactDirectory, `${callId}.png`), info = await lstat(artifactPath);
    fail(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size <= IMAGE_LIMITS.maxOutputBytes, 'result_unknown', 'The native image artifact is unsafe or unavailable.');
    const nativeFile = await readFile(artifactPath);
    fail(nativeFile.equals(backendImage), 'result_unknown', 'The native saved image differs from the verified image response.');
    nativeFileVerified = true;
    await writeFile(join(stage, 'receipt.json'), JSON.stringify(receipt()), { flag: 'wx' });
    return { image: nativeFile, ...receipt() };
  } catch (error) {
    const safe = error instanceof RuntimeError ? error : new RuntimeError(dispatched ? 'result_unknown' : 'runtime_unavailable', 'Native image production could not be completed.');
    if (dispatched && ['cancelled', 'runtime_unavailable'].includes(safe.code)) safe.code = 'result_unknown';
    safe.receipt = receipt();
    await writeFile(join(stage, 'receipt.json'), JSON.stringify({ ...safe.receipt, error: safe.code }), { flag: 'wx' }).catch(() => {});
    throw safe;
  } finally {
    signal?.removeEventListener('abort', abort); controller.abort();
    server.closeAllConnections(); await new Promise(accept => server.close(accept));
  }
}
